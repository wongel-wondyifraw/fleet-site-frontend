"use client";

import { useEffect, useState } from "react";

// Mirrors Tailwind's `lg` breakpoint used across mobile/desktop splits.
export const DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";

/**
 * Subscribes to `window.matchMedia`. Returns `null` until the first client
 * measurement so callers can avoid rendering the wrong viewport branch
 * during SSR / hydration.
 */
export function useMediaQuery(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const sync = () => setMatches(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, [query]);

  return matches;
}
