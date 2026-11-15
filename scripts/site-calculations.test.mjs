import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import {
  MAX_SITES,
  buildCalculatedSite,
  computeLocalBasisProjected,
  getPlacementUvBounds,
  latLonToUv,
  uvToLatLon,
} from '../src/utils/siteCalculations.js';
import { uvToWorldXZ } from '../src/utils/terrainMath.js';
import { northOffsetForSite } from '../src/utils/sceneFrame.js';
import { evaluateLineOfSight } from '../src/utils/shadowMath.js';

test('South Polar Stereographic UV <-> Lat/Lon round-trip matches published Site01 coordinates', async () => {
  const telemetry = JSON.parse(await readFile('public/data/site_telemetry.json', 'utf8'));
  const meta = telemetry.terrain_metadata;
  for (const site of telemetry.sites) {
    const { latitude_deg, longitude_deg, uv } = site.coordinates;
    const fromUv = uvToLatLon(uv, meta, telemetry.sites);
    assert.ok(Math.abs(fromUv.latitude_deg - latitude_deg) < 1e-4, `lat ${fromUv.latitude_deg} vs ${latitude_deg}`);
    assert.ok(Math.abs(fromUv.longitude_deg - longitude_deg) < 1e-4, `lon ${fromUv.longitude_deg} vs ${longitude_deg}`);

    const backToUv = latLonToUv(latitude_deg, longitude_deg, meta, telemetry.sites);
    assert.equal(backToUv.inBounds, true);
    assert.ok(Math.abs(backToUv.u - uv.u) < 1e-5, `u ${backToUv.u} vs ${uv.u}`);
    assert.ok(Math.abs(backToUv.v - uv.v) < 1e-5, `v ${backToUv.v} vs ${uv.v}`);
  }
});

test('local_basis_projected matches published pipeline basis at Site01 coordinates', async () => {
  const telemetry = JSON.parse(await readFile('public/data/site_telemetry.json', 'utf8'));
  const meta = telemetry.terrain_metadata;
  for (const site of telemetry.sites) {
    const { latitude_deg, longitude_deg } = site.coordinates;
    const computed = computeLocalBasisProjected(latitude_deg, longitude_deg, meta, telemetry.sites);
    const expected = site.slope_analysis.local_basis_projected;
    assert.ok(Math.abs(computed.north.x - expected.north.x) < 1e-4);
    assert.ok(Math.abs(computed.north.y - expected.north.y) < 1e-4);
    assert.ok(Math.abs(computed.east.x - expected.east.x) < 1e-4);
    assert.ok(Math.abs(computed.east.y - expected.east.y) < 1e-4);
  }
});

