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


def _compatible_columns(line, direction, circular, stop_name, entries, service, *, platform=None):
    """Prefer an explicit D column; a marked base event is only its fallback."""
    # A non-circular line has two physical directions.  A clock for the other
    # direction must never be copied onto this path.  Circular lines have one
    # ordered circuit; their changing destination display is not a second path.
    belongs_here = lambda entry: (circular or
                                  entry.get("direction", direction) == direction)
    at_platform = lambda entry: (platform is None or entry.get("_platform") is None
                                 or entry.get("_platform") == platform)
    direct = [entry for entry in entries if entry["line"] == line
              and belongs_here(entry)
              and entry["stop_ro"] == stop_name and _events(entry, service)]
    direct = [entry for entry in direct if at_platform(entry)]
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
                and entry["stop_ro"] == stop_name and at_platform(entry)
                and _events(entry, service, marked=True)]

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
    compatible = [entry for entry in entries
                  if entry["line"] in ({direction["line"], direction["line"][:-1]}
                                        if direction["line"].endswith("D")
                                        else {direction["line"]})
                  and entry.get("direction", source_direction) == source_direction
                  and (destination is None or entry.get("destination") == destination)]

    # Route geometry can still have an old coordinate on the wrong kerb.  Do
    # not throw away its literal clock merely for that reason.  But when the
    # source provides two columns for the same name and one *does* match the
    # reviewed physical call, the other one is conclusively the opposite side.
    platforms_by_name = {}
    for index, stop in enumerate(direction["stops"]):
        platform = (direction.get("callPlatforms") or [])[index:index + 1]
        if platform:
            platforms_by_name.setdefault(stop["name"]["ro"], set()).add(platform[0])
    result = []
    for entry in compatible:
        wanted = platforms_by_name.get(entry["stop_ro"], set())
        matching_column_exists = any(
            other["stop_ro"] == entry["stop_ro"]
            and other.get("_platform") in wanted
            for other in compatible
        )
        if (entry.get("_platform") is not None and wanted
                and entry["_platform"] not in wanted and matching_column_exists):
            continue
        result.append(entry)
    return result


def _seed_starts(candidates):
    """Coalesce estimates of the same run without joining neighbouring runs.

    Each candidate carries the literal board column that produced it.  Close
    estimates from *different* stops are normal rounding noise, but two close
    events from one printed column are two actual departures and may never be
    averaged into one.
    """
    if not candidates:
        return []
    normalised = [value if isinstance(value, tuple) else (value, index)
                  for index, value in enumerate(candidates)]
    groups = [[value] for value in sorted(normalised)]
    merged = [groups[0]]
    for group in groups[1:]:
        previous = merged[-1]
        used_columns = {column for _minute_value, column in previous}
        # Road-duration estimates from neighbouring stop boards can differ a
        # few minutes. Five minutes is safe only while they are distinct board
        # columns; the current 1D board proves that one column can contain two
        # real departures four minutes apart.
        if group[0][0] - previous[-1][0] <= 5 and group[0][1] not in used_columns:
            merged[-1].extend(group)
        else:
            merged.append(group)
    return [round(sum(value for value, _column in group) / len(group))
            for group in merged]


def _column_identity(entry):
    source = entry.get("source_station_ids")
    if source is None:
        source = [entry.get("source_station_id")]
    return (tuple(source), entry["line"], entry.get("direction", "depart"),
            entry["stop_ro"], entry["destination"], entry.get("_platform"))


def _column_score(predicted, entry, service, tolerance):
    observed = [_minute(event) for event in _events(entry, service)]
    pairs = align_events(predicted, observed, tolerance)
    gap = sum(abs(predicted[trip] - observed[event]) for trip, event in pairs)
    return len(pairs), gap, pairs, observed


def _nearest_published_call(trip, index, step):
    """Find the next hard timetable anchor in one direction."""
    candidate = index + step
    while 0 <= candidate < len(trip["published"]):
        if trip["published"][candidate]:
            return candidate, trip["calls"][candidate]
        candidate += step
    return None


def _fill_estimated_calls(trip):
    """Re-fit soft duration estimates around the literal clock anchors.

    The former implementation treated an old road-duration prediction as if
    it were an official departure.  A genuine board time could therefore be
    rejected merely because it landed after an estimated neighbouring call.
    Only two published values constrain one another; every other call is
    re-scaled between the surrounding hard anchors afterwards.
    """
    baseline = trip.pop("_baseline_calls")
    calls, published = trip["calls"], trip["published"]
    anchors = [index for index, exact in enumerate(published) if exact]
    if not anchors:
        trip["start"] = calls[0]
        return

    for index, exact in enumerate(published):
        if exact:
            continue
        left = next((anchor for anchor in reversed(anchors) if anchor < index), None)
        right = next((anchor for anchor in anchors if anchor > index), None)
        if left is not None and right is not None:
            baseline_span = baseline[right] - baseline[left]
            if baseline_span > 0:
                ratio = (baseline[index] - baseline[left]) / baseline_span
                calls[index] = round(calls[left] + ratio * (calls[right] - calls[left]))
            else:
                calls[index] = calls[left]
        elif left is not None:
            calls[index] = calls[left] + baseline[index] - baseline[left]
        else:
            calls[index] = calls[right] - (baseline[right] - baseline[index])
    trip["start"] = calls[0]


def _median(values):
    values = sorted(values)
    middle = len(values) // 2
    if len(values) % 2:
        return values[middle]
    return round((values[middle - 1] + values[middle]) / 2)


