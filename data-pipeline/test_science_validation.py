import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from fetch_horizons import ROOT
from rasterio.transform import from_origin
from validate_science import (
    check_horizons,
    compare_camera_terrain,
    differences,
    publish_report,
    sample_confident,
    verified_receipt,
)


class ScienceValidationTests(unittest.TestCase):
    def test_publish_preserves_assets_checksums_and_previous_output_on_invalid_report(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = {
                "schema_version": 1,
                "status": "ready",
                "assets": [{"path": "data/keep.json"}],
            }
            (root / "manifest.json").write_text(json.dumps(manifest))
            source = {"retrieved_at": "2026-11-14T00:00:00Z"}
            report = {
                "horizons_refresh": {"sources": [source]},
                "terrain_cross_sensor": {"sources": [source]},
                "test_fixture": True,
            }
            publish_report(report, root)
            first = {p.name: p.read_bytes() for p in root.iterdir()}
            publish_report(report, root)
            self.assertEqual(first, {p.name: p.read_bytes() for p in root.iterdir()})
            result = json.loads((root / "manifest.json").read_text())
            self.assertEqual(len(result["assets"]), 2)
            self.assertEqual(result["assets"][0]["path"], "data/keep.json")
            self.assertEqual(
                result["assets"][1]["sha256"],
                hashlib.sha256((root / "science_validation.json").read_bytes()).hexdigest(),
            )
            with self.assertRaises(ValueError):
                publish_report({**report, "bad": float("nan")}, root)
            self.assertEqual(first, {p.name: p.read_bytes() for p in root.iterdir()})

    def test_difference_metrics_do_not_invent_results_for_missing_data(self):
        result = differences(np.array([1.0, 2.0, 3.0]), np.array([2.0, 2.0, 2.0]))
        self.assertEqual(result["sample_count"], 3)
        self.assertEqual(result["bias"], 0)
        self.assertAlmostEqual(result["rmse"], np.sqrt(2 / 3))
        self.assertIsNone(differences([], []))
        with self.assertRaises(ValueError):
            differences(np.array([np.nan]), np.array([0.0]))

    def test_reference_sampling_requires_finite_confident_neighbors(self):
        rows, cols = np.mgrid[:6, :6]
        data = (2 * cols + rows).astype(float)
        quality = np.ones((6, 6), dtype=bool)
        affine = from_origin(0, 30, 5, 5)
        self.assertAlmostEqual(sample_confident(data, quality, affine, [8.75], [21.25])[0], 3.75)
        quality[1, 1] = False
        self.assertTrue(np.isnan(sample_confident(data, quality, affine, [8.75], [21.25])[0]))
        quality[1, 1] = True
        data[1, 1] = np.nan
        self.assertTrue(np.isnan(sample_confident(data, quality, affine, [8.75], [21.25])[0]))
        self.assertTrue(np.isnan(sample_confident(data, quality, affine, [-5], [50])[0]))

    def test_receipts_distinguish_image_and_tiff_with_same_stem(self):
        with tempfile.TemporaryDirectory() as directory:
            for extension in ["TIF", "IMG"]:
                path = Path(directory) / f"CONF.{extension}"
                path.write_bytes(extension.encode())
                receipt = {
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    "retrieved_at": "2026-11-14T00:00:00Z",
                }
                path.with_name(path.name + ".provenance.json").write_text(json.dumps(receipt))
                self.assertEqual(verified_receipt(path), receipt)
            path.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "checksum"):
                verified_receipt(path)

    def test_horizons_replay_records_acquisition_and_detects_difference(self):
        config = json.loads((ROOT / "config/sites_config.json").read_text())
        published = json.loads((ROOT.parent / "public/data/ephemeris_vectors.json").read_text())
        sources = [{"retrieval_method": "HORIZONS_HTTP", "retrieved_at": "2026-11-14T00:00:00Z"}]
        with patch("validate_science.load_ephemeris", return_value=(published, sources)):
            report = check_horizons(config)
            self.assertEqual(report["status"], "MATCHES_PUBLISHED_AT_EXPORTED_PRECISION")
            self.assertEqual(report["run_mode"], "CACHE_REPLAY")
            self.assertEqual(report["request_origin"], "NASA_HTTP")
            published["timelines_by_site"][config["sites"][0]["site_id"]][0]["sun_vector"][
                "elevation_deg"
            ] += 0.01
            self.assertEqual(check_horizons(config)["status"], "DIFFERENCES_REQUIRE_REVIEW")

    @unittest.skipUnless(
        (ROOT / "raw/nac_reference/NAC_DTM_SHACKRDGE02.TIF").exists(),
        "Local camera reference not installed",
    )
    def test_camera_reference_reports_partial_coverage_and_shared_registration(self):
        config = json.loads((ROOT / "config/sites_config.json").read_text())
        report = compare_camera_terrain(
            config, ROOT / "raw/site01_official.tif", ROOT / "raw/nac_reference", 50
        )
        self.assertFalse(report["is_fully_independent"])
        self.assertFalse(report["is_landing_safety_validated"])
        self.assertFalse(report["is_horizon_validated"])
        self.assertEqual([s["accepted_slope_samples"] for s in report["sites"].values()], [15, 240])
        self.assertEqual(
            [s["reference_available_at_site"] for s in report["sites"].values()], [False, True]
        )
        for site in report["sites"].values():
            self.assertEqual(site["status"], "PARTIAL_REFERENCE_COVERAGE")
            self.assertLess(site["slope_coverage_pct"], 100)


if __name__ == "__main__":
    unittest.main()
