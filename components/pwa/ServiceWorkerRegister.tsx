"use client";

// Registers the FleetSite service worker on first mount of the app.
//
// The registration runs only in production builds because Next.js's dev
// server hot-reloading interacts poorly with cached responses (the SW would
// serve a stale chunk and you'd get blank pages on save). To test PWA
// behaviour locally, run `npm run build && npm run start` instead of `dev`.
//
// We also explicitly unregister any existing SW in development so a
// previously installed worker from a prod build doesn't haunt dev sessions.
import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // In development: tear down any leftover SW from a previous prod build
    // so HMR works cleanly. No-op the first time.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          registrations.forEach((r) => r.unregister());
        })
        .catch(() => {
          /* best-effort, nothing to do */
        });
      return;
    }

    // Production registration. We wait for the `load` event so the SW
    // install never competes with the initial page render for bandwidth.
    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          // When a new SW takes control mid-session (e.g. after a deploy),
          // reload once so the user gets the fresh assets immediately.
          let refreshing = false;
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
          });

          // If there's already a waiting worker (i.e. the user kept the tab
          // open while a deploy happened), prompt it to activate.
          if (registration.waiting) {
            registration.waiting.postMessage("SKIP_WAITING");
          }

          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (
                installing.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                // New version available - activate immediately.
                installing.postMessage("SKIP_WAITING");
              }
            });
          });
        })
        .catch((err) => {
          // Don't crash the app if SW registration fails - the site still
          // works without it, you just lose offline / installability.
          console.warn("Service worker registration failed:", err);
        });
    };

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);

  return null;
}
