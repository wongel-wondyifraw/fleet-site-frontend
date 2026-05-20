"use client";

import {
  Activity,
  AlertTriangle,
  ArrowUp,
  Bell,
  CircleUser,
  ClipboardList,
  Fuel,
  LayoutDashboard,
  LogIn,
  LogOut,
  MapPin,
  Plus,
  Route,
  Settings,
  HelpCircle,
  Truck,
  Wrench,
  Warehouse,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { FleetSiteLogo } from "@/components/brand/FleetSiteLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SIDEBAR_NAV = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "Vehicle Registry", icon: Warehouse, active: false },
  { label: "Daily Logs", icon: ClipboardList, active: false },
  { label: "Fuel Tracking", icon: Fuel, active: false },
  { label: "Maintenance", icon: Wrench, active: false },
] as const;

const CHART_BARS = [
  { day: "Mon", height: "60%" },
  { day: "Tue", height: "85%" },
  { day: "Wed", height: "70%" },
  { day: "Thu", height: "95%" },
  { day: "Fri", height: "55%" },
  { day: "Sat", height: "40%" },
  { day: "Sun", height: "30%" },
] as const;

const ACTIVITY_ROWS = [
  { id: "TX-2248", time: "08:41", action: "Check-in", tone: "success" as const },
  { id: "CR-901", time: "08:35", action: "Check-out", tone: "info" as const },
  { id: "TX-2115", time: "08:22", action: "Check-in", tone: "success" as const },
  { id: "MX-110", time: "08:15", action: "Fueling", tone: "warning" as const },
  { id: "TX-2248", time: "07:58", action: "Check-out", tone: "info" as const },
  { id: "MX-109", time: "07:44", action: "Issue", tone: "error" as const },
];

const PILL_STYLES = {
  success: "bg-emerald-50 text-emerald-700",
  info: "bg-blue-50 text-blue-700",
  warning: "bg-orange-50 text-orange-700",
  error: "bg-rose-50 text-rose-700",
};

const ACTION_ICONS = {
  success: LogIn,
  info: LogOut,
  warning: Fuel,
  error: AlertTriangle,
} as const;

export function DesktopDashboard() {
  return (
    <div className="hidden min-h-dvh bg-white lg:flex">
      <DashboardSidebar />
      <main className="ml-[var(--spacing-sidebar)] min-h-dvh flex-1 overflow-auto bg-dashboard-bg p-8 pb-24">
        <PageIntro />
        <KpiGrid />
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <TripVolumeChart />
          <RecentActivityPanel />
        </div>
      </main>
      <Fab />
    </div>
  );
}

function PageIntro() {
  return (
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-[11px] font-bold tracking-widest text-dashboard-on-surface-variant uppercase">
          Fleet Operations
        </p>
        <h1 className="font-headline-md text-headline-md text-dashboard-on-background">
          Dashboard
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        <div className="hidden text-right lg:block">
          <p className="text-sm font-semibold text-dashboard-on-background">
            October 24, 2023
          </p>
          <p className="text-[11px] text-dashboard-on-surface-variant">
            08:42 AM · GMT-5
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white p-2 pr-5 shadow-sm">
          <span className="flex size-10 items-center justify-center rounded-full bg-dashboard-surface-low">
            <CircleUser className="size-5 text-dashboard-primary" />
          </span>
          <div className="ml-1 hidden sm:block">
            <p className="text-sm font-semibold text-dashboard-on-background">
              Manager
            </p>
            <p className="text-[11px] font-semibold text-dashboard-primary">
              Fleet Admin
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-2 size-9 rounded-full hover:bg-dashboard-surface-low"
          >
            <Bell className="size-4 text-dashboard-on-surface-variant" />
          </Button>
        </div>
      </div>
    </header>
  );
}

