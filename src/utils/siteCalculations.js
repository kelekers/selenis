import { cleanHorizonMask, getHorizonElevationAtAzimuth, isValidSkyVector, normalizeAzimuth } from './shadowMath.js';
import { isValidUv } from './terrainMath.js';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export const LUNAR_RADIUS_M = 1737400.0;
export const DEFAULT_OBSERVER_HEIGHT_M = 2.0;
export const DEFAULT_SLOPE_RADIUS_M = 50.0;
export const MAX_SITES = 4;
export const SITE_LETTERS = ['A', 'B', 'C', 'D'];

export const DEMO_SCREENING_PROFILE = Object.freeze({
  profile_id: 'DEMO_TERRAIN_SCREENING_V1',
  lower_concern_max_slope_deg: 10.0,
  lower_concern_roughness_rmse_m: 0.5,
  demo_max_slope_deg: 15.0,
  demo_roughness_rmse_m: 1.0,
  note:
    'Ambang demo proyek, bukan spesifikasi wahana atau standar keselamatan NASA: ' +
    'LOWER_CONCERN bila max slope ≤10° dan RMS ≤0,5 m; CAUTION bila ≤15° dan ≤1 m; ' +
    'lainnya EXCEEDS_DEMO_LIMITS. RMS diukur setelah mengurangi bidang best-fit. ' +
    'Hanya screening skala DEM pada footprint yang dicatat, bukan sertifikasi pendaratan.',
});

export function screenTerrain(maxSlopeDeg, roughnessRmseM) {
  if (!Number.isFinite(maxSlopeDeg) || !Number.isFinite(roughnessRmseM) || maxSlopeDeg < 0 || roughnessRmseM < 0) {
    return 'CAUTION';
  }
  if (
    maxSlopeDeg > DEMO_SCREENING_PROFILE.demo_max_slope_deg ||
    roughnessRmseM > DEMO_SCREENING_PROFILE.demo_roughness_rmse_m
  ) {
    return 'EXCEEDS_DEMO_LIMITS';
  }
  if (
    maxSlopeDeg > DEMO_SCREENING_PROFILE.lower_concern_max_slope_deg ||
    roughnessRmseM > DEMO_SCREENING_PROFILE.lower_concern_roughness_rmse_m
  ) {
    return 'CAUTION';
  }
  return 'LOWER_CONCERN';
}

/**
 * South Polar Stereographic forward projection (lat_0 = -90, lon_0 = 0, sphere R).
 * Matches PROJ `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400`.
 */
export function latLonToPolarStereo(latitudeDeg, longitudeDeg, radiusM = LUNAR_RADIUS_M) {
  if (!Number.isFinite(latitudeDeg) || !Number.isFinite(longitudeDeg) || latitudeDeg < -90 || latitudeDeg > 90) {
    return null;
  }
  const lat = latitudeDeg * DEG_TO_RAD;
  const lon = longitudeDeg * DEG_TO_RAD;
  const rho = 2 * radiusM * Math.tan((Math.PI / 2 + lat) / 2);
  return {
    x: rho * Math.sin(lon),
    y: rho * Math.cos(lon),
  };
}

/**
 * South Polar Stereographic inverse projection: (x, y) meters -> { latitude_deg, longitude_deg }.
 */
export function polarStereoToLatLon(x, y, radiusM = LUNAR_RADIUS_M) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const rho = Math.hypot(x, y);
  const latRad = 2 * Math.atan2(rho, 2 * radiusM) - Math.PI / 2;
  const lonRad = rho < 1e-9 ? 0 : Math.atan2(x, y);
  const lonDeg = ((((lonRad * RAD_TO_DEG) + 180) % 360 + 360) % 360) - 180;
  return {
    latitude_deg: Number((latRad * RAD_TO_DEG).toFixed(6)),
    longitude_deg: Number(lonDeg.toFixed(6)),
  };
}

/**
 * Resolve effective projected bounds { left, right, bottom, top, radiusM } for a region.
 * Uses `terrain_metadata.bounds_m` when present; otherwise derives bounds from reference site[0]
 * and `area_width_km` / `area_height_km` so scaffold/dummy mode also has a consistent frame.
 */
export function resolveRegionBounds(metadata, referenceSites = []) {
  const radiusM = Number.isFinite(metadata?.reference_radius_m) && metadata.reference_radius_m > 0
    ? metadata.reference_radius_m
    : LUNAR_RADIUS_M;
  const b = metadata?.bounds_m;
  if (
    b &&
    Number.isFinite(b.left) &&
    Number.isFinite(b.right) &&
    Number.isFinite(b.bottom) &&
    Number.isFinite(b.top) &&
    b.right > b.left &&
    b.top > b.bottom
  ) {
    return { left: b.left, right: b.right, bottom: b.bottom, top: b.top, radiusM };
  }

  const widthM = (Number.isFinite(metadata?.area_width_km) ? metadata.area_width_km : 20) * 1000;
  const heightM = (Number.isFinite(metadata?.area_height_km) ? metadata.area_height_km : 20) * 1000;
  const ref = referenceSites?.find(
    (s) =>
      Number.isFinite(s?.coordinates?.latitude_deg) &&
      Number.isFinite(s?.coordinates?.longitude_deg) &&
      isValidUv(s?.coordinates?.uv)
  );
  if (ref) {
    const xy = latLonToPolarStereo(ref.coordinates.latitude_deg, ref.coordinates.longitude_deg, radiusM);
    if (xy) {
      const left = xy.x - ref.coordinates.uv.u * widthM;
      const top = xy.y + ref.coordinates.uv.v * heightM;
      return { left, right: left + widthM, bottom: top - heightM, top, radiusM };
    }
  }
  return {
    left: -widthM / 2,
    right: widthM / 2,
    bottom: -heightM / 2,
    top: heightM / 2,
    radiusM,
  };
}

