#!/usr/bin/env python3
"""Download individual NOAA GFS temperature messages, and construct a small static replay.
Requires Python 3, GDAL's GRIB driver and numpy (Debian: python3-gdal python3-numpy).
Run under /usr/bin/python3 on Debian. See README.md for method and archive dates.
"""
import argparse
import concurrent.futures
import csv
import hashlib
import io
import json
import os
import tempfile
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import numpy as np
from osgeo import gdal

ROOT = Path(__file__).resolve().parents[1]
BUCKET = "https://noaa-gfs-bdp-pds.s3.amazonaws.com"
CENSUS = "https://www2.census.gov/geo/docs/reference/cenpop2020/county/CenPop2020_Mean_CO.txt"
DEFAULT_RUNS = [
    "2026-08-09",
    "2026-08-10",
    "2026-08-11",
    "2026-11-18",
    "2026-11-19",
    "2026-11-20",
    "2026-11-21",
    "2026-11-22",
]
POSTALS = dict(
    pair.split(":")
    for pair in (
        "01:AL 04:AZ 05:AR 06:CA 08:CO 09:CT 10:DE 11:DC 12:FL 13:GA 16:ID 17:IL 18:IN 19:IA 20:KS 21:KY 22:LA "
        "23:ME 24:MD 25:MA 26:MI 27:MN 28:MS 29:MO 30:MT 31:NE 32:NV 33:NH 34:NJ 35:NM 36:NY "
        "37:NC 38:ND 39:OH 40:OK 41:OR 42:PA 44:RI 45:SC 46:SD 47:TN 48:TX 49:UT 50:VT 51:VA 53:WA 54:WV 55:WI 56:WY"
    ).split()
)


def request(url, rng=None):
    for attempt in range(4):
        headers = {
            "User-Agent": "Henry-Hub-Weather-Research/1.0",
            "Accept-Encoding": "identity",
        }
        if rng:
            headers["Range"] = f"bytes={rng[0]}-{rng[1]}"
        try:
            with urllib.request.urlopen(
                urllib.request.Request(url, headers=headers), timeout=35
            ) as response:
                if rng:
                    if response.status != 206 or not response.headers.get(
                        "Content-Range", ""
                    ).startswith(f"bytes {rng[0]}-{rng[1]}/"):
                        raise ValueError("Object returned the wrong range: " + url)
                d = response.read()
            if rng and len(d) != rng[1] - rng[0] + 1:
                raise ValueError("Truncated GRIB section")
            return d
        except (urllib.error.URLError, OSError, ValueError) as err:
            if attempt == 3:
                raise RuntimeError(f"Could not retrieve {url}: {err}") from err
            time.sleep(1.5 * (2**attempt))


def centers(source):
    records = [
        r
        for r in csv.DictReader(io.StringIO(source.decode("utf-8-sig")))
        if r["STATEFP"] in POSTALS
    ]
    if (
        len(set(r["STATEFP"] + r["COUNTYFP"] for r in records)) != len(records)
        or len(set(r["STATEFP"] for r in records)) != 49
    ):
        raise ValueError("Incomplete or duplicated county/state coverage")
    codes = sorted(set(POSTALS.values()))
    numbers = {s: i for i, s in enumerate(codes)}
    states = np.array([numbers[POSTALS[r["STATEFP"]]] for r in records])
    pop = np.array([int(r["POPULATION"]) for r in records], dtype=np.int64)
    lon = np.array([float(r["LONGITUDE"]) for r in records])
    lat = np.array([float(r["LATITUDE"]) for r in records])
    names = {POSTALS[r["STATEFP"]]: r["STNAME"] for r in records}
    return codes, states, pop, lon, lat, names


def sample(run, hour, county):
    lon, lat = county
    idate = datetime.fromisoformat(run).replace(tzinfo=timezone.utc)
    key = f'gfs.{idate.strftime("%Y%m%d")}/00/atmos/gfs.t00z.pgrb2.0p50.f{hour:03d}'
    url = f"{BUCKET}/{key}"
    lines = request(url + ".idx").decode().splitlines()
    matches = [i for i, l in enumerate(lines) if ":TMP:2 m above ground:" in l]
    if len(matches) != 1:
        raise ValueError(f"Ambiguous GFS temperature index {key}")
    i = matches[0]
    lo = int(lines[i].split(":")[1])
    hi = int(lines[i + 1].split(":")[1]) - 1
    data = request(url, (lo, hi))
    if data[:4] != b"GRIB" or data[-4:] != b"7777":
        raise ValueError("Incomplete GRIB message")
    name = "/vsimem/" + key.replace("/", "_") + ".grib2"
    gdal.FileFromMemBuffer(name, data)
    try:
        ds = gdal.Open(name)
        b = ds.GetRasterBand(1)
        m = b.GetMetadata()
        if (m.get("GRIB_ELEMENT"), m.get("GRIB_SHORT_NAME"), m.get("GRIB_UNIT")) != (
            "TMP",
            "2-HTGL",
            "[C]",
        ):
            raise ValueError("Unexpected GRIB variable, height or units")
        if (
            int(m["GRIB_REF_TIME"].split()[0]) != int(idate.timestamp())
            or int(m["GRIB_VALID_TIME"].split()[0])
            != int(idate.timestamp()) + hour * 3600
        ):
            raise ValueError("Forecast date disagrees with GRIB metadata")
        x, dx, _, y, _, dy = ds.GetGeoTransform()
        glon = lon if x < 0 else lon % 360
        col = np.floor((glon - x) / dx).astype(int)
        row = np.floor((lat - y) / dy).astype(int)
        temperatures = b.ReadAsArray()[row, col].astype(np.float64) * 1.8 + 32.0
        if (
            not np.isfinite(temperatures).all()
            or temperatures.min() < -100
            or temperatures.max() > 150
        ):
            raise ValueError("Out-of-range county temperature")
        return temperatures
    finally:
        ds = None
        gdal.Unlink(name)


