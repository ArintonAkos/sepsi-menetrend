# Sepsi Menetrend — web app

Journey planner for the Sfântu Gheorghe / Sepsiszentgyörgy city bus network,
built on the GTFS feed in the parent directory. Not an official Multi-Trans site.

## Run it

```bash
cp .env.local.example .env.local     # then put your own Mapbox token in it
npm install
npm run dev
```

`.env.local` currently holds a token that belongs to somebody else. It is there
so the map renders locally and **must be replaced before deploying** — see the
warning inside the file.

```bash
npm test          # engine, real feed, and the panel
npm run build     # static export into out/
```

### Testing on a phone

Geolocation needs a secure origin, so plain `http://192.168.1.x:3000` fails
without even showing a permission prompt. Use:

```bash
npm run dev:https
```

That issues a certificate covering localhost, this machine's LAN addresses and
its Bonjour name, then serves over HTTPS. `next dev --experimental-https` on its
own only covers localhost, which the phone rejects.

Prefer the Bonjour name - it survives the router handing out a new address:

```
https://akoss-mac-mini.local:3000
```

Once per phone, trust the local authority so there are no warnings:

1. serve `public/rootCA.pem` (it is copied there by the step above) and open it
2. Settings > Profile Downloaded > Install
3. Settings > General > About > Certificate Trust Settings > switch it on

Delete `public/rootCA.pem` before deploying; it is git-ignored but it does not
belong on a public site.

## How it is put together

```
lib/engine/     pure TypeScript, no React, no DOM - the part worth testing
  types.ts        the data model
  time.ts         parsing, formatting, weekday vs weekend
  search.ts       fuzzy place matching (Damerau-Levenshtein)
  fares.ts        which ticket, and how many
  plan.ts         RAPTOR journey search
lib/geocode.ts  Mapbox forward/reverse, hard-bounded to the network area
components/     the UI; TransitMap is loaded lazily
public/data/    the bundle, generated - never edited by hand
```

The engine is deliberately framework-free. Every timing bug in the earlier
prototype lived in code that no test could reach; here `plan.ts` is exercised
both on a four-stop fixture and on the real feed.

## Regenerating the data

From the repository root:

```bash
python3 build_web_data.py     # gtfs/ + walks.json + osm/ -> web/public/data/
python3 fetch_osm.py          # only when the town's OSM data has moved on
```

`build_web_data.py` collapses 498 trips into 16 patterns, because dozens of
trips walk the same stops in the same order. The whole timetable is 109 kB,
which is why it is inlined into the page rather than fetched: the planner has
everything on first paint and keeps working offline.

## Weight

| | gzip |
|---|---|
| first load (panel + timetable) | ~181 kB |
| map chunk, after hydration | ~480 kB |

Mapbox GL is the heavy part and the panel does not need it, so it arrives after.

## Still to do

- **Own Mapbox token**, restricted to the deployed domain.
- **Re-derive `walks.json` from OSRM or Valhalla.** It currently holds Mapbox
  Directions results, which their terms do not allow us to store and ship.
- Per-line and per-stop pages, statically generated. This is the SEO surface
  and the main reason for Next over a plain SPA; nothing is built yet.
- A service worker, so "add to home screen" gives a genuinely offline app.
  Four separate riders asked a competing app for exactly this.
- **Walking estimates are wrong often enough to change the ranking.** The
  planner scores access and egress on a straight line times 1.35. One measured
  case near Biserica Reformată came back **1052 m routed against ~320 m
  straight — 3.3×**, because the line crosses ground you cannot walk over. The
  journey on screen is now drawn from a real routed path, so the map is honest,
  but the *ordering* still comes from the estimate. Feeding routed distances
  back into the top few candidates is the fix.
- `feed_info.txt` still names multitrans.ro as the publisher.
