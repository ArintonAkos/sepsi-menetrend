"use client";

import { Fragment } from "react";
import { formatHHMM } from "@/lib/engine/time";
import { fareFor, type FareTable } from "@/lib/engine/fares";
import { shadeOf } from "@/lib/engine/types";
import type { Journey, Line, Pattern, RideLeg, Stop, WalkLeg } from "@/lib/engine/types";
import type { Lang, Strings } from "@/lib/i18n";
import HouseAd from "./HouseAd";
import { Back, Chevron, WalkIcon } from "./icons";
import styles from "./JourneyDetail.module.css";

/** A stop time the operator never published, worked out by interpolation.
 *  Marked so nobody plans a connection on a number we invented. */
const ESTIMATE = "*";

export default function JourneyDetail({
  journey, lines, patterns, stops, fares, lang, t, from, to, dark, laterBuses, onBack,
}: {
  journey: Journey; lines: Map<string, Line>; patterns: Map<string, Pattern>;
  stops: Map<string, Stop>; fares: FareTable; lang: Lang; t: Strings;
  from: string; to: string; dark: boolean;
  /** The next few departures of this line from the stop you board at. */
  laterBuses: (leg: RideLeg) => string[];
  onBack: () => void;
}) {
  const name = (stopId: string) => {
    const s = stops.get(stopId);
    return s ? (lang === "hu" ? s.name.hu : s.name.ro) : stopId;
  };
  const fare = fareFor(journey, stops, (id) => patterns.get(id)?.stopIds ?? [], fares);
  const rides = journey.legs.filter((l): l is RideLeg => l.kind === "ride");
  /* Minutes spent standing at a change. When both buses use the same stop there
     is no walk leg to hang this on, so the wait was invisible - and it is the
     part of a transfer people actually feel. */
  const waitBefore = (at: number, board: number) => {
    for (let i = at - 1; i >= 0; i--) {
      const earlier = journey.legs[i];
      if (earlier.kind === "ride") return Math.max(0, board - (earlier as RideLeg).alight);
    }
    return 0;
  };
  const firstShade = shadeOf(lines.get(rides[0]?.lineId ?? ""), dark);
  /* The bar under a node belongs to whatever happens next. Painting the origin
     in the line's colour drew the walk to the first stop as if it were the bus
     route - a solid coloured spine down a stretch you cover on foot. */
  const startsOnFoot = journey.legs[0]?.kind === "walk"
    && (journey.legs[0] as WalkLeg).metres > 0;

  return (
    <div>
      <div className={styles.head}>
        <button onClick={onBack} aria-label={t.back}><Back /></button>
        <b>{t.journey}</b>
      </div>

      <div className={styles.summary}>
        <div className={styles.modes}>
          {rides.map((r, i) => {
            const shade = shadeOf(lines.get(r.lineId), dark);
            return (
              <span key={i} className={styles.pill}
                    style={{ background: shade.fill, color: shade.text }}>{r.lineId}</span>
            );
          })}
        </div>
        <div className={`${styles.dur} rounded`}>
          <b>{journey.arrive - journey.depart}</b><span>{t.minutes}</span>
        </div>
      </div>

      <ol className={styles.timeline}>
        {/* Ink, not the line's colour: this is where you are, not a stop the
            bus calls at. Wearing line 2's red made Dedeman look like a station
            on line 2. The rail below it still takes the line's colour, because
            that part is the journey. */}
        <Node colour="var(--ink)" filled title={from} subtitle={t.departure}
              time={formatHHMM(journey.depart)}
              bar={startsOnFoot ? undefined : firstShade.fill}
              onFoot={startsOnFoot} />

        {journey.legs.map((leg, i) => {
          if (leg.kind === "walk") {
            const walk = leg as WalkLeg;
            /* Every walk is a step of its own, including the first and the
               last. Folded into the origin and arrival lines they said how far
               you walk but never where to, which is the half a rider standing
               on the pavement actually needs. A walk of no distance is not a
               step at all - the origin is already the stop. */
            if (walk.metres === 0 && (i === 0 || i === journey.legs.length - 1)) return null;
            return (
              <li key={i} className={`${styles.node} ${styles.walkNode}`}>
                <span className={styles.rail}><i className={styles.pipSmall} /></span>
                <div className={styles.body}>
                  <div className={styles.walkRow}>
                    {walk.metres > 0 && <WalkIcon />}
                    <span>{walk.metres > 0
                      ? `${walk.metres} m · ${walk.minutes} ${t.minutes} ${t.walk}`
                      : t.sameStop}</span>
                  </div>
                  <div className={styles.sub}>
                    {walk.toStopId ? name(walk.toStopId) : to}
                  </div>
                </div>
                <span className={styles.time} />
              </li>
            );
          }

          const ride = leg as RideLeg;
          const pattern = patterns.get(ride.patternId);
          const shade = shadeOf(lines.get(ride.lineId), dark);
          if (!pattern) return null;
          const later = laterBuses(ride);
          const between = pattern.stopIds.slice(ride.fromIndex + 1, ride.toIndex);
          const alightId = pattern.stopIds[ride.toIndex];
          const alightPublished = pattern.published[ride.toIndex];
          const lastRide = !journey.legs.slice(i + 1).some((l) => l.kind === "ride");

          const boardId = pattern.stopIds[ride.fromIndex];
          const boardPublished = pattern.published[ride.fromIndex];

          return (
            <Fragment key={i}>
              {/* which stop to get on at - a walk with no destination is just a
                  distance, and the first ride never had one */}
              <Node colour={shade.fill} bar={shade.fill} title={name(boardId)}
                    time={formatHHMM(ride.board)} estimated={!boardPublished} />
              <li className={styles.node} style={{ ["--bar" as string]: shade.fill }}>
                <span className={styles.rail}>
                  <i className={styles.pip} style={{ borderColor: shade.fill }} />
                </span>
                <div className={styles.body}>
                  <div className={styles.rideHead}>
                    <span className={styles.pill}
                          style={{ background: shade.fill, color: shade.text }}>
                      {ride.lineId}
                    </span>
                    <span className={styles.sub}>
                      → {lang === "hu" ? pattern.headsign.hu : pattern.headsign.ro}
                    </span>
                  </div>
                  {waitBefore(i, ride.board) > 0 && (
                    <div className={styles.wait}>
                      {waitBefore(i, ride.board)} {t.minutes} {t.wait}
                    </div>
                  )}
                  {later.length > 0 && (
                    <div className={styles.later}>
                      <span>{t.laterToday}</span>
                      {later.map((at) => <b key={at}>{at}</b>)}
                    </div>
                  )}
                  {between.length > 0 && (
                    <details className={styles.between}>
                      <summary>
                        <span>{between.length} {t.stops}</span>
                        <Chevron />
                      </summary>
                      <ol>
                        {between.map((id, k) => {
                          const at = ride.board + pattern.offsets[ride.fromIndex + 1 + k]
                                   - pattern.offsets[ride.fromIndex];
                          return (
                            <li key={id + k}>
                              {name(id)}{" "}
                              <b>{formatHHMM(at)}
                                {pattern.published[ride.fromIndex + 1 + k] ? "" : ESTIMATE}</b>
                            </li>
                          );
                        })}
                      </ol>
                    </details>
                  )}
                </div>
                <span className={styles.time} />
              </li>
              <Node colour={shade.fill} bar={lastRide ? undefined : shade.fill}
                    title={name(alightId)} time={formatHHMM(ride.alight)}
                    estimated={!alightPublished} />
            </Fragment>
          );
        })}

        <Node colour="var(--ink)" filled title={to} subtitle={t.arrival}
              time={formatHHMM(journey.arrive)} />
      </ol>

      {journey.legs.some((l) => l.kind === "ride"
        && patterns.get((l as RideLeg).patternId)?.published
          .slice((l as RideLeg).fromIndex, (l as RideLeg).toIndex + 1)
          .includes(false)) && (
        // the caveat belongs next to the asterisks, not in a footer nobody reads
        <p className={styles.estimated}>{t.estimated}</p>
      )}

      {fare && (
        <div className={styles.fare}>
          <div className={styles.fareRow}>
            <span>{t.ticket}</span>
            <b>{fare.count} × {String(fare.ticket.price).replace(".", ",")} lej</b>
          </div>
          <small>{lang === "hu" ? fare.ticket.name.hu : fare.ticket.name.ro}</small>
        </div>
      )}

      <HouseAd t={t} />
    </div>
  );
}

function Node({ colour, bar, title, subtitle, time, filled, estimated, onFoot }: {
  colour: string; bar?: string; title: string; subtitle?: string;
  time: string; filled?: boolean; estimated?: boolean;
  /** Dash the rail below this node: the next stretch is walked, not ridden. */
  onFoot?: boolean;
}) {
  return (
    <li className={`${styles.node} ${onFoot ? styles.walkNode : ""}`}
        style={{ ["--bar" as string]: bar ?? "transparent" }}>
      <span className={styles.rail}>
        <i className={filled ? styles.pipFilled : styles.pip} style={{ borderColor: colour }} />
      </span>
      <div className={styles.body}>
        <div className={styles.name}>{title}</div>
        {subtitle && <div className={styles.sub}>{subtitle}</div>}
      </div>
      <span className={`${styles.time} ${estimated ? styles.soft : ""}`}>
        {time}{estimated ? ESTIMATE : ""}
      </span>
    </li>
  );
}
