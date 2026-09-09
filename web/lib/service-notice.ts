/** Multi-Trans published the 2026-09-07 departure times but not the new route
 *  maps, so the geometry of the re-anchored lines (2, 6, 10) and the new line
 *  1B is a best-effort reconstruction. While that is the case the planner and
 *  the Timetable carry a strip pointing riders at the stop sign for the exact
 *  route.
 *
 *  Driven by `network.json`'s `routesProvisional` flag - the build sets it, and
 *  the commit that ships the operator's official maps clears it and deletes
 *  this component. */

export interface ServiceNoticeState {
  show: boolean;
}

/** Show the strip while the feed's routes are provisional and the rider has
 *  not dismissed it. */
export function serviceNoticeState(
  routesProvisional: boolean | undefined,
  dismissed: boolean,
): ServiceNoticeState {
  return { show: Boolean(routesProvisional) && !dismissed };
}
