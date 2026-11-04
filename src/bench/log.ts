/**
 * The change log, a side drawer. Its button waits beside the version in the title and slides in when you hover it.
 * Opening it eases the whole bench back (a CSS scale, nothing re-rendered) while the drawer slides in from the left.
 * Inside, one readable column: filters for version, kind and the small changes, a timeline strip you can click,
 * then the changes newest first, release by release, each release's head pinned while you read it. Releases are
 * the git tags (v0.5.2); the filter and the strip group them by minor series (v0.5) so they stay legible.
 */
import { ENTRIES, REPO, VERSIONS, series, show, type Kind } from './changelog';
import { dots, toggle } from '../controls';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KINDS: Kind[] = ['new', 'improved', 'fixed', 'system'];
const KIND: Record<Kind, string> = { new: 'New', improved: 'Improved', fixed: 'Fixed', system: 'System' };
/** `2026-11-03T17:35` → `Nov 3, 17:35`, read as written */
const stamp = (at: string) => `${day(at)}, ${at.slice(11, 16)}`;
const day = (at: string) => `${MON[+at.slice(5, 7) - 1]} ${+at.slice(8, 10)}`;

/** a version as it reads, its dots drawn narrow: in a mono face a full-width dot opens a gap either side */
const ver = (id: string) => { const s = document.createElement('span'); s.className = 'vtx'; s.innerHTML = show(id).replace(/\./g, '<i class="pt">.</i>'); return s; };

type Attrs = Record<string, string | undefined>;
function h(tag: string, attrs: Attrs | null = null, ...kids: (Node | string | null | undefined)[]): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) if (v !== undefined) e.setAttribute(k, v);
  for (const c of kids) if (c != null) e.append(c);
  return e;
}

