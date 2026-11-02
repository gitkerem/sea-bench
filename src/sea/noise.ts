/**
 * Seeded Gaussian noise, in plain JS. kernels.ts carries the same hash in WGSL (via TSL);
 * both must produce identical draws for a grid cell, because the CPU sampler rebuilds the GPU's
 * initial spectrum from them. Integer math is done in uint32 like the shader.
 */

export function wang(v: number): number {
  v = ((v ^ 61) ^ (v >>> 16)) >>> 0;
  v = Math.imul(v, 9) >>> 0;
  v = (v ^ (v >>> 4)) >>> 0;
  v = Math.imul(v, 668265261) >>> 0;
  v = (v ^ (v >>> 15)) >>> 0;
  return v;
}

/** uint hash → (0, 1], never 0, so log() is safe */
export function hashf(h: number): number {
  return (((h & 16777215) >>> 0) + 1) / 16777217;
}

/** Two unit Gaussians for grid cell (x, y) under `seed` (Box–Muller). */
export function gauss2(x: number, y: number, N: number, seed: number): [number, number] {
  const base = (x + y * N + Math.imul(seed, 7919)) >>> 0;
  const h1 = wang(base), h2 = wang((base + 1013904223) >>> 0);
  const r = Math.sqrt(-2 * Math.log(hashf(h1))), a = 2 * Math.PI * hashf(h2);
  return [r * Math.cos(a), r * Math.sin(a)];
}
