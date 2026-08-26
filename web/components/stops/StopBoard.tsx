"use client";

import { Fragment, useMemo } from "react";
import { boardAt, type PlanContext } from "@/lib/engine/plan";
import { formatHHMM } from "@/lib/engine/time";
import { shadeOf } from "@/lib/engine/types";
import { officialBoardAt } from "@/lib/official-board";
import type { Line, ServiceId, Stop } from "@/lib/engine/types";
import type { Lang, Strings } from "@/lib/i18n";
import { usePullToDismiss } from "../hooks/usePullToDismiss";
import styles from "./StopBoard.module.css";

/**
 * Every bus that calls at one stop, on one kind of day.
 *
 *  The question a person standing at a pole actually has, and the one thing a
 *  journey planner does not answer: not "how do I get to X" but "what comes
 *  here, and when". A line that loops through the same stop twice gets a row
 *  per pass, because those are buses going different ways and merging them
 *  would advertise a service twice as frequent as the one that runs.
 */
export default function StopBoard({
  stop, ctx, lines, service, now, lang, t, onClose,
}: {
  stop: Stop;
  ctx: PlanContext;
  lines: Map<string, Line>;
  service: ServiceId;
  /** Minutes since midnight, used only to grey out what has already gone. */
  now: number;
  lang: Lang;
  t: Strings;
  onClose: () => void;
}) {
  const pullDismiss = usePullToDismiss(onClose);
  const board = useMemo(() => boardAt(ctx, stop.id, service), [ctx, stop.id, service]);
  const official = useMemo(() => {
    const headsigns = new Map<string, Set<string>>();
    for (const column of board) {
      const values = headsigns.get(column.lineId) ?? new Set<string>();
      values.add(column.headsign.ro);
      headsigns.set(column.lineId, values);
    }
    return officialBoardAt(ctx.net.officialBoards ?? [], stop.id, stop.name.ro, service, headsigns);
  }, [board, ctx.net.officialBoards, stop.id, stop.name.ro, service]);
  /* On the source board a star in e.g. line 2 means "this exact departure
     continues as 2D". The direct 2D column names the same departure more
     usefully, so avoid showing it twice. This is distinct from our own
     estimated-time notation, which is never mixed into an official board. */
  const officialRows = official.map((column) => {
    const marked = new Set(service === "weekday"
      ? column.markedWeekday ?? [] : column.markedWeekend ?? []);
    const extension = new Set(official
      .filter((candidate) => candidate.lineId === `${column.lineId}D`)
      .flatMap((candidate) => candidate[service]));
    return {
      column,
      times: column[service].filter((at) => !marked.has(at) || !extension.has(at)),
    };
  }).filter((row) => row.times.length > 0);
  /* A physical pole's published columns are the whole public timetable for
     that side of the street.  Route reconstruction has estimated calls for
     planning through unprinted intermediate stops, but appending them here
     creates fictional duplicate directions beside literal operator columns.
     Therefore estimate only when this pole has no official board at all. */
  const inferred = officialRows.length === 0 ? board : [];
  /* Buses that finish here are worth listing - somebody is being collected -
     but they are not something you board, so they go last under their own
     heading rather than sitting between two departures of the same line. */
  const leaving = inferred.filter((column) => !column.terminates);
  const ending = inferred.filter((column) => column.terminates);
  const stops = ctx.stops;
  const name = lang === "hu" ? stop.name.hu : stop.name.ro;
  const other = lang === "hu" ? stop.name.ro : stop.name.hu;
  const estimated = officialRows.length === 0 && inferred.length > 0;

  return (
    <section className={styles.sheet} aria-label={name} style={pullDismiss.style} {...pullDismiss.handlers}>
      <div className={styles.head}>
        <span className={styles.title}>
          <b>{name}</b>
          {other && other !== name && <span>{other}</span>}
        </span>
        <button className={styles.close} onClick={onClose} aria-label={t.close}>×</button>
      </div>

      <div className={styles.body}>
        {officialRows.map(({ column, times }, i) => {
          const shade = shadeOf(lines.get(column.lineId), false);
          const next = times.find((at) => at >= now);
          const dimPast = next !== undefined;
          return (
            <div className={styles.row} key={`${column.lineId}-${column.destination}-${i}`}>
              <span className={styles.pill}
                    style={{ background: shade.fill, color: shade.text }}>
                {column.lineId}
              </span>
              <div>
                <div className={styles.where}><b>→ {column.destination}</b></div>
                <div className={styles.times}>
                  {times.map((at) => (
                    <span key={at}
                          className={`${styles.time} ${at === next ? styles.soon : ""}`
                                     + `${dimPast && at < now ? " " + styles.past : ""}`}>
                      {formatHHMM(at)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        {inferred.length > 0 && <>
        {[...leaving, ...ending].map((column, i) => {
          const first = column.terminates && i === leaving.length;
          const shade = shadeOf(lines.get(column.lineId), false);
          /* The next one to come is the only time on the board anyone is
             looking for; everything before it is history. */
          const next = column.times.find((at) => at >= now);
          const nextStop = column.towards ? stops.get(column.towards) : undefined;
          const heading = nextStop
            ? (lang === "hu" ? nextStop.name.hu : nextStop.name.ro) : null;
          /* Dimming only says something against a time that is still to come.
             Once the last bus has gone the whole column would grey out, which
             reads as broken rather than as "that was today's lot". */
          const dimPast = next !== undefined;
          return (
            <Fragment key={`${column.patternId}-${i}`}>
            {first && <p className={styles.section}>{t.arrivesHere}</p>}
            <div className={styles.row}>
              <span className={styles.pill}
                    style={{ background: shade.fill, color: shade.text }}>
                {column.lineId}
              </span>
              <div>
                <div className={styles.where}>
                  {column.terminates ? t.endsHere : <>
                    {/* the next stop first: on a loop the headsign is the same
                        both ways round and cannot tell the passes apart */}
                    <b>→ {heading}</b>
                    <span className={styles.sign}>
                      {lang === "hu" ? column.headsign.hu : column.headsign.ro}
                    </span>
                  </>}
                </div>
                <div className={styles.times}>
                  {column.times.map((at) => (
                    <span key={at}
                          className={`${styles.time} ${at === next ? styles.soon : ""}`
                                     + `${dimPast && at < now ? " " + styles.past : ""}`}>
                      {formatHHMM(at)}*
                    </span>
                  ))}
                </div>
              </div>
            </div>
            </Fragment>
          );
        })}
        </>}
        {officialRows.length === 0 && inferred.length === 0 && <p className={styles.empty}>{t.noService}</p>}
        {estimated && <p className={styles.note}>{t.estimated}</p>}
      </div>
    </section>
  );
}
