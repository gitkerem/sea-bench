# The sea model

## In one paragraph

A wind sea is a sum of thousands of sinusoids. Their energy by frequency is a JONSWAP spectrum (fetch-limited,
peaked at ωp = 22 (g²/UF)^⅓), spread across direction as cos^p about the wind. We draw random complex amplitudes
for every wavenumber of three 128×128 grids (one per scale), advance them in time with the deep-water dispersion
ω = √(gk), and inverse-FFT them on the GPU every frame into height and horizontal displacement. The same seeded
amplitudes are summed on the CPU, strongest first, wherever a hull wants a height.

## Spectrum → amplitudes

- `S(ω)` JONSWAP with α, ωp from wind speed U and fetch F; γ (peak enhancement) is a control.
- `D(θ) = cos^p(θ − travel) · norm(p)`, downwind half only, with `norm(p) = 1/∫cos^p`, so energy is independent of
  the spread. `p = 2` is textbook; higher means longer crests.
- Swell: a Gaussian peak at ω_s = 2π/T_s with relative width 0.12 and spread cos⁸, scaled by `swellAmp`. The bench
  asks for a swell *height*; `swellAmpForHs` calibrates the energy on this grid.
- k-space: `S(kx,kz) = S(ω) D(θ) (dω/dk) / k`, zero outside the cascade's wavelength band.
- `h0(k) = (ξ_r + i ξ_i) · √(S Δk²) / 2`, ξ unit Gaussians seeded by cell index and seed. With the time evolution
  below this gives variance m0 = Σ S Δk², so **Hs = 4√m0 lands on the physical value** (tested).
- `ampScale` multiplies all of it; `ripple` multiplies the finest cascade only.

## Cascades

| L (m) | band (λ, m) | cell (cm) | carries |
|------:|------------:|----------:|---------|
| 96    | ≥ 6         | 75        | swell, the wind-sea peak |
| 16    | 1 – 6       | 12.5      | chop |
| 2.7   | 0.17 – 1    | 2.1       | ripples |

Each band is at least 8 cells per wavelength so bilinear sampling stays smooth. Bands don't overlap, so no wave is
counted twice. The tiles repeat every L; in a 14 m column the 2.7 m tile repeats five times but hides under the
larger scales.

## Per frame, per cascade (GPU)

1. **evolve**: `ĥ(k,t) = h0(k) e^{−iωt} + conj(h0(−k)) e^{+iωt}` — Hermitian by construction, so the field is real.
   Pack `xy = ĥ + i·D̂x`, `zw = D̂z`, with `D̂ = +i (k/|k|) ĥ` (sign chosen so λ > 0 sharpens crests).
2. **2·log2(N) Stockham radix-2 passes**, rows then columns, each a compute node with its stage baked in.
   Unnormalised inverse: `f[j] = Σ F[m] e^{+2πi m·j/N}`. Even pass count → result back in buffer A.
3. **assemble**: write `(Dx, h, Dz, 0)` to the cascade's rgba16float storage texture.

48 dispatches of ≤16k threads per frame at N = 128 — negligible next to the render.

## Sampling (materials)

- Vertex: `p = base + λ·(Dx, 0, Dz) + (0, h, 0)`, summed over cascades at `uv = (xz + off) / L`.
- Normal: central differences per cascade at ±1 texel (bilinear interpolation of a central difference is
  continuous, so no cell faceting), including the horizontal stretch: `n = normalize(Tz × Tx)`.
- Wall: fixed-point inverse (two steps) of the chop displacement at the wall column, then discard above the level.

## CPU sampler

For each of the two coarse cascades, every ±k pair's amplitude `|h0(k)| + |h0(−k)|` is computed from the same seeded
spectrum, the strongest 140 kept, and `h(x,z,t) = Σ 2·Re[ĥ(k,t) e^{i k·x}]`. 280 pairs × 5 hull points × 120 Hz is
nothing. It ignores the chop displacement (sample at the undisplaced point; the error is ≤ λ·|D| ≈ 0.3 m
horizontally, which a boat doesn't notice).

## Conventions

- Frequency order is standard FFT order: index m ∈ [0, N) ↦ n = m < N/2 ? m : m − N; k = 2πn/L.
- The mirror of cell (x, y) is ((N − x) & (N − 1), (N − y) & (N − 1)).
- `travel`: the direction waves move toward, `atan2(z, x)`. A compass "from" bearing converts through
  `travelFromCompass`. Energy assigned to k propagates along k (phase k·x − ωt).
- `U.off` (metres) scrolls the whole sea under a scene; `U.tSim` is sim time in seconds and can run slow or fast.

## Validation (test/)

- Stockham passes = naive IDFT to 1e-4 on both packed slots (N = 16).
- A single travelling wave: real to 1e-5, amplitude 2a, crest advances by ω/k per second, Jacobian < 1 at the
  crest for λ > 0.
- `spreadNorm(1,2,3) = 1/2, 2/π, 3/4`.
- 12 kn on 12 km of fetch → Hs ≈ 0.43 m, Tp ≈ 2.6 s; height scale linear; swell calibrates to the asked height.
- Seeded noise: zero mean, unit variance, deterministic.
- The GPU pipeline was compared against the reference on a headless WebGPU: max abs error 1.5e-4 at N = 128,
  imaginary leak 2.5e-5 (see HANDOFF for how).
