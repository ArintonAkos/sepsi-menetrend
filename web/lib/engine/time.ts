import type { Minute, ServiceId } from "./types";

/** "07:25" or "25:10" (a trip running past midnight) -> minutes since midnight. */
export function parseHHMM(text: string): Minute {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!m) throw new Error(`not a time: ${text}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutes -> "07:25". Wraps past midnight so 1500 shows as 01:00, not 25:00. */
export function formatHHMM(min: Minute): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/** A teaching weekday: a Mon-Fri inside a term range and not an exception
 *  (Oct 5, a statutory holiday). Terms and exceptions are baked into
 *  network.json by `school_calendar.py`. */
export function isSchoolDay(
  date: Date, terms: [string, string][], exceptions: string[],
): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  const s = ymd(date);
  if (exceptions.includes(s)) return false;
  return terms.some(([a, b]) => a <= s && s <= b);
}

/** Weekend -> "weekend"; a teaching weekday (when `cal` is supplied) ->
 *  "school"; any other weekday -> "weekday". Called without `cal` it keeps the
 *  original two-value behaviour, so SEO SSG (routes.ts) is unaffected.
 *
 *  Multi-Trans publishes two patterns: weekdays, and Saturday+Sunday together.
 *  The school-day service is a superset the app layers on top - see
 *  `build_web_data.py` / `build_gtfs.py`. A statutory holiday (Codul Muncii
 *  art. 139) runs the weekend timetable regardless of the weekday it lands
 *  on - years of local riding experience, not something the operator
 *  publishes; checked before the school day, since a holiday is never a
 *  teaching day either. */
export function serviceForDate(
  date: Date,
  cal?: {
    schoolTerms: [string, string][];
    schoolExceptions: string[];
    publicHolidays?: string[];
  },
): ServiceId {
  const day = date.getDay();
  if (day === 0 || day === 6) return "weekend";
  if (cal?.publicHolidays?.includes(ymd(date))) return "weekend";
  if (cal && isSchoolDay(date, cal.schoolTerms, cal.schoolExceptions)) return "school";
  return "weekday";
}

export function minutesOfDay(date: Date): Minute {
  return date.getHours() * 60 + date.getMinutes();
}

/** Difference in minutes, treating times after midnight as the next day. */
export function forwardDelta(from: Minute, to: Minute): Minute {
  const d = to - from;
  return d < 0 ? d + 1440 : d;
}
