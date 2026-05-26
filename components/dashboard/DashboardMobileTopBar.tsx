"use client";

import { Bell, CircleUser, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { FleetSiteLogo } from "@/components/brand/FleetSiteLogo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthContext";

// Top bar shown only on mobile (lg:hidden). Hosts the brand mark,
// notifications, and a sign-out shortcut.
export function DashboardMobileTopBar() {
  const router = useRouter();
  const { logout } = useAuth();

  // Logout: clear stored auth and send the user back to the login screen.
  function handleLogout() {
    logout();
    router.replace("/");
  }

  return (
    <header className="fixed top-0 z-50 w-full border-b border-slate-200/80 bg-white px-4 py-3 lg:hidden">
      <div className="flex items-center justify-between">
        {/* Brand mark sits flush with the page's px-4 inset now that the
            mobile menu button has been removed. */}
        <div className="flex items-center gap-2">
          <FleetSiteLogo size="xs" />
          <div className="flex flex-col">
            <span className="text-sm leading-none font-bold text-primary">
              FleetSite
            </span>
            <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-success">
              <span className="size-1 rounded-full bg-success" />
              Active
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-9 rounded-xl"
            aria-label="Notifications"
          >
            <Bell className="size-4 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-9 rounded-xl"
            aria-label="Account"
          >
            <CircleUser className="size-4 text-primary" />
          </Button>
          {/* Sign out shortcut on mobile - one tap to clear the session. */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-9 rounded-xl hover:bg-destructive/10"
            aria-label="Sign out"
            onClick={handleLogout}
          >
            <LogOut className="size-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </header>
  );
}
