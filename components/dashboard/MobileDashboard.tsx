"use client";

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
import { useAuth } from "@/lib/auth/AuthContext";

export function MobileDashboard() {
  const { user } = useAuth();
  const { stats } = useDashboardStats();
  const [greeting, setGreeting] = useState("Welcome back");

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  const firstName = user?.firstName ?? "there";

  return (
    <div className="space-y-5 lg:hidden fs-panel-in">
      <header>
        <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
          Truck Management
        </p>
        <h1 className="text-lg font-semibold text-primary">
          {greeting}, {firstName}!
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Here&apos;s what&apos;s happening across your sites.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {stats.map((stat, index) => (
          <MetricCard
            key={stat.label}
            {...stat}
            index={index}
            compact
          />
        ))}
      </section>

      <SitesOverviewPanel compact />
      <FuelUsagePanel />
      <TripStatusPanel />
      <SitePerformancePanel />
    </div>
  );
}
