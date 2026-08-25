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
            "stops": [{"name": {"ro": "Str. Constructorilor 2"}}],
        }]
        topology = {"platforms": [
            {"id": "left", "point": [45.8557, 25.8147]},
            {"id": "right", "point": [45.8559, 25.8148]},
        ], "call_platforms": {("4", "depart-from-campul", 0): "right"}}

        unresolved = unresolved_boards(entries, {}, directions, topology,
                                       {"left": "P75", "right": "P76"})

        self.assertEqual(unresolved[0]["candidates"], [{
            "stop_id": "P76", "direction": "depart-from-campul", "index": 0,
            "point": [45.8559, 25.8148],
        }])

    def test_renders_local_choices_and_json_export_without_a_server(self):
        page = render_audit([{
            "key": ["4", "depart", "Str. Constructorilor 2", "Str. Fabricii / Gyár utca"],
            "candidates": [{"stop_id": "P76", "direction": "depart-from-campul",
                            "index": 0, "point": [45.8559, 25.8148]}],
        }])

        self.assertIn('type="radio"', page)
        self.assertIn("localStorage", page)
        self.assertIn("JSON.stringify", page)
        self.assertIn("P76", page)


if __name__ == "__main__":
    unittest.main()
