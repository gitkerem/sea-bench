/**
 * The change log, a side drawer. Its button waits beside the version in the title and slides in when you hover it.
 * Opening it eases the whole bench back (a CSS scale, nothing re-rendered) while the drawer slides in from the left.
 * Inside, one readable column: filters for version, kind and the small changes, then the changes newest first,
 * release by release on one rail: a node for the kind, a title, a line. Each release's head is pinned while you read it.
 * Releases are the git tags (v0.5.2); the version filter groups them by minor series (v0.5).
 */
import { ENTRIES, VERSIONS, series, show, type Kind } from './changelog';
import { dots, toggle } from '../controls';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KINDS: Kind[] = ['new', 'improved', 'fixed', 'system'];
const KIND: Record<Kind, string> = { new: 'New', improved: 'Improved', fixed: 'Fixed', system: 'System' };
/** `2026-11-03T17:35` → `Nov 3`, read as written */
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
  const current = VERSIONS[VERSIONS.length - 1].id;
  const f = { version: 'all', kind: 'all' as Kind | 'all', small: true };
  // the minor series, newest first: v0.5, v0.4 …
  const SERIES = [...new Set(VERSIONS.map((v) => series(v.id)))].reverse();
  type E = (typeof ENTRIES)[number];
  const inVersion = (e: E) => f.version === 'all' || series(e.version) === f.version;
  const shown = (e: E) => inVersion(e) && (f.kind === 'all' || e.kind === f.kind) && (f.small || e.size > 1);
  const reset = () => { f.version = 'all'; f.kind = 'all'; f.small = true; paintV(); paintS(); paint(); };

  // ---- head
  const close = h('button', { type: 'button', class: 'txtbtn', 'aria-label': 'Close the change log' }, 'Close');
  const sum = h('p', { class: 'sum' });
  const head = h('header', { class: 'log-h' }, h('div', null, h('h2', { id: 'logTitle' }, 'Change log'), sum), close);

  // ---- filters: which version, which kind, and whether the small changes show
  const vDots = h('div', { class: 'dots', role: 'group', 'aria-label': 'Version' },
    ...['all', ...SERIES].map((v) => h('button', { type: 'button', 'data-v': v }, v === 'all' ? 'All' : ver(v))));
  const kChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Kind' },
    ...(['all', ...KINDS] as const).map((k) => h('button', { type: 'button', class: 'chip', 'data-v': k },
      k !== 'all' ? h('span', { class: `node k-${k}`, 'aria-hidden': 'true' }) : null, k === 'all' ? 'All' : KIND[k], h('em'))));
  const small = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': 'true' },
    h('span', { class: 'lab' }, 'Small changes'), h('span', { class: 'track' }, h('span', { class: 'knob' })));
  const filters = h('div', { class: 'log-f' },
    h('div', { class: 'frow' }, h('span', { class: 'lab' }, 'Version'), vDots),
    h('div', { class: 'frow' }, h('span', { class: 'lab' }, 'Kind'), kChips),
    small);

  // ---- the list: one rail; a node for the kind, the title, one line
  const list = h('div', { class: 'log-l' });
  const empty = h('div', { class: 'empty' }, h('p', null, 'No changes match.'), h('button', { type: 'button', class: 'txtbtn' }, 'Show everything'));
  const item = (e: E) => h('li', { class: 'e' },
    h('span', { class: `node k-${e.kind}`, title: KIND[e.kind], 'aria-label': KIND[e.kind] }),
    h('b', null, e.title), h('p', null, e.text));

  function paint() {
    const vis = ENTRIES.filter(shown);
    sum.textContent = vis.length === ENTRIES.length ? `${ENTRIES.length} changes · ${VERSIONS.length} releases` : `${vis.length} of ${ENTRIES.length} changes`;
    // each kind's count, inside the version and sizes chosen
    for (const c of kChips.querySelectorAll<HTMLElement>('.chip')) {
      const k = c.dataset.v as Kind | 'all';
      c.querySelector('em')!.textContent = String(ENTRIES.filter((e) => inVersion(e) && (f.small || e.size > 1) && (k === 'all' || e.kind === k)).length);
      c.setAttribute('aria-pressed', String(f.kind === k));
    }
    const sections = [...VERSIONS].reverse().flatMap((v) => {
      const mine = ENTRIES.filter((e) => e.version === v.id), rows = mine.filter(shown);
      if (!rows.length) return [];
      const isCur = v.id === current;
      return [h('section', { class: `ver${isCur ? ' cur' : ''}`, 'aria-label': `Release ${show(v.id)}` },
        // pinned while you read it, so you always know which release you are in
        h('header', { class: 'vh' },
          h('span', { class: 'vn' }, ver(v.id)),
          h('span', { class: 'vname' }, v.name),
          h('span', { class: 'vr' }, isCur ? 'Latest' : day(mine[mine.length - 1].at))),
        v.fig ? h('img', { src: v.fig, alt: v.caption ?? `The bench in ${show(v.id)}`, loading: 'lazy', width: '880', height: '495' }) : null,
        h('ol', { class: 'rows' }, ...[...rows].reverse().map(item)))];
    });
    list.replaceChildren(...(sections.length ? sections : [empty]));
  }

  const paintV = dots(vDots, { get: () => f.version, set: (v) => { f.version = v; paint(); } });
  const paintS = toggle(small, { get: () => f.small, set: (v) => { f.small = v; paint(); } });
  kChips.addEventListener('click', (e) => { const b = (e.target as Element).closest<HTMLElement>('.chip'); if (b) { f.kind = b.dataset.v as Kind | 'all'; paint(); } });
  empty.querySelector('button')!.addEventListener('click', reset);

  drawer.replaceChildren(head, h('div', { class: 'log-s' }, filters, list));
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
