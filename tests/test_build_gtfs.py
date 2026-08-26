import csv
import tempfile
import unittest
from pathlib import Path

import build_gtfs
import build_map


class GtfsCsvTests(unittest.TestCase):
    def test_writes_portable_lf_csv_rows(self):
        """Generated GTFS must not add CR bytes that Git treats as whitespace."""
        previous = build_gtfs.OUT
        with tempfile.TemporaryDirectory() as temporary:
            build_gtfs.OUT = Path(temporary)
            try:
                build_gtfs.write("sample.txt", ["route_id"], [{"route_id": "5"}])
                self.assertNotIn(b"\r\n", (Path(temporary) / "sample.txt").read_bytes())
            finally:
                build_gtfs.OUT = previous

    def test_uses_each_reconstructed_call_instead_of_a_fixed_route_offset(self):
        record = {
            "offsets": [0, 240, 540],
            "weekday": [{
                "start": 540,
                "calls": [540, 545, 549],
                "published": [True, True, False],
            }],
        }

        trip = build_gtfs.trip_calls(record, "weekday")[0]

        self.assertEqual(build_gtfs.gtfs_time(trip["calls"][1]), "09:05:00")
        self.assertEqual(trip["published"], [True, True, False])


class GtfsTopologyTests(unittest.TestCase):
    def test_wraparound_segment_keeps_the_tail_then_head_of_circular_shape(self):
        points = [[float(index), 0.0] for index in range(7)]

        shape, anchors = build_gtfs.segment_shape(
            points, [0, 1, 2, 3, 4, 5], [3, 4, 5, 1, 2],
        )

        self.assertEqual(shape, [points[3], points[4], points[5], points[6],
                                 points[0], points[1], points[2]])
        self.assertEqual(anchors, [0, 1, 2, 5, 6])

    def build_in_temporary_directory(self):
        previous_out, previous_archive, previous_platforms = (
            build_gtfs.OUT, build_gtfs.ARCHIVE, build_gtfs.PLATFORMS,
        )
        temporary = tempfile.TemporaryDirectory()
        build_gtfs.OUT = Path(temporary.name) / "gtfs"
        build_gtfs.ARCHIVE = Path(temporary.name) / "multitrans-gtfs.zip"
        build_gtfs.PLATFORMS = Path(temporary.name) / "platforms.json"
        self.addCleanup(temporary.cleanup)
        self.addCleanup(setattr, build_gtfs, "OUT", previous_out)
        self.addCleanup(setattr, build_gtfs, "ARCHIVE", previous_archive)
        self.addCleanup(setattr, build_gtfs, "PLATFORMS", previous_platforms)
        self.assertEqual(build_gtfs.main(), 0)
        with (build_gtfs.OUT / "stops.txt").open(encoding="utf-8", newline="") as handle:
            return [row for row in csv.DictReader(handle) if row["location_type"] == "0"]

    def test_real_feed_has_one_elisabeta_and_one_casa_platform(self):
        rows = self.build_in_temporary_directory()
        names = [row["stop_name"] for row in rows]

        self.assertEqual(names.count("Parcul Elisabeta"), 1)
        self.assertEqual(names.count("Casa cu Arcade"), 1)

    def test_real_feed_keeps_two_factory_platforms(self):
        rows = self.build_in_temporary_directory()
        factory = [row for row in rows if row["stop_name"] == "Fabrica de Țigarete"]

        self.assertEqual(
            {(row["stop_lat"], row["stop_lon"]) for row in factory},
            {("45.858900", "25.782600"), ("45.858400", "25.782200")},
        )

    def test_real_feed_omits_removed_terminal_but_keeps_brasovului(self):
        """The unverified Terminal source call must not create a fake platform."""
        rows = self.build_in_temporary_directory()
        names = {row["stop_name"] for row in rows}

        self.assertNotIn("Terminal", names)
        self.assertIn("Calea Brașovului 1", names)

    def test_line_six_has_an_arena_pass_and_a_separate_bartok_return_pass(self):
        directions = build_map.load_directions()
        arena = next(direction for direction in directions
                     if direction["line"] == "6" and direction["direction"] == "depart-to-arena")
        bartok = next(direction for direction in directions
                      if direction["line"] == "6" and direction["direction"] == "depart-from-arena")

        self.assertEqual(arena["headsign"]["ro"], "Arena Sepsi / Sepsi Aréna")
        self.assertEqual(bartok["headsign"]["ro"], "Str. Bartók Béla / Bartók Béla utca")
        self.assertNotIn("Parcul Elisabeta", [stop["name"]["ro"] for stop in arena["stops"]])

    def test_line_four_to_campul_frumos_stops_at_casa_not_elisabeta(self):
        directions = build_map.load_directions()
        toward_campul = next(
            direction for direction in directions
            if direction["line"] == "4" and direction["direction"] == "depart-to-campul-frumos"
        )
        names = [stop["name"]["ro"] for stop in toward_campul["stops"]]

        self.assertIn("Casa cu Arcade", names)
        self.assertNotIn("Parcul Elisabeta", names)


class RouteOverrideTests(unittest.TestCase):
    def test_removed_intermediate_stop_coalesces_its_adjacent_durations(self):
        direction = {
            "stops": [{}, {}, {}],
            "source_stop_indexes": [0, 2, 3],
        }
        legs = [{"seconds": 40}, {"seconds": 60}, {"seconds": 50}]

        self.assertEqual(
            build_map.duration_seconds_for(direction, legs),
            [100, 50, 0],
        )

    def test_can_rename_a_legacy_terminal_and_remove_only_the_second_duplicate(self):
        directions = [{
            "line": "3", "direction": "depart", "source_stop_indexes": [0, 1, 2, 3],
            "stops": [
                {"name": {"ro": "Gara CFR", "hu": "Vasútállomás"}, "distance_to_next_m": 1},
                {"name": {"ro": "Terminal", "hu": "Terminál"}, "distance_to_next_m": 1},
                {"name": {"ro": "Fabrica de Țigarete", "hu": "Cigarettagyár"}, "distance_to_next_m": 1},
                {"name": {"ro": "Fabrica de Țigarete", "hu": "Cigarettagyár"}, "distance_to_next_m": 1},
            ],
        }]
        overrides = {
            "renameCalls": [{"line": "3", "direction": "depart", "name": "Terminal",
                             "replacement": {"ro": "Calea Brașovului 1", "hu": "Brassói út 1"}}],
            "removeCalls": [{"line": "3", "direction": "depart", "name": "Fabrica de Țigarete",
                             "occurrence": 2}],
        }

        result = build_map.apply_route_overrides(directions, overrides)[0]

        self.assertEqual([stop["name"]["ro"] for stop in result["stops"]],
                         ["Gara CFR", "Calea Brașovului 1", "Fabrica de Țigarete"])
        self.assertEqual(result["source_stop_indexes"], [0, 1, 2])


if __name__ == "__main__":
    unittest.main()
