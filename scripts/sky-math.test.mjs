import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  azElToUnitVector,
  celestialToCartesian,
  evaluateLineOfSight,
  getHorizonElevationAtAzimuth,
  normalizeAzimuth,
  unitVectorToAzEl,
} from '../src/utils/shadowMath.js';
import {
  ephemerisAtIndex,
  ephemerisAtTime,
  interpolateSkyVector,
  parseUtcTimestamp,
  validateEphemerisPoint,
} from '../src/utils/ephemerisMath.js';

// Synthetic unit-test inputs only — not ephemerides or NASA horizon masks.
const TOL = 1e-9; // floating-point tolerance only (PRD AC-02 PROPOSED), not scientific accuracy
const vecNear = (actual, expected, msg) => {
  assert.ok(actual, `${msg}: got null`);
  expected.forEach((e, i) => assert.ok(Math.abs(actual[i] - e) < TOL, `${msg}[${i}]: ${actual[i]} != ${e}`));
};
const near = (a, b, msg, tol = TOL) => assert.ok(Math.abs(a - b) < tol, `${msg}: ${a} != ${b}`);

test('az/el → scene axes: N=-Z, E=+X, S=+Z, W=-X, zenith=+Y, unit length', () => {
  vecNear(azElToUnitVector(0, 0), [0, 0, -1], 'az 0');
  vecNear(azElToUnitVector(90, 0), [1, 0, 0], 'az 90');
  vecNear(azElToUnitVector(180, 0), [0, 0, 1], 'az 180');
  vecNear(azElToUnitVector(270, 0), [-1, 0, 0], 'az 270');
  vecNear(azElToUnitVector(123, 90), [0, 1, 0], 'el 90 (az irrelevant)');
  vecNear(azElToUnitVector(0, -90), [0, -1, 0], 'el -90');
  vecNear(azElToUnitVector(360, 0), azElToUnitVector(0, 0), 'az 360 == 0');
  vecNear(azElToUnitVector(-90, 0), azElToUnitVector(270, 0), 'az -90 == 270');
  for (const [az, el] of [[17, 3], [211.5, -2], [359.99, 45]]) {
    near(Math.hypot(...azElToUnitVector(az, el)), 1, `unit length ${az}/${el}`);
  }
});

test('north offset rotates local-north azimuths (value must come from approved projection)', () => {
  vecNear(azElToUnitVector(0, 0, 90), [1, 0, 0], 'north rotated by +90 → +X');
  assert.equal(azElToUnitVector(0, 0, NaN), null);
});

test('invalid / missing angles return null instead of invented defaults', () => {
  for (const [az, el] of [[NaN, 2], [10, NaN], [undefined, 2], [10, null], [Infinity, 0], [10, 90.01], [10, -91]]) {
    assert.equal(azElToUnitVector(az, el), null, `${az}/${el}`);
    assert.equal(celestialToCartesian(az, el, 42), null, `cartesian ${az}/${el}`);
  }
  vecNear(celestialToCartesian(90, 0, 42), [42, 0, 0], 'radius scaling');
});

test('vector → az/el round trip and azimuth normalisation', () => {
  for (const [az, el] of [[0, 0], [90, 10], [181.25, -3], [359.5, 2.2]]) {
    const back = unitVectorToAzEl(azElToUnitVector(az, el));
    near(back.azimuth_deg, az, `az ${az}`, 1e-9);
    near(back.elevation_deg, el, `el ${el}`, 1e-9);
  }
  assert.equal(unitVectorToAzEl([0, 0, 0]), null);
  assert.equal(normalizeAzimuth(-0.5), 359.5);
  assert.equal(normalizeAzimuth(720), 0);
  assert.equal(normalizeAzimuth(NaN), null);
});

