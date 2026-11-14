import {
  cleanHorizonMask,
  getHorizonElevationAtAzimuth,
  isValidSkyVector,
  normalizeAzimuth,
} from './shadowMath.js';
import { parseUtcTimestamp } from './ephemerisMath.js';

/**
 * Pure view-model helpers shared by the HUD and the 3D scene (testable with node --test).
 * Rule: missing/invalid values render as "—" / "tidak diketahui", never as a made-up number.
 */

export const NO_VALUE = '—';
/** IAU mean lunar radius (m). Used only for site-to-site distance on a sphere. */
export const MOON_MEAN_RADIUS_M = 1737400;

export function formatAngle(deg, digits = 1) {
  return Number.isFinite(deg) ? `${deg.toFixed(digits)}°` : NO_VALUE;
}

/** Compact angle: up to 2 decimals without trailing zeros (e.g. "2.2°", "1.25°"). */
export function formatAngleShort(deg) {
  return Number.isFinite(deg) ? `${Number(deg.toFixed(2))}°` : NO_VALUE;
}

export function formatLatitude(deg, digits = 4) {
  if (!Number.isFinite(deg) || deg < -90 || deg > 90) return NO_VALUE;
  return `${Math.abs(deg).toFixed(digits)}°${deg < 0 ? 'S' : 'N'}`;
}

export function formatLongitude(deg, digits = 4) {
  if (!Number.isFinite(deg)) return NO_VALUE;
  const lon = ((((deg + 180) % 360) + 360) % 360) - 180; // → [-180, 180)
  return `${Math.abs(lon).toFixed(digits)}°${lon < 0 ? 'W' : 'E'}`;
}

export function formatMeters(m) {
  return Number.isFinite(m) ? `${Math.round(m)} m` : NO_VALUE;
}

export function formatPercent(p, digits = 1) {
  return Number.isFinite(p) ? `${Number(p.toFixed(digits))}%` : NO_VALUE;
}

/** "YYYY-MM-DD HH:MM UTC" from a strict ISO UTC string, or null (caller shows "tidak tersedia"). */
export function formatUtcLabel(iso) {
  const ms = parseUtcTimestamp(iso);
  if (ms === null) return null;
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** Header data badge. `ready` = team-processed static data, never "live". */
export function dataModeBadge(dataMode) {
  if (dataMode === 'ready') {
    return { tone: 'team', label: 'DATA TIM · lihat provenance' };
  }
  return { tone: 'dummy', label: 'DATA DUMMY — BUKAN DATA NASA' };
}

/**
 * Tri-state visibility text. kind: 'sun' | 'earth'. state: true | false | null.
 * Earth wording describes geometry against the horizon mask, not radio-link quality.
 */
export function visibilityLabel(kind, state) {
  if (kind === 'sun') {
    if (state === true) return { tone: 'positive', text: 'Matahari di atas horizon' };
    if (state === false) return { tone: 'negative', text: 'Matahari terhalang horizon' };
    return { tone: 'unknown', text: 'Matahari: tidak diketahui' };
  }
  if (state === true) return { tone: 'positive', text: 'Bumi di atas horizon' };
  if (state === false) return { tone: 'negative', text: 'Bumi terhalang horizon' };
  return { tone: 'unknown', text: 'Bumi: tidak diketahui' };
}

/** Site lookup that never silently swaps the selected id for another site. */
export function resolveActiveSite(sites, selectedSiteId) {
  if (!Array.isArray(sites) || sites.length === 0) return null;
  return sites.find((s) => s?.site_id === selectedSiteId) ?? null;
}

/** Another site of the same pair group, else the first other site, else null. */
export function resolveCompanionSite(sites, activeSite) {
  if (!Array.isArray(sites) || !activeSite) return null;
  const others = sites.filter((s) => s && s.site_id !== activeSite.site_id);
  return (
    others.find((s) => activeSite.pair_group && s.pair_group === activeSite.pair_group) ??
    others[0] ??
    null
  );
}

/** Wrap-around step for the timeline (dir = +1 / -1). Returns 0 for an empty timeline. */
export function stepIndex(index, total, dir) {
  if (!Number.isInteger(total) || total <= 0) return 0;
  const base = Number.isInteger(index) ? index : 0;
  return (((base + dir) % total) + total) % total;
}

/** Clamp a slider value into the valid index range (NaN → 0). */
export function clampIndex(index, total) {
  if (!Number.isInteger(total) || total <= 0) return 0;
  const i = Math.round(Number(index));
  if (!Number.isFinite(i)) return 0;
  return Math.max(0, Math.min(total - 1, i));
}

/** Great-circle distance between two {latitude_deg, longitude_deg} on a sphere (haversine). */
export function greatCircleDistanceM(a, b, radiusM = MOON_MEAN_RADIUS_M) {
  const vals = [a?.latitude_deg, a?.longitude_deg, b?.latitude_deg, b?.longitude_deg];
  if (!vals.every(Number.isFinite)) return null;
  const toRad = Math.PI / 180;
  const [lat1, lon1, lat2, lon2] = vals.map((v) => v * toRad);
  const h =
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return 2 * radiusM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Pointer travel (px) above which a press is an orbit drag, not a selection click. */
export const CLICK_DRAG_THRESHOLD_PX = 6;
export function isClickNotDrag(deltaPx, threshold = CLICK_DRAG_THRESHOLD_PX) {
  return !Number.isFinite(deltaPx) || deltaPx <= threshold;
}

/**
 * SVG polygon (viewBox x = azimuth 0..360) for a horizon mask, or null if the mask is unusable.
 * Edges at 0° and 360° use the seam-aware interpolated value so the silhouette closes correctly.
 */
export function buildHorizonPolygon(mask, elevationToY) {
  const y0 = getHorizonElevationAtAzimuth(mask, 0);
  if (y0 === null) return null;
  // Same cleaning as the line-of-sight check, so the chart and the labels cannot disagree.
  const pts = cleanHorizonMask(mask)
    .filter((p) => p.azimuth_deg > 0)
    .map((p) => `${p.azimuth_deg},${elevationToY(Math.max(0, p.horizon_elevation_deg)).toFixed(2)}`);
  const edge = elevationToY(Math.max(0, y0)).toFixed(2);
  return `0,100 0,${edge} ${pts.join(' ')} 360,${edge} 360,100`.replace(/\s+/g, ' ');
}

/**
 * SVG path of a sky track (e.g. Earth) across the timeline. Starts a new sub-path ('M') after a
 * missing/invalid sample and when the azimuth jumps across the 0/360 seam (> 180° change).
 */
export function buildSkyTrackPath(timeline, vectorKey, elevationToY) {
  if (!Array.isArray(timeline)) return '';
  const parts = [];
  let prevAz = null;
  for (const item of timeline) {
    const v = item?.[vectorKey];
    if (!isValidSkyVector(v)) {
      prevAz = null;
      continue;
    }
    const az = normalizeAzimuth(v.azimuth_deg);
    const cmd = prevAz === null || Math.abs(az - prevAz) > 180 ? 'M' : 'L';
    parts.push(`${cmd} ${Number(az.toFixed(2))} ${elevationToY(v.elevation_deg).toFixed(2)}`);
    prevAz = az;
  }
  return parts.join(' ');
}
