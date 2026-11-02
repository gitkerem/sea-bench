import { describe, it, expect } from 'vitest';
import { CASCADES, DEFAULT_SEA, jonswap, spreadNorm, spectrumK, seaStats, swellAmpForHs, travelFromCompass, type SeaParams } from '../src/sea/spectrum';
import { gauss2, wang } from '../src/sea/noise';
import { buildComponents, heightAt } from '../src/sea/sea-cpu';

describe('spectrum', () => {
  it('spread normalisation has the exact closed forms', () => {
    expect(spreadNorm(1)).toBeCloseTo(1 / 2, 4);
    expect(spreadNorm(2)).toBeCloseTo(2 / Math.PI, 4);
    expect(spreadNorm(3)).toBeCloseTo(3 / 4, 4);
  });
  it('JONSWAP peaks near ωp', () => {
    const U = 8, F = 12000, wp = 22 * Math.pow(9.81 * 9.81 / (U * F), 1 / 3);
    expect(jonswap(wp, U, F, 3.3)).toBeGreaterThan(jonswap(wp * 1.4, U, F, 3.3));
    expect(jonswap(wp, U, F, 3.3)).toBeGreaterThan(jonswap(wp * 0.7, U, F, 3.3));
  });
  it('is zero outside a cascade band and downwind only', () => {
    const p: SeaParams = { ...DEFAULT_SEA, travel: 0 };
    expect(spectrumK(2 * Math.PI / 0.5, 0, CASCADES[0], p)).toBe(0);     // 0.5 m is not in the 6 m+ cascade
    expect(spectrumK(-0.8, 0, CASCADES[0], p)).toBe(0);                  // upwind
    expect(spectrumK(0.8, 0, CASCADES[0], p)).toBeGreaterThan(0);        // downwind
  });
  it('a 12 kn sea on 12 km of fetch is about half a metre; height scale is linear', () => {
    const p: SeaParams = { ...DEFAULT_SEA, windU: 12 * 0.5144, fetch: 12000 };
    const s = seaStats(p, 64), s2 = seaStats({ ...p, ampScale: 2 }, 64);
    expect(s.hs).toBeGreaterThan(0.3); expect(s.hs).toBeLessThan(0.6);
    expect(s2.hs / s.hs).toBeCloseTo(2, 6);
    expect(s.tp).toBeGreaterThan(2); expect(s.tp).toBeLessThan(3.2);
  });
  it('swell calibrates to the asked height, independent of ampScale', () => {
    const base: SeaParams = { ...DEFAULT_SEA, windU: 6, ampScale: 1.3, swellT: 6, swellDir: 0.6 };
    const unit = seaStats({ ...base, swellAmp: 1 }, 64);
    const amp = swellAmpForHs(0.4, unit, base.ampScale);
    expect(seaStats({ ...base, swellAmp: amp }, 64).hsSwell).toBeCloseTo(0.4, 2);
  });
  it('compass → travel: wind from the north sends waves toward +z', () => {
    const t = travelFromCompass(0);
    expect(Math.cos(t)).toBeCloseTo(0, 6); expect(Math.sin(t)).toBeCloseTo(1, 6);
  });
});

describe('seeded noise', () => {
  it('is deterministic and unit-variance-ish', () => {
    expect(wang(123)).toBe(wang(123));
    expect(gauss2(3, 4, 128, 1)).toEqual(gauss2(3, 4, 128, 1));
    let s = 0, s2 = 0, n = 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const [a, b] = gauss2(x, y, 64, 9); s += a + b; s2 += a * a + b * b; n += 2; }
    expect(Math.abs(s / n)).toBeLessThan(0.05);
    expect(s2 / n).toBeGreaterThan(0.9); expect(s2 / n).toBeLessThan(1.1);
  });
});

describe('CPU sampler', () => {
  it('gives heights of the right size, and is smooth', () => {
    const p: SeaParams = { ...DEFAULT_SEA, windU: 12 * 0.5144 };
    const comps = buildComponents(p, 128, CASCADES.slice(0, 2), 1, 140);
    expect(comps.length).toBe(280);
    let maxH = 0, sum2 = 0, n = 0;
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) { const h = heightAt(comps, x * 1.3, z * 1.3, 3.0); maxH = Math.max(maxH, Math.abs(h)); sum2 += h * h; n++; }
    const hsSampled = 4 * Math.sqrt(sum2 / n), hs = seaStats(p, 128).hs;
    expect(maxH).toBeLessThan(hs * 1.6);
    expect(hsSampled).toBeGreaterThan(hs * 0.5);      // the strongest 140 pairs carry most of the energy
    const h0 = heightAt(comps, 1, 1, 2), h1 = heightAt(comps, 1.01, 1, 2);
    expect(Math.abs(h1 - h0)).toBeLessThan(0.02);
  });
});
