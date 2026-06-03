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

    // How often to poll for a newer service worker while the app stays open.
    // Without this, an installed PWA (or a tab left open for hours) only
    // discovers a deploy on a full page load, so it can keep running stale
    // JavaScript against a newer backend — exactly the skew that produced
    // the "property X should not exist" 400s. One minute is frequent enough
    // to reach open sessions quickly and cheap enough to be network noise.
    const UPDATE_INTERVAL_MS = 60_000;

    let registration: ServiceWorkerRegistration | null = null;
    let intervalId: number | undefined;
    let disposed = false;

    // Ask the browser to re-fetch /sw.js and compare bytes. If it changed,
    // `updatefound` fires below and we activate the new worker immediately.
    const checkForUpdate = () => {
      // Skip while offline so we don't spam failed requests.
      if (!registration || navigator.onLine === false) return;
      registration.update().catch(() => {
        /* transient / offline — the next tick will retry */
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };

    // Production registration. We wait for the `load` event so the SW
    // install never competes with the initial page render for bandwidth.
    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          if (disposed) return;
          registration = reg;

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
          if (reg.waiting) {
            reg.waiting.postMessage("SKIP_WAITING");
          }

          reg.addEventListener("updatefound", () => {
            const installing = reg.installing;
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

          // Proactively poll for new deploys, and check again whenever the
          // user returns to the tab, so long-lived sessions stay current
          // without needing a manual hard refresh.
          intervalId = window.setInterval(checkForUpdate, UPDATE_INTERVAL_MS);
          document.addEventListener("visibilitychange", onVisibilityChange);
          window.addEventListener("focus", checkForUpdate);
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
    }

    return () => {
      disposed = true;
      if (intervalId !== undefined) window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", checkForUpdate);
      window.removeEventListener("load", onLoad);
    };
  }, []);

  return null;
}
