"use client";

import {
  Building2,
  ClipboardCheck,
  Clock,
  LogOut,
  Mail,
  Route,
  User,
  Users,
} from "@/lib/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  SettingsField,
  SettingsSection,
  fieldClass,
} from "@/components/settings/SettingsShared";
import { CustomTripRoutesPanel } from "@/components/settings/CustomTripRoutesPanel";
import { AttendanceRulesPanel } from "@/components/settings/AttendanceRulesPanel";
import { TimeSettingsPanel } from "@/components/settings/TimeSettingsPanel";
import { SitesPanel } from "@/components/settings/SitesPanel";
import { UserManagementPanel } from "@/components/settings/UserManagementPanel";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatRole } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDateTime } from "@/lib/time/format";
import { useTimeSettings } from "@/lib/time/TimeSettingsContext";

export function MobileSettings() {
  const router = useRouter();
  // Signed-in user drives the profile card and gates the Users section.
  const { user, logout } = useAuth();
  // Time settings drive last-signed-in formatting + the Time panel preview.
  const { settings: timeSettings } = useTimeSettings();
  // Drives the sign-out confirmation dialog so a stray tap can't end the session.
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);

  function handleLogout() {
    logout();
    router.replace("/");
  }
  const isAdmin = user?.role === "ADMIN";

  // Initials for the avatar circle.
  const initials = user
    ? `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()
    : "?";

  return (
    <div className="space-y-5 lg:hidden fs-panel-in">
      <header>
        <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
          Account
        </p>
        <h1 className="text-lg font-semibold text-primary">Settings</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Manage your profile and preferences.
        </p>
      </header>

      {/* Profile - real data from auth context. */}
      <SettingsSection title="Profile" icon={User}>
        <div className="flex items-center gap-3">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-semibold text-primary">
            {initials}
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">
              {user ? `${user.firstName} ${user.lastName}` : "—"}
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary uppercase">
              {user ? formatRole(user.role) : "—"}
            </span>
          </div>
        </div>

        <SettingsField label="Email">
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              value={user?.email ?? ""}
              readOnly
              className={`${fieldClass} bg-slate-50 pl-9`}
            />
          </div>
        </SettingsField>
        <SettingsField label="Assigned sites">
          <input
            type="text"
            value={
              user && user.sites.length > 0
                ? user.sites.map((s) => s.name).join(", ")
                : "None"
            }
            readOnly
            className={`${fieldClass} bg-slate-50`}
          />
        </SettingsField>
        <SettingsField label="Last signed in">
          <div className="relative">
            <Clock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={
                user?.lastLoginAt
                  ? formatDateTime(user.lastLoginAt, timeSettings)
                  : "First sign-in"
              }
              readOnly
              className={`${fieldClass} bg-slate-50 pl-9`}
            />
          </div>
        </SettingsField>
      </SettingsSection>

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

      <Button
        type="button"
        variant="ghost"
        onClick={() => setConfirmSignOutOpen(true)}
        className="h-11 w-full justify-center gap-2 rounded-xl border border-slate-200 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <LogOut className="size-4" />
        Sign Out
      </Button>

      <ConfirmDialog
        open={confirmSignOutOpen}
        onOpenChange={setConfirmSignOutOpen}
        title="Sign out of FleetSite?"
        description="You'll be returned to the login screen and will need to sign in again to continue."
        confirmLabel="Sign out"
        destructive
        onConfirm={handleLogout}
      />
    </div>
  );
}