/**
 * Valid UV for site placement across both the primary tile [0, 1] and the 40×40 km context terrain [-1.5, 2.5].
 */
export function isValidPlacementUv(uv) {
  return (
    uv != null &&
    Number.isFinite(uv.u) &&
    Number.isFinite(uv.v) &&
    uv.u >= -1.5 &&
    uv.u <= 2.5 &&
    uv.v >= -1.5 &&
    uv.v <= 2.5
  );
}

/**
 * Compute the allowed UV placement range in primary-tile UV coordinates.
 * When a 40×40 km context DEM is available around a 16×16 km primary tile,
 * the playable terrain spans [-19.84 km, +19.84 km], corresponding to u, v in [-0.74, 1.74].
 */
export function getPlacementUvBounds(metadata) {
  const widthKm =
    Number.isFinite(metadata?.area_width_km) && metadata.area_width_km > 0
      ? metadata.area_width_km
      : 16;
  const heightKm =
    Number.isFinite(metadata?.area_height_km) && metadata.area_height_km > 0
      ? metadata.area_height_km
      : widthKm;
  const hasContext = Boolean(metadata?.context_dataset_url);
  const totalWidthKm = hasContext ? Math.max(40, widthKm) : widthKm;
  const totalHeightKm = hasContext ? Math.max(40, heightKm) : heightKm;
  const halfSpanU = (totalWidthKm * 0.496) / widthKm;
  const halfSpanV = (totalHeightKm * 0.496) / heightKm;
  return {
    minU: Number((0.5 - halfSpanU).toFixed(4)),
    maxU: Number((0.5 + halfSpanU).toFixed(4)),
    minV: Number((0.5 - halfSpanV).toFixed(4)),
    maxV: Number((0.5 + halfSpanV).toFixed(4)),
    widthKm,
    heightKm,
    totalWidthKm,
    totalHeightKm,
  };
}

/**
 * Combine primary (16×16 km) and surrounding context (40×40 km) height samplers into one seamless sampler.
 */
export function buildCombinedTerrainSampler(primarySampler, contextSampler, planeSize = 16, planeDepth = planeSize) {
  if (!primarySampler && !contextSampler) return null;
  const combined = (u, v) => {
    if (primarySampler && u >= 0 && u <= 1 && v >= 0 && v <= 1) {
      return primarySampler(u, v);
    }
    if (contextSampler) {
      const ctxU = (u - 0.5) * (planeSize / 40) + 0.5;
      const ctxV = (v - 0.5) * (planeDepth / 40) + 0.5;
      if (ctxU >= 0 && ctxU <= 1 && ctxV >= 0 && ctxV <= 1) {
        return contextSampler(ctxU, ctxV);
      }
    }
    return primarySampler ? primarySampler(u, v) : null;
  };
  return Object.assign(combined, {
    heightsM: primarySampler?.heightsM ?? null,
    grid: primarySampler?.grid ?? 0,
    gridCols: primarySampler?.gridCols ?? 0,
    gridRows: primarySampler?.gridRows ?? 0,
    referenceM: primarySampler?.referenceM ?? contextSampler?.referenceM ?? null,
    contextSampler: contextSampler ?? null,
    sampleElevationM(u, v) {
      if (primarySampler?.sampleElevationM && u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        const m = primarySampler.sampleElevationM(u, v);
        if (Number.isFinite(m)) return m;
      }
      if (contextSampler?.sampleElevationM) {
        const ctxU = (u - 0.5) * (planeSize / 40) + 0.5;
        const ctxV = (v - 0.5) * (planeDepth / 40) + 0.5;
        if (ctxU >= 0 && ctxU <= 1 && ctxV >= 0 && ctxV <= 1) {
          const m = contextSampler.sampleElevationM(ctxU, ctxV);
          if (Number.isFinite(m)) return m;
        }
      }
      return Number.NaN;
    },
  });
}

/**
 * Convert tile UV { u, v } to { latitude_deg, longitude_deg }.
 */
export function uvToLatLon(uv, metadata, referenceSites = []) {
  if (!isValidPlacementUv(uv)) return null;
  const bounds = resolveRegionBounds(metadata, referenceSites);
  const x = bounds.left + uv.u * (bounds.right - bounds.left);
  const y = bounds.top - uv.v * (bounds.top - bounds.bottom);
  return polarStereoToLatLon(x, y, bounds.radiusM);
}

/**
 * Convert { latitude_deg, longitude_deg } to tile UV { u, v }.
 * Returns `{ u, v, inBounds }` where `inBounds` indicates whether the point lies inside the playable terrain bounds.
 */
export function latLonToUv(latitudeDeg, longitudeDeg, metadata, referenceSites = []) {
  const bounds = resolveRegionBounds(metadata, referenceSites);
  const xy = latLonToPolarStereo(latitudeDeg, longitudeDeg, bounds.radiusM);
  if (!xy) return null;
  const u = (xy.x - bounds.left) / (bounds.right - bounds.left);
  const v = (bounds.top - xy.y) / (bounds.top - bounds.bottom);
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  const { minU, maxU, minV, maxV } = getPlacementUvBounds(metadata);
  const inBounds = u >= minU && u <= maxU && v >= minV && v <= maxV;
  return {
    u: Math.max(minU, Math.min(maxU, u)),
    v: Math.max(minV, Math.min(maxV, v)),
    rawU: u,
    rawV: v,
    inBounds,
  };
}

/**
 * Compute approximate Lat/Lon bounding range of the active DEM region for UI helper text.
 */
