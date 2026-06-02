import { PermissionGate } from "@/components/auth/PermissionGate";
import { TripManagement } from "@/components/trips/TripManagement";

export const metadata = {
  title: "FleetSite | Trip Management",
  description:
    "Create and manage vehicle trips with starting and ending locations.",
};

export default function TripsPage() {
  return (
    <PermissionGate permission="trips.read" pageLabel="Trip Management">
      <TripManagement />
    </PermissionGate>
  );
}
