# SELENIS — Instructions for Claude Code

## Mission
SELENIS is TIMOREX's NASA Space Apps 2026 Lunar Landing Site Navigator: a browser-based 3D lunar south-pole landing-site explorer. We visualize NASA-derived terrain and precomputed celestial ephemerides to show illumination, direct-to-Earth visibility, and terrain hazards. This project is scientific software, not a fantasy moon scene.

## Scope for shared `feat/web-app` / Anggota 3
Own 3D WebGL terrain, site interaction, camera controls, sun/earth visualization and time-synchronized lighting. Existing components (`LunarScene`, `LunarTerrain`, `SunLighting`, `SiteMarkers`, `shadowMath`, `useEphemerisData`) are baseline team code up to commit `7acb426` (plus `CompassRing`; HUD in `src/components/hud/` is Anggota 4); inspect and extend them, never rebuild from scratch without evidence. Coordinate inputs with Anggota 1 (ephemerides), 2 (DEM/slope/horizon masks), 4 (HUD/timeline/site selection), and 6 (integration/deploy/QA). Avoid editing their work without coordination.

## Source of truth
1. Existing checked-in source code and package versions in this repo.
2. Team-approved `docs/data-contract.md` and real processed data with metadata.
3. Uploaded TIMOREX blueprint and NASA challenge documents, copied to local reference folder if permitted.
4. Current official Three.js, R3F, Vite, and NASA/JPL documentation.
If documents conflict, report the discrepancy; do not silently choose.

## First action of any new task
Inspect the relevant files and `docs/CONTEXT_HANDOFF.md`. Summarize scope, dependencies, proposed modifications, and acceptance tests before editing. For substantial work, create a short plan and execute only the agreed phase. Prefer narrowly scoped diffs.

## Engineering requirements
- Preserve the existing React/Vite/Three/R3F versions; check `package.json` before installing packages. Never change major versions without permission.
- Use R3F for rendering and reusable React components; use a single shared site/time state owned by the integration layer.
- NASA terrain geometry must use a documented projection, horizontal scale, vertical scale, datum, no-data handling, and orientation. Never claim visual exaggeration is metric elevation.
- Keep azimuth convention explicit: north 0°, clockwise east 90°, with a documented mapping to Three.js axes.
- The geometric WebGL shadow preview is not the source of scientific truth for long-range horizon occlusion; defer illumination/DTE metrics to team-approved precomputed horizon masks + ephemerides.
- Do not invent NASA observations, timestamps, coordinates, or numerical suitability metrics. Label synthetic fixtures and fallback datasets clearly.
- Handle loading, data errors, invalid assets, WebGL failure, and responsive layouts. Release and reuse GPU resources carefully; avoid per-frame React setState unless necessary.
- Implement deterministic checks for coordinate conversions, data mapping, null/NaN, timestamp interpolation, edge boundaries and regressions.

## Current collaboration contract
- We are currently using the team-shared branch `feat/web-app` by agreement. Do not create an extra branch or assume a PR to `main`; coordinate pushes/reviews with the team.
- Before changing `src/App.jsx`, `src/hooks/useEphemerisData.js`, `docs/data-contract.md`, or shared dependencies, report the intended change and coordinate with the relevant owner.
- Follow `docs/MODEL_SKILL_PLAYBOOK.md`; prompt files in `prompts/` are NOT automatic slash commands.
- The manifest is scaffold; no scientific DEM asset is currently available in the snapshot. Label ALL synthetic rendering/telemetry unambiguously.

## Workflow and safety
- Never push directly to `main`, force-push, reset teammates' commits, or delete existing shared project files without approval.
- Never commit credentials, .env, node_modules, build artifacts, large unapproved NASA raw files, or temporary screenshots.
- Never install dependencies, run downloaded scripts, or enable community skills without reviewing their source and obtaining approval for potentially risky actions.
- Do not use `--dangerously-skip-permissions` to bypass checks.
- Run applicable lint/tests/build and a real browser smoke test before saying a milestone is complete. Report exact command results and untested risks, not '100% no bugs'.
- Prefer Sonnet with medium effort for implementation; use Opus medium/high for contract or difficult geometry/astronomy decisions. Use Fable 5.2 only for escalated hard problems where Opus is insufficient. Reuse focused skills on demand and minimize unrelated context.

## Handoff format after each task
List changed files, behaviour, tests executed (pass/fail), datasets used (real/fixture), remaining issues, and next dependency. Update `docs/CONTEXT_HANDOFF.md`.

## Documentation Reading Priority

1. Read CLAUDE.md for permanent project instructions.
2. Read docs/PRD.md for product requirements.
3. Read docs/data-contract.md for scientific data interfaces.
4. Read docs/IMPLEMENTATION_PLAN.md for current milestones.
5. Consult docs/reference-local/ only when source verification is needed.
6. Never repeatedly read all reference PDFs without a specific reason.
7. Report conflicts between documents instead of silently resolving them.
