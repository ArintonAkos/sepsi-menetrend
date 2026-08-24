"""Shared Mapbox token lookup for the browser build and offline data scripts."""

import os
from pathlib import Path


ROOT = Path(__file__).resolve().parent
WEB_DOTENV = ROOT / "web" / ".env.local"


def _dotenv_value(path, name):
    """Return one simple KEY=value entry without exporting dotenv globally."""
    try:
        lines = Path(path).read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return ""

    prefix = f"{name}="
    for line in lines:
        candidate = line.strip()
        if not candidate or candidate.startswith("#") or not candidate.startswith(prefix):
            continue
        value = candidate[len(prefix):].strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        return value
    return ""


def load_mapbox_token(environment=None, dotenv_path=WEB_DOTENV):
    """Choose an explicit server token, otherwise reuse Next's local public token.

    The application necessarily exposes ``NEXT_PUBLIC_MAPBOX_TOKEN`` to the
    browser for map tiles.  Reusing that token lets local maintenance scripts
    fetch directions with the same authorised account, without copying it into
    a second file or putting secrets in version control.
    """
    environment = os.environ if environment is None else environment
    return (
        environment.get("MAPBOX_TOKEN", "")
        or environment.get("NEXT_PUBLIC_MAPBOX_TOKEN", "")
        or _dotenv_value(dotenv_path, "MAPBOX_TOKEN")
        or _dotenv_value(dotenv_path, "NEXT_PUBLIC_MAPBOX_TOKEN")
    )
