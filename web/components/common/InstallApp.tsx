"use client";

import { useEffect, useState } from "react";
import type { Strings } from "@/lib/i18n";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

const DISMISSED_KEY = "sepsi.install.dismissed";

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
export default function InstallApp({ t, compact = false }: {
  t: Strings;
  compact?: boolean;
}) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(() => savedPrompt);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISSED_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    listenForInstall();
    subscribers.add(setPrompt);
    setPrompt(savedPrompt);
    return () => {
      subscribers.delete(setPrompt);
    };
  }, []);

  if (dismissed || isStandalone()) return null;
  if (prompt) return (
    <button type="button" onClick={async () => {
      await prompt.prompt();
      publish(null);
      try { localStorage.setItem(DISMISSED_KEY, "1"); } catch {}
      setDismissed(true);
    }}>
      {t.installApp}
    </button>
  );
  if (isIos()) return <p role="status">{compact ? t.installApp : t.installIos}</p>;
  return null;
}
