"use client";

import { Truck } from "@/lib/icons";

import { SettingsSection } from "@/components/settings/SettingsShared";
import { VehiclesPanel } from "@/components/vehicles/VehiclesPanel";

// Mobile chrome for the Vehicle Registry page. Matches the layout patterns
// used by the mobile Settings page so the navigation feels uniform.
export function MobileVehicleRegistry() {
  return (
    <div className="space-y-5 lg:hidden fs-panel-in">
      <header>
        <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
          Fleet
        </p>
        <h1 className="text-lg font-semibold text-primary">Vehicle Registry</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Register vehicles and assign drivers.
        </p>
      </header>

      <SettingsSection
        title="Vehicles"
        description="Add new vehicles or edit existing ones."
        icon={Truck}
      >
        <VehiclesPanel density="compact" />
      </SettingsSection>
    </div>
  );
}
