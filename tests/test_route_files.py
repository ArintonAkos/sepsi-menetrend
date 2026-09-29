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


# The board (fetch_timetable.py, printed station timetable) and the route
# files (fetch_multitrans.py + merge_lines.py, multitrans.ro/jaratok/ pages)
# are two independently-maintained sources that occasionally spell the same
# physical stop differently (case, abbreviation, or a genuinely different
# generic word for the same building). Coverage checks below compare through
# this alias map rather than raw string equality.
_BOARD_TO_ROUTE_ALIASES = {
    "Cap Linie Simeria": "Simeria (Str. Berzei)",
    "Cartierul Ciucului": "Cart. Ciucului",
    "Col. Mihai Viteazul": "Liceul M. Viteazul",
}


def _canon(name):
    name = _BOARD_TO_ROUTE_ALIASES.get(name, name)
    return name.casefold().replace("str. ", "").strip()


class BoardCoverageTests(unittest.TestCase):
    @unittest.skipUnless(Path("timetable.json").exists(), "timetable.json not built yet")
    def test_line5_route_file_covers_every_board_stop(self):
        # Sept 7 split line 5 into a proper depart/return pair (was one
        # circular ring), so both direction files now need checking - same
        # shape as the line 2/6 coverage tests below.
        route_names = set()
        for d in ("depart", "return"):
            route_names |= {_canon(s["name"]["ro"]) for s in _load(f"line-5/{d}.json")["stops"]}
        board_names = {_canon(name) for name in board_line_stops("5")}
        self.assertEqual(board_names - route_names, set())

    @unittest.skipUnless(Path("timetable.json").exists(), "timetable.json not built yet")
    def test_line2_covers_every_board_stop(self):
        board_stops = {_canon(name) for name in board_line_stops("2")}
        route_stops = set()
        for d in ("depart", "return"):
            p = Path(f"line-2/{d}.json")
            if p.exists():
                route_stops |= {_canon(s["name"]["ro"]) for s in _load(p)["stops"]}
        self.assertEqual(board_stops - route_stops, set())

    @unittest.skipUnless(Path("timetable.json").exists(), "timetable.json not built yet")
    def test_line6_covers_every_board_stop(self):
        board_stops = {_canon(name) for name in board_line_stops("6")}
        route_stops = set()
        for d in ("depart", "return"):
            p = Path(f"line-6/{d}.json")
            if p.exists():
                route_stops |= {_canon(s["name"]["ro"]) for s in _load(p)["stops"]}
        self.assertEqual(board_stops - route_stops, set())

    @unittest.skipUnless(Path("timetable.json").exists(), "timetable.json not built yet")
    def test_line1b_covers_every_board_stop(self):
        board_stops = {_canon(name) for name in board_line_stops("1B")}   # {"Câmpul Frumos"} on the current board
        route_stops = set()
        for d in ("depart", "return"):
            route_stops |= {_canon(s["name"]["ro"]) for s in _load(f"line-1B/{d}.json")["stops"]}
        self.assertEqual(board_stops - route_stops, set())

    @unittest.skipUnless(Path("timetable.json").exists(), "timetable.json not built yet")
    def test_line10_covers_every_board_stop(self):
        board_stops = {_canon(name) for name in board_line_stops("10")}
        route_stops = set()
        for d in ("depart", "return"):
            route_stops |= {_canon(s["name"]["ro"]) for s in _load(f"line-10/{d}.json")["stops"]}
        # "Biserica Reformată Arcuș" was a board-only phantom stop (added in
        # e9fba16 from the Sept 7 printed board, between Primăria Arcuș and
        # Centru Arcuș). multitrans.ro's official stop-order page for line 10
        # (published 2026-09-15) does not list it, so Task 29 removed it from
        # both route files - the sourced official list overrides the earlier
        # board-derived guess.
        known_board_only_stops = {_canon("Biserica Reformată Arcuș")}
        self.assertEqual(board_stops - route_stops - known_board_only_stops, set())

    def test_line1d_2d_have_calea_brasovului(self):
        for line in ("1D", "2D"):
            names = {s["name"]["ro"] for d in ("depart", "return")
                     for s in _load(f"line-{line}/{d}.json")["stops"]}
            self.assertIn("Calea Brașovului 1", names)


class ReturnHeadsignTests(unittest.TestCase):
    """merge_lines.py detects and corrects a real bug on multitrans.ro: 1B/1D/
    2D's "-retur" pages carry an <h1> copy-pasted from their "depart" twin.
    The detector (a positive match of the page's own title against this
    file's LAST stop) must catch exactly those, and not lines whose real
    title is merely a shorter phrasing of the first stop (line 10 - "Arcuș"
    for "Centru Arcuș" - is NOT a reversed title and must survive untouched)."""

    def test_corrects_the_genuinely_reversed_titles(self):
        for line, first, last in (
            ("1B", "Multi-Trans", "Simeria (Str. Berzei)"),
            ("1D", "Multi-Trans", "Simeria (Str. Berzei)"),
            ("2D", "Multi-Trans", "Simeria (Str. Berzei)"),
        ):
            d = _load(f"line-{line}/return.json")
            self.assertEqual(d["stops"][0]["name"]["ro"], first, line)
            self.assertEqual(d["stops"][-1]["name"]["ro"], last, line)
            self.assertEqual(d["headsign"]["ro"], f"{first} → {last}", line)

    def test_keeps_the_operators_own_title_when_it_is_not_reversed(self):
        d = _load("line-10/return.json")
        self.assertEqual(d["stops"][0]["name"]["ro"], "Centru Arcuș")
        self.assertEqual(d["stops"][-1]["name"]["ro"], "Casa cu Arcade")
        # the operator's own (correct, just abbreviated) title, not a
        # synthesized "Centru Arcuș → Casa cu Arcade"
        self.assertEqual(d["headsign"]["ro"], "Arcuș → Casa cu Arcade")


if __name__ == "__main__":
    unittest.main()
