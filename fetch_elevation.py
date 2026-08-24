#!/usr/bin/env python3
"""Fetch and sample the one public SRTM-compatible elevation tile we need.

The browser never sees this raw raster and never calls an elevation API.  It is
only a reproducible build input for the offline bicycle graph.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import math
import struct
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TERRAIN = ROOT / "terrain"
TILE_NAME = "N45E025.hgt"
TILE_PATH = TERRAIN / TILE_NAME
SOURCE_PATH = TERRAIN / "elevation-source.json"
URL = "https://s3.amazonaws.com/elevation-tiles-prod/skadi/N45/N45E025.hgt.gz"
NODATA = -32768


class HgtTile:
    """One WGS84 one-degree big-endian HGT raster, sampled bilinearly."""

    def __init__(self, path: Path = TILE_PATH):
        self.raw = path.read_bytes()
        if len(self.raw) % 2:
            raise ValueError(f"{path} has an odd byte length")
        self.size = math.isqrt(len(self.raw) // 2)
        if self.size < 2 or self.size * self.size * 2 != len(self.raw):
            raise ValueError(f"{path} is not a square signed-16 HGT raster")
        self.values = memoryview(self.raw).cast("B")

    def value(self, row: int, column: int) -> int:
        offset = 2 * (row * self.size + column)
        return struct.unpack_from(">h", self.values, offset)[0]

    def valid_near(self, row: int, column: int) -> int:
        value = self.value(row, column)
        if value != NODATA:
            return value
        for radius in range(1, 32):
            for y in range(max(0, row - radius), min(self.size, row + radius + 1)):
                for x in (max(0, column - radius), min(self.size - 1, column + radius)):
                    candidate = self.value(y, x)
                    if candidate != NODATA:
                        return candidate
            for x in range(max(0, column - radius), min(self.size, column + radius + 1)):
                for y in (max(0, row - radius), min(self.size - 1, row + radius)):
                    candidate = self.value(y, x)
                    if candidate != NODATA:
                        return candidate
        raise ValueError("HGT tile contains no usable elevation near requested point")

    def sample(self, point: tuple[float, float]) -> int:
        lon, lat = point
        if not 25 <= lon <= 26 or not 45 <= lat <= 46:
            raise ValueError(f"point outside {TILE_NAME}: {point}")
        scale = self.size - 1
        x = max(0.0, min(scale, (lon - 25) * scale))
        y = max(0.0, min(scale, (46 - lat) * scale))
        left, top = math.floor(x), math.floor(y)
        right, bottom = min(scale, left + 1), min(scale, top + 1)
        dx, dy = x - left, y - top
        a = self.valid_near(top, left)
        b = self.valid_near(top, right)
        c = self.valid_near(bottom, left)
        d = self.valid_near(bottom, right)
        return round((a * (1 - dx) + b * dx) * (1 - dy) + (c * (1 - dx) + d * dx) * dy)


def main() -> int:
    TERRAIN.mkdir(exist_ok=True)
    with urllib.request.urlopen(URL, timeout=60) as response:
        compressed = response.read()
    raw = gzip.decompress(compressed)
    TILE_PATH.write_bytes(raw)
    tile = HgtTile()
    SOURCE_PATH.write_text(json.dumps({
        "url": URL,
        "tile": TILE_NAME,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "attribution": "AWS Open Data Terrain Tiles; SRTM elevation data",
        "rasterSize": tile.size,
    }, indent=2) + "\n", encoding="utf-8")
    print(f"{TILE_NAME}: {tile.size}×{tile.size}, {len(raw) // 1024 // 1024} MiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
