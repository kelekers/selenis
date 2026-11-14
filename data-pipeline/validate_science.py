"""Reproduce live Horizons checks and confidence-filtered camera/laser terrain comparisons."""

import argparse
import hashlib
import json
import math
import os
import tempfile
from pathlib import Path

import numpy as np
import rasterio
from build_site_telemetry import json_bytes, validate_config, validate_timeline
from fetch_horizons import ROOT, load_ephemeris, utc
from process_dem import LocalTerrain
from rasterio.warp import transform

NAC_PAGE = "https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_SHACKRDGE02"


def verified_receipt(path):
    receipt_path = path.with_name(path.name + ".provenance.json")
    if not receipt_path.exists():
        receipt_path = path.with_suffix(".provenance.json")
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    if hashlib.sha256(path.read_bytes()).hexdigest() != receipt["sha256"]:
        raise ValueError(f"Reference checksum mismatch: {path.name}")
    utc(receipt["retrieved_at"])
    return receipt


def differences(calculated, reference):
    if np.shape(calculated) != np.shape(reference):
        raise ValueError("Comparison needs equal finite samples")
    if len(calculated) == 0:
        return None
    delta = np.asarray(calculated) - np.asarray(reference)
    if not np.isfinite(delta).all():
        raise ValueError("Comparison needs equal finite samples")
    return {
        "sample_count": len(delta),
        "bias": float(delta.mean()),
        "mae": float(np.abs(delta).mean()),
        "rmse": float(np.sqrt(np.mean(delta**2))),
        "max_absolute_difference": float(np.abs(delta).max()),
    }


def sample_confident(data, confidence, affine, x, y):
    """Bilinear sampling requires four finite, successfully correlated camera pixels."""
    cols, rows = ~affine @ (np.asarray(x), np.asarray(y))
    cols, rows = cols - 0.5, rows - 0.5
    cc, rr = np.floor(cols).astype(int), np.floor(rows).astype(int)
    valid = (rr >= 0) & (cc >= 0) & (rr + 1 < data.shape[0]) & (cc + 1 < data.shape[1])
    r, c = np.clip(rr, 0, data.shape[0] - 2), np.clip(cc, 0, data.shape[1] - 2)
    dr, dc = rows - rr, cols - cc
    result = np.zeros(len(rr))
    for dy, dx, weight in [
        (0, 0, (1 - dr) * (1 - dc)),
        (1, 0, dr * (1 - dc)),
        (0, 1, (1 - dr) * dc),
        (1, 1, dr * dc),
    ]:
        heights = data[r + dy, c + dx]
        valid &= np.isfinite(heights) & confidence[r + dy, c + dx]
        result += weight * np.where(np.isfinite(heights), heights, 0)
    return np.where(valid, result, np.nan)


