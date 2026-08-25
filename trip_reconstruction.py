"""Match independent official stop-board clocks onto ordered route calls."""

OPERATING_DAY_ENDS_AT = 4 * 60


def load_turnarounds(raw):
    """Validate the source-headsign roles at verified terminal calls."""
    turns = {}
    for direction_key, entries in raw.items():
        seen = set()
        loaded = []
        for entry in entries:
            index = entry["index"]
            arrival = entry["arrival_destination"]
            departure = entry["departure_destination"]
            if arrival == departure:
                raise ValueError(f"{direction_key} call {index}: identical turnaround destinations")
            for role in ("arrival", "departure"):
                key = (index, role)
                if key in seen:
                    raise ValueError(f"{direction_key} call {index}: duplicate {role} role")
                seen.add(key)
            loaded.append({
                "index": index,
                "stop_ro": entry["stop_ro"],
                "arrival_destination": arrival,
                "departure_destination": departure,
                "minimum_dwell_minutes": entry["minimum_dwell_minutes"],
            })
        turns[direction_key] = loaded
    return turns


def turnaround_role(turns, direction_key, index, destination):
    """Return the event role only for an exact verified board headsign."""
    for entry in turns.get(direction_key, []):
        if entry["index"] != index:
            continue
        if entry["arrival_destination"] == destination:
            return "arrival"
        if entry["departure_destination"] == destination:
            return "departure"
    return None


def _service_minute(minute):
    """Put the operator's 00:xx–03:xx clocks after the preceding evening."""
    return minute + 24 * 60 if minute < OPERATING_DAY_ENDS_AT else minute


def align_events(predicted, observed, tolerance):
    """Return ordered `(trip index, event index)` matches within `tolerance`.

    The best alignment has the most matches. Ties use the smallest total gap
    from the ordered route's measured-duration prediction. Skipping either a
    trip or a board event is allowed, so a missing printed time never shifts
    every later trip by one position.
    """
    observed = [_service_minute(minute) for minute in observed]
    # (number of matches, accumulated gap, pair list)
    best = [[(0, 0, []) for _ in range(len(observed) + 1)]
            for _ in range(len(predicted) + 1)]

    def choose(*choices):
        return max(choices, key=lambda item: (item[0], -item[1]))

    for trip_index in range(1, len(predicted) + 1):
        for event_index in range(1, len(observed) + 1):
            choices = [best[trip_index - 1][event_index],
                       best[trip_index][event_index - 1]]
            gap = abs(predicted[trip_index - 1] - observed[event_index - 1])
            if gap <= tolerance:
                matched = best[trip_index - 1][event_index - 1]
                choices.append((matched[0] + 1, matched[1] + gap,
                                matched[2] + [(trip_index - 1, event_index - 1)]))
            best[trip_index][event_index] = choose(*choices)

    return best[-1][-1][2]


def _minute(event):
    hour, minute = (int(part) for part in event["time"].split(":"))
    return _service_minute(hour * 60 + minute)


def _events(entry, service, *, marked=None):
    events = entry.get("events", {}).get(service)
    if events is None:
        events = [{"time": value, "marked": False}
                  for value in entry.get("times", {}).get(service, [])]
    if marked is None:
        marked = entry.get("_marked")
    if marked is not None:
        events = [event for event in events if bool(event.get("marked", False)) is marked]
    return sorted(events, key=_minute)


def _compatible_columns(line, direction, circular, stop_name, entries, service):
    """Prefer an explicit D column; a marked base event is only its fallback."""
    # A non-circular line has two physical directions.  A clock for the other
    # direction must never be copied onto this path.  Circular lines have one
    # ordered circuit; their changing destination display is not a second path.
    belongs_here = lambda entry: (circular or
                                  entry.get("direction", direction) == direction)
    direct = [entry for entry in entries if entry["line"] == line
              and belongs_here(entry)
              and entry["stop_ro"] == stop_name and _events(entry, service)]
    if direct:
        # Base lines contain the D extension in the same printed column.  A
        # normal line must see only its unmarked events; the D line keeps its
        # own direct column intact.
        return [{**entry, "_marked": None if line.endswith("D") else False}
                for entry in direct]

    if line.endswith("D"):
        base = line[:-1]
        return [{**entry, "_marked": True}
                for entry in entries if entry["line"] == base
                and belongs_here(entry)
                and entry["stop_ro"] == stop_name and _events(entry, service, marked=True)]

    return []


def bound_board_columns(direction, entries):
    """Return the literal columns whose source direction and destination own a segment.

    A circular route page may contain the same named stop on two physical
    passes.  The public destination is the only source fact that tells those
    passes apart, so a segment may consume only its exact destination column.
    Unsliced directions intentionally keep their previous name-and-direction
    behaviour.
    """
    source_direction = direction.get("source_direction", direction["direction"])
    destination = direction.get("destination")
    return [entry for entry in entries
            if entry["line"] in ({direction["line"], direction["line"][:-1]}
                                  if direction["line"].endswith("D")
                                  else {direction["line"]})
            and entry.get("direction", source_direction) == source_direction
            and (destination is None or entry.get("destination") == destination)]


