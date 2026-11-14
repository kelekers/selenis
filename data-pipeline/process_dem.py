"""Site01-only terrain sampling; no assumption about terrain beyond the raster."""

import copy
import hashlib
import io
import json
import math
from datetime import datetime, timezone

import numpy as np
import rasterio
from PIL import Image
from rasterio.crs import CRS
from rasterio.warp import transform

RADIUS_M = 1_737_400.0
SOURCE_URL = "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif"
MODEL = "Horizontal lokal 0° ditambah penghalang Site01; medan di luar DEM belum diperiksa"
DEMO_SCREENING_PROFILE = {
    "profile_id": "DEMO_TERRAIN_SCREENING_V1",
    "lower_concern_max_slope_deg": 10.0,
    "lower_concern_roughness_rmse_m": 0.5,
    "demo_max_slope_deg": 15.0,
    "demo_roughness_rmse_m": 1.0,
    "note": (
        "Ambang demo proyek, bukan spesifikasi wahana atau standar keselamatan NASA: "
        "LOWER_CONCERN bila max slope ≤10° dan RMS ≤0,5 m; CAUTION bila ≤15° dan ≤1 m; "
        "lainnya EXCEEDS_DEMO_LIMITS. RMS diukur setelah mengurangi bidang best-fit. "
        "Hanya screening skala DEM pada footprint yang dicatat, bukan sertifikasi pendaratan."
    ),
}


def screen_terrain(max_slope_deg, roughness_rmse_m):
    if not all(math.isfinite(v) and v >= 0 for v in [max_slope_deg, roughness_rmse_m]):
        raise ValueError("Screening metrics must be finite and non-negative")
    profile = DEMO_SCREENING_PROFILE
    if (
        max_slope_deg > profile["demo_max_slope_deg"]
        or roughness_rmse_m > profile["demo_roughness_rmse_m"]
    ):
        return "EXCEEDS_DEMO_LIMITS"
    if (
        max_slope_deg > profile["lower_concern_max_slope_deg"]
        or roughness_rmse_m > profile["lower_concern_roughness_rmse_m"]
    ):
        return "CAUTION"
    return "LOWER_CONCERN"


def surface_position(latitude_deg, longitude_deg, altitude_m):
    lat, lon = np.radians(latitude_deg), np.radians(longitude_deg)
    radius = RADIUS_M + np.asarray(altitude_m)
    return np.stack(
        [
            radius * np.cos(lat) * np.cos(lon),
            radius * np.cos(lat) * np.sin(lon),
            radius * np.sin(lat),
        ],
        axis=-1,
    )


def destination(latitude_deg, longitude_deg, azimuth_deg, distance_m):
    lat, lon, az = np.radians([latitude_deg, longitude_deg, azimuth_deg])
    angle = np.asarray(distance_m) / RADIUS_M
    latitude = np.arcsin(np.sin(lat) * np.cos(angle) + np.cos(lat) * np.sin(angle) * np.cos(az))
    longitude = lon + np.arctan2(
        np.sin(az) * np.sin(angle) * np.cos(lat), np.cos(angle) - np.sin(lat) * np.sin(latitude)
    )
    return np.degrees(latitude), np.degrees(longitude)


def line_elevation(observer_lat, observer_lon, observer_altitude, latitudes, longitudes, heights):
    origin = surface_position(observer_lat, observer_lon, observer_altitude)
    up = surface_position(observer_lat, observer_lon, 0) / RADIUS_M
    delta = surface_position(latitudes, longitudes, heights) - origin
    vertical = delta @ up
    horizontal = np.linalg.norm(delta - vertical[..., None] * up, axis=-1)
    return np.degrees(np.arctan2(vertical, horizontal))


def bilinear(data, rows, columns):
    rows, columns = np.asarray(rows), np.asarray(columns)
    r, c = np.floor(rows).astype(int), np.floor(columns).astype(int)
    if (
        np.any(r < 0)
        or np.any(c < 0)
        or np.any(r + 1 >= data.shape[0])
        or np.any(c + 1 >= data.shape[1])
    ):
        raise ValueError("Bilinear sampling leaves the valid DEM pixel-center extent")
    dr, dc = rows - r, columns - c
    value = (
        (1 - dr) * (1 - dc) * data[r, c]
        + dr * (1 - dc) * data[r + 1, c]
        + (1 - dr) * dc * data[r, c + 1]
        + dr * dc * data[r + 1, c + 1]
    )
    if not np.all(np.isfinite(value)):
        raise ValueError("DEM sample intersects nodata")
    return value


