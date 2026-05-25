import { DesktopVehicleRegistry } from "@/components/vehicles/DesktopVehicleRegistry";
import { MobileVehicleRegistry } from "@/components/vehicles/MobileVehicleRegistry";

// Renders both views; CSS hides one based on the lg breakpoint so the
// component tree is shared between desktop and mobile and stays consistent.
export function VehicleRegistry() {
  return (
    <>
      <MobileVehicleRegistry />
      <DesktopVehicleRegistry />
    </>
  );
}
