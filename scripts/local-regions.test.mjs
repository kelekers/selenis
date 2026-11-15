import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { localRegionsFromCatalog, DEFAULT_REGION } from '../src/utils/localRegions.js';
import { hasSiteTimelines, timelineForSite } from '../src/utils/timeline.js';
import { evaluateLineOfSight } from '../src/utils/shadowMath.js';
import { panoramaElevationRange } from '../src/utils/hudModel.js';
import { contextMetadata, horizonBlockerPositions } from '../src/utils/terrainMath.js';

test('region catalog rejects duplicate IDs and escaping asset paths', () => {
  const valid = { schema_version: 1, default_region_id: 'SITE01', regions: [DEFAULT_REGION] };
  assert.equal(localRegionsFromCatalog(valid)[0].id, 'SITE01');
  assert.throws(() => localRegionsFromCatalog({ ...valid, regions: [DEFAULT_REGION, DEFAULT_REGION] }));
  assert.throws(() => localRegionsFromCatalog({ ...valid, regions: [{ ...DEFAULT_REGION, telemetry_url: '/data/../secrets.json' }] }));
  assert.throws(() => localRegionsFromCatalog({ ...valid, default_region_id: 'SITE99' }));
});

test('every published local region has its own terrain, ephemeris, masks and numeric roughness', async () => {
  const catalog = JSON.parse(await readFile('public/data/local_regions.json', 'utf8'));
  const regions = localRegionsFromCatalog(catalog);
  assert.deepEqual(regions.map((region) => region.id), ['SITE01', 'SITE04', 'SITE11']);
  const ids = new Set();
  const starts = new Set();
  for (const region of regions) {
    const telemetry = JSON.parse(await readFile(`public${region.telemetry_url}`, 'utf8'));
    const ephemeris = JSON.parse(await readFile(`public${region.ephemeris_url}`, 'utf8'));
    const meta = telemetry.terrain_metadata;
    assert.equal(meta.region_id, region.id);
    assert.equal(meta.source_resolution_m, 5);
    assert.equal(meta.area_width_km, 16);
    assert.equal(meta.area_height_km, 16);
    assert.match(meta.heightmap_texture, new RegExp(region.id.toLowerCase()));
    const context = JSON.parse(await readFile(`public${meta.context_dataset_url}`, 'utf8'));
    assert.equal(contextMetadata(meta, context).render_vertex_spacing_m, 62.5);
    assert.match(context.analysis_scope, /DISPLAY_CONTEXT_ONLY/);
    assert.deepEqual(context.source_grid_pixels, [8000, 8000]);
    assert.ok(hasSiteTimelines(telemetry, ephemeris));
    starts.add(ephemeris.mission_window.start_utc);
    for (const site of telemetry.sites) {
      assert.ok(!ids.has(site.site_id)); ids.add(site.site_id);
      const timeline = timelineForSite(ephemeris, site.site_id);
      const range = panoramaElevationRange(site, timeline);
      assert.ok(site.horizon_mask_360.every((p) => Math.max(0, p.horizon_elevation_deg) <= range.max));
      assert.ok(timeline.every((p) => [p.sun_vector, p.earth_vector].every((v) => v.elevation_deg >= range.min && v.elevation_deg <= range.max)));
      assert.equal(timeline.length, 720);
      assert.equal(site.summary_metrics.safety_rating, null);
      assert.equal(horizonBlockerPositions(site, meta).length, 360 * 3);
      assert.ok(site.horizon_mask_360.every((p) => p.blocker_distance_m > 0 &&
        p.blocker_distance_m <= p.sampled_distance_m && typeof p.blocker_is_last_sample === 'boolean'));
      assert.ok(Number.isFinite(site.slope_analysis.roughness_rmse_m));
      for (const index of [0, 137, 400, 719]) {
        const visibility = evaluateLineOfSight(site, timeline[index]);
        assert.equal(visibility.is_sun_visible, site.terrain_visibility_timeline[index].is_sun_clear_within_dem);
      }
    }
    const roughness = JSON.parse(await readFile(`public${meta.roughness_analysis.data_url}`, 'utf8'));
    assert.equal(roughness.region_id, region.id);
    assert.equal(roughness.unit, 'm');
    assert.deepEqual(roughness.footprint_m, [100, 100]);
    assert.equal(roughness.values_m.length, roughness.width * roughness.height);
    assert.equal(roughness.width, 160);
    assert.ok(roughness.values_m.every((v) => Number.isFinite(v) && v >= 0));
  }
  assert.equal(starts.size, 1);
});
