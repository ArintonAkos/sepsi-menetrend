"""2026-27 Romanian school year, for the school-day GTFS service.

Source: education ministry calendar (via Maszol, 2026-09-07). Two boundaries
are a Covasna county decision; the MIDDLE option is used until the county
publishes (see the design doc checkpoint). Teaching period 3 ends Fri
2027-02-19 and period 4 starts Mon 2027-03-01 (one-week break 2027-02-22..28).

Stdlib only - imported by build_web_data.py and mirrored into network.json as
`schoolTerms` / `schoolExceptions` for the browser planner.
"""
import json
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent

SCHOOL_TERMS = [
    ("20260907", "20261023"),
    ("20261102", "20261222"),
    ("20270111", "20270219"),   # Covasna: Feb 12/19/26 boundary - MIDDLE
    ("20270301", "20270423"),   # Covasna: Mar 1/8 start - MIDDLE (break Feb 22-28)
    ("20270505", "20270618"),
]


def _ymd(s):
    return date(int(s[:4]), int(s[4:6]), int(s[6:]))


def _in_terms(d):
    s = d.strftime("%Y%m%d")
    return any(a <= s <= b for a, b in SCHOOL_TERMS)


_HOLIDAYS = json.loads(
    (ROOT / "web/public/data/ro-holidays.json").read_text(encoding="utf-8"))["dates"]

# Oct 5 (International Education Day, a teachers' day off) plus every statutory
# holiday that lands on a teaching weekday. A holiday on a Sat/Sun is not an
# exception - school would not have run that day anyway.
SCHOOL_EXCEPTIONS = sorted({"20261005"} | {
    h.replace("-", "") for h in _HOLIDAYS
    if _in_terms(date.fromisoformat(h)) and date.fromisoformat(h).weekday() < 5
})


def school_days():
    """Yield every YYYYMMDD teaching weekday that is not an exception."""
    for a, b in SCHOOL_TERMS:
        d, end = _ymd(a), _ymd(b)
        while d <= end:
            s = d.strftime("%Y%m%d")
            if d.weekday() < 5 and s not in SCHOOL_EXCEPTIONS:
                yield s
            d += timedelta(days=1)
