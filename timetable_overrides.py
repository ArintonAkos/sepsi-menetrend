"""Reviewed corrections where an official board label names the wrong route leg."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OVERRIDES = ROOT / "timetable_overrides.json"


def load_overrides(path=OVERRIDES):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def apply_timetable_overrides(entries, overrides=None):
    """Return copied board columns with reviewed physical direction corrections.

    The raw operator download remains untouched.  These narrow overrides are
    applied by every consumer that needs a route direction, so a stop popup and
    the trip reconstruction cannot disagree about the same physical boarding
    platform.
    """
    overrides = overrides if overrides is not None else load_overrides()
    result = []
    for entry in entries:
        replacement = None
        for rule in overrides.get("rewriteColumns", []):
            if (entry["line"] == rule["line"]
                    and entry.get("direction", "depart") == rule["fromDirection"]
                    and entry["destination"] == rule["fromDestination"]
                    and entry["stop_ro"] in rule["stops"]):
                if replacement is not None:
                    raise ValueError(f"multiple timetable overrides for {entry}")
                replacement = rule
        if replacement is None:
            result.append(entry)
        else:
            result.append({**entry, "direction": replacement["direction"],
                           "destination": replacement["destination"]})
    return result
