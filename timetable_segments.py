"""Split route-page circuits where the operator changes the displayed destination."""

from copy import deepcopy


def expand_timetable_segments(directions, raw):
    """Return source directions or their verified destination-specific slices.

    Segment limits are source stop indexes, so a reviewed UI-only removed call
    cannot accidentally move the physical meaning of a timetable anchor.
    """
    result = []
    for direction in directions:
        source_direction = direction["direction"]
        key = f"{direction['line']}-{source_direction}"
        segments = raw.get(key)
        if not segments:
            result.append({**direction, "source_direction": source_direction})
            continue
        seen = set()
        for segment in segments:
            identity = segment["id"]
            if identity in seen:
                raise ValueError(f"{key}: duplicate segment {identity}")
            seen.add(identity)
            start, end = segment["start"], segment["end"]
            if start > end:
                raise ValueError(f"{key}/{identity}: reversed source indexes")
            selected = [
                (stop, source_index)
                for stop, source_index in zip(direction["stops"], direction["source_stop_indexes"])
                if start <= source_index <= end
            ]
            if len(selected) < 2:
                raise ValueError(f"{key}/{identity}: fewer than two retained calls")
            expanded = deepcopy(direction)
            expanded["direction"] = f"{source_direction}-{identity}"
            expanded["source_direction"] = source_direction
            expanded["segment_id"] = identity
            expanded["destination"] = segment["destination"]
            expanded["stops"] = [stop for stop, _index in selected]
            expanded["source_stop_indexes"] = [index for _stop, index in selected]
            expanded["shape_source_stops"] = deepcopy(direction["stops"])
            expanded["shape_source_indexes"] = list(direction["source_stop_indexes"])
            expanded["headsign"] = {"ro": segment["destination"], "hu": segment["destination"]}
            result.append(expanded)
    return result
