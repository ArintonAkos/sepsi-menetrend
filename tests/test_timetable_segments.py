import json
import unittest
from pathlib import Path

from timetable_segments import expand_timetable_segments


class TimetableSegmentTests(unittest.TestCase):
    def test_no_line_needs_loop_segments_any_more(self):
        """Every line (1, 3, 4, 5 included) now has its own clean depart/return
        pages on multitrans.ro (published 2026-09-15), so there is no more
        single shared circular page to slice by destination for any of them -
        timetable_segments.json's whole mechanism is retired, not just for the
        lines 2/6 re-anchoring already covered above."""
        segments = json.loads((Path(__file__).resolve().parents[1] /
                               "timetable_segments.json").read_text(encoding="utf-8"))

        self.assertEqual(segments, {})

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

    def test_circular_segment_can_wrap_across_the_source_file_start(self):
        """A public headsign can begin before index zero of a circular page.

        The final repeated terminal is the real call before the first retained
        call after the file's artificial cut; it must not be discarded just
        because the route JSON happens to start at that terminal.
        """
        direction = {
            "line": "2", "direction": "depart",
            "stops": [{"name": {"ro": name}} for name in [
                "Bartók", "Dealului", "Gara", "Kórház", "Vadász", "Bartók",
            ]],
            "source_stop_indexes": [0, 1, 2, 3, 4, 5],
        }
        segments = {"2-depart": [{
            "id": "to-gara", "start": 3, "end": 2,
            "destination": "Gara / Vasútállomás",
        }]}

        result = expand_timetable_segments([direction], segments)

        self.assertEqual(result[0]["source_stop_indexes"], [3, 4, 5, 1, 2])
        self.assertEqual([stop["name"]["ro"] for stop in result[0]["stops"]],
                         ["Kórház", "Vadász", "Bartók", "Dealului", "Gara"])


if __name__ == "__main__":
    unittest.main()