def _seed_starts(candidates):
    """Coalesce estimates of the same run without joining neighbouring runs."""
    if not candidates:
        return []
    groups = [[value] for value in sorted(candidates)]
    merged = [groups[0]]
    for group in groups[1:]:
        # Road-duration estimates are rounded and can differ a few minutes
        # between adjacent stop boards. Five minutes is deliberately below the
        # network's shortest regular headway, so two actual runs stay separate.
        if group[0] - merged[-1][-1] <= 5:
            merged[-1].extend(group)
        else:
            merged.append(group)
    return [round(sum(group) / len(group)) for group in merged]


def _column_score(predicted, entry, service, tolerance):
    observed = [_minute(event) for event in _events(entry, service)]
    pairs = align_events(predicted, observed, tolerance)
    gap = sum(abs(predicted[trip] - observed[event]) for trip, event in pairs)
    return len(pairs), gap, pairs, observed


def reconstruct_direction(direction, entries, offsets, tolerance=12):
    """Reconstruct each service's ordered calls from literal board columns.

    The route page supplies `direction["stops"]` and duration offsets. The
    station board supplies clocks. One unambiguous, well-populated column seeds
    trips; every other column is aligned independently in chronological order.
    A call with no matched board event keeps its measured-duration prediction.
    """
    entries = bound_board_columns(direction, entries)
    names = [stop["name"]["ro"] for stop in direction["stops"]]
    offset_minutes = [round(seconds / 60) for seconds in offsets]
    occurrences = {name: names.count(name) for name in set(names)}
    circular = bool(direction.get("circular"))
    result, report = {"weekday": [], "weekend": []}, []

    for service in result:
        candidates = []
        for index, name in enumerate(names):
            if occurrences[name] != 1:
                continue
            for entry in _compatible_columns(direction["line"], direction.get("source_direction", direction["direction"]),
                                             circular, name, entries, service):
                events = _events(entry, service)
                if events:
                    candidates.extend(_minute(event) - offset_minutes[index]
                                      for event in events)
        if not candidates:
            has_service = any(_events(entry, service) for entry in entries
                              if entry["line"] == direction["line"]
                              and (circular or entry.get("direction", direction.get("source_direction", direction["direction"]))
                                   == direction.get("source_direction", direction["direction"])))
            if has_service:
                report.append({"line": direction["line"], "direction": direction["direction"],
                               "service": service, "reason": "no unambiguous anchor"})
            continue

        starts = _seed_starts(candidates)
        trips = [{"start": start,
                  "calls": [start + offset for offset in offset_minutes],
                  "published": [False] * len(names)}
                 for start in starts]

        for name in dict.fromkeys(names):
            columns = _compatible_columns(direction["line"], direction.get("source_direction", direction["direction"]),
                                          circular, name, entries, service)
            if not columns:
                continue
            indices = [index for index, candidate in enumerate(names)
                       if candidate == name]
            proposals = []
            for column in columns:
                choices = []
                for index in indices:
                    predicted = [trip["calls"][index] for trip in trips]
                    score = _column_score(predicted, column, service, tolerance)
                    choices.append((score[0], score[1], index, score))
                proposals.append((column, choices))

            if not any(matches for _column, choices in proposals
                       for matches, _gap, _index, _score in choices):
                report.append({"line": direction["line"], "direction": direction["direction"],
                               "service": service, "stop": name,
                               "reason": "board column cannot be aligned"})
                continue

            # A repeated physical stop appears twice on a loop page.  A single
            # board column can describe only one pass through it, so assign it
            # to its best-fitting occurrence and never copy its times to both.
            claimed = set()
            ranked = sorted(proposals,
                            key=lambda proposal: max((choice[0], -choice[1])
                                                       for choice in proposal[1]),
                            reverse=True)
            for _column, choices in ranked:
                available = [choice for choice in choices if choice[2] not in claimed]
                if not available:
                    continue
                matches, gap, index, best = max(available,
                                                key=lambda choice: (choice[0], -choice[1]))
                if matches == 0:
                    continue
                claimed.add(index)
                for trip_index, event_index in best[2]:
                    observed = best[3][event_index]
                    before = trips[trip_index]["calls"][index - 1] if index else None
                    after = (trips[trip_index]["calls"][index + 1]
                             if index + 1 < len(names) else None)
                    if ((before is not None and observed < before) or
                            (after is not None and observed > after)):
                        report.append({
                            "line": direction["line"],
                            "direction": direction["direction"],
                            "service": service,
                            "stop": name,
                            "reason": "would break time order",
                        })
                        continue
                    trips[trip_index]["calls"][index] = observed
                    trips[trip_index]["published"][index] = True
        result[service] = trips

    return result, report
