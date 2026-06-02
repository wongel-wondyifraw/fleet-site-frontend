"use client";

import { useMemo } from "react";
import type { ApiPermission } from "@/lib/api/types";
import type { PermissionsByCategory } from "@/lib/api/permissions";
import { cn } from "@/lib/utils";

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
    if (allSelected) {
      slugs.forEach((s) => next.delete(s));
    } else {
      slugs.forEach((s) => next.add(s));
    }
    onChange(next);
  }

  if (categories.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No permissions available.</p>
    );
  }

  return (
    <div className="space-y-3">
      {lockedAll && (
        <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
          The Administrator role always has every permission and cannot be
          reduced.
        </p>
      )}
      {categories.map((category) => {
        const perms = catalog[category] ?? [];
        const allSelected =
          perms.length > 0 && perms.every((p) => selected.has(p.slug));
        const someSelected =
          !allSelected && perms.some((p) => selected.has(p.slug));

        return (
          <div
            key={category}
            className="rounded-xl border border-slate-200 bg-slate-50/40 p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-primary">{category}</p>
              <button
                type="button"
                disabled={disabled || lockedAll}
                onClick={() => toggleCategory(perms)}
                className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-50"
              >
                {allSelected ? "Clear category" : "Select all"}
              </button>
            </div>
            <ul className="space-y-1.5">
              {perms.map((perm) => {
                const checked = selected.has(perm.slug) || lockedAll;
                return (
                  <li key={perm.slug}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white/80",
                        (disabled || lockedAll) && "cursor-not-allowed opacity-70",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled || lockedAll}
                        onChange={() => toggleSlug(perm.slug)}
                        className={cn(
                          "mt-0.5 size-4 rounded border-slate-300",
                          someSelected && !checked && "opacity-80",
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-primary">
                          {perm.name}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {perm.slug}
                        </span>
                        {perm.description ? (
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {perm.description}
                          </span>
                        ) : null}
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
  );
}
