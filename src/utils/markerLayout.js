import { uvToWorldXZ } from './terrainMath.js';

/**
 * Pure helpers for the 3D site markers (testable with node --test).
 *
 * Unscaled marker dimensions in scene km. The invisible pick proxy is the widest part.
 * These are visual aids only — the ring is NOT a computed safe landing zone.
 */
export const MARKER_DIMENSIONS_KM = Object.freeze({
  pickRadius: 0.55,
  pickCenterHeight: 0.3,
  pinRadius: 0.04,
  pinHeight: 0.44,
  headHeight: 0.48,
  headRadius: 0.11,
  headRadiusSelected: 0.16,
  ringInner: 0.25,
  ringOuter: 0.34,
});

/** One pick radius may cover at most this fraction of the closest site spacing (< 0.5 → no overlap). */
export const MAX_PICK_FRACTION = 0.45;
/** Lower bound so markers never vanish when two sites (almost) coincide. */
export const MIN_MARKER_SCALE = 0.15;

/** Smallest horizontal distance (scene km) between two sites with a valid UV, or null (< 2 valid sites). */
export function minSiteSpacingKm(sites, widthKm, depthKm = widthKm) {
  if (!Array.isArray(sites)) return null;
  const points = sites
    .map((site) => uvToWorldXZ(site?.coordinates?.uv, widthKm, depthKm))
    .filter(Boolean);
  let best = null;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const d = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
      if (best === null || d < best) best = d;
    }
  }
  return best;
}

/**
 * Uniform scale for every marker so that neighbouring pick proxies (and the smaller rings) cannot
 * overlap: sites only 500 m apart otherwise share one 1.1 km wide click target and a click may
 * select the wrong site. 1 when there is room or fewer than two placeable sites.
 */
export function markerScale(sites, widthKm, depthKm = widthKm) {
  const spacing = minSiteSpacingKm(sites, widthKm, depthKm);
  if (spacing === null) return 1;
  const fit = (MAX_PICK_FRACTION * spacing) / MARKER_DIMENSIONS_KM.pickRadius;
  return Math.min(1, Math.max(MIN_MARKER_SCALE, fit));
}

/**
 * Colour/dash of a 3D sky-direction line from the SAME tri-state flag the 360° panorama uses
 * (`activeVisibility.is_sun_visible` / `is_dte_active`), so both views always tell the same story.
 * Sun: visible = amber solid, otherwise grey dashed (as the panorama dot).
 * Earth: visible = green solid, blocked = red dashed, unknown = grey dashed. Never link quality.
 */
export function skyLineStyle(kind, state) {
  if (kind === 'sun') {
    return state === true ? { color: '#f59e0b', dashed: false } : { color: '#94a3b8', dashed: true };
  }
  if (state === true) return { color: '#10b981', dashed: false };
  if (state === false) return { color: '#ef4444', dashed: true };
  return { color: '#94a3b8', dashed: true };
}

/**
 * Short marker tag from the site name ("Connecting Ridge Site A" → "A"), so the two nearby pins
 * match the "Site A / Site B" cards of the HUD. Names without a "Site X" suffix keep the full name
 * (never an invented letter); no name → the site id.
 */
export function siteMarkerTag(site) {
  const name = typeof site?.name === 'string' ? site.name.trim() : '';
  const match = /\bsite\s+(\S+)$/i.exec(name);
  if (match) return match[1];
  return name || (site?.site_id ?? '');
}

/**
 * Display of a big Sun/Earth body from the same tri-state flag as the panorama and the small
 * icons: visible = full, blocked or unknown = faded "ghost" (like the small icons; slightly fainter
 * because the big bodies are much larger), so a body hidden by the terrain never looks fully
 * visible from the site.
 */
export const GHOST_OPACITY = 0.45;
export function bigBodyGhost(state) {
  return state === true ? { dimmed: false, opacity: 1 } : { dimmed: true, opacity: GHOST_OPACITY };
}
