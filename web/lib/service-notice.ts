/** The Sepsi Busz network changes on 2026-09-07 (new routes 1B / 5 / 5D, the
 *  Gólya utca terminus returns, Építők utca, line 10 past the Váradi József
 *  school, reworked departure times). Until the feed catches up, the planner
 *  and the Timetable carry a strip saying so.
 *
 *  Auto-silenced once `network.json`'s `validFrom` reaches the change date -
 *  updating the feed removes the strip on its own. The whole component is meant
 *  to be deleted in the same commit that ships the new feed. */

/** `YYYYMMDD`, matching `network.json`'s `validFrom`. */
export const SERVICE_CHANGE_DATE = "20260907";

/** Local calendar day as `YYYYMMDD` - a change "on Monday" is Monday where the
 *  rider is, not in UTC. */
export function localYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export type ServicePhase = "before" | "after";

export interface ServiceNoticeState {
  phase: ServicePhase;
}

/** Whether to show the strip, and which message.
 *
 *  - hidden once the feed's `validFrom` is the new schedule (or later)
 *  - hidden once dismissed *for the current phase*; a dismissal from "before"
 *    lets the "after" message show once when the date rolls over
 */
export function serviceNoticeState(
  validFrom: string | undefined,
  now: Date,
  dismissedPhase: string | null,
): ServiceNoticeState | null {
  if (!validFrom || validFrom >= SERVICE_CHANGE_DATE) return null;
  const phase: ServicePhase = localYmd(now) >= SERVICE_CHANGE_DATE ? "after" : "before";
  if (dismissedPhase === phase) return null;
  return { phase };
}
