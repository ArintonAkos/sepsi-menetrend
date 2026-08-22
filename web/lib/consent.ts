/** Whether this visitor has agreed to be counted by Google Analytics.
 *
 *  Kept on the device, same as the rest of this app's local state: nothing
 *  here is sent anywhere except the choice itself acting on what's already
 *  been asked for. Analytics never loads at all until this says "granted".
 */
export type Consent = "granted" | "denied";

export const KEY = "sepsi.consent";

export function read(store: Pick<Storage, "getItem"> | null): Consent | null {
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    return raw === "granted" || raw === "denied" ? raw : null;
  } catch {
    return null;               // private browsing, or no storage at all
  }
}

export function write(store: Pick<Storage, "setItem"> | null, value: Consent) {
  try {
    store?.setItem(KEY, value);
  } catch { /* private browsing, quota, or no storage at all */ }
}
