"""Read packaged Horizons responses offline; network access requires --refresh."""

import csv
import hashlib
import io
import json
import math
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
DEFAULT_WINDOW = {
    "start_utc": "2026-11-14T00:00:00Z",
    "end_utc": "2026-12-14T00:00:00Z",
    "step_hours": 1,
}
ENDPOINT = "https://ssd.jpl.nasa.gov/api/horizons.api"


def utc(value):
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError(f"Expected ISO UTC timestamp ending in Z: {value!r}")
    result = datetime.fromisoformat(value[:-1] + "+00:00")
    if result.utcoffset() != timedelta(0):
        raise ValueError(f"Expected full UTC date and time: {value!r}")
    return result


def iso(value):
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def timestamps(window):
    start, end = utc(window["start_utc"]), utc(window["end_utc"])
    step = window["step_hours"]
    if isinstance(step, bool) or not isinstance(step, (int, float)) or not math.isfinite(step):
        raise ValueError("step_hours must be finite")
    if step <= 0 or end <= start or (end - start).total_seconds() % (step * 3600):
        raise ValueError("Window must contain a positive whole number of steps")
    return [
        iso(start + i * timedelta(hours=step))
        for i in range(int((end - start).total_seconds() / (step * 3600)))
    ]


def number(value, low, high, context):
    if isinstance(value, bool):
        raise ValueError(f"{context}: boolean is not a number")
    try:
        result = float(value)
    except (ValueError, TypeError) as error:
        raise ValueError(f"{context}: invalid number {value!r}") from error
    if not math.isfinite(result) or not low <= result <= high:
        raise ValueError(f"{context}: non-finite or out-of-range value {value!r}")
    return result


def parse_response(raw, target, site_id):
    context = f"{site_id}/{target}"
    if raw.lstrip().startswith("{"):
        response = json.loads(raw)
        if response.get("signature", {}).get("version") not in {"1.2", "1.3"}:
            raise ValueError(f"{context}: unsupported Horizons signature version")
        if response.get("error"):
            raise ValueError(f"{context}: Horizons error: {response['error']}")
        raw = response.get("result", "")
    version = re.search(r"API VERSION:\s*(\S+)", raw)
    if version and version[1] not in {"1.2", "1.3"}:
        raise ValueError(f"{context}: unsupported Horizons text version {version[1]}")
    if raw.count("$$SOE") != 1 or raw.count("$$EOE") != 1:
        raise ValueError(f"{context}: Horizons error or missing ephemeris markers")
    prefix, body = raw.split("$$SOE")
    body = body.split("$$EOE")[0]
    headers = [line for line in prefix.splitlines() if "Date__(UT)__HR:MN:SS" in line]
    if len(headers) != 1:
        raise ValueError(f"{context}: missing or ambiguous UTC CSV header")
    header = [cell.strip() for cell in next(csv.reader(headers))]
    required = (
        ["ObsSub-LON", "ObsSub-LAT"]
        if target == "libration"
        else ["Azimuth_(a-app)", "Elevation_(a-app)"]
    )
    if target == "sun":
        required.append("delta")
    if any(header.count(name) != 1 for name in required):
        raise ValueError(f"{context}: missing or duplicate column: {required}")
    result = {}
    for cells in csv.reader(io.StringIO(body.strip())):
        label = cells[0].strip() if cells else "<missing>"
        try:
            if len(cells) != len(header):
                raise ValueError("CSV column count differs from header")
            # Parse English Horizons month names independently of the host locale.
            match = re.fullmatch(r"(\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}:\d{2}:\d{2})", label)
            if not match:
                raise ValueError("Invalid Horizons UTC date")
            month = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split().index(match[2]) + 1
            stamp = iso(utc(f"{match[1]}-{month:02}-{match[3]}T{match[4]}Z"))
            if stamp in result:
                raise ValueError("Duplicate timestamp")
            row = {name: cells[header.index(name)].strip() for name in required}
            if target == "libration":
                result[stamp] = {
                    "libration_lat_deg": number(row["ObsSub-LAT"], -90, 90, context),
                    "libration_lon_deg": (number(row["ObsSub-LON"], 0, 360, context) + 180) % 360
                    - 180,
                }
            else:
                azimuth = number(row["Azimuth_(a-app)"], 0, 360, context)
                if azimuth == 360:
                    raise ValueError("Azimuth must be < 360")
                result[stamp] = {
                    "azimuth_deg": azimuth,
                    "elevation_deg": number(row["Elevation_(a-app)"], -90, 90, context),
                }
                if target == "sun":
                    distance = number(row["delta"], 0, math.inf, context)
                    if distance <= 0:
                        raise ValueError("Sun distance must be positive")
                    result[stamp]["solar_flux_wm2"] = round(1361 / distance**2, 4)
        except (ValueError, IndexError, OverflowError, ZeroDivisionError) as error:
            raise ValueError(f"{context}/{label}: {error}") from error
    return result


