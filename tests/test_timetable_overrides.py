import unittest

from timetable_overrides import apply_timetable_overrides


class TimetableOverrideTests(unittest.TestCase):
    def test_reassigns_2d_return_platforms_and_their_actual_headsign(self):
        entries = [{
            "line": "2D", "direction": "depart", "stop_ro": "Spitalul Județean",
            "destination": "Câmpul Frumos / Szépmező",
        }]

        result = apply_timetable_overrides(entries)

        self.assertEqual(result[0]["direction"], "return")
        self.assertEqual(result[0]["destination"], "Str. Bartók Béla / Bartók Béla utca")

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


if __name__ == "__main__":
    unittest.main()
