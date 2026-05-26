/* FleetSite service worker.
 *
 * Goals:
 *   1. Make the site installable (Chrome / Edge / Android need an active SW).
 *   2. Provide a graceful offline fallback for navigations.
 *   3. Avoid stale-caching: API responses are NEVER cached here - we always
 *      go to the network so authenticated /api/* calls behave correctly.
 *
 * Strategy:
 *   - Pre-cache a small "offline shell" so the user sees a friendly page
 *     when they're offline instead of the browser's chrome error screen.
 *   - For HTML page navigations: network-first, fall back to /offline.
 *   - For same-origin static assets (Next.js _next/* output, images, fonts,
 *     SVGs, etc.): stale-while-revalidate so repeat visits are fast.
 *   - Everything else (cross-origin, API): pass through to the network.
 *
 * Bump CACHE_VERSION whenever this file or the pre-cached list changes so
 * old caches get cleaned up on activate.
 */

const CACHE_VERSION = "fleetsite-v1";
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const PRECACHE = `${CACHE_VERSION}-precache`;

// Minimal list of files needed for the offline experience. Keep this small:
// every entry has to download successfully or install() fails.
const PRECACHE_URLS = ["/offline.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => !name.startsWith(CACHE_VERSION))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

// Helper: should we treat this request as a same-origin static asset that's
// safe to cache in the background? We skip API calls and anything that isn't
// a GET request.
function isCacheableAsset(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  // Cache Next.js build output, public assets, and common asset extensions.
  if (url.pathname.startsWith("/_next/")) return true;
  if (/\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|webp|ico|gif)$/i.test(url.pathname)) {
    return true;
  }
  return false;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GETs - never interfere with POST/PATCH/etc.
  if (request.method !== "GET") return;

  // Page navigations: network-first, fall back to the offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          return fresh;
        } catch {
          const cache = await caches.open(PRECACHE);
          const offline = await cache.match("/offline.html");
          return (
            offline ||
            new Response("Offline", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        }
      })(),
    );
    return;
  }

  // Static same-origin assets: stale-while-revalidate.
  if (isCacheableAsset(request)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            // Only cache successful responses.
            if (response && response.status === 200 && response.type === "basic") {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkPromise;
      })(),
    );
    return;
  }

  // Everything else: pass through.
});

// Optional: allow the page to ask the SW to activate immediately after an
// update so users don't have to wait for tab close. ServiceWorkerRegister
// triggers this on `controllerchange`.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
