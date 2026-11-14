import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_VALUE,
  buildHorizonPolygon,
  buildSkyTrackPath,
  clampIndex,
  dataModeBadge,
  formatAngleShort,
  formatLatitude,
  formatLongitude,
  formatMeters,
  formatPercent,
  formatUtcLabel,
  greatCircleDistanceM,
  isClickNotDrag,
  resolveActiveSite,
  resolveCompanionSite,
  stepIndex,
  visibilityLabel,
} from '../src/utils/hudModel.js';
import { cameraGoal, shouldReframe, tileScale } from '../src/utils/cameraMath.js';

// Synthetic fixtures only — not NASA sites, ephemerides or horizon masks.
const SITES = [
  { site_id: 'A', pair_group: 'P', coordinates: { latitude_deg: -89.4521, longitude_deg: 129.1504, uv: { u: 0.46, v: 0.44 } } },
  { site_id: 'B', pair_group: 'P', coordinates: { latitude_deg: -89.461, longitude_deg: 130.42, uv: { u: 0.52, v: 0.49 } } },
  { site_id: 'C', coordinates: { uv: { u: 2, v: 0.5 } } },
];
const y = (el) => 100 - ((Math.max(-2, Math.min(10, el)) + 2) / 12) * 100; // chart mapping

test('formatters never print undefined/NaN and show hemispheres correctly', () => {
  assert.equal(formatLatitude(-89.4521), '89.4521°S'); // was "-89.4521°S"
  assert.equal(formatLatitude(12.5, 1), '12.5°N');
  assert.equal(formatLatitude(-91), NO_VALUE);
  assert.equal(formatLongitude(129.1504), '129.1504°E');
  assert.equal(formatLongitude(-10, 0), '10°W');
  assert.equal(formatLongitude(350, 0), '10°W');
  assert.equal(formatMeters(1850.5), '1851 m');
  assert.equal(formatPercent(81.4), '81.4%');
  assert.equal(formatAngleShort(2.2), '2.2°');
  assert.equal(formatAngleShort(1.25), '1.25°');
  for (const bad of [undefined, null, NaN, 'x']) {
    for (const f of [formatLatitude, formatLongitude, formatMeters, formatPercent, formatAngleShort]) {
      assert.equal(f(bad), NO_VALUE, `${f.name}(${bad})`);
    }
  }
});

test('UTC label: no invented fallback timestamp', () => {
  assert.equal(formatUtcLabel('2026-11-14T05:00:00Z'), '2026-11-14 05:00 UTC');
  assert.equal(formatUtcLabel(undefined), null);
  assert.equal(formatUtcLabel('2026-11-14T05:00:00+07:00'), null);
});

test('data badge never says NASA or LIVE', () => {
  assert.equal(dataModeBadge('scaffold').label, 'DATA DUMMY — BUKAN DATA NASA');
  assert.equal(dataModeBadge(undefined).tone, 'dummy');
  assert.equal(dataModeBadge('ready').label, 'DATA TIM · lihat provenance');
  for (const m of ['ready', 'scaffold', 'x']) assert.doesNotMatch(dataModeBadge(m).label, /LIVE|NASA DATA/);
});

test('visibility labels are tri-state and never claim link quality', () => {
  assert.equal(visibilityLabel('sun', true).tone, 'positive');
  assert.equal(visibilityLabel('sun', false).tone, 'negative');
  assert.equal(visibilityLabel('sun', null).tone, 'unknown');
  assert.equal(visibilityLabel('earth', undefined).tone, 'unknown');
  for (const s of [true, false, null]) assert.doesNotMatch(visibilityLabel('earth', s).text, /Link|Sinyal/i);
});

test('site selection: unknown id → null (no silent swap), companion never self', () => {
  assert.equal(resolveActiveSite(SITES, 'B'), SITES[1]);
  assert.equal(resolveActiveSite(SITES, 'ZZZ'), null);
  assert.equal(resolveActiveSite([], 'A'), null);
  assert.equal(resolveCompanionSite(SITES, SITES[0]), SITES[1]);
  assert.equal(resolveCompanionSite(SITES, SITES[1]), SITES[0], 'was sites[1] itself before');
  assert.equal(resolveCompanionSite(SITES, SITES[2]), SITES[0], 'no pair group → first other');
  assert.equal(resolveCompanionSite([SITES[0]], SITES[0]), null);
});

