import { describe, expect, it } from 'vitest';
import { ENTRIES, VERSIONS, show } from '../src/bench/changelog';
import html from '../index.html?raw';
import pkg from '../package.json';

// The log reads as a timeline, so it has to be one: in order, each release a single run, the releases rising.
describe('change log', () => {
  it('runs oldest first, in local time as written', () => {
    for (const e of ENTRIES) expect(e.at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
    for (let i = 1; i < ENTRIES.length; i++) expect(ENTRIES[i].at >= ENTRIES[i - 1].at).toBe(true);
  });

  it('keeps each release together, in the order they came', () => {
    const ids = VERSIONS.map((v) => v.id);
    const seen = ENTRIES.map((e) => e.version).filter((v, i, a) => v !== a[i - 1]);
    expect(seen).toEqual(ids);
  });

  it('names each release by its tag, once, rising', () => {
    const ids = VERSIONS.map((v) => v.id);
    for (const id of ids) expect(id).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(new Set(ids).size).toBe(ids.length);
    const n = (t: string) => t.slice(1).split('.').map(Number).reduce((a, b) => a * 1000 + b, 0);
    for (let i = 1; i < ids.length; i++) expect(n(ids[i])).toBeGreaterThan(n(ids[i - 1]));
  });

  it('writes short titles and one-line notes', () => {
    for (const e of ENTRIES) {
      expect(e.title.length).toBeLessThanOrEqual(48);
      expect(e.text.length).toBeLessThanOrEqual(110);
    }
  });

  it('shows the package version in the title, the page name and the log', () => {
    const last = VERSIONS[VERSIONS.length - 1].id;
    expect(last).toBe(`v${pkg.version}`);
    const text = html.replace(/<\/?i[^>]*>/g, ''); // the narrow dots are <i class="pt">
    expect(show(last)).toBe('v' + pkg.version.replace(/\.(\d+)/, (_, m: string) => '.' + m.padStart(2, '0')));
    expect(text).toContain(`<span class="v">${show(last)}</span>`);
    expect(text).toContain(`<title>Sea bench · ${show(last)}</title>`);
  });
});
