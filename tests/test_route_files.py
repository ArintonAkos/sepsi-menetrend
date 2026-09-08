"""Structural + re-anchor tests for the hand-maintained line-*/[direction].json files."""
import json
import unittest
from pathlib import Path

from validate_route_files import check, check_data


def board_line_stops(line):
    """The set of stop_ro names the Sept 7 board lists for a given line."""
    tt = json.loads(Path("timetable.json").read_text(encoding="utf-8"))
    return {tp["stop_ro"] for tp in tt["timepoints"] if tp["line"] == line}


def _load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


class RouteFileValidatorTests(unittest.TestCase):
    def test_rejects_gap_in_sequence(self):
        data = {"line":"X","direction":"depart","circular":False,"stops":[
            {"stop_sequence":1,"name":{"ro":"A","hu":"a"},"stop_lat":45.86,"stop_lon":25.78,"distance_to_next_m":100},
            {"stop_sequence":3,"name":{"ro":"B","hu":"b"},"stop_lat":45.86,"stop_lon":25.79,"distance_to_next_m":None}]}
        self.assertIn("sequence", " ".join(check_data(data)).lower())

    def test_rejects_empty_name(self):
        data = {"line":"X","direction":"depart","circular":False,"stops":[
            {"stop_sequence":1,"name":{"ro":"A","hu":""},"stop_lat":45.86,"stop_lon":25.78,"distance_to_next_m":100},
            {"stop_sequence":2,"name":{"ro":"B","hu":"b"},"stop_lat":45.86,"stop_lon":25.79,"distance_to_next_m":None}]}
        self.assertIn("name.hu", " ".join(check_data(data)))

    def test_rejects_out_of_area_coord(self):
        data = {"line":"X","direction":"depart","circular":False,"stops":[
            {"stop_sequence":1,"name":{"ro":"A","hu":"a"},"stop_lat":47.0,"stop_lon":25.78,"distance_to_next_m":100},
            {"stop_sequence":2,"name":{"ro":"B","hu":"b"},"stop_lat":45.86,"stop_lon":25.79,"distance_to_next_m":None}]}
        self.assertIn("lat", " ".join(check_data(data)).lower())

    def test_rejects_bad_last_distance(self):
        data = {"line":"X","direction":"depart","circular":False,"stops":[
            {"stop_sequence":1,"name":{"ro":"A","hu":"a"},"stop_lat":45.86,"stop_lon":25.78,"distance_to_next_m":100},
            {"stop_sequence":2,"name":{"ro":"B","hu":"b"},"stop_lat":45.86,"stop_lon":25.79,"distance_to_next_m":50}]}
        self.assertIn("last stop", " ".join(check_data(data)).lower())

    def test_rejects_circular_mismatch(self):
        data = {"line":"X","direction":"depart","circular":True,"stops":[
            {"stop_sequence":1,"name":{"ro":"A","hu":"a"},"stop_lat":45.86,"stop_lon":25.78,"distance_to_next_m":100},
            {"stop_sequence":2,"name":{"ro":"B","hu":"b"},"stop_lat":45.86,"stop_lon":25.79,"distance_to_next_m":None}]}
        self.assertIn("circular", " ".join(check_data(data)).lower())

    def test_accepts_a_clean_circular(self):
        data = {"line":"X","direction":"depart","circular":True,"stops":[
            {"stop_sequence":1,"name":{"ro":"A","hu":"a"},"stop_lat":45.86,"stop_lon":25.78,"distance_to_next_m":100},
            {"stop_sequence":2,"name":{"ro":"B","hu":"b"},"stop_lat":45.86,"stop_lon":25.79,"distance_to_next_m":120},
            {"stop_sequence":3,"name":{"ro":"A","hu":"a"},"stop_lat":45.86,"stop_lon":25.78,"distance_to_next_m":None}]}
        self.assertEqual(check_data(data), [])

    def test_every_current_route_file_passes(self):
        """Controller ran check_data against all live line-*/{depart,return}.json:
        0 failures. Lock that in so a later hand-edit cannot regress it silently."""
        for p in sorted(Path(".").glob("line-*/depart.json")) + \
                sorted(Path(".").glob("line-*/return.json")):
            self.assertEqual(check(p), [], str(p))


