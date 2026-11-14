const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Scene axis convention (team decision pending, see docs/data-contract.md):
 *   azimuth 0° = north = scene -Z, 90° = east = +X (clockwise seen from above), +Y = zenith.
 *
 * IMPORTANT (south-pole frame caveat): "north" here means the scene's -Z axis. Azimuths from an
 * ephemeris are usually measured from LOCAL TRUE NORTH at the observer. On a south-polar
 * stereographic tile, local true north differs from the tile's grid axis by roughly the site
 * longitude. `northOffsetDeg` rotates local-north azimuths into scene azimuths; its value must
 * come from the approved projection (Anggota 2) and observer frame (Anggota 1). Default 0 is
 * only correct if the tile's -Z axis IS local true north at the site.
 */

/** Normalise any finite azimuth to [0, 360). Returns null for non-finite input. */
export function normalizeAzimuth(azimuthDeg) {
  if (!Number.isFinite(azimuthDeg)) return null;
  const az = ((azimuthDeg % 360) + 360) % 360;
  return az === 360 ? 0 : az;
}

/** A sky direction is valid when azimuth is finite and elevation is within [-90, 90]. */
export function isValidSkyVector(vector) {
  return (
    vector != null &&
    Number.isFinite(vector.azimuth_deg) &&
    Number.isFinite(vector.elevation_deg) &&
    vector.elevation_deg >= -90 &&
    vector.elevation_deg <= 90
  );
}

/**
 * (azimuth, elevation) in degrees → unit vector [x, y, z] in scene axes, or null if invalid.
 * Elevation below 0 is kept (geometric direction below the local horizontal plane).
 */
export function azElToUnitVector(azimuthDeg, elevationDeg, northOffsetDeg = 0) {
  if (!isValidSkyVector({ azimuth_deg: azimuthDeg, elevation_deg: elevationDeg })) return null;
  if (!Number.isFinite(northOffsetDeg)) return null;
  const azRad = (azimuthDeg + northOffsetDeg) * DEG_TO_RAD;
  const elRad = elevationDeg * DEG_TO_RAD;
  const horizontal = Math.cos(elRad);
  return [horizontal * Math.sin(azRad), Math.sin(elRad), -horizontal * Math.cos(azRad)];
}

/** Inverse of azElToUnitVector (with northOffsetDeg = 0). Returns null for a zero/invalid vector. */
export function unitVectorToAzEl([x, y, z]) {
  const len = Math.hypot(x, y, z);
  if (!Number.isFinite(len) || len === 0) return null;
  const elevation_deg = Math.asin(Math.max(-1, Math.min(1, y / len))) * RAD_TO_DEG;
  const azimuth_deg = normalizeAzimuth(Math.atan2(x, -z) * RAD_TO_DEG);
  return { azimuth_deg, elevation_deg };
}

/**
 * Mengonversi (azimuth_deg, elevation_deg) ke posisi 3D Three.js pada jarak `radius`.
 * Konvensi: 0° = Utara (-Z), 90° = Timur (+X), +Y = Zenith.
 * Returns null for invalid/missing angles — callers must not substitute made-up angles.
 */
export function celestialToCartesian(azimuthDeg, elevationDeg, radius = 40) {
  const dir = azElToUnitVector(azimuthDeg, elevationDeg);
  if (!dir || !Number.isFinite(radius)) return null;
  return [dir[0] * radius, dir[1] * radius, dir[2] * radius];
}

/**
 * Clean a horizon mask: keep finite samples with elevation in [-90, 90], normalise azimuths,
 * sort, merge duplicate azimuths (mean). Shared by the LOS check and the HUD chart.
 */
