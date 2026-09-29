/** Buses run the weekend timetable on statutory holidays (Codul Muncii art.
 *  139), whatever weekday they land on - years of local riding experience,
 *  not something the operator publishes anywhere. The planner carries a
 *  dismissible strip on such a day so riders checking a normal-looking
 *  weekday aren't caught out. Driven by `network.json`'s `publicHolidays`. */

import { ymd } from "./engine/time";

export interface ServiceNoticeState {
  show: boolean;
}

/** Show the strip when the viewed date is a public holiday and the rider has
 *  not already dismissed it for that specific date. */
export function serviceNoticeState(
  date: Date,
  publicHolidays: string[] | undefined,
  dismissedDate: string | null,
): ServiceNoticeState {
  const today = ymd(date);
  return { show: Boolean(publicHolidays?.includes(today)) && dismissedDate !== today };
}
