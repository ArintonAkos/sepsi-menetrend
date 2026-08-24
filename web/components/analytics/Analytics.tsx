"use client";

import { useEffect, useSyncExternalStore } from "react";
import { read, write, type Consent } from "@/lib/consent";
import { readLang, LANG_CHANGE_EVENT } from "@/lib/lang";
import type { Lang } from "@/lib/i18n";
import styles from "./Analytics.module.css";

declare global {
  interface Window {
    dataLayer: (unknown[] | IArguments)[];
    gtag?: (...args: unknown[]) => void;
  }
}

const TEXT = {
  hu: {
    title: "Süti (Cookie) hozzájárulás",
    message: "Ez az oldal a Google Analytics segítségével névtelen látogatottsági statisztikákat gyűjt a szolgáltatás minőségének javítása érdekében. Az oldal használatához kérjük, válaszd ki a kívánt beállítást.",
    privacyLink: "Adatkezelési és süti tájékoztatót",
    termsLink: "Felhasználási feltételeket",
    more: "További részletekért olvasd el az",
    and: "és a",
    accept: "Elfogadom",
    decline: "Elutasítom",
  },
  ro: {
    title: "Consimțământ cookie-uri",
    message: "Acest site folosește Google Analytics pentru a măsura traficul în mod anonim în scopul îmbunătățirii calității serviciului. Pentru a utiliza site-ul, vă rugăm să alegeți opțiunea dorită.",
    privacyLink: "Politica de confidențialitate și cookie-uri",
    termsLink: "Termenii și condițiile",
    more: "Pentru mai multe detalii, consultați",
    and: "și",
    accept: "Accept",
    decline: "Refuz",
  },
  en: {
    title: "Cookie consent",
    message: "This site uses Google Analytics to measure traffic anonymously and improve the service. Please choose your preferred option.",
    privacyLink: "privacy and cookie policy",
    termsLink: "terms and conditions",
    more: "For more details, read the",
    and: "and the",
    accept: "Accept",
    decline: "Decline",
  },
};

/* A write from this same tab never fires the native "storage" event - that
   only reaches other tabs. This event is how the choice below reaches
   useSyncExternalStore's snapshot without a setState-in-effect. */
const CHANGE_EVENT = "sepsi:consent";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener(LANG_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener(LANG_CHANGE_EVENT, onChange);
  };
}

function snapshot(): Consent | "unset" {
  return read(globalThis.localStorage ?? null) ?? "unset";
}

function serverSnapshot(): Consent | "unset" {
  return "granted";
}


function load(gaId: string) {
  if (document.getElementById("ga-tag")) return;
  const script = document.createElement("script");
  script.id = "ga-tag";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer ?? [];
  function gtag(..._args: unknown[]) {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", gaId);
}

/** Counts visits, but only once someone has said yes.
 *
 *  Nothing here loads before that: not a cookie, not a script tag, not a
 *  ping. A visitor who never answers, or who declines, is invisible to
 *  Google exactly as they were before this existed.
 */
export default function Analytics({ gaId }: { gaId?: string }) {
  const consent = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const lang = useSyncExternalStore<Lang>(
    subscribe,
    () => readLang(globalThis.localStorage ?? null),
    () => "hu",
  );

  useEffect(() => {
    if (gaId && consent === "granted") load(gaId);
  }, [gaId, consent]);

  useEffect(() => {
    if (gaId && consent === "unset") {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [gaId, consent]);

  if (!gaId || consent !== "unset") return null;

  const t = TEXT[lang];

  const choose = (value: Consent) => {
    write(globalThis.localStorage ?? null, value);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className={styles.card}>
        <h2 id="consent-title" className={styles.title}>{t.title}</h2>
        <p className={styles.message}>
          {t.message}{" "}
          <span className={styles.legalLinks}>
            {t.more} <a href="/privacy/" target="_blank" rel="noopener noreferrer">{t.privacyLink}</a> {t.and}{" "}
            <a href="/terms/" target="_blank" rel="noopener noreferrer">{t.termsLink}</a>.
          </span>
        </p>
        <div className={styles.actions}>
          <button className={styles.decline} onClick={() => choose("denied")}>{t.decline}</button>
          <button className={styles.accept} onClick={() => choose("granted")}>{t.accept}</button>
        </div>
      </div>
    </div>
  );
}