class Line5AnchorTests(unittest.TestCase):
    def test_line5_starts_at_dozsa_gyorgy(self):
        d = json.load(open("line-5/depart.json"))
        self.assertEqual(d["stops"][0]["name"]["ro"], "Str. Dózsa György")
        self.assertEqual(d["stops"][-1]["name"]["ro"], "Str. Dózsa György")

    def test_line5_is_still_a_29_stop_closed_circular(self):
        d = _load("line-5/depart.json")
        self.assertEqual(len(d["stops"]), 29)
        self.assertTrue(d["circular"])
        self.assertTrue(d["closes_loop_at_start"])
        first, last = d["stops"][0], d["stops"][-1]
        self.assertEqual((first["stop_lat"], first["stop_lon"]),
                         (last["stop_lat"], last["stop_lon"]))
        self.assertIsNone(last["distance_to_next_m"])

    def test_line5_keeps_the_same_stop_multiset_after_rotation(self):
        """Same physical loop, just rotated: the distinct stops (everything bar
        the loop-closing duplicate) are an exact permutation of the old file."""
        d = _load("line-5/depart.json")
        cur = _load(".superpowers/sdd/2026-09-09-sept-7-timetable/task2-data/"
                    "line-5-depart-CURRENT.json")

        def bag(doc):
            return sorted((s["name"]["ro"], s["stop_lat"], s["stop_lon"])
                          for s in doc["stops"][:-1])

        self.assertEqual(bag(d), bag(cur))

    def test_line5_headsign_names_dozsa_gyorgy(self):
        d = _load("line-5/depart.json")
        self.assertEqual(d["headsign"]["ro"], "Str. Dózsa György – traseu circular")
        self.assertEqual(d["headsign"]["hu"], "Dózsa György utca – körjárat")

    def test_line5d_depart_is_re_anchored(self):
        d = _load("line-5D/depart.json")
        self.assertEqual(len(d["stops"]), 17)
        self.assertEqual(d["stops"][0]["name"]["ro"], "Str. Dózsa György")
        self.assertEqual(d["stops"][1]["name"]["ro"], "Izvorul Sulfuros")
        self.assertEqual(d["stops"][2]["name"]["ro"], "Str. József Attila 2")
        self.assertEqual(d["stops"][-1]["name"]["ro"], "Multi-Trans")
        self.assertEqual(d["headsign"]["ro"], "Str. Dózsa György → Câmpul Frumos")
        self.assertEqual(d["headsign"]["hu"], "Dózsa György utca → Szépmező")

    def test_line5d_depart_does_not_gain_constructorilor(self):
        d = _load("line-5D/depart.json")
        self.assertNotIn("Str. Constructorilor",
                         {s["name"]["ro"] for s in d["stops"]})

    def test_line5d_return_is_truncated_to_dozsa_gyorgy(self):
        d = _load("line-5D/return.json")
        self.assertEqual(len(d["stops"]), 12)
        self.assertEqual(d["stops"][0]["name"]["ro"], "Multi-Trans")
        self.assertEqual(d["stops"][-1]["name"]["ro"], "Str. Dózsa György")
        self.assertEqual(d["stops"][-2]["name"]["ro"], "Str. Dealului")
        self.assertIsNone(d["stops"][-1]["distance_to_next_m"])
        self.assertEqual(d["headsign"]["ro"], "Câmpul Frumos → Str. Dózsa György")
        self.assertEqual(d["headsign"]["hu"], "Szépmező → Dózsa György utca")

    def test_touched_route_files_pass_the_validator(self):
        for p in ("line-5/depart.json", "line-5D/depart.json", "line-5D/return.json"):
            self.assertEqual(check(p), [], p)


class BoardCoverageTests(unittest.TestCase):
    @unittest.skipUnless(Path("timetable.json").exists(), "timetable.json not built yet")
    def test_line5_route_file_covers_every_board_stop(self):
        d = _load("line-5/depart.json")
        route_names = {s["name"]["ro"] for s in d["stops"]}
        self.assertEqual(board_line_stops("5") - route_names, set())


if __name__ == "__main__":
    unittest.main()