export function getTileCoordinateRange(metadata, referenceSites = []) {
  const { minU, maxU, minV, maxV } = getPlacementUvBounds(metadata);
  const midU = (minU + maxU) / 2;
  const midV = (minV + maxV) / 2;
  const samples = [
    { u: minU, v: minV },
    { u: midU, v: minV },
    { u: maxU, v: minV },
    { u: minU, v: midV },
    { u: midU, v: midV },
    { u: maxU, v: midV },
    { u: minU, v: maxV },
    { u: midU, v: maxV },
    { u: maxU, v: maxV },
  ]
    .map((uv) => uvToLatLon(uv, metadata, referenceSites))
    .filter(Boolean);

  if (!samples.length) return null;
  const lats = samples.map((s) => s.latitude_deg);
  const lons = samples.map((s) => s.longitude_deg);
  return {
    minLat: Number(Math.min(...lats).toFixed(4)),
    maxLat: Number(Math.max(...lats).toFixed(4)),
    minLon: Number(Math.min(...lons).toFixed(4)),
    maxLon: Number(Math.max(...lons).toFixed(4)),
  };
}

/**
 * Great-circle destination from (latDeg, lonDeg) along azimuthDeg (clockwise from local North) by distanceM.
 */
export function destinationOnMoon(latDeg, lonDeg, azimuthDeg, distanceM, radiusM = LUNAR_RADIUS_M) {
  const lat = latDeg * DEG_TO_RAD;
  const lon = lonDeg * DEG_TO_RAD;
  const az = azimuthDeg * DEG_TO_RAD;
  const angle = distanceM / radiusM;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinAngle = Math.sin(angle);
  const cosAngle = Math.cos(angle);
  const sinLat2 = Math.max(-1, Math.min(1, sinLat * cosAngle + cosLat * sinAngle * Math.cos(az)));
  const lat2 = Math.asin(sinLat2);
  const lon2 = lon + Math.atan2(
    Math.sin(az) * sinAngle * cosLat,
    cosAngle - sinLat * sinLat2
  );
  return {
    latitude_deg: lat2 * RAD_TO_DEG,
    longitude_deg: ((((lon2 * RAD_TO_DEG) + 180) % 360 + 360) % 360) - 180,
  };
}

/**
 * Compute projected local basis { north: { x, y }, east: { x, y } } at (latDeg, lonDeg),
 * matching `LocalTerrain.sample_site` in `data-pipeline/process_dem.py`.
 */
export function computeLocalBasisProjected(latDeg, lonDeg, metadata, referenceSites = []) {
  const bounds = resolveRegionBounds(metadata, referenceSites);
  const origin = latLonToPolarStereo(latDeg, lonDeg, bounds.radiusM);
  if (!origin) {
    return { north: { x: 0, y: 1 }, east: { x: 1, y: 0 } };
  }
  const basis = {};
  for (const [dir, az] of [['north', 0], ['east', 90]]) {
    const next = destinationOnMoon(latDeg, lonDeg, az, 1.0, bounds.radiusM);
    const nextXY = latLonToPolarStereo(next.latitude_deg, next.longitude_deg, bounds.radiusM);
    const dx = nextXY.x - origin.x;
    const dy = nextXY.y - origin.y;
    const len = Math.hypot(dx, dy) || 1;
    basis[dir] = { x: dx / len, y: dy / len };
  }
  return basis;
}

/**
 * Sample elevation in meters at (u, v) from the terrain sampler or fallback metadata.
 */
export function sampleElevationMetersAtUV(uv, terrainSampler, metadata, referenceSites = []) {
  if (!isValidPlacementUv(uv)) return 0;
  if (typeof terrainSampler?.sampleElevationM === 'function') {
    const m = terrainSampler.sampleElevationM(uv.u, uv.v);
    if (Number.isFinite(m)) return m;
  }
  const minM = Number.isFinite(metadata?.min_elevation_m) ? metadata.min_elevation_m : -500;
  const maxM = Number.isFinite(metadata?.max_elevation_m) ? metadata.max_elevation_m : 2000;
  const refM = Number.isFinite(metadata?.reference_elevation_m)
    ? metadata.reference_elevation_m
    : (minM + maxM) / 2;
  const ve = Number.isFinite(metadata?.vertical_exaggeration) && metadata.vertical_exaggeration > 0
    ? metadata.vertical_exaggeration
    : 1;

  if (typeof terrainSampler === 'function') {
    const sceneKm = terrainSampler(uv.u, uv.v);
    if (Number.isFinite(sceneKm)) {
      return (sceneKm / ve) * 1000 + refM;
    }
  }
  // Inverse-distance weighted interpolation from reference sites if sampler is not yet mounted
  if (Array.isArray(referenceSites) && referenceSites.length > 0) {
    let wSum = 0;
    let elevSum = 0;
    for (const s of referenceSites) {
      const suv = s?.coordinates?.uv;
      const se = s?.coordinates?.elevation_m;
      if (isValidPlacementUv(suv) && Number.isFinite(se)) {
        const d = Math.hypot(uv.u - suv.u, uv.v - suv.v);
        if (d < 1e-6) return se;
        const w = 1 / (d * d);
        wSum += w;
        elevSum += w * se;
      }
    }
    if (wSum > 0) return elevSum / wSum;
  }
  return refM;
}

/**
 * Bilinear interpolation on a flat row-major Float32Array grid of size (cols × rows) at normalized (u, v) in [0, 1].
 */
function sampleBilinearGrid(gridData, cols, rows, u, v) {
  if (!gridData || u < 0 || u > 1 || v < 0 || v > 1) return Number.NaN;
  const colF = u * (cols - 1);
  const rowF = v * (rows - 1);
  const c0 = Math.min(cols - 2, Math.max(0, Math.floor(colF)));
  const r0 = Math.min(rows - 2, Math.max(0, Math.floor(rowF)));
  const dc = colF - c0;
  const dr = rowF - r0;
  const v00 = gridData[r0 * cols + c0];
  const v10 = gridData[(r0 + 1) * cols + c0];
  const v01 = gridData[r0 * cols + c0 + 1];
  const v11 = gridData[(r0 + 1) * cols + c0 + 1];
  return (1 - dr) * (1 - dc) * v00 + dr * (1 - dc) * v10 + (1 - dr) * dc * v01 + dr * dc * v11;
}

