/** The data model the planner works on.
 *
 *  Nothing here imports React or touches the DOM. The engine is a library the
 *  UI calls, which is what makes it testable - the timing bugs we hit in the
 *  prototype were all in code that could not be reached from a test.
 */

/** [longitude, latitude] - GeoJSON order, not the lat/lon of GTFS. */
export type LngLat = [number, number];

/** Minutes since midnight. Can exceed 1440 for trips running past 24:00. */
export type Minute = number;

export type ServiceId = "weekday" | "weekend";

export interface Line {
  id: string;              // "1", "1D", "10"
  name: { ro: string; hu: string };
  /** Exactly as the operator publishes it. #A9FE00 stays #A9FE00. */
  colour: string;
  textColour: string;      // pre-computed for AA contrast on the colour above
  /* Drawing needs two adjustments the operator's palette forces on us: a line
     and its D variant share a colour, and line 10 is pure black. Both are
     resolved per theme, so identity survives and the line stays visible. */
  light: string;
  lightText: string;
  dark: string;
  darkText: string;
}

/** The pair to paint with, for the theme on screen. */
export const shadeOf = (line: Line | undefined, dark: boolean) => ({
  fill: (dark ? line?.dark : line?.light) ?? line?.colour ?? "#555",
  text: (dark ? line?.darkText : line?.lightText) ?? line?.textColour ?? "#fff",
});

/** One kerb. Two stops facing each other across a road are two Stops. */
export interface Stop {
  id: string;
  name: { ro: string; hu: string };
  at: LngLat;
  stationId: string;       // groups the kerbs that share a name
  zone: "city" | "arcus";
  platform?: string;
}

export interface Station {
  id: string;
  name: { ro: string; hu: string };
  at: LngLat;              // centroid of its kerbs
  stopIds: string[];
}

/** A stop sequence a line actually serves, with its shape and relative times.
 *  Many trips share one pattern; storing offsets once keeps the bundle small. */
export interface Pattern {
  id: string;
  lineId: string;
  /** The GTFS shape this came from, so the drawn line can be traced back. */
  shapeId: string;
  headsign: { ro: string; hu: string };
  stopIds: string[];
  /** offsets[i] = minutes from the trip's start to stopIds[i]. */
  offsets: Minute[];
  /** timepoint[i] = the operator published this time; false means interpolated. */
  published: boolean[];
  shape: LngLat[];
  /** shapeIndex[i] = index into `shape` nearest to stopIds[i]. */
  shapeIndex: number[];
}

export interface Trip {
  patternId: string;
  service: ServiceId;
  /** Departure from the pattern's first stop. */
  start: Minute;
}

/** One literal column from the operator's published board at a station.
 *
 * It is intentionally separate from a routed Pattern: a printed board is an
 * authoritative answer to "when does it leave here?", while the route pages
 * are the separate authority for line geometry. */
export interface OfficialBoard {
  stopRo: string;
  lineId: string;
  destination: string;
  weekday: Minute[];
  weekend: Minute[];
}

/** A routed footpath between two stops, from OSRM/Valhalla - storable. */
export interface Walk {
  from: string;
  to: string;
  metres: number;
  seconds: number;
  path: LngLat[];
}

export interface Network {
  version: string;
  generated: string;
  validFrom: string;
  lines: Line[];
  stops: Stop[];
  stations: Station[];
  patterns: Pattern[];
  trips: Trip[];
  walks: Walk[];
  officialBoards?: OfficialBoard[];
}

/* ---- what the planner returns ---- */

export interface RideLeg {
  kind: "ride";
  lineId: string;
  patternId: string;
  fromIndex: number;       // index into the pattern's stopIds
  toIndex: number;
  board: Minute;
  alight: Minute;
}

export interface WalkLeg {
  kind: "walk";
  fromStopId: string | null;   // null = the journey's origin point
  toStopId: string | null;     // null = the journey's destination point
  metres: number;
  minutes: Minute;
  path: LngLat[];
}

/** A pedestrian route found on the walkable network before transit is planned. */
export interface WalkingLeg {
  metres: number;
  minutes: Minute;
  path: LngLat[];
}

/** Exact pedestrian reachability for one origin/destination query.
 *
 * The transit engine intentionally knows nothing about how these routes were
 * obtained.  A browser worker can use the offline OSM graph while a fixture
 * can supply the same contract in a unit test. */
export interface WalkingContext {
  access: ReadonlyMap<string, WalkingLeg>;
  egress: ReadonlyMap<string, WalkingLeg>;
  direct: WalkingLeg | null;
}

export type Leg = RideLeg | WalkLeg;

export interface Journey {
  legs: Leg[];
  depart: Minute;
  arrive: Minute;
  /** Total walking, including access and egress. */
  walkMinutes: Minute;
  transfers: number;
}

/** Two questions, not three. "When must I leave at the latest" is the same
 *  question as "get me there by", and arrive-by already answers it: it ranks
 *  the latest departure that still lands in time first. */
export type PlanMode = "departAt" | "arriveBy";

export interface PlanRequest {
  from: LngLat;
  to: LngLat;
  time: Minute;
  service: ServiceId;
  mode: PlanMode;
  /** 0 = pure speed, 1 = strongly avoid walking. */
  walkAversion: number;
  /** Lines the rider is willing to use. Empty set means all of them. */
  lines?: Set<string>;
}
