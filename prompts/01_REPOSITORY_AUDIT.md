# P01 — Read-only audit of REAL 3D baseline, not a new project
Model: **Opus 5.5**, effort **medium**. Skills: optionally `threejs-r3f` + `threejs-debugging`, if actually installed.

Read `CLAUDE.md`, `docs/PRD.md`, `docs/data-contract.md`, `docs/QA_CHECKLIST.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/CONTEXT_HANDOFF.md`, `package.json`, and actual files `src/components/3d/*.jsx`, `src/utils/shadowMath.js`, `src/hooks/useEphemerisData.js`, `src/mocks/mockDataset.js`, and `src/App.jsx`.

**Do not edit any file, install packages, push or create a branch.** Source code is already present from teammates. Audit FR-01…FR-21 and classify each implemented / partial / fixture-only / blocked by missing team data / missing. Review: shadowMath +Z/-Z dispute and wrap around 360°, missing mask as 0, numeric NaN, 8-bit heightmap and datum, silent procedural fallback, Sun/Earth invented defaults, fixture labelling, WebGL/loading/error states, OrbitControls, camera reset, memory/performance, React ownership.

Provide (1) critical findings with path:line and evidence, (2) which files belong to Member 3 versus teammate, (3) contract questions to send Members 1/2/4/6, (4) smallest safe P02 fix plan plus exact tests. Under 900 words. Stop before implementation.
