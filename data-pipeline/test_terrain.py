import hashlib
import io
import json
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
    screen_terrain,
    slope_grid,
)
from rasterio.transform import from_origin
from validate_terrain import REFERENCE_URL, compare_reference_slope, error_metrics


class TerrainTests(unittest.TestCase):
    def test_demo_screening_boundaries_and_missing_measurements(self):
        self.assertEqual(screen_terrain(10, 0.5), "LOWER_CONCERN")
        self.assertEqual(screen_terrain(15, 1), "CAUTION")
        self.assertEqual(screen_terrain(10.001, 0.5), "CAUTION")
        self.assertEqual(screen_terrain(15.001, 0), "EXCEEDS_DEMO_LIMITS")
        self.assertEqual(screen_terrain(0, 1.001), "EXCEEDS_DEMO_LIMITS")
        for invalid in [float("nan"), float("inf"), -1]:
            with self.assertRaises(ValueError):
                screen_terrain(invalid, 0)

    def test_reference_error_metrics_and_invalid_samples(self):
        metrics = error_metrics(np.array([1.0, 2.0, 3.0]), np.array([2.0, 2.0, 2.0]))
        self.assertEqual(metrics["bias_deg"], 0)
        self.assertAlmostEqual(metrics["mae_deg"], 2 / 3)
        self.assertAlmostEqual(metrics["rmse_deg"], np.sqrt(2 / 3))
        self.assertEqual(metrics["max_absolute_error_deg"], 1)
        for calculated, reference in [([], []), ([1], [1, 2]), ([np.nan], [1])]:
            with self.assertRaises(ValueError):
                error_metrics(calculated, reference)

    def test_reference_comparison_checks_grid_checksum_and_validation_scope(self):
        with tempfile.TemporaryDirectory() as folder:
            dem, reference = Path(folder) / "dem.tif", Path(folder) / "slope.tif"
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
            with rasterio.open(dem, "w", **profile) as target:
                target.write(np.full((101, 101), 1000, dtype=np.float32), 1)
            telemetry = {
                "terrain_metadata": {},
                "sites": [
                    {
                        "site_id": "TEST",
                        "coordinates": {"uv": {"u": 0.5, "v": 0.5}},
                        "slope_analysis": {"radius_m": 25},
                    }
                ],
            }
            for shift in [0, 2.5]:
                profile["transform"] = from_origin(-252.5 + shift, -1000, 5, 5)
                with rasterio.open(reference, "w", **profile) as target:
                    target.write(np.full((101, 101), 2, dtype=np.float32), 1)
                receipt = {
                    "source_url": REFERENCE_URL,
                    "sha256": hashlib.sha256(reference.read_bytes()).hexdigest(),
                    "retrieved_at": "2026-11-14T00:00:00Z",
                    "retrieval_method": "TEST_FIXTURE",
                }
                reference.with_suffix(".provenance.json").write_text(json.dumps(receipt))
                if shift:
                    with self.assertRaisesRegex(ValueError, "not aligned"):
                        compare_reference_slope(telemetry, dem, reference)
                    continue
                compare_reference_slope(telemetry, dem, reference)
                report = telemetry["terrain_metadata"]["validation"]
                self.assertEqual(report["sites"]["TEST"]["mae_deg"], 2)
                self.assertFalse(report["is_independent_measurement_validation_complete"])
                self.assertFalse(report["is_landing_safety_validated"])
                self.assertIsNone(report["acceptance_threshold_deg"])
                receipt["sha256"] = "0" * 64
                reference.with_suffix(".provenance.json").write_text(json.dumps(receipt))
                with self.assertRaisesRegex(ValueError, "checksum"):
                    compare_reference_slope(telemetry, dem, reference)

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
            self.assertAlmostEqual(slopes["roughness_rmse_m"], 0, places=8)
            mask = terrain.horizon(site)
            self.assertEqual(len(mask), 360)
            self.assertTrue(all(entry["horizon_elevation_deg"] < 0 for entry in mask))
            data[70, :] = 1020
            with rasterio.open(path, "w", **profile) as target:
                target.write(data, 1)
            hill_mask = LocalTerrain(path).horizon(site)
            self.assertGreater(max(entry["horizon_elevation_deg"] for entry in hill_mask), 9)
            _, columns = np.mgrid[:101, :101]
            data = (1000 + (columns - 50) * 0.1).astype(np.float32)
            with rasterio.open(path, "w", **profile) as target:
                target.write(data, 1)
            _, tilted = LocalTerrain(path).sample_site(site, 25)
            self.assertLess(tilted["roughness_rmse_m"], 0.001)
            self.assertGreater(tilted["max_slope_deg"], 0)
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
