"use client";

import {
  Bell,
  Building2,
  ClipboardCheck,
  Clock,
  Gauge,
  Route,
  Users,
} from "@/lib/icons";

import { SettingsSection } from "@/components/settings/SettingsShared";
import { CustomTripRoutesPanel } from "@/components/settings/CustomTripRoutesPanel";
import { AttendanceRulesPanel } from "@/components/settings/AttendanceRulesPanel";
import { SiteScoringPanel } from "@/components/settings/SiteScoringPanel";
import { TimeSettingsPanel } from "@/components/settings/TimeSettingsPanel";
import { SitesPanel } from "@/components/settings/SitesPanel";
import { UserManagementPanel } from "@/components/settings/UserManagementPanel";
import { NotificationsSettingsPanel } from "@/components/settings/NotificationsSettingsPanel";
import { useAuth } from "@/lib/auth/AuthContext";

export function MobileSettings() {
  // Auth context is still needed to gate the admin-only sections below.
  // Profile + sign out used to live here too, but moved into the
  // ProfilePopover (avatar in the top bar) so they're one tap from any
  // page instead of buried under /settings.
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="space-y-5 lg:hidden fs-panel-in">
      <header>
        <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
          Account
        </p>
        <h1 className="text-lg font-semibold text-primary">Settings</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Manage your preferences. Profile and sign out live in the avatar
          menu at the top right.
        </p>
      </header>

      <SettingsSection
        title="Sites"
        description="Add and edit construction sites."
        icon={Building2}
      >
        <SitesPanel density="compact" />
      </SettingsSection>

      <SettingsSection
        title="Trip Settings"
        description="Save custom start and end points for the trip form."
        icon={Route}
      >
        <CustomTripRoutesPanel density="compact" />
      </SettingsSection>

      <SettingsSection
        title="Notifications"
        description="Manage in-app, browser, and PWA push alerts."
        icon={Bell}
      >
        <NotificationsSettingsPanel wrapInSection={false} />
      </SettingsSection>

      <SettingsSection
        title="Time"
        description="Application timezone and 12 / 24-hour format."
        icon={Clock}
      >
        <TimeSettingsPanel density="compact" />
      </SettingsSection>

      <SettingsSection
        title="Attendance Rules"
        description="Set expected punch times and daily target hours."
        icon={ClipboardCheck}
      >
        <AttendanceRulesPanel density="compact" />
      </SettingsSection>

      {isAdmin ? (
        <SettingsSection
          title="Site Scoring"
          description="Weights and bands for dashboard site health scores."
          icon={Gauge}
        >
          <SiteScoringPanel density="compact" />
        </SettingsSection>
      ) : null}

      {/* User management - only rendered for ADMIN accounts. */}
      {isAdmin ? (
        <SettingsSection
          title="Users"
          description="Invite teammates and assign roles."
          icon={Users}
        >
          <UserManagementPanel density="compact" />
        </SettingsSection>
      ) : null}
    </div>
  );
}
