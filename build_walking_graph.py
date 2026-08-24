#!/usr/bin/env python3
"""Compile one OSM extract into compact walking and bicycle graphs.

The browser router consumes the JSON emitted by this module.  Keeping the
compiler dependency-free makes the data build reproducible in CI and keeps the
runtime graph independent from any commercial routing API.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from fetch_elevation import HgtTile, TILE_PATH

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "web" / "public" / "data" / "walking-graph.json"
BIKE_OUT = ROOT / "web" / "public" / "data" / "bicycle-graph.json"

WALKABLE_HIGHWAYS = {
    "footway", "path", "pedestrian", "steps", "cycleway", "living_street",
    "residential", "service", "tertiary", "tertiary_link", "secondary",
    "secondary_link", "primary", "primary_link", "unclassified", "track",
}
BLOCKED_ACCESS = {"no", "private"}
BIKEABLE_HIGHWAYS = {
    "cycleway", "path", "pedestrian", "living_street", "residential", "service",
    "tertiary", "tertiary_link", "secondary", "secondary_link", "primary",
    "primary_link", "unclassified", "track",
}
FLAT_BICYCLE_METRES_PER_MINUTE = 250
MIN_BICYCLE_METRES_PER_MINUTE = 70
MAX_BICYCLE_METRES_PER_MINUTE = 300


def bicycle_seconds(metres: int, from_elevation: int, to_elevation: int) -> int:
    """A deliberately comfortable city-bike time, bounded in both directions."""
    grade = max(-0.12, min(0.12, (to_elevation - from_elevation) / metres))
    speed = FLAT_BICYCLE_METRES_PER_MINUTE * (
        1 - 4.0 * max(grade, 0) + 1.1 * max(-grade, 0)
    )
    speed = min(MAX_BICYCLE_METRES_PER_MINUTE, max(MIN_BICYCLE_METRES_PER_MINUTE, speed))
    return max(1, round(60 * metres / speed))


def walkable(tags: dict[str, str]) -> bool:
    """Whether a way belongs to the public pedestrian network."""
    if tags.get("highway") not in WALKABLE_HIGHWAYS or tags.get("area") == "yes":
        return False
    if tags.get("foot") in BLOCKED_ACCESS:
        return False
    # Explicit pedestrian permission is more precise than the broad access tag.
    if tags.get("access") in BLOCKED_ACCESS and tags.get("foot") != "yes":
        return False
    return True


def bikeable(tags: dict[str, str]) -> bool:
    """Whether a way is a public, bicycle-permitted part of the road graph."""
    highway = tags.get("highway")
    if highway == "footway":
        # A footway is not a cycleway merely because it is connected on the map.
        if tags.get("bicycle") not in {"yes", "designated", "permissive"}:
            return False
    elif highway not in BIKEABLE_HIGHWAYS:
        return False
    if tags.get("area") == "yes" or tags.get("bicycle") in BLOCKED_ACCESS:
        return False
    if tags.get("access") in BLOCKED_ACCESS and tags.get("bicycle") != "yes":
        return False
    return True


def metres_between(a: tuple[float, float], b: tuple[float, float]) -> int:
    """Round a short OSM segment to metres without relying on external GIS libs."""
    lon_a, lat_a = a
    lon_b, lat_b = b
    phi_a, phi_b = math.radians(lat_a), math.radians(lat_b)
    delta_phi = math.radians(lat_b - lat_a)
    delta_lambda = math.radians(lon_b - lon_a)
    h = math.sin(delta_phi / 2) ** 2 + math.cos(phi_a) * math.cos(phi_b) * math.sin(delta_lambda / 2) ** 2
    return max(1, round(6_371_000 * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))))


def one_way_for_foot(tags: dict[str, str]) -> bool:
    """OSM road one-way does not normally restrict walking; foot-specific does."""
    return tags.get("oneway:foot") in {"yes", "1", "true"}


def bicycle_direction(tags: dict[str, str]) -> int:
    """1 normal, -1 reverse, 0 bidirectional for bicycle traffic."""
    value = tags.get("oneway:bicycle", tags.get("oneway", "")).lower()
    if value in {"yes", "1", "true"}:
        return 1
    if value == "-1":
        return -1
    return 0


def build_graph(osm: dict[str, Any], mode: str = "walking", elevation_at=None) -> dict[str, Any]:
    """Build bidirectional pedestrian adjacency from OSM nodes and ways.

    Pedestrian one-way tagging is added when compiling the real extract; this
    minimal public function first establishes correct path/access filtering and
    stable vertex ordering for unit tests.
    """
    if mode not in {"walking", "bicycle"}:
        raise ValueError(f"unknown graph mode: {mode}")
    allowed = walkable if mode == "walking" else bikeable
    nodes = {
        element["id"]: (element["lon"], element["lat"])
        for element in osm.get("elements", []) if element.get("type") == "node"
    }
    accepted = [element for element in osm.get("elements", [])
                if element.get("type") == "way" and allowed(element.get("tags", {}))]
    used = {node_id for way in accepted for node_id in way.get("nodes", []) if node_id in nodes}
    order = sorted(used)
    index = {node_id: i for i, node_id in enumerate(order)}
    edges: list[dict[int, int]] = [{} for _ in order]
    points = [nodes[node_id] for node_id in order]
    elevations = [round(elevation_at(point)) if elevation_at else 0 for point in points]

    for way in accepted:
        route = way.get("nodes", [])
        for left, right in zip(route, route[1:]):
            if left not in index or right not in index:
                continue
            a, b = index[left], index[right]
            distance = metres_between(nodes[left], nodes[right])
            tags = way.get("tags", {})
            direction = 0 if mode == "walking" else bicycle_direction(tags)
            if mode == "walking" and one_way_for_foot(tags):
                direction = 1
            if direction >= 0:
                edges[a][b] = min(edges[a].get(b, distance), distance)
            if direction <= 0:
                edges[b][a] = min(edges[b].get(a, distance), distance)

    graph = {
        "version": 1,
        "vertices": [[round(point[0], 6), round(point[1], 6)] for point in points],
        "edges": [sorted(neighbours) for neighbours in edges],
        "metres": [[neighbours[neighbour] for neighbour in sorted(neighbours)] for neighbours in edges],
    }
    if mode == "bicycle":
        graph["version"] = 2
        graph["elevationMetres"] = elevations
        graph["seconds"] = [
            [bicycle_seconds(neighbours[neighbour], elevations[index], elevations[neighbour])
             for neighbour in sorted(neighbours)]
            for index, neighbours in enumerate(edges)
        ]
    return graph


def main() -> int:
    source = ROOT / "osm" / "pedestrian.json"
    if not source.exists():
        raise SystemExit("missing osm/pedestrian.json; run fetch_pedestrian_osm.py first")
    osm = json.loads(source.read_text(encoding="utf-8"))
    graph = build_graph(osm)
    if not TILE_PATH.exists():
        raise SystemExit("missing terrain/N45E025.hgt; run fetch_elevation.py first")
    elevation = HgtTile()
    bicycle = build_graph(osm, mode="bicycle", elevation_at=elevation.sample)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(graph, separators=(",", ":")), encoding="utf-8")
    BIKE_OUT.write_text(json.dumps(bicycle, separators=(",", ":")), encoding="utf-8")
    print(f"walking: {len(graph['vertices'])} vertices, {sum(map(len, graph['edges']))} directed edges")
    print(f"bicycle: {len(bicycle['vertices'])} vertices, {sum(map(len, bicycle['edges']))} directed edges")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
