import unittest

from build_web_data import official_boards


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


if __name__ == "__main__":
    unittest.main()
