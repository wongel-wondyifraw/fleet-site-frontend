"use client";

// Mobile profile popout, anchored to the avatar circle in
// DashboardMobileTopBar. Pulls the "Profile" card and the Sign Out
// button out of MobileSettings so they're always one tap away from any
// screen — no need to bounce through /settings just to log out or
// double-check which account is signed in.
//
// Reuses the same Popover primitive and visual language as the
// notifications popout (rounded-2xl surface, slate hairline, primary-blue
// text, FleetSite tokens throughout) so every floating panel on mobile
// reads as part of the same family.

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

import { Clock, LogOut, Mail, MapPin, Settings, User } from "@/lib/icons";

import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatRoleName } from "@/lib/api/types";
import { formatDateTime } from "@/lib/time/format";
import { useTimeSettings } from "@/lib/time/TimeSettingsContext";
import { cn } from "@/lib/utils";

export function ProfilePopover() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { settings: timeSettings } = useTimeSettings();
  // Drives the sign-out confirmation dialog. Reuses the same component
  // the desktop sidebar uses so a misclick can't end the session.
  const [confirmSignOutOpen, setConfirmSignOutOpen] = useState(false);

  // Render nothing while auth is bootstrapping so we don't briefly show
  // a "?" avatar before the user object arrives.
  if (!user) return null;

  const initials =
    `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  const siteList =
    user.sites.length > 0
      ? user.sites.map((site) => site.name).join(", ")
      : "None";
  const lastLoginLabel = user.lastLoginAt
    ? formatDateTime(user.lastLoginAt, timeSettings)
    : "First sign-in";

  function handleLogout() {
    logout();
    router.replace("/");
  }

  return (
    <>
      <Popover>
        <PopoverTrigger
          type="button"
          aria-label={`Signed in as ${fullName}. Open account menu.`}
          className={cn(
            // Same size-9 chrome as the other top-bar affordances so the
            // avatar still slots cleanly next to the bell + settings.
            "group/avatar relative inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary outline-none transition-all",
            "hover:bg-primary/15",
            "focus-visible:ring-3 focus-visible:ring-ring/40",
            // Subtle ring while the popover is open so the trigger
            // reads as "selected" rather than floating.
            "data-popup-open:ring-2 data-popup-open:ring-primary/30 data-popup-open:ring-offset-2 data-popup-open:ring-offset-white",
          )}
        >
          {initials}
        </PopoverTrigger>

        <PopoverContent
          // Mobile top-bar avatar sits in the top-right corner → drop
          // straight down and pin to the right edge of the screen.
          side="bottom"
          align="end"
          sideOffset={10}
          alignOffset={-4}
          collisionPadding={12}
          className="flex w-[min(320px,calc(100vw-1.5rem))] flex-col p-0"
        >
          <ProfileHeader
            initials={initials}
            fullName={fullName}
            roleName={formatRoleName(user.role)}
            email={user.email}
          />

          <div className="flex flex-col gap-2 px-4 py-3">
            <ProfileInfoRow
              icon={MapPin}
              label="Assigned sites"
              value={siteList}
            />
            <ProfileInfoRow
              icon={Clock}
              label="Last signed in"
              value={lastLoginLabel}
            />
          </div>

          <div className="border-t border-slate-100 px-2 py-2">
            {/* nativeButton={false} so base-ui treats the underlying
                <a> as a non-button element and doesn't apply button-only
                semantics that would clash with the Link. */}
            <PopoverClose
              nativeButton={false}
              render={
                <Link
                  href="/account"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Settings className="size-4" />
                  </span>
                  <span className="flex-1 text-left">Account settings</span>
                </Link>
              }
            />
          </div>

          <footer className="border-t border-slate-100 bg-slate-50/60 px-2 py-2">
            <PopoverClose
              render={
                <button
                  type="button"
                  onClick={() => setConfirmSignOutOpen(true)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive focus:outline-none"
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                    <LogOut className="size-4" />
                  </span>
                  <span className="flex-1 text-left">Sign out</span>
                </button>
              }
            />
          </footer>
        </PopoverContent>
      </Popover>

      <ConfirmDialog
        open={confirmSignOutOpen}
        onOpenChange={setConfirmSignOutOpen}
        title="Sign out of FleetSite?"
        description="You'll be returned to the login screen and will need to sign in again to continue."
        confirmLabel="Sign out"
        destructive
        onConfirm={handleLogout}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Header — bigger avatar tile + identity strip + email row.
// ---------------------------------------------------------------------------

function ProfileHeader({
  initials,
  fullName,
  roleName,
  email,
}: {
  initials: string;
  fullName: string;
  roleName: string;
  email: string;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-white px-4 pt-4 pb-3">
      <div className="flex items-center gap-3">
        <div
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-base font-bold text-primary"
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-tight font-semibold text-primary">
            {fullName || "—"}
          </p>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-[2px] text-[10px] font-bold tracking-wide text-primary uppercase">
            <User className="size-3" aria-hidden />
            {roleName}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[12px] text-muted-foreground">
        <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium text-primary">
          {email}
        </span>
      </div>
    </header>
  );
}

// Compact key/value strip used for the two read-only profile fields
// (assigned sites, last signed in). Mirrors the SettingsField labelling
// idiom but in a popover-friendly density.
function ProfileInfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className="mt-0.5 truncate text-[13px] font-medium text-primary">
          {value}
        </p>
      </div>
    </div>
  );
}
