"""Build an offline hemisphere overview; local Site01 science assets remain unchanged."""

import argparse
import hashlib
import io
import json
from pathlib import Path

import numpy as np
from build_site_telemetry import json_bytes
from fetch_horizons import ROOT
from PIL import Image
from process_dem import RADIUS_M
from validate_science import verified_receipt


def sample_overview(heights, width=1025, height=513):
    """Sample a southern, pixel-centred grid onto a periodic geographic vertex grid."""
    if heights.ndim != 2 or min(heights.shape) < 2 or not np.isfinite(heights).all():
        raise ValueError("Overview needs a finite southern hemisphere elevation raster")
    if not 3 <= width <= 1025 or not 3 <= height <= 513:
        raise ValueError("Invalid overview vertex dimensions")
    rows = np.linspace(-0.5, heights.shape[0] - 0.5, height).clip(0, heights.shape[0] - 1)
    columns = np.linspace(-0.5, heights.shape[1] - 0.5, width) % heights.shape[1]
    r, c = rows.astype(int), columns.astype(int)
    rr, cc = np.minimum(r + 1, heights.shape[0] - 1), (c + 1) % heights.shape[1]
    dy, dx = (rows - r)[:, None], (columns - c)[None, :]
    values = (
        (1 - dy) * (1 - dx) * heights[r[:, None], c]
        + dy * (1 - dx) * heights[rr[:, None], c]
        + (1 - dy) * dx * heights[r[:, None], cc]
        + dy * dx * heights[rr[:, None], cc]
    )
    # A single geometric pole cannot have different heights for each longitude.
    values[-1, :] = heights[-1].mean()
    values[:, -1] = values[:, 0]
    return np.round(values, 1)


def build(inputs, output):
    dem, label = inputs / "ldem_16.img", inputs / "ldem_16.lbl"
    receipts = [verified_receipt(path) for path in [dem, label]]
    text = label.read_text(encoding="utf-8")
    for declaration in [
        'PRODUCT_ID                = "LDEM_16"',
        "SCALING_FACTOR        = 0.5",
        "SAMPLE_TYPE           = LSB_INTEGER",
        "MEAN EARTH/POLAR AXIS OF DE421",
    ]:
        if declaration not in text:
            raise ValueError("Review changed LDEM_16 label before rebuilding")
    if dem.stat().st_size != 2880 * 5760 * 2:
        raise ValueError("Unexpected LDEM_16 byte count")
    raw = np.memmap(dem, dtype="<i2", mode="r", shape=(2880, 5760))
    if raw.min() < -18150 or raw.max() > 21580:
        raise ValueError("LDEM_16 contains samples outside the documented range")
    south = np.concatenate([raw[1440:, 2880:], raw[1440:, :2880]], axis=1) * 0.5
    values = sample_overview(south)
    metadata = {
        "schema_version": 1,
        "region_name": "Belahan selatan Bulan",
        "coverage": {"latitude_deg": [-90, 0], "longitude_deg": [-180, 180]},
        "reference_frame": "MOON_ME_DE421",
        "reference_radius_m": RADIUS_M,
        "elevation_unit": "m",
        "source_grid_pixels_per_degree": 16,
        "source_meridional_spacing_m": float(np.pi * RADIUS_M / 180 / 16),
        "grid": {
            "width": values.shape[1],
            "height": values.shape[0],
            "registration": "GEOGRAPHIC_VERTICES",
            "longitude_start_deg": -180,
            "longitude_end_deg": 180,
            "latitude_start_deg": 0,
            "latitude_end_deg": -90,
            "elevations_m": values.ravel().tolist(),
        },
        "processing": (
            "Southern half cropped; longitude reordered without interpolation; bilinear vertex "
            "sampling rounded to 0.1 m, periodic seam, last native row mean at pole. "
            "Boundary sampling clamped to nearest available latitude centre."
        ),
        "analysis_scope": (
            "OVERVIEW_ONLY; detailed analysis is limited to the separate local regions"
        ),
        "detail_dataset": "/data/site_telemetry.json",
        "sources": receipts,
        "albedo_texture": None,
    }
    payloads = {}
    texture = inputs / "lroc_color_16bit_srgb_4k.tif"
    if not texture.exists():
        texture = inputs / "lroc_color_2k.jpg"
    texture_receipt = None
    if texture.exists():
        texture_receipt = verified_receipt(texture)
        with Image.open(texture) as image:
            if image.size not in [(2048, 1024), (4096, 2048)]:
                raise ValueError("Expected a 2k or 4k SVS global visual map")
            texture_size = image.width // 1024
            stream = io.BytesIO()
            image.convert("RGB").save(stream, format="WEBP", quality=90, method=6)
        texture_path = f"textures/moon_albedo_{texture_size}k.webp"
        payloads[texture_path] = stream.getvalue()
        metadata["albedo_texture"] = f"/{texture_path}"
        metadata["visual_texture_note"] = (
            "NASA SVS 4720 aesthetic map; polar fill and image processing; not science input"
        )
        metadata["visual_texture_source"] = texture_receipt
    payloads["data/south_hemisphere.json"] = json_bytes(metadata)
    manifest_path = output / "data/manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("status") != "ready" or manifest.get("schema_version") != 1:
        raise ValueError("Build the existing site dataset before adding the hemisphere overview")
    assets = [asset for asset in manifest["assets"] if asset["path"] not in payloads]
    for path, payload in payloads.items():
        if len(payload) > 5_000_000:
            raise ValueError("Hemisphere asset exceeds the 5 MB budget")
        sources = [texture_receipt] if path.endswith(".webp") else receipts
        assets.append(
            {
                "path": path,
                "source_url": sources[0]["source_url"],
                "dataset_id": "NASA_SVS_4720_VISUAL"
                if path.endswith(".webp")
                else "LOLA_LDEM_16_V3_1",
                "retrieved_at": max(source["retrieved_at"] for source in sources),
                "processing": "SVS color map to visual-only WebP quality 90"
                if path.endswith(".webp")
                else metadata["processing"],
                "units": "sRGB, visual only"
                if path.endswith(".webp")
                else "elevation m; angles deg",
                "reference_frame": "MOON_ME_DE421; east-positive longitude; lunar radius 1737400 m",
                "sources": sources,
                "sha256": hashlib.sha256(payload).hexdigest(),
            }
        )
    for path, payload in payloads.items():
        destination = output / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(payload)
    manifest["assets"] = sorted(assets, key=lambda asset: asset["path"])
    manifest_path.write_bytes(json_bytes(manifest))
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inputs", type=Path, default=ROOT / "raw/lola_global_16ppd")
    parser.add_argument("--output", type=Path, default=ROOT.parent / "public")
    args = parser.parse_args()
    try:
        result = build(args.inputs, args.output)
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, f"Hemisphere build failed: {error}\n")
    print(f"Built {result['grid']['width']}x{result['grid']['height']} hemisphere overview")


if __name__ == "__main__":
    main()
