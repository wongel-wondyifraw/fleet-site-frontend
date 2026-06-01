"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "@/lib/icons";

import { Select } from "@/components/ui/select";
import { CURSOR_PAGE_SIZE_OPTIONS } from "@/lib/api/useCursorPagedList";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  page: number;
  pageSize: number;
  highestKnownPage: number;
  totalPages: number | undefined;
  isLastPageReached: boolean;
  isLoading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  className?: string;
}

function buildPageNumbers(
  page: number,
  highestKnownPage: number,
  totalPages: number | undefined,
  isLastPageReached: boolean,
): (number | "ellipsis")[] {
  const maxKnown = isLastPageReached && totalPages !== undefined
    ? totalPages
    : highestKnownPage;

  if (maxKnown <= 7) {
    return Array.from({ length: maxKnown }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, maxKnown, page]);
  if (page > 1) pages.add(page - 1);
  if (page < maxKnown) pages.add(page + 1);

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const result: (number | "ellipsis")[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push("ellipsis");
    }
    result.push(sorted[i]);
  }
  return result;
}

export function Pagination({
  page,
  pageSize,
  highestKnownPage,
  totalPages,
  isLastPageReached,
  isLoading = false,
  onPageChange,
  onPageSizeChange,
  className,
}: PaginationProps) {
  // Suppress the control when there's nothing to paginate. We only know this
  // once the last page is reached (cursor lists) or always for client-paged
  // lists. Cursor lists with only one page never have `nextCursor`, so this
  // flips on immediately after the first response.
  if (isLastPageReached && (totalPages ?? 1) <= 1) {
    return null;
  }

  const pageLabel =
    isLastPageReached && totalPages !== undefined
      ? `Page ${page} of ${totalPages}`
      : `Page ${page} of ${highestKnownPage}+`;

  const canPrev = page > 1 && !isLoading;
  const canNext =
    !isLoading &&
    (!isLastPageReached || totalPages === undefined || page < totalPages);

  const pageNumbers = buildPageNumbers(
    page,
    highestKnownPage,
    totalPages,
    isLastPageReached,
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground tabular-nums">{pageLabel}</p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!canPrev}
          aria-label="Previous page"
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft className="size-3.5" aria-hidden />
          Prev
        </button>

        <div className="flex flex-wrap items-center gap-1">
          {pageNumbers.map((entry, idx) =>
            entry === "ellipsis" ? (
              <span
                key={`ellipsis-${idx}`}
                className="px-1 text-xs text-muted-foreground"
              >
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => onPageChange(entry)}
                disabled={isLoading || entry === page}
                aria-label={`Page ${entry}`}
                aria-current={entry === page ? "page" : undefined}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-lg text-xs font-semibold tabular-nums transition-colors",
                  entry === page
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-slate-200 bg-white text-primary hover:bg-slate-50 disabled:opacity-50",
                )}
              >
                {entry}
              </button>
            ),
          )}
          {isLoading && (
            <Loader2 className="ml-1 size-4 animate-spin text-muted-foreground" />
          )}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!canNext}
          aria-label="Next page"
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
          <ChevronRight className="size-3.5" />
        </button>

        <div className="ml-1 w-[7.5rem]">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
            disabled={isLoading}
            size="sm"
            aria-label="Rows per page"
            searchable={false}
            options={CURSOR_PAGE_SIZE_OPTIONS.map((n) => ({
              value: String(n),
              label: `${n} / page`,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
