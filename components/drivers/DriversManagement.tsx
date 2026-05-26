import { DesktopDriversManagement } from "@/components/drivers/DesktopDriversManagement";
import { MobileDriversManagement } from "@/components/drivers/MobileDriversManagement";

// Renders both views; CSS hides one based on the lg breakpoint so the
// component tree is shared between desktop and mobile and stays consistent.
export function DriversManagement() {
  return (
    <>
      <MobileDriversManagement />
      <DesktopDriversManagement />
    </>
  );
}
