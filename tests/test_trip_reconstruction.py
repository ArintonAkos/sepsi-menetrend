import unittest

from trip_reconstruction import (
    align_events,
    load_turnarounds,
    reconstruct_direction,
    turnaround_role,
)


class EventAlignmentTests(unittest.TestCase):
    def test_pairs_each_published_event_with_its_matching_trip(self):
        self.assertEqual(
            align_events(predicted=[480, 510], observed=[484, 514], tolerance=8),
            [(0, 0), (1, 1)],
        )


class DirectionReconstructionTests(unittest.TestCase):
    route = {
        "line": "2D",
        "direction": "depart",
        "stops": [
            {"name": {"ro": "A"}},
            {"name": {"ro": "B"}},
            {"name": {"ro": "C"}},
        ],
    }
    offsets = [0, 4 * 60, 9 * 60]

    def test_line_three_coseni_turn_assigns_each_board_column_once(self):
        """Changing either source headsign must not swap arrival and departure."""
        turns = load_turnarounds({
            "3-depart": [{
                "index": 17,
                "stop_ro": "Coșeni 2",
                "arrival_destination": "Coșeni / Szotyor",
                "departure_destination": "Str. Fabricii / Gyár utca",
                "minimum_dwell_minutes": 0,
            }],
        })

        self.assertEqual(
            turnaround_role(turns, "3-depart", 17, "Coșeni / Szotyor"),
            "arrival",
        )
        self.assertEqual(
            turnaround_role(turns, "3-depart", 17, "Str. Fabricii / Gyár utca"),
            "departure",
        )
        self.assertIsNone(turnaround_role(turns, "3-depart", 17, "Gara CFR"))

    @staticmethod
    def board(line, stop, *events, direction="depart", destination="C"):
        return {
            "line": line, "direction": direction,
            "stop_ro": stop, "destination": destination,
            "events": {"weekday": [
                {"time": time, "marked": marked} for time, marked in events
            ], "weekend": []},
        }

    @staticmethod
    def event_times(trip):
        return [(call["arrival"], call["departure"]) for call in trip["calls"]]

    @staticmethod
    def published_departures(trip):
        return [call["published_departure"] for call in trip["calls"]]

    def test_turnaround_keeps_source_arrival_and_later_source_departure(self):
        """Removing the dwell must fail: the two printed turn clocks are distinct."""
        route = {
            "line": "3", "direction": "depart", "key": "3-depart",
            "stops": [
                {"name": {"ro": "A"}},
                {"name": {"ro": "Coșeni 2"}},
                {"name": {"ro": "B"}},
            ],
        }
        boards = [
            self.board("3", "A", ("04:35", False)),
            self.board("3", "Coșeni 2", ("04:56", False),
                       destination="Coșeni / Szotyor"),
            self.board("3", "Coșeni 2", ("05:16", False),
                       destination="Str. Fabricii / Gyár utca"),
            self.board("3", "B", ("05:22", False)),
        ]
        turns = load_turnarounds({
            "3-depart": [{
                "index": 1,
                "stop_ro": "Coșeni 2",
                "arrival_destination": "Coșeni / Szotyor",
                "departure_destination": "Str. Fabricii / Gyár utca",
                "minimum_dwell_minutes": 0,
            }],
        })

        trips, report = reconstruct_direction(
            route, boards, [0, 21 * 60, 27 * 60], turns,
        )

        turn = trips["weekday"][0]["calls"][1]
        self.assertEqual((turn["arrival"], turn["departure"]), (296, 316))
        self.assertTrue(turn["published_arrival"])
        self.assertTrue(turn["published_departure"])
        self.assertEqual(trips["weekday"][0]["calls"][2]["arrival"], 322)
        self.assertEqual(report, [])

    def test_keeps_printed_calls_and_estimates_only_the_missing_middle_stop(self):
        schedules = [
            self.board("2D", "A", ("08:00", False), ("08:30", False)),
            self.board("2D", "B", ("08:04", False), ("08:34", False)),
        ]

        trips, report = reconstruct_direction(self.route, schedules, self.offsets)

        self.assertEqual(self.event_times(trips["weekday"][0]),
                         [(480, 480), (484, 484), (489, 489)])
        self.assertEqual(self.published_departures(trips["weekday"][0]),
                         [True, True, False])
        self.assertEqual(self.event_times(trips["weekday"][1]),
                         [(510, 510), (514, 514), (519, 519)])
        self.assertEqual(report, [])

    def test_prefers_a_direct_d_time_over_the_marked_base_line_duplicate(self):
        schedules = [
            self.board("2D", "A", ("08:00", False)),
            self.board("2D", "B", ("08:04", False)),
            self.board("2", "C", ("08:10", True)),
            self.board("2D", "C", ("08:09", False)),
        ]

        trips, report = reconstruct_direction(self.route, schedules, self.offsets)

        self.assertEqual(self.event_times(trips["weekday"][0]),
                         [(480, 480), (484, 484), (489, 489)])
        self.assertEqual(self.published_departures(trips["weekday"][0]),
                         [True, True, True])
        self.assertEqual(report, [])

    def test_aligns_each_pass_of_a_loop_to_its_own_stop_board_column(self):
        loop = {
            "line": "L", "direction": "depart",
            "stops": [
                {"name": {"ro": "A"}},
                {"name": {"ro": "X"}},
                {"name": {"ro": "A"}},
                {"name": {"ro": "Y"}},
            ],
        }
        schedules = [
            self.board("L", "A", ("08:00", False), ("08:30", False)),
            self.board("L", "A", ("08:12", False), ("08:42", False)),
            self.board("L", "X", ("08:05", False), ("08:35", False)),
            self.board("L", "Y", ("08:18", False), ("08:48", False)),
        ]

        trips, report = reconstruct_direction(loop, schedules,
                                               [0, 5 * 60, 12 * 60, 18 * 60])

        self.assertEqual(self.event_times(trips["weekday"][0]),
                         [(480, 480), (485, 485), (492, 492), (498, 498)])
        self.assertEqual(self.published_departures(trips["weekday"][0]),
                         [True, True, True, True])
        self.assertEqual(report, [])

    def test_does_not_report_a_loop_stop_twice_when_its_board_matches_one_pass(self):
        loop = {
            "line": "L", "direction": "depart", "circular": True,
            "stops": [
                {"name": {"ro": "A"}},
                {"name": {"ro": "X"}},
                {"name": {"ro": "A"}},
                {"name": {"ro": "Y"}},
            ],
        }
        schedules = [
            self.board("L", "A", ("08:00", False)),
            self.board("L", "X", ("08:05", False)),
        ]

        trips, report = reconstruct_direction(loop, schedules,
                                               [0, 5 * 60, 12 * 60, 18 * 60])

        self.assertEqual(self.published_departures(trips["weekday"][0]),
                         [True, True, False, False])
        self.assertEqual(report, [])

    def test_unions_disjoint_official_columns_when_seeding_trips(self):
        schedules = [
            self.board("2D", "A", ("08:00", False)),
            self.board("2D", "B", ("08:34", False)),
        ]

        trips, report = reconstruct_direction(self.route, schedules, self.offsets)

        self.assertEqual([trip["start"] for trip in trips["weekday"]], [480, 510])
        self.assertEqual(self.event_times(trips["weekday"][1]),
                         [(510, 510), (514, 514), (519, 519)])
        self.assertEqual(report, [])

    def test_does_not_apply_a_board_for_the_opposite_direction(self):
        reverse = {**self.route, "direction": "return"}
        schedules = [
            self.board("2D", "A", ("08:00", False), direction="return"),
            self.board("2D", "B", ("08:04", False), direction="depart"),
        ]

        trips, report = reconstruct_direction(reverse, schedules, self.offsets)

        self.assertEqual(self.published_departures(trips["weekday"][0]),
                         [True, False, False])
        self.assertEqual(report, [])

    def test_uses_only_marked_base_events_when_a_d_column_is_absent(self):
        schedules = [
            self.board("2", "A", ("08:00", False), ("08:30", True)),
            self.board("2", "B", ("08:04", False), ("08:34", True)),
        ]

        trips, report = reconstruct_direction(self.route, schedules, self.offsets)

        self.assertEqual([trip["start"] for trip in trips["weekday"]], [510])
        self.assertEqual(self.event_times(trips["weekday"][0]),
                         [(510, 510), (514, 514), (519, 519)])
        self.assertEqual(report, [])

    def test_reports_a_published_time_that_cannot_fit_after_the_previous_call(self):
        schedules = [
            self.board("2D", "A", ("08:00", False)),
            self.board("2D", "B", ("07:59", False)),
        ]

        trips, report = reconstruct_direction(self.route, schedules, self.offsets)

        self.assertEqual(self.event_times(trips["weekday"][0]),
                         [(480, 480), (479, 479), (487, 487)])
        self.assertEqual(self.published_departures(trips["weekday"][0]),
                         [True, True, False])
        self.assertTrue(any("precedes prior departure" in item["reason"] for item in report))

    def test_leaves_a_trip_unmatched_when_that_stop_has_no_printed_time(self):
        self.assertEqual(
            align_events(predicted=[480, 510], observed=[484], tolerance=8),
            [(0, 0)],
        )

    def test_treats_after_midnight_board_times_as_the_end_of_the_service_day(self):
        self.assertEqual(
            align_events(predicted=[1438, 1468], observed=[5, 35], tolerance=8),
            [(0, 0), (1, 1)],
        )


if __name__ == "__main__":
    unittest.main()
