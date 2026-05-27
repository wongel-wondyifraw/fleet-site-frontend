import { DesktopDashboard } from "@/components/dashboard/DesktopDashboard";
import { MobileDashboard } from "@/components/dashboard/MobileDashboard";

export const metadata = {
  title: "FleetSite Dashboard",
  description: "Fleet operations dashboard.",
};

export default function DashboardPage() {
  return (
    <>
      <MobileDashboard />
      <DesktopDashboard />
    </>
  );
}
