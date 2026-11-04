/**
 * The CPU side of the sea. The FFT is only a fast way to evaluate the sum of every wave component at
 * every grid point; for a handful of points (a hull, a buoy, a ring) it is cheaper to sum the strongest
 * components directly. They are rebuilt from the same seeded spectrum the GPU uses, so what a boat
 * feels is the water you see, to within the energy of the components left out.
 */
import { G, spectrumK, spreadNorm, type Cascade, type SeaParams } from './spectrum';
import { gauss2 } from './noise';

export interface WaveComponent {
  kx: number; kz: number; w: number;
  /** h0(k) */ ar: number; ai: number;
  /** h0(−k) */ pr: number; qi: number;
}

/** Pick the strongest `pairs` ±k pairs per cascade. One entry per pair; self-mirrored cells (k = 0, Nyquist) are skipped. */
export function buildComponents(p: SeaParams, N: number, cascades: Cascade[], seed: number, pairs: number): WaveComponent[] {
  const out: WaveComponent[] = [], half = N / 2, norm = spreadNorm(p.spreadP);
  for (const c of cascades) {
    const dk = 2 * Math.PI / c.L, scale = (c.L < 3 ? p.ripple : 1) * p.ampScale, cand: (WaveComponent & { e: number })[] = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const mx = (N - x) & (N - 1), my = (N - y) & (N - 1), i = y * N + x, mi = my * N + mx;
      if (mi <= i) continue;
      const nx = x < half ? x : x - N, ny = y < half ? y : y - N, kx = nx * dk, kz = ny * dk;
      const Sk = spectrumK(kx, kz, c, p, norm), Smk = spectrumK(-kx, -kz, c, p, norm);
      if (Sk <= 0 && Smk <= 0) continue;
      const [xr, xi] = gauss2(x, y, N, seed), [mr, mi2] = gauss2(mx, my, N, seed);
      const aK = Math.sqrt(Sk * dk * dk) * 0.5 * scale, aM = Math.sqrt(Smk * dk * dk) * 0.5 * scale;
      cand.push({ kx, kz, w: Math.sqrt(G * Math.hypot(kx, kz)), ar: xr * aK, ai: xi * aK, pr: mr * aM, qi: mi2 * aM, e: Math.hypot(xr * aK, xi * aK) + Math.hypot(mr * aM, mi2 * aM) });
    }
    cand.sort((a, b) => b.e - a.e);
    for (const { e: _e, ...comp } of cand.slice(0, pairs)) out.push(comp);
  }
  return out;
}

/** Σ over pairs of 2·Re[ĥ(k,t) e^{ik·x}], the same evolution the GPU runs. The height of the wave field at its own
 *  coordinates, before the chop moves it sideways: what `surfaceAt` reads once it has found where to look. */
export function heightAt(comps: WaveComponent[], x: number, z: number, t: number): number {
  let h = 0;
  for (const c of comps) {
    const ct = Math.cos(c.w * t), st = Math.sin(c.w * t);
    const hr = c.ar * ct + c.ai * st + c.pr * ct + c.qi * st, hi = c.ai * ct - c.ar * st + c.pr * st - c.qi * ct, ph = c.kx * x + c.kz * z;
    h += 2 * (hr * Math.cos(ph) - hi * Math.sin(ph));
  }
  return h;
}

/** (Dx, h, Dz) at the wave field's own coordinates, packed like the GPU cascade texture. The horizontal part is
 *  D̂ = i·(k/|k|)·ĥ, as the evolve kernel builds it: water is carried toward the crest it is under. */
export function displacementAt(comps: WaveComponent[], x: number, z: number, t: number): [number, number, number] {
  let dx = 0, h = 0, dz = 0;
  for (const c of comps) {
    const ct = Math.cos(c.w * t), st = Math.sin(c.w * t);
    const hr = c.ar * ct + c.ai * st + c.pr * ct + c.qi * st, hi = c.ai * ct - c.ar * st + c.pr * st - c.qi * ct, ph = c.kx * x + c.kz * z;
    const cp = Math.cos(ph), sp = Math.sin(ph), re = hr * cp - hi * sp, im = hr * sp + hi * cp, k = Math.hypot(c.kx, c.kz);
    h += 2 * re;
    if (k > 0) { dx -= 2 * im * c.kx / k; dz -= 2 * im * c.kz / k; }
  }
  return [dx, h, dz];
}

/** Height of the surface you see at (x, z), chop included. The drawn surface is the field moved sideways by
 *  λ·D, so the water over (x, z) came from the point q with q + λ·D(q) = (x, z); fixed-point steps find it, as
 *  the column wall does on the GPU. The wall's two are plenty for a colour; a hull gets four (within a millimetre
 *  in a moderate sea, a few centimetres on a breaking storm crest), so it rides the crest drawn under it. */
export function surfaceAt(comps: WaveComponent[], x: number, z: number, t: number, lambda: number): number {
  if (lambda === 0) return heightAt(comps, x, z, t);
  let qx = x, qz = z;
  for (let i = 0; i < 4; i++) { const [dx, , dz] = displacementAt(comps, qx, qz, t); qx = x - lambda * dx; qz = z - lambda * dz; }
  return heightAt(comps, qx, qz, t);
}

/** Central-difference slope of the visible surface, for pitch and roll: returns (∂h/∂x, ∂h/∂z). */
export function slopeAt(comps: WaveComponent[], x: number, z: number, t: number, lambda = 0, e = 0.25): [number, number] {
  return [
    (surfaceAt(comps, x + e, z, t, lambda) - surfaceAt(comps, x - e, z, t, lambda)) / (2 * e),
    (surfaceAt(comps, x, z + e, t, lambda) - surfaceAt(comps, x, z - e, t, lambda)) / (2 * e),
  ];
}
