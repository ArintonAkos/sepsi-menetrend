import unittest

from fetch_timetable import (
    ALIASES,
    direction_for,
    events_of,
    normalise_station_names,
    times_of,
    validate_coverage,
)


class DirectionMatchingTests(unittest.TestCase):
    def test_matches_a_destination_that_names_an_intermediate_stop_not_the_terminus(self):
        """The Oct 1 2026 board prints line 9's return columns with "Casa cu
        Arcade / Lábasház" as the destination at several stops - an existing
        intermediate stop on that leg, not its real terminus "Gara CFR". The
        headsign alone no longer matches; the stop list should."""
        candidates = [
            {
                "direction": "depart",
                "headsign": {"ro": "Gara CFR → Șugaș Băi", "hu": "Vasútállomás → Sugásfürdő"},
                "stops": [
                    {"name": {"ro": "Gara CFR", "hu": "Vasútállomás"}},
                    {"name": {"ro": "Șugaș Băi", "hu": "Sugásfürdő"}},
                ],
            },
            {
                "direction": "return",
                "headsign": {"ro": "Șugaș Băi → Gara CFR", "hu": "Sugásfürdő → Vasútállomás"},
                "stops": [
                    {"name": {"ro": "Șugaș Băi", "hu": "Sugásfürdő"}},
                    {"name": {"ro": "Casa cu Arcade", "hu": "Lábasház"}},
                    {"name": {"ro": "Gara CFR", "hu": "Vasútállomás"}},
                ],
            },
        ]

        direction, score = direction_for(
            "Casa cu Arcade / Lábasház", candidates, at_stop="Str. Gábor Áron")

        self.assertEqual(direction, "return")
        self.assertGreater(score, 0)

    def test_resolves_a_landmark_shared_by_both_directions_using_stop_order(self):
        """At "Șugaș Băi" (the depart terminus and the return origin) the real
        board also prints "Casa cu Arcade / Lábasház" as line 9's destination.
        "Casa cu Arcade" is a stop on BOTH directions, so a plain stop-list
        word-overlap ties - the real answer is "return", because Casa cu
        Arcade is still ahead of Șugaș Băi there, not already behind it as on
        depart."""
        candidates = [
            {
                "direction": "depart",
                "headsign": {"ro": "Gara CFR → Șugaș Băi", "hu": "Vasútállomás → Sugásfürdő"},
                "stops": [
                    {"name": {"ro": "Gara CFR", "hu": "Vasútállomás"}},
                    {"name": {"ro": "Casa cu Arcade", "hu": "Lábasház"}},
                    {"name": {"ro": "Șugaș Băi", "hu": "Sugásfürdő"}},
                ],
            },
            {
                "direction": "return",
                "headsign": {"ro": "Șugaș Băi → Gara CFR", "hu": "Sugásfürdő → Vasútállomás"},
                "stops": [
                    {"name": {"ro": "Șugaș Băi", "hu": "Sugásfürdő"}},
                    {"name": {"ro": "Casa cu Arcade", "hu": "Lábasház"}},
                    {"name": {"ro": "Gara CFR", "hu": "Vasútállomás"}},
                ],
            },
        ]

        direction, score = direction_for(
            "Casa cu Arcade / Lábasház", candidates, at_stop="Șugaș Băi")

        self.assertEqual(direction, "return")
        self.assertGreater(score, 0)

    def test_still_prefers_a_headsign_match_over_the_stop_list_fallback(self):
        candidates = [
            {
                "direction": "depart",
                "headsign": {"ro": "Gara CFR → Șugaș Băi", "hu": "Vasútállomás → Sugásfürdő"},
                "stops": [{"name": {"ro": "Gara CFR", "hu": "Vasútállomás"}}],
            },
            {
                "direction": "return",
                "headsign": {"ro": "Șugaș Băi → Gara CFR", "hu": "Sugásfürdő → Vasútállomás"},
                "stops": [{"name": {"ro": "Șugaș Băi", "hu": "Sugásfürdő"}}],
            },
        ]

        direction, score = direction_for("Șugaș Băi / Sugásfürdő", candidates)

        self.assertEqual(direction, "depart")


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

    def test_preserves_the_d_extension_marker_on_each_published_event(self):
        schedule = {
            "rows": [{"h": "08", "entries": [
                {"m": "04", "marked": False},
                {"m": "36", "marked": True},
            ]}]
        }

        self.assertEqual(
            events_of(schedule),
            [{"time": "08:04", "marked": False},
             {"time": "08:36", "marked": True}],
        )

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
        # The Sept 7 2026 board bound live: 100 stations, 221 timing points,
        # 6269 departures. This must clear the retuned floor (95 / 198 / 5642)
        # — under the old floor (90 / 250 / 7000) the 221 timing points would
        # trip "incomplete timetable" and fetch_timetable.py would refuse to
        # write the new timetable.json.
        validate_coverage(station_count=100, timepoint_count=221, departure_count=6269)

    def test_golya_utca_terminus_normalises_to_known_stop(self):
        known = {"Simeria (Str. Berzei)": "Szemerja (Gólya utca)"}
        station = {"id": 11, "ro": "Szemerja (Gólya utca)", "hu": "Simeria (Str. Berzei)"}
        ro, hu = normalise_station_names(station, known)
        self.assertEqual(ro, "Simeria (Str. Berzei)")

    def test_new_arcus_stops_alias(self):
        self.assertEqual(ALIASES.get("Bis. Reformată Arcuș"), "Biserica Reformată Arcuș")
        self.assertEqual(ALIASES.get("Str. Kossuth Lajos 1"), "Str. Kossuth Lajos 1")

    def test_marked_departures_are_kept_as_events(self):
        # Characterisation test: the `marked` flag rides through on each event
        # unchanged. Splitting the D-line extension into its own trips is the
        # job of build_trips / timetable_overrides, not of events_of.
        schedule = {"rows": [{"h": "05", "entries": [
            {"m": "21", "marked": False}, {"m": "31", "marked": True}]}]}
        events = events_of(schedule)
        self.assertEqual(events, [{"time": "05:21", "marked": False},
                                  {"time": "05:31", "marked": True}])

    def test_coverage_floor_rejects_partial(self):
        with self.assertRaisesRegex(ValueError, "incomplete timetable"):
            validate_coverage(60, 80, 3000)


if __name__ == "__main__":
    unittest.main()
