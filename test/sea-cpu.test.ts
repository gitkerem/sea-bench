import { describe, it, expect } from 'vitest';
import { CASCADES, DEFAULT_SEA, type SeaParams } from '../src/sea/spectrum';
import { buildComponents, heightAt, displacementAt, surfaceAt } from '../src/sea/sea-cpu';
import { evolve, ifft2 } from '../src/sea/fft-reference';

const p: SeaParams = { ...DEFAULT_SEA, windU: 12 * 0.5144 };

describe('CPU sampler, chop included', () => {
  it('is the GPU formulation: h, Dx and Dz match evolve + ifft when every pair is kept', () => {
    // one cascade, all its pairs, laid into an h0 buffer the way the h0 kernel lays them out
    const N = 32, c = CASCADES[1]!, dk = 2 * Math.PI / c.L, comps = buildComponents(p, N, [c], 1, 1e9);
    const h0 = new Float32Array(N * N * 4), cell = (k: number) => ((Math.round(k / dk) % N) + N) % N;
    for (const w of comps) {
      const i = cell(w.kz) * N + cell(w.kx), m = cell(-w.kz) * N + cell(-w.kx);
      h0.set([w.ar, w.ai, w.pr, w.qi], i * 4); h0.set([w.pr, w.qi, w.ar, w.ai], m * 4);
    }
    const t = 2.7, out = ifft2(evolve(h0, N, c.L, t), N);
    let err = 0, peak = 0;
    for (let y = 0; y < N; y += 3) for (let x = 0; x < N; x += 3) {
      const [dx, h, dz] = displacementAt(comps, x * c.L / N, y * c.L / N, t), o = (y * N + x) * 4;
      err = Math.max(err, Math.abs(h - out[o]!), Math.abs(dx - out[o + 1]!), Math.abs(dz - out[o + 2]!));
      peak = Math.max(peak, Math.abs(h));
    }
    expect(peak).toBeGreaterThan(0.02);
    expect(err).toBeLessThan(1e-4);
  });

  it('a hull over a drawn crest feels that crest: undoing the chop finds the water that was moved there', () => {
    const comps = buildComponents(p, 128, CASCADES.slice(0, 2), 1, 140), lam = 1.15, t = 3;
    let worst = 0, moved = 0;
    for (let i = 0; i < 60; i++) {
      const x0 = i * 0.37, z0 = i * 0.21, [dx, h, dz] = displacementAt(comps, x0, z0, t);
      const x = x0 + lam * dx, z = z0 + lam * dz;            // where the GPU draws the water from (x0, z0)
      worst = Math.max(worst, Math.abs(surfaceAt(comps, x, z, t, lam) - h));
      moved = Math.max(moved, Math.abs(heightAt(comps, x, z, t) - h));
    }
    expect(moved).toBeGreaterThan(0.02);                     // reading straight down misses by centimetres
    expect(worst).toBeLessThan(moved / 10);                   // reading the drawn surface lands on it
  });

  it('with no chop the surface is the plain height', () => {
    const comps = buildComponents(p, 128, CASCADES.slice(0, 2), 1, 40);
    expect(surfaceAt(comps, 2.5, -1.25, 4, 0)).toBe(heightAt(comps, 2.5, -1.25, 4));
  });
});
