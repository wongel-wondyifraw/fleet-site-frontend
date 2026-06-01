"use client";

import { useEffect } from "react";

const WAKE_THROTTLE_MS = 10 * 60 * 1000;
const WAKE_STORAGE_KEY = "fleetsite:last-backend-wake";

function resolveWakeUrl(): string | null {
  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!apiBase) return null;
  return `${apiBase}/wake`;
}

function shouldPingBackend(now: number): boolean {
  try {
    const previous = Number(window.localStorage.getItem(WAKE_STORAGE_KEY));
    if (Number.isFinite(previous) && now - previous < WAKE_THROTTLE_MS) {
      return false;
    }
    window.localStorage.setItem(WAKE_STORAGE_KEY, String(now));
  } catch {
    // If storage is blocked, still allow the best-effort wake request.
  }
  return true;
}

export function BackendWakePing() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    const wakeUrl = resolveWakeUrl();
    if (!wakeUrl || !shouldPingBackend(Date.now())) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);

    fetch(wakeUrl, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    })
      .catch(() => {
        // Waking the backend is opportunistic; real API calls still handle errors.
      })
      .finally(() => window.clearTimeout(timeoutId));

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  return null;
}
