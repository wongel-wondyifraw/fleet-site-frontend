"use client";

import {
  Activity,
  Clock,
  Fuel,
  Gauge,
  Loader2,
  Route,
  RotateCcw,
  Save,
  ShieldCheck,
  Truck,
} from "@/lib/icons";
import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { PanelError } from "@/components/vehicles/VehicleForm";
import { ApiError } from "@/lib/api/client";
import {
  getSiteScoringConfig,
  updateSiteScoringConfig,
} from "@/lib/api/siteScoring";
import type { ApiSiteScoringConfig, SiteScoringWeights } from "@/lib/api/types";
import { purgeApiCache } from "@/lib/pwa/purgeApiCache";
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
  icon: ComponentType<{ className?: string }>;
  description: string;
}> = [
  {
    key: "driverAttendance",
    labelKey: "siteHealth.dimension.attendance",
    icon: Clock,
    description: "Share of expected drivers who actually punched in.",
  },
  {
    key: "vehicleAvailability",
    labelKey: "siteHealth.dimension.vehicles",
    icon: Truck,
    description: "Vehicles ready to work over total assigned.",
  },
  {
    key: "tripTargetAchievement",
    labelKey: "siteHealth.dimension.trips",
    icon: Route,
    description: "Completed trips against the daily target.",
  },
  {
    key: "scheduleCompliance",
    labelKey: "siteHealth.dimension.schedule",
    icon: Activity,
    description: "Punches on time vs late / missed.",
  },
  {
    key: "fuelEfficiencyVariance",
    labelKey: "siteHealth.dimension.fuel",
    icon: Fuel,
    description: "Actual fuel vs expected from km driven.",
  },
  {
    key: "dataCompleteness",
    labelKey: "siteHealth.dimension.data",
    icon: ShieldCheck,
    description: "How much data we trust for the day's score.",
  },
];

type CardSurfaceProps = {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
};

