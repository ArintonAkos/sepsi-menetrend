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
            source_calls = list(zip(direction["stops"], direction["source_stop_indexes"]))
            source_by_index = {source_index: stop for stop, source_index in source_calls}
            available = [source_index for _stop, source_index in source_calls]
            if start not in source_by_index or end not in source_by_index:
                raise ValueError(f"{key}/{identity}: source indexes are not retained")

            if start <= end:
                selected_indexes = [index for index in available if start <= index <= end]
            else:
                # Circular route pages choose an arbitrary start point.  A
                # displayed run may begin late in that source order, pass the
                # repeated terminal, and continue at index zero.  Keep that
                # real travel order; sorting it would turn the route backwards.
                selected_indexes = ([index for index in available if index >= start]
                                    + [index for index in available if index != 0 and index <= end])
            selected = [(source_by_index[index], index) for index in selected_indexes]
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
