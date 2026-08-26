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

    def test_lines_five_and_six_share_the_two_milk_factory_kerbs(self):
        directions = load_directions()
        topology = resolve_platforms(directions, load_osm_platforms(), load_overrides())

        milk_platforms = [
            platform for platform in topology["platforms"]
            if platform["name"]["ro"] == "Fabrica de Lapte"
        ]

        self.assertEqual(
            {platform["id"] for platform in milk_platforms},
            {"manual-6-to-arena-lapte", "manual-6-from-arena-lapte"},
        )

        to_arena = next(item for item in directions
                        if item["line"] == "5" and item["direction"] == "depart-to-arena")
        from_arena = next(item for item in directions
                          if item["line"] == "5" and item["direction"] == "depart-from-arena")
        milk_calls = [
            topology["call_platforms"][("5", direction["direction"], index)]
            for direction in (to_arena, from_arena)
            for index, stop in enumerate(direction["stops"])
            if stop["name"]["ro"] == "Fabrica de Lapte"
        ]
        self.assertEqual(
            milk_calls,
            ["manual-6-to-arena-lapte", "manual-6-from-arena-lapte"],
        )

    def test_sport_street_uses_its_two_real_osm_platforms(self):
        directions = load_directions()
        topology = resolve_platforms(directions, load_osm_platforms(), load_overrides())

        sport_platforms = [
            platform for platform in topology["platforms"]
            if platform["name"]["ro"] == "Str. Sporturilor"
        ]
        self.assertEqual(
            {platform["id"] for platform in sport_platforms},
            {"osm-1561627779", "osm-1248719235"},
        )

    def test_line_2d_uses_the_opposite_kalvin_kerb_toward_campul_frumos(self):
        directions = load_directions()
        topology = resolve_platforms(directions, load_osm_platforms(), load_overrides())

        def kalvin_platform(direction_name):
            direction = next(item for item in directions
                             if item["line"] == "2D" and item["direction"] == direction_name)
            index = next(index for index, stop in enumerate(direction["stops"])
                         if stop["name"]["ro"] == "Piața Kálvin")
            return topology["call_platforms"][("2D", direction_name, index)]

        self.assertEqual(kalvin_platform("depart"),
                         "source-piatakalvin-45.870900-25.788700")
        self.assertEqual(kalvin_platform("return"),
                         "source-piatakalvin-45.870900-25.788500")

    def test_line_2d_uses_the_outbound_ciucului_two_kerb_toward_campul_frumos(self):
        directions = load_directions()
        topology = resolve_platforms(directions, load_osm_platforms(), load_overrides())
        direction = next(item for item in directions
                         if item["line"] == "2D" and item["direction"] == "depart")
        index = next(index for index, stop in enumerate(direction["stops"])
                     if stop["name"]["ro"] == "Str. Ciucului 2")

        self.assertEqual(
            topology["call_platforms"][("2D", "depart", index)],
            "source-strciucului2-45.871400-25.795100",
        )

    def test_debren_keeps_the_2d_and_six_return_directions_on_the_other_kerb(self):
        directions = load_directions()
        topology = resolve_platforms(directions, load_osm_platforms(), load_overrides())

        def platform_for(line, direction_name):
            direction = next(item for item in directions
                             if item["line"] == line and item["direction"] == direction_name)
            index = next(index for index, stop in enumerate(direction["stops"])
                         if stop["name"]["ro"] == "Debren")
            return topology["call_platforms"][(line, direction_name, index)]

        self.assertEqual(platform_for("2D", "depart"), "osm-1706007748")
        self.assertEqual(platform_for("2D", "return"), "osm-1706007749")
        self.assertEqual(platform_for("6", "depart-to-arena"), "osm-1706007748")
        self.assertEqual(platform_for("6", "depart-from-arena"), "osm-1706007749")


if __name__ == "__main__":
    unittest.main()
