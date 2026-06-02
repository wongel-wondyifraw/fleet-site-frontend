import { DashboardHomeGate } from "@/components/dashboard/DashboardHomeGate";
import { DesktopDashboard } from "@/components/dashboard/DesktopDashboard";
import { MobileDashboard } from "@/components/dashboard/MobileDashboard";
import { SitesOverviewProvider } from "@/components/dashboard/useSitesOverview";

export const metadata = {
  title: "FleetSite Dashboard",
  description: "Fleet operations dashboard.",
};

export default function DashboardPage() {
  // DashboardHomeGate keeps site-scoped users out of the org-wide dashboard:
  // it transparently redirects them to /sites/{their-site-id}. Admins
  // (sites.bypass-scope) and unassigned users render the org dashboard.
  //
  // SitesOverviewProvider is wrapped once at the page level so
  // SitesOverviewPanel and SitePerformancePanel (and any mobile variant)
  // share a single fetch + refresh state instead of independently
  // re-loading the same site health data.
  return (
    <DashboardHomeGate>
      <SitesOverviewProvider>
        <MobileDashboard />
        <DesktopDashboard />
      </SitesOverviewProvider>
    </DashboardHomeGate>
  );
}
