"use client";

import type { Lang, Strings } from "@/lib/i18n";
import { openStateAt, type TicketPoint } from "@/lib/ticket-points";
import { usePullToDismiss } from "../hooks/usePullToDismiss";
import { ticketKindLine, ticketStatusText } from "./status";
import styles from "./TicketPointBoard.module.css";

/** One ticket sales point, anchored to its map marker (wide) or a bottom sheet
 *  (phone). Same shape as `BikeStationBoard` / `StopBoard`: a pull-to-dismiss
 *  section with a head (name + address + close) and a short body. */
export default function TicketPointBoard({
  point, holidays, lang, t, onClose,
}: {
  point: TicketPoint;
  holidays: string[];
  lang: Lang;
  t: Strings;
  onClose: () => void;
}) {
  const pullDismiss = usePullToDismiss(onClose);
  const state = openStateAt(point, new Date(), holidays);
  const status = ticketStatusText(state, lang, t);

  return (
    <section className={styles.sheet} aria-label={point.name[lang]}
             style={pullDismiss.style} {...pullDismiss.handlers}>
      <div className={styles.head}>
        <span className={styles.title}>
          <b>{point.name[lang]}</b>
          <span>{point.address}</span>
        </span>
        <button className={styles.close} onClick={onClose} aria-label={t.close}>×</button>
      </div>
      <div className={styles.body}>
        <small>{ticketKindLine(point.kind, point.sells, t)}</small>
        <b className={state.open ? styles.open : styles.shut}>{status}</b>
      </div>
    </section>
  );
}
