"""Publish display context from verified native 5m NASA mosaic crops; no science replacement."""

import io
import json

import numpy as np
import rasterio
from build_local_regions import register
from build_site_telemetry import json_bytes
from fetch_horizons import ROOT
from PIL import Image
from rasterio.enums import Resampling
from rasterio.windows import from_bounds
from validate_science import verified_receipt


def encode_heightmap(heights):
    if heights.ndim != 2 or not np.isfinite(heights).all():
        raise ValueError("Context heightmap must contain finite measured elevations")
    offset, maximum = float(heights.min()), float(heights.max())
    scale = (maximum - offset) / 65535 if maximum > offset else 1
    samples = np.rint((heights.astype(np.float64) - offset) / scale).astype(np.uint16)
    rgb = np.stack([samples >> 8, samples & 255, np.zeros_like(samples)], axis=-1)
    stream = io.BytesIO()
    Image.fromarray(rgb.astype(np.uint8)).save(stream, format="WEBP", lossless=True, method=6)
    with Image.open(io.BytesIO(stream.getvalue())) as image:
        decoded = np.asarray(image).astype(np.uint16)
        if not np.array_equal(decoded[..., 0] * 256 + decoded[..., 1], samples):
            raise ValueError("Packed context heightmap changed during lossless export")
    return stream.getvalue(), {
        "bits_per_sample": 16,
        "packing": "RG_MSB_LSB",
        "lossy": False,
        "meters_per_unit": scale,
        "offset_m": offset,
        "nodata_value": None,
    }


def build():
    public = ROOT.parent / "public"
    manifest_path = public / "data/manifest.json"
    manifest = json.loads(manifest_path.read_text())
    regions = json.loads((ROOT / "config/local_regions.json").read_text())["regions"]
    prepared = []
    for region in regions:
        slug = region["id"].lower()
        path = ROOT / f"raw/wide_regions/{slug}_context_5m.tif"
        receipt = verified_receipt(path)
        primary_receipt = verified_receipt(ROOT / "raw" / region["dem_file"])
        if receipt.get("source_grid_resolution_m") != 5:
            raise ValueError("Context must be cropped from the native 5m grid")
        with rasterio.open(path) as source:
            if source.res != (5, 5) or (source.width, source.height) != (8000, 8000):
                raise ValueError("Expected a native 40x40km crop, without resampling")
            values = source.read(1, out_shape=(2048, 2048), resampling=Resampling.nearest)
            bounds = dict(zip(["left", "bottom", "right", "top"], source.bounds))
            with rasterio.open(ROOT / "raw" / region["dem_file"]) as primary:
                window = from_bounds(*primary.bounds, source.transform)
                if not source.window_transform(window).almost_equals(primary.transform):
                    raise ValueError("Context and original DEM grids do not align")
                overlap = source.read(1, window=window)
                original = primary.read(1)
                if overlap.shape != original.shape:
                    raise ValueError("Context does not fully contain the original DEM")
                difference = overlap.astype(np.float64) - original
                comparison = {
                    "primary_source_url": primary_receipt["source_url"],
                    "primary_sha256": primary_receipt["sha256"],
                    "rms_difference_m": float(np.sqrt(np.mean(difference**2))),
                    "mean_difference_m": float(difference.mean()),
                    "max_absolute_difference_m": float(np.abs(difference).max()),
                    "is_independent_validation": False,
                    "note": "Mosaic was realigned and blended by NASA; original inner DEM retained",
                }
        payload, encoding = encode_heightmap(values)
        texture_path = f"textures/{slug}_context_heightmap.webp"
        metadata = {
            "schema_version": 1,
            "region_id": region["id"],
            "region_name": region["name"],
            "analysis_scope": (
                "DISPLAY_CONTEXT_ONLY; horizon analysis remains the primary 16x16km DEM"
            ),
            "reference_frame": "MOON_ME_DE421",
            "reference_radius_m": 1737400,
            "source_resolution_m": 5,
            "source_grid_pixels": [8000, 8000],
            "area_width_km": 40,
            "area_height_km": 40,
            "bounds_m": bounds,
            "heightmap_texture": f"/{texture_path}",
            "heightmap_resolution_px": [2048, 2048],
            "height_encoding": encoding,
            "min_elevation_m": float(values.min()),
            "max_elevation_m": float(values.max()),
            "vertical_exaggeration": 1,
            "render_segments": 640,
            "render_vertex_spacing_m": 62.5,
            "processing": (
                "Native NASA mosaic crop; nearest 2048px visual sampling; "
                "lossless RG-packed 16-bit heights"
            ),
            "visual_note": (
                "Projected flat patch; simplified display mesh, not a native 5m vertex grid. "
                "Original inner DEM retained; display seam matched to its edge."
            ),
            "source_note": (
                "NASA mosaic includes interpolation-filled pixels. "
                "No additional filling; LOLA return-count confidence is not assessed here."
            ),
            "sources": [receipt],
            "overlap_with_primary_dem": comparison,
        }
        for name, content, units in [
            (texture_path, payload, "RG-packed elevation; decoded m"),
            (f"data/{slug}_context.json", json_bytes(metadata), "m; km"),
        ]:
            prepared.append((name, content, receipt, metadata["processing"], units))
        print(region["id"], "Prepared 40km context", len(payload), "bytes", flush=True)
    for name, content, receipt, processing, units in prepared:
        register(manifest, name, content, receipt, processing, units)
    manifest_path.write_bytes(json_bytes(manifest))


if __name__ == "__main__":
    build()
