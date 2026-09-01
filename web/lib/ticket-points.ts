/** Where you can buy a paper bus ticket in Sfântu Gheorghe.
 *
 *  The physical sales network the SEO fares copy points at: the three
 *  Multi-Trans kiosks, the ~18 partner shops and newsagents, and the one
 *  vending machine. Data (`public/data/ticket-points.json`) and the Romanian
 *  public-holiday list (`public/data/ro-holidays.json`) are hand-maintained
 *  from multitrans.ro/puncte_de_vanzare_a_biletelor; the owner supplied the
 *  coordinates and confirmed the opening hours.
 *
 *  Pure module: `openStateAt` is evaluated client-side against real time (map
 *  popup, journey hint, "where do I buy a ticket?" finder). The SEO pages only
 *  ever render the schedule text, never a live open/closed badge. */
import type { LngLat } from "./engine/types";
import type { Place } from "./engine/search";
import { metresBetween } from "./walking-router";

export type TicketPointKind = "kiosk" | "shop" | "machine";

/** `["HH:MM", "HH:MM"]`; the end `"24:00"` means midnight / no close. */
export type Interval = [string, string];

/** Opening hours by day type. `[]` is closed; `[["00:00","24:00"]]` is non-stop.
 *  A day can carry more than one interval (a shop that shuts for lunch). */
export interface WeekHours {
  /** Monday–Friday. */
  mf: Interval[];
  sat: Interval[];
  sun: Interval[];
}

export interface TicketPoint {
  id: string;
  kind: TicketPointKind;
  name: { hu: string; ro: string; en: string };
  /** "Multi-Trans", "H-Press", "Jutti", … */
  operator: string;
  /** Street address, as multitrans.ro writes it (addresses do not translate). */
  address: string;
  lat: number;
  lng: number;
  /** "single" = single-trip tickets, "pass" = monthly / reduced passes. */
  sells: Array<"single" | "pass">;
  cash: boolean;
  card: boolean;
  /** Ticket-sale hours. */
  hours: WeekHours;
  /** Kiosks only: the pass-issuance desk keeps different hours from the
   *  ticket window (e.g. Gara CFR issues passes at the weekend, sells tickets
   *  only on weekdays). Omitted when it matches `hours`. */
  passHours?: WeekHours;
}

export interface TicketPointsFile {
  generated: string;
  points: TicketPoint[];
}

export interface RoHolidaysFile {
  note: string;
  /** `YYYY-MM-DD`, local dates. */
  dates: string[];
}

/** Local `YYYY-MM-DD` (not UTC - a holiday is a calendar day where the user is). */
export function localIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isRoHoliday(d: Date, holidays: string[]): boolean {
  return holidays.includes(localIsoDate(d));
}

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** The intervals that apply on `d`: a public holiday follows Sunday hours
 *  (for this network that is almost always "closed"), otherwise the day of
 *  the week decides. */
function intervalsOn(d: Date, hours: WeekHours, holidays: string[]): Interval[] {
  if (isRoHoliday(d, holidays)) return hours.sun;
  const dow = d.getDay();
  if (dow === 0) return hours.sun;
  if (dow === 6) return hours.sat;
  return hours.mf;
}

export interface OpenState {
  open: boolean;
  /** When open and it closes today: the `"HH:MM"` it closes. Absent if non-stop. */
  until?: string;
  /** When closed: the next moment it opens, within the next 7 days. */
  opensAt?: Date;
}

/** Whether `point` is open at `when`, and the next boundary. `hours` defaults to
 *  the ticket window; pass `point.passHours` to ask about the pass desk. */
export function openStateAt(
  point: TicketPoint,
  when: Date,
  holidays: string[],
  hours: WeekHours = point.hours,
): OpenState {
  const now = when.getHours() * 60 + when.getMinutes();
  for (const [from, to] of intervalsOn(when, hours, holidays)) {
    const end = to === "24:00" ? 1440 : minutesOfDay(to);
    if (now >= minutesOfDay(from) && now < end) {
      return { open: true, until: to === "24:00" ? undefined : to };
    }
  }
  for (let ahead = 0; ahead <= 7; ahead++) {
    const day = new Date(when);
    day.setDate(day.getDate() + ahead);
    day.setHours(0, 0, 0, 0);
    for (const [from] of intervalsOn(day, hours, holidays)) {
      if (ahead === 0 && minutesOfDay(from) <= now) continue;
      const opensAt = new Date(day);
      opensAt.setMinutes(minutesOfDay(from));
      return { open: false, opensAt };
    }
  }
  return { open: false };
}

export function isOpenAt(point: TicketPoint, when: Date, holidays: string[]): boolean {
  return openStateAt(point, when, holidays).open;
}

const at = (p: TicketPoint): LngLat => [p.lng, p.lat];

export interface RankedTicketPoint {
  point: TicketPoint;
  /** Straight-line metres from the origin - a prefilter, not a walk distance. */
  metres: number;
  state: OpenState;
}

/** Every point, open ones first, then by straight-line distance. The finder
 *  takes `[0]`; the caller still routes a real walk to whatever it picks. */
export function rankTicketPoints(
  points: TicketPoint[],
  origin: LngLat,
  when: Date,
  holidays: string[],
): RankedTicketPoint[] {
  return points
    .map((point) => ({
      point,
      metres: metresBetween(origin, at(point)),
      state: openStateAt(point, when, holidays),
    }))
    .sort((a, b) =>
      (a.state.open === b.state.open ? 0 : a.state.open ? -1 : 1) || a.metres - b.metres);
}

/** Points within `maxMetres` straight-line of a coordinate (a bus stop, for the
 *  journey-result hint), nearest first. */
export function ticketPointsNear(
  points: TicketPoint[],
  origin: LngLat,
  maxMetres: number,
): TicketPoint[] {
  return points
    .filter((p) => metresBetween(origin, at(p)) <= maxMetres)
    .sort((a, b) => metresBetween(origin, at(a)) - metresBetween(origin, at(b)));
}

/** Ticket points as searchable coordinate places, so the finder can hand one to
 *  the planner as a destination. Mirrors `bikeStationsToPlaces`. */
export function ticketPointsToPlaces(points: TicketPoint[]): Place[] {
  return points.map((p) => ({
    kind: "ticketPoint",
    hu: p.name.hu,
    ro: p.name.ro,
    at: at(p),
    detail: p.address,
    aliases: ["jegy", "jegypénztár", "jegyautomata", "bilet", "casa de bilete", "ticket", p.operator],
  }));
}

const DAY_LABEL: Record<"hu" | "ro" | "en", [string, string, string]> = {
  hu: ["H–P", "Szo", "V"],
  ro: ["L–V", "S", "D"],
  en: ["Mon–Fri", "Sat", "Sun"],
};
const CLOSED: Record<"hu" | "ro" | "en", string> = { hu: "zárva", ro: "închis", en: "closed" };

/** One-line schedule for the SEO list, e.g. "H–P 06:00–22:00 · Szo 07:00–20:00 · V zárva". */
export function formatHours(hours: WeekHours, lang: "hu" | "ro" | "en"): string {
  const [mf, sat, sun] = DAY_LABEL[lang];
  const one = (day: Interval[]) =>
    day.length === 0
      ? CLOSED[lang]
      : day.length === 1 && day[0][0] === "00:00" && day[0][1] === "24:00"
        ? "0–24"
        : day.map(([f, t]) => `${f}–${t === "24:00" ? "24:00" : t}`).join(", ");
  return `${mf} ${one(hours.mf)} · ${sat} ${one(hours.sat)} · ${sun} ${one(hours.sun)}`;
}