def atomic(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(text, encoding="utf-8")
    os.replace(temp, path)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--dates",
        nargs="+",
        default=DEFAULT_RUNS,
        help="00 UTC initialization calendar dates",
    )
    ap.add_argument(
        "--days",
        type=int,
        default=9,
        help="Complete UTC days starting the day after model initialization",
    )
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument(
        "--cache",
        type=Path,
        default=Path(tempfile.gettempdir()) / "henry-hub-gfs-tmp-v1",
    )
    ap.add_argument("--out", type=Path, default=ROOT / "runs.json")
    ap.add_argument(
        "--merge",
        action="store_true",
        help="Retain older full runs with the same method",
    )
    args = ap.parse_args()
    if not 1 <= args.days <= 15 or not 1 <= args.workers <= 32:
        raise ValueError("Invalid days/workers")
    if len(set(args.dates)) != len(args.dates):
        raise ValueError("Duplicate runs")
    args.cache.mkdir(parents=True, exist_ok=True)
    census = args.cache / "county_2020.csv"
    if not census.exists():
        census.write_bytes(request(CENSUS))
    census_data = census.read_bytes()
    codes, state, pop, lon, lat, names = centers(census_data)
    totals = np.bincount(state, weights=pop).astype(np.int64)
    report = {
        "schema": 1,
        "model": "NOAA GFS deterministic 0.5°",
        "cycle": "00 UTC",
        "units": "°F·day",
        "base_f": 65,
        "sample_hours_utc": [0, 6, 12, 18],
        "weight": "2020 Census county resident population",
        "census_sha256": hashlib.sha256(census_data).hexdigest(),
        "county_count": len(pop),
        "hours_per_day": 4,
        "source_template": BUCKET
        + "/gfs.{YYYYMMDD}/00/atmos/gfs.t00z.pgrb2.0p50.f{HHH}",
        "source_census": CENSUS,
        "components": ["hdd", "cdd"],
        "states": [
            {"code": s, "name": names[s], "population": int(totals[i])}
            for i, s in enumerate(codes)
        ],
        "runs": [],
    }
    county = (lon, lat)
    cache_tag = report["census_sha256"][:12]

    def load(job):
        run, h = job
        path = args.cache / f"{run}_{h:03}_{cache_tag}.npy"
        if path.exists():
            v = np.load(path, allow_pickle=False)
            if v.shape != (len(pop),) or not np.isfinite(v).all():
                raise ValueError("Bad cached array")
            return job, v
        v = sample(run, h, county)
        temp = path.with_suffix(".tmp")
        with temp.open("wb") as f:
            np.save(f, v)
        os.replace(temp, path)
        return job, v

    hours = {}
    jobs = [(r, h) for r in args.dates for h in range(24, 24 * (args.days + 1), 6)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        fs = {pool.submit(load, j): j for j in jobs}
        for n, finished in enumerate(concurrent.futures.as_completed(fs), 1):
            job, vals = finished.result()
            hours[job] = vals
            if n % 20 == 0 or n == len(jobs):
                print(f"Validated {n}/{len(jobs)} GRIB samples", flush=True)
    for r in args.dates:
        out = {"init": r + "T00:00:00Z", "days": {}}
        for lead in range(1, args.days + 1):
            day = (date.fromisoformat(r) + timedelta(days=lead)).isoformat()
            t = np.mean([hours[(r, 24 * lead + h)] for h in (0, 6, 12, 18)], axis=0)
            h = np.bincount(state, weights=pop * np.maximum(65 - t, 0)) / totals
            c = np.bincount(state, weights=pop * np.maximum(t - 65, 0)) / totals
            out["days"][day] = [
                [round(float(x), 4), round(float(y), 4)] for x, y in zip(h, c)
            ]
        report["runs"].append(out)
    if args.merge and args.out.exists():
        old = json.loads(args.out.read_text())
        if any(
            old[k] != report[k]
            for k in ("schema", "census_sha256", "states", "base_f", "sample_hours_utc")
        ):
            raise ValueError("Old archive uses different method, cannot merge")
        built = {r["init"]: r for r in old["runs"]}
        built.update({r["init"]: r for r in report["runs"]})
        report["runs"] = sorted(built.values(), key=lambda x: x["init"])
    report["runs"].sort(key=lambda x: x["init"])
    report["retrieved_utc"] = (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
    atomic(
        args.out, json.dumps(report, separators=(",", ":"), ensure_ascii=False) + "\n"
    )
    print(args.out, len(report["runs"]), len(pop), sum(totals), flush=True)


if __name__ == "__main__":
    main()
