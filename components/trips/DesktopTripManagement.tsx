"use client";

import { Route } from "@/lib/icons";

import { SettingsSection } from "@/components/settings/SettingsShared";
import { TripsPanel } from "@/components/trips/TripsPanel";

export function DesktopTripManagement() {
  return (
    <div className="hidden lg:block fs-panel-in">
      <header className="mb-8">
        <p className="text-[11px] font-bold tracking-widest text-dashboard-on-surface-variant uppercase">
          Fleet
        </p>
        <h1 className="font-headline-md text-headline-md text-dashboard-on-background">
          Trip Management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan trips for registered vehicles with starting and ending locations.
        </p>
      </header>

      <SettingsSection
        title="Trips"
        description="Create and track vehicle trips across your sites."
        icon={Route}
      >
        <TripsPanel />
      </SettingsSection>
    </div>
  );
}
