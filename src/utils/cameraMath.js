import { uvToWorldXZ } from './terrainMath.js';

/** Default overview pose for a 20 km tile; scaled linearly for other tile sizes. */
export const OVERVIEW_POS = [0, 13, 17];
export const BASE_TILE_KM = 20;
const SITE_OFFSET = [3.2, 3.6, 4.8];
const SITE_TARGET_LIFT = 0.2;

/**
 * Re-frame policy:
 *  - every explicit command (nonce changed) re-frames — pressing the same view again = reset;
 *  - in 'site' view, site/terrain changes re-frame to follow the selection;
 *  - in 'overview', other changes (e.g. selecting a site) never move the camera.
 */
export function shouldReframe(prevNonce, nonce, view) {
  return nonce !== prevNonce || view === 'site' || view === 'pov';
}

export function tileScale(widthKm, depthKm) {
  const w = Number.isFinite(widthKm) && widthKm > 0 ? widthKm : BASE_TILE_KM;
  const d = Number.isFinite(depthKm) && depthKm > 0 ? depthKm : w;
  return Math.max(w, d) / BASE_TILE_KM;
}

/**
 * Camera goal { position, target, framed } for a view. 'site' or 'pov' with an invalid/missing site UV
 * falls back to the overview (framed: 'overview') instead of guessing a position.
 * sampleHeightAtUV may be null or return null (terrain not ready / no-data) → y = 0.
 */
export function cameraGoal(view, site, sampleHeightAtUV, widthKm, depthKm) {
  const uv = site?.coordinates?.uv;
  const xz = view === 'site' || view === 'pov' ? uvToWorldXZ(uv, widthKm, depthKm) : null;
  if (xz) {
    const [x, z] = xz;
    const y = sampleHeightAtUV?.(uv.u, uv.v) ?? 0;
    if (view === 'pov') {
      return {
        framed: 'pov',
        target: [x, y + 0.42, z],
        position: [x, y + 0.48, z + 0.85],
      };
    }
    return {
      framed: 'site',
      target: [x, y + SITE_TARGET_LIFT, z],
      position: [x + SITE_OFFSET[0], y + SITE_OFFSET[1], z + SITE_OFFSET[2]],
    };
  }
  const k = tileScale(widthKm, depthKm);
  return {
    framed: 'overview',
    target: [0, 0, 0],
    position: OVERVIEW_POS.map((c) => c * k),
  };
}
