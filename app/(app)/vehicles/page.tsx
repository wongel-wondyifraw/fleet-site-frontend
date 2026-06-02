import { PermissionGate } from "@/components/auth/PermissionGate";
import { VehicleRegistry } from "@/components/vehicles/VehicleRegistry";

export const metadata = {
  title: "FleetSite | Vehicle Registry",
  description: "Register vehicles, assign drivers, and link them to sites.",
};

export default function VehiclesPage() {
  return (
    <PermissionGate permission="vehicles.read" pageLabel="Vehicle Registry">
      <VehicleRegistry />
    </PermissionGate>
  );
}
