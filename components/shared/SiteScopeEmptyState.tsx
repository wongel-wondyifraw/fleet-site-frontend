"use client";

/** Shown when the signed-in user has no assigned sites and lacks bypass scope. */
export function SiteScopeEmptyState({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center"
          : "rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center"
      }
    >
      <p className="text-sm font-semibold text-primary">
        You have no site assignments.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Ask an admin to assign you to a site to see data here.
      </p>
    </div>
  );
}
