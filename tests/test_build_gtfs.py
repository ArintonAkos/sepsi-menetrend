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


if __name__ == "__main__":
    unittest.main()
