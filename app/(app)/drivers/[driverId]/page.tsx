import { PermissionGate } from "@/components/auth/PermissionGate";
import { DriverDetail } from "@/components/drivers/DriverDetail";

export const metadata = {
  title: "FleetSite | Driver Details",
  description: "View driver profile, license, assignments, trips, and attendance.",
};

export default async function DriverDetailPage({
  params,
}: {
  params: Promise<{ driverId: string }>;
}) {
  const { driverId } = await params;
  return (
    <PermissionGate permission="drivers.read" pageLabel="Driver Details">
      <DriverDetail driverId={driverId} />
    </PermissionGate>
  );
}
