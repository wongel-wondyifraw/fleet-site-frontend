import { DesktopDashboard } from "@/components/dashboard/DesktopDashboard";
import { MobileDashboard } from "@/components/dashboard/MobileDashboard";
import { SitesOverviewProvider } from "@/components/dashboard/useSitesOverview";

export const metadata = {
  title: "FleetSite Dashboard",
  description: "Fleet operations dashboard.",
};

export default function DashboardPage() {
  // Wrap once at the page level so SitesOverviewPanel and SitePerformancePanel
  // (and any mobile variant) share a single fetch + refresh state instead
  // of independently re-loading the same site health data.
  return (
    <SitesOverviewProvider>
      <MobileDashboard />
      <DesktopDashboard />
    </SitesOverviewProvider>
  );
}
