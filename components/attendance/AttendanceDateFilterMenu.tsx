"use client";

import { Calendar, ChevronDown } from "@/lib/icons";
import { useEffect, useRef, useState } from "react";

import { fieldClass } from "@/components/settings/SettingsShared";
import type { DateFilter } from "@/lib/attendance/attendanceHelpers";
import { toLocalDateKey } from "@/lib/attendance/attendanceHelpers";
import { cn } from "@/lib/utils";

export function AttendanceDateFilterMenu({
  value,
  onChange,
  customDate,
  onCustomDateChange,
}: {
  value: DateFilter;
  onChange: (next: DateFilter) => void;
  customDate: string;
  onCustomDateChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

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

  const activeLabel =
    value === "TODAY"
      ? "Today"
      : value === "YESTERDAY"
        ? "Yesterday"
        : customDate || "Choose date";

  const options: { id: DateFilter; label: string }[] = [
    { id: "TODAY", label: "Today" },
    { id: "YESTERDAY", label: "Yesterday" },
    { id: "CUSTOM", label: "Choose Date" },
  ];

  function handleSelect(next: DateFilter) {
    onChange(next);
    if (next === "CUSTOM") {
      window.setTimeout(() => {
        dateInputRef.current?.focus();
        const el = dateInputRef.current as
          | (HTMLInputElement & { showPicker?: () => void })
          | null;
        el?.showPicker?.();
      }, 0);
    } else {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter by date"
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 text-sm font-semibold text-primary transition-colors",
          "hover:bg-primary/10 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25",
        )}
      >
        <Calendar className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-left">{activeLabel}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-primary transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Date filter options"
          className="absolute top-full right-0 left-0 z-30 mt-1.5 rounded-xl border border-primary/20 bg-white p-1.5 shadow-lg shadow-primary/10"
        >
          {options.map((opt) => {
            const isActive = value === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(opt.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "text-primary/80 hover:bg-primary/10 hover:text-primary",
                )}
              >
                {opt.id === "CUSTOM" && <Calendar className="size-4" />}
                {opt.label}
              </button>
            );
          })}
          {value === "CUSTOM" && (
            <div className="relative mt-1.5">
              <Calendar className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-primary" />
              <input
                ref={dateInputRef}
                type="date"
                value={customDate}
                onChange={(e) => onCustomDateChange(e.target.value)}
                max={toLocalDateKey(new Date())}
                aria-label="Pick a date"
                className={cn(
                  fieldClass,
                  "border-primary/30 bg-primary/5 pl-9 text-primary focus:border-primary focus:ring-primary/40",
                )}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