test('timeline stepping wraps; slider clamps; empty timeline is safe', () => {
  assert.equal(stepIndex(0, 72, -1), 71);
  assert.equal(stepIndex(71, 72, +1), 0);
  assert.equal(stepIndex(5, 0, +1), 0);
  assert.equal(clampIndex(99, 72), 71);
  assert.equal(clampIndex(-3, 72), 0);
  assert.equal(clampIndex('12', 72), 12);
  assert.equal(clampIndex(NaN, 72), 0);
  assert.equal(clampIndex(4, 0), 0);
});

test('site separation from coordinates (sphere, IAU mean radius)', () => {
  const d = greatCircleDistanceM(SITES[0].coordinates, SITES[1].coordinates);
  // Independent small-angle check: R·sqrt(Δφ² + (cosφ·Δλ)²) ≈ 458 m for these fixture points.
  assert.ok(d > 440 && d < 475, `distance ${d}`);
  assert.equal(greatCircleDistanceM(SITES[0].coordinates, SITES[0].coordinates), 0);
  assert.equal(greatCircleDistanceM(SITES[0].coordinates, SITES[2].coordinates), null);
});

test('click vs drag threshold', () => {
  assert.equal(isClickNotDrag(0), true);
  assert.equal(isClickNotDrag(6), true);
  assert.equal(isClickNotDrag(6.1), false);
  assert.equal(isClickNotDrag(undefined), true, 'no delta info → treat as click');
});

test('horizon polygon: closes at 0/360 with seam value; missing mask → null', () => {
  const mask = [
    { azimuth_deg: 5, horizon_elevation_deg: 1 },
    { azimuth_deg: 95, horizon_elevation_deg: 3 },
    { azimuth_deg: 355, horizon_elevation_deg: 5 },
  ];
  const poly = buildHorizonPolygon(mask, y);
  const edge = y(3).toFixed(2); // seam-interpolated value at 0°/360° is 3°
  assert.ok(poly.startsWith(`0,100 0,${edge} 5,`), poly);
  assert.ok(poly.endsWith(`360,${edge} 360,100`), poly);
  assert.equal(buildHorizonPolygon(undefined, y), null);
  assert.equal(buildHorizonPolygon([], y), null);
});

test('sky track path: skips invalid samples and breaks at the 360° seam (no crash)', () => {
  const tl = [
    { earth_vector: { azimuth_deg: 358, elevation_deg: 2 } },
    { earth_vector: { azimuth_deg: 2, elevation_deg: 2 } },
    {},
    { earth_vector: { azimuth_deg: 4, elevation_deg: 3 } },
    { earth_vector: { azimuth_deg: 6, elevation_deg: 3 } },
  ];
  const cmds = buildSkyTrackPath(tl, 'earth_vector', y).split(/\s+/).filter((t) => t === 'M' || t === 'L');
  assert.deepEqual(cmds, ['M', 'M', 'M', 'L']);
  assert.equal(buildSkyTrackPath(null, 'earth_vector', y), '');
});

test('camera: same-view press re-frames (reset); overview ignores site changes', () => {
  assert.equal(shouldReframe(0, 1, 'overview'), true, 'pressing Peta Kawah again resets');
  assert.equal(shouldReframe(1, 1, 'overview'), false, 'selecting a site in overview does not move camera');
  assert.equal(shouldReframe(1, 1, 'site'), true, 'site view follows selection');
});

test('camera goal: site framing uses terrain height; invalid UV falls back to overview', () => {
  const g = cameraGoal('site', SITES[0], () => 1.5, 20, 20);
  assert.equal(g.framed, 'site');
  assert.ok(Math.abs(g.target[0] - (0.46 - 0.5) * 20) < 1e-9);
  assert.ok(Math.abs(g.target[1] - 1.7) < 1e-9);
  assert.equal(cameraGoal('site', SITES[0], () => null, 20, 20).target[1], 0.2, 'no-data height → 0');
  assert.equal(cameraGoal('site', SITES[2], null, 20, 20).framed, 'overview');
  assert.equal(cameraGoal('site', null, null, 20, 20).framed, 'overview');
  assert.deepEqual(cameraGoal('overview', SITES[0], null, 40, 10).position, [0, 26, 34]);
  assert.equal(tileScale(undefined, undefined), 1);
});
