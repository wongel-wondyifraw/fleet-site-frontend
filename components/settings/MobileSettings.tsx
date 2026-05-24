"use client";

import { Building2, Clock, Mail, User, Users } from "lucide-react";

import {
  SettingsField,
  SettingsSection,
  fieldClass,
} from "@/components/settings/SettingsShared";
import { SitesPanel } from "@/components/settings/SitesPanel";
import { UserManagementPanel } from "@/components/settings/UserManagementPanel";
import { formatRole } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";

export function MobileSettings() {
  // Signed-in user drives the profile card and gates the Users section.
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

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
                  ? new Date(user.lastLoginAt).toLocaleString()
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