def slope_grid(data, pixel_size_m):
    dy, dx = np.gradient(data.astype(np.float64), pixel_size_m, pixel_size_m)
    return np.degrees(np.arctan(np.hypot(dx, dy)))


def horizon_at(mask, azimuth_deg):
    values = np.array([entry["horizon_elevation_deg"] for entry in mask])
    return float(np.interp(azimuth_deg % 360, np.arange(361), np.r_[values, values[0]]))


def clearance(elevation_deg, azimuth_deg, mask):
    return elevation_deg - max(0.0, horizon_at(mask, azimuth_deg))


class LocalTerrain:
    def __init__(self, path):
        with rasterio.open(path) as source:
            self.data = source.read(1, masked=True).filled(np.nan).astype(np.float64)
            self.crs, self.affine = source.crs, source.transform
            self.bounds = source.bounds
        if self.crs is None or not self.crs.is_projected:
            raise ValueError("DEM requires a projected lunar CRS")
        projection = self.crs.to_dict()
        if projection.get("proj") != "stere" or projection.get("lat_0") != -90:
            raise ValueError("Expected south polar stereographic Site01 DEM")
        if abs(projection.get("R", projection.get("a", 0)) - RADIUS_M) > 0.01:
            raise ValueError("DEM datum must use lunar radius 1737400 m")
        if self.affine.b or self.affine.d or self.affine.a <= 0 or self.affine.e >= 0:
            raise ValueError("Expected unrotated north-up DEM")
        if not math.isclose(self.affine.a, -self.affine.e):
            raise ValueError("DEM pixels must be square")
        if not np.all(np.isfinite(self.data)):
            raise ValueError("DEM contains nodata; do not treat missing terrain as unobstructed")
        if np.any(np.all(self.data == 0, axis=1)):
            raise ValueError("Suspicious all-zero row in Site01 DEM; verify source file integrity")
        self.geographic = CRS.from_proj4(f"+proj=longlat +R={RADIUS_M} +no_defs")
        self.pixel_size = self.affine.a
        self.slopes = slope_grid(self.data, self.pixel_size)

    def pixel_coordinates(self, latitudes, longitudes):
        x, y = transform(
            self.geographic,
            self.crs,
            np.atleast_1d(longitudes).tolist(),
            np.atleast_1d(latitudes).tolist(),
        )
        columns, rows = ~self.affine @ (np.asarray(x), np.asarray(y))
        return rows - 0.5, columns - 0.5

    def sample_site(self, site, slope_radius_m):
        coords = site["coordinates"]
        lat, lon = coords["latitude_deg"], coords["longitude_deg"]
        rows, columns = self.pixel_coordinates(lat, lon)
        elevation = float(bilinear(self.data, rows, columns)[0])
        if abs(elevation - coords["elevation_m"]) > 1:
            raise ValueError(f"{site['site_id']}: configured elevation differs from DEM by >1 m")
        row, column = float(rows[0]), float(columns[0])
        radius_pixels = slope_radius_m / self.pixel_size
        if (
            min(row, column, self.data.shape[0] - 1 - row, self.data.shape[1] - 1 - column)
            <= radius_pixels + 1
        ):
            raise ValueError(f"{site['site_id']}: slope footprint is not fully covered")
        r0, r1 = math.floor(row - radius_pixels), math.ceil(row + radius_pixels) + 1
        c0, c1 = math.floor(column - radius_pixels), math.ceil(column + radius_pixels) + 1
        rr, cc = np.mgrid[r0:r1, c0:c1]
        selected = (rr - row) ** 2 + (cc - column) ** 2 <= radius_pixels**2
        values = self.slopes[r0:r1, c0:c1][selected]
        design = np.column_stack(
            [
                (cc[selected] - column) * self.pixel_size,
                (row - rr[selected]) * self.pixel_size,
                np.ones(int(selected.sum())),
            ]
        )
        heights = self.data[r0:r1, c0:c1][selected]
        residual = heights - design @ np.linalg.lstsq(design, heights, rcond=None)[0]
        basis = {}
        for direction, azimuth in [("north", 0), ("east", 90)]:
            next_lat, next_lon = destination(lat, lon, azimuth, 1)
            next_row, next_col = self.pixel_coordinates(next_lat, next_lon)
            dx, dy = float(next_col[0] - column), float(row - next_row[0])
            length = math.hypot(dx, dy)
            basis[direction] = {"x": dx / length, "y": dy / length}
        return {"u": (column + 0.5) / self.data.shape[1], "v": (row + 0.5) / self.data.shape[0]}, {
            "radius_m": slope_radius_m,
            "sample_count": int(values.size),
            "dem_elevation_m": elevation,
            "local_basis_projected": basis,
            "average_slope_deg": float(values.mean()),
            "max_slope_deg": float(values.max()),
            "roughness_rmse_m": float(np.sqrt(np.mean(residual**2))),
        }

    def horizon(self, site):
        coords = site["coordinates"]
        lat, lon = coords["latitude_deg"], coords["longitude_deg"]
        step = self.pixel_size / 2
        diagonal = math.hypot(
            self.bounds.right - self.bounds.left, self.bounds.top - self.bounds.bottom
        )
        distances = np.arange(step, diagonal + step, step)
        mask = []
        for azimuth in range(360):
            lats, lons = destination(lat, lon, azimuth, distances)
            rows, columns = self.pixel_coordinates(lats, lons)
            inside = (
                (rows >= 0)
                & (columns >= 0)
                & (rows < self.data.shape[0] - 1)
                & (columns < self.data.shape[1] - 1)
            )
            outside = np.flatnonzero(~inside)
            end = int(outside[0]) if outside.size else len(distances)
            if end < 2:
                raise ValueError(f"{site['site_id']}/{azimuth}: insufficient DEM ray coverage")
            heights = bilinear(self.data, rows[:end], columns[:end])
            angles = line_elevation(
                lat,
                lon,
                coords["elevation_m"] + site["observer_height_above_ground_m"],
                lats[:end],
                lons[:end],
                heights,
            )
            mask.append(
                {
                    "azimuth_deg": azimuth,
                    "horizon_elevation_deg": float(angles.max()),
                    "sampled_distance_m": float(distances[end - 1]),
                }
            )
        return mask


