# Szeptember 7-i menetrend – megvalósítási terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `web/public/data/network.json` és a GTFS feed tükrözze a 2026-09-07-től érvényes Multi-Trans hálózatot, best-effort geometriával a nem publikált útvonalakhoz, és egy új iskolai-nap szolgáltatásosztállyal.

**Architecture:** A publikált menetrendtábla adja a menetidőket és a vonal↔megálló tagságot. A nem változott vonalak a meglévő geometriát használják. A 2/6/1B/10 vonalak megállólistáját kézzel rekonstruáljuk (tábla + hivatalos Facebook-poszt + OSM), OSRM-mel rajzolt vonallal. Az 5-ös kör kezdőpontját a Str. Dózsa Györgyhöz forgatjuk. Az iskolai nap új `"school"` `ServiceId`, amelybe a hétköznapi tripek is bekerülnek, így a RAPTOR szűrő (`trip.service === service`) és a fagyasztott multimodal zóna érintetlen marad. A `ServiceNotice` marad, átírt szöveggel, egy új `routesProvisional` jelzőtől vezérelve.

**Tech Stack:** Python 3 stdlib pipeline, GTFS CSV, OSRM (public demo server), Next.js 16 vendored fork + TypeScript engine, Vitest, unittest.

**Spec:** `docs/superpowers/specs/2026-09-08-sept-7-timetable-design.md`

## Global Constraints

- **Push vagy deploy nincs.** Minden a `sept-7-timetable` ágon, lokális commitokkal.
- A menetrendtábla (`https://www.multitrans.ro/orarele/multitrans_menetrendek_web.html`, `valid: "Valabil din 7 septembrie 2026"`) a menetidők egyetlen forrása; hiányzó fizikai híváshoz interpoláció, nem tábla-találgatás.
- Részleges/inkompatibilis letöltést el kell utasítani, nem publikálni.
- Minden változást előbb bukó teszt fed le.
- A meglévő PWA/offline adatszerződés változatlan: a böngésző csak a statikus `network.json`-t olvassa.
- A `web/lib/engine/multimodal.ts` a fagyasztott routing-zóna – ne módosuljon.
- Az 1D/2D „Calea Brașovului 1" kérdésben a **táblát** követjük (nem a poszt „Építők utca" szövegét), ideiglenesnek jelölve.
- `FEED_START` a GTFS-ben: `"20260907"`.
- Új vonal id: `"1B"` (nagybetűs, mint a D-vonalak).
- HU vonalnév: „1B" → „1B-s busz".
- A `ServiceNotice` **nem törlődik** ebben a körben; szövege cserélődik, triggere `network.json.routesProvisional === true`.

---

## Fázis 1 – Importáló az új tábla-szerkezethez

### Task 1: `fetch_timetable.py` – új tábla, aliasok, 1B, küszöb

**Files:**
- Modify: `fetch_timetable.py`
- Test: `tests/test_fetch_timetable.py`

**Interfaces:**
- Produces: `timetable.json` – `{source, valid_from, services, colours, timepoint_count, timepoints:[{source_station_id, line, direction, stop_ro, stop_hu, destination, times:{weekday,weekend}, events:{...}}]}`. `line` mostantól tartalmazhatja `"1B"`-t.
- Consumes: `line-*/depart.json`, `line-*/return.json` (a Fázis 2 után frissülnek; a Task 1 még a régiekkel fut, de az 1B-hez üres eredményt ad, amíg a `line-1B/` nem létezik).

- [ ] **Step 1: Failing test – az új végállomásnév és az új megállók normalizálása**

`tests/test_fetch_timetable.py`-ba:

```python
def test_golya_utca_terminus_normalises_to_known_stop(self):
    known = {"Simeria (Str. Berzei)": "Szemerja (Gólya utca)"}
    station = {"id": 11, "ro": "Szemerja (Gólya utca)", "hu": "Simeria (Str. Berzei)"}
    ro, hu = normalise_station_names(station, known)
    self.assertEqual(ro, "Simeria (Str. Berzei)")

def test_new_arcus_stops_alias(self):
    self.assertEqual(ALIASES.get("Bis. Reformată Arcuș"), "Biserica Reformată Arcuș")
    self.assertEqual(ALIASES.get("Str. Kossuth Lajos 1"), "Str. Kossuth Lajos 1")
```

- [ ] **Step 2: Run – observe failure**

Run: `python3 -m unittest tests.test_fetch_timetable -v`
Expected: FAIL (`ALIASES` missing keys / name not matched).

- [ ] **Step 3: Add aliases + ORDER entry**

`fetch_timetable.py`:

```python
ORDER = ["1", "1B", "1D", "2", "2D", "3", "4", "5", "5D", "6", "7", "9", "10"]

ALIASES = {
    # ... existing ...
    "Simeria (Str. Berzei)": "Cap Linie Simeria",
    "Szemerja (Gólya utca)": "Cap Linie Simeria",
    "Bis. Reformată Arcuș": "Biserica Reformată Arcuș",
    "Coșeni": "Coșeni 2",
}
```

Az `ORDER.index(e["line"])` hívás a `timepoints` rendezésénél mostantól elfogadja `"1B"`-t.

- [ ] **Step 4: Failing test – a D-vonalak „marked" indulásai a szülővonal oszlopain**

```python
def test_marked_departures_are_kept_as_events(self):
    schedule = {"rows": [{"h": "05", "entries": [
        {"m": "21", "marked": False}, {"m": "31", "marked": True}]}]}
    events = events_of(schedule)
    self.assertEqual(events, [{"time": "05:21", "marked": False},
                              {"time": "05:31", "marked": True}])
```

(Ha ez már zöld: dokumentáld, hogy a `marked` mechanizmus változatlan, és a D-vonal-szétválasztás a `build_trips` / `timetable_overrides` felelőssége.)

- [ ] **Step 5: Retune the coverage floor**

Futtasd egyszer élesben (`python3 fetch_timetable.py` egy eldobható másolatban), jegyezd fel a tényleges `stations / timepoints / departures` számot a Fázis 2 utáni geometriával. Állítsd:

```python
MIN_STATIONS = 95
MIN_TIMEPOINTS = <tényleges - 10%>
MIN_DEPARTURES = <tényleges - 10%>
```

Teszt:

```python
def test_coverage_floor_rejects_partial(self):
    with self.assertRaisesRegex(ValueError, "incomplete timetable"):
        validate_coverage(60, 80, 3000)
```

- [ ] **Step 6: Run all fetch_timetable tests**

Run: `python3 -m unittest tests.test_fetch_timetable -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add fetch_timetable.py tests/test_fetch_timetable.py
git commit -m "Import the Sept 7 board: 1B, terminus rename, new stops"
```

---

## Fázis 2 – Geometria rekonstrukció

> Minden Fázis 2 task ugyanazt a validátort használja. Task 2 hozza létre.

### Task 2: Route-fájl validátor + Line 5/5D forgatás

**Files:**
- Create: `tests/test_route_files.py`
- Create: `validate_route_files.py`
- Modify: `line-5/depart.json`, `line-5D/depart.json`, `line-5D/return.json`

**Interfaces:**
- Produces: `validate_route_files.py` – `check(path) -> list[str]` (üres lista = ok). Ellenőrzi: `stop_sequence` 1-től folytonos; `name.ro`/`name.hu` nem üres; `stop_lat` 45.7–45.95, `stop_lon` 25.6–25.9; `distance_to_next_m` int>0 vagy `null` (utolsó); `circular` konzisztens az első=utolsó koordinátával.

- [ ] **Step 1: Failing test – a validátor kritikái**

```python
def test_rejects_gap_in_sequence(self):
    data = {"line":"X","direction":"depart","circular":False,"stops":[
        {"stop_sequence":1,"name":{"ro":"A","hu":"a"},"stop_lat":45.86,"stop_lon":25.78,"distance_to_next_m":100},
        {"stop_sequence":3,"name":{"ro":"B","hu":"b"},"stop_lat":45.86,"stop_lon":25.79,"distance_to_next_m":None}]}
    self.assertIn("sequence", " ".join(check_data(data)).lower())

def test_line5_starts_at_dozsa_gyorgy(self):
    d = json.load(open("line-5/depart.json"))
    self.assertEqual(d["stops"][0]["name"]["ro"], "Str. Dózsa György")
    self.assertEqual(d["stops"][-1]["name"]["ro"], "Str. Dózsa György")
```

- [ ] **Step 2: Run – fails**

Run: `python3 -m unittest tests.test_route_files -v`

- [ ] **Step 3: Write `validate_route_files.py`**

