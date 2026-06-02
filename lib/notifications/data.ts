// Shared notifications data layer.
//
// Owns the public types and visual constants for everything notifications
// related (popover, dedicated /notifications page, future toasts). Keeping
// LABELS / KIND_META / TONE_STYLES / formatRelative in one place is what
// lets the popover and the inbox page render identically without
// drifting, and gives us a single i18n / theming seam to swap later.

import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Clock,
  Fuel,
  Info,
  Route,
  Settings,
  Truck,
  Users,
} from "@/lib/icons";
import type { ComponentType } from "react";

// Notification *kind* drives the icon + accent color. Kinds are aligned
// with the dashboard's primary domain objects so a TRIP notification
// reads visually like the Trips section, FUEL like Fuel, etc.
export type NotificationKind =
  | "system"
  | "trip"
  | "fuel"
  | "vehicle"
  | "driver"
  | "attendance"
  | "site_health";

// Severity drives the dot / badge color and ARIA assertiveness. Kept
// orthogonal to `kind` so an "attendance" warning is still painted in
// the warning palette regardless of its category icon.
export type NotificationSeverity = "info" | "success" | "warning" | "danger";

export type NotificationReadFilter = "all" | "unread" | "read";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  message: string;
  // ISO timestamp. Kept as a string so the component is trivially
  // pluggable with whatever backend shape ships later.
  createdAt: string;
  read: boolean;
  // Optional deep-link the row jumps to on click.
  href?: string;
}

// ---------------------------------------------------------------------------
// Copy
//
// Single place that owns every visible string used across notification
// surfaces. Swap the values for any locale (or drive them from a future
// i18n hook) and every notification surface speaks that language.
// ---------------------------------------------------------------------------
export const LABELS = {
  notifications: "Notifications",
  inboxTitle: "Notifications inbox",
  inboxSubtitle: "Every alert from your fleet, in one place.",
  unreadOne: "1 unread",
  unreadMany: (n: number) => `${n} unread`,
  allCaughtUp: "All caught up",
  markAllRead: "Mark all as read",
  viewAll: "View all notifications",
  emptyTitle: "You're all caught up",
  emptyBody: "New activity from your fleet will land here as it happens.",
  emptyFilteredTitle: "Nothing here",
  emptyFilteredBody: "No notifications match the current filter.",
  sectionToday: "Today",
  sectionEarlier: "Earlier",
  triggerLabel: "Notifications",
  justNow: "just now",
  minute: (n: number) => `${n}m ago`,
  hour: (n: number) => `${n}h ago`,
  day: (n: number) => `${n}d ago`,
  filterAll: "All",
  filterUnread: "Unread",
  filterRead: "Read",
  // Used for category chip filtering on the dedicated inbox page.
  categoryAll: "All categories",
} as const;

// Human-readable label for each read-state filter, used by the popover
// header chips and the inbox tab strip.
export const READ_FILTER_LABEL: Record<NotificationReadFilter, string> = {
  all: LABELS.filterAll,
  unread: LABELS.filterUnread,
  read: LABELS.filterRead,
};

// ---------------------------------------------------------------------------
// Visual identity per kind.
//
// Every color references a FleetSite design token (var(--primary),
// var(--success), etc.) so the popover follows the brand palette
// without hard-coding hex values here.
// ---------------------------------------------------------------------------
export interface KindMeta {
  icon: ComponentType<{ className?: string }>;
  label: string;
  defaultTone: NotificationSeverity;
}

export const KIND_META: Record<NotificationKind, KindMeta> = {
  system: { icon: Settings, label: "System", defaultTone: "info" },
  trip: { icon: Route, label: "Trips", defaultTone: "info" },
  fuel: { icon: Fuel, label: "Fuel", defaultTone: "warning" },
  vehicle: { icon: Truck, label: "Vehicles", defaultTone: "info" },
  driver: { icon: Users, label: "Drivers", defaultTone: "success" },
  attendance: { icon: Clock, label: "Attendance", defaultTone: "warning" },
  site_health: { icon: AlertTriangle, label: "Site health", defaultTone: "danger" },
};

// Severity -> token-driven classes. Each tone uses a quintet:
//   tile     - soft tinted background for the leading icon square
//   icon     - foreground color for the icon glyph
//   stripe   - the left accent border on the row (used via before:)
//   dotBg    - the unread dot's background
//   pill     - chip background + foreground for the category pill
//
// Every color resolves to a CSS variable in app/globals.css so any
// brand-palette change cascades to the notifications surface for free.
export interface ToneStyle {
  tile: string;
  icon: string;
  stripe: string;
  dotBg: string;
  pill: string;
}

export const TONE_STYLES: Record<NotificationSeverity, ToneStyle> = {
  info: {
    tile: "bg-primary/10",
    icon: "text-primary",
    stripe: "before:bg-primary",
    dotBg: "bg-primary",
    pill: "bg-primary/10 text-primary",
  },
  success: {
    tile: "bg-success/15",
    icon: "text-success",
    stripe: "before:bg-success",
    dotBg: "bg-success",
    pill: "bg-success/15 text-success",
  },
  warning: {
    // No dedicated "warning" token in the palette yet — accent (sky)
    // tinted toward primary reads as a soft alert without introducing a
    // new color. If a true amber token lands later, point this at it.
    tile: "bg-accent",
    icon: "text-primary",
    stripe: "before:bg-secondary",
    dotBg: "bg-secondary",
    pill: "bg-accent text-primary",
  },
  danger: {
    tile: "bg-destructive/10",
    icon: "text-destructive",
    stripe: "before:bg-destructive",
    dotBg: "bg-destructive",
    pill: "bg-destructive/10 text-destructive",
  },
};

// Icon shown on the severity badge inside a row's category pill.
export const SEVERITY_ICON: Record<
  NotificationSeverity,
  ComponentType<{ className?: string }>
> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  danger: AlertTriangle,
};

// Re-exported so consumers can use the brand bell for empty states
// without dipping into the icons module directly.
export const BellIcon = Bell;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatRelative(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const deltaMs = Math.max(0, now - t);
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return LABELS.justNow;
  if (minutes < 60) return LABELS.minute(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return LABELS.hour(hours);
  const days = Math.floor(hours / 24);
  return LABELS.day(days);
}

export function isToday(iso: string, now: Date = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// Filter helper kept here (instead of in the context) so the inbox page
// and the popover apply read-state filtering identically.
export function filterByReadState(
  items: NotificationItem[],
  filter: NotificationReadFilter,
): NotificationItem[] {
  if (filter === "all") return items;
  if (filter === "unread") return items.filter((item) => !item.read);
  return items.filter((item) => item.read);
}

export function countUnread(items: NotificationItem[]): number {
  return items.reduce((n, item) => n + (item.read ? 0 : 1), 0);
}
