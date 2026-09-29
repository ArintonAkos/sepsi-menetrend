"use client";

import { useEffect, useState } from "react";
import type { Strings } from "@/lib/i18n";
import { serviceNoticeState } from "@/lib/service-notice";
import { ymd } from "@/lib/engine/time";
import styles from "./ServiceNotice.module.css";

const KEY = "sepsi.notice.svc-holiday";

/** The public-holiday strip. Shown on the planner when the viewed date is a
 *  statutory holiday, since those run the weekend timetable regardless of
 *  weekday - see `lib/service-notice.ts`. Dismissible per date, so it comes
 *  back on the next holiday rather than staying dismissed forever. */
export default function ServiceNotice(
  { date, publicHolidays, t }: { date: Date; publicHolidays: string[] | undefined; t: Strings },
) {
  /* Hidden until the effect has read localStorage, so the server markup and
     the first client render match. */
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissedDate: string | null = null;
    try { dismissedDate = globalThis.localStorage?.getItem(KEY) ?? null; } catch {}
    setShow(serviceNoticeState(date, publicHolidays, dismissedDate).show);
  }, [date, publicHolidays]);

  if (!show) return null;

  const dismiss = () => {
    try { globalThis.localStorage?.setItem(KEY, ymd(date)); } catch {}
    setShow(false);
  };

  return (
    <div className={styles.notice} role="note">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
           strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
      <p>{t.serviceNoticeHoliday}</p>
      <button type="button" onClick={dismiss} aria-label={t.close}>×</button>
    </div>
  );
}
