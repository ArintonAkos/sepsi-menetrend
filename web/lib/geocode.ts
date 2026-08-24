/** Address lookup, for the cases the local index cannot answer.
 *
 *  The bbox is a hard filter, not a hint. Biasing is not enough: with only a
 *  centre point, "Stadion utca 41" resolves to Miskolc, 400 km away, because
 *  that address really exists there and matches more strongly than anything
 *  here. Mapbox also carries house numbers OpenStreetMap is missing locally,
 *  which is why it answers addresses and the local index answers places.
 *
 *  Results are shown and thrown away. Mapbox's terms forbid storing them.
 */
import { MAPBOX_TOKEN } from "./mapbox";
import { tokenise, type Place } from "./engine/search";
import type { LngLat } from "./engine/types";
import type { Lang } from "./i18n";

/** Where the planner is willing to answer.
 *
 *  Not a rectangle. One drawn round this network has to stretch 7.2 km west for
 *  Sugásfürdő and 4.5 km north for Arcuș, and 58 percent of what that encloses
 *  is farther than a walk from any bus - so it invites addresses no bus can
 *  reach. Measuring to the nearest stop follows the corridors instead.
 *
 *  `box` is kept because the geocoder only accepts a rectangle. It bounds the
 *  request; `reach` decides what is kept from the answer.
 */
export interface Area {
  box: [number, number, number, number];
  reach: number;             // metres from the nearest stop
  stops: LngLat[];
}

const LAT_SCALE = Math.cos((45.865 * Math.PI) / 180);

export function metresBetween(a: LngLat, b: LngLat) {
  return Math.hypot((a[0] - b[0]) * LAT_SCALE * 111320, (a[1] - b[1]) * 111320);
}

export function insideArea(at: LngLat, area: Area) {
  return area.stops.some((stop) => metresBetween(at, stop) <= area.reach);
}

export interface NamePair { hu: string; ro: string }

/** Swap a Hungarian place name in the query for its Romanian form.
 *
 *  Mapbox knows the villages by their official names only. "Szotyor 73" comes
 *  back as the village and nothing else; "Coșeni 73" comes back as the house.
 *  Street names are fine either way - OSM carries `name:hu` for those - so this
 *  only has to rescue the settlement names, which we already hold in pairs.
 *
 *  Returns null when nothing in the query needed translating.
 */
export function romanianForm(query: string, pairs: NamePair[]): string | null {
  const words = tokenise(query);
  if (!words.length) return null;

  let best: { start: number; length: number; ro: string } | null = null;
  for (const pair of pairs) {
    if (!pair.ro || pair.hu === pair.ro) continue;
    const needle = tokenise(pair.hu);
    if (!needle.length || needle.length > words.length) continue;
    for (let i = 0; i + needle.length <= words.length; i++) {
      if (needle.every((w, k) => w === words[i + k])) {
        if (!best || needle.length > best.length) {
          best = { start: i, length: needle.length, ro: pair.ro };
        }
        break;
      }
    }
  }
  if (!best) return null;
  const swapped = [...words];
  swapped.splice(best.start, best.length, best.ro);
  return swapped.join(" ");
}

const looksLikeAddress = (query: string) => /\d/.test(query);

async function ask(query: string, lang: Lang, area: Area,
                   signal?: AbortSignal): Promise<Place[]> {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.search = new URLSearchParams({
    q: query, bbox: area.box.join(","), limit: "4", language: lang,
    access_token: MAPBOX_TOKEN,
  }).toString();
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return [];
    const body = await response.json();
    return (body.features ?? []).map((f: {
      properties: { name?: string; place_formatted?: string; feature_type?: string };
      geometry: { coordinates: LngLat };
    }): Place => ({
      kind: f.properties.feature_type === "street" ? "street" : "address",
      ro: f.properties.name ?? "", hu: f.properties.name ?? "",
      detail: f.properties.place_formatted ?? "",
      at: f.geometry.coordinates, remote: true,
      approximate: f.properties.feature_type === "street",
    })).filter((p: Place) => p.ro);
  } catch { return []; }
}

export async function forward(query: string, lang: Lang, area: Area,
                              signal?: AbortSignal,
                              pairs: NamePair[] = []): Promise<Place[]> {
  if (!MAPBOX_TOKEN || query.trim().length < 3) return [];
  const translated = lang === "hu" ? romanianForm(query, pairs) : null;
  const queries = translated ? [query, translated] : [query];
  const batches = await Promise.all(queries.map((q) => ask(q, lang, area, signal)));

  // a locality is a poor answer to something that named a house number
  const wanted = looksLikeAddress(query);
  const seen = new Set<string>();
  const merged: Place[] = [];
  for (const place of batches.flat()) {
    const key = `${place.ro}|${place.at.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(place);
  }
  merged.sort((a, b) => Number(rank(b, wanted)) - Number(rank(a, wanted)));
  // the rectangle the geocoder answers on is far wider than the area we serve
  return merged.filter((place) => insideArea(place.at, area));
}

/** House numbers first when the rider typed one. */
const rank = (place: Place, wantedAddress: boolean) =>
  wantedAddress && place.kind === "address" ? 1 : 0;

export interface ReverseResult { name: string; detail: string; approximate: boolean }

export async function reverse([lon, lat]: LngLat, lang: Lang,
                              signal?: AbortSignal): Promise<ReverseResult | null> {
  if (!MAPBOX_TOKEN) return null;
  const url = new URL("https://api.mapbox.com/search/geocode/v6/reverse");
  url.search = new URLSearchParams({
    longitude: String(lon), latitude: String(lat), limit: "1",
    types: "address,street,place", language: lang, access_token: MAPBOX_TOKEN,
  }).toString();
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return null;
    const f = (await response.json()).features?.[0];
    if (!f) return null;
    return {
      name: f.properties.name ?? f.properties.full_address ?? "",
      detail: f.properties.place_formatted ?? "",
      approximate: f.properties.feature_type === "street",
    };
  } catch { return null; }
}

/** Coordinates, for when nothing has a name. Comma decimals, as Hungarian and
 *  Romanian both write them. */
export const formatCoordinates = ([lon, lat]: LngLat) =>
  `${lat.toFixed(5).replace(".", ",")} · ${lon.toFixed(5).replace(".", ",")}`;
