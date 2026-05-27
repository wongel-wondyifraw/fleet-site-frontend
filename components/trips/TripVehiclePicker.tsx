"use client";

import { Search, Truck, X } from "@/lib/icons";
import { useMemo, useState } from "react";

import { fieldClass } from "@/components/settings/SettingsShared";
import { Button } from "@/components/ui/button";
import type { ApiSite, ApiVehicle } from "@/lib/api/types";
import { prettyEnum } from "@/lib/api/types";
import { findSite } from "@/lib/trips/resolveTripStart";
import { cn } from "@/lib/utils";

export function TripVehiclePicker({
  vehicles,
  sites,
  selectedId,
  onSelect,
  onClear,
  disabled,
}: {
  vehicles: ApiVehicle[];
  sites: ApiSite[];
  selectedId: string;
  onSelect: (vehicle: ApiVehicle) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");

  const selected = useMemo(
    () => vehicles.find((v) => v.id === selectedId) ?? null,
    [vehicles, selectedId],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles
      .filter((v) => {
        if (!q) return true;
        const siteName = v.assignedSite
          ? findSite(sites, v.assignedSite)?.name ?? ""
          : "";
        const hay =
          `${v.assetNumber} ${v.plateNumber} ${prettyEnum(v.type)} ${siteName}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        (a.assetNumber ?? a.plateNumber).localeCompare(
          b.assetNumber ?? b.plateNumber,
        ),
      );
  }, [vehicles, sites, search]);

  return (
    <div className="space-y-3">
      {selected ? (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Truck className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-primary">
              {selected.assetNumber ?? selected.plateNumber}
              <span className="ml-2 font-normal text-muted-foreground">
                {selected.plateNumber}
              </span>
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {prettyEnum(selected.type)}
              {selected.assignedSite && (
                <>
                  <span className="mx-1.5 text-slate-300">·</span>
                  {findSite(sites, selected.assignedSite)?.name ??
                    "Assigned site"}
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
          Pick a registered vehicle to load its driver and site as the starting
          point.
        </p>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={disabled}
          placeholder="Search asset #, plate, type, site…"
          className={`${fieldClass} pl-9`}
          aria-label="Search vehicles"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-center text-xs text-muted-foreground">
          {search.trim()
            ? "No vehicles match your search."
            : "No vehicles registered yet."}
        </div>
      ) : (
        <ul className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-slate-100 bg-white p-2">
          {filtered.map((v) => {
            const isSelected = v.id === selectedId;
            const siteName = v.assignedSite
              ? findSite(sites, v.assignedSite)?.name
              : null;
            return (
              <li key={v.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(v)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                    isSelected
                      ? "border-primary/40 bg-primary/10"
                      : "border-transparent hover:border-slate-200 hover:bg-slate-50",
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Truck className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-primary">
                      {v.assetNumber ?? v.plateNumber}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {v.plateNumber}
                      </span>
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {prettyEnum(v.type)}
                      {siteName && (
                        <>
                          <span className="mx-1.5 text-slate-300">·</span>
                          {siteName}
                        </>
                      )}
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
