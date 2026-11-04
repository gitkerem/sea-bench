/**
 * The plate's controls, shared by the sea bench and the dinghy simulator: folders, sliders on a tick scale with a
 * round knob, dots, switches, buttons, a knob dial, a ring you drag a dot round and an upright bar. Each control owns no state: it
 * reads through `get`, writes through `set`, and returns a `paint` to call when the value changed elsewhere. Labels
 * come in as plain text, so an app can run them through its own translations. Hand-written DOM, styled by
 * controls.css from the tokens in tokens.css.
 */
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const el = (host: HTMLElement | string) => (typeof host === 'string' ? document.getElementById(host)! : host);

export type Paint = () => void;

export interface SliderOpts {
  label: string; min: number; max: number; step: number;
  get: () => number; set: (v: number) => void; fmt: (v: number) => string;
  /** how many evenly spaced scale ticks (default 5); ignored when `snap` is given */
  marks?: number;
  /** values the knob snaps to; the ticks sit on them */
  snap?: number[];
}

/** A slider: a hairline track on a scale of ticks, a round black knob that grows while held; a real range input
 *  underneath for keys and screen readers. Replaces the placeholder `host`, keeping its id and classes. */
export function slider(host: HTMLElement | string, o: SliderOpts): Paint {
  const ph = el(host), id = ph.id, cls = ph.className, pos = (f: number) => `calc(1px + (100% - 2px) * ${f})`;
  const n = o.marks ?? 5, at = o.snap ? o.snap.map((v) => (v - o.min) / (o.max - o.min)) : Array.from({ length: n }, (_, i) => i / (n - 1));
  const mk = at.map((f) => `<div class="mk" style="left:${pos(f)}"></div>`).join('');
  const s = document.createElement('label');
  s.className = `slider ${cls}`.trim(); if (id) s.id = id;
  s.innerHTML = `<div class="top"><span class="lab"></span><span class="val"></span></div><div class="track"></div>${mk}<div class="knob"></div><input type="range" min="${o.min}" max="${o.max}" step="${o.step}">`;
  ph.replaceWith(s);
  const inp = s.querySelector('input')!, knob = s.querySelector<HTMLElement>('.knob')!, val = s.querySelector('.val')!;
  if (id) inp.id = `${id}-in`;
  s.querySelector('.lab')!.textContent = o.label; inp.setAttribute('aria-label', o.label);
  const paint = () => { const v = o.get(); inp.value = String(v); knob.style.left = pos(clamp((v - o.min) / (o.max - o.min), 0, 1)); val.textContent = o.fmt(v); };
  inp.addEventListener('input', () => {
    let v = +inp.value;
    if (o.snap) v = o.snap.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
    o.set(v); paint();
  });
  inp.addEventListener('pointerdown', () => s.classList.add('on'));
  addEventListener('pointerup', () => s.classList.remove('on'));
  paint();
  return paint;
}

export interface DialOpts { label: string; min: number; max: number; step: number; get: () => number; set: (v: number) => void; fmt: (v: number) => string }

/** A knob: a black disc with a hand on a dotted scale that sweeps 270°. Drag round it, or up and down over it;
 *  arrow keys when focused. Replaces the placeholder `host`. */
