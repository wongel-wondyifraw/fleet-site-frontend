"use client";

import { Calendar } from "@/lib/icons";
import { useRef } from "react";

import { fieldClass } from "@/components/settings/SettingsShared";
import type { DateFilter } from "@/lib/attendance/attendanceHelpers";
import { toLocalDateKey } from "@/lib/attendance/attendanceHelpers";
import { cn } from "@/lib/utils";

export function AttendanceDateTabs({
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
  const dateInputRef = useRef<HTMLInputElement>(null);
  const tabs: { id: DateFilter; label: string }[] = [
    { id: "TODAY", label: "Today" },
    { id: "YESTERDAY", label: "Yesterday" },
    { id: "CUSTOM", label: "Choose Date" },
  ];

  function handleTabClick(next: DateFilter) {
    onChange(next);
    if (next === "CUSTOM") {
      window.setTimeout(() => {
        dateInputRef.current?.focus();
        const el = dateInputRef.current as
          | (HTMLInputElement & { showPicker?: () => void })
          | null;
        el?.showPicker?.();
      }, 0);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div
        role="tablist"
        aria-label="Filter attendance by date"
        className="inline-flex w-full items-center rounded-xl border border-primary/20 bg-primary/5 p-1 shadow-sm shadow-primary/10 sm:w-auto"
      >
        {tabs.map((tab) => {
          const isActive = value === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:flex-initial",
                isActive
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-primary/80 hover:bg-primary/10 hover:text-primary",
              )}
            >
              {tab.id === "CUSTOM" && <Calendar className="size-3.5" />}
              {tab.label}
            </button>
          );
        })}
      </div>
      {value === "CUSTOM" && (
        <div className="relative w-full sm:w-48">
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
  );
}
