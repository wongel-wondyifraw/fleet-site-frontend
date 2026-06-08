"use client";

// Dedicated notifications inbox page (rendered at /notifications).
//
// Shares NotificationsContext + the visual language module with the
// sidebar popover, so a mark-as-read here is reflected in the bell
// badge immediately, and the styling never drifts between the two
// surfaces. Adds inbox-only affordances on top of the popover:
//   - Category filter strip (per-kind chips)
//   - Per-row hover actions (toggle read state, delete)
//   - "Clear all" footer action
//   - Empty-state copy tailored to the active filter

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  ArrowLeft,
  Check,
  CheckCircle as MarkReadIcon,
  Bell,
  Eye as MarkUnreadIcon,
  Trash2,
} from "@/lib/icons";

import {
  BellIcon,
  KIND_META,
  LABELS,
  READ_FILTER_LABEL,
  SEVERITY_ICON,
  TONE_STYLES,
  filterByReadState,
  formatRelative,
  isToday,
  type NotificationItem,
  type NotificationKind,
  type NotificationReadFilter,
} from "@/lib/notifications/data";
import { useHomePath } from "@/lib/auth/useScopedSiteIds";
import { useNotifications } from "@/lib/notifications/NotificationsContext";
import { enablePush, isPushEnabledLocally } from "@/lib/notifications/push";
import { useToast } from "@/lib/toast/ToastContext";
import { cn } from "@/lib/utils";

// All kinds the category strip exposes. Locked to the order the
// dashboard nav uses so the visual mapping reads cleanly.
const CATEGORY_ORDER: NotificationKind[] = [
  "trip",
  "fuel",
  "attendance",
  "vehicle",
  "driver",
  "system",
];

type CategoryFilter = NotificationKind | "all";

