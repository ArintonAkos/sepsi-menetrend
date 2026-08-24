"use client";

import { formatHHMM } from "@/lib/engine/time";
import { fareFor, type FareTable } from "@/lib/engine/fares";
import { shadeOf } from "@/lib/engine/types";
import type { Line, Pattern, RideLeg, Stop, WalkLeg } from "@/lib/engine/types";
import type { Strings } from "@/lib/i18n";
import { plannerOptionTimes, type PlannerOption } from "@/lib/planner-options";
import { WalkIcon } from "../common/icons";
import styles from "./JourneyList.module.css";

export default function JourneyList({
  options, lines, patterns, stops, fares, date, t, chosen, dark, onHover, onOpen,
}: {
  options: PlannerOption[]; lines: Map<string, Line>; patterns: Map<string, Pattern>;
  stops: Map<string, Stop>; fares: FareTable; date: Date; t: Strings; chosen: number;
  dark: boolean; onHover: (i: number) => void; onOpen: (i: number) => void;
}) {
  if (!options.length) return <p className={styles.empty}>{t.noResults}</p>;

  /* Three different questions, and they rarely have the same answer. The list
     is ordered by when you get there, so that is the badge that explains the
     order and it goes first.
     "Fastest" used to mean shortest duration, which read as a contradiction:
     the row labelled fastest sat second, because a 20-minute ride leaving now
     puts you at the door long before an 18-minute one leaving half an hour
     later. Naming each claim for what it actually measures removes the
     argument between the badge and the sort. */
  const duration = (option: PlannerOption) => {
    const times = plannerOptionTimes(option);
    return times.arrive - times.depart;
  };
  const walking = (option: PlannerOption) => option.kind === "transit"
    ? option.journey.walkMinutes
    : option.journey.access.minutes + option.journey.egress.minutes;
  const soonest = options.reduce((a, b) => plannerOptionTimes(b).arrive < plannerOptionTimes(a).arrive ? b : a);
  const shortest = options.reduce((a, b) => duration(b) < duration(a) ? b : a);
  const gentlest = options.reduce((a, b) => walking(b) < walking(a) ? b : a);

  return (
    <ul className={styles.list}>
      {options.map((option, i) => {
        if (option.kind === "bike") {
          const j = option.journey;
          return (
            <li key={`bike-${j.start.id}-${j.finish.id}`}>
              <button className={styles.card} aria-current={i === chosen}
                      onMouseEnter={() => onHover(i)} onClick={() => onOpen(i)}>
                <div className={styles.top}>
                  <div className={styles.modes}>
                    <span className={styles.bikePill}>🚲 {t.bike}</span>
                    <span className={styles.walk}><WalkIcon />{j.access.minutes + j.egress.minutes}</span>
                  </div>
                  <div className={`${styles.dur} rounded`}>
                    <b>{duration(option)}</b><span>{t.minutes}</span>
                  </div>
                </div>
                <div className={styles.bot}>
                  <b>{formatHHMM(j.depart)} → {formatHHMM(j.arrive)}</b>
                  <span className={styles.dot} /><span>{j.fareLei} RON</span>
                </div>
                <div className={styles.bikeSummary}>
                  {j.access.minutes} {t.walk} · {j.ride.minutes} {t.bikeRide} · {j.egress.minutes} {t.walk}
                </div>
                <div className={styles.bikeSummary}>{j.start.name} → {j.finish.name}</div>
                <div className={styles.tags}>
                  {option === soonest && <span className={`${styles.tag} ${styles.hi}`}>{t.soonest}</span>}
                  {option === shortest && option !== soonest && <span className={styles.tag}>{t.shortest}</span>}
                  {option === gentlest && option !== soonest && option !== shortest &&
                    <span className={styles.tag}>{t.leastWalking}</span>}
                  <span className={styles.tag}>{t.direct}</span>
                  {j.stale && <span className={styles.tag}>{t.lastKnown}</span>}
                </div>
              </button>
            </li>
          );
        }
        const j = option.journey;
        const fare = fareFor(j, stops, (id) => patterns.get(id)?.stopIds ?? [], fares, date);
        return (
          <li key={`transit-${i}`}>
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
                  <span>{fare.free ? t.freeFriday
                    : `${fare.count} × ${String(fare.ticket.price).replace(".", ",")} lej`}</span></>}
              </div>
              <div className={styles.tags}>
                {option === soonest && <span className={`${styles.tag} ${styles.hi}`}>{t.soonest}</span>}
                {option === shortest && option !== soonest &&
                  <span className={styles.tag}>{t.shortest}</span>}
                {option === gentlest && option !== soonest && option !== shortest &&
                  <span className={styles.tag}>{t.leastWalking}</span>}
                <span className={styles.tag}>
                  {/* "direct" is a claim about buses; with none, say what it is */}
                  {!j.legs.some((l) => l.kind === "ride") ? t.onFootOnly
                    : j.transfers === 0 ? t.direct : `${j.transfers} ${t.transfer}`}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
