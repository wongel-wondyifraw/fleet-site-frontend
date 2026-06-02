"use client";

import { Bell, Calendar, Filter } from "@/lib/icons";
import { useEffect, useState } from "react";

import {
  FuelUsagePanel,
  MetricCard,
  SitePerformancePanel,
  SitesOverviewPanel,
  TripStatusPanel,
  greetingForHour,
} from "@/components/dashboard/DashboardShared";
import { useDashboardStats } from "@/components/dashboard/useDashboardStats";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthContext";

export function DesktopDashboard() {
  const { user } = useAuth();
  const { stats } = useDashboardStats();
  const [greeting, setGreeting] = useState("Welcome back");

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  const firstName = user?.firstName ?? "there";

  return (
    <div className="hidden lg:block fs-panel-in">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-headline-md text-headline-md text-dashboard-on-background">
            {greeting}, {firstName}!
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening across your 10 sites.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            className="h-10 gap-2 rounded-xl border-slate-200 bg-white text-xs font-semibold text-primary shadow-sm"
          >
            <Calendar className="size-4 text-muted-foreground" />
            May 20, 2025
          </Button>
          <Button
            variant="outline"
            className="h-10 gap-2 rounded-xl border-slate-200 bg-white text-xs font-semibold text-primary shadow-sm"
          >
            <Filter className="size-4 text-muted-foreground" />
            Filters
          </Button>
          <div className="flex items-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5">
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-xl hover:bg-dashboard-surface-low"
              aria-label="Notifications"
            >
              <Bell className="size-4 text-dashboard-on-surface-variant" />
            </Button>
          </div>
        </div>
      </header>

      <section className="mb-5 grid grid-cols-5 gap-4">
        {stats.map((stat, index) => (
          <MetricCard
            key={stat.label}
            {...stat}
            index={index}
          />
        ))}
      </section>

      <div className="space-y-5">
        <SitesOverviewPanel />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <FuelUsagePanel />
          <TripStatusPanel />
          <SitePerformancePanel />
        </div>
      </div>
    </div>
  );
}
