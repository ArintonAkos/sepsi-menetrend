#!/usr/bin/env python3
"""Compile an OSM pedestrian extract into a compact directed graph.

The browser router consumes the JSON emitted by this module.  Keeping the
compiler dependency-free makes the data build reproducible in CI and keeps the
runtime graph independent from any commercial routing API.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "web" / "public" / "data" / "walking-graph.json"

WALKABLE_HIGHWAYS = {
    "footway", "path", "pedestrian", "steps", "cycleway", "living_street",
    "residential", "service", "tertiary", "tertiary_link", "secondary",
    "secondary_link", "primary", "primary_link", "unclassified", "track",
}
BLOCKED_ACCESS = {"no", "private"}


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


def build_graph(osm: dict[str, Any]) -> dict[str, Any]:
    """Build bidirectional pedestrian adjacency from OSM nodes and ways.

    Pedestrian one-way tagging is added when compiling the real extract; this
    minimal public function first establishes correct path/access filtering and
    stable vertex ordering for unit tests.
    """
    nodes = {
        element["id"]: (element["lon"], element["lat"])
        for element in osm.get("elements", []) if element.get("type") == "node"
    }
    accepted = [element for element in osm.get("elements", [])
                if element.get("type") == "way" and walkable(element.get("tags", {}))]
    used = {node_id for way in accepted for node_id in way.get("nodes", []) if node_id in nodes}
    order = sorted(used)
    index = {node_id: i for i, node_id in enumerate(order)}
    edges: list[dict[int, int]] = [{} for _ in order]

    for way in accepted:
        route = way.get("nodes", [])
        for left, right in zip(route, route[1:]):
            if left not in index or right not in index:
                continue
            a, b = index[left], index[right]
            distance = metres_between(nodes[left], nodes[right])
            edges[a][b] = min(edges[a].get(b, distance), distance)
            if not one_way_for_foot(way.get("tags", {})):
                edges[b][a] = min(edges[b].get(a, distance), distance)

    return {
        "version": 1,
        "vertices": [[round(nodes[node_id][0], 6), round(nodes[node_id][1], 6)] for node_id in order],
        "edges": [sorted(neighbours) for neighbours in edges],
        "metres": [[neighbours[neighbour] for neighbour in sorted(neighbours)] for neighbours in edges],
    }


def main() -> int:
    source = ROOT / "osm" / "pedestrian.json"
    if not source.exists():
        raise SystemExit("missing osm/pedestrian.json; run fetch_pedestrian_osm.py first")
    graph = build_graph(json.loads(source.read_text(encoding="utf-8")))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(graph, separators=(",", ":")), encoding="utf-8")
    print(f"{len(graph['vertices'])} vertices, {sum(map(len, graph['edges']))} directed edges")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
