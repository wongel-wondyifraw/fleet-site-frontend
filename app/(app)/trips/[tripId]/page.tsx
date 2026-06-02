import { TripDetail } from "@/components/trips/TripDetail";

export const metadata = {
  title: "FleetSite | Trip Details",
  description: "View trip route, status timeline, vehicle, and driver.",
};

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  return <TripDetail tripId={tripId} />;
}
