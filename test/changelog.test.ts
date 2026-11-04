import { describe, expect, it } from 'vitest';
import { ENTRIES, VERSIONS } from '../src/bench/changelog';
import html from '../index.html?raw';

// The log reads as a timeline, so it has to be one: in order, each version a single run, every tag once.
describe('change log', () => {
  it('runs oldest first, in local time as written', () => {
    for (const e of ENTRIES) expect(e.at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
    for (let i = 1; i < ENTRIES.length; i++) expect(ENTRIES[i].at >= ENTRIES[i - 1].at).toBe(true);
  });

  it('keeps each version together, in the order the versions came', () => {
    const ids = VERSIONS.map((v) => v.id);
    const seen = ENTRIES.map((e) => e.version).filter((v, i, a) => v !== a[i - 1]);
    expect(seen).toEqual(ids);
  });

  it('names each release tag once, rising', () => {
    const tags = ENTRIES.filter((e) => e.tag).map((e) => e.tag!);
    expect(new Set(tags).size).toBe(tags.length);
    const n = (t: string) => t.slice(1).split('.').map(Number).reduce((a, b) => a * 1000 + b, 0);
    for (let i = 1; i < tags.length; i++) expect(n(tags[i])).toBeGreaterThan(n(tags[i - 1]));
  });

  it('writes short titles and one-line notes', () => {
    for (const e of ENTRIES) {
      expect(e.title.length).toBeLessThanOrEqual(48);
      expect(e.text.length).toBeLessThanOrEqual(200);
    }
  });

  it('gives the title its current version', () => {
    const last = VERSIONS[VERSIONS.length - 1].id;
    expect(html).toContain(`<span class="v">${last}</span>`);
    expect(html).toContain(`<title>Sea bench · ${last}</title>`);
  });
});
