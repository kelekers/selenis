import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hasSiteTimelines, timelineForSite } from '../src/utils/timeline.js';
import { evaluateLineOfSight } from '../src/utils/shadowMath.js';

test('published data selects each site timeline and missing data is rejected', async () => {
  const sites = JSON.parse(await readFile('public/data/site_telemetry.json', 'utf8'));
  const ephemeris = JSON.parse(await readFile('public/data/ephemeris_vectors.json', 'utf8'));
  assert.ok(hasSiteTimelines(sites, ephemeris));
  const [first, second] = sites.sites;
  assert.notDeepEqual(timelineForSite(ephemeris, first.site_id)[0], timelineForSite(ephemeris, second.site_id)[0]);
  assert.equal(hasSiteTimelines(sites, { timelines_by_site: {} }), false);
  assert.deepEqual(timelineForSite({ timeline: [1] }, 'mock'), [1]);
  assert.equal(evaluateLineOfSight({ horizon_mask_360: [{ azimuth_deg: 0, horizon_elevation_deg: -2 }, { azimuth_deg: 180, horizon_elevation_deg: -2 }] }, {
    sun_vector: { azimuth_deg: 0, elevation_deg: -1 },
    earth_vector: { azimuth_deg: 0, elevation_deg: -1 },
  }).is_sun_visible, false);
});