def heightmap_bytes(data):
    minimum, maximum = float(data.min()), float(data.max())
    reduced = Image.fromarray(data.astype(np.float32))
    reduced.thumbnail((2048, 2048), Image.Resampling.BILINEAR)
    span = maximum - minimum
    gray = (
        np.zeros(np.asarray(reduced).shape, dtype=np.uint8)
        if span == 0
        else np.rint((np.asarray(reduced) - minimum) / span * 255).clip(0, 255).astype(np.uint8)
    )
    image = Image.fromarray(gray).convert("RGB")
    output = io.BytesIO()
    image.save(output, format="WEBP", lossless=True, method=6)
    decoded = Image.open(io.BytesIO(output.getvalue()))
    if not np.array_equal(np.asarray(decoded), np.asarray(image)):
        raise ValueError("Heightmap round-trip changed encoded heights")
    return output.getvalue(), image.size, minimum, maximum


def apply_terrain(config, ephemeris, telemetry, path, slope_radius_m):
    from build_site_telemetry import find_demo, summarize

    if not math.isfinite(slope_radius_m) or slope_radius_m < 5:
        raise ValueError("Slope radius must be finite and at least 5 m")
    terrain = LocalTerrain(path)
    image, size, minimum, maximum = heightmap_bytes(terrain.data)
    metadata = {
        "region_name": "Connecting Ridge / Site01",
        "coverage_status": "LOCAL_DEM_ONLY",
        "is_global_horizon_complete": False,
        "visibility_model": MODEL,
        "area_width_km": (terrain.bounds.right - terrain.bounds.left) / 1000,
        "area_height_km": (terrain.bounds.top - terrain.bounds.bottom) / 1000,
        "min_elevation_m": minimum,
        "max_elevation_m": maximum,
        "heightmap_texture": "/textures/site01_heightmap.webp",
        "normal_texture": None,
        "heightmap_width_px": size[0],
        "heightmap_height_px": size[1],
        "heightmap_quantization_m": (maximum - minimum) / 255,
        "height_encoding": {
            "bits_per_sample": 8,
            "meters_per_unit": (maximum - minimum) / 255,
            "offset_m": minimum,
            "nodata_value": None,
            "lossy": False,
        },
        "vertical_exaggeration": 1,
        "sample_registration": "PIXEL_IS_AREA",
        "source_resolution_m": terrain.pixel_size,
        "source_width_px": terrain.data.shape[1],
        "source_height_px": terrain.data.shape[0],
        "reference_radius_m": RADIUS_M,
        "crs_wkt": terrain.crs.to_wkt(),
        "bounds_m": dict(zip(["left", "bottom", "right", "top"], terrain.bounds)),
        "uv_origin": "TOP_LEFT",
        "uv_v_direction": "RASTER_ROW_DOWN",
        "map_orientation": "Projected raster axes; grid north is not site-local north",
        "horizon_azimuth_step_deg": 1,
        "horizon_distance_step_m": terrain.pixel_size / 2,
        "minimum_visibility_threshold_deg": 0,
        "is_horizon_dip_modeled": False,
        "horizon_method": (
            "Great-circle rays, bilinear DEM; spherical ECEF local elevation; "
            "linear azimuth interpolation"
        ),
        "slope_method": "Central differences on native projected DEM grid; circular footprint",
        "source_url": SOURCE_URL,
        "source_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "source_file_modified_at_utc": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
    }
    receipt_path = path.with_suffix(".provenance.json")
    if receipt_path.exists():
        from fetch_horizons import utc

        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        if receipt["sha256"] != metadata["source_sha256"]:
            raise ValueError("DEM HTTP receipt checksum does not match the local file")
        utc(receipt["retrieved_at"])
        metadata["source_retrieved_at_utc"] = receipt["retrieved_at"]
        metadata["source_retrieval_method"] = receipt["retrieval_method"]
    margins = copy.deepcopy(ephemeris)
    for configured, site in zip(config["sites"], telemetry["sites"]):
        site["coordinates"]["uv"], footprint = terrain.sample_site(configured, slope_radius_m)
        site["slope_analysis"] = footprint
        site["terrain_screening"] = {
            **DEMO_SCREENING_PROFILE,
            "rating": screen_terrain(footprint["max_slope_deg"], footprint["roughness_rmse_m"]),
            "radius_m": slope_radius_m,
            "max_slope_deg": footprint["max_slope_deg"],
            "roughness_rmse_m": footprint["roughness_rmse_m"],
            "is_landing_safety_assessment": False,
        }
        for key in ["average_slope_deg", "max_slope_deg"]:
            site["summary_metrics"][key] = footprint[key]
        mask = terrain.horizon(configured)
        site["horizon_mask_360"] = mask
        statuses = []
        rows = margins["timelines_by_site"][site["site_id"]]
        for row in rows:
            status = {"timestamp_utc": row["timestamp_utc"]}
            for target in ["sun", "earth"]:
                vector = row[f"{target}_vector"]
                vector["elevation_deg"] = clearance(
                    vector["elevation_deg"], vector["azimuth_deg"], mask
                )
                status[f"is_{target}_clear_within_dem"] = vector["elevation_deg"] > 0
            statuses.append(status)
        site["terrain_visibility_timeline"] = statuses
        site["terrain_summary_metrics"] = summarize(rows, ephemeris["mission_window"]["step_hours"])
        site["horizon_coverage"] = {
            "coverage_status": "LOCAL_DEM_ONLY",
            "is_global_horizon_complete": False,
            "min_sampled_distance_m": min(item["sampled_distance_m"] for item in mask),
            "max_sampled_distance_m": max(item["sampled_distance_m"] for item in mask),
        }
    telemetry["terrain_metadata"] = metadata
    telemetry["terrain_demo_48_hours"] = find_demo(margins)
    return image
