import { PermissionGate } from "@/components/auth/PermissionGate";
import { VehicleDetail } from "@/components/vehicles/VehicleDetail";

export const metadata = {
  title: "FleetSite | Vehicle Details",
  description: "View and edit a registered vehicle.",
};

// Next 16 passes route params as a Promise so it can stream them. We await
// once here and hand the resolved id to the client detail component.
export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PermissionGate permission="vehicles.read" pageLabel="Vehicle Details">
      <VehicleDetail vehicleId={id} />
    </PermissionGate>
  );
}
