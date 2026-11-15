"""Fetch only native 40km windows from NASA's 87S 5m mosaic using HTTP ranges."""

import hashlib
import json
from datetime import datetime, timezone

import numpy as np
import rasterio
from fetch_horizons import ROOT
from rasterio.windows import Window, from_bounds
from validate_science import verified_receipt

SOURCE_URL = "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/87S/ldem_87s_5mpp.tif"


def fetch():
    public = ROOT.parent / "public"
    catalog = json.loads((public / "data/local_regions.json").read_text())
    output = ROOT / "raw/wide_regions"
    output.mkdir(parents=True, exist_ok=True)
    with (
        rasterio.Env(
            GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
            CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
            GDAL_HTTP_TIMEOUT="60",
            GDAL_HTTP_MAX_RETRY="3",
            GDAL_HTTP_RETRY_DELAY="2",
            GDAL_CACHEMAX=256 * 1024 * 1024,
            CPL_VSIL_CURL_CACHE_SIZE=128 * 1024 * 1024,
            GDAL_NUM_THREADS="4",
        ),
        rasterio.open(SOURCE_URL) as source,
    ):
        if source.res != (5, 5) or (source.width, source.height, source.count) != (40000, 40000, 1):
            raise ValueError("NASA mosaic grid changed; review before downloading")
        for region in catalog["regions"]:
            path = output / f"{region['id'].lower()}_context_5m.tif"
            if path.exists():
                receipt = verified_receipt(path)
                if receipt["source_url"] != SOURCE_URL:
                    raise ValueError("Existing context source differs; refusing to overwrite")
                print("Retained verified", path.name, flush=True)
                continue
            telemetry = json.loads((public / region["telemetry_url"].lstrip("/")).read_text())
            bounds = telemetry["terrain_metadata"]["bounds_m"]
            x = (bounds["left"] + bounds["right"]) / 2
            y = (bounds["top"] + bounds["bottom"]) / 2
            window = from_bounds(x - 20000, y - 20000, x + 20000, y + 20000, source.transform)
            window = window.round_offsets().round_lengths()
            if (
                window.width != 8000
                or window.height != 8000
                or min(window.col_off, window.row_off) < 0
                or (window.col_off + 8000 > source.width or window.row_off + 8000 > source.height)
            ):
                raise ValueError("Requested context falls outside the native mosaic")
            temporary = path.with_suffix(".pending.tif")
            profile = dict(
                driver="GTiff",
                width=8000,
                height=8000,
                count=1,
                dtype="float32",
                crs=source.crs,
                transform=source.window_transform(window),
                nodata=float("nan"),
                tiled=True,
                blockxsize=256,
                blockysize=256,
                compress="deflate",
                predictor=3,
            )
            with rasterio.open(temporary, "w", **profile) as target:
                for row in range(0, 8000, 256):
                    height = min(256, 8000 - row)
                    data = source.read(
                        1,
                        window=Window(
                            window.col_off,
                            window.row_off + row,
                            8000,
                            height,
                        ),
                        masked=True,
                    ).filled(np.nan)
                    if not np.isfinite(data).all() or np.any(np.all(data == 0, axis=1)):
                        raise ValueError("Missing or suspicious source data; refusing to fill")
                    target.write(data, 1, window=Window(0, row, 8000, height))
                    print(region["id"], f"{min(row + height, 8000)}/8000 native rows", flush=True)
            temporary.replace(path)
            with path.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            receipt = {
                "source_url": SOURCE_URL,
                "retrieved_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "retrieval_method": "NASA_GDAL_HTTP_RANGE_WINDOW",
                "sha256": digest,
                "bytes": path.stat().st_size,
                "hash_scope": "LOCAL_PIXEL_EXACT_CROPPED_GEOTIFF",
                "source_window_pixels": dict(
                    zip(
                        ["column_off", "row_off", "width", "height"],
                        window.flatten(),
                        strict=True,
                    )
                ),
                "source_grid_resolution_m": 5,
                "processing": "Native 5m crop only; no resampling, filling, or invented detail",
                "reference_frame": "MOON_ME_DE421 per NASA PGDA product 81",
            }
            path.with_suffix(".provenance.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    fetch()
