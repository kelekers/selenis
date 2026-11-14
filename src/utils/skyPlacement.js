import {
  azElToUnitVector,
  cleanHorizonMask,
  getHorizonElevationAtAzimuth,
  isValidSkyVector,
  normalizeAzimuth,
} from './shadowMath.js';
import { vectorInGrid } from './sceneFrame.js';
import { uvToWorldXZ } from './terrainMath.js';

/**
 * Pure helpers for the 3D sky layer (Sun, Earth, tracks, horizon ring) around the ACTIVE site.
 *
 * Frame: sky vectors come with LOCAL azimuths (0° = local north, clockwise). Before placing them in
 * the scene they are rotated into tile-grid azimuth with `vectorInGrid(vector, northOffset)`, then
 * mapped with the scene convention (0° = -Z, 90° = +X, +Y = zenith; see shadowMath.js).
 * Directions are exact; distances and object sizes on the dome are NOT to scale.
 */

const DEG = Math.PI / 180;

/** Mean apparent diameter of the Sun seen from the Moon (≈0.52–0.54° over a year). */
export const SUN_ANGULAR_DIAMETER_DEG = 0.53;
/** Mean apparent diameter of Earth seen from the Moon: 2·atan(6371 / 384 400 km) ≈ 1.9° (≈1.8–2.0°). */
export const EARTH_ANGULAR_DIAMETER_DEG = 1.9;
/**
 * Observer eye height (km) above the rendered surface for the lander POV camera: 2 m, the same
 * observer height the pipeline used for the horizon masks (data-pipeline/config/sites_config.json).
 */
export const EYE_HEIGHT_KM = 0.002;
/** Dome radius as a fraction of the shorter tile side (keeps the dome inside the tile). */
export const SKY_RADIUS_FRACTION = 0.45;

const isPoint = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);

/** Radius (scene km) of the sky dome drawn around the active site, or null for an invalid tile. */
export function skyDomeRadiusKm(widthKm, depthKm = widthKm) {
  if (!(Number.isFinite(widthKm) && widthKm > 0 && Number.isFinite(depthKm) && depthKm > 0)) {
    return null;
  }
  return SKY_RADIUS_FRACTION * Math.min(widthKm, depthKm);
}

/**
 * Centre of the sky dome: the site's rendered surface point lifted by `liftKm` (the marker head in
 * the overview, so dome objects sit exactly at the end of the marker's direction lines; the eye
 * height in the POV). null when the site has no valid UV — never a guessed position. While the
 * terrain sampler is not ready the surface falls back to the datum (y = 0), like the markers.
 */
export function skyDomeCenter(site, sampleHeightAtUV, widthKm, depthKm, liftKm) {
  const uv = site?.coordinates?.uv;
  const xz = uvToWorldXZ(uv, widthKm, depthKm);
  if (!xz || !Number.isFinite(liftKm)) return null;
  const y = sampleHeightAtUV?.(uv.u, uv.v);
  return [xz[0], (Number.isFinite(y) ? y : 0) + liftKm, xz[1]];
}

/** Point on the dome for a GRID-azimuth sky vector, or null (invalid vector, centre or radius). */
export function skyPoint(vectorGrid, center, radiusKm) {
  if (!isValidSkyVector(vectorGrid) || !isPoint(center)) return null;
  if (!(Number.isFinite(radiusKm) && radiusKm > 0)) return null;
  const u = azElToUnitVector(vectorGrid.azimuth_deg, vectorGrid.elevation_deg);
  return [center[0] + u[0] * radiusKm, center[1] + u[1] * radiusKm, center[2] + u[2] * radiusKm];
}

/** Great-circle angle (deg) between two sky vectors given in the SAME azimuth frame, or null. */
export function angularSeparationDeg(a, b) {
  if (!isValidSkyVector(a) || !isValidSkyVector(b)) return null;
  const ua = azElToUnitVector(a.azimuth_deg, a.elevation_deg);
  const ub = azElToUnitVector(b.azimuth_deg, b.elevation_deg);
  const dot = Math.max(-1, Math.min(1, ua[0] * ub[0] + ua[1] * ub[1] + ua[2] * ub[2]));
  return Math.acos(dot) / DEG;
}

/**
 * Approximate Earth phase seen from the site. The Sun is ~390× farther than the Earth, so the
 * Earth→Sun direction ≈ site→Sun (error ≈ 0.15°): phase angle (Sun–Earth–observer) ≈ 180° − elongation.
 * Returns { elongationDeg, phaseAngleDeg, illuminatedFraction } or null when a vector is missing.
 */
export function earthPhase(sunVector, earthVector) {
  const elongationDeg = angularSeparationDeg(sunVector, earthVector);
  if (elongationDeg === null) return null;
  const phaseAngleDeg = 180 - elongationDeg;
  return { elongationDeg, phaseAngleDeg, illuminatedFraction: (1 + Math.cos(phaseAngleDeg * DEG)) / 2 };
}

