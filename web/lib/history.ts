/** Places you have used before.
 *
 *  Kept on the device and nowhere else. This is a list of where somebody goes,
 *  which is about as personal as data gets for a transit app - it never leaves
 *  localStorage, is never sent anywhere, and can be cleared from the settings.
 */
import type { LngLat } from "./engine/types";

export interface Recent {
  name: string;
  at: LngLat;
  used: number;          // epoch millis, newest first
}

export const KEY = "sepsi.recent";
export const LIMIT = 15;

/** Same place, whatever the spelling: names differ between languages, so the
 *  coordinate decides. Five decimals is about a metre. */
const same = (a: Recent, b: { at: LngLat }) =>
  a.at[0].toFixed(5) === b.at[0].toFixed(5) && a.at[1].toFixed(5) === b.at[1].toFixed(5);

export function remember(list: Recent[], place: { name: string; at: LngLat },
                         now = Date.now(), limit = LIMIT): Recent[] {
  if (!place.name.trim()) return list;      // nothing to show, nothing to store
  const without = list.filter((entry) => !same(entry, place));
  return [{ name: place.name, at: place.at, used: now }, ...without].slice(0, limit);
}

export function forget(list: Recent[], place: { at: LngLat }): Recent[] {
  return list.filter((entry) => !same(entry, place));
}

export function read(store: Pick<Storage, "getItem"> | null): Recent[] {
  if (!store) return [];
  try {
    const raw = store.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Recent =>
        // a blank name would render as an empty row with no way to tell what
        // it was; entries written by earlier versions are dropped on sight
        !!entry && typeof entry.name === "string" && entry.name.trim() !== ""
        && Array.isArray(entry.at) && entry.at.length === 2
        && entry.at.every((n: unknown) => typeof n === "number" && Number.isFinite(n)))
      .slice(0, LIMIT);
  } catch {
    return [];               // corrupt or unavailable storage is not an error
  }
}

export function write(store: Pick<Storage, "setItem"> | null, list: Recent[]) {
  try {
    store?.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch { /* private browsing, quota, or no storage at all */ }
}
