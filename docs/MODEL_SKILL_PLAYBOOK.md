# SELENIS TIMOREX — Single source of truth: Anggota 3 workflow

**Snapshot basis:** `Selenis(1).zip` after `git pull --ff-only`, branch `feat/web-app`, HEAD `4e9f04a` (14 Nov 2026); re-baselined by P00 to `7acb426`. If branch advances, audit current code first. **DO NOT reinitialize Git, create a new branch, re-copy starter kit, or rewrite existing components.**

## Where everything is
- Product scope: `docs/PRD.md`; scientific and release data: `docs/data-contract.md` (DRAFT, includes appended scientific section); milestone: `docs/IMPLEMENTATION_PLAN.md`.
- Source code: `src/components/3d/{LunarScene,LunarTerrain,SunLighting,SiteMarkers}.jsx`, `src/utils/shadowMath.js`, `src/hooks/useEphemerisData.js`, `src/App.jsx`.
- Permanent instructions: `CLAUDE.md` (root); context status: `docs/CONTEXT_HANDOFF.md`; checklists: `docs/QA_CHECKLIST.md`.
- **Prompt list**: `prompts/00_BASELINE_AND_DOC_SYNC.md`, `01_REPOSITORY_AUDIT.md`, `02_TERRAIN.md`, `03_SOLAR.md`, `03A_HUD_INTEGRATION.md`, `03B_RESILIENCE_PERFORMANCE.md`, `04_BROWSER_QA.md`, `05_PR_AUDIT.md`.
- The prompt `.md` files are text, **not** CLI slash commands. In Claude Code write: `Read prompts/00_BASELINE_AND_DOC_SYNC.md and execute the instructions. Do not change files without showing the scope first.`

## Model/effort/skill matrix (recommendations; never assume skills available simply because 934 are listed)

| Seq | Prompt | Model | Effort | Skills to use if installed | Expected gate |
|---|---|---|---|---|---|
| P00 | 00_BASELINE_AND_DOC_SYNC | Sonnet 5.5 | Medium | None | Node 24 verified, install/verify results captured, docs aligned; no src edits |
| P01 | 01_REPOSITORY_AUDIT | Opus 5.5 | Medium | optional `threejs-r3f`, `threejs-debugging` | Read-only severity list and exact incremental plan |
| P02 | 02_TERRAIN | Sonnet 5.5 | Medium | `threejs-geometry` + `threejs-r3f` | Fixture labelled; failure explicit; heightmap handling tested; no fictional NASA terrain |
| P03 | 03_SOLAR | Opus 5.5 | High | `threejs-lighting` + `threejs-debugging` | Azimuth/Elevation tests; no invented angles or fabricated line-of-sight |
| P03A | 03A_HUD_INTEGRATION | Sonnet 5.5 | Medium | `threejs-interaction`; optional `react-best-practices` | One site/time source; site/time selection works; team approves interface edits |
| P03B | 03B_RESILIENCE_PERFORMANCE | Sonnet 5.5 | Medium | `threejs-performance` | Explicit load/error/WebGL fallback; measured performance |
| P04 | 04_BROWSER_QA | Sonnet 5.5 | Medium | `playwright-cli` | Desktop/mobile smoke + error logs/screenshot, retest |
| P05 | 05_PR_AUDIT | Opus 5.5 | High | Read-only `selenis-3d-reviewer`, optional `superpowers` review | Verify + independent review + team approval for shared-branch push |

**Fable 5.2:** only escalate an already isolated mathematical/geospatial bug that remains unresolved with Opus high after tests and a reproducible minimal case. Avoid Fable for routine coding and documentation. `taste-skill` / `design-taste-frontend` only for visual polish after scientific/functional QA; it is currently disabled in local Claude settings. Avoid enabling dozens of skills/subagents at once. All skills are optional aids, not scientific validators.

Change model inside Claude Code with `/model` menu or `/model sonnet` / `/model opus` if supported, set effort with `/effort medium` or `/effort high`. If exact alias unsupported use interactive `/model`. Confirm with `/status`. Installed skills may auto-trigger; in the prompt explicitly say which one or two are relevant, rather than loading everything. Official guide: https://code.claude.com/docs/en/model-config and https://code.claude.com/docs/en/skills .

## IMMEDIATELY NOW: in PowerShell, before asking for code

