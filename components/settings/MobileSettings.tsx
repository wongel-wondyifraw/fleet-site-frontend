"use client";

import {
  Bell,
  Building2,
  Clock,
  Info,
  KeyRound,
  Mail,
  MapPinned,
  Save,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  SettingsField,
  SettingsSection,
  ToggleRow,
  fieldClass,
} from "@/components/settings/SettingsShared";
import { SitesPanel } from "@/components/settings/SitesPanel";
import { UserManagementPanel } from "@/components/settings/UserManagementPanel";
import { formatRole } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";

// Static options for the workspace section (not yet persisted server-side).
const SITE_OPTIONS = [
  "North Creek Bridge",
  "Eastside Quarry",
  "Riverbend Plant",
  "Highway 14 Expansion",
];
const SHIFT_OPTIONS = ["Day", "Swing", "Night"];
const UNIT_OPTIONS = ["Metric", "Imperial"];

export function MobileSettings() {
  // Signed-in user drives the profile card and gates the Users section.
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [notifications, setNotifications] = useState({
    vehicle: true,
    fuel: true,
    maintenance: true,
    attendance: false,
  });
  const [twoFactor, setTwoFactor] = useState(true);

  // Initials for the avatar circle.
  const initials = user
    ? `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()
    : "?";

  return (
    <div className="space-y-5 lg:hidden">
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
                ? user.sites.map((s) => s.code).join(", ")
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
                  ? new Date(user.lastLoginAt).toLocaleString()
                  : "First sign-in"
              }
              readOnly
              className={`${fieldClass} bg-slate-50 pl-9`}
            />
          </div>
        </SettingsField>
      </SettingsSection>

      <SettingsSection title="Workspace" icon={MapPinned}>
        <SettingsField label="Default Site">
          <select className={fieldClass} defaultValue={SITE_OPTIONS[0]}>
            {SITE_OPTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </SettingsField>
        <SettingsField label="Shift">
          <select className={fieldClass} defaultValue={SHIFT_OPTIONS[0]}>
            {SHIFT_OPTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </SettingsField>
        <SettingsField label="Units">
          <select className={fieldClass} defaultValue={UNIT_OPTIONS[0]}>
            {UNIT_OPTIONS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </SettingsField>
      </SettingsSection>

      <SettingsSection
        title="Sites"
        description="Add and edit construction sites."
        icon={Building2}
      >
        <SitesPanel density="compact" />
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

      <SettingsSection title="Notifications" icon={Bell}>
        <ToggleRow
          label="Vehicle alerts"
          checked={notifications.vehicle}
          onChange={(v) =>
            setNotifications((prev) => ({ ...prev, vehicle: v }))
          }
        />
        <ToggleRow
          label="Fuel anomalies"
          checked={notifications.fuel}
          onChange={(v) => setNotifications((prev) => ({ ...prev, fuel: v }))}
        />
        <ToggleRow
          label="Maintenance due"
          checked={notifications.maintenance}
          onChange={(v) =>
            setNotifications((prev) => ({ ...prev, maintenance: v }))
          }
        />
        <ToggleRow
          label="Attendance issues"
          checked={notifications.attendance}
          onChange={(v) =>
            setNotifications((prev) => ({ ...prev, attendance: v }))
          }
        />
      </SettingsSection>

      <SettingsSection title="Security" icon={ShieldCheck}>
        <ToggleRow
          label="Two-factor authentication"
          description="One-time code on new devices."
          checked={twoFactor}
          onChange={setTwoFactor}
        />
        <Button
          variant="outline"
          className="h-10 w-full justify-start gap-2 rounded-xl border-slate-200 bg-white text-sm"
        >
          <KeyRound className="size-4" />
          Change password
        </Button>
        <Button
          variant="ghost"
          className="h-10 w-full justify-start rounded-xl text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          Sign out of all sessions
        </Button>
      </SettingsSection>

      <SettingsSection title="About" icon={Info}>
        <AboutRow label="Version" value="1.0.4-STABLE" />
        <AboutRow label="Build" value="2026.05.20-rc1" />
        <AboutRow label="Support" value="support@fleetsite.io" />
      </SettingsSection>

      <Button className="h-12 w-full gap-2 rounded-xl bg-primary font-semibold shadow-md shadow-primary/20">
        <Save className="size-4" />
        Save Changes
      </Button>
    </div>
  );
}

// Single row in the About section on mobile.
function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5">
      <span className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-sm font-semibold text-primary">{value}</span>
    </div>
  );
}