export function cleanHorizonMask(horizonMask360) {
  if (!Array.isArray(horizonMask360)) return [];
  const byAz = new Map();
  for (const sample of horizonMask360) {
    const az = normalizeAzimuth(sample?.azimuth_deg);
    const el = sample?.horizon_elevation_deg;
    if (az === null || !Number.isFinite(el) || el < -90 || el > 90) continue;
    const entry = byAz.get(az) ?? { sum: 0, n: 0 };
    entry.sum += el;
    entry.n += 1;
    byAz.set(az, entry);
  }
  return [...byAz.entries()]
    .map(([azimuth_deg, { sum, n }]) => ({ azimuth_deg, horizon_elevation_deg: sum / n }))
    .sort((a, b) => a.azimuth_deg - b.azimuth_deg);
}

/**
 * Interpolasi linear sudut elevasi horizon mask pada azimuth tertentu, termasuk melintasi 360°/0°.
 * Returns null when the mask is missing or has fewer than 2 valid distinct azimuths
 * (missing data is NEVER treated as a 0° horizon).
 */
export function getHorizonElevationAtAzimuth(horizonMask360, targetAzimuthDeg) {
  const az = normalizeAzimuth(targetAzimuthDeg);
  if (az === null) return null;
  const mask = cleanHorizonMask(horizonMask360);
  if (mask.length < 2) return null;

  const first = mask[0];
  const last = mask[mask.length - 1];
  // Wrap segment: last → first + 360 covers azimuths after `last` and before `first`.
  if (az < first.azimuth_deg || az > last.azimuth_deg) {
    const azWrapped = az < first.azimuth_deg ? az + 360 : az;
    const span = first.azimuth_deg + 360 - last.azimuth_deg;
    const t = (azWrapped - last.azimuth_deg) / span;
    return last.horizon_elevation_deg + t * (first.horizon_elevation_deg - last.horizon_elevation_deg);
  }
  for (let i = 0; i < mask.length - 1; i += 1) {
    const curr = mask[i];
    const next = mask[i + 1];
    if (az >= curr.azimuth_deg && az <= next.azimuth_deg) {
      const t = (az - curr.azimuth_deg) / (next.azimuth_deg - curr.azimuth_deg);
      return curr.horizon_elevation_deg + t * (next.horizon_elevation_deg - curr.horizon_elevation_deg);
    }
  }
  return null; // unreachable for a cleaned mask; kept defensive
}

function aboveMask(vector, horizonMask360) {
  if (!isValidSkyVector(vector)) return { visible: null, horizon: null };
  const horizon = getHorizonElevationAtAzimuth(horizonMask360, vector.azimuth_deg);
  if (horizon === null) return { visible: null, horizon: null };
  const effectiveHorizon = Math.max(0, horizon);
  return { visible: vector.elevation_deg > effectiveHorizon, horizon: Number(effectiveHorizon.toFixed(2)) };
}

/**
 * Browser PREVIEW of terrain-mask visibility for the active site and time.
 * Tri-state fields: true / false / null (unknown — missing site, vector or mask).
 *   - is_sun_visible: Sun CENTRE above the site's horizon mask (no disk size/penumbra).
 *   - is_dte_active: Earth CENTRE above the horizon mask = geometric line of sight only.
 *     It is NOT a radio-link quality or availability metric.
 * Authoritative visibility must come from team-precomputed per-site data (Anggota 1/2).
 */
export function evaluateLineOfSight(site, ephemerisPoint) {
  const mask = site?.horizon_mask_360;
  const sun = aboveMask(site ? ephemerisPoint?.sun_vector : null, mask);
  const earth = aboveMask(site ? ephemerisPoint?.earth_vector : null, mask);
  const computed = site?.terrain_visibility_timeline?.find(
    (point) => point.timestamp_utc === ephemerisPoint?.timestamp_utc,
  );
  return {
    basis: computed ? 'pipeline-local-dem' : 'browser-horizon-mask-preview',
    is_sun_visible: typeof computed?.is_sun_clear_within_dem === 'boolean' ? computed.is_sun_clear_within_dem : sun.visible,
    is_dte_active: typeof computed?.is_earth_clear_within_dem === 'boolean' ? computed.is_earth_clear_within_dem : earth.visible,
    sun_horizon_deg: sun.horizon,
    earth_horizon_deg: earth.horizon,
  };
}
