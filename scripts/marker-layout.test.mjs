import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  MARKER_DIMENSIONS_KM,
  MIN_MARKER_SCALE,
  markerScale,
  minSiteSpacingKm,
  skyLineStyle,
} from '../src/utils/markerLayout.js';

const site = (u, v) => ({ coordinates: { uv: { u, v } } });

test('site spacing uses scene km and ignores sites without a valid UV', () => {
  const sites = [site(0.5, 0.5), site(0.5, 0.75), { coordinates: {} }, site(2, 0.5)];
  assert.equal(minSiteSpacingKm(sites, 16, 16), 4);
  assert.equal(minSiteSpacingKm([site(0.5, 0.5)], 16, 16), null);
  assert.equal(minSiteSpacingKm(null, 16, 16), null);
});

test('marker scale keeps neighbouring pick proxies and rings apart', () => {
  // Far apart or a single site: original size.
  assert.equal(markerScale([site(0.2, 0.2), site(0.8, 0.8)], 16), 1);
  assert.equal(markerScale([site(0.5, 0.5)], 16), 1);
  // Coinciding sites: floor, never 0.
  assert.equal(markerScale([site(0.5, 0.5), site(0.5, 0.5)], 16), MIN_MARKER_SCALE);
  // 0.5 km apart: two scaled pick radii and two ring radii fit inside the spacing.
  const close = [site(0.5, 0.5), site(0.5 + 0.5 / 16, 0.5)];
  const s = markerScale(close, 16);
  assert.ok(s < 1);
  assert.ok(2 * MARKER_DIMENSIONS_KM.pickRadius * s < 0.5);
  assert.ok(2 * MARKER_DIMENSIONS_KM.ringOuter * s < 0.5);
});

test('published Site01 pair (≈500 m apart) gets non-overlapping markers', async () => {
  const telemetry = JSON.parse(await readFile(new URL('../public/data/site_telemetry.json', import.meta.url), 'utf8'));
  const { area_width_km: w, area_height_km: d } = telemetry.terrain_metadata;
  const spacing = minSiteSpacingKm(telemetry.sites, w, d);
  assert.ok(Math.abs(spacing - 0.5) < 0.01, `spacing ${spacing} km`);
  const s = markerScale(telemetry.sites, w, d);
  assert.ok(2 * MARKER_DIMENSIONS_KM.pickRadius * s < spacing);
});

test('sky line style mirrors the panorama tri-state colours', () => {
  assert.deepEqual(skyLineStyle('sun', true), { color: '#f59e0b', dashed: false });
  assert.deepEqual(skyLineStyle('sun', false), { color: '#94a3b8', dashed: true });
  assert.deepEqual(skyLineStyle('sun', null), { color: '#94a3b8', dashed: true });
  assert.deepEqual(skyLineStyle('earth', true), { color: '#10b981', dashed: false });
  assert.deepEqual(skyLineStyle('earth', false), { color: '#ef4444', dashed: true });
  assert.deepEqual(skyLineStyle('earth', undefined), { color: '#94a3b8', dashed: true });
});
