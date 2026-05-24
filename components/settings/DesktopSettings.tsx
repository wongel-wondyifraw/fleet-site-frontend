"use client";

import {
  Bell,
  Building2,
  Clock,
  Globe,
  Info,
  KeyRound,
  Mail,
  MapPinned,
  Phone,
  Save,
  ShieldCheck,
  Smartphone,
  User,
  Users,
} from "lucide-react";
import { useMemo, useState, type ComponentType } from "react";

import { Button } from "@/components/ui/button";
import {
  FieldGrid,
  SettingsField,
  SettingsSection,
  ToggleRow,
  fieldClass,
} from "@/components/settings/SettingsShared";
import { SitesPanel } from "@/components/settings/SitesPanel";
import { UserManagementPanel } from "@/components/settings/UserManagementPanel";
import { formatRole } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/utils";

// Each settings section is identified by a stable string id.
type SectionId =
  | "profile"
  | "workspace"
  | "sites"
  | "users"
  | "notifications"
  | "security"
  | "about";

// Metadata for one section in the sub-sidebar.
type SectionMeta = {
  id: SectionId;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  // When true, the section is only visible to ADMIN users.
  adminOnly?: boolean;
};

// Full list of sections; admin-only ones are filtered out for non-admins.
const SECTIONS: SectionMeta[] = [
  {
    id: "profile",
    label: "Profile",
    description: "Account details",
    icon: User,
  },
  {
    id: "workspace",
    label: "Workspace",
    description: "Defaults & units",
    icon: MapPinned,
  },
  {
    id: "sites",
    label: "Sites",
    description: "Add & edit sites",
    icon: Building2,
  },
  {
    id: "users",
    label: "Users",
    description: "Team & roles",
    icon: Users,
    adminOnly: true,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Alerts & digests",
    icon: Bell,
  },
  {
    id: "security",
    label: "Security",
    description: "2FA & sessions",
    icon: ShieldCheck,
  },
  {
    id: "about",
    label: "About",
    description: "Build & version",
    icon: Info,
  },
];

// Static options used by the workspace panel selects.
const TIMEZONE_OPTIONS = [
  "GMT-8 · Pacific",
  "GMT-7 · Mountain",
  "GMT-6 · Central",
  "GMT-5 · Eastern",
];
const SHIFT_OPTIONS = [
  "Day (06:00 – 14:00)",
  "Swing (14:00 – 22:00)",
  "Night (22:00 – 06:00)",
];
const UNIT_OPTIONS = ["Metric (km, L)", "Imperial (mi, gal)"];
const DEFAULT_SITE_OPTIONS = [
  "North Creek Bridge",
  "Eastside Quarry",
  "Riverbend Plant",
  "Highway 14 Expansion",
];

export function DesktopSettings() {
  // Pull the signed-in user for role-aware section filtering.
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  // Filter out admin-only sections for non-admins.
  const visibleSections = useMemo(
    () => SECTIONS.filter((s) => !s.adminOnly || isAdmin),
    [isAdmin],
  );

  // Default to "profile"; reflow if the visible list ever changes underneath us.
  const [active, setActive] = useState<SectionId>("profile");
  const activeMeta =
    visibleSections.find((s) => s.id === active) ?? visibleSections[0];

  // Hide the global "Save Changes" button on panels that own their own actions.
  const sectionOwnsActions = active === "sites" || active === "users";

  return (
    <div className="hidden lg:block">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold tracking-widest text-dashboard-on-surface-variant uppercase">
            Account
          </p>
          <h1 className="font-headline-md text-headline-md text-dashboard-on-background">
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your profile, workspace preferences, sites, and security.
          </p>
        </div>
        {!sectionOwnsActions ? (
          <Button className="h-10 gap-2 rounded-xl bg-primary px-5 font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint">
            <Save className="size-4" />
            Save Changes
          </Button>
        ) : null}
      </header>

      <div className="grid grid-cols-[240px_minmax(0,1fr)] gap-6">
        <SubSidebar
          sections={visibleSections}
          active={active}
          onSelect={setActive}
        />
        <div className="min-w-0">
          <ActivePanel section={active} meta={activeMeta} />
        </div>
      </div>
    </div>
  );
}

