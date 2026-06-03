import { PermissionGate } from "@/components/auth/PermissionGate";
import { ReportsPanel } from "@/components/reports/ReportsPanel";

export const metadata = {
  title: "FleetSite | Reports",
  description: "Fleet activity summary by site — trips, fuel, and attendance.",
};

export default function ReportsPage() {
  return (
    <PermissionGate permission="reports.read" pageLabel="Reports">
      <ReportsPanel />
    </PermissionGate>
  );
}
