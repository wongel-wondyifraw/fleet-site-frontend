"use client";

import {
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Plus,
  Route,
  Settings,
  Users,
  Warehouse,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { FleetSiteLogo } from "@/components/brand/FleetSiteLogo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/utils";

// Primary nav items for the desktop sidebar.
const SIDEBAR_NAV = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Vehicle Registry", icon: Warehouse, href: "/dashboard/vehicles" },
  { label: "Drivers", icon: Users, href: "/dashboard/drivers" },
  { label: "Trip Management", icon: Route, href: "/dashboard/trips" },
  { label: "Maintenance", icon: Wrench, href: "/dashboard/maintenance" },
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

export function DashboardSidebar() {
  const pathname = usePathname() ?? "";
  // Pull current user + logout helper from auth context for the footer card.
  const { user, logout } = useAuth();
  const router = useRouter();

  // Logout: clear auth state then send the user back to the login page.
  function handleLogout() {
    logout();
    router.replace("/");
  }

  return (
    <aside className="fixed top-0 left-0 z-40 hidden h-full w-[var(--spacing-sidebar)] flex-col border-r border-slate-200/80 bg-white px-4 py-5 lg:flex">
      <div className="mb-5 flex flex-col items-center gap-3 rounded-2xl bg-slate-50 px-4 py-5 ring-1 ring-black/5">
        <FleetSiteLogo size="sidebar" />
        <span className="text-base leading-none font-bold text-primary">
          FleetSite
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-[11px] font-semibold text-success">
          <span className="size-1.5 rounded-full bg-success" />
          Site Active
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

      <p className="font-label-caps mb-6 text-center text-[10px] tracking-wide text-muted-foreground uppercase">
        Oct 24, 2023 · 08:42 AM
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
        <Link
          href="/dashboard/vehicles"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-colors hover:bg-surface-tint"
        >
          <Plus className="size-4" />
          Add New Vehicle
        </Link>
        <div className="flex gap-2">
          <SidebarFooterLink
            href="/dashboard/settings"
            icon={Settings}
            label="Settings"
            active={isActive(pathname, "/dashboard/settings")}
          />
          <SidebarFooterLink
            href="/dashboard/support"
            icon={HelpCircle}
            label="Support"
            active={isActive(pathname, "/dashboard/support")}
          />
        </div>
        {/* Logout: clears the JWT/user from storage and routes back to /. */}
        <Button
          type="button"
          variant="ghost"
          onClick={handleLogout}
          className="h-9 w-full justify-center gap-2 rounded-xl text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="size-3.5" />
          Sign Out
        </Button>
      </div>
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
