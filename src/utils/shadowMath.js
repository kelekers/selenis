const DEG_TO_RAD = Math.PI / 180;

/**
 * Mengonversi (azimuth_deg, elevation_deg) standar astronomi ke posisi 3D Three.js.
 * Konvensi: 0° = Utara (-Z), 90° = Timur (+X), +Y = Zenith.
 */
export function celestialToCartesian(azimuthDeg, elevationDeg, radius = 40) {
  const azRad = azimuthDeg * DEG_TO_RAD;
  const elRad = elevationDeg * DEG_TO_RAD;

  const horizontalDist = radius * Math.cos(elRad);
  const x = horizontalDist * Math.sin(azRad);
  const y = radius * Math.sin(elRad);
  const z = -horizontalDist * Math.cos(azRad);

  return [x, y, z];
}

/**
 * Mengonversi koordinat UV (0..1) ke posisi (x, z) di atas mesh plane Three.js.
 */
export function uvToTerrainXZ(uv, planeSize = 20) {
  const u = uv?.u ?? 0.5;
  const v = uv?.v ?? 0.5;
  const x = (u - 0.5) * planeSize;
  const z = (v - 0.5) * planeSize;
  return [x, z];
}

/**
 * Interpolasi linear sudut elevasi penghalang cakrawala (horizon mask) pada azimuth tertentu.
 */
export function getHorizonElevationAtAzimuth(horizonMask360, targetAzimuthDeg) {
  if (!Array.isArray(horizonMask360) || horizonMask360.length === 0) {
    return 0;
  }

  const sorted = [...horizonMask360].sort((a, b) => a.azimuth_deg - b.azimuth_deg);
  const az = ((targetAzimuthDeg % 360) + 360) % 360;

  for (let i = 0; i < sorted.length; i += 1) {
    const curr = sorted[i];
    const next = sorted[(i + 1) % sorted.length];
    const nextAz = i === sorted.length - 1 ? next.azimuth_deg + 360 : next.azimuth_deg;

    if (az >= curr.azimuth_deg && az <= nextAz) {
      const span = nextAz - curr.azimuth_deg || 1;
      const t = (az - curr.azimuth_deg) / span;
      return curr.horizon_elevation_deg + t * (next.horizon_elevation_deg - curr.horizon_elevation_deg);
    }
  }

  return sorted[0].horizon_elevation_deg;
}

/**
 * Mengevaluasi apakah Matahari dan Bumi terlihat atau terhalang topografi pada waktu aktif.
 */
export function evaluateLineOfSight(site, ephemerisPoint) {
  if (!site || !ephemerisPoint) {
    return {
      is_sun_visible: false,
      is_dte_active: false,
      sun_horizon_deg: 0,
      earth_horizon_deg: 0,
    };
  }

  const sunAz = ephemerisPoint.sun_vector.azimuth_deg;
  const sunEl = ephemerisPoint.sun_vector.elevation_deg;
  const sunHorizon = Math.max(0, getHorizonElevationAtAzimuth(site.horizon_mask_360, sunAz));

  const earthAz = ephemerisPoint.earth_vector.azimuth_deg;
  const earthEl = ephemerisPoint.earth_vector.elevation_deg;
  const earthHorizon = Math.max(0, getHorizonElevationAtAzimuth(site.horizon_mask_360, earthAz));

  return {
    is_sun_visible: sunEl > sunHorizon,
    is_dte_active: earthEl > earthHorizon,
    sun_horizon_deg: Number(sunHorizon.toFixed(2)),
    earth_horizon_deg: Number(earthHorizon.toFixed(2)),
  };
}
