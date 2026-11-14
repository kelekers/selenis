import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hasSiteTimelines, timelineForSite } from '../src/utils/timeline.js';
import { evaluateLineOfSight } from '../src/utils/shadowMath.js';
import { resolveHeightEncoding } from '../src/utils/terrainMath.js';
import { northOffsetForSite, vectorInGrid } from '../src/utils/sceneFrame.js';
import { azElToUnitVector } from '../src/utils/shadowMath.js';

test('published data selects each site timeline and missing data is rejected', async () => {
  const sites = JSON.parse(await readFile('public/data/site_telemetry.json', 'utf8'));
  const ephemeris = JSON.parse(await readFile('public/data/ephemeris_vectors.json', 'utf8'));
  assert.ok(hasSiteTimelines(sites, ephemeris));
  const encoding = resolveHeightEncoding(sites.terrain_metadata.height_encoding);
  assert.equal(encoding.mode, 'metric-8bit');
  assert.equal(encoding.offsetM, sites.terrain_metadata.min_elevation_m);
  assert.ok(Math.abs(encoding.offsetM + 255 * encoding.metersPerUnit - sites.terrain_metadata.max_elevation_m) < 1e-6);
  for (const site of sites.sites) {
    const offset = northOffsetForSite(site);
    const north = site.slope_analysis.local_basis_projected.north;
    const rotated = vectorInGrid({ azimuth_deg: 0, elevation_deg: 0 }, offset);
    const direction = azElToUnitVector(rotated.azimuth_deg, rotated.elevation_deg);
    assert.ok(Math.abs(direction[0] - north.x) < 1e-6);
    assert.ok(Math.abs(direction[2] + north.y) < 1e-6);
    const timeline = timelineForSite(ephemeris, site.site_id);
    assert.equal(timeline.length, site.terrain_visibility_timeline.length);
    for (const point of timeline) {
      const expected = site.terrain_visibility_timeline.find((row) => row.timestamp_utc === point.timestamp_utc);
      const actual = evaluateLineOfSight(site, point);
      assert.equal(actual.basis, 'pipeline-local-dem');
      assert.equal(actual.is_sun_visible, expected.is_sun_clear_within_dem);
      assert.equal(actual.is_dte_active, expected.is_earth_clear_within_dem);
    }
  }
  assert.equal(northOffsetForSite({}), null);
  assert.equal(vectorInGrid({ azimuth_deg: 10 }, null), null);
  const [first, second] = sites.sites;
  assert.notDeepEqual(timelineForSite(ephemeris, first.site_id)[0], timelineForSite(ephemeris, second.site_id)[0]);
  assert.equal(hasSiteTimelines(sites, { timelines_by_site: {} }), false);
  assert.deepEqual(timelineForSite({ timeline: [1] }, 'mock'), [1]);
  assert.equal(evaluateLineOfSight({ horizon_mask_360: [{ azimuth_deg: 0, horizon_elevation_deg: -2 }, { azimuth_deg: 180, horizon_elevation_deg: -2 }] }, {
    sun_vector: { azimuth_deg: 0, elevation_deg: -1 },
    earth_vector: { azimuth_deg: 0, elevation_deg: -1 },
  }).is_sun_visible, false);
});
