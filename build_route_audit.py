#!/usr/bin/env python3
"""Write a human-checkable list of every official route-page stop occurrence."""

import html
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "route-audit.html"
ORDER = ["1", "1D", "2", "2D", "3", "4", "5", "5D", "6", "7", "9", "10"]


def esc(value):
    return html.escape(str(value), quote=True)


def render_route(direction):
    """Render one route, keeping repeated physical stops visibly distinct."""
    stops = direction["stops"]
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
        rows.append(
            f'<li data-pass="{pass_label}">'
            f'<span class="seq">#{index + 1}</span>'
            f'<span class="name">{esc(ro)}</span>'
            f'<span class="hu">{esc(hu)}</span>'
            f'<span class="pass">áthaladás {pass_label}</span>'
            f'<span class="turn">{note}</span></li>'
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
    sections = "".join(render_route(direction) for direction in load_directions())
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
  @media (max-width:680px) {{ li {{ grid-template-columns:52px 1fr; }} .hu,.pass,.turn {{ grid-column:2; }} }}
</style>
<body><h1>Útvonalsorrend – kézi ellenőrzés</h1>
<p class="intro">Ez nem útvonalterv és nem becslés: a Multi-Trans hivatalos vonaloldalairól kiolvasott sorrend. Az ismétlődő megállók áthaladásszáma segít ellenőrizni a hurkokat és fordulókat.</p>
{sections}</body></html>"""
    OUT.write_text(document, encoding="utf-8")
    print(f"{OUT.name}: {len(load_directions())} útvonal")


if __name__ == "__main__":
    main()