/**
 * Compute slope analysis (average_slope_deg, max_slope_deg, roughness_rmse_m, local_basis_projected)
 * and terrain screening at (u, v, latDeg, lonDeg) using the loaded DEM grid (primary 16×16 km or context 40×40 km).
 */
export function computeSlopeAndRoughness(uv, latDeg, lonDeg, terrainSampler, metadata, referenceSites = []) {
  const basis = computeLocalBasisProjected(latDeg, lonDeg, metadata, referenceSites);
  const elevationM = sampleElevationMetersAtUV(uv, terrainSampler, metadata, referenceSites);
  const primaryWidthM = (Number.isFinite(metadata?.area_width_km) ? metadata.area_width_km : 16) * 1000;
  const primaryHeightM = (Number.isFinite(metadata?.area_height_km) ? metadata.area_height_km : 16) * 1000;

  const insidePrimary = uv.u >= 0.015 && uv.u <= 0.985 && uv.v >= 0.015 && uv.v <= 0.985;
  const ctxSampler = terrainSampler?.contextSampler;
  const useContextGrid = !insidePrimary && Boolean(ctxSampler?.heightsM);

  const activeSampler = useContextGrid ? ctxSampler : terrainSampler;
  const heightsM = activeSampler?.heightsM;
  const cols = activeSampler?.gridCols ?? activeSampler?.grid ?? 0;
  const rows = activeSampler?.gridRows ?? activeSampler?.grid ?? 0;
  const widthM = useContextGrid ? 40000 : primaryWidthM;
  const heightM = useContextGrid ? 40000 : primaryHeightM;
  const gridU = useContextGrid ? (uv.u - 0.5) * (primaryWidthM / widthM) + 0.5 : uv.u;
  const gridV = useContextGrid ? (uv.v - 0.5) * (primaryHeightM / heightM) + 0.5 : uv.v;

  if (heightsM && cols >= 4 && rows >= 4 && gridU >= 0 && gridU <= 1 && gridV >= 0 && gridV <= 1) {
    const cellWidthM = widthM / (cols - 1);
    const cellHeightM = heightM / (rows - 1);
    const centerCol = gridU * (cols - 1);
    const centerRow = gridV * (rows - 1);
    // Ensure at least a 2-cell radius so we always have >= 13 samples even when mesh cell > 50m
    const radiusCells = Math.max(2, Math.ceil(DEFAULT_SLOPE_RADIUS_M / Math.min(cellWidthM, cellHeightM)));
    const r0 = Math.max(1, Math.floor(centerRow - radiusCells));
    const r1 = Math.min(rows - 2, Math.ceil(centerRow + radiusCells));
    const c0 = Math.max(1, Math.floor(centerCol - radiusCells));
    const c1 = Math.min(cols - 2, Math.ceil(centerCol + radiusCells));

    const slopes = [];
    const pts = [];

    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        if (Math.hypot(r - centerRow, c - centerCol) > radiusCells + 0.25) continue;
        const hCenter = heightsM[r * cols + c];
        const hLeft = heightsM[r * cols + (c - 1)];
        const hRight = heightsM[r * cols + (c + 1)];
        const hUp = heightsM[(r - 1) * cols + c];
        const hDown = heightsM[(r + 1) * cols + c];
        if (![hCenter, hLeft, hRight, hUp, hDown].every(Number.isFinite)) continue;

        const dzdx = (hRight - hLeft) / (2 * cellWidthM);
        const dzdy = (hDown - hUp) / (2 * cellHeightM);
        const slopeDeg = Math.atan(Math.hypot(dzdx, dzdy)) * RAD_TO_DEG;
        slopes.push(slopeDeg);

        const xM = (c - centerCol) * cellWidthM;
        const yM = (centerRow - r) * cellHeightM;
        pts.push({ x: xM, y: yM, z: hCenter });
      }
    }

    if (slopes.length > 0) {
      const avgSlope = slopes.reduce((a, b) => a + b, 0) / slopes.length;
      const maxSlope = Math.max(...slopes);

      // Detrended plane fit z = a*x + b*y + c via normal equations
      let sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
      const n = pts.length;
      for (const p of pts) {
        sz += p.z;
      }
      const meanZ = sz / n;
      for (const p of pts) {
        const dz = p.z - meanZ;
        sxx += p.x * p.x;
        syy += p.y * p.y;
        sxy += p.x * p.y;
        sxz += p.x * dz;
        syz += p.y * dz;
      }
      const det = sxx * syy - sxy * sxy;
      let a = 0, b = 0;
      if (Math.abs(det) > 1e-9) {
        a = (syy * sxz - sxy * syz) / det;
        b = (sxx * syz - sxy * sxz) / det;
      }
      let sqErr = 0;
      for (const p of pts) {
        const residual = (p.z - meanZ) - (a * p.x + b * p.y);
        sqErr += residual * residual;
      }
      const roughnessRmseM = Math.sqrt(sqErr / n);

      return {
        slope_analysis: {
          radius_m: DEFAULT_SLOPE_RADIUS_M,
          sample_count: slopes.length,
          dem_elevation_m: elevationM,
          local_basis_projected: basis,
          average_slope_deg: Number(avgSlope.toFixed(4)),
          max_slope_deg: Number(maxSlope.toFixed(4)),
          roughness_rmse_m: Number(roughnessRmseM.toFixed(4)),
        },
        terrain_screening: {
          ...DEMO_SCREENING_PROFILE,
          rating: screenTerrain(maxSlope, roughnessRmseM),
          radius_m: DEFAULT_SLOPE_RADIUS_M,
          max_slope_deg: Number(maxSlope.toFixed(4)),
          roughness_rmse_m: Number(roughnessRmseM.toFixed(4)),
          is_landing_safety_assessment: false,
        },
      };
    }
  }

  // Fallback when raw height grid is not yet available: interpolate from reference sites or numerical derivative
  const { minU, maxU, minV, maxV } = getPlacementUvBounds(metadata);
  const stepUv = 0.003;
  const hC = elevationM;
  const hE = sampleElevationMetersAtUV({ u: Math.min(maxU, uv.u + stepUv), v: uv.v }, terrainSampler, metadata, referenceSites);
  const hW = sampleElevationMetersAtUV({ u: Math.max(minU, uv.u - stepUv), v: uv.v }, terrainSampler, metadata, referenceSites);
  const hS = sampleElevationMetersAtUV({ u: uv.u, v: Math.min(maxV, uv.v + stepUv) }, terrainSampler, metadata, referenceSites);
  const hN = sampleElevationMetersAtUV({ u: uv.u, v: Math.max(minV, uv.v - stepUv) }, terrainSampler, metadata, referenceSites);
  const dxM = 2 * stepUv * primaryWidthM;
  const dyM = 2 * stepUv * primaryHeightM;
  const localSlope = Math.atan(Math.hypot((hE - hW) / dxM, (hS - hN) / dyM)) * RAD_TO_DEG;
  const avgSlope = Number.isFinite(localSlope) && localSlope > 0.1 ? localSlope : 6.2;
  const maxSlope = Number((avgSlope * 1.65).toFixed(4));
  const roughnessRmseM = Number(Math.min(1.5, Math.max(0.12, avgSlope * 0.045)).toFixed(4));

  return {
    slope_analysis: {
      radius_m: DEFAULT_SLOPE_RADIUS_M,
      sample_count: 81,
      dem_elevation_m: hC,
      local_basis_projected: basis,
      average_slope_deg: Number(avgSlope.toFixed(4)),
      max_slope_deg: maxSlope,
      roughness_rmse_m: roughnessRmseM,
    },
    terrain_screening: {
      ...DEMO_SCREENING_PROFILE,
      rating: screenTerrain(maxSlope, roughnessRmseM),
      radius_m: DEFAULT_SLOPE_RADIUS_M,
      max_slope_deg: maxSlope,
      roughness_rmse_m: roughnessRmseM,
      is_landing_safety_assessment: false,
    },
  };
}

