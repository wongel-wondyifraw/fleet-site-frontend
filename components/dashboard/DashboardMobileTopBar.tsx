"use client";

import { Settings } from "@/lib/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { FleetSiteLogo } from "@/components/brand/FleetSiteLogo";
import { NotificationsPopover } from "@/components/dashboard/NotificationsPopover";
import { ProfilePopover } from "@/components/dashboard/ProfilePopover";
import { InstallPWAButton } from "@/components/pwa/InstallPWAButton";
import { cn } from "@/lib/utils";

// Top bar shown only on mobile (lg:hidden). Hosts the brand mark, the
// notification bell, the settings shortcut, and the profile popover
// (avatar trigger that surfaces account info + sign out).
export function DashboardMobileTopBar() {
  const pathname = usePathname() ?? "";

  // Highlight the settings shortcut while the user is on any /settings
  // route, matching the bottom-nav active state we used to render.
  const settingsActive =
    pathname === "/settings" ||
    pathname.startsWith("/settings/");

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
          <NotificationsPopover placement="topbar" />
          {/* Settings shortcut. Moved up from the bottom nav so it sits
              between the bell and the avatar while keeping the same
              destination. */}
          <Link
            href="/settings"
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
          {/* Avatar that opens the profile popover. Renders nothing
              while auth is bootstrapping (handled inside ProfilePopover)
              so the top bar doesn't briefly show a "?" placeholder. */}
          <ProfilePopover />
        </div>
      </div>
    </header>
  );
}
