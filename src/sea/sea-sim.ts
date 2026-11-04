/**
 * SeaSim: a JONSWAP sea as three FFT height fields on the GPU.
 *
 * Per cascade, per frame: evolve (spectrum × time) → 2·log2(N) Stockham passes → assemble into a
 * texture of (Dx, h, Dz, 0). Pass constants are baked per stage, so there are no per-dispatch
 * uniform changes to get out of order. Nothing is read back; for what the CPU needs, see sea-cpu.ts.
 *
 * Usage:
 *   const sea = new SeaSim(renderer);           // after renderer.init()
 *   sea.setParams({ ...sea.params, windU: 8 }); // reseeds the spectrum on the GPU
 *   sea.step(dt);                               // once per frame, before render
 *   material: see shading.ts (sampleSea / seaNormal read sea.cascades[i].tex)
 */
import * as THREE from 'three/webgpu';
import { Fn, uint, vec2, vec4, uvec2, instanceIndex, instancedArray, textureStore, select, cos, sin, sqrt, max, length, float } from 'three/tsl';
import { CASCADES, DEFAULT_SEA, G, seaStats, type Cascade, type SeaParams, type SeaStats } from './spectrum';
import { makeSeaUniforms, writeSeaUniforms, type SeaUniforms } from './uniforms';
import { spectrumTSL, gauss2TSL, freqIndexTSL } from './tsl-spectrum';
import { buildComponents, surfaceAt, type WaveComponent } from './sea-cpu';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
// vec4 from two vec2 is fine in TSL but not in the typings
const V4 = vec4 as N, V2 = vec2 as N;

export interface SeaCascade extends Cascade {
  /** (Dx, h, Dz, 0) in metres, RepeatWrapping, sampled at uv = (xz + off) / L */
  tex: THREE.StorageTexture;
  h0: N; evolve: N; passes: N[]; assemble: N;
}

export interface SeaSimOptions {
  /** grid size per cascade, power of two; 128 is plenty for a 14 m column, 256 for close-ups */
  N?: number;
  cascades?: Cascade[];
  /** how many of the strongest ±k pairs per cascade the CPU sampler keeps (0 disables it) */
  cpuPairs?: number;
  /** how many cascades the CPU sampler reads (the ripple cascade is noise to a hull) */
  cpuCascades?: number;
}

export class SeaSim {
  readonly N: number;
  readonly log2N: number;
  readonly cascades: SeaCascade[];
  readonly U: SeaUniforms;
  params: SeaParams;
  stats: SeaStats;
  private readonly renderer: THREE.WebGPURenderer;
  private readonly bufA: N;
  private readonly bufB: N;
  private readonly h0Nodes: N[];
  private readonly frameNodes: N[];
  private readonly cpuPairs: number;
  private readonly cpuCascades: number;
  private comps: WaveComponent[] = [];

