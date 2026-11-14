import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  decodeHeights,
  describeTerrainStatus,
  filterNoDataTriangles,
  isValidUv,
  resolveHeightEncoding,
  resolveTerrainSource,
  sampleTerrainHeight,
  uvToWorldXZ,
} from '../src/utils/terrainMath.js';

// All inputs below are synthetic unit-test fixtures, not NASA data.
const EPS = 1e-6;
const near = (actual, expected, msg) =>
  assert.ok(Math.abs(actual - expected) < EPS, `${msg}: ${actual} != ${expected}`);

function rgbaFromRed(values, alpha = 255) {
  const out = new Uint8ClampedArray(values.length * 4);
  values.forEach((r, i) => {
    out[i * 4] = r;
    out[i * 4 + 3] = Array.isArray(alpha) ? alpha[i] : alpha;
  });
  return out;
}

test('uv validation never defaults to the tile centre', () => {
  assert.equal(isValidUv({ u: 0, v: 1 }), true);
  for (const bad of [null, undefined, {}, { u: 0.5 }, { u: NaN, v: 0.5 }, { u: -0.01, v: 0.5 }, { u: 0.5, v: 1.01 }, { u: '0.5', v: 0.5 }]) {
    assert.equal(isValidUv(bad), false, JSON.stringify(bad));
    assert.equal(uvToWorldXZ(bad, 20), null);
  }
});

test('uv→world maps corners and centre (north = -Z, east = +X), incl. non-square tiles', () => {
  assert.deepEqual(uvToWorldXZ({ u: 0.5, v: 0.5 }, 20), [0, 0]);
  assert.deepEqual(uvToWorldXZ({ u: 0, v: 0 }, 20), [-10, -10]); // NW corner
  assert.deepEqual(uvToWorldXZ({ u: 1, v: 1 }, 20), [10, 10]); // SE corner
  assert.deepEqual(uvToWorldXZ({ u: 1, v: 0 }, 30, 10), [15, -5]); // NE corner, 30×10 km
  assert.equal(uvToWorldXZ({ u: 0.5, v: 0.5 }, 0), null);
  assert.equal(uvToWorldXZ({ u: 0.5, v: 0.5 }, 20, -1), null);
});

test('PlaneGeometry layout matches the grid convention used by decode/sample', () => {
  const cols = 3;
  const geo = new THREE.PlaneGeometry(30, 10, cols - 1, cols - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let row = 0; row < cols; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const i = row * cols + col;
      const [x, z] = uvToWorldXZ({ u: col / (cols - 1), v: row / (cols - 1) }, 30, 10);
      near(pos.getX(i), x, `x of vertex ${i}`);
      near(pos.getZ(i), z, `z of vertex ${i}`);
    }
  }
  // First quad must be split along (col0,row1)–(col1,row0): triangles (a,b,d) and (b,c,d).
  assert.deepEqual(Array.from(geo.index.array.slice(0, 6)), [0, 3, 1, 3, 4, 1]);
  geo.dispose();
});

test('fixture decode maps 0/255 to ±span/2 and keeps illustrative scale', () => {
  const { heights, noDataCount } = decodeHeights(rgbaFromRed([0, 255, 128, 64]), 2, 2, {
    mode: 'fixture',
    minElevM: -4200,
    maxElevM: 2150,
  });
  near(heights[0], -3.175, 'min');
  near(heights[1], 3.175, 'max');
  near(heights[2], (128 / 255 - 0.5) * 6.35, 'mid');
  assert.equal(noDataCount, 0);
  // Degenerate span is clamped to the legacy 0.5 km minimum.
  const flat = decodeHeights(rgbaFromRed([255, 0, 0, 0]), 2, 2, { minElevM: 10, maxElevM: 10 });
  near(flat.heights[0], 0.25, 'clamped span');
});

