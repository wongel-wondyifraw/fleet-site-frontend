"use client";

import {
  BarChart2,
  Download,
  Fuel,
  Loader2,
  Route,
  Users,
} from "@/lib/icons";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/button";
import { PanelError } from "@/components/vehicles/VehicleForm";
import { ApiError } from "@/lib/api/client";
import {
  downloadFleetActivityExport,
  getFleetActivityReport,
} from "@/lib/api/reports";
import type { ApiFleetActivityReport } from "@/lib/api/types";
import { useToast } from "@/lib/toast/ToastContext";
import { cn } from "@/lib/utils";

function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return toLocalDateKey(d);
}

function fmtNum(value: number): string {
  return Number.isFinite(value)
    ? Number(value.toFixed(1)).toLocaleString()
    : "0";
}

export function ReportsPanel() {
  const { showToast } = useToast();
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(() => toLocalDateKey(new Date()));
  const [report, setReport] = useState<ApiFleetActivityReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await getFleetActivityReport({ from, to });
      setReport(data);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Could not load the fleet activity report.";
      setLoadError(message);
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const activeRows = useMemo(
    () =>
      (report?.perSite ?? []).filter(
        (r) =>
          r.tripsCompleted +
            r.tripsStarted +
            r.checkIns +
            r.checkOuts +
            r.fuelLiters >
          0,
      ),
    [report],
  );

  async function handleExport(format: "xlsx" | "pdf") {
    setExporting(format);
    try {
      await downloadFleetActivityExport({ from, to }, format);
      showToast({
        variant: "success",
        title: "Export ready",
        message: `Fleet activity report downloaded as ${format.toUpperCase()}.`,
      });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Export failed. Please try again.";
      showToast({ variant: "error", title: "Export failed", message });
    } finally {
      setExporting(null);
    }
  }

  const totals = report?.totals;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">
            Fleet Activity Report
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Per-site summary of trips, fuel, and attendance for the selected period.
          </p>
        </div>
        <Can permission="reports.export">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading || exporting !== null}
              onClick={() => void handleExport("xlsx")}
              className="h-10 gap-2 rounded-xl"
            >
              {exporting === "xlsx" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Excel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isLoading || exporting !== null}
              onClick={() => void handleExport("pdf")}
              className="h-10 gap-2 rounded-xl"
            >
              {exporting === "pdf" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              PDF
            </Button>
          </div>
        </Can>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-on-surface">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-on-surface">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
          />
        </label>
        <Button
          type="button"
          onClick={() => void loadReport()}
          disabled={isLoading}
          className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Apply"
          )}
        </Button>
      </div>

      {loadError && <PanelError message={loadError} />}

      {isLoading && !report && (
        <div className="flex min-h-[200px] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      )}

      {totals && !loadError && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              icon={Route}
              label="Trips completed"
              value={String(totals.tripsCompleted)}
            />
            <SummaryCard
              icon={BarChart2}
              label="Trips started"
              value={String(totals.tripsStarted)}
            />
            <SummaryCard
              icon={Fuel}
              label="Fuel (L)"
              value={fmtNum(totals.fuelLiters)}
            />
            <SummaryCard
              icon={Users}
              label="Check-ins / outs"
              value={`${totals.checkIns} / ${totals.checkOuts}`}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {totals.activeSites} active site(s) in range ·{" "}
            {report?.windowStart.slice(0, 10)} → {report?.windowEnd.slice(0, 10)}
          </p>

          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Site</th>
                    <th className="px-4 py-3 text-right">Trips done</th>
                    <th className="px-4 py-3 text-right">Started</th>
                    <th className="px-4 py-3 text-right">Fuel (L)</th>
                    <th className="px-4 py-3 text-right">Fuel cost</th>
                    <th className="px-4 py-3 text-right">Check-in</th>
                    <th className="px-4 py-3 text-right">Check-out</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-muted-foreground"
                      >
                        No activity recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    activeRows.map((row) => (
                      <tr
                        key={row.siteId}
                        className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50"
                      >
                        <td className="px-4 py-3 font-medium text-on-surface">
                          {row.siteName}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.tripsCompleted}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.tripsStarted}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {fmtNum(row.fuelLiters)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {fmtNum(row.fuelCost)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.checkIns}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.checkOuts}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {activeRows.length > 0 && totals && (
                  <tfoot>
                    <tr className="bg-slate-50/80 font-semibold text-on-surface">
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {totals.tripsCompleted}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {totals.tripsStarted}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtNum(totals.fuelLiters)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtNum(totals.fuelCost)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {totals.checkIns}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {totals.checkOuts}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm",
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-lg font-bold tabular-nums text-on-surface">{value}</p>
      </div>
    </div>
  );
}