test('horizon mask: interpolation, 360° seam, unsorted, duplicates, invalid samples', () => {
  const mask = [
    { azimuth_deg: 5, horizon_elevation_deg: 1 },
    { azimuth_deg: 95, horizon_elevation_deg: 3 },
    { azimuth_deg: 355, horizon_elevation_deg: 5 },
  ];
  near(getHorizonElevationAtAzimuth(mask, 5), 1, 'exact sample');
  near(getHorizonElevationAtAzimuth(mask, 50), 2, 'mid 5..95');
  // Seam: 355 (5°) → 365≡5 (1°). Old code returned 1 for az 0 and 2; correct values are 3 and 2.2 (t = 7/10 on 355→365).
  near(getHorizonElevationAtAzimuth(mask, 0), 3, 'seam at 0');
  near(getHorizonElevationAtAzimuth(mask, 360), 3, 'seam at 360');
  near(getHorizonElevationAtAzimuth(mask, 2), 2.2, 'seam at 2');
  near(getHorizonElevationAtAzimuth(mask, 358), 3.8, 'seam at 358');
  near(getHorizonElevationAtAzimuth([...mask].reverse(), 50), 2, 'unsorted input');
  const dup = [...mask, { azimuth_deg: 95, horizon_elevation_deg: 5 }, { azimuth_deg: 365, horizon_elevation_deg: 1 }];
  near(getHorizonElevationAtAzimuth(dup, 95), 4, 'duplicates averaged; 365 ≡ 5');
  const dirty = [...mask, { azimuth_deg: NaN, horizon_elevation_deg: 9 }, { azimuth_deg: 50, horizon_elevation_deg: null }];
  near(getHorizonElevationAtAzimuth(dirty, 50), 2, 'invalid samples ignored');
});

test('missing horizon mask is unknown (null), never 0°', () => {
  for (const m of [undefined, null, [], [{ azimuth_deg: 10, horizon_elevation_deg: 2 }], 'x']) {
    assert.equal(getHorizonElevationAtAzimuth(m, 10), null, JSON.stringify(m));
  }
  assert.equal(getHorizonElevationAtAzimuth([{ azimuth_deg: 0, horizon_elevation_deg: 1 }, { azimuth_deg: 90, horizon_elevation_deg: 1 }], NaN), null);
});

test('line-of-sight preview is tri-state and never claims link quality', () => {
  const site = {
    horizon_mask_360: [
      { azimuth_deg: 0, horizon_elevation_deg: 2 },
      { azimuth_deg: 180, horizon_elevation_deg: 2 },
    ],
  };
  const point = {
    sun_vector: { azimuth_deg: 90, elevation_deg: 3 },
    earth_vector: { azimuth_deg: 270, elevation_deg: 1 },
  };
  const los = evaluateLineOfSight(site, point);
  assert.equal(los.is_sun_visible, true);
  assert.equal(los.is_dte_active, false);
  assert.equal(los.sun_horizon_deg, 2);
  assert.equal(los.basis, 'browser-horizon-mask-preview');
  // Exactly on the mask → not above it.
  assert.equal(evaluateLineOfSight(site, { ...point, sun_vector: { azimuth_deg: 90, elevation_deg: 2 } }).is_sun_visible, false);

  const unknownCases = [
    evaluateLineOfSight(null, point),
    evaluateLineOfSight(site, null),
    evaluateLineOfSight({}, point),
    evaluateLineOfSight(site, { sun_vector: { azimuth_deg: NaN, elevation_deg: 3 }, earth_vector: {} }),
  ];
  for (const u of unknownCases) {
    assert.equal(u.is_sun_visible, null);
    assert.equal(u.is_dte_active, null);
    assert.equal(u.sun_horizon_deg, null);
    assert.equal(u.earth_horizon_deg, null);
  }
  // Only the Earth vector missing → Sun still evaluated, DTE unknown.
  const partial = evaluateLineOfSight(site, { sun_vector: point.sun_vector });
  assert.equal(partial.is_sun_visible, true);
  assert.equal(partial.is_dte_active, null);
});

