import unittest

from timetable_overrides import (
    apply_timetable_overrides, filter_opposite_platform_columns,
    merge_same_platform_columns,
)


class TimetableOverrideTests(unittest.TestCase):
    def test_reassigns_2d_return_platforms_and_their_actual_headsign(self):
        entries = [{
            "line": "2D", "direction": "depart", "stop_ro": "Spitalul Județean",
            "destination": "Câmpul Frumos / Szépmező",
        }]

        result = apply_timetable_overrides(entries)

        self.assertEqual(result[0]["direction"], "return")
        self.assertEqual(result[0]["destination"], "Str. Bartók Béla / Bartók Béla utca")

    def test_reassigns_only_the_reviewed_2d_source_pole_on_a_shared_name(self):
        entries = [
            {"source_station_id": 30, "line": "2D", "direction": "depart",
             "stop_ro": "Debren", "destination": "Câmpul Frumos / Szépmező"},
            {"source_station_id": 70, "line": "2D", "direction": "depart",
             "stop_ro": "Debren", "destination": "Câmpul Frumos / Szépmező"},
        ]

        result = apply_timetable_overrides(entries)

        self.assertEqual(result[0]["direction"], "return")
        self.assertEqual(result[0]["destination"], "Str. Bartók Béla / Bartók Béla utca")
        self.assertEqual(result[1], entries[1])

    def test_reassigns_the_2d_gara_column_that_precedes_the_return_pass(self):
        entry = {
            "source_station_id": 62, "line": "2D", "direction": "depart",
            "stop_ro": "Gara CFR", "destination": "Câmpul Frumos / Szépmező",
        }

        result = apply_timetable_overrides([entry])

        self.assertEqual(result[0]["direction"], "return")

    def test_leaves_unlisted_official_columns_byte_for_byte_equivalent(self):
        entries = [{
            "line": "2D", "direction": "depart", "stop_ro": "Gara CFR",
            "destination": "Câmpul Frumos / Szépmező",
        }]

        result = apply_timetable_overrides(entries)

        self.assertEqual(result, entries)

    def test_reassigns_the_line_three_factory_column_to_its_only_return_pass(self):
        entries = [{
            "line": "3", "direction": "depart", "stop_ro": "Fabrica de Țigarete",
            "destination": "Coșeni / Szotyor",
        }]

        result = apply_timetable_overrides(entries)

        self.assertEqual(result[0]["direction"], "depart")
        self.assertEqual(result[0]["destination"], "Str. Fabricii / Gyár utca")

    def test_reassigns_the_line_four_factory_column_to_its_only_return_pass(self):
        entries = [{
            "line": "4", "direction": "depart", "stop_ro": "Fabrica de Țigarete",
            "destination": "Câmpul Frumos / Szépmező",
        }]

        result = apply_timetable_overrides(entries)

        self.assertEqual(result[0]["direction"], "depart")
        self.assertEqual(result[0]["destination"], "Str. Fabricii / Gyár utca")

    def test_reassigns_line_six_western_return_board_columns_to_bartok(self):
        entries = [{
            "line": "6", "direction": "depart", "stop_ro": "Spitalul Județean",
            "destination": "Arena Sepsi / Sepsi Aréna",
        }]

        result = apply_timetable_overrides(entries)

        self.assertEqual(result[0]["destination"], "Str. Bartók Béla / Bartók Béla utca")

    def test_drops_only_a_reviewed_impossible_source_column(self):
        entries = [
            {"source_station_id": 45, "line": "3", "direction": "depart",
             "stop_ro": "Fabrica de Țigarete", "destination": "Str. Fabricii / Gyár utca"},
            {"source_station_id": 46, "line": "3", "direction": "depart",
             "stop_ro": "Fabrica de Țigarete", "destination": "Str. Fabricii / Gyár utca"},
        ]
        overrides = {"ignoreColumns": [{
            "sourceStationIds": [46], "line": "3", "direction": "depart",
            "stop": "Fabrica de Țigarete",
            "destination": "Str. Fabricii / Gyár utca",
        }]}

        result = apply_timetable_overrides(entries, overrides)

        self.assertEqual(result, [entries[0]])

    def test_merges_complementary_columns_for_the_same_proven_platform(self):
        entries = [
            {"source_station_id": 61, "line": "5D", "direction": "depart",
             "stop_ro": "Gara CFR", "destination": "Câmpul Frumos / Szépmező",
             "_platform": "P61", "events": {"weekday": [{"time": "09:54", "marked": False}]},
             "times": {"weekday": ["09:54"]}},
            {"source_station_id": 62, "line": "5D", "direction": "depart",
             "stop_ro": "Gara CFR", "destination": "Câmpul Frumos / Szépmező",
             "_platform": "P61", "events": {"weekday": [{"time": "06:02", "marked": False}]},
             "times": {"weekday": ["06:02"]}},
        ]

        result = merge_same_platform_columns(entries)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["source_station_ids"], [61, 62])
        self.assertEqual(result[0]["times"]["weekday"], ["06:02", "09:54"])

    def test_keeps_only_the_source_column_on_the_route_matching_kerb(self):
        direction = {
            "line": "1D", "direction": "depart", "source_direction": "depart",
            "stops": [{"name": {"ro": "Institutul de Proiectări"}}],
            "callPlatforms": ["outbound"],
        }
        entries = [
            {"line": "1D", "direction": "depart", "stop_ro": "Institutul de Proiectări",
             "destination": "Câmpul Frumos / Szépmező", "_platform": "outbound"},
            {"line": "1D", "direction": "depart", "stop_ro": "Institutul de Proiectări",
             "destination": "Câmpul Frumos / Szépmező", "_platform": "opposite"},
        ]

        result = filter_opposite_platform_columns(entries, [direction])

        self.assertEqual(result, [entries[0]])


if __name__ == "__main__":
    unittest.main()