test('metric-8bit decode uses declared m/unit + offset and flags nodata / transparent pixels', () => {
  const enc = resolveHeightEncoding({ bits_per_sample: 8, meters_per_unit: 20, offset_m: -2000, nodata_value: 0, lossy: false });
  assert.equal(enc.mode, 'metric-8bit');
  const { heights, noData, noDataCount } = decodeHeights(
    rgbaFromRed([0, 100, 200, 50], [255, 255, 255, 0]),
    2,
    2,
    { ...enc, minElevM: -2000, maxElevM: 2000, verticalExaggeration: 2 }
  );
  assert.ok(Number.isNaN(heights[0]), 'nodata value → NaN');
  near(heights[1], ((100 * 20 - 2000 - 0) / 1000) * 2, 'value 100 → 0 m');
  near(heights[2], ((200 * 20 - 2000) / 1000) * 2, 'value 200 → 2000 m ×2');
  assert.ok(Number.isNaN(heights[3]), 'alpha 0 → NaN');
  assert.deepEqual(Array.from(noData), [1, 0, 0, 1]);
  assert.equal(noDataCount, 2);
});

test('decode rejects bad buffers and unknown modes', () => {
  assert.throws(() => decodeHeights(new Uint8ClampedArray(8), 2, 2), /terlalu kecil/);
  assert.throws(() => decodeHeights(new Uint8ClampedArray(16), 1, 4), /grid/);
  assert.throws(() => decodeHeights(new Uint8ClampedArray(16), 2, 2, { mode: 'float32' }), /tidak didukung/);
  assert.throws(() => decodeHeights(new Uint8ClampedArray(16), 2, 2, { mode: 'metric-8bit' }), /metersPerUnit/);
});

test('encoding adapter never invents an encoding', () => {
  assert.equal(resolveHeightEncoding(undefined).mode, 'visual-unverified');
  assert.equal(resolveHeightEncoding({ bits_per_sample: 16, meters_per_unit: 0.5, offset_m: 0 }).mode, 'blocked');
  assert.equal(resolveHeightEncoding({ bits_per_sample: 8 }).mode, 'blocked');
  assert.equal(resolveHeightEncoding({ bits_per_sample: 8, meters_per_unit: 1, offset_m: 0, nodata_value: 300 }).mode, 'blocked');
  const lossyUnknown = resolveHeightEncoding({ bits_per_sample: 8, meters_per_unit: 1, offset_m: 0 });
  assert.ok(lossyUnknown.reasons.some((r) => r.includes('lossy')), 'undeclared lossy is warned');

  assert.equal(resolveTerrainSource({ heightmap_texture: null }).kind, 'fixture');
  assert.equal(resolveTerrainSource({ heightmap_texture: '   ' }).kind, 'fixture');
  assert.equal(resolveTerrainSource({ heightmap_texture: '/textures/x.webp' }).kind, 'asset');
  assert.equal(
    resolveTerrainSource({ heightmap_texture: '/t.png', height_encoding: { bits_per_sample: 16 } }).kind,
    'blocked-asset'
  );
  assert.equal(resolveTerrainSource({ vertical_exaggeration: -3 }).verticalExaggeration, 1);
});

test('surface sampling matches mesh vertices, triangle interpolation and edges', () => {
  // 3×3 grid, heights = row*10 + col
  const h = Float32Array.from([0, 1, 2, 10, 11, 12, 20, 21, 22]);
  near(sampleTerrainHeight(h, 3, 3, 0, 0), 0, 'NW vertex');
  near(sampleTerrainHeight(h, 3, 3, 1, 1), 22, 'SE vertex (edge clamp)');
  near(sampleTerrainHeight(h, 3, 3, 0.5, 0.5), 11, 'centre vertex');
  near(sampleTerrainHeight(h, 3, 3, 0.25, 0), 0.5, 'edge midpoint');
  // Non-planar quad: diagonal choice matters.
  const q = Float32Array.from([0, 0, 0, 4]); // a=0, d=0, b=0, c=4
  near(sampleTerrainHeight(q, 2, 2, 0.25, 0.25), 0, 'triangle a-b-d');
  near(sampleTerrainHeight(q, 2, 2, 0.75, 0.75), 2, 'triangle b-c-d');
  assert.equal(sampleTerrainHeight(h, 3, 3, NaN, 0.5), null);
  assert.equal(sampleTerrainHeight(h, 3, 3, 1.2, 0.5), null);
  const holes = Float32Array.from([NaN, 1, 2, 3]);
  assert.equal(sampleTerrainHeight(holes, 2, 2, 0.1, 0.1), null, 'nodata vertex → null');
});

