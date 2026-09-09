"use client";

import { useEffect, useState } from "react";
import type { Strings } from "@/lib/i18n";
import { serviceNoticeState } from "@/lib/service-notice";
import styles from "./ServiceNotice.module.css";

const KEY = "sepsi.notice.svc-provisional";

/** The provisional-routes strip. Shown on the planner and the Timetable while
 *  `network.json`'s `routesProvisional` is set - i.e. the Sept 7 times are in
 *  but some route shapes are still reconstructed. Dismissible. See
 *  `lib/service-notice.ts`: the whole thing goes when the official maps land. */
export default function ServiceNotice(
  { routesProvisional, t }: { routesProvisional: boolean | undefined; t: Strings },
) {
  /* Hidden until the effect has read localStorage, so the server markup and
     the first client render match. */
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = globalThis.localStorage?.getItem(KEY) === "1"; } catch {}
    setShow(serviceNoticeState(routesProvisional, dismissed).show);
  }, [routesProvisional]);

  if (!show) return null;

  const dismiss = () => {
    try { globalThis.localStorage?.setItem(KEY, "1"); } catch {}
    setShow(false);
  };

  return (
    <div className={styles.notice} role="note">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
           strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
      <p>{t.serviceNoticeProvisional}</p>
      <button type="button" onClick={dismiss} aria-label={t.close}>×</button>
    </div>
  );
}
