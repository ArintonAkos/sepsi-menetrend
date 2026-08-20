"use client";

import { useMemo, useState } from "react";
import { timetable, type PlanContext } from "@/lib/engine/plan";
import { formatHHMM } from "@/lib/engine/time";
import { shadeOf } from "@/lib/engine/types";
import type { Line, Network, ServiceId, Stop } from "@/lib/engine/types";
import type { Lang, Strings } from "@/lib/i18n";
import { Back } from "./icons";
import styles from "./Timetable.module.css";

/**
 * Every departure the operator publishes, as a grid.
 *
 *  One line and one direction at a time. A single table of all twelve lines
 *  would be unreadable and, worse, unusable: what a rider checks is one route
 *  on one kind of day, and the choice of which is the fastest part.
 *
 *  Stops run down the page and runs across it, which is how printed timetables
 *  are set and the only arrangement that fits thirty departures on a phone -
 *  the alternative puts thirty-three stops across a screen four inches wide.
 */
export default function Timetable({
  network, ctx, lines, stops, lang, t, onClose,
}: {
  network: Network;
  ctx: PlanContext;
  lines: Map<string, Line>;
  stops: Map<string, Stop>;
  lang: Lang;
  t: Strings;
  onClose: () => void;
}) {
  const ordered = network.lines;
  const [lineId, setLineId] = useState(ordered[0]?.id ?? "");
  const [service, setService] = useState<ServiceId>("weekday");

  /* A line can run more than one shape - the 3 loops one way, the 3D another -
     and they are separate timetables however the operator numbers them. */
  const directions = useMemo(
    () => network.patterns.filter((p) => p.lineId === lineId),
    [network.patterns, lineId]);
  const [patternId, setPatternId] = useState<string | null>(null);
  const chosen = directions.find((p) => p.id === patternId) ?? directions[0];

  const grid = useMemo(
    () => (chosen ? timetable(ctx, chosen.id, service) : null),
    [ctx, chosen, service]);

  const shade = shadeOf(lines.get(lineId), false);
  const stopName = (id: string) => {
    const stop = stops.get(id);
    return stop ? (lang === "hu" ? stop.name.hu : stop.name.ro) : id;
  };

  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        <button onClick={onClose} aria-label={t.back}><Back /></button>
        <h2>{t.timetables}</h2>
      </div>

      <div className={styles.picks}>
        <div className={styles.lineRow} role="group" aria-label={t.pickLine}>
          {ordered.map((line) => {
            const tone = shadeOf(line, false);
            return (
              <button key={line.id} className={styles.linePick}
                      aria-pressed={line.id === lineId}
                      style={{ background: tone.fill, color: tone.text }}
                      onClick={() => { setLineId(line.id); setPatternId(null); }}>
                {line.id}
              </button>
            );
          })}
        </div>

        {directions.length > 1 && (
          <div className={styles.seg}>
            {directions.map((p) => (
              <button key={p.id} aria-pressed={p.id === chosen?.id}
                      onClick={() => setPatternId(p.id)}>
                → {lang === "hu" ? p.headsign.hu : p.headsign.ro}
              </button>
            ))}
          </div>
        )}

        <div className={styles.seg}>
          {(["weekday", "weekend"] as ServiceId[]).map((day) => (
            <button key={day} aria-pressed={service === day}
                    onClick={() => setService(day)}>
              {day === "weekday" ? t.weekdayShort : t.weekendShort}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.scroll}>
        {!grid || grid.runs.length === 0 ? (
          <p className={styles.empty}>{t.noRuns}</p>
        ) : (
          <>
            <table className={styles.grid}>
              <thead>
                <tr>
                  <th className={styles.stopCell} scope="col">{t.stopColumn}</th>
                  {grid.runs.map((run, i) => (
                    <th key={i} scope="col"
                        style={{ color: shade.fill }}>{formatHHMM(run[0])}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.stopIds.map((id, row) => (
                  <tr key={`${id}-${row}`}>
                    <th className={styles.stopCell} scope="row">{stopName(id)}</th>
                    {grid.runs.map((run, i) => (
                      <td key={i} className={grid.published[row] ? "" : styles.guess}>
                        {formatHHMM(run[row])}{grid.published[row] ? "" : "*"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {grid.published.includes(false) && <p className={styles.note}>{t.estimated}</p>}
          </>
        )}
      </div>
    </div>
  );
}
