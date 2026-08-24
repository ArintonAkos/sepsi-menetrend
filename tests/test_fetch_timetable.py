import unittest

from fetch_timetable import normalise_station_names, times_of, validate_coverage


class CurrentOperatorTimetableTests(unittest.TestCase):
    def test_reads_the_current_entries_based_time_rows(self):
        schedule = {
            "rows": [
                {"h": "06", "entries": [{"m": "05", "marked": False}]},
                {"h": "07", "entries": [
                    {"m": "15", "marked": False},
                    {"m": "45", "marked": True},
                ]},
            ]
        }

        self.assertEqual(times_of(schedule), ["06:05", "07:15", "07:45"])

    def test_uses_the_current_romanian_and_hungarian_fields_when_romanian_name_is_known(self):
        known = {"Arena Sepsi": "Sepsi Aréna"}

        self.assertEqual(
            normalise_station_names(
                {"ro": "Arena Sepsi", "hu": "Sepsi Aréna"}, known
            ),
            ("Arena Sepsi", "Sepsi Aréna"),
        )

    def test_keeps_legacy_swapped_fields_compatible_when_only_that_orientation_matches(self):
        known = {"Arena Sepsi": "Sepsi Aréna"}

        self.assertEqual(
            normalise_station_names(
                {"ro": "Sepsi Aréna", "hu": "Arena Sepsi"}, known
            ),
            ("Arena Sepsi", "Sepsi Aréna"),
        )

    def test_normalises_current_timetable_stop_name_variants(self):
        known = {
            "B-dul Nicolae Iorga 1": "N. Iorga sugárút 1",
            "Institutul de Proiectări": "Tervező Intézet",
            "Lic. Plugor Sándor": "Plugor Sándor Líceum",
        }

        self.assertEqual(
            normalise_station_names(
                {"ro": "B-dul. N. Iorga 1", "hu": "N. Iorga sugárút 1"}, known
            ),
            ("B-dul Nicolae Iorga 1", "N. Iorga sugárút 1"),
        )
        self.assertEqual(
            normalise_station_names(
                {"ro": "Institutul de proiectări", "hu": "Tervező Intézet"}, known
            ),
            ("Institutul de Proiectări", "Tervező Intézet"),
        )
        self.assertEqual(
            normalise_station_names(
                {"ro": "Liceul de Artă Plugor Sándor", "hu": "Plugor Sándor Művészeti Líceum"}, known
            ),
            ("Lic. Plugor Sándor", "Plugor Sándor Líceum"),
        )

    def test_rejects_an_incomplete_operator_download(self):
        with self.assertRaisesRegex(ValueError, "incomplete timetable"):
            validate_coverage(station_count=66, timepoint_count=85, departure_count=2952)

    def test_accepts_the_current_complete_operator_download(self):
        validate_coverage(station_count=100, timepoint_count=291, departure_count=8444)


if __name__ == "__main__":
    unittest.main()
