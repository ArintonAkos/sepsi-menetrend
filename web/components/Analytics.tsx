"use client";

import { useEffect, useSyncExternalStore } from "react";
import { read, write, type Consent } from "@/lib/consent";
import styles from "./Analytics.module.css";

declare global {
  interface Window { dataLayer: unknown[][] }
}

const TEXT = {
  hu: {
    message: "Ez az oldal a Google Analytics segítségével méri a látogatottságot.",
    accept: "Elfogadom", decline: "Elutasítom",
  },
  ro: {
    message: "Acest site folosește Google Analytics pentru a măsura vizitele.",
    accept: "Accept", decline: "Refuz",
  },
};

/* A write from this same tab never fires the native "storage" event - that
   only reaches other tabs. This event is how the choice below reaches
   useSyncExternalStore's snapshot without a setState-in-effect. */
const CHANGE_EVENT = "sepsi:consent";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function snapshot(): Consent | "unset" {
  return read(globalThis.localStorage ?? null) ?? "unset";
}

// The static export has no window at build time; "unset" is what a fresh
// visitor's very first paint would show anyway, so hydration has nothing to
// correct for anyone but a returning visitor, and that correction happens on
// the next tick regardless.
function serverSnapshot(): Consent | "unset" {
  return "unset";
}

function load(gaId: string) {
  if (document.getElementById("ga-tag")) return;
  const script = document.createElement("script");
  script.id = "ga-tag";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(["js", new Date()]);
  window.dataLayer.push(["config", gaId]);
}

/** Counts visits, but only once someone has said yes.
 *
 *  Nothing here loads before that: not a cookie, not a script tag, not a
 *  ping. A visitor who never answers, or who declines, is invisible to
 *  Google exactly as they were before this existed.
 */
export default function Analytics({ gaId }: { gaId?: string }) {
  const consent = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  useEffect(() => {
    if (gaId && consent === "granted") load(gaId);
  }, [gaId, consent]);

  if (!gaId || consent !== "unset") return null;

  const lang = navigator.language.toLowerCase().startsWith("ro") ? "ro" : "hu";
  const t = TEXT[lang];

  const choose = (value: Consent) => {
    write(globalThis.localStorage ?? null, value);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return (
    <div className={styles.bar} role="region" aria-label={t.message}>
      <p className={styles.message}>{t.message}</p>
      <div className={styles.actions}>
        <button className={styles.decline} onClick={() => choose("denied")}>{t.decline}</button>
        <button className={styles.accept} onClick={() => choose("granted")}>{t.accept}</button>
      </div>
    </div>
  );
}
