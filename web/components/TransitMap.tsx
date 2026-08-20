"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl, { type Map as MapboxMap, type LngLatBoundsLike } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN, STYLES, bottomInset, labelAnchor, casingColour, networkColour }
  from "@/lib/mapbox";
import type { Area } from "@/lib/geocode";
import { shadeOf } from "@/lib/engine/types";
import type { Journey, Line, LngLat, Network, Pattern, RideLeg, WalkLeg } from "@/lib/engine/types";
import { stopAt } from "./stopLookup";
import styles from "./TransitMap.module.css";

const CENTRE: LngLat = [25.7876, 45.8636];
/** The same area the search is limited to, with a little room at the edge so a
 *  stop on the boundary can still be centred. Nobody needs to pan to Brașov. */
const limitsFor = (area: Area): LngLatBoundsLike => [
  [area.box[0] - 0.02, area.box[1] - 0.015],
  [area.box[2] + 0.02, area.box[3] + 0.015],
];

const empty = { type: "FeatureCollection" as const, features: [] };
const line = (coordinates: LngLat[], properties: Record<string, unknown>) =>
  ({ type: "Feature" as const, properties, geometry: { type: "LineString" as const, coordinates } });
const point = (coordinates: LngLat, properties: Record<string, unknown>) =>
  ({ type: "Feature" as const, properties, geometry: { type: "Point" as const, coordinates } });

export interface TransitMapProps {
  network: Network;
  area: Area;
  lang: "hu" | "ro";
  /** Bumped whenever something around the map changed its size. */
  resizeKey: number;
  /** Pixels of the map's bottom edge hidden behind the drawer, so a route can
   *  be centred in the part of the map that is on screen. */
  covered: number;
  /** A stop was tapped. The map does not decide what that means - it only says
   *  which stop, and, on a wide screen, hands over an anchored container to
   *  draw into so the board appears at the stop rather than off to one side.
   *  `dismiss` takes the balloon away: the card's own close button empties the
   *  container, and without this the frame stays behind over the stop. */
  onStopPick: (stopId: string, anchor: HTMLElement | null, dismiss: () => void) => void;
  patterns: Map<string, Pattern>;
  lines: Map<string, Line>;
  journey: Journey | null;
  visibleLines: Set<string>;
  dark: boolean;
  picking: boolean;
  onCentreChange?: (at: LngLat) => void;
}

/** Named for what it draws, not for the library. Calling it `Map` shadows the
 *  built-in `Map` type inside this module, which silently breaks every
 *  `Map<string, T>` annotation here. */
/** Whether this browser can give Mapbox a GL context at all.
 *
 *  Without one the constructor throws, and an unhandled throw out of the effect
 *  takes the planner down with it. A timetable is still worth reading on a
 *  machine too old for WebGL, so the map steps aside instead. */
function hasWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function TransitMap({
  network, patterns, lines, journey, visibleLines, dark, picking, lang, area, covered,
  resizeKey, onCentreChange, onStopPick,
}: TransitMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const ready = useRef(false);
  /* Asked once, during the first render: setting this from inside the effect
     would be a state write in an effect, and the answer cannot change while
     the component is mounted anyway. */
  const [canDraw] = useState(hasWebGL);
  const language = useRef(lang);
  useEffect(() => { language.current = lang; }, [lang]);
  const stopPick = useRef(onStopPick);
  useEffect(() => { stopPick.current = onStopPick; }, [onStopPick]);
  const onMove = useRef(onCentreChange);
  // keeping the callback in a ref means the map is built once, not on every
  // parent render - but the assignment belongs in an effect, not in render
  useEffect(() => { onMove.current = onCentreChange; }, [onCentreChange]);

  // one map for the life of the component; style swaps happen in place
  useEffect(() => {
    if (!host.current || map.current || !MAPBOX_TOKEN || !canDraw) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    /* No WebGL, no map. Mapbox throws out of the constructor, and an unhandled
       throw here takes the whole planner down with it - the timetable does not
       need a map to be useful, so this degrades to a note instead. */
    let m: MapboxMap;
    try {
      m = new mapboxgl.Map({
        container: host.current, style: STYLES[dark ? "dark" : "light"],
        center: CENTRE, zoom: 12.4, maxBounds: limitsFor(area), attributionControl: true,
      });
    } catch {
      return;               // the note below is already on screen
    }
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    m.on("load", () => { ready.current = true; addLayers(m, dark, network, lines); paint(m, journey, patterns, lines, dark); });
    m.on("move", () => onMove.current?.(m.getCenter().toArray() as LngLat));
    attachStopPopups(m, () => stopPick.current,
                     () => window.innerWidth > 860);
    map.current = m;
    return () => { m.remove(); map.current = null; ready.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    ready.current = false;
    m.setStyle(STYLES[dark ? "dark" : "light"]);
    m.once("styledata", () => {
      ready.current = true;
      addLayers(m, dark, network, lines);
      paint(m, journey, patterns, lines, dark);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    paint(m, journey, patterns, lines, dark);
    if (journey) fit(m, journey, patterns, picking, covered);
    // `covered` deliberately absent: the drawer settling re-fits through
    // resizeKey, and re-fitting on every dragged pixel would fight the finger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey, patterns, lines, picking, dark]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current || !m.getLayer("net-line")) return;
    /* Every line at once is the right picture of the town and the wrong one of
       a journey: twelve routes crossing the one you are being told to take. So
       once a journey is on screen, the rest of the network steps aside. */
    const shown = journey
      ? ["in", ["get", "line"], ["literal", []]]
      : ["in", ["get", "line"], ["literal", [...visibleLines]]];
    for (const id of ["net-case", "net-line"]) {
      if (m.getLayer(id)) m.setFilter(id, shown as never);
    }
  }, [visibleLines, journey]);

  useEffect(() => { map.current?.resize(); }, [picking, resizeKey]);

  /* Mapbox sizes its canvas once and caches the number. Every layout this app
     has - the drawer, the search screen taking over, a phone turning sideways,
     the keyboard opening - changes the container without telling the map, and
     the canvas is then left drawn at whatever size it was built at. Nudging on
     known state changes only covers the transitions we remembered to list;
     watching the element covers all of them, including the first paint, when
     the container is still being laid out. */
  useEffect(() => {
    const node = host.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => map.current?.resize());
    watch.observe(node);
    return () => watch.disconnect();
  }, []);


  if (!MAPBOX_TOKEN) {
    return (
      <div className={styles.missing}>
        <p><b>Nincs Mapbox token.</b></p>
        <p>Másold a <code>.env.local.example</code> fájlt <code>.env.local</code> néven,
           és írd bele a saját tokenedet.</p>
      </div>
    );
  }
  if (!canDraw) {
    return (
      <div className={styles.missing}>
        <p><b>A térkép nem indul el.</b></p>
        <p>Ez a böngésző nem tud WebGL-t megjeleníteni. Az útvonaltervezés
           enélkül is működik.</p>
      </div>
    );
  }
  return <div ref={host} className={styles.map} />;
}

function addLayers(m: MapboxMap, dark: boolean, network: Network,
                   lines: Map<string, Line>) {
  const before = labelAnchor(m);
  if (!m.getSource("stops")) {
    // which lines call here, so tapping a dot can say something useful
    const serving = new Map<string, Set<string>>();
    for (const p of network.patterns) {
      for (const id of p.stopIds) {
        (serving.get(id) ?? serving.set(id, new Set()).get(id)!).add(p.lineId);
      }
    }
    m.addSource("stops", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: network.stops.map((s) => point(s.at, {
          id: s.id, hu: s.name.hu, ro: s.name.ro,
          lines: [...(serving.get(s.id) ?? [])].join(","),
        })),
      },
    });
  }
  if (!m.getSource("net")) {
    m.addSource("net", {
      type: "geojson", tolerance: 0.05,
      data: {
        type: "FeatureCollection",
        // every line in its own colour, the way the operator's map shows them;
        // a grey underlay makes the network unreadable as a network
        features: network.patterns.map((p) => line(p.shape, {
          line: p.lineId, colour: shadeOf(lines.get(p.lineId), dark).fill,
        })),
      },
    });
  }
  for (const id of ["trip", "nodes", "ends", "door"]) {
    // the default tolerance (0.375) straightens curves the source data has
    if (!m.getSource(id)) m.addSource(id, { type: "geojson", tolerance: 0.05, data: empty });
  }
  const add = (layer: mapboxgl.LayerSpecification) => {
    if (!m.getLayer(layer.id)) m.addLayer(layer, before);
  };
  // a casing keeps two lines sharing a street from merging into one band
  add({ id: "net-case", type: "line", source: "net",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": casingColour(dark), "line-width": 4.6, "line-opacity": 0.55 } });
  add({ id: "net-line", type: "line", source: "net",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "colour"],
      // thin enough at a distance to read as a network, solid when you zoom in
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.4, 14, 2.6, 17, 4],
      "line-opacity": 0.8,
    } });
  add({ id: "trip-case", type: "line", source: "trip", filter: ["==", ["get", "kind"], "ride"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": casingColour(dark), "line-width": 11 } });
  add({ id: "trip-line", type: "line", source: "trip", filter: ["==", ["get", "kind"], "ride"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "colour"], "line-width": 6 } });
  add({ id: "trip-walk", type: "line", source: "trip", filter: ["==", ["get", "kind"], "walk"],
    layout: { "line-cap": "round" },
    paint: { "line-color": dark ? "#E7E6DA" : "#232E10", "line-width": 3.4,
             "line-dasharray": [0.2, 1.9] } });
  /* Visible from just under the opening view rather than just over it. The
     threshold used to be 12.5 against a starting zoom of 12.4, so the map
     opened with no stops on it at all - and a stop you cannot see is one you
     will never think to press. They come in faint and reach full weight as the
     reader zooms into a neighbourhood. */
  add({ id: "all-stops", type: "circle", source: "stops",
    minzoom: 12.2,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12.2, 2.2, 16, 4.5],
      "circle-color": dark ? "#0D1108" : "#FFFFFF",
      "circle-stroke-color": networkColour(dark),
      "circle-stroke-width": 1.6,
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 12.2, .45, 13.5, 1],
      "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 12.2, .45, 13.5, 1],
    } });
  add({ id: "trip-nodes", type: "circle", source: "nodes",
    paint: { "circle-radius": 4.6, "circle-color": dark ? "#0D1108" : "#FFFFFF",
             "circle-stroke-color": ["get", "colour"], "circle-stroke-width": 2.6 } });
  add({ id: "trip-ends", type: "circle", source: "ends",
    paint: { "circle-radius": 7.5, "circle-color": ["get", "colour"],
             "circle-stroke-color": dark ? "#0D1108" : "#FFFFFF", "circle-stroke-width": 3 } });
  /* Where the rider actually starts and finishes. Only the bus stops were
     marked, so both walking lines ran off into blank map and the two places the
     journey is really about - the door you leave and the door you arrive at -
     were the only points on screen with nothing on them. Drawn last, and
     larger, so a stop sharing the spot cannot hide them. */
  addSprites(m, dark);
  add({ id: "trip-door", type: "symbol", source: "door",
    layout: {
      "icon-image": ["get", "icon"], "icon-size": 0.72,
      "icon-anchor": "bottom",          // the point of a pin is its tip
      "icon-allow-overlap": true, "icon-ignore-placement": true,
    } });
}

