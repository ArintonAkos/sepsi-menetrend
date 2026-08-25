"use client";

import { useEffect, useState } from "react";
import type { Strings } from "@/lib/i18n";
import styles from "./InstallApp.module.css";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

const isStandalone = () =>
  typeof window !== "undefined"
  && (window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/* `beforeinstallprompt` is fired once, usually during page load. Settings is
 * opened later, so the offer must live at app scope instead of belonging to a
 * particular settings-popup mount. */
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

/* Planner imports this client component on the initial screen, long before a
 * rider opens Settings. Register at import time so the browser's one-off event
 * cannot be missed. */
listenForInstall();

/** Browser-native installation where possible, accurate instructions on iOS. */
export default function InstallApp({ t }: { t: Strings }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(() => savedPrompt);

  useEffect(() => {
    listenForInstall();
    subscribers.add(setPrompt);
    setPrompt(savedPrompt);
    return () => {
      subscribers.delete(setPrompt);
    };
  }, []);

  if (isStandalone()) {
    return <p className={styles.installed} role="status">{t.installInstalled}</p>;
  }
  const canPrompt = prompt !== null;
  const note = isIos() ? t.installIos : t.installUnavailable;
  return (
    <div className={styles.offer}>
      <button type="button" className={styles.button} disabled={!canPrompt}
              aria-describedby={canPrompt ? undefined : "install-note"}
              onClick={async () => {
                if (!prompt) return;
                await prompt.prompt();
                publish(null);
              }}>
        {t.installApp}
      </button>
      {!canPrompt && <p id="install-note" className={styles.note} role="status">{note}</p>}
    </div>
  );
}
