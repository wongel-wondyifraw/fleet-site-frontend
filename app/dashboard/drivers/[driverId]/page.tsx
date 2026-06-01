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
  return <DriverDetail driverId={driverId} />;
}