/**
 * Track of one body (`key` = 'sun_vector' | 'earth_vector') over a LOCAL-azimuth timeline, on the
 * dome. Split where samples are missing/invalid, then into past (index ≤ current) and future
 * (index ≥ current) parts that share the current point. Segments with < 2 points are dropped.
 * The 3D dome has no 0°/360° seam, unlike the panorama.
 */
export function skyTrackSegments(timeline, key, northOffsetDeg, center, radiusKm, currentIndex) {
  const empty = { past: [], future: [] };
  if (!Array.isArray(timeline) || !Number.isFinite(northOffsetDeg)) return empty;
  const last = timeline.length - 1;
  const cut = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex <= last ? currentIndex : -1;
  const runs = [];
  let run = [];
  timeline.forEach((sample, i) => {
    const p = skyPoint(vectorInGrid(sample?.[key], northOffsetDeg), center, radiusKm);
    if (p) {
      run.push({ i, p });
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  });
  if (run.length) runs.push(run);
  const keep = (pts) => (pts.length >= 2 ? [pts.map((x) => x.p)] : []);
  return runs.reduce(
    (acc, r) => ({
      past: [...acc.past, ...keep(r.filter((x) => x.i <= cut))],
      future: [...acc.future, ...keep(r.filter((x) => x.i >= cut))],
    }),
    empty
  );
}

/**
 * Closed loop of the site's horizon mask on the dome at TRUE elevation angles (1° step by default),
 * using the same cleaning/interpolation as the panorama and the line-of-sight check, or null when
 * the mask is unusable (never a fake flat horizon).
 */
export function horizonRingPoints(mask, northOffsetDeg, center, radiusKm, stepDeg = 1) {
  if (cleanHorizonMask(mask).length < 2 || !Number.isFinite(northOffsetDeg)) return null;
  if (!(Number.isFinite(stepDeg) && stepDeg > 0 && stepDeg <= 90)) return null;
  const pts = [];
  for (let az = 0; az < 360 - 1e-9; az += stepDeg) {
    const el = getHorizonElevationAtAzimuth(mask, az);
    const p = skyPoint({ azimuth_deg: az + northOffsetDeg, elevation_deg: el }, center, radiusKm);
    if (!p) return null;
    pts.push(p);
  }
  pts.push([...pts[0]]); // close the loop exactly
  return pts;
}

/** Horizontal-plane (0° elevation) reference circle on the dome, or null. */
export function horizontalCirclePoints(center, radiusKm, steps = 96) {
  if (!isPoint(center) || !(Number.isFinite(radiusKm) && radiusKm > 0)) return null;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / steps) * Math.PI * 2;
    return [center[0] + Math.sin(t) * radiusKm, center[1], center[2] - Math.cos(t) * radiusKm];
  });
}

/**
 * Label for a sky object from its LOCAL vector (same azimuth as the panorama and the timeline bar)
 * and the same tri-state flag the panorama uses. kind: 'sun' | 'earth'.
 */
export function skyObjectLabel(kind, vectorLocal, state) {
  const name = kind === 'sun' ? 'Matahari' : 'Bumi';
  if (!isValidSkyVector(vectorLocal)) return `${name}: arah tidak tersedia`;
  return `${name} ${state === true ? 'terlihat' : state === false ? 'terhalang' : 'tidak diketahui'}`;
}

/**
 * Edge indicator for a sky object that is outside the view.
 * ndc: {x, y} from Vector3.project(camera); behind: point is behind the camera (its projection is
 * mirrored, so it is flipped back); aspect = viewport width / height; margin in NDC units.
 * Returns { onScreen, x, y, angleRad } with x/y as 0..1 fractions from the top-left and angleRad
 * the on-screen direction (0 = right, positive = clockwise because screen y grows downward),
 * or null for invalid input.
 */
export function edgeIndicator(ndc, behind, aspect = 1, margin = 0.08) {
  if (!ndc || !Number.isFinite(ndc.x) || !Number.isFinite(ndc.y)) return null;
  if (!(Number.isFinite(aspect) && aspect > 0)) return null;
  let { x, y } = ndc;
  if (!behind && Math.abs(x) <= 1 && Math.abs(y) <= 1) {
    return { onScreen: true, x: (x + 1) / 2, y: (1 - y) / 2, angleRad: null };
  }
  if (behind) {
    x = -x;
    y = -y;
  }
  if (x === 0 && y === 0) y = -1; // exactly behind: point downward
  const s = (1 - margin) / Math.max(Math.abs(x), Math.abs(y));
  const ex = x * s;
  const ey = y * s;
  return { onScreen: false, x: (ex + 1) / 2, y: (1 - ey) / 2, angleRad: Math.atan2(-y, x * aspect) };
}

