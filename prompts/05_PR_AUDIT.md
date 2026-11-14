# P05 — Final review and HANDOFF of Member 3 on shared `feat/web-app`
Model: **Opus 5.5**, effort **high**. Optional read-only `.claude/agents/selenis-3d-reviewer.md` for independent findings; optional targeted `superpowers` verification.

This team works together on **shared branch `feat/web-app`**. Do NOT assume I own all changes on that branch. Do not create a new branch or PR to `main`, commit, merge, or push without explicit approval. Inspect `git status -sb`, `git diff --check`, `git diff` and staged diff; check own changes relative to recorded baseline `7acb426` but distinguish teammates' newer commits. Review PRD, data-contract DRAFT, QA checklist, handoff, current code, lockfile, manifest, console logs and asset citations.

Run all available tests (`npm run verify`; browser QA where possible), request the read-only 3D reviewer and classify critical/major/minor. Check no synthetic metrics misrepresented as NASA; no known incorrect coordinate mapping; no secrets, `.env`, PDFs, huge DEM, test screenshots or unintended source. Document demo limitations and any unapproved data-contract changes.

Output: (1) specific changes owned by Member 3, (2) tests actual outcomes, (3) remaining science blockers, (4) exact stage/commit commands for APPROVED files only, (5) message to team reviewing before push to feat/web-app. Stop without executing Git write actions.
