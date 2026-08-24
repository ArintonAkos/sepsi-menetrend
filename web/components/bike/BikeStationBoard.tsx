"use client";

import type { BikeStation } from "@/lib/sepsibike";
import type { Strings } from "@/lib/i18n";
import { usePullToDismiss } from "../hooks/usePullToDismiss";
import styles from "./BikeStationBoard.module.css";

/** The live inventory of one SepsiBike dock, anchored to its map marker. */
export default function BikeStationBoard({
  station, stale, fetchedAt, t, onClose,
}: {
  station: BikeStation;
  stale: boolean;
  fetchedAt: string;
  t: Strings;
  onClose: () => void;
}) {
  const pullDismiss = usePullToDismiss(onClose);
  return (
    <section className={styles.sheet} aria-label={station.name}
             style={pullDismiss.style} {...pullDismiss.handlers}>
      <div className={styles.head}>
        <span className={styles.title}>
          <b>{station.name}</b>
          <span>{station.address}</span>
        </span>
        <button className={styles.close} onClick={onClose} aria-label={t.close}>×</button>
      </div>
      <div className={styles.body}>
        <div className={styles.counts}>
          <b>{station.availableBikes} {t.bikes}</b>
          <b>{station.freeDocks} {t.freeDocks}</b>
        </div>
        <progress value={station.availableBikes} max={station.totalCapacity} />
        <small>{station.status}</small>
        <small>{stale ? t.lastKnown : fetchedAt}</small>
      </div>
    </section>
  );
}
