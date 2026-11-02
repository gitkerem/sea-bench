# Sea bench · system 01

A real sea in a cut-away column, and the bench that tunes it.

The water is a JONSWAP wave spectrum turned into three FFT height fields on the GPU every frame — three.js r186
WebGPU with TSL compute — and shaded in TSL. The same seeded spectrum is summed on the CPU, strongest waves
first, so anything that floats on it (a dinghy, in the project this feeds) feels the water it sees. The bench
exposes the whole model: wind and fetch, spread and peakedness, swell, chop, light, time.

**Needs a WebGPU browser**: Chrome / Edge, or Safari 26. Nothing is read back from the GPU; nothing falls back to WebGL.

## Run

```
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck + tests + build
```

Add `?n=256` to the URL for finer ripples on a strong GPU, `?check=1` to compile everything headlessly (see CLAUDE.md).

## Use the sea elsewhere

```ts
import * as THREE from 'three/webgpu';
import { SeaSim, SeaColumn, travelFromCompass } from './src/sea';

const renderer = new THREE.WebGPURenderer({ canvas });
await renderer.init();
const sea = new SeaSim(renderer, { N: 128 });
sea.setParams({ ...sea.params, windU: 8, fetch: 12000, travel: travelFromCompass(315) });
scene.add(new SeaColumn(sea, { radius: 7, waterY: 1.7 }));

// per frame
sea.step(dt);
const h = sea.heightAt(x, z);        // metres above mean level at world (x, z), from the same spectrum
renderer.render(scene, camera);
```

`SeaColumn` is the diorama; `makeSurfaceMaterial` and friends in `shading.ts` work on your own geometry.
`sea.U.off` scrolls the sea under a moving scene; `sea.U.lambda` is the chop.

## Layout

```
src/sea      the sea: spectrum, noise, GPU kernels, CPU sampler, shading, column
src/bench    the bench app: state, controls, camera, main
test         vitest — the FFT formulation against a naive DFT, the spectrum's numbers
docs         SEA-MODEL.md (physics + conventions), DESIGN.md (system 01), HANDOFF.md
reference    the single-file artifact this was extracted from
```

## Credits

The FFT-on-TSL approach follows [iodiot/webgpu-ocean](https://github.com/iodiot/webgpu-ocean) (MIT); the
one-spectrum-for-CPU-and-GPU design follows [True Wind](https://github.com/hclivess/truewind) and
[Fair Winds](https://github.com/flowwweb/sailingsimulator). Spectrum after Hasselmann et al. (JONSWAP, 1973);
surface after Tessendorf (2001).
