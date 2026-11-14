# SELENIS — Handoff (updated after P03, 2026-11-14; refresh after each session)

## Current branch / version
- Shared branch: `feat/web-app`. Local commits **not pushed** (3 ahead of `origin/feat/web-app` at `7acb426`, fetched 2026-11-14): `3fc87c5` docs/workflow (P00), `6529f06` DRAFT data-contract section, `af68525` P02 terrain. P03 changes are uncommitted in the working tree. Push only after team approval.
- Commits since starter-kit snapshot `4e9f04a` (teammates, author `unknown`): `2cdffcd` HUD (Lander POV chart, micro-shift card, mode toggle), `7acb426` compass ring, site camera focus, responsive HUD.
- Node engine: >=24 <25 (`.nvmrc` 24.19.0). React 18.3.1, R3F 8.18.0, Three 0.187.0, Drei ^9.122.0, lucide-react ^1.72.0, Tailwind ^4.3.5, Vite 8.3.8 (package.json).
- Do not mistake the existence of code for scientific validation. Existing 3D/HUD code was authored by teammates; Anggota 3 has no commits yet.

## Existing implementation (baseline, not finished)
- `src/components/3d/LunarScene.jsx`: R3F canvas + OrbitControls; site camera focus (from `7acb426`).
- `src/components/3d/CompassRing.jsx`: 3D azimuth compass ring (new in `7acb426`; orientation not yet verified against axis contract).
- `LunarTerrain.jsx`: 8-bit red-channel image displacement, procedural fallback; real DEM encoding unverified.
- `SunLighting.jsx`: directional light and default synthetic angles.
- `SiteMarkers.jsx`: UV-positioned markers, Earth direction fallback.
- `src/utils/shadowMath.js`: -Z north, horizon mask interpolation with missing mask default zero.
- `src/hooks/useEphemerisData.js`: mock timeline + loads static manifest/data when available.
- `src/components/hud/` (Anggota 4): `TimelineScrubber`, `TopTelemetryBar`, `HorizonPanoramaChart`, `MicroShiftDeltaCard`, `ContrastPanel`. `TopTelemetryBar` shows "NASA DATA LIVE" when manifest status is `ready`.
- `public/data/manifest.json`: `scaffold`, assets empty. `public/textures/`: only `.gitkeep`, no real DEM. All rendered data is mock/fixture.

## Local working tree
- Modified tracked: `.gitignore` (+`docs/reference-local/`, +`.claude/settings.local.json`), `docs/data-contract.md` (merged scientific DRAFT section).
- Untracked: `CLAUDE.md`, `README_START_HERE.md`, `CARA_PAKAI_PATCH_INI.md` (one-off patch instructions; decide delete/ignore), `docs/{CONTEXT_HANDOFF,IMPLEMENTATION_PLAN,MODEL_SKILL_PLAYBOOK,PRD,PROJECT_BRIEF,QA_CHECKLIST,REFERENCES}.md`, `prompts/`, `.claude/`.
- Nothing committed. Do not `git add .` until diff reviewed and team agrees.

## Verified local tests (P02, 2026-11-14)
- `node --version` → **v24.19.0**, npm 11.17.0. `npm ci` → 224 packages added, 0 vulnerabilities (warning: `three-mesh-bvh@0.7.8` deprecated, transitive via drei).
- Baseline `npm run verify` before P02 edits: PASS (lint, 1/1 test, data:check scaffold, build).
- After P02: `npm run verify` PASS — lint clean, **11/11 tests**, data:check `scaffold`, build OK (warning: JS chunk 1.09 MB > 500 kB).
- Browser smoke (headless Chrome + SwiftShader, `npm run dev` port 5179, StrictMode on): desktop 1440×900 renders terrain, 2 markers, DTE line, badge "TERRAIN SINTETIS — BUKAN DEM NASA"; no console errors. Pre-existing console warnings: `THREE.Clock deprecated`, `PCFSoftShadowMap removed → PCFShadowMap`, `THREE.Color alpha ignored`.
- Fallback check (temporary, reverted via `git checkout`): `heightmap_texture: '/textures/DOES_NOT_EXIST.webp'` → red badge "ASET DEM TIDAK DIPAKAI — TERRAIN SINTETIS · Gagal memuat …". Terrain still renders (fixture).
- Mobile 390×844: badge is hidden behind the HUD panels, which also overlap each other (pre-existing HUD layout, Anggota 4) → P03A/P03B.
- `playwright-cli` not installed (needs user approval for P04). Not tested: rapid source switching in-browser, real WebGL failure, real GPU FPS.