function DashboardSidebar() {
  return (
    <aside className="fixed top-0 left-0 z-40 flex h-full w-[var(--spacing-sidebar)] flex-col border-r border-slate-200/80 bg-white px-4 py-5">
      <div className="mb-5 flex flex-col items-center gap-3 rounded-2xl bg-slate-50 px-4 py-5 ring-1 ring-black/5">
        <FleetSiteLogo size="sidebar" />
        <span className="text-base font-bold leading-none text-primary">
          FleetSite
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-[11px] font-semibold text-success">
          <span className="size-1.5 rounded-full bg-success" />
          Site Active
        </span>
      </div>

      <p className="mb-6 text-center font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
        Oct 24, 2023 · 08:42 AM
      </p>

      <nav className="flex-1 space-y-1">
        {SIDEBAR_NAV.map(({ label, icon: Icon, active }) => (
          <button
            key={label}
            type="button"
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
              active
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "text-muted-foreground hover:bg-slate-50 hover:text-primary",
            )}
          >
            <Icon className="size-[18px]" />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-4 space-y-3">
        <Button className="h-11 w-full gap-2 rounded-xl bg-primary font-semibold shadow-md shadow-primary/25 hover:bg-surface-tint">
          <Plus className="size-4" />
          Add New Vehicle
        </Button>
        <div className="flex gap-2">
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-slate-50 hover:text-primary"
          >
            <Settings className="size-3.5" />
            Settings
          </button>
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-slate-50 hover:text-primary"
          >
            <HelpCircle className="size-3.5" />
            Support
          </button>
        </div>
      </div>
    </aside>
  );
}

function KpiGrid() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Active Vehicles"
        icon={Truck}
        iconClassName="bg-blue-50 text-dashboard-primary"
      >
        <div className="flex items-baseline gap-2">
          <span className="font-display-lg text-display-lg text-dashboard-on-background">14</span>
          <span className="pb-0.5 text-sm text-dashboard-on-surface-variant">
            / 18 units
          </span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-dashboard-surface-low">
          <div className="h-full w-[77%] rounded-full bg-dashboard-primary" />
        </div>
      </KpiCard>
      <KpiCard
        label="Fuel Today"
        icon={Fuel}
        iconClassName="bg-orange-50 text-orange-600"
      >
        <div className="flex items-baseline gap-2">
          <span className="font-display-lg text-display-lg text-dashboard-on-background">
            450
          </span>
          <span className="pb-0.5 text-sm text-dashboard-on-surface-variant">
            Liters
          </span>
        </div>
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
          <ArrowUp className="size-4" />
          4% vs yesterday
        </span>
      </KpiCard>
      <KpiCard
        label="Open Maintenance"
        icon={Wrench}
        iconClassName="bg-rose-50 text-dashboard-error"
      >
        <div className="flex items-end gap-3">
          <span className="font-display-lg text-display-lg text-dashboard-on-background">
            2
          </span>
          <span className="mb-1 rounded-full bg-dashboard-error-container px-2 py-0.5 text-[10px] font-bold tracking-wide text-dashboard-error uppercase">
            Critical
          </span>
        </div>
        <p className="mt-2 text-sm text-dashboard-on-surface-variant">
          Next due in{" "}
          <span className="font-bold text-dashboard-error">14h</span>
        </p>
      </KpiCard>
      <KpiCard
        label="Trips Completed"
        icon={Route}
        iconClassName="bg-purple-50 text-purple-600"
      >
        <div className="flex items-baseline gap-2">
          <span className="font-display-lg text-display-lg text-dashboard-on-background">
            42
          </span>
          <span className="pb-0.5 text-sm text-dashboard-on-surface-variant">
            Today
          </span>
        </div>
        <span className="mt-2 inline-flex rounded-full bg-dashboard-primary-container/10 px-2.5 py-0.5 text-[11px] font-bold text-dashboard-primary-container uppercase">
          98% on-schedule
        </span>
      </KpiCard>
    </div>
  );
}

function KpiCard({
  label,
  icon: Icon,
  iconClassName,
  children,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            iconClassName,
          )}
        >
          <Icon className="size-5" />
        </span>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function TripVolumeChart() {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 lg:col-span-2">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-headline-md text-headline-md text-primary">
            Trip Volume
          </h3>
          <p className="text-sm text-muted-foreground">Weekly fleet movement</p>
        </div>
        <div className="inline-flex rounded-full bg-slate-100 p-1">
          <button
            type="button"
            className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-primary shadow-sm"
          >
            7 days
          </button>
          <button
            type="button"
            className="rounded-full px-4 py-1.5 text-xs font-medium text-muted-foreground hover:text-primary"
          >
            30 days
          </button>
        </div>
      </div>
      <div className="flex h-56 items-end justify-between gap-2">
        {CHART_BARS.map(({ day, height, highlight, weekend }) => (
          <div key={day} className="group flex flex-1 flex-col items-center gap-2">
            <div
              className={cn(
                "w-full max-w-[40px] rounded-t-lg transition-all",
                highlight && "bg-primary group-hover:brightness-110",
                !highlight &&
                  !weekend &&
                  "bg-primary/20 group-hover:bg-primary/35",
                weekend && "bg-slate-200 group-hover:bg-slate-300",
              )}
              style={{ height }}
            />
            <span className="text-[10px] font-medium text-muted-foreground">
              {day}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentActivityPanel() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Activity className="size-4" />
          </span>
          <h3 className="text-sm font-semibold text-primary">Recent Activity</h3>
        </div>
        <button
          type="button"
          className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/15"
        >
          View all
        </button>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80">
              {["Vehicle", "Time", "Action"].map((col) => (
                <th
                  key={col}
                  className="px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ACTIVITY_ROWS.map((row) => {
              const ActionIcon = ACTION_ICONS[row.tone];
              return (
                <tr
                  key={`${row.id}-${row.time}`}
                  className="border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50/80"
                >
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium text-primary">
                      <Truck className="size-3.5 shrink-0 text-muted-foreground" />
                      {row.id}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.time}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        PILL_STYLES[row.tone],
                      )}
                    >
                      <ActionIcon className="size-3 shrink-0" />
                      {row.action}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Fab() {
  return (
    <button
      type="button"
      className="fixed right-8 bottom-8 z-50 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:scale-105 active:scale-95"
      aria-label="Add location"
    >
      <MapPin className="size-6" />
    </button>
  );
}

