"use client";

import {
  Clock,
  Fuel,
  LayoutDashboard,
  LogOut,
  Route,
  Settings,
  Users,
  Warehouse,
} from "@/lib/icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { FleetSiteLogo } from "@/components/brand/FleetSiteLogo";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTimeSettings } from "@/lib/time/TimeSettingsContext";
import { formatDate, formatTimeOfDay } from "@/lib/time/format";
import type { ApiTimeSettings } from "@/lib/api/types";
import { cn } from "@/lib/utils";

// Primary nav items for the desktop sidebar.
const SIDEBAR_NAV = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Vehicle Registry", icon: Warehouse, href: "/dashboard/vehicles" },
  { label: "Drivers", icon: Users, href: "/dashboard/drivers" },
  { label: "Trip Management", icon: Route, href: "/dashboard/trips" },
  {
    label: "Attendance Management",
    icon: Clock,
    href: "/dashboard/attendance",
  },
  {
    label: "Fuel Management",
    icon: Fuel,
    href: "/dashboard/fuel",
  },
] as const;

// Match exact dashboard root or any nested subpath under the nav href.
function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Pretty-print a UserRole code (e.g. "SITE_MANAGER" -> "Site Manager").
function formatRole(role: string): string {
  return role
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

// Formats a Date as e.g. "Oct 24, 2023 · 08:42 AM" using the global
// time settings (timezone + 12 vs 24-hour format).
function formatNow(date: Date, settings: ApiTimeSettings): string {
  const datePart = formatDate(date, settings, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timePart = formatTimeOfDay(date, settings);
  return `${datePart} · ${timePart}`;
}

// Live wall-clock string. Empty on first render to avoid SSR/CSR hydration
// drift; populates after mount and ticks every 30s (resolution is minutes).
function useLiveNow(settings: ApiTimeSettings): string {
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    // Defer the initial setState to the next tick so React's strict
    // effect lint stays happy (no cascading render in the effect body).
    const initial = window.setTimeout(() => {
      setNow(formatNow(new Date(), settings));
    }, 0);
    const id = window.setInterval(
      () => setNow(formatNow(new Date(), settings)),
      30_000,
    );
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(id);
    };
  }, [settings]);

  return now;
}

export function DashboardSidebar() {
  const pathname = usePathname() ?? "";
  // Pull current user + logout helper from auth context for the footer card.
  const { user, logout } = useAuth();
  const router = useRouter();
  // Drives the sign-out confirmation dialog so a misclick can't end the session.
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);
  // Pull global time settings so the sidebar clock honours the chosen
  // timezone + 12 / 24-hour format.
  const { settings: timeSettings } = useTimeSettings();
  // Live date + time string for the sidebar header.
  const nowLabel = useLiveNow(timeSettings);

  // Logout: clear auth state then send the user back to the login page.
  function handleLogout() {
    logout();
    router.replace("/");
  }

  return (
    <aside className="fixed top-0 left-0 z-40 hidden h-full w-[var(--spacing-sidebar)] flex-col border-r border-slate-200/80 bg-white px-4 py-5 lg:flex">
      <div className="mb-5 flex min-h-[210px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-slate-50 px-4 py-5 ring-1 ring-black/5">
        <FleetSiteLogo size="sidebar" />
        <span className="-mt-[15px] text-xl leading-none font-bold tracking-wide text-primary">
          FleetSite
        </span>
      </div>

      {/* User identity strip - shows who is signed in and their role. */}
      {user && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          {/* Initials avatar generated client-side from the user's name. */}
          <div className="flex size-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {user.firstName[0]}
            {user.lastName[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-on-surface">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {formatRole(user.role)}
            </p>
          </div>
        </div>
      )}

      <p
        className="font-label-caps mb-6 text-center text-[10px] tracking-wide text-muted-foreground uppercase"
        suppressHydrationWarning
      >
        {nowLabel || "\u00A0"}
      </p>

      <nav className="flex-1 space-y-1">
        {SIDEBAR_NAV.map(({ label, icon: Icon, href }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                active
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:bg-slate-50 hover:text-primary",
              )}
            >
              <Icon className="size-[18px]" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 space-y-3">
        <SidebarFooterLink
          href="/dashboard/settings"
          icon={Settings}
          label="Settings"
          active={isActive(pathname, "/dashboard/settings")}
        />
        {/* Logout: opens a confirmation dialog before clearing the JWT/user. */}
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirmSignOutOpen(true)}
          className="h-9 w-full justify-center gap-2 rounded-xl text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="size-3.5" />
          Sign Out
        </Button>
      </div>

      <ConfirmDialog
        open={confirmSignOutOpen}
        onOpenChange={setConfirmSignOutOpen}
        title="Sign out of FleetSite?"
        description="You'll be returned to the login screen and will need to sign in again to continue."
        confirmLabel="Sign out"
        destructive
        onConfirm={handleLogout}
      />
    </aside>
  );
}

// Small icon + label tile used in the bottom row (Settings / Support).
function SidebarFooterLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-slate-50 hover:text-primary",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </Link>
  );
}
