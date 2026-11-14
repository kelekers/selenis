/**
 * Pure terrain helpers (no DOM / no three.js) so they can be unit-tested with `node --test`.
 *
 * Grid / orientation convention (matches THREE.PlaneGeometry(w, h, S, S).rotateX(-PI/2)):
 *   - Heights are stored row-major: index = row * cols + col.
 *   - row 0 = top image row = north edge (scene -Z); col 0 = west edge (scene -X).
 *   - Site `uv`: u = 0..1 west→east (+X), v = 0..1 north→south (+Z). NOTE: this v runs
 *     opposite to three.js texture-UV v (which is 0 at the bottom); it follows image rows.
 *   - Scene units: kilometres horizontally; vertical = (height_m - reference_m) / 1000 × exaggeration.
 *
 * Nothing here knows the real NASA DEM encoding. `resolveHeightEncoding` only accepts a
 * fully declared encoding object (PROPOSED field names, pending Anggota 2 / data-contract).
 */

export const FIXTURE_MIN_SPAN_KM = 0.5;

/** Valid site UV: finite numbers inside the closed tile [0, 1]. Never guessed. */
export function isValidUv(uv) {
  return (
    uv != null &&
    Number.isFinite(uv.u) &&
    Number.isFinite(uv.v) &&
    uv.u >= 0 &&
    uv.u <= 1 &&
    uv.v >= 0 &&
    uv.v <= 1
  );
}

/** UV → scene [x, z] (km). Returns null for invalid UV or tile size instead of defaulting to the centre. */
export function uvToWorldXZ(uv, widthKm, depthKm = widthKm) {
  if (!isValidUv(uv)) return null;
  if (!(Number.isFinite(widthKm) && widthKm > 0 && Number.isFinite(depthKm) && depthKm > 0)) {
    return null;
  }
  return [(uv.u - 0.5) * widthKm, (uv.v - 0.5) * depthKm];
}

/**
 * Adapter for a future real DEM. PROPOSED schema (not approved):
 *   height_encoding: { bits_per_sample: 8, meters_per_unit: number, offset_m: number,
 *                      nodata_value?: 0..255, lossy?: boolean }
 * Returns { mode, reasons[] } where mode is one of:
 *   'visual-unverified' — image present but encoding not declared: heights are illustrative only.
 *   'metric-8bit'       — fully declared 8-bit linear encoding (still limited precision).
 *   'blocked'           — declared but unsupported/invalid; caller must NOT render it as terrain.
 */
export function resolveHeightEncoding(encoding) {
  if (encoding == null) {
    return {
      mode: 'visual-unverified',
      reasons: ['height_encoding belum disepakati (Anggota 2); tinggi hanya ilustratif'],
    };
  }
  const bits = encoding.bits_per_sample;
  if (bits !== 8) {
    return {
      mode: 'blocked',
      reasons: [
        `bits_per_sample=${String(bits)} tidak didukung: canvas 2D hanya membaca 8-bit; DEM 16/32-bit butuh loader biner (format menunggu Anggota 2)`,
      ],
    };
  }
  const mpu = encoding.meters_per_unit;
  const offset = encoding.offset_m;
  if (!(Number.isFinite(mpu) && mpu > 0) || !Number.isFinite(offset)) {
    return {
      mode: 'blocked',
      reasons: ['meters_per_unit / offset_m tidak valid atau tidak ada'],
    };
  }
  const nodata = encoding.nodata_value;
  if (nodata != null && !(Number.isInteger(nodata) && nodata >= 0 && nodata <= 255)) {
    return { mode: 'blocked', reasons: ['nodata_value harus bilangan bulat 0..255'] };
  }
  const reasons = [`presisi kuantisasi ${mpu} m per unit 8-bit`];
  if (encoding.lossy !== false) {
    reasons.push('kompresi lossy (atau tidak dinyatakan) — nilai tinggi tidak presisi');
  }
  return {
    mode: 'metric-8bit',
    metersPerUnit: mpu,
    offsetM: offset,
    noDataValue: nodata ?? null,
    reasons,
  };
}

/**
 * Decide which heightmap to load from terrain metadata.
 * kind: 'fixture' (procedural synthetic), 'asset' (team heightmap), or 'blocked-asset'
 * (asset present but its declared encoding is unsupported → caller shows synthetic fixture + label).
 */
export function resolveTerrainSource(metadata) {
  const url = typeof metadata?.heightmap_texture === 'string' ? metadata.heightmap_texture.trim() : '';
  const ve = metadata?.vertical_exaggeration;
  const verticalExaggeration = Number.isFinite(ve) && ve > 0 ? ve : 1;
  if (!url) {
    return { kind: 'fixture', url: null, encoding: { mode: 'fixture', reasons: [] }, verticalExaggeration };
  }
  const encoding = resolveHeightEncoding(metadata.height_encoding);
  if (encoding.mode === 'blocked') {
    return { kind: 'blocked-asset', url, encoding, verticalExaggeration };
  }
  return { kind: 'asset', url, encoding, verticalExaggeration };
}

/**
 * Decode an RGBA pixel buffer (red channel) into scene heights.
 * Pixels with alpha 0 or equal to the declared nodata value become NaN and are flagged.
 * @returns {{ heights: Float32Array, noData: Uint8Array, noDataCount: number }}
 */