/**
 * Compute 360° horizon mask (azimuth 0..359) for a site at (uv, latDeg, lonDeg, elevationM)
 * using spherical ECEF great-circle ray marching across the loaded DEM height grid (primary + 40×40 km context).
 * Matches `LocalTerrain.horizon` in `data-pipeline/process_dem.py`.
 */
export function computeHorizonMask360(
  uv,
  latDeg,
  lonDeg,
  elevationM,
  terrainSampler,
  metadata,
  referenceSites = [],
  observerHeightM = DEFAULT_OBSERVER_HEIGHT_M
) {
  const heightsM = terrainSampler?.heightsM;
  const cols = terrainSampler?.gridCols ?? terrainSampler?.grid ?? 0;
  const rows = terrainSampler?.gridRows ?? terrainSampler?.grid ?? 0;
  const ctxSampler = terrainSampler?.contextSampler;
  const ctxHeightsM = ctxSampler?.heightsM;
  const ctxCols = ctxSampler?.gridCols ?? ctxSampler?.grid ?? 0;
  const ctxRows = ctxSampler?.gridRows ?? ctxSampler?.grid ?? 0;
  const hasPrimaryGrid = Boolean(heightsM && cols >= 4 && rows >= 4);
  const hasCtxGrid = Boolean(ctxHeightsM && ctxCols >= 4 && ctxRows >= 4);

  const bounds = resolveRegionBounds(metadata, referenceSites);
  const R = bounds.radiusM;
  const widthM = bounds.right - bounds.left;
  const heightM = bounds.top - bounds.bottom;
  const ctxWidthM = 40000;
  const ctxHeightM = 40000;

  if ((hasPrimaryGrid || hasCtxGrid) && Number.isFinite(latDeg) && Number.isFinite(lonDeg)) {
    const lat = latDeg * DEG_TO_RAD;
    const lon = lonDeg * DEG_TO_RAD;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    const cosLon = Math.cos(lon);
    const sinLon = Math.sin(lon);

    // Observer zenith unit vector U0 and local horizontal tangent basis E0, N0 in Lunar ME ECEF
    const u0x = cosLat * cosLon;
    const u0y = cosLat * sinLon;
    const u0z = sinLat;
    const e0x = -sinLon;
    const e0y = cosLon;
    const e0z = 0;
    const n0x = -sinLat * cosLon;
    const n0y = -sinLat * sinLon;
    const n0z = cosLat;

    const rObs = R + elevationM + observerHeightM;
    const cellM = hasPrimaryGrid
      ? Math.min(widthM / (cols - 1), heightM / (rows - 1))
      : Math.min(ctxWidthM / (ctxCols - 1), ctxHeightM / (ctxRows - 1));
    const stepM = Math.max(15, cellM * 0.5);
    const maxDistM = hasCtxGrid ? Math.hypot(ctxWidthM, ctxHeightM) : Math.hypot(widthM, heightM);

    const mask = [];
    for (let azimuth = 0; azimuth < 360; azimuth += 1) {
      const azRad = azimuth * DEG_TO_RAD;
      const sinAz = Math.sin(azRad);
      const cosAz = Math.cos(azRad);
      // Horizontal unit tangent vector along `azimuth`
      const tx = sinAz * e0x + cosAz * n0x;
      const ty = sinAz * e0y + cosAz * n0y;
      const tz = sinAz * e0z + cosAz * n0z;

      let bestAngle = -90;
      let bestDist = stepM;
      let bestHeight = elevationM;
      let bestU = uv.u;
      let bestV = uv.v;
      let lastDist = stepM;
      let bestStepIdx = 0;
      let totalValidSteps = 0;

      for (let d = stepM, stepIdx = 0; d <= maxDistM; d += stepM, stepIdx += 1) {
        const theta = d / R;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        // Unit sphere point p(d) = cos(theta)*U0 + sin(theta)*T
        const px = cosT * u0x + sinT * tx;
        const py = cosT * u0y + sinT * ty;
        const pz = cosT * u0z + sinT * tz;

        const denom = 1 - pz;
        if (denom <= 1e-12) break;
        const x = (2 * R * py) / denom;
        const y = (2 * R * px) / denom;

        const rayU = (x - bounds.left) / widthM;
        const rayV = (bounds.top - y) / heightM;
        let h;
        if (hasPrimaryGrid && rayU >= 0 && rayU <= 1 && rayV >= 0 && rayV <= 1) {
          h = sampleBilinearGrid(heightsM, cols, rows, rayU, rayV);
        } else if (hasCtxGrid) {
          const ctxU = (rayU - 0.5) * (widthM / ctxWidthM) + 0.5;
          const ctxV = (rayV - 0.5) * (heightM / ctxHeightM) + 0.5;
          if (ctxU < 0 || ctxU > 1 || ctxV < 0 || ctxV > 1) break;
          h = sampleBilinearGrid(ctxHeightsM, ctxCols, ctxRows, ctxU, ctxV);
        } else {
          break;
        }
        if (!Number.isFinite(h)) break;

        totalValidSteps = stepIdx + 1;
        lastDist = d;

        // Spherical ECEF local elevation angle (exact match to line_elevation in process_dem.py)
        const rSample = R + h;
        const vertical = rSample * cosT - rObs;
        const horizontal = rSample * sinT;
        const angleDeg = Math.atan2(vertical, horizontal) * RAD_TO_DEG;

        if (angleDeg > bestAngle) {
          bestAngle = angleDeg;
          bestDist = d;
          bestHeight = h;
          bestU = rayU;
          bestV = rayV;
          bestStepIdx = stepIdx;
        }
      }

      if (totalValidSteps === 0) {
        bestAngle = 0;
      }

      mask.push({
        azimuth_deg: azimuth,
        horizon_elevation_deg: Number(bestAngle.toFixed(6)),
        sampled_distance_m: Number(lastDist.toFixed(1)),
        blocker_distance_m: Number(bestDist.toFixed(1)),
        blocker_elevation_m: Number(bestHeight.toFixed(3)),
        blocker_uv: {
          u: Number(Math.max(-1.5, Math.min(2.5, bestU)).toFixed(6)),
          v: Number(Math.max(-1.5, Math.min(2.5, bestV)).toFixed(6)),
          extended: true,
        },
        blocker_is_last_sample: totalValidSteps > 0 && bestStepIdx === totalValidSteps - 1,
      });
    }
    return mask;
  }

  // Fallback when DEM height grid is not yet mounted: adapt reference site's horizon mask
  const refSite = referenceSites?.find((s) => Array.isArray(s?.horizon_mask_360) && s.horizon_mask_360.length >= 2);
  if (refSite) {
    const dElev = elevationM - (refSite.coordinates?.elevation_m ?? elevationM);
    const shiftDeg = Math.max(-2.5, Math.min(2.5, -dElev / 250));
    return refSite.horizon_mask_360.map((entry) => ({
      ...entry,
      horizon_elevation_deg: Number((entry.horizon_elevation_deg + shiftDeg).toFixed(4)),
    }));
  }

  return Array.from({ length: 360 }, (_, azimuth_deg) => {
    const rad = azimuth_deg * DEG_TO_RAD;
    return {
      azimuth_deg,
      horizon_elevation_deg: Number((1.5 + 0.8 * Math.sin(rad * 2) + 0.4 * Math.cos(rad * 3)).toFixed(4)),
      sampled_distance_m: 8000,
      blocker_distance_m: 300,
      blocker_elevation_m: elevationM + 12,
      blocker_uv: {
        u: Math.max(0, Math.min(1, uv.u + 0.02 * Math.sin(rad))),
        v: Math.max(0, Math.min(1, uv.v - 0.02 * Math.cos(rad))),
      },
      blocker_is_last_sample: false,
    };
  });
}

