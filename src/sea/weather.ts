/**
 * Weather inside the column, like a snow globe: a deck of cloud over the water, rain falling from it, fog lying in
 * the troughs, a squall marching through, lightning. The page around the column stays as it is; only the sea and the
 * air above it change.
 *
 * What it should teach the eye: a squall shows as a dark band on the water upwind before the rain reaches you; under
 * a deck the glint goes and the water turns lead-grey; rain pocks the surface with rings; fog is thickest at the
 * water and thins upward.
 *
 * It adds its own meshes (a child Group of the column) and lays its marks on the column's materials by wrapping their
 * colour nodes, so the sea's shading stays in shading.ts; the one thing it sets there is `look.overcast`. It assumes
 * the column sits at the scene's origin, as both the bench and the dinghy place it. No DOM.
 */
import * as THREE from 'three/webgpu';
import {
  Fn, If, Loop, Break, Discard, uniform, float, vec2, vec3, vec4, hash, instanceIndex, positionGeometry, positionWorld,
  cameraPosition, varying, texture, mx_fractal_noise_float, smoothstep, clamp, mix, exp, pow, max, min, abs,
  length, normalize, cross, dot, fract, floor, sqrt, sin, cos, step, screenCoordinate, attribute, positionLocal,
} from 'three/tsl';
import type { SeaSim } from './sea-sim';
import type { SeaColumn } from './column';
import { makeSampleSea } from './shading';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** What the weather is doing, each 0 … 1. */
export interface WeatherParams {
  /** cloud cover: 0 clear, 0.5 broken cumulus, 1 a full deck */
  cloud: number;
  /** rain: 0 none, 0.3 drizzle, 1 a downpour */
  rain: number;
  /** fog: 0 none, 1 thick */
  fog: number;
  /** lightning: 0 none, 1 a strike every few seconds */
  lightning: number;
}

export interface WeatherOptions {
  /** the cloud deck's base and top, metres above the mean water (put the base over anything that stands up) */
  cloudBase?: number;
  cloudTop?: number;
  /** how far the cloud reaches past the water, as a multiple of the column's radius (rain and fog stay over the water) */
  cloudSpread?: number;
  /** how many raindrops are in the air at a downpour */
  drops?: number;
  /** how high the fog reaches, metres above the mean water */
  fogTop?: number;
}

const CLEAR: WeatherParams = { cloud: 0, rain: 0, fog: 0, lightning: 0 };
/** how deep a squall is, metres from its leading edge to its trailing one */
const SQUALL_DEPTH = 30;
const FOG_SLICES = 14;
/** the weather map's size over the column's width */
const FIELD_N = 96;

