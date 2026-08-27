/** The one recovery step a non-technical user can be asked to take.
 *
 *  Everything this app stores for offline use is disposable - the timetable is
 *  re-downloaded on the next visit - so when the planner is wedged by a bad
 *  cache entry or a stuck worker, the safe move is to throw all of it away and
 *  load the site fresh. This does what "clear site data" does in DevTools,
 *  behind a single button.
 */
import { report } from "./telemetry";

export async function resetApp(reload: () => void = () => location.reload()): Promise<void> {
  report("app_reset");

  try {
    const store = (globalThis as { caches?: CacheStorage }).caches;
    if (store) {
      const names = await store.keys();
      await Promise.all(names.map((name) => store.delete(name)));
    }
  } catch { /* storage may be unavailable; the unregister below still helps */ }

  try {
    const container = (globalThis as { navigator?: Navigator }).navigator?.serviceWorker;
    if (container) {
      const registrations = await container.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch { /* nothing more we can do; reload anyway */ }

  reload();
}