/** The two ends of a journey, drawn rather than dotted.
 *
 *  A circle at each end says "a point"; a pin and a flag say "you start here"
 *  and "you finish here" without a legend, which is the whole job of a marker.
 *  Built per theme and re-added whenever the style reloads, because a style
 *  change empties the image store.
 */
function sprites(dark: boolean) {
  const ink = dark ? "#EEEDE3" : "#232E10";
  const halo = dark ? "#14180D" : "#FBFAF7";
  const svg = (body: string) =>
    "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 36 36">${body}</svg>`);
  return {
    origin: svg(
      `<path d="M18 33s10-9.6 10-16.5a10 10 0 1 0-20 0C8 23.4 18 33 18 33z"
             fill="${ink}" stroke="${halo}" stroke-width="2.6"/>`
      + `<circle cx="18" cy="16" r="4" fill="${halo}"/>`),
    dest: svg(
      `<path d="M10 33V4" stroke="${halo}" stroke-width="5.6" stroke-linecap="round"/>`
      + `<path d="M10 33V4" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`
      + `<path d="M11.5 5.5h15l-3.4 5.2 3.4 5.2h-15z"
               fill="${ink}" stroke="${halo}" stroke-width="2.2" stroke-linejoin="round"/>`),
  };
}

function addSprites(m: MapboxMap, dark: boolean) {
  for (const [id, url] of Object.entries(sprites(dark))) {
    const image = new Image(72, 72);
    image.onload = () => {
      // the style may have reloaded again while this was decoding
      if (m.hasImage(id)) m.removeImage(id);
      m.addImage(id, image, { pixelRatio: 2 });
    };
    image.src = url;
  }
}

function paint(m: MapboxMap, journey: Journey | null,
               patterns: Map<string, Pattern>, lines: Map<string, Line>, dark: boolean) {
  const trip = m.getSource("trip") as mapboxgl.GeoJSONSource | undefined;
  const nodes = m.getSource("nodes") as mapboxgl.GeoJSONSource | undefined;
  const ends = m.getSource("ends") as mapboxgl.GeoJSONSource | undefined;
  const door = m.getSource("door") as mapboxgl.GeoJSONSource | undefined;
  if (!trip || !nodes || !ends || !door) return;
  if (!journey) {
    for (const s of [trip, nodes, ends, door]) s.setData(empty);
    return;
  }

  type Feature = ReturnType<typeof point> | ReturnType<typeof line>;
  const shapes: Feature[] = [], marks: Feature[] = [], caps: Feature[] = [],
        doors: Feature[] = [];
  for (const leg of journey.legs) {
    if (leg.kind === "ride") {
      const p = patterns.get(leg.patternId);
      if (!p) continue;
      const colour = shadeOf(lines.get(leg.lineId), dark).fill;
      const from = p.shapeIndex[leg.fromIndex], to = p.shapeIndex[leg.toIndex];
      shapes.push(line(p.shape.slice(Math.min(from, to), Math.max(from, to) + 1),
                       { kind: "ride", colour }));
      for (let i = leg.fromIndex + 1; i < leg.toIndex; i++) {
        const stop = p.stopIds[i];
        const at = stopAt(stop);
        if (at) marks.push(point(at, { colour }));
      }
    } else if ((leg as WalkLeg).metres > 0) {
      shapes.push(line((leg as WalkLeg).path, { kind: "walk" }));
    }
  }
  const rides = journey.legs.filter((l): l is RideLeg => l.kind === "ride");
  rides.forEach((ride, i) => {
    const p = patterns.get(ride.patternId);
    if (!p) return;
    const colour = shadeOf(lines.get(ride.lineId), dark).fill;
    const board = stopAt(p.stopIds[ride.fromIndex]);
    const alight = stopAt(p.stopIds[ride.toIndex]);
    if (board) caps.push(point(board, { colour }));
    // the last alighting is the destination; the others are changes
    if (alight) caps.push(point(alight, { colour: i === rides.length - 1 ? "#232E10" : colour }));
  });
  /* The ends of the journey, taken from the walk paths rather than from the
     request: a walk of no distance leaves no path, in which case the boarding
     stop already is the door and is marked as one. */
  const first = journey.legs[0], last = journey.legs[journey.legs.length - 1];
  const startShade = shadeOf(lines.get(rides[0]?.lineId ?? ""), dark).fill;
  if (first?.kind === "walk" && first.metres > 0 && first.path.length)
    doors.push(point(first.path[0], { colour: startShade, icon: "origin" }));
  if (last?.kind === "walk" && last.metres > 0 && last.path.length)
    doors.push(point(last.path[last.path.length - 1], { colour: "#232E10", icon: "dest" }));

  trip.setData({ type: "FeatureCollection", features: shapes });
  nodes.setData({ type: "FeatureCollection", features: marks });
  ends.setData({ type: "FeatureCollection", features: caps });
  door.setData({ type: "FeatureCollection", features: doors });
}

function fit(m: MapboxMap, journey: Journey, patterns: Map<string, Pattern>,
             picking: boolean, covered: number) {
  if (picking) return;
  const pts: LngLat[] = [];
  for (const leg of journey.legs) {
    if (leg.kind === "ride") {
      const p = patterns.get(leg.patternId);
      if (p) pts.push(...p.shape.slice(
        Math.min(p.shapeIndex[leg.fromIndex], p.shapeIndex[leg.toIndex]),
        Math.max(p.shapeIndex[leg.fromIndex], p.shapeIndex[leg.toIndex]) + 1));
    } else pts.push(...(leg as WalkLeg).path);
  }
  if (pts.length < 2) return;
  /* A hidden map is a map with no size, and there is no transform that fits a
     bounding box into nothing - Mapbox reports it as "failed to invert matrix".
     The search screen takes the map off screen entirely while a journey is
     being chosen, which is exactly when the route it should show changes. */
  const box = m.getContainer();
  if (!box.clientWidth || !box.clientHeight) return;
  const bounds = pts.reduce((b, p) => b.extend(p), new mapboxgl.LngLatBounds(pts[0], pts[0]));
  const narrow = window.innerWidth <= 860;
  /* While a journey is open the map runs the full height of the screen with the
     drawer lying over its bottom half, so centring in the map centres the route
     behind the drawer. Padding the covered strip puts it in the middle of what
     is left - the part anyone can see. Capped, because a drawer pulled almost
     to the top leaves no room to fit anything into. */
  m.fitBounds(bounds, {
    padding: narrow
      ? { top: 60, bottom: bottomInset(covered, box.clientHeight), left: 30, right: 30 }
      : { top: 70, bottom: 90, left: 70, right: 70 },
    duration: 600, maxZoom: 15.5,
  });
}

/** Tapping a stop says what it is and which lines call there. The old map had
 *  this and losing it made the dots look like decoration. */
/** Report a tapped stop upwards.
 *
 *  This used to open a Mapbox popup built from an HTML string. A popup is the
 *  wrong container for a timetable - it cannot scroll, cannot hold a day's
 *  worth of times, and every line of it has to be escaped by hand. The map's
 *  job is to say which stop was pressed; what to show is the panel's business.
 */
function attachStopPopups(m: MapboxMap,
                          onPick: () => (id: string, anchor: HTMLElement | null,
                                         dismiss: () => void) => void,
                          wide: () => boolean) {
  let popup: mapboxgl.Popup | null = null;
  for (const layer of ["all-stops", "trip-nodes", "trip-ends"]) {
    m.on("mouseenter", layer, () => { m.getCanvas().style.cursor = "pointer"; });
    m.on("mouseleave", layer, () => { m.getCanvas().style.cursor = ""; });
  }
  m.on("click", (event) => {
    /* A stop is drawn as a circle of two to five pixels. Asking Mapbox what is
       under the exact pixel that was pressed means only a mouse can ever hit
       one; a finger covers about forty. Query a box around the press and take
       the nearest, which is what every map app does and what makes the dots
       usable on a phone at all. */
    const reach = 14;
    const { x, y } = event.point;
    const layers = ["all-stops", "trip-nodes", "trip-ends"].filter((l) => m.getLayer(l));
    if (!layers.length) return;
    const hits = m.queryRenderedFeatures(
      [[x - reach, y - reach], [x + reach, y + reach]], { layers });
    const near = hits
      .filter((f) => f.properties?.id && f.geometry.type === "Point")
      .map((f) => {
        const at = m.project((f.geometry as GeoJSON.Point).coordinates as [number, number]);
        return { f, away: Math.hypot(at.x - x, at.y - y) };
      })
      .sort((a, b) => a.away - b.away)[0];
    popup?.remove();
    popup = null;
    if (!near) return;
    const id = String(near.f.properties!.id);
    if (!wide()) { onPick()(id, null, () => {}); return; }

    /* On a wide screen the board belongs at the stop it describes. Mapbox owns
       the anchoring - it keeps the tip on the point through every pan and zoom,
       and flips the balloon when it would run off an edge - so it gets an empty
       container and React draws into that. Positioning it by hand would mean
       re-deriving the same maths on every frame of a drag. */
    const host = document.createElement("div");
    const at = (near.f.geometry as GeoJSON.Point).coordinates as LngLat;
    const balloon = new mapboxgl.Popup({
      offset: 14, closeButton: false, maxWidth: "360px", className: "stopPopup",
    }).setLngLat(at).setDOMContent(host).addTo(m);
    popup = balloon;

    /* Mapbox picks which way the balloon opens from the space around the point,
       and it measures at the moment it is added - when this one is still an
       empty div, because React fills it a tick later. Measured as nothing, it
       decides upwards always fits, and a tall board then runs off the top of
       the screen. Re-seating it on the same point once it has a size makes
       Mapbox work the anchor out again against the real height. */
    if (typeof ResizeObserver !== "undefined") {
      const watch = new ResizeObserver(() => balloon.setLngLat(at));
      watch.observe(host);
      balloon.on("close", () => watch.disconnect());
    }
    balloon.on("close", () => onPick()("", null, () => {}));
    onPick()(id, host, () => balloon.remove());
  });
}
