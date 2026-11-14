import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from build_site_telemetry import (
    build_telemetry,
    compare_shift,
    export_assets,
    find_demo,
    summarize,
    summarize_window,
    validate_config,
    validate_timeline,
)
from fetch_horizons import (
    DEFAULT_WINDOW,
    ROOT,
    download,
    load_ephemeris,
    parse_response,
    query_parameters,
    query_url,
    timestamps,
)


def timeline(window, sun=1, earth=1):
    return [
        {
            "timestamp_utc": stamp,
            "sun_vector": {"azimuth_deg": 0, "elevation_deg": sun, "solar_flux_wm2": 1361},
            "earth_vector": {
                "azimuth_deg": 0,
                "elevation_deg": earth,
                "libration_lat_deg": 0,
                "libration_lon_deg": 0,
            },
        }
        for stamp in timestamps(window)
    ]


SMALL_WINDOW = {**DEFAULT_WINDOW, "end_utc": "2026-11-14T05:00:00Z"}
CSV = """API VERSION: 1.2
 Date__(UT)__HR:MN:SS, , , Elevation_(a-app), delta, Azimuth_(a-app),
$$SOE
 2026-Nov-14 00:00:00,*, , -1, 1, 123,
 2026-Nov-14 01:00:00,*, , 0, 2, 124,
$$EOE
"""


