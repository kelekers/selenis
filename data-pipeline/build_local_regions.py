"""Build separate 5-m DEM regions, per-site ephemeris, and measured roughness maps."""

import argparse
import hashlib
import io
import json

import numpy as np
import rasterio
from build_site_telemetry import build_telemetry, export_assets, json_bytes, validate_config
from fetch_horizons import ROOT, load_ephemeris
from PIL import Image
from process_dem import LocalTerrain, apply_terrain, bilinear, destination
from validate_science import verified_receipt
from validate_terrain import compare_reference_slope


def block_roughness(data, pixel_size_m, footprint_m=100):
    """RMS residual after fitting a plane in each non-overlapping square block."""
    side = round(footprint_m / pixel_size_m)
    if side < 2 or not np.isclose(side * pixel_size_m, footprint_m):
        raise ValueError("Roughness footprint must contain an integer number of DEM pixels")
    if data.ndim != 2 or not np.isfinite(data).all() or any(n % side for n in data.shape):
        raise ValueError("Roughness needs finite DEM data with fully covered blocks")
    blocks = data.reshape(data.shape[0] // side, side, data.shape[1] // side, side)
    blocks = blocks.transpose(0, 2, 1, 3).astype(np.float64)
    axis = (np.arange(side) - (side - 1) / 2) * pixel_size_m
    denominator = side * np.sum(axis**2)
    mean = blocks.mean(axis=(-2, -1))
    dx = np.einsum("...ij,j->...", blocks, axis) / denominator
    dy = np.einsum("...ij,i->...", blocks, axis) / denominator
    residual = blocks - mean[..., None, None] - dx[..., None, None] * axis[None, :]
    residual -= dy[..., None, None] * axis[:, None]
    return np.sqrt(np.mean(residual**2, axis=(-2, -1)))


def prepare_config(region, path):
    original = json.loads((ROOT / "config/sites_config.json").read_text(encoding="utf-8"))
    if region["id"] == "SITE01":
        return original
    terrain = LocalTerrain(path)
    lat = region["demo_anchor"]["latitude_deg"]
    lon = region["demo_anchor"]["longitude_deg"]
    b_lat, b_lon = destination(lat, lon, 90, 500)
    sites = []
    for suffix, latitude, longitude in [("A", lat, lon), ("B", b_lat, b_lon)]:
        row, column = terrain.pixel_coordinates(float(latitude), float(longitude))
        elevation = float(bilinear(terrain.data, row, column)[0])
        sites.append(
            {
                "site_id": f"{region['site_prefix']}_{suffix}",
                "pair_group": f"{region['site_prefix']}_DELTA",
                "name": f"{region['name']} {suffix}",
                "coordinates": {
                    "latitude_deg": float(latitude),
                    "longitude_deg": float(longitude),
                    "elevation_m": elevation,
                },
                "observer_height_above_ground_m": 2,
                "observer_altitude_km": (elevation + 2) / 1000,
                "selection_basis": "DEMO_DEM_CENTRE_PAIR; NOT_A_LANDING_RECOMMENDATION",
            }
        )
    config = {**original, "sites": sites, "terrain_region": region}
    validate_config(config)
    return config


def register(manifest, path, payload, receipt, processing, units):
    manifest["assets"] = [asset for asset in manifest["assets"] if asset["path"] != path]
    manifest["assets"].append(
        {
            "path": path,
            "source_url": receipt["source_url"],
            "dataset_id": "SELENIS_LOCAL_REGIONS_V1",
            "retrieved_at": receipt["retrieved_at"],
            "processing": processing,
            "units": units,
            "reference_frame": "MOON_ME_DE421; south polar stereographic; lunar sphere R=1737400 m",
            "sources": [receipt],
            "sha256": hashlib.sha256(payload).hexdigest(),
        }
    )
    manifest["assets"].sort(key=lambda asset: asset["path"])
    target = ROOT.parent / "public" / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(payload)


def build(refresh=False, user_agent=None):
    regions = json.loads((ROOT / "config/local_regions.json").read_text())["regions"]
    output = ROOT.parent / "public/data"
    catalog = {"schema_version": 1, "default_region_id": "SITE01", "regions": []}
    receipts = []
    for region in regions:
        path = ROOT / "raw" / region["dem_file"]
        receipt = verified_receipt(path)
        if receipt["source_url"] != region["source_url"]:
            raise ValueError("DEM provenance does not match the configured region")
        receipts.append(receipt)
        config = prepare_config(region, path)
        if region["id"] != "SITE01":
            (ROOT / f"config/sites_{region['id'].lower()}.json").write_bytes(json_bytes(config))
        ephemeris, sources = load_ephemeris(
            ROOT / "inputs",
            config,
            config["mission_window"],
            refresh=refresh and region["id"] != "SITE01",
            user_agent=user_agent,
            cache=None if region["id"] == "SITE01" else ROOT / "cache" / region["id"] / "responses",
        )
        telemetry = build_telemetry(config, ephemeris)
        heightmap = apply_terrain(config, ephemeris, telemetry, path, 50)
        if region["id"] == "SITE01":
            compare_reference_slope(telemetry, path, ROOT / "raw/site01_reference_slope.tif")
        with rasterio.open(path) as source:
            roughness = block_roughness(source.read(1), source.res[0])
        slug = region["id"].lower()
        if (output / f"{slug}_context.json").exists():
            telemetry["terrain_metadata"]["context_dataset_url"] = f"/data/{slug}_context.json"
        roughness_path = f"data/{slug}_roughness.json"
        color_path = f"textures/{slug}_roughness.webp"
        telemetry["terrain_metadata"]["roughness_analysis"] = {
            "data_url": f"/{roughness_path}",
            "visual_texture": f"/{color_path}",
            "statistic": "RMS_DETRENDED_PLANE",
            "unit": "m",
            "footprint_m": [100, 100],
            "sample_layout": "NON_OVERLAPPING_SQUARE_BLOCKS; TOP_LEFT_ORIGIN",
            "color_scale_m": [0, 5],
            "color_values_above_max_are_clipped": True,
            "note": ("Map footprint differs from circular radius-50m site screening; not safety."),
        }
        prefix = None if region["id"] == "SITE01" else slug
        export_assets(output, ephemeris, telemetry, sources, heightmap, region_id=prefix)
        manifest = json.loads((output / "manifest.json").read_text())
        numeric = {
            "schema_version": 1,
            "region_id": region["id"],
            "statistic": "RMS_DETRENDED_PLANE",
            "unit": "m",
            "footprint_m": [100, 100],
            "sample_layout": "NON_OVERLAPPING_SQUARE_BLOCKS",
            "width": roughness.shape[1],
            "height": roughness.shape[0],
            "bounds_m": telemetry["terrain_metadata"]["bounds_m"],
            "values_m": np.round(roughness, 3).ravel().tolist(),
            "is_landing_safety_assessment": False,
            "rounding_note": "3 decimal storage does not imply millimetre measurement accuracy",
        }
        processing = "Detrended plane RMS on native 5m DEM; non-overlapping 100x100m blocks"
        register(
            manifest, roughness_path, json_bytes(numeric), receipt, processing, "RMS residual m"
        )
        scale = (roughness / 5).clip(0, 1)
        rgb = np.stack(
            [
                45 + scale * 185,
                91 + 180 * np.minimum(scale * 2, 1) - 196 * np.maximum(scale * 2 - 1, 0),
                130 - scale * 75,
            ],
            axis=-1,
        )
        stream = io.BytesIO()
        Image.fromarray(np.rint(rgb).clip(0, 255).astype(np.uint8)).save(
            stream,
            format="WEBP",
            lossless=True,
            method=6,
        )
        register(
            manifest,
            color_path,
            stream.getvalue(),
            receipt,
            processing + "; visual-only color scale 0..5m (higher values clipped)",
            "sRGB visualization",
        )
        (output / "manifest.json").write_bytes(json_bytes(manifest))
        catalog["regions"].append(
            {
                "id": region["id"],
                "name": region["name"],
                "telemetry_url": f"/data/{slug + '_' if prefix else ''}site_telemetry.json",
                "ephemeris_url": f"/data/{slug + '_' if prefix else ''}ephemeris_vectors.json",
                "area_width_km": telemetry["terrain_metadata"]["area_width_km"],
                "area_height_km": telemetry["terrain_metadata"]["area_height_km"],
                "resolution_m": 5,
                "demo_anchor": config["sites"][0]["coordinates"],
            }
        )
        print(
            region["id"],
            "roughness range m:",
            float(roughness.min()),
            float(roughness.max()),
            flush=True,
        )
    manifest = json.loads((output / "manifest.json").read_text())
    register(
        manifest,
        "data/local_regions.json",
        json_bytes(catalog),
        receipts[0],
        "Catalog of separately analysed 16x16km local DEM regions; no gaps filled",
        "km; m; degrees",
    )
    manifest["assets"][-1]["sources"] = receipts
    (output / "manifest.json").write_bytes(json_bytes(manifest))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Fetch Horizons for the new regions")
    parser.add_argument("--user-agent")
    args = parser.parse_args()
    try:
        build(args.refresh, args.user_agent)
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, f"Local region build failed: {error}\n")
