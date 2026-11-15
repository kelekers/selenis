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

export function contextMetadata(primary, context) {
  const b = primary?.bounds_m, c = context?.bounds_m;
  if (context?.schema_version !== 1 || context.reference_frame !== 'MOON_ME_DE421' ||
      context.reference_radius_m !== 1737400 || context.region_id !== primary.region_id ||
      context.source_resolution_m !== 5 || context.area_width_km !== 40 || context.area_height_km !== 40 ||
      !b || !c || !Object.values(c).every(Number.isFinite) ||
      b.left < c.left || b.right > c.right || b.bottom < c.bottom || b.top > c.top ||
      Math.abs(b.left + b.right - c.left - c.right) > 0.01 ||
      Math.abs(b.top + b.bottom - c.top - c.bottom) > 0.01 ||
      resolveHeightEncoding(context.height_encoding).mode !== 'metric-16bit-rg') {
    throw new Error('Konteks medan tidak cocok dengan kawasan aktif.');
  }
  return { ...context, context_hole_km: [primary.area_width_km, primary.area_height_km],
    reference_elevation_m: (primary.min_elevation_m + primary.max_elevation_m) / 2 };
}

export function horizonBlockerPositions(site, metadata, sampler) {
  const positions = [];
  const reference = (metadata.min_elevation_m + metadata.max_elevation_m) / 2;
  for (const point of site?.horizon_mask_360 ?? []) {
    const xz = uvToWorldXZ(point.blocker_uv, metadata.area_width_km, metadata.area_height_km);
    if (!xz || !Number.isFinite(point.blocker_elevation_m)) continue;
    const y = (point.blocker_elevation_m - reference) / 1000;
    const displayed = sampler?.(point.blocker_uv.u, point.blocker_uv.v);
    positions.push(xz[0], Math.max(y, displayed ?? y) + 0.025, xz[1]);
  }
  return new Float32Array(positions);
}

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
 *   'metric-16bit-rg'   — lossless 16-bit samples packed into two 8-bit colour channels.
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
  const packed16 = bits === 16 && encoding.packing === 'RG_MSB_LSB' && encoding.lossy === false;
  if (bits !== 8 && !packed16) {
    return {
      mode: 'blocked',
      reasons: [
        `bits_per_sample=${String(bits)} tidak didukung: gunakan 8-bit atau 16-bit lossless dengan packing RG_MSB_LSB`,
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
  if (nodata != null && !(Number.isInteger(nodata) && nodata >= 0 && nodata <= (packed16 ? 65535 : 255))) {
    return { mode: 'blocked', reasons: ['nodata_value di luar rentang encoding'] };
  }
  const reasons = [`langkah tinggi ${Number(mpu.toPrecision(2))} m`];
  if (encoding.lossy !== false) {
    reasons.push('kompresi lossy: tinggi tidak presisi');
  }
  return {
    mode: packed16 ? 'metric-16bit-rg' : 'metric-8bit',
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
 * No-data → NaN + flag: alpha 0 in every mode; in metric mode also the declared nodata value and
 * any alpha < 255 (canvas pixels are premultiplied, so RGB is not exact unless alpha is 255).
 * Metric reference height: `referenceM`, else the middle of declared min/max, else the middle of
 * the decoded valid range (data-derived — never a fixture constant).
 * Caller must sample the image nearest-neighbour for metric data (interpolation would blend
 * no-data sentinels into fake heights); pixel-is-point vs pixel-is-area is still TBD (contract).
 * @returns {{ heights: Float32Array, noData: Uint8Array, noDataCount: number, referenceM: number|null }}
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
  const metric = mode === 'metric-8bit' || mode === 'metric-16bit-rg';
  const sample = (i) => mode === 'metric-16bit-rg' ? rgba[i * 4] * 256 + rgba[i * 4 + 1] : rgba[i * 4];
  const nodataValue = metric ? options.noDataValue ?? null : null;
  const isNoData = (r, a) =>
    a === 0 || (metric && (a < 255 || (nodataValue !== null && r === nodataValue)));

  if (metric) {
    const { metersPerUnit, offsetM } = options;
    if (!(Number.isFinite(metersPerUnit) && metersPerUnit > 0) || !Number.isFinite(offsetM)) {
      throw new Error('Encoding metrik membutuhkan metersPerUnit dan offsetM');
    }
    // Pass 1: metres per valid cell (NaN for no-data) and the valid range.
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < count; i += 1) {
      if (isNoData(sample(i), rgba[i * 4 + 3])) {
        heights[i] = Number.NaN;
        noData[i] = 1;
        noDataCount += 1;
      } else {
        const m = sample(i) * metersPerUnit + offsetM;
        heights[i] = m;
        if (m < lo) lo = m;
        if (m > hi) hi = m;
      }
    }
    let referenceM = null;
    if (Number.isFinite(options.referenceM)) referenceM = options.referenceM;
    else if (Number.isFinite(options.minElevM) && Number.isFinite(options.maxElevM)) {
      referenceM = (options.minElevM + options.maxElevM) / 2;
    } else if (lo <= hi) referenceM = (lo + hi) / 2;
    // Pass 2: metres → scene km relative to the reference.
    for (let i = 0; i < count; i += 1) {
      if (!noData[i]) heights[i] = ((heights[i] - (referenceM ?? 0)) / 1000) * ve;
    }
    return { heights, noData, noDataCount, referenceM };
  }

  if (mode !== 'fixture' && mode !== 'visual-unverified') {
    throw new Error(`Mode decode tidak didukung: ${mode}`);
  }
  // Illustrative only: maps 0..255 onto the declared span, centred at 0 (legacy behaviour).
  const spanKm = Math.max(FIXTURE_MIN_SPAN_KM, (maxM - minM) / 1000);
  for (let i = 0; i < count; i += 1) {
    if (isNoData(rgba[i * 4], rgba[i * 4 + 3])) {
      heights[i] = Number.NaN;
      noData[i] = 1;
      noDataCount += 1;
    } else {
      heights[i] = (rgba[i * 4] / 255 - 0.5) * spanKm * ve;
    }
  }
  return { heights, noData, noDataCount, referenceM: null };
}

/**
 * Warnings for values LunarTerrain had to assume for a team asset (shown in the terrain badge).
 * `meta` is the raw terrain_metadata, `mode` the resolved encoding mode, `imageSize` [w, h] or null.
 */
export function terrainAssumptions(meta, mode, imageSize) {
  const out = [];
  const hasW = Number.isFinite(meta?.area_width_km) && meta.area_width_km > 0;
  const hasD = Number.isFinite(meta?.area_height_km) && meta.area_height_km > 0;
  const tileW = hasW ? meta.area_width_km : 20;
  const tileD = hasD ? meta.area_height_km : tileW;
  if (!hasW) out.push('lebar tile tidak dinyatakan — diasumsikan 20 km');
  if (!hasD) out.push('tinggi tile tidak dinyatakan — disamakan dengan lebar');
  const hasRange = Number.isFinite(meta?.min_elevation_m) && Number.isFinite(meta?.max_elevation_m);
  if (!hasRange) {
    out.push(
      mode === 'metric-8bit' || mode === 'metric-16bit-rg'
        ? 'min/max elevasi tidak dinyatakan — referensi = tengah rentang data'
        : 'rentang elevasi tidak dinyatakan — skala ilustratif fixture'
    );
  }
  if (Array.isArray(imageSize) && imageSize[0] > 0 && imageSize[1] > 0) {
    const imgAspect = imageSize[0] / imageSize[1];
    if (Math.abs(imgAspect / (tileW / tileD) - 1) > 0.01) {
      out.push(`rasio gambar ${imageSize[0]}×${imageSize[1]} ≠ rasio tile — gambar diregangkan`);
    }
  }
  return out;
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

/** Remove the centre covered by the primary tile; both meshes retain their real DEM sources. */
export function contextTerrainIndices(index, positions, widthKm, depthKm) {
  const kept = [];
  for (let i = 0; i < index.length; i += 3) {
    const [a, b, c] = [index[i], index[i + 1], index[i + 2]];
    const x = (positions[a * 3] + positions[b * 3] + positions[c * 3]) / 3;
    const z = (positions[a * 3 + 2] + positions[b * 3 + 2] + positions[c * 3 + 2]) / 3;
    if (Math.abs(x) >= widthKm / 2 || Math.abs(z) >= depthKm / 2) kept.push(a, b, c);
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
    return { tone: 'warning', title: 'DEM 8-bit, belum divalidasi', detail: reasons };
  }
  if (status.mode === 'metric-16bit-rg') {
    return { tone: 'info', title: 'DEM · HEIGHTMAP 16-bit', detail: reasons };
  }
  return { tone: 'warning', title: 'HEIGHTMAP TIM · TINGGI VISUAL, BUKAN METRIK', detail: reasons };
}
