#!/usr/bin/env python3
"""Fetch every MultiTrans (Sfantu Gheorghe / Sepsiszentgyorgy) line page and
extract the stop list as JSON.

This is a server-side port of the browser console snippet that was used for
manual retrieval: it reads the stop names/coordinates from the page's `stops`
JavaScript variable and the inter-stop distances from the `.dist` divs in the
sidebar, keyed by the route title in the <h1>.

Output layout:

    line-<line>/
        depart/  <line>-ro.json   <line>-hu.json
        return/  <line>-ro.json   <line>-hu.json

Circular lines (korjarat) have no return page and get a depart/ folder only.
"""

import html
import json
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE = "https://multitrans.ro"
OUT_ROOT = Path(__file__).resolve().parent
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) MultiTrans-GTFS/1.0"

# Line label -> url slug. Labels are used for directory/file names.
LINES = [
    ("1", "1"),
    ("1D", "1d"),
    ("2", "2"),
    ("2D", "2d"),
    ("3", "3"),
    ("4", "4"),
    ("5", "5"),
    ("5D", "5d"),
    ("6", "6"),
    ("7", "7"),
    ("9", "9"),
    ("10", "10"),
]

# direction folder -> url infix
DIRECTIONS = [("depart", ""), ("return", "-retur")]
# language -> url suffix
LANGS = [("ro", ""), ("hu", "-hu")]

RE_H1 = re.compile(r"<h1[^>]*>(.*?)</h1>", re.S)
RE_STOPS_BLOCK = re.compile(r"var\s+stops\s*=\s*\[(.*?)\]\s*;", re.S)
RE_STOP_ENTRY = re.compile(
    r"\{\s*name\s*:\s*\"([^\"]*)\"\s*,\s*lat\s*:\s*(-?[\d.]+)\s*,\s*lng\s*:\s*(-?[\d.]+)\s*\}"
)
# matches class="stop", class="stop first", class="stop last" but NOT stop-name/stop-info
RE_STOP_DIV = re.compile(r'<div\s+class="stop(?:\s+[a-z]+)?"\s*>')
RE_DIST = re.compile(r'<div\s+class="dist"\s*>(.*?)</div>', re.S)


def fetch(url):
    """Return page text, or None on 404."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise


def parse_distances(page):
    """Per-stop distance text, mirroring the browser snippet's element walk."""
    starts = [m.start() for m in RE_STOP_DIV.finditer(page)]
    distances = []
    for i, start in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else len(page)
        match = RE_DIST.search(page, start, end)
        if match:
            text = html.unescape(match.group(1)).replace("↓", "").strip()
            distances.append(text)
        else:
            # last stop of the line has no following-distance div
            distances.append("0 m")
    return distances


def parse_page(page, url):
    h1 = RE_H1.search(page)
    if not h1:
        raise ValueError(f"no <h1> route title in {url}")
    route_title = html.unescape(re.sub(r"<[^>]+>", "", h1.group(1))).strip()
    route_title = re.sub(r"\s+", " ", route_title)

    block = RE_STOPS_BLOCK.search(page)
    if not block:
        raise ValueError(f"no `var stops` array in {url}")
    entries = RE_STOP_ENTRY.findall(block.group(1))
    if not entries:
        raise ValueError(f"`var stops` array parsed empty in {url}")

    distances = parse_distances(page)
    if len(distances) != len(entries):
        print(
            f"  ! {url}: {len(entries)} stops in JS but {len(distances)} sidebar "
            f"entries - distances padded/truncated to match",
            file=sys.stderr,
        )

    return [
        {
            "stop_id": i + 1,
            "stop_name_ro": name,
            "stop_lat": float(lat),
            "stop_lon": float(lng),
            "direction": route_title,
            "distance_to_next": distances[i] if i < len(distances) else "0 m",
        }
        for i, (name, lat, lng) in enumerate(entries)
    ]


def job(line, slug, folder, infix, lang, suffix):
    url = f"{BASE}/jarat-{slug}{infix}{suffix}.html"
    page = fetch(url)
    if page is None:
        return ("missing", line, folder, lang, url, 0)
    stops = parse_page(page, url)
    out = OUT_ROOT / f"line-{line}" / folder / f"{line}-{lang}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(stops, indent=2, ensure_ascii=False), encoding="utf-8")
    return ("ok", line, folder, lang, url, len(stops))


def main():
    jobs = [
        (line, slug, folder, infix, lang, suffix)
        for line, slug in LINES
        for folder, infix in DIRECTIONS
        for lang, suffix in LANGS
    ]
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda a: job(*a), jobs))

    written = [r for r in results if r[0] == "ok"]
    missing = [r for r in results if r[0] == "missing"]
    for status, line, folder, lang, url, count in results:
        mark = "ok " if status == "ok" else "404"
        detail = f"{count} stops" if status == "ok" else "no such page"
        print(f"{mark}  line-{line}/{folder}/{line}-{lang}.json  {detail}  <- {url}")
    print(f"\n{len(written)} files written, {len(missing)} pages absent (circular lines).")


if __name__ == "__main__":
    main()
