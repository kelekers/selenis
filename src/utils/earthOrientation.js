import { isValidSkyVector } from './shadowMath.js';

/**
 * Earth's orientation as seen from a lunar site, from JPL Horizons observer quantities for the
 * target Earth (399) and the site observer (coord@301), all at the same instant:
 *   - azimuth/elevation (quantity 4, local ENU, azimuth from local north clockwise);
 *   - ObsSub-LON / ObsSub-LAT (quantity 14): the point of Earth facing the site,
 *     planetodetic, longitude EAST-positive for Earth;
 *   - NP.ang (quantity 17): Earth's north-pole position angle on the sky, counter-clockwise
 *     (north through east) from the direction of the site body's (Moon's) north pole.
 * The Moon's north pole in the site's ENU frame follows from the site latitude. The small offset
 * between the IAU 2015 lunar pole (Horizons RA/Dec frame) and the mean-Earth frame of the site is
 * ignored (visualisation). Frames: ENU = [east, north, up]; scene = three.js axes rotated by the
 * site's north offset (see sceneFrame.js / shadowMath.js: grid azimuth 0° = −Z, 90° = +X, +Y up).
 */

const DEG = Math.PI / 180;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const unit = (a) => {
  const n = Math.hypot(a[0], a[1], a[2]);
  return n > 1e-12 && Number.isFinite(n) ? scale(a, 1 / n) : null;
};

/** Local ENU unit vector for azimuth (from north, clockwise) and elevation, in degrees. */
export function enuFromAzEl(azimuthDeg, elevationDeg) {
  const a = azimuthDeg * DEG;
  const e = elevationDeg * DEG;
  return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)];
}

/** ENU vector → scene axes, with the grid rotated by the site's north offset (deg). */
export function enuToScene([east, north, up], northOffsetDeg) {
  const c = Math.cos(northOffsetDeg * DEG);
  const s = Math.sin(northOffsetDeg * DEG);
  const gridEast = east * c + north * s;
  const gridNorth = north * c - east * s;
  return [gridEast, up, -gridNorth];
}

/** Direction of the Moon's north pole in the ENU frame of a site at latitude `latDeg`. */
export function moonPoleEnu(latDeg) {
  return [0, Math.cos(latDeg * DEG), Math.sin(latDeg * DEG)];
}

/**
 * North and east unit vectors on the sky at direction `d` (ENU), with "north" = toward `pole`.
 * East = direction of increasing right ascension about that pole. null when d ∥ pole.
 */
export function skyBasis(d, pole) {
  const east = unit(cross(pole, d));
  if (!east) return null;
  return { north: cross(d, east), east };
}

/** Position angle (deg, 0..360, north through east) of direction `v` seen around `d`. */
export function positionAngleDeg(v, d, pole) {
  const basis = skyBasis(d, pole);
  if (!basis) return null;
  const pa = Math.atan2(dot(v, basis.east), dot(v, basis.north)) / DEG;
  return (pa + 360) % 360;
}

const finite = (...xs) => xs.every(Number.isFinite);

/**
 * Earth's body axes expressed in ENU at the site, or null when any input is missing/invalid:
 *   { x: lat 0°/lon 0°, y: lat 0°/lon 90°E, z: north pole, toward: Earth→site unit vector }.
 * `earth` = { azimuth_deg, elevation_deg, sub_observer_lat_deg, sub_observer_lon_deg,
 * north_pole_pa_deg } (field names proposed for the data contract).
 */
export function earthAxesEnu(earth, siteLatDeg) {
  if (!isValidSkyVector(earth)) return null;
  const { sub_observer_lat_deg: lat, sub_observer_lon_deg: lon, north_pole_pa_deg: pa } = earth;
  if (!finite(lat, lon, pa, siteLatDeg) || Math.abs(lat) > 90 || Math.abs(siteLatDeg) > 90) return null;
  const d = enuFromAzEl(earth.azimuth_deg, earth.elevation_deg); // site → Earth
  const basis = skyBasis(d, moonPoleEnu(siteLatDeg));
  if (!basis) return null;
  const toward = scale(d, -1); // Earth → site
  // Pole on the sky at the position angle, tilted toward the site by the sub-observer latitude.
  const onSky = add(scale(basis.north, Math.cos(pa * DEG)), scale(basis.east, Math.sin(pa * DEG)));
  const z = unit(add(scale(onSky, Math.cos(lat * DEG)), scale(toward, Math.sin(lat * DEG))));
  // The sub-observer point B(lat, lon) must face the site: rotate about z so that it does.
  // In body axes B = cos(lat)·(cos(lon)·x + sin(lon)·y) + sin(lat)·z, so its equatorial part
  // (toward − sin(lat)·z) fixes x and y.
  const eq = unit(add(toward, scale(z, -Math.sin(lat * DEG))));
  if (!z || !eq) return null;
  const eqPerp = cross(z, eq); // equatorial direction 90° east of the sub-observer meridian
  const c = Math.cos(lon * DEG);
  const s = Math.sin(lon * DEG);
  // eq = cos(lon)·x + sin(lon)·y ;  eqPerp = −sin(lon)·x + cos(lon)·y
  const x = add(scale(eq, c), scale(eqPerp, -s));
  const y = add(scale(eq, s), scale(eqPerp, c));
  return { x, y, z, toward };
}

/**
 * Same axes in scene coordinates (site's north offset applied), or null. Use with the model's own
 * axis convention to build its rotation (see SkyModels.jsx).
 */
export function earthAxesScene(earth, siteLatDeg, northOffsetDeg) {
  const enu = earthAxesEnu(earth, siteLatDeg);
  if (!enu || !Number.isFinite(northOffsetDeg)) return null;
  return {
    x: enuToScene(enu.x, northOffsetDeg),
    y: enuToScene(enu.y, northOffsetDeg),
    z: enuToScene(enu.z, northOffsetDeg),
  };
}

/**
 * Axis convention of the NASA Earth model (public/models/Earth_1_12756.usdz), read from its
 * cube-map texture: model +Y = north pole, −Z = lat 0°/lon 0°, −X = lon 90°E, +X = lon 90°W,
 * +Z = lon 180°. Returns the model's X, Y, Z axes in scene coordinates for Earth body axes
 * `axes` (from earthAxesScene), i.e. the columns of the model's rotation; null without axes.
 */
export function earthModelBasis(axes) {
  if (!axes) return null;
  const neg = (v) => v.map((c) => -c);
  return [neg(axes.y), axes.z, neg(axes.x)];
}