def compare_camera_terrain(config, dem_path, nac_dir, radius_m):
    terrain = LocalTerrain(dem_path)
    paths = [
        nac_dir / name
        for name in [
            "NAC_DTM_SHACKRDGE02.TIF",
            "NAC_DTM_SHACKRDGE02_CONF.TIF",
            "NAC_DTM_SHACKRDGE02_CONF.IMG",
            "NAC_DTM_SHACKRDGE02_README.TXT",
        ]
    ]
    receipts = [verified_receipt(path) for path in paths]
    notes = paths[3].read_text(encoding="utf-8")
    if any(
        value not in notes
        for value in [
            "This is version 2",
            "27.0 different LOLA orbit tracks",
            "precision error from SOCET SET is 3.41 m",
            "Value range of successful correlations",
        ]
    ):
        raise ValueError(
            "Review updated NAC registration/confidence documentation before comparison"
        )
    with (
        rasterio.open(paths[0]) as nac,
        rasterio.open(paths[1]) as display_conf,
        rasterio.open(paths[2]) as raw_conf,
    ):
        if (
            nac.shape != display_conf.shape
            or nac.transform != display_conf.transform
            or nac.crs != display_conf.crs
        ):
            raise ValueError("Camera DTM and GeoTIFF confidence grids differ")
        # PDS codes are authoritative. Verify the browse export's 1:1 successful-correlation mask.
        codes = raw_conf.read(1)
        good = np.isin(codes, [10, 11, 12, 13, 14])
        if good.shape != nac.shape or not np.array_equal(
            good, np.isin(display_conf.read(1), [179, 204, 229, 255])
        ):
            raise ValueError("PDS confidence and GeoTIFF companion masks disagree")
        data = nac.read(1, masked=True, out_dtype="float64").filled(np.nan)
        sites = {}
        for site in config["sites"]:
            coordinates = site["coordinates"]
            row, col = terrain.pixel_coordinates(
                coordinates["latitude_deg"], coordinates["longitude_deg"]
            )
            row, col = float(row[0]), float(col[0])
            pixels = radius_m / terrain.pixel_size
            if (
                min(row, col, terrain.data.shape[0] - 1 - row, terrain.data.shape[1] - 1 - col)
                <= pixels + 1
            ):
                raise ValueError("Requested comparison footprint leaves Site01")
            rr, cc = np.mgrid[
                math.floor(row - pixels) : math.ceil(row + pixels) + 1,
                math.floor(col - pixels) : math.ceil(col + pixels) + 1,
            ]
            chosen = (rr - row) ** 2 + (cc - col) ** 2 <= pixels**2
            rr, cc = rr[chosen], cc[chosen]
            x, y = terrain.affine @ (cc + 0.5, rr + 0.5)

            def sample(dx, dy):
                nx, ny = transform(terrain.crs, nac.crs, (x + dx).tolist(), (y + dy).tolist())
                return sample_confident(data, good, nac.transform, nx, ny)

            center = sample(0, 0)
            step = terrain.pixel_size
            east, west, north, south = [
                sample(dx, dy) for dx, dy in [(step, 0), (-step, 0), (0, step), (0, -step)]
            ]
            slopes = np.degrees(
                np.arctan(np.hypot((east - west) / (2 * step), (north - south) / (2 * step)))
            )
            height_valid = np.isfinite(center)
            slope_valid = height_valid & np.isfinite(slopes)
            sx, sy = transform(
                terrain.geographic,
                nac.crs,
                [coordinates["longitude_deg"]],
                [coordinates["latitude_deg"]],
            )
            site_height = sample_confident(data, good, nac.transform, sx, sy)[0]
            sites[site["site_id"]] = {
                "reference_available_at_site": bool(np.isfinite(site_height)),
                "reference_site_elevation_m": float(site_height)
                if np.isfinite(site_height)
                else None,
                "status": "PARTIAL_REFERENCE_COVERAGE"
                if not slope_valid.all()
                else "COMPARISON_REPORTED",
                "radius_m": radius_m,
                "footprint_samples": len(rr),
                "accepted_height_samples": int(height_valid.sum()),
                "accepted_slope_samples": int(slope_valid.sum()),
                "height_coverage_pct": 100 * float(height_valid.mean()),
                "slope_coverage_pct": 100 * float(slope_valid.mean()),
                "elevation_difference_m": differences(
                    terrain.data[rr, cc][height_valid], center[height_valid]
                ),
                "slope_difference_deg": differences(
                    terrain.slopes[rr, cc][slope_valid], slopes[slope_valid]
                ),
            }
    return {
        "status": "CROSS_SENSOR_PARTIAL_VALIDATION",
        "reference_product": "LROC_NAC_SHACKRDGE02_V2",
        "reference_page": NAC_PAGE,
        "is_fully_independent": False,
        "is_horizon_validated": False,
        "is_landing_safety_validated": False,
        "dependence": (
            "Stereo-camera heights, registered to 27 LOLA tracks; error analysis uses Site01 XYZI"
        ),
        "reference_reported_precision_m": 3.41,
        "reference_lola_registration_rmse_m": 1.06,
        "confidence_policy": (
            "PDS codes 10-14 only; all four bilinear neighbors required; no filling holes"
        ),
        "method": (
            "Same Site01 pixel centers; camera resampled to 5 m grid; "
            "central-difference slope; no fitted offset or alignment"
        ),
        "acceptance_threshold": None,
        "sources": receipts,
        "sites": sites,
    }


def check_horizons(config, refresh=False, user_agent=None):
    ephemeris, sources = load_ephemeris(
        ROOT / "inputs",
        config,
        config["mission_window"],
        refresh=refresh,
        user_agent=user_agent,
        cache=ROOT / "cache/live_horizons_validation/responses",
    )
    published = json.loads((ROOT.parent / "public/data/ephemeris_vectors.json").read_text())
    results = {}
    for site in config["sites"]:
        sid = site["site_id"]
        actual, expected = ephemeris["timelines_by_site"][sid], published["timelines_by_site"][sid]
        validate_timeline(actual, config["mission_window"], sid)
        validate_timeline(expected, config["mission_window"], sid)
        diffs = {
            target + "." + field: max(
                abs(a[target][field] - b[target][field]) for a, b in zip(actual, expected)
            )
            for target in ["sun_vector", "earth_vector"]
            for field in actual[0][target]
        }
        results[sid] = {"sample_count": len(actual), "max_absolute_differences": diffs}
    all_equal = all(
        value == 0
        for site in results.values()
        for value in site["max_absolute_differences"].values()
    )
    is_http = all(source["retrieval_method"] == "HORIZONS_HTTP" for source in sources)
    return {
        "status": "MATCHES_PUBLISHED_AT_EXPORTED_PRECISION"
        if all_equal
        else "DIFFERENCES_REQUIRE_REVIEW",
        "request_origin": "NASA_HTTP" if is_http else "LOCAL_PACKAGE",
        "run_mode": "LIVE_HTTP" if refresh else "CACHE_REPLAY",
        "last_live_retrieved_at": max(s["retrieved_at"] for s in sources) if is_http else None,
        "sources": sources,
        "sites": results,
    }


