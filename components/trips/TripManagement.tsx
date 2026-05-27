import { DesktopTripManagement } from "@/components/trips/DesktopTripManagement";
import { MobileTripManagement } from "@/components/trips/MobileTripManagement";

export function TripManagement() {
  return (
    <>
      <MobileTripManagement />
      <DesktopTripManagement />
    </>
  );
}
