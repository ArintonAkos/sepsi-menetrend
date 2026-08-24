import tempfile
import unittest
from pathlib import Path

import build_gtfs


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


if __name__ == "__main__":
    unittest.main()