test('no-data triangles are removed, others kept', () => {
  const index = [0, 3, 1, 3, 4, 1];
  assert.deepEqual(filterNoDataTriangles(index, Uint8Array.from([1, 0, 0, 0, 0])), [3, 4, 1]);
  assert.deepEqual(filterNoDataTriangles(index, new Uint8Array(5)), index);
});

test('status labels never call synthetic or fallback terrain NASA data', () => {
  const fixture = describeTerrainStatus({ state: 'ready', source: 'fixture', mode: 'fixture' });
  assert.match(fixture.title, /SINTETIS — BUKAN DEM NASA/);
  const fallback = describeTerrainStatus({ state: 'ready', source: 'fallback', mode: 'fixture', reasons: ['HTTP 404'] });
  assert.match(fallback.title, /SINTETIS/);
  assert.match(fallback.detail, /404/);
  assert.equal(describeTerrainStatus({ state: 'error', reasons: ['x'] }).tone, 'error');
  assert.equal(describeTerrainStatus(null).title, 'Memuat terrain…');
  const visual = describeTerrainStatus({ state: 'ready', source: 'asset', mode: 'visual-unverified', verticalExaggeration: 3 });
  assert.match(visual.title, /BUKAN METRIK/);
  assert.match(visual.detail, /×3/);
  for (const s of [fixture, fallback, visual]) assert.doesNotMatch(s.title, /NASA DATA|LIVE/);
});

test('metric decode: partial alpha is no-data; reference height is data-derived, never a fixture constant', async () => {
  const { terrainAssumptions } = await import('../src/utils/terrainMath.js');
  const enc = { mode: 'metric-8bit', metersPerUnit: 1, offsetM: 0 };
  // alpha 128 → premultiplied RGB is not exact → no-data
  const partial = decodeHeights(rgbaFromRed([100, 200, 150, 120], [255, 255, 128, 255]), 2, 2, enc);
  assert.ok(Number.isNaN(partial.heights[2]), 'alpha 128 → NaN');
  assert.equal(partial.noDataCount, 1);
  // No declared min/max → reference = middle of valid decoded range (100..200 m → 150 m)
  assert.equal(partial.referenceM, 150);
  near(partial.heights[0], -0.05, 'value 100 m vs ref 150 m');
  near(partial.heights[1], 0.05, 'value 200 m vs ref 150 m');
  // Declared range wins over data; explicit referenceM wins over both
  assert.equal(decodeHeights(rgbaFromRed([100, 200, 150, 120]), 2, 2, { ...enc, minElevM: 0, maxElevM: 1000 }).referenceM, 500);
  assert.equal(decodeHeights(rgbaFromRed([100, 200, 150, 120]), 2, 2, { ...enc, minElevM: 0, maxElevM: 1000, referenceM: 42 }).referenceM, 42);
  // Fixture/visual modes keep the legacy rule: only alpha 0 is no-data
  assert.equal(decodeHeights(rgbaFromRed([1, 2, 3, 4], [255, 128, 255, 255]), 2, 2, { mode: 'fixture' }).noDataCount, 0);

  // Assumption warnings for team assets
  const none = terrainAssumptions({ area_width_km: 20, area_height_km: 20, min_elevation_m: 0, max_elevation_m: 10 }, 'metric-8bit', [512, 512]);
  assert.deepEqual(none, []);
  const all = terrainAssumptions({}, 'metric-8bit', [1024, 512]).join(' | ');
  assert.match(all, /lebar tile tidak dinyatakan/);
  assert.match(all, /referensi = tengah rentang data/);
  assert.match(all, /1024×512 ≠ rasio tile/);
  assert.match(terrainAssumptions({ area_width_km: 30, area_height_km: 10 }, 'visual-unverified', [300, 100]).join(), /skala ilustratif/);
  assert.doesNotMatch(terrainAssumptions({ area_width_km: 30, area_height_km: 10 }, 'visual-unverified', [300, 100]).join(), /diregangkan/);
});
