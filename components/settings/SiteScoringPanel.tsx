"use client";

import { Loader2, RotateCcw, Save } from "@/lib/icons";
import { useCallback, useEffect, useState } from "react";

import {
  FieldGrid,
  SettingsField,
  fieldClass,
} from "@/components/settings/SettingsShared";
import { Button } from "@/components/ui/button";
import { PanelError } from "@/components/vehicles/VehicleForm";
import { ApiError } from "@/lib/api/client";
import {
  getSiteScoringConfig,
  updateSiteScoringConfig,
} from "@/lib/api/siteScoring";
import type { ApiSiteScoringConfig, SiteScoringWeights } from "@/lib/api/types";
import { siteHealthLabel } from "@/lib/site-health/labels";
import { useToast } from "@/lib/toast/ToastContext";
import { cn } from "@/lib/utils";

const DEFAULT_CONFIG: ApiSiteScoringConfig = {
  weights: {
    driverAttendance: 0.25,
    vehicleAvailability: 0.2,
    tripTargetAchievement: 0.2,
    scheduleCompliance: 0.15,
    fuelEfficiencyVariance: 0.1,
    dataCompleteness: 0.1,
  },
  bands: { goodMin: 75, watchMin: 60 },
  dataCompletenessFloor: 0.5,
};

const WEIGHT_FIELDS: Array<{
  key: keyof SiteScoringWeights;
  labelKey: Parameters<typeof siteHealthLabel>[0];
}> = [
  { key: "driverAttendance", labelKey: "siteHealth.dimension.attendance" },
  { key: "vehicleAvailability", labelKey: "siteHealth.dimension.vehicles" },
  { key: "tripTargetAchievement", labelKey: "siteHealth.dimension.trips" },
  { key: "scheduleCompliance", labelKey: "siteHealth.dimension.schedule" },
  { key: "fuelEfficiencyVariance", labelKey: "siteHealth.dimension.fuel" },
  { key: "dataCompleteness", labelKey: "siteHealth.dimension.data" },
];

export function SiteScoringPanel({ density = "default" }: { density?: "default" | "compact" }) {
  const { showToast } = useToast();
  const [config, setConfig] = useState<ApiSiteScoringConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSiteScoringConfig();
      setConfig(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load scoring config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function setWeight(key: keyof SiteScoringWeights, pct: number) {
    const next = Math.min(100, Math.max(0, pct)) / 100;
    setConfig((c) => ({
      ...c,
      weights: { ...c.weights, [key]: next },
    }));
  }

  const weightSum =
    Object.values(config.weights).reduce((a, b) => a + b, 0) * 100;

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await updateSiteScoringConfig(config);
      setConfig(saved);
      showToast({ variant: "success", message: "Site scoring settings saved." });
      setError(null);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Failed to save scoring config";
      setError(msg);
      showToast({ variant: "error", message: msg });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading scoring settings…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error ? <PanelError message={error} /> : null}

      <p className="text-sm text-muted-foreground">
        Tune how each dimension contributes to the site health score shown on
        the dashboard. Weights must sum to 100%.
      </p>

      <div className="space-y-4">
        {WEIGHT_FIELDS.map(({ key, labelKey }) => (
          <label key={key} className="block">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-semibold text-primary">
                {siteHealthLabel(labelKey)}
              </span>
              <span className="text-muted-foreground">
                {Math.round(config.weights[key] * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(config.weights[key] * 100)}
              onChange={(e) => setWeight(key, Number(e.target.value))}
              className="w-full accent-primary"
            />
          </label>
        ))}
      </div>

      <p
        className={cn(
          "text-xs font-medium",
          Math.abs(weightSum - 100) <= 2 ? "text-success" : "text-destructive",
        )}
      >
        Total weight: {weightSum.toFixed(0)}%
      </p>

      <FieldGrid cols={density === "compact" ? 1 : 2}>
        <SettingsField label="Good status from (score)">
          <input
            type="number"
            min={0}
            max={100}
            className={fieldClass}
            value={config.bands.goodMin}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                bands: { ...c.bands, goodMin: Number(e.target.value) },
              }))
            }
          />
        </SettingsField>
        <SettingsField label="Watch status from (score)">
          <input
            type="number"
            min={0}
            max={100}
            className={fieldClass}
            value={config.bands.watchMin}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                bands: { ...c.bands, watchMin: Number(e.target.value) },
              }))
            }
          />
        </SettingsField>
        <SettingsField label="Min. data completeness (0–1)">
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            className={fieldClass}
            value={config.dataCompletenessFloor}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                dataCompletenessFloor: Number(e.target.value),
              }))
            }
          />
        </SettingsField>
      </FieldGrid>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving || Math.abs(weightSum - 100) > 2}
          className="gap-2"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => setConfig(DEFAULT_CONFIG)}
        >
          <RotateCcw className="size-4" />
          Restore defaults
        </Button>
      </div>
    </div>
  );
}
