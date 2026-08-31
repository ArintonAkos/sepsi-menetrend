import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Planner } from "@/components";
import HomeFooter from "@/components/seo/HomeFooter";
import type { FareTable } from "@/lib/engine/fares";
import type { Place } from "@/lib/engine/search";
import type { Network } from "@/lib/engine/types";
import type { SeoLang } from "@/lib/seo/lang";
import type { BikeSnapshot } from "@/lib/sepsibike";

/** `/`'s `<head>`. The hreflang is reciprocal - `app/ro/page.tsx` and
 *  `app/en/page.tsx` emit the matching set via `pageMetadata`; without this the
 *  HU side answered with a bare canonical and Google ignored the one-way
 *  pairing. Paths are relative to `metadataBase` (`app/layout.tsx`).
 *
 *  `title.absolute` overrides the layout's bare "Sepsi Menetrend" (15 chars, no
 *  keyword) - the RO/EN twins already carry a descriptive title, this brings
 *  the HU homepage in line. `absolute` bypasses the layout's `%s ·` template. */
export const metadata: import("next").Metadata = {
  title: { absolute: "Sepsiszentgyörgyi buszmenetrend és járattervező" },
  alternates: {
    canonical: "/",
    languages: { hu: "/", ro: "/ro/", en: "/en/", "x-default": "/" },
  },
};

/** The homepage's `<h1>`. The planner fills the screen and carries no heading
 *  of its own, so this is rendered off-screen (`.srOnly`): it gives `/`, `/ro/`
 *  and `/en/` a real title in the document outline - and for crawlers that
 *  don't run the planner's client JS - without adding anything on screen.
 *  Server-rendered here, so each language's static HTML already has the right
 *  text (the planner's own UI strings only localise after hydration). */
const HOME_H1: Record<SeoLang, string> = {
  hu: "Sepsiszentgyörgyi buszmenetrend és járattervező",
  ro: "Orar autobuz și planificator de rute în Sfântu Gheorghe",
  en: "Sfântu Gheorghe bus schedule and route planner",
};

/** The bundle is read at build time and inlined into the page, so the first
 *  paint already has the whole timetable: no spinner, and it keeps working
 *  offline. It compresses to about 30 kB over the wire. */
async function load<T>(name: string): Promise<T> {
  const raw = await readFile(join(process.cwd(), "public/data", name), "utf8");
  return JSON.parse(raw) as T;
}

/** Shared by `/`, `/ro/` and `/en/` - same planner and build-time data, only
 *  the `<head>` (set per route) and the language of the off-screen `<h1>` and
 *  the footer differ. The `<Planner>` reads its own language from client
 *  state; `lang` here only drives the server-rendered `<h1>` and `<HomeFooter>`. */
export async function HomePage({ lang }: { lang: SeoLang }) {
  const [network, places, fares, bikeSnapshot] = await Promise.all([
    load<Network>("network.json"),
    load<{ places: Place[]; reach: number;
            bbox: [number, number, number, number] }>("places.json"),
    load<FareTable>("fares.json"),
    load<BikeSnapshot>("sepsibike.json"),
  ]);
  return (
    <>
      <h1 className="srOnly">{HOME_H1[lang]}</h1>
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
