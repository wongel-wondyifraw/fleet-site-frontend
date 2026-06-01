"use client";

import { CircleCheck, Filter } from "@/lib/icons";
import { useEffect, useRef, useState } from "react";

import { TRIP_STATUSES, prettyEnum, type TripStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export function TripStatusFilterMenu({
  value,
  onChange,
}: {
  value: TripStatus | "ALL";
  onChange: (next: TripStatus | "ALL") => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const options: { id: TripStatus | "ALL"; label: string }[] = [
    { id: "ALL", label: "All statuses" },
    ...TRIP_STATUSES.map((status) => ({
      id: status,
      label: prettyEnum(status),
    })),
  ];

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter by status"
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-xl border transition-colors",
          value === "ALL"
            ? "border-slate-200 bg-white text-muted-foreground hover:bg-slate-50 hover:text-primary"
            : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10",
          "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25",
        )}
      >
        <Filter className="size-4" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Status filter options"
          className="absolute top-full right-0 z-30 mt-1.5 min-w-48 rounded-xl border border-primary/20 bg-white p-1.5 shadow-lg shadow-primary/10"
        >
          {options.map((opt) => {
            const isActive = value === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "text-primary/80 hover:bg-primary/10 hover:text-primary",
                )}
              >
                <span>{opt.label}</span>
                <CircleCheck
                  className={cn(
                    "size-4 shrink-0 transition-opacity",
                    isActive ? "opacity-100" : "opacity-0",
                  )}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
