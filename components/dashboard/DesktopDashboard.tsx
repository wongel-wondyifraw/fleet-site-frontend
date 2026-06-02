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
import { useScopedSiteIds } from "@/lib/auth/useScopedSiteIds";

// Builds the sub-greeting line under the dashboard heading. The site
// count we surface is the caller's scoped count (or the full tenant
// count when they hold the bypass permission), provided by the
// dashboard stats hook so admin and non-admin users see consistent
// numbers.
function buildSiteScopeLine(siteCount: number | null): string {
  if (siteCount == null) return "Loading your sites...";
  if (siteCount === 0) return "No sites assigned yet.";
  if (siteCount === 1) return "Here's what's happening across your 1 site.";
  return `Here's what's happening across your ${siteCount.toLocaleString()} sites.`;
}

export function DesktopDashboard() {
  const { user } = useAuth();
  const { hasAssignments } = useScopedSiteIds();
  const { stats, siteCount } = useDashboardStats();
  const [greeting, setGreeting] = useState("Welcome back");

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  const firstName = user?.firstName ?? "there";
  const subheading = buildSiteScopeLine(siteCount);

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

      {!hasAssignments ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
          <p className="text-sm font-semibold text-primary">
            You have no site assignments.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ask an admin to assign you to a site to see fleet activity here.
          </p>
        </div>
      ) : (
        <>
          <section className="mb-5 grid grid-cols-5 gap-4">
            {stats.map((stat, index) => (
              <MetricCard key={stat.label} {...stat} index={index} />
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
        </>
      )}
    </div>
  );
}
