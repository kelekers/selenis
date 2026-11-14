# SELENIS — Handoff (P00 baseline 2026-11-14; refresh after each session)

## Current branch / version
- Shared branch: `feat/web-app`, HEAD `7acb426`, equal to `origin/feat/web-app` (checked with `git fetch` in P00). Re-run `git status -sb` before edits.
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

## Next action
- P01 full audit was skipped (only the terrain part was audited inside P02). Next: P03 solar (Opus high, `threejs-lighting` + `threejs-debugging`), or run P01 first for the non-terrain FRs.
- Before commit: review `git diff`, stage only own files (`src/utils/terrainMath.js`, `scripts/terrain-math.test.mjs`, `src/components/3d/{LunarTerrain,LunarScene,SiteMarkers}.jsx`, this handoff), team approval before push.

## After every implementation turn
Update: files changed, data real/fixture, `npm run verify` results, browser evidence, unresolved blockers and next safe change.
