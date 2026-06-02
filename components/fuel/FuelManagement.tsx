"use client";

import {
  Filter,
  Fuel,
  Loader2,
  Search,
  X,
} from "@/lib/icons";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AttendanceDateFilterMenu } from "@/components/attendance/AttendanceDateFilterMenu";
import { AttendanceDateTabs } from "@/components/attendance/AttendanceDateTabs";
import { DriverFuelRow } from "@/components/fuel/DriverFuelRow";
import { SettingsSection, fieldClass } from "@/components/settings/SettingsShared";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Pagination } from "@/components/ui/Pagination";
import { staggerStyle } from "@/lib/animations";
import { ApiError } from "@/lib/api/client";
import {
  listFuelConsumptionRoster,
  listFuelConsumptionRosterBulk,
} from "@/lib/api/fuel";
import { listDrivers } from "@/lib/api/drivers";
import { listMySites } from "@/lib/api/sites";
import { SiteScopeEmptyState } from "@/components/shared/SiteScopeEmptyState";
import { useScopedSiteIds } from "@/lib/auth/useScopedSiteIds";
import { useClientPagedList } from "@/lib/api/useClientPagedList";
import type { ApiDriver, ApiFuelConsumptionDay, ApiSite } from "@/lib/api/types";
import {
  ALL_SITES_TAB,
  CONSUMPTION_DATA_OPTIONS,
  UNASSIGNED_TAB,
  computeRosterTotals,
  matchesConsumptionFilter,
  toLocalDateKey,
  type ConsumptionDataFilter,
  type DateFilter,
} from "@/lib/fuel/fuelHelpers";
import { DESKTOP_MEDIA_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

function FuelPanel({ density = "comfortable" }: { density?: "comfortable" | "compact" }) {
  const { hasAssignments } = useScopedSiteIds();
  const [sites, setSites] = useState<ApiSite[]>([]);
  const [drivers, setDrivers] = useState<ApiDriver[]>([]);
  const [rosterDays, setRosterDays] = useState<ApiFuelConsumptionDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRosterLoading, setIsRosterLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(ALL_SITES_TAB);
  const [dataFilter, setDataFilter] = useState<ConsumptionDataFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("TODAY");
  const [customDate, setCustomDate] = useState(() => toLocalDateKey(new Date()));
  const [siteMessage, setSiteMessage] = useState<string | null>(null);

  const targetDateKey = useMemo(() => {
    if (dateFilter === "TODAY") return toLocalDateKey(new Date());
    if (dateFilter === "YESTERDAY") {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return toLocalDateKey(d);
    }
    return customDate;
  }, [dateFilter, customDate]);

  const sortedSites = useMemo(
    () => [...sites].sort((a, b) => a.name.localeCompare(b.name)),
    [sites],
  );
  const knownSiteIds = useMemo(() => new Set(sites.map((s) => s.id)), [sites]);
  const hasUnassignedDrivers = useMemo(
    () =>
      drivers.some(
        (d) => !d.siteId || !knownSiteIds.has(d.siteId),
      ),
    [drivers, knownSiteIds],
  );

  const tabCounts = useMemo(() => {
    const map = new Map<string, number>();
    const activeDrivers = drivers.filter((d) => d.status === "ACTIVE");
    let unassigned = 0;
    let knownSiteTotal = 0;
    for (const s of sortedSites) {
      const count = activeDrivers.filter((d) => d.siteId === s.id).length;
      map.set(s.id, count);
      knownSiteTotal += count;
    }
    for (const d of activeDrivers) {
      if (!d.siteId || !knownSiteIds.has(d.siteId)) unassigned += 1;
    }
    map.set(ALL_SITES_TAB, knownSiteTotal);
    map.set(UNASSIGNED_TAB, unassigned);
    return map;
  }, [drivers, sortedSites, knownSiteIds]);

  const resolvedSiteId = useMemo(() => {
    if (activeTab === ALL_SITES_TAB) return null;
    if (activeTab === UNASSIGNED_TAB) return null;
    return sortedSites.some((s) => s.id === activeTab) ? activeTab : null;
  }, [activeTab, sortedSites]);

  const activeSiteLabel =
    activeTab === ALL_SITES_TAB
      ? "All sites"
      : activeTab === UNASSIGNED_TAB
        ? "Unassigned"
        : (sortedSites.find((s) => s.id === activeTab)?.name ?? "Site");

  const refreshBase = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [s, d] = await Promise.all([
        listMySites().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiSite[];
          throw err;
        }),
        listDrivers().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiDriver[];
          throw err;
        }),
      ]);
      setSites(s);
      setDrivers(d);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to load fuel data.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refreshBase();
    }, 0);
    return () => window.clearTimeout(t);
  }, [refreshBase]);

  const refreshRoster = useCallback(async () => {
    if (isLoading) return;

    if (activeTab === ALL_SITES_TAB) {
      if (sortedSites.length === 0) {
        setRosterDays([]);
        setSiteMessage("No sites configured yet. Create a site to load roster.");
        return;
      }
      setIsRosterLoading(true);
      setLoadError(null);
      setSiteMessage(null);
      try {
        const bulk = await listFuelConsumptionRosterBulk({
          date: targetDateKey,
          siteIds: sortedSites.map((site) => site.id),
          search: debouncedSearch || undefined,
        }).catch((err) => {
          if (err instanceof ApiError && err.isAuth) {
            return { bySite: {} as Record<string, ApiFuelConsumptionDay[]> };
          }
          throw err;
        });
        setRosterDays(Object.values(bulk.bySite).flat());
      } catch (err) {
        setLoadError(
          err instanceof ApiError ? err.message : "Unable to load fuel roster.",
        );
        setRosterDays([]);
      } finally {
        setIsRosterLoading(false);
      }
      return;
    }

    if (!resolvedSiteId) {
      setRosterDays([]);
      if (activeTab === UNASSIGNED_TAB) {
        setSiteMessage("Fuel roster requires a concrete site. Choose a site tab.");
      } else if (sortedSites.length === 0) {
        setSiteMessage("No site selected yet. Create or select a site to load roster.");
      } else {
        setSiteMessage("No site selected yet.");
      }
      return;
    }

    setIsRosterLoading(true);
    setLoadError(null);
    setSiteMessage(null);
    try {
      const rows = await listFuelConsumptionRoster({
        date: targetDateKey,
        siteId: resolvedSiteId,
        search: debouncedSearch || undefined,
      }).catch((err) => {
        if (err instanceof ApiError && err.isAuth) return [] as ApiFuelConsumptionDay[];
        throw err;
      });
      setRosterDays(rows);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to load fuel roster.",
      );
      setRosterDays([]);
    } finally {
      setIsRosterLoading(false);
    }
  }, [
    activeTab,
    isLoading,
    resolvedSiteId,
    debouncedSearch,
    sortedSites,
    targetDateKey,
  ]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refreshRoster();
    }, 0);
    return () => window.clearTimeout(t);
  }, [refreshRoster]);

  const filteredRows = useMemo(
    () => rosterDays.filter((row) => matchesConsumptionFilter(row, dataFilter)),
    [rosterDays, dataFilter],
  );

  const rosterTotals = useMemo(
    () => computeRosterTotals(filteredRows),
    [filteredRows],
  );

  if (!hasAssignments) {
    return <SiteScopeEmptyState />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-primary">{filteredRows.length}</span>{" "}
            consumption rows shown for{" "}
            <span className="font-semibold text-primary">{activeSiteLabel}</span>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            <div className="relative min-w-0 w-full sm:max-w-xs sm:flex-1 lg:max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or ID"
                aria-label="Search drivers by name"
                className={`${fieldClass} pl-9 ${searchQuery ? "pr-9" : ""}`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-slate-100 hover:text-primary"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-2 sm:hidden">
              <div className="flex-1">
                <Select
                  value={dataFilter}
                  onValueChange={(v) => setDataFilter(v as ConsumptionDataFilter)}
                  leftIcon={Filter}
                  aria-label="Filter by consumption data"
                  options={CONSUMPTION_DATA_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: opt.label,
                  }))}
                />
              </div>
              <div className="relative flex-1">
                <AttendanceDateFilterMenu
                  value={dateFilter}
                  onChange={setDateFilter}
                  customDate={customDate}
                  onCustomDateChange={setCustomDate}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 sm:contents">
          <Button
            onClick={refreshRoster}
            disabled={isRosterLoading}
            className="h-10 shrink-0 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint sm:self-end"
          >
            {isRosterLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Fuel className="size-4" />
            )}
            Refresh roster
          </Button>
        </div>
      </div>

      {!isLoading && (loadError || siteMessage) && (
        <div
          className={cn(
            "rounded-xl px-3 py-2.5 text-sm",
            loadError
              ? "border border-rose-200 bg-rose-50/80 text-rose-800"
              : "border border-amber-200 bg-amber-50/80 text-amber-800",
          )}
        >
          {loadError ?? siteMessage}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="-mx-1 min-w-0 flex-1 overflow-x-auto pb-1">
          <div
            role="tablist"
            aria-label="Filter fuel by site"
            className="mx-1 inline-flex min-w-max items-center gap-1 rounded-xl border border-primary/20 bg-primary/5 p-1 shadow-sm shadow-primary/10"
          >
            <SiteTab
              label="All sites"
              count={tabCounts.get(ALL_SITES_TAB) ?? 0}
              active={activeTab === ALL_SITES_TAB}
              onClick={() => setActiveTab(ALL_SITES_TAB)}
            />
            {sortedSites.map((site) => (
              <SiteTab
                key={site.id}
                label={site.name}
                count={tabCounts.get(site.id) ?? 0}
                active={activeTab === site.id}
                onClick={() => setActiveTab(site.id)}
              />
            ))}
            {hasUnassignedDrivers && (
              <SiteTab
                label="Unassigned"
                count={tabCounts.get(UNASSIGNED_TAB) ?? 0}
                active={activeTab === UNASSIGNED_TAB}
                onClick={() => setActiveTab(UNASSIGNED_TAB)}
              />
            )}
          </div>
        </div>
        <div className="hidden shrink-0 sm:block">
          <FuelSummaryPill totals={rosterTotals} />
        </div>
      </div>

      <div className="sm:hidden">
        <FuelSummaryPill totals={rosterTotals} />
      </div>

      <div className="hidden flex-col gap-2 sm:flex sm:flex-row sm:items-center sm:gap-3">
        <AttendanceDateTabs
          value={dateFilter}
          onChange={setDateFilter}
          customDate={customDate}
          onCustomDateChange={setCustomDate}
        />
        <div className="w-52 shrink-0">
          <Select
            value={dataFilter}
            onValueChange={(v) => setDataFilter(v as ConsumptionDataFilter)}
            leftIcon={Filter}
            aria-label="Filter by consumption data"
            options={CONSUMPTION_DATA_OPTIONS.map((opt) => ({
              value: opt.value,
              label: opt.label,
            }))}
          />
        </div>
      </div>

      {isLoading || isRosterLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
          <Fuel className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="text-sm font-medium text-primary">No consumption rows found.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try another site, date, search term, or data filter.
          </p>
        </div>
      ) : activeTab === ALL_SITES_TAB ? (
        <div className="space-y-6 fs-content-fade">
          {sortedSites.map((site) => {
            const siteRows = filteredRows.filter((d) => d.siteId === site.id);
            if (siteRows.length === 0) return null;
            return (
              <section key={site.id} className="space-y-2">
                <h3 className="text-sm font-semibold text-primary">{site.name}</h3>
                <PaginatedFuelRows rows={siteRows} density={density} />
              </section>
            );
          })}
        </div>
      ) : (
        <PaginatedFuelRows rows={filteredRows} density={density} />
      )}
    </div>
  );
}

