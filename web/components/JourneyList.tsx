"use client";

import { formatHHMM } from "@/lib/engine/time";
import { fareFor, type FareTable } from "@/lib/engine/fares";
import { shadeOf } from "@/lib/engine/types";
import type { Journey, Line, Pattern, RideLeg, Stop, WalkLeg } from "@/lib/engine/types";
import type { Strings } from "@/lib/i18n";
import { WalkIcon } from "./icons";
import styles from "./JourneyList.module.css";

export default function JourneyList({
  journeys, lines, patterns, stops, fares, t, chosen, dark, onHover, onOpen,
}: {
  journeys: Journey[]; lines: Map<string, Line>; patterns: Map<string, Pattern>;
  stops: Map<string, Stop>; fares: FareTable; t: Strings; chosen: number;
  dark: boolean; onHover: (i: number) => void; onOpen: (i: number) => void;
}) {
  if (!journeys.length) return <p className={styles.empty}>{t.noResults}</p>;

  /* Three different questions, and they rarely have the same answer. The list
     is ordered by when you get there, so that is the badge that explains the
     order and it goes first.
     "Fastest" used to mean shortest duration, which read as a contradiction:
     the row labelled fastest sat second, because a 20-minute ride leaving now
     puts you at the door long before an 18-minute one leaving half an hour
     later. Naming each claim for what it actually measures removes the
     argument between the badge and the sort. */
  const soonest = journeys.reduce((a, b) => b.arrive < a.arrive ? b : a);
  const shortest = journeys.reduce((a, b) =>
    (b.arrive - b.depart) < (a.arrive - a.depart) ? b : a);
  const gentlest = journeys.reduce((a, b) => b.walkMinutes < a.walkMinutes ? b : a);

  return (
    <ul className={styles.list}>
      {journeys.map((j, i) => {
        const fare = fareFor(j, stops, (id) => patterns.get(id)?.stopIds ?? [], fares);
        return (
          <li key={i}>
            <button className={styles.card} aria-current={i === chosen}
                    onMouseEnter={() => onHover(i)} onClick={() => onOpen(i)}>
              <div className={styles.top}>
                <div className={styles.modes}>
                  {j.legs
                    .filter((l) => l.kind === "ride" || (l as WalkLeg).minutes > 0)
                    .map((leg, k) => {
                      const sep = k > 0 ? <span key={`d${k}`} className={styles.dot} /> : null;
                      if (leg.kind === "ride") {
                        const shade = shadeOf(lines.get((leg as RideLeg).lineId), dark);
                        return (
                          <span key={k} className={styles.pair}>{sep}
                            <span className={styles.pill}
                                  style={{ background: shade.fill, color: shade.text }}>
                              {(leg as RideLeg).lineId}
                            </span>
                          </span>
                        );
                      }
                      return (
                        <span key={k} className={styles.pair}>{sep}
                          <span className={styles.walk}>
                            <WalkIcon />{(leg as WalkLeg).minutes}
                          </span>
                        </span>
                      );
                    })}
                </div>
                <div className={`${styles.dur} rounded`}>
                  <b>{j.arrive - j.depart}</b><span>{t.minutes}</span>
                </div>
              </div>
              <div className={styles.bot}>
                <b>{formatHHMM(j.depart)} → {formatHHMM(j.arrive)}</b>
                {fare && <><span className={styles.dot} />
                  <span>{fare.count} × {String(fare.ticket.price).replace(".", ",")} lej</span></>}
              </div>
              <div className={styles.tags}>
                {j === soonest && <span className={`${styles.tag} ${styles.hi}`}>{t.soonest}</span>}
                {j === shortest && j !== soonest &&
                  <span className={styles.tag}>{t.shortest}</span>}
                {j === gentlest && j !== soonest && j !== shortest &&
                  <span className={styles.tag}>{t.leastWalking}</span>}
                <span className={styles.tag}>
                  {j.transfers === 0 ? t.direct : `${j.transfers} ${t.transfer}`}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
