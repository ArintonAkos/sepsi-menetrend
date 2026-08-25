import json
import unittest
from pathlib import Path

from timetable_segments import expand_timetable_segments


class TimetableSegmentTests(unittest.TestCase):
    def test_real_multitrans_turn_is_only_the_line_four_overlap(self):
        segments = json.loads((Path(__file__).resolve().parents[1] /
                               "timetable_segments.json").read_text(encoding="utf-8"))

        self.assertEqual(segments["3-depart"][0]["end"], 17)
        self.assertEqual(segments["4-depart"][0]["end"], 18)
        self.assertEqual(segments["4-depart"][1]["start"], 18)

    def test_keeps_same_name_calls_on_their_destination_specific_passes(self):
        direction = {
            "line": "4", "direction": "depart",
            "stops": [
                {"name": {"ro": "A"}},
                {"name": {"ro": "Str. Constructorilor 2"}},
                {"name": {"ro": "B"}},
                {"name": {"ro": "Str. Constructorilor 2"}},
                {"name": {"ro": "C"}},
            ],
            "source_stop_indexes": [0, 1, 2, 3, 4],
        }
        segments = {"4-depart": [
            {"id": "to-campul", "start": 0, "end": 2,
             "destination": "Câmpul Frumos / Szépmező"},
            {"id": "from-campul", "start": 2, "end": 4,
             "destination": "Str. Fabricii / Gyár utca"},
        ]}

        result = expand_timetable_segments([direction], segments)

        self.assertEqual([item["direction"] for item in result],
                         ["depart-to-campul", "depart-from-campul"])
        self.assertEqual(result[0]["source_stop_indexes"], [0, 1, 2])
        self.assertEqual(result[1]["source_stop_indexes"], [2, 3, 4])
        self.assertEqual(result[0]["destination"], "Câmpul Frumos / Szépmező")
        self.assertEqual(result[1]["destination"], "Str. Fabricii / Gyár utca")


if __name__ == "__main__":
    unittest.main()
