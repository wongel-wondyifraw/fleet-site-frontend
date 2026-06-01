"use client";

import {
  ChevronDown,
  Clock,
  Coffee,
  Loader2,
  LogIn,
  LogOut,
  Save,
  Timer,
} from "@/lib/icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  FieldGrid,
  SettingsField,
  fieldClass,
} from "@/components/settings/SettingsShared";
import { Button } from "@/components/ui/button";
import { PanelError } from "@/components/vehicles/VehicleForm";
import { ApiError } from "@/lib/api/client";
import {
  getAttendanceRules,
  updateAttendanceRules,
} from "@/lib/api/attendanceRules";
import type { ApiAttendanceRules } from "@/lib/api/types";
import { DEFAULT_TARGET_HOURS } from "@/lib/attendance-targets";
import { useTimeSettings } from "@/lib/time/TimeSettingsContext";
import { useToast } from "@/lib/toast/ToastContext";
import { cn } from "@/lib/utils";

type Period = "AM" | "PM";

// Hour / minute option lists driving the dropdown columns. We surface
// every valid value so the popover behaves like a true picker rather
// than a suggestion list.
const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES_ALL = Array.from({ length: 60 }, (_, i) => i);

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function splitTime24(value: string): { hour: number; minute: number } {
  const [rawH, rawM] = value.split(":");
  const hour = Number.parseInt(rawH ?? "", 10);
  const minute = Number.parseInt(rawM ?? "", 10);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

// Convert a 24-hour HH:MM into a 12-hour display + period. Mirrors how
// the rest of the dashboard renders timestamps when the global time
// format is "12".
function to12h(value: string): { hour: number; minute: number; period: Period } {
  const { hour, minute } = splitTime24(value);
  const period: Period = hour >= 12 ? "PM" : "AM";
  const hour12 = ((hour + 11) % 12) + 1;
  return { hour: hour12, minute, period };
}

// Recombine a 12-hour hour + period into a 24-hour HH:MM, used when we
// commit the picker state back to the parent draft.
function from12h(hour12: number, minute: number, period: Period): string {
  const safeHour = Math.max(1, Math.min(12, hour12));
  const safeMinute = Math.max(0, Math.min(59, minute));
  let hour24 = safeHour % 12;
  if (period === "PM") hour24 += 12;
  return `${String(hour24).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function validateSchedule(draft: ApiAttendanceRules): string | null {
  const dayIn = timeToMinutes(draft.dayInTime);
  const lunchOut = timeToMinutes(draft.lunchOutTime);
  const lunchIn = timeToMinutes(draft.lunchInTime);
  const dayOut = timeToMinutes(draft.dayOutTime);

  if (!(dayIn <= lunchOut && lunchOut <= lunchIn && lunchIn <= dayOut)) {
    return "Schedule times must follow Day in ≤ Lunch out ≤ Lunch in ≤ Day out.";
  }

  if (
    !Number.isFinite(draft.targetHours) ||
    draft.targetHours < 0 ||
    draft.targetHours > 24
  ) {
    return "Target hours must be between 0 and 24.";
  }

  return null;
}

export function AttendanceRulesPanel({
  density = "comfortable",
}: {
  density?: "comfortable" | "compact";
}) {
  const { showToast } = useToast();
  const { settings: timeSettings } = useTimeSettings();
  const [draft, setDraft] = useState<ApiAttendanceRules>({
    dayInTime: "08:00",
    lunchOutTime: "12:00",
    lunchInTime: "13:00",
    dayOutTime: "17:00",
    targetHours: DEFAULT_TARGET_HOURS,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const rules = await getAttendanceRules();
      setDraft(rules);
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? err.message
          : "Unable to load attendance rules.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

  function updateField<K extends keyof ApiAttendanceRules>(
    key: K,
    value: ApiAttendanceRules[K],
  ) {
    setFormError(null);
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    const validationError = validateSchedule(draft);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      const saved = await updateAttendanceRules(draft);
      setDraft(saved);
      showToast({ variant: "success", message: "Attendance rules saved." });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Unable to save attendance rules.";
      setFormError(message);
      showToast({ variant: "error", message });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-8">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError) {
    return <PanelError message={loadError} />;
  }

  const timeFormat = timeSettings.timeFormat;

  return (
    <div className="space-y-4 fs-panel-in">
      <p className="text-sm text-muted-foreground">
        Configure the expected daily schedule and working-hours target used by
        the attendance roster and driver detail pages.
      </p>

      {formError ? <PanelError message={formError} /> : null}

      <FieldGrid>
        <SettingsField
          label="Day check-in"
          hint="Expected time drivers start their shift."
          icon={LogIn}
        >
          <TimePicker
            value={draft.dayInTime}
            onChange={(next) => updateField("dayInTime", next)}
            ariaLabel="Day check-in time"
            timeFormat={timeFormat}
          />
        </SettingsField>
        <SettingsField
          label="Lunch check-out"
          hint="Expected time drivers leave for lunch."
          icon={Coffee}
        >
          <TimePicker
            value={draft.lunchOutTime}
            onChange={(next) => updateField("lunchOutTime", next)}
            ariaLabel="Lunch check-out time"
            timeFormat={timeFormat}
          />
        </SettingsField>
        <SettingsField
          label="Lunch check-in"
          hint="Expected time drivers return from lunch."
          icon={Coffee}
        >
          <TimePicker
            value={draft.lunchInTime}
            onChange={(next) => updateField("lunchInTime", next)}
            ariaLabel="Lunch check-in time"
            timeFormat={timeFormat}
          />
        </SettingsField>
        <SettingsField
          label="Day check-out"
          hint="Expected time drivers finish their shift."
          icon={LogOut}
        >
          <TimePicker
            value={draft.dayOutTime}
            onChange={(next) => updateField("dayOutTime", next)}
            ariaLabel="Day check-out time"
            timeFormat={timeFormat}
          />
        </SettingsField>
        <SettingsField
          label="Target working hours"
          hint="Daily hours target per driver for worked-hours tracking."
          icon={Timer}
        >
          <input
            type="number"
            min={0}
            max={24}
            step={0.5}
            value={draft.targetHours}
            onChange={(e) => {
              const parsed = Number.parseFloat(e.target.value);
              if (!Number.isFinite(parsed)) return;
              updateField("targetHours", Math.max(0, Math.min(24, parsed)));
            }}
            aria-label="Target working hours per day"
            className={fieldClass}
          />
        </SettingsField>
      </FieldGrid>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="h-10 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint"
        >
          {isSaving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save rules
        </Button>
      </div>

      {density === "compact" ? null : (
        <p className="text-xs text-muted-foreground">
          These rules apply globally to all sites. Time inputs follow the{" "}
          <span className="font-semibold text-primary">
            {timeFormat === "12" ? "12-hour" : "24-hour"}
          </span>{" "}
          format set under{" "}
          <span className="font-semibold text-primary">Settings → Time</span>.
        </p>
      )}
    </div>
  );
}

// Click-to-open time picker. The trigger button displays the current
// formatted time and a chevron; clicking opens a popover with two
// scrollable columns (hours and minutes) plus an AM/PM toggle in
// 12-hour mode. Selecting a value commits immediately to the parent.
// Under the hood the value is always stored as a 24-hour HH:MM string
// so the backend (and the rest of the app) never has to special-case
// the format.
function TimePicker({
  value,
  onChange,
  ariaLabel,
  timeFormat,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  timeFormat: "12" | "24";
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Derive selected hour / minute / period from the canonical value.
  const { hour24, hour12, minute, period } = useMemo(() => {
    const { hour, minute } = splitTime24(value);
    const twelve = to12h(value);
    return {
      hour24: hour,
      hour12: twelve.hour,
      minute,
      period: twelve.period as Period,
    };
  }, [value]);

  const displayValue = useMemo(() => {
    if (timeFormat === "12") {
      return `${pad2(hour12)}:${pad2(minute)} ${period}`;
    }
    return `${pad2(hour24)}:${pad2(minute)}`;
  }, [timeFormat, hour12, hour24, minute, period]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function selectHour(nextHour: number) {
    if (timeFormat === "12") {
      onChange(from12h(nextHour, minute, period));
    } else {
      onChange(`${pad2(nextHour)}:${pad2(minute)}`);
    }
  }

  function selectMinute(nextMinute: number) {
    if (timeFormat === "12") {
      onChange(from12h(hour12, nextMinute, period));
    } else {
      onChange(`${pad2(hour24)}:${pad2(nextMinute)}`);
    }
  }

  function selectPeriod(nextPeriod: Period) {
    if (timeFormat !== "12") return;
    onChange(from12h(hour12, minute, nextPeriod));
  }

  const selectedHour = timeFormat === "12" ? hour12 : hour24;
  const hours = timeFormat === "12" ? HOURS_12 : HOURS_24;

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-sm font-semibold text-primary transition-colors",
          open
            ? "border-primary ring-2 ring-primary/25"
            : "border-slate-200 hover:border-primary/40",
        )}
      >
        <Clock className="size-4 text-muted-foreground" aria-hidden />
        <span className="tabular-nums">{displayValue}</span>
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`${ariaLabel} picker`}
          className="absolute left-0 z-50 mt-1.5 flex gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          <ScrollColumn
            label="Hours"
            options={hours}
            selected={selectedHour}
            onSelect={selectHour}
          />
          <ScrollColumn
            label="Minutes"
            options={MINUTES_ALL}
            selected={minute}
            onSelect={selectMinute}
          />
          {timeFormat === "12" ? (
            <div
              role="radiogroup"
              aria-label="AM or PM"
              className="flex w-12 flex-col gap-1 pl-1"
            >
              {(["AM", "PM"] as Period[]).map((opt) => {
                const active = period === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => selectPeriod(opt)}
                    className={cn(
                      "inline-flex h-10 items-center justify-center rounded-lg text-xs font-semibold transition-colors",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                        : "text-muted-foreground hover:bg-slate-100 hover:text-primary",
                    )}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ScrollColumn({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: number[];
  selected: number;
  onSelect: (value: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Scroll the selected option into view whenever the column mounts or
  // the selection changes. Centered so the user sees a few options
  // above and below the current value.
  useEffect(() => {
    const node = selectedRef.current;
    if (!node) return;
    node.scrollIntoView({ block: "center" });
  }, [selected]);

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={label}
      className="h-48 w-14 overflow-y-auto rounded-lg bg-slate-50/60 py-1"
    >
      {options.map((opt) => {
        const active = opt === selected;
        return (
          <button
            key={opt}
            ref={active ? selectedRef : undefined}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => onSelect(opt)}
            className={cn(
              "block h-8 w-full text-center text-sm font-semibold tabular-nums transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-primary hover:bg-slate-200/60",
            )}
          >
            {pad2(opt)}
          </button>
        );
      })}
    </div>
  );
}
