/**
 * The plate. Each control writes into `state`, repaints itself, and calls back so main.ts can push
 * the change to the sea (spectrum changes are debounced; look changes are live).
 */
import type { BenchState } from './state';
import { PRESETS, sunFromTod, compass } from './state';
import { slider, dial, ring, vbar, dots, folders } from '../controls';

export const $ = (id: string) => document.getElementById(id) as HTMLElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface UIHooks {
  /** spectrum-shaping value changed (debounce, then rebuild the sea) */
  onSea: () => void;
  /** look value changed (apply now) */
  onLook: () => void;
  /** a preset or reset replaced several values at once */
  onReplace: () => void;
}

export class BenchUI {
  readonly paints: (() => void)[] = [];
  preset = 'moderate';
  paused = false;
  private rebuildTimer = 0;

  constructor(readonly state: BenchState, readonly hooks: UIHooks) {}

  // ---------- readouts
  /** Write a readout: the value dips out, changes while invisible, settles back. `animate=false` just updates. */
  tick(el: HTMLElement, text: string, animate = true): void {
    if (el.dataset.v === text) return;
    el.dataset.v = text;
    if (!animate || reduceMotion) { el.textContent = text; return; }
    const t = (el as HTMLElement & { _t?: number });
    clearTimeout(t._t); el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
    t._t = window.setTimeout(() => { el.textContent = text; }, 122);
  }

  repaintAll(): void { this.paints.forEach((p) => p()); }

  // ---------- controls (the shared plate kit; each one writes into `state` and calls back)
  private later(fn: () => void, ms: number): void { clearTimeout(this.rebuildTimer); this.rebuildTimer = window.setTimeout(fn, ms); }
  seaIn = (): void => this.later(this.hooks.onSea, 130);

  /** `state[key]` as a number the kit can read and write; a hand on a control takes the bench off its preset. */
  private num(key: keyof BenchState, onInput: () => void) {
    const S = this.state as unknown as Record<string, number>;
    return { get: () => S[key], set: (v: number) => { S[key] = v; this.preset = ''; onInput(); } };
  }

  slider(id: string, o: { label: string; min: number; max: number; step: number; key: keyof BenchState; fmt: (v: number) => string; onInput: () => void; snap?: number[] }): void {
    this.paints.push(slider(id, { ...o, ...this.num(o.key, o.onInput) }));
  }

  dial(id: string, o: { label: string; min: number; max: number; step: number; key: keyof BenchState; fmt: (v: number) => string; onInput: () => void }): void {
    this.paints.push(dial(id, { ...o, ...this.num(o.key, o.onInput) }));
  }

  /** The day on a small ring beside the two light knobs: drag the sun round it, noon at the top, in quarter hours.
   *  Turning it puts the sun back on the clock; the folder's note says where the sun is, or that it's by hand. */
  dayCircle(onChange: () => void): void {
    const S = this.state, clock = (tod: number) => `${String(Math.floor(tod)).padStart(2, '0')}:${String(Math.round((tod % 1) * 60)).padStart(2, '0')}`;
    const paintRing = ring('tod', {
      C: 32, R: 28 - 2.5 - 4, step: 3.75, fine: 3.75, text: () => clock(S.tod),
      get: () => (((S.tod / 24) * 360 + 180) % 360),
      set: (deg) => { S.tod = (Math.round((deg / 360 * 24 + 12) * 4) / 4) % 24; S.sunManual = false; this.preset = ''; onChange(); },
    });
    const paint = () => {
      paintRing();
      $('todT').textContent = clock(S.tod);
      $('todD').textContent = S.sunManual ? 'by hand' : `sun ${S.sunEl}°${sunFromTod(S.tod).below ? ' low' : ''}`;
    };
    this.paints.push(paint); paint();
  }

  /** The wind, as the dinghy's plate shows it: the bearing it comes from on a compass ring (5°, 1° with Shift), its
   *  strength on the upright bar beside it (0.5 kn, 2.5 kn with Shift), the knots in the ring's middle. */
  windRow(onInput: () => void): void {
    const S = this.state, pad3 = (d: number) => String(Math.round(d) % 360).padStart(3, '0');
    const from = (d: number) => `${pad3(d)}° ${compass(d)}`;
    const paintRing = ring('windFrom', { C: 74, R: 73 - 3 - 7, text: from, ...this.num('windFrom', onInput) });
    const paintBar = vbar('windBar', { min: 2, max: 40, step: 0.5, big: 2.5, text: (v) => v.toFixed(1) + ' kn', ...this.num('windKn', onInput) });
    // while the bar is held the middle shows the wind being set; otherwise main.ts shows the wind blowing now
    const paint = () => { paintRing(); paintBar(); if ($('windBar').classList.contains('on')) $('windKn').textContent = S.windKn.toFixed(1); $('windFromVal').textContent = from(S.windFrom); };
    // the middle follows the hand as it moves, not only on the next readout
    for (const id of ['windFrom', 'windBar']) $(id).addEventListener('pointermove', paint);
    $('windFrom').addEventListener('keydown', paint); $('windBar').addEventListener('keydown', paint);
    this.paints.push(paint); paint();
  }

  private paintPresets: () => void = () => {};
  paintPreset(): void { this.paintPresets(); }

  wireChrome(opts: { onPreset: (name: string) => void; onReset: () => void; onReseed: () => void; onPause: (p: boolean) => void; shareUrl: () => string }): void {
    folders();
    this.paintPresets = dots('segPreset', { get: () => this.preset, set: (v) => { this.preset = v; Object.assign(this.state, PRESETS[v]); opts.onPreset(v); } });
    const setPaused = (v: boolean) => { this.paused = v; $('bPause').setAttribute('aria-label', v ? 'run' : 'pause'); $('bPause').querySelector('span')!.textContent = v ? 'Run' : 'Pause'; $('bPause').classList.toggle('ink', v); $('vTime').classList.toggle('paused', v); opts.onPause(v); };
    $('bPause').addEventListener('click', () => setPaused(!this.paused));
    $('bReseed').addEventListener('click', opts.onReseed);
    $('bReset').addEventListener('click', () => { this.preset = 'moderate'; this.paintPreset(); opts.onReset(); });
    $('bShare').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(opts.shareUrl()); $('bShare').classList.add('ok'); } catch { $('bShare').classList.add('no'); }
      setTimeout(() => $('bShare').classList.remove('ok', 'no'), 1400);
    });
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.code === 'Space') { setPaused(!this.paused); e.preventDefault(); }
      if (e.key === 'r' || e.key === 'R') opts.onReseed();
    });
  }

  /** Light / dark: remembered per browser, first visit follows the system. Returns the current mode. */
  wireTheme(mq: MediaQueryList, onChange: () => void): void {
    const b = $('bTheme'), w = b.querySelector('.w')!;
    const setTheme = (mode: string) => {
      document.documentElement.setAttribute('data-theme', mode);
      try { localStorage.setItem('sea-bench-theme', mode); } catch { /* private mode */ }
      b.setAttribute('aria-checked', String(mode === 'dark')); w.textContent = mode === 'dark' ? 'Dark' : 'Light';
      onChange();
    };
    let saved: string | null = null; try { saved = localStorage.getItem('sea-bench-theme'); } catch { /* private mode */ }
    setTheme(saved === 'dark' || saved === 'light' ? saved : (mq.matches ? 'dark' : 'light'));
    b.addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
  }
}
