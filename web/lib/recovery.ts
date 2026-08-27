/** Recovering from a wedged Progressive Web App.
 *
 *  Everything this app stores for offline use is disposable - the timetable is
 *  re-downloaded on the next visit - so when the planner is stuck on a bad
 *  cache entry (a worker script iOS killed mid-download, a truncated data
 *  file), the safe move is to throw the cache away and fetch it again.
 *
 *  Two levels: `clearCaches` for a stuck search the page can retry in place,
 *  and `resetApp` - the one button a non-technical user can be asked to press -
 *  which also unregisters the worker and reloads.
 */
import { report } from "./telemetry";

/** Drop every Cache Storage entry for this origin. The Service Worker refills
 *  it from the network on the next request, so a poisoned entry is gone. */
export async function clearCaches(): Promise<void> {
  try {
    const store = (globalThis as { caches?: CacheStorage }).caches;
    if (!store) return;
    const names = await store.keys();
    await Promise.all(names.map((name) => store.delete(name)));
  } catch { /* storage may be unavailable; nothing else to try */ }
}

export async function resetApp(reload: () => void = () => location.reload()): Promise<void> {
  report("app_reset");

  await clearCaches();

  try {
    const container = (globalThis as { navigator?: Navigator }).navigator?.serviceWorker;
    if (container) {
      const registrations = await container.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch { /* nothing more we can do; reload anyway */ }

  reload();
}
