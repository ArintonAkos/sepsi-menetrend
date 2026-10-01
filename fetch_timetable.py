#!/usr/bin/env python3
"""Pull the published departure times and normalise them onto our stops.

Source: https://www.multitrans.ro/orarele/multitrans_menetrendek_web.html
The page renders client-side from a `const STATIONS = [...]` array, so the data
is read out of the script rather than the markup.

Two compatibility details matter when importing it:

  * current pages label `ro` and `hu` correctly, but older downloads reversed
    them; the importer accepts both only when the known Romanian stop name
    confirms the orientation;
  * a handful of stops are spelled differently here than on the line pages.

Output  timetable.json

The Sept 7 2026 board publishes 221 line-at-station columns across 100 stops
(lines 1, 1B, 1D, 2, 2D, 3, 4, 5, 6, 7, 9, 10). The route geometry has more
physical calls than the board, so only those explicit columns are marked as
GTFS timing points; the remaining calls retain a clearly labelled
interpolation. Columns whose line geometry has not been rebuilt yet (1B, and
the split Kossuth Lajos poles on line 10) stay unbound until later tasks.
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
ORDER = ["1", "1B", "1D", "2", "2D", "3", "4", "5", "5D", "6", "7", "9", "10", "10B"]

# Timetable spelling -> the name used on the line pages.
ALIASES = {
    "Centru comercial": "Centru Comercial",
    "Simeria (Str.Berzei)": "Cap Linie Simeria",
    # Sept 7 board: the Szemerja terminus is printed as "Simeria (Str. Berzei)"
    # (with a space) and, on a few columns, with the ro/hu fields swapped. Both
    # spellings are the same pole we hold as "Cap Linie Simeria".
    "Simeria (Str. Berzei)": "Cap Linie Simeria",
    "Szemerja (Gólya utca)": "Cap Linie Simeria",
    # Sept 7 board: new/renamed stops on the Árkos and Szotyor tails.
    "Bis. Reformată Arcuș": "Biserica Reformată Arcuș",
    "Coșeni": "Coșeni 2",
    # The board splits "Cart. Kossuth Lajos" into numbered poles; the board
    # spelling is already the canonical one, so map it to itself rather than
    # let a later rewrite touch it.
    "Str. Kossuth Lajos 1": "Str. Kossuth Lajos 1",
    "Str. Kossuth Lajos 2": "Str. Kossuth Lajos 2",
    "Cart. Ciucului": "Cartierul Ciucului",
    "Liceul de Artă Plugor Sándor": "Lic. Plugor Sándor",
    "Piaţa Kálvin": "Piața Kálvin",
    "Liceul M. Viteazul": "Col. Mihai Viteazul",
    "B-dul G.Bălan 2": "B-dul Grigore Bălan 2",
    "B-dul G.Bălan 1": "B-dul Grigore Bălan 1",
    "Institutul de proiectări": "Institutul de Proiectări",
    "Parc Elisabeta": "Parcul Elisabeta",
    "B-dul. N. Iorga 1": "B-dul Nicolae Iorga 1",
    "B-dul. N. Iorga 2": "B-dul Nicolae Iorga 2",
    "B-dul.N.Iorga 1": "B-dul Nicolae Iorga 1",
    "B-dul.N.Iorga 2": "B-dul Nicolae Iorga 2",
    "Gara CFR (1)": "Gara CFR",
    "Gara CFR (2)": "Gara CFR",
    "Str. Borvíz": "Str. Borviz",
}

# The two service patterns the operator publishes.
SERVICES = {
    "Zile lucrătoare / Munkanapok": "weekday",
    "Sâmbătă & Duminică / Szombat & Vasárnap": "weekend",
}

# A smaller result means the operator page changed or an import bug returned.
# Refuse to replace a complete local timetable with such a partial download.
MIN_STATIONS = 95
# retuned 2026-09-09 to the Sept 7 board: a full live run binds 100 stations /
# 221 timing points / 6269 departures with every board column placed. These
# floors sit ~10% below that and still reject a genuinely partial download.
MIN_TIMEPOINTS = 198
MIN_DEPARTURES = 5642


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


def events_of(schedule):
    """Read exact board events, including a marked D-extension departure."""
    out = []
    for row in schedule["rows"]:
        hour = row["h"].strip()
        entries = row.get("entries")
        if entries is None:
            entries = [{"m": minute, "marked": False}
                       for minute in row.get("m", "").split()]
        for entry in entries:
            minute = entry["m"]
            out.append({"time": f"{int(hour):02d}:{int(minute):02d}",
                        "marked": bool(entry.get("marked", False))})
    return sorted(out, key=lambda event: event["time"])


def times_of(schedule):
    """Compatibility clock list for consumers that do not need D markers."""
    return [event["time"] for event in events_of(schedule)]


def normalise_station_names(station, known):
    """Return canonical names, accepting both historic and current field labels.

    For each field orientation we try the printed Romanian name against the
    line-page names first, and only then its alias. A name the line pages
    already use verbatim (the board now prints some of these, e.g. the
    "Simeria (Str. Berzei)" terminus) must not be rewritten by an alias.
    """
    candidates = (
        (station["ro"], station["hu"]),
        (station["hu"], station["ro"]),
    )
    for romanian, _hungarian in candidates:
        if romanian in known:
            return romanian, known[romanian]
        aliased = ALIASES.get(romanian, romanian)
        if aliased in known:
            return aliased, known[aliased]
    romanian, hungarian = candidates[0]
    return ALIASES.get(romanian, romanian), hungarian


def validate_coverage(station_count, timepoint_count, departure_count):
    """Reject a download that is too incomplete to safely publish."""
    actual = (station_count, timepoint_count, departure_count)
    minimum = (MIN_STATIONS, MIN_TIMEPOINTS, MIN_DEPARTURES)
    if any(value < floor for value, floor in zip(actual, minimum)):
        raise ValueError(
            "incomplete timetable: "
            f"{station_count} stations, {timepoint_count} timing points, "
            f"{departure_count} departures; minimum is "
            f"{MIN_STATIONS}, {MIN_TIMEPOINTS}, {MIN_DEPARTURES}"
        )


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


def direction_for(destination, candidates, at_stop=None):
    """Match a timetable headsign against our own, by shared words.

    On the loop lines the bus changes its displayed destination halfway round,
    so several destinations map onto the single direction we hold.

    `at_stop` is the Romanian name of the station this reading came from, when
    known - it disambiguates the stop-list fallback below.
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
    if score > 0:
        return best, score

    # The headsign alone sometimes loses: the board occasionally names a major
    # intermediate landmark instead of the final terminus (line 9's return
    # columns print "Casa cu Arcade", an existing stop on that return leg, not
    # its actual terminus "Gara CFR"). Fall back to every stop each candidate
    # calls at - restricted to candidates that actually serve the reading's
    # own station (it cannot belong to a direction that never stops there),
    # and among those, to ones where the named destination still lies ahead
    # of that station in travel order (a landmark already passed would not be
    # printed as the destination). Either narrowing is skipped if it would
    # leave nothing to choose from.
    pool = candidates
    if at_stop is not None:
        serving = [cand for cand in candidates
                   if any(stop["name"]["ro"] == at_stop for stop in cand["stops"])]
        if serving:
            pool = serving
        if len(pool) > 1:
            ahead = []
            for cand in pool:
                names = [stop["name"]["ro"] for stop in cand["stops"]]
                if at_stop not in names:
                    continue
                later = names[names.index(at_stop) + 1:]
                if wanted & set(fold(" ".join(later))):
                    ahead.append(cand)
            if ahead:
                pool = ahead

    best, score = None, 0
    for cand in pool:
        names = " ".join(
            f"{stop['name']['ro']} {stop['name']['hu']}" for stop in cand["stops"]
        )
        overlap = len(wanted & set(fold(names)))
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
        romanian, hungarian = normalise_station_names(station, known)
        if romanian not in known:
            unmatched.append(f"{romanian!r} ({hungarian!r})")
            continue

        for line in station["lines"]:
            number = line["num"]
            direction, score = direction_for(
                line["dest"], directions.get(number, []), at_stop=romanian)
            if not direction:
                ambiguous.append(f"line {number} -> {line['dest']!r}")
                continue
            if score == 0:
                ambiguous.append(f"line {number} -> {line['dest']!r} (no word matched)")

            schedules = {
                SERVICES[s["title"]]: s
                for s in line["orare"] if s["title"] in SERVICES
            }
            entries.append(
                {
                    # The public page has a separate stable id for each
                    # physical pole, even when both sides are called exactly
                    # the same (for example the two Debren stops). Keep it:
                    # a name alone cannot safely put its columns on a kerb.
                    "source_station_id": station["id"],
                    "line": number,
                    "direction": direction,
                    "stop_ro": romanian,
                    "stop_hu": known[romanian],
                    "destination": line["dest"].strip(),
                    "times": {service: times_of(schedule)
                              for service, schedule in schedules.items()},
                    "events": {service: events_of(schedule)
                               for service, schedule in schedules.items()},
                }
            )

    # the operator's own line colours, as used on their timetable page
    palette = {}
    for station in stations:
        for line in station["lines"]:
            palette.setdefault(line["num"], Counter())[line["color"].lower()] += 1
    colours = {k: v.most_common(1)[0][0] for k, v in palette.items()}

    valid = stations[0]["valid"] if stations else []
    departures = sum(len(t) for e in entries for t in e["times"].values())
    validate_coverage(len(stations), len(entries), departures)

    bundle = {
        "source": URL,
        "valid_from": valid,
        "services": sorted(SERVICES.values()),
        "colours": {k: colours[k] for k in ORDER if k in colours},
        "timepoint_count": len(entries),
        "timepoints": sorted(entries, key=lambda e: (ORDER.index(e["line"]), e["stop_ro"])),
    }
    OUTPUT.write_text(json.dumps(bundle, indent=2, ensure_ascii=False), encoding="utf-8")

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
