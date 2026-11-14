"""Build offline ephemeris with optional Site01-only terrain analysis."""

import argparse
import hashlib
import json
import os
import re
import tempfile
from datetime import timedelta
from pathlib import Path

from fetch_horizons import DEFAULT_WINDOW, ROOT, iso, load_ephemeris, number, timestamps, utc

MODEL = "Visibilitas geometris terhadap horizontal lokal 0°, tanpa koreksi medan"
TERRAIN_FIELDS = {"average_slope_deg": None, "max_slope_deg": None, "safety_rating": None}


def validate_config(config):
    ids = []
    for site in config["sites"]:
        site_id = site["site_id"]
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", site_id) or site_id in ids:
            raise ValueError(f"Invalid or duplicate site_id: {site_id}")
        ids.append(site_id)
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", site["pair_group"]) or not site["name"]:
            raise ValueError(f"{site_id}: pair_group and name required")
        coords = site["coordinates"]
        number(coords["latitude_deg"], -90, 90, site_id)
        number(coords["longitude_deg"], -180, 360, site_id)
        elevation = number(coords["elevation_m"], -1e6, 1e6, site_id)
        height = number(site["observer_height_above_ground_m"], 0, 1e6, site_id)
        altitude = number(site["observer_altitude_km"], -1e3, 1e3, site_id)
        if abs((elevation + height) / 1000 - altitude) > 1e-9:
            raise ValueError(f"{site_id}: observer altitude must equal elevation + observer height")
    if len(ids) < 2:
        raise ValueError("At least two sites are required for A/B comparison")


def validate_timeline(timeline, window, site_id):
    expected = timestamps(window)
    seen = set()
    for row in timeline:
        stamp = row["timestamp_utc"]
        utc(stamp)
        if stamp in seen:
            raise ValueError(f"{site_id}/timeline/{stamp}: duplicate timestamp")
        seen.add(stamp)
        for target in ["sun", "earth"]:
            vector = row[f"{target}_vector"]
            context = f"{site_id}/{target}/{stamp}"
            azimuth = number(vector["azimuth_deg"], 0, 360, context)
            if azimuth == 360:
                raise ValueError(f"{context}: azimuth must be < 360")
            number(vector["elevation_deg"], -90, 90, context)
        number(row["sun_vector"]["solar_flux_wm2"], 0, 1e6, f"{site_id}/sun/{stamp}")
        number(row["earth_vector"]["libration_lat_deg"], -90, 90, f"{site_id}/libration/{stamp}")
        number(row["earth_vector"]["libration_lon_deg"], -180, 180, f"{site_id}/libration/{stamp}")
    if [row["timestamp_utc"] for row in timeline] != expected:
        missing = next(
            (stamp for stamp in expected if stamp not in seen), "<order or extra sample>"
        )
        raise ValueError(f"{site_id}/timeline/{missing}: missing, extra or unordered timestamp")


def summarize(timeline, step_hours):
    if not timeline:
        raise ValueError("Cannot summarize an empty window")
    sun_count = earth_count = longest = run = 0
    for row in timeline:
        is_sun_visible = row["sun_vector"]["elevation_deg"] > 0
        sun_count += is_sun_visible
        earth_count += row["earth_vector"]["elevation_deg"] > 0
        run = 0 if is_sun_visible else run + 1
        longest = max(longest, run)
    return {
        "solar_illumination_pct": 100 * sun_count / len(timeline),
        "dte_availability_pct": 100 * earth_count / len(timeline),
        "max_eclipse_hours": longest * step_hours,
    }


def summarize_window(timeline, window, site_id):
    """Return None for incomplete coverage; never summarize a partial window."""
    stamps = set(timestamps(window))
    selected = [row for row in timeline if row["timestamp_utc"] in stamps]
    if {row["timestamp_utc"] for row in selected} != stamps:
        return None
    validate_timeline(selected, window, site_id)
    return summarize(selected, window["step_hours"])


def compare_shift(timeline, window, site_id):
    shifted = {
        "start_utc": iso(utc(window["start_utc"]) + timedelta(hours=48)),
        "end_utc": iso(utc(window["end_utc"]) + timedelta(hours=48)),
        "step_hours": window["step_hours"],
    }
    first = summarize_window(timeline, window, site_id)
    second = summarize_window(timeline, shifted, site_id)
    return {
        "is_available": first is not None and second is not None,
        "windows": [window, shifted],
        "summary_metrics": [first, second],
    }