## P02 terrain changes (Anggota 3, uncommitted)
- NEW `src/utils/terrainMath.js` (pure): `isValidUv`, `uvToWorldXZ(uv, widthKm, depthKm)` (null instead of guessing centre), `resolveHeightEncoding` / `resolveTerrainSource` (adapter: no encoding → `visual-unverified`; 8-bit + `meters_per_unit` + `offset_m` → `metric-8bit`; >8-bit or invalid → `blocked`, fixture shown + label), `decodeHeights` (alpha 0 / declared nodata → NaN + mask), `filterNoDataTriangles` (holes, never fake height), `sampleTerrainHeight` (exact PlaneGeometry triangle surface), `describeTerrainStatus` (badge text).
- NEW `scripts/terrain-math.test.mjs`: 10 tests (UV validation, corners/centre incl. non-square, real `THREE.PlaneGeometry` vertex order + diagonal, fixture/metric decode, nodata, adapter, surface sampling, labels never say NASA/LIVE). Synthetic inputs only.
- `LunarTerrain.jsx`: `onStatusChange` (loading/ready/error + source fixture/asset/fallback), visible fallback with reason, stale image cancelled (handlers nulled, `src=''`), single geometry disposal owner, CORS/size/empty-image errors caught, `vertical_exaggeration` honoured, separate width/depth.
- `LunarScene.jsx`: `TerrainStatusBadge` DOM overlay (`data-testid="terrain-status"`, `role=status`); `planeDepth` = `area_height_km`; camera stays on overview if site UV invalid.
- `SiteMarkers.jsx`: sites without valid UV are not rendered; `planeDepth` support.
- NOT changed: `App.jsx`, HUD, `useEphemerisData.js`, `shadowMath.js` (`uvToTerrainXZ` now unused there), `mockDataset.js`, `data-contract.md`.
- **Proposed to Anggota 2 / data-contract (not applied):** `terrain_metadata.height_encoding = { bits_per_sample, meters_per_unit, offset_m, nodata_value?, lossy? }` + `vertical_exaggeration`; site `uv` = u west→east, v north→south (image rows), which is opposite to three.js texture v. Real 16/32-bit DEM needs a binary loader (format TBD).
- **Proposed to Anggota 4 (not applied):** `TopTelemetryBar` "NASA DATA LIVE" → "DATA TIM · lihat provenance"; give the terrain badge a reserved slot in the mobile HUD layout.

## User decisions (Anggota 3, 2026-11-14)
- **Strategy — "wadah dulu":** build the 3D website as a container now, using the existing mock/dummy data in `src/mocks/mockDataset.js`. Real data from Anggota 1/2 and HUD from Anggota 4 are plugged in later through adapters; do not wait on them. Dummy data must stay labelled as non-NASA.
- **Axis:** keep code's **−Z = north**, +X = east, +Y = up. Reason: with x=east and y=up, a right-handed frame (Three.js) forces north = −Z; the draft's +Z = north is a mirror image. Team confirmation still pending for `data-contract.md`.
- **Visibility source:** Sun/DTE status should come from data precomputed per site (data team). Browser `evaluateLineOfSight` stays only as a fixture-mode preview until that data exists.
- **Data label:** proposed rule — `manifest.status === 'scaffold'` → "DATA DUMMY — BUKAN DATA NASA"; `ready` → "DATA TIM · lihat provenance", never "NASA DATA LIVE" (data is static and precomputed, not live). `TopTelemetryBar` belongs to Anggota 4; coordinate the change.
- **UI request (teammate):** restyle to a modern "space" look in the spirit of SpaceX's site and the Dribbble "SpaceX Website Redesign" shot (reference only; no copying of brand assets). Planned within P03A/P03B after functional fixes. Live site: https://selenis-timorex.netlify.app/
- `CARA_PAKAI_PATCH_INI.md` is git-ignored.

## Blockers
- Environment: install/switch to Node 24.19.0, then `npm ci`, `npm run verify`, `npm run dev`, browser console check.
- Anggota 1: observer/site-specific ephemeris, frame/UTC/angles.
- Anggota 2: genuine DEM height encoding/datum/CRS, projection/site UV, horizon mask.
- Anggota 4: shared selectedSite/time props/events contract; `App.jsx` and HUD now actively edited by teammates.
- Anggota 6: static manifest/provenance, "NASA DATA LIVE" label gate, deployment approval.
- Explicit -Z north in implementation versus +Z north proposed in scientific draft. No team decision recorded.

