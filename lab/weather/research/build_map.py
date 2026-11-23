"""Rebuild the Weather Revision Monitor's projected contiguous-state SVG geometry.

Usage: python build_map.py [--source local_topology.json] [--out map.json]
Inputs: 2017 Census cartographic boundaries via us-atlas 3.0.1. No dependencies.
"""

from pathlib import Path
import argparse
import hashlib
import json
import math
import urllib.request

SOURCE = "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-albers-10m.json"
DIGEST = "6e7bb086a3c791490361968a3094f377f7726c5d0c4900fec03cc42db2305a3d"
CODES = dict(
    item.split(":")
    for item in (
        "01:AL 04:AZ 05:AR 06:CA 08:CO 09:CT 10:DE 11:DC 12:FL 13:GA 16:ID 17:IL 18:IN 19:IA 20:KS 21:KY "
        "22:LA 23:ME 24:MD 25:MA 26:MI 27:MN 28:MS 29:MO 30:MT 31:NE 32:NV 33:NH 34:NJ 35:NM "
        "36:NY 37:NC 38:ND 39:OH 40:OK 41:OR 42:PA 44:RI 45:SC 46:SD 47:TN 48:TX 49:UT 50:VT "
        "51:VA 53:WA 54:WV 55:WI 56:WY"
    ).split()
)


def unpack_arcs(topology):
    sx, sy = topology["transform"]["scale"]
    tx, ty = topology["transform"]["translate"]
    result = []
    for arc in topology["arcs"]:
        x = y = 0
        coords = []
        for dx, dy in arc:
            x += dx
            y += dy
            coords.append((round(x * sx + tx, 2), round(y * sy + ty, 2)))
        result.append(coords)
    return result


def ring_coords(ring, arcs):
    points = []
    for offset in ring:
        line = arcs[offset] if offset >= 0 else arcs[~offset][::-1]
        if points and points[-1] != line[0]:
            raise ValueError("Disconnected polygon arcs")
        points.extend(line[1:] if points else line)
    if points[0] != points[-1]:
        raise ValueError("Open polygon")
    return points


def area2(ring):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:]))


def interior_label(polygons):
    # Compute a point inside the largest mainland polygon using even/odd scanline intersections.
    rings = max(polygons, key=lambda poly: abs(area2(poly[0])))
    exterior = rings[0]
    lo, hi = min(y for _, y in exterior), max(y for _, y in exterior)
    mid = (lo + hi) / 2
    preferred_x = (min(x for x, _ in exterior) + max(x for x, _ in exterior)) / 2
    best = None
    for fraction in (0.5, 0.45, 0.55, 0.4, 0.6):
        y = lo + (hi - lo) * fraction
        xs = sorted(
            a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
            for ring in rings
            for a, b in zip(ring, ring[1:])
            if (a[1] > y) != (b[1] > y)
        )
        for left, right in zip(xs[::2], xs[1::2]):
            x = (left + right) / 2
            score = (right - left) - abs(x - preferred_x) * 0.2 - 2 * abs(y - mid)
            if best is None or score > best[0]:
                best = (score, x, y)
    if best is None:
        raise ValueError("No interior coordinate")
    return [round(best[1], 2), round(best[2], 2)]


def build(raw):
    if hashlib.sha256(raw).hexdigest() != DIGEST:
        raise ValueError("Input checksum differs from the archived 3.0.1 release")
    topology = json.loads(raw)
    arcs = unpack_arcs(topology)
    states = {}
    for geometry in topology["objects"]["states"]["geometries"]:
        fips = geometry["id"]
        if fips not in CODES:
            continue
        index_sets = (
            geometry["arcs"]
            if geometry["type"] == "MultiPolygon"
            else [geometry["arcs"]]
        )
        polygons = [
            [ring_coords(ring, arcs) for ring in polygon] for polygon in index_sets
        ]
        paths = []
        coords = []
        for polygon in polygons:
            for ring in polygon:
                coords.extend(ring)
                paths.append("M" + "L".join(f"{x:g},{y:g}" for x, y in ring[:-1]) + "Z")
        xs, ys = zip(*coords)
        states[CODES[fips]] = {
            "name": geometry["properties"]["name"],
            "fips": fips,
            "path": "".join(paths),
            "bounds": [min(xs), min(ys), max(xs), max(ys)],
            "center": interior_label(polygons),
        }
    assert len(states) == 49
    x0 = math.floor(min(g["bounds"][0] for g in states.values())) - 3
    y0 = math.floor(min(g["bounds"][1] for g in states.values())) - 3
    x1 = math.ceil(max(g["bounds"][2] for g in states.values())) + 3
    y1 = math.ceil(max(g["bounds"][3] for g in states.values())) + 3
    return {
        "viewBox": f"{x0} {y0} {x1-x0} {y1-y0}",
        "source": "U.S. Census Bureau, 2017 cartographic boundaries. Projected with d3.geoAlbersUsa via us-atlas 3.0.1.",
        "source_url": SOURCE,
        "license": "ISC; Copyright 2013–2019 Michael Bostock (US_ATLAS_LICENSE).",
        "states": dict(sorted(states.items())),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--out", type=Path, default=Path("map.json"))
    args = parser.parse_args()
    raw = (
        args.source.read_bytes()
        if args.source
        else urllib.request.urlopen(SOURCE, timeout=30).read()
    )
    data = build(raw)
    args.out.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    print(f'{len(data["states"])} states/districts; viewBox {data["viewBox"]}')
