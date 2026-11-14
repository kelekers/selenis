# SELENIS — PRD: 3D WebGL & Solar Lighting (Anggota 3)

**Status:** DRAFT for team review; existing 3D preview already implemented, scientific data not validated · **Owner:** Anggota 3 · **Date:** 2026-11-14
**Scope:** Only the 3D canvas, its lighting, and its interface to other team members. HUD, data pipeline, pitch and deployment are owned by others and covered here only as dependencies.

**Sources** (cited inline): `[CL]` CLAUDE.md · `[PB]` PROJECT_BRIEF.md · `[DC]` data-contract.md, scientific contract section (DRAFT) · `[dc]` data-contract.md, release manifest section · `[IP]` IMPLEMENTATION_PLAN.md · `[QA]` QA_CHECKLIST.md · `[BP §n]` TIMOREX Master Blueprint (`docs/reference-local/NASA - TIMOREX (1).pdf`, section n).
Items marked **PROPOSED** are suggestions from this PRD that the team has not approved. All example numbers in the blueprint (site coordinates, percentages, horizon masks, ephemeris values) are illustrative only and are **not** requirements or results.

---

## 1. Product goal
Give users a browser-based 3D view of NASA-derived lunar south-pole terrain (80°S–90°S) where sunlight direction and the Earth direction follow the selected UTC timestamp. The view should help them understand illumination, Earth visibility, and terrain hazards at candidate landing sites [PB, BP §1]. Order of priorities: **scientific correctness > reliable interaction > loading performance > visual polish** [PB].

The 3D view **illustrates** the data. It is never the scientific source of truth. Illumination and DTE metrics come from the team's precomputed horizon masks and ephemerides. WebGL shadows are a geometric preview only [CL, DC, QA].

## 2. Users
From [BP §2]:
- **Mission planners / engineers:** inspect the terrain around a site and the Sun and Earth direction at a given hour, alongside the quantitative HUD.
- **Educators / students:** use the 3D view to see why low sun angles and terrain create long shadows and block Earth.
- **General public:** use an intuitive 3D scene with "Explorer" storytelling (the narrative itself is HUD-owned).

## 3. MVP scope (Anggota 3)
From [PB Deliverables, IP M1–M4]:
1. A 3D terrain mesh built from a DEM-derived heightmap, using a documented scale, orientation and vertical exaggeration.
2. Camera navigation: orbit, zoom and reset.
3. Site markers placed from coordinates in the approved contract, with selection and hover that call back to the integration layer.
4. A directional sun light driven by ephemeris azimuth/elevation at the shared timestamp.
5. An Earth direction indicator for the same timestamp, labelled as geometry only, not as a DTE link.
6. Clear states for loading, missing or corrupt data, no WebGL and small screens, plus a loud `FIXTURE / NOT REAL NASA` label whenever fixture data is shown [IP M0].
7. Deterministic tests and handoff evidence [QA].

## 4. Exclusions (out of scope for Anggota 3)
- Fetching ephemerides, processing DEMs, slope maps, horizon-mask ray tracing (Anggota 1/2) [PB, BP §7].
- HUD components: timeline scrubber, 360° Lander POV chart, Site A/B delta cards, Planner/Explorer toggle UI, Lunar vs Terrestrial panel (Anggota 4) [BP §4, §7].
- Computing or displaying suitability metrics (illumination %, DTE %, eclipse hours, safety rating) inside the 3D layer.
- CI, hosting, manifest validation, citations (Anggota 6) [dc, BP §7].
- Any live NASA request from the browser. The browser reads only static assets [BP §6, devops.md].
- Changing React/R3F/Three major versions [CL].

## 5. Functional requirements

