import type { ReactNode } from "react";

import { DashboardAuthGate } from "@/components/dashboard/DashboardAuthGate";
import { DashboardBottomNav } from "@/components/dashboard/DashboardBottomNav";
import { DashboardMobileTopBar } from "@/components/dashboard/DashboardMobileTopBar";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { MobilePageTransition } from "@/components/dashboard/MobilePageTransition";
import { OfflineSkeletonGate } from "@/components/dashboard/OfflineSkeletonGate";

// Server-component layout that wraps every /dashboard/* page.
// DashboardAuthGate is a client component that enforces authentication.
export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <DashboardAuthGate>
      <div className="min-h-dvh bg-white">
        <DashboardMobileTopBar />
        <DashboardSidebar />
        <main className="min-h-dvh px-4 pt-[76px] pb-24 lg:ml-[var(--spacing-sidebar)] lg:bg-dashboard-bg lg:px-8 lg:pt-8 lg:pb-24">
          <OfflineSkeletonGate>
            <MobilePageTransition>{children}</MobilePageTransition>
          </OfflineSkeletonGate>
        </main>
        <DashboardBottomNav />
      </div>
    </DashboardAuthGate>
  );
}
