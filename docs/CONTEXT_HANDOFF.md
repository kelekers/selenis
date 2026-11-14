# SELENIS — Handoff (updated after P05 review, 2026-11-14; refresh after each session)

## Current branch / version
- Shared branch `feat/web-app`. Local Anggota 3 commits are **not pushed**. Base is `origin/feat/web-app` = `7acb426` (fetched 2026-11-14): `3fc87c5` docs/workflow (P00), `6529f06` DRAFT data-contract section, `af68525` P02 terrain, `0e6a3e0` P03 solar/Earth, `5d02248` P03A integration. `41fcd7c` P03B resilience/performance. `de57715` P04 QA. P05 review fixes committed (user-approved) after `de57715`. Check with `git log origin/feat/web-app..HEAD`. Push only after team review of `docs/APPROVAL_NOTES.md`.
- Node 24.19.0 / npm 11.17.0 active. React 18.3.1, R3F 8.18.0, Three 0.187.0, Drei ^9.122.0, Tailwind ^4.3.5, Vite 8.3.8. No dependency changes.
- All rendered data is **fixture/dummy** (`public/data/manifest.json` = `scaffold`, no DEM in `public/textures/`).

## Prompt status
| Prompt | Status |
|---|---|
| P00 baseline/doc sync | done (`3fc87c5`) |
| P01 full audit | **not run** (terrain/solar/HUD parts audited inside P02/P03/P03A) |
| P02 terrain | done (`af68525`) |
| P03 solar/Earth | done (`0e6a3e0`) |
| P03A HUD integration | done (`5d02248`); cross-owner edits listed in `docs/APPROVAL_NOTES.md` |
| P03B resilience/performance | done (`41fcd7c`) |
| P04 browser QA | done (committed) — see `docs/QA_REPORT_P04.md` |
| P05 PR audit | done; fixes committed; waiting for team review before push |

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

## P03B resilience & performance (2026-11-14)
**Changes**
- `src/components/3d/SceneFallback.jsx` (new): `SceneErrorBoundary` around the R3F canvas + `SceneFallbackPanel` ("TAMPILAN 3D TIDAK TERSEDIA" / "WEBGL 2 TIDAK TERSEDIA", says no terrain is shown, HUD keeps working, "Coba lagi").
- `src/utils/renderQuality.js` (new): `detectWebGL2` (API presence only — no probe context), `maxRenderDpr` (cap 2), `stepDpr` (±0.5 within [1, max]), `describeRenderFailure`.
- `LunarScene.jsx`:
  - Canvas is mounted after 2 rAF and shows the notice "Menyiapkan tampilan 3D…".
  - Adaptive DPR via drei `PerformanceMonitor` (already installed; `flipflops=3` → fallback DPR 1).
  - WebGL context lost/restored notice; shadow map re-rendered on restore.
  - `?debug=1` exposes `window.__SELENIS_DEBUG__()` (renderer counters) and `__SELENIS_GL__` for QA scripts.
  - Terrain badge moved above the mobile timeline (`bottom-44 lg:bottom-28`).
