"use client";

import { Bell } from "@/lib/icons";

import { Button } from "@/components/ui/button";

export function DesktopDashboard() {
  return (
    <div className="hidden lg:block">
      <PageIntro />
    </div>
  );
}

function PageIntro() {
  return (
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-[11px] font-bold tracking-widest text-dashboard-on-surface-variant uppercase">
          Fleet Operations
        </p>
        <h1 className="font-headline-md text-headline-md text-dashboard-on-background">
          Dashboard
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        <div className="flex items-center rounded-full bg-white p-2 shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-full hover:bg-dashboard-surface-low"
            aria-label="Notifications"
          >
            <Bell className="size-4 text-dashboard-on-surface-variant" />
          </Button>
        </div>
      </div>
    </header>
  );
}
