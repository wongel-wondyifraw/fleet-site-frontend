"use client";

import { Loader2, Route, Save } from "@/lib/icons";
import { useEffect, useState } from "react";

import {
  FieldGrid,
  SettingsField,
  fieldClass,
} from "@/components/settings/SettingsShared";
import { Button } from "@/components/ui/button";
import { PanelError } from "@/components/vehicles/VehicleForm";
import { useCan } from "@/components/auth/Can";
import { ApiError } from "@/lib/api/client";
import {
  getDefaultTripTarget,
  setDefaultTripTarget,
} from "@/lib/api/tripTargets";
import { useToast } from "@/lib/toast/ToastContext";
import { cn } from "@/lib/utils";

const MAX_TARGET = 1000;

// Edits the GLOBAL default "expected trips per day" target. Per-day
// overrides still happen from the Trip Management page; this is the
// baseline used for any day without an override.
export function DefaultTripTargetPanel({
  density = "comfortable",
}: {
  density?: "comfortable" | "compact";
}) {
  const canRead = useCan("trip-targets.read");
  const canUpdate = useCan("trip-targets.update");
  const { showToast } = useToast();

  const [draft, setDraft] = useState("");
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const res = await getDefaultTripTarget();
        if (!cancelled) {
          setSavedCount(res.count);
          setDraft(String(res.count));
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError
              ? err.message
              : "Unable to load the daily trip target.",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canRead]);

  if (!canRead) return null;

  async function handleSave() {
    const parsed = Number.parseInt(draft, 10);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > MAX_TARGET) {
      showToast({
        variant: "error",
        message: `Enter a target between 0 and ${MAX_TARGET}.`,
      });
      return;
    }
    setIsSaving(true);
    try {
      const res = await setDefaultTripTarget(parsed);
      setSavedCount(res.count);
      setDraft(String(res.count));
      showToast({
        variant: "success",
        message: "Default daily trip target saved.",
      });
    } catch (err) {
      showToast({
        variant: "error",
        message:
          err instanceof ApiError ? err.message : "Unable to save the target.",
      });
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

  if (loadError) return <PanelError message={loadError} />;

  const dirty = String(savedCount ?? "") !== draft.trim();

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Set the default number of trips expected per day across all sites.
        Individual days can still be overridden from the Trip Management page.
      </p>

      <FieldGrid cols={1}>
        <SettingsField
          label="Default daily trips"
          hint="Applies to every day unless a specific date has its own override."
          icon={Route}
        >
          <input
            type="number"
            min={0}
            max={MAX_TARGET}
            inputMode="numeric"
            value={draft}
            disabled={!canUpdate}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Default daily trips"
            className={cn(
              fieldClass,
              "max-w-[160px] tabular-nums disabled:opacity-60",
            )}
          />
        </SettingsField>
      </FieldGrid>

      {canUpdate ? (
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || !dirty}
            className="h-10 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint"
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save target
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          You have read-only access to this setting.
        </p>
      )}

      {density === "compact" ? null : (
        <p className="text-xs text-muted-foreground">
          The default is seeded to 25 trips per day on first use.
        </p>
      )}
    </div>
  );
}