export function NotificationsInbox() {
  const {
    items,
    unreadCount,
    markRead,
    markUnread,
    markAllRead,
    remove,
    clearAll,
    preferences,
  } = useNotifications();
  const { showToast } = useToast();

  const [readFilter, setReadFilter] = useState<NotificationReadFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  const counts = useMemo(
    () => ({
      all: items.length,
      unread: unreadCount,
      read: items.length - unreadCount,
    }),
    [items.length, unreadCount],
  );

  // Per-kind counts (raw, ignoring read filter) so the category chips
  // can show "Fuel · 3" even when the user is on the Unread tab.
  const categoryCounts = useMemo(() => {
    const map = new Map<NotificationKind, number>();
    for (const item of items) {
      map.set(item.kind, (map.get(item.kind) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    const afterRead = filterByReadState(items, readFilter);
    if (categoryFilter === "all") return afterRead;
    return afterRead.filter((item) => item.kind === categoryFilter);
  }, [items, readFilter, categoryFilter]);

  const grouped = useMemo(() => {
    const today: NotificationItem[] = [];
    const earlier: NotificationItem[] = [];
    for (const item of filtered) {
      (isToday(item.createdAt) ? today : earlier).push(item);
    }
    return { today, earlier };
  }, [filtered]);

  const inboxEmpty = items.length === 0;
  const filterMatchEmpty = !inboxEmpty && filtered.length === 0;
  const [pushBusy, setPushBusy] = useState(false);
  // Only nudge for push when the user has actually opted into notifications.
  // Showing this banner with master-off would let users "enable push" on
  // this device but they'd still receive nothing because the server is
  // gated on `notificationsEnabled`. Settings is the single point where
  // the master switch lives.
  const showPushPrompt =
    !isPushEnabledLocally() && preferences?.notificationsEnabled === true;

  async function handleEnablePush() {
    try {
      setPushBusy(true);
      const ok = await enablePush();
      if (ok) {
        showToast({
          variant: "success",
          message: "Push notifications enabled on this device.",
        });
      } else {
        showToast({
          variant: "error",
          message: "Push notifications are not supported on this device.",
        });
      }
    } catch {
      showToast({
        variant: "error",
        message: "Could not enable push notifications.",
      });
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 lg:gap-6">
      <PageHeader unreadCount={unreadCount} totalCount={items.length} />
      {showPushPrompt ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary">
              Get alerts on this device
            </p>
            <p className="text-xs text-muted-foreground">
              Enable push notifications to receive important updates even when the app is closed.
            </p>
          </div>
          <button
            type="button"
            onClick={handleEnablePush}
            disabled={pushBusy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
          >
            <Bell className="size-3.5" />
            {pushBusy ? "Enabling..." : "Enable"}
          </button>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <Toolbar
          counts={counts}
          readFilter={readFilter}
          categoryFilter={categoryFilter}
          onReadFilterChange={setReadFilter}
          onCategoryFilterChange={setCategoryFilter}
          categoryCounts={categoryCounts}
          onMarkAllRead={markAllRead}
        />

        <div
          role="region"
          aria-label={LABELS.notifications}
          className="max-h-[calc(100dvh-280px)] overflow-y-auto overscroll-contain px-2 py-2 sm:px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {inboxEmpty ? (
            <EmptyState mode="empty" />
          ) : filterMatchEmpty ? (
            <EmptyState mode="filtered" />
          ) : (
            <div className="flex flex-col gap-4">
              {grouped.today.length > 0 && (
                <Section title={LABELS.sectionToday}>
                  {grouped.today.map((item) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      onActivate={markRead}
                      onMarkRead={markRead}
                      onMarkUnread={markUnread}
                      onDelete={remove}
                    />
                  ))}
                </Section>
              )}
              {grouped.earlier.length > 0 && (
                <Section title={LABELS.sectionEarlier}>
                  {grouped.earlier.map((item) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      onActivate={markRead}
                      onMarkRead={markRead}
                      onMarkUnread={markUnread}
                      onDelete={remove}
                    />
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>

        {!inboxEmpty && (
          <footer className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              {filtered.length === items.length
                ? `${items.length} total`
                : `${filtered.length} of ${items.length} shown`}
            </p>
            <button
              type="button"
              onClick={clearAll}
              className="rounded-lg px-2 py-1 text-[11px] font-semibold text-destructive transition-colors hover:bg-destructive/10"
            >
              Clear all
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page header (title + subtitle + back link on mobile).
// ---------------------------------------------------------------------------

function PageHeader({
  unreadCount,
  totalCount,
}: {
  unreadCount: number;
  totalCount: number;
}) {
  // Scoped users have no org-wide /dashboard; route back to their site.
  const homePath = useHomePath();
  return (
    <header className="flex flex-col gap-3">
      <Link
        href={homePath}
        className="inline-flex w-fit items-center gap-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-3.5" />
        Back to dashboard
      </Link>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-primary lg:text-3xl">
            {LABELS.inboxTitle}
          </h1>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
              unreadCount > 0
                ? "bg-destructive/10 text-destructive"
                : "bg-success/15 text-success",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "inline-block size-1.5 rounded-full",
                unreadCount > 0 ? "bg-destructive" : "bg-success",
              )}
            />
            {unreadCount > 0
              ? unreadCount === 1
                ? LABELS.unreadOne
                : LABELS.unreadMany(unreadCount)
              : LABELS.allCaughtUp}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {LABELS.inboxSubtitle}
          {totalCount > 0 ? ` · ${totalCount} total` : null}
        </p>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Toolbar: read-state tabs (top) + category strip (bottom) + mark-all-read.
// ---------------------------------------------------------------------------

function Toolbar({
  counts,
  readFilter,
  categoryFilter,
  onReadFilterChange,
  onCategoryFilterChange,
  categoryCounts,
  onMarkAllRead,
}: {
  counts: { all: number; unread: number; read: number };
  readFilter: NotificationReadFilter;
  categoryFilter: CategoryFilter;
  onReadFilterChange: (filter: NotificationReadFilter) => void;
  onCategoryFilterChange: (filter: CategoryFilter) => void;
  categoryCounts: Map<NotificationKind, number>;
  onMarkAllRead: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 px-3 pt-3 pb-3 sm:px-4">
      {/* Top row: read-state tab strip + mark-all-read action. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ReadFilterTabs
          filter={readFilter}
          counts={counts}
          onChange={onReadFilterChange}
        />
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={counts.unread === 0}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
            "text-primary hover:bg-primary/10",
            "disabled:cursor-default disabled:text-muted-foreground/60 disabled:hover:bg-transparent",
          )}
        >
          <Check className="size-3.5" />
          {LABELS.markAllRead}
        </button>
      </div>

      {/* Category strip — All + one chip per kind, scrolls horizontally
          on small viewports so the inbox stays usable on phones. */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <CategoryChip
          active={categoryFilter === "all"}
          label={LABELS.categoryAll}
          onClick={() => onCategoryFilterChange("all")}
        />
        {CATEGORY_ORDER.map((kind) => {
          const meta = KIND_META[kind];
          const count = categoryCounts.get(kind) ?? 0;
          return (
            <CategoryChip
              key={kind}
              kind={kind}
              active={categoryFilter === kind}
              label={meta.label}
              count={count}
              onClick={() => onCategoryFilterChange(kind)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ReadFilterTabs({
  filter,
  counts,
  onChange,
}: {
  filter: NotificationReadFilter;
  counts: { all: number; unread: number; read: number };
  onChange: (filter: NotificationReadFilter) => void;
}) {
  const chips: Array<{ id: NotificationReadFilter; count: number }> = [
    { id: "all", count: counts.all },
    { id: "unread", count: counts.unread },
    { id: "read", count: counts.read },
  ];
  return (
    <div
      role="tablist"
      aria-label="Filter by read state"
      className="inline-flex gap-1 rounded-xl bg-slate-100/80 p-1"
    >
      {chips.map((chip) => {
        const active = filter === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(chip.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors",
              active
                ? "bg-white text-primary shadow-sm ring-1 ring-black/[0.03]"
                : "text-muted-foreground hover:text-primary",
            )}
          >
            {READ_FILTER_LABEL[chip.id]}
            <span
              className={cn(
                "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-[1px] text-[10px] font-bold tabular-nums",
                active
                  ? chip.id === "unread"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary"
                  : "bg-slate-200/80 text-muted-foreground",
              )}
            >
              {chip.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CategoryChip({
  kind,
  active,
  label,
  count,
  onClick,
}: {
  kind?: NotificationKind;
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  const meta = kind ? KIND_META[kind] : null;
  const Icon = meta?.icon;
  const tone = meta ? TONE_STYLES[meta.defaultTone] : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-slate-200 bg-white text-muted-foreground hover:border-slate-300 hover:text-primary",
      )}
      aria-pressed={active}
    >
      {Icon && tone ? (
        <Icon className={cn("size-3.5", active ? "text-primary" : tone.icon)} />
      ) : null}
      <span>{label}</span>
      {typeof count === "number" && (
        <span
          className={cn(
            "inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-[1px] text-[10px] font-bold tabular-nums",
            active
              ? "bg-primary/15 text-primary"
              : "bg-slate-100 text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Row + section primitives.
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-1">
      <p className="font-label-caps px-2 pt-1 pb-1.5 text-[10px] tracking-wide text-muted-foreground/80 uppercase">
        {title}
      </p>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </section>
  );
}

function NotificationRow({
  item,
  onActivate,
  onMarkRead,
  onMarkUnread,
  onDelete,
}: {
  item: NotificationItem;
  onActivate: (id: string) => void;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const SevIcon = SEVERITY_ICON[item.severity];
  const tone = TONE_STYLES[item.severity];

  return (
    <li>
      <div
        className={cn(
          // Inbox rows get a hairline ring on hover/focus so the actions
          // on the right read as part of an "active" surface.
          "group relative flex items-start gap-3 rounded-xl border border-transparent px-3 py-3 transition-all outline-none",
          "before:absolute before:top-3 before:bottom-3 before:left-0 before:w-[3px] before:rounded-r-full before:opacity-0 before:transition-opacity",
          "hover:border-slate-200 hover:bg-slate-50 focus-within:border-slate-200 focus-within:bg-slate-50",
          !item.read && "before:opacity-100",
          !item.read && tone.stripe,
          item.read && "opacity-95",
        )}
      >
        <RowLink item={item} onActivate={onActivate}>
          <span
            className={cn(
              "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl",
              tone.tile,
            )}
            aria-hidden
          >
            <Icon className={cn("size-5", tone.icon)} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  "min-w-0 flex-1 text-[14px] leading-tight text-primary",
                  item.read ? "font-medium" : "font-semibold",
                )}
              >
                {item.title}
              </p>
              {!item.read && (
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    tone.dotBg,
                  )}
                />
              )}
            </div>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
              {item.message}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-semibold tracking-wide uppercase",
                  tone.pill,
                )}
              >
                <SevIcon className="size-3" />
                {meta.label}
              </span>
              <span className="text-[12px] font-medium text-muted-foreground">
                {formatRelative(item.createdAt)}
              </span>
            </div>
          </div>
        </RowLink>

        {/* Row actions. Visible on hover/focus on desktop, always visible
            on touch so the inbox stays usable without hover. */}
        <RowActions
          read={item.read}
          onMarkRead={() => onMarkRead(item.id)}
          onMarkUnread={() => onMarkUnread(item.id)}
          onDelete={() => onDelete(item.id)}
        />
      </div>
    </li>
  );
}

// Wraps the main row content in a Link when the item has an href, or in
// a plain div when it doesn't. The action buttons live as a separate
// sibling so clicking them doesn't trigger the row's navigation.
function RowLink({
  item,
  onActivate,
  children,
}: {
  item: NotificationItem;
  onActivate: (id: string) => void;
  children: React.ReactNode;
}) {
  const meta = KIND_META[item.kind];
  const ariaLabel = `${meta.label}: ${item.title}`;
  if (item.href) {
    return (
      <Link
        href={item.href}
        onClick={() => onActivate(item.id)}
        aria-label={ariaLabel}
        className="flex min-w-0 flex-1 items-start gap-3 outline-none"
      >
        {children}
      </Link>
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onActivate(item.id)}
      aria-label={ariaLabel}
      className="flex min-w-0 flex-1 items-start gap-3 outline-none"
    >
      {children}
    </div>
  );
}

function RowActions({
  read,
  onMarkRead,
  onMarkUnread,
  onDelete,
}: {
  read: boolean;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1 self-start",
        // Hover-only on mouse devices, always visible on touch so the
        // inbox remains usable without hover. `group-hover` keeps the
        // strip discreet on desktop until the user mouses over.
        "opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
      )}
      // Stop click bubbling so pressing an action doesn't also fire the
      // RowLink's onClick / navigation.
      onClick={(e) => e.stopPropagation()}
    >
      {read ? (
        <ActionButton
          label="Mark as unread"
          onClick={onMarkUnread}
          icon={<MarkUnreadIcon className="size-3.5" />}
        />
      ) : (
        <ActionButton
          label="Mark as read"
          onClick={onMarkRead}
          icon={<MarkReadIcon className="size-3.5" />}
        />
      )}
      <ActionButton
        label="Dismiss notification"
        onClick={onDelete}
        icon={<Trash2 className="size-3.5" />}
        tone="destructive"
      />
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  icon,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  tone?: "neutral" | "destructive";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-lg transition-colors",
        tone === "destructive"
          ? "text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
      )}
    >
      {icon}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Empty state. Two modes so the wording matches the situation.
// ---------------------------------------------------------------------------

function EmptyState({ mode }: { mode: "empty" | "filtered" }) {
  const title =
    mode === "empty" ? LABELS.emptyTitle : LABELS.emptyFilteredTitle;
  const body = mode === "empty" ? LABELS.emptyBody : LABELS.emptyFilteredBody;
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <BellIcon className="size-6" />
      </span>
      <p className="text-base font-semibold text-primary">{title}</p>
      <p className="max-w-[340px] text-sm leading-snug text-muted-foreground">
        {body}
      </p>
    </div>
  );
}
