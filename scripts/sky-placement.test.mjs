import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unitVectorToAzEl } from '../src/utils/shadowMath.js';
import { northOffsetForSite } from '../src/utils/sceneFrame.js';
import {
  angularSeparationDeg,
  earthPhase,
  edgeIndicator,
  horizonRingPoints,
  horizontalCirclePoints,
  skyDomeCenter,
  skyDomeRadiusKm,
  skyObjectLabel,
  skyPoint,
  skyTrackSegments,
} from '../src/utils/skyPlacement.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const azDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const v = (az, el) => ({ azimuth_deg: az, elevation_deg: el });
const dirFrom = (center, p) => unitVectorToAzEl([p[0] - center[0], p[1] - center[1], p[2] - center[2]]);

test('dome radius stays inside the tile and rejects invalid sizes', () => {
  assert.equal(skyDomeRadiusKm(16, 16), 7.2);
  assert.equal(skyDomeRadiusKm(20, 10), 4.5);
  assert.equal(skyDomeRadiusKm(0), null);
  assert.equal(skyDomeRadiusKm(NaN), null);
});

test('dome centre = site surface point + lift; never guessed', () => {
  const site = { coordinates: { uv: { u: 0.75, v: 0.25 } } };
  assert.deepEqual(skyDomeCenter(site, () => 1.2, 16, 16, 0.002).map((x) => +x.toFixed(9)), [4, 1.202, -4]);
  assert.deepEqual(skyDomeCenter(site, null, 16, 16, 0.2), [4, 0.2, -4]); // sampler not ready → datum
  assert.deepEqual(skyDomeCenter(site, () => null, 16, 16, 0.2), [4, 0.2, -4]); // no-data cell
  assert.equal(skyDomeCenter({ coordinates: {} }, () => 1, 16, 16, 0.2), null);
  assert.equal(skyDomeCenter(site, () => 1, 16, 16, NaN), null);
});

test('skyPoint puts a grid vector on the dome around the centre (scene axes)', () => {
  const c = [1, 2, 3];
  assert.deepEqual(skyPoint(v(0, 0), c, 5).map((x) => +x.toFixed(9)), [1, 2, -2]); // north = -Z
  assert.deepEqual(skyPoint(v(90, 0), c, 5).map((x) => +x.toFixed(9)), [6, 2, 3]); // east = +X
  const p = skyPoint(v(264.09, 1.5), c, 7.2);
  const back = dirFrom(c, p);
  assert.ok(azDiff(back.azimuth_deg, 264.09) < 1e-9 && near(back.elevation_deg, 1.5));
  assert.ok(near(Math.hypot(p[0] - 1, p[1] - 2, p[2] - 3), 7.2));
  assert.equal(skyPoint(null, c, 5), null);
  assert.equal(skyPoint(v(10, 95), c, 5), null);
  assert.equal(skyPoint(v(10, 5), [0, NaN, 0], 5), null);
  assert.equal(skyPoint(v(10, 5), c, 0), null);
});

test('angular separation and Earth phase (≈180° − elongation)', () => {
  assert.ok(near(angularSeparationDeg(v(0, 0), v(90, 0)), 90));
  assert.ok(near(angularSeparationDeg(v(10, 0), v(10, 30)), 30));
  assert.ok(near(angularSeparationDeg(v(359, 0), v(1, 0)), 2, 1e-9));
  assert.equal(angularSeparationDeg(v(0, 0), null), null);
  // Earth opposite the Sun → full Earth; Earth next to the Sun → new Earth.
  assert.ok(near(earthPhase(v(0, 0), v(180, 0)).illuminatedFraction, 1));
  assert.ok(earthPhase(v(0, 0), v(1, 0)).illuminatedFraction < 0.001);
  assert.ok(near(earthPhase(v(0, 0), v(90, 0)).illuminatedFraction, 0.5));
  assert.equal(earthPhase(null, v(0, 0)), null);
});

