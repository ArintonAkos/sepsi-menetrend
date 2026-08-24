import unittest

from build_route_audit import render_route


class RouteAuditTests(unittest.TestCase):
    def test_marks_each_repeated_stop_as_a_separate_pass(self):
        direction = {
            "line": "3", "direction": "depart",
            "headsign": {"ro": "Circular", "hu": "Körjárat"},
            "stops": [
                {"name": {"ro": "Coșeni 1", "hu": "Szotyor 1"}},
                {"name": {"ro": "Coșeni 2", "hu": "Szotyor 2"}},
                {"name": {"ro": "Coșeni 1", "hu": "Szotyor 1"}},
            ],
        }

        page = render_route(direction)

        self.assertIn('data-pass="1/2"', page)
        self.assertIn('data-pass="2/2"', page)
        self.assertIn("forduló / hurok", page)

    def test_shows_the_platform_evidence_for_every_call(self):
        direction = {
            "line": "7", "direction": "depart",
            "headsign": {"ro": "Gară", "hu": "Vasútállomás"},
            "stops": [{
                "name": {"ro": "Parcul Elisabeta", "hu": "Erzsébet Park"},
                "stop_lat": 45.8643, "stop_lon": 25.7866,
            }],
        }
        topology = {
            "platforms": [{
                "id": "osm-1248719238",
                "point": [45.8641156, 25.7865231],
                "source": "osm", "osm_id": 1248719238,
            }],
            "call_platforms": {("7", "depart", 0): "osm-1248719238"},
        }

        page = render_route(direction, topology)

        self.assertIn('class="platform-id"', page)
        self.assertIn("osm-1248719238", page)
        self.assertIn("OSM #1248719238", page)
        self.assertIn("45.864116, 25.786523", page)
        self.assertIn("nyers: 45.864300, 25.786600", page)


if __name__ == "__main__":
    unittest.main()
