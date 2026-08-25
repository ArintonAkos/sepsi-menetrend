import unittest

from build_official_board_audit import render_audit, unresolved_boards


class OfficialBoardAuditTests(unittest.TestCase):
    def test_lists_an_unbound_column_with_each_candidate_platform(self):
        entries = [{
            "line": "4", "direction": "depart", "stop_ro": "Str. Constructorilor 2",
            "destination": "Str. Fabricii / Gyár utca",
        }]
        directions = [{
            "line": "4", "direction": "depart-from-campul", "source_direction": "depart",
            "destination": "Str. Fabricii / Gyár utca",
            "stops": [
                {"name": {"ro": "Câmpul Frumos"}, "stop_lat": 45.8550, "stop_lon": 25.8140},
                {"name": {"ro": "Str. Constructorilor 2"}, "stop_lat": 45.8558, "stop_lon": 25.8147},
                {"name": {"ro": "Str. Constructorilor 1"}, "stop_lat": 45.8566, "stop_lon": 25.8153},
            ],
        }]
        topology = {"platforms": [
            {"id": "left", "point": [45.8557, 25.8147]},
            {"id": "right", "point": [45.8559, 25.8148]},
        ], "call_platforms": {("4", "depart-from-campul", 1): "right"}}

        unresolved = unresolved_boards(entries, {}, directions, topology,
                                       {"left": "P75", "right": "P76"})

        self.assertEqual(unresolved[0]["candidates"], [{
            "stop_id": "P76", "direction": "depart-from-campul", "index": 1,
            "point": [45.8559, 25.8148],
            "previous": {"name": "Câmpul Frumos", "point": [45.8550, 25.8140]},
            "next": {"name": "Str. Constructorilor 1", "point": [45.8566, 25.8153]},
        }])

    def test_renders_local_choices_and_json_export_without_a_server(self):
        page = render_audit([{
            "key": ["4", "depart", "Str. Constructorilor 2", "Str. Fabricii / Gyár utca"],
            "candidates": [{"stop_id": "P76", "direction": "depart-from-campul",
                            "index": 0, "point": [45.8559, 25.8148],
                            "previous": {"name": "Câmpul Frumos", "point": [45.8550, 25.8140]},
                            "next": {"name": "Str. Constructorilor 1", "point": [45.8566, 25.8153]}}],
        }])

        self.assertIn('type="radio"', page)
        self.assertIn("localStorage", page)
        self.assertIn("JSON.stringify", page)
        self.assertIn("P76", page)
        self.assertIn("Câmpul Frumos", page)
        self.assertIn("Str. Constructorilor 1", page)
        self.assertIn('class="mini-map"', page)


if __name__ == "__main__":
    unittest.main()