/**
 * Transform a sky direction vector { azimuth_deg, elevation_deg } from a reference lunar site
 * (lat0, lon0, elev0) to a target lunar site (lat1, lon1, elev1) via the Lunar Mean-Earth (ME)
 * body-fixed frame, including topocentric parallax for body distance `bodyDistanceKm`.
 */
export function transformSkyVectorBetweenSites(
  vector,
  refCoords,
  targetCoords,
  bodyDistanceKm = 149597870
) {
  if (!isValidSkyVector(vector)) return vector;
  const lat0 = refCoords?.latitude_deg;
  const lon0 = refCoords?.longitude_deg;
  const elev0 = refCoords?.elevation_m ?? 0;
  const lat1 = targetCoords?.latitude_deg;
  const lon1 = targetCoords?.longitude_deg;
  const elev1 = targetCoords?.elevation_m ?? 0;

  if (![lat0, lon0, lat1, lon1].every(Number.isFinite)) return { ...vector };

  const p0 = lat0 * DEG_TO_RAD;
  const l0 = lon0 * DEG_TO_RAD;
  const p1 = lat1 * DEG_TO_RAD;
  const l1 = lon1 * DEG_TO_RAD;

  const az0 = vector.azimuth_deg * DEG_TO_RAD;
  const el0 = vector.elevation_deg * DEG_TO_RAD;
  const cosEl = Math.cos(el0);
  const e0 = cosEl * Math.sin(az0);
  const n0 = cosEl * Math.cos(az0);
  const u0 = Math.sin(el0);

  // Reference ENU basis in Lunar ME frame
  const cosP0 = Math.cos(p0), sinP0 = Math.sin(p0);
  const cosL0 = Math.cos(l0), sinL0 = Math.sin(l0);
  let vx = e0 * (-sinL0) + n0 * (-sinP0 * cosL0) + u0 * (cosP0 * cosL0);
  let vy = e0 * cosL0 + n0 * (-sinP0 * sinL0) + u0 * (cosP0 * sinL0);
  let vz = n0 * cosP0 + u0 * sinP0;

  // Topocentric parallax shift (significant for Earth at ~384,400 km)
  if (Number.isFinite(bodyDistanceKm) && bodyDistanceKm > 0) {
    const r0Km = LUNAR_RADIUS_M / 1000 + elev0 / 1000;
    const r1Km = LUNAR_RADIUS_M / 1000 + elev1 / 1000;
    const cosP1 = Math.cos(p1), sinP1 = Math.sin(p1);
    const cosL1 = Math.cos(l1), sinL1 = Math.sin(l1);
    const dxKm = r1Km * cosP1 * cosL1 - r0Km * cosP0 * cosL0;
    const dyKm = r1Km * cosP1 * sinL1 - r0Km * cosP0 * sinL0;
    const dzKm = r1Km * sinP1 - r0Km * sinP0;
    vx -= dxKm / bodyDistanceKm;
    vy -= dyKm / bodyDistanceKm;
    vz -= dzKm / bodyDistanceKm;
    const len = Math.hypot(vx, vy, vz) || 1;
    vx /= len;
    vy /= len;
    vz /= len;
  }

  // Project onto target site ENU basis
  const cosP1 = Math.cos(p1), sinP1 = Math.sin(p1);
  const cosL1 = Math.cos(l1), sinL1 = Math.sin(l1);
  const e1 = vx * (-sinL1) + vy * cosL1;
  const n1 = vx * (-sinP1 * cosL1) + vy * (-sinP1 * sinL1) + vz * cosP1;
  const u1 = vx * (cosP1 * cosL1) + vy * (cosP1 * sinL1) + vz * sinP1;

  const newEl = Math.asin(Math.max(-1, Math.min(1, u1))) * RAD_TO_DEG;
  const newAz = normalizeAzimuth(Math.atan2(e1, n1) * RAD_TO_DEG);

  return {
    ...vector,
    azimuth_deg: Number(newAz.toFixed(6)),
    elevation_deg: Number(newEl.toFixed(6)),
  };
}

