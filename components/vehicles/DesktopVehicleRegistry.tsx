"use client";

import { Truck } from "lucide-react";

import { SettingsSection } from "@/components/settings/SettingsShared";
import { VehiclesPanel } from "@/components/vehicles/VehiclesPanel";

// Desktop chrome for the Vehicle Registry page. Mirrors the look of the
// Settings desktop view: page header on top, card-shaped panel below.
export function DesktopVehicleRegistry() {
  return (
    <div className="hidden lg:block">
      <header className="mb-8">
        <p className="text-[11px] font-bold tracking-widest text-dashboard-on-surface-variant uppercase">
          Fleet
        </p>
        <h1 className="font-headline-md text-headline-md text-dashboard-on-background">
          Vehicle Registry
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Register vehicles, assign drivers, and link them to construction
          sites.
        </p>
      </header>

      <SettingsSection
        title="Vehicles"
        description="Add new vehicles or edit existing ones."
        icon={Truck}
      >
        <VehiclesPanel />
      </SettingsSection>
    </div>
  );
}