```python
#!/usr/bin/env python3
"""Structural checks for the hand-maintained line-*/[direction].json files."""
import json, sys
from pathlib import Path

def check_data(d):
    errs = []
    stops = d.get("stops", [])
    for i, s in enumerate(stops):
        if s.get("stop_sequence") != i + 1:
            errs.append(f"stop {i}: sequence {s.get('stop_sequence')} != {i+1}")
        for lang in ("ro", "hu"):
            if not s.get("name", {}).get(lang):
                errs.append(f"stop {i}: empty name.{lang}")
        lat, lon = s.get("stop_lat"), s.get("stop_lon")
        if not (45.7 <= (lat or 0) <= 45.95):
            errs.append(f"stop {i}: lat {lat} out of area")
        if not (25.6 <= (lon or 0) <= 25.9):
            errs.append(f"stop {i}: lon {lon} out of area")
        dist = s.get("distance_to_next_m")
        last = i == len(stops) - 1
        if last and dist is not None:
            errs.append(f"stop {i}: last stop must have distance_to_next_m null")
        if not last and not (isinstance(dist, int) and dist > 0):
            errs.append(f"stop {i}: distance_to_next_m must be positive int")
    if stops:
        first_c = (stops[0]["stop_lat"], stops[0]["stop_lon"])
        last_c = (stops[-1]["stop_lat"], stops[-1]["stop_lon"])
        same = first_c == last_c
        if bool(d.get("circular")) != same:
            errs.append(f"circular={d.get('circular')} but first==last is {same}")
    return errs

def check(path):
    return check_data(json.loads(Path(path).read_text(encoding="utf-8")))

if __name__ == "__main__":
    bad = 0
    for p in sorted(Path(".").glob("line-*/depart.json")) + sorted(Path(".").glob("line-*/return.json")):
        errs = check(p)
        if errs:
            bad += 1
            print(f"{p}:")
            for e in errs:
                print(f"  {e}")
    print(f"{bad} files with problems")
    sys.exit(1 if bad else 0)
```

- [ ] **Step 4: Rotate line 5 loop**

`line-5/depart.json`: a `stops` tömb forgatása úgy, hogy a `Str. Dózsa György` legyen az első elem (jelenleg indexen `... Domb utca > Dózsa György > Büdöskút > József Attila 2` a vége felé). Módszer: keresd meg a `Str. Dózsa György` indexét `k`; új sorrend = `stops[k:] + stops[:k]` majd zárd a kört a `Str. Dózsa György` ismételt hozzáfűzésével a végére, ha a régi lista így csinálta. Írd újra a `stop_sequence` mezőket 1-től, és told el a `distance_to_next_m` értékeket a forgatással együtt (a `k` előtti utolsó elem távolsága a `k`- hoz mutat). `headsign` frissítés: `{"ro": "Str. Dózsa György – traseu circular", "hu": "Dózsa György utca – körjárat"}`.

`line-5D/depart.json` és `return.json`: az első megálló `Str. József Attila 2` → `Str. Dózsa György`; a `Str. József Attila 2` és `Str. József Attila 1` közötti fejszakasz a poszt szerint „a városközponton" át megy – ha a jelenlegi 5D fej már ezt teszi, csak a nevet/koordinátát cseréld a Dózsa György megállóra (koordináta: `line-5/depart.json` Dózsa György hívásából).

- [ ] **Step 5: Add the shared `board_line_stops` test helper**

`tests/test_route_files.py` tetejére (a Task 3–6 coverage-assertjei használják):

```python
import json
from pathlib import Path

def board_line_stops(line):
    """The set of stop_ro names the Sept 7 board lists for a given line."""
    tt = json.loads(Path("timetable.json").read_text(encoding="utf-8"))
    return {tp["stop_ro"] for tp in tt["timepoints"] if tp["line"] == line}
```

(A `timetable.json` a Task 15 Step 1 után létezik élesben; addig a Task 3–6 coverage-tesztjei `@unittest.skipUnless(Path("timetable.json").exists(), ...)` alatt futnak, és a Task 15 után válnak kötelezővé.)

- [ ] **Step 6: Run validator + tests**

Run: `python3 validate_route_files.py && python3 -m unittest tests.test_route_files -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add validate_route_files.py tests/test_route_files.py line-5/depart.json line-5D/
git commit -m "Rotate line 5/5D to the Dózsa György anchor"
```

### Task 3: Line 2 útvonal-rekonstrukció

**Files:**
- Modify: `line-2/depart.json` (a `line-2` jelenleg körjárat, csak `depart.json`)
- Create: `line-2/return.json` (ha a rekonstrukció szerint kétirányú, nem kör)
- Test: `tests/test_route_files.py` (line 2 eset)

