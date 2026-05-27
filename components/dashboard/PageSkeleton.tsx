// Mobile-first skeleton screens rendered while route segments load.
// Used by app/dashboard/**/loading.tsx, so every tab switch shows a layout
// that matches the page about to render instead of a blank screen. Desktop
// gets a simpler card grid (the desktop sidebar already shows full chrome).

import { cn } from "@/lib/utils";

type ShimmerProps = {
  className?: string;
};

// Base shimmer block. Built on Tailwind's animate-pulse so we don't need an
// external dependency. Colors stay subtle to match the brand surface.
function Shimmer({ className }: ShimmerProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-slate-200/70",
        className,
      )}
      aria-hidden
    />
  );
}

function PageHeaderSkeleton() {
  return (
    <div className="space-y-2">
      <Shimmer className="h-3 w-16" />
      <Shimmer className="h-6 w-48" />
      <Shimmer className="h-3 w-60" />
    </div>
  );
}

function FilterRowSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Shimmer className="h-10 flex-1 rounded-xl" />
      <Shimmer className="size-10 shrink-0 rounded-xl" />
    </div>
  );
}

function ListCardSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Shimmer className="size-10 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Shimmer className="h-3.5 w-32" />
          <Shimmer className="h-3 w-24" />
        </div>
        <Shimmer className="h-5 w-16 rounded-full" />
      </div>
      <Shimmer className="h-3 w-full" />
      <Shimmer className="h-3 w-3/4" />
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <Shimmer className="h-3 w-20" />
      <Shimmer className="h-6 w-12" />
      <Shimmer className="h-2.5 w-16" />
    </div>
  );
}

// Wrapper to ensure consistent vertical rhythm + bottom spacing under the
// fixed bottom-nav on mobile.
function SkeletonShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className="space-y-5"
    >
      {children}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <SkeletonShell>
      <PageHeaderSkeleton />
      <div className="grid grid-cols-2 gap-3">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <div className="space-y-3">
        <Shimmer className="h-4 w-32" />
        <ListCardSkeleton />
        <ListCardSkeleton />
      </div>
    </SkeletonShell>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number } = {}) {
  return (
    <SkeletonShell>
      <PageHeaderSkeleton />
      <FilterRowSkeleton />
      <Shimmer className="h-11 w-full rounded-xl" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, idx) => (
          <ListCardSkeleton key={idx} />
        ))}
      </div>
    </SkeletonShell>
  );
}

// Picks the closest-matching skeleton variant for an arbitrary pathname.
// Used by the dashboard error boundary and the offline gate so the fallback
// always matches the screen the user was on.
export function PageSkeletonForPath({ pathname }: { pathname: string }) {
  if (pathname.startsWith("/dashboard/settings")) return <SettingsSkeleton />;
  if (
    pathname.startsWith("/dashboard/vehicles") ||
    pathname.startsWith("/dashboard/drivers") ||
    pathname.startsWith("/dashboard/trips")
  ) {
    return <ListSkeleton />;
  }
  return <DashboardSkeleton />;
}

export function SettingsSkeleton() {
  return (
    <SkeletonShell>
      <PageHeaderSkeleton />
      <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Shimmer className="size-14 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-4 w-40" />
            <Shimmer className="h-3 w-20 rounded-full" />
          </div>
        </div>
        <Shimmer className="h-10 w-full rounded-xl" />
        <Shimmer className="h-10 w-full rounded-xl" />
        <Shimmer className="h-10 w-full rounded-xl" />
      </div>
      <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <Shimmer className="h-4 w-24" />
        <Shimmer className="h-3 w-48" />
        <Shimmer className="h-20 w-full rounded-xl" />
      </div>
      <Shimmer className="h-11 w-full rounded-xl" />
    </SkeletonShell>
  );
}