// Left-hand navigation that lets the user switch between settings sections.
function SubSidebar({
  sections,
  active,
  onSelect,
}: {
  sections: SectionMeta[];
  active: SectionId;
  onSelect: (id: SectionId) => void;
}) {
  return (
    <aside className="sticky top-8 self-start rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
      <p className="font-label-caps mb-2 px-2 pt-1 text-[10px] tracking-wide text-muted-foreground uppercase">
        Settings
      </p>
      <nav className="space-y-1">
        {sections.map(({ id, label, description, icon: Icon }) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-slate-50 hover:text-primary",
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-slate-50 text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-primary">
                  {label}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {description}
                </span>
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

// Wraps the selected panel in the standard settings card chrome.
function ActivePanel({
  section,
  meta,
}: {
  section: SectionId;
  meta: SectionMeta;
}) {
  return (
    <SettingsSection
      title={meta.label}
      description={panelDescription(section)}
      icon={meta.icon}
    >
      {section === "profile" ? <ProfilePanel /> : null}
      {section === "workspace" ? <WorkspacePanel /> : null}
      {section === "sites" ? <SitesPanel /> : null}
      {section === "users" ? <UserManagementPanel /> : null}
      {section === "notifications" ? <NotificationsPanel /> : null}
      {section === "security" ? <SecurityPanel /> : null}
      {section === "about" ? <AboutPanel /> : null}
    </SettingsSection>
  );
}

// One-liner description shown under the section title in the card header.
function panelDescription(section: SectionId): string {
  switch (section) {
    case "profile":
      return "Your account details and contact information.";
    case "workspace":
      return "Defaults applied across the FleetSite dashboard.";
    case "sites":
      return "Add new construction sites and edit existing ones.";
    case "users":
      return "Invite teammates and assign their roles and sites.";
    case "notifications":
      return "Choose which fleet events you want to be alerted about.";
    case "security":
      return "Two-factor authentication and active sessions.";
    case "about":
      return "Build information and platform details.";
  }
}

// Profile panel - now driven entirely by the authenticated user from context.
function ProfilePanel() {
  const { user } = useAuth();

  // If for some reason we render without a user (shouldn't happen behind the
  // dashboard gate), bail out gracefully.
  if (!user) {
    return (
      <p className="text-sm text-muted-foreground">
        Sign in to view your profile.
      </p>
    );
  }

  // Initials power the avatar - safe even for one-character names.
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();

  return (
    <>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-semibold text-primary">
          {initials}
        </div>
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold text-primary">
              {user.firstName} {user.lastName}
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary uppercase">
              {formatRole(user.role)}
            </span>
          </div>
        </div>
      </div>

      <FieldGrid>
        <SettingsField label="First name">
          {/* readOnly until we wire profile updates; prevents misleading edits. */}
          <input
            type="text"
            value={user.firstName}
            readOnly
            className={`${fieldClass} bg-slate-50`}
          />
        </SettingsField>
        <SettingsField label="Last name">
          <input
            type="text"
            value={user.lastName}
            readOnly
            className={`${fieldClass} bg-slate-50`}
          />
        </SettingsField>
        <SettingsField label="Email">
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              value={user.email}
              readOnly
              className={`${fieldClass} bg-slate-50 pl-9`}
            />
          </div>
        </SettingsField>
        <SettingsField label="Role">
          <div className="relative">
            <ShieldCheck className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={formatRole(user.role)}
              readOnly
              className={`${fieldClass} bg-slate-50 pl-9`}
            />
          </div>
        </SettingsField>
        <SettingsField label="Assigned sites">
          <input
            type="text"
            value={
              user.sites.length > 0
                ? user.sites.map((s) => `${s.code} · ${s.name}`).join(", ")
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
                user.lastLoginAt
                  ? new Date(user.lastLoginAt).toLocaleString()
                  : "First sign-in"
              }
              readOnly
              className={`${fieldClass} bg-slate-50 pl-9`}
            />
          </div>
        </SettingsField>
      </FieldGrid>
    </>
  );
}

// Workspace panel - static selects until real preferences are persisted server-side.
function WorkspacePanel() {
  return (
    <FieldGrid>
      <SettingsField label="Default Site">
        <select className={fieldClass} defaultValue={DEFAULT_SITE_OPTIONS[0]}>
          {DEFAULT_SITE_OPTIONS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </SettingsField>
      <SettingsField label="Time Zone">
        <div className="relative">
          <Globe className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            className={`${fieldClass} pl-9`}
            defaultValue={TIMEZONE_OPTIONS[3]}
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz}>{tz}</option>
            ))}
          </select>
        </div>
      </SettingsField>
      <SettingsField label="Default Shift">
        <div className="relative">
          <Clock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            className={`${fieldClass} pl-9`}
            defaultValue={SHIFT_OPTIONS[0]}
          >
            {SHIFT_OPTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </SettingsField>
      <SettingsField label="Units">
        <select className={fieldClass} defaultValue={UNIT_OPTIONS[0]}>
          {UNIT_OPTIONS.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </SettingsField>
    </FieldGrid>
  );
}

// Notifications panel - local toggle state only (no persistence yet).
function NotificationsPanel() {
  const [notifications, setNotifications] = useState({
    vehicle: true,
    fuel: true,
    maintenance: true,
    attendance: false,
    weeklyDigest: true,
  });
  return (
    <>
      <ToggleRow
        label="Vehicle alerts"
        description="Real-time updates when vehicles change status."
        checked={notifications.vehicle}
        onChange={(v) => setNotifications((p) => ({ ...p, vehicle: v }))}
      />
      <ToggleRow
        label="Fuel anomalies"
        description="Unusual consumption or refill activity."
        checked={notifications.fuel}
        onChange={(v) => setNotifications((p) => ({ ...p, fuel: v }))}
      />
      <ToggleRow
        label="Maintenance due"
        description="Service intervals and inspection deadlines."
        checked={notifications.maintenance}
        onChange={(v) => setNotifications((p) => ({ ...p, maintenance: v }))}
      />
      <ToggleRow
        label="Attendance issues"
        description="Missed check-ins and overtime escalations."
        checked={notifications.attendance}
        onChange={(v) => setNotifications((p) => ({ ...p, attendance: v }))}
      />
      <ToggleRow
        label="Weekly digest"
        description="A Monday morning summary of last week's operations."
        checked={notifications.weeklyDigest}
        onChange={(v) => setNotifications((p) => ({ ...p, weeklyDigest: v }))}
      />
    </>
  );
}

// Security panel - placeholder sessions; password change flow deferred.
function SecurityPanel() {
  const [twoFactor, setTwoFactor] = useState(true);
  return (
    <>
      <ToggleRow
        label="Two-factor authentication"
        description="Require a one-time code when signing in from a new device."
        checked={twoFactor}
        onChange={setTwoFactor}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-primary">Password</p>
            <p className="text-xs text-muted-foreground">
              Last changed 42 days ago
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="h-9 rounded-xl border-slate-200 bg-white px-4 text-sm"
        >
          Change password
        </Button>
      </div>
      <div>
        <p className="font-label-caps mb-2 text-[10px] tracking-wide text-muted-foreground uppercase">
          Active sessions
        </p>
        <div className="space-y-2">
          <SessionRow
            device="Macbook Pro · Chrome"
            location="Site office · 192.168.1.42"
            lastActive="Active now"
            current
          />
          <SessionRow
            device="iPhone · FleetSite app"
            location="Sector 4 · Cellular"
            lastActive="Active 2h ago"
          />
          <SessionRow
            device="iPad · Safari"
            location="Maintenance bay · WiFi"
            lastActive="Active yesterday"
          />
        </div>
        <Button
          variant="ghost"
          className="mt-3 h-9 rounded-xl px-4 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          Sign out of all sessions
        </Button>
      </div>
    </>
  );
}

// About panel - static build info.
function AboutPanel() {
  return (
    <FieldGrid>
      <AboutItem label="Version" value="1.0.4-STABLE" />
      <AboutItem label="Build" value="2026.05.20-rc1" />
      <AboutItem label="Last sync" value="Today, 08:42 AM · GMT-5" />
      <AboutItem label="Support" value="support@fleetsite.io" />
    </FieldGrid>
  );
}

// Row inside the active sessions list.
function SessionRow({
  device,
  location,
  lastActive,
  current,
}: {
  device: string;
  location: string;
  lastActive: string;
  current?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-white text-muted-foreground ring-1 ring-slate-200">
          <Smartphone className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-primary">
            {device}
            {current ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                Current
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">{location}</p>
        </div>
      </div>
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {lastActive}
      </span>
    </div>
  );
}

// Single info card for the About section.
function AboutItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
      <p className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-primary">{value}</p>
    </div>
  );
}
