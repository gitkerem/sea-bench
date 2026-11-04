# CLAUDE.md

A real sea in a cut-away column, and the bench that tunes it. three.js r186 **WebGPU + TSL**, TypeScript, Vite.
Read `docs/SEA-MODEL.md` before touching anything under `src/sea/`.

## Commands

```
npm run dev          # Vite dev server, http://localhost:5173 (needs a WebGPU browser: Chrome/Edge, Safari 26)
npm run check        # typecheck + tests + build — run before every commit
npm test             # vitest: FFT formulation vs naive DFT, spectrum numbers, noise, CPU sampler
npm run build        # dist/
```

Headless verification without looking at a frame: open the built page with `?check=1`. `main.ts` then compiles every
material (`renderer.compileAsync`), steps the sea once and sets `window.__check` instead of starting the loop. Any
WGSL error shows in the console as a failed pipeline. `scripts/headless_check.py` drives that with Playwright.

## Map

```
src/sea/              the reusable sea — no DOM, no bench knowledge
  spectrum.ts         JONSWAP + swell + cos^p spread, seaStats(), swell calibration   (plain numbers)
  noise.ts            seeded Gaussian (Wang hash + Box–Muller)                       (plain numbers)
  tsl-spectrum.ts     the TSL twins of the two files above — keep them in step
  uniforms.ts         SeaUniforms: what the GPU reads
  sea-sim.ts          SeaSim: h0 → evolve → Stockham passes → (Dx,h,Dz) textures, per cascade, per frame
  sea-cpu.ts          strongest ±k pairs from the same seeded spectrum; heightAt(), displacementAt(), surfaceAt(), slopeAt()
  shading.ts          Look uniforms + materials: surface, wall, seabed, rocks, ground
  column.ts           SeaColumn: the geometry wired to the materials (one Group)
  fft-reference.ts    the pipeline in plain JS — the oracle for the tests, not used at runtime
src/controls/         the plate kit both apps share: sliders, dials, rings, dots, switches, folders + their CSS
src/bench/            the bench app: state, its panel, camera, main
index.html            bench markup (system 01)
test/                 vitest
docs/                 SEA-MODEL (physics + conventions), DESIGN (system 01), HANDOFF (history, next)
reference/            the single-file artifact this was extracted from, as published
```

## Invariants — do not break these

1. **CPU and GPU share one spectrum.** `spectrum.ts`/`noise.ts` and `tsl-spectrum.ts` are the same formulas twice.
   Change one → change the other → `npm test`. `sea-cpu.ts` relies on it: a hull sampling `sea.heightAt()` must
   feel the water the surface shows.
2. **No GPU readback.** Anything the CPU needs comes from the component sum, never from the textures.
3. **FFT pass constants are baked per stage** (one compute node per stage and direction). Never drive a pass with a
   uniform that changes between dispatches in the same frame; three batches uniform uploads and the passes would
   all see the last value.
4. **Conventions in `fft-reference.ts` are law**: frequency order, Hermitian packing (h0(k), h0(−k) per cell),
   `xy = h + i·Dx`, `zw = Dz`, chop sign `+i k̂ ĥ`, unnormalised inverse. The tests pin them.
5. **Materials are TSL node materials only.** No `ShaderMaterial`, no `onBeforeCompile` — the WebGPU renderer
   doesn't support them. Textures are `StorageTexture` rgba16float with `RepeatWrapping`, sampled at level 0.
6. **ampScale multiplies everything in the kernel, swell included.** A swell height asked by the bench is
   calibrated with `swellAmpForHs(hs, stats, ampScale)` which divides it back out.
7. **Angles.** `travel` is the direction waves move toward, `atan2(z, x)` in the xz plane; the bench converts a
   compass "wind from" with `travelFromCompass()`. The column's `U.off` scrolls the world: positions passed to
   `sampleSea` are block-local, the sea adds `off`.

## Style

- The page: paper `--scene`, one red, hairlines; everything is Space Mono, the header's HUD (`--hud`) and the prose alike. Dark mode
  is `data-theme="dark"` on `<html>`.
- The controls are the shared plate in `src/controls/` (exported as `sea-bench/controls`, with
  `controls/tokens.css` and `controls/controls.css`), the same kit the dinghy simulator draws its panel with: the
  dinghy's instrument plate (plate fill, quiet lower-case notes) in Space Mono, the page's only face, with round slider knobs; the wind is the
  dinghy's row: a compass ring for where it comes from, an upright bar for how hard, the figures between. Change a control
  there and it changes in both apps; anything only the bench shows stays in `src/bench/style.css`. Controls own no
  state (`get`/`set`, labels as plain text). Readouts change through `ui.tick()` (a 320 ms dip), never a flap.
- Comments say why, in plain English. No decoration.
- The right-hand panel is the **instrument panel** when talking to people (in code and the older docs, "the plate").

## Versions

Plain semver, nothing else: the release is its git tag `vX.Y.Z`, `package.json` matches without the v, and the title,
the meta's Version and the page name (`<title>`) in `index.html` show it. A minor for something people notice (a new
control, a new look), a patch for the smaller things; Kerem calls a minor. Releasing: bump all four, add the
`VERSIONS` row, add the README's Versions row, then tag and push (the push deploys kerem.co, so ask first).
`test/changelog.test.ts` fails if the package, the title and the log disagree. (Until Nov 3 the bench showed
prototype letters, 001.A and 001.B; Kerem dropped them as confusing.)

## Change log

Every change gets an entry in `src/bench/changelog.ts`, in the same commit: oldest first, local time as written, the
release it ships in (`v0.5.2`), its kind (new · improved · fixed · system) and size (1 a detail, 2 a feature, 3 a step), a title
of what people get (≤ 48 characters) and one line (≤ 200). Fill in `commit` for earlier entries once their hash
exists; the newest can leave it out ("this release"). A new release adds a `VERSIONS` row; one that changes how the bench
looks gets a frame of it (`src/bench/img/<tag>.jpg`, 880 px wide). The drawer's filter and strip group releases by
minor series (v0.5). `test/changelog.test.ts` keeps it in order. The drawer is `src/bench/log.ts`, a side drawer:
hover the version in the title for its button; opening it eases the page back with one CSS scale on `#page`.

## Known gaps / next

- Foam exists in the Jacobian math but is switched off in the materials (the author didn't like it). See HANDOFF.
- The column is WebGPU-only; there is no WebGL fallback and none is planned.
- `SeaSim` has no shadows and no interaction (wake, splash). The dinghy sim will add a ripple layer later.
- Validation of CPU vs GPU height is by construction (same math); a readback test under a real GPU would be
  worth adding once a Chrome with GPU is available to the test runner.
