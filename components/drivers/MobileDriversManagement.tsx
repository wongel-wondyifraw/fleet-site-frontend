"use client";

import { Users } from "@/lib/icons";

import { DriversPanel } from "@/components/drivers/DriversPanel";
import { SettingsSection } from "@/components/settings/SettingsShared";

// Mobile chrome for the Drivers Management page. Matches the layout patterns
// used by the mobile Vehicle Registry so the navigation feels uniform.
export function MobileDriversManagement() {
  return (
    <div className="space-y-5 lg:hidden fs-panel-in">
      <header>
        <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
          Fleet
        </p>
        <h1 className="text-lg font-semibold text-primary">Drivers</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Add, edit, and assign drivers to vehicles.
        </p>
      </header>

      <SettingsSection
        title="Drivers"
        description="Register new drivers or update existing ones."
        icon={Users}
      >
        <DriversPanel density="compact" />
      </SettingsSection>
    </div>
  );
}
