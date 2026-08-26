"use client";

import { useMemo, useState } from "react";
import { timetable, type PlanContext } from "@/lib/engine/plan";
import { formatHHMM } from "@/lib/engine/time";
import { shadeOf } from "@/lib/engine/types";
import type { Line, Network, ServiceId, Stop } from "@/lib/engine/types";
import type { Lang, Strings } from "@/lib/i18n";
import { Back } from "../common/icons";
import styles from "./Timetable.module.css";

interface Direction {
  /** A stable representative, also suitable for the share URL. */
  id: string;
  headsign: { ro: string; hu: string };
  /** One public direction can have several reconstructed timing pieces. */
  patternIds: string[];
}

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
export interface TimetableProps {
  network: Network;
  ctx: PlanContext;
  lines: Map<string, Line>;
  stops: Map<string, Stop>;
  lang: Lang;
  t: Strings;
  initialLine?: string | null;
  initialService?: ServiceId | null;
  initialPattern?: string | null;
  onChange?: (state: { lineId: string; service: ServiceId; patternId: string | null }) => void;
  onClose: () => void;
}

export default function Timetable({
  network, ctx, lines, stops, lang, t,
  initialLine, initialService, initialPattern, onChange, onClose,
}: TimetableProps) {
  const ordered = network.lines;
  const validInitialLine = initialLine && ordered.some((l) => l.id === initialLine)
    ? initialLine
    : (ordered[0]?.id ?? "");
  const [lineId, setLineId] = useState(validInitialLine);
  const [service, setService] = useState<ServiceId>(initialService ?? "weekday");

  /* A line can run more than one public direction. Reconstruction can also
     produce several timing pieces for one direction, which belong in one grid
     when their sign and complete stop order agree. */
  const directions = useMemo(
    () => {
      const groups = new Map<string, Direction>();
      for (const pattern of network.patterns) {
        if (pattern.lineId !== lineId) continue;
        const key = JSON.stringify([pattern.headsign.ro, pattern.headsign.hu, pattern.stopIds]);
        const existing = groups.get(key);
        if (existing) existing.patternIds.push(pattern.id);
        else groups.set(key, {
          id: pattern.id,
          headsign: pattern.headsign,
          patternIds: [pattern.id],
        });
      }
      return [...groups.values()];
    },
    [network.patterns, lineId]);
  const [patternId, setPatternId] = useState<string | null>(initialPattern ?? null);
  const chosen = directions.find((direction) => direction.patternIds.includes(patternId ?? ""))
    ?? directions[0];

  const grid = useMemo(
    () => (chosen ? timetable(ctx, chosen.patternIds, service) : null),
    [ctx, chosen, service]);

  const selectLine = (id: string) => {
    setLineId(id);
    setPatternId(null);
    onChange?.({ lineId: id, service, patternId: null });
  };

  const selectService = (day: ServiceId) => {
    setService(day);
    onChange?.({ lineId, service: day, patternId: chosen?.id ?? null });
  };

  const selectPattern = (pId: string) => {
    setPatternId(pId);
    onChange?.({ lineId, service, patternId: pId });
  };

  const shade = shadeOf(lines.get(lineId), false);
  const stopName = (id: string) => {
    const stop = stops.get(id);
    return stop ? (lang === "hu" ? stop.name.hu : stop.name.ro) : id;
  };

  const [closing, setClosing] = useState(false);

  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      onClose();
    }, 220);
  };

  return (
    <div className={`${styles.screen} ${closing ? styles.closing : ""}`}>
      <div className={styles.head}>
        <button onClick={handleClose} aria-label={t.back}><Back /></button>
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
                      onClick={() => selectLine(line.id)}>
                {line.id}
              </button>
            );
          })}
        </div>

        {directions.length > 1 && (
          <div className={styles.seg}>
            {directions.map((direction) => (
              <button key={direction.id} aria-pressed={direction.id === chosen?.id}
                      onClick={() => selectPattern(direction.id)}>
                → {lang === "hu" ? direction.headsign.hu : direction.headsign.ro}
              </button>
            ))}
          </div>
        )}

        <div className={styles.seg}>
          {(["weekday", "weekend"] as ServiceId[]).map((day) => (
            <button key={day} aria-pressed={service === day}
                    onClick={() => selectService(day)}>
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
                    {grid.runs.map((run, i) => {
                      const published = grid.publishedRuns[i]?.[row] ?? grid.published[row];
                      return (
                      <td key={i} className={published ? "" : styles.guess}>
                        {formatHHMM(run[row])}{published ? "" : "*"}
                      </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {grid.publishedRuns.some((run) => run.includes(false))
              && <p className={styles.note}>{t.estimated}</p>}
          </>
        )}
      </div>
    </div>
  );
}
