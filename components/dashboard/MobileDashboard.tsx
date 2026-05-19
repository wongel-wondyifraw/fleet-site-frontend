"use client";

import {
  AlertTriangle,
  Bell,
  CircleUser,
  ClipboardCheck,
  Fuel,
  Menu,
  Plus,
  QrCode,
  Truck,
  Wrench,
} from "lucide-react";

import { FleetSiteLogo } from "@/components/brand/FleetSiteLogo";
import { DashboardBottomNav } from "@/components/dashboard/DashboardBottomNav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACTIVITY_ITEMS = [
  {
    title: "Refuel - CAT-797",
    time: "12m ago",
    detail: "450L Diesel · Site Sector A",
    icon: Fuel,
    iconWrap: "bg-primary/10 text-primary",
    detailClass: "text-muted-foreground",
  },
  {
    title: "Issue Logged - Crane-04",
    time: "1h ago",
    detail: "Hydraulic leak reported by Operator Smith",
    icon: Wrench,
    iconWrap: "bg-destructive/10 text-destructive",
    detailClass: "text-destructive",
  },
  {
    title: "Check-in - Truck-22",
    time: "2h ago",
    detail: "Morning shift inspection cleared.",
    icon: ClipboardCheck,
    iconWrap: "bg-slate-100 text-muted-foreground",
    detailClass: "text-muted-foreground",
  },
] as const;

export function MobileDashboard() {
  return (
    <div className="min-h-dvh bg-white lg:hidden">
      <header className="fixed top-0 z-50 w-full border-b border-slate-200/80 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-9 rounded-xl active:scale-95"
            >
              <Menu className="size-5" />
            </Button>
            <div className="flex items-center gap-2">
              <FleetSiteLogo size="xs" />
              <div className="flex flex-col">
                <span className="text-sm font-bold leading-none text-primary">
                  FleetSite
                </span>
                <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-success">
                  <span className="size-1 rounded-full bg-success" />
                  Active
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-9 rounded-xl"
            >
              <Bell className="size-4 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-9 rounded-xl"
            >
              <CircleUser className="size-4 text-primary" />
            </Button>
          </div>
        </div>
      </header>

      <main className="overflow-x-hidden px-4 pt-[76px] pb-24">
        <div className="mb-5">
          <h1 className="text-lg font-semibold text-primary">Dashboard</h1>
          <p className="text-sm text-muted-foreground">North Creek Bridge · Sector 4</p>
        </div>

        <section className="mb-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Active Vehicles
            </span>
            <div className="mt-2 flex items-end justify-between">
              <span className="text-2xl font-bold text-primary">42</span>
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
                <Truck className="size-4 text-primary" />
              </span>
            </div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Open Issues
            </span>
            <div className="mt-2 flex items-end justify-between">
              <span className="text-2xl font-bold text-destructive">03</span>
              <span className="flex size-9 items-center justify-center rounded-xl bg-destructive/10">
                <AlertTriangle className="size-4 text-destructive" />
              </span>
            </div>
          </div>
        </section>

        <section className="mb-5">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="mb-2 flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-primary">
                Safety Protocol
              </h2>
              <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-0.5 text-[10px] font-semibold text-success">
                Compliant
              </span>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              100% inspections completed for current shift.
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-full rounded-full bg-primary" />
            </div>
          </div>
        </section>

        <section className="mb-5 flex gap-2 overflow-x-auto pb-1">
          <Button className="h-10 shrink-0 gap-2 rounded-full bg-primary px-5 font-semibold shadow-md shadow-primary/20 active:scale-95">
            <Plus className="size-4" />
            New Log
          </Button>
          <Button
            variant="outline"
            className="h-10 shrink-0 gap-2 rounded-full border-slate-200 bg-white px-5 active:scale-95"
          >
            <QrCode className="size-4" />
            Scan Vehicle
          </Button>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-primary">Recent Activity</h3>
            <button
              type="button"
              className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
            >
              View all
            </button>
          </div>
          <div className="space-y-2">
            {ACTIVITY_ITEMS.map((item) => (
              <div
                key={item.title}
                className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5"
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl",
                    item.iconWrap,
                  )}
                >
                  <item.icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h4 className="truncate text-sm font-semibold text-primary">
                      {item.title}
                    </h4>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {item.time}
                    </span>
                  </div>
                  <p className={cn("text-xs", item.detailClass)}>{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <DashboardBottomNav />
    </div>
  );
}
