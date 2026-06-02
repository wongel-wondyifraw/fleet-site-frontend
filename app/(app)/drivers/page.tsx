import { PermissionGate } from "@/components/auth/PermissionGate";
import { DriversManagement } from "@/components/drivers/DriversManagement";

export const metadata = {
  title: "FleetSite | Drivers",
  description: "Add, edit, and manage drivers and their site assignments.",
};

export default function DriversPage() {
  return (
    <PermissionGate permission="drivers.read" pageLabel="Drivers">
      <DriversManagement />
    </PermissionGate>
  );
}
