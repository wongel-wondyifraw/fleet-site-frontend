"use client";

import { useEffect, useState } from "react";

import {
  FuelUsagePanel,
  MaintenanceIssuesPanel,
  MetricCard,
  SitePerformancePanel,
  SitesOverviewPanel,
  TripStatusPanel,
  greetingForHour,
} from "@/components/dashboard/DashboardShared";
import { useDashboardStats } from "@/components/dashboard/useDashboardStats";
import { useAuth } from "@/lib/auth/AuthContext";
import { useScopedSiteIds } from "@/lib/auth/useScopedSiteIds";

export function MobileDashboard() {
  const { user } = useAuth();
  const { hasAssignments } = useScopedSiteIds();
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
          {hasAssignments
            ? "Here's what's happening across your sites."
            : "You have no site assignments yet."}
        </p>
      </header>

      {!hasAssignments ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
          <p className="text-sm font-semibold text-primary">
            You have no site assignments.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ask an admin to assign you to a site to see fleet activity here.
          </p>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {stats.map((stat, index) => (
              <MetricCard key={stat.label} {...stat} index={index} compact />
            ))}
          </section>

          <SitesOverviewPanel compact />
          <FuelUsagePanel />
          <TripStatusPanel />
          <SitePerformancePanel />
          <MaintenanceIssuesPanel />
        </>
      )}
    </div>
  );
}
