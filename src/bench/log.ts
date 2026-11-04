/**
 * The change log, a drawer that comes down from the top. Its button waits beside the version in the title and slides
 * in when you hover it. Inside: the figures, a strip with every change as one tick (taller for bigger changes) under
 * the versions it falls in, and the ledger, newest first, version by version, with a rule where one version ends and
 * the next begins. Esc, the close button or a click on the scene puts it away.
 */
import { ENTRIES, REPO, VERSIONS, type Entry, type Kind } from './changelog';

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const KIND: Record<Kind, string> = { new: 'New', improved: 'Improved', fixed: 'Fixed', system: 'System' };
const SIZE = ['', 'a detail', 'a feature', 'a step'];
/** `2026-11-03T17:35` → `NOV 03 17:35`, read as written */
const stamp = (at: string) => `${MON[+at.slice(5, 7) - 1]} ${at.slice(8, 10)} ${at.slice(11, 16)}`;
const day = (at: string) => `${MON[+at.slice(5, 7) - 1]} ${at.slice(8, 10)}`;

type Attrs = Record<string, string | undefined>;
function h(tag: string, attrs: Attrs | null = null, ...kids: (Node | string | null | undefined)[]): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) if (v !== undefined) e.setAttribute(k, v);
  for (const c of kids) if (c != null) e.append(c);
  return e;
}
const dl = (rows: [string, Node | string][], cls = '') => h('dl', { class: cls }, ...rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
const sizeBars = (n: number) => h('span', { class: 'size', title: SIZE[n], 'aria-label': `size ${n} of 3, ${SIZE[n]}` }, h('i'), h('i'), h('i'));

export function createLog(): void {
  const btn = document.getElementById('bLog')!, drawer = document.getElementById('log')!, scrim = document.getElementById('logScrim')!;
  // numbered oldest first, so a change keeps its number as the log grows
  const all = ENTRIES.map((e, i) => ({ ...e, n: i + 1 }));
  const current = VERSIONS[VERSIONS.length - 1].id;
  const count = (list: Entry[], k: Kind) => list.filter((e) => e.kind === k).length;
  const tags = all.filter((e) => e.tag);

  // ---- the head: what the log holds, the legend, the close button
  const close = h('button', { type: 'button', class: 'btn ico', 'aria-label': 'Close the change log' });
  close.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  const legend = (k: Kind) => h('span', { class: 'lg' }, h('span', { class: `node k-${k} s2`, 'aria-hidden': 'true' }), KIND[k], h('em', null, String(count(all, k))));
  const head = h('header', { class: 'log-h' },
    h('div', { class: 'log-t' }, h('h2', { id: 'logTitle' }, 'Change log'), h('p', null, 'Sea bench · every change, the smallest to the biggest')),
    h('div', { class: 'meta' },
      dl([['Entries', String(all.length)], ['Versions', VERSIONS.map((v) => v.id).join(' · ')], ['Tags', String(tags.length)], ['First', stamp(all[0].at)], ['Latest', stamp(all[all.length - 1].at)]]),
      dl([['Kind', h('span', { class: 'lgs' }, legend('new'), legend('improved'))], ['', h('span', { class: 'lgs' }, legend('fixed'), legend('system'))],
        ['Size', h('span', { class: 'lgs' }, ...[1, 2, 3].map((n) => h('span', { class: 'lg' }, sizeBars(n), SIZE[n])))]])),
    close);

  // ---- the strip: one tick per change, evenly spaced, under the version it falls in
  const x = (i: number) => `calc(${(i / (all.length - 1)) * 100}%)`;
  const strip = h('div', { class: 'strip', 'aria-hidden': 'true' });
  const read = h('div', { class: 'read' }, 'Hover a tick');
  let lastDay = '';
  for (const [i, e] of all.entries()) {
    if (day(e.at) !== lastDay) { lastDay = day(e.at); strip.append(h('span', { class: 'day', style: `left:${x(i)}` }, lastDay)); }
    const tk = h('button', { type: 'button', class: `tk s${e.size} k-${e.kind}${e.version === current ? ' cur' : ''}`, style: `left:${x(i)}`, tabindex: '-1', 'data-n': String(e.n) });
    strip.append(tk);
    if (e.tag) strip.append(h('span', { class: 'tg', style: `left:${x(i)}` }, e.tag));
  }
  for (const [vi, v] of VERSIONS.entries()) {
    const idx = all.filter((e) => e.version === v.id).map((e) => e.n - 1);
    const a = Math.min(...idx), b = Math.max(...idx);
    strip.append(h('div', { class: `vb${v.id === current ? ' cur' : ''}`, style: `left:${x(a)};width:calc(${((b - a) / (all.length - 1)) * 100}%)` },
      h('span', null, v.id, h('span', { class: 'nm' }, ` · ${v.name}`))));
    // where one version hands over to the next: halfway between its last change and the next one's first
    if (vi) strip.append(h('div', { class: 'cut', style: `left:calc(${((a - 0.5) / (all.length - 1)) * 100}%)` }, h('span', null, `${v.id} begins`)));
  }

  // ---- the ledger: versions newest first, each change a row on the rail
  const row = (e: (typeof all)[number]) => h('li', { class: 'row', id: `log-${e.n}`, 'data-n': String(e.n) },
    h('span', { class: 'no' }, `#${String(e.n).padStart(2, '0')}`),
    h('span', { class: 'm' }, h('span', { class: 'at' }, stamp(e.at)), h('span', { class: `node k-${e.kind} s${e.size}`, 'aria-hidden': 'true' }),
      h('span', { class: `kind k-${e.kind}` }, KIND[e.kind]), sizeBars(e.size)),
    h('div', { class: 'what' }, h('b', null, e.title), h('span', null, e.text)),
    h('span', { class: 'ref' },
      e.commit ? h('a', { href: `${REPO}/commit/${e.commit}`, target: '_blank', rel: 'noopener' }, e.commit) : h('span', { class: 'here' }, 'this release'),
      e.tag ? h('em', { class: 'tag' }, e.tag) : null));

  const book = h('div', { class: 'book' });
  const order = [...VERSIONS].reverse();
  for (const [oi, v] of order.entries()) {
    const list = all.filter((e) => e.version === v.id), first = list[0], last = list[list.length - 1];
    const vtags = list.filter((e) => e.tag).map((e) => e.tag!);
    const isCur = v.id === current, next = order[oi - 1];
    const lastTag = vtags[vtags.length - 1];
    book.append(h('section', { class: `ver${isCur ? ' cur' : ''}`, 'aria-label': `Version ${v.id}` },
      // its top edge: where it ends (or that it is still open), since the ledger reads newest first
      h('div', { class: 'edge end' }, h('span', null, isCur ? `▼ ${v.id} open` : `▼ ${v.id} ends`), h('span', null, stamp(last.at)),
        h('span', null, isCur ? 'the latest change' : `${lastTag ? lastTag + ' · ' : ''}before ${next!.id}`)),
      h('header', { class: 'vh' },
        h('div', { class: 'vid' }, h('span', { class: 'vn' }, v.id), h('span', { class: 'vname' }, v.name), h('span', { class: 'vstate' }, isCur ? 'current · open' : 'closed')),
        h('div', { class: 'meta' }, dl([
          ['Opened', stamp(first.at)], ['Closed', isCur ? '—' : stamp(last.at)], ['Tags', vtags.length ? vtags.join(' · ') : '—'],
          ['Changes', `${list.length}`], ['Mix', `${count(list, 'new')} new · ${count(list, 'improved')} improved · ${count(list, 'fixed')} fixed · ${count(list, 'system')} system`],
        ])),
        h('figure', null, h('img', { src: v.fig, alt: `The bench in version ${v.id}`, loading: 'lazy', width: '880', height: '495' }), h('figcaption', null, h('b', null, `Fig. ${v.id}`), ' ', v.caption))),
      h('ol', { class: 'rows', reversed: '' }, ...[...list].reverse().map(row)),
      h('div', { class: 'edge' }, h('span', null, `▲ ${v.id} begins`), h('span', null, stamp(first.at)), h('span', null, oi === order.length - 1 ? 'the first commit' : `after ${order[oi + 1].id}`))));
  }

  drawer.replaceChildren(head, h('div', { class: 'scroll' }, h('div', { class: 'strip-w' }, strip, read), book));

  // ---- hover a tick: its row lights up and the readout names it; click it to go to its row
  const rows = new Map([...drawer.querySelectorAll<HTMLElement>('.row')].map((r) => [r.dataset.n!, r]));
  const ticks = new Map([...strip.querySelectorAll<HTMLElement>('.tk')].map((t) => [t.dataset.n!, t]));
  const light = (n: string | null) => {
    for (const [k, r] of rows) r.classList.toggle('hl', k === n);
    for (const [k, t] of ticks) t.classList.toggle('hl', k === n);
    const e = n ? all[+n - 1] : null;
    read.textContent = e ? `#${String(e.n).padStart(2, '0')} · ${stamp(e.at)} · ${e.version} · ${e.title}` : 'Hover a tick';
  };
  strip.addEventListener('pointerover', (ev) => { const t = (ev.target as Element).closest<HTMLElement>('.tk'); if (t) light(t.dataset.n!); });
  strip.addEventListener('pointerleave', () => light(null));
  strip.addEventListener('click', (ev) => { const t = (ev.target as Element).closest<HTMLElement>('.tk'); if (t) rows.get(t.dataset.n!)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  for (const r of rows.values()) { r.addEventListener('pointerenter', () => light(r.dataset.n!)); r.addEventListener('pointerleave', () => light(null)); }

  // ---- open and close: the rest of the page is out of reach while it is down
  const behind = () => [...document.body.children].filter((c) => c !== drawer && c !== scrim && c.tagName !== 'SCRIPT') as HTMLElement[];
  drawer.inert = true;
  const open = () => {
    if (drawer.classList.contains('open')) return;
    drawer.inert = false; drawer.classList.add('open'); scrim.classList.add('on');
    btn.setAttribute('aria-expanded', 'true');
    for (const c of behind()) c.inert = true;
    setTimeout(() => drawer.focus({ preventScroll: true }), 60);
  };
  const shut = () => {
    if (!drawer.classList.contains('open')) return;
    drawer.classList.remove('open'); scrim.classList.remove('on');
    btn.setAttribute('aria-expanded', 'false');
    for (const c of behind()) c.inert = false;
    drawer.inert = true;
    btn.focus({ preventScroll: true });
  };
  btn.addEventListener('click', () => (drawer.classList.contains('open') ? shut() : open()));
  close.addEventListener('click', shut);
  scrim.addEventListener('click', shut);
  // keys stay in the drawer: Esc closes it, and the bench's own keys (space, r, zoom) wait until it is up
  drawer.addEventListener('keydown', (e) => { if (e.key === 'Escape') { shut(); e.preventDefault(); } e.stopPropagation(); });
}
