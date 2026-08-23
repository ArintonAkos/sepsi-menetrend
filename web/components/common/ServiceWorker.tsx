"use client";

import { useEffect } from "react";

/** Registers the offline worker, quietly.
 *
 *  Nothing depends on it: if registration fails, or the browser has no service
 *  workers, the app carries on exactly as before. It only ever adds the ability
 *  to open without a network.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;   // no stale shell in dev
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