| ID | Requirement | Priority | Source |
|---|---|---|---|
| FR-01 | Render a terrain mesh from the approved heightmap asset. Height = decoded value × metres-per-unit + offset (per contract) × a declared `vertical_exaggeration`. Show exaggeration in the UI if ≠ 1. | Must | DC, CL, BP Contract §1 |
| FR-02 | Map tile extent, axis order and orientation to scene units using a single documented transform module. | Must | DC, QA |
| FR-03 | Use a single explicit azimuth convention (north 0°, clockwise, east 90°) and one approved azimuth→Three.js axis mapping (see Q1). | Must | CL, DC, BP Contract §2 |
| FR-04 | Treat DEM no-data cells explicitly (mask/hole/flag). Never render them as real elevation. | Must | DC, QA |
| FR-05 | Provide orbit and zoom camera controls plus a reset-camera action. Pan is optional. | Must | PB, IP M1/M3, QA |
| FR-06 | Place a marker per site from contract-supplied mesh coordinates (`mesh_x/mesh_z` or `uv`; see Q3). Never guess them in JS. | Must | DC, BP Contract §3 |
| FR-07 | Implement `LunarScene` as a controlled component. Inputs: `selectedSiteId`, `timestampUtc`, `displayMode?`. Output: `onSelectSite(siteId)`. It must not own a separate copy of site/time state. | Must | DC, CL, IP M3 |
| FR-08 | Convert sun azimuth/elevation (degrees) to a unit direction vector with the approved mapping, and drive a directional light from it. | Must | IP M2, DC |
| FR-09 | Resolve the ephemeris sample for `timestampUtc` using the approved policy (nearest/interpolate/clamp). Out-of-range or missing samples show an explicit state and never fabricate values. | Must | DC, IP M2, QA |
| FR-10 | Show the Earth direction indicator from ephemeris Earth az/el. The label must not imply link availability. Any "DTE active/occluded" state comes only from precomputed, site-specific data. | Should | PB, IP M2, DC, QA |
| FR-11 | Provide a local shadow-map preview of terrain shading, labelled as a visual preview, with shadow frustum covering the region of interest. | Should | IP M2, QA |
| FR-12 | Provide loading, data-error (missing/corrupt/invalid asset), and "WebGL unavailable" UI states, each with a recoverable or explanatory message. | Must | CL, PB, IP M4 |
| FR-13 | Show a persistent `FIXTURE / NOT REAL NASA` label whenever non-NASA or sample data is rendered. Show source/attribution text when real data is used. | Must | CL, IP M0, QA |
| FR-14 | Reuse or dispose of geometries, textures and materials. Make no per-frame React `setState`. Do not leak controls or listeners under React StrictMode. | Must | CL, QA |
| FR-15 | Make layout responsive. Provide a reduced-quality path (e.g. lower mesh resolution or no shadows) for weak GPUs and mobile. | Should | PB, IP M4 |
| FR-16 | Provide keyboard and touch access for site selection and camera reset. | Should | QA |
| FR-17 | Visually distinguish the selected site and its comparison partner (e.g. `pair_group`) when the HUD compares Site A and Site B. | Should | IP M3, BP §4.2 |
| FR-18 | **PROPOSED:** Add a "Lander POV" camera preset at the selected site, looking toward the sun or Earth azimuth, to complement Anggota 4's 2D panorama chart. | Nice | derived from BP §4.1 |
| FR-19 | **PROPOSED:** Draw the sun-path arc and Earth figure-8 (libration) track over the mission window in the 3D sky, from ephemeris samples only. | Nice | derived from BP §4.4 |
| FR-20 | **PROPOSED:** Recover from WebGL context loss (re-create resources or prompt reload). | Nice | QA ("if practical") |
| FR-21 | **PROPOSED:** Apply the normal-map texture (`lunar_surface_normal.webp`) if the data team supplies it. | Nice | BP §6 repo tree |