```powershell
# At C:\Users\HP 14s\Nasa Space Apps Challange\Selenis
git branch --show-current       # should show feat/web-app
git status -sb                  # expected untracked docs and modified data-contract
node --version                  # required 24.x, README target 24.19.0
npm --version
npm ci                          # only after Node 24 is active
npm run verify                  # lint + unit tests + manifest check + Vite build
npm run dev                     # open URL in Chrome, inspect DevTools console
```

If Node is not 24.x, update/switch Node BEFORE `npm ci`. `npm run verify` may pass but does NOT prove the simulation is scientifically correct. Running dev server occupies terminal; open another terminal for Claude. If `npm.ps1` policy error use `npm.cmd`. Do not change `REQUIRE_SCIENCE_DATA=true` for scaffold demonstration: it is the production scientific gate and should fail without real data.

Note down: node version, npm verify output, URL, screenshot, browser console, and whether sites/time controls work. Those are the required inputs to P00/P01.

## Safe run protocol for EACH prompt

1. Keep session scoped to one prompt; use specified model+effort. Start new session/`/clear` only after updating `docs/CONTEXT_HANDOFF.md` and when change in topic warrants it.
2. Tell Claude to read the target prompt file (e.g. `Read prompts/02_TERRAIN.md and carry it out with the scoped skills.`) and **inspect real code before editing**.
3. Before edits ask for file list and tests; for contracts not agreed, implement only unblockable safeguards/tests and mark NASA integration BLOCKED.
4. After edits run `npm run verify`, browser check where possible, inspect `git diff`. Update handoff.
5. **Shared branch `feat/web-app`**: coordinate editing teammate-owned `App.jsx`, shared hook, data-contract; do not `git add .` or auto push. Stage explicit own files, review diff, then commit/push only once team has approved.

## Team dependencies & decisions needed ASAP

- Anggota 1: per-site observer/angle frame/UTC and ephemeris interpolation with provenance.
- Anggota 2: real DEM/heightmap format, bit depth, projection/CRS, geodetic transform, datum, nodata, horizon masks.
- Anggota 4: who owns site/time state and props/events; avoid simultaneous edits to App.jsx.
- Anggota 6: manifest format + scientific data gate, static assets, Netlify deployment.
- Critical unresolved axis: code uses −Z north; scientific draft proposes +Z north. Neither is inherently wrong; choose one with tested transformation and team approval, not from a speculative document.

## Exit / definition of done for Member 3

- [ ] Real DEM tile, projection, heights, UV/site positions validated with data owner; otherwise clearly mark prototype only.
- [ ] Lighting/Earth direction verified against team ephemeris and known angles, with robust boundary/no-data handling.
- [ ] No fixture figures presented as NASA observation or as confirmed DTE visibility.
- [ ] Site/time controls interoperable with teammate HUD via agreed interface.
- [ ] Loading, corrupt asset, WebGL unavailable, slow device, StrictMode lifecycle checked.
- [ ] Unit tests, lint, build, Chrome/Edge & mobile tests pass or known blockers documented.
- [ ] Screenshots/logs, measured FPS/device, limitations and citations ready for team review.
- [ ] `docs/CONTEXT_HANDOFF.md` current; commit scoped to approved files only; `feat/web-app` push coordinated.

## Known snapshot mistakes to fix via P00 (do not duplicate docs)
- Old starter kit README demanded a new clone/branch; obsolete.
- PRD says `@react-three/drei` absent, but current package includes ^9.122.0 and controls exist.
- Handoff incorrectly TBD; current package/branch known.
- P05 assumed PR into `main`, but user chose shared branch; review own changes since baseline `7acb426` (no Anggota 3 commits yet), not entire team main diff.
- `docs/data-contract.md` is team-owned and scientific extension is unapproved DRAFT; don't silently mark approved.
- `public/data/manifest.json` is `scaffold` and `public/textures/` lacks real DEM.
- (P00, 14 Nov 2026) Branch advanced to `7acb426`: teammates added `src/components/3d/CompassRing.jsx`, HUD components in `src/components/hud/` (`TimelineScrubber`, `TopTelemetryBar`, `HorizonPanoramaChart`, `MicroShiftDeltaCard`, `ContrastPanel`) and reworked `App.jsx`. P03A must integrate with this existing HUD, not build one.
