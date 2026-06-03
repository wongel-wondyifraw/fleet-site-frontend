"use client";

import {
  ChevronRight,
  Clock,
  FileText,
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
import { NotificationsPopover } from "@/components/dashboard/NotificationsPopover";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth/AuthContext";
import { useHomePath } from "@/lib/auth/useScopedSiteIds";
import { useTimeSettings } from "@/lib/time/TimeSettingsContext";
import { formatDate, formatTimeOfDay } from "@/lib/time/format";
import { formatRoleName, hasPermission, type ApiTimeSettings } from "@/lib/api/types";
import { cn } from "@/lib/utils";

// Primary nav items for the desktop sidebar. Each item is shown only when
// the current user has the matching read permission. The Dashboard entry's
// href is filled in per-user at render time (see `buildSidebarNav` below)
// so site-scoped users link to their assigned site dashboard instead of
// the org-wide /dashboard route they aren't allowed to see.
const SIDEBAR_NAV = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", permission: null },
  { label: "Vehicle Registry", icon: Warehouse, href: "/vehicles", permission: "vehicles.read" },
  { label: "Drivers", icon: Users, href: "/drivers", permission: "drivers.read" },
  { label: "Trip Management", icon: Route, href: "/trips", permission: "trips.read" },
  {
    label: "Attendance Management",
    icon: Clock,
    href: "/attendance",
    permission: "attendance.read",
  },
  {
    label: "Fuel Management",
    icon: Fuel,
    href: "/fuel",
    permission: "fuel.read",
  },
  {
    label: "Reports",
    icon: FileText,
    href: "/reports",
    permission: "reports.read",
  },
] as const;

// Swap the Dashboard item's href for the user's effective home path
// (e.g. /sites/{id} for site-scoped users).
function buildSidebarNav(
  homePath: string,
): { label: string; icon: typeof LayoutDashboard; href: string; permission: string | null }[] {
  return SIDEBAR_NAV.map((item) =>
    item.label === "Dashboard" ? { ...item, href: homePath } : { ...item },
  );
}

// Match exact dashboard root or any nested subpath under the nav href.
// The Dashboard entry is matched dynamically against the user's home path
// (which may be /sites/{id} for scoped users) — see `isHomeActive` below.
function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  // For /sites/{id} (scoped user's home), highlight only on the exact site
  // page so we don't keep "Dashboard" lit while they navigate elsewhere.
  if (href.startsWith("/sites/")) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
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
  // Per-user landing path. For admins this is /dashboard; for site-scoped
  // users it's /sites/{their-site-id}. Used to point the "Dashboard" nav
  // item at the page they're actually allowed to see.
  const homePath = useHomePath();
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

      {/* User identity strip - shows who is signed in and their role.
          Doubles as the desktop entry point to /account so the user can
          edit their profile or change their password from any page,
          mirroring the mobile avatar popover. The chevron + hover ring
          telegraph that the row is interactive. */}
      {user && (
        <Link
          href="/account"
          aria-label="Open account settings"
          className={cn(
            "group mb-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition-all",
            "hover:border-primary/30 hover:bg-primary/[0.04]",
            "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
            isActive(pathname, "/account") &&
              "border-primary/30 bg-primary/[0.06]",
          )}
        >
          <div className="flex size-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {user.firstName[0]}
            {user.lastName[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-on-surface">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {formatRoleName(user.role)}
            </p>
          </div>
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
            aria-hidden
          />
        </Link>
      )}

      <p
        className="font-label-caps mb-6 text-center text-[10px] tracking-wide text-muted-foreground uppercase"
        suppressHydrationWarning
      >
        {nowLabel || "\u00A0"}
      </p>

      <nav className="flex-1 space-y-1">
        {buildSidebarNav(homePath)
          .filter(
            (item) => item.permission === null || hasPermission(user, item.permission),
          )
          .map(({ label, icon: Icon, href }) => {
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
        <div className="flex items-center gap-2">
          <SidebarFooterLink
            href="/settings"
            icon={Settings}
            label="Settings"
            active={isActive(pathname, "/settings")}
          />
          {/* Notifications inbox - lives next to the other persistent
              affordances. Opens the custom FleetSite-themed popover with
              category-tinted rows and an unread badge on the bell. */}
          <NotificationsPopover placement="sidebar" />
        </div>
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
