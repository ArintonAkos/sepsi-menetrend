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


def _turnaround_dwell(direction, entries, turns, service):
    """Infer each declared terminal wait from its two literal board columns.

    The clock on the terminus-facing column is the arrival; the clock on the
    outgoing-facing column is the departure.  Their ordinal pairing is the
    operator's only published evidence for the layover, so do not replace it
    with a road-duration guess.
    """
    key = direction.get("key", f"{direction['line']}-{direction['direction']}")
    out = {}
    for turn in turns.get(key, []):
        columns = _compatible_columns(direction["line"], direction["direction"],
                                      bool(direction.get("circular")), turn["stop_ro"],
                                      entries, service)
        arrival = next((column for column in columns
                        if column["destination"] == turn["arrival_destination"]), None)
        departure = next((column for column in columns
                          if column["destination"] == turn["departure_destination"]), None)
        if not arrival or not departure:
            continue
        arrivals = [_minute(event) for event in _events(arrival, service)]
        departures = [_minute(event) for event in _events(departure, service)]
        waits = [depart - arrive for arrive, depart in zip(arrivals, departures)
                 if depart >= arrive + turn["minimum_dwell_minutes"]]
        if waits:
            waits.sort()
            out[turn["index"]] = waits[len(waits) // 2]
    return out


def _event_offsets(offset_minutes, dwells):
    """Return predicted arrival/departure offsets with terminal waits included."""
    arrival, departure = [], []
    elapsed_wait = 0
    for index, offset in enumerate(offset_minutes):
        arrive = offset + elapsed_wait
        arrival.append(arrive)
        wait = dwells.get(index, 0)
        departure.append(arrive + wait)
        elapsed_wait += wait
    return arrival, departure


def _blank_call(arrival, departure):
    return {
        "arrival": arrival,
        "departure": departure,
        "published_arrival": False,
        "published_departure": False,
    }


def _set_anchor(call, role, observed):
    """Set a literal source time once; conflicting source values are invalid."""
    roles = (("arrival", "published_arrival"), ("departure", "published_departure")) \
        if role == "both" else ((role, f"published_{role}"),)
    for key, published in roles:
        if call[published] and call[key] != observed:
            raise ValueError(f"conflicting published {key}: {call[key]} != {observed}")
        call[key] = observed
        call[published] = True


def _propagate_calls(calls):
    """Carry a terminal departure forward without overwriting source anchors."""
    for index in range(1, len(calls)):
        previous, current = calls[index - 1], calls[index]
        if current["arrival"] < previous["departure"]:
            if current["published_arrival"]:
                raise ValueError(
                    f"published arrival {current['arrival']} precedes prior departure "
                    f"{previous['departure']} at call {index}"
                )
            current["arrival"] = previous["departure"]
        if current["departure"] < current["arrival"]:
            if current["published_departure"]:
                raise ValueError(
                    f"published departure {current['departure']} precedes arrival "
                    f"{current['arrival']} at call {index}"
                )
            current["departure"] = current["arrival"]


def reconstruct_direction(direction, entries, offsets, turnarounds=None, tolerance=12):
    """Reconstruct each service's ordered calls from literal board columns.

    The route page supplies `direction["stops"]` and duration offsets. The
    station board supplies clocks. One unambiguous, well-populated column seeds
    trips; every other column is aligned independently in chronological order.
    A call with no matched board event keeps its measured-duration prediction.
    """
    turns = turnarounds or {}
    direction_key = direction.get("key", f"{direction['line']}-{direction['direction']}")
    names = [stop["name"]["ro"] for stop in direction["stops"]]
    offset_minutes = [round(seconds / 60) for seconds in offsets]
    occurrences = {name: names.count(name) for name in set(names)}
    circular = bool(direction.get("circular"))
    result, report = {"weekday": [], "weekend": []}, []

    for service in result:
        dwells = _turnaround_dwell(direction, entries, turns, service)
        arrival_offsets, departure_offsets = _event_offsets(offset_minutes, dwells)
        candidates = []
        for index, name in enumerate(names):
            if occurrences[name] != 1:
                continue
            for entry in _compatible_columns(direction["line"], direction["direction"],
                                             circular, name, entries, service):
                role = turnaround_role(turns, direction_key, index, entry["destination"]) or "both"
                predicted_offset = (arrival_offsets[index] if role == "arrival"
                                    else departure_offsets[index])
                events = _events(entry, service)
                if events:
                    candidates.extend(_minute(event) - offset_minutes[index]
                                      - (predicted_offset - offset_minutes[index])
                                      for event in events)
        if not candidates:
            has_service = any(_events(entry, service) for entry in entries
                              if entry["line"] == direction["line"]
                              and (circular or entry.get("direction", direction["direction"])
                                   == direction["direction"]))
            if has_service:
                report.append({"line": direction["line"], "direction": direction["direction"],
                               "service": service, "reason": "no unambiguous anchor"})
            continue

        starts = _seed_starts(candidates)
        trips = [{"start": start,
                  "calls": [_blank_call(start + arrival, start + departure)
                            for arrival, departure in zip(arrival_offsets, departure_offsets)]}
                 for start in starts]

        for name in dict.fromkeys(names):
            columns = _compatible_columns(direction["line"], direction["direction"],
                                          circular, name, entries, service)
            if not columns:
                continue
            indices = [index for index, candidate in enumerate(names)
                       if candidate == name]
            proposals = []
            for column in columns:
                choices = []
                for index in indices:
                    role = turnaround_role(
                        turns, direction_key, index, column["destination"],
                    ) or "both"
                    time_key = "arrival" if role == "arrival" else "departure"
                    predicted = [trip["calls"][index][time_key] for trip in trips]
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
                role_at = lambda index: turnaround_role(
                    turns, direction_key, index, _column["destination"],
                ) or "both"
                available = [choice for choice in choices
                             if (choice[2], role_at(choice[2])) not in claimed]
                if not available:
                    continue
                matches, gap, index, best = max(available,
                                                key=lambda choice: (choice[0], -choice[1]))
                if matches == 0:
                    continue
                role = role_at(index)
                claimed.add((index, role))
                for trip_index, event_index in best[2]:
                    observed = best[3][event_index]
                    _set_anchor(trips[trip_index]["calls"][index], role, observed)
        for trip in trips:
            try:
                _propagate_calls(trip["calls"])
            except ValueError as error:
                report.append({
                    "line": direction["line"], "direction": direction["direction"],
                    "service": service, "reason": str(error),
                })
        result[service] = trips

    return result, report