  constructor(renderer: THREE.WebGPURenderer, opts: SeaSimOptions = {}) {
    this.renderer = renderer;
    this.N = opts.N ?? 128;
    this.log2N = Math.log2(this.N);
    if (!Number.isInteger(this.log2N)) throw new Error('SeaSim: N must be a power of two');
    this.cpuPairs = opts.cpuPairs ?? 140;
    this.cpuCascades = opts.cpuCascades ?? 2;
    this.params = { ...DEFAULT_SEA };
    this.U = makeSeaUniforms(this.params);
    const N = this.N, HALF = N / 2, LOG2N = this.log2N, U = this.U;
    const gauss2 = gauss2TSL(N, U.seed);

    this.bufA = instancedArray(N * N, 'vec4');
    this.bufB = instancedArray(N * N, 'vec4');
    const bufA = this.bufA, bufB = this.bufB;

    this.cascades = (opts.cascades ?? CASCADES).map((c) => {
      const tex = new THREE.StorageTexture(N, N);
      tex.type = THREE.HalfFloatType; tex.format = THREE.RGBAFormat;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const h0 = instancedArray(N * N, 'vec4');
      const dk = 2 * Math.PI / c.L;
      const finest = c.L < 3;

      // initial spectrum: h0(k) and h0(−k) per cell, seeded noise × sqrt(S Δk²)/2
      const h0Node = Fn(() => {
        const idx = instanceIndex, x = idx.bitAnd(uint(N - 1)), y = idx.shiftRight(uint(LOG2N));
        const mx = uint(N).sub(x).bitAnd(uint(N - 1)), my = uint(N).sub(y).bitAnd(uint(N - 1));
        const kx = freqIndexTSL(x, N).mul(dk), kz = freqIndexTSL(y, N).mul(dk);
        const Sk = spectrumTSL(kx, kz, c, U), Smk = spectrumTSL(kx.negate(), kz.negate(), c, U);
        const xi = gauss2(x, y), xim = gauss2(mx, my);
        const scale = finest ? U.ampScale.mul(U.ripple) : U.ampScale;
        const ampK = sqrt(Sk.mul(dk * dk)).mul(0.5).mul(scale), ampMK = sqrt(Smk.mul(dk * dk)).mul(0.5).mul(scale);
        h0.element(idx).assign(V4(xi.mul(ampK), xim.mul(ampMK)));
      })().compute(N * N);

      // time evolution, packed: xy = h + i·Dx, zw = Dz + i·0
      const evolve = Fn(() => {
        const idx = instanceIndex, x = idx.bitAnd(uint(N - 1)), y = idx.shiftRight(uint(LOG2N));
        const kx = freqIndexTSL(x, N).mul(dk), kz = freqIndexTSL(y, N).mul(dk), k = length(vec2(kx, kz)), ks = max(k, 1e-5), w = sqrt(ks.mul(G));
        const v = h0.element(idx).toVar(), cs = cos(w.mul(U.tSim)), sn = sin(w.mul(U.tSim));
        const ar = v.x, ai = v.y, pr = v.z, qi = v.w;
        const hr = ar.mul(cs).add(ai.mul(sn)).add(pr.mul(cs)).add(qi.mul(sn));
        const hi = ai.mul(cs).sub(ar.mul(sn)).add(pr.mul(sn)).sub(qi.mul(cs));
        const nx = select(k.greaterThan(0), kx.div(ks), float(0)), nz = select(k.greaterThan(0), kz.div(ks), float(0));
        const dxr = nx.mul(hi).negate(), dxi = nx.mul(hr), dzr = nz.mul(hi).negate(), dzi = nz.mul(hr);
        bufA.element(idx).assign(V4(hr.sub(dxi), hi.add(dxr), dzr, dzi));
      })().compute(N * N);

      // radix-2 Stockham, rows then columns, constants baked per stage; 2·log2N passes end back in bufA
      const passes: N[] = [];
      let src = bufA, dst = bufB;
      for (let dir = 0; dir < 2; dir++) for (let s = 0; s < LOG2N; s++) {
        const Ns = 1 << s, S = src, D = dst;
        passes.push(Fn(() => {
          const t = instanceIndex, line = t.shiftRight(uint(LOG2N - 1)), j = t.bitAnd(uint(HALF - 1)), k = j.bitAnd(uint(Ns - 1));
          const base = j.shiftRight(uint(s)).shiftLeft(uint(s + 1)), ang = k.toFloat().mul(Math.PI / Ns), wr = cos(ang), wi = sin(ang);
          let i0: N, i1: N, o0: N, o1: N;
          if (dir === 0) { const row = line.mul(uint(N)); i0 = row.add(j); i1 = row.add(j).add(uint(HALF)); o0 = row.add(base).add(k); o1 = o0.add(uint(Ns)); }
          else { i0 = j.mul(uint(N)).add(line); i1 = j.add(uint(HALF)).mul(uint(N)).add(line); o0 = base.add(k).mul(uint(N)).add(line); o1 = base.add(k).add(uint(Ns)).mul(uint(N)).add(line); }
          const a = S.element(i0).toVar(), b = S.element(i1).toVar();
          const t1 = V2(wr.mul(b.x).sub(wi.mul(b.y)), wr.mul(b.y).add(wi.mul(b.x)));
          const t2 = V2(wr.mul(b.z).sub(wi.mul(b.w)), wr.mul(b.w).add(wi.mul(b.z)));
          D.element(o0).assign(V4(a.xy.add(t1), a.zw.add(t2)));
          D.element(o1).assign(V4(a.xy.sub(t1), a.zw.sub(t2)));
        })().compute(N * HALF));
        [src, dst] = [dst, src];
      }

      // assemble: (Dx, h, Dz, 0) into the cascade texture
      const assemble = Fn(() => {
        const idx = instanceIndex, x = idx.bitAnd(uint(N - 1)), y = idx.shiftRight(uint(LOG2N)), v = bufA.element(idx).toVar();
        textureStore(tex, uvec2(x, y), vec4(v.y, v.x, v.z, 0)).toWriteOnly();
      })().compute(N * N);

      return { ...c, tex, h0: h0Node, evolve, passes, assemble };
    });

    this.h0Nodes = this.cascades.map((c) => c.h0);
    this.frameNodes = [];
    for (const c of this.cascades) this.frameNodes.push(c.evolve, ...c.passes, c.assemble);
    this.stats = seaStats(this.params, this.N, this.cascades);
    this.rebuild();
  }

  /** Change the sea. Reseeds the GPU spectrum and the CPU sampler. */
  setParams(p: Partial<SeaParams>): void {
    this.params = { ...this.params, ...p };
    this.rebuild();
  }

  /** New random phases for the same sea. */
  reseed(seed = Math.floor(Math.random() * 1e6) + 1): void {
    this.U.seed.value = seed;
    this.rebuild();
  }

  rebuild(): void {
    writeSeaUniforms(this.U, this.params);
    this.stats = seaStats(this.params, this.N, this.cascades);
    this.renderer.compute(this.h0Nodes);
    if (this.cpuPairs > 0) this.comps = buildComponents(this.params, this.N, this.cascades.slice(0, this.cpuCascades), this.U.seed.value, this.cpuPairs);
  }

  /** Advance the sea by dt seconds and recompute the height fields. Call once per frame before rendering. */
  step(dt: number): void {
    this.U.tSim.value += dt;
    this.renderer.compute(this.frameNodes);
  }

  get time(): number { return this.U.tSim.value; }

  /** Height of the surface you see at world (x, z), metres above mean level, chop included, from the strongest wave
   *  pairs — same spectrum as the GPU. */
  heightAt(x: number, z: number, t = this.U.tSim.value): number {
    return surfaceAt(this.comps, x + this.U.off.value.x, z + this.U.off.value.y, t, this.U.lambda.value);
  }
}
