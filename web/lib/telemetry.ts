/** Reporting what actually happens on the site.
 *
 *  A user who hits a broken planner rarely writes in - they just close the tab.
 *  These events are the only way an infrastructure failure leaves a trace.
 *
 *  Everything goes through Google Analytics, which only exists once the visitor
 *  has accepted cookies: a declined or unanswered visit reports nothing, by
 *  design. That is the accepted cost of not adding a new endpoint.
 */

type Gtag = (command: "event", name: string, params?: Record<string, unknown>) => void;

export type DiagnosticEvent =
  | "walking_graph_load_failed"
  | "walking_graph_retry"
  | "walking_graph_recovered"
  | "planner_worker_failed"
  | "plan_empty"
  | "app_reset";

export function report(
  event: DiagnosticEvent,
  params?: Record<string, string | number | boolean>,
): void {
  try {
    (globalThis as { gtag?: Gtag }).gtag?.("event", event, params);
  } catch {
    // telemetry must never be the reason something breaks
  }
}
