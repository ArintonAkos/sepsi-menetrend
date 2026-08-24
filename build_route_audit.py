#!/usr/bin/env python3
"""Write a human-checkable list of every official route-page stop occurrence."""

import html
import json
from collections import Counter
from pathlib import Path

from build_platforms import load_osm_platforms, load_overrides, resolve_platforms

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "route-audit.html"
ORDER = ["1", "1D", "2", "2D", "3", "4", "5", "5D", "6", "7", "9", "10"]


def esc(value):
    return html.escape(str(value), quote=True)


def render_route(direction, topology=None):
    """Render one route, keeping repeated physical stops visibly distinct."""
    stops = direction["stops"]
    platforms = {
        platform["id"]: platform
        for platform in (topology or {}).get("platforms", [])
    }
    call_platforms = (topology or {}).get("call_platforms", {})
    names = [stop["name"]["ro"] for stop in stops]
    totals = Counter(names)
    seen = Counter()
    rows = []
    for index, stop in enumerate(stops):
        ro, hu = stop["name"]["ro"], stop["name"]["hu"]
        seen[ro] += 1
        pass_label = f"{seen[ro]}/{totals[ro]}" if totals[ro] > 1 else "1/1"
        turning = (0 < index < len(stops) - 1 and names[index - 1] == names[index + 1])
        note = "forduló / hurok" if turning else ""
        platform = platforms.get(call_platforms.get((direction["line"], direction["direction"], index)))
        if "stop_lat" in stop and "stop_lon" in stop:
            raw = f'nyers: {stop["stop_lat"]:.6f}, {stop["stop_lon"]:.6f}'
        else:
            raw = "nyers koordináta: nincs a bemeneti mintában"
        evidence = raw
        if platform:
            source = {
                "osm": f'OSM #{platform["osm_id"]}',
                "source-fallback": "vonaloldali koordináta (OSM-peron hiányzik)",
                "override": "kézi, dokumentált felülbírálat",
            }.get(platform["source"], platform["source"])
            evidence += (
                f' · <span class="platform-id">{esc(platform["id"])}</span>'
                f' · {esc(source)}'
                f' · peron: {platform["point"][0]:.6f}, {platform["point"][1]:.6f}'
            )
        rows.append(
            f'<li data-pass="{pass_label}">'
            f'<span class="seq">#{index + 1}</span>'
            f'<span class="name">{esc(ro)}</span>'
            f'<span class="hu">{esc(hu)}</span>'
            f'<span class="pass">áthaladás {pass_label}</span>'
            f'<span class="turn">{note}</span>'
            f'<span class="evidence">{evidence}</span></li>'
        )

    title = f'{direction["line"]} · {direction["direction"]}'
    return (
        f'<section id="{esc(direction["line"])}-{esc(direction["direction"])}">'
        f'<h2>{esc(title)}</h2>'
        f'<p class="headsign">{esc(direction["headsign"]["ro"])}<br>'
        f'{esc(direction["headsign"]["hu"])}</p>'
        f'<ol>{"".join(rows)}</ol></section>'
    )


def load_directions():
    directions = []
    for line in ORDER:
        for name in ("depart", "return"):
            path = ROOT / f"line-{line}" / f"{name}.json"
            if path.exists():
                directions.append(json.loads(path.read_text(encoding="utf-8")))
    return directions


def main():
    directions = load_directions()
    topology = resolve_platforms(directions, load_osm_platforms(), load_overrides())
    sections = "".join(render_route(direction, topology) for direction in directions)
    document = f"""<!doctype html>
<html lang="hu"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sepsi Bus · útvonalsorrend ellenőrzés</title>
<style>
  :root {{ color-scheme: light; font-family: system-ui, sans-serif; color:#20291c; background:#f6f5ef; }}
  body {{ max-width:1050px; margin:0 auto; padding:32px 20px 72px; }}
  h1 {{ margin:0 0 8px; font-size:28px; }}
  .intro {{ color:#596052; max-width:760px; line-height:1.5; }}
  section {{ background:#fff; border:1px solid #d9ddcf; border-radius:14px; margin:24px 0; overflow:hidden; }}
  h2 {{ margin:0; padding:15px 18px 3px; font-size:20px; }}
  .headsign {{ margin:0; padding:0 18px 14px; color:#677060; font-size:14px; }}
  ol {{ margin:0; padding:0; list-style:none; border-top:1px solid #e5e7df; }}
  li {{ display:grid; grid-template-columns:64px minmax(180px,1fr) minmax(150px,1fr) 118px 130px; gap:10px; padding:9px 18px; border-bottom:1px solid #edf0e8; align-items:center; }}
  li:last-child {{ border-bottom:0; }} .seq,.pass {{ color:#6a7263; font-size:13px; }}
  .name {{ font-weight:700; }} .hu {{ color:#4f5848; }}
  .turn {{ color:#8a4d00; font-weight:700; font-size:13px; }}
  .evidence {{ grid-column:2 / -1; color:#5f6758; font-size:12px; font-family:ui-monospace,SFMono-Regular,monospace; }}
  .platform-id {{ color:#24371b; font-weight:700; }}
  @media (max-width:680px) {{ li {{ grid-template-columns:52px 1fr; }} .hu,.pass,.turn,.evidence {{ grid-column:2; }} }}
</style>
<body><h1>Útvonalsorrend – kézi ellenőrzés</h1>
<p class="intro">Ez nem útvonalterv és nem becslés: a Multi-Trans hivatalos vonaloldalairól kiolvasott sorrend. Minden hívásnál látható a nyers koordináta és az arra feloldott fizikai peron bizonyítéka; így ellenőrizhetők a hurkok, fordulók és az azonos nevű, de külön oldali peronok.</p>
{sections}</body></html>"""
    OUT.write_text(document, encoding="utf-8")
    print(f"{OUT.name}: {len(directions)} útvonal")


if __name__ == "__main__":
    main()
