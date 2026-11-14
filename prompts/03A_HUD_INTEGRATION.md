# P03A — Integrate existing scene with shared HUD/site/time (team coordination)
Model: **Sonnet 5.5**, effort **medium**. Relevant skills: `threejs-interaction`, optional `react-best-practices`.

Read current `App.jsx`, `useEphemerisData.js`, `LunarScene.jsx`, `SiteMarkers.jsx`, `docs/PRD.md`, `docs/data-contract.md`. Inspect teammate changes on shared branch. Propose a minimal props/event contract for selected site, UTC timestamp, date changes, and camera reset. Avoid double-owning state. Existing scene already uses `activeEphemeris` indexed by array; do not silently replace it with speculative schema.

**Before changing `App.jsx`, shared hook or team data schema, ask for explicit integration agreement from Member 4/6**. If not agreed, implement adapters/tests or provide an exact interface proposal only. Add interaction regression tests and manual verification instructions; run available checks. Do not redesign HUD (Member 4 owns it).
