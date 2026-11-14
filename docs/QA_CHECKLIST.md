# SELENIS — Anggota 3 quality gate

## Scientific validity
- [ ] DEM source and attribution recorded; not a generated fantasy landscape.
- [ ] Topography extent, projection, orientation, metres/pixel and elevation datum documented.
- [ ] Site latitude/longitude correctly maps to scene mesh coordinates.
- [ ] No-data cells, edge gaps, height min/max, vertical exaggeration checked.
- [ ] Solar azimuth/elevation vectors match a known sample of team's NASA-derived data.
- [ ] Earth direction correct for same location/time; distinguish geometry vs verified DTE link availability.
- [ ] Horizon-mask numerical result remains canonical; GPU shadows not presented as scientific metrics.
- [ ] Timestamps UTC; interpolation boundary/no-data correctly handled.
- [ ] No sample values or example schema passed off as NASA measurements.

## Functional tests
- [ ] Orbit, pan/zoom (if supported), reset, site selection and hover all work.
- [ ] Date/time changes update scene without stale state or invalid interpolation.
- [ ] HUD and 3D scene use exactly one time/site source of truth.
- [ ] Asset loading/error, recoverable failures, empty site, unsupported WebGL.
- [ ] React StrictMode causes no leaking controls or duplicated listeners.
- [ ] Frustum/shadow clipping does not hide essential terrain unexpectedly.
- [ ] R3F resources/textures/geometry are reused or disposed when necessary.

## Compatibility and performance
- [ ] `npm run lint` succeeds if available.
- [ ] `npm test` or project-specific test command succeeds if available.
- [ ] `npm run build` succeeds; inspect bundle and warnings.
- [ ] Chrome/Edge desktop smoke test; console errors zero for happy path.
- [ ] Lower-power GPU or mobile screen smoke test; record actual FPS/CPU/GPU conditions.
- [ ] Slow network/large asset; loading state and fallback usable.
- [ ] WebGL context loss/recovery tested if practical.
- [ ] Readable keyboard/touch controls; no broken focus or inaccessible UI.

## PR-ready evidence
- [ ] Screenshot/short recording of real topography and time changing illumination.
- [ ] Tests and measured performance reported with date/hardware/browser.
- [ ] Dataset citation and known limitations included.
- [ ] Feature branch only; changed-file audit; reviewer independent feedback.
- [ ] Known critical issues resolved or explicitly stop the merge.
