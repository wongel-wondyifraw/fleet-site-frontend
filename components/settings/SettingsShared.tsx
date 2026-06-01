"use client";

import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lg:p-6",
        className,
      )}
    >
      <header className="mb-4 flex items-start gap-3 lg:mb-6">
        {Icon ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
        ) : null}
        <div>
          <h2 className="font-headline-md text-headline-md text-primary">
            {title}
          </h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/50 p-3 lg:p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-primary">{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <SettingsSwitch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

export function SettingsSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-slate-200",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 transform rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function FieldGrid({
  children,
  cols = 2,
}: {
  children: ReactNode;
  cols?: 1 | 2;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
      )}
    >
      {children}
    </div>
  );
}

export function SettingsField({
  label,
  children,
  hint,
  icon: Icon,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <label className="block">
      <span className="font-label-caps mb-1.5 flex items-center gap-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
        {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
        <span>{label}</span>
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[11px] text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export const fieldClass = cn(
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm",
  "text-primary placeholder:text-muted-foreground/70",
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25",
);
