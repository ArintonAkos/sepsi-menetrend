import type { SeoLang } from "@/lib/seo/lang";
import styles from "./BoardTable.module.css";

/** A static departure board for one line's SEO page: two labelled sections
 *  (weekday, weekend), each a table of one row per hour with that hour's
 *  departures as clock-time chips.
 *
 *  A server component - these are crawl targets, so the whole board ships as
 *  static HTML with no client JS. The `/ro/` twin is built as Hungarian and
 *  language-stamped afterwards, so `lang` is passed in explicitly. */

type Lang = SeoLang;

interface BoardTableProps {
  lang: Lang;
  /** Minutes since midnight, already ascending. */
  weekday: number[];
  weekend: number[];
}

const T = {
  hu: { weekday: "Hétköznap", weekend: "Hétvége", none: "nincs járat" },
  ro: { weekday: "Zi lucrătoare", weekend: "Weekend", none: "fără curse" },
  en: { weekday: "Weekday", weekend: "Weekend", none: "no service" },
} as const;

/** Minutes -> "6:05". The wrap keeps a past-midnight trip (24:50 = 1490) on the
 *  clock as "0:50". Copied from `lib/engine/time`'s `formatHHMM`, minus its
 *  hour zero-pad - the board reads better as "6:05" than "06:05". */
const hm = (m: number) => {
  const t = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** Ascending minutes -> consecutive runs sharing a clock hour. Input order is
 *  kept, so a post-midnight tail lands after the evening rows, not before dawn. */
function byHour(mins: number[]): { hour: number; mins: number[] }[] {
  const rows: { hour: number; mins: number[] }[] = [];
  for (const m of mins) {
    const hour = Math.floor((((Math.round(m) % 1440) + 1440) % 1440) / 60);
    const last = rows[rows.length - 1];
    if (last && last.hour === hour) last.mins.push(m);
    else rows.push({ hour, mins: [m] });
  }
  return rows;
}

function Section({ heading, none, mins }: { heading: string; none: string; mins: number[] }) {
  const rows = byHour(mins);
  return (
    <section>
      <h3 className={styles.heading}>{heading}</h3>
      {rows.length === 0 ? (
        <p className={styles.empty}>— {none}</p>
      ) : (
        <table className={styles.grid}>
          <tbody>
            {rows.map((row, r) => (
              <tr key={`${row.hour}-${r}`}>
                <th scope="row" className={styles.hour}>
                  {row.hour}
                </th>
                <td className={styles.times}>
                  {row.mins.map((m, i) => (
                    <span key={`${m}-${i}`} className={styles.time}>
                      {hm(m)}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function BoardTable({ lang, weekday, weekend }: BoardTableProps) {
  const t = T[lang];
  return (
    <div className={styles.board}>
      <Section heading={t.weekday} none={t.none} mins={weekday} />
      <Section heading={t.weekend} none={t.none} mins={weekend} />
    </div>
  );
}
