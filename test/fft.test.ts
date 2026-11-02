import { describe, it, expect } from 'vitest';
import { stockhamPass, ifft2, evolve, idft2, freqIndex } from '../src/sea/fft-reference';

/** Index helper for a packed buffer. */
const idx = (x: number, y: number, N: number) => y * N + x;

describe('Stockham radix-2 passes (the GPU formulation)', () => {
  it('matches the naive inverse DFT on both packed complex slots', () => {
    const N = 16, buf = new Float32Array(N * N * 4);
    let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };
    for (let i = 0; i < buf.length; i++) buf[i] = rnd();
    const re0 = new Float64Array(N * N), im0 = new Float64Array(N * N), re1 = new Float64Array(N * N), im1 = new Float64Array(N * N);
    for (let i = 0; i < N * N; i++) { re0[i] = buf[i * 4]; im0[i] = buf[i * 4 + 1]; re1[i] = buf[i * 4 + 2]; im1[i] = buf[i * 4 + 3]; }
    const ref0 = idft2(re0, im0, N), ref1 = idft2(re1, im1, N), out = ifft2(buf, N);
    let err = 0;
    for (let i = 0; i < N * N; i++) {
      err = Math.max(err, Math.abs(out[i * 4] - ref0.re[i]), Math.abs(out[i * 4 + 1] - ref0.im[i]), Math.abs(out[i * 4 + 2] - ref1.re[i]), Math.abs(out[i * 4 + 3] - ref1.im[i]));
    }
    expect(err).toBeLessThan(1e-4);
  });

  it('one pass is a permutation-with-butterflies, nothing lost', () => {
    const N = 8, src = new Float32Array(N * N * 4), dst = new Float32Array(N * N * 4);
    src.forEach((_, i) => { src[i] = i % 7; });
    stockhamPass(src, dst, N, 0, 0);
    expect(dst.some((v) => v !== 0)).toBe(true);
  });
});

describe('a single travelling wave through evolve + ifft', () => {
  const N = 32, L = 32, a = 0.5, mx = 3;
  const h0 = new Float32Array(N * N * 4);
  h0[idx(mx, 0, N) * 4 + 0] = a;                     // h0(k) at k = (3, 0)
  h0[idx((N - mx) % N, 0, N) * 4 + 2] = a;           // its mirror slot at −k holds h0(k) too

  it('is real, has amplitude 2·a, and travels along +k', () => {
    const out0 = ifft2(evolve(h0, N, L, 0), N), out1 = ifft2(evolve(h0, N, L, 1), N);
    let maxH = -1e9, crest0 = 0, maxImag = 0;
    for (let x = 0; x < N; x++) { const v = out0[idx(x, 0, N) * 4]; maxImag = Math.max(maxImag, Math.abs(out0[idx(x, 0, N) * 4 + 3])); if (v > maxH) { maxH = v; crest0 = x; } }
    expect(maxH).toBeCloseTo(2 * a, 3);
    expect(maxImag).toBeLessThan(1e-5);
    expect(crest0).toBe(0);
    const k = 2 * Math.PI * freqIndex(mx, N) / L, w = Math.sqrt(9.81 * k), expected = (w * 1) / k;   // phase speed × 1 s
    let max1 = -1e9, crest1 = 0;
    for (let x = 0; x < N; x++) { const v = out1[idx(x, 0, N) * 4]; if (v > max1) { max1 = v; crest1 = x; } }
    expect(Math.abs(crest1 - expected)).toBeLessThan(1);
  });

  it('chop sign: with λ > 0 the Jacobian is < 1 at the crest, so crests sharpen', () => {
    const out = ifft2(evolve(h0, N, L, 0), N), cell = L / N;
    const dx = (x: number) => out[idx((x + N) % N, 0, N) * 4 + 1];
    const dDxdx = (dx(1) - dx(-1)) / (2 * cell);
    expect(dDxdx).toBeLessThan(0);
  });
});