function PaginatedFuelRows({
  rows,
  density,
}: {
  rows: ApiFuelConsumptionDay[];
  density: "comfortable" | "compact";
}) {
  const paging = useClientPagedList(rows);

  return (
    <div className="space-y-2">
      <div className="grid gap-2">
        {paging.items.map((day, index) => (
          <div key={day.attendanceDayId} className="fs-row-in" style={staggerStyle(index)}>
            <DriverFuelRow day={day} density={density} />
          </div>
        ))}
      </div>
      {rows.length > 0 && (
        <Pagination
          page={paging.page}
          pageSize={paging.pageSize}
          highestKnownPage={paging.highestKnownPage}
          totalPages={paging.totalPages}
          isLastPageReached={paging.isLastPageReached}
          isLoading={false}
          onPageChange={paging.goToPage}
          onPageSizeChange={paging.setPageSize}
        />
      )}
    </div>
  );
}

function FuelSummaryPill({
  totals,
}: {
  totals: {
    totalKm: number;
    totalLiters: number;
    rowsWithEstimate: number;
    rowsMissingData: number;
  };
}) {
  return (
    <div
      className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs font-medium text-primary/90"
      title="Aggregates for the currently filtered roster"
    >
      <span>
        <span className="font-semibold tabular-nums">{totals.totalKm.toFixed(1)}</span> km
      </span>
      <span className="text-primary/40">·</span>
      <span>
        <span className="font-semibold tabular-nums">{totals.totalLiters.toFixed(2)}</span> L est.
      </span>
      <span className="text-primary/40">·</span>
      <span>
        <span className="font-semibold tabular-nums">{totals.rowsWithEstimate}</span> with data
      </span>
      {totals.rowsMissingData > 0 && (
        <>
          <span className="text-primary/40">·</span>
          <span className="text-amber-700">
            <span className="font-semibold tabular-nums">{totals.rowsMissingData}</span> missing
          </span>
        </>
      )}
    </div>
  );
}

function SiteTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
          : "text-primary/80 hover:bg-primary/10 hover:text-primary",
      )}
    >
      <span className="truncate">{label}</span>
      <span
        className={cn(
          "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
          active ? "bg-white/20 text-primary-foreground" : "bg-primary/10 text-primary",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function DesktopFuelManagement() {
  return (
    <div className="hidden lg:block fs-panel-in">
      <header className="mb-8">
        <p className="text-[11px] font-bold tracking-widest text-dashboard-on-surface-variant uppercase">
          Fleet
        </p>
        <h1 className="font-headline-md text-headline-md text-dashboard-on-background">
          Fuel Management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse drivers by site and estimate daily fuel consumption from odometer distance.
        </p>
      </header>
      <SettingsSection
        title="Fuel consumption"
        description="Daily estimates from attendance odometer readings and vehicle km/L ratings."
        icon={Fuel}
      >
        <FuelPanel />
      </SettingsSection>
    </div>
  );
}

function MobileFuelManagement() {
  return (
    <div className="space-y-5 lg:hidden fs-panel-in">
      <header>
        <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
          Fleet
        </p>
        <h1 className="text-lg font-semibold text-primary">Fuel Management</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Tap a site to see daily fuel consumption estimates.
        </p>
      </header>
      <SettingsSection
        title="Fuel consumption"
        description="Daily estimates grouped by site."
        icon={Fuel}
      >
        <FuelPanel density="compact" />
      </SettingsSection>
    </div>
  );
}

export function FuelManagement() {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);

  if (isDesktop === null) return null;
  return isDesktop ? <DesktopFuelManagement /> : <MobileFuelManagement />;
}
