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

/** Σ over pairs of 2·Re[ĥ(k,t) e^{ik·x}], the same evolution the GPU runs. */
export function heightAt(comps: WaveComponent[], x: number, z: number, t: number): number {
  let h = 0;
  for (const c of comps) {
    const ct = Math.cos(c.w * t), st = Math.sin(c.w * t);
    const hr = c.ar * ct + c.ai * st + c.pr * ct + c.qi * st, hi = c.ai * ct - c.ar * st + c.pr * st - c.qi * ct, ph = c.kx * x + c.kz * z;
    h += 2 * (hr * Math.cos(ph) - hi * Math.sin(ph));
  }
  return h;
}

/** Central-difference slope of the CPU sea, for pitch and roll: returns (∂h/∂x, ∂h/∂z). */
export function slopeAt(comps: WaveComponent[], x: number, z: number, t: number, e = 0.25): [number, number] {
  return [
    (heightAt(comps, x + e, z, t) - heightAt(comps, x - e, z, t)) / (2 * e),
    (heightAt(comps, x, z + e, t) - heightAt(comps, x, z - e, t)) / (2 * e),
  ];
}
