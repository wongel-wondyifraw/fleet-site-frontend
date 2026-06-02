"use client";

import { Clock, Fuel, LayoutDashboard, Route, Truck, Users } from "@/lib/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/lib/auth/AuthContext";
import { hasPermission } from "@/lib/api/types";
import { cn } from "@/lib/utils";

// Same item set as the desktop sidebar, gated by the corresponding
// read permission so users without access don't see entries that would
// only land them on a 403 page.
const NAV_ITEMS = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
    permission: null,
  },
  {
    id: "vehicles",
    label: "Vehicles",
    icon: Truck,
    href: "/vehicles",
    permission: "vehicles.read",
  },
  {
    id: "drivers",
    label: "Drivers",
    icon: Users,
    href: "/drivers",
    permission: "drivers.read",
  },
  { id: "trips", label: "Trips", icon: Route, href: "/trips", permission: "trips.read" },
  {
    id: "attendance",
    label: "Attendance",
    icon: Clock,
    href: "/attendance",
    permission: "attendance.read",
  },
  {
    id: "fuel",
    label: "Fuel",
    icon: Fuel,
    href: "/fuel",
    permission: "fuel.read",
  },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardBottomNav() {
  const pathname = usePathname() ?? "";
  const { user } = useAuth();

  return (
    <nav className="pb-safe fixed bottom-0 left-0 z-50 flex h-16 w-full items-center justify-between gap-1 overflow-x-hidden border-t border-slate-200/80 bg-white/95 px-2 backdrop-blur-md lg:hidden">
      {NAV_ITEMS.filter(
        (item) => item.permission === null || hasPermission(user, item.permission),
      ).map(({ id, label, icon: Icon, href }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={id}
            href={href}
            className={cn(
              "group relative flex min-w-0 flex-1 flex-col items-center justify-center px-1 py-1.5 transition-colors duration-200 active:scale-95",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            {/* Active indicator: stays in the DOM and animates between the
                inactive (zero-width, hidden) and active (8 unit, visible)
                states so it grows in from the center on tab change. */}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute top-0 left-1/2 h-0.5 -translate-x-1/2 rounded-full bg-primary transition-all duration-300 ease-out",
                active ? "w-8 opacity-100" : "w-0 opacity-0",
              )}
            />
            <Icon
              className={cn(
                "size-5 shrink-0 transition-transform duration-300 ease-out",
                active && "-translate-y-0.5 scale-110",
              )}
            />
            <span
              className={cn(
                "font-label-caps text-label-caps mt-0.5 max-w-full truncate transition-all duration-200",
                active && "font-semibold",
              )}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
