/**
 * The bench's change log: every change, the smallest to the biggest, oldest first, grouped by the release it shipped
 * in. A change gets its entry in the same commit as the change. Written for people, not for the code: the title is
 * what they get, the line says what it means. The drawer (log.ts) reads it; test/changelog.test.ts keeps it in order.
 */
import figV040 from './img/v0.4.0.jpg';
import figV052 from './img/v0.5.2.jpg';

/** what kind of change: something new, something better, something mended, or the bench around the sea */
export type Kind = 'new' | 'improved' | 'fixed' | 'system';
/** how big a change it is, to a person using the bench: 1 a detail, 2 a feature, 3 a step in what the bench is */
export type Size = 1 | 2 | 3;

export interface Version {
  /** the release: its git tag, `vX.Y.Z`, the package version with a v. The title shows the newest. */
  id: string;
  /** a few words for what the release brought */
  name: string;
  /** a frame of the bench as it looked then, for the releases that changed how it looks */
  fig?: string;
  caption?: string;
}

export interface Entry {
  /** local time the change landed, `YYYY-MM-DDTHH:MM` (read as written, never through a time zone) */
  at: string;
  /** the release it shipped in */
  version: string;
  kind: Kind;
  size: Size;
  title: string;
  text: string;
  /** the commit, short hash; none for a change that ships in the same commit as its entry */
  commit?: string;
}

export const REPO = 'https://github.com/gitkerem/sea-bench';

/** the minor series a release belongs to, `v0.5.2` → `v0.5`: what the version filter and the strip group by */
export const series = (id: string) => id.split('.').slice(0, 2).join('.');
/** how a version reads on screen: the minor in two digits, `v0.5.2` → `v0.05.2`. Display only; tags stay semver,
 *  since npm won't take a leading zero. */
export const show = (id: string) => id.replace(/^v(\d+)\.(\d+)/, (_, a: string, b: string) => `v${a}.${b.padStart(2, '0')}`);

export const VERSIONS: Version[] = [
  { id: 'v0.1.0', name: 'the water column' },
  { id: 'v0.2.0', name: 'gusts on the water' },
  { id: 'v0.3.0', name: 'live, on a moving seabed' },
  { id: 'v0.4.0', name: 'the sea under the hull', fig: figV040, caption: 'Moderate sea, 12 kn from the east; the bench’s first panel.' },
  { id: 'v0.5.0', name: 'the instrument panel' },
  { id: 'v0.5.1', name: 'the version in the title' },
  { id: 'v0.5.2', name: 'one typeface, and this log', fig: figV052, caption: 'The same sea on the shared instrument panel, set in Space Mono.' },
];