## 6. User flows
1. **Open app:** a loading state appears → assets load → the terrain renders with a default camera and the timestamp from shared state. On failure, an error or no-WebGL state appears instead (FR-12).
2. **Select a site:** the user clicks or taps a marker (or uses the keyboard) → `onSelectSite(id)` fires → the integration layer updates `selectedSiteId` → the marker is highlighted and the camera may frame the site (FR-06/07/16).
3. **Change time:** the user scrubs the HUD timeline (Anggota 4) → `timestampUtc` prop changes → sun light and Earth indicator update without stale state. Out-of-range time shows an explicit state (FR-08–10).
4. **Compare A/B:** HUD selects a pair → the scene highlights both sites. The metrics stay in the HUD (FR-17).
5. **Recover view:** the user presses reset → the camera returns to the default framing (FR-05).

## 7. Acceptance criteria (measurable)
- **AC-01 (FR-01/02/04):** Unit tests decode known heightmap pixel values to the contract's expected metres. They also map tile corners and centre to the expected scene coordinates, and confirm that no-data pixels are flagged rather than rendered as zero. All tests pass under `npm test`.
- **AC-02 (FR-03/08):** Unit tests cover az/el → vector for az = 0°, 90°, 180°, 270° and el = 0°, 90°. Each output matches the approved axis mapping and has unit length. **PROPOSED** numeric tolerance: 1e‑9 (floating point only, not scientific accuracy).
- **AC-03 (FR-06):** At least one site whose coordinates have been independently checked (e.g. against Moon Trek / QuickMap) renders at its contract coordinates on a real DEM tile. A screenshot is attached [IP M1, DC checklist].
- **AC-04 (FR-08/09):** For one known site/timestamp from Anggota 1's data, the light direction in the scene equals the vector computed from that file's az/el. Tests also cover a timestamp before the start, after the end, between samples, and with missing data, and none of these produces NaN or invented values [IP M2, QA].
- **AC-05 (FR-07):** In a browser smoke test, selecting a site, changing the time and resetting the camera all work. React DevTools or logs show a single source of site/time state [IP M3, QA].
- **AC-06 (FR-12/13):** Each of these shows the matching UI state with no uncaught console error: missing asset (404), corrupt JSON, and WebGL disabled. The fixture label is visible whenever the manifest status is `scaffold` or the data is fixture data.
- **AC-07 (FR-14):** Mounting and unmounting the scene 10× in StrictMode does not increase `renderer.info.memory` geometry/texture counts after the run. **PROPOSED** check.
- **AC-08 (FR-15):** FPS, load time and transfer size are measured and reported on the demo desktop and at least one phone or low-power device, with date, hardware and browser. Pass thresholds are **TBD** (Q6). 60 FPS is a target, not a claim [IP M4, devops.md].
- **AC-09 (release):** `npm run verify` passes (lint, tests, data check, build). The Chrome/Edge happy path has zero console errors. The PR includes a screenshot or recording of real topography with changing illumination, plus dataset citations [QA, IP M5].

## 8. Dependencies
| From | Needed by Anggota 3 | Blocks |
|---|---|---|
| Anggota 1 | Ephemeris file: `timestamp_utc`, sun/earth az/el (deg), observer/site, frame, time step and interpolation policy | FR-08–10, AC-04 |
| Anggota 2 | Heightmap asset and metadata: extent, CRS, encoding (bit depth, m/unit, offset), datum, no-data, exaggeration; site lat/lon, mesh coordinates; horizon-mask schema | FR-01–06, AC-01/03 |
| Anggota 4 | Shared site/time/mode state owner and event API; A/B pairing semantics | FR-07, FR-17 |
| Anggota 6 | Public asset paths, manifest/provenance, size budget, deploy target | FR-12/13, AC-08/09 |
| Repo | Camera controls are ALREADY implemented with `@react-three/drei` `^9.122.0` on `feat/web-app` (`LunarScene.jsx`), but camera reset has not yet been verified. | FR-05 |
| Repo (Anggota 4/6) | `TopTelemetryBar.jsx` shows "NASA DATA LIVE" whenever `manifest.status === 'ready'`; that status alone does not prove real NASA data, so the label must be agreed with FR-13. | FR-13 |

