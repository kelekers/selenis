import { BufferAttribute, BufferGeometry } from 'three';
import { isValidSkyVector } from './shadowMath.js';

export const MOON_RADIUS_KM = 1737.4;

/** Moon ME to scene: X=east at lon 0, Y=south pole, -Z=equator at lon 0. */
export function lunarPosition(latitudeDeg, longitudeDeg, elevationM = 0) {
  if (![latitudeDeg, longitudeDeg, elevationM].every(Number.isFinite) || latitudeDeg < -90 || latitudeDeg > 0) return null;
  const lat = latitudeDeg * Math.PI / 180;
  const lon = longitudeDeg * Math.PI / 180;
  const r = MOON_RADIUS_KM + elevationM / 1000;
  if (latitudeDeg === -90) return [0, r, 0];
  return [r * Math.cos(lat) * Math.sin(lon), -r * Math.sin(lat), -r * Math.cos(lat) * Math.cos(lon)];
}

export function hemisphereRegionMarkers(regions, selectedRegionId, activeSite) {
  return regions.flatMap((region) => {
    const active = region.id === selectedRegionId;
    const coordinates = active ? activeSite?.coordinates ?? region.demo_anchor : region.demo_anchor;
    const position = lunarPosition(coordinates?.latitude_deg, coordinates?.longitude_deg,
      (coordinates?.elevation_m ?? 0) + 22000);
    return position ? [{ ...region, active, position }] : [];
  });
}

/** Local apparent Sun direction expressed in the body-fixed hemisphere scene; visual lighting only. */
export function hemisphereSunDirection(site, vector) {
  const lat = site?.coordinates?.latitude_deg;
  const lon = site?.coordinates?.longitude_deg;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isValidSkyVector(vector)) return null;
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180;
  const az = vector.azimuth_deg * Math.PI / 180, el = vector.elevation_deg * Math.PI / 180;
  const east = Math.sin(az) * Math.cos(el), north = Math.cos(az) * Math.cos(el), up = Math.sin(el);
  return [
    east * Math.cos(l) - north * Math.sin(p) * Math.sin(l) + up * Math.cos(p) * Math.sin(l),
    -north * Math.cos(p) - up * Math.sin(p),
    east * Math.sin(l) + north * Math.sin(p) * Math.cos(l) - up * Math.cos(p) * Math.cos(l),
  ];
}

export function buildHemisphereGeometry(data) {
  const grid = data?.grid;
  if (data?.schema_version !== 1 || data.reference_frame !== 'MOON_ME_DE421' ||
      data.reference_radius_m !== 1737400 || data.elevation_unit !== 'm' ||
      grid?.registration !== 'GEOGRAPHIC_VERTICES' ||
      grid.longitude_start_deg !== -180 || grid.longitude_end_deg !== 180 ||
      grid.latitude_start_deg !== 0 || grid.latitude_end_deg !== -90 ||
      !Number.isInteger(grid.width) || !Number.isInteger(grid.height) ||
      grid.width < 3 || grid.width > 1025 || grid.height < 3 || grid.height > 513 ||
      !Array.isArray(grid.elevations_m) || grid.elevations_m.length !== grid.width * grid.height ||
      !grid.elevations_m.every((v) => Number.isFinite(v) && Math.abs(v) < 30000)) {
    throw new Error('Dataset hemisfer tidak sesuai kontrak elevasi Bulan.');
  }
  const { width, height, elevations_m: elevations } = grid;
  for (let row = 0; row < height; row++) {
    if (elevations[row * width] !== elevations[(row + 1) * width - 1]) throw new Error('Seam DEM hemisfer tidak kontinu.');
  }
  if (!elevations.slice(-width).every((v) => v === elevations.at(-1))) throw new Error('Elevasi kutub tidak konsisten.');
  const positions = new Float32Array(width * height * 3);
  const uv = new Float32Array(width * height * 2);
  const indices = [];
  for (let row = 0; row < height; row++) {
    const latitude = -90 * row / (height - 1);
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      const longitude = -180 + 360 * col / (width - 1);
      positions.set(lunarPosition(latitude, longitude, elevations[index]), index * 3);
      uv.set([col / (width - 1), 0.5 * (1 - row / (height - 1))], index * 2);
      if (row < height - 1 && col < width - 1) {
        indices.push(index, index + width, index + 1);
        if (row < height - 2) indices.push(index + 1, index + width, index + width + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // UV seams duplicate vertices; share normals so the meridian does not become a lighting seam.
  const normals = geometry.attributes.normal;
  for (let row = 0; row < height - 1; row++) {
    const a = row * width, b = a + width - 1;
    const n = [normals.getX(a) + normals.getX(b), normals.getY(a) + normals.getY(b), normals.getZ(a) + normals.getZ(b)];
    const length = Math.hypot(...n);
    normals.setXYZ(a, ...n.map((v) => v / length));
    normals.setXYZ(b, ...n.map((v) => v / length));
  }
  for (let col = 0; col < width; col++) normals.setXYZ((height - 1) * width + col, 0, 1, 0);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Keep measured samples and seam/pole registration when reducing a display LOD. */
export function hemisphereLodData(data, stride) {
  const grid = data?.grid;
  if (!Number.isInteger(stride) || stride < 1 || !grid ||
      (grid.width - 1) % stride || (grid.height - 1) % stride) {
    throw new Error('Stride LOD tidak sesuai grid hemisfer.');
  }
  const elevations = [];
  for (let row = 0; row < grid.height; row += stride) {
    for (let col = 0; col < grid.width; col += stride) elevations.push(grid.elevations_m[row * grid.width + col]);
  }
  return { ...data, grid: { ...grid, width: (grid.width - 1) / stride + 1,
    height: (grid.height - 1) / stride + 1, elevations_m: elevations } };
}
