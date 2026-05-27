"use client";

import { Route } from "@/lib/icons";

import { SettingsSection } from "@/components/settings/SettingsShared";
import { TripsPanel } from "@/components/trips/TripsPanel";

export function MobileTripManagement() {
  return (
    <div className="space-y-5 lg:hidden">
      <header>
        <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
          Fleet
        </p>
        <h1 className="text-lg font-semibold text-primary">Trip Management</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Plan trips with start and end locations.
        </p>
      </header>

      <SettingsSection
        title="Trips"
        description="Create and track vehicle trips."
        icon={Route}
      >
        <TripsPanel density="compact" />
      </SettingsSection>
    </div>
  );
}
