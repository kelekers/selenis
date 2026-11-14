export function northOffsetForSite(site) {
  const north = site?.slope_analysis?.local_basis_projected?.north;
  return north && Number.isFinite(north.x) && Number.isFinite(north.y) && Math.hypot(north.x, north.y) > 0
    ? Math.atan2(north.x, north.y) * 180 / Math.PI : null;
}

export function vectorInGrid(vector, offset) {
  if (!vector || offset === null) return null;
  return { ...vector, azimuth_deg: (vector.azimuth_deg + offset + 360) % 360 };
}
