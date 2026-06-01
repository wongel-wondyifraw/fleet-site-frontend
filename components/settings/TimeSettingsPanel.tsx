"use client";

import { Clock, Loader2, MapPin, Save } from "@/lib/icons";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  FieldGrid,
  SettingsField,
  fieldClass,
} from "@/components/settings/SettingsShared";
import { Button } from "@/components/ui/button";
import { PanelError } from "@/components/vehicles/VehicleForm";
import { ApiError } from "@/lib/api/client";
import {
  getTimeSettings,
  updateTimeSettings,
} from "@/lib/api/timeSettings";
import type { ApiTimeSettings } from "@/lib/api/types";
import {
  DEFAULT_TIMEZONE,
  DEFAULT_TIME_FORMAT,
  TIMEZONE_OPTIONS,
  type TimezoneOption,
} from "@/lib/time/timezones";
import { useToast } from "@/lib/toast/ToastContext";
import { useTimeSettings } from "@/lib/time/TimeSettingsContext";
import { cn } from "@/lib/utils";

function groupByRegion(
  options: TimezoneOption[],
): { region: string; items: TimezoneOption[] }[] {
  const groups = new Map<string, TimezoneOption[]>();
  for (const opt of options) {
    const list = groups.get(opt.region) ?? [];
    list.push(opt);
    groups.set(opt.region, list);
  }
  return Array.from(groups.entries()).map(([region, items]) => ({
    region,
    items,
  }));
}

export function TimeSettingsPanel({
  density = "comfortable",
}: {
  density?: "comfortable" | "compact";
}) {
  const { showToast } = useToast();
  const {
    settings: globalSettings,
    isLoading: isGlobalLoading,
    setSettings: applyGlobal,
    refresh: refreshGlobal,
  } = useTimeSettings();
  const [draft, setDraft] = useState<ApiTimeSettings>(globalSettings);
  const [isLoading, setIsLoading] = useState(isGlobalLoading);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(globalSettings);
    setIsLoading(isGlobalLoading);
  }, [globalSettings, isGlobalLoading]);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      await refreshGlobal();
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? err.message
          : "Unable to load time settings.",
      );
    }
  }, [refreshGlobal]);

  function updateField<K extends keyof ApiTimeSettings>(
    key: K,
    value: ApiTimeSettings[K],
  ) {
    setFormError(null);
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!TIMEZONE_OPTIONS.some((opt) => opt.value === draft.timezone)) {
      setFormError("Please choose a timezone from the list.");
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      const saved = await updateTimeSettings(draft);
      setDraft(saved);
      applyGlobal(saved);
      showToast({ variant: "success", message: "Time settings saved." });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Unable to save time settings.";
      setFormError(message);
      showToast({ variant: "error", message });
    } finally {
      setIsSaving(false);
    }
  }

  const grouped = useMemo(() => groupByRegion(TIMEZONE_OPTIONS), []);

  // Live preview of the current time in the chosen timezone using the
  // chosen 12/24-hour format. Refreshes once per minute (the displayed
  // value only includes hh:mm so faster updates would be wasted work).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const previewLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: draft.timezone,
        hour: "numeric",
        minute: "2-digit",
        hour12: draft.timeFormat === "12",
      }).format(now);
    } catch {
      return "—";
    }
  }, [draft.timezone, draft.timeFormat, now]);

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

  return (
    <div className="space-y-4 fs-panel-in">
      <p className="text-sm text-muted-foreground">
        Choose the application timezone and how times are displayed across the
        dashboard. These settings apply globally to all users.
      </p>

      {formError ? <PanelError message={formError} /> : null}

      <FieldGrid>
        <SettingsField
          label="Timezone"
          hint="Used to render punch times, schedules, and reports."
        >
          <div className="relative">
            <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <select
              value={draft.timezone}
              onChange={(e) => updateField("timezone", e.target.value)}
              aria-label="Timezone"
              className={`${fieldClass} pl-9 pr-8 appearance-none cursor-pointer`}
            >
              {grouped.map(({ region, items }) => (
                <optgroup key={region} label={region}>
                  {items.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </SettingsField>

        <SettingsField
          label="Time format"
          hint="Choose how times are displayed in the UI."
        >
          <div
            className="grid grid-cols-2 gap-2"
            role="radiogroup"
            aria-label="Time format"
          >
            <FormatChoice
              label="12-hour"
              hint="e.g. 1:30 PM"
              checked={draft.timeFormat === "12"}
              onSelect={() => updateField("timeFormat", "12")}
            />
            <FormatChoice
              label="24-hour"
              hint="e.g. 13:30"
              checked={draft.timeFormat === "24"}
              onSelect={() => updateField("timeFormat", "24")}
            />
          </div>
        </SettingsField>
      </FieldGrid>

      <div className="flex flex-col gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Clock className="size-4" />
          </span>
          <div>
            <p className="text-[10px] font-bold tracking-widest text-primary/70 uppercase">
              Live preview
            </p>
            <p className="text-base font-semibold text-primary tabular-nums">
              {previewLabel}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground sm:text-right">
          Current time in <span className="font-medium text-primary">{draft.timezone}</span>
          {" · "}
          {draft.timeFormat === "12" ? "12-hour" : "24-hour"} format
        </p>
      </div>

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
          Save time settings
        </Button>
      </div>

      {density === "compact" ? null : (
        <p className="text-xs text-muted-foreground">
          Default is Addis Ababa (GMT+3) with 12-hour format.
        </p>
      )}
    </div>
  );
}

function FormatChoice({
  label,
  hint,
  checked,
  onSelect,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
        checked
          ? "border-primary bg-primary/10 text-primary"
          : "border-slate-200 bg-white text-muted-foreground hover:border-primary/30 hover:text-primary",
      )}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </button>
  );
}
