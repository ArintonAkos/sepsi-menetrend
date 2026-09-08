# Szeptember 7-i menetrend – best-effort újraépítés

## Cél

A `web/public/data/network.json` (és a mögötte lévő GTFS feed) a
2026. szeptember 7-től érvényes Multi-Trans hálózatot tükrözze, annyira
pontosan, amennyire a jelenleg elérhető forrásokból lehetséges, a
korábbi munkánk (peronoldalak, szegmentálás, turnaround-ok, stop-identitás)
megőrzésével.

## A helyzet

A Multi-Trans **csak a menetrendtáblát** publikálta:
`https://www.multitrans.ro/orarele/multitrans_menetrendek_web.html`
(`valid: "Valabil din 7 septembrie 2026"`, 100 állomásoszlop, vonalak:
1, 1B, 1D, 2, 2D, 3, 4, 5, 6, 7, 9, 10).

Az útvonalgeometria **nem publikált**: a `jarat-*.html` lapok, a
`jaratok/index.html` és a `files/linia_*_vonal.pdf`-ek mind
`Last-Modified: 2026-08-14` vagy korábbi – az augusztus 7-i hálózat. Nincs
`jarat-1b`, még mindig van `jarat-5d`. Hivatalos GTFS/GIS export nincs.

A nyers `fetch_timetable.py` a jelenlegi geometriánkkal 210 időpontot / 5985
indulást ad (a küszöb 250 / 7000), mert (a) a D-vonalak most „megjelölt
hosszabbításként" jelennek meg, nem külön oszlopként, és (b) 3-4 vonal
útvonala megváltozott.

## Igazságforrások (prioritási sorrend)

1. **Menetrendtábla** – menetidők, vonal↔megálló tagság, irányonként külön
   oszlop-azonosító, cél-fejléc. Mérvadó.
2. **Hivatalos Facebook-poszt (2026-09-07)** – útvonal-szándék: körjárat-e,
   mely utcákon, hol a végállomás. Szó szerint archiválva a specbe (lásd
   „Poszt-kivonat").
3. **Meglévő augusztus 7-i geometriánk** (`line-*/`, `platforms.json`,
   override-fájlok) – a nem változott vonalakhoz/szakaszokhoz változatlanul.
4. **OSM (`osm/*.json`) + OSRM** – új megállók koordinátája, új szakaszok
   útvonalrajza.
5. **Az üzemeltető (a felhasználó)** – a megváltozott vonalak peronoldalait
   manuálisan ellenőrzi a véglegesítés előtt; megadja a Kovászna megyei
   iskolai szünetek pontos dátumait.

## Hatókör

### Benne (v1)

- Mind a 12 vonal + az új **1B** rendszeres (hétköznap/hétvége) menetrendje.
- **5 / 5D** a kör kezdőpontja a Str. Dózsa Györgyhöz forgatva.
- **2, 6** újrahorgonyzása a Gólya utcai (Str. Berzei) végállomáshoz.
- **10** – „Cart. Kossuth Lajos" kettéosztása („Kossuth Lajos 1/2"), Árkosi
  Református Templom kifelé is, esti 20:10 és 23:15 indulások.
- **Iskolai nap** szolgáltatásosztály + naptár + a tervezőmotor iskolai-nap
  tudatossága. Ezen belül:
  - Line 10 esti indulások (táblán vannak) – magas bizalom.
  - „Áthúzott 6" 07:30 iskolajárat (Csíki negyed → G. Bălan → Gyöngyvirág →
    Állomás negyed) – **csak a posztból**, kézzel épített, felhasználó által
    ellenőrzött.
  - Line 10 tanidős Váradi József-kitérő – kézzel épített variáns.
- **Terminusátnevezés**: HU „Szemerja Végállomás" → „Szemerja (Gólya utca)";
  a RO oldalon „Simeria (Str. Berzei)" / „Cap Linie Simeria" azonosság
  megmarad.
- `ServiceNotice` – lecserélve rövidebb, csak a rekonstruált vonalakra
  vonatkozó szövegre (nem törölve).
