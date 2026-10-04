import type { SeoLang } from "@/lib/seo/lang";
import type { GridRun, StopGrid } from "@/lib/seo/lines";
import styles from "./StopGridTable.module.css";

/** A line page's every-stop timetable for one direction: stops down the side,
 *  one column per bus, scrolling sideways - the printed-timetable layout the
 *  app's own Timetable screen uses. The hour board above it answers "when does
 *  it leave"; this answers "when is it at my stop".
 *
 *  A server component, static HTML with no client JS. Rows carry an
 *  `at-<stopId>` anchor (weekday table only, so ids stay unique) that a stop
 *  page links to; `:target` highlights the row. */

interface StopGridTableProps {
  lang: SeoLang;
  lineId: string;
  stops: { id: string; name: string }[];
  grid: StopGrid;
  /** Stop ids already given an anchor elsewhere on the page. */
  anchored: Set<string>;
}

const T = {
  hu: {
    heading: "Mikor ér a busz az egyes megállókba",
    weekday: "Hétköznap",
    weekend: "Hétvége",
    none: "nincs járat",
    stop: "Megálló",
    school: "isk.",
    estimated: "* becsült idő: ennél a megállónál a Multi-Trans nem közöl időt.",
    skip: "– ez a busz itt nem áll meg.",
    schoolNote: "isk.: csak tanítási napokon.",
    variants: (ids: string) => `${ids}: ugyanezen a szakaszon közlekedő változatjárat.`,
    scroll: "Oldalra görgethető.",
  },
  ro: {
    heading: "Când ajunge autobuzul în fiecare stație",
    weekday: "Zi lucrătoare",
    weekend: "Weekend",
    none: "fără curse",
    stop: "Stația",
    school: "șc.",
    estimated: "* oră estimată: Multi-Trans nu publică ora pentru această stație.",
    skip: "– cursa nu oprește aici.",
    schoolNote: "șc.: doar în zilele de școală.",
    variants: (ids: string) => `${ids}: variantă care parcurge același traseu.`,
    scroll: "Derulează lateral.",
  },
  en: {
    heading: "When the bus reaches each stop",
    weekday: "Weekday",
    weekend: "Weekend",
    none: "no service",
    stop: "Stop",
    school: "sch.",
    estimated: "* estimated: Multi-Trans publishes no time for this stop.",
    skip: "– this bus does not stop here.",
    schoolNote: "sch.: school days only.",
    variants: (ids: string) => `${ids}: variant covering the same stretch.`,
    scroll: "Scrolls sideways.",
  },
} as const;

/** Minutes -> "6:05", wrapping past midnight - same clock as `BoardTable`. */
const hm = (m: number) => {
  const t = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

function Section({ lang, lineId, stops, runs, heading, anchored }: {
  lang: SeoLang;
  lineId: string;
  stops: { id: string; name: string }[];
  runs: GridRun[];
  heading: string;
  anchored: Set<string> | null;
}) {
  const t = T[lang];
  if (runs.length === 0) {
    return (
      <section>
        <h4 className={styles.heading}>{heading}</h4>
        <p className={styles.empty}>— {t.none}</p>
      </section>
    );
  }
  const tagged = runs.some((r) => r.lineId !== lineId || r.schoolOnly);
  return (
    <section>
      <h4 className={styles.heading}>{heading}</h4>
      <div className={styles.scroll} tabIndex={0} role="region" aria-label={`${heading} - ${t.heading}`}>
        <table className={styles.grid}>
          {tagged ? (
            <thead>
              <tr>
                <th scope="col" className={styles.stop}>{t.stop}</th>
                {runs.map((r, i) => (
                  <th key={i} scope="col" className={styles.tag}>
                    {[r.lineId !== lineId ? r.lineId : "", r.schoolOnly ? t.school : ""]
                      .filter(Boolean).join(" ")}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {stops.map((stop, row) => {
              // the last row is an arrival, not somewhere a stop page sends
              // a rider to catch this direction
              const anchor = anchored && row < stops.length - 1 && !anchored.has(stop.id)
                ? `at-${stop.id}` : undefined;
              if (anchor) anchored!.add(stop.id);
              return (
                <tr key={`${stop.id}-${row}`} id={anchor}>
                  <th scope="row" className={styles.stop}>{stop.name}</th>
                  {runs.map((r, i) => {
                    const m = r.times[row];
                    return (
                      <td key={i} className={row === 0 ? styles.first : r.estimated[row] ? styles.guess : undefined}>
                        {m == null ? "–" : `${hm(m)}${r.estimated[row] ? "*" : ""}`}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function StopGridTable({ lang, lineId, stops, grid, anchored }: StopGridTableProps) {
  const t = T[lang];
  const all = [...grid.weekday, ...grid.weekend];
  const variants = [...new Set(all.map((r) => r.lineId).filter((id) => id !== lineId))];
  const notes = [
    all.some((r) => r.estimated.some(Boolean)) ? t.estimated : "",
    all.some((r) => r.times.includes(null)) ? t.skip : "",
    grid.weekday.some((r) => r.schoolOnly) ? t.schoolNote : "",
    variants.length ? t.variants(variants.join(", ")) : "",
  ].filter(Boolean);

  return (
    <div className={styles.wrap}>
      <h3 className={styles.title}>{t.heading}</h3>
      <p className={styles.hint}>{t.scroll}</p>
      <Section lang={lang} lineId={lineId} stops={stops} runs={grid.weekday}
               heading={t.weekday} anchored={anchored} />
      <Section lang={lang} lineId={lineId} stops={stops} runs={grid.weekend}
               heading={t.weekend} anchored={null} />
      {notes.map((n) => <p key={n} className={styles.note}>{n}</p>)}
    </div>
  );
}