export function dial(host: HTMLElement | string, o: DialOpts): Paint {
  const ph = el(host), C = 29, R = 26;
  const dots = Array.from({ length: 13 }, (_, i) => { const a = (-135 + i * 22.5) * D2R; return `<circle cx="${(C + Math.sin(a) * R).toFixed(1)}" cy="${(C - Math.cos(a) * R).toFixed(1)}" r="${i % 4 === 0 ? 1.5 : 0.9}" fill="currentColor"/>`; }).join('');
  const d = document.createElement('div');
  d.className = `dial ${ph.className}`.trim(); if (ph.id) d.id = ph.id;
  d.innerHTML = `<svg viewBox="0 0 58 58" aria-hidden="true">${dots}<circle class="disc" cx="${C}" cy="${C}" r="18"/><line class="hand" x1="${C}" y1="${C}" x2="${C}" y2="${C - 15}"/></svg><span class="lab"></span><span class="val"></span><input type="range" min="${o.min}" max="${o.max}" step="${o.step}">`;
  ph.replaceWith(d);
  const svg = d.querySelector('svg')!, hand = d.querySelector<SVGElement>('.hand')!, val = d.querySelector('.val')!, inp = d.querySelector('input')!;
  d.querySelector('.lab')!.textContent = o.label; inp.setAttribute('aria-label', o.label);
  const paint = () => { const v = o.get(), f = (v - o.min) / (o.max - o.min); hand.style.transform = `rotate(${-135 + f * 270}deg)`; val.textContent = o.fmt(v); inp.value = String(v); };
  const setFrom = (f: number) => {
    const v = +(Math.round((o.min + clamp(f, 0, 1) * (o.max - o.min)) / o.step) * o.step).toFixed(4);
    if (v !== o.get()) { o.set(v); paint(); }
  };
  // near the middle a drag up and down turns it; further out, the hand follows the pointer round
  let drag: { cx: number; cy: number; y0: number; f0: number } | null = null;
  svg.addEventListener('pointerdown', (e) => { const r = svg.getBoundingClientRect(); drag = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, y0: e.clientY, f0: (o.get() - o.min) / (o.max - o.min) }; svg.setPointerCapture(e.pointerId); d.classList.add('on'); e.preventDefault(); });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.cx, dy = e.clientY - drag.cy;
    if (Math.hypot(dx, dy) > 14) setFrom((clamp(Math.atan2(dx, -dy) * R2D, -135, 135) + 135) / 270);
    else setFrom(drag.f0 + (drag.y0 - e.clientY) / 150);
  });
  const end = () => { drag = null; d.classList.remove('on'); };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  d.addEventListener('click', () => inp.focus({ preventScroll: true }));
  inp.addEventListener('input', () => { o.set(+inp.value); paint(); });
  paint();
  return paint;
}

/** Press, then drag, on a control: `at` takes each pointer position while the button is held. */
export function dragOn(target: Element, at: (e: PointerEvent) => void): void {
  let on = false;
  const end = () => { on = false; target.classList.remove('on'); };
  target.addEventListener('pointerdown', (e) => { const p = e as PointerEvent; on = true; target.setPointerCapture(p.pointerId); target.classList.add('on'); at(p); p.preventDefault(); (target as HTMLElement).focus({ preventScroll: true }); });
  // a move with no button down means the release went missing: let go rather than keep changing the value
  target.addEventListener('pointermove', (e) => { if (!on) return; if (!(e as PointerEvent).buttons) end(); else at(e as PointerEvent); });
  target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end); target.addEventListener('lostpointercapture', end);
}

/** Arrow keys on a focused control: +1 for up/right, -1 for down/left. They stop there, so a page that uses the
 *  arrows for something else (steering) doesn't also get them. */
export function keysOn(target: Element, by: (dir: number, shift: boolean) => void): void {
  target.addEventListener('keydown', (e) => {
    const k = e as KeyboardEvent, dir = k.key === 'ArrowRight' || k.key === 'ArrowUp' ? 1 : k.key === 'ArrowLeft' || k.key === 'ArrowDown' ? -1 : 0;
    if (!dir) return;
    by(dir, k.shiftKey); k.preventDefault(); k.stopPropagation();
  });
}

export interface RingOpts {
  /** the svg's centre and the radius the dot runs on, in its viewBox units */
  C: number; R: number;
  /** the value as a bearing: 0° at the top, clockwise */
  get: () => number; set: (deg: number) => void;
  /** degrees per drag step and per arrow key; Shift takes `fine` */
  step?: number; fine?: number;
  /** what a screen reader hears for the value */
  text?: (deg: number) => string;
}

/** A ring you drag a dot round: a compass, a day. `host` is the focusable element (role="slider") holding an svg
 *  with a `.dot`; drag anywhere on it, or use the arrow keys. The middle is the app's to fill. */
