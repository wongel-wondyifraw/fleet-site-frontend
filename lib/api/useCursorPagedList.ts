"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PageResponse } from "@/lib/api/pagination";

export const CURSOR_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export interface UseCursorPagedListOptions<T, M> {
  fetchPage: (
    cursor: string | undefined,
    limit: number,
  ) => Promise<PageResponse<T, M>>;
  /** When any dep changes, cache resets and page 1 is re-fetched. */
  deps?: readonly unknown[];
  initialPageSize?: number;
  enabled?: boolean;
}

export interface UseCursorPagedListResult<T, M> {
  items: T[];
  meta: M | undefined;
  page: number;
  pageSize: number;
  setPageSize: (size: number) => void;
  highestKnownPage: number;
  isLastPageReached: boolean;
  totalPages: number | undefined;
  isLoading: boolean;
  error: Error | null;
  goToPage: (page: number) => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  reset: () => void;
  reload: () => Promise<void>;
}

function clampPageSize(size: number): number {
  if (!Number.isFinite(size)) return 25;
  return Math.min(100, Math.max(1, Math.floor(size)));
}

interface CursorCache {
  /** pageCursors[i] is the cursor to fetch page i+1; index 0 is always undefined. */
  pageCursors: (string | undefined)[];
  lastPage: number | null;
}

function createEmptyCache(): CursorCache {
  return { pageCursors: [undefined], lastPage: null };
}

export function useCursorPagedList<T, M = undefined>({
  fetchPage,
  deps = [],
  initialPageSize = 25,
  enabled = true,
}: UseCursorPagedListOptions<T, M>): UseCursorPagedListResult<T, M> {
  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState<M | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(() =>
    clampPageSize(initialPageSize),
  );
  const [highestKnownPage, setHighestKnownPage] = useState(1);
  const [isLastPageReached, setIsLastPageReached] = useState(false);
  const [totalPages, setTotalPages] = useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const cacheRef = useRef<CursorCache>(createEmptyCache());
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;
  const requestIdRef = useRef(0);

  const syncCacheToState = useCallback((cache: CursorCache) => {
    const known =
      cache.lastPage !== null
        ? cache.lastPage
        : Math.max(1, cache.pageCursors.length);
    setHighestKnownPage(known);
    setIsLastPageReached(cache.lastPage !== null);
    setTotalPages(cache.lastPage ?? undefined);
  }, []);

  const applyResponseToCache = useCallback(
    (pageNumber: number, res: PageResponse<T, M>) => {
      const cache = cacheRef.current;
      if (res.nextCursor) {
        const next = [...cache.pageCursors];
        next[pageNumber] = res.nextCursor;
        cache.pageCursors = next;
        cache.lastPage = null;
      } else {
        cache.pageCursors = cache.pageCursors.slice(0, pageNumber);
        cache.lastPage = pageNumber;
      }
      syncCacheToState(cache);
    },
    [syncCacheToState],
  );

  const resetCache = useCallback(() => {
    cacheRef.current = createEmptyCache();
    syncCacheToState(cacheRef.current);
    setPage(1);
  }, [syncCacheToState]);

  const fetchPageAt = useCallback(
    async (
      targetPage: number,
      limit: number,
    ): Promise<PageResponse<T, M> | null> => {
      const requestId = ++requestIdRef.current;
      const cache = cacheRef.current;

      let effectiveTarget = Math.max(1, targetPage);
      if (cache.lastPage !== null && effectiveTarget > cache.lastPage) {
        effectiveTarget = cache.lastPage;
      }

      try {
        while (
          cache.pageCursors.length < effectiveTarget &&
          cache.lastPage === null
        ) {
          const pageToDiscover = cache.pageCursors.length;
          const cursor = cache.pageCursors[pageToDiscover - 1];
          const res = await fetchPageRef.current(cursor, limit);
          if (requestId !== requestIdRef.current) return null;
          applyResponseToCache(pageToDiscover, res);
          if (cache.lastPage !== null) break;
        }

        if (cache.lastPage !== null && effectiveTarget > cache.lastPage) {
          effectiveTarget = cache.lastPage;
        }

        const cursor = cache.pageCursors[effectiveTarget - 1];
        const res = await fetchPageRef.current(cursor, limit);
        if (requestId !== requestIdRef.current) return null;

        applyResponseToCache(effectiveTarget, res);
        setItems(res.data);
        setMeta(res.meta);
        setPage(effectiveTarget);
        setError(null);
        return res;
      } catch (err) {
        if (requestId !== requestIdRef.current) return null;
        setError(err instanceof Error ? err : new Error(String(err)));
        return null;
      }
    },
    [applyResponseToCache],
  );

  const runLoad = useCallback(
    async (targetPage: number) => {
      if (!enabled) return;
      setIsLoading(true);
      try {
        await fetchPageAt(targetPage, pageSize);
      } finally {
        setIsLoading(false);
      }
    },
    [enabled, fetchPageAt, pageSize],
  );

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    resetCache();
    setItems([]);
    setMeta(undefined);
    setError(null);
    void runLoad(1);
  }, [resetCache, runLoad]);

  const reload = useCallback(async () => {
    await runLoad(page);
  }, [runLoad, page]);

  const goToPage = useCallback(
    async (target: number) => {
      if (!enabled || target < 1) return;
      await runLoad(target);
    },
    [enabled, runLoad],
  );

  const next = useCallback(async () => {
    const cache = cacheRef.current;
    if (cache.lastPage !== null && page >= cache.lastPage) return;
    await goToPage(page + 1);
  }, [goToPage, page]);

  const prev = useCallback(async () => {
    if (page <= 1) return;
    await goToPage(page - 1);
  }, [goToPage, page]);

  const setPageSize = useCallback(
    (size: number) => {
      setPageSizeState(clampPageSize(size));
    },
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    requestIdRef.current += 1;
    resetCache();
    setItems([]);
    setMeta(undefined);
    setError(null);
    const t = window.setTimeout(() => {
      void runLoad(1);
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps array is intentional reset trigger
  }, [enabled, pageSize, ...deps]);

  return {
    items,
    meta,
    page,
    pageSize,
    setPageSize,
    highestKnownPage,
    isLastPageReached,
    totalPages,
    isLoading,
    error,
    goToPage,
    next,
    prev,
    reset,
    reload,
  };
}
