/* FleetSite service worker.
 *
 * Goals:
 *   1. Make the site installable (Chrome / Edge / Android need an active SW).
 *   2. Provide a graceful offline fallback for navigations.
 *   3. Cache daily-computed site-health API responses (per-user, TTL + SWR).
 *
 * Strategy:
 *   - Pre-cache a small "offline shell" so the user sees a friendly page
 *     when they're offline instead of the browser's chrome error screen.
 *   - For HTML page navigations: network-first, fall back to /offline.
 *   - For same-origin static assets (Next.js _next/* output, images, fonts,
 *     SVGs, etc.): stale-while-revalidate so repeat visits are fast.
 *   - For allowlisted cross-origin GET /api/sites/health* (with Bearer auth):
 *     stale-while-revalidate with a multi-hour TTL, keyed per Authorization hash.
 *   - All other requests: pass through to the network.
 *
 * Bump CACHE_VERSION whenever this file or the pre-cached list changes so
 * old caches get cleaned up on activate.
 */

const CACHE_VERSION = "fleetsite-v5";
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const PRECACHE = `${CACHE_VERSION}-precache`;
const API_CACHE = `${CACHE_VERSION}-api`;

/** How long a cached health response is served without hitting the network. */
const API_TTL_MS = 3 * 60 * 60 * 1000;

// Minimal list of files needed for the offline experience. Keep this small:
// every entry has to download successfully or install() fails.
const PRECACHE_URLS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/maskable-icon-192.png",
  "/maskable-icon-512.png",
];

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

async function hashAuthHeader(authHeader) {
  const data = new TextEncoder().encode(authHeader);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** GETs for daily site-health scores only (backend :3001/api). */
function isCacheableHealthApi(request) {
  if (request.method !== "GET") return false;
  const path = new URL(request.url).pathname;
  if (path === "/api/sites/health") return true;
  if (path === "/api/sites/health/overview") return true;
  if (/^\/api\/sites\/health\/[^/]+\/history$/.test(path)) return true;
  return false;
}

/** Cache key includes auth hash so users on a shared device never collide. */
async function buildCacheKeyRequest(request, authHeader) {
  const authHash = await hashAuthHeader(authHeader);
  const url = new URL(request.url);
  url.searchParams.set("__sw_auth", authHash.slice(0, 32));
  return new Request(url.toString(), {
    method: "GET",
    headers: request.headers,
  });
}

async function revalidateHealthApi(request, cache, keyRequest) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const headers = new Headers(response.headers);
      headers.set("sw-cached-at", String(Date.now()));
      const body = await response.clone().blob();
      await cache.put(
        keyRequest,
        new Response(body, { status: response.status, headers }),
      );
    }
    return response;
  } catch (err) {
    return undefined;
  }
}

async function handleHealthApi(request, authHeader) {
  const cache = await caches.open(API_CACHE);
  const keyRequest = await buildCacheKeyRequest(request, authHeader);
  const cached = await cache.match(keyRequest);

  const cachedAt = cached ? Number(cached.headers.get("sw-cached-at") || 0) : 0;
  const ageMs = cached ? Date.now() - cachedAt : Infinity;

  if (cached && ageMs < API_TTL_MS) {
    return cached;
  }

  const networkPromise = revalidateHealthApi(request, cache, keyRequest);

  if (cached) {
    void networkPromise;
    return cached;
  }

  const network = await networkPromise;
  if (network) return network;

  return new Response("Offline", {
    status: 503,
    headers: { "Content-Type": "text/plain" },
  });
}

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

  // Daily site-health API (cross-origin backend): per-user TTL + SWR.
  if (isCacheableHealthApi(request)) {
    const auth = request.headers.get("Authorization");
    if (!auth) return;
    event.respondWith(handleHealthApi(request, auth));
    return;
  }

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
    return;
  }
  if (event.data === "PURGE_API_CACHE") {
    event.waitUntil(caches.delete(API_CACHE));
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  event.waitUntil(
    (async () => {
      try {
        const payload = event.data.json();
        const title = payload?.title || "FleetSite notification";
        const body = payload?.body || "";
        const href = payload?.href || "/notifications";
        const tag = payload?.tag || payload?.notificationId || undefined;
        await self.registration.showNotification(title, {
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag,
          renotify: false,
          data: { href },
        });
      } catch {
        // Best-effort.
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification?.data?.href || "/notifications";
  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) {
            await client.navigate(href);
          }
          return;
        }
      }
      await clients.openWindow(href);
    })(),
  );
});
