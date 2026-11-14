export const MOCK_SITE_TELEMETRY = {
  terrain_metadata: {
    region_name: 'Shackleton Crater & Connecting Ridge (Preview)',
    area_width_km: 20.0,
    area_height_km: 20.0,
    min_elevation_m: -4200.0,
    max_elevation_m: 2150.0,
    heightmap_texture: null,
    normal_texture: null,
  },
  sites: [
    {
      site_id: 'SHACKLETON_RIDGE_A',
      pair_group: 'SHACKLETON_DELTA',
      name: 'Shackleton Connecting Ridge — Site A',
      coordinates: {
        latitude_deg: -89.4521,
        longitude_deg: 129.1504,
        elevation_m: 1850.5,
        uv: { u: 0.46, v: 0.44 },
      },
      summary_metrics: {
        solar_illumination_pct: 81.4,
        dte_availability_pct: 68.2,
        max_eclipse_hours: 38.0,
        average_slope_deg: 4.2,
        max_slope_deg: 9.8,
        safety_rating: 'OPTIMAL',
      },
      horizon_mask_360: Array.from({ length: 36 }, (_, idx) => {
        const azimuth_deg = idx * 10;
        const rad = (azimuth_deg * Math.PI) / 180;
        const horizon_elevation_deg = Number(
          (1.4 + 0.9 * Math.sin(rad * 2) + 0.5 * Math.cos(rad * 3)).toFixed(2)
        );
        return { azimuth_deg, horizon_elevation_deg };
      }),
    },
    {
      site_id: 'SHACKLETON_BASIN_B',
      pair_group: 'SHACKLETON_DELTA',
      name: 'Shackleton Inner Slope — Site B (+450m)',
      coordinates: {
        latitude_deg: -89.461,
        longitude_deg: 130.42,
        elevation_m: 1410.0,
        uv: { u: 0.52, v: 0.49 },
      },
      summary_metrics: {
        solar_illumination_pct: 34.6,
        dte_availability_pct: 41.0,
        max_eclipse_hours: 142.0,
        average_slope_deg: 11.5,
        max_slope_deg: 18.4,
        safety_rating: 'MODERATE',
      },
      horizon_mask_360: Array.from({ length: 36 }, (_, idx) => {
        const azimuth_deg = idx * 10;
        const rad = (azimuth_deg * Math.PI) / 180;
        const horizon_elevation_deg = Number(
          (3.6 + 1.4 * Math.sin(rad * 2 + 0.4) + 0.8 * Math.cos(rad)).toFixed(2)
        );
        return { azimuth_deg, horizon_elevation_deg };
      }),
    },
  ],
};

function generateMockTimeline() {
  const startMs = Date.parse('2026-11-14T00:00:00Z');
  const totalHours = 72;
  const timeline = [];

  for (let h = 0; h < totalHours; h += 1) {
    const timestamp_utc = new Date(startMs + h * 3600 * 1000).toISOString();
    const sunAzimuth = (110 + h * 0.52) % 360;
    const sunElevation = Number((2.2 + 1.3 * Math.sin((h / 72) * Math.PI * 2)).toFixed(2));

    const librationPhase = (h / 72) * Math.PI * 2;
    const earthAzimuth = Number((42 + 4.5 * Math.sin(librationPhase)).toFixed(2));
    const earthElevation = Number((2.6 + 1.7 * Math.sin(librationPhase * 2)).toFixed(2));

    timeline.push({
      timestamp_utc,
      sun_vector: {
        azimuth_deg: Number(sunAzimuth.toFixed(2)),
        elevation_deg: sunElevation,
        solar_flux_wm2: 1361.0,
      },
      earth_vector: {
        azimuth_deg: earthAzimuth,
        elevation_deg: earthElevation,
        libration_lat_deg: Number((4.1 * Math.sin(librationPhase)).toFixed(2)),
        libration_lon_deg: Number((-2.8 * Math.cos(librationPhase)).toFixed(2)),
      },
    });
  }

  return {
    mission_window: {
      start_utc: timeline[0].timestamp_utc,
      end_utc: timeline[timeline.length - 1].timestamp_utc,
      step_hours: 1,
    },
    timeline,
  };
}

export const MOCK_EPHEMERIS_VECTORS = generateMockTimeline();

/**
 * Menghasilkan DataURL heightmap prosedural Kawah Shackleton + Connecting Ridge
 * sebagai pengganti sementara sebelum lunar_south_pole_heightmap.webp tersedia.
 */
export function createFallbackHeightmapDataUrl(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = x / size - 0.55;
      const ny = y / size - 0.55;
      const dist = Math.sqrt(nx * nx + ny * ny);

      // Kawah utama + bibir kawah + punggungan (Connecting Ridge)
      const craterBowl = Math.min(1, Math.pow(dist / 0.34, 2.2));
      const rimPeak = 0.28 * Math.exp(-Math.pow((dist - 0.34) / 0.06, 2));
      const ridge = 0.22 * Math.exp(-Math.pow((nx + ny + 0.12) / 0.14, 2));
      const microRelief =
        0.04 * Math.sin(x * 0.22) * Math.cos(y * 0.19) +
        0.025 * Math.sin((x + y) * 0.45);

      const h = Math.max(0, Math.min(1, craterBowl * 0.62 + rimPeak + ridge + microRelief));
      const val = Math.round(h * 255);
      const idx = (y * size + x) * 4;

      imgData.data[idx] = val;
      imgData.data[idx + 1] = val;
      imgData.data[idx + 2] = val;
      imgData.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}