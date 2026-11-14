import io
import tempfile
import unittest
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from process_dem import (
    RADIUS_M,
    LocalTerrain,
    bilinear,
    clearance,
    destination,
    heightmap_bytes,
    horizon_at,
    line_elevation,
    slope_grid,
)
from rasterio.transform import from_origin


class TerrainTests(unittest.TestCase):
    def test_bilinear_plane_slope_and_nodata(self):
        rows, columns = np.mgrid[:10, :10]
        data = 2.0 * columns + rows
        self.assertAlmostEqual(float(bilinear(data, 3.25, 4.5)), 12.25)
        np.testing.assert_allclose(slope_grid(data, 5), np.degrees(np.arctan(np.sqrt(5) / 5)))
        data[3, 4] = np.nan
        with self.assertRaises(ValueError):
            bilinear(data, 3.25, 4.5)
        with self.assertRaises(ValueError):
            bilinear(data, -0.1, 1)

    def test_great_circle_bearing_and_spherical_los(self):
        distance = np.array([100, 1000.0])
        lat, lon = destination(-89, 0, 0, distance)
        np.testing.assert_allclose(lat, -89 + np.degrees(distance / RADIUS_M), atol=1e-10)
        np.testing.assert_allclose(lon, 0)
        angles = line_elevation(-89, 0, 0, lat, lon, np.zeros(2))
        np.testing.assert_allclose(angles, -np.degrees(distance / (2 * RADIUS_M)), atol=1e-8)
        raised = line_elevation(-89, 0, 2, lat[:1], lon[:1], np.array([20]))
        self.assertGreater(float(raised[0]), 9)

    def test_azimuth_seam_and_zero_threshold(self):
        mask = [{"azimuth_deg": az, "horizon_elevation_deg": -1.0} for az in range(360)]
        self.assertEqual(clearance(0, 0, mask), 0)
        self.assertLess(clearance(-0.1, 20, mask), 0)
        mask[0]["horizon_elevation_deg"] = 3
        self.assertEqual(horizon_at(mask, 359.5), 1)
        self.assertEqual(horizon_at(mask, 360), 3)
        self.assertEqual(clearance(3, 0, mask), 0)
        self.assertLess(clearance(2, 0, mask), 0)

    def test_heightmap_orientation_quantization_and_dimensions(self):
        data = np.array([[0, 100], [200, 255]], dtype=float)
        encoded, size, minimum, maximum = heightmap_bytes(data)
        pixels = np.asarray(Image.open(io.BytesIO(encoded)))[:, :, 0]
        np.testing.assert_array_equal(pixels, data)
        self.assertEqual((size, minimum, maximum), ((2, 2), 0, 255))
        _, size, _, _ = heightmap_bytes(np.zeros((2100, 100)))
        self.assertLessEqual(max(size), 2048)

    def test_synthetic_lunar_dem_horizon_and_missing_data_rejection(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "test.tif"
            profile = {
                "driver": "GTiff",
                "height": 101,
                "width": 101,
                "count": 1,
                "dtype": "float32",
                "nodata": np.nan,
                "transform": from_origin(-252.5, -1000, 5, 5),
                "crs": f"+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R={RADIUS_M} +units=m",
            }
            data = np.full((101, 101), 1000, dtype=np.float32)
            with rasterio.open(path, "w", **profile) as target:
                target.write(data, 1)
            terrain = LocalTerrain(path)
            lat = np.degrees(2 * np.arctan(1252.5 / (2 * RADIUS_M)) - np.pi / 2)
            site = {
                "site_id": "TEST",
                "coordinates": {"latitude_deg": lat, "longitude_deg": 180, "elevation_m": 1000},
                "observer_height_above_ground_m": 2,
            }
            uv, slopes = terrain.sample_site(site, 25)
            self.assertAlmostEqual(uv["u"], 0.5, places=6)
            self.assertAlmostEqual(uv["v"], 0.5, places=6)
            self.assertEqual(slopes["max_slope_deg"], 0)
            mask = terrain.horizon(site)
            self.assertEqual(len(mask), 360)
            self.assertTrue(all(entry["horizon_elevation_deg"] < 0 for entry in mask))
            data[70, :] = 1020
            with rasterio.open(path, "w", **profile) as target:
                target.write(data, 1)
            hill_mask = LocalTerrain(path).horizon(site)
            self.assertGreater(max(entry["horizon_elevation_deg"] for entry in hill_mask), 9)
            data[0, 0] = np.nan
            with rasterio.open(path, "w", **profile) as target:
                target.write(data, 1)
            with self.assertRaisesRegex(ValueError, "nodata"):
                LocalTerrain(path)
            data[0, :] = 0
            with rasterio.open(path, "w", **profile) as target:
                target.write(data, 1)
            with self.assertRaisesRegex(ValueError, "all-zero row"):
                LocalTerrain(path)


if __name__ == "__main__":
    unittest.main()
