/**
 * The plate. Each control writes into `state`, repaints itself, and calls back so main.ts can push
 * the change to the sea (spectrum changes are debounced; look changes are live).
 */
import type { BenchState } from './state';
import { PRESETS, sunFromTod } from './state';

export const $ = (id: string) => document.getElementById(id) as HTMLElement;
const D2R = Math.PI / 180;
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

  // ---------- controls
  private later(fn: () => void, ms: number): void { clearTimeout(this.rebuildTimer); this.rebuildTimer = window.setTimeout(fn, ms); }
  seaIn = (): void => this.later(this.hooks.onSea, 130);

  slider(id: string, o: { label: string; min: number; max: number; step: number; key: keyof BenchState; fmt: (v: number) => string; onInput: () => void; snap?: number[] }): void {
    const S = this.state, host = $(id), pos = (t: number) => `calc(1px + (100% - 2px) * ${t})`;
    const mk = (o.snap || []).map((v) => `<div class="mk" style="left:${pos((v - o.min) / (o.max - o.min))}"></div>`).join('');
    host.outerHTML = `<label class="slider" id="${id}"><div class="top"><span class="lab">${o.label}</span><span class="val"></span></div><div class="track"></div>${mk}<div class="knob"></div><input type="range" min="${o.min}" max="${o.max}" step="${o.step}" aria-label="${o.label}"></label>`;
    const el = $(id), inp = el.querySelector('input')!, knob = el.querySelector<HTMLElement>('.knob')!, val = el.querySelector('.val')!;
    const paint = () => { const v = S[o.key] as number; inp.value = String(v); knob.style.left = pos((v - o.min) / (o.max - o.min)); val.textContent = o.fmt(v); };
    inp.addEventListener('input', () => {
      let v = +inp.value;
      if (o.snap) v = o.snap.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
      (S as unknown as Record<string, number>)[o.key] = v; this.preset = ''; paint(); o.onInput();
    });
    inp.addEventListener('pointerdown', () => el.classList.add('on'));
    addEventListener('pointerup', () => el.classList.remove('on'));
    this.paints.push(paint); paint();
  }

  /** A knob: drag around it or up and down over it; arrow keys when focused; the hand sweeps 270°. */
  dial(id: string, o: { label: string; min: number; max: number; step: number; key: keyof BenchState; fmt: (v: number) => string; onInput: () => void }): void {
    const S = this.state, host = $(id), C = 29, R = 26;
    const dots = Array.from({ length: 13 }, (_, i) => { const a = (-135 + i * 22.5) * D2R; return `<circle cx="${(C + Math.sin(a) * R).toFixed(1)}" cy="${(C - Math.cos(a) * R).toFixed(1)}" r="${i % 4 === 0 ? 1.5 : 0.9}" fill="currentColor"/>`; }).join('');
    host.outerHTML = `<div class="dial" id="${id}"><svg viewBox="0 0 58 58" aria-hidden="true">${dots}<circle class="disc" cx="${C}" cy="${C}" r="18"/><line class="hand" x1="${C}" y1="${C}" x2="${C}" y2="${C - 15}"/></svg><span class="lab">${o.label}</span><span class="val"></span><input type="range" min="${o.min}" max="${o.max}" step="${o.step}" aria-label="${o.label}"></div>`;
    const el = $(id), svg = el.querySelector('svg')!, hand = el.querySelector<SVGElement>('.hand')!, val = el.querySelector('.val')!, inp = el.querySelector('input')!;
    const get = () => S[o.key] as number;
    const paint = () => { const v = get(), t = (v - o.min) / (o.max - o.min); hand.style.transform = `rotate(${-135 + t * 270}deg)`; val.textContent = o.fmt(v); inp.value = String(v); };
    const setFrom = (t: number) => {
      let v = o.min + Math.max(0, Math.min(1, t)) * (o.max - o.min); v = +(Math.round(v / o.step) * o.step).toFixed(4);
      if (v !== get()) { (S as unknown as Record<string, number>)[o.key] = v; this.preset = ''; paint(); o.onInput(); }
    };
    let drag: { cx: number; cy: number; y0: number; t0: number } | null = null;
    svg.addEventListener('pointerdown', (e) => { const r = svg.getBoundingClientRect(); drag = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, y0: e.clientY, t0: (get() - o.min) / (o.max - o.min) }; svg.setPointerCapture(e.pointerId); el.classList.add('on'); e.preventDefault(); });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.cx, dy = e.clientY - drag.cy;
      if (Math.hypot(dx, dy) > 14) { let a = Math.atan2(dx, -dy) / D2R; a = Math.max(-135, Math.min(135, a)); setFrom((a + 135) / 270); }
      else setFrom(drag.t0 + (drag.y0 - e.clientY) / 150);
    });
    const end = () => { drag = null; el.classList.remove('on'); };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    el.addEventListener('click', () => inp.focus({ preventScroll: true }));
    inp.addEventListener('input', () => { (S as unknown as Record<string, number>)[o.key] = +inp.value; this.preset = ''; paint(); o.onInput(); });
    this.paints.push(paint); paint();
  }

  /** The day circle: drag the sun round it; noon at the top. */
  dayCircle(onChange: () => void): void {
    const S = this.state, el = $('tod'), svg = el.querySelector('svg')!, dot = $('todDot'), tT = $('todT'), tD = $('todD'), C = 64, R = 49.5;
    const paint = () => {
      const a = S.tod / 24 * 2 * Math.PI - Math.PI;
      dot.setAttribute('cx', (C + Math.sin(a) * R).toFixed(2)); dot.setAttribute('cy', (C - Math.cos(a) * R).toFixed(2));
      const hh = String(Math.floor(S.tod)).padStart(2, '0'), mm = String(Math.round((S.tod % 1) * 60)).padStart(2, '0');
      tT.textContent = `${hh}:${mm}`; tD.textContent = S.sunManual ? 'manual' : `sun ${S.sunEl}°${sunFromTod(S.tod).below ? ' low' : ''}`;
    };
    let on = false;
    const set = (e: PointerEvent) => {
      const b = svg.getBoundingClientRect(), dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height / 2);
      let t = (Math.atan2(dx, -dy) + Math.PI) / (2 * Math.PI) * 24; t = (Math.round(t * 4) / 4) % 24;
      if (t !== S.tod || S.sunManual) { S.tod = t; S.sunManual = false; this.preset = ''; onChange(); }
    };
    svg.addEventListener('pointerdown', (e) => { on = true; svg.setPointerCapture(e.pointerId); el.classList.add('on'); set(e); e.preventDefault(); });
    svg.addEventListener('pointermove', (e) => { if (on) set(e); });
    const end = () => { on = false; el.classList.remove('on'); };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    this.paints.push(paint); paint();
  }

  paintSunMode(): void { $('segSun').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String((x.dataset.m === 'manual') === !!this.state.sunManual))); }
  paintPreset(): void { $('segPreset').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.p === this.preset))); }

  /** The fine-tune plate opens over the panel, anchored to its button; a click anywhere else closes it. */
  setDialog(open: boolean): void {
    const d = $('lightDlg'), b = $('bLight');
    if (open) {
      const r = b.getBoundingClientRect();
      d.style.right = Math.max(12, window.innerWidth - r.right) + 'px';
      d.style.top = Math.max(12, Math.min(r.top - 8, window.innerHeight - d.offsetHeight - 12)) + 'px';
    }
    d.classList.toggle('open', open); b.setAttribute('aria-expanded', String(open));
  }

  wireChrome(opts: { onPreset: (name: string) => void; onReset: () => void; onReseed: () => void; onPause: (p: boolean) => void; shareUrl: () => string; onSunMode: () => void }): void {
    document.querySelectorAll<HTMLElement>('.fh').forEach((h) => h.addEventListener('click', () => { const f = h.closest('.folder')!; f.classList.toggle('closed'); h.setAttribute('aria-expanded', String(!f.classList.contains('closed'))); }));
    $('segPreset').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (!b) return; this.preset = b.dataset.p!; Object.assign(this.state, PRESETS[this.preset]); this.paintPreset(); opts.onPreset(this.preset); });
    $('segSun').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (!b) return; this.state.sunManual = b.dataset.m === 'manual'; this.paintSunMode(); opts.onSunMode(); });
    document.addEventListener('pointerdown', (e) => { if ($('lightDlg').classList.contains('open') && !(e.target as HTMLElement).closest('#lightDlg, #bLight')) this.setDialog(false); });
    $('bLight').addEventListener('click', () => this.setDialog(!$('lightDlg').classList.contains('open')));
    $('bLightClose').addEventListener('click', () => this.setDialog(false));
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
      if (e.key === 'Escape') this.setDialog(false);
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