def find_demo(ephemeris):
    mission = ephemeris["mission_window"]
    if 24 % mission["step_hours"] or 48 % mission["step_hours"]:
        return None
    site_id, timeline = next(iter(ephemeris["timelines_by_site"].items()))
    best, change = None, -1
    for stamp in timestamps(mission):
        window = {
            "start_utc": stamp,
            "end_utc": iso(utc(stamp) + timedelta(hours=24)),
            "step_hours": mission["step_hours"],
        }
        pair = compare_shift(timeline, window, site_id)
        if not pair["is_available"]:
            continue
        delta = abs(
            pair["summary_metrics"][1]["dte_availability_pct"]
            - pair["summary_metrics"][0]["dte_availability_pct"]
        )
        if delta > change:
            best, change = {"site_id": site_id, **pair}, delta
    return best


def build_telemetry(config, ephemeris):
    window = ephemeris["mission_window"]
    if set(ephemeris["timelines_by_site"]) != {site["site_id"] for site in config["sites"]}:
        raise ValueError("Site IDs must match timeline keys exactly")
    sites = []
    for site in config["sites"]:
        timeline = ephemeris["timelines_by_site"][site["site_id"]]
        validate_timeline(timeline, window, site["site_id"])
        sites.append(
            {
                "site_id": site["site_id"],
                "pair_group": site["pair_group"],
                "name": site["name"],
                "coordinates": {**site["coordinates"], "uv": None},
                "summary_metrics": {**summarize(timeline, window["step_hours"]), **TERRAIN_FIELDS},
                "safety_assessment": {
                    "status": "NOT_ASSESSED",
                    "reason": (
                        "Spesifikasi wahana, batas slope, toleransi batu dan kekasaran "
                        "belum ditetapkan. DEM 5 m belum cukup untuk menilai bahaya "
                        "di bawah resolusinya; slope saja tidak menentukan keamanan pendaratan."
                    ),
                },
                "horizon_mask_360": None,
            }
        )
    return {
        "terrain_metadata": None,
        "visibility_model": MODEL,
        "mission_window": window,
        "sites": sites,
        "demo_48_hours": find_demo(ephemeris),
    }


def json_bytes(value):
    return (
        json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n"
    ).encode("utf-8")


