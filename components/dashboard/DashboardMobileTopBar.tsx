"use client";

import { Bell } from "lucide-react";

import { FleetSiteLogo } from "@/components/brand/FleetSiteLogo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthContext";

// Top bar shown only on mobile (lg:hidden). Hosts the brand mark, the
// notification bell, and a compact initials avatar for the signed-in user.
export function DashboardMobileTopBar() {
  const { user } = useAuth();

  const initials = user
    ? `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()
    : "?";

  return (
    <header className="fixed top-0 z-50 w-full border-b border-slate-200/80 bg-white px-4 py-3 lg:hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-end gap-2">
          <FleetSiteLogo size="xs" />
          <span className="pb-1 text-xl leading-none font-bold tracking-tight text-primary">
            FleetSite
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-9 shrink-0 rounded-xl"
            aria-label="Notifications"
          >
            <Bell className="size-4 text-muted-foreground" />
          </Button>
          {user ? (
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              aria-label={`Signed in as ${user.firstName} ${user.lastName}`}
            >
              {initials}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
