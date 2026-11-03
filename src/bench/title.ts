/**
 * The title types itself on. The name comes in left to right, each letter flickering through a few dim glyphs
 * before it settles. Then the block stops at the version as if it has to recall it: one cell counts quietly
 * through digits, and the version is typed out. The block blinks twice and goes. Under two seconds, then
 * still. With reduced motion it is simply there.
 */
const GLYPHS = '01/\\<>=+*#:_', DIGITS = '0123456789';
const STAGGER = 55, SETTLE = 150, FRAME = 40;
const PAUSE = 140;      // the beat after the name, before the version is looked up
const THINK = 760;      // how long the first version cell counts
const COUNT = 76;       // one digit per count: slower than the flicker, so it reads as counting, not noise
const V_STAGGER = 80;   // the version types a touch slower than the name

interface Cell { el: HTMLSpanElement; ch: string; appear: number; start: number; think?: number; cls?: string }

export function typeTitle(el: HTMLElement) {
  const v = el.querySelector('.v');
  const name = (v ? el.firstChild?.textContent ?? '' : el.textContent ?? '').trimEnd();
  const version = v?.textContent ?? '';
  const text = version ? `${name} ${version}` : name;
  if (!text || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.setAttribute('aria-label', text);

  const span = () => { const s = document.createElement('span'); s.setAttribute('aria-hidden', 'true'); return s; };
  const cells: Cell[] = [...name].map((ch, i) => ({ el: span(), ch, appear: i * STAGGER, start: i * STAGGER }));
  const nameEnd = (name.length - 1) * STAGGER + SETTLE;
  if (version) {
    cells.push({ el: span(), ch: ' ', appear: nameEnd, start: nameEnd });
    const t1 = nameEnd + PAUSE, t2 = t1 + THINK;
    [...version].forEach((ch, j) => cells.push({ el: span(), ch, appear: j ? t2 + j * V_STAGGER : t1, start: t2 + j * V_STAGGER, think: j ? undefined : t1, cls: 'v' }));
  }
  const end = Math.max(...cells.map((c) => c.start + SETTLE));
  const cur = span();
  cur.className = 'cur';
  el.replaceChildren(...cells.map((c) => c.el), cur);

  // start once the mono face is in (or soon anyway), so the letters don't change width mid-type
  const fontIn = document.fonts?.load('400 14px "Space Mono"').catch(() => {}) ?? Promise.resolve();
  Promise.race([fontIn, new Promise((r) => setTimeout(r, 400))]).then(() => {
    const t0 = performance.now();
    let last = -FRAME;
    // the version only turns red as each cell lands; while it counts or flickers it stays dim like the rest
    const show = (c: Cell, ch: string, dim: boolean) => { if (c.el.textContent !== ch) c.el.textContent = ch; c.el.className = dim ? 'g' : c.cls ?? ''; };
    const step = (now: number) => {
      const t = now - t0;
      const swap = t - last >= FRAME;
      if (swap) last = t;
      let head = 0;
      for (const [i, c] of cells.entries()) {
        if (t < c.appear) { show(c, '', false); continue; }
        head = i + 1;
        if (c.ch === ' ' || t >= c.start + SETTLE) show(c, c.ch, false);
        else if (c.think !== undefined && t < c.start) show(c, DIGITS[Math.floor((t - c.think) / COUNT) % 10]!, true);
        else if (swap || !c.el.textContent) {
          const pool = /\d/.test(c.ch) ? DIGITS : GLYPHS;
          show(c, pool[(Math.random() * pool.length) | 0]!, true);
        }
      }
      // the block sits just past the last cell that has appeared
      el.insertBefore(cur, cells[head]?.el ?? null);
      if (t < end) { requestAnimationFrame(step); return; }
      el.appendChild(cur);
      cur.classList.add('blink');
      cur.addEventListener('animationend', () => { cur.classList.add('gone'); setTimeout(() => cur.remove(), 300); }, { once: true });
    };
    requestAnimationFrame(step);
  });
}
