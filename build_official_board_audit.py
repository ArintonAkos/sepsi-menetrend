#!/usr/bin/env python3
"""Generate a local-only review page for official timetable platform bindings."""

import html
import json
from pathlib import Path

from build_map import load_directions
from build_platforms import load_osm_platforms, load_overrides, resolve_platforms
from build_web_data import official_board_bindings
from timetable_overrides import apply_timetable_overrides

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "official-board-audit.html"


def esc(value):
    return html.escape(str(value), quote=True)


def source_key(entry):
    return (entry["line"], entry.get("direction", "depart"),
            entry["stop_ro"], entry["destination"])


def context_stop(stop):
    """Small, human-facing representation of a call immediately beside a platform."""
    name = stop["name"].get("hu") or stop["name"]["ro"]
    return {"name": name, "point": [stop["stop_lat"], stop["stop_lon"]]}


def mini_map(previous, current, following):
    """Offline mini-map: a scaled local route segment, not a web-map embed."""
    points = [previous["point"], current, following["point"]]
    lats, lons = [point[0] for point in points], [point[1] for point in points]
    lat_span, lon_span = max(lats) - min(lats), max(lons) - min(lons)
    lat_span = lat_span or 0.0002
    lon_span = lon_span or 0.0002

    def position(point):
        x = 18 + (point[1] - min(lons)) / lon_span * 224
        y = 92 - (point[0] - min(lats)) / lat_span * 72
        return round(x, 1), round(y, 1)

    first, middle, last = (position(point) for point in points)
    return (f'<svg class="mini-map" viewBox="0 0 260 110" aria-label="Helyi menetirány">'
            '<defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">'
            '<path d="M0,0 L7,3.5 L0,7z" fill="#3f6f2e"/></marker></defs>'
            f'<path d="M{first[0]},{first[1]} L{middle[0]},{middle[1]} L{last[0]},{last[1]}" '
            'class="map-line" marker-end="url(#arrow)"/>'
            f'<circle cx="{first[0]}" cy="{first[1]}" r="6" class="map-stop"/>'
            f'<circle cx="{middle[0]}" cy="{middle[1]}" r="8" class="map-current"/>'
            f'<circle cx="{last[0]}" cy="{last[1]}" r="6" class="map-stop"/>'
            '</svg>')


def unresolved_boards(entries, bindings, directions, topology, platform_stop_ids):
    """Return each unbound source column and the route calls it could mean."""
    points = {platform["id"]: platform["point"] for platform in topology["platforms"]}
    result = []
    for entry in entries:
        key = source_key(entry)
        if key in bindings:
            continue
        candidates = []
        for direction in directions:
            if direction["line"] != entry["line"]:
                continue
            source_direction = direction.get("source_direction", direction["direction"])
            if source_direction != entry.get("direction", source_direction):
                continue
            if (direction.get("destination") is not None and
                    direction["destination"] != entry["destination"]):
                continue
            for index, stop in enumerate(direction["stops"]):
                if stop["name"]["ro"] != entry["stop_ro"]:
                    continue
                platform = topology["call_platforms"][(
                    direction["line"], direction["direction"], index,
                )]
                candidate = {
                    "stop_id": platform_stop_ids[platform],
                    "direction": direction["direction"],
                    "index": index,
                    "point": points[platform],
                    "previous": context_stop(direction["stops"][index - 1]) if index else context_stop(direction["stops"][-1]),
                    "next": context_stop(direction["stops"][index + 1]) if index + 1 < len(direction["stops"]) else context_stop(direction["stops"][0]),
                }
                if candidate not in candidates:
                    candidates.append(candidate)
        result.append({"key": list(key), "candidates": candidates})
    return result