export function ring(host: HTMLElement | string, o: RingOpts): Paint {
  const r = el(host), dot = r.querySelector('.dot')!, step = o.step ?? 5, fine = o.fine ?? 1;
  const wrap = (d: number) => ((d % 360) + 360) % 360;
  const paint = () => {
    const d = o.get(), a = d * D2R;
    dot.setAttribute('cx', (o.C + Math.sin(a) * o.R).toFixed(2)); dot.setAttribute('cy', (o.C - Math.cos(a) * o.R).toFixed(2));
    r.setAttribute('aria-valuenow', String(Math.round(d)));
    if (o.text) r.setAttribute('aria-valuetext', o.text(d));
  };
  const to = (d: number) => { d = wrap(+(Math.round(d / fine) * fine).toFixed(4)); if (d !== o.get()) { o.set(d); paint(); } };
  dragOn(r, (e) => { const b = r.getBoundingClientRect(); to(Math.round(Math.atan2(e.clientX - b.left - b.width / 2, b.top + b.height / 2 - e.clientY) * R2D / step) * step); });
  keysOn(r, (dir, shift) => to(o.get() + dir * (shift ? fine : step)));
  r.setAttribute('aria-valuemin', '0'); r.setAttribute('aria-valuemax', '359');
  paint();
  return paint;
}

export interface BarOpts {
  min: number; max: number;
  get: () => number; set: (v: number) => void;
  /** the drag's step and an arrow key's; Shift takes `big` */
  step: number; big?: number;
  text?: (v: number) => string;
}

/** An upright bar filled from the bottom, for a strength (the wind's): press or drag anywhere on it; arrow keys when
 *  focused. `host` is the focusable element (role="slider") holding `.in > .fill`. */
export function vbar(host: HTMLElement | string, o: BarOpts): Paint {
  const b = el(host), fill = b.querySelector<HTMLElement>('.fill')!, big = o.big ?? o.step * 5;
  const paint = () => {
    const v = o.get(); fill.style.height = (clamp((v - o.min) / (o.max - o.min), 0, 1) * 100) + '%';
    b.setAttribute('aria-valuenow', String(v)); if (o.text) b.setAttribute('aria-valuetext', o.text(v));
  };
  const to = (v: number) => { v = clamp(+(Math.round(v / o.step) * o.step).toFixed(4), o.min, o.max); if (v !== o.get()) { o.set(v); paint(); } };
  dragOn(b, (e) => { const r = b.getBoundingClientRect(); to(o.min + (r.bottom - 3 - e.clientY) / (r.height - 6) * (o.max - o.min)); });
  keysOn(b, (dir, shift) => to(o.get() + dir * (shift ? big : o.step)));
  b.setAttribute('aria-valuemin', String(o.min)); b.setAttribute('aria-valuemax', String(o.max));
  paint();
  return paint;
}

/** Dots: one of a few, as round buttons. Each button carries its value in `data-v`; the pressed one is filled. */
export function dots(host: HTMLElement | string, o: { get: () => string; set: (v: string) => void }): Paint {
  const n = el(host);
  const paint = () => n.querySelectorAll<HTMLElement>('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === o.get())));
  n.addEventListener('click', (e) => { const b = (e.target as Element).closest<HTMLElement>('button'); if (!b || !n.contains(b)) return; o.set(b.dataset.v!); paint(); });
  paint();
  return paint;
}

/** A switch: a button with role="switch" whose aria-checked follows the value. */
export function toggle(host: HTMLElement | string, o: { get: () => boolean; set: (v: boolean) => void }): Paint {
  const b = el(host);
  const paint = () => b.setAttribute('aria-checked', String(o.get()));
  b.addEventListener('click', () => { o.set(!o.get()); paint(); });
  paint();
  return paint;
}

/** Folders open and close from their header (`.fh`), everywhere under `root`. */
export function folders(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.folder > .fh').forEach((h) => h.addEventListener('click', () => {
    const f = h.parentElement!; f.classList.toggle('closed'); h.setAttribute('aria-expanded', String(!f.classList.contains('closed')));
  }));
}
