import unittest
from unittest.mock import patch

from build_map import load_directions
from build_trips import offsets_for, reconstruction_inputs


class ReconstructionInputTests(unittest.TestCase):
    def test_has_exactly_one_time_offset_for_each_physical_call(self):
        direction = next(item for item in load_directions()
                         if item["line"] == "2" and item["direction"] == "depart-to-gara")

        self.assertEqual(len(offsets_for(direction)), len(direction["stops"]))

    def test_carries_the_same_physical_platform_identity_to_board_and_call(self):
        """A same-named board on the other kerb must not be available to the
        planner merely because its label matches."""
        timetable = {"timepoints": [{
            "source_station_id": 30, "line": "2", "direction": "depart",
            "stop_ro": "Debren", "destination": "Gara / Vasútállomás",
            "events": {"weekday": [], "weekend": []},
        }]}
        directions = [{
            "line": "2", "direction": "depart-to-gara", "source_direction": "depart",
            "destination": "Gara / Vasútállomás",
            "stops": [{"name": {"ro": "Debren"}}],
        }]
        topology = {
            "platforms": [{"id": "correct-kerb"}, {"id": "other-kerb"}],
            "call_platforms": {("2", "depart-to-gara", 0): "correct-kerb"},
        }
        with patch("build_trips.official_board_bindings", return_value={
            (30, "2", "depart", "Debren", "Gara / Vasútállomás"): "P1",
        }):
            entries, resolved = reconstruction_inputs(timetable, directions, topology)

        self.assertEqual(entries[0]["_platform"], "correct-kerb")
        self.assertEqual(resolved[0]["callPlatforms"], ["correct-kerb"])
        self.assertEqual(resolved[0]["call_platform_ids"], ["correct-kerb"])


if __name__ == "__main__":
    unittest.main()
