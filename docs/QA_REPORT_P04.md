# QA Report P04 — Browser quality gate (Anggota 3)

**Date:** 2026-11-14. **Branch:** `feat/web-app` (local, not pushed).
**Data:** all **fixture/dummy**; no NASA DEM or ephemeris available, so no scientific claim is tested here.

**Environment**
- Hardware: HP 14s, i5-1235U, Intel Iris Xe (driver 32.0.101.5542), 7.7 GB RAM, Windows 11, on battery.
- Browsers: Chrome and Microsoft Edge, both headless with ANGLE D3D11, so the real GPU is used.
- Servers: `npm run dev` (React StrictMode active) and `vite preview` of the production build.
- Automation: CDP scripts without extra dependencies, kept in the session scratchpad, not in the repo. `playwright-cli` is not installed.
- Skills used: `webapp-testing`, `threejs-testing`, `ui-ux-pro-max` (touch-target / font-size rules).

**Pre-checks:** `npm run verify` PASS (lint, 37/37 tests, data:check `scaffold`, build). Dev server ready in 405 ms.

## Results

| # | Check | Chrome | Edge | Notes |
|---|---|---|---|---|
| 1 | Fixture labels ("DATA DUMMY — BUKAN DATA NASA", "TERRAIN SINTETIS — BUKAN DEM NASA") | PASS | PASS | |
| 2 | Terrain rendered | PASS | PASS | 10 draw calls, 132,838 triangles/frame |
| 3 | Orbit drag / wheel zoom / "Peta Kawah" reset to (0, 13, 17) | PASS | PASS | Camera positions read from the scene |
| 4 | Site A via HUD card, site B via a real mouse click on the 3D marker | PASS | PASS | Marker position projected from the live camera |
| 5 | Drag starting on a marker does not change the selection | PASS | PASS | Weak browser evidence (the orbit moves the marker); threshold covered by a unit test |
| 6 | **Independent angle test:** rendered DirectionalLight and Earth-line directions vs. the dataset formulas at h = 0, 1, 35, 71 | PASS | PASS | Δ < 0.01°. az/el re-derived from rendered objects with a separately written formula. Checks scene ↔ data consistency only, **not** real ephemeris accuracy |
| 7 | HUD Sun text equals rendered values | PASS | PASS | |
| 8 | Compass: "90° T" right of "270° B" in the default view (north = −Z) | PASS | PASS | |
| 9 | Play advances time, pause stops it | PASS | PASS | |
| 10 | Rapid input (30 time steps + 20 site toggles) | PASS | PASS | No errors |
| 11 | Viewport resize → canvas follows | PASS | PASS | |
| 12 | Phone 390×844@3: HUD collapsed, touch tap on 3D marker selects site | PASS | PASS | |
| 13 | Manifest 404 → normal scaffold, no error banner | PASS | — | |
| 14 | Corrupt manifest → dummy data + visible "Data tim gagal dimuat" | PASS (after fix) | — | Was silent before the fix |
| 15 | Manifest `ready` but data files 404 → dummy data + visible error | PASS (after fix) | — | Was silent before the fix |
| 16 | `ready` QA fixture (marked "QA FIXTURE (bukan NASA)") | PASS | — | Details below the table |
| 17 | No WebGL: API removed / context creation fails / `--disable-3d-apis` | PASS | PASS (`--disable-3d-apis`) | Fallback panel; HUD still works |
| 18 | WebGL context loss and restore | PASS (P03B) | not run | |
| 19 | Slow network (1 Mbps, 400 ms): content before JS loads | PASS (after fix) | — | Was a blank page before the fix |
| 20 | Console errors on the happy path | PASS (0) | PASS (0) | three logs "Error creating WebGL context" only in the no-WebGL scenario (expected) |
| 21 | Unexpected network 4xx/5xx | PASS (after fix) | PASS (after fix) | `/favicon.ico` 404 before the fix |

**#16 detail** — the `ready` QA fixture produced:
- The label "DATA TIM · lihat provenance".
- For the corrupt heightmap: a red synthetic-fallback badge stating the reason.
- The site without UV is not placed.
- The site without a horizon mask shows "mask tidak tersedia" and "tidak diketahui".
- Empty metrics are shown as "—".
- A sample without `sun_vector` has no light and the HUD shows "tidak tersedia".
- A sample without `earth_vector` has no Earth line and the label "tidak diketahui".

## Findings (not fixed: design scope of Anggota 4)

| Finding | Evidence | Rule |
|---|---|---|
| Touch targets under 44×44 px on the phone layout | Planner/Explorer 28 px tall, Peta Kawah/Fokus Site 28 px, ⏮/⏭ 32×32, Bulan vs Bumi / Sembunyikan HUD 38 px tall | ui-ux-pro-max §2 (min 44×44) |
| Text under 12 px | 9 px ×5, 10 px ×20, 11 px ×14 elements (phone, HUD open) | ui-ux-pro-max §6 |
| HUD offsets are fixed values that depend on header text length | See APPROVAL_NOTES #10 | |

## Fixes made in P04 (cross-owner, recorded in APPROVAL_NOTES #11–#12)
- `index.html`:
  - Empty favicon (`data:,`) → no 404.
  - Static "Memuat SELENIS…" text inside `#root`, replaced by React on mount.
  - `<noscript>` message.
- `useEphemerisData.js` + `App.jsx` + `TopTelemetryBar.jsx`: new `dataError` value.
  - A team-data load failure is shown in the header ("Data tim gagal dimuat (…) — menampilkan data dummy").
  - It covers a corrupt manifest, missing files, files with the wrong schema, and HTTP errors.
  - A missing manifest (404) still counts as normal scaffold.
- `LunarScene.jsx` (A3): the `?debug=1` probe now also exposes the scene and camera, read-only, for these QA checks.

## Blocked
- Real DEM terrain, real site coordinates, Sun/Earth direction against a real ephemeris: no team data yet (Anggota 1/2).
- Azimuth frame at the south pole (local north vs tile grid north): see the BLOCKER in `docs/CONTEXT_HANDOFF.md`.

## Not tested
- Real phone or tablet hardware: only emulation on the laptop GPU.
- Firefox and Safari.
- Screen reader.
- Keyboard-only selection of sites beyond the two HUD cards. A 3rd+ site can only be selected in 3D: a finding for A4 (site list).
- Memory trend across repeated mount/unmount.
- Exact StrictMode listener counts. Only indirect evidence: no errors or duplicate behaviour in dev StrictMode.
- `prefers-reduced-motion`.
- FPS on a low-power phone GPU.

## Screenshots (Anggota 3's local session scratchpad; not committed — ask Anggota 3 for copies)
- `p04-chrome-happy-initial.png`, `p04-chrome-happy-end.png`, `p04-edge-happy-*.png`
- `p04-*-mobile-initial.png`, `p04-*-mobile-hud.png`
- `p04-chrome-data-fixture.png`
- `p03b-*.png` (no-WebGL, context loss, shadow at hour 0/71)
