"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown, Search } from "@/lib/icons";
import {
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

import { fieldClass } from "@/components/settings/SettingsShared";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  /** Used for search filtering; defaults to string label when possible. */
  searchText?: string;
}

export interface SelectOptionGroup {
  label: string;
  options: SelectOption[];
}

export interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options?: SelectOption[];
  groups?: SelectOptionGroup[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  /** When omitted, search appears automatically if there are more than 10 options. */
  searchable?: boolean;
  "aria-label"?: string;
  leftIcon?: ComponentType<{ className?: string }>;
  size?: "default" | "sm";
  /** When false, the page stays scrollable while open (better for toolbar filters). */
  modal?: boolean;
}

const SEARCH_THRESHOLD = 10;

function flattenOptions(
  options: SelectOption[] | undefined,
  groups: SelectOptionGroup[] | undefined,
): SelectOption[] {
  if (groups?.length) {
    return groups.flatMap((g) => g.options);
  }
  return options ?? [];
}

function optionSearchText(opt: SelectOption): string {
  if (opt.searchText) return opt.searchText.toLowerCase();
  if (typeof opt.label === "string") return opt.label.toLowerCase();
  return opt.value.toLowerCase();
}

function renderOptions(options: SelectOption[]) {
  return options.map((opt) => (
    <SelectPrimitive.Item
      key={opt.value}
      value={opt.value}
      label={typeof opt.label === "string" ? opt.label : opt.value}
      disabled={opt.disabled}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-lg py-2 pr-8 pl-2.5 text-sm font-medium text-primary outline-none select-none",
        "data-highlighted:bg-primary/10 data-highlighted:text-primary",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
      )}
    >
      <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">
        {opt.label}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center text-primary">
        <Check className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  ));
}

export function Select({
  value,
  onValueChange,
  options,
  groups,
  placeholder = "Select…",
  disabled = false,
  className,
  triggerClassName,
  searchable,
  "aria-label": ariaLabel,
  leftIcon: LeftIcon,
  size = "default",
  modal = false,
}: SelectProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const allOptions = useMemo(
    () => flattenOptions(options, groups),
    [options, groups],
  );

  const items = useMemo(
    () =>
      allOptions.map((opt) => ({
        value: opt.value,
        label: opt.label,
      })),
    [allOptions],
  );

  const showSearch =
    searchable ?? allOptions.length > SEARCH_THRESHOLD;

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;
    if (!groups?.length) return undefined;
    return groups
      .map((g) => ({
        ...g,
        options: g.options.filter((opt) =>
          optionSearchText(opt).includes(q),
        ),
      }))
      .filter((g) => g.options.length > 0);
  }, [groups, searchQuery]);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = options ?? [];
    if (!q) return base;
    return base.filter((opt) => optionSearchText(opt).includes(q));
  }, [options, searchQuery]);

  const triggerSizeClass =
    size === "sm"
      ? "h-8 text-xs font-semibold"
      : "h-10 text-sm";

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(String(next));
      }}
      items={items}
      disabled={disabled}
      modal={modal}
      onOpenChange={(open) => {
        if (!open) setSearchQuery("");
      }}
    >
      <div className={cn("relative w-full", className)}>
        {LeftIcon ? (
          <LeftIcon
            className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
        ) : null}
        <SelectPrimitive.Trigger
          aria-label={ariaLabel}
          className={cn(
            fieldClass,
            "flex w-full items-center justify-between gap-2 text-left",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "data-popup-open:border-primary data-popup-open:ring-2 data-popup-open:ring-primary/25",
            triggerSizeClass,
            LeftIcon && "pl-9",
            triggerClassName,
          )}
        >
          <SelectPrimitive.Value
            className="min-w-0 flex-1 truncate data-placeholder:text-muted-foreground/70"
            placeholder={placeholder}
          />
          <SelectPrimitive.Icon className="shrink-0 text-muted-foreground">
            <ChevronDown className="size-4" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
      </div>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          className="z-50 outline-none"
          sideOffset={6}
          align="start"
        >
          <SelectPrimitive.Popup
            className={cn(
              "max-h-72 min-w-[var(--anchor-width)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl",
              "origin-[var(--transform-origin)]",
              "transition-[transform,scale,opacity]",
              "data-starting-style:scale-95 data-starting-style:opacity-0",
              "data-ending-style:scale-95 data-ending-style:opacity-0",
            )}
          >
            {showSearch ? (
              <div className="border-b border-slate-100 p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search…"
                    aria-label={`Search ${ariaLabel ?? "options"}`}
                    className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50/80 pl-8 pr-2 text-xs text-primary placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            ) : null}

            <SelectPrimitive.List className="max-h-56 overflow-y-auto p-1.5 outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {groups?.length
                ? (filteredGroups ?? []).map((group) => (
                    <SelectPrimitive.Group key={group.label}>
                      <SelectPrimitive.GroupLabel className="px-2.5 py-1.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                        {group.label}
                      </SelectPrimitive.GroupLabel>
                      {renderOptions(group.options)}
                    </SelectPrimitive.Group>
                  ))
                : renderOptions(filteredOptions)}

              {(groups?.length
                ? (filteredGroups ?? []).every((g) => g.options.length === 0)
                : filteredOptions.length === 0) && (
                <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                  No matches
                </p>
              )}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