def publish_report(report, directory):
    payload = json_bytes(report)
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if manifest["schema_version"] != 1 or manifest["status"] != "ready":
        raise ValueError("Validation report requires an existing ready v1 asset manifest")
    path = "data/science_validation.json"
    sources = report["horizons_refresh"]["sources"] + report["terrain_cross_sensor"]["sources"]
    manifest["assets"] = [asset for asset in manifest["assets"] if asset["path"] != path]
    manifest["assets"].append(
        {
            "path": path,
            "source_url": NAC_PAGE,
            "dataset_id": "SELENIS_SCIENCE_CHECKS_V1",
            "retrieved_at": max(source["retrieved_at"] for source in sources),
            "processing": (
                "validate_science.py v1; live Horizons acquisition/cache replay; "
                "confidence-filtered cross-sensor elevation/slope comparison. "
                "Shared LOLA registration and partial coverage prevent full independence. "
                "No vehicle safety certification or horizon validation."
            ),
            "units": "UTC; elevation differences m; slope/angle differences deg; coverage percent",
            "reference_frame": (
                "Lunar sphere 1737400 m; lunar geodetic Horizons AIRLESS; native projected grids"
            ),
            "sources": sources,
            "sha256": hashlib.sha256(payload).hexdigest(),
        }
    )
    pending = []
    try:
        for name, data in [
            ("science_validation.json", payload),
            ("manifest.json", json_bytes(manifest)),
        ]:
            with tempfile.NamedTemporaryFile(
                dir=directory, prefix=".science-", delete=False
            ) as stream:
                temporary = Path(stream.name)
                pending.append((temporary, directory / name))
                stream.write(data)
        for temporary, target in pending:
            os.replace(temporary, target)
    finally:
        for temporary, _ in pending:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=ROOT / "config/sites_config.json")
    parser.add_argument("--dem", type=Path, default=ROOT / "raw/site01_official.tif")
    parser.add_argument("--nac-dir", type=Path, default=ROOT / "raw/nac_reference")
    parser.add_argument("--radius-m", type=float, default=50)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--user-agent")
    parser.add_argument(
        "--publish", action="store_true", help="Publish report and update public manifest"
    )
    parser.add_argument("--output", type=Path, default=ROOT / "cache/science_validation.json")
    args = parser.parse_args()
    try:
        if not math.isfinite(args.radius_m) or args.radius_m < 5:
            raise ValueError("Comparison radius must be finite and >=5 m")
        config = json.loads(args.config.read_text())
        validate_config(config)
        report = {
            "schema_version": 1,
            "horizons_refresh": check_horizons(config, args.refresh, args.user_agent),
            "terrain_cross_sensor": compare_camera_terrain(
                config, args.dem, args.nac_dir, args.radius_m
            ),
            "operational_landing_safety": {
                "status": "NOT_ASSESSABLE_WITH_CURRENT_INPUTS",
                "safety_rating": None,
                "missing": [
                    "MISSION_VEHICLE_AND_CERTIFIED_LIMITS",
                    "FOOTPAD_SCALE_HAZARD_DATA",
                    "ROCK_AND_CRATER_HAZARDS",
                    "SURFACE_BEARING_AND_CONTACT_DYNAMICS",
                ],
                "reason": (
                    "Demo terrain thresholds do not specify a real spacecraft. "
                    "5 m DEM and registered stereo do not resolve footpad-scale hazards "
                    "or vehicle stability."
                ),
                "source_url": "https://ntrs.nasa.gov/citations/20250002845",
                "is_demo_screening_a_vehicle_safety_rating": False,
            },
        }
        payload = json_bytes(report)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(payload)
        if args.publish:
            publish_report(report, ROOT.parent / "public/data")
    except (ValueError, OSError, KeyError) as error:
        parser.exit(1, f"Validation failed: {error}\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
