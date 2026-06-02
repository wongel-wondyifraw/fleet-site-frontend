"use client";

import {
  Bell,
  Building2,
  ClipboardCheck,
  Clock,
  Gauge,
  Mail,
  Route,
  ShieldCheck,
  User,
  Users,
} from "@/lib/icons";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, type ComponentType } from "react";

import {
  FieldGrid,
  SettingsField,
  SettingsSection,
  fieldClass,
} from "@/components/settings/SettingsShared";
import { CustomTripRoutesPanel } from "@/components/settings/CustomTripRoutesPanel";
import { AttendanceRulesPanel } from "@/components/settings/AttendanceRulesPanel";
import { SiteScoringPanel } from "@/components/settings/SiteScoringPanel";
import { TimeSettingsPanel } from "@/components/settings/TimeSettingsPanel";
import { SitesPanel } from "@/components/settings/SitesPanel";
import { UserManagementPanel } from "@/components/settings/UserManagementPanel";
import { NotificationsSettingsPanel } from "@/components/settings/NotificationsSettingsPanel";
import { formatRole } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDateTime } from "@/lib/time/format";
import { useTimeSettings } from "@/lib/time/TimeSettingsContext";
import { cn } from "@/lib/utils";

// Each settings section is identified by a stable string id.
type SectionId =
  | "profile"
  | "sites"
  | "trips"
  | "notifications"
  | "time"
  | "attendance"
  | "siteScoring"
  | "users";

// Narrowing helper for the `?section=` query param. Keeping this here (next to
// the SectionId definition) means the union and the runtime guard can't drift.
function isValidSection(value: string | null): value is SectionId {
  return (
    value === "profile" ||
    value === "sites" ||
    value === "trips" ||
    value === "notifications" ||
    value === "time" ||
    value === "attendance" ||
    value === "siteScoring" ||
    value === "users"
  );
}

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
    id: "sites",
    label: "Sites",
    description: "Add & edit sites",
    icon: Building2,
  },
  {
    id: "trips",
    label: "Trip Settings",
    description: "Custom start & end points",
    icon: Route,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "In-app, browser, and push",
    icon: Bell,
  },
  {
    id: "time",
    label: "Time",
    description: "Timezone & format",
    icon: Clock,
  },
  {
    id: "attendance",
    label: "Attendance Rules",
    description: "Schedule & target hours",
    icon: ClipboardCheck,
  },
  {
    id: "siteScoring",
    label: "Site Scoring",
    description: "Health score weights",
    icon: Gauge,
    adminOnly: true,
  },
  {
    id: "users",
    label: "Users",
    description: "Team & roles",
    icon: Users,
    adminOnly: true,
  },
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

  // Active sub-section is URL-driven so deep links like
  // `/settings?section=users` (used by the UserDetail back link)
  // land the admin on the right tab. Falling back to the first visible
  // section also handles cases where the requested section is hidden
  // (e.g. a non-admin requesting "users").
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedSection = searchParams.get("section");

  const active: SectionId = useMemo(() => {
    if (
      isValidSection(requestedSection) &&
      visibleSections.some((s) => s.id === requestedSection)
    ) {
      return requestedSection;
    }
    return visibleSections[0].id;
  }, [requestedSection, visibleSections]);

  // Sub-sidebar clicks update the URL rather than local state so the section
  // is always consistent with the address bar and works with browser back.
  const handleSelect = useCallback(
    (id: SectionId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("section", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const activeMeta =
    visibleSections.find((s) => s.id === active) ?? visibleSections[0];

  return (
    <div className="hidden lg:block fs-panel-in">
      <header className="mb-8">
        <p className="text-[11px] font-bold tracking-widest text-dashboard-on-surface-variant uppercase">
          Account
        </p>
        <h1 className="font-headline-md text-headline-md text-dashboard-on-background">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your profile, sites, and team members.
        </p>
      </header>

      <div className="grid grid-cols-[240px_minmax(0,1fr)] gap-6">
        <SubSidebar
          sections={visibleSections}
          active={active}
          onSelect={handleSelect}
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
      {section === "sites" ? <SitesPanel /> : null}
      {section === "trips" ? <CustomTripRoutesPanel /> : null}
      {section === "notifications" ? <NotificationsSettingsPanel /> : null}
      {section === "time" ? <TimeSettingsPanel /> : null}
      {section === "attendance" ? <AttendanceRulesPanel /> : null}
      {section === "siteScoring" ? <SiteScoringPanel /> : null}
      {section === "users" ? <UserManagementPanel /> : null}
    </SettingsSection>
  );
}

// One-liner description shown under the section title in the card header.
function panelDescription(section: SectionId): string {
  switch (section) {
    case "profile":
      return "Your account details and contact information.";
    case "sites":
      return "Add new construction sites and edit existing ones.";
    case "trips":
      return "Save reusable start and end points to surface as Custom presets on the trip form.";
    case "notifications":
      return "Control where each notification kind is delivered: in-app, browser toast, and push.";
    case "time":
      return "Set the application timezone and 12 / 24-hour display format.";
    case "attendance":
      return "Set expected punch times and the daily working-hours target for attendance.";
    case "siteScoring":
      return "Adjust dimension weights, status bands, and data-quality thresholds for site health scores.";
    case "users":
      return "Invite teammates and assign their roles and sites.";
  }
}

// Profile panel - now driven entirely by the authenticated user from context.
function ProfilePanel() {
  const { user } = useAuth();
  const { settings: timeSettings } = useTimeSettings();

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
                user.lastLoginAt
                  ? formatDateTime(user.lastLoginAt, timeSettings)
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

