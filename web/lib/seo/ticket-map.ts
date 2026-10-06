import { bakedMap } from "./line-maps";

/** Public path of the baked ticket sales-point overview (WebP, or PNG), or null when it
 *  was not generated (no Mapbox token, a failed request). Built once by
 *  `scripts/gen-maps.mjs`; the `TicketPoints` server component drops the
 *  `<img>` when this returns null, exactly as the line pages do. */
export function ticketMapImage(): string | null {
  return bakedMap("ticket-points");
}