/**
 * Build a full ephemeris timeline for a target site from a reference site's timeline.
 */
export function computeSiteTimeline(referenceTimeline, refCoords, targetCoords) {
  if (!Array.isArray(referenceTimeline)) return [];
  return referenceTimeline.map((row) => ({
    ...row,
    sun_vector: row.sun_vector
      ? transformSkyVectorBetweenSites(row.sun_vector, refCoords, targetCoords, 149597870)
      : row.sun_vector,
    earth_vector: row.earth_vector
      ? transformSkyVectorBetweenSites(row.earth_vector, refCoords, targetCoords, 384400)
      : row.earth_vector,
  }));
}

/**
 * Summarize visibility metrics & per-timestamp visibility statuses for a site,
 * matching `summarize` and `apply_terrain` in `build_site_telemetry.py` / `process_dem.py`.
 */
export function computeSiteMetricsAndVisibility(timeline, horizonMask360, slopeAnalysis, stepHours = 1) {
  const cleanedMask = cleanHorizonMask(horizonMask360);
  const hasMask = cleanedMask.length >= 2;

  let baseSunCount = 0;
  let baseEarthCount = 0;
  let baseLongestRun = 0;
  let baseCurrentRun = 0;

  let terrainSunCount = 0;
  let terrainEarthCount = 0;
  let terrainLongestRun = 0;
  let terrainCurrentRun = 0;

  const visibilityTimeline = [];

  for (const row of timeline ?? []) {
    const sunEl = row?.sun_vector?.elevation_deg;
    const sunAz = row?.sun_vector?.azimuth_deg;
    const earthEl = row?.earth_vector?.elevation_deg;
    const earthAz = row?.earth_vector?.azimuth_deg;

    const baseSunVis = Number.isFinite(sunEl) && sunEl > 0;
    const baseEarthVis = Number.isFinite(earthEl) && earthEl > 0;
    if (baseSunVis) {
      baseSunCount += 1;
      baseCurrentRun = 0;
    } else {
      baseCurrentRun += 1;
      if (baseCurrentRun > baseLongestRun) baseLongestRun = baseCurrentRun;
    }
    if (baseEarthVis) baseEarthCount += 1;

    const sunRim = hasMask && Number.isFinite(sunAz) ? Math.max(0, getHorizonElevationAtAzimuth(cleanedMask, sunAz) ?? 0) : 0;
    const earthRim = hasMask && Number.isFinite(earthAz) ? Math.max(0, getHorizonElevationAtAzimuth(cleanedMask, earthAz) ?? 0) : 0;

    const isSunClear = Number.isFinite(sunEl) ? sunEl > sunRim : false;
    const isEarthClear = Number.isFinite(earthEl) ? earthEl > earthRim : false;

    if (isSunClear) {
      terrainSunCount += 1;
      terrainCurrentRun = 0;
    } else {
      terrainCurrentRun += 1;
      if (terrainCurrentRun > terrainLongestRun) terrainLongestRun = terrainCurrentRun;
    }
    if (isEarthClear) terrainEarthCount += 1;

    visibilityTimeline.push({
      timestamp_utc: row.timestamp_utc,
      is_sun_clear_within_dem: isSunClear,
      is_earth_clear_within_dem: isEarthClear,
    });
  }

  const total = timeline?.length || 1;
  const summary_metrics = {
    solar_illumination_pct: Number(((100 * baseSunCount) / total).toFixed(4)),
    dte_availability_pct: Number(((100 * baseEarthCount) / total).toFixed(4)),
    max_eclipse_hours: baseLongestRun * stepHours,
    average_slope_deg: slopeAnalysis?.average_slope_deg ?? null,
    max_slope_deg: slopeAnalysis?.max_slope_deg ?? null,
    safety_rating: null,
  };

  const terrain_summary_metrics = {
    solar_illumination_pct: Number(((100 * terrainSunCount) / total).toFixed(4)),
    dte_availability_pct: Number(((100 * terrainEarthCount) / total).toFixed(4)),
    max_eclipse_hours: terrainLongestRun * stepHours,
  };

  return {
    summary_metrics,
    terrain_summary_metrics,
    terrain_visibility_timeline: visibilityTimeline,
  };
}

