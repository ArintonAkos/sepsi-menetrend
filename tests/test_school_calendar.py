import unittest


class SchoolCalendarTests(unittest.TestCase):
    def test_terms_cover_sept_to_june(self):
        from school_calendar import SCHOOL_TERMS
        self.assertEqual(SCHOOL_TERMS[0][0], "20260907")
        self.assertEqual(SCHOOL_TERMS[-1][1], "20270618")

    def test_oct_5_is_an_exception(self):
        from school_calendar import SCHOOL_EXCEPTIONS
        self.assertIn("20261005", SCHOOL_EXCEPTIONS)

    def test_no_school_on_a_teaching_weekday_holiday(self):
        # Nov 30 2026 (Sfântul Andrei) is a Monday, sits inside term 2, and is a
        # statutory holiday - so it must drop out of the school service.
        from school_calendar import SCHOOL_EXCEPTIONS
        self.assertIn("20261130", SCHOOL_EXCEPTIONS)

    def test_school_days_are_weekdays_in_term(self):
        from datetime import date

        from school_calendar import (
            SCHOOL_EXCEPTIONS,
            SCHOOL_TERMS,
            school_days,
        )

        days = list(school_days())
        sample = days[:5] + days[len(days) // 2 - 2:len(days) // 2 + 2] + days[-5:]
        for s in sample:
            d = date(int(s[:4]), int(s[4:6]), int(s[6:]))
            self.assertLess(d.weekday(), 5, f"{s} is a weekend day")
            self.assertNotIn(s, SCHOOL_EXCEPTIONS, f"{s} is an exception")
            self.assertTrue(any(a <= s <= b for a, b in SCHOOL_TERMS),
                            f"{s} falls outside every term")

        # A high-summer date is in no term and must never be yielded.
        self.assertNotIn("20260801", set(days))


if __name__ == "__main__":
    unittest.main()
