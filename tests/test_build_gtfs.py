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


if __name__ == "__main__":
    unittest.main()