const timeline = [
  { timestamp_utc: '2026-11-14T00:00:00Z', sun_vector: { azimuth_deg: 358, elevation_deg: 2 }, earth_vector: { azimuth_deg: 40, elevation_deg: 3 } },
  { timestamp_utc: '2026-11-14T01:00:00Z', sun_vector: { azimuth_deg: 2, elevation_deg: 4 }, earth_vector: { azimuth_deg: 42, elevation_deg: 3 } },
  { timestamp_utc: '2026-11-14T02:00:00Z', sun_vector: { azimuth_deg: 6, elevation_deg: 6 } },
];

test('timestamps: strict UTC parsing and point validation', () => {
  assert.equal(parseUtcTimestamp('2026-11-14T00:00:00Z'), Date.UTC(2026, 10, 14));
  for (const bad of [undefined, '', '2026-11-14', '2026-11-14T00:00:00', '2026-11-14T00:00:00+07:00', 'kemarin', 1731542400000]) {
    assert.equal(parseUtcTimestamp(bad), null, String(bad));
  }
  const v = validateEphemerisPoint(timeline[2]);
  assert.equal(v.sunValid, true);
  assert.equal(v.earthValid, false);
  assert.match(v.reasons.join(), /earth_vector/);
  assert.match(validateEphemerisPoint({}).reasons.join(), /timestamp_utc/);
});

test('ephemeris lookup: index bounds, exact, between, out of range — no silent fallback', () => {
  assert.equal(ephemerisAtIndex(timeline, 1), timeline[1]);
  assert.equal(ephemerisAtIndex(timeline, 3), null);
  assert.equal(ephemerisAtIndex(timeline, -1), null);
  assert.equal(ephemerisAtIndex(timeline, 0.5), null);
  assert.equal(ephemerisAtIndex(null, 0), null);

  assert.equal(ephemerisAtTime(timeline, '2026-11-14T01:00:00Z').point, timeline[1]);
  assert.equal(ephemerisAtTime(timeline, '2026-11-14T00:30:00Z').status, 'between-samples');
  assert.equal(ephemerisAtTime(timeline, '2026-11-14T00:30:00Z').point, null);
  assert.equal(ephemerisAtTime(timeline, '2026-11-13T23:59:00Z').status, 'out-of-range');
  assert.equal(ephemerisAtTime(timeline, '2026-11-14T02:00:01Z').status, 'out-of-range');
  assert.equal(ephemerisAtTime(timeline, 'bukan waktu').status, 'invalid-time');
  assert.equal(ephemerisAtTime([], '2026-11-14T00:00:00Z').status, 'no-data');
  // Unsorted timeline still resolves by time, not position.
  assert.equal(ephemerisAtTime([...timeline].reverse(), '2026-11-14T00:00:00Z').point, timeline[0]);
});

test('opt-in interpolation crosses the 360° seam and keeps unknown parts unknown', () => {
  const r = ephemerisAtTime(timeline, '2026-11-14T00:30:00Z', { interpolate: true });
  assert.equal(r.status, 'interpolated');
  // 358° → 2° must pass through 0°, not 180°.
  near(normalizeAzimuth(r.point.sun_vector.azimuth_deg + 180) - 180, 0, 'seam az', 0.01);
  near(r.point.sun_vector.elevation_deg, 3, 'el midpoint', 0.01);
  const r2 = ephemerisAtTime(timeline, '2026-11-14T01:30:00Z', { interpolate: true });
  assert.equal(r2.point.earth_vector, null, 'missing earth sample stays unknown');
  const same = interpolateSkyVector({ azimuth_deg: 10, elevation_deg: 5 }, { azimuth_deg: 10, elevation_deg: 5 }, 0.5);
  near(same.azimuth_deg, 10, 'identical endpoints');
  assert.equal(interpolateSkyVector({ azimuth_deg: 0, elevation_deg: 0 }, { azimuth_deg: 180, elevation_deg: 0 }, 0.5), null, 'antipodal');
  assert.equal(interpolateSkyVector(null, { azimuth_deg: 0, elevation_deg: 0 }, 0.5), null);
});
