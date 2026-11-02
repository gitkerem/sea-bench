/**
 * The spectrum and the seeded noise in TSL — line for line the shader versions of spectrum.ts and
 * noise.ts. If you change a formula in one, change it in the other and run the tests.
 */
import { Fn, float, uint, vec2, select, max, cos, sin, sqrt, exp, pow, length, atan } from 'three/tsl';
import { G, type Cascade } from './spectrum';
import type { SeaUniforms } from './uniforms';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** 2-D spectrum for one cascade, as a node graph over the sea uniforms. Zero outside the band. */
export function spectrumTSL(kx: N, kz: N, c: Cascade, U: SeaUniforms): N {
  const kmin = 2 * Math.PI / c.lamMax, kmax = 2 * Math.PI / c.lamMin;
  const k = length(vec2(kx, kz)), ks = max(k, 1e-4), w = sqrt(ks.mul(G)), dwdk = w.mul(2).reciprocal().mul(G), th = atan(kz, kx);
  // wind sea (JONSWAP)
  const wp = pow(U.windU.mul(U.fetch).reciprocal().mul(G * G), 1 / 3).mul(22);
  const alpha = pow(U.windU.mul(U.windU).div(U.fetch.mul(G)), 0.22).mul(0.076);
  const sigma = select(w.lessThanEqual(wp), float(0.07), float(0.09)), dw = w.sub(wp);
  const r = exp(dw.mul(dw).negate().div(sigma.mul(sigma).mul(wp).mul(wp).mul(2)));
  const Sw = alpha.mul(G * G).div(pow(w, 5)).mul(exp(pow(wp.div(w), 4).mul(-1.25))).mul(pow(U.gamma, r));
  const cw = max(cos(th.sub(U.travel)), 0), Dw = pow(cw, U.spreadP).mul(U.spreadNorm);
  // swell: a narrow peak at its period, tight spread
  const ws = U.swellT.reciprocal().mul(2 * Math.PI), sw = w.sub(ws).div(ws.mul(0.12)), cs = max(cos(th.sub(U.swellDir)), 0);
  const Ss = U.swellAmp.mul(exp(sw.mul(sw).negate())).mul(pow(cs, 8));
  const S = Sw.mul(Dw).add(Ss).mul(dwdk).div(ks);
  return select(k.greaterThanEqual(kmin).and(k.lessThan(kmax)).and(k.greaterThan(1e-6)), S, float(0));
}

/** Wang hash on a u32, modular like the WGSL. */
export const wangTSL = Fn(([v]: N[]) => {
  const s = v.toVar();
  s.assign(s.bitXor(uint(61)).bitXor(s.shiftRight(uint(16))));
  s.assign(s.mul(uint(9)));
  s.assign(s.bitXor(s.shiftRight(uint(4))));
  s.assign(s.mul(uint(668265261)));
  s.assign(s.bitXor(s.shiftRight(uint(15))));
  return s;
});

export const hashfTSL = (h: N): N => h.bitAnd(uint(16777215)).add(uint(1)).toFloat().div(16777217);

/** Two unit Gaussians for grid cell (x, y); must match noise.ts gauss2(). */
export function gauss2TSL(N_: number, seed: N) {
  return Fn(([x, y]: N[]) => {
    const base = x.add(y.mul(uint(N_))).add(seed.toUint().mul(uint(7919)));
    const u1 = hashfTSL(wangTSL(base)), u2 = hashfTSL(wangTSL(base.add(uint(1013904223))));
    const r = sqrt(u1.log().mul(-2)), a = u2.mul(2 * Math.PI);
    return vec2(r.mul(cos(a)), r.mul(sin(a)));
  });
}

/** Standard FFT frequency index as a float node. */
export const freqIndexTSL = (i: N, N_: number): N => select(i.lessThan(uint(N_ / 2)), i.toFloat(), i.toFloat().sub(N_));