**Interfaces:**
- Consumes: a menetrendtábla line-2 oszlopai (source_station_ids és cél-fejlécek – lásd spec „Poszt-kivonat"), a jelenlegi `line-2/depart.json`, `line-1/depart.json` (a Simeria–Spitalul Județean szakaszért).
- Produces: `line-2/*.json` a validátornak megfelelő formában.

- [ ] **Step 1: Derive the stop order from the board**

A `multitrans_menetrendek_web.html` `STATIONS` tömbjéből szedd ki az összes line-2 oszlopot `(source_station_id, dest, weekday times)` hármasként. Egy konkrét reggeli indulásra (pl. az első Gólya utca-i indulás) rendezd a hívásokat a nyomtatott órák szerint → ez adja a fizikai sorrendet a időpont-megállókra. A köztes (óra nélküli) megállók a jelenlegi `line-2/depart.json` sorrendjéből jönnek, ahol azok a szakaszok változatlanok.

Hivatalos váz (poszt): `Gólya utcai végállomás – Vadász utca – Városközpont – Csíki negyed – Állomás negyed` és vissza.

- [ ] **Step 2: Write `line-2/depart.json` + `line-2/return.json`**

Ha a tábla mindkét cél-fejlécet mutatja („Gara CFR" és „Simeria (Str. Berzei)") külön oszlop-azonosítókkal, akkor **kétirányú** vonal: `depart` = Gólya utca → Gara CFR, `return` = Gara CFR → Gólya utca, `circular: false`. Az új Gólya utca ↔ Spitalul Județean szakasz megállói és koordinátái a `line-1/depart.json`-ból (`Cap Linie Simeria`, `Spitalul Județean`). A `distance_to_next_m` OSRM-ből (Task 8 tölti véglegesre; ideiglenesen a straight-line * 1.3 egész méterben).

- [ ] **Step 3: Run validator**

Run: `python3 validate_route_files.py`
Expected: no line-2 problems.

- [ ] **Step 4: Add a board-coverage assertion**

`tests/test_route_files.py`:

```python
def test_line2_covers_every_board_stop(self):
    board_stops = board_line_stops("2")   # helper: reads timetable.json line 2 stop_ro set
    route_stops = set()
    for d in ("depart", "return"):
        p = Path(f"line-2/{d}.json")
        if p.exists():
            route_stops |= {s["name"]["ro"] for s in json.load(open(p))["stops"]}
    self.assertEqual(board_stops - route_stops, set())
```

- [ ] **Step 5: Run**

Run: `python3 -m unittest tests.test_route_files -v`

- [ ] **Step 6: Commit**

```bash
git add line-2/ tests/test_route_files.py
git commit -m "Reconstruct line 2 around the Gólya utca terminus"
```

### Task 4: Line 6 útvonal-rekonstrukció

**Files:**
- Modify: `line-6/depart.json`
- Create: `line-6/return.json` (ha kétirányúvá válik)
- Test: `tests/test_route_files.py` (line 6 eset, a Task 3 mintájára – írd ki a teljes assert kódot, ne hivatkozz „mint Task 3")

**Interfaces:**
- Consumes: tábla line-6 oszlopai, jelenlegi `line-6/depart.json`, `line-1/depart.json` (Simeria szakasz).
- Produces: `line-6/*.json`.

- [ ] **Step 1: Derive order from board** – mint a Task 3, a line-6 oszlopokra. Poszt: a 6-os a Gólya utcai végállomásról indul minden munkanapon egész órakor; egyébként a meglévő Csíki negyed + Sepsi Aréna kör.
- [ ] **Step 2: Write files** – `circular` marad, ha a tábla egyetlen kör-fejlécet mutat; különben `depart`/`return`. Az új Gólya utca-i fej a `line-1`-ből.
- [ ] **Step 3: Validator** – `python3 validate_route_files.py`
- [ ] **Step 4: Board-coverage assert**

```python
def test_line6_covers_every_board_stop(self):
    board_stops = board_line_stops("6")
    route_stops = set()
    for d in ("depart", "return"):
        p = Path(f"line-6/{d}.json")
        if p.exists():
            route_stops |= {s["name"]["ro"] for s in json.load(open(p))["stops"]}
    self.assertEqual(board_stops - route_stops, set())
```

- [ ] **Step 5: Run** – `python3 -m unittest tests.test_route_files -v`
- [ ] **Step 6: Commit**

```bash
git add line-6/ tests/test_route_files.py
git commit -m "Reconstruct line 6 around the Gólya utca terminus"
```

### Task 5: Line 1B – új vonal

**Files:**
- Create: `line-1B/depart.json`, `line-1B/return.json`
- Test: `tests/test_route_files.py` (line 1B eset)

**Interfaces:**
- Consumes: `line-1/depart.json` + `line-1/return.json` (törzs a vasútállomásig), `line-1D/depart.json` + `return.json` (a Gara CFR → Autoliv → Câmpul Frumos → Multi-Trans farokszakasz).
- Produces: `line-1B/*.json`.

- [ ] **Step 1: Assemble depart**

`line-1B/depart.json` = `line-1/depart.json` megállói `Cap Linie Simeria`-tól `Gara CFR`-ig, majd a `line-1D/depart.json` farka `Gara CFR` után (`Autoliv`, `Câmpul Frumos`, `Multi-Trans` – az 1D farkát tükrözve). `headsign`: `{"ro": "Cap Linie Simeria → Câmpul Frumos (via Autoliv)", "hu": "Szemerja (Gólya utca) → Szépmező (Autoliv felé)"}`. `circular: false`. A `distance_to_next_m` értékek a forrásfájlokból másolva; a csatlakozási pont (`Gara CFR` → `Autoliv`) az 1D értékéből.

- [ ] **Step 2: Assemble return**

`line-1B/return.json` = `line-1D/return.json` megállói `Multi-Trans`-tól `Gara CFR`-ig, majd a `line-1/return.json` farka `Gara CFR` után `Cap Linie Simeria`-ig.

- [ ] **Step 3: Validator**

Run: `python3 validate_route_files.py`

- [ ] **Step 4: Coverage assert**

```python
def test_line1b_covers_every_board_stop(self):
    board_stops = board_line_stops("1B")   # {"Câmpul Frumos"} a jelenlegi táblán
    route_stops = set()
    for d in ("depart", "return"):
        route_stops |= {s["name"]["ro"] for s in json.load(open(f"line-1B/{d}.json"))["stops"]}
    self.assertEqual(board_stops - route_stops, set())
```

- [ ] **Step 5: Run** – `python3 -m unittest tests.test_route_files -v`
- [ ] **Step 6: Commit**

```bash
git add line-1B/ tests/test_route_files.py
git commit -m "Add line 1B: line 1 trunk plus the Autoliv/Szépmező tail"
```

### Task 6: Line 10 – Kossuth-osztás + Árkosi Ref. templom

**Files:**
- Modify: `line-10/depart.json`, `line-10/return.json`
- Test: `tests/test_route_files.py`

**Interfaces:**
- Consumes: jelenlegi `line-10/*.json`, OSM: `osm/streets.json` (`Cartier Kossuth Lajos` ~45.88504, 25.79878), `osm/places.json` (`Biserica Reformată Arcuș` 45.90118, 25.77285).
- Produces: `line-10/*.json`.

- [ ] **Step 1: Split "Cart. Kossuth Lajos"**

A jelenlegi egyetlen `Cart. Kossuth Lajos` hívást cseréld `Str. Kossuth Lajos 1` + `Str. Kossuth Lajos 2` párra. Koordináták: a Kossuth Lajos utca két végén, az OSM utcavonal mentén; kezdeti tipp `45.8850/25.7980` és `45.8858/25.7995` (Task 18-ban a felhasználó pontosítja). `name`: `{"ro":"Str. Kossuth Lajos 1","hu":"Kossuth Lajos 1"}` és `... 2`.

- [ ] **Step 2: Add "Biserica Reformată Arcuș" to depart**

A `return.json` már tartalmazza (`Biserica Reformată Arcuș`); tedd be a `depart.json`-ba is a `Primăria Arcuș` és `Centru Arcuș` közé (a tábla mindkét irányban listázza).

- [ ] **Step 3: Validator + coverage assert**

```python
def test_line10_covers_every_board_stop(self):
    board_stops = board_line_stops("10")
    route_stops = set()
    for d in ("depart", "return"):
        route_stops |= {s["name"]["ro"] for s in json.load(open(f"line-10/{d}.json"))["stops"]}
    self.assertEqual(board_stops - route_stops, set())
```

Run: `python3 validate_route_files.py && python3 -m unittest tests.test_route_files -v`

- [ ] **Step 4: Commit**

```bash
git add line-10/ tests/test_route_files.py
git commit -m "Line 10: split Kossuth Lajos, add Bis. Reformată Arcuș outbound"
```

### Task 7: Line 1D/2D – Calea Brașovului 1

**Files:**
- Modify: `line-1D/depart.json`, `line-1D/return.json`, `line-2D/depart.json`, `line-2D/return.json`
- Test: `tests/test_route_files.py`

**Interfaces:**
- Consumes: jelenlegi `line-1D/*.json`, `line-2D/*.json`, `line-3/depart.json` (a `Calea Brașovului 1` hívás koordinátájáért).
- Produces: `line-1D/*.json`, `line-2D/*.json`.

- [ ] **Step 1: Insert the call**

A tábla szerint az 1D és 2D mostantól megáll a `Calea Brașovului 1`-nél a `Gara CFR` után, `Autoliv` előtt (a Brassói úton dél felé egy rövid kitérő, majd vissza). Szúrd be a `Calea Brașovului 1` hívást a `Gara CFR` és `Autoliv` közé mindkét irányban, a `line-3/depart.json` `Calea Brașovului 1` koordinátájával. Jelöld a fájl tetején egy `"_note": "Calea Brașovului 1 provisional - board only, no route diagram"` mezővel.

- [ ] **Step 2: Validator + coverage**

```python
def test_line1d_2d_have_calea_brasovului(self):
    for line in ("1D", "2D"):
        names = {s["name"]["ro"] for d in ("depart","return")
                 for s in json.load(open(f"line-{line}/{d}.json"))["stops"]}
        self.assertIn("Calea Brașovului 1", names)
```

Run: `python3 validate_route_files.py && python3 -m unittest tests.test_route_files -v`

- [ ] **Step 3: Commit**

```bash
git add line-1D/ line-2D/ tests/test_route_files.py
git commit -m "Route 1D/2D via Calea Brașovului 1 (board, provisional)"
```

### Task 8: Shapes + durations a változott/új vonalakra

**Files:**
- Modify: `line-{2,6,1B,10,1D,2D}/depart-shape.json`, `line-{2,6,10,1D,2D}/return-shape.json`, `line-5/depart-shape.json`, `line-1B/return-shape.json`
- Modify: a megfelelő `-durations.json` fájlok
- Reference: `fetch_shapes_osrm.py`, `fetch_durations.py`

**Interfaces:**
- Produces: `*-shape.json` = `{"points": [[lon,lat],...], "length_m": <int>}`; `*-durations.json` a `fetch_durations.py` formájában (`build_map.duration_seconds_for` fogyasztja).

- [ ] **Step 1: Extend `fetch_shapes_osrm.py` to accept a line list**

Nézd meg a `fetch_shapes_osrm.py` jelenlegi interfészét. Ha vonalanként fut, futtasd a 8 érintett irányra. Ha az összesre fut, futtasd mindre – a nem változott vonalak eredménye bitre azonos marad (determinizmus-ellenőrzés a Step 3-ban).

Run: `python3 fetch_shapes_osrm.py` (a releváns argumentumokkal)

- [ ] **Step 2: Regenerate durations**

Run: `python3 fetch_durations.py` (a releváns vonalakra)

- [ ] **Step 3: Verify unchanged lines are byte-identical**

```bash
git status --porcelain line-1/ line-3/ line-4/ line-7/ line-9/
```
Expected: üres (a nem érintett vonalak shape/durations fájljai nem változtak).

- [ ] **Step 4: Validator**

Run: `python3 validate_route_files.py`

- [ ] **Step 5: Commit**

```bash
git add line-*/*-shape.json line-*/*-durations.json
git commit -m "OSRM shapes and road durations for the reconstructed lines"
```

### Task 9: FELHASZNÁLÓI ELLENŐRZŐPONT – rekonstruált megállólisták

**Files:** none (review gate)

- [ ] **Step 1: Render a review artifact**

Készíts egy Markdown-összefoglalót: minden rekonstruált vonalra (2, 6, 1B, 10, + 5 forgatás, + 1D/2D) a megállólista sorrendben, irányonként, a tábla-időkkel egy mintaindulásra. Adj hozzá egy `gen-maps.mjs`-szerű baked térképképet vagy egy egyszerű geojson-linket a rekonstruált shape-ekkel.

- [ ] **Step 2: Send to the user**

`SendUserFile` a Markdown-nal. Kérdés: „Stimmel a sorrend? Melyik megálló van rossz helyen/oldalon?"

- [ ] **Step 3: Incorporate feedback**

A felhasználó javításai alapján módosítsd a `line-*/` fájlokat, futtasd újra a validátort és a Task 2–8 érintett shape/durations lépéseit.

- [ ] **Step 4: Commit**

```bash
git add line-*/
git commit -m "Apply the operator's corrections to the reconstructed routes"
```

---

## Fázis 3 – Override-fájlok és trip-építés

### Task 10: `timetable_segments.json` – 2/5/6 újrahorgonyzás

**Files:**
- Modify: `timetable_segments.json`
- Test: `tests/test_timetable_segments.py`

**Interfaces:**
- Consumes: `expand_timetable_segments(directions, raw)` a `timetable_segments.py`-ból; a `directions` a Fázis 2 új `line-*/` fájljaiból jön.
- Produces: `timetable_segments.json` – `{"<line>-<direction>": [{"id","start","end","destination"}]}`, ahol `start`/`end` forrás-megállóindexek az új `line-*/` fájlokban.

- [ ] **Step 1: Failing test – az új 5-ös szegmenshatárok**

```python
def test_line5_segments_use_dozsa_gyorgy_anchor(self):
    raw = json.load(open("timetable_segments.json"))
    seg = {s["id"]: s for s in raw["5-depart"]}
    d = json.load(open("line-5/depart.json"))
    names = [s["name"]["ro"] for s in d["stops"]]
    self.assertEqual(names[seg["to-arena"]["start"]], "Str. Dózsa György")
```

- [ ] **Step 2: Run – fails**

Run: `python3 -m unittest tests.test_timetable_segments -v`

- [ ] **Step 3: Recompute the segment indices**

Minden érintett kulcsra (`2-depart`, `5-depart`, `6-depart`, és ha kétirányú lett, akkor `-return` is) számold újra a `start`/`end` forrás-megállóindexeket az új `line-*/` fájlok `stops` tömbje szerint. A `to-*` szegmens az induló végállomástól a fordulópontig; a `from-*` a fordulóponttól a záró végállomásig. Ha egy vonal Fázis 2-ben kétirányúvá vált (nincs kör), töröld a hozzá tartozó szegmens-kulcsot (nem kell szegmentálni).

- [ ] **Step 4: Run all segment tests**

Run: `python3 -m unittest tests.test_timetable_segments -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add timetable_segments.json tests/test_timetable_segments.py
git commit -m "Re-anchor the timetable segments for lines 2, 5, 6"
```

### Task 11: `timetable_overrides.json` – D-vonal oszlopok

**Files:**
- Modify: `timetable_overrides.json`
- Test: `tests/test_timetable_overrides.py`

**Interfaces:**
- Consumes: `apply_timetable_overrides`, `filter_opposite_platform_columns`, `merge_same_platform_columns` a `timetable_overrides.py`-ból.
- Produces: `timetable_overrides.json` – `{"ignoreColumns":[...], "rewriteColumns":[...]}`.

- [ ] **Step 1: Map the new board's D-line columns**

A `timetable.json`-ból (Task 1 kimenete) listázd ki az 1D, 2D, 5D `direction`-önkénti oszlopait az új `source_station_id`-kkal. Vesd össze a jelenlegi `rewriteColumns` `sourceStationIds` listákkal – ezek az id-k valószínűleg elcsúsztak (100 vs korábbi ~91 állomás).

- [ ] **Step 2: Failing test – az 5D visszairány újraírás az új id-kkal**

```python
def test_5d_return_rewrite_targets_dozsa_gyorgy(self):
    ov = json.load(open("timetable_overrides.json"))
    r = [x for x in ov["rewriteColumns"] if x["line"] == "5D" and x["direction"] == "return"][0]
    self.assertIn("Str. Dózsa György", r["stops"])
```

- [ ] **Step 3: Run – fails**

Run: `python3 -m unittest tests.test_timetable_overrides -v`

- [ ] **Step 4: Rewrite the override entries**

Frissítsd a `rewriteColumns` `sourceStationIds` + `stops` mezőket az új tábla-id-khez és az új `line-*/` sorrendhez a 2D, 5D bejegyzésekben; a `5D:depart:Autoliv` `ignoreColumns` bejegyzés `sourceStationIds`-ét az új id-hez. Ha az 1B-nek van saját D-szerű viselkedése, adj hozzá bejegyzést.

- [ ] **Step 5: Run**

Run: `python3 -m unittest tests.test_timetable_overrides -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add timetable_overrides.json tests/test_timetable_overrides.py
git commit -m "Remap the D-line column overrides to the Sept 7 board"
```

### Task 12: `turnarounds.json` – 2/5/6 fordulópontok

**Files:**
- Modify: `turnarounds.json`
- Test: `tests/test_trip_reconstruction.py`

**Interfaces:**
- Consumes: `load_turnarounds(raw)` a `trip_reconstruction.py`-ból – `{index, stop_ro, arrival_destination, departure_destination, minimum_dwell_minutes}`.
- Produces: `turnarounds.json`.

- [ ] **Step 1: Identify the turnaround call per line**

A 2, 5, 6 vonal új `line-*/depart.json` fájljában keresd meg a fordulópontot (ahol a kijelzett cél vált): 5-ös = `Arena Sepsi`; 2-es = `Gara CFR` (ha kör maradt); 6-os = `Arena Sepsi`. Az `index` az új forrás-megállóindex.

- [ ] **Step 2: Failing test**

```python
def test_line5_turnaround_at_arena(self):
    raw = json.load(open("turnarounds.json"))
    self.assertIn("5-depart", raw)
    t = raw["5-depart"][0]
    d = json.load(open("line-5/depart.json"))
    self.assertEqual(d["stops"][t["index"]]["name"]["ro"], "Arena Sepsi")
```

- [ ] **Step 3: Run – fails**, then write entries, **Step 4: Run – passes**

Run: `python3 -m unittest tests.test_trip_reconstruction -v`

- [ ] **Step 5: Commit**

```bash
git add turnarounds.json tests/test_trip_reconstruction.py
git commit -m "Turnaround points for the re-anchored lines 2, 5, 6"
```

### Task 13: `route_overrides.json`

**Files:**
- Modify: `route_overrides.json`
- Test: `tests/test_build_route_audit.py` (vagy a route_overrides fogyasztójának tesztje)

**Interfaces:**
- Consumes: `apply_route_overrides(out, overrides)` a `build_map.py`-ból – `{"renameCalls":[...], "removeCalls":[...]}`.

- [ ] **Step 1: Review existing entries against new routes**

A jelenlegi `removeCalls` a 3, 4, 6 vonalra vonatkozik. A 6-os újrahorgonyzása után ellenőrizd, hogy a `{"line":"6","name":"Parcul Elisabeta"}` removeCall még érvényes-e (megvan-e a `Parcul Elisabeta` a új line-6-ban). Ha nincs, töröld a bejegyzést. Adj hozzá új `removeCalls`-t, ha a rekonstruált 2/6 route duplikált vagy UI-only hívást tartalmaz.

- [ ] **Step 2: Failing test (ha van változás)** – írd meg az adott bejegyzésre. **Step 3–4: implement + run.**

Run: `python3 -m unittest discover -v -s tests -p "test_build*"`

- [ ] **Step 5: Commit**

```bash
git add route_overrides.json tests/
git commit -m "Reconcile route overrides with the reconstructed lines"
```

### Task 14: `build_map.py` + `build_trips.py` – 1B bekötése

**Files:**
- Modify: `build_map.py:43` (`ORDER`), `build_map.py:184` (`DESCRIPTIONS`)
- Modify: `build_trips.py:26` (`ORDER`)
- Test: `tests/test_build_trips.py`

**Interfaces:**
- `ORDER` mindhárom helyen (`fetch_timetable.py` Task 1, `build_map.py`, `build_trips.py`) azonos: `["1","1B","1D","2","2D","3","4","5","5D","6","7","9","10"]`.

- [ ] **Step 1: Failing test**

```python
def test_order_includes_1b(self):
    from build_map import ORDER as MAP_ORDER
    from build_trips import ORDER as TRIP_ORDER
    self.assertEqual(MAP_ORDER, TRIP_ORDER)
    self.assertIn("1B", MAP_ORDER)
```

- [ ] **Step 2: Run – fails**

Run: `python3 -m unittest tests.test_build_trips -v`

- [ ] **Step 3: Add 1B**

`build_map.py`:
```python
ORDER = ["1", "1B", "1D", "2", "2D", "3", "4", "5", "5D", "6", "7", "9", "10"]

DESCRIPTIONS = {
    # ...
    "1B": "Szemerja – Szépmező · Autoliv felé, a klasszikus 1-es útvonalán",
    "5":  "Dózsa György u. – Sepsi Aréna · körjárat",
    "10": "Lábasház – Árkos központ · Kossuth Lajos negyeden át",
}
```
`build_trips.py`: `ORDER` ugyanígy.

- [ ] **Step 4: Run** – `python3 -m unittest tests.test_build_trips -v`

- [ ] **Step 5: Commit**

```bash
git add build_map.py build_trips.py tests/test_build_trips.py
git commit -m "Wire line 1B into the map and trip builders"
```

### Task 15: `build_trips` futtatás + override-iteráció

**Files:**
- Modify: `trips.json` (generált), és iterációnként bármelyik override-fájl
- Modify: `timetable.json` (generált – ekkor futtatjuk élesben a `fetch_timetable`-t)

- [ ] **Step 1: Run the importer for real**

Run: `python3 fetch_timetable.py`
Expected: `timetable.json` írás, „X timetabled stops -> Y timing points", a küszöb felett. Jegyezd fel az „unmatched" és „ambiguous" listát.

- [ ] **Step 2: Run `build_trips`**

Run: `python3 build_trips.py`
Expected: `trips.json` írás hiba nélkül.

- [ ] **Step 3: Check every board column is placed or ignored**

Írj egy egyszeri ellenőrző snippetet: minden `timetable.json` timepoint vagy megjelenik `trips.json`-ban (line+stop), vagy fedi egy `timetable_overrides.json` `ignoreColumns` bejegyzés. Listázd a fedetlen oszlopokat.

- [ ] **Step 4: Iterate**

Minden fedetlen oszlopra: döntsd el, `rewriteColumns` (rossz irány), `ignoreColumns` (nem valós hívás az adott peronon), vagy `line-*/` sorrendhiba. Javíts, futtasd újra a Step 1–3-at. Ismételd, amíg nulla fedetlen oszlop marad.

- [ ] **Step 5: Run Python tests**

Run: `python3 -m unittest discover -v`
Expected: mind zöld.

- [ ] **Step 6: Commit**

```bash
git add timetable.json trips.json timetable_overrides.json timetable_segments.json turnarounds.json
git commit -m "Reconstruct Sept 7 trips; every board column bound or ignored"
```

---

## Fázis 4 – GTFS + web feed  ·  MÉRFÖLDKŐ 1

### Task 16: `build_gtfs.py` – FEED_START, 1B route, validálás

**Files:**
- Modify: `build_gtfs.py:62` (`FEED_START`)
- Modify: `gtfs/*` (generált), `multitrans-gtfs.zip` (generált)
- Test: `tests/test_build_gtfs.py`

- [ ] **Step 1: Failing test**

```python
def test_feed_starts_on_sept_7(self):
    self.assertEqual(FEED_START, "20260907")
```

- [ ] **Step 2: Run – fails** → **Step 3: set `FEED_START = "20260907"`** (komment: „2026. szeptember 7-től érvényes") → **Step 4: run**

Run: `python3 -m unittest tests.test_build_gtfs -v`

- [ ] **Step 5: Regenerate GTFS**

Run: `python3 build_gtfs.py && python3 validate_gtfs.py`
Expected: `routes.txt` tartalmaz `1B` sort; `validate_gtfs.py` hiba nélkül; monoton `stop_times`.

- [ ] **Step 6: Commit**

```bash
git add build_gtfs.py gtfs/ multitrans-gtfs.zip tests/test_build_gtfs.py
git commit -m "Rebuild the GTFS feed for the Sept 7 network"
```

### Task 17: `build_web_data.py` – network.json + routesProvisional

**Files:**
- Modify: `build_web_data.py:748-750` (feed meta), és egy új sor a `routesProvisional`-hoz
- Modify: `web/public/data/network.json`, `web/public/data/places.json` (generált)
- Test: `web/lib/engine/__tests__/network.test.ts`

**Interfaces:**
- Produces: `network.json` – meglévő kulcsok + `"validFrom": "20260907"` + `"routesProvisional": true`.

- [ ] **Step 1: Failing test (web)**

`web/lib/engine/__tests__/network.test.ts`:
```ts
import net from "@/public/data/network.json";
it("is the Sept 7 feed and flags provisional routes", () => {
  expect(net.validFrom).toBe("20260907");
  expect(net.routesProvisional).toBe(true);
  expect(net.lines.map((l) => l.id)).toContain("1B");
});
```

- [ ] **Step 2: Run – fails**

Run: `cd web && npm test -- network.test`

- [ ] **Step 3: Emit the fields**

`build_web_data.py` a `network.json` dict-jébe:
```python
"validFrom": feed.get("feed_start_date", ""),
"routesProvisional": True,   # amíg a Multi-Trans ki nem teszi a hivatalos útvonalrajzot
```

- [ ] **Step 4: Regenerate**

Run: `python3 build_web_data.py`

- [ ] **Step 5: Run web + Python tests**

Run: `cd web && npm test` ; `cd .. && python3 -m unittest discover`

- [ ] **Step 6: Commit**

```bash
git add build_web_data.py web/public/data/network.json web/public/data/places.json web/lib/engine/__tests__/network.test.ts
git commit -m "Emit the Sept 7 web bundle with the provisional-routes flag"
```

### Task 18: FELHASZNÁLÓI ELLENŐRZŐPONT – peronoldalak

**Files:**
- Modify: `platform_overrides.json`, `line-10/*.json` (Kossuth koordináták), majd regenerálás

- [ ] **Step 1: Build a kerb-review artifact**

Minden rekonstruált vonal (2, 6, 1B, 10, 1D/2D) minden kétoldalas hívásához: a jelenleg feltételezett oszlop koordinátája + a másik oldal koordinátája + egy térképlink. A 3 új megálló (Kossuth Lajos 1/2, Bis. Reformată Arcuș) jelenlegi tippje.

- [ ] **Step 2: Send to user**

`SendUserFile`. Kérdés: „Melyik oldal a helyes? A 3 új megálló hol van pontosan?"

- [ ] **Step 3: Apply**

A `platform_overrides.json` `calls` bejegyzései az `<line>:<direction>:<index>` kulcsokkal a helyes koordinátára/oszlopra. A Kossuth koordináták a `line-10/*.json`-ban.

- [ ] **Step 4: Regenerate the chain**

Run: `python3 build_trips.py && python3 build_gtfs.py && python3 validate_gtfs.py && python3 build_web_data.py`

- [ ] **Step 5: Full test sweep**

Run: `python3 -m unittest discover -v && cd web && npm test`

- [ ] **Step 6: Commit**

```bash
git add platform_overrides.json line-10/ trips.json gtfs/ multitrans-gtfs.zip web/public/data/
git commit -m "Apply the operator's kerb-side corrections; rebuild the feed"
```

> **MÉRFÖLDKŐ 1 kész.** A feed a szept. 7-i hétköznap/hétvége hálózatot tükrözi. Itt meg lehet állni és külön szállítani, mielőtt az iskolai naphoz kezdünk.

---

## Fázis 5 – Iskolai nap szolgáltatásosztály

### Task 19: Tanévnaptár a network.json-ba

**Files:**
- Modify: `build_web_data.py` (új `schoolTerms` / `schoolExceptions` kiírás)
- Create: `school_calendar.py` (tiszta modul a dátumtartományokhoz)
- Modify: `web/public/data/network.json` (generált)
- Test: `tests/test_school_calendar.py`

**Interfaces:**
- Produces: `network.json` += `"schoolTerms": [["YYYYMMDD","YYYYMMDD"],...]`, `"schoolExceptions": ["YYYYMMDD",...]`.
- `school_calendar.py`: `SCHOOL_TERMS: list[tuple[str,str]]`, `SCHOOL_EXCEPTIONS: list[str]` (az `ro-holidays.json` tanidőbe eső dátumai + `20261005`).

- [ ] **Step 1: Failing test**

```python
def test_terms_cover_sept_to_june(self):
    from school_calendar import SCHOOL_TERMS
    self.assertEqual(SCHOOL_TERMS[0][0], "20260907")
    self.assertEqual(SCHOOL_TERMS[-1][1], "20270618")

def test_oct_5_is_an_exception(self):
    from school_calendar import SCHOOL_EXCEPTIONS
    self.assertIn("20261005", SCHOOL_EXCEPTIONS)
```

- [ ] **Step 2: Run – fails**

Run: `python3 -m unittest tests.test_school_calendar -v`

- [ ] **Step 3: Write `school_calendar.py`**

```python
"""2026-27 Romanian school year, for the school-day service class.

Source: education ministry calendar (via Maszol, 2026-09-07). The two winter/
spring break boundaries are a Covasna county decision; the middle option is
used until the county publishes (see the design doc checkpoint).
"""
import json
from pathlib import Path

SCHOOL_TERMS = [
    ("20260907", "20261023"),
    ("20261102", "20261222"),
    ("20270111", "20270213"),   # Covasna: feb 13/20/27 boundary - middle option
    ("20270223", "20270423"),   # Covasna: feb 22 / mar 1 / mar 8 - middle option
    ("20270505", "20270618"),
]

_HOLIDAYS = json.loads(
    (Path(__file__).resolve().parent / "web/public/data/ro-holidays.json").read_text()
)["dates"]

def _in_terms(ymd):
    return any(a <= ymd <= b for a, b in SCHOOL_TERMS)

SCHOOL_EXCEPTIONS = sorted({"20261005", *(d.replace("-", "") for d in _HOLIDAYS if _in_terms(d.replace("-", "")))})
```

- [ ] **Step 4: Emit into build_web_data.py**

```python
from school_calendar import SCHOOL_TERMS, SCHOOL_EXCEPTIONS
# a network dict-be:
"schoolTerms": [list(t) for t in SCHOOL_TERMS],
"schoolExceptions": SCHOOL_EXCEPTIONS,
```

- [ ] **Step 5: Run tests + regenerate**

Run: `python3 -m unittest tests.test_school_calendar -v && python3 build_web_data.py`

- [ ] **Step 6: Commit**

```bash
git add school_calendar.py build_web_data.py web/public/data/network.json tests/test_school_calendar.py
git commit -m "Bake the 2026-27 school calendar into the feed"
```

### Task 20: `time.ts` – iskolai-nap feloldás

**Files:**
- Modify: `web/lib/engine/time.ts`
- Modify: `web/lib/engine/types.ts:14` (`ServiceId`)
- Test: `web/lib/engine/__tests__/time.test.ts`

**Interfaces:**
- Produces: `ServiceId = "weekday" | "weekend" | "school"`.
- Produces: `isSchoolDay(date: Date, terms: [string,string][], exceptions: string[]): boolean`.
- Produces: `serviceForDate(date: Date, cal?: { schoolTerms: [string,string][]; schoolExceptions: string[] }): ServiceId` – hétvége → `"weekend"`; iskolai hétköznap → `"school"`; egyéb hétköznap → `"weekday"`. `cal` nélkül a régi viselkedés (`"weekend"`/`"weekday"`).

- [ ] **Step 1: Failing tests**

```ts
describe("isSchoolDay", () => {
  const terms: [string,string][] = [["20260907","20261023"]];
  const exc = ["20261005"];
  it("true on a teaching weekday", () => {
    expect(isSchoolDay(new Date(2026,8,9), terms, exc)).toBe(true);   // Wed Sep 9
  });
  it("false on Oct 5 exception", () => {
    expect(isSchoolDay(new Date(2026,9,5), terms, exc)).toBe(false);
  });
  it("false in the summer", () => {
    expect(isSchoolDay(new Date(2026,7,15), terms, exc)).toBe(false);
  });
});

describe("serviceForDate with a calendar", () => {
  const cal = { schoolTerms: [["20260907","20261023"]] as [string,string][], schoolExceptions: [] as string[] };
  it("school on a teaching weekday", () => {
    expect(serviceForDate(new Date(2026,8,9), cal)).toBe("school");
  });
  it("weekend still weekend", () => {
    expect(serviceForDate(new Date(2026,8,12), cal)).toBe("weekend");
  });
  it("weekday out of term", () => {
    expect(serviceForDate(new Date(2026,10,15), cal)).toBe("weekday");
  });
});
```

- [ ] **Step 2: Run – fails**

Run: `cd web && npm test -- time.test`

- [ ] **Step 3: Implement**

```ts
function ymd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}

export function isSchoolDay(date: Date, terms: [string,string][], exceptions: string[]): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  const s = ymd(date);
  if (exceptions.includes(s)) return false;
  return terms.some(([a, b]) => a <= s && s <= b);
}

export function serviceForDate(
  date: Date,
  cal?: { schoolTerms: [string,string][]; schoolExceptions: string[] },
): ServiceId {
  const day = date.getDay();
  if (day === 0 || day === 6) return "weekend";
  if (cal && isSchoolDay(date, cal.schoolTerms, cal.schoolExceptions)) return "school";
  return "weekday";
}
```

`types.ts`: `export type ServiceId = "weekday" | "weekend" | "school";`

- [ ] **Step 4: Run – time tests pass, but engine type errors elsewhere**

Run: `cd web && npm test -- time.test` (PASS) ; `npx tsc --noEmit` (várható hibák a `plan.ts`/`multimodal.ts` `service` összehasonlításoknál – a Task 21 oldja meg; ideiglenesen a `ServiceId` bővítés nem tör kódot, mert a `===` string-összehasonlítás marad).

- [ ] **Step 5: Commit**

```bash
git add web/lib/engine/time.ts web/lib/engine/types.ts web/lib/engine/__tests__/time.test.ts
git commit -m "Add the school-day service resolution to time.ts"
```

### Task 21: `build_web_data.py` – hétköznapi tripek a „school" service-be

**Files:**
- Modify: `build_web_data.py` (trip-kiírás)
- Modify: `web/public/data/network.json` (generált)
- Test: `web/lib/engine/__tests__/network.test.ts`, `tests/test_build_web_data.py`

**Interfaces:**
- Produces: `network.json.trips` – minden `service:"weekday"` trip mellett egy azonos `service:"school"` másolat; plusz a Task 22 iskola-only tripjei `service:"school"` értékkel.
- A RAPTOR szűrő (`trip.service === service`) **változatlan**: iskolai napon a `serviceForDate` `"school"`-t ad, és minden hétköznapi trip is elérhető, mert bekerült a `"school"` service-be.

- [ ] **Step 1: Failing test**

```ts
it("weekday trips are also available on school days", () => {
  const weekday = net.trips.filter((t) => t.service === "weekday").length;
  const school = net.trips.filter((t) => t.service === "school").length;
  expect(school).toBeGreaterThanOrEqual(weekday);
});
```

```python
def test_school_service_supersets_weekday(self):
    net = json.load(open("web/public/data/network.json"))
    wd = [t for t in net["trips"] if t["service"] == "weekday"]
    sc = [t for t in net["trips"] if t["service"] == "school"]
    self.assertGreaterEqual(len(sc), len(wd))
```

- [ ] **Step 2: Run – fails**

Run: `cd web && npm test -- network.test`

- [ ] **Step 3: Duplicate weekday trips**

`build_web_data.py`-ban, a trip-lista összeállítása után:
```python
school_trips = [dict(t, service="school") for t in trips if t["service"] == "weekday"]
trips = trips + school_trips + school_only_trips   # school_only_trips a Task 22-ből, addig []
```

- [ ] **Step 4: Regenerate + run**

Run: `python3 build_web_data.py && cd web && npm test -- network.test ; cd .. && python3 -m unittest tests.test_build_web_data`

- [ ] **Step 5: Commit**

```bash
git add build_web_data.py web/public/data/network.json web/lib/engine/__tests__/network.test.ts tests/test_build_web_data.py
git commit -m "Fold weekday trips into the school-day service"
```

### Task 22: Iskola-only tripek – áthúzott 6, line 10 esti/iskolai

**Files:**
- Create: `line-6S/depart.json`, `line-6S/depart-shape.json`, `line-6S/depart-durations.json` (a 07:30 áthúzott 6 – „6S" a belső id, GTFS route-ként „6" marad `trip_headsign`-nal jelölve, VAGY külön „6S" route – lásd Step 1)
- Modify: `school_only_trips.json` (új, kézzel megadott indulások, amiket a tábla nem közöl)
- Modify: `build_trips.py` / `build_web_data.py` (a `school_only_trips.json` beolvasása)
- Test: `tests/test_build_trips.py`

**Interfaces:**
- Produces: `school_only_trips.json` – `[{"line","direction","service":"school","start":"HH:MM","note"}]`.
- Produces: `network.json.trips` további `service:"school"` bejegyzések ezekre.

- [ ] **Step 1: Decide the 6-barred modelling**

Az „áthúzott 6" a poszt szerint: Csíki negyed → Grigore Bălan sugárút → Gyöngyvirág utca → Állomás negyed, munkanap 07:30, egy irány. Nincs tábla-oszlopa. Modell: külön belső vonal `"6S"` (nem kerül a publikus `ORDER`-be, csak a `school_only_trips` építi), a `line-6S/depart.json` kézzel a 4 szakasz-megállóval (koordináták a meglévő `line-5`/`line-6`/`line-7` hívásokból: Csíki negyed, G. Bălan 1/2, Lăcrămioarei 1/2, Gara CFR). A GTFS-ben `route_id="6"`, `trip_headsign="Cartier Ciucului → Gară (cursă școlară)"`.

- [ ] **Step 2: Failing test**

```python
def test_school_only_trips_load(self):
    from build_trips import load_school_only
    trips = load_school_only()
    self.assertTrue(any(t["line"] == "6S" and t["start"] == "07:30" for t in trips))
```

- [ ] **Step 3: Write `school_only_trips.json` + loader**

```json
[
  {"line": "6S", "direction": "depart", "service": "school", "start": "07:30",
   "note": "áthúzott 6 iskolajárat - Multi-Trans FB 2026-09-07, nincs tábla-oszlop"},
  {"line": "10", "direction": "depart", "service": "weekday", "start": "20:10",
   "note": "esti Árkos - tábla"},
  {"line": "10", "direction": "depart", "service": "weekday", "start": "23:15",
   "note": "esti Árkos - tábla"}
]
```

(A 20:10 / 23:15 valójában a táblán is rajta van; ha a `build_trips` már felszedi őket, hagyd ki innen – ez a fájl csak a tábla-nélküli indulásokra való.)

`build_trips.py`: `load_school_only()` beolvassa; a `6S` tripre a `line-6S/` geometriából interpolál (mint bármely más irány), a `service` mezőt `"school"`-ra állítja.

- [ ] **Step 4: Line 10 school-hours Váradi József detour**

A poszt szerint az Árkosról 7:30-kor induló járat iskolaidőben érinti a Váradi József Általános Iskolát; visszafelé a 14:10 és 15:10 megáll a Szemerja negyedi iskolánál. Ez a `line-10` egy variáns-mintája iskolai napon. Modell: `line-10/depart-school.json` + `return-school.json` a plusz megállóval; a `school_only_trips.json`-ban a 07:30/14:10/15:10 indulások `"line":"10S"` néven, a variáns-geometriára kötve. A Váradi József iskola helye: OSM-ből (`osm/poi.json` / `osm/places.json` – keresd „Váradi" vagy „Școala Gimnazială"), ha nincs, a felhasználó adja meg a Task 18 körben.

- [ ] **Step 5: Run tests + regenerate**

Run: `python3 -m unittest tests.test_build_trips -v && python3 build_trips.py && python3 build_gtfs.py && python3 build_web_data.py`

- [ ] **Step 6: Commit**

```bash
git add school_only_trips.json line-6S/ line-10/*-school.json build_trips.py build_web_data.py tests/test_build_trips.py trips.json gtfs/ web/public/data/
git commit -m "Add the school-only trips: 6-barred and line 10 school routing"
```

### Task 23: Web UI – iskolai-nap nézet + GTFS calendar_dates

**Files:**
- Modify: `web/components/planner/Planner.tsx` (a `serviceForDate(date)` hívások → `serviceForDate(date, network)`)
- Modify: `web/components/timetable/Timetable.tsx` (3. opció: „iskolai nap")
- Modify: `web/lib/seo/routes.ts:106` (SSG service – marad `"weekday"`, de kommenttel)
- Modify: `build_gtfs.py` (`calendar_dates.txt` a `"school"` service-hez)
- Test: `web/components/**/__tests__/`, `tests/test_build_gtfs.py`

**Interfaces:**
- Consumes: `network.schoolTerms`, `network.schoolExceptions` a `Planner.tsx`-ben elérhető `network` propból.

- [ ] **Step 1: Failing test – Planner a helyes service-t kéri iskolai napon**

`web/components/planner/__tests__/Planner.test.tsx` (a meglévő minta szerint): mock `network` `schoolTerms`-szel, `vi.setSystemTime` egy tanítási szerdára, ellenőrizd hogy a planner request `service: "school"`.

- [ ] **Step 2: Run – fails**

Run: `cd web && npm test -- Planner.test`

- [ ] **Step 3: Thread the calendar**

`Planner.tsx`: `const cal = { schoolTerms: network.schoolTerms ?? [], schoolExceptions: network.schoolExceptions ?? [] };` és minden `serviceForDate(date)` → `serviceForDate(date, cal)`. A `Timetable.tsx` `day` state `ServiceId` – adj egy „iskolai nap" választót (a `t.schoolDayShort` i18n kulccsal); az `official-board.ts` és `StopBoard.tsx` `ServiceId`-t fogad, nincs logikai változás.

- [ ] **Step 4: GTFS calendar_dates**

`build_gtfs.py`: a `SERVICES`-hez add `"school": dict(monday=0,...,sunday=0)` (calendar.txt-ben minden 0), majd `calendar_dates.txt` írás: minden `isSchoolDay` dátumra `service_id="school", date=<ymd>, exception_type=1`. A `school_calendar.py`-ból (Python oldal) egy `school_days()` generátor kell.

```python
def school_days():
    from datetime import date, timedelta
    for a, b in SCHOOL_TERMS:
        d = date(int(a[:4]), int(a[4:6]), int(a[6:]))
        end = date(int(b[:4]), int(b[4:6]), int(b[6:]))
        while d <= end:
            s = d.strftime("%Y%m%d")
            if d.weekday() < 5 and s not in SCHOOL_EXCEPTIONS:
                yield s
            d += timedelta(days=1)
```

- [ ] **Step 5: Run all tests + regenerate**

Run: `cd web && npm test ; cd .. && python3 -m unittest discover && python3 build_gtfs.py && python3 validate_gtfs.py`

- [ ] **Step 6: Commit**

```bash
git add web/components/ web/lib/ build_gtfs.py school_calendar.py gtfs/ multitrans-gtfs.zip web/public/data/ tests/
git commit -m "School-day view in the planner and GTFS calendar_dates"
```

---

## Fázis 6 – Web-szöveg + regenerálás  ·  MÉRFÖLDKŐ 2

### Task 24: `lib/seo/lines.ts` – 1B névkezelés

**Files:**
- Modify: `web/lib/seo/lines.ts:19-37` (`HU_STEM` / `huLabel`)
- Test: `web/lib/seo/__tests__/lines.test.ts` (vagy ahol a `lineLabel` tesztje van)

- [ ] **Step 1: Failing test**

```ts
it("names line 1B", () => {
  expect(lineLabel("1B", "hu")).toBe("1B-s busz");
  expect(lineLabel("1B", "ro")).toBe("linia 1B");
});
```

- [ ] **Step 2: Run – fails**

Run: `cd web && npm test -- lines`

- [ ] **Step 3: Implement**

`huLabel`: az `id.endsWith("D")` ág általánosítása:
```ts
if (id.endsWith("D") || id.endsWith("B")) return `${id}-s busz`;
```

- [ ] **Step 4: Run** – `cd web && npm test -- lines`

- [ ] **Step 5: Commit**

```bash
git add web/lib/seo/lines.ts web/lib/seo/__tests__/
git commit -m "Name line 1B in all three languages"
```

### Task 25: `ServiceNotice` – új szöveg, routesProvisional trigger

**Files:**
- Modify: `web/lib/service-notice.ts` (`serviceNoticeState` – `routesProvisional` alapú)
- Modify: `web/lib/i18n.ts` (`serviceNoticeBefore` törlése, `serviceNoticeAfter` átírása; vagy egyetlen `serviceNoticeProvisional` kulcs)
- Modify: `web/components/common/ServiceNotice.tsx` (a prop `routesProvisional: boolean`)
- Modify: `web/components/planner/Planner.tsx`, `web/components/timetable/Timetable.tsx` (a prop átadása)
- Test: `web/lib/service-notice.test.ts`, `web/components/common/__tests__/ServiceNotice.test.tsx`

**Interfaces:**
- Produces: `serviceNoticeState(routesProvisional: boolean, dismissed: boolean): { show: boolean }` – egyszerűsödik: `show = routesProvisional && !dismissed`. A `SERVICE_CHANGE_DATE` / `phase` logika törölhető.

- [ ] **Step 1: Failing tests**

```ts
// service-notice.test.ts
it("shows only while routes are provisional", () => {
  expect(serviceNoticeState(true, false)).toEqual({ show: true });
  expect(serviceNoticeState(false, false)).toEqual({ show: false });
  expect(serviceNoticeState(true, true)).toEqual({ show: false });
});
```

- [ ] **Step 2: Run – fails**

Run: `cd web && npm test -- service-notice`

- [ ] **Step 3: Simplify the state + swap the copy**

`service-notice.ts`: dobd a `SERVICE_CHANGE_DATE`, `localYmd`, `phase` részeket; `serviceNoticeState(routesProvisional, dismissed)`. `ServiceNotice.tsx`: `useEffect` csak a localStorage dismiss-t olvassa; a szöveg `t.serviceNoticeProvisional`.

`i18n.ts` – új kulcs mindhárom nyelven, a többi törölve:
```ts
serviceNoticeProvisional: "A Multi-Trans szeptember 7-én átalakította a menetrendet. Az indulási időket frissítettük. A 2-es, 6-os, 10-es és az új 1B vonal útvonala még ideiglenes rekonstrukció – a hivatalos útvonalrajz megjelenésekor pontosítjuk. A megállói tábla a mérvadó.",
```
(RO / EN fordítás ugyanígy.)

- [ ] **Step 4: Thread `routesProvisional`**

`Planner.tsx` / `Timetable.tsx`: `<ServiceNotice routesProvisional={network.routesProvisional ?? false} t={t} />`.

- [ ] **Step 5: Run all affected tests**

Run: `cd web && npm test -- service-notice ServiceNotice Planner Timetable`

- [ ] **Step 6: Commit**

```bash
git add web/lib/service-notice.ts web/lib/i18n.ts web/components/ web/lib/service-notice.test.ts
git commit -m "Rework the service notice: provisional routes, not a date phase"
```

### Task 26: SEO-tartalom – 1B, Dózsa György, Kossuth, 9-es kerékpár

**Files:**
- Modify: `web/lib/seo/content.hu.ts`, `web/lib/seo/content.ro.ts`, `web/lib/seo/content.en.ts`
- Test: `web/lib/seo/content.test.ts`

- [ ] **Step 1: Review the guides for stale route facts**

A `GUIDES` objektumban keress: „5-ös", „körjárat", „József Attila", „Kossuth", „1D", „Szemerja Végállomás", „Építők". Ahol a szöveg konkrét útvonalat állít, igazítsd a szept. 7-i valósághoz: 1B létezése, az 5-ös Dózsa György-horgony, a 10-es Kossuth Lajos 1/2, a végállomás neve „Szemerja (Gólya utca)". A 9-es útmutatóhoz: „iskolaidőben kerékpárt csak a 16 órás járattal szállítanak".

- [ ] **Step 2: Keep the parity tests green**

A `content.test.ts` `POLITE_PLURAL` (RO regiszter) és a FAQ hossz-paritás (`GUIDES.faq.faq?.en.length === GUIDES.faq.faq?.hu.length`) ellenőrzések maradjanak zöldek – a három nyelv szerkezete tükrözze egymást.

Run: `cd web && npm test -- content`

- [ ] **Step 3: Commit**

```bash
git add web/lib/seo/content.*.ts web/lib/seo/content.test.ts
git commit -m "Update the guide content for the Sept 7 routes"
```

### Task 27: Ideiglenes-útvonal jelölő a vonallapokon

**Files:**
- Modify: `web/components/seo/LinePage.tsx` (jelölő a `routesProvisional && ["2","6","1B","10"].includes(lineId)` esetén)
- Modify: `web/lib/i18n.ts` (`lineRouteProvisional` kulcs)
- Test: `web/components/seo/__tests__/LinePage.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
it("marks a provisional line", () => {
  render(<LinePage line={line2} network={{ ...net, routesProvisional: true }} lang="hu" />);
  expect(screen.getByText(/ideiglenes/i)).toBeInTheDocument();
});
it("does not mark a stable line", () => {
  render(<LinePage line={line3} network={{ ...net, routesProvisional: true }} lang="hu" />);
  expect(screen.queryByText(/ideiglenes/i)).toBeNull();
});
```

- [ ] **Step 2: Run – fails** → **Step 3: add the marker** → **Step 4: run**

Run: `cd web && npm test -- LinePage`

```tsx
const PROVISIONAL = new Set(["2", "6", "1B", "10"]);
{network.routesProvisional && PROVISIONAL.has(line.id) && (
  <p className={styles.provisional}>{t.lineRouteProvisional}</p>
)}
```

`i18n.ts`: `lineRouteProvisional: "Ez az útvonal ideiglenes rekonstrukció, amíg a Multi-Trans közzé nem teszi a hivatalos térképet."` (+ RO/EN).

- [ ] **Step 5: Commit**

```bash
git add web/components/seo/LinePage.tsx web/lib/i18n.ts web/components/seo/__tests__/
git commit -m "Flag the reconstructed lines as provisional on their pages"
```

### Task 28: Teljes regenerálás + verifikáció

**Files:**
- Modify: `web/public/maps/*` (baked line maps – 1B új), `.line-maps-manifest.json`, `web/public/sw.js` (`VERSION`)
- Modify: `web/out/*` (build output – csak ellenőrzésre, ha gitignored)

- [ ] **Step 1: Regenerate baked line maps**

Run: `cd web && node --env-file-if-exists=.env.local scripts/gen-maps.mjs`
Expected: `ticket-points.png` cached; új `line-1B-*.png`; `.line-maps-manifest.json` frissül.

- [ ] **Step 2: Full production build**

Run: `cd web && npm run build`
Expected: hibamentes; `scripts/verify-seo.mjs` zöld (minden lap 1 `<h1>`, minden `/maps/*.png` létezik).

- [ ] **Step 3: Determinism check**

Run:
```bash
cd web && npm run build && mv out /tmp/out-a && npm run build && diff -rq /tmp/out-a out
```
Expected: nincs eltérés.

- [ ] **Step 4: Full test sweep**

Run:
```bash
cd .. && python3 -m unittest discover -v && python3 validate_gtfs.py
cd web && npm test
```
Expected: minden zöld.

- [ ] **Step 5: Manual spot-check**

Minden rekonstruált vonalra (2, 6, 1B, 10): a `network.json` mintája egy reggeli indulásra egyezzen a tábla nyomtatott óráival a időpont-megállóknál (±1 perc az interpoláltaknál).

- [ ] **Step 6: Commit**

```bash
git add web/public/maps/ web/.line-maps-manifest.json web/public/sw.js
git commit -m "Regenerate baked maps and stamp the service worker"
```

- [ ] **Step 7: Update the memory note**

`~/.claude/projects/-Users-arintonakos-Projects-MultiTrans-GTFS/memory/sept-7-network-change.md`: a feed most a szept. 7-i hálózat (best-effort); a `ServiceNotice` marad, `routesProvisional` triggerrel; a hivatalos útvonalrajz megjelenésekor: `fetch_multitrans.py` + `merge_lines.py` a valós geometriára, `routesProvisional` kiveszi, `ServiceNotice` + `lib/service-notice.*` törlés.

> **MÉRFÖLDKŐ 2 kész.** A `sept-7-timetable` ág kész a felhasználó felülvizsgálatára. Push nincs.

---

## Self-review

**Spec-lefedettség:**
- Importáló új szerkezet → Task 1 ✓
- 5/5D forgatás → Task 2 ✓
- 2/6 újrahorgonyzás → Task 3, 4 ✓
- 1B → Task 5, 14 ✓
- 10 Kossuth-osztás → Task 6 ✓
- 1D/2D Calea Brașovului → Task 7 ✓
- Shapes/durations → Task 8 ✓
- Peronoldalak (felhasználó) → Task 9, 18 ✓
- Override-fájlok → Task 10–13 ✓
- Trip-építés, minden oszlop kötve → Task 15 ✓
- GTFS FEED_START, 1B route → Task 16 ✓
- network.json validFrom + routesProvisional → Task 17 ✓
- Iskolai naptár → Task 19 ✓
- time.ts iskolai-nap → Task 20 ✓
- „school" service superset → Task 21 ✓
- Iskola-only tripek (áthúzott 6, line 10) → Task 22 ✓
- Web iskolai-nap nézet + calendar_dates → Task 23 ✓
- 1B névkezelés → Task 24 ✓
- ServiceNotice átírás → Task 25 ✓
- SEO-tartalom → Task 26 ✓
- Ideiglenes jelölő a vonallapokon → Task 27 ✓
- Baked térképek + SW stamp + verifikáció → Task 28 ✓
- Kovászna megyei dátumok (felhasználó) → Task 19 Step 3 komment + spec checkpoint ✓

**Placeholder-ellenőrzés:** a Fázis 2 route-fájl tartalma nem előre megadott (a táblából/posztból/OSM-ből kell levezetni) – ez szándékos, minden ilyen task tartalmazza a levezetés módszerét, a validátort és a felhasználói kaput. Nincs „TODO"/„hasonlóan mint".

**Típuskonzisztencia:** `ServiceId` a Task 20-ban bővül `"school"`-lal, a Task 21/23 erre épít. `serviceForDate(date, cal?)` szignatúra a Task 20-ban rögzül, a Task 23 így hívja. `serviceNoticeState(routesProvisional, dismissed)` a Task 25-ben rögzül. `routesProvisional` a `network.json`-ban a Task 17-ben jelenik meg, a Task 25/27 fogyasztja. `ORDER` a Task 1/14-ben azonos. `board_line_stops(line)` helper a Task 3-ban jelenik meg – a Task 4/5/6 használja (a Task 3 Step 4 definiálja).

**Hatókör:** MÉRFÖLDKŐ 1 (Task 1–18) önmagában szállítható feed. MÉRFÖLDKŐ 2 (Task 19–28) az iskolai nap + web-szöveg. A kettő közt meg lehet állni.