## 9. Open questions
- **Q1 (axis mapping):** Is north **−Z** [BP Contract §2] or **+Z** [DC]? Also, which "north" applies at the pole (grid north toward 0° longitude per BP, or another definition)?
- **Q2 (height encoding):** Is the heightmap 8-bit 0–255 WebP [BP Contract §1] or 16-bit? [DC] warns that lossy WebP is unsafe for measurable elevation.
- **Q3 (site placement):** Will sites carry `uv` / `x_km,z_km` [BP] or `mesh_x/mesh_z` [DC]? Who computes them, and from which projection?
- **Q4 (visibility source):** Should the frontend compare sun elevation with the horizon mask at runtime [BP Contract §4], or use precomputed site-specific visibility only [DC, CL]? Which site's horizon mask applies when no site is selected?
- **Q5 (ephemeris scope):** Will there be one ephemeris series for the region [BP] or one per site [DC requires `site_id`/origin]? Is the time window 30 days hourly [BP Contract §5] or 2026–2027 [BP §5]?
- **Q6 (budgets):** What FPS and device targets apply, and what is the asset size budget (see Contradictions C3)?
- **Q7:** Should the Earth marker ship in MVP, given that [IP M2] says "only if scientifically meaningful"?
- **Q8:** Which tile and region is the MVP target (Shackleton / Connecting Ridge / Malapert per BP), and what physical extent does it cover?

## 10. Contradictions found between documents
- **C1 — Axis mapping:** [BP Contract §2] says −Z = North and +X = East. [DC] proposes x = east, z = north (+Z). These produce mirrored scenes.
- **C2 — Visibility computation:** [BP Contract §4] has the frontend compute occlusion in real time from generic ephemerides. [DC]/[CL] require precomputed, site-specific visibility and forbid inferring DTE from elevation alone. The [BP §6] ephemeris example also puts `visibility_status` in a site-independent record.
- **C3 — Asset size budget:** [BP Contract §6] sets a total under 5 MB. [dc] sets 10 MiB per file and 50 MiB total.
- **C4 — Hosting:** [BP §7–8] names Vercel (and "Vercel/Netlify"). The repo and [dc]/devops.md use Netlify.
- **C5 — Shadows as science:** [BP §4/§6] describes "Ray-Traced Shadowing" and "Shadow Map Projection" in the 3D canvas as precise. [CL]/[QA] say WebGL shadows are a preview only.
- **C6 — Schemas inside the blueprint:** [BP §6] and [BP Contract §3] give two different `site_telemetry.json` shapes: a single object with `latitude` / `slope_analysis` / `landing_safety_rating` vs `terrain_metadata` + `sites[]` with `latitude_deg` / `summary_metrics` / `safety_rating`. They also give two ephemeris shapes: `libration_phase_deg` + `visibility_status` vs `mission_window` + `timeline` with `libration_lat/lon_deg`. Neither has been approved; [DC] is still all TBD.
- **C7 — Micro-shift distance:** [BP §4.2] says "500m" in the feature name and "400 meter" in its text. The [BP Contract §3] example says "+450m".
- **C8 — Earth marker:** [PB] lists it as a deliverable. [IP M2] makes it conditional ("only if scientifically meaningful").
- **C9 — Performance:** [BP §6] states 60 FPS as a property of the design. README/devops.md treat it as an unproven target.
- **C10 — Reading order (historical; doc patch fixes):** This PRD now exists. `CONTEXT_HANDOFF.md` in the original starter kit was stale; see the updated handoff for current branch/versions. Re-check after new commits.
- **C11 — Branch naming (working decision):** TIMOREX currently works together on `feat/web-app`. The original starter kit and blueprint used other illustrative names; do not create a new branch unless the team changes its workflow.
