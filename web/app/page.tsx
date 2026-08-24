import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Planner } from "@/components";
import type { FareTable } from "@/lib/engine/fares";
import type { Place } from "@/lib/engine/search";
import type { Network } from "@/lib/engine/types";
import type { BikeSnapshot } from "@/lib/sepsibike";

/** The bundle is read at build time and inlined into the page, so the first
 *  paint already has the whole timetable: no spinner, and it keeps working
 *  offline. It compresses to about 30 kB over the wire. */
async function load<T>(name: string): Promise<T> {
  const raw = await readFile(join(process.cwd(), "public/data", name), "utf8");
  return JSON.parse(raw) as T;
}

export default async function Page() {
  const [network, places, fares, bikeSnapshot] = await Promise.all([
    load<Network>("network.json"),
    load<{ places: Place[]; reach: number;
            bbox: [number, number, number, number] }>("places.json"),
    load<FareTable>("fares.json"),
    load<BikeSnapshot>("sepsibike.json"),
  ]);
  return <Planner network={network} places={places.places}
                  reach={places.reach} box={places.bbox} fares={fares}
                  bikeStations={bikeSnapshot.stations} bikeSnapshotAt={bikeSnapshot.snapshotAt} />;
}
