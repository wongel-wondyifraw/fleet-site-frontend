"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export interface UseClientPagedListResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  setPageSize: (size: number) => void;
  highestKnownPage: number;
  isLastPageReached: boolean;
  totalPages: number;
  isLoading: boolean;
  goToPage: (page: number) => void;
  next: () => void;
  prev: () => void;
  reset: () => void;
}

function clampPageSize(size: number): number {
  if (!Number.isFinite(size)) return 25;
  return Math.min(100, Math.max(1, Math.floor(size)));
}

export function useClientPagedList<T>(
  allItems: T[],
  initialPageSize = 25,
): UseClientPagedListResult<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(() =>
    clampPageSize(initialPageSize),
  );

  const totalPages = useMemo(() => {
    if (allItems.length === 0) return 1;
    return Math.max(1, Math.ceil(allItems.length / pageSize));
  }, [allItems.length, pageSize]);

  const safePage = Math.min(page, totalPages);

  const items = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return allItems.slice(start, start + pageSize);
  }, [allItems, safePage, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const goToPage = useCallback(
    (target: number) => {
      const n = Math.max(1, Math.min(totalPages, Math.floor(target)));
      setPage(n);
    },
    [totalPages],
  );

  const next = useCallback(() => {
    setPage((p) => Math.min(totalPages, p + 1));
  }, [totalPages]);

  const prev = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
  }, []);

  const reset = useCallback(() => {
    setPage(1);
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(clampPageSize(size));
    setPage(1);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [allItems, pageSize]);

  return {
    items,
    page: safePage,
    pageSize,
    setPageSize,
    highestKnownPage: totalPages,
    isLastPageReached: true,
    totalPages,
    isLoading: false,
    goToPage,
    next,
    prev,
    reset,
  };
}
