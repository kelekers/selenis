# SELENIS — Handoff (updated after P03A, 2026-11-14; refresh after each session)

## Current branch / version
- Shared branch `feat/web-app`. Local Anggota 3 commits are **not pushed**. Base is `origin/feat/web-app` = `7acb426` (fetched 2026-11-14): `3fc87c5` docs/workflow (P00), `6529f06` DRAFT data-contract section, `af68525` P02 terrain, `0e6a3e0` P03 solar/Earth. P03A is in the working tree (see below). Check with `git log origin/feat/web-app..HEAD`. Push only after team review of `docs/APPROVAL_NOTES.md`.
- Node 24.19.0 / npm 11.17.0 active. React 18.3.1, R3F 8.18.0, Three 0.187.0, Drei ^9.122.0, Tailwind ^4.3.5, Vite 8.3.8. No dependency changes.
- All rendered data is **fixture/dummy** (`public/data/manifest.json` = `scaffold`, no DEM in `public/textures/`).

## Prompt status
| Prompt | Status |
|---|---|
| P00 baseline/doc sync | done (`3fc87c5`) |
| P01 full audit | **not run** (terrain/solar/HUD parts audited inside P02/P03/P03A) |
| P02 terrain | done (`af68525`) |
| P03 solar/Earth | done (`0e6a3e0`) |
| P03A HUD integration | done in working tree; cross-owner edits listed in `docs/APPROVAL_NOTES.md` |
| P03B resilience/performance, P04 browser QA, P05 PR audit | next |

## What exists now (by area)
- **Terrain (P02):** `src/utils/terrainMath.js` (UV validation, decode + no-data holes, exact surface sampling, DEM encoding adapter: undeclared → visual only, >8-bit → blocked). `LunarTerrain` reports loading/ready/fallback/error; badge "TERRAIN SINTETIS — BUKAN DEM NASA" / red fallback badge.
- **Sun/Earth (P03):** `src/utils/shadowMath.js` (validated az/el → vector, `northOffsetDeg` hook, tri-state horizon-mask LOS, 360° seam fixed, missing mask = unknown, never 0°). `src/utils/ephemerisMath.js` (strict UTC, bounded lookup, opt-in great-circle interpolation). `SunLighting`: no invented angles; neutral shadowless fill when the Sun is unknown; shadow frustum from tile size (explicit `updateProjectionMatrix`). Earth line tri-state colour; it is not link quality.
- **Integration (P03A):**
  - `src/utils/hudModel.js`: formatters that render "—" instead of undefined/NaN, `dataModeBadge`, tri-state `visibilityLabel`, `resolveActiveSite` / `resolveCompanionSite`, `stepIndex` / `clampIndex`, haversine site distance (R = 1737.4 km), click-vs-drag threshold (6 px), seam-aware horizon polygon / sky track.
  - `src/utils/cameraMath.js`: `shouldReframe` (same-view press = reset; overview ignores site changes) and `cameraGoal`.
  - `App.jsx`: `cameraCommand {view, nonce}`.
  - Hook: null instead of silent fallback; `setTimeIndex` clamps.
  - `SiteMarkers`: invisible 0.55 km pick proxy (raycast ignores `visible`), hover cursor, drag > 6 px does not select. R3F 8 does not filter `delta` for `onClick`.
  - HUD files: null-safe, tri-state, honest labels; details in `docs/APPROVAL_NOTES.md` §1.

## Verified (P03A, 2026-11-14)
- `npm run verify`: PASS. Lint clean; **33/33 tests** (terrain 10, sky 10, hud-integration 12, data-gate 1); data:check `scaffold`; build OK (warning: JS chunk ≈1.09 MB > 500 kB).
- Interaction smoke test (headless Chrome + SwiftShader via a CDP script in the session scratchpad, not in the repo), 1440×900: **14/14 PASS**.
  - Dummy badge; latitude `89.4521°S` with no double sign; no "undefined"/"NaN" in page text.
  - A real mouse click on the 3D marker selects Site B and the header follows.
  - Orbit drag → "Peta Kawah" returns to the default view.
  - "Fokus Site" frames Site B.
  - Timeline step forward → 01:00; step back wraps to 2026-11-16 23:00 UTC.
  - Tri-state labels shown; dialog opens and Esc closes it.
  - No exceptions or console errors.
- Earlier evidence:
  - P02: fallback badge with a missing asset.
  - P03: old-vs-new visibility on 144 mock samples, 0 differences; `sun_vector: null` → neutral light, no crash.
- Not tested: mobile layout after P03A (HUD overlap known), touch input, real WebGL loss, real-GPU FPS, rapid terrain source switching.

## BLOCKER — azimuth frame at the south pole (needs Anggota 1 + 2)
Ephemeris azimuths are normally measured from local true north at the observer. On a south-polar stereographic tile, local north is rotated relative to the tile grid by roughly the site longitude (mock sites ≈129–130°E). The scene assumes scene −Z = local north (`northOffsetDeg = 0`). Sun/Earth directions are **not** geographically correct for a real tile until the frame and projection are approved. Do not hard-code a rotation without that approval.

## Other open items
- `docs/APPROVAL_NOTES.md`: per-member questions and the review table (A1 frame/time step, A2 projection/encoding/UV, A4 nine HUD/App/hook edits + ContrastPanel text sources + mobile overlap, A6 label gate/push).
- Axis decision −Z = north (code) vs +Z (draft contract): still not recorded as a team decision.
- Timeline UI assumes a 1-hour step ("Mundur 1 jam", "T+71h").
- Restyle ("modern space look") is planned after functional QA; no visual redesign done yet.

## User decisions (Anggota 3, 2026-11-14)
- "Wadah dulu": build the 3D container now with the mock data; plug in real data via adapters later; dummy data always labelled non-NASA.
- Axis: keep −Z = north, +X = east, +Y = up.
- Visibility source of truth = team-precomputed per-site data; browser LOS = preview only.
- Labels: `scaffold` → "DATA DUMMY — BUKAN DATA NASA"; `ready` → "DATA TIM · lihat provenance" (applied in P03A).
- P03A: the user authorised editing teammates' files directly and recording every such change for later approval (`docs/APPROVAL_NOTES.md`). Commits stay local; no push without an explicit OK.

## Next action
- P03B resilience/performance (`threejs-performance`): WebGL-unavailable fallback, loading state, error boundary around the Canvas, mobile HUD overlap, measured FPS/bundle size.
- Then P04 browser QA. `playwright-cli` needs install approval; otherwise reuse the CDP approach.

## After every implementation turn
Update: files changed, data real/fixture, `npm run verify` results, browser evidence, unresolved blockers and next safe change.
