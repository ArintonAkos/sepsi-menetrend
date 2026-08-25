"use client";

import { useEffect, useId, useState } from "react";
import type { Strings } from "@/lib/i18n";
import styles from "./InstallApp.module.css";

interface InstallPromptEvent extends Event { prompt(): Promise<void>; }

const isStandalone = () => typeof window !== "undefined"
  && (window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isAndroid = () => /android/i.test(navigator.userAgent);

let savedPrompt: InstallPromptEvent | null = null;
const subscribers = new Set<(prompt: InstallPromptEvent | null) => void>();
let listening = false;
function publish(prompt: InstallPromptEvent | null) {
  savedPrompt = prompt;
  subscribers.forEach((subscriber) => subscriber(prompt));
}
function listenForInstall() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    publish(event as InstallPromptEvent);
  });
  window.addEventListener("appinstalled", () => publish(null));
}
listenForInstall();

function DownloadIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
    <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 16v3.5h14V16" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
function ShareIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
    <path d="M12 16V3m0 0L7.5 7.5M12 3l4.5 4.5M5 12v7h14v-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

/** A separate map action, because installing an app is not a preference. */
export default function InstallApp({ t }: { t: Strings }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(() => savedPrompt);
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    listenForInstall();
    subscribers.add(setPrompt);
    setPrompt(savedPrompt);
    return () => { subscribers.delete(setPrompt); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  if (isStandalone()) return null;
  const ios = isIos();
  const canPrompt = prompt !== null;
  const fallback = ios ? null : isAndroid() ? t.installAndroid : t.installUnavailable;

  return <>
    <button type="button" className={styles.trigger} aria-label={t.installApp}
            onClick={() => setOpen(true)}><DownloadIcon /></button>
    {open && <div className={styles.overlay} onMouseDown={(event) => {
      if (event.target === event.currentTarget) setOpen(false);
    }}>
      <section className={styles.card} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button type="button" className={styles.close} aria-label={t.close} onClick={() => setOpen(false)}>×</button>
        <div className={styles.identity}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.logo} src="/icons/icon-192.png" alt="" width={56} height={56} />
          <div><h2 id={titleId}>{t.title}</h2><p>{t.installDescription}</p></div>
        </div>
        {ios ? <ol className={styles.steps}>
          <li><span><ShareIcon /></span>{`1. ${t.installIosStepOne}`}</li>
          <li><b>+</b>{`2. ${t.installIosStepTwo}`}</li>
          <li><b>✓</b>{`3. ${t.installIosStepThree}`}</li>
        </ol> : <p className={styles.fallback}>{fallback}</p>}
        {canPrompt && <button type="button" className={styles.action} onClick={async () => {
          if (!prompt) return;
          await prompt.prompt();
          publish(null);
          setOpen(false);
        }}><DownloadIcon />{t.installNow}</button>}
      </section>
    </div>}
  </>;
}
