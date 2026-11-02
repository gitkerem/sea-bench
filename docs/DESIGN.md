# system 01 — the look

The bench is styled after a mid-century hi-fi plate: warm paper, hairlines, round black buttons, one red.

## Tokens (`src/bench/style.css`)

| token | light | dark | used for |
|---|---|---|---|
| `--scene` | `#ECE9E1` | `#1A1B19` | page, panel, the ground the column stands on, the horizon the water reflects |
| `--ink` | `#1B1C1A` | `#ECE9E1` | text, knobs, pressed buttons |
| `--ink-2` | 62 % ink | 60 % ink | labels, secondary text |
| `--line` / `--line-2` | 26 % / 62 % ink | 24 % / 60 % | hairlines, tracks, scale ticks |
| `--red` | `#E4382B` | `#F04A3C` | the sun on the day circle, pause, sea state, a slider knob while dragging |

Dark mode is `data-theme="dark"` on `<html>`; the switch top-right remembers the choice; the scene reads
`--scene` and sets `look.dark`, which the water and the ground shaders use.

## Type

- **Space Mono** for anything numeric or label-like: readouts, folder titles, slider labels and values, buttons.
  Small, uppercase, tracked (`letter-spacing: .08em`).
- **Geist** for the few sentences of prose (hints, the no-WebGPU message).
- **Michroma** only ever for a wordmark; currently unused on the bench (the title was removed).

## Components

- **Header**: three aligned columns of `dt → dd` rows, fixed column widths so values changing length never reflow.
  Readouts change through `ui.tick()`: a 320 ms dip-and-return, only on user-driven values; the clock and fps update plainly.
- **Panel**: 280 px, rounded 14 px, hairline border, a scrolling body of folders and a fixed footer (Time, run/pause with
  its red dot and label, three icon buttons). Folders collapse.
- **Slider**: label left, value right, hairline track, 12 px black circle knob (14 px and red while dragging). Ticks only
  where it snaps (Spread, Chop).
- **Dots**: round buttons with the label beneath, filled when pressed (presets, Time of day / Manual).
- **Knob**: black disc, white hand over a dotted 270° scale; drag around it or up/down over it; arrow keys when focused.
- **Day circle**: 1 px ring, the red sun travelling inside it 4 px clear of the stroke, time in the centre at 20 px with
  the sun height in small caps under it. Noon at the top.
- **Fine-tune plate**: a second plate that opens over the panel, anchored to its button, rising in over 240 ms; closes on
  outside click or Esc.
- **Keys** (bottom-left): a ruler key and the shortcut line, mono, muted.
