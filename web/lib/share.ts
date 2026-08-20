/** Putting a plan in a link.
 *
 *  A journey is worth sending to someone - "meet me, here is the bus" - and a
 *  screenshot of one cannot be re-planned for a different hour. The whole plan
 *  is four values, so it fits in a query string and needs no server.
 *
 *  Names travel alongside the coordinates. They are what the recipient reads,
 *  and re-deriving them would mean a geocoder round trip before the page could
 *  show anything. The coordinates are what the planner actually uses, so a
 *  tampered or stale name costs nothing but a wrong label.
 */
import type { LngLat, PlanMode } from "./engine/types";

export interface Endpoint { name: string; at: LngLat }

export interface Trip {
  from: Endpoint | null;
  to: Endpoint | null;
  time: string | null;
  mode: PlanMode | null;
}

/** Six decimals is about 10 cm - past the point where a bus stop moves. */
const place = (p: Endpoint) =>
  `${p.at[0].toFixed(6)},${p.at[1].toFixed(6)},${p.name}`;

function readPlace(raw: string | null): Endpoint | null {
  if (!raw) return null;
  const [lng, lat, ...rest] = raw.split(",");
  // Number("") is 0, not NaN, so an empty field would land the plan in the
  // Gulf of Guinea rather than being rejected
  if (!lng?.trim() || !lat?.trim()) return null;
  const at: LngLat = [Number(lng), Number(lat)];
  if (!Number.isFinite(at[0]) || !Number.isFinite(at[1])) return null;
  // a name is a nicety; a link with only coordinates still plans
  return { name: rest.join(",").trim() || `${at[1].toFixed(4)}, ${at[0].toFixed(4)}`, at };
}

export function encodeTrip(trip: Trip): string {
  const params = new URLSearchParams();
  if (trip.from) params.set("from", place(trip.from));
  if (trip.to) params.set("to", place(trip.to));
  if (trip.time) params.set("at", trip.time);
  if (trip.mode && trip.mode !== "departAt") params.set("mode", trip.mode);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** A clock time, not merely something with a colon in it: "25:99" matches the
 *  shape and would set the planner to a moment that does not exist. */
function readTime(raw: string | null): string | null {
  const parts = /^(\d{1,2}):(\d{2})$/.exec(raw ?? "");
  if (!parts) return null;
  const hours = Number(parts[1]), minutes = Number(parts[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${parts[2]}`;
}

export function decodeTrip(search: string): Trip {
  const params = new URLSearchParams(search);
  const at = params.get("at");
  const mode = params.get("mode");
  return {
    from: readPlace(params.get("from")),
    to: readPlace(params.get("to")),
    time: readTime(at),
    mode: mode === "arriveBy" ? "arriveBy" : mode === "departAt" ? "departAt" : null,
  };
}

/** Hand the link to whatever the device offers.
 *
 *  Returns what happened, so the button can say so: the share sheet reports
 *  nothing back, and a silent copy looks like a dead button.
 */
export async function shareLink(url: string, title: string, text: string):
    Promise<"shared" | "copied" | "failed"> {
  const nav = typeof navigator === "undefined" ? null : navigator;
  if (nav?.share) {
    try {
      await nav.share({ title, text, url });
      return "shared";
    } catch (error) {
      // cancelling the sheet is not a failure, and must not fall through to a
      // copy the reader did not ask for
      if (error instanceof DOMException && error.name === "AbortError") return "shared";
    }
  }
  // awaiting an absent clipboard awaits undefined, which "succeeds" - so ask
  // whether it is there rather than whether it threw
  if (!nav?.clipboard?.writeText) return "failed";
  try {
    await nav.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
