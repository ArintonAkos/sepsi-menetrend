import unittest

from build_web_data import official_boards, pattern_key


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
        })

        self.assertEqual(boards, [{
            "stopRo": "Gara CFR", "lineId": "2D",
            "destination": "Câmpul Frumos / Szépmező",
            "weekday": [305, 380], "weekend": [305],
        }])

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
