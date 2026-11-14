# SELENIS 3D — Milestone plan

Status: **existing scaffold is implemented but NOT validated** at commit `7acb426`. Do not reinitialize or rewrite existing 3D components. Each milestone means audit/harden/integrate the current implementation. Do not start phase N+1 until the relevant phase acceptance checks pass, except for independent work explicitly unblocked by missing team data.

## M0 — Baseline and contracts (PARTIAL: Git synced, contracts DRAFT)
- Confirm clone, feature branch, framework versions, build scripts, package manager.
- Draft and approve data contracts.
- Set up reproducible fixture data with loud `FIXTURE / NOT REAL NASA` label.
**Done when:** no ambiguous axis/scaling contract; base app builds.

## M1 — Terrain rendering (preview exists; real DEM integration BLOCKED)
- `LunarScene` + R3F canvas; load a DEM-derived tile; scale and transform reproducibly.
- Orbit/zoom/reset; loading/error state.
- Unit tests for height decode, sampled altitudes and site projection; compare rendered terrain with trusted reference.
**Done when:** at least one real DEM tile loads and site markers align in spatial coordinates.

## M2 — Solar and Earth orientation (preview exists; data mapping UNVERIFIED)
- Use team ephemerides; interpolate timestamps safely, avoid invented values.
- Convert azimuth/elevation to scene direction with verified axis mapping.
- Directional sunlight + local shadows; Earth marker only if scientifically meaningful for visualization.
- Separate shader preview from data-derived horizon-masked illumination/DTE metrics.
**Done when:** known date/site sun/earth angles match precomputed values and time slider updates the scene.

## M3 — Site selection and HUD integration (basic buttons exist; shared contract pending)
- Unidirectional props for selected site, time, and mode.
- Callbacks and synchronised scene updates; compare Site A/B if agreed.
**Done when:** select site, adjust time, and reset camera can be exercised reliably in browser.

## M4 — Optimization and resilience (not validated)
- GPU profiling, limit geometric/texture memory, choose LOD based on realistic device budgets.
- Mobile fallback, WebGL-not-available UI, missing data state.
**Done when:** performance benchmark and asset loading pass agreed budgets on target devices; report measured values, not promises.

## M5 — Release QA and team review / commit (shared branch `feat/web-app`)
- lint, unit tests, build, smoke tests, visual screenshot comparison.
- provenance/attributions, Git diff review, PR description, no raw data/secrets.
**Done when:** teammate reviews the shared-branch diff (or an agreed PR workflow), no known critical defects, and all unresolved risks are documented. Do not push without coordination.
