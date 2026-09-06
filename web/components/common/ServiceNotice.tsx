"use client";

import { useEffect, useState } from "react";
import type { Strings } from "@/lib/i18n";
import { serviceNoticeState, type ServicePhase } from "@/lib/service-notice";
import styles from "./ServiceNotice.module.css";

const KEY = "sepsi.notice.svc-0907";

/** The 2026-09-07 network-change strip. Shown on the planner and the Timetable
 *  while `network.json`'s `validFrom` is still the pre-change feed. Dismissible;
 *  the dismissal is scoped to the phase, so the "after" message shows once when
 *  the date rolls over. See `lib/service-notice.ts` - the whole thing is meant
 *  to be deleted with the feed update. */
export default function ServiceNotice({ validFrom, t }: { validFrom: string | undefined; t: Strings }) {
  /* Hidden until the effect has read the clock and localStorage, so the server
     markup and the first client render match. */
  const [state, setState] = useState<{ phase: ServicePhase } | null>(null);

  useEffect(() => {
    let dismissed: string | null = null;
    try { dismissed = globalThis.localStorage?.getItem(KEY) ?? null; } catch {}
    setState(serviceNoticeState(validFrom, new Date(), dismissed));
  }, [validFrom]);

  if (!state) return null;

  const dismiss = () => {
    try { globalThis.localStorage?.setItem(KEY, state.phase); } catch {}
    setState(null);
  };

  return (
    <div className={styles.notice} role="note">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
           strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
      <p>{state.phase === "after" ? t.serviceNoticeAfter : t.serviceNoticeBefore}</p>
      <button type="button" onClick={dismiss} aria-label={t.close}>×</button>
    </div>
  );
}
