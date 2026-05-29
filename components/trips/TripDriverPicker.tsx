"use client";

import { Building2, Filter, Search, UserRound, X } from "@/lib/icons";
import { useMemo, useState } from "react";

import { fieldClass } from "@/components/settings/SettingsShared";
import { Button } from "@/components/ui/button";
import { formatLicenseClass, prettyEnum } from "@/lib/api/types";
import type {
  ApiDriver,
  ApiSite,
  ApiVehicle,
  DriverStatus,
} from "@/lib/api/types";
import { driverSiteName } from "@/lib/drivers/resolveDriverSite";
import { cn } from "@/lib/utils";

const DRIVER_STATUSES: DriverStatus[] = [
  "ACTIVE",
  "ON_LEAVE",
  "SUSPENDED",
  "TERMINATED",
];

export function TripDriverPicker({
  drivers,
  vehicles,
  sites,
  selectedId,
  onSelect,
  onClear,
  disabled,
}: {
  drivers: ApiDriver[];
  vehicles: ApiVehicle[];
  sites: ApiSite[];
  selectedId: string;
  onSelect: (driver: ApiDriver) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<DriverStatus | "ALL">(
    "ACTIVE",
  );

  const vehicleById = useMemo(() => {
    const map = new Map<string, ApiVehicle>();
    for (const v of vehicles) map.set(v.id, v);
    return map;
  }, [vehicles]);

  const selected = useMemo(
    () => drivers.find((d) => d.id === selectedId) ?? null,
    [drivers, selectedId],
  );

  const selectedSiteName = useMemo(
    () =>
      selected
        ? driverSiteName(selected, vehicleById, sites)
        : null,
    [selected, vehicleById, sites],
  );

  const siteOptions = useMemo(() => {
    const names = new Set<string>();
    for (const s of sites) names.add(s.name);
    for (const d of drivers) {
      const name = driverSiteName(d, vehicleById, sites);
      if (name) names.add(name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [sites, drivers, vehicleById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers
      .filter((d) => {
        if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
        const siteName = driverSiteName(d, vehicleById, sites);
        if (siteFilter !== "ALL" && (siteName ?? "") !== siteFilter)
          return false;
        if (!q) return true;
        const hay = [
          d.firstName,
          d.lastName,
          d.employeeId,
          d.licenseNumber,
          d.phoneNumber,
          siteName ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(
          `${b.firstName} ${b.lastName}`,
        ),
      );
  }, [drivers, vehicleById, sites, search, siteFilter, statusFilter]);

  return (
    <div className="space-y-3">
      {selected ? (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-white">
            {selected.firstName[0]}
            {selected.lastName[0]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-primary">
              {selected.firstName} {selected.lastName}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {selected.employeeId}
              <span className="mx-1.5 text-slate-300">·</span>
              {formatLicenseClass(selected.licenseClass, "short")}
              {selectedSiteName && (
                <>
                  <span className="mx-1.5 text-slate-300">·</span>
                  {selectedSiteName}
                </>
              )}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={disabled}
            className="h-8 gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="size-3.5" />
            Clear
          </Button>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Search and pick a driver to auto-fill their truck and site as the
          starting point.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="relative min-w-0 flex-1 sm:min-w-[12rem]">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={disabled}
            placeholder="Search name, ID, license, site…"
            className={`${fieldClass} pl-9`}
            aria-label="Search drivers"
          />
        </div>
        <div className="relative w-full sm:w-40">
          <Filter className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as DriverStatus | "ALL")
            }
            disabled={disabled}
            className={`${fieldClass} pl-9`}
            aria-label="Filter drivers by status"
          >
            <option value="ALL">All statuses</option>
            {DRIVER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {prettyEnum(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="relative w-full sm:w-48">
          <Building2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            disabled={disabled}
            className={`${fieldClass} pl-9`}
            aria-label="Filter drivers by site"
          >
            <option value="ALL">All sites</option>
            {siteOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-center text-xs text-muted-foreground">
          {search.trim() || siteFilter !== "ALL" || statusFilter !== "ALL"
            ? "No drivers match your search or filters."
            : "No drivers registered yet."}
        </div>
      ) : (
        <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-slate-100 bg-white p-2">
          {filtered.map((d) => {
            const isSelected = d.id === selectedId;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(d)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                    isSelected
                      ? "border-primary/40 bg-primary/10"
                      : "border-transparent hover:border-slate-200 hover:bg-slate-50",
                    d.status !== "ACTIVE" && "opacity-70",
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                    <UserRound className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-primary">
                      {d.firstName} {d.lastName}
                      <span className="ml-2 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                        {d.employeeId}
                      </span>
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {prettyEnum(d.status)}
                      {(() => {
                        const siteName = driverSiteName(d, vehicleById, sites);
                        return siteName ? (
                          <>
                            <span className="mx-1.5 text-slate-300">·</span>
                            {siteName}
                          </>
                        ) : null;
                      })()}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