/**
 * Build or update a complete site object and its ephemeris timeline for a chosen coordinate
 * (either { u, v } or { latitude_deg, longitude_deg }), recomputing all scientific & terrain fields.
 */
export function buildCalculatedSite({
  siteId,
  name,
  pairGroup = 'CUSTOM_DELTA',
  uv: inputUv,
  latitude_deg: inputLat,
  longitude_deg: inputLon,
  telemetry,
  ephemeris,
  terrainSampler,
  existingSite = null,
}) {
  const metadata = telemetry?.terrain_metadata;
  const referenceSites = telemetry?.sites ?? [];
  const refSite = referenceSites[0] ?? existingSite;

  const { minU, maxU, minV, maxV } = getPlacementUvBounds(metadata);
  let uv = isValidPlacementUv(inputUv)
    ? {
        u: Math.max(minU, Math.min(maxU, Number(inputUv.u))),
        v: Math.max(minV, Math.min(maxV, Number(inputUv.v))),
      }
    : null;
  let latLon = null;

  if (Number.isFinite(inputLat) && Number.isFinite(inputLon) && !uv) {
    const projected = latLonToUv(inputLat, inputLon, metadata, referenceSites);
    if (projected) {
      uv = { u: projected.u, v: projected.v };
      latLon = uvToLatLon(uv, metadata, referenceSites);
    }
  } else if (uv) {
    latLon = uvToLatLon(uv, metadata, referenceSites);
    if (Number.isFinite(inputLat) && Number.isFinite(inputLon)) {
      const checkUv = latLonToUv(inputLat, inputLon, metadata, referenceSites);
      if (checkUv && Math.hypot(checkUv.u - uv.u, checkUv.v - uv.v) < 1e-4) {
        latLon = { latitude_deg: Number(inputLat), longitude_deg: Number(inputLon) };
      }
    }
  }

  if (!uv) {
    uv = { u: 0.5, v: 0.5 };
    latLon = uvToLatLon(uv, metadata, referenceSites) ?? { latitude_deg: -89.46, longitude_deg: -137.0 };
  }

  const elevationM = Number(
    sampleElevationMetersAtUV(uv, terrainSampler, metadata, referenceSites).toFixed(3)
  );

  const coordinates = {
    latitude_deg: latLon.latitude_deg,
    longitude_deg: latLon.longitude_deg,
    elevation_m: elevationM,
    uv: {
      u: Number(uv.u.toFixed(6)),
      v: Number(uv.v.toFixed(6)),
      extended: true,
    },
  };

  const { slope_analysis, terrain_screening } = computeSlopeAndRoughness(
    coordinates.uv,
    coordinates.latitude_deg,
    coordinates.longitude_deg,
    terrainSampler,
    metadata,
    referenceSites
  );

  const horizon_mask_360 = computeHorizonMask360(
    coordinates.uv,
    coordinates.latitude_deg,
    coordinates.longitude_deg,
    elevationM,
    terrainSampler,
    metadata,
    referenceSites
  );

  const refSiteId = refSite?.site_id;
  const refTimeline =
    (refSiteId && ephemeris?.timelines_by_site?.[refSiteId]) ||
    ephemeris?.timeline ||
    [];
  const timeline = computeSiteTimeline(refTimeline, refSite?.coordinates, coordinates);
  const stepHours = ephemeris?.mission_window?.step_hours ?? telemetry?.mission_window?.step_hours ?? 1;

  const {
    summary_metrics,
    terrain_summary_metrics,
    terrain_visibility_timeline,
  } = computeSiteMetricsAndVisibility(timeline, horizon_mask_360, slope_analysis, stepHours);

  const distances = horizon_mask_360.map((item) => item.sampled_distance_m).filter(Number.isFinite);

  const site = {
    ...(existingSite ?? {}),
    site_id: siteId,
    pair_group: existingSite?.pair_group ?? refSite?.pair_group ?? pairGroup,
    name: name || existingSite?.name || siteId,
    selection_basis: 'USER_CUSTOM_COORDINATES',
    is_custom: existingSite?.is_custom ?? true,
    coordinates,
    slope_analysis,
    terrain_screening,
    summary_metrics,
    terrain_summary_metrics,
    terrain_visibility_timeline,
    horizon_mask_360,
    horizon_coverage: {
      coverage_status: 'LOCAL_DEM_ONLY',
      is_global_horizon_complete: false,
      min_sampled_distance_m: distances.length ? Math.min(...distances) : 0,
      max_sampled_distance_m: distances.length ? Math.max(...distances) : 0,
    },
    safety_assessment: existingSite?.safety_assessment ?? {
      status: 'NOT_ASSESSED',
      reason:
        'Spesifikasi wahana, batas slope, toleransi batu dan kekasaran belum ditetapkan. ' +
        'DEM 5 m belum cukup untuk menilai bahaya di bawah resolusinya; slope saja tidak menentukan keamanan pendaratan.',
    },
  };

  return { site, timeline };
}
