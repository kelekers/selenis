# P04 — Real browser quality gate
Model: **Sonnet 5.5**, effort **medium**. Skill: `playwright-cli` if installed (otherwise browser manual workflow).

Do not claim tests performed without running them. First confirm `npm run verify` and `npm run dev` status. Use real Chrome/Edge or Playwright CLI to test initial fixture label, terrain render, controls/orbit, site A/B selection, timeline changes, Sun/Earth directions, missing/corrupt data, no-WebGL response, desktop/mobile viewport, browser console and network 404. Record screenshot path(s) and reproduction steps (save temporary media outside Git or ignored path). Confirm with an independent angle-unit test. Distinguish failures caused by expected missing real DEM from code defects.

List pass / fail / blocked / not tested. Fix only reproducible Member 3 defects, rerun affected checks and update `docs/CONTEXT_HANDOFF.md`. Never label fixture values verified NASA measurements.
