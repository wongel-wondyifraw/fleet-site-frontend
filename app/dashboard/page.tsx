import { DesktopDashboard } from "@/components/dashboard/DesktopDashboard";
import { MobileDashboard } from "@/components/dashboard/MobileDashboard";

export const metadata = {
  title: "FleetSite Dashboard | North Creek Bridge Project",
  description: "Fleet operations dashboard for North Creek Bridge Project.",
};

export default function DashboardPage() {
  return (
    <>
      <MobileDashboard />
      <DesktopDashboard />
    </>
  );
}
