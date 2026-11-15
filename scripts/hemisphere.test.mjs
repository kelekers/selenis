import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildHemisphereGeometry, hemisphereLodData, hemisphereRegionMarkers, hemisphereSunDirection, lunarPosition, MOON_RADIUS_KM } from '../src/utils/hemisphereMath.js';

test('three region markers use their own coordinates and preserve the active A/B selection', async () => {
  const { regions } = JSON.parse(await readFile('public/data/local_regions.json', 'utf8'));
  const telemetry = JSON.parse(await readFile('public/data/site_telemetry.json', 'utf8'));
  const activeSite = telemetry.sites[1];
  const markers = hemisphereRegionMarkers(regions, 'SITE01', activeSite);
  assert.deepEqual(markers.map((m) => m.id), ['SITE01', 'SITE04', 'SITE11']);
  assert.deepEqual(markers.map((m) => m.active), [true, false, false]);
  markers.forEach((marker, index) => {
    const coordinates = index === 0 ? activeSite.coordinates : regions[index].demo_anchor;
    assert.deepEqual(marker.position, lunarPosition(coordinates.latitude_deg, coordinates.longitude_deg, coordinates.elevation_m + 22000));
  });
  assert.equal(new Set(markers.map((m) => JSON.stringify(m.position))).size, 3);
  assert.deepEqual(hemisphereRegionMarkers([], 'SITE01', activeSite), []);
  assert.deepEqual(hemisphereRegionMarkers([{ id: 'SITE99' }]), []);
});

test('hemisphere axes, radius and local Sun frame are body-fixed, south-pole-up', () => {
  const near = (a, b) => a.forEach((value, i) => assert.ok(Math.abs(value - b[i]) < 1e-8));
  near(lunarPosition(-90, 45), [0, MOON_RADIUS_KM, 0]);
  near(lunarPosition(0, 0), [0, 0, -MOON_RADIUS_KM]);
  near(lunarPosition(0, 90), [MOON_RADIUS_KM, 0, 0]);
  near(lunarPosition(0, -90), [-MOON_RADIUS_KM, 0, 0]);
  assert.equal(lunarPosition(20, 0), null);
  const site = { coordinates: { latitude_deg: -45, longitude_deg: 33 } };
  near(hemisphereSunDirection(site, { azimuth_deg: 0, elevation_deg: 90 }), lunarPosition(-45, 33).map((v) => v / MOON_RADIUS_KM));
  const pole = { coordinates: { latitude_deg: -90, longitude_deg: 0 } };
  near(hemisphereSunDirection(pole, { azimuth_deg: 0, elevation_deg: 0 }), [0, 0, -1]);
  near(hemisphereSunDirection(pole, { azimuth_deg: 90, elevation_deg: 0 }), [1, 0, 0]);
  assert.equal(hemisphereSunDirection(site, null), null);
});

test('published overview is periodic, outward-facing, uses southern texture UVs and preserves local science', async () => {
  const data = JSON.parse(await readFile('public/data/south_hemisphere.json', 'utf8'));
  for (const stride of [2, 4]) {
    const lod = hemisphereLodData(data, stride);
    assert.equal(lod.grid.elevations_m[lod.grid.width + 1], data.grid.elevations_m[stride * data.grid.width + stride]);
    const reduced = buildHemisphereGeometry(lod);
    assert.equal(reduced.attributes.position.count, lod.grid.width * lod.grid.height);
    reduced.dispose();
  }
  assert.throws(() => hemisphereLodData(data, 3));
  const geometry = buildHemisphereGeometry(data);
  try {
    const positions = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < positions.count; i += 97) {
      const r = Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i));
      assert.ok(r > 1720 && r < 1750);
      assert.ok(positions.getY(i) >= 0);
      assert.ok(uv.getY(i) >= 0 && uv.getY(i) <= 0.5);
      const n = geometry.attributes.normal;
      assert.ok(positions.getX(i) * n.getX(i) + positions.getY(i) * n.getY(i) + positions.getZ(i) * n.getZ(i) > 0);
    }
    assert.equal(uv.getX(0), 0);
    assert.equal(uv.getX(data.grid.width - 1), 1);
    const normals = geometry.attributes.normal;
    for (let row = 0; row < data.grid.height; row++) {
      const a = row * data.grid.width, b = a + data.grid.width - 1;
      for (const getter of ['getX', 'getY', 'getZ']) assert.equal(normals[getter](a), normals[getter](b));
    }
    assert.match(data.analysis_scope, /OVERVIEW_ONLY/);
    for (const bad of [{ ...data, reference_radius_m: 6378137 }, { ...data, elevation_unit: 'km' },
      { ...data, grid: { ...data.grid, elevations_m: [] } }]) assert.throws(() => buildHemisphereGeometry(bad));
    const local = JSON.parse(await readFile('public/data/site_telemetry.json', 'utf8'));
    assert.equal(local.terrain_metadata.source_resolution_m, 5);
    assert.equal(local.sites[0].terrain_summary_metrics.max_eclipse_hours, 163);
    assert.equal(local.sites[0].summary_metrics.safety_rating, null);
  } finally { geometry.dispose(); }
});