def render_audit(rows):
    cards = []
    for number, row in enumerate(rows, 1):
        line, direction, stop, destination = row["key"]
        key = json.dumps(row["key"], ensure_ascii=False)
        options = []
        for candidate in row["candidates"]:
            lat, lon = candidate["point"]
            previous, following = candidate["previous"], candidate["next"]
            value = json.dumps(candidate["stop_id"])
            map_url = f"https://www.openstreetmap.org/?mlat={lat:.6f}&mlon={lon:.6f}#map=19/{lat:.6f}/{lon:.6f}"
            diagram = mini_map(previous, candidate["point"], following)
            options.append(
                f'<label class="candidate"><input type="radio" name="r{number}" value={esc(value)} '
                f'data-key={esc(key)}><div class="candidate-body"><div class="candidate-title"><b>{esc(candidate["stop_id"])}</b> '
                f'<span>haladási irány</span></div><div class="route-context"><strong>{esc(previous["name"])}</strong>'
                f'<i>→</i><strong class="chosen-stop">{esc(stop)}</strong><i>→</i><strong>{esc(following["name"])}</strong></div>'
                f'{diagram}<small>helyi koordináta: {lat:.6f}, {lon:.6f} · <a href="{esc(map_url)}" target="_blank" rel="noreferrer">nagy térképen</a></small>'
                f'</div></label>'
            )
        if not options:
            options.append('<p class="missing">Nincs jelölt útvonali hívás. Itt egy hivatalos útvonaloldal vagy menetrend-képernyőkép segít.</p>')
        cards.append(f'''<article data-card="{number}">
<header><strong>{esc(line)}</strong><span>{esc(destination)}</span></header>
<h2>{esc(stop)}</h2><p class="meta">forrásirány: {esc(direction)}</p>
<div class="choices">{"".join(options)}</div>
<label class="skip"><input type="radio" name="r{number}" value="skip" data-key={esc(key)}> nem dönthető el ebből</label>
</article>''')

    data = json.dumps(rows, ensure_ascii=False)
    return f'''<!doctype html>
<html lang="hu"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sepsi Bus · peronellenőrzés</title>
<style>
  :root {{ font-family:system-ui,-apple-system,sans-serif; color:#24301e; background:#f5f4ed; }}
  body {{ max-width:880px; margin:auto; padding:28px 18px 80px; }} h1 {{ margin:0; }}
  .intro {{ line-height:1.5; color:#55604d; }} .bar {{ position:sticky; top:10px; z-index:2; display:flex; gap:10px; align-items:center; padding:12px; background:#fffdf7; border:1px solid #d9ddce; border-radius:14px; box-shadow:0 5px 20px #24301e14; }}
  button {{ border:0; border-radius:10px; padding:10px 14px; font-weight:700; background:#ead414; color:#20291c; cursor:pointer; }} #progress {{ margin-left:auto; color:#596052; font-weight:700; }}
  article {{ margin-top:16px; background:#fff; border:1px solid #dce0d2; border-radius:14px; overflow:hidden; }} article.done {{ border-color:#6da24d; }}
  header {{ display:flex; gap:10px; padding:12px 16px; background:#f0f2e9; }} header strong {{ background:#f4b400; border-radius:7px; padding:2px 8px; }} header span {{ font-weight:700; }}
  h2 {{ margin:14px 16px 0; font-size:18px; }} .meta {{ margin:4px 16px 12px; color:#697260; font-size:13px; }}
  .choices {{ border-top:1px solid #e7e9e1; }} .candidate,.skip {{ display:flex; align-items:flex-start; gap:10px; padding:12px 16px; border-bottom:1px solid #edf0e8; cursor:pointer; }} .candidate:hover,.skip:hover {{ background:#f7f8f3; }}
  input {{ width:18px; height:18px; margin-top:3px; flex:0 0 auto; accent-color:#527f34; }} .candidate-body {{ min-width:0; flex:1; }} .candidate-title {{ display:flex; gap:8px; align-items:center; }} .candidate-title b {{ background:#dce9d1; color:#254e1c; border-radius:6px; padding:2px 7px; }} .candidate-title span {{ color:#65705b; font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }}
  .route-context {{ display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-top:8px; line-height:1.3; }} .route-context strong {{ font-size:14px; }} .route-context i {{ color:#427832; font-style:normal; font-size:19px; }} .route-context .chosen-stop {{ color:#316c26; }} .mini-map {{ display:block; width:260px; max-width:100%; height:110px; margin:8px 0 2px; border-radius:8px; background:#edf4e7; }} .map-line {{ fill:none; stroke:#3f6f2e; stroke-width:5; stroke-linecap:round; stroke-linejoin:round; }} .map-stop {{ fill:#fff; stroke:#3f6f2e; stroke-width:3; }} .map-current {{ fill:#f4c400; stroke:#2c5922; stroke-width:3; }} small {{ color:#697260; }} a {{ color:#2b6d8e; }} .missing {{ margin:14px 16px; color:#8b4d00; }} .skip {{ color:#5c6554; font-size:14px; }}
</style><body>
<h1>Hivatalos peronoszlopok ellenőrzése</h1>
<p class="intro">Ez az oldal csak helyben működik. Válaszd ki, melyik fizikai peronhoz tartozik az adott hivatalos irány. A jelölés automatikusan ebben a böngészőben marad; a végén töltsd le a JSON-t és küldd el nekem.</p>
<div class="bar"><button id="export">Kijelölések letöltése</button><button id="clear">Kijelölések törlése</button><span id="progress"></span></div>
<main>{"".join(cards)}</main>
<script>
const rows={data}, storeKey='sepsi-official-board-audit-v1';
const saved=JSON.parse(localStorage.getItem(storeKey)||'{{}}');
const choices=[...document.querySelectorAll('input[data-key]')];
function refresh() {{ let done=0; for (const input of choices) {{ const key=input.dataset.key; if(saved[key]===input.value) input.checked=true; }} for(const card of document.querySelectorAll('article')) {{ const picked=card.querySelector('input:checked'); card.classList.toggle('done',Boolean(picked)); if(picked) done++; }} document.querySelector('#progress').textContent=`${{done}} / ${{rows.length}} ellenőrizve`; }}
for(const input of choices) input.addEventListener('change',()=>{{ saved[input.dataset.key]=input.value; localStorage.setItem(storeKey,JSON.stringify(saved)); refresh(); }});
document.querySelector('#clear').onclick=()=>{{ localStorage.removeItem(storeKey); location.reload(); }};
document.querySelector('#export').onclick=()=>{{ const payload={{version:1, generatedAt:new Date().toISOString(), choices:saved}}; const blob=new Blob([JSON.stringify(payload,null,2)],{{type:'application/json'}}); const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download='sepsi-peron-ellenorzes.json'; link.click(); URL.revokeObjectURL(link.href); }};
refresh();
</script></body></html>'''


def main():
    timetable = json.loads((ROOT / "timetable.json").read_text(encoding="utf-8"))
    directions = load_directions()
    topology = resolve_platforms(directions, load_osm_platforms(), load_overrides())
    platform_stop_ids = {platform["id"]: f"P{index}"
                         for index, platform in enumerate(topology["platforms"], 1)}
    timepoints = apply_timetable_overrides(timetable["timepoints"])
    normalised = {**timetable, "timepoints": timepoints}
    bindings = official_board_bindings(normalised, directions, topology, platform_stop_ids)
    rows = unresolved_boards(timepoints, bindings, directions, topology,
                             platform_stop_ids)
    OUT.write_text(render_audit(rows), encoding="utf-8")
    print(f"{OUT.name}: {len(rows)} ellenőrizendő oszlop")


if __name__ == "__main__":
    main()
