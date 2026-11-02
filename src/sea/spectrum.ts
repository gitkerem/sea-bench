/**
 * The wave spectrum, in plain numbers. Everything here has a twin in kernels.ts written in TSL;
 * the two must stay in step, because the CPU sampler (sea-cpu.ts) and the GPU sea are seeded
 * from the same formulas. test/spectrum.test.ts pins the numbers.
 */

export const G = 9.81;

/** One FFT patch. Three of them tile the sea at different scales; each owns a band of wavelengths so nothing is counted twice. */
export interface Cascade {
  /** patch size in metres (the texture repeats every L) */
  L: number;
  /** shortest wavelength this cascade carries, metres (inclusive) */
  lamMin: number;
  /** longest wavelength this cascade carries, metres (exclusive) */
  lamMax: number;
}

/** The default three cascades: swell and wind sea, chop, ripples. Nyquist of the finest is ~4 cm. */
export const CASCADES: Cascade[] = [
  { L: 96, lamMin: 6, lamMax: 1e6 },
  { L: 16, lamMin: 1, lamMax: 6 },
  { L: 2.7, lamMin: 0.17, lamMax: 1 },
];

/** What shapes the sea. Angles are radians in the xz plane: the direction the waves travel toward (atan2(z, x)). */
export interface SeaParams {
  /** wind speed at 10 m, m/s */
  windU: number;
  /** fetch, metres */
  fetch: number;
  /** direction the wind sea travels toward */
  travel: number;
  /** directional spread exponent p in cos^p; 2 is the textbook value, higher = longer crests */
  spreadP: number;
  /** JONSWAP peak enhancement γ (3.3 textbook) */
  gamma: number;
  /** swell energy scale (0 = none); calibrate with swellAmpForHs() */
  swellAmp: number;
  /** swell peak period, seconds */
  swellT: number;
  /** direction the swell travels toward */
  swellDir: number;
  /** multiplies every amplitude (1 = physical) */
  ampScale: number;
  /** multiplies the finest cascade only */
  ripple: number;
}

export const DEFAULT_SEA: SeaParams = {
  windU: 6, fetch: 12000, travel: 0, spreadP: 2, gamma: 3.3,
  swellAmp: 0, swellT: 6, swellDir: 0.6, ampScale: 1, ripple: 1,
};

/** JONSWAP frequency spectrum S(ω) for a fetch-limited sea. */
export function jonswap(w: number, U: number, F: number, gamma: number): number {
  const wp = 22 * Math.pow(G * G / (U * F), 1 / 3);
  const alpha = 0.076 * Math.pow(U * U / (F * G), 0.22);
  const sigma = w <= wp ? 0.07 : 0.09;
  const r = Math.exp(-((w - wp) ** 2) / (2 * sigma * sigma * wp * wp));
  return alpha * G * G / Math.pow(w, 5) * Math.exp(-1.25 * Math.pow(wp / w, 4)) * Math.pow(gamma, r);
}

/** Peak angular frequency of the wind sea. */
export function peakOmega(U: number, F: number): number {
  return 22 * Math.pow(G * G / (U * F), 1 / 3);
}

/** 1 / ∫ cos^p θ dθ over the half circle, so a narrower spread keeps the same total energy. */
export function spreadNorm(p: number, n = 400): number {
  let s = 0;
  for (let i = 0; i < n; i++) { const th = -Math.PI / 2 + (i + 0.5) * Math.PI / n; s += Math.pow(Math.cos(th), p); }
  return 1 / (s * Math.PI / n);
}

/**
 * Two-dimensional spectrum S(kx, kz) for one cascade: JONSWAP wind sea with a cos^p spread,
 * plus a narrow swell peak, both mapped from (ω, θ) to k-space. Zero outside the cascade's band.
 */
export function spectrumK(kx: number, kz: number, c: Cascade, p: SeaParams, norm = spreadNorm(p.spreadP)): number {
  const kmin = 2 * Math.PI / c.lamMax, kmax = 2 * Math.PI / c.lamMin, k = Math.hypot(kx, kz);
  if (k < 1e-6 || k < kmin || k >= kmax) return 0;
  const w = Math.sqrt(G * k), dwdk = G / (2 * w), th = Math.atan2(kz, kx);
  const cw = Math.max(Math.cos(th - p.travel), 0);
  let S = jonswap(w, p.windU, p.fetch, p.gamma) * Math.pow(cw, p.spreadP) * norm;
  if (p.swellAmp > 0) {
    const ws = 2 * Math.PI / p.swellT, cs = Math.max(Math.cos(th - p.swellDir), 0);
    S += p.swellAmp * Math.exp(-(((w - ws) / (0.12 * ws)) ** 2)) * Math.pow(cs, 8);
  }
  return S * dwdk / k;
}

export interface SeaStats {
  /** significant wave height of the wind sea, metres (ampScale applied) */
  hs: number;
  /** significant wave height of the swell, metres (ampScale applied) */
  hsSwell: number;
  /** peak period of the wind sea, seconds */
  tp: number;
  /** peak wavelength, metres */
  lambdaP: number;
  /** raw swell variance for swellAmp = 1 (before ampScale); used to calibrate a swell height */
  m0SwellUnit: number;
}

/** Sum the spectrum over the FFT grids exactly as the GPU seeds them, and report what the sea will measure. */
export function seaStats(p: SeaParams, N: number, cascades: Cascade[] = CASCADES): SeaStats {
  const norm = spreadNorm(p.spreadP), half = N / 2;
  let m0 = 0, m0s = 0;
  const noSwell = { ...p, swellAmp: 0 }, unitSwell = { ...p, swellAmp: 1 };
  for (const c of cascades) {
    const dk = 2 * Math.PI / c.L;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const nx = x < half ? x : x - N, ny = y < half ? y : y - N, kx = nx * dk, kz = ny * dk;
      const sea = spectrumK(kx, kz, c, noSwell, norm);
      if (sea > 0) m0 += sea * dk * dk;
      // the swell's own variance, for a unit swellAmp
      const both = spectrumK(kx, kz, c, unitSwell, norm);
      if (both > sea) m0s += (both - sea) * dk * dk;
    }
  }
  const tp = 2 * Math.PI / peakOmega(p.windU, p.fetch);
  return {
    hs: 4 * Math.sqrt(m0) * p.ampScale,
    hsSwell: 4 * Math.sqrt(m0s * p.swellAmp) * p.ampScale,
    tp,
    lambdaP: G * tp * tp / (2 * Math.PI),
    m0SwellUnit: m0s,
  };
}

/** The swellAmp that makes the swell measure `hs` metres, independent of ampScale. */
export function swellAmpForHs(hs: number, stats: SeaStats, ampScale: number): number {
  if (hs <= 0.01) return 0;
  return (hs / 4) ** 2 / Math.max(stats.m0SwellUnit, 1e-9) / (ampScale * ampScale);
}

/** Compass "wind from" (degrees, 0 = north = −z, 90 = east = +x) → the travel angle used above. */
export function travelFromCompass(fromDeg: number): number {
  const d = (fromDeg + 180) * Math.PI / 180;
  return Math.atan2(-Math.cos(d), Math.sin(d));
}