def _smooth_peer_baseline(baseline, learned, road_baseline=None, protected=()):
    """Connect peer-learned points through the original road-time profile.

    A repeated stop can lack a literal peer value while its two neighbours do
    have one.  Leaving that one old road-only value in place can make the
    inferred baseline turn backwards.  Re-scale the untouched part of each
    bracket by its original road-duration proportions.  If the peer evidence
    itself would require time to turn backwards, reject the entire learned
    profile and retain the conservative road-duration baseline instead.
    """
    original = baseline[:] if road_baseline is None else road_baseline[:]
    # Literal anchors constrain the final re-fit.  Their road-profile position
    # must remain untouched, otherwise a learned value on either side shifts
    # that anchor a second time when `_fill_estimated_calls` scales the span.
    controls = sorted(set(learned) | set(protected))
    for left, right in zip(controls, controls[1:]):
        if baseline[right] < baseline[left]:
            baseline[:] = original
            return False
        old_span = original[right] - original[left]
        new_span = baseline[right] - baseline[left]
        if old_span <= 0:
            continue
        for index in range(left + 1, right):
            if index not in learned:
                ratio = (original[index] - original[left]) / old_span
                baseline[index] = round(baseline[left] + ratio * new_span)

    if any(right < left for left, right in zip(baseline, baseline[1:])):
        baseline[:] = original
        return False
    return True


def _learn_peer_baselines(trips):
    """Replace road-only soft offsets with observed timetable offsets.

    A sparse source column still gives one literal time for its run.  Other
    runs of the *same direction and service* often publish a pair of the same
    calls, and their difference is a better model of the bus's actual running
    time than the road-duration guess.  Only literal values participate; an
    earlier estimate must never become evidence for a later estimate.
    """
    deltas = {}
    for trip in trips:
        anchors = [index for index, exact in enumerate(trip["published"]) if exact]
        for source in anchors:
            for target in anchors:
                if source == target:
                    continue
                deltas.setdefault((source, target), []).append(
                    trip["calls"][target] - trip["calls"][source])

    for trip in trips:
        baseline = trip["_baseline_calls"]
        road_baseline = baseline[:]
        learned = set()
        anchors = [index for index, exact in enumerate(trip["published"]) if exact]
        for target, exact in enumerate(trip["published"]):
            if exact:
                continue
            # A nearby literal anchor describes the same small section of the
            # journey.  Mixing a distant anchor with it distorts the profile
            # whenever this particular run accumulated delay earlier on the
            # route (especially around a loop).  Use the closest anchors only;
            # ties on the two sides are still averaged below.
            usable = [source for source in anchors if (source, target) in deltas]
            if not usable:
                continue
            nearest_distance = min(abs(source - target) for source in usable)
            usable = [source for source in usable
                      if abs(source - target) == nearest_distance]
            # `_fill_estimated_calls` consumes this as a relative profile: it
            # adds `baseline[target] - baseline[source]` to this run's actual
            # published anchor.  Keep the peer's observed duration, but place
            # it on *this* run's road baseline.  Copying the peer's absolute
            # clock here would count any earlier timetable displacement twice.
            candidates = [baseline[source] + _median(deltas[(source, target)])
                          for source in usable]
            baseline[target] = _median(candidates)
            learned.add(target)
        _smooth_peer_baseline(baseline, learned, road_baseline, anchors)


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
    call_platforms = direction.get("callPlatforms", [])
    platform_at = lambda index: call_platforms[index] if index < len(call_platforms) else None
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
                    candidates.extend((_minute(event) - offset_minutes[index],
                                       _column_identity(entry))
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
                  "_baseline_calls": [start + offset for offset in offset_minutes],
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
                    platform = platform_at(index)
                    if (len(indices) > 1 and platform is not None and column.get("_platform") is not None
                            and column["_platform"] != platform):
                        continue
                    predicted = [trip["calls"][index] for trip in trips]
                    score = _column_score(predicted, column, service, tolerance)
                    choices.append((score[0], score[1], index, score))
                if choices:
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
            same_physical_pass = (len(indices) > 1 and
                                  len({platform_at(index) for index in indices}) == 1)
            claimed = set()
            ranked = sorted(proposals,
                            key=lambda proposal: max((choice[0], -choice[1])
                                                       for choice in proposal[1]),
                            reverse=True)
            for _column, choices in ranked:
                available = [choice for choice in choices if choice[2] not in claimed]
                if not available:
                    continue
                # If the source gives only one literal column for the same
                # physical kerb twice in a loop segment, it is the first pass
                # through that segment by default.  Duration estimates may
                # decide neither the kerb nor the pass; they are only a
                # tie-breaker once the public topology has done so.
                matches, gap, index, best = max(
                    available,
                    key=(lambda choice: (choice[0], -choice[2], -choice[1]))
                    if same_physical_pass else
                    (lambda choice: (choice[0], -choice[1])),
                )
                if matches == 0:
                    continue
                claimed.add(index)
                for trip_index, event_index in best[2]:
                    observed = best[3][event_index]
                    previous = _nearest_published_call(trips[trip_index], index, -1)
                    following = _nearest_published_call(trips[trip_index], index, 1)
                    if ((previous is not None and observed < previous[1]) or
                            (following is not None and observed > following[1])):
                        report.append({
                            "line": direction["line"],
                            "direction": direction["direction"],
                            "service": service,
                            "stop": name,
                            "reason": "would break time order",
                            "observed": observed,
                            **({"previous": previous[1]} if previous is not None else {}),
                            **({"following": following[1]} if following is not None else {}),
                        })
                        continue
                    trips[trip_index]["calls"][index] = observed
                    trips[trip_index]["published"][index] = True
        _learn_peer_baselines(trips)
        for trip in trips:
            _fill_estimated_calls(trip)
        result[service] = trips

    return result, report