test('track segments: split at gaps, past/future share the current point, no seam break', () => {
  const tl = [
    { sun_vector: v(358, 1) },
    { sun_vector: v(359.5, 1) },
    { sun_vector: v(1, 1.1) }, // crosses 0/360: still one 3D segment
    { sun_vector: null },
    { sun_vector: v(5, 1.2) },
    { sun_vector: v(6, 1.3) },
  ];
  const all = skyTrackSegments(tl, 'sun_vector', 0, [0, 0, 0], 1, -5);
  assert.equal(all.past.length, 0);
  assert.deepEqual(all.future.map((s) => s.length), [3, 2]);
  const split = skyTrackSegments(tl, 'sun_vector', 0, [0, 0, 0], 1, 1);
  assert.deepEqual(split.past.map((s) => s.length), [2]);
  assert.deepEqual(split.future.map((s) => s.length), [2, 2]);
  assert.deepEqual(split.past[0][1], split.future[0][0]);
  // Rotation into the grid frame is applied.
  const rot = skyTrackSegments(tl, 'sun_vector', -137.49, [0, 0, 0], 1, 0);
  assert.ok(azDiff(dirFrom([0, 0, 0], rot.future[0][0]).azimuth_deg, 358 - 137.49) < 1e-9);
  assert.deepEqual(skyTrackSegments(null, 'sun_vector', 0, [0, 0, 0], 1, 0), { past: [], future: [] });
  assert.deepEqual(skyTrackSegments(tl, 'sun_vector', null, [0, 0, 0], 1, 0), { past: [], future: [] });
});

test('horizon ring reproduces the published mask at true angles, rotated to the grid', async () => {
  const telemetry = JSON.parse(await readFile(new URL('../public/data/site_telemetry.json', import.meta.url), 'utf8'));
  for (const site of telemetry.sites) {
    const offset = northOffsetForSite(site);
    const c = [0.3, 1.2, -0.4];
    const ring = horizonRingPoints(site.horizon_mask_360, offset, c, 7.2);
    assert.equal(ring.length, 361);
    assert.deepEqual(ring[0], ring[360]);
    for (const k of [0, 45, 90, 137, 180, 271, 359]) {
      const d = dirFrom(c, ring[k]);
      assert.ok(azDiff(d.azimuth_deg - offset, k) < 1e-6, `${site.site_id} az ${k}`);
      assert.ok(near(d.elevation_deg, site.horizon_mask_360[k].horizon_elevation_deg, 1e-6), `${site.site_id} el ${k}`);
    }
  }
  assert.equal(horizonRingPoints([], 0, [0, 0, 0], 1), null);
  assert.equal(horizonRingPoints([{ azimuth_deg: 0, horizon_elevation_deg: 1 }], 0, [0, 0, 0], 1), null);
  assert.equal(horizontalCirclePoints([0, 0, 0], 2, 4).length, 5);
  assert.equal(horizontalCirclePoints([0, 0, 0], -1), null);
});

test('labels: name + tri-state status (same flag as the panorama), nothing invented', () => {
  assert.equal(skyObjectLabel('sun', v(264.093, 1.5014), true), 'Matahari terlihat');
  assert.equal(skyObjectLabel('earth', v(-10, -5.04), false), 'Bumi terhalang');
  assert.equal(skyObjectLabel('earth', v(10, 2), undefined), 'Bumi tidak diketahui');
  assert.equal(skyObjectLabel('sun', null, true), 'Matahari: arah tidak tersedia');
});

test('edge indicator: on screen, off to the right, behind the camera, invalid', () => {
  const on = edgeIndicator({ x: 0.5, y: -0.5 }, false);
  assert.deepEqual(on, { onScreen: true, x: 0.75, y: 0.75, angleRad: null });
  const right = edgeIndicator({ x: 3, y: 0 }, false, 16 / 9, 0.1);
  assert.equal(right.onScreen, false);
  assert.ok(near(right.x, 0.95) && near(right.y, 0.5) && near(right.angleRad, 0));
  // Behind and projected to the left → really to the right.
  const behind = edgeIndicator({ x: -0.2, y: 0 }, true, 1, 0.1);
  assert.ok(behind.x > 0.9 && near(behind.angleRad, 0));
  const up = edgeIndicator({ x: 0, y: 4 }, false);
  assert.ok(near(up.angleRad, -Math.PI / 2) && up.y < 0.1);
  assert.equal(edgeIndicator({ x: NaN, y: 0 }, false), null);
  assert.equal(edgeIndicator({ x: 0, y: 0 }, false, 0), null);
});

