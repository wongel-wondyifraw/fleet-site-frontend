import { TripManagement } from "@/components/trips/TripManagement";

export const metadata = {
  title: "FleetSite | Trip Management",
  description:
    "Create and manage vehicle trips with starting and ending locations.",
};

export default function TripsPage() {
  return <TripManagement />;
}
