import csv
import json
import tempfile
import unittest
import zipfile
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


class FeedWindowTests(unittest.TestCase):
    def test_feed_starts_on_sept_7(self):
        """The reworked network takes effect on 2026-09-07."""
        self.assertEqual(build_gtfs.FEED_START, "20260907")


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
        """"Terminal" is a real stop the operator's own pages list on several
        lines (1D, 2D, 4, 5D) - it is not scrubbed feed-wide any more. Lines
        3 and 4 depart specifically keep their own route_overrides.json entry
        (rename to Calea Brașovului 1 for line 3; drop for line 4, an
        unverified board call for that particular direction), so only those
        two must not carry the literal name."""
        self.build_in_temporary_directory()
        directions = build_map.load_directions()
        for line in ("3", "4"):
            depart = next(d for d in directions if d["line"] == line and d["direction"] == "depart")
            names = [stop["name"]["ro"] for stop in depart["stops"]]
            self.assertNotIn("Terminal", names, f"line {line} depart")
        rows = self.build_in_temporary_directory()
        names = {row["stop_name"] for row in rows}
        self.assertIn("Calea Brașovului 1", names)

    def test_real_feed_adds_1b_and_keeps_5d_to_its_two_marked_runs(self):
        """1B joined ORDER with weekday trips. The Sept 7 board dropped every
        dedicated 5D-depart column (that direction's destination gate keeps it
        at zero trips, unchanged), but line 5's own return-direction board
        columns carry 2 weekday runs marked as also serving the 5D extension
        (06:2x and 14:2x, "Str. Dózsa György (Arena Sepsi felől)" destination)
        - genuine printed board data, so 5D is not fully serviceless: it gets
        a routes.txt row for those 2 return runs, none for depart."""
        self.build_in_temporary_directory()
        with (build_gtfs.OUT / "routes.txt").open(encoding="utf-8", newline="") as handle:
            route_ids = {row["route_id"] for row in csv.DictReader(handle)}
        self.assertIn("1B", route_ids)
        self.assertIn("5D", route_ids)
        with (build_gtfs.OUT / "trips.txt").open(encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
        fivd_d_directions = {row["trip_headsign"] for row in rows if row["route_id"] == "5D"}
        self.assertTrue(fivd_d_directions, "5D must keep at least its 2 marked return runs")
        with (build_gtfs.OUT / "translations.txt").open(encoding="utf-8", newline="") as handle:
            route_records = {row["record_id"] for row in csv.DictReader(handle)
                             if row["table_name"] == "routes"}
        self.assertIn("5D", route_records)

    def test_school_service_mirrors_every_weekday_trip_with_dated_calendar(self):
        """The school service is a weekday superset: build_gtfs emits a
        service_id="school" copy of every weekday trip, and calendar_dates.txt
        lists each teaching day as an exception_type=1 addition. On top of the
        mirror it also emits the board-less school-only runs (the áthúzott-6,
        Task 22), which have no weekday counterpart."""
        self.build_in_temporary_directory()

        with (build_gtfs.OUT / "trips.txt").open(encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
        services = [row["service_id"] for row in rows]
        school_only = sum(1 for row in rows if row["trip_id"].startswith("6S-"))
        self.assertEqual(school_only, 1)
        self.assertEqual(services.count("school"),
                         services.count("weekday") + school_only)
        self.assertGreater(services.count("school"), 0)

        with (build_gtfs.OUT / "calendar.txt").open(encoding="utf-8", newline="") as handle:
            calendar = {row["service_id"]: row for row in csv.DictReader(handle)}
        self.assertIn("school", calendar)
        self.assertEqual(
            {calendar["school"][day] for day in
             ("monday", "tuesday", "wednesday", "thursday", "friday",
              "saturday", "sunday")},
            {"0"},
        )

        with (build_gtfs.OUT / "calendar_dates.txt").open(encoding="utf-8", newline="") as handle:
            dates = list(csv.DictReader(handle))
        self.assertGreater(len(dates), 150)
        self.assertTrue(all(row["service_id"] == "school" for row in dates))
        self.assertTrue(all(row["exception_type"] == "1" for row in dates))

        with zipfile.ZipFile(build_gtfs.ARCHIVE) as archive:
            self.assertIn("calendar_dates.txt", archive.namelist())

    def test_line_six_reaches_the_arena_outbound_and_returns_as_a_separate_pass(self):
        # Fázis 2 re-anchored line 6 to the Gólya utca terminus and split it into
        # separate depart/return files, so it is no longer one circular with two
        # headsign changes: the outbound pass ends at the Arena and the return
        # pass is a distinct direction back to the terminus.
        directions = build_map.load_directions()
        depart = next(direction for direction in directions
                      if direction["line"] == "6" and direction["direction"] == "depart")
        ret = next(direction for direction in directions
                   if direction["line"] == "6" and direction["direction"] == "return")

        self.assertEqual(depart["stops"][-1]["name"]["ro"], "Arena Sepsi")
        self.assertEqual(ret["stops"][0]["name"]["ro"], "Arena Sepsi")
        self.assertEqual(ret["stops"][-1]["name"]["ro"], "Simeria (Str. Berzei)")
        self.assertNotIn("Parcul Elisabeta",
                         [stop["name"]["ro"] for stop in depart["stops"]])

    def test_line_four_to_campul_frumos_stops_at_casa_not_elisabeta(self):
        # Sept 15's clean depart/return pages retired timetable_segments.json's
        # "depart-to-campul-frumos" slicing - line 4 depart is just "depart" now.
        directions = build_map.load_directions()
        toward_campul = next(
            direction for direction in directions
            if direction["line"] == "4" and direction["direction"] == "depart"
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

    def test_no_stale_line_six_elisabeta_removecall_and_real_feed_applies(self):
        """Fázis 2 rebuilt line-6/depart.json without Parcul Elisabeta, so a
        removeCall for it makes apply_route_overrides fail closed on the real
        feed. The override must be gone and load_directions must not raise."""
        overrides = json.loads(build_map.ROUTE_OVERRIDES.read_text(encoding="utf-8"))

        self.assertNotIn(
            {"line": "6", "direction": "depart", "name": "Parcul Elisabeta"},
            overrides["removeCalls"],
        )
        self.assertFalse([
            call for call in overrides["removeCalls"]
            if call["line"] == "6" and call["name"] == "Parcul Elisabeta"
        ])

        directions = build_map.load_directions()
        self.assertTrue(directions)

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
