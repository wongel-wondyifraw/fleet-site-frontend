import { DriverFuelDetail } from "@/components/fuel/DriverFuelDetail";

export const metadata = {
  title: "FleetSite | Driver Fuel Usage",
  description:
    "Per-driver fuel usage history with daily distance, odometer readings, and estimated consumption.",
};

export default async function DriverFuelDetailPage({
  params,
}: {
  params: Promise<{ driverId: string }>;
}) {
  const { driverId } = await params;
  return <DriverFuelDetail driverId={driverId} />;
}
