import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { metricsForSite, timelineForSite } from '../src/utils/timeline.js';
import { celestialToCartesian, evaluateLineOfSight } from '../src/utils/shadowMath.js';
import { uvToWorldXZ as uvToTerrainXZ, resolveTerrainSource, decodeHeights } from '../src/utils/terrainMath.js';
import { buildHorizonPolygon } from '../src/utils/hudModel.js';
import { northOffsetForSite, vectorInGrid } from '../src/utils/sceneFrame.js';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('rendered comparison card shows terrain metrics, unknown safety and declared demo screening', async (t) => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const { MicroShiftDeltaCard } = await server.ssrLoadModule('/src/components/hud/MicroShiftDeltaCard.jsx');
  const telemetry = JSON.parse(await readFile('public/data/site_telemetry.json', 'utf8'));
  const html = renderToStaticMarkup(React.createElement(MicroShiftDeltaCard, {
    sites: telemetry.sites, activeSite: telemetry.sites[0],
    selectedSiteId: telemetry.sites[0].site_id, onSelectSite() {}, uiMode: 'planner',
  }));
  assert.match(html, /77\.4%/);
  assert.match(html, /56\.3%/);
  assert.match(html, /163 jam/);
  assert.match(html, /Keamanan belum dinilai/);
  assert.match(html, /CAUTION/);
  assert.doesNotMatch(html, /Eclipse Maks|undefined|NaN/);
  const { LunarTerrain } = await server.ssrLoadModule('/src/components/3d/LunarTerrain.jsx');
  const context = JSON.parse(await readFile('public/data/site01_context.json', 'utf8'));
  assert.equal(renderToStaticMarkup(React.createElement(LunarTerrain, {
    metadata: context, allowSyntheticFallback: false,
  })), '', 'context initializes without a color overlay or synthetic terrain');
});

test('local comparison, per-site timeline and UI visibility match published pipeline results', async () => {
  const telemetry = JSON.parse(await readFile('public/data/site_telemetry.json', 'utf8'));
  const ephemeris = JSON.parse(await readFile('public/data/ephemeris_vectors.json', 'utf8'));
  assert.equal(telemetry.terrain_metadata.area_width_km, 16);
  assert.equal(telemetry.terrain_metadata.normal_texture, null);
  const plan = resolveTerrainSource(telemetry.terrain_metadata);
  assert.equal(plan.kind, 'asset');
  assert.equal(plan.encoding.mode, 'metric-8bit');
  const pixelData = new Uint8Array([0,0,0,255,255,255,255,255,0,0,0,255,255,255,255,255]);
  const decoded = decodeHeights(pixelData, 2, 2, { ...plan.encoding,
    minElevM: telemetry.terrain_metadata.min_elevation_m,
    maxElevM: telemetry.terrain_metadata.max_elevation_m });
  assert.ok(Math.abs(decoded.heights[1]-decoded.heights[0] -
    (telemetry.terrain_metadata.max_elevation_m-telemetry.terrain_metadata.min_elevation_m)/1000) < 1e-6);
  const [a, b] = telemetry.sites;
  assert.equal(a.summary_metrics.solar_illumination_pct, 100);
  assert.equal(metricsForSite(a).solar_illumination_pct, 100 * 557 / 720);
  assert.equal(metricsForSite(b).solar_illumination_pct, 56.25);
  assert.equal(metricsForSite(a).max_eclipse_hours, 163);
  assert.equal(metricsForSite(b).max_eclipse_hours, 178);
  assert.equal(metricsForSite(a).safety_rating, null);
  for (const site of telemetry.sites) {
    const timeline = timelineForSite(ephemeris, site.site_id);
    for (const [index, row] of timeline.entries()) {
      const result = evaluateLineOfSight(site, row);
      const expected = site.terrain_visibility_timeline[index];
      assert.equal(result.is_sun_visible, expected.is_sun_clear_within_dem);
      assert.equal(result.is_dte_active, expected.is_earth_clear_within_dem);
    }
    const basis = site.slope_analysis.local_basis_projected;
    const offset = northOffsetForSite(site);
    for (const azimuth of [0, 45, 90, 180, 270, 359]) {
      const gridVector = vectorInGrid({ azimuth_deg: azimuth, elevation_deg: 3 }, offset);
      const projected = celestialToCartesian(gridVector.azimuth_deg, gridVector.elevation_deg, 1);
      const fromBasis = celestialToCartesian(azimuth, 3, 1, basis);
      projected.forEach((value, axis) => assert.ok(Math.abs(value - fromBasis[axis]) < 1e-6));
    }
    const north = celestialToCartesian(0, 0, 1, basis);
    const east = celestialToCartesian(90, 0, 1, basis);
    assert.ok(Math.abs(north[0] - basis.north.x) < 1e-10);
    assert.ok(Math.abs(north[2] + basis.north.y) < 1e-10);
    assert.ok(Math.abs(east[0] - basis.east.x) < 1e-10);
    assert.ok(Math.abs(east[2] + basis.east.y) < 1e-10);
  }
});

test('legacy baseline remains available, missing sites cannot borrow another timeline', () => {
  assert.deepEqual(timelineForSite({ timelines_by_site: { A: [1] }, timeline: [1] }, 'B'), []);
  assert.deepEqual(timelineForSite({ timeline: [1] }, 'A'), [1]);
  assert.deepEqual(metricsForSite({ summary_metrics: { solar_illumination_pct: 100 } }), { solar_illumination_pct: 100 });
  assert.deepEqual(uvToTerrainXZ({ u: 0, v: 0 }, 16, 12), [-8, -6]);
  assert.deepEqual(uvToTerrainXZ({ u: 1, v: 1 }, 16, 12), [8, 6]);
  const basis = { north: { x: 1, y: 0 }, east: { x: 0, y: -1 } };
  assert.deepEqual(celestialToCartesian(0, 0, 1, basis), [1, 0, 0]);
  assert.equal(celestialToCartesian(0, 0, 1, { north: {} }), null);
  const mask = [{azimuth_deg:0,horizon_elevation_deg:-2},{azimuth_deg:180,horizon_elevation_deg:-1}];
  assert.equal(buildHorizonPolygon(mask, (value) => value), '0,100 0,0.00 180,0.00 360,0.00 360,100');
  assert.equal(buildHorizonPolygon(null, (value) => value), null);
});
