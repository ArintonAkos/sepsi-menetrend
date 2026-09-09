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

    def test_bidirectional_lines_two_and_six_have_no_loop_segments(self):
        """Fázis 2 re-anchored lines 2 and 6 to separate depart/return files.
        Each direction now carries one headsign, so there is no circuit to
        split and no segment key may remain."""
        segments = json.loads((Path(__file__).resolve().parents[1] /
                               "timetable_segments.json").read_text(encoding="utf-8"))

        self.assertNotIn("2-depart", segments)
        self.assertNotIn("6-depart", segments)

    def test_circular_lines_are_split_where_the_official_headsign_changes(self):
        """A single drawn loop is not one timetable run once its displayed
        destination changes at the railway station or Arena terminal."""
        segments = json.loads((Path(__file__).resolve().parents[1] /
                               "timetable_segments.json").read_text(encoding="utf-8"))

        self.assertEqual(segments["5-depart"], [
            {"id": "to-arena", "start": 0, "end": 17,
             "destination": "Arena Sepsi / Sepsi Aréna"},
            {"id": "from-arena", "start": 17, "end": 28,
             "destination": "Str. Dózsa György / Dózsa György utca"},
        ])

    def test_line5_segments_use_dozsa_gyorgy_anchor(self):
        raw = json.load(open("timetable_segments.json"))
        seg = {s["id"]: s for s in raw["5-depart"]}
        d = json.load(open("line-5/depart.json"))
        names = [s["name"]["ro"] for s in d["stops"]]
        self.assertEqual(names[seg["to-arena"]["start"]], "Str. Dózsa György")

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