test('view heading, horizontal fov, relative bearing and compass hints', async () => {
  const { viewHeadingGridDeg, horizontalFovDeg, relativeBearingDeg, bearingHint } = await import('../src/utils/skyPlacement.js');
  assert.equal(viewHeadingGridDeg([0, -0.5, -1]), 0); // looking toward -Z = grid north
  assert.equal(viewHeadingGridDeg([1, 0, 0]), 90);
  assert.equal(viewHeadingGridDeg([0, -1, 0]), null);
  assert.equal(viewHeadingGridDeg(null), null);
  assert.ok(near(horizontalFovDeg(42, 1), 42, 1e-9));
  assert.ok(near(horizontalFovDeg(42, 16 / 9), 68.6, 0.05)); // 2·atan(tan 21° · 16/9)
  assert.equal(horizontalFovDeg(0, 1), null);
  assert.equal(relativeBearingDeg(90, 0), 90);
  assert.equal(relativeBearingDeg(350, 10), -20);
  assert.equal(relativeBearingDeg(10, 190), 180);
  assert.equal(relativeBearingDeg(NaN, 0), null);
  assert.equal(bearingHint(true, 120), 'di layar');
  assert.equal(bearingHint(false, 120.4), '120° ke kanan');
  assert.equal(bearingHint(false, -35), '35° ke kiri');
  assert.equal(bearingHint(false, 0.2), 'atas/bawah layar');
  assert.equal(bearingHint(false, null), '—');
});

test('big bodies: far distances, true or uniformly enlarged sizes, look-toward pose', async () => {
  const m = await import('../src/utils/skyPlacement.js');
  assert.ok(near(m.bigBodyDistanceKm('earth', 16, 16), 25.6));
  assert.ok(near(m.bigBodyDistanceKm('sun', 16, 12), 44.8));
  assert.ok(m.bigBodyDistanceKm('sun', 16) > m.bigBodyDistanceKm('earth', 16) + 5);
  assert.equal(m.bigBodyDistanceKm('moon', 16), null);
  assert.equal(m.bigBodyDistanceKm('earth', 0), null);
  assert.equal(m.bigBodyAngularDiameterDeg('earth', 'true'), m.EARTH_ANGULAR_DIAMETER_DEG);
  assert.equal(m.bigBodyAngularDiameterDeg('sun', 'true'), m.SUN_ANGULAR_DIAMETER_DEG);
  const ratioTrue = m.bigBodyAngularDiameterDeg('earth', 'true') / m.bigBodyAngularDiameterDeg('sun', 'true');
  const ratioBig = m.bigBodyAngularDiameterDeg('earth') / m.bigBodyAngularDiameterDeg('sun');
  assert.ok(near(ratioTrue, ratioBig), 'enlargement keeps the Earth:Sun size ratio seen from the Moon');
  // Radius reproduces the apparent diameter.
  const r = m.bigBodyRadiusKm('earth', 25, 'enlarged');
  assert.ok(near((2 * Math.atan(r / 25) * 180) / Math.PI, m.EARTH_ANGULAR_DIAMETER_DEG * m.BIG_BODY_ENLARGEMENT, 1e-9));
  assert.equal(m.bigBodyRadiusKm('earth', -1), null);
  // Pose: camera behind the centre, target ahead, both along the body's horizontal heading.
  const pose = m.lookTowardPose([1, 2, 3], [0, 0.1, -1]);
  assert.deepEqual(pose.position, [1, 3.2, 9]);
  assert.deepEqual(pose.target, [1, 2.3, -1]);
  assert.equal(m.lookTowardPose([0, 0, 0], [0, 1, 0]), null);
  assert.equal(m.lookTowardPose(null, [1, 0, 0]), null);
});