export function createLog(): void {
  const btn = document.getElementById('bLog')!, drawer = document.getElementById('log')!, scrim = document.getElementById('logScrim')!, page = document.getElementById('page')!;
  // numbered oldest first, so a change keeps its number as the log grows
  const all = ENTRIES.map((e, i) => ({ ...e, n: i + 1 }));
  type E = (typeof all)[number];
  const current = VERSIONS[VERSIONS.length - 1].id;
  const f = { version: 'all', kind: 'all' as Kind | 'all', small: true };
  // the minor series, newest first: v0.5, v0.4 …
  const SERIES = [...new Set(VERSIONS.map((v) => series(v.id)))];
  const inVersion = (e: E) => f.version === 'all' || series(e.version) === f.version;
  const shown = (e: E) => inVersion(e) && (f.kind === 'all' || e.kind === f.kind) && (f.small || e.size > 1);
  const reset = () => { f.version = 'all'; f.kind = 'all'; f.small = true; paintV(); paintS(); paint(); };

  // ---- head
  const close = h('button', { type: 'button', class: 'btn ico', 'aria-label': 'Close the change log' });
  close.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  const sum = h('p', { class: 'sum' });
  const head = h('header', { class: 'log-h' }, h('div', null, h('h2', { id: 'logTitle' }, 'Change log'), sum), close);

  // ---- filters: which version, which kind, and whether the small changes show
  const vDots = h('div', { class: 'dots', role: 'group', 'aria-label': 'Version' },
    ...['all', ...[...SERIES].reverse()].map((v) => h('button', { type: 'button', 'data-v': v }, v === 'all' ? 'All' : ver(v))));
  const kChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Kind' },
    ...(['all', ...KINDS] as const).map((k) => h('button', { type: 'button', class: 'chip', 'data-v': k },
      k !== 'all' ? h('span', { class: `node k-${k}`, 'aria-hidden': 'true' }) : null, k === 'all' ? 'All' : KIND[k], h('em'))));
  const small = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': 'true' },
    h('span', { class: 'lab' }, 'Small changes'), h('span', { class: 'track' }, h('span', { class: 'knob' })));
  const filters = h('div', { class: 'log-f' },
    h('div', { class: 'frow' }, h('span', { class: 'lab' }, 'Version'), vDots),
    h('div', { class: 'frow' }, h('span', { class: 'lab' }, 'Kind'), kChips),
    small);

  // ---- the strip: every change as a tick, taller for bigger ones, the series under it; click one to go to it.
  // Labels take turns between two rows, so a series with one change doesn't print over its neighbour.
  const x = (i: number) => `${(i / (all.length - 1)) * 100}%`;
  const strip = h('div', { class: 'strip' });
  for (const e of all) strip.append(h('button', { type: 'button', class: `tk s${e.size}`, style: `left:${x(e.n - 1)}`, 'data-n': String(e.n), title: `#${e.n} · ${e.title}`, 'aria-label': `Go to change ${e.n}, ${e.title}` }));
  for (const [si, s] of SERIES.entries()) {
    const idx = all.filter((e) => series(e.version) === s).map((e) => e.n - 1), a = Math.min(...idx), b = Math.max(...idx);
    strip.append(h('div', { class: `vb${s === series(current) ? ' cur' : ''}${si % 2 ? ' lo' : ''}`, style: `left:${x(a)};right:calc(100% - ${x(b)})` }, h('span', null, ver(s))));
    if (si) strip.append(h('div', { class: 'cut', style: `left:${x(a - 0.5)}` }));
  }

  // ---- the list
  const list = h('div', { class: 'log-l' });
  const empty = h('div', { class: 'empty' }, h('p', null, 'No changes match.'), h('button', { type: 'button', class: 'btn' }, 'Show everything'));
  const item = (e: E) => h('li', { class: `e s${e.size}`, id: `log-${e.n}` },
    h('span', { class: `node k-${e.kind}`, 'aria-hidden': 'true' }),
    h('div', { class: 'eh' }, h('span', { class: 'kind' }, KIND[e.kind]), h('span', { class: 'at' }, stamp(e.at))),
    h('b', null, e.title), h('p', null, e.text),
    h('div', { class: 'ef' }, h('span', null, `#${String(e.n).padStart(2, '0')}`),
      e.commit ? h('a', { href: `${REPO}/commit/${e.commit}`, target: '_blank', rel: 'noopener' }, e.commit) : h('span', null, 'this release')));

  function paint() {
    const vis = all.filter(shown);
    sum.textContent = vis.length === all.length ? `${all.length} changes · ${VERSIONS.length} releases` : `${vis.length} of ${all.length} changes`;
    // each kind's count, inside the version and sizes chosen
    for (const c of kChips.querySelectorAll<HTMLElement>('.chip')) {
      const k = c.dataset.v as Kind | 'all';
      c.querySelector('em')!.textContent = String(all.filter((e) => inVersion(e) && (f.small || e.size > 1) && (k === 'all' || e.kind === k)).length);
      c.setAttribute('aria-pressed', String(f.kind === k));
    }
    for (const t of strip.querySelectorAll<HTMLElement>('.tk')) t.classList.toggle('off', !shown(all[+t.dataset.n! - 1]));
    const order = [...VERSIONS].reverse();
    const sections = order.flatMap((v, oi) => {
      const mine = all.filter((e) => e.version === v.id), rows = mine.filter(shown);
      if (!rows.length) return [];
      const last = mine[mine.length - 1], isCur = v.id === current;
      const prev = order[oi + 1];
      return [h('section', { class: `ver${isCur ? ' cur' : ''}`, 'aria-label': `Release ${show(v.id)}` },
        // pinned while you read it, so you always know which release you are in
        h('header', { class: 'vh' },
          h('span', { class: 'vn' }, ver(v.id)),
          h('span', { class: 'vname' }, v.name),
          h('span', { class: 'vr' }, isCur ? 'latest' : day(last.at))),
        h('dl', { class: 'vmeta' },
          h('dt', null, 'Released'), h('dd', null, day(last.at)),
          h('dt', null, 'Changes'), h('dd', null, String(mine.length)),
          h('dt', null, 'Tag'), h('dd', null, h('a', { href: `${REPO}/tree/${v.id}`, target: '_blank', rel: 'noopener' }, ver(v.id)))),
        v.fig ? h('figure', null, h('img', { src: v.fig, alt: `The bench in ${show(v.id)}`, loading: 'lazy', width: '880', height: '495' }), v.caption ? h('figcaption', null, v.caption) : null) : null,
        h('ol', { class: 'rows' }, ...[...rows].reverse().map(item)),
        h('div', { class: 'vstart' }, h('span', null, ver(v.id), ' begins'), h('span', null, ...(prev ? ['after ', ver(prev.id)] : ['the first change']))))];
    });
    list.replaceChildren(...(sections.length ? sections : [empty]));
  }

  const paintV = dots(vDots, { get: () => f.version, set: (v) => { f.version = v; paint(); } });
  const paintS = toggle(small, { get: () => f.small, set: (v) => { f.small = v; paint(); } });
  kChips.addEventListener('click', (e) => { const b = (e.target as Element).closest<HTMLElement>('.chip'); if (b) { f.kind = b.dataset.v as Kind | 'all'; paint(); } });
  empty.querySelector('button')!.addEventListener('click', reset);
  // a tick takes you to its change, clearing the filters if they hide it
  strip.addEventListener('click', (ev) => {
    const t = (ev.target as Element).closest<HTMLElement>('.tk'); if (!t) return;
    const e = all[+t.dataset.n! - 1];
    if (!shown(e)) reset();
    const row = document.getElementById(`log-${e.n}`)!;
    row.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
  });

  drawer.replaceChildren(head, h('div', { class: 'log-s' }, filters, strip, list));
  paint();

  // ---- open and close: the bench eases back, out of reach, while the drawer is in
  drawer.inert = true;
  const isOpen = () => document.body.classList.contains('logopen');
  const open = () => {
    if (isOpen()) return;
    drawer.inert = false; page.inert = true;
    document.body.classList.add('logopen');
    btn.setAttribute('aria-expanded', 'true');
    setTimeout(() => drawer.focus({ preventScroll: true }), 60);
  };
  const shut = () => {
    if (!isOpen()) return;
    document.body.classList.remove('logopen');
    btn.setAttribute('aria-expanded', 'false');
    drawer.inert = true; page.inert = false;
    btn.focus({ preventScroll: true });
  };
  btn.addEventListener('click', () => (isOpen() ? shut() : open()));
  close.addEventListener('click', shut);
  scrim.addEventListener('click', shut);
  // keys stay in the drawer: Esc closes it, and the bench's own keys (space, r, zoom) wait until it is closed
  drawer.addEventListener('keydown', (e) => { if (e.key === 'Escape') { shut(); e.preventDefault(); } e.stopPropagation(); });
}