class PipelineTests(unittest.TestCase):
    def test_thresholds_and_dark_runs_at_window_edges(self):
        rows = timeline(SMALL_WINDOW)
        for row, sun, earth in zip(rows, [-1, 0, 1, 0, -1], [1, 0, -1, 1, 0]):
            row["sun_vector"]["elevation_deg"] = sun
            row["earth_vector"]["elevation_deg"] = earth
        self.assertEqual(
            summarize(rows, 1),
            {"solar_illumination_pct": 20, "dte_availability_pct": 40, "max_eclipse_hours": 2},
        )
        window = {**SMALL_WINDOW, "start_utc": "2026-11-14T01:00:00Z"}
        self.assertEqual(summarize_window(rows, window, "TEST")["max_eclipse_hours"], 2)
        with self.assertRaises(ValueError):
            summarize([], 1)

    def test_shift_preserves_duration_and_rejects_incomplete_coverage(self):
        rows = timeline(DEFAULT_WINDOW)
        window = {**DEFAULT_WINDOW, "end_utc": "2026-11-15T00:00:00Z"}
        pair = compare_shift(rows, window, "TEST")
        self.assertTrue(pair["is_available"])
        self.assertEqual(pair["windows"][1]["start_utc"], "2026-11-16T00:00:00Z")
        self.assertEqual(pair["windows"][1]["end_utc"], "2026-11-17T00:00:00Z")
        self.assertEqual(len(timestamps(pair["windows"][1])), 24)
        late = {**window, "start_utc": "2026-12-12T00:00:00Z", "end_utc": "2026-12-13T00:00:00Z"}
        self.assertFalse(compare_shift(rows, late, "TEST")["is_available"])
        self.assertIsNone(summarize_window(rows[1:], window, "TEST"))
        coarse = {**DEFAULT_WINDOW, "step_hours": 5}
        self.assertIsNone(
            find_demo({"mission_window": coarse, "timelines_by_site": {"TEST": timeline(coarse)}})
        )

    def test_timeline_validation_missing_duplicate_nonfinite_and_order(self):
        rows = timeline(SMALL_WINDOW)
        for corrupt in [rows[:-1], rows + [rows[0]], list(reversed(rows))]:
            with self.assertRaisesRegex(ValueError, "TEST/timeline/"):
                validate_timeline(corrupt, SMALL_WINDOW, "TEST")
        rows[0]["earth_vector"]["elevation_deg"] = float("nan")
        with self.assertRaisesRegex(ValueError, "TEST/earth/2026-11-14"):
            validate_timeline(rows, SMALL_WINDOW, "TEST")
        for step in [0, -1, float("nan"), True]:
            with self.assertRaises(ValueError):
                timestamps({**SMALL_WINDOW, "step_hours": step})

    def test_parser_reads_columns_by_header_and_retains_negative_elevation(self):
        rows = parse_response(CSV, "sun", "TEST")
        self.assertEqual(rows["2026-11-14T00:00:00Z"]["elevation_deg"], -1)
        self.assertEqual(rows["2026-11-14T01:00:00Z"]["solar_flux_wm2"], 340.25)
        self.assertEqual(rows["2026-11-14T00:00:00Z"]["azimuth_deg"], 123)
        duplicate = CSV.replace("2026-Nov-14 01:00:00", "2026-Nov-14 00:00:00")
        for corrupt in [
            duplicate,
            CSV.replace(" -1,", " NaN,"),
            CSV.replace("$$EOE", ""),
            CSV.replace("delta", "distance"),
            "Horizons error: invalid target",
        ]:
            with self.assertRaisesRegex(ValueError, "TEST/sun"):
                parse_response(corrupt, "sun", "TEST")
        for version in ["1.2", "1.3"]:
            self.assertEqual(
                parse_response(
                    json.dumps({"signature": {"version": version}, "result": CSV}), "sun", "TEST"
                ),
                rows,
            )
        for response in [
            {"signature": {"version": "9"}, "result": CSV},
            {"signature": {"version": "1.3"}, "error": "bad target"},
        ]:
            with self.assertRaises(ValueError):
                parse_response(json.dumps(response), "sun", "TEST")

    @patch("fetch_horizons.time.sleep")
    @patch("fetch_horizons.urlopen")
    def test_network_retries_are_bounded_and_require_contact(self, open_url, sleep):
        agent = "Selenis/0.1 (https://example.org/team)"
        open_url.side_effect = [
            HTTPError("test", 429, "rate limit", {"Retry-After": "3"}, None),
            URLError("temporary"),
            URLError("still unavailable"),
        ]
        with self.assertRaises(URLError):
            download("https://example.org", agent)
        self.assertEqual(open_url.call_count, 3)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [3, 4])
        with self.assertRaises(ValueError):
            download("https://example.org", "Selenis/0.1")
        open_url.reset_mock()
        open_url.side_effect = HTTPError("test", 400, "bad request", {}, None)
        with self.assertRaises(HTTPError):
            download("https://example.org", agent)
        self.assertEqual(open_url.call_count, 1)

    def test_public_contract(self):
        public = ROOT.parent / "public" / "data"
        ephemeris = json.loads((public / "ephemeris_vectors.json").read_text(encoding="utf-8"))
        telemetry = json.loads((public / "site_telemetry.json").read_text(encoding="utf-8"))
        for site in telemetry["sites"]:
            rows = ephemeris["timelines_by_site"][site["site_id"]]
            validate_timeline(rows, ephemeris["mission_window"], site["site_id"])
            self.assertIsNone(site["summary_metrics"]["safety_rating"])
            if telemetry["terrain_metadata"] is None:
                self.assertIsNone(site["coordinates"]["uv"])
                self.assertIsNone(site["horizon_mask_360"])
                for field in ["average_slope_deg", "max_slope_deg"]:
                    self.assertIsNone(site["summary_metrics"][field])
            else:
                self.assertFalse(telemetry["terrain_metadata"]["is_global_horizon_complete"])
                self.assertEqual(len(site["horizon_mask_360"]), 360)
                self.assertEqual(
                    [entry["azimuth_deg"] for entry in site["horizon_mask_360"]], list(range(360))
                )
                self.assertTrue(
                    all(0 <= value <= 1 for value in site["coordinates"]["uv"].values())
                )
                statuses = site["terrain_visibility_timeline"]
                for target, metric in [
                    ("sun", "solar_illumination_pct"),
                    ("earth", "dte_availability_pct"),
                ]:
                    self.assertTrue(
                        all(type(row[f"is_{target}_clear_within_dem"]) is bool for row in statuses)
                    )
                    self.assertLessEqual(
                        site["terrain_summary_metrics"][metric], site["summary_metrics"][metric]
                    )
                self.assertEqual(
                    [row["timestamp_utc"] for row in statuses],
                    [row["timestamp_utc"] for row in rows],
                )
                self.assertEqual(
                    site["terrain_summary_metrics"]["dte_availability_pct"],
                    100 * sum(row["is_earth_clear_within_dem"] for row in statuses) / len(statuses),
                )
            metrics = summarize(rows, 1)
            self.assertEqual({k: site["summary_metrics"][k] for k in metrics}, metrics)

    @unittest.skipUnless(
        (ROOT / "inputs" / "sites_config.json").exists(), "Local input package not installed"
    )
    def test_packaged_regression_equivalence_and_reproducible_export(self):
        inputs = ROOT / "inputs"
        config = json.loads((inputs / "sites_config.json").read_text())
        validate_config(config)
        broken = copy.deepcopy(config)
        broken["sites"][0]["observer_altitude_km"] += 1
        with self.assertRaisesRegex(ValueError, "observer altitude"):
            validate_config(broken)
        with (
            tempfile.TemporaryDirectory() as directory,
            patch(
                "fetch_horizons.urlopen", side_effect=AssertionError("Offline build used network")
            ),
        ):
            ephemeris, sources = load_ephemeris(
                inputs, config, DEFAULT_WINDOW, cache=Path(directory) / "cache"
            )
            for site, suffix in zip(config["sites"], ["a", "b"]):
                site_id = site["site_id"]
                supplied = json.loads((inputs / f"ephemeris_vectors_{suffix}.json").read_text())
                self.assertEqual(ephemeris["mission_window"], supplied["mission_window"])
                self.assertEqual(ephemeris["timelines_by_site"][site_id], supplied["timeline"])
                rows = ephemeris["timelines_by_site"][site_id]
                self.assertEqual(len(rows), 720)
                self.assertEqual(sum(row["sun_vector"]["elevation_deg"] > 0 for row in rows), 720)
                self.assertEqual(sum(row["earth_vector"]["elevation_deg"] > 0 for row in rows), 283)
                query = query_parameters(query_url(site, "sun", DEFAULT_WINDOW))
                self.assertEqual(query["STOP_TIME"], "'2026-12-13 23:00'")
                self.assertEqual(query["ELEV_CUT"], "'-90'")
                self.assertEqual(query["APPARENT"], "'AIRLESS'")
            telemetry = build_telemetry(config, ephemeris)
            demo = telemetry["demo_48_hours"]
            self.assertEqual([m["dte_availability_pct"] for m in demo["summary_metrics"]], [0, 100])
            output = Path(directory) / "public"
            export_assets(output, ephemeris, telemetry, sources)
            first = {p.name: p.read_bytes() for p in output.iterdir()}
            export_assets(output, ephemeris, telemetry, sources)
            self.assertEqual(first, {p.name: p.read_bytes() for p in output.iterdir()})
            self.assertLess(sum(len(value) for value in first.values()), 5_000_000)
            invalid = copy.deepcopy(ephemeris)
            invalid["timelines_by_site"][config["sites"][0]["site_id"]][0]["sun_vector"][
                "elevation_deg"
            ] = float("nan")
            with self.assertRaises(ValueError):
                export_assets(output, invalid, telemetry, sources)
            self.assertEqual(first, {p.name: p.read_bytes() for p in output.iterdir()})
            with self.assertRaisesRegex(ValueError, "missing timestamp"):
                with patch("fetch_horizons.parse_response", return_value={}):
                    load_ephemeris(inputs, config, DEFAULT_WINDOW, cache=Path(directory) / "cache")
            responses = [
                (inputs / "horizons_raw" / name).read_text(encoding="utf-8")
                for name in [
                    "libration.txt",
                    "sun_a.txt",
                    "earth_a.txt",
                    "sun_b.txt",
                    "earth_b.txt",
                ]
            ]
            cache = Path(directory) / "cache"
            with patch("fetch_horizons.download", side_effect=responses) as fetch:
                refreshed, refreshed_sources = load_ephemeris(
                    inputs, config, DEFAULT_WINDOW, refresh=True, cache=cache
                )
            self.assertEqual(fetch.call_count, 5)
            self.assertEqual(refreshed, ephemeris)
            cached, cached_sources = load_ephemeris(inputs, config, DEFAULT_WINDOW, cache=cache)
            self.assertEqual(cached, refreshed)
            self.assertEqual(cached_sources, refreshed_sources)
            self.assertTrue(all(s["retrieval_method"] == "HORIZONS_HTTP" for s in cached_sources))


if __name__ == "__main__":
    unittest.main()
