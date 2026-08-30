import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Planner } from "@/components";
import HomeFooter from "@/components/seo/HomeFooter";
import type { FareTable } from "@/lib/engine/fares";
import type { Place } from "@/lib/engine/search";
import type { Network } from "@/lib/engine/types";
import type { BikeSnapshot } from "@/lib/sepsibike";

/** `/`'s hreflang. `app/ro/page.tsx` already emits the reciprocal triple via
 *  `pageMetadata`; without this the HU side answered with a bare canonical and
 *  Google ignored the one-way pairing. Paths are relative to `metadataBase`
 *  (`app/layout.tsx`). This only touches the `<head>` of `/`. */
export const metadata: import("next").Metadata = {
  alternates: {
    canonical: "/",
    languages: { hu: "/", ro: "/ro/", "x-default": "/" },
  },
};

/** The bundle is read at build time and inlined into the page, so the first
 *  paint already has the whole timetable: no spinner, and it keeps working
 *  offline. It compresses to about 30 kB over the wire. */
async function load<T>(name: string): Promise<T> {
  const raw = await readFile(join(process.cwd(), "public/data", name), "utf8");
  return JSON.parse(raw) as T;
}

/** Shared by `/` and `/ro/` - same planner and build-time data, only the
 *  homepage footer's language differs (the `<head>` is set per route). */
export async function HomePage({ lang }: { lang: "hu" | "ro" }) {
  const [network, places, fares, bikeSnapshot] = await Promise.all([
    load<Network>("network.json"),
    load<{ places: Place[]; reach: number;
            bbox: [number, number, number, number] }>("places.json"),
    load<FareTable>("fares.json"),
    load<BikeSnapshot>("sepsibike.json"),
  ]);
  return (
    <>
      <Planner network={network} places={places.places}
               reach={places.reach} box={places.bbox} fares={fares}
               bikeStations={bikeSnapshot.stations} bikeSnapshotAt={bikeSnapshot.snapshotAt} />
      <HomeFooter lang={lang} />
    </>
  );
}

export default async function Page() {
  return HomePage({ lang: "hu" });
}
