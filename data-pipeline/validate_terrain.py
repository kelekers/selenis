"""Compare slope implementations on the same grid; independent science validation is separate."""

import hashlib
import json
import math

import numpy as np
import rasterio
from fetch_horizons import utc
from process_dem import LocalTerrain

REFERENCE_URL = "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_slp.tif"


def error_metrics(calculated, reference):
    if not len(calculated) or np.shape(calculated) != np.shape(reference):
        raise ValueError("Slope comparison needs equal non-empty samples")
    if not np.isfinite(calculated).all() or not np.isfinite(reference).all():
        raise ValueError("Slope comparison contains non-finite values")
    difference = np.asarray(calculated) - np.asarray(reference)
    return {
        "sample_count": int(len(calculated)),
        "bias_deg": float(difference.mean()),
        "mae_deg": float(np.abs(difference).mean()),
        "rmse_deg": float(np.sqrt(np.mean(difference**2))),
        "max_absolute_error_deg": float(np.abs(difference).max()),
        "calculated_mean_deg": float(np.mean(calculated)),
        "reference_mean_deg": float(np.mean(reference)),
        "calculated_max_deg": float(np.max(calculated)),
        "reference_max_deg": float(np.max(reference)),
    }


def compare_reference_slope(telemetry, dem_path, reference_path):
    terrain = LocalTerrain(dem_path)
    digest = hashlib.sha256(reference_path.read_bytes()).hexdigest()
    receipt = json.loads(reference_path.with_suffix(".provenance.json").read_text(encoding="utf-8"))
    if receipt["sha256"] != digest or receipt["source_url"] != REFERENCE_URL:
        raise ValueError("Slope reference must match its official-source receipt and checksum")
    utc(receipt["retrieved_at"])
    reports = {}
    with rasterio.open(reference_path) as reference:
        if reference.crs != terrain.crs:
            raise ValueError("Reference slope CRS differs from DEM")
        if (
            not math.isclose(reference.transform.a, terrain.pixel_size)
            or not math.isclose(reference.transform.e, -terrain.pixel_size)
            or reference.transform.b
            or reference.transform.d
        ):
            raise ValueError("Reference slope resolution/orientation differs from DEM")
        data = reference.read(1, masked=True, out_dtype="float64").filled(np.nan)
        for site in telemetry["sites"]:
            row = site["coordinates"]["uv"]["v"] * terrain.data.shape[0] - 0.5
            col = site["coordinates"]["uv"]["u"] * terrain.data.shape[1] - 0.5
            radius = site["slope_analysis"]["radius_m"] / terrain.pixel_size
            rr, cc = np.mgrid[
                math.floor(row - radius) : math.ceil(row + radius) + 1,
                math.floor(col - radius) : math.ceil(col + radius) + 1,
            ]
            selected = (rr - row) ** 2 + (cc - col) ** 2 <= radius**2
            rr, cc = rr[selected], cc[selected]
            x, y = terrain.affine @ (cc + 0.5, rr + 0.5)
            ref_col, ref_row = ~reference.transform @ (x, y)
            rc, rr_ref = np.rint(ref_col - 0.5).astype(int), np.rint(ref_row - 0.5).astype(int)
            if not np.allclose(ref_col, rc + 0.5, atol=1e-6, rtol=0) or not np.allclose(
                ref_row, rr_ref + 0.5, atol=1e-6, rtol=0
            ):
                raise ValueError("Reference slope grid is not aligned with DEM pixel centers")
            if (
                np.any(rc < 0)
                or np.any(rr_ref < 0)
                or np.any(rc >= reference.width)
                or np.any(rr_ref >= reference.height)
            ):
                raise ValueError(f"{site['site_id']}: reference does not cover slope footprint")
            values = data[rr_ref, rc]
            if not np.isfinite(values).all() or np.any(values < 0) or np.any(values > 90):
                raise ValueError(f"{site['site_id']}: invalid or missing reference slope")
            reports[site["site_id"]] = error_metrics(terrain.slopes[rr, cc], values)
    telemetry["terrain_metadata"]["validation"] = {
        "status": "IMPLEMENTATION_CROSS_CHECK_ONLY",
        "is_independent_measurement_validation_complete": False,
        "is_landing_safety_validated": False,
        "source_url": REFERENCE_URL,
        "reference_sha256": digest,
        "reference_hash_scope": "LOCAL_CROPPED_REFERENCE_GEOTIFF",
        "retrieved_at": receipt["retrieved_at"],
        "retrieval_method": receipt["retrieval_method"],
        "source_window_pixels": receipt.get("source_window_pixels"),
        "method": "Same pixel centers and circular footprint; computed minus reference",
        "acceptance_threshold_deg": None,
        "note": (
            "Produk slope resmi berasal dari DEM induk yang sama. Selisih metode dihitung, "
            "tanpa ambang kelulusan yang disepakati. Ini belum memvalidasi elevasi, horizon, "
            "visibilitas, atau keselamatan dengan pengukuran independen."
        ),
        "sites": reports,
    }
