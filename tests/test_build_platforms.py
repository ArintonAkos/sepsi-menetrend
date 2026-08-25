import unittest

from build_map import load_directions
from build_platforms import load_osm_platforms, load_overrides, resolve_platforms


def direction(line, direction_name, name, lat, lon):
    return {
        "line": line,
        "direction": direction_name,
        "stops": [{
            "name": {"ro": name, "hu": name},
            "stop_lat": lat,
            "stop_lon": lon,
        }],
    }


def node(node_id, name, lat, lon):
    return {
        "id": node_id,
        "lat": lat,
        "lon": lon,
        "tags": {
            "name": name,
            "name:hu": name,
            "public_transport": "platform",
            "highway": "bus_stop",
        },
    }


class PlatformResolutionTests(unittest.TestCase):
    def test_one_osm_platform_is_not_duplicated_for_opposite_calls(self):
        directions = [
            direction("1", "depart", "Parcul Elisabeta", 45.8643, 25.7866),
            direction("1", "return", "Parcul Elisabeta", 45.8643, 25.7866),
        ]
        osm = [node(1248719238, "Parcul Elisabeta", 45.8641156, 25.7865231)]

        topology = resolve_platforms(directions, osm, {"calls": {}})

        self.assertEqual(len(topology["platforms"]), 1)
        self.assertEqual(
            set(topology["call_platforms"].values()),
            {topology["platforms"][0]["id"]},
        )
        self.assertEqual(topology["platforms"][0]["source"], "osm")

    def test_same_name_at_distinct_source_coordinates_stays_separate(self):
        directions = [
            direction("3", "depart", "Fabrica de Țigarete", 45.8589, 25.7826),
            direction("5", "depart", "Fabrica de Țigarete", 45.8584, 25.7822),
        ]

        topology = resolve_platforms(directions, [], {"calls": {}})

        self.assertEqual(len(topology["platforms"]), 2)
        self.assertEqual(len(set(topology["call_platforms"].values())), 2)
        self.assertEqual(
            {platform["source"] for platform in topology["platforms"]},
            {"source-fallback"},
        )

    def test_line_six_uses_two_kerbs_at_milk_factory_and_sport_street(self):
        directions = load_directions()
        topology = resolve_platforms(directions, load_osm_platforms(), load_overrides())

        def platform_for(direction_name, name):
            direction = next(item for item in directions
                             if item["line"] == "6" and item["direction"] == direction_name)
            index = next(index for index, stop in enumerate(direction["stops"])
                         if stop["name"]["ro"] == name)
            return topology["call_platforms"][("6", direction_name, index)]

        self.assertNotEqual(platform_for("depart-to-arena", "Fabrica de Lapte"),
                            platform_for("depart-from-arena", "Fabrica de Lapte"))
        self.assertNotEqual(platform_for("depart-to-arena", "Str. Sporturilor"),
                            platform_for("depart-from-arena", "Str. Sporturilor"))


if __name__ == "__main__":
    unittest.main()
