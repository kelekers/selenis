# P03 — Correct solar/Earth math and invalid-data behaviour
Model: **Opus 5.5**, effort **high**. Relevant skills if installed: `threejs-lighting`, `threejs-debugging`. Fable is NOT default.

Inspect `src/utils/shadowMath.js`, `SunLighting.jsx`, `SiteMarkers.jsx`, `useEphemerisData.js`, `docs/data-contract.md` and current P01 audit. Current implementation uses −Z north; draft suggests +Z north. **Do not flip axes without team-approved frame decision**. Implement deterministic unit tests for 0/90/180/270 azimuth, 0/90 elevation, seam across 360°, invalid/missing values, missing horizon mask, unknown DTE, timestamp missing or outside range. Never interpret missing data as 0° horizon or substitute arbitrary Sun/Earth angles as real telemetry. Distinguish *geometric direction*, *terrain-mask visibility*, and actual *DTE link quality*.

Focus on safe correctness changes and clear unknown/unavailable UI rather than building a physically invalid approximation. Coordinate shared hook/`App.jsx` edits with teammate owners. Before edits report exact file/test list; afterward run `npm run verify` and show math evidence. Stop if real observer frame/projection required and not approved.