- `SunLighting.jsx`: shadow map updated **on demand** (`autoUpdate=false`, `needsUpdate` on light direction / frustum / terrain change). Markers do not cast shadows and the shadow camera does not depend on the view camera.
- `App.jsx` (A4, see APPROVAL_NOTES #10): responsive HUD offsets; HUD collapsed by default below 1024 px.
- `scripts/render-quality.test.mjs`: 4 tests.

**Measured** (HP 14s, i5-1235U, Iris Xe 32.0.101.5542, 7.7 GB, on battery; Chrome headless + ANGLE D3D11 = real GPU; production build via `vite preview`; cache disabled; 5 s rAF sample after a 3 s warm-up; CDP scripts kept in the session scratchpad, not in the repo)
- BEFORE (`5d02248`) vs AFTER (adaptive DPR + deferred canvas), 3 alternating runs each:
  - @1x: FCP 1.73 vs 1.56 s, terrain ready 2.82 vs 2.33 s, p50 16.7 / p95 ≈17 ms for both.
  - @2x: FCP 1.75 vs 2.06 s, p50 16.7 / p95 33.4 ms for both.
  - → **no significant difference** (within noise).
- Shadow every-frame vs on-demand, 3 runs each:
  - @2x: p95 **33.2–33.6 → 17.1–17.5 ms**, max 50–67 → 18–34 ms, FPS 47–55 → 58.6–60.
  - Triangles per frame 263,910 → 132,838; draw calls 11 → 10.
  - @1x: both 60 FPS.
  - Visual check: identical image at hour 71 for both builds; shadows change between hour 0 and hour 71.
- Adaptive DPR, seen in an earlier throttled session (machine state differed — those absolute numbers are NOT comparable): at 2x the monitor stepped DPR 2→1 and p50 went 83→36 ms.
- Measurement caveats:
  - A trivial page's first paint took 5.1 s in one headless session, so FCP values from headless are unreliable.
  - Results vary strongly with the laptop's power state.
  - No real phone was tested (mobile = emulation 390×844@3 on the laptop GPU).
  - Heap 12–19 MB (`performance.memory`, partial evidence only).
- Bundle: JS 1,111.5 kB (gzip 305.7 kB), +6 kB gzip vs P03A.

**Resilience checks (CDP, all PASS)**
- `delete window.WebGL2RenderingContext` → "WEBGL 2 TIDAK TERSEDIA" panel, no canvas, HUD time step works.
- `getContext('webgl2')` forced to null, and the real Chrome flag `--disable-3d-apis` → boundary panel "Konteks WebGL tidak dapat dibuat", HUD works. three logs "Error creating WebGL context" (expected).
- `WEBGL_lose_context.loseContext()` → notice shown, HUD works; `restoreContext()` → notice cleared, draw calls resume (10).
- Mobile 390×844 and tablet 768×1024: HUD collapsed at start; terrain badge above the timeline; opened panel sits between header and timeline (mobile 240–668 px); no horizontal overflow.
- P03A interaction smoke on the production build: 14/14 PASS.

**Not done / limits**
- No frame-time instrumentation on a real phone.
- `frameloop="demand"` not adopted: Stars twinkle and camera damping need continuous frames. Worth revisiting after the restyle.
- Bundle code-splitting not done (single 1.1 MB chunk).
- Fixed HUD offsets depend on header text length (A4 layout).

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
- P03A/P03B: the user authorised editing teammates' files directly and recording every such change for later approval (`docs/APPROVAL_NOTES.md`). Commits stay local; no push without an explicit OK.

## P04 browser QA (2026-11-14) — summary
- Full report: `docs/QA_REPORT_P04.md`.
- Chrome + Edge, real GPU, dev (StrictMode) and production build: all functional checks PASS.
- Independent angle test PASS: rendered Sun light and Earth line vs dataset formulas at h = 0/1/35/71, Δ < 0.01°.
- Data-failure scenarios PASS: manifest 404 / corrupt, files 404, `ready` QA fixture with corrupt heightmap, site without UV, missing mask, missing vectors.
- No-WebGL PASS in Chrome and Edge. Slow network PASS.
- Fixed in P04 (APPROVAL_NOTES #11–#12):
  - favicon 404 and a blank page on slow networks (`index.html`);
  - a silent team-data failure, now `dataError` in the header;
  - `?debug=1` now also exposes the scene/camera.
- Findings for A4: touch targets < 44 px and text < 12 px on phone (ui-ux-pro-max §2/§6); only 2 sites can be selected without the 3D view.
- Not tested: real phone, Firefox/Safari, screen reader, memory trend, reduced motion.
- Skills installed this session (user level, reviewed first; see memory `feedback-use-relevant-skills`):
  - mattpocock (39 skills; `code-review` renamed `mattpocock-code-review`), `find-skills`, `karpathy-guidelines`, ui-ux-pro-max family (7).
  - `graphify` 0.9.108 (uv tool; adds 3 lines to the global `~/.claude/CLAUDE.md`; backup at `CLAUDE.md.bak-before-graphify`).

## P05 review (2026-11-14)
Reviewers:
- `selenis-3d-reviewer` (read-only, science/3D).
- `mattpocock-code-review`: Standards and Spec sub-agents, each with a fresh context.
Every finding below was checked against the code (bug 4 also on a screenshot) before acting.

**Fixed (committed after user approval):**
- Error boundary + loading notice overlapped. When the 3D scene failed, "Menyiapkan tampilan 3D…" covered the fallback panel and the badge stayed on "Memuat terrain…" forever. The P03B test missed this; the test now asserts the fallback is the only scene message (`SceneFallback.jsx`, `LunarScene.jsx`).
- Disclosure added to the badge:
  - "Utara = sumbu −Z tile (belum diverifikasi thd proyeksi)".
  - "Warna garis Bumi = pratinjau horizon mask, bukan status DTE".
- Metric DEM path (`terrainMath.js`, `LunarTerrain.jsx`):
  - nearest-neighbour resampling (no blending of no-data sentinels);
  - alpha < 255 counts as no-data;
  - reference height from the declared range, else from the decoded data, never from fixture constants;
  - badge warnings when tile size or elevation range is assumed, or the image aspect ≠ tile aspect (`terrainAssumptions`).
  - +1 test (38/38).
- Cleanup:
  - Removed `uvToTerrainXZ`, orphaned by P02.
  - Canvas camera uses `OVERVIEW_POS`.
  - `hudModel` reuses `normalizeAzimuth` and the shared `cleanHorizonMask`, so the chart and the line-of-sight check cannot disagree.
- A4 files (APPROVAL_NOTES #13–#14): timeline button titles; Explorer eclipse-hours formatting.
- Docs: APPROVAL_NOTES evidence line updated and `.gitignore` row #0 added; QA report no longer contains a local scratchpad path.
- Re-verified:
  - `npm run verify` PASS: lint, 38/38 tests, build.
  - Chrome dev happy path (angles, no console errors or 404s); data fixture; no-WebGL in Chrome and Edge; context loss; mobile badge fits (546–668 px, timeline at 689).

**Open (not fixed; owners noted):**
| Severity | Item | Owner |
|---|---|---|
| Major (blocked) | Azimuth frame at the south pole: `northOffsetDeg` not wired (needs approved projection + observer frame) | A1 + A2 |
| Major | Timeline/ephemeris index-based; hourly labels "T+…h", "Jam ke-"; `ephemerisAtTime` unused at runtime (FR-09) | A1 + A4 (shared state) |
| Major | `ready` badge says "lihat provenance" but no provenance UI exists (FR-13); hook ignores manifest assets; absolute `/data/` URLs ignore the Vite base | A6 |
| Minor | FR-17 companion site not highlighted; only `sites[0..1]` keyboard-selectable (FR-16) | A4 + A3 |
| Minor | Shadow-frustum relief margin fixed (4 km); camera far 250, Stars, Earth line length and site offset not scaled for large tiles; compass labels fixed at 10.8 (`CompassRing`, baseline) | A3 (when a real tile exists) |
| Minor | Camera re-frames on terrain reload in site view; context-loss listener on Canvas unmount via "Coba lagi" not verified | A3 |
| Minor | `?debug=1` globals in production build (kept for QA; read-only use) | A3 / A6 decision |
| Minor | `ContrastPanel` science claims uncited; HUD touch targets < 44 px and text < 12 px; `h-screen` vs `dvh`; `HorizonPanoramaChart` clamps elevation to −2..10° | A4 |
| Info | Speculative-generality smells: `ephemerisAtTime`/slerp/`northOffsetDeg` only in tests (kept as prepared adapters per P03); repeated tri-state colour cascade; tile width/depth data clump | A3 later |
| Process | CDP QA scripts not in the repo (P04 asked for reproducible steps); StrictMode/resource-count check (AC-07) not measured | A3 + A6 |

## Next action
- User: approve committing the P05 fixes, then the team reviews `docs/APPROVAL_NOTES.md` (#0–#14) before any push to `feat/web-app`.
- Then: restyle (A4 + `frontend-design` / `ui-ux-pro-max`), or wire `timestampUtc` + `ephemerisAtTime` once A1/A4 agree.

## After every implementation turn
Update: files changed, data real/fixture, `npm run verify` results, browser evidence, unresolved blockers and next safe change.