test('buildCalculatedSite computes coordinates, slope, 360° horizon mask, timeline and visibility for added/moved sites', async () => {
  const telemetry = JSON.parse(await readFile('public/data/site_telemetry.json', 'utf8'));
  const ephemeris = JSON.parse(await readFile('public/data/ephemeris_vectors.json', 'utf8'));

  // Synthetic 65x65 DEM sampler around ~1940m with a ridge
  const grid = 65;
  const heightsM = new Float32Array(grid * grid);
  for (let r = 0; r < grid; r += 1) {
    for (let c = 0; c < grid; c += 1) {
      const u = c / (grid - 1);
      const v = r / (grid - 1);
      heightsM[r * grid + c] = 1900 + 80 * Math.sin(u * Math.PI) * Math.cos(v * Math.PI * 0.5) + 12 * (u - 0.5);
    }
  }
  const sampler = (u, v) => (heightsM[Math.round(v * (grid - 1)) * grid + Math.round(u * (grid - 1))] - 1000) / 1000;
  sampler.heightsM = heightsM;
  sampler.grid = grid;
  sampler.gridCols = grid;
  sampler.gridRows = grid;
  sampler.sampleElevationM = (u, v) => heightsM[Math.round(v * (grid - 1)) * grid + Math.round(u * (grid - 1))];

  const { site: siteC, timeline: timelineC } = buildCalculatedSite({
    siteId: 'SITE01_SITE_C',
    name: 'Connecting Ridge Site C',
    uv: { u: 0.35, v: 0.62 },
    telemetry,
    ephemeris,
    terrainSampler: sampler,
  });

  assert.equal(siteC.site_id, 'SITE01_SITE_C');
  assert.equal(siteC.selection_basis, 'USER_CUSTOM_COORDINATES');
  assert.ok(Number.isFinite(siteC.coordinates.latitude_deg));
  assert.ok(Number.isFinite(siteC.coordinates.longitude_deg));
  assert.ok(Number.isFinite(siteC.coordinates.elevation_m));
  assert.ok(Number.isFinite(northOffsetForSite(siteC)));
  assert.equal(siteC.horizon_mask_360.length, 360);
  assert.equal(timelineC.length, 720);
  assert.equal(siteC.terrain_visibility_timeline.length, 720);
  assert.ok(Number.isFinite(siteC.terrain_summary_metrics.solar_illumination_pct));
  assert.ok(Number.isFinite(siteC.terrain_summary_metrics.dte_availability_pct));
  assert.ok(Number.isFinite(siteC.slope_analysis.max_slope_deg));
  assert.ok(['LOWER_CONCERN', 'CAUTION', 'EXCEEDS_DEMO_LIMITS'].includes(siteC.terrain_screening.rating));

  const vis0 = evaluateLineOfSight(siteC, timelineC[0]);
  assert.equal(vis0.basis, 'pipeline-local-dem');
  assert.equal(typeof vis0.is_sun_visible, 'boolean');
  assert.equal(typeof vis0.is_dte_active, 'boolean');

  // Verify placement across the full 40×40 km context terrain (outside the inner 16×16 km primary tile)
  const bounds = getPlacementUvBounds(telemetry.terrain_metadata);
  assert.ok(bounds.minU < -0.7 && bounds.maxU > 1.7);
  const { site: outerSite } = buildCalculatedSite({
    siteId: 'SITE01_OUTER_CONTEXT',
    name: 'Outer Context Rim',
    uv: { u: -0.65, v: 1.6, extended: true },
    telemetry,
    ephemeris,
  });
  assert.equal(outerSite.coordinates.uv.extended, true);
  assert.ok(outerSite.coordinates.uv.u < 0 && outerSite.coordinates.uv.v > 1);
  const worldXZ = uvToWorldXZ(outerSite.coordinates.uv, 16, 16);
  assert.ok(Array.isArray(worldXZ) && Math.abs(worldXZ[0] - (-18.4)) < 1e-3 && Math.abs(worldXZ[1] - 17.6) < 1e-3);
});

test('MicroShiftDeltaCard renders up to 4 sites (A, B, C, D) and Add/Move controls', async (t) => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const { MicroShiftDeltaCard } = await server.ssrLoadModule('/src/components/hud/MicroShiftDeltaCard.jsx');
  const telemetry = JSON.parse(await readFile('public/data/site_telemetry.json', 'utf8'));
  const ephemeris = JSON.parse(await readFile('public/data/ephemeris_vectors.json', 'utf8'));

  const { site: siteC } = buildCalculatedSite({
    siteId: 'SITE01_SITE_C',
    name: 'Site C Custom',
    uv: { u: 0.42, v: 0.45 },
    telemetry,
    ephemeris,
  });
  const { site: siteD } = buildCalculatedSite({
    siteId: 'SITE01_SITE_D',
    name: 'Site D Custom',
    uv: { u: 0.58, v: 0.55 },
    telemetry,
    ephemeris,
  });

  const fourSites = [...telemetry.sites, siteC, siteD];
  assert.equal(fourSites.length, MAX_SITES);

  const html = renderToStaticMarkup(
    React.createElement(MicroShiftDeltaCard, {
      sites: fourSites,
      activeSite: siteC,
      selectedSiteId: siteC.site_id,
      onSelectSite() {},
      onAddSite() {},
      onMoveSite() {},
      onRemoveSite() {},
      uiMode: 'planner',
      terrainMetadata: telemetry.terrain_metadata,
    })
  );

  assert.match(html, /SITE A/);
  assert.match(html, /SITE B/);
  assert.match(html, /SITE C/);
  assert.match(html, /SITE D/);
  assert.match(html, /Penuh \(4\/4\)/);
  assert.match(html, /Pindah Site C/);
});
