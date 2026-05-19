"use client";

import {
  ClipboardList,
  Fuel,
  LayoutDashboard,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, active: true },
  { id: "logs", label: "Logs", icon: ClipboardList, active: false },
  { id: "fuel", label: "Fuel", icon: Fuel, active: false },
  { id: "more", label: "More", icon: Menu, active: false },
] as const;

export function DashboardBottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 z-50 flex h-16 w-full items-center justify-around border-t border-slate-200/80 bg-white/95 px-4 pb-safe backdrop-blur-md md:hidden">
      {navItems.map(({ id, label, icon: Icon, active }) => (
        <button
          key={id}
          type="button"
          className={cn(
            "flex flex-col items-center justify-center px-4 py-1 transition-transform active:scale-90",
            active
              ? "rounded-full bg-primary px-4 py-1.5 text-primary-foreground shadow-md shadow-primary/25"
              : "rounded-full px-4 py-1.5 text-muted-foreground",
          )}
        >
          <Icon className="size-5" />
          <span className="font-label-caps text-label-caps">{label}</span>
        </button>
      ))}
    </nav>
  );
}
