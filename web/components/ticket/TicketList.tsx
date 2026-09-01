"use client";

import { useMemo, useState } from "react";
import type { Lang, Strings } from "@/lib/i18n";
import type { LngLat } from "@/lib/engine/types";
import { metresBetween } from "@/lib/walking-router";
import { formatHours, rankTicketPoints, type TicketPoint } from "@/lib/ticket-points";
import { Back } from "../common/icons";
import { ticketKindLine, ticketStatusText } from "./status";
import styles from "./TicketList.module.css";

/** The town centre - a stand-in origin when the planner has no start point, so
 *  the list still has a sensible order (open first, then roughly central). */
const CENTRE: LngLat = [25.7876, 45.8636];

/** Every ticket sales point, one screen. Open ones first, then by distance from
 *  where the journey starts. Tapping a row routes the planner there. */
export default function TicketList({
  points, holidays, origin, lang, t, onRouteTo, onClose,
}: {
  points: TicketPoint[];
  holidays: string[];
  /** The journey's start, when set - drives the order and the walk estimate. */
  origin: LngLat | null;
  lang: Lang;
  t: Strings;
  onRouteTo: (point: TicketPoint) => void;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 240);
  };

  const rows = useMemo(
    () => rankTicketPoints(points, origin ?? CENTRE, new Date(), holidays),
    [points, origin, holidays],
  );

  return (
    <div className={`${styles.screen} ${closing ? styles.closing : ""}`}>
      <div className={styles.head}>
        <button onClick={handleClose} aria-label={t.back}><Back /></button>
        <h2>{t.ticketList}</h2>
      </div>
      <ul className={styles.list}>
        {rows.map(({ point, state }) => {
          const walk = origin
            ? Math.max(1, Math.round(metresBetween(origin, [point.lng, point.lat]) / 80))
            : null;
          return (
            <li key={point.id}>
              <button type="button" className={styles.row} onClick={() => onRouteTo(point)}>
                <span className={styles.name}>{point.name[lang]}</span>
                <span className={styles.meta}>{ticketKindLine(point.kind, point.sells, t)}</span>
                <span className={styles.hours}>{formatHours(point.hours, lang)}</span>
                {point.passHours && (
                  <span className={styles.hours}>{t.ticketSellsPass}: {formatHours(point.passHours, lang)}</span>
                )}
                <span className={styles.foot}>
                  <b className={state.open ? styles.open : styles.shut}>
                    {ticketStatusText(state, lang, t)}
                  </b>
                  {walk !== null && <span className={styles.walk}>{walk} {t.ticketWalkAway}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
