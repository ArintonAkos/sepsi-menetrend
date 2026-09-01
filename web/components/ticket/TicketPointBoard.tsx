"use client";

import type { Lang, Strings } from "@/lib/i18n";
import { openStateAt, type TicketPoint } from "@/lib/ticket-points";
import { usePullToDismiss } from "../hooks/usePullToDismiss";
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

  const kind = point.kind === "kiosk" ? t.ticketKindKiosk
    : point.kind === "machine" ? t.ticketKindMachine
      : t.ticketKindShop;
  const sells = point.sells
    .map((s) => (s === "pass" ? t.ticketSellsPass : t.ticketSellsSingle))
    .join(", ");

  const state = openStateAt(point, new Date(), holidays);
  let status: string;
  if (state.open) {
    status = state.until
      ? lang === "hu" ? `${t.ticketOpen} ${state.until}-ig`
        : lang === "ro" ? `${t.ticketOpen} până la ${state.until}`
          : `${t.ticketOpen} until ${state.until}`
      : t.ticketOpen;
  } else if (state.opensAt) {
    const d = state.opensAt;
    const hh = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const sameDay = d.toDateString() === new Date().toDateString();
    status = `${t.ticketClosed} · ${t.ticketOpensAt} ${sameDay ? hh : `${t.days[d.getDay()]} ${hh}`}`;
  } else {
    status = t.ticketClosed;
  }

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
        <small>{kind} · {sells} · {t.ticketCash}</small>
        <b className={state.open ? styles.open : styles.shut}>{status}</b>
      </div>
    </section>
  );
}
