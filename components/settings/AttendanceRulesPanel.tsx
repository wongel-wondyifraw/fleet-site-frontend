"use client";

import { Coffee, Loader2, LogIn, LogOut, Save, Timer } from "@/lib/icons";
import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ComponentType,
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

// Suggested values surfaced via the native <datalist>. Users can pick
// from these or type any other value within the valid range.
const HOUR_SUGGESTIONS_24H = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0"),
);
const HOUR_SUGGESTIONS_12H = Array.from({ length: 12 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);
const MINUTE_SUGGESTIONS = ["00", "15", "30", "45"];

type Period = "AM" | "PM";

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

function clampUnit(raw: string, max: number, min = 0): string {
  if (raw.trim() === "") return String(min).padStart(2, "0");
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return String(min).padStart(2, "0");
  const clamped = Math.max(min, Math.min(max, n));
  return String(clamped).padStart(2, "0");
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
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure the expected daily schedule and working-hours target used by
        the attendance roster and driver detail pages.
      </p>

      {formError ? <PanelError message={formError} /> : null}

      <FieldGrid>
        <SettingsField
          label="Day check-in"
          hint="Expected time drivers start their shift."
        >
          <TimePicker
            icon={LogIn}
            value={draft.dayInTime}
            onChange={(next) => updateField("dayInTime", next)}
            ariaLabel="Day check-in time"
            timeFormat={timeFormat}
          />
        </SettingsField>
        <SettingsField
          label="Lunch check-out"
          hint="Expected time drivers leave for lunch."
        >
          <TimePicker
            icon={Coffee}
            value={draft.lunchOutTime}
            onChange={(next) => updateField("lunchOutTime", next)}
            ariaLabel="Lunch check-out time"
            timeFormat={timeFormat}
          />
        </SettingsField>
        <SettingsField
          label="Lunch check-in"
          hint="Expected time drivers return from lunch."
        >
          <TimePicker
            icon={Coffee}
            value={draft.lunchInTime}
            onChange={(next) => updateField("lunchInTime", next)}
            ariaLabel="Lunch check-in time"
            timeFormat={timeFormat}
          />
        </SettingsField>
        <SettingsField
          label="Day check-out"
          hint="Expected time drivers finish their shift."
        >
          <TimePicker
            icon={LogOut}
            value={draft.dayOutTime}
            onChange={(next) => updateField("dayOutTime", next)}
            ariaLabel="Day check-out time"
            timeFormat={timeFormat}
          />
        </SettingsField>
        <SettingsField
          label="Target working hours"
          hint="Daily hours target per driver for worked-hours tracking."
        >
          <div className="relative">
            <Timer className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
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
              className={`${fieldClass} pl-9`}
            />
          </div>
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

// Side-by-side hour/minute fields with a built-in dropdown selector
// (via native <datalist>) plus free-text entry. In 12-hour mode an
// AM/PM segmented toggle appears alongside; under the hood the value
// is always stored as a 24-hour HH:MM string so the backend (and the
// rest of the app) never has to special-case the format.
function TimePicker({
  icon: Icon,
  value,
  onChange,
  ariaLabel,
  timeFormat,
}: {
  icon: ComponentType<{ className?: string }>;
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  timeFormat: "12" | "24";
}) {
  const reactId = useId();
  const hourListId = `${reactId}-hours`;
  const minuteListId = `${reactId}-minutes`;

  // Drafts decouple typing UX from the canonical 24-hour value.
  const [hourDraft, setHourDraft] = useState("");
  const [minuteDraft, setMinuteDraft] = useState("");
  const [period, setPeriod] = useState<Period>("AM");

  // Resync drafts whenever the parent value or format changes (e.g. on
  // initial load, after a save, or after the user flips 12/24 in the
  // Time settings panel). Deferred to the next tick so the React strict
  // effect lint doesn't flag the cascading setState.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (timeFormat === "12") {
        const { hour, minute, period } = to12h(value);
        setHourDraft(String(hour).padStart(2, "0"));
        setMinuteDraft(String(minute).padStart(2, "0"));
        setPeriod(period);
      } else {
        const { hour, minute } = splitTime24(value);
        setHourDraft(String(hour).padStart(2, "0"));
        setMinuteDraft(String(minute).padStart(2, "0"));
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [value, timeFormat]);

  function commit(nextHourRaw: string, nextMinuteRaw: string, nextPeriod: Period) {
    if (timeFormat === "12") {
      const hourNum = Number.parseInt(clampUnit(nextHourRaw, 12, 1), 10);
      const minuteNum = Number.parseInt(clampUnit(nextMinuteRaw, 59), 10);
      onChange(from12h(hourNum, minuteNum, nextPeriod));
    } else {
      const hour24 = clampUnit(nextHourRaw, 23);
      const minute = clampUnit(nextMinuteRaw, 59);
      onChange(`${hour24}:${minute}`);
    }
  }

  function handleHourBlur(raw: string) {
    const max = timeFormat === "12" ? 12 : 23;
    const min = timeFormat === "12" ? 1 : 0;
    const next = clampUnit(raw, max, min);
    setHourDraft(next);
    commit(next, minuteDraft, period);
  }

  function handleMinuteBlur(raw: string) {
    const next = clampUnit(raw, 59);
    setMinuteDraft(next);
    commit(hourDraft, next, period);
  }

  function handlePeriodChange(next: Period) {
    setPeriod(next);
    commit(hourDraft, minuteDraft, next);
  }

  const hourSuggestions =
    timeFormat === "12" ? HOUR_SUGGESTIONS_12H : HOUR_SUGGESTIONS_24H;

  const inputClass = cn(
    "h-10 w-16 rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-semibold text-primary",
    "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25",
    "tabular-nums",
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="flex items-center gap-1.5" aria-label={ariaLabel}>
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          list={hourListId}
          value={hourDraft}
          onChange={(e) => setHourDraft(e.target.value.replace(/[^0-9]/g, ""))}
          onBlur={(e) => handleHourBlur(e.target.value)}
          aria-label={`${ariaLabel} hour`}
          placeholder="HH"
          className={inputClass}
        />
        <datalist id={hourListId}>
          {hourSuggestions.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
        <span className="text-sm font-bold text-muted-foreground">:</span>
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          list={minuteListId}
          value={minuteDraft}
          onChange={(e) =>
            setMinuteDraft(e.target.value.replace(/[^0-9]/g, ""))
          }
          onBlur={(e) => handleMinuteBlur(e.target.value)}
          aria-label={`${ariaLabel} minute`}
          placeholder="MM"
          className={inputClass}
        />
        <datalist id={minuteListId}>
          {MINUTE_SUGGESTIONS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </div>
      {timeFormat === "12" ? (
        <PeriodToggle
          value={period}
          onChange={handlePeriodChange}
          ariaLabel={`${ariaLabel} period`}
        />
      ) : null}
    </div>
  );
}

function PeriodToggle({
  value,
  onChange,
  ariaLabel,
}: {
  value: Period;
  onChange: (next: Period) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex h-10 items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-50 p-0.5"
    >
      {(["AM", "PM"] as Period[]).map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt)}
            className={cn(
              "inline-flex h-9 min-w-[42px] items-center justify-center rounded-lg px-2 text-xs font-semibold transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "text-muted-foreground hover:bg-white hover:text-primary",
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
