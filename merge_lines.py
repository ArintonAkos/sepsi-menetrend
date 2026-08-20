#!/usr/bin/env python3
"""Merge the per-language line dumps into one file per line+direction.

Input   line-<L>/<dir>/<L>-ro.json  +  line-<L>/<dir>/<L>-hu.json
Output  line-<L>/<dir>.json

The two language dumps describe the same physical stop sequence (verified:
identical coordinates and ordering), so they collapse into a single record per
stop with the name held as {"ro": ..., "hu": ...}. This mirrors how GTFS keeps
one canonical stops.txt row per stop and carries the other language in
translations.txt.

Distances become integer metres. That also resolves the only place the two
languages disagreed: on circular lines the loop-closing hop is annotated
"... pana la inchiderea buclei" / "... a kor zarodasaig", same number either way.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BASE = "https://multitrans.ro"
SLUG = {"1D": "1d", "2D": "2d", "5D": "5d"}  # dir name -> url slug
INFIX = {"depart": "", "return": "-retur"}
RE_METRES = re.compile(r"^([\d.,]+)\s*m\b")

# The site spells a few stops differently from one line page to the next. These
# map each variant onto the agreed canonical form. Applied here rather than in
# the raw dumps so re-running fetch_multitrans.py cannot undo it.
NAME_CANON = {
    "Liceul de Artă Plugor Sándor": "Lic. Plugor Sándor",
    "Plugor Sándor Művészeti Líceum": "Plugor Sándor Líceum",
    # The line page leaves the second Coșeni stop unnumbered, next to a
    # "Coșeni 1", which reads as though it were the same place. The operator's
    # own timetable numbers it, and the 31-second hop from Coșeni 1 matches the
    # one minute printed between Coșeni 1 and Coșeni 2. Adopt their numbering.
    "Coșeni": "Coșeni 2",
    "Szotyor": "Szotyor 2",
}


def metres(text):
    """'354 m pana la inchiderea buclei' -> 354 ; '0 m' (last stop) -> None."""
    match = RE_METRES.match(text.strip())
    if not match:
        raise ValueError(f"unparsable distance {text!r}")
    value = int(round(float(match.group(1).replace(",", "."))))
    return value or None


def source_url(line, direction, lang):
    slug = SLUG.get(line, line.lower())
    return f"{BASE}/jarat-{slug}{INFIX[direction]}{'' if lang == 'ro' else '-hu'}.html"


def merge(line, direction, ro_path, hu_path):
    ro = json.loads(ro_path.read_text(encoding="utf-8"))
    hu = json.loads(hu_path.read_text(encoding="utf-8"))
    if len(ro) != len(hu):
        raise ValueError(f"line {line} {direction}: {len(ro)} ro vs {len(hu)} hu stops")

    stops = []
    for i, (r, h) in enumerate(zip(ro, hu)):
        if (r["stop_lat"], r["stop_lon"]) != (h["stop_lat"], h["stop_lon"]):
            raise ValueError(f"line {line} {direction} seq {i + 1}: coordinates differ")
        stops.append(
            {
                "stop_sequence": i + 1,
                "name": {
                    "ro": NAME_CANON.get(r["stop_name_ro"], r["stop_name_ro"]),
                    "hu": NAME_CANON.get(h["stop_name_ro"], h["stop_name_ro"]),
                },
                "stop_lat": r["stop_lat"],
                "stop_lon": r["stop_lon"],
                "distance_to_next_m": metres(r["distance_to_next"]),
            }
        )

    first, last = stops[0], stops[-1]
    circular = (first["stop_lat"], first["stop_lon"]) == (last["stop_lat"], last["stop_lon"])

    return {
        "line": line,
        "direction": direction,
        "circular": circular,
        # on a loop the final entry re-states the first stop to close the circuit
        "closes_loop_at_start": circular,
        "headsign": {"ro": ro[0]["direction"], "hu": hu[0]["direction"]},
        "source": {
            "ro": source_url(line, direction, "ro"),
            "hu": source_url(line, direction, "hu"),
        },
        "stop_count": len(stops),
        "stops": stops,
    }


def main():
    written, problems = [], []
    for line_dir in sorted(ROOT.glob("line-*")):
        line = line_dir.name.removeprefix("line-")
        for direction in ("depart", "return"):
            folder = line_dir / direction
            ro_path = folder / f"{line}-ro.json"
            hu_path = folder / f"{line}-hu.json"
            if not (ro_path.exists() and hu_path.exists()):
                continue
            try:
                data = merge(line, direction, ro_path, hu_path)
            except ValueError as exc:
                problems.append(str(exc))
                continue
            out = line_dir / f"{direction}.json"
            out.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
            written.append((out, data))

    for out, data in written:
        flag = " circular" if data["circular"] else ""
        print(f"{str(out):28}  {data['stop_count']:>2} stops{flag}")
    print(f"\n{len(written)} merged files, {sum(d['stop_count'] for _, d in written)} stop records.")
    if problems:
        print("PROBLEMS:", *problems, sep="\n  ")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
