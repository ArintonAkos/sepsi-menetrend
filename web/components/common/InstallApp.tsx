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

/** Browser-native installation where possible, accurate instructions on iOS. */
export default function InstallApp({ t, compact = false }: {
  t: Strings;
  compact?: boolean;
}) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISSED_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const installed = () => { setPrompt(null); setDismissed(true); };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (dismissed || isStandalone()) return null;
  if (prompt) return (
    <button type="button" onClick={async () => {
      await prompt.prompt();
      setPrompt(null);
      try { localStorage.setItem(DISMISSED_KEY, "1"); } catch {}
      setDismissed(true);
    }}>
      {t.installApp}
    </button>
  );
  if (isIos()) return <p role="status">{compact ? t.installApp : t.installIos}</p>;
  return null;
}
