# P00 — Baseline, safe documentation reconciliation (no source edits)
Model: **Sonnet 5.5**, effort **medium**. Skills: **none**.

You are working in the ALREADY FETCHED / PULLED team repo `kelekers/selenis`, shared branch `feat/web-app`. **Do not run git init, clone, new branch, reset, git clean, install new skills, commit, or push.**

1. Read `CLAUDE.md`, `docs/MODEL_SKILL_PLAYBOOK.md`, `docs/PRD.md`, `docs/data-contract.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/CONTEXT_HANDOFF.md`, `README_START_HERE.md`, `package.json`, and `git status -sb`.
2. Check actual current branch/commit and installed dependency names, current source tree, manifest scaffold and whether real DEM exists. Inspect the user's `npm run verify` output or run existing commands ONLY if Node 24 installed and permission allowed. Do not claim a test pass unless it actually ran.
3. Report any outdated docs, then propose minimal exact doc-only edits **before changing anything**. Do not overwrite the existing team-owned `docs/data-contract.md` or the 3D code.
4. Once approved, update only stale factual statements in docs; preserve unresolved data contracts as DRAFT. Record snapshot and test outputs in `docs/CONTEXT_HANDOFF.md`.
5. Print changed files and `git diff --check`; do not commit or push.

Output: concise baseline table, open team decisions, documentation diff summary, and readiness to move to P01.
