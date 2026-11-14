# P02 — Harden EXISTING terrain, keep fixture visibly synthetic
Model: **Sonnet 5.5**, effort **medium**. Relevant skills if installed: `threejs-geometry`, `threejs-r3f`.

Read existing `LunarTerrain.jsx`, `LunarScene.jsx`, `SiteMarkers.jsx`, `mockDataset.js`, `src/utils/shadowMath.js`, `docs/PRD.md`, `docs/data-contract.md`, P01 findings. **Do not rebuild the scene or invent a DEM.**

Deliver smallest safe changes in Member 3 scope: (a) clearly label fixture / unavailable real DEM / unsuccessful asset load in UI (coordinate shared App changes with Member 4), (b) explicit loading/error and safe fallback semantics, (c) height decode and UV-to-world tests for currently supported fixture schema, (d) prepare a small adapter for later REAL DEM format without inventing agreed encoding, datum, CRS or data. Do not silently treat 8-bit lossy WebP as precise numeric elevation. Handle stale image load/disposal.

Before editing list files and test cases. If user has not approved team-owned/shared edits, leave a proposed patch and continue with isolated tests. Run `npm run verify` and a browser smoke test; report actual outputs, fixture state, blockers and changed lines. Update handoff only after tests.
