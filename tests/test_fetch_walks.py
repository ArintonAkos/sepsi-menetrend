import tempfile
import unittest
from pathlib import Path

from fetch_walks import platform_pairs, write_cache


class WalkingPlatformPairTests(unittest.TestCase):
    def test_pairs_real_elisabeta_and_casa_without_fabricated_internal_kerb(self):
        platforms = [
            {
                "id": "osm-elisabeta",
                "name": {"ro": "Parcul Elisabeta", "hu": "Erzsébet Park"},
                "point": [45.8641156, 25.7865231],
            },
            {
                "id": "osm-casa",
                "name": {"ro": "Casa cu Arcade", "hu": "Lábasház"},
                "point": [45.8636471, 25.7866207],
            },
        ]

        pairs = platform_pairs(platforms)

        self.assertEqual(len(pairs), 2)
        self.assertEqual(
            {(start, end) for start, end, _ in pairs},
            {
                ((45.8641156, 25.7865231), (45.8636471, 25.7866207)),
                ((45.8636471, 25.7866207), (45.8641156, 25.7865231)),
            },
        )

    def test_failed_refresh_keeps_the_previous_cache_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "walks.json"
            output.write_text('{"walks":{"old":true}}\n', encoding="utf-8")

            written = write_cache({}, ["Mapbox unavailable"], output)

            self.assertFalse(written)
            self.assertEqual(output.read_text(encoding="utf-8"), '{"walks":{"old":true}}\n')


if __name__ == "__main__":
    unittest.main()
