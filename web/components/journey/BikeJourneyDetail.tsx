"use client";

import { formatHHMM } from "@/lib/engine/time";
import type { Strings } from "@/lib/i18n";
import type { BikeStation } from "@/lib/sepsibike";
import type { TimedBikeJourney } from "@/lib/sepsibike-timing";
import { Back, WalkIcon } from "../common/icons";
import styles from "./BikeJourneyDetail.module.css";

export default function BikeJourneyDetail({
  journey, from, to, t, onBack,
}: {
  journey: TimedBikeJourney;
  from: string;
  to: string;
  t: Strings;
  onBack: () => void;
}) {
  const inventory = (station: BikeStation) =>
    `${station.availableBikes} ${t.bikes} · ${station.freeDocks} ${t.freeDocks}`;
  const fare = `${journey.fareLei} RON`;

  return (
    <div>
      <div className={styles.head}>
        <button onClick={onBack} aria-label={t.back}><Back /></button>
        <b>{t.journey}</b>
      </div>

      <div className={styles.summary}>
        <span className={styles.mode}>🚲 {t.bike}</span>
        <div className={`${styles.duration} rounded`}>
          <b>{journey.arrive - journey.depart}</b><span>{t.minutes}</span>
        </div>
      </div>

      <ol className={styles.timeline}>
        <Point title={from} subtitle={t.departure} time={formatHHMM(journey.depart)} filled />
        <Walk metres={journey.access.metres} minutes={journey.access.minutes} t={t} />
        <Point title={journey.start.name} subtitle={inventory(journey.start)}
               time={formatHHMM(journey.pickup)} bike />
        <li className={styles.segment}>
          <span className={styles.rail}><i /></span>
          <div className={styles.body}>
            <div className={styles.ride}>🚲 {groupMetres(journey.ride.metres)} m · {journey.ride.minutes} {t.minutes} {t.bikeRide}</div>
          </div>
          <span className={styles.time} />
        </li>
        <Point title={journey.finish.name} subtitle={inventory(journey.finish)}
               time={formatHHMM(journey.returnAt)} bike />
        <Walk metres={journey.egress.metres} minutes={journey.egress.minutes} t={t} />
        <Point title={to} subtitle={t.arrival} time={formatHHMM(journey.arrive)} filled />
      </ol>

      {journey.stale && <p className={styles.stale}>{t.lastKnown}</p>}

      <section className={styles.info} aria-label={t.bike}>
        <div className={styles.infoRow}>
          <span>{t.bikeFare}</span>
          <b>{fare}</b>
        </div>
        {journey.fareLei === 0 && <small>{t.bikeFareNote}</small>}
      </section>

      <section className={styles.rules}>
        <p>{t.bikePickupWindow}</p>
        <p>{t.bikeReturnAfterHours}</p>
        <p>{t.bikeAccount}</p>
        <p>{t.bikeSupport}: <a href="tel:+40374451350">0374 451 350</a></p>
      </section>
    </div>
  );
}

function Point({ title, subtitle, time, filled, bike }: {
  title: string;
  subtitle: string;
  time: string;
  filled?: boolean;
  bike?: boolean;
}) {
  return (
    <li className={styles.point}>
      <span className={styles.rail}><i className={filled ? styles.filled : bike ? styles.bikePin : undefined} /></span>
      <div className={styles.body}>
        <div className={styles.name}>{title}</div>
        <div className={styles.sub}>{subtitle}</div>
      </div>
      <time className={styles.time}>{time}</time>
    </li>
  );
}

function Walk({ metres, minutes, t }: { metres: number; minutes: number; t: Strings }) {
  return (
    <li className={styles.segment}>
      <span className={`${styles.rail} ${styles.walkRail}`}><i /></span>
      <div className={styles.body}>
        <div className={styles.walk}><WalkIcon />{metres} m · {minutes} {t.minutes} {t.walk}</div>
      </div>
      <span className={styles.time} />
    </li>
  );
}

function groupMetres(metres: number) {
  return String(metres).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
