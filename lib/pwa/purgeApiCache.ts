/**
 * Ask the service worker to drop cached site-health API responses.
 * Call on logout / 401 and after scoring-config saves that recompute scores.
 */
export function purgeApiCache(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const post = (worker: ServiceWorker | null) => {
    worker?.postMessage("PURGE_API_CACHE");
  };

  post(navigator.serviceWorker.controller);
  void navigator.serviceWorker.ready.then((reg) => {
    post(reg.active);
  });
}
