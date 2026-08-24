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
    if (process.env.NODE_ENV !== "production") {
      /* A worker registered by a production build keeps controlling the same
         localhost origin after switching to `next dev`. Its cache strategy
         cannot serve Turbopack's virtual module URLs, so remove it once and
         reload into the real development server. */
      const wasControlled = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .then(() => caches.keys())
        .then((names) => Promise.all(names.filter((name) => name.startsWith("sepsi-")).map((name) => caches.delete(name))))
        .then(() => { if (wasControlled) window.location.reload(); })
        .catch(() => {});
      return;
    }
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
