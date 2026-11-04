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

- The page: paper `--scene`, one red, hairlines; the header is a Space Mono HUD (`--hud`), prose is Geist. Dark mode
  is `data-theme="dark"` on `<html>`.
- The controls are the shared plate in `src/controls/` (exported as `sea-bench/controls`, with
  `controls/tokens.css` and `controls/controls.css`), the same kit the dinghy simulator draws its panel with: the
  dinghy's instrument plate (Geist Mono, plate fill, italic serif notes) with round slider knobs. Change a control
  there and it changes in both apps; anything only the bench shows stays in `src/bench/style.css`. Controls own no
  state (`get`/`set`, labels as plain text). Readouts change through `ui.tick()` (a 320 ms dip), never a flap.
- Comments say why, in plain English. No decoration.

## Known gaps / next

- Foam exists in the Jacobian math but is switched off in the materials (the author didn't like it). See HANDOFF.
- The column is WebGPU-only; there is no WebGL fallback and none is planned.
- `SeaSim` has no shadows and no interaction (wake, splash). The dinghy sim will add a ripple layer later.
- Validation of CPU vs GPU height is by construction (same math); a readback test under a real GPU would be
  worth adding once a Chrome with GPU is available to the test runner.
