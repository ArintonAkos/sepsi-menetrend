import unittest

from build_web_data import official_board_bindings, official_boards, pattern_key, platform_side


class OfficialBoardTests(unittest.TestCase):
    def test_keeps_each_official_stop_board_column_without_estimation(self):
        boards = official_boards({
            "timepoints": [
                {
                    "line": "2D", "stop_ro": "Gara CFR", "stop_hu": "Vasútállomás",
                    "destination": "Câmpul Frumos / Szépmező",
                    "times": {"weekday": ["05:05", "06:20"], "weekend": ["05:05"]},
                },
            ]
        }, {("2D", "depart", "Gara CFR", "Câmpul Frumos / Szépmező"): "P52"})

        self.assertEqual(boards, [{
            "stopId": "P52", "stopRo": "Gara CFR", "lineId": "2D",
            "destination": "Câmpul Frumos / Szépmező",
            "weekday": [305, 380], "weekend": [305],
        }])

    def test_rejects_an_official_board_without_a_physical_platform_binding(self):
        with self.assertRaisesRegex(ValueError, "unbound official board"):
            official_boards({"timepoints": [{
                "line": "4", "direction": "depart", "stop_ro": "Str. Constructorilor 2",
                "destination": "Str. Fabricii / Gyár utca",
                "times": {"weekday": ["04:21"], "weekend": []},
            }]}, {})

    def test_binds_destination_specific_circular_columns_to_different_platforms(self):
        directions = [
            {"line": "4", "direction": "depart-to-campul", "source_direction": "depart",
             "destination": "Câmpul Frumos / Szépmező",
             "stops": [{"name": {"ro": "Str. Constructorilor 2"}}]},
            {"line": "4", "direction": "depart-from-campul", "source_direction": "depart",
             "destination": "Str. Fabricii / Gyár utca",
             "stops": [{"name": {"ro": "Str. Constructorilor 2"}}]},
        ]
        topology = {"call_platforms": {
            ("4", "depart-to-campul", 0): "left",
            ("4", "depart-from-campul", 0): "right",
        }}
        timetable = {"timepoints": [
            {"line": "4", "direction": "depart", "stop_ro": "Str. Constructorilor 2",
             "destination": "Câmpul Frumos / Szépmező"},
            {"line": "4", "direction": "depart", "stop_ro": "Str. Constructorilor 2",
             "destination": "Str. Fabricii / Gyár utca"},
        ]}

        bindings = official_board_bindings(timetable, directions, topology,
                                           {"left": "P75", "right": "P76"})

        self.assertEqual(bindings[("4", "depart", "Str. Constructorilor 2",
                                   "Câmpul Frumos / Szépmező")], "P75")
        self.assertEqual(bindings[("4", "depart", "Str. Constructorilor 2",
                                   "Str. Fabricii / Gyár utca")], "P76")

    def test_binds_a_circular_board_to_the_pass_nearest_its_displayed_destination(self):
        directions = [{
            "line": "2", "direction": "depart", "source_direction": "depart",
            "circular": True,
            "stops": [
                {"name": {"ro": "Str. Bartók Béla", "hu": "Bartók Béla utca"}},
                {"name": {"ro": "Piața Kálvin", "hu": "Kálvin tér"}},
                {"name": {"ro": "Cartierul Ciucului", "hu": "Csíki negyed"}},
                {"name": {"ro": "Gara CFR", "hu": "Vasútállomás"}},
                {"name": {"ro": "Cartierul Ciucului", "hu": "Csíki negyed"}},
                {"name": {"ro": "Str. Bartók Béla", "hu": "Bartók Béla utca"}},
            ],
        }]
        topology = {"call_platforms": {
            ("2", "depart", 2): "toward-gara",
            ("2", "depart", 4): "toward-bartok",
        }, "platforms": []}
        timetable = {"timepoints": [
            {"line": "2", "direction": "depart", "stop_ro": "Cartierul Ciucului",
             "destination": "Gara / Vasútállomás"},
            {"line": "2", "direction": "depart", "stop_ro": "Cartierul Ciucului",
             "destination": "Str. Bartók Béla / Bartók Béla utca"},
        ]}

        bindings = official_board_bindings(timetable, directions, topology,
                                           {"toward-gara": "P14", "toward-bartok": "P13"})

        self.assertEqual(bindings[("2", "depart", "Cartierul Ciucului",
                                   "Gara / Vasútállomás")], "P14")
        self.assertEqual(bindings[("2", "depart", "Cartierul Ciucului",
                                   "Str. Bartók Béla / Bartók Béla utca")], "P13")

    def test_detects_the_right_hand_side_of_a_travel_vector(self):
        # Eastbound travel: south is the right side in Romania.
        self.assertEqual(platform_side([45.0, 25.0], [45.0, 25.001],
                                       [44.9999, 25.0005]), "right")
        self.assertEqual(platform_side([45.0, 25.0], [45.0, 25.001],
                                       [45.0001, 25.0005]), "left")

    def test_keeps_a_separate_pattern_when_an_official_mid_route_call_differs(self):
        trip = {"route_id": "1", "shape_id": "1-depart"}
        normal = [
            {"stop_id": "A", "departure_time": "08:00:00"},
            {"stop_id": "B", "departure_time": "08:04:00"},
        ]
        published = [
            {"stop_id": "A", "departure_time": "08:00:00"},
            {"stop_id": "B", "departure_time": "08:05:00"},
        ]

        self.assertNotEqual(pattern_key(trip, normal), pattern_key(trip, published))


if __name__ == "__main__":
    unittest.main()
