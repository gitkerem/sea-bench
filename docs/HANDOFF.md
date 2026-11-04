# Handoff

## Where this came from

Built across one long session (1 Nov 2026) as single-file claude.ai artifacts, then extracted into this repo:

- `reference/sea-bench.artifact.html` — the bench as last published (loads three r186 from jsDelivr). Everything in
  `src/` was lifted from it line for line; if a behaviour differs, the artifact is the intended one.
- The ocean look was chosen against iodiot/webgpu-ocean's Storm preset; the FFT/TSL approach follows that project
  (MIT), the physics-side design (one spectrum for CPU and GPU) follows True Wind and Fair Winds.
- The wider project is an isometric dinghy sailing simulator (separate repo, three r186 WebGPU). This sea is meant
  to be imported there: `SeaSim` for the water, `heightAt`/`slopeAt` for the hull, `U.off` to scroll the world
  under the boat, `SeaColumn` or its materials for the cut-away look.

## Decisions

- Foam: implemented (Jacobian of the displacement, with decay) and then removed from the look on request.
  It can come back as a Look toggle; the assemble kernel writes 0 in the alpha channel today.
- Cube → cylinder on request; the surface and seabed are clipped per fragment to `look.radius`, the wall is a
  192-sided cylinder, so the radius can change at runtime (lessons mode in the sim grows it to 15 m).
- The seabed is procedural (dunes, ripples aligned to the default wave direction, boulders); strata show in the cut.
- Light: time of day drives sun height and direction through a toy solar path (east 06:00, noon highest, west
  18:00, low and warm through the night); the sun's sliders take it off the clock, and turning the clock puts it back.
- The bench keeps all its state in one object (`BenchState`) and can put it in the URL (Copy settings).

## How it was verified

- `npm test` — the FFT formulation, packing and chop sign against a naive DFT; spectrum numbers; noise; CPU sampler.
- The GPU pipeline was read back on a headless Chromium (SwiftShader) and compared with `fft-reference.ts`:
  1.5e-4 max abs error at 128², imaginary leak 2.5e-5. That Chromium (141) could not present a frame with three
  r186 (device loss at presentation), so the look was judged in a real browser only.
- `?check=1` compiles every material headlessly and steps the sea; `scripts/headless_check.py` runs it.

## Next

1. Integrate into the dinghy sim: sample `heightAt` at 4–8 hull points for heave/pitch/roll; drive `windU`/`travel`
   from the sim's wind; `U.off` from the sim's world scroll; `look.murk` from wind.
2. A ripple/wake layer at the hull (2-D wave equation as a TSL compute pass, added to the displacement).
3. Foam as a Look toggle, with the whitecap threshold tied to steepness.
4. Readback parity test under a real GPU (`renderer.getArrayBufferAsync` on `bufA` after one cascade).
5. A WebGL note on the no-WebGPU screen is enough; no fallback planned.
