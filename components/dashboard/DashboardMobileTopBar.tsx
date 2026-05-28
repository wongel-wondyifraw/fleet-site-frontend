"use client";

import { Bell, Settings } from "@/lib/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { FleetSiteLogo } from "@/components/brand/FleetSiteLogo";
import { InstallPWAButton } from "@/components/pwa/InstallPWAButton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/utils";

// Top bar shown only on mobile (lg:hidden). Hosts the brand mark, the
// notification bell, and a compact initials avatar for the signed-in user.
export function DashboardMobileTopBar() {
  const { user } = useAuth();
  const pathname = usePathname() ?? "";

  const initials = user
    ? `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()
    : "?";

  // Highlight the settings shortcut while the user is on any /dashboard/settings
  // route, matching the bottom-nav active state we used to render.
  const settingsActive =
    pathname === "/dashboard/settings" ||
    pathname.startsWith("/dashboard/settings/");

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
          {/* Install-as-app shortcut. Self-hides when the PWA is already
              installed or the current browser doesn't expose an install
              prompt API (iOS Safari, etc.). */}
          <InstallPWAButton />
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-9 shrink-0 rounded-xl"
            aria-label="Notifications"
          >
            <Bell className="size-4 text-muted-foreground" />
          </Button>
          {/* Settings shortcut. Moved up from the bottom nav so it sits
              between the bell and the avatar while keeping the same
              destination. */}
          <Link
            href="/dashboard/settings"
            aria-label="Settings"
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
              settingsActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-primary",
            )}
          >
            <Settings className="size-4" />
          </Link>
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