export function decodeHeights(rgba, cols, rows, options = {}) {
  const count = cols * rows;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2) {
    throw new Error(`Ukuran grid tidak valid: ${cols}×${rows}`);
  }
  if (!rgba || rgba.length < count * 4) {
    throw new Error(`Buffer piksel terlalu kecil: ${rgba?.length ?? 0} < ${count * 4}`);
  }
  const mode = options.mode ?? 'fixture';
  const ve = Number.isFinite(options.verticalExaggeration) && options.verticalExaggeration > 0
    ? options.verticalExaggeration
    : 1;
  const minM = Number.isFinite(options.minElevM) ? options.minElevM : 0;
  const maxM = Number.isFinite(options.maxElevM) ? options.maxElevM : minM;

  const heights = new Float32Array(count);
  const noData = new Uint8Array(count);
  let noDataCount = 0;

  let toScene;
  if (mode === 'metric-8bit') {
    const { metersPerUnit, offsetM } = options;
    if (!(Number.isFinite(metersPerUnit) && metersPerUnit > 0) || !Number.isFinite(offsetM)) {
      throw new Error('metric-8bit membutuhkan metersPerUnit dan offsetM');
    }
    const refM = (minM + maxM) / 2;
    toScene = (value) => ((value * metersPerUnit + offsetM - refM) / 1000) * ve;
  } else if (mode === 'fixture' || mode === 'visual-unverified') {
    // Illustrative only: maps 0..255 onto the declared span, centred at 0 (legacy behaviour).
    const spanKm = Math.max(FIXTURE_MIN_SPAN_KM, (maxM - minM) / 1000);
    toScene = (value) => (value / 255 - 0.5) * spanKm * ve;
  } else {
    throw new Error(`Mode decode tidak didukung: ${mode}`);
  }

  const nodataValue = mode === 'metric-8bit' ? options.noDataValue ?? null : null;
  for (let i = 0; i < count; i += 1) {
    const r = rgba[i * 4];
    const a = rgba[i * 4 + 3];
    if (a === 0 || (nodataValue !== null && r === nodataValue)) {
      heights[i] = Number.NaN;
      noData[i] = 1;
      noDataCount += 1;
    } else {
      heights[i] = toScene(r);
    }
  }
  return { heights, noData, noDataCount };
}

/** Drop triangles that touch a no-data vertex (renders a hole rather than a fake elevation). */
export function filterNoDataTriangles(index, noData) {
  const kept = [];
  for (let i = 0; i + 2 < index.length; i += 3) {
    const a = index[i];
    const b = index[i + 1];
    const c = index[i + 2];
    if (!noData[a] && !noData[b] && !noData[c]) kept.push(a, b, c);
  }
  return kept;
}

/**
 * Height of the rendered mesh surface at (u, v), matching PlaneGeometry's triangulation
 * (each quad split along the (col, row+1)–(col+1, row) diagonal), so markers sit on the surface.
 * Returns null for invalid UV or when a supporting vertex is no-data.
 */
export function sampleTerrainHeight(heights, cols, rows, u, v) {
  if (!heights || !isValidUv({ u, v })) return null;
  const gx = u * (cols - 1);
  const gy = v * (rows - 1);
  const col = Math.min(cols - 2, Math.floor(gx));
  const row = Math.min(rows - 2, Math.floor(gy));
  const fx = gx - col;
  const fy = gy - row;

  const ha = heights[row * cols + col]; // (col,   row)
  const hb = heights[(row + 1) * cols + col]; // (col,   row+1)
  const hc = heights[(row + 1) * cols + col + 1]; // (col+1, row+1)
  const hd = heights[row * cols + col + 1]; // (col+1, row)

  let h;
  if (fx + fy <= 1) {
    if (Number.isNaN(ha) || Number.isNaN(hb) || Number.isNaN(hd)) return null;
    h = ha + fx * (hd - ha) + fy * (hb - ha);
  } else {
    if (Number.isNaN(hb) || Number.isNaN(hc) || Number.isNaN(hd)) return null;
    h = hc + (1 - fx) * (hb - hc) + (1 - fy) * (hd - hc);
  }
  return Number.isFinite(h) ? h : null;
}

/**
 * Human-readable (Bahasa Indonesia) label for the terrain status badge.
 * status: { state: 'loading'|'ready'|'error', source: 'fixture'|'asset'|'fallback',
 *           mode, reasons?: string[], noDataCount?, verticalExaggeration? }
 * tone: 'synthetic' | 'warning' | 'error' | 'info'
 */
export function describeTerrainStatus(status) {
  if (!status || status.state === 'loading') {
    return { tone: 'info', title: 'Memuat terrain…', detail: '' };
  }
  const extra = [];
  if (status.noDataCount > 0) extra.push(`${status.noDataCount} sel no-data disembunyikan`);
  if (status.verticalExaggeration && status.verticalExaggeration !== 1) {
    extra.push(`eksagerasi vertikal ×${status.verticalExaggeration}`);
  }
  const reasons = [...(status.reasons ?? []), ...extra].join(' · ');

  if (status.state === 'error') {
    return { tone: 'error', title: 'TERRAIN GAGAL DIMUAT', detail: reasons };
  }
  if (status.source === 'fallback') {
    return {
      tone: 'error',
      title: 'ASET DEM TIDAK DIPAKAI — TERRAIN SINTETIS',
      detail: reasons,
    };
  }
  if (status.source === 'fixture') {
    return {
      tone: 'synthetic',
      title: 'TERRAIN SINTETIS — BUKAN DEM NASA',
      detail: ['Bentuk & skala tinggi ilustratif', reasons].filter(Boolean).join(' · '),
    };
  }
  if (status.mode === 'metric-8bit') {
    return { tone: 'warning', title: 'DEM 8-BIT · BELUM DIVALIDASI', detail: reasons };
  }
  return { tone: 'warning', title: 'HEIGHTMAP TIM · TINGGI VISUAL, BUKAN METRIK', detail: reasons };
}
