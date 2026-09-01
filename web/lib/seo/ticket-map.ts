import { existsSync } from "node:fs";
import { join } from "node:path";

/** Public path of the baked ticket sales-point overview PNG, or null when it
 *  was not generated (no Mapbox token, a failed request). Built once by
 *  `scripts/gen-maps.mjs`; the `TicketPoints` server component drops the
 *  `<img>` when this returns null, exactly as the line pages do. */
export function ticketMapImage(): string | null {
  return existsSync(join(process.cwd(), "public", "maps", "ticket-points.png"))
    ? "/maps/ticket-points.png"
    : null;
}
