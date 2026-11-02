/**
 * The GPU pipeline, step for step, in plain JS. Not used at runtime; it is the oracle the tests
 * check kernels.ts against, and the clearest statement of the conventions:
 *
 *  - buffers hold vec4 = two complex numbers (xy, zw) per grid cell
 *  - h0 buffer: (h0(k).re, .im, h0(−k).re, .im) in standard FFT frequency order (0..N/2−1, −N/2..−1)
 *  - evolve:   ĥ(k,t) = h0(k) e^{−iωt} + conj(h0(−k)) e^{+iωt};  packed as xy = h + i·Dx, zw = Dz + i·0
 *  - Dx, Dz:   +i (k/|k|) ĥ  (this sign sharpens crests for λ > 0; see test "chop sign")
 *  - IFFT:     unnormalised, f[j] = Σ_m F[m] e^{+2πi m·j/N}, radix-2 Stockham, rows then columns
 *  - result:   x = height, y = Dx, z = Dz (metres), w ≈ 0
 */

import { G } from './spectrum';

/** Standard FFT frequency index: 0,1,…,N/2−1,−N/2,…,−1 */
export const freqIndex = (m: number, N: number) => (m < N / 2 ? m : m - N);

/** One radix-2 Stockham pass over both complex slots; dir 0 = along x (rows), 1 = along z (columns). */
export function stockhamPass(src: Float32Array, dst: Float32Array, N: number, stage: number, dir: 0 | 1): void {
  const half = N >> 1, Ns = 1 << stage;
  for (let t = 0; t < N * half; t++) {
    const line = Math.floor(t / half), j = t % half, k = j & (Ns - 1), base = (j >> stage) << (stage + 1);
    const ang = Math.PI * k / Ns, wr = Math.cos(ang), wi = Math.sin(ang);
    let i0: number, i1: number, o0: number, o1: number;
    if (dir === 0) { i0 = line * N + j; i1 = line * N + j + half; o0 = line * N + base + k; o1 = o0 + Ns; }
    else { i0 = j * N + line; i1 = (j + half) * N + line; o0 = (base + k) * N + line; o1 = (base + k + Ns) * N + line; }
    for (let c = 0; c < 2; c++) {
      const ar = src[i0 * 4 + c * 2], ai = src[i0 * 4 + c * 2 + 1], br = src[i1 * 4 + c * 2], bi = src[i1 * 4 + c * 2 + 1];
      const tr = wr * br - wi * bi, ti = wr * bi + wi * br;
      dst[o0 * 4 + c * 2] = ar + tr; dst[o0 * 4 + c * 2 + 1] = ai + ti;
      dst[o1 * 4 + c * 2] = ar - tr; dst[o1 * 4 + c * 2 + 1] = ai - ti;
    }
  }
}

/** Full 2-D inverse FFT of a packed buffer. 2·log2(N) passes, so the result lands back in the input array. */
export function ifft2(buf: Float32Array, N: number): Float32Array {
  const log2N = Math.log2(N);
  let a: Float32Array<ArrayBufferLike> = buf, b: Float32Array<ArrayBufferLike> = new Float32Array(N * N * 4);
  for (let dir = 0 as 0 | 1; dir < 2; dir = (dir + 1) as 0 | 1) for (let s = 0; s < log2N; s++) { stockhamPass(a, b, N, s, dir); [a, b] = [b, a]; }
  return a;
}

/** Time evolution + packing, exactly as the evolve kernel. */
export function evolve(h0: Float32Array, N: number, L: number, t: number): Float32Array {
  const out = new Float32Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const kx = 2 * Math.PI * freqIndex(x, N) / L, kz = 2 * Math.PI * freqIndex(y, N) / L;
    const kl = Math.hypot(kx, kz), ks = Math.max(kl, 1e-5), w = Math.sqrt(G * ks);
    const c = Math.cos(w * t), s = Math.sin(w * t);
    const ar = h0[i * 4], ai = h0[i * 4 + 1], pr = h0[i * 4 + 2], qi = h0[i * 4 + 3];
    const hr = ar * c + ai * s + pr * c + qi * s, hi = ai * c - ar * s + pr * s - qi * c;
    const nx = kl > 0 ? kx / ks : 0, nz = kl > 0 ? kz / ks : 0;
    const dxr = -nx * hi, dxi = nx * hr, dzr = -nz * hi, dzi = nz * hr;
    out[i * 4] = hr - dxi; out[i * 4 + 1] = hi + dxr; out[i * 4 + 2] = dzr; out[i * 4 + 3] = dzi;
  }
  return out;
}

/** Naive inverse 2-D DFT, the slow oracle. */
export function idft2(re: Float64Array, im: Float64Array, N: number): { re: Float64Array; im: Float64Array } {
  const outRe = new Float64Array(N * N), outIm = new Float64Array(N * N);
  for (let jy = 0; jy < N; jy++) for (let jx = 0; jx < N; jx++) {
    let sr = 0, si = 0;
    for (let my = 0; my < N; my++) for (let mx = 0; mx < N; mx++) {
      const ang = 2 * Math.PI * (mx * jx + my * jy) / N, c = Math.cos(ang), s = Math.sin(ang);
      const r = re[my * N + mx], i = im[my * N + mx];
      sr += r * c - i * s; si += r * s + i * c;
    }
    outRe[jy * N + jx] = sr; outIm[jy * N + jx] = si;
  }
  return { re: outRe, im: outIm };
}
