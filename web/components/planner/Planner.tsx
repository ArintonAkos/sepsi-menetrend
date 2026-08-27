"use client";

import { useCallback, useEffect, useMemo, useRef, useState,
         useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { primeStops } from "../stops/stopLookup";

/* Mapbox GL is by far the heaviest thing here and the panel does not need it.
   Loading it after hydration lets the planner answer before the map arrives -
   and it never runs on the server, where there is no WebGL. */
const TransitMap = dynamic(() => import("../map/TransitMap"), {
  ssr: false,
  loading: () => <div className="mapLoading" />,
});
import PlaceInput, { type Chosen } from "./PlaceInput";
import JourneyList from "../journey/JourneyList";
import JourneyDetail from "../journey/JourneyDetail";
import { prepare, planWithWalking, metresBetween, nextDepartures } from "@/lib/engine/plan";
import { planMultimodal } from "@/lib/engine/multimodal";
import { PlannerWorkerClient, plannerWorkerSupported } from "@/lib/planner-worker";
import { buildIndex } from "@/lib/engine/search";
import { bikeStationsToPlaces, type BikeAvailability,
         type BikeStation } from "@/lib/sepsibike";
import { mergePlannerOptions } from "@/lib/planner-options";
import { formatHHMM, minutesOfDay, serviceForDate } from "@/lib/engine/time";
import { formatCoordinates, insideArea, reverse } from "@/lib/geocode";
import { isStraightLine, resetWalkingRouter, routeOnFoot, routesFrom, walkingContext } from "@/lib/walking";
import { routeByBike, routesByBikeFrom } from "@/lib/bicycle";
import StopBoard from "../stops/StopBoard";
import BikeStationBoard from "../bike/BikeStationBoard";
import Timetable from "../timetable/Timetable";
import { Back, ShareIcon } from "../common/icons";
import InstallApp from "../common/InstallApp";
import { decodeTrip, encodeTrip, shareLink } from "@/lib/share";
import { useDismiss } from "../hooks/useDismiss";
import { useDrawer } from "../hooks/useDrawer";
import { usePullToDismiss } from "../hooks/usePullToDismiss";
import { forget, read, remember, write, type Recent } from "@/lib/history";
import { report } from "@/lib/telemetry";
import { clearCaches, resetApp } from "@/lib/recovery";
import { STRINGS, type Lang } from "@/lib/i18n";
import { readLang, writeLang, LANG_CHANGE_EVENT } from "@/lib/lang";
import type { FareTable } from "@/lib/engine/fares";
import type { Journey, LngLat, Network, PlanMode, RideLeg, ServiceId, WalkingContext, WalkLeg } from "@/lib/engine/types";
import type { Place } from "@/lib/engine/search";
import styles from "./Planner.module.css";

type Theme = "light" | "dark" | "auto";

const scheme = () =>
  typeof window === "undefined" ? null : window.matchMedia("(prefers-color-scheme: dark)");
const subscribeToScheme = (notify: () => void) => {
  const query = scheme();
  query?.addEventListener("change", notify);
  return () => query?.removeEventListener("change", notify);
};
const schemeIsDark = () => scheme()?.matches ?? false;

const widthQuery = () =>
  typeof window === "undefined" ? null : window.matchMedia("(max-width: 860px)");
const subscribeToWidth = (notify: () => void) => {
  const query = widthQuery();
  query?.addEventListener("change", notify);
  return () => query?.removeEventListener("change", notify);
};
const isNarrow = () => widthQuery()?.matches ?? false;

export default function Planner({ network, places, reach, box, fares, bikeStations = [], bikeSnapshotAt = "" }: {
  network: Network; places: Place[]; reach: number;
  box: [number, number, number, number]; fares: FareTable; bikeStations?: BikeStation[];
  bikeSnapshotAt?: string;
}) {
  const ctx = useMemo(() => { primeStops(network); return prepare(network); }, [network]);
  const plannerWorker = useRef<PlannerWorkerClient | null>(null);
  useEffect(() => () => plannerWorker.current?.dispose(), []);
  const allPlaces = useMemo(() => [...places, ...bikeStationsToPlaces(bikeStations)], [places, bikeStations]);
  const index = useMemo(() => buildIndex(allPlaces), [allPlaces]);
  /* Villages are indexed by Mapbox under their Romanian names only, so the
     search needs to know that Szotyor is Coșeni before it asks. */
  const pairs = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of allPlaces) if (p.hu && p.ro && p.hu !== p.ro) seen.set(p.hu, p.ro);
    return [...seen].map(([hu, ro]) => ({ hu, ro }));
  }, [allPlaces]);
  const patterns = useMemo(() => new Map(network.patterns.map((p) => [p.id, p])), [network]);
  const lineMap = useMemo(() => new Map(network.lines.map((l) => [l.id, l])), [network]);
  const stops = useMemo(() => new Map(network.stops.map((s) => [s.id, s])), [network]);
  const area = useMemo(
    () => ({ box, reach, stops: network.stops.map((s) => s.at) }),
    [box, reach, network]);

  /* The static HTML is hydrated before the browser may read any device-only
     preference. Every persisted choice therefore starts from the same value
     on Netlify and in the browser, then is restored in one client effect. */
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [lang, setLangState] = useState<Lang>("hu");
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    writeLang(globalThis.localStorage ?? null, l);
  }, []);

  useEffect(() => {
    const handleLang = () => {
      setLangState(readLang(globalThis.localStorage ?? null));
    };
    window.addEventListener(LANG_CHANGE_EVENT, handleLang);
    return () => window.removeEventListener(LANG_CHANGE_EVENT, handleLang);
  }, []);

  const [theme, setThemeState] = useState<Theme>("auto");
  const setTheme = useCallback((th: Theme) => {
    setThemeState(th);
    try { localStorage.setItem("sepsi.theme", th); } catch {}
  }, []);

  const prefersDark = useSyncExternalStore(subscribeToScheme, schemeIsDark, () => false);
  const t = STRINGS[lang];

  const [from, setFrom] = useState<Chosen | null>(null);
  const [to, setTo] = useState<Chosen | null>(null);
  const [mode, setMode] = useState<PlanMode>("departAt");
  const [date, setDate] = useState(() => new Date());
  const [time, setTime] = useState(() => formatHHMM(minutesOfDay(new Date())));
  const [timeCustomized, setTimeCustomized] = useState(false);
  const [aversion, setAversion] = useState(0.35);
  const [settledAversion, setSettledAversion] = useState(aversion);
  const [draggingAversion, setDraggingAversion] = useState(false);
  /* `useDeferredValue` still delivers every intermediate thumb position. That
     queues costly worker searches behind one another. While a pointer holds
     the slider we only move the UI; the final value is committed on release.
     Keyboard changes get the same small quiet period. */
  useEffect(() => {
    if (draggingAversion) return;
    const timer = window.setTimeout(() => setSettledAversion(aversion), 180);
    return () => window.clearTimeout(timer);
  }, [aversion, draggingAversion]);
  const [visibleLines, setVisibleLines] = useState(() => new Set(network.lines.map((l) => l.id)));
  const [openPanel, setOpenPanel] = useState<"when" | "day" | "lines" | "settings" | null>(null);
  const [bikeAvailability, setBikeAvailability] = useState<BikeAvailability>(() => ({
    stations: bikeStations, source: "snapshot", fetchedAt: bikeSnapshotAt, stale: true,
  }));
  const [showBikeOptions, setShowBikeOptions] = useState(false);
  const [bikeBoard, setBikeBoard] = useState<
    { stationId: string; anchor: HTMLElement | null; dismiss: () => void } | null>(null);
  const [closingBikeBoard, setClosingBikeBoard] = useState(false);

  /* On a phone the panels are sheets pinned to the bottom of the screen, and a
     sheet cannot be a child of the panel it belongs to: any ancestor with a
     transform or a filter becomes the containing block for `position: fixed`,
     and the sheet lands somewhere in the middle of the page instead. Rendering
     it into <body> puts it out of reach of whatever the panel is doing. */
  const narrow = useSyncExternalStore(subscribeToWidth, isNarrow, () => false);
  const mounted = useSyncExternalStore(
    () => () => {}, () => true, () => false);
  const asSheet = (node: React.ReactNode) =>
    narrow && mounted ? createPortal(node, document.body) : node;

  /* Two ways in to the same data the planner already holds: one stop's board,
     and the whole published timetable. Neither is part of planning a journey,
     so neither touches the phase the panel is in. */
  const [board, setBoard] = useState<
    { stopId: string; anchor: HTMLElement | null; dismiss: () => void } | null>(null);
  const [closingBoard, setClosingBoard] = useState(false);
  const boardStop = board?.stopId || null;

  const closeBoard = useCallback(() => {
    if (!board) return;
    if (closingBoard) return;
    setClosingBoard(true);
    setTimeout(() => {
      board.dismiss?.();
      setBoard(null);
      setClosingBoard(false);
    }, 220);
  }, [board, closingBoard]);
  const closeBikeBoard = useCallback(() => {
    if (!bikeBoard || closingBikeBoard) return;
    setClosingBikeBoard(true);
    setTimeout(() => {
      bikeBoard.dismiss?.();
      setBikeBoard(null);
      setClosingBikeBoard(false);
    }, 220);
  }, [bikeBoard, closingBikeBoard]);
  const [timetableState, setTimetableState] = useState<{
    open: boolean;
    lineId: string | null;
    service: ServiceId | null;
    patternId: string | null;
  }>({
    open: false,
    lineId: null,
    service: null,
    patternId: null,
  });

  /* A link someone was sent carries the whole plan - but the query string is
     knowledge only the browser has. This page is prerendered without one, so
     reading it while the first render is still being matched against that HTML
     makes the two trees differ and hydration fails. Applied instead on the
     first render after hydration, as a render-phase update: an effect would
     plan the default journey, paint it, and then visibly replace it. */
  const shared = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        trip: decodeTrip(""),
        timetable: false,
        timetableLine: null as string | null,
        timetableService: null as ServiceId | null,
        timetablePattern: null as string | null,
        stop: null as string | null,
        lang: null as string | null,
      };
    }
    const params = new URLSearchParams(window.location.search);
    const ttParam = params.get("timetable");
    const lineParam = params.get("line");
    const isTimetable = params.has("timetable") || params.has("line");
    const ttLine = lineParam ?? (ttParam && ttParam !== "1" && ttParam !== "true" ? ttParam : null);
    const serviceParam = params.get("service");
    const ttService: ServiceId | null =
      serviceParam === "weekend" ? "weekend" : serviceParam === "weekday" ? "weekday" : null;
    const ttPattern = params.get("dir") ?? params.get("direction") ?? params.get("pattern");

    return {
      trip: decodeTrip(window.location.search),
      timetable: isTimetable,
      timetableLine: ttLine,
      timetableService: ttService,
      timetablePattern: ttPattern,
      stop: params.get("stop"),
      lang: params.get("lang"),
    };
  }, []);

  const [linkRead, setLinkRead] = useState(false);
  const [initJourney, setInitJourney] = useState<number | null>(null);
  if (mounted && !linkRead) {
    setLinkRead(true);
    if (shared.trip.from) setFrom(shared.trip.from);
    if (shared.trip.to) setTo(shared.trip.to);
    if (shared.trip.time) {
      setTime(shared.trip.time);
      setTimeCustomized(true);
    }
    if (shared.trip.mode) {
      setMode(shared.trip.mode);
      setTimeCustomized(true);
    }
    if (shared.trip.journey !== null && shared.trip.journey !== undefined) {
      setInitJourney(shared.trip.journey);
    }
    if (shared.timetable) {
      setTimetableState({
        open: true,
        lineId: shared.timetableLine,
        service: shared.timetableService,
        patternId: shared.timetablePattern,
      });
    }
    if (shared.stop && stops.has(shared.stop)) {
      setBoard({ stopId: shared.stop, anchor: null, dismiss: () => setBoard(null) });
    }
    const initialLang = shared.lang === "hu" || shared.lang === "ro"
      ? shared.lang
      : readLang(globalThis.localStorage ?? null);
    if (initialLang !== "hu") {
      setLangState(initialLang);
    }
  }

  const resetPlanning = useCallback(() => {
    setFrom(null);
    setTo(null);
    setDetail(null);
    setSearching(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("from");
      url.searchParams.delete("to");
      url.searchParams.delete("time");
      url.searchParams.delete("mode");
      url.searchParams.delete("date");
      url.searchParams.delete("j");
      const query = url.searchParams.toString();
      window.history.replaceState(null, "", url.pathname + (query ? `?${query}` : ""));
    } catch {}
  }, []);

  const backFromDetail = useCallback(() => {
    setDetail(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("j");
      const query = url.searchParams.toString();
      window.history.replaceState(null, "", url.pathname + (query ? `?${query}` : ""));
    } catch {}
  }, []);

  const drawer = useDrawer();
  /* Mapbox measures its container once and caches it; a drawer sliding over it
     changes how much map there is to see, and without this the canvas keeps
     the old size and the route sits off-centre. */
  const [mapNudge, setMapNudge] = useState(0);
  useEffect(() => {
    if (drawer.dragging) return;
    const id = setTimeout(() => setMapNudge((n) => n + 1), 240);
    return () => clearTimeout(id);
  }, [drawer.snap, drawer.dragging]);
  const chipsRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLDivElement>(null);
  /* Held in state, not a ref: the portal needs a second render once the node
     exists, and a ref would not cause one. */
  const [hits, setHits] = useState<HTMLDivElement | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [closingPanel, setClosingPanel] = useState<"when" | "day" | "lines" | "settings" | null>(null);
  const closePanel = useCallback(() => {
    if (!openPanel || closingPanel) return;
    const current = openPanel;
    setClosingPanel(current);
    setOpenPanel(null);
    setTimeout(() => {
      setClosingPanel(null);
    }, 220);
  }, [openPanel, closingPanel]);
  const showingPanel = openPanel ?? closingPanel;
  const pullDismiss = usePullToDismiss(closePanel);
  const settingsDrawer = useDrawer(1, closePanel);
  useDismiss(openPanel !== null && openPanel !== "settings", closePanel, chipsRef, popRef);
  useDismiss(openPanel === "settings", closePanel, gearRef, settingsRef);

  const [locating, setLocating] = useState<null | "busy" | string>(null);

  /* Optional, and never in the way. A rival app blocks behind a modal that
     several riders reported failing on them, and one pointed out the obvious:
     planning from home, your own position is the least useful thing to know.
     So this fills in one field and stays quiet when it cannot. */
  /* Which field is being searched. On a phone this turns the panel into a full
     screen with both fields in a header and the results below - the way every
     transit app people already use does it. */
  const [searching, setSearching] = useState<"from" | "to" | null>(null);
  const [closingSearch, setClosingSearch] = useState(false);

  const closeSearching = useCallback(() => {
    if (closingSearch) return;
    if (narrow) {
      setClosingSearch(true);
      setTimeout(() => {
        setSearching(null);
        setClosingSearch(false);
      }, 240);
    } else {
      setSearching(null);
    }
  }, [closingSearch, narrow]);

  /* Where you have been before. On the device only - this is a list of where
     somebody goes, which is about as personal as this app gets. */
  const [recent, setRecent] = useState<Recent[]>([]);
  useEffect(() => {
    setLangState(readLang(globalThis.localStorage ?? null));
    try {
      const savedTheme = localStorage.getItem("sepsi.theme");
      if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "auto") {
        setThemeState(savedTheme);
      }
      setShowBikeOptions(localStorage.getItem("sepsibike-options") === "on");
      setRecent(read(localStorage));
    } catch {}
    setPreferencesReady(true);
  }, []);
  const keep = useCallback((place: { name: string; at: LngLat }) => {
    setRecent((list) => {
      const next = remember(list, place);
      write(globalThis.localStorage ?? null, next);
      return next;
    });
  }, []);
  const drop = useCallback((place: Recent) => {
    setRecent((list) => {
      const next = forget(list, place);
      write(globalThis.localStorage ?? null, next);
      return next;
    });
  }, []);
  /* Picking a place on a phone should leave you on the search screen with the
     other field waiting, not drop you back to the map to tap again. */
  const chooseFrom = useCallback((place: { name: string; at: LngLat }) => {
    setFrom(place); keep(place);
    setSearching(narrow && !to ? "to" : null);
  }, [keep, narrow, to]);
  const chooseTo = useCallback((place: { name: string; at: LngLat }) => {
    setTo(place); keep(place);
    setSearching(narrow && !from ? "from" : null);
  }, [keep, narrow, from]);

  const locate = useCallback((quiet = false) => {
    /* Browsers only offer the permission prompt on a secure origin. Over plain
       http - which is how the dev server looks from a phone on the wifi - the
       call fails as "denied" without ever asking, which reads like a settings
       problem rather than the protocol. Say which it is. */
    const report = (message: string) => setLocating(quiet ? null : message);
    if (!window.isSecureContext) { report(t.locateInsecure); return; }
    if (!navigator.geolocation) { report(t.locateFailed); return; }
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const at: LngLat = [coords.longitude, coords.latitude];
        const km = (m: number) => m >= 1000
          ? `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km` : `${Math.round(m)} m`;

        /* A desktop has no GPS: macOS guesses from nearby wifi, and when that
           fails the browser falls back to the IP address, which can land on the
           provider's exchange. Saying how vague the answer was, or how far off
           it landed, is the difference between a dead end and something the
           reader can judge. */
        if (coords.accuracy > 2000) {
          report(`${t.locateVague} (±${km(coords.accuracy)})`);
          return;
        }
        if (!insideArea(at, area)) {
          const nearest = Math.min(...area.stops.map((stop) => metresBetween(at, stop)));
          report(`${t.locateFar} (${km(nearest)})`);
          return;
        }
        let best: Place | null = null, closest = Infinity;
        for (const place of places) {
          if (place.kind === "street") continue;
          const d = metresBetween(place.at, at);
          if (d < closest) { closest = d; best = place; }
        }
        const name = best && closest <= 120
          ? (lang === "hu" ? best.hu : best.ro)
          : t.hereName;
        chooseFrom({ name, at });
        setLocating(null);
      },
      (error) => report(error.code === error.PERMISSION_DENIED
        ? t.locateDenied : t.locateFailed),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }, [area, places, lang, t, chooseFrom]);

  /* A journey starts where you are far more often than not, so the first field
     fills itself on arrival. Quietly: a refusal should leave an empty box to
     type into, not an error nobody asked for. */
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    locate(true);
  }, [locate]);

  /* Until both ends are known there is nothing to filter and nothing to rank,
     so the entry screen is the two fields and nothing else. */
  const planning = from !== null && to !== null;

  /* A route is not allowed to enter the transit planner until both access and
     egress walks have been measured on OSM paths.  This prevents a visually
     corrected journey from keeping a timetable it could never actually meet. */
  const walkingKey = from && to ? `${from.at.join(",")}>${to.at.join(",")}` : "";
  const [walking, setWalking] = useState<{ key: string; value: WalkingContext } | null>(null);
  /* The pedestrian graph is the one runtime download planning cannot proceed
     without. When it fails - a poisoned cache entry, a blocked request - the
     old code carried on with empty walks and the search returned nothing,
     which read as "no buses run here". Now the failure is shown, with a way
     out of it, and only that path re-downloads the graph. */
  const [walkingError, setWalkingError] = useState(false);
  const [walkingAttempt, setWalkingAttempt] = useState(0);
  const walkingHadFailed = useRef(false);
  useEffect(() => {
    if (!from || !to) return;
    let cancelled = false;
    walkingContext(from.at, to.at, network.stops).then((value) => {
      if (cancelled) return;
      setWalking({ key: walkingKey, value });
      setWalkingError(false);
      if (walkingHadFailed.current) {
        walkingHadFailed.current = false;
        report("walking_graph_recovered");
      }
    }).catch(() => {
      if (cancelled) return;
      walkingHadFailed.current = true;
      setWalkingError(true);
      report("walking_graph_load_failed", { attempt: walkingAttempt });
    });
    return () => { cancelled = true; };
  }, [from, to, network.stops, walkingKey, walkingAttempt]);

  /* A plain re-attempt goes back through the Service Worker, which hands out
     the same broken cache entry that caused the failure - most often a worker
     script iOS terminated mid-download. Clearing the cache first makes the
     re-attempt fetch everything fresh from the network. */
  const retryWalking = useCallback(async () => {
    setWalking(null);
    setWalkingError(false);
    report("walking_graph_retry");
    resetWalkingRouter();
    await clearCaches();
    setWalkingAttempt((n) => n + 1);
  }, []);

  /* The static catalogue works immediately and offline. A successful endpoint
     response replaces only its availability counts; it never blocks planning. */
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/sepsibike", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value: unknown) => {
        if (controller.signal.aborted || !value || typeof value !== "object") return;
        const data = value as Partial<BikeAvailability>;
        if (Array.isArray(data.stations) && (data.source === "live" || data.source === "snapshot")
          && typeof data.fetchedAt === "string" && typeof data.stale === "boolean") {
          setBikeAvailability(data as BikeAvailability);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);


  /* Sharing sends the plan, not a picture of it: the link re-plans on the other
     end, so it still works tomorrow and can be adjusted by whoever opens it. */
  const share = async () => {
    const base = window.location.origin + window.location.pathname;
    let query = "";
    if (timetableState.open) {
      const linePart = timetableState.lineId ? `&line=${encodeURIComponent(timetableState.lineId)}` : "";
      const servicePart = timetableState.service && timetableState.service !== "weekday" ? `&service=${timetableState.service}` : "";
      const dirPart = timetableState.patternId ? `&dir=${encodeURIComponent(timetableState.patternId)}` : "";
      query = `?timetable=1${linePart}${servicePart}${dirPart}`;
    } else if (boardStop) {
      query = `?stop=${encodeURIComponent(boardStop)}`;
    } else if (from || to) {
      query = encodeTrip({
        from: from && { name: from.name, at: from.at },
        to: to && { name: to.name, at: to.at },
        time,
        mode: mode !== "departAt" ? mode : null,
        journey: sharedJourney,
      });
    }
    const link = base + query;
    let what = t.title;
    if (timetableState.open) {
      const lineLabel = timetableState.lineId ? `${timetableState.lineId}-es vonal menetrendje` : t.timetables;
      const dayLabel = timetableState.service === "weekend" ? t.weekendShort : t.weekdayShort;
      what = `${lineLabel} (${dayLabel}) · ${t.title}`;
    } else if (from && to) {
      what = `${from.name} → ${to.name}`;
    } else if (boardStop) {
      const s = stops.get(boardStop);
      what = `${s ? (lang === "hu" ? s.name.hu : s.name.ro) : boardStop} · ${t.title}`;
    }

    const how = await shareLink(link, t.title, what);
    if (how === "shared") return;                    // the sheet said its piece
    setShareNote(how === "copied" ? t.copied : t.shareFailed);
    setTimeout(() => setShareNote(null), 2200);
  };

  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const [pinAt, setPinAt] = useState<LngLat | null>(null);
  const [remote, setRemote] = useState<{ at: string; name: string; detail: string } | null>(null);
  const pinJob = useRef<AbortController | null>(null);

  useEffect(() => {
    const isHere = (name: string) => name === "A helyzetem" || name === "Locația mea";
    if (from && isHere(from.name) && from.name !== t.hereName) {
      setFrom((f) => f ? { ...f, name: t.hereName } : null);
    }
    if (to && isHere(to.name) && to.name !== t.hereName) {
      setTo((top) => top ? { ...top, name: t.hereName } : null);
    }
  }, [t.hereName, from, to]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") delete root.dataset.theme; else root.dataset.theme = theme;
  }, [theme]);
  const dark = theme === "dark" || (theme === "auto" && prefersDark);

  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPicking(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking]);

  const multimodalKey = [from?.at.join(","), to?.at.join(","), time, date.toDateString(), mode,
    settledAversion, [...visibleLines].sort().join(","), showBikeOptions, bikeAvailability.fetchedAt].join("|");
  const [planned, setPlanned] = useState<{ key: string; journeys: Journey[] } | null>(null);
  useEffect(() => {
    if (!from || !to) {
      setPlanned(null);
      return;
    }
    if (walking?.key !== walkingKey) {
      return;
    }
    if (metresBetween(from.at, to.at) < 150) {
      setPlanned({ key: multimodalKey, journeys: [] });
      return;
    }
    let cancelled = false;
    const [hours, minutes] = time.split(":").map(Number);
    const request = { from: from.at, to: to.at, time: hours * 60 + minutes, service: serviceForDate(date),
      mode, walkAversion: settledAversion, lines: visibleLines } as const;
    const controller = new AbortController();
    const result = plannerWorkerSupported()
      ? (plannerWorker.current ??= new PlannerWorkerClient()).plan({
          network, request, walking: walking.value,
          bike: showBikeOptions ? bikeAvailability : undefined,
        })
      : showBikeOptions
        ? planMultimodal(ctx, request, walking.value, { availability: bikeAvailability,
          routes: { walk: routeOnFoot, ride: routeByBike, ridesFrom: routesByBikeFrom },
          walkFrom: routesFrom, signal: controller.signal })
        : Promise.resolve(planWithWalking(ctx, request, walking.value));
    result.then((journeys) => {
      if (cancelled) return;
      setPlanned({ key: multimodalKey, journeys });
      /* The walking graph loaded and the search still found nothing. Usually
         that is a genuine "too far, too late" - but a spike here is the first
         sign of a data problem the error path above never caught. */
      if (!journeys.length) report("plan_empty");
    }).catch((error) => {
      if (cancelled) return;
      setPlanned({ key: multimodalKey, journeys: [] });
      report("planner_worker_failed",
        { message: error instanceof Error ? error.message : "unknown" });
    });
    return () => { cancelled = true; controller.abort(); };
  }, [ctx, network, from, to, time, date, mode, settledAversion, visibleLines, walking, walkingKey,
    multimodalKey, showBikeOptions, bikeAvailability]);
  /* A dedicated worker crosses a runtime boundary, so TypeScript's declared
     protocol is not enough by itself. Never let a malformed response make the
     result renderer call .map() on an undefined value. */
  const journeys = planned?.key === multimodalKey && Array.isArray(planned.journeys)
    ? planned.journeys : [];
  const options = useMemo(() => mergePlannerOptions(journeys, mode), [journeys, mode]);
  /* A result belongs to one exact search request.  Until both the OSM walking
     paths and the subsequent timetable search have caught up, showing either
     the old answer or the whole network looks like an answer, but isn't one. */
  const routeLoading = planning && (walking?.key !== walkingKey || planned?.key !== multimodalKey);
  useEffect(() => {
    if (!preferencesReady) return;
    globalThis.localStorage?.setItem("sepsibike-options", showBikeOptions ? "on" : "off");
  }, [preferencesReady, showBikeOptions]);

  const planKey = [from?.name, to?.name, time, date.toDateString(), mode,
                   settledAversion, [...visibleLines].sort().join(","),
                   showBikeOptions, bikeAvailability.fetchedAt].join("|");
  const [selection, setSelection] = useState({ key: planKey, chosen: 0,
                                               detail: null as number | null });
  if (selection.key !== planKey) {
    const restoredJourney = initJourney !== null && initJourney >= 0 ? initJourney : -1;
    const nextDetail = restoredJourney >= 0 && restoredJourney < options.length ? restoredJourney : null;
    if (initJourney !== null && (options.length > 0 || !planning)) {
      setInitJourney(null);
    }
    setSelection({ key: planKey, chosen: nextDetail ?? 0, detail: nextDetail });
  }
  const { chosen, detail } = selection;
  const setChosen = (i: number) => setSelection((s) => ({ ...s, chosen: i }));
  const setDetail = (i: number | null) => setSelection((s) => ({ ...s, detail: i, chosen: i ?? s.chosen }));
  const sharedJourney = detail;

  useEffect(() => {
    if (!mounted || !linkRead) return;
    const base = window.location.pathname;
    let nextQuery = "";

    if (timetableState.open) {
      const linePart = timetableState.lineId ? `&line=${encodeURIComponent(timetableState.lineId)}` : "";
      const servicePart = timetableState.service && timetableState.service !== "weekday" ? `&service=${timetableState.service}` : "";
      const dirPart = timetableState.patternId ? `&dir=${encodeURIComponent(timetableState.patternId)}` : "";
      nextQuery = `?timetable=1${linePart}${servicePart}${dirPart}`;
    } else if (boardStop) {
      nextQuery = `?stop=${encodeURIComponent(boardStop)}`;
    } else if (from || to) {
      nextQuery = encodeTrip({
        from: from && { name: from.name, at: from.at },
        to: to && { name: to.name, at: to.at },
        time,
        mode: mode !== "departAt" ? mode : null,
        journey: sharedJourney,
      });
    }

    const currentQuery = window.location.search;
    if (currentQuery !== nextQuery) {
      window.history.replaceState(null, "", base + nextQuery);
    }
  }, [from, to, time, mode, sharedJourney, timetableState, boardStop, mounted, linkRead]);

  /* ---- pin picking. The map reports its centre; we name it. ---- */
  const onCentreChange = useCallback((at: LngLat) => { if (picking) setPinAt(at); }, [picking, setPinAt]);

  /* Naming the pinned point is two different jobs. Whether it is outside the
     area, and whether something named sits within 60 m, are facts about the
     coordinate - derived, no request, no effect. Only the address lookup is a
     side effect, and only when the local answer comes up empty. */
  const localLabel = useMemo(() => {
    if (!picking || !pinAt) return null;
    if (!insideArea(pinAt, area))
      return { name: formatCoordinates(pinAt), detail: t.outsideArea };
    let best: Place | null = null, bestDistance = Infinity;
    for (const place of allPlaces) {
      if (place.kind === "street") continue;      // a centroid is no use here
      const d = metresBetween(place.at, pinAt);
      if (d < bestDistance) { bestDistance = d; best = place; }
    }
    if (best && bestDistance <= 60)
      return { name: lang === "ro" ? best.ro : best.hu,
               detail: `${Math.round(bestDistance)} m · ${t.localIndex}` };
    return null;
  }, [picking, pinAt, allPlaces, lang, t, area]);

  /* The answer is tagged with the coordinate it belongs to, so a stale reply
     is simply ignored on the next render instead of being cleared by a
     synchronous setState the moment the pin moves. */
  const pinKey = pinAt ? pinAt.join(",") : "";
  useEffect(() => {
    pinJob.current?.abort();
    if (!picking || !pinAt || localLabel) return;
    const job = new AbortController();
    pinJob.current = job;
    const timer = setTimeout(async () => {
      const hit = await reverse(pinAt, lang, job.signal);
      if (job.signal.aborted) return;
      setRemote(hit && hit.name
        ? { at: pinKey, name: hit.name,
            detail: [hit.detail, hit.approximate ? t.noHouseNumber : null]
              .filter(Boolean).join(" · ") }
        : { at: pinKey, name: formatCoordinates(pinAt), detail: t.noAddress });
    }, 260);
    return () => { clearTimeout(timer); job.abort(); };
  }, [picking, pinAt, pinKey, localLabel, lang, t]);

  const pinLabel = localLabel
    ?? (remote?.at === pinKey ? remote : null)
    ?? { name: pinAt ? t.searching : t.dragMap, detail: "" };

  const confirmPin = () => {
    const at = pinAt ?? [25.7876, 45.8636];
    if (picking) {
      const resolvedName =
        (localLabel?.name || (remote?.at === pinKey && remote.name ? remote.name : null))
        || formatCoordinates(at);
      const chosenPlace = { name: resolvedName, at };
      (picking === "from" ? chooseFrom : chooseTo)(chosenPlace);
    }
    setPicking(null);
  };

  const picked = options[detail ?? chosen] ?? options[0] ?? null;
  const shown = useRoutedWalks(picked?.journey ?? null);
  const bikeBoardStation = bikeBoard
    ? bikeAvailability.stations.find((station) => station.id === bikeBoard.stationId) ?? null : null;

  /* What comes after the bus you are being shown. At a change this is the
     difference between "you have four minutes" and "you have four minutes or
     twenty-four" - the thing a printed timetable tells you and a single
     suggested journey does not. */
  const laterBuses = useCallback((leg: RideLeg) => {
    const pattern = patterns.get(leg.patternId);
    if (!pattern) return [];
    return nextDepartures(ctx, pattern.stopIds[leg.fromIndex], leg.lineId,
                          leg.board, serviceForDate(date), 3)
      .map(formatHHMM);
  }, [ctx, patterns, date]);
  const iso = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const isToday = new Date().toDateString() === date.toDateString();

  if (timetableState.open) {
    /* The whole screen, and nothing else on it. A timetable is a document to
       read, not a control to operate alongside the map. */
    return (
      <Timetable network={network} ctx={ctx} lines={lineMap} stops={stops}
                 lang={lang} t={t}
                 initialLine={timetableState.lineId}
                 initialService={timetableState.service}
                 initialPattern={timetableState.patternId}
                 onChange={(info) => setTimetableState({ open: true, ...info })}
                 onClose={() => setTimetableState((s) => ({ ...s, open: false }))} />
    );
  }

  const stopSheet = boardStop && stops.get(boardStop) ? (
    <StopBoard stop={stops.get(boardStop)!} ctx={ctx} lines={lineMap}
               service={serviceForDate(date)} now={minutesOfDay(new Date())}
               lang={lang} t={t}
               onClose={closeBoard} />
  ) : null;
  const bikeSheet = bikeBoardStation ? (
    <BikeStationBoard station={bikeBoardStation} stale={bikeAvailability.stale}
                      fetchedAt={bikeAvailability.fetchedAt} t={t} onClose={closeBikeBoard} />
  ) : null;

  return (
    <div className={[
      styles.app,
      picking ? styles.picking : "",
      // the phone shows one thing at a time, the way the apps people already
      // use do: a map to orient yourself, a list to read, a map again once you
      // have chosen. Wide screens keep both side by side throughout.
      !planning ? styles.idle : detail === null ? styles.listing : styles.reading,
      searching ? styles.searching : "",
      closingSearch ? styles.closingSearch : "",
    ].filter(Boolean).join(" ")}>
      <aside className={styles.rail}
             style={narrow && detail !== null
               ? { height: `${Math.round(drawer.height)}px`,
                   transition: drawer.dragging ? "none" : "height .22s cubic-bezier(.2,.8,.3,1)" }
               : undefined}>
        {narrow && detail !== null && (
          // the grip is the whole strip, not just the bar - a 4px target is
          // not something a thumb can find
          <div className={styles.grip} {...drawer.handlers} role="separator"
               aria-label={t.journey}><i /></div>
        )}
        <div className={styles.panel}>
          <div className={styles.searchHead}>
            <button onClick={closeSearching} aria-label={t.back}><Back /></button>
            <h2>{t.whereTo}</h2>
          </div>
          {narrow && !searching && (
            <div className={styles.listHead}>
              <button onClick={resetPlanning}
                      aria-label={t.back}><Back /></button>
              <h2>{t.journeys}</h2>
            </div>
          )}
          {/* On a phone nothing has been asked yet, so one bar asks it. Two
              labelled fields are an answer form before there is a question. */}
          <button className={styles.oneBar} onClick={() => setSearching("to")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" strokeLinecap="round" />
            </svg>
            <span>{t.whereTo}</span>
          </button>
          {/* a form, not a div: iOS only offers the keyboard's next/previous
              arrows for controls that share one, and those arrows are how you
              get from "where from" to "where to" without dismissing the
              keyboard. Nothing is submitted - the plan updates as you pick. */}
          <form className={styles.fields} onSubmit={(e) => e.preventDefault()}>
            <PlaceInput label={t.from} value={from} index={index} pairs={pairs}
                        area={area} lang={lang} t={t} locating={locating}
                        active={searching === "from"} keepOpen={narrow} recent={recent}
                        into={narrow ? hits : null}
                        onActivate={(open) => setSearching(open ? "from" : null)}
                        onChoose={chooseFrom} onForget={drop}
                        onPick={() => { setSearching(null); setPicking("from"); }}
                        onLocate={() => locate()} />
            <PlaceInput label={t.to} value={to} index={index} pairs={pairs}
                        area={area} lang={lang} t={t} locating={locating}
                        active={searching === "to"} keepOpen={narrow} recent={recent}
                        into={narrow ? hits : null}
                        onActivate={(open) => setSearching(open ? "to" : null)}
                        onChoose={chooseTo} onForget={drop}
                        onPick={() => { setSearching(null); setPicking("to"); }}
                        onLocate={() => locate()} />
            <button type="button" className={styles.swap} title={t.swap} aria-label={t.swap}
                    onClick={() => { const a = from; setFrom(to); setTo(a); }}>⇅</button>
          </form>
          <div className={styles.hits} ref={setHits} />
        </div>

        {planning && <div className={styles.controls}>
          {/* the panel hangs off the chip row, not the whole block - anchored
              lower it floats away from the button that opened it */}
          <div className={styles.chipRow}>
          <div className={styles.chips} ref={chipsRef}>
            <button className={styles.chip} aria-expanded={openPanel === "when"}
                    onClick={() => { if (openPanel === "when") closePanel(); else setOpenPanel("when"); }}>
              {t[mode]} <small>{time}</small>
            </button>
            <button className={styles.chip} aria-expanded={openPanel === "day"}
                    onClick={() => { if (openPanel === "day") closePanel(); else setOpenPanel("day"); }}>
              {isToday ? `${t.today}, ` : ""}{t.days[date.getDay()]}
            </button>
          </div>

          {showingPanel === "when" && asSheet(<>
            <div className={`${styles.scrim} ${closingPanel ? styles.closingScrim : ""}`}
                 onClick={closePanel} aria-hidden />
            <div className={`${styles.pop} ${styles.popWhen} ${closingPanel ? styles.closingPop : ""}`}
                 ref={popRef}
                 style={pullDismiss.style}
                 {...pullDismiss.handlers}>
              <div className={styles.modes}>
                {(["departAt", "arriveBy"] as PlanMode[]).map((m) => (
                  <button key={m} aria-pressed={mode === m} onClick={() => { setMode(m); setTimeCustomized(true); }}>
                    {t[`${m}Long` as const]}
                  </button>
                ))}
              </div>
              <label className={styles.popTime}>
                <span>{mode === "departAt" ? t.departAt : t.arriveBy}</span>
                <input type="time" value={time} step={300}
                       onChange={(e) => { setTime(e.target.value); setTimeCustomized(true); }} />
              </label>
              <button className={styles.sheetDone} onClick={closePanel}>{t.done}</button>
            </div>
          </>)}
          {showingPanel === "day" && asSheet(<>
            <div className={`${styles.scrim} ${closingPanel ? styles.closingScrim : ""}`}
                 onClick={closePanel} aria-hidden />
            <div className={`${styles.pop} ${styles.popDay} ${closingPanel ? styles.closingPop : ""}`}
                 ref={popRef}
                 style={pullDismiss.style}
                 {...pullDismiss.handlers}>
              <label className={styles.popTime}>
                <span>{t.today}</span>
                <input type="date" value={iso} onChange={(e) => {
                  const [y, m, d] = e.target.value.split("-").map(Number);
                  setDate(new Date(y, m - 1, d));
                  closePanel();
                }} />
              </label>
              <p className={styles.popNote}>
                {serviceForDate(date) === "weekend" ? "hétvégi menetrend" : "munkanapi menetrend"}
              </p>
            </div>
          </>)}

          </div>

          <div className={styles.pref}>
            <div className={styles.prefRow}><span>{t.faster}</span><span>{t.lessWalking}</span></div>
            <input type="range" min={0} max={100} value={Math.round(aversion * 100)}
                   aria-label={`${t.faster} / ${t.lessWalking}`}
                   onPointerDown={() => setDraggingAversion(true)}
                   onPointerUp={() => setDraggingAversion(false)}
                   onPointerCancel={() => setDraggingAversion(false)}
                   onBlur={() => setDraggingAversion(false)}
                   onChange={(e) => setAversion(Number(e.target.value) / 100)} />
          </div>
        </div>}

        {planning && <div className={styles.scroll}>
          {detail === null ? (
            walkingError ? (
              <div className={styles.dataError} role="alert">
                <p className={styles.dataErrorTitle}>{t.dataError}</p>
                <p className={styles.dataErrorHint}>{t.dataErrorHint}</p>
                <div className={styles.dataErrorActions}>
                  <button className={styles.dataErrorRetry} onClick={retryWalking}>{t.retry}</button>
                  <button className={styles.dataErrorReset} onClick={() => resetApp()}>{t.resetApp}</button>
                </div>
              </div>
            ) : routeLoading ? (
              <div className={styles.planning} role="status" aria-live="polite">
                <i aria-hidden />
                <span>{t.planning}</span>
              </div>
            ) : (
              <JourneyList options={options} lines={lineMap} t={t} chosen={chosen}
                           fares={fares} date={date} stops={stops} patterns={patterns} dark={dark}
                           onHover={setChosen} onOpen={setDetail} />
            )
          ) : (
            picked ? (
              <JourneyDetail journey={picked.journey} lines={lineMap} patterns={patterns}
                             stops={stops} fares={fares} date={date} lang={lang} t={t} dark={dark}
                             from={from?.name ?? ""} to={to?.name ?? ""}
                             laterBuses={laterBuses} bikeStations={bikeAvailability.stations}
                             onBack={backFromDetail} />
            ) : null
          )}
        </div>}

      </aside>

      {stopSheet && (board!.anchor
        ? createPortal(stopSheet, board!.anchor)
        : asSheet(
            <>
              <div className={`${styles.scrim} ${closingBoard ? styles.closingScrim : ""}`}
                   onClick={closeBoard} aria-hidden />
              <div className={`${styles.boardHolder} ${closingBoard ? styles.closingBoard : ""}`}>
                {stopSheet}
              </div>
            </>,
          ))}

      {bikeSheet && (bikeBoard!.anchor
        ? createPortal(bikeSheet, bikeBoard!.anchor)
        : asSheet(
            <>
              <div className={`${styles.scrim} ${closingBikeBoard ? styles.closingScrim : ""}`}
                   onClick={closeBikeBoard} aria-hidden />
              <div className={`${styles.boardHolder} ${closingBikeBoard ? styles.closingBoard : ""}`}>
                {bikeSheet}
              </div>
            </>,
          ))}

      <main className={styles.map}>
        {/* The lazy map chunk can be ready before the first client render even
            though it was absent from the static HTML.  Keep the same loading
            shell through hydration, then mount the map in the next render. */}
        {mounted ? <TransitMap network={network} patterns={patterns} lines={lineMap} lang={lang}
                               area={area} resizeKey={mapNudge}
                               covered={narrow && detail !== null ? drawer.height : 0}
                               onStopPick={(stopId, anchor, dismiss) =>
                                 setBoard(stopId ? { stopId, anchor, dismiss } : null)}
                               bikeStations={bikeAvailability.stations}
                               onBikeStationPick={(stationId, anchor, dismiss) =>
                                 setBikeBoard(stationId ? { stationId, anchor, dismiss } : null)}
                               journey={shown} visibleLines={visibleLines} dark={dark}
                               routeLoading={routeLoading}
                               picking={picking !== null} onCentreChange={onCentreChange} />
                 : <div className="mapLoading" />}

        {picking && (
          <>
            <div className={styles.crosshair} aria-hidden>
              <svg viewBox="0 0 40 52">
                <path d="M20 50c0-8 12-16 12-28a12 12 0 1 0-24 0c0 12 12 20 12 28z" />
                <circle cx="20" cy="21" r="4.6" />
              </svg>
              <i />
            </div>
            <div className={styles.pinbar}>
              <div className={styles.pinText}>
                <div className={styles.pinFor}>{picking === "from" ? t.from : t.to}</div>
                <div className={styles.pinName}>{pinLabel.name}</div>
                <div className={styles.pinDetail}>{pinLabel.detail}</div>
              </div>
              <button className={styles.pinCancel} onClick={() => setPicking(null)}>{t.cancel}</button>
              <button className={styles.pinOk} onClick={confirmPin}>{t.done}</button>
            </div>
          </>
        )}

        {/* Over the map rather than in the drawer, the way every map app puts
            it - and the drawer keeps its own, because the sheet can be pulled
            up over this one. */}
        {(detail !== null || (!narrow && planning)) && (
          <div className={styles.topLeft}>
            <button className={styles.round} aria-label={t.back}
                    onClick={() => {
                      if (detail !== null) backFromDetail();
                      else resetPlanning();
                    }}><Back /></button>
          </div>
        )}

        <div className={styles.topRight} ref={gearRef}>
          <button className={styles.round} aria-label={t.timetables}
                  onClick={() => setTimetableState((s) => ({
                    ...s,
                    open: true,
                    lineId: s.lineId ?? network.lines[0]?.id ?? null,
                  }))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                 strokeLinecap="round">
              <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
              <path d="M3.5 9.5h17M8 3v3M16 3v3M8 13h3M8 17h3M14 13h2M14 17h2" />
            </svg>
          </button>
          <InstallApp t={t} />
          {planning && (
            <button className={styles.round} aria-label={t.share} onClick={share}>
              <ShareIcon />
            </button>
          )}
          {shareNote && <p className={styles.note} role="status">{shareNote}</p>}
          <button className={styles.gear} aria-label={t.settings}
                  aria-expanded={openPanel === "settings"}
                  onClick={() => { if (openPanel === "settings") closePanel(); else setOpenPanel("settings"); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}>
              <circle cx="12" cy="12" r="3.1" />
              <path d="M19.5 12a8 8 0 0 0-.15-1.5l2-1.5-2-3.5-2.4 1a8 8 0 0 0-2.6-1.5L14 2h-4l-.35 3a8 8 0 0 0-2.6 1.5l-2.4-1-2 3.5 2 1.5A8 8 0 0 0 4.5 12a8 8 0 0 0 .15 1.5l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 2.6 1.5l.35 3h4l.35-3a8 8 0 0 0 2.6-1.5l2.4 1 2-3.5-2-1.5A8 8 0 0 0 19.5 12z" />
            </svg>
          </button>
          {showingPanel === "settings" && asSheet(<>
            <div className={`${styles.scrim} ${closingPanel ? styles.closingScrim : ""}`}
                 onClick={closePanel} aria-hidden />
            <div className={`${styles.settings} ${closingPanel ? styles.closingPop : ""}`}
                 ref={settingsRef}
                 style={narrow ? {
                   height: `${Math.round(settingsDrawer.height)}px`,
                   transition: settingsDrawer.dragging ? "none" : "height .22s cubic-bezier(.2,.8,.3,1)",
                 } : undefined}>
              {narrow && (
                <div className={styles.grip} {...settingsDrawer.handlers} role="separator" aria-label={t.settings}>
                  <i />
                </div>
              )}
              <div className={styles.setScroll}>
                <div className={styles.setRow}>
                  <span>{t.language}</span>
                  <div className={styles.seg}>
                    <button aria-pressed={lang === "hu"} onClick={() => setLang("hu")}>Magyar</button>
                    <button aria-pressed={lang === "ro"} onClick={() => setLang("ro")}>Română</button>
                    <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
                  </div>
                </div>
                <div className={styles.setRow}>
                  <span>{t.theme}</span>
                  <div className={styles.seg}>
                    {(["light", "dark", "auto"] as Theme[]).map((th) => (
                      <button key={th} aria-pressed={theme === th}
                              onClick={() => setTheme(th)}>{t[th]}</button>
                    ))}
                  </div>
                </div>
                <div className={styles.setRow}>
                  <span id="bike-options-label">{t.bikeOptions}</span>
                  <div className={styles.seg} role="group" aria-labelledby="bike-options-label">
                    <button aria-pressed={!showBikeOptions}
                            onClick={() => setShowBikeOptions(false)}>{t.bikeOptionsOff}</button>
                    <button aria-pressed={showBikeOptions}
                            onClick={() => setShowBikeOptions(true)}>{t.bikeOptionsOn}</button>
                  </div>
                </div>
                {recent.length > 0 && (
                  <div className={styles.setRow}>
                    <span>{t.recent}</span>
                    <button className={styles.clear} onClick={() => {
                      setRecent([]);
                      write(globalThis.localStorage ?? null, []);
                    }}>{t.clearHistory}</button>
                    <p className={styles.setNote}>{t.historyNote}</p>
                  </div>
                )}
                <div className={styles.setRow}>
                  <span>{t.lines}</span>
                  <div className={styles.lineGrid}>
                    {network.lines.map((l) => (
                      <button key={l.id} aria-pressed={visibleLines.has(l.id)}
                              className={styles.lineToggle}
                              onClick={() => setVisibleLines((prev) => {
                                const next = new Set(prev);
                                if (next.has(l.id)) next.delete(l.id); else next.add(l.id);
                                return next;
                              })}>
                        <span className={styles.linePill}
                              style={{ background: dark ? l.dark : l.light,
                                       color: dark ? l.darkText : l.lightText }}>{l.id}</span>
                      </button>
                    ))}
                  </div>
                  <div className={styles.popActions}>
                    <button onClick={() => setVisibleLines(new Set(network.lines.map((l) => l.id)))}>
                      {t.allLines}</button>
                    <button onClick={() => setVisibleLines(new Set())}>{t.noLines}</button>
                  </div>
                </div>
                <div className={styles.setRow}>
                  <span>{t.source}</span>
                  <p className={styles.setNote}>{t.disclaimer}</p>
                  <div className={styles.legalLinks}>
                    <a href="/terms/" target="_blank" rel="noopener noreferrer">{t.terms}</a>
                    <span>·</span>
                    <a href="/privacy/" target="_blank" rel="noopener noreferrer">{t.privacy}</a>
                  </div>
                  <button className={styles.cookieReset} onClick={() => {
                    try { localStorage.removeItem("sepsi.consent"); } catch {}
                    window.dispatchEvent(new Event("sepsi:consent"));
                    closePanel();
                  }}>
                    {t.cookieSettings}
                  </button>
                </div>
                <div className={styles.setRow}>
                  <span>{t.troubleshoot}</span>
                  <p className={styles.setNote}>{t.troubleshootNote}</p>
                  <button className={styles.cookieReset} onClick={() => resetApp()}>
                    {t.resetApp}
                  </button>
                </div>
                <button className={styles.sheetDone} onClick={closePanel}>{t.done}</button>
              </div>
            </div>
          </>)}
        </div>
      </main>
    </div>
  );
}

/** Replace the planner's straight-line access and egress walks with routed
 *  ones, for the journey currently on screen. Only that journey, and only the
 *  legs that still hold a two-point line. */
function useRoutedWalks(journey: Journey | null): Journey | null {
  const [routed, setRouted] = useState<{ key: string; journey: Journey } | null>(null);

  const key = journey
    ? journey.legs.map((l) => l.kind === "ride"
        ? `${l.patternId}:${l.board}`
        : `w${(l as WalkLeg).path.map((p) => p.join()).join("|")}`).join("/")
    : "";

  useEffect(() => {
    if (!journey) return;
    const straight = journey.legs
      .map((leg, i) => ({ leg, i }))
      .filter(({ leg }) => leg.kind === "walk" && isStraightLine((leg as WalkLeg).path)
                           && (leg as WalkLeg).path.length === 2);
    if (!straight.length) return;

    const stop = new AbortController();
    /* Long enough that running the pointer down the list costs nothing.
       Hovering a card highlights it, and the highlighted journey is the one
       drawn - so a 200ms wait meant sweeping past eight results fired up to
       sixteen routing requests nobody asked for. Half a second only elapses
       once the reader has actually stopped on something. */
    const timer = setTimeout(async () => {
      const found = await Promise.all(straight.map(({ leg }) => {
        const walk = leg as WalkLeg;
        return routeOnFoot(walk.path[0], walk.path[1], stop.signal);
      }));
      if (stop.signal.aborted || found.every((f) => f === null)) return;
      const legs = [...journey.legs];
      straight.forEach(({ i }, k) => {
        const path = found[k];
        if (!path) return;
        const walk = legs[i] as WalkLeg;
        legs[i] = { ...walk, path: path.path, metres: path.metres, minutes: path.minutes };
      });
      setRouted({ key, journey: { ...journey, legs } });
    }, 550);
    return () => { clearTimeout(timer); stop.abort(); };
  }, [journey, key]);

  return routed?.key === key ? routed.journey : journey;
}
