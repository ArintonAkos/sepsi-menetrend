#!/usr/bin/env python3
"""Pull the published departure times and normalise them onto our stops.

Source: https://www.multitrans.ro/orarele/multitrans_menetrendek_web.html
The page renders client-side from a `const STATIONS = [...]` array, so the data
is read out of the script rather than the markup.

Two things about that source have to be corrected on the way in:

  * its `hu` and `ro` keys are swapped - the field labelled `hu` holds the
    Romanian name. Checked both ways against our own stop names: 62 of 72
    match when swapped, 2 when taken at face value.
  * a handful of stops are spelled differently here than on the line pages.

Output  timetable.json

Only 36 of the 66 stops carry published times; they are the timing points.
Times for the rest have to be interpolated when stop_times.txt is built, which
is what GTFS's timepoint=0 is for.
"""

import json
import re
from collections import Counter
import sys
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
URL = "https://www.multitrans.ro/orarele/multitrans_menetrendek_web.html"
OUTPUT = ROOT / "timetable.json"
ORDER = ["1", "1D", "2", "2D", "3", "4", "5", "5D", "6", "7", "9", "10"]

# Timetable spelling -> the name used on the line pages.
ALIASES = {
    "Centru comercial": "Centru Comercial",
    "Simeria (Str.Berzei)": "Cap Linie Simeria",
    "Cart. Ciucului": "Cartierul Ciucului",
}

# The two service patterns the operator publishes.
SERVICES = {
    "Zile lucrătoare / Munkanapok": "weekday",
    "Sâmbătă & Duminică / Szombat & Vasárnap": "weekend",
}


def fold(text):
    """Lowercase, strip accents and punctuation, for loose name comparison."""
    plain = unicodedata.normalize("NFKD", text)
    plain = "".join(c for c in plain if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]", " ", plain.lower()).split()


def extract(page):
    """Read the STATIONS array out of the page script."""
    start = page.index("[", page.index("const STATIONS ="))
    depth, i, in_string, escaped = 0, start, False, False
    while i < len(page):
        c = page[i]
        if in_string:
            if escaped:
                escaped = False
            elif c == "\\":
                escaped = True
            elif c == '"':
                in_string = False
        elif c == '"':
            in_string = True
        elif c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                break
        i += 1
    return json.loads(page[start:i + 1])


def times_of(schedule):
    """[{h:'07', m:'25 55'}] -> ['07:25', '07:55']"""
    out = []
    for row in schedule["rows"]:
        hour = row["h"].strip()
        for minute in row["m"].split():
            out.append(f"{int(hour):02d}:{int(minute):02d}")
    return sorted(out)


def load_directions():
    out = {}
    for line in ORDER:
        for direction in ("depart", "return"):
            path = ROOT / f"line-{line}" / f"{direction}.json"
            if path.exists():
                out.setdefault(line, []).append(
                    json.loads(path.read_text(encoding="utf-8"))
                )
    return out


def direction_for(destination, candidates):
    """Match a timetable headsign against our own, by shared words.

    On the loop lines the bus changes its displayed destination halfway round,
    so several destinations map onto the single direction we hold.
    """
    if len(candidates) == 1:
        return candidates[0]["direction"], 1.0

    wanted = set(fold(destination))
    best, score = None, 0
    for cand in candidates:
        target = cand["headsign"]["hu"].split("→")[-1]
        target += " " + cand["headsign"]["ro"].split("→")[-1]
        overlap = len(wanted & set(fold(target)))
        if overlap > score:
            best, score = cand["direction"], overlap
    return best, score


def main():
    page = urllib.request.urlopen(
        urllib.request.Request(URL, headers={"User-Agent": "MultiTrans-GTFS/1.0"}),
        timeout=40,
    ).read().decode("utf-8")

    stations = extract(page)
    directions = load_directions()

    known = {}
    for variants in directions.values():
        for d in variants:
            for stop in d["stops"]:
                known[stop["name"]["ro"]] = stop["name"]["hu"]

    entries, unmatched, ambiguous = [], [], []
    for station in stations:
        # the page labels these the wrong way round
        romanian, hungarian = station["hu"], station["ro"]
        romanian = ALIASES.get(romanian, romanian)
        if romanian not in known:
            unmatched.append(f"{romanian!r} ({hungarian!r})")
            continue

        for line in station["lines"]:
            number = line["num"]
            direction, score = direction_for(line["dest"], directions.get(number, []))
            if not direction:
                ambiguous.append(f"line {number} -> {line['dest']!r}")
                continue
            if score == 0:
                ambiguous.append(f"line {number} -> {line['dest']!r} (no word matched)")

            entries.append(
                {
                    "line": number,
                    "direction": direction,
                    "stop_ro": romanian,
                    "stop_hu": known[romanian],
                    "destination": line["dest"].strip(),
                    "times": {
                        SERVICES[s["title"]]: times_of(s)
                        for s in line["orare"]
                        if s["title"] in SERVICES
                    },
                }
            )

    # the operator's own line colours, as used on their timetable page
    palette = {}
    for station in stations:
        for line in station["lines"]:
            palette.setdefault(line["num"], Counter())[line["color"].lower()] += 1
    colours = {k: v.most_common(1)[0][0] for k, v in palette.items()}

    valid = stations[0]["valid"] if stations else []
    bundle = {
        "source": URL,
        "valid_from": valid,
        "services": sorted(SERVICES.values()),
        "colours": {k: colours[k] for k in ORDER if k in colours},
        "timepoint_count": len(entries),
        "timepoints": sorted(entries, key=lambda e: (ORDER.index(e["line"]), e["stop_ro"])),
    }
    OUTPUT.write_text(json.dumps(bundle, indent=2, ensure_ascii=False), encoding="utf-8")

    departures = sum(len(t) for e in entries for t in e["times"].values())
    print(f"{len(stations)} timetabled stops -> {len(entries)} line/direction timing points")
    print(f"{departures} published departure times, services: {bundle['services']}")
    print(f"valid from: {valid}")
    if unmatched:
        print("\nstops with no match on the line pages:", *unmatched, sep="\n  ")
    if ambiguous:
        print("\ndirection could not be resolved:", *sorted(set(ambiguous)), sep="\n  ")
    return 0


if __name__ == "__main__":
    sys.exit(main())