export const ENTRIES: Entry[] = [
  { at: '2026-11-02T14:28', version: 'v0.1.0', kind: 'new', size: 3, commit: 'a8a4215',
    title: 'A real sea in a cut-away column',
    text: 'A JONSWAP wave spectrum turned into three FFT height fields on the GPU every frame, shaded in a water column, with a bench to tune wind, fetch, swell, chop, light and time.' },
  { at: '2026-11-02T14:29', version: 'v0.1.0', kind: 'system', size: 1, commit: '9a6f0e7',
    title: 'The sea as a package',
    text: 'Other projects can install the sea from a tag and bring their own three.js. MIT licensed.' },
  { at: '2026-11-02T17:17', version: 'v0.2.0', kind: 'new', size: 2, commit: 'd3f7a13',
    title: 'Gusts you can see on the water',
    text: 'A map of how hard the wind blows darkens and roughens the water in the gusts and lightens it in the lulls.' },
  { at: '2026-11-02T19:56', version: 'v0.3.0', kind: 'system', size: 2, commit: '708216a',
    title: 'Live at kerem.co/projects/sea-bench',
    text: 'Every change on main deploys itself to the site.' },
  { at: '2026-11-02T20:17', version: 'v0.3.0', kind: 'system', size: 1, commit: 'dcd4795',
    title: 'Visits are counted',
    text: 'The live bench counts visits with Google Analytics; running it yourself sends nothing.' },
  { at: '2026-11-02T20:46', version: 'v0.3.0', kind: 'new', size: 1, commit: '256d94e',
    title: 'The title types itself on',
    text: 'SEA BENCH comes in letter by letter, then stops to recall its version, in red.' },
  { at: '2026-11-02T21:49', version: 'v0.3.0', kind: 'system', size: 1, commit: 'ae3df31',
    title: 'The live bench, from the top of the README',
    text: 'The GitHub page leads with a link and a picture of the bench running.' },
  { at: '2026-11-03T13:27', version: 'v0.3.0', kind: 'new', size: 2, commit: 'd5a2c19',
    title: 'The seabed slides under the column',
    text: 'Sand, ripples and rocks scroll by the ground a scene covers; rocks pass out through the wall and come round again.' },
  { at: '2026-11-03T16:33', version: 'v0.4.0', kind: 'fixed', size: 2, commit: '7d4193b',
    title: 'Floating things ride the water you see',
    text: 'A hull now feels the chopped surface it is drawn on. It used to miss by 9 to 30 cm; now it misses by under 1 mm in a moderate sea and 3.5 cm in a storm.' },
  { at: '2026-11-03T16:55', version: 'v0.5.0', kind: 'new', size: 3, commit: '840add4',
    title: 'The instrument panel, shared with the dinghy',
    text: 'Folders, sliders, dials, dots, switches and buttons come from one kit that the bench and the dinghy simulator both draw with.' },
  { at: '2026-11-03T17:00', version: 'v0.5.0', kind: 'improved', size: 2, commit: '49b935f',
    title: 'Wind on a compass ring and an upright bar',
    text: 'Drag the dot to where the wind comes from and the bar for how hard; Beaufort, waves, period and wavelength sit between them.' },
  { at: '2026-11-03T17:07', version: 'v0.5.0', kind: 'improved', size: 2, commit: '93a17c5',
    title: 'Light as three equal circles',
    text: 'Time of day on a ring, glint and clarity on dials, out on the panel instead of behind a settings button. The wind reading gusts as it does in the dinghy.' },
  { at: '2026-11-03T17:07', version: 'v0.5.0', kind: 'fixed', size: 1, commit: '93a17c5',
    title: 'The wind bar’s focus ring fits',
    text: 'Its edge was clipped by the panel when you reached it with the keyboard.' },
  { at: '2026-11-03T17:30', version: 'v0.5.1', kind: 'improved', size: 1, commit: '9f5621d',
    title: 'The version in the title',
    text: 'The release is in the title and the page name.' },
  { at: '2026-11-03T17:35', version: 'v0.5.2', kind: 'improved', size: 2, commit: '9695199',
    title: 'One typeface, Space Mono',
    text: 'Prose, hints and notes are set in the same mono as the figures; the serif is gone.' },
  { at: '2026-11-03T17:40', version: 'v0.5.2', kind: 'improved', size: 1, commit: 'f96a6ea',
    title: 'Wind figures line up on the right',
    text: 'With room between them and the bar.' },
  { at: '2026-11-03T18:30', version: 'v0.5.2', kind: 'new', size: 1, commit: '9048770',
    title: 'Scroll to turn a dial',
    text: 'Over a dial or a ring, scroll up for more and down for less: a mouse wheel, or two fingers on a trackpad.' },
  { at: '2026-11-03T18:45', version: 'v0.5.2', kind: 'new', size: 2, commit: '737a9a5',
    title: 'This change log',
    text: 'Hover the version in the title for its button: a side drawer of every change, filtered by version, kind and size.' },
  { at: '2026-11-03T18:50', version: 'v0.5.2', kind: 'improved', size: 1,
    title: 'Plain version numbers',
    text: 'The title, the page name and this log say v0.05.2 in place of a prototype letter; the git tag is v0.5.2.' },
  { at: '2026-11-03T19:25', version: 'v0.5.2', kind: 'improved', size: 1,
    title: 'Plainer icons, and a Changelog label',
    text: 'The panel’s buttons are drawn with a line, a dot or an arrow; the change log opens from a small text button beside the version.' },
];