/** Grid azimuth (deg) of the horizontal part of a view direction [x, y, z], or null when vertical. */
export function viewHeadingGridDeg(forward) {
  if (!Array.isArray(forward) || !forward.every(Number.isFinite)) return null;
  const [x, , z] = forward;
  if (Math.hypot(x, z) < 1e-9) return null;
  return normalizeAzimuth(Math.atan2(x, -z) / DEG);
}

/** Horizontal field of view (deg) from the vertical fov (deg) and the viewport aspect (w / h). */
export function horizontalFovDeg(verticalFovDeg, aspect) {
  if (!(verticalFovDeg > 0 && verticalFovDeg < 180) || !(aspect > 0)) return null;
  return (2 * Math.atan(Math.tan((verticalFovDeg * DEG) / 2) * aspect)) / DEG;
}

/** Signed turn from the view heading to a target azimuth, in (-180, 180]: positive = to the right. */
export function relativeBearingDeg(targetAzDeg, headingDeg) {
  if (!Number.isFinite(targetAzDeg) || !Number.isFinite(headingDeg)) return null;
  const d = (((targetAzDeg - headingDeg) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

/** Short hint for the sky compass: where a body is relative to the current view. */
export function bearingHint(onScreen, relativeDeg) {
  if (onScreen) return 'di layar';
  if (!Number.isFinite(relativeDeg)) return '—';
  const turn = Math.round(Math.abs(relativeDeg));
  if (turn < 1) return 'atas/bawah layar';
  return `${turn}° ke ${relativeDeg > 0 ? 'kanan' : 'kiri'}`;
}

/**
 * BIG sky bodies in the local view: the Earth and the Sun drawn as large spheres on their true
 * directions, farther out than the tile ("far away"). Distances are multiples of the larger tile
 * side; apparent sizes are either the TRUE angular diameters seen from the Moon or both enlarged
 * by the same factor (so the Earth stays ≈ 3.6× wider than the Sun, as seen from the Moon).
 */
export const BIG_BODY_DISTANCE_FACTOR = Object.freeze({ earth: 1.6, sun: 2.8 });
export const BIG_BODY_ENLARGEMENT = 6.4;

/** Distance (scene km) of a big body from the dome centre, or null for an invalid tile. */
export function bigBodyDistanceKm(kind, widthKm, depthKm = widthKm) {
  const f = BIG_BODY_DISTANCE_FACTOR[kind];
  if (!f || !(Number.isFinite(widthKm) && widthKm > 0 && Number.isFinite(depthKm) && depthKm > 0)) return null;
  return f * Math.max(widthKm, depthKm);
}

/** Apparent diameter (deg) of a big body: 'true' = as seen from the Moon, 'enlarged' = × factor. */
export function bigBodyAngularDiameterDeg(kind, sizeMode = 'enlarged') {
  const base = kind === 'sun' ? SUN_ANGULAR_DIAMETER_DEG : kind === 'earth' ? EARTH_ANGULAR_DIAMETER_DEG : null;
  if (base === null) return null;
  return sizeMode === 'true' ? base : base * BIG_BODY_ENLARGEMENT;
}

/** Sphere radius (scene km) giving that apparent diameter at that distance, or null. */
export function bigBodyRadiusKm(kind, distanceKm, sizeMode = 'enlarged') {
  const deg = bigBodyAngularDiameterDeg(kind, sizeMode);
  if (deg === null || !(Number.isFinite(distanceKm) && distanceKm > 0)) return null;
  return distanceKm * Math.tan((deg * DEG) / 2);
}

/**
 * Camera pose that looks from behind the site toward a body near the horizon: the camera sits
 * `back` km behind the dome centre (opposite the body's horizontal direction) and `lift` km higher,
 * aiming `ahead` km past the centre, so the site is in the lower half and the body near the middle.
 * dirGrid = scene unit vector toward the body. Returns { position, target } or null.
 */
export function lookTowardPose(center, dirGrid, { back = 6, ahead = 4, lift = 1.2, targetLift = 0.3 } = {}) {
  if (!isPoint(center) || !Array.isArray(dirGrid) || !dirGrid.every(Number.isFinite)) return null;
  const h = Math.hypot(dirGrid[0], dirGrid[2]);
  if (h < 1e-9) return null; // body at the zenith/nadir: no horizontal heading
  const hx = dirGrid[0] / h;
  const hz = dirGrid[2] / h;
  return {
    position: [center[0] - hx * back, center[1] + lift, center[2] - hz * back],
    target: [center[0] + hx * ahead, center[1] + targetLift, center[2] + hz * ahead],
  };
}