def export_assets(output, ephemeris, telemetry, sources, heightmap=None):
    payloads = {
        "ephemeris_vectors.json": json_bytes(ephemeris),
        "site_telemetry.json": json_bytes(telemetry),
    }
    if heightmap is not None:
        payloads["site01_heightmap.webp"] = heightmap
    if sum(map(len, payloads.values())) >= 5_000_000:
        raise ValueError("Combined telemetry exceeds the 5 MB data budget")
    manifest_path = output / "manifest.json"
    manifest = (
        json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest_path.exists()
        else {"schema_version": 1, "assets": []}
    )
    paths = {f"data/{name}" for name in payloads if name.endswith(".json")}
    if heightmap is not None:
        paths.add("textures/site01_heightmap.webp")
    manifest["assets"] = [asset for asset in manifest["assets"] if asset["path"] not in paths]
    for name, payload in payloads.items():
        terrain = telemetry.get("terrain_metadata")
        is_terrain_asset = terrain is not None and name != "ephemeris_vectors.json"
        asset_sources = sources
        if is_terrain_asset:
            asset_sources = [
                *sources,
                {
                    "url": terrain["source_url"],
                    "sha256": terrain["source_sha256"],
                    "retrieved_at": terrain.get(
                        "source_retrieved_at_utc", terrain["source_file_modified_at_utc"]
                    ),
                    "retrieval_method": terrain.get(
                        "source_retrieval_method", "LOCAL_FILE_MTIME_NOT_HTTP_RETRIEVAL"
                    ),
                },
            ]
            validation = terrain.get("validation")
            if name == "site_telemetry.json" and validation is not None:
                asset_sources.append(
                    {
                        "url": validation["source_url"],
                        "sha256": validation["reference_sha256"],
                        "hash_scope": validation["reference_hash_scope"],
                        "retrieved_at": validation["retrieved_at"],
                        "retrieval_method": validation["retrieval_method"],
                        "source_window_pixels": validation["source_window_pixels"],
                    }
                )
        manifest["assets"].append(
            {
                "path": "textures/site01_heightmap.webp"
                if name.endswith(".webp")
                else f"data/{name}",
                "source_url": terrain["source_url"]
                if name.endswith(".webp")
                else sources[0]["url"],
                "dataset_id": "SELENIS_SITE01_LOCAL_DEM_V1"
                if is_terrain_asset
                else "SELENIS_HORIZONS_NO_DEM_V1",
                "retrieved_at": max(source["retrieved_at"] for source in asset_sources),
                "processing": (
                    "fetch_horizons.py + build_site_telemetry.py v1; observer AIRLESS, "
                    "local horizontal 0 degrees; fixed-step [start,end); no DEM. "
                    "Full query URLs and response checksums in sources; retrieval_method "
                    "distinguishes local package receipt from NASA HTTP retrieval."
                ),
                "units": (
                    "UTC; angles deg; elevation m; flux W/m^2 normal to rays; "
                    "percentages 0-100; duration hours"
                ),
                "reference_frame": (
                    "Horizons lunar geodetic (mean Earth of DE421); reference sphere radius "
                    "1737.4 km; east-positive longitude, azimuth clockwise from local north. "
                    "Exported coordinates retain signed input longitude. "
                    "-Z north, +X east, +Y zenith."
                ),
                "sources": asset_sources,
                "sha256": hashlib.sha256(payload).hexdigest(),
            }
        )
        if is_terrain_asset:
            manifest["assets"][-1]["processing"] = (
                "process_dem.py v1; native DEM slope, radius 50 m by default; "
                "great-circle rays at 1 deg azimuth and half-pixel distance steps; "
                "bilinear height sampling; spherical ECEF local elevation; "
                "observer height from config. Minimum visibility threshold 0 deg; no horizon dip. "
                "Local DEM only, external blockers unknown; baseline horizontal metrics retained. "
                "Heightmap is downsampled 8-bit lossless WebP for visualization only. "
                "Parameters, CRS and source checksum in terrain_metadata."
            )
    manifest["status"] = "ready"
    payloads["manifest.json"] = json_bytes(manifest)
    # Validate and stage every file before replacing assets; publish the manifest last.
    output.mkdir(parents=True, exist_ok=True)
    staged = []
    try:
        for name, payload in payloads.items():
            if name.endswith(".json"):
                json.loads(payload)
            destination = (output.parent / "textures" if name.endswith(".webp") else output) / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                dir=destination.parent, prefix=".selenis-", delete=False
            ) as stream:
                staged.append((Path(stream.name), destination))
                stream.write(payload)
        for temporary, destination in staged:
            os.replace(temporary, destination)
    finally:
        for temporary, _ in staged:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inputs", type=Path, default=ROOT / "inputs")
    parser.add_argument(
        "--config",
        type=Path,
        help="Site configuration; local inputs override the tracked config fallback",
    )
    parser.add_argument("--output", type=Path, default=ROOT.parent / "public" / "data")
    parser.add_argument("--start-utc")
    parser.add_argument("--end-utc")
    parser.add_argument("--step-hours", type=float)
    parser.add_argument(
        "--dem", type=Path, help="Optional local Site01 GeoTIFF; no regional DEM required"
    )
    parser.add_argument("--slope-radius-m", type=float, default=50)
    parser.add_argument(
        "--reference-slope",
        type=Path,
        help="Optional official Site01 slope raster for implementation cross-check",
    )
    parser.add_argument(
        "--refresh", action="store_true", help="Explicitly request new Horizons responses"
    )
    parser.add_argument("--user-agent", help="Selenis/version plus real team contact URL or email")
    args = parser.parse_args()
    try:
        config_path = args.config or args.inputs / "sites_config.json"
        if args.config is None and not config_path.exists():
            config_path = ROOT / "config" / "sites_config.json"
        config = json.loads(config_path.read_text(encoding="utf-8"))
        validate_config(config)
        window = {**DEFAULT_WINDOW, **config.get("mission_window", {})}
        for name in ["start_utc", "end_utc", "step_hours"]:
            if getattr(args, name) is not None:
                window[name] = getattr(args, name)
        timestamps(window)
        if args.reference_slope and not args.dem:
            raise ValueError("--reference-slope requires --dem")
        ephemeris, sources = load_ephemeris(
            args.inputs, config, window, args.refresh, args.user_agent
        )
        telemetry = build_telemetry(config, ephemeris)
        heightmap = None
        if args.dem:
            from process_dem import apply_terrain

            heightmap = apply_terrain(config, ephemeris, telemetry, args.dem, args.slope_radius_m)
            if args.reference_slope:
                from validate_terrain import compare_reference_slope

                compare_reference_slope(telemetry, args.dem, args.reference_slope)
        export_assets(args.output, ephemeris, telemetry, sources, heightmap)
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, f"Build failed: {error}\n")
    print(MODEL)
    for site in telemetry["sites"]:
        print(
            site["site_id"],
            len(ephemeris["timelines_by_site"][site["site_id"]]),
            site["summary_metrics"],
        )
    print("Demo +48 hours:", json.dumps(telemetry["demo_48_hours"], ensure_ascii=False))
    if args.dem:
        for site in telemetry["sites"]:
            print(
                "LOCAL_DEM_ONLY",
                site["site_id"],
                site["terrain_summary_metrics"],
                site["horizon_coverage"],
            )


if __name__ == "__main__":
    main()
