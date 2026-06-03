"use client";

import { useMemo, type ComponentType } from "react";
import {
  Activity,
  Bell,
  Building2,
  Check,
  ClipboardCheck,
  Clock,
  Fuel,
  Gavel,
  IdCard,
  MapPin,
  Navigation,
  Route,
  Settings,
  ShieldCheck,
  Truck,
  Users,
} from "@/lib/icons";
import type { ApiPermission } from "@/lib/api/types";
import type { PermissionsByCategory } from "@/lib/api/permissions";
import { cn } from "@/lib/utils";

// Inline icon per permission category. Falls back to a shield for any
// category we haven't explicitly mapped so new catalog groups still render.
const CATEGORY_ICONS: Record<
  string,
  ComponentType<{ className?: string }>
> = {
  Users,
  Roles: ShieldCheck,
  Sites: Building2,
  Vehicles: Truck,
  Drivers: IdCard,
  Trips: Route,
  Attendance: Clock,
  Fuel,
  Notifications: Bell,
  "Site Health": Activity,
  "Trip Targets": Navigation,
  "Custom Routes": MapPin,
  "Attendance Rules": ClipboardCheck,
  "Time Settings": Settings,
  Reports: Gavel,
};

export function categoryIcon(
  category: string,
): ComponentType<{ className?: string }> {
  return CATEGORY_ICONS[category] ?? ShieldCheck;
}

export function PermissionPicker({
  catalog,
  selected,
  onChange,
  disabled = false,
  lockedAll = false,
}: {
  catalog: PermissionsByCategory;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
  lockedAll?: boolean;
}) {
  const categories = useMemo(
    () => Object.keys(catalog).sort((a, b) => a.localeCompare(b)),
    [catalog],
  );

  const allSlugs = useMemo(
    () => Object.values(catalog).flat().map((p) => p.slug),
    [catalog],
  );

  const totalSelected = lockedAll
    ? allSlugs.length
    : allSlugs.filter((s) => selected.has(s)).length;
  const allChecked = totalSelected === allSlugs.length && allSlugs.length > 0;

  function toggleSlug(slug: string) {
    if (disabled || lockedAll) return;
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onChange(next);
  }

  function toggleCategory(perms: ApiPermission[]) {
    if (disabled || lockedAll) return;
    const slugs = perms.map((p) => p.slug);
    const allSelected = slugs.every((s) => selected.has(s));
    const next = new Set(selected);
    if (allSelected) slugs.forEach((s) => next.delete(s));
    else slugs.forEach((s) => next.add(s));
    onChange(next);
  }

  function setEverything(value: boolean) {
    if (disabled || lockedAll) return;
    onChange(value ? new Set(allSlugs) : new Set());
  }

  if (categories.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No permissions available.</p>
    );
  }

  return (
    <div className="space-y-3">
      {lockedAll ? (
        <p className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs text-primary">
          <ShieldCheck className="size-4 shrink-0" />
          The Administrator role always has every permission and cannot be
          reduced.
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
          <span className="text-xs font-semibold text-primary">
            {totalSelected}
            <span className="font-normal text-muted-foreground">
              {" "}
              / {allSlugs.length} permissions selected
            </span>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={disabled || allChecked}
              onClick={() => setEverything(true)}
              className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-40"
            >
              Select all
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              disabled={disabled || totalSelected === 0}
              onClick={() => setEverything(false)}
              className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-slate-100 disabled:opacity-40"
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      {/* Responsive masonry-ish grid: categories tile across the available
          width so the form stays compact instead of one tall column. */}
      <div className="grid auto-rows-min grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => {
          const perms = catalog[category] ?? [];
          const Icon = categoryIcon(category);
          const selectedCount = lockedAll
            ? perms.length
            : perms.filter((p) => selected.has(p.slug)).length;
          const allSelected = selectedCount === perms.length && perms.length > 0;

          return (
            <div
              key={category}
              className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <span className="truncate text-sm font-semibold text-primary">
                    {category}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                      allSelected
                        ? "bg-primary/10 text-primary"
                        : "bg-slate-100 text-muted-foreground",
                    )}
                  >
                    {selectedCount}/{perms.length}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={disabled || lockedAll}
                  onClick={() => toggleCategory(perms)}
                  className="shrink-0 text-[11px] font-semibold text-primary hover:underline disabled:opacity-40"
                >
                  {allSelected ? "Clear" : "All"}
                </button>
              </div>
              <ul className="divide-y divide-slate-50">
                {perms.map((perm) => {
                  const checked = selected.has(perm.slug) || lockedAll;
                  return (
                    <li key={perm.slug}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-start gap-2.5 px-3 py-2 transition-colors hover:bg-slate-50/80",
                          (disabled || lockedAll) &&
                            "cursor-not-allowed opacity-70",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                            checked
                              ? "border-primary bg-primary text-white"
                              : "border-slate-300 bg-white",
                          )}
                        >
                          {checked ? <Check className="size-3" /> : null}
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled || lockedAll}
                            onChange={() => toggleSlug(perm.slug)}
                            className="sr-only"
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium leading-tight text-primary">
                            {perm.name}
                          </span>
                          {perm.description ? (
                            <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                              {perm.description}
                            </span>
                          ) : (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {perm.slug}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
