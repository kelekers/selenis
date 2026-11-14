# SELENIS — Technical brief for Anggota 3

Source: TIMOREX Master Blueprint (NASA - TIMOREX.pdf, especially pp. 1, 6-10), plus the separate proposal (nasa(1).pdf). This document is a working summary, not a NASA-approved design.

## User outcome
A mission planner can select lunar south-pole landing sites and mission timestamps, examine 3D terrain and projected sunlight, and compare the consequences of illumination, Earth visibility, and terrain slope.

## Scope
- Intended lunar south pole region: 80°S–90°S (initial target tiles / sites must be supplied by team).
- Framework proposed: Vite + React + React Three Fiber (R3F) + WebGL.
- Heavy DEM, ray tracing, slope and ephemeris calculations happen in an offline Python pipeline (other team members).
- Browser loads optimized static assets + precomputed numeric data; do not market geometric shadows as validated numeric science.

## Deliverables
1. Lunar terrain 3D mesh with correct coordinate mapping and camera navigation.
2. Site selection and markers; exposed callbacks to integration/HUD.
3. Sun direction/lighting synchronized to chosen timestamp.
4. Earth position marker/indicator synchronized to chosen timestamp, with careful semantics.
5. Robust states: loading, corrupt/missing data, slow GPU, mobile, no WebGL.
6. Tests, screenshots and handoff to other team members.

## Ownership
Anggota 1: ephemerides. Anggota 2: DEM, slope and horizon mask. Anggota 3: WebGL terrain and lighting (this branch). Anggota 4: HUD/timeline/comparison. Anggota 6: data integration, QA, deployment.

## Acceptance principle
Scientific data correctness > reliable interactions > loading performance > aesthetic polish. All site metrics must be derived from data and clearly state their derivation and uncertainty.
