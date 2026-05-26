"use client";

import { Fuel, LayoutDashboard, Menu, Truck, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
  },
  {
    id: "vehicles",
    label: "Vehicles",
    icon: Truck,
    href: "/dashboard/vehicles",
  },
  {
    id: "drivers",
    label: "Drivers",
    icon: Users,
    href: "/dashboard/drivers",
  },
  { id: "fuel", label: "Fuel", icon: Fuel, href: "/dashboard/fuel" },
  { id: "more", label: "More", icon: Menu, href: "/dashboard/settings" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardBottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="pb-safe fixed bottom-0 left-0 z-50 flex h-16 w-full items-center justify-around border-t border-slate-200/80 bg-white/95 px-4 backdrop-blur-md lg:hidden">
      {NAV_ITEMS.map(({ id, label, icon: Icon, href }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={id}
            href={href}
            className={cn(
              "flex flex-col items-center justify-center px-4 py-1 transition-transform active:scale-90",
              active
                ? "rounded-full bg-primary px-4 py-1.5 text-primary-foreground shadow-md shadow-primary/25"
                : "rounded-full px-4 py-1.5 text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            <span className="font-label-caps text-label-caps">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