## P03 solar/Earth changes (Anggota 3, uncommitted)
- `src/utils/shadowMath.js`: `normalizeAzimuth`, `isValidSkyVector`, `azElToUnitVector(az, el, northOffsetDeg=0)`, `unitVectorToAzEl`; `celestialToCartesian` returns null for invalid input. `getHorizonElevationAtAzimuth` returns **null** for missing/<2-sample masks (was 0°), cleans NaN/duplicate/365° samples, **fixes the 360° seam bug** (mask 5°…355°: az 0°/2° returned 1° instead of 3°/2.2°). `evaluateLineOfSight` is tri-state (true/false/null) with `basis: 'browser-horizon-mask-preview'`; it no longer crashes on a null `sun_vector`. Legacy keys kept. `uvToTerrainXZ` marked deprecated.
- NEW `src/utils/ephemerisMath.js`: strict UTC parse, point validation, `ephemerisAtIndex` (null out of range, no fallback to 0), `ephemerisAtTime` (exact / between-samples=null / out-of-range / invalid; interpolation **opt-in**, great-circle across 360°, never extrapolates). Not wired into the shared hook.
- `SunLighting.jsx`: no invented 140°/2.2° default. Missing Sun → neutral shadowless fill. Shadow frustum is sized from the tile diagonal and updated explicitly (`updateProjectionMatrix`): R3F 8.18 does not do this for `shadow-camera-*` props, and three only does it on shadow-map allocation.
- `SiteMarkers.jsx`: no invented 42°/3° Earth default (no line if missing); line colour tri-state (green above mask / red below / grey unknown). It shows geometric direction + mask preview, **not DTE link quality**.
- `LunarScene.jsx`: badge notes "Bayangan = pratinjau WebGL lokal, bukan horizon mask", "Arah Matahari/Bumi tidak tersedia", "Matahari di bawah bidang horizontal lokal".
- NEW `scripts/sky-math.test.mjs`: 10 tests (az 0/90/180/270, el ±90, unit length, invalid → null, north offset, round trip, seam, unsorted/duplicates, missing mask ≠ 0°, tri-state LOS, strict UTC, index/time bounds, opt-in interpolation, antipodal).
- Evidence: `npm run verify` PASS (lint clean, **21/21 tests**, data:check scaffold, build OK). Regression: old (`7acb426`) vs new `evaluateLineOfSight` + `celestialToCartesian` over the full mock timeline: 144 site×time samples, **0 differences** (Sun above mask 115/144, Earth above mask 45/144). Browser (headless Chrome): normal view unchanged + new note. Temporary `sun_vector: null` at hour 0 (reverted) → neutral light, no shadows, note shown, no crash.

## BLOCKER — azimuth frame at the south pole (needs Anggota 1 + 2)
Ephemeris azimuths are normally measured from LOCAL TRUE NORTH at the observer. On a south-polar stereographic tile, local north at a site is rotated relative to the tile's grid axis by roughly the site longitude (mock sites ≈129–130°E). The scene currently assumes scene −Z = local north (`northOffsetDeg = 0`). Until the observer frame (A1) and tile projection/grid north (A2) are approved, Sun/Earth directions in 3D are **not** geographically correct for a real tile. Do not hard-code a rotation without that approval.

## Proposed patches for teammates (NOT applied)
- **Anggota 4 — `HorizonPanoramaChart.jsx`:** handle `null`: `isSunVisible === null` → "Tidak diketahui" (not "Terhalang Kawah"); same for DTE; hide "El x° vs Rim y°" when either value is null (currently prints `El undefined° vs Rim null°`). Line 40 `item.earth_vector.azimuth_deg` crashes if any sample lacks `earth_vector` → `item.earth_vector?.…` and skip it. Rename "DTE Link Aktif" → "Bumi di atas horizon (pratinjau)", because this is not link quality.
- **Anggota 4 — `TimelineScrubber.jsx`:** show "Sun —" when `sun_vector` is missing (currently "Sun Az ° · El °").
- **Shared hook `useEphemerisData.js` (A4/A6):** `ephemeris.timeline[timeIndex] || ephemeris.timeline[0]` → `ephemerisAtIndex(ephemeris.timeline, timeIndex)` (no silent fallback to hour 0); later switch to `ephemerisAtTime` when shared state is a UTC timestamp.

## Next action
- Get answers on the azimuth-frame BLOCKER and the HUD/hook patches above.
- Next prompt: P03A HUD integration (Sonnet medium, `threejs-interaction`) — needs Anggota 4 agreement — or P03B resilience/performance (`threejs-performance`). P01 full audit is still not done.
- Before committing P03: review `git diff`, stage only `src/utils/{shadowMath,ephemerisMath}.js`, `scripts/sky-math.test.mjs`, `src/components/3d/{SunLighting,SiteMarkers,LunarScene}.jsx`, this handoff.

## After every implementation turn
Update: files changed, data real/fixture, `npm run verify` results, browser evidence, unresolved blockers and next safe change.