- SEO-tartalom frissítés (1B, Dózsa György-horgony, Kossuth-osztás, 9-es
  tanidős kerékpárszabály).
- Baked vonaltérképek + SW stamp újragenerálás.

### Elhalasztva (v2, csak feljegyezve)

- Semmi – a felhasználó kérésére az iskolai körök is v1-be kerültek.

### Nem cél

- Hivatalos, pixelpontos útvonalrajz reprodukálása. Az OSRM-generált
  rajzolt vonal 12-ből ~5 vonalon rossz utcát választhat; ezt egyelőre
  elfogadjuk (a README is így jelzi).
- Push vagy deploy. Minden a `sept-7-timetable` ágon, lokális commitokkal.

## Vonalankénti újraépítési terv

| Vonal | Teendő | Geometria forrás | Bizalom |
|---|---|---|---|
| 1, 1D | tábla-idők a meglévő geometriára | változatlan | magas |
| 3, 4, 7, 9 | tábla-idők a meglévő geometriára | változatlan | magas |
| 5 | a kör kezdőpontja Str. József Attila 2 → Str. Dózsa György (2 megállós eltolás ugyanazon a körön); `timetable_segments` indexek eltolása | meglévő kör | magas |
| 5D | Dózsa Györgytől indul, egyébként a meglévő 5D geometria (Autoliv/Szépmező) | meglévő + eltolt fej | közepes-magas |
| 2 | útvonal újraépítés: Gólya utcai végállomás ↔ Gara CFR, Vadász utca / Csíki negyed / Állomás negyed; a meglévő kör újrahorgonyzása + a Simeria–Spitalul Județean szakasz az 1-esből | meglévő szakaszok + OSRM az összekötéshez | közepes |
| 6 | újrahorgonyzás a Gólya utcai végállomáshoz, egyébként a meglévő Csíki negyed + Aréna kör | meglévő + OSRM | közepes |
| **1B** (új) | 1-es törzs → Gara CFR → Autoliv → Câmpul Frumos (a rail-sorompón túli lakónegyed). Depó („Multi-Trans") csak ha az 1D is oda megy | 1-es + 1D szakaszok | közepes |
| 10 | „Cart. Kossuth Lajos" → „Str. Kossuth Lajos 1" + „Str. Kossuth Lajos 2" (OSM: Kossuth Lajos u. ~45.885, 25.799); „Bis. Reformată Arcuș" (OSM ~45.9012, 25.7729) kifelé is; esti indulások | meglévő + OSM új megállók + OSRM | közepes |
| 1D, 2D | +„Calea Brașovului 1" a tábla szerint (nem az Építők utca, amit a poszt ír – ellentmondás, a táblát követjük); ideiglenesnek jelölve | meglévő + OSRM | alacsony |

**Peronoldalak.** A megváltozott vonalak (2, 6, 1B, 10, 1D/2D) minden
kétoldalas hívásához: közös szakaszon az eddig használt oldal marad; új
szakaszon OSRM-legközelebbi peron az alapértelmezés. A `platform_overrides.json`
végleges értékeit a felhasználó kézi ellenőrzése után rögzítjük
(→ „Ellenőrzőpontok").

## Iskolai nap szolgáltatásosztály

### Adatmodell

`network.json` új mezők:

```json
"schoolTerms": [["20260907","20261023"], ["20261102","20261222"],
                ["20270111","<tél>"], ["<tavasz>","20270423"],
                ["20270505","20270618"]],
"schoolExceptions": ["20261005", "<RO munkaszüneti napok a tanidőben>"]
```

A `<tél>` / `<tavasz>` a Kovászna megyei tanfelügyelőség döntése (a felhasználó
adja meg); addig a középső opció (`20270213` ill. `20270223`) az alapértelmezés,
kommenttel jelölve. Az RO munkaszüneti napok a meglévő
`web/public/data/ro-holidays.json`-ból jönnek.

Trip `service` értékek: `"weekday"`, `"weekend"`, **`"school"`**. A `"school"`
csak iskolai napon fut; a rendes hétköznapi trip mindig fut.

### Motor (`web/lib/engine/`)

- `time.ts`: `serviceOf(date): ServiceId` → `servicesFor(date): ServiceId[]`.
  Hétvége → `["weekend"]`; iskolai hétköznap → `["weekday","school"]`;
  nem-iskolai hétköznap → `["weekday"]`. `isSchoolDay(date, terms, exceptions)`
  tiszta függvény.
- `plan.ts`: a ~7 `trip.service === service` szűrő → `services.includes(trip.service)`.
  A `PlanRequest.service: ServiceId` → `services: ServiceId[]`.
- Ez a routing-zóna; minden változást előbb bukó teszt fed le
  (`plan.test.ts`, új `time.test.ts` esetek).

### GTFS

`build_gtfs.py`: `calendar.txt` a hétköznap/hétvége service-ekhez marad;
a `"school"` service `calendar_dates.txt`-ben, minden iskolai napra
`exception_type=1`. `FEED_START` → `"20260907"`, `FEED_END` a tanév végéhez
vagy a meglévő logikához igazítva.

## Pipeline-változások szkriptenként

1. **`fetch_timetable.py`**
   - Új tábla-szerkezet: a D-vonalak „megjelölt" (marked) indulásainak
     kezelése a szülővonal oszlopain (már van `events_of` „marked" mező –
     ellenőrizni, hogy a `direction_for` és az `ORDER` ráilleszkedik-e az
     1B-re és az önálló 1D/2D-oszlopokra).
   - `ALIASES` / név-normalizálás: „Szemerja (Gólya utca)", „Str. Kossuth
     Lajos 1/2", „Bis. Reformată Arcuș", „Coșeni"→„Coșeni 2".
   - `ORDER` += `"1B"`.
   - `load_directions` az új/átépített `line-*/` fájlokból olvas.
   - Lefedettségi küszöb (`MIN_TIMEPOINTS`, `MIN_DEPARTURES`) újrahangolása a
     tényleges új értékekhez, de továbbra is „részleges letöltést utasítson
     el" elven.
2. **Kézi geometria** (nincs `fetch_multitrans` / `merge_lines` a változott
   vonalakra, mert a `jarat-*.html` elavult):
   - `line-2/{depart,return}.json`, `line-6/{depart,return}.json`,
     `line-1B/{depart,return}.json`, `line-10/{depart,return}.json` –
     kézzel, a meglévő fájlok formátumában (`stop_sequence`, `name{ro,hu}`,
     `stop_lat/lon`, `distance_to_next_m`).
   - `line-5/depart.json` – tömb forgatása a Dózsa György kezdethez.
   - `line-1D/*.json`, `line-2D/*.json` – „Calea Brașovului 1" beszúrása.
   - `line-*/depart-shape.json` / `return-shape.json` – OSRM a megállókon át
     (`fetch_shapes_osrm.py` mintája), a változott/új vonalakra.
   - `line-*/*-durations.json` – `fetch_durations.py` a változott/új vonalakra.
3. **Override-fájlok** átdolgozása:
   - `timetable_segments.json` – 2, 5, 6 új horgony/indexek; 1B ha kell.
   - `timetable_overrides.json` – `rewriteColumns` a D-vonalakra (1D/2D/5D)
     az új oszlopszerkezet szerint; `ignoreColumns` felülvizsgálat.
   - `turnarounds.json` – 2, 5, 6 új fordulópontok.
   - `route_overrides.json` – változott vonalak `renameCalls`/`removeCalls`.
   - `platform_overrides.json` – új/változott hívások (kézi ellenőrzés után).
4. **`build_map.py`** – `ORDER` += `"1B"`, `DESCRIPTIONS["1B"]`, `DESCRIPTIONS`
   frissítés (5, 10 szöveg). `anchor_vertices` az új shape-ekre.
5. **`build_trips.py`** – `ORDER` += `"1B"`. A `trip_reconstruction`
   monoton-illesztés az új szegmensekkel.
6. **`build_gtfs.py`** – `FEED_START`/`FEED_END`; `calendar_dates.txt` az
   iskolai naphoz; `route_id` „1B" (`routes.txt`).
7. **`build_web_data.py`** – automatikusan átveszi az új feedet;
   `validFrom` = `feed_start_date` = `20260907`; `schoolTerms`/
   `schoolExceptions` beírása a `network.json`-ba.
8. **`gen-maps.mjs`** – az 1B-t automatikusan felveszi (a `network.json`
   `lines` tömbjéből); hash-gate újraszámol.

## Web-változások

- `web/lib/seo/lines.ts` – `HU_STEM` / `huLabel`: „1B" → „1B-s busz"
  (mint a D-vonalak). `LineDirection` kezelés az új mintákra.
- `web/lib/i18n.ts` – `serviceNoticeBefore`/`serviceNoticeAfter` szöveg
  csere (lásd lent); ha kell, iskolai-nap jelölő string a menetrendlapon.
- `web/lib/seo/content.{hu,ro,en}.ts` – a menetrend-útmutató: 1B említése,
  Dózsa György-horgony az 5-ösnél, Kossuth-osztás a 10-esnél, 9-es tanidős
  kerékpárszabály. A `content.test.ts` paritásellenőrzések zöldek maradnak.
- `web/components/**` – `ServiceNotice` marad (nem törlés); a
  `lib/service-notice.ts` logika marad, csak a szöveg és esetleg a lista a
  rekonstruált vonalakról.
- SEO-oldalak: a rekonstruált vonalak (`2, 6, 1B, 10`) lapjain rövid jelölő:
  „Az útvonal ideiglenes rekonstrukció, amíg a Multi-Trans közzé nem teszi a
  hivatalos térképet."

### `ServiceNotice` új szöveg (HU)

> A Multi-Trans szeptember 7-én átalakította a menetrendet. Az indulási
> időket frissítettük. A 2-es, 6-os, 10-es és az új 1B vonal útvonala még
> ideiglenes rekonstrukció – a hivatalos útvonalrajz megjelenésekor
> pontosítjuk. A megállói tábla a mérvadó.

`serviceNoticeState`: a `validFrom >= "20260907"` már elnémítaná a jelenlegi
logika szerint. Ezt módosítjuk: a notice a `network.json` új
`routesProvisional: true` jelzőjétől függ, nem a `validFrom`-tól. A jelző a
hivatalos rajz beépítésekor kerül ki, azzal a commit-tal, ami a
`ServiceNotice`-t is törli.

## Ellenőrzőpontok (felhasználói bemenet kell)

1. **Kovászna megyei téli/tavaszi szünet** pontos dátumai (a
   `schoolTerms` `<tél>`/`<tavasz>` helyőrzőkhöz). Addig alapértelmezés
   `20270213` / `20270223`.
2. **Peronoldalak** a rekonstruált vonalakon (2, 6, 1B, 10, 1D/2D) + a 3 új
   megálló pontos helye – a felhasználó a nyers `line-*/` fájlok és egy
   térképkép alapján visszajelez, mielőtt a `platform_overrides.json`
   véglegesül.
3. **A 2/6/1B/10 rekonstruált megállólistái** – bemutatjuk sorrendben,
   jóváhagyás a `build_trips` futtatása előtt.

## Ellenőrzés

- 14 Python-teszt zöld: `python3 -m unittest discover -v`
- `python3 validate_gtfs.py` – hivatkozási integritás, monoton idők
- Teljes web-tesztsor: `cd web && npm test`
- `cd web && npm run build` – hibamentes statikus export
- Determinizmus: két egymást követő build `diff -rq web/out` – azonos
- Kézi: minden rekonstruált vonal minden tábla-oszlopa vagy megjelenik a
  feedben, vagy dokumentált `ignoreColumns` bejegyzés fedi
- `verify-seo.mjs` zöld (minden lap 1 `<h1>`, térképkép-ellenőrzés)

## Offline működés és adatszerződés

Minden hozzárendelés generáláskor történik; a böngésző csak a statikus
`network.json`-t olvassa. A `schoolTerms`/`schoolExceptions` a bundle része,
így a tervező offline is tudja, iskolai nap-e egy jövőbeli dátum. A PWA
precache-szerződés változatlan; a `stamp-sw.mjs` új `VERSION`-t ír.

## Szállítás

`sept-7-timetable` ág, inkrementális lokális commitok, **push nincs**.
A megvalósítás a `writing-plans` skillel készülő feladatterv szerint.

## Poszt-kivonat (Multi-Trans, 2026-09-07 – az útvonalak forrása)

A Facebook egy múlékony forrás, ezért az útvonal-releváns bekezdéseket itt
rögzítjük szó szerint.

> **Több járat visszatért a Gólya utcába.** [...] az 1-es, 1B, 1D, 2-es, 2D,
> 6-os és 7-es járatok ismét innen indulnak, és ide térnek vissza.

> **Az 5-ös körjárat** a Dózsa György utcából indul, és 28 megálló érintése
> után ugyanoda tér vissza. A régi Szemerjáról a városközponton, a Grigore
> Bălan tábornok sugárúton, a Gyöngyvirág utcán, a vasútállomáson, a
> bevásárlóközponton és a Tejgyáron keresztül éri el a Sepsi Arénát. A Sepsi
> Aréna nem végállomás: az autóbusz innen a Tejgyár, a bevásárlóközpont, a
> vasútállomás, a Gyöngyvirág utca, a Nicolae Iorga sugárút, a Törvényszék, a
> Tervezőintézet, a Domb utca érintésével tér vissza a Dózsa György utcai
> megállóhoz. [...] A Dózsa György utcai megállóból 6:30 és 21:30 között
> minden óra 30 perckor indul tovább.

> **Az 5D nem körjárat:** szintén a Dózsa György utcából indul, majd a
> városközponton, a Grigore Bălan tábornok sugárúton, a Gyöngyvirág utcán és a
> vasútállomáson keresztül halad tovább. A vasúti átjárón túl érinti az
> Autoliv-ot és Szépmezőt.

> **Az 1D, 2D, 4-es és 5D járatok** a vasútállomási megálló után az Építők
> utcáján folytatják útjukat. [Ellentmond a táblának, amely 1D/2D-nél „Calea
> Brașovului 1"-et mutat; a táblát követjük.]

> **Az új 1B járat** a klasszikus 1-es útvonalán közlekedik a vasútállomásig,
> majd az Autoliv és Szépmező felé halad tovább. (→ 1B vége Câmpul Frumosnál,
> az 1D farokszakaszát tükrözve.)

> **Munkanapokon 7:30-kor külön iskolajárat** indul a Csíki negyedből. Az
> áthúzott 6-os jelzéssel közlekedő autóbusz a Csíki negyed – Grigore Bălan
> tábornok sugárút – Gyöngyvirág utca – Állomás negyed útvonalon halad.

> **A 2-es járat** a Gólya utcai végállomásról a Vadász utca – Városközpont –
> Csíki negyed – Állomás negyed útvonalon közlekedik.

> **A 10-es járat** menetrendje két esti indulással bővült: Sepsiszentgyörgyről
> Árkos felé 20:10-kor és 23:15-kor is indul autóbusz. Az Árkosról 7:30-kor
> induló járat iskolaidőben érinti a Váradi József Általános Iskolát.
> Visszafelé a 14:10-es és 15:10-es járatok is megállnak a Szemerja negyedi
> általános iskolánál.

> **Iskolaidőben a 9-es járaton** naponta egy alkalommal, a 16 órás járattal
> lehet kerékpárt szállítani Sugásfürdőre.

Tanévrend (forrás: oktatási minisztérium / Maszol, 2026-09-07): a tanév
2026-09-07 – 2027-06-18, 36 hét. Tanítási időszakok: szept. 7. – okt. 23.;
nov. 2. – dec. 22.; jan. 11. – (feb. 12/19/26, megyei döntés); (feb. 22 /
márc. 1 / márc. 8, megyei döntés) – ápr. 23.; máj. 5. – jún. 18. Vakációk:
okt. 24. – nov. 1.; dec. 23. – jan. 10.; egy hét feb. 15. – márc. 7. között
(megyei döntés); ápr. 24. – máj. 4.; jún. 19-től. Okt. 5. és a törvényes
munkaszüneti napok: nincs tanítás.
