/** Everything the bench's controls set. Plain numbers, so it serialises into the share URL as-is. */
export interface BenchState {
  windKn: number; fetchKm: number; spread: number; gamma: number; height: number; ripple: number;
  swellH: number; swellT: number; swellOff: number; windFrom: number; chop: number;
  sunEl: number; sunAz: number; tod: number; sunManual: boolean; glint: number; clarity: number; timeK: number;
  /** weather, each 0 … 1: cloud cover, rain, fog, lightning */
  cloud: number; rain: number; fog: number; lightning: number;
}

export const DEFAULTS: BenchState = {
  windKn: 12, fetchKm: 12, spread: 2, gamma: 3.3, height: 1, ripple: 1,
  swellH: 0, swellT: 6, swellOff: 35, windFrom: 90, chop: 1.15,
  sunEl: 37, sunAz: -100, tod: 14.5, sunManual: false, glint: 1, clarity: 1, timeK: 1,
  cloud: 0, rain: 0, fog: 0, lightning: 0,
};

export const PRESETS: Record<string, Partial<BenchState>> = {
  calm:     { windKn: 5,  fetchKm: 8,  spread: 2, gamma: 3.3, height: 1,   ripple: 1,   swellH: 0,   chop: 0.9 },
  moderate: { windKn: 12, fetchKm: 12, spread: 2, gamma: 3.3, height: 1,   ripple: 1,   swellH: 0,   chop: 1.15 },
  fresh:    { windKn: 18, fetchKm: 16, spread: 2, gamma: 3.3, height: 1,   ripple: 1.2, swellH: 0.2, chop: 1.35 },
  storm:    { windKn: 28, fetchKm: 30, spread: 3, gamma: 4.5, height: 1.1, ripple: 1.4, swellH: 0.5, chop: 1.6 },
};

/** The weather row: a few skies, each a setting of the four weather sliders. */
export const WEATHER: Record<string, Pick<BenchState, 'cloud' | 'rain' | 'fog' | 'lightning'>> = {
  clear: { cloud: 0,    rain: 0,    fog: 0,    lightning: 0 },
  rain:  { cloud: 0.9,  rain: 0.65, fog: 0.1,  lightning: 0 },
  storm: { cloud: 1,    rain: 1,    fog: 0.15, lightning: 0.7 },
  fog:   { cloud: 0.5,  rain: 0,    fog: 1,    lightning: 0 },
};

/** The weather's name if the sliders sit on one of the presets, else ''. */
export const weatherName = (s: BenchState) => Object.keys(WEATHER).find((k) => (['cloud', 'rain', 'fog', 'lightning'] as const).every((f) => Math.abs(WEATHER[k][f] - s[f]) < 0.005)) ?? '';

/** State from the URL (?p=…), or the defaults. */
export function loadState(): { state: BenchState; fromUrl: boolean } {
  const q = new URLSearchParams(location.search).get('p');
  if (!q) return { state: { ...DEFAULTS }, fromUrl: false };
  try { return { state: { ...DEFAULTS, ...JSON.parse(q) }, fromUrl: true }; } catch { return { state: { ...DEFAULTS }, fromUrl: false }; }
}

export function shareUrl(state: BenchState): string {
  return location.origin + location.pathname + '?p=' + encodeURIComponent(JSON.stringify(state));
}

export const seaWord = (hs: number) => hs < 0.1 ? 'glassy' : hs < 0.3 ? 'calm sea' : hs < 0.6 ? 'moderate sea' : hs < 1.0 ? 'fresh sea' : hs < 1.6 ? 'rough sea' : 'storm';

/** Beaufort force for a mean wind in knots, with its name: the upper edge of each force, rounded as the scale is
 *  usually printed (the dinghy simulator's table) */
const BFT_TOP = [1, 3.5, 6.5, 10.5, 16.5, 21.5, 27.5, 33.5, 40.5, 47.5];
const BFT_NAME = ['calm', 'light air', 'light', 'gentle', 'moderate', 'fresh', 'strong', 'near gale', 'gale', 'strong gale', 'storm'];
export const beaufort = (kn: number) => { const i = BFT_TOP.findIndex((top) => kn < top), n = i < 0 ? BFT_TOP.length : i; return `${n} ${BFT_NAME[n]}`; };

/** The wind blowing now over the set wind, as the dinghy simulator gusts it: three slow waves summed, about ±11 %
 *  over half a minute or so. Only the reading wanders; the sea is shaped by the set wind. */
export const gust = (t: number) => 1 + 0.12 * (Math.sin(t * 0.31) * 0.5 + Math.sin(t * 0.83 + 1) * 0.3 + Math.sin(t * 2.1 + 0.7) * 0.12);

export const compass = (d: number) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(((d % 360) + 360) % 360 / 22.5) % 16];

/** Time of day → sun: up in the east at 06:00, highest at noon, down in the west at 18:00; low and warm through the night. */
export const SUN_MAX = 62, SUN_MIN = 6, AZ_OFFSET = 42.5;
export function sunFromTod(tod: number): { el: number; az: number; below: boolean } {
  const h = ((tod % 24) + 24) % 24, raw = SUN_MAX * Math.sin((h - 6) / 12 * Math.PI);
  let az = h / 24 * 360 + AZ_OFFSET; az = ((az + 180) % 360 + 360) % 360 - 180;
  return { el: Math.round(Math.max(SUN_MIN, raw)), az: Math.round(az / 5) * 5, below: raw < SUN_MIN };
}