function CardSurface({
  title,
  description,
  icon: Icon,
  action,
  children,
}: CardSurfaceProps) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {Icon ? (
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-4" />
            </span>
          ) : null}
          <div>
            <h3 className="text-sm font-bold text-primary">{title}</h3>
            {description ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function pctFmt(value: number): string {
  return `${Math.round(value * 100)}%`;
}

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

  const weightSumPct = useMemo(
    () => Object.values(config.weights).reduce((a, b) => a + b, 0) * 100,
    [config.weights],
  );
  const isBalanced = Math.abs(weightSumPct - 100) <= 2;

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await updateSiteScoringConfig(config);
      setConfig(saved);
      purgeApiCache();
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

  const compact = density === "compact";
  // For the band visualization: GOOD is goodMin..100, WATCH is watchMin..goodMin,
  // CRITICAL is 0..watchMin. Width of each segment relative to a 100-wide bar.
  const goodMin = Math.min(100, Math.max(0, config.bands.goodMin));
  const watchMin = Math.min(goodMin, Math.max(0, config.bands.watchMin));

  return (
    <div className="space-y-5">
      {error ? <PanelError message={error} /> : null}

      {/* Header / summary card with progress bar + actions. */}
      <CardSurface
        title="Site Scoring Configuration"
        description="Weights must add up to 100%. Bands turn raw scores into Good / Watch / Critical labels."
        icon={Gauge}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-2 rounded-xl text-xs"
              onClick={() => setConfig(DEFAULT_CONFIG)}
            >
              <RotateCcw className="size-3.5" />
              Restore defaults
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !isBalanced}
              className="h-9 gap-2 rounded-xl text-xs"
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              Save changes
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-primary">Total weight</span>
            <span
              className={cn(
                "font-bold",
                isBalanced ? "text-success" : "text-destructive",
              )}
            >
              {weightSumPct.toFixed(0)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                isBalanced ? "bg-success" : "bg-destructive",
              )}
              style={{ width: `${Math.min(100, weightSumPct)}%` }}
            />
          </div>
          {!isBalanced ? (
            <p className="text-[11px] text-destructive">
              Adjust sliders so the total reaches 100% (within ±2).
            </p>
          ) : null}
        </div>
      </CardSurface>

      {/* Two-column layout: weights on the left (single-column list),
          bands + data quality stacked on the right. Collapses to a single
          column on small screens or when density="compact". */}
      <div className={cn("grid gap-3", compact ? "grid-cols-1" : "lg:grid-cols-2")}>
        {/* Left column — weights stacked one per row. */}
        <div className="space-y-3">
          {WEIGHT_FIELDS.map(({ key, labelKey, icon: Icon, description }) => {
            const pct = Math.round(config.weights[key] * 100);
            return (
              <div
                key={key}
                className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm transition-colors focus-within:border-primary/40 hover:border-primary/30"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={`weight-${key}`}
                      className="block truncate text-xs font-bold text-primary"
                    >
                      {siteHealthLabel(labelKey)}
                    </label>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {description}
                    </p>
                  </div>
                  {/* Inline numeric input + percent suffix, styled as a pill. */}
                  <div className="flex shrink-0 items-center gap-1 rounded-full border border-primary/15 bg-primary/5 px-2 py-1 focus-within:border-primary/40">
                    <input
                      id={`weight-${key}`}
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      inputMode="numeric"
                      value={pct}
                      onChange={(e) => setWeight(key, Number(e.target.value))}
                      className="w-10 border-0 bg-transparent p-0 text-right text-xs font-bold text-primary outline-none focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      aria-label={`${siteHealthLabel(labelKey)} weight`}
                    />
                    <span className="text-[11px] font-bold text-primary">%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right column — status bands + data quality stacked. */}
        <div className="space-y-3">
          <CardSurface
          title="Status bands"
          description="Where the composite score lands on the Good / Watch / Critical axis."
          icon={ShieldCheck}
        >
          {/* Visual preview of the bands. */}
          <div className="mb-4 space-y-1.5">
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-destructive"
                style={{ width: `${watchMin}%` }}
                title={`Critical: 0 – ${watchMin}`}
              />
              <div
                className="h-full bg-amber-400"
                style={{ width: `${goodMin - watchMin}%` }}
                title={`Watch: ${watchMin} – ${goodMin}`}
              />
              <div
                className="h-full bg-success"
                style={{ width: `${100 - goodMin}%` }}
                title={`Good: ${goodMin} – 100`}
              />
            </div>
            <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
              <span>0</span>
              <span>{watchMin}</span>
              <span>{goodMin}</span>
              <span>100</span>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive">
                <span className="size-2 rounded-full bg-destructive" /> Critical &lt; {watchMin}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                <span className="size-2 rounded-full bg-amber-500" /> Watch {watchMin}–{goodMin}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2 py-0.5 font-semibold text-success">
                <span className="size-2 rounded-full bg-success" /> Good ≥ {goodMin}
              </span>
            </div>
          </div>

          <div className={cn("grid gap-3", compact ? "grid-cols-1" : "grid-cols-2")}>
            <NumberCard
              label="Good from"
              suffix="score"
              value={config.bands.goodMin}
              min={0}
              max={100}
              onChange={(v) =>
                setConfig((c) => ({
                  ...c,
                  bands: {
                    ...c.bands,
                    goodMin: v,
                    // Keep watchMin <= goodMin so the bands stay valid.
                    watchMin: Math.min(c.bands.watchMin, v),
                  },
                }))
              }
            />
            <NumberCard
              label="Watch from"
              suffix="score"
              value={config.bands.watchMin}
              min={0}
              max={config.bands.goodMin}
              onChange={(v) =>
                setConfig((c) => ({
                  ...c,
                  bands: { ...c.bands, watchMin: v },
                }))
              }
            />
          </div>
        </CardSurface>

        <CardSurface
          title="Data quality gate"
          description="If a day's data completeness drops below this floor we mark the score as insufficient and show '—'."
          icon={Activity}
        >
          <div className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-primary">
                {pctFmt(config.dataCompletenessFloor)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                minimum data completeness
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={config.dataCompletenessFloor}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  dataCompletenessFloor: Number(e.target.value),
                }))
              }
              className="w-full accent-primary"
              aria-label="Minimum data completeness"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </CardSurface>
        </div>
      </div>
    </div>
  );
}

// Compact numeric input rendered as a small card so it sits naturally in
// the new card-based layout.
function NumberCard({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <span className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <div className="mt-1 flex items-baseline gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full border-0 bg-transparent p-0 text-2xl font-bold text-primary outline-none focus:ring-0"
        />
        {suffix ? (
          <span className="text-[11px] text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
    </label>
  );
}
