# QA Report — SELENIS web app (3D scene + HUD), browser quality gate

**Date:** 2026-11-14 · **Branch:** `feat/web-app`
**Data:** all **fixture/dummy**. No NASA DEM or ephemeris is available yet, so this report makes no scientific claim; it verifies behaviour, labelling and robustness.

## Environment
- Hardware: Intel Core i5-1235U, Intel Iris Xe (driver 32.0.101.5542), 7.7 GB RAM, Windows 11, on battery.
- Browsers: Google Chrome and Microsoft Edge, headless with ANGLE D3D11, so the real GPU is used.
- Servers: `npm run dev` (React StrictMode active) and `vite preview` of the production build.
- Automation: Chrome DevTools Protocol scripts without extra dependencies; not yet part of the repository.
- Pre-checks: `npm run verify` PASS (lint, unit tests, data:check `scaffold`, build). After the review fixes: 38/38 unit tests.

## Results

| # | Check | Chrome | Edge | Notes |
|---|---|---|---|---|
| 1 | Fixture labels ("DATA DUMMY — BUKAN DATA NASA", "TERRAIN SINTETIS — BUKAN DEM NASA") | PASS | PASS | |
| 2 | Terrain rendered | PASS | PASS | 10 draw calls, 132,838 triangles/frame |
| 3 | Orbit drag / wheel zoom / "Peta Kawah" reset to the default view | PASS | PASS | Camera positions read from the scene |
| 4 | Site A via HUD card, site B via a real mouse click on the 3D marker | PASS | PASS | Marker position projected from the live camera |
| 5 | Drag starting on a marker does not change the selection | PASS | PASS | Weak browser evidence; the drag threshold is covered by a unit test |
| 6 | **Independent angle test:** rendered Sun light and Earth-line directions vs. the dataset formulas at h = 0, 1, 35, 71 | PASS | PASS | Δ < 0.01°. Re-derived from the rendered objects with a separately written formula. Checks scene ↔ data consistency only, **not** real ephemeris accuracy |
| 7 | HUD Sun text equals the rendered values | PASS | PASS | |
| 8 | Compass: "90° T" right of "270° B" in the default view (north = −Z) | PASS | PASS | |
| 9 | Play advances time, pause stops it | PASS | PASS | |
| 10 | Rapid input (30 time steps + 20 site toggles) | PASS | PASS | No errors |
| 11 | Viewport resize → canvas follows | PASS | PASS | |
| 12 | Phone 390×844@3: HUD collapsed, touch tap on a 3D marker selects the site | PASS | PASS | |
| 13 | Manifest 404 → normal scaffold, no error banner | PASS | — | |
| 14 | Corrupt manifest → dummy data + visible "Data tim gagal dimuat" | PASS (after fix) | — | Was silent before the fix |
| 15 | Manifest `ready` but data files 404 → dummy data + visible error | PASS (after fix) | — | Was silent before the fix |
| 16 | `ready` QA fixture (marked "QA FIXTURE (bukan NASA)") | PASS | — | Details below |
| 17 | No WebGL: API removed / context creation fails / `--disable-3d-apis` | PASS | PASS (`--disable-3d-apis`) | Fallback panel is the only scene message; HUD still works |
| 18 | WebGL context loss and restore | PASS | not run | |
| 19 | Slow network (1 Mbps, 400 ms): content before JS loads | PASS (after fix) | — | Was a blank page before the fix |
| 20 | Console errors on the happy path | PASS (0) | PASS (0) | three.js logs "Error creating WebGL context" only in the no-WebGL scenario (expected) |
| 21 | Unexpected network 4xx/5xx | PASS (after fix) | PASS (after fix) | `/favicon.ico` 404 before the fix |

**#16 detail** — the `ready` QA fixture produced:
- The label "DATA TIM · lihat provenance".
- For a corrupt heightmap: a red synthetic-fallback badge stating the reason.
- A site without UV is not placed.
- A site without a horizon mask shows "mask tidak tersedia" and "tidak diketahui".
- Empty metrics are shown as "—".
- A sample without `sun_vector` has no light, and the HUD shows "tidak tersedia".
- A sample without `earth_vector` has no Earth line and the label "tidak diketahui".

## Findings (HUD design)

| Finding | Evidence | Guideline |
|---|---|---|
| Touch targets under 44×44 px on the phone layout | Planner/Explorer 28 px tall, Peta Kawah/Fokus Site 28 px, ⏮/⏭ 32×32, Bulan vs Bumi / Sembunyikan HUD 38 px tall | Minimum touch target 44×44 px |
| Text under 12 px | 9 px ×5, 10 px ×20, 11 px ×14 elements (phone, HUD open) | Body text ≥ 12 px |
| HUD offsets are fixed values that depend on the header text length | `src/App.jsx` HUD layout | |

## Fixes made during QA
- `index.html`:
  - Empty favicon (`data:,`) → no 404.
  - Static "Memuat SELENIS…" text inside `#root`, replaced by React on mount.
  - `<noscript>` message.
- `useEphemerisData.js` + `App.jsx` + `TopTelemetryBar.jsx`: a team-data load failure is shown in the header ("Data tim gagal dimuat (…) — menampilkan data dummy"). This covers a corrupt manifest, HTTP errors, missing files and files with the wrong schema. A missing manifest (404) still counts as normal scaffold.
- `LunarScene.jsx`: the `?debug=1` probe exposes the renderer, scene and camera, read-only, for these checks.
- After code review: when the 3D view fails, the fallback panel is the only message shown. Before, a loading notice and the terrain badge overlapped it.

## Blocked
- Real DEM terrain, real site coordinates, and Sun/Earth direction against a real ephemeris: waiting for team data.
- Azimuth frame at the south pole (local true north vs tile grid north): open item in `docs/data-contract.md`. The 3D badge states that north is not yet verified.

## Not tested
- Real phone or tablet hardware: only emulation on the laptop GPU.
- Firefox and Safari.
- Screen reader.
- Keyboard-only selection beyond the two HUD site cards (a 3rd+ site can only be selected in 3D).
- Memory trend across repeated mount/unmount.
- Exact React StrictMode listener counts (only indirect evidence: no errors or duplicate behaviour in dev).
- `prefers-reduced-motion`.
- FPS on a low-power phone GPU.

Screenshots are kept locally by the 3D team and are available on request; they are not committed.
