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

// Builds the sub-greeting line under the dashboard heading. Non-admin
// users see the count of sites they're assigned to (their actual scope),
// admins see the total number of sites in the tenant.
function buildSiteScopeLine(role: string | undefined, scopedCount: number | null, totalCount: number | null): string {
  const count = role === "ADMIN" ? totalCount : scopedCount;
  if (count == null) return "Loading your sites...";
  if (count === 0) return "No sites assigned yet.";
  if (count === 1) return "Here's what's happening across your 1 site.";
  return `Here's what's happening across your ${count.toLocaleString()} sites.`;
}

export function DesktopDashboard() {
  const { user } = useAuth();
  const { stats, siteCount } = useDashboardStats();
  const [greeting, setGreeting] = useState("Welcome back");

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  const firstName = user?.firstName ?? "there";
  const scopedCount = user?.sites?.length ?? null;
  const subheading = buildSiteScopeLine(user?.role, scopedCount, siteCount);

  return (
    <div className="hidden lg:block fs-panel-in">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-headline-md text-headline-md text-dashboard-on-background">
            {greeting}, {firstName}!
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{subheading}</p>
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