// Value noise on the CPU for the weather map: a hashed lattice, smoothly interpolated, summed over octaves.
const lattice = (x: number, y: number) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = lattice(xi, yi), b = lattice(xi + 1, yi), c = lattice(xi, yi + 1), d = lattice(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, oct: number): number {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < oct; o++) { sum += vnoise(x, y) * amp; norm += amp; x = x * 2.03 + 17.1; y = y * 2.03 + 3.7; amp *= 0.55; }
  return sum / norm;
}
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class SeaWeather extends THREE.Group {
  /** where the weather is heading; set it and the weather eases there over a couple of seconds */
  readonly target: WeatherParams = { ...CLEAR };
  /** the weather now */
  readonly now: WeatherParams = { ...CLEAR };
  /** how much of a squall is over the middle of the column, 0 … 1: a scene can raise its wind by it */
  squallHere = 0;
  /** a lightning flash right now, 0 … 1: a scene with lights can brighten them by it */
  flash = 0;

  private readonly U = {
    t: uniform(0), cloud: uniform(0), rain: uniform(0), fog: uniform(0), storm: uniform(0), flash: uniform(0),
    flashPos: uniform(new THREE.Vector3()), strike: uniform(new THREE.Vector2()), strikeAmt: uniform(0),
    cloudOff: uniform(new THREE.Vector2()), fogOff: uniform(new THREE.Vector2()),
    /** the drops' drift with the wind, m/s in xz */
    drift: uniform(new THREE.Vector2()),
    /** the squall: downwind unit vector, where its leading and trailing edges are (metres along it), on or off */
    down: uniform(new THREE.Vector2(1, 0)), front: uniform(-999), back: uniform(-999), squall: uniform(0),
    fogCol: uniform(new THREE.Color()),
  };
  private t = 0;
  private front = -999;
  private squallOn = false;
  private nextStrike = 3;
  private flashT = -1;
  private flashSeq: number[] = [];
  private bolt: THREE.Group | null = null;
  /** the bolt in three layers: a hair-thin white core, a tight hot glow, a wide soft halo */
  private readonly boltMats: THREE.MeshBasicNodeMaterial[];
  private readonly deck: THREE.Mesh;
  private readonly rain: THREE.InstancedMesh;
  private readonly veil: THREE.Mesh;
  private readonly fog: THREE.InstancedMesh;
  /** the map the deck, its shadow and the rain read: r cloud, g rain, b how high it builds */
  private readonly fieldData = new Uint8Array(FIELD_N * FIELD_N * 4);
  private readonly fieldTex = new THREE.DataTexture(this.fieldData, FIELD_N, FIELD_N, THREE.RGBAFormat, THREE.UnsignedByteType);
  private readonly R: number;
  /** the cloud's radius, wider than the water's */
  private readonly RC: number;
  private readonly waterY: number;
  private readonly base: number;
  private readonly top: number;

  constructor(private readonly sea: SeaSim, private readonly column: SeaColumn, opts: WeatherOptions = {}) {
    super();
    const U = this.U, R = (this.R = column.radius), WY = (this.waterY = column.waterY), RC = (this.RC = R * (opts.cloudSpread ?? 1.3));
    const base = (this.base = opts.cloudBase ?? 2.6), top = (this.top = opts.cloudTop ?? base + 2.2), fogTop = opts.fogTop ?? 2.6;
    const look = column.look;
    this.fieldTex.magFilter = this.fieldTex.minFilter = THREE.LinearFilter;
    this.fieldTex.generateMipmaps = false; this.fieldTex.needsUpdate = true;

    // ---------- the fields everything shares, so the shadow on the water is the cloud overhead
    // the squall: dark water, a thicker deck and heavy rain between its leading and trailing edges
    const squallAt = (xz: N): N => {
      const s = dot(xz, U.down);
      return smoothstep(U.front.add(1.8), U.front.sub(1.2), s).mul(smoothstep(U.back.sub(3), U.back.add(3), s)).mul(U.squall);
    };
    // The deck seen from above, the rain under it and how high the cloud builds, worked out on the CPU each frame
    // into a small map over the column (field()): the deck's march reads it at every step, which the GPU noise
    // couldn't afford, and the water's shadow reads the same map, so it is the cloud overhead.
    const fieldUv = (xz: N): N => xz.div(RC * 2).add(0.5);
    const cloudShape = (xz: N): N => texture(this.fieldTex, fieldUv(xz), float(0)).r;
    const rainAt = (xz: N): N => texture(this.fieldTex, fieldUv(xz), float(0)).g;
    const liftAt = (xz: N): N => texture(this.fieldTex, fieldUv(xz), float(0)).b;

    // ---------- 1. marks on the water: cloud shadow, the squall's dark band, rain rings, a strike's glare
    const rings = (wp: N, amt: N): N => {
      const acc = float(0).toVar();
      for (let l = 0; l < 3; l++) {
        const cs = 0.38 + l * 0.07, g = wp.div(cs).add(vec2(l * 0.37, l * 0.71)), id = floor(g) as N, f = fract(g).sub(0.5);
        const seed = id.x.mul(127.1).add(id.y.mul(311.7)).add(l * 17.3);
        const h1 = hash(seed), h2 = hash(seed.add(4.1)), h3 = hash(seed.add(9.7));
        // each cell catches a drop now and then; its ring spreads and fades in well under a second
        const ctr = vec2(h1, h2).sub(0.5).mul(0.5), ph = fract(U.t.mul(h3.mul(0.6).add(1.1)).add(h2));
        const d = length(f.sub(ctr)), r = ph.mul(0.46);
        const ring = smoothstep(0.045, 0.0, abs(d.sub(r))).mul(pow(ph.oneMinus(), 2.0));
        const splash = smoothstep(0.05, 0.0, d).mul(smoothstep(0.12, 0.0, ph));
        acc.addAssign(ring.add(splash.mul(1.5)).mul(step(h3, amt)));
      }
      return acc;
    };
    const surf = column.surface.material as THREE.MeshBasicNodeMaterial, surfBase = surf.colorNode as N;
    surf.colorNode = Fn(() => {
      const c = surfBase, p = positionWorld, xz = p.xz, sd = look.sunDir as N, col = c.rgb.toVar();
      // a clear, dry sky costs the water nothing: the marks are only worked out when there is weather
      If(U.cloud.add(U.rain).add(U.squall).add(U.flash).greaterThan(0.002), () => {
        // where the sun's ray from this bit of water crosses the middle of the deck
        const shade = cloudShape(xz.add(sd.xz.div(max(sd.y, 0.15)).mul(float(WY + (base + top) / 2).sub(p.y))));
        // crisp shadows under a broken sky; under a full deck it is all shadow and there is no contrast left
        const light = float(1).sub(shade.mul(0.5).mul(U.cloud.mul(0.7).oneMinus()));
        col.mulAssign(light.mul(mix(float(1), float(0.55), squallAt(xz))).mul(float(1).sub(U.cloud.mul(0.18)).sub(U.storm.mul(0.18))));
        const amt = rainAt(xz);
        // under a rain cell the cloud is at its thickest: the water goes dark and dull there, never lighter
        const dull = dot(col, vec3(0.3, 0.59, 0.11));
        col.assign(mix(col, vec3(dull), amt.mul(0.35)).mul(float(1).sub(amt.mul(0.3))));
        If(amt.greaterThan(0.002), () => { col.addAssign(vec3(0.62, 0.68, 0.72).mul(rings(xz.add(sea.U.off), amt)).mul(0.18).mul(amt.mul(0.5).add(0.5))); });
        const sk = length(xz.sub(U.strike));
        col.addAssign(vec3(0.85, 0.85, 1.0).mul(exp(sk.mul(sk).mul(-0.25)).mul(U.strikeAmt).mul(2.2)).add(vec3(0.5, 0.52, 0.6).mul(U.flash).mul(0.16)));
      });
      return vec4(col, c.a);
    })();
    surf.needsUpdate = true;
    // the water in the wall greys and darkens under the deck too; everything lights up in a flash
    for (const m of [column.wall.material, column.floor.material, column.rocks[0]?.material] as THREE.MeshBasicNodeMaterial[]) {
      if (!m) continue;
      const mb = m.colorNode as N;
      m.colorNode = Fn(() => {
        const c = mb, grey = dot(c.rgb, vec3(0.3, 0.59, 0.11));
        const col = mix(c.rgb, vec3(grey), U.cloud.mul(0.4)).mul(float(1).sub(U.cloud.mul(0.25)).sub(U.storm.mul(0.22)));
        return vec4(col.add(vec3(0.4, 0.42, 0.5).mul(U.flash).mul(0.1)), c.a);
      })();
      m.needsUpdate = true;
    }

    // ---------- 2. the deck: raymarched inside the column's cylinder; flat dark bases, billowing tops lit by the sun
    // (the sun is above the deck, so the tops get all of it however grey the water is; a storm cloud is dark through)
    const yb = WY + base, yt = WY + top, STEPS = 28;
    const density = (p: N): N => {
      const h = p.y.sub(yb).div(yt - yb), sh = cloudShape(p.xz), q = p.xz.add(U.cloudOff);
      const lift = liftAt(p.xz).sub(0.5).mul(0.5);   // towers: thick cloud builds higher
      const tp = min(sh.mul(0.62).add(0.14).add(lift), 0.96);
      const prof = smoothstep(0.0, 0.06, h).mul(smoothstep(tp, tp.mul(0.45), h));
      const det = mx_fractal_noise_float(vec3(q.x, p.y.mul(1.3), q.y).mul(0.85).add(vec3(0, U.t.mul(0.05), 0)), 2, 2.2, 0.55).mul(1.1).add(0.5);
      const body = sh.mul(prof);
      // eat the edges more than the core and the tops more than the base, so the outline boils
      const erode = det.mul(float(0.62).sub(body.mul(0.22))).mul(h.mul(0.7).add(0.35));
      return clamp(body.sub(erode).mul(2.2), 0, 1).mul(smoothstep(RC, RC - 1.4, length(p.xz)));
    };
    const cloudMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false });
    cloudMat.colorNode = Fn(() => {
      const ro = cameraPosition, rd = normalize(positionWorld.sub(cameraPosition));
      // where the view ray enters and leaves the deck's cylinder
      const a = rd.x.mul(rd.x).add(rd.z.mul(rd.z)), b = ro.x.mul(rd.x).add(ro.z.mul(rd.z)).mul(2);
      const c = ro.x.mul(ro.x).add(ro.z.mul(ro.z)).sub(RC * RC), disc = max(b.mul(b).sub(a.mul(c).mul(4)), 0);
      const tc0 = b.negate().sub(sqrt(disc)).div(a.mul(2)), tc1 = b.negate().add(sqrt(disc)).div(a.mul(2));
      const ty0 = float(yb).sub(ro.y).div(rd.y), ty1 = float(yt).sub(ro.y).div(rd.y);
      const t0 = max(max(tc0, min(ty0, ty1)), 0), t1 = min(tc1, max(ty0, ty1));
      const T = float(1).toVar(), C = vec3(0).toVar(), sd = look.sunDir as N;
      // (WGSL's discard doesn't stop the work after it, so the march itself sits inside the branch)
      If(t1.greaterThan(t0), () => {
      const dt = t1.sub(t0).div(STEPS), jit = hash(screenCoordinate.x.add(screenCoordinate.y.mul(1931.3)));
      const forward = pow(max(dot(rd, sd), 0), 6.0);
      const baseCol = mix(vec3(0.30, 0.33, 0.37), vec3(0.07, 0.08, 0.10), U.storm);
      const topCol = mix(vec3(0.80, 0.82, 0.85), vec3(0.30, 0.33, 0.37), U.storm);
      Loop(STEPS, ({ i }: { i: N }) => {
        If(T.lessThan(0.03), () => { Break(); });
        const p = ro.add(rd.mul(t0.add(dt.mul(float(i).add(jit)))));
        const d = density(p);
        If(d.greaterThan(0.002), () => {
          const h = clamp(p.y.sub(yb).div(yt - yb), 0, 1);
          // the sun reaching this bit of cloud through what lies toward it, and a little powder darkening
          const toward = density(p.add(sd.mul(1.0)));
          const Tl = exp(toward.mul(-3.6)).mul(float(1).sub(exp(d.mul(-5))).mul(0.5).add(0.5));
          const amb = mix(baseCol, topCol, smoothstep(0.0, 0.8, h));
          const fl = U.flash.mul(exp(length(p.sub(U.flashPos)).mul(-0.55))).mul(3.0).add(U.flash.mul(0.1));
          const lit = amb.mul(0.5).add(look.sunCol.mul(Tl).mul(float(0.62).add(forward.mul(0.5))).mul(U.storm.mul(0.82).oneMinus())).add(vec3(0.82, 0.84, 1.0).mul(fl));
          const al = float(1).sub(exp(d.mul(dt).mul(-3.2)));
          C.addAssign(lit.mul(al).mul(T));
          T.mulAssign(al.oneMinus());
        });
      });
      });
      const alpha = T.oneMinus();
      If(alpha.lessThan(0.004), () => { Discard(); });
      return vec4(C.div(max(alpha, 0.001)), alpha);
    })();
    const deckGeo = new THREE.CylinderGeometry(RC, RC, top - base, 128, 1, false);
    deckGeo.translate(0, WY + (base + top) / 2, 0);
    const deck = (this.deck = new THREE.Mesh(deckGeo, cloudMat));
    deck.renderOrder = 6;
    this.add(deck);

    // ---------- 3. rain: thin streaks from the cloud base to the water, blown by the wind, as a camera sees them
    const dropsN = opts.drops ?? 14000;
    const rainMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const vAlong = varying(float(0)), vOn = varying(float(0));
    rainMat.positionNode = Fn(() => {
      const i = float(instanceIndex), h1 = hash(i.mul(1.13)), h2 = hash(i.mul(2.71).add(5.3)), h3 = hash(i.mul(0.79).add(11.1)), h4 = hash(i.mul(3.37).add(2.2));
      const v = h4.mul(1.8).add(6.6), H = float(base), age = fract(U.t.mul(v).div(H).add(h3));
      const ang = h2.mul(Math.PI * 2), rr = sqrt(h1).mul(R), fall = age.mul(H).div(v), R2 = R * 2;
      // blown sideways while it falls, wrapped round so the column never empties on its upwind side
      const x0 = cos(ang).mul(rr).add(U.drift.x.mul(fall)), z0 = sin(ang).mul(rr).add(U.drift.y.mul(fall));
      const x = x0.add(R).sub(floor(x0.add(R).div(R2)).mul(R2)).sub(R), z = z0.add(R).sub(floor(z0.add(R).div(R2)).mul(R2)).sub(R);
      const ctr = vec3(x, float(WY + base).sub(age.mul(H)), z);
      const src = vec2(x, z).sub(U.drift.mul(fall));   // where this drop left the cloud: the shafts lean with the wind
      const on = step(h4, rainAt(src)).mul(step(length(vec2(x, z)), R - 0.05));
      // the streak: as far as the drop falls in a 1/16 s exposure, a centimetre and a half wide, facing the camera
      const vel = vec3(U.drift.x, v.negate(), U.drift.y), dir = normalize(vel), len = length(vel).mul(1 / 16);
      const side = normalize(cross(dir, normalize(cameraPosition.sub(ctr)))).mul(0.024);
      vAlong.assign(positionGeometry.y.add(0.5)); vOn.assign(on);
      return ctr.add(side.mul(positionGeometry.x)).add(dir.mul(positionGeometry.y).mul(len)).mul(on).add(vec3(0, -50, 0).mul(on.oneMinus()));
    })();
    rainMat.colorNode = Fn(() => {
      If(vOn.lessThan(0.5), () => { Discard(); });
      // mid-grey: darker than the paper behind, lighter than the water below, as rain looks
      const a = smoothstep(0.0, 0.5, vAlong).mul(smoothstep(1.0, 0.75, vAlong)).mul(0.2).add(U.flash.mul(0.12));
      return vec4(vec3(0.52, 0.57, 0.62).add(U.flash.mul(0.45)), a);
    })();
    const rain = (this.rain = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), rainMat, dropsN));
    rain.frustumCulled = false; rain.renderOrder = 5;
    this.add(rain);

    // The shafts as a whole: from any distance rain reads as a grey veil hanging from the cloud, darkest where it
    // falls hardest, leaning downwind; single streaks only show up close. A short march through the air over the
    // water reads the same rain map, from where each bit of rain left the cloud.
    const veilMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false });
    const VSTEPS = 16, yTop = WY + base;
    veilMat.colorNode = Fn(() => {
      const ro = cameraPosition, rd = normalize(positionWorld.sub(cameraPosition));
      const a = rd.x.mul(rd.x).add(rd.z.mul(rd.z)), b = ro.x.mul(rd.x).add(ro.z.mul(rd.z)).mul(2);
      const c = ro.x.mul(ro.x).add(ro.z.mul(ro.z)).sub(R * R), disc = max(b.mul(b).sub(a.mul(c).mul(4)), 0);
      const tc0 = b.negate().sub(sqrt(disc)).div(a.mul(2)), tc1 = b.negate().add(sqrt(disc)).div(a.mul(2));
      const ty0 = float(WY).sub(ro.y).div(rd.y), ty1 = float(yTop).sub(ro.y).div(rd.y);
      const t0 = max(max(tc0, min(ty0, ty1)), 0), t1 = min(tc1, max(ty0, ty1));
      const T = float(1).toVar();
      If(t1.greaterThan(t0), () => {
        const dt = t1.sub(t0).div(VSTEPS), jit = hash(screenCoordinate.x.mul(1.7).add(screenCoordinate.y.mul(913.1)));
        Loop(VSTEPS, ({ i }: { i: N }) => {
          const p = ro.add(rd.mul(t0.add(dt.mul(float(i).add(jit)))));
          const fall = float(yTop).sub(p.y).div(7.5);
          const w = rainAt(p.xz.sub(U.drift.mul(fall)));
          // thin at the cloud base where the drops are still gathering, full lower down
          const d = w.mul(w).mul(0.06).mul(smoothstep(0.0, 1.2, fall.mul(7.5)));
          T.mulAssign(exp(d.mul(dt).negate()));
        });
      });
      const alpha = T.oneMinus().mul(0.45);
      If(alpha.lessThan(0.003), () => { Discard(); });
      // rain under a deck is in the cloud's shade: a dim grey, darker than the paper, close to the shaded water
      const col = mix(vec3(0.3, 0.34, 0.37), vec3(0.2, 0.22, 0.25), U.storm).add(U.flash.mul(0.3));
      return vec4(col, alpha);
    })();
    const veilGeo = new THREE.CylinderGeometry(R - 0.03, R - 0.03, base, 96, 1, false);
    veilGeo.translate(0, WY + base / 2, 0);
    const veil = (this.veil = new THREE.Mesh(veilGeo, veilMat));
    veil.renderOrder = 4.5;
    this.add(veil);

    // ---------- 4. fog: stacked slices, thick at the water and thinning upward, lying in the troughs, drifting
    const sampleSea = makeSampleSea(sea);
    const fogGeo = new THREE.CircleGeometry(R - 0.02, 96);
    fogGeo.rotateX(-Math.PI / 2);
    const fogMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    fogMat.positionNode = Fn(() => {
      const k = float(instanceIndex).add(0.5).div(FOG_SLICES);
      return positionGeometry.add(vec3(0, pow(k, 1.7).mul(fogTop).add(WY - 0.25), 0));
    })();
    fogMat.colorNode = Fn(() => {
      const p = positionWorld;
      If(p.y.lessThan(sampleSea(p.xz).y.add(WY)), () => { Discard(); });
      const hgt = max(p.y.sub(WY), 0), q = p.xz.add(U.fogOff);
      const n = mx_fractal_noise_float(vec3(q.mul(0.22), p.y.mul(0.45).add(U.t.mul(0.04))), 2, 2.0, 0.5).mul(0.9).add(0.55);
      const d = U.fog.mul(exp(hgt.mul(-0.75))).mul(clamp(n, 0, 1.2)).mul(smoothstep(R, R - 0.8, length(p.xz)));
      return vec4(U.fogCol.add(U.flash.mul(0.2)), clamp(d.mul(0.24), 0, 0.6));
    })();
    const fog = (this.fog = new THREE.InstancedMesh(fogGeo, fogMat, FOG_SLICES));
    fog.frustumCulled = false; fog.renderOrder = 4;
    this.add(fog);

    // ---------- 5. the bolt's materials (the bolt itself is built per strike)
    // A bolt is a channel a few centimetres wide, white-hot, lighting the rain and air around it into a soft glow.
    // Each layer is a flat ribbon turned to face the camera, so it has the same look from every side, and fades
    // across its width: the core is sharp, the glow and halo fall off smoothly with no edge to them. Drawn after
    // the rain, so the bolt shows through the curtain rather than behind it.
    const tng = attribute('tng', 'vec3'), side = attribute('side', 'float'), wid = attribute('wid', 'float');
    const ribbon = (profile: (s: N) => N, col: N, additive: boolean) => {
      const m = new THREE.MeshBasicNodeMaterial({
        toneMapped: false, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const across = normalize(cross(tng, cameraPosition.sub(positionLocal)));
      m.positionNode = positionLocal.add(across.mul(side.mul(wid)));
      const s = abs(varying(side));
      m.colorNode = vec4(col, profile(s).mul(U.flash.mul(0.5).add(0.5)));
      return m;
    };
    this.boltMats = [
      ribbon((s) => exp(s.mul(s).mul(-4.5)).mul(0.38), vec3(0.42, 0.48, 0.95), true),   // halo
      ribbon((s) => exp(s.mul(s).mul(-5)).mul(0.85), vec3(0.75, 0.8, 1.0), true),       // hot glow
      ribbon((s) => smoothstep(1, 0.35, s), vec3(1.0, 0.99, 1.0), false),                 // core
    ];

    column.add(this);
  }

  /** Change the weather; it eases there. */
  set(p: Partial<WeatherParams>): void { Object.assign(this.target, p); }

  /** Is a squall passing through the column right now? */
  get squalling(): boolean { return this.squallOn; }

  /** Send a squall through: a dark line on the water upwind, then the rain, then clearing behind it. */
  squall(): void { this.front = -this.RC - 6; this.squallOn = true; }

  /** Lightning: a bolt from the cloud base to the water, or (bolt false) a flash inside the cloud. */
  strike(bolt = true): void {
    const R = this.R, a = Math.random() * Math.PI * 2, r = Math.random() * (R - 2.4);
    const to = new THREE.Vector3(Math.cos(a) * r, this.waterY, Math.sin(a) * r);
    const from = new THREE.Vector3(to.x + (Math.random() - 0.5) * 2, this.waterY + this.base + 0.5, to.z + (Math.random() - 0.5) * 2);
    this.clearBolt();
    this.U.flashPos.value.copy(bolt ? from : from.clone().setY(this.waterY + this.base + 1));
    if (bolt) { this.bolt = this.makeBolt(from, to); this.bolt.visible = false; this.add(this.bolt); this.U.strike.value.set(to.x, to.z); }
    // a real flash is a few return strokes: bright, gone, bright again
    this.flashSeq = bolt ? [1, 0.15, 0.9, 0.05, 0.7, 0.3, 0] : [0.5, 0.1, 0.35, 0];
    this.flashT = 0;
  }

  /**
   * Advance the weather. The wind, in m/s and the direction it blows toward (`travel`, as the sea's), drifts the
   * cloud, the rain and the fog, and carries a squall. `moving` is how fast the column's frame moves over the ground,
   * for a scene that keeps a boat still and moves the world (0 for the bench).
   */
  step(dt: number, wind: { speed: number; travel: number }, moving = { x: 0, z: 0 }): void {
    const U = this.U, k = 1 - Math.exp(-dt / 1.6);
    for (const key of Object.keys(this.now) as (keyof WeatherParams)[]) this.now[key] += (this.target[key] - this.now[key]) * k;
    this.t += dt; U.t.value = this.t;

    const dx = Math.cos(wind.travel), dz = Math.sin(wind.travel), ws = wind.speed;
    U.down.value.set(dx, dz);
    U.drift.value.set(dx * ws * 0.8 - moving.x, dz * ws * 0.8 - moving.z);
    // the cloud field slides downwind past the column, slowly: on a diorama this size the true speed would sweep a
    // cloud across in a couple of seconds, so it drifts at a fifth of the wind and takes a minute or so
    U.cloudOff.value.x += (moving.x - dx * ws * 0.2) * dt; U.cloudOff.value.y += (moving.z - dz * ws * 0.2) * dt;
    U.fogOff.value.x += (moving.x - dx * ws * 0.15) * dt; U.fogOff.value.y += (moving.z - dz * ws * 0.15) * dt;

    // the squall marches downwind at about half the wind, and is gone once its trailing edge has passed
    if (this.squallOn) {
      this.front += (0.5 * ws + 1) * dt;
      if (this.front - SQUALL_DEPTH > this.RC + 4) { this.squallOn = false; this.front = -999; }
    }
    U.front.value = this.front; U.back.value = this.front - SQUALL_DEPTH; U.squall.value = this.squallOn ? 1 : 0;
    const ss = THREE.MathUtils.smoothstep;
    this.squallHere = this.squallOn ? ss(this.front, -1.8, 1.2) * ss(SQUALL_DEPTH - this.front, -3, 3) : 0;

    // lightning on its own clock; mostly flashes inside the cloud, more bolts the harder it storms
    const L = this.now.lightning;
    if (this.target.lightning > 0.02) {
      this.nextStrike -= dt;
      if (this.nextStrike < 0) { this.strike(Math.random() < 0.3 + 0.5 * L); this.nextStrike = THREE.MathUtils.lerp(14, 2.5, L) * (0.5 + Math.random()); }
    }
    let flash = 0;
    if (this.flashT >= 0) {
      this.flashT += dt;
      const i = Math.floor(this.flashT / 0.06);
      if (i >= this.flashSeq.length) { this.flashT = -1; this.clearBolt(); } else flash = this.flashSeq[i];
      if (this.bolt) this.bolt.visible = flash > 0.25;
    }
    this.flash = flash;
    U.flash.value = flash; U.strikeAmt.value = this.bolt?.visible ? flash : 0;

    const { cloud, rain, fog } = this.now, storm = THREE.MathUtils.clamp(Math.max(L * 1.4, rain * 0.75), 0, 1) * cloud, dark = this.column.look.dark.value > 0.5;
    U.cloud.value = cloud; U.rain.value = rain; U.fog.value = fog; U.storm.value = storm;
    if (cloud > 0.005 || rain > 0.005 || this.squallOn) this.field();
    // a layer with nothing in it isn't drawn: the deck and the fog are the costly ones
    this.deck.visible = cloud > 0.01 || this.squallOn;
    this.rain.visible = this.veil.visible = rain > 0.01 || this.squallOn;
    this.fog.visible = fog > 0.01;
    const look = this.column.look;
    look.overcast.value = Math.min(1, cloud * 0.95 + this.squallHere * 0.3);
    look.overcastCol.value.set(dark ? '#30373b' : '#7b858a').lerp(new THREE.Color(dark ? '#1c2124' : '#454d52'), storm * 0.8).addScalar(flash * 0.6);
    U.fogCol.value.set(dark ? '#5d666b' : '#d5d9d8').lerp(new THREE.Color(dark ? '#3a4247' : '#a7aeb1'), cloud * 0.6);
  }

  /** Fill the weather map: broken cumulus at half cover, solid at full, thickened by a squall, thinning toward the
   *  wall; the rain under it; and a slower noise for how high each part of the deck builds. */
  private field(): void {
    const U = this.U, N = FIELD_N, RC = this.RC, D = this.fieldData, off = U.cloudOff.value, down = U.down.value;
    const cloud = this.now.cloud, rain = this.now.rain, front = this.front, back = front - SQUALL_DEPTH, sq = this.squallOn ? 1 : 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) / N * 2 - 1) * RC, z = ((j + 0.5) / N * 2 - 1) * RC, s = x * down.x + z * down.y;
      const sAt = sq * sstep(front + 1.8, front - 1.2, s) * sstep(back - 3, back + 3, s);
      const qx = (x + off.x) * 0.17, qz = (z + off.y) * 0.17;
      const n = (fbm(qx, qz, 4) - 0.5) * 2.4 + 0.5, cov = Math.min(1, cloud + sAt * 0.75);
      const shape = sstep(1 - cov - 0.08, 1 - cov + 0.22, n) * sstep(RC + 0.2, RC - 3.2, Math.hypot(x, z));
      // Rain falls in shafts, not as a sheet: convective cells a few metres across under the thickest cloud, a
      // drizzle between them. More rain widens the shafts and lets them merge; a squall brings its own.
      const m = (fbm(qx * 1.7 + 71.3, qz * 1.7 + 13.9, 3) - 0.5) * 2.6 + 0.5, w = 0.66 - 0.26 * rain;
      const shaft = sstep(w - 0.1, w + 0.32, m) * (0.3 + 0.7 * sstep(0.2, 0.75, shape));
      const wet = Math.min(1, rain * (0.05 + 1.25 * shaft) + sAt * (0.45 + 0.55 * shaft));
      const k = (j * N + i) * 4;
      D[k] = shape * 255; D[k + 1] = wet * 255; D[k + 2] = vnoise(qx * 2.1 + 40, qz * 2.1) * 255; D[k + 3] = 255;
    }
    this.fieldTex.needsUpdate = true;
  }

  private makeBolt(from: THREE.Vector3, to: THREE.Vector3): THREE.Group {
    const g = new THREE.Group();
    // midpoint displacement: each half kinks sideways by a share of its length
    const jag = (a: THREE.Vector3, b: THREE.Vector3, depth: number, out: THREE.Vector3[]) => {
      if (depth === 0) { out.push(b.clone()); return; }
      const m = a.clone().lerp(b, 0.5), span = a.distanceTo(b);
      m.x += (Math.random() - 0.5) * span * 0.32; m.z += (Math.random() - 0.5) * span * 0.32; m.y += (Math.random() - 0.5) * span * 0.08;
      jag(a, m, depth - 1, out); jag(m, b, depth - 1, out);
    };
    // one ribbon per layer along the path; half-widths in metres, branches thinner and tapering to their tips
    const HALF = [0.55, 0.07, 0.014];
    const tube = (pts: THREE.Vector3[], k: number, taper: number) => {
      const n = pts.length, pos = new Float32Array(n * 6), tg = new Float32Array(n * 6), sd = new Float32Array(n * 2);
      const idx: number[] = [], t = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        t.subVectors(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)]).normalize();
        for (let j = 0; j < 2; j++) {
          pos.set([pts[i].x, pts[i].y, pts[i].z], (i * 2 + j) * 3); tg.set([t.x, t.y, t.z], (i * 2 + j) * 3); sd[i * 2 + j] = j ? 1 : -1;
        }
        if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
      this.boltMats.forEach((mat, l) => {
        const geo = new THREE.BufferGeometry(), w = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) w[i * 2] = w[i * 2 + 1] = HALF[l] * k * (1 - taper * i / (n - 1));
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('tng', new THREE.BufferAttribute(tg, 3));
        geo.setAttribute('side', new THREE.BufferAttribute(sd, 1));
        geo.setAttribute('wid', new THREE.BufferAttribute(w, 1));
        geo.setIndex(idx);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 7 + l; mesh.frustumCulled = false;
        g.add(mesh);
      });
    };
    const trunk = [from.clone()]; jag(from, to, 6, trunk); tube(trunk, 1, 0);
    for (let k = 0; k < 3; k++) {   // forks that die out in mid-air
      const s = trunk[4 + Math.floor(Math.random() * trunk.length * 0.5)];
      const end = s.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.4, -0.8 - Math.random() * 1.4, (Math.random() - 0.5) * 2.4));
      const br = [s.clone()]; jag(s, end, 4, br); tube(br, 0.5, 0.7);
    }
    return g;
  }

  private clearBolt(): void {
    if (!this.bolt) return;
    this.remove(this.bolt);
    this.bolt.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.bolt = null;
  }
}