def query_url(site, target, window):
    stamps = timestamps(window)
    if len(stamps) < 2:
        raise ValueError("Horizons acquisition requires at least two samples")
    values = {
        "EPHEM_TYPE": "OBSERVER",
        "START_TIME": stamps[0][:-1].replace("T", " "),
        "STOP_TIME": stamps[-1][:-1].replace("T", " "),
        "STEP_SIZE": f"{window['step_hours']:g} h",
        "CSV_FORMAT": "YES",
        "TIME_TYPE": "UT",
        "TIME_DIGITS": "SECONDS",
        "ELEV_CUT": "-90",
        "EXTRA_PREC": "YES",
    }
    # The package URLs omit seconds; retain that exact representation for cache matching.
    for key in ["START_TIME", "STOP_TIME"]:
        if values[key].endswith(":00"):
            values[key] = values[key][:-3]
    if target == "libration":
        values.update(COMMAND="301", CENTER="500@399", QUANTITIES="14")
    else:
        coordinates = site["coordinates"]
        values.update(
            COMMAND="10" if target == "sun" else "399",
            CENTER="coord@301",
            COORD_TYPE="GEODETIC",
            APPARENT="AIRLESS",
            QUANTITIES="4,20" if target == "sun" else "4",
            SITE_COORD=f"{coordinates['longitude_deg'] % 360:.10f},"
            f"{coordinates['latitude_deg']:.10f},{site['observer_altitude_km']:.9f}",
        )
    return (
        ENDPOINT + "?" + urlencode({"format": "text", **{k: f"'{v}'" for k, v in values.items()}})
    )


def query_parameters(url):
    parts = urlsplit(url)
    if f"{parts.scheme}://{parts.netloc}{parts.path}" != ENDPOINT:
        raise ValueError("Expected official HTTPS Horizons endpoint")
    return dict(parse_qsl(parts.query))


def download(url, user_agent):
    if (
        not user_agent
        or "Selenis/" not in user_agent
        or not ("@" in user_agent or "https://" in user_agent)
    ):
        raise ValueError(
            "--user-agent must include Selenis/version and a real contact URL or email"
        )
    for attempt in range(3):
        delay = 2 ** (attempt + 1)
        try:
            with urlopen(Request(url, headers={"User-Agent": user_agent}), timeout=30) as response:
                return response.read().decode("utf-8")
        except HTTPError as error:
            if error.code not in {429, 500, 502, 503, 504} or attempt == 2:
                raise
            retry_after = error.headers.get("Retry-After", "")
            if retry_after.isdigit():
                delay = max(delay, int(retry_after))
            elif retry_after:
                from email.utils import parsedate_to_datetime

                delay = max(
                    delay,
                    (
                        parsedate_to_datetime(retry_after) - datetime.now(timezone.utc)
                    ).total_seconds(),
                )
            if delay > 60:
                raise ValueError(
                    "Horizons requests a longer pause; retry manually later"
                ) from error
        except (URLError, TimeoutError):
            if attempt == 2:
                raise
        time.sleep(delay)
    raise RuntimeError("Unreachable retry state")


def load_ephemeris(inputs, config, window, refresh=False, user_agent=None, cache=None):
    expected = timestamps(window)
    requests = json.loads((inputs / "horizons_requests.json").read_text(encoding="utf-8"))
    packaged = {
        json.dumps(query_parameters(url), sort_keys=True): name for name, url in requests.items()
    }
    receipt = json.loads((inputs / "provenance.json").read_text(encoding="utf-8"))
    utc(receipt["retrieved_at"])
    sources, tables = [], {}
    cache = cache or ROOT / "cache"
    jobs = [(None, "libration")] + [
        (site, target) for site in config["sites"] for target in ["sun", "earth"]
    ]
    for site, target in jobs:
        site_id = site["site_id"] if site else "ALL_SITES"
        url = query_url(site, target, window)
        key = hashlib.sha256(url.encode()).hexdigest()
        cache_file = cache / f"{key}.json"
        if refresh:
            raw = download(url, user_agent)
            retrieved_at = iso(datetime.now(timezone.utc))
            retrieval_method = "HORIZONS_HTTP"
        elif cache_file.exists():
            entry = json.loads(cache_file.read_text(encoding="utf-8"))
            if entry["url"] != url:
                raise ValueError(f"{site_id}/{target}: cache URL mismatch")
            raw, retrieved_at = entry["response"], entry["retrieved_at"]
            retrieval_method = "HORIZONS_HTTP"
        else:
            name = packaged.get(json.dumps(query_parameters(url), sort_keys=True))
            if not name:
                raise ValueError(
                    f"{site_id}/{target}: no offline response for configured site/window; "
                    "use --refresh"
                )
            raw = (inputs / "horizons_raw" / name).read_text(encoding="utf-8")
            retrieved_at = receipt["retrieved_at"]
            retrieval_method = receipt["method"]
        utc(retrieved_at)
        rows = parse_response(raw, target, site_id)
        missing = next((stamp for stamp in expected if stamp not in rows), None)
        if missing:
            raise ValueError(f"{site_id}/{target}/{missing}: missing timestamp")
        if set(rows) != set(expected):
            raise ValueError(f"{site_id}/{target}: unexpected timestamps outside requested window")
        if refresh:
            cache.mkdir(parents=True, exist_ok=True)
            cache_file.write_text(
                json.dumps({"url": url, "retrieved_at": retrieved_at, "response": raw}),
                encoding="utf-8",
            )
        tables[site_id, target] = rows
        sources.append(
            {
                "url": url,
                "retrieved_at": retrieved_at,
                "retrieval_method": retrieval_method,
                "sha256": hashlib.sha256(raw.encode()).hexdigest(),
            }
        )
    timelines = {}
    for site in config["sites"]:
        site_id = site["site_id"]
        timelines[site_id] = [
            {
                "timestamp_utc": stamp,
                "sun_vector": tables[site_id, "sun"][stamp],
                "earth_vector": {
                    **tables[site_id, "earth"][stamp],
                    **tables["ALL_SITES", "libration"][stamp],
                },
            }
            for stamp in expected
        ]
    return {"mission_window": window, "timelines_by_site": timelines}, sources
