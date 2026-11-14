import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  earthAxesEnu,
  earthAxesScene,
  enuFromAzEl,
  enuToScene,
  moonPoleEnu,
  positionAngleDeg,
} from '../src/utils/earthOrientation.js';
import { azElToUnitVector } from '../src/utils/shadowMath.js';

/*
 * Fixture: JPL Horizons API, observer table, target 399 (Earth), CENTER coord@301 with
 * SITE_COORD 222.51,-89.4632,1.946771988 (site CONNECTING_RIDGE_A), APPARENT AIRLESS,
 * QUANTITIES 4,14,16,17, 2026-11-14 00:00–03:00 UT, 1 h; retrieved 2026-11-14 07:48 UT.
 * Columns: Azimuth, Elevation, ObsSub-LON (east +), ObsSub-LAT, SN.ang, NP.ang.
 * Az/El are identical to public/data/ephemeris_vectors.json for the same times.
 */
const ROWS = [
  [136.23279382, -5.036151778, 232.034983, -26.47089, 88.36, 355.1871],
  [136.175345527, -4.99358893, 217.534148, -26.386527, 88.44, 354.9874],
  [136.117832831, -4.950704246, 203.032516, -26.300153, 88.51, 354.7884],
  [136.060260646, -4.90750058, 188.530076, -26.211778, 88.59, 354.5901],
];
const SITE_LAT = -89.4632;
const DEG = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const earth = ([az, el, lon, lat, , np]) => ({
  azimuth_deg: az,
  elevation_deg: el,
  sub_observer_lon_deg: lon,
  sub_observer_lat_deg: lat,
  north_pole_pa_deg: np,
});

test('ENU helpers: azimuth convention, scene mapping = azElToUnitVector with the north offset', () => {
  assert.deepEqual(enuFromAzEl(0, 0).map((v) => +v.toFixed(12)), [0, 1, 0]);
  assert.deepEqual(enuFromAzEl(90, 0).map((v) => +v.toFixed(12)), [1, 0, 0]);
  for (const [az, el, off] of [[10, 3, 0], [136.2, -5, -137.49], [264.1, 1.5, -135.73]]) {
    const a = enuToScene(enuFromAzEl(az, el), off);
    const b = azElToUnitVector(az + off, el);
    assert.ok(a.every((v, i) => Math.abs(v - b[i]) < 1e-12));
  }
  // At the lunar south pole the Moon's north pole is (almost) straight down.
  assert.ok(moonPoleEnu(SITE_LAT)[2] < -0.9999);
});

test('published Sun direction reproduces the Horizons sub-solar position angle (independent check)', async () => {
  const eph = JSON.parse(await readFile(new URL('../public/data/ephemeris_vectors.json', import.meta.url), 'utf8'));
  const tl = eph.timelines_by_site.CONNECTING_RIDGE_A;
  ROWS.forEach(([az, el, , , sn], i) => {
    const sun = enuFromAzEl(tl[i].sun_vector.azimuth_deg, tl[i].sun_vector.elevation_deg);
    const pa = positionAngleDeg(sun, enuFromAzEl(az, el), moonPoleEnu(SITE_LAT));
    assert.ok(angDiff(pa, sn) < 0.02, `hour ${i}: ${pa} vs SN.ang ${sn}`);
  });
});

test('Earth axes: orthonormal right-handed, pole at NP.ang, sub-observer point faces the site', () => {
  for (const row of ROWS) {
    const ax = earthAxesEnu(earth(row), SITE_LAT);
    for (const [u, v] of [[ax.x, ax.y], [ax.y, ax.z], [ax.x, ax.z]]) assert.ok(Math.abs(dot(u, v)) < 1e-12);
    const crossXY = [ax.x[1] * ax.y[2] - ax.x[2] * ax.y[1], ax.x[2] * ax.y[0] - ax.x[0] * ax.y[2], ax.x[0] * ax.y[1] - ax.x[1] * ax.y[0]];
    assert.ok(crossXY.every((v, i) => Math.abs(v - ax.z[i]) < 1e-12), 'x × y = z');
    const d = enuFromAzEl(row[0], row[1]);
    assert.ok(angDiff(positionAngleDeg(ax.z, d, moonPoleEnu(SITE_LAT)), row[5]) < 1e-9);
    const [lon, lat] = [row[2] * DEG, row[3] * DEG];
    const B = [0, 1, 2].map((k) => Math.cos(lat) * (Math.cos(lon) * ax.x[k] + Math.sin(lon) * ax.y[k]) + Math.sin(lat) * ax.z[k]);
    assert.ok(Math.acos(Math.min(1, dot(B, ax.toward))) < 1e-6);
    // Southern sub-observer latitude → Earth's north pole tilts away from the site.
    assert.ok(dot(ax.z, ax.toward) < 0);
  }
});

test('Earth spins eastward ≈ 14.5° per hour about its axis (sub-observer longitude decreases)', () => {
  const axes = ROWS.map((row) => earthAxesEnu(earth(row), SITE_LAT));
  for (let i = 1; i < axes.length; i += 1) {
    const a = axes[i - 1].x;
    const b = axes[i].x;
    const z = axes[i].z;
    const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const spin = Math.atan2(dot(z, c), dot(a, b)) / DEG;
    assert.ok(spin > 14 && spin < 15, `spin ${spin}`);
  }
});

test('missing or invalid orientation fields → null (no invented rotation)', () => {
  const base = earth(ROWS[0]);
  for (const key of ['sub_observer_lon_deg', 'sub_observer_lat_deg', 'north_pole_pa_deg']) {
    assert.equal(earthAxesEnu({ ...base, [key]: undefined }, SITE_LAT), null, key);
  }
  assert.equal(earthAxesEnu({ ...base, sub_observer_lat_deg: 120 }, SITE_LAT), null);
  assert.equal(earthAxesEnu({ ...base, elevation_deg: NaN }, SITE_LAT), null);
  assert.equal(earthAxesEnu(base, NaN), null);
  assert.equal(earthAxesScene(base, SITE_LAT, null), null);
  // Today's published data has no orientation fields: the display stays illustrative.
  assert.equal(earthAxesEnu({ azimuth_deg: 136.2, elevation_deg: -5 }, SITE_LAT), null);
});

test('NASA Earth model basis: right-handed, north = +Y, lon 0° = −Z, lon 90°E = −X', async () => {
  const { earthModelBasis } = await import('../src/utils/earthOrientation.js');
  const axes = earthAxesScene(earth(ROWS[0]), SITE_LAT, -137.49);
  const [X, Y, Z] = earthModelBasis(axes);
  const crossXY = [X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]];
  assert.ok(crossXY.every((v, i) => Math.abs(v - Z[i]) < 1e-12), 'proper rotation');
  assert.ok(Y.every((v, i) => Math.abs(v - axes.z[i]) < 1e-12));
  assert.ok(Z.every((v, i) => Math.abs(v + axes.x[i]) < 1e-12));
  assert.ok(X.every((v, i) => Math.abs(v + axes.y[i]) < 1e-12));
  assert.equal(earthModelBasis(null), null);
});
