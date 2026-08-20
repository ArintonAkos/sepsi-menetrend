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

/** Multi-Trans publishes two patterns: weekdays, and Saturday+Sunday together. */
export function serviceForDate(date: Date): ServiceId {
  const d = date.getDay();
  return d === 0 || d === 6 ? "weekend" : "weekday";
}

export function minutesOfDay(date: Date): Minute {
  return date.getHours() * 60 + date.getMinutes();
}

/** Difference in minutes, treating times after midnight as the next day. */
export function forwardDelta(from: Minute, to: Minute): Minute {
  const d = to - from;
  return d < 0 ? d + 1440 : d;
}
