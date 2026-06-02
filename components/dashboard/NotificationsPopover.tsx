"use client";

// FleetSite notifications popout.
//
// Anchored to the bell button in either the desktop sidebar
// (placement="sidebar") or the mobile top bar (placement="topbar"). The
// surface is intentionally on-brand: rounded panel, slate hairline, soft
// shadow, and primary-blue body text. Each row's `kind` selects the
// icon, while its `severity` selects the tone — both come from
// lib/notifications/data.ts so the popover and the dedicated /notifications
// inbox page render identically and stay in sync via NotificationsContext.

import Link from "next/link";
import { useMemo, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  type NotificationReadFilter,
} from "@/lib/notifications/data";
import { useNotifications } from "@/lib/notifications/NotificationsContext";
import { cn } from "@/lib/utils";

export interface NotificationsPopoverProps {
  // Drives anchor side/align and the trigger button's chrome so the
  // bell visually belongs to whichever surface it's mounted on.
  placement: "sidebar" | "topbar";
}

export function NotificationsPopover({ placement }: NotificationsPopoverProps) {
  const { items, unreadCount, markRead, markAllRead } = useNotifications();
  // Read-state filter for the popover. The inbox page owns its own
  // independent filter state so the two surfaces can be tuned separately.
  const [filter, setFilter] = useState<NotificationReadFilter>("all");
  // Controlled open state so we can dismiss the popover programmatically
  // when the user follows the "View all" deep link (otherwise the
  // client-side Next.js navigation leaves the popover floating over the
  // newly-loaded inbox page).
  const [open, setOpen] = useState(false);

  // Cached counts feeding the chip badges so the user can see how many
  // items live behind each filter without flipping through them.
  const counts = useMemo(
    () => ({
      all: items.length,
      unread: unreadCount,
      read: items.length - unreadCount,
    }),
    [items.length, unreadCount],
  );

  const visibleItems = useMemo(
    () => filterByReadState(items, filter),
    [items, filter],
  );

  const grouped = useMemo(() => {
    const today: NotificationItem[] = [];
    const earlier: NotificationItem[] = [];
    for (const item of visibleItems) {
      (isToday(item.createdAt) ? today : earlier).push(item);
    }
    return { today, earlier };
  }, [visibleItems]);

  const isSidebar = placement === "sidebar";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        aria-label={LABELS.triggerLabel}
        className={cn(
          // Shared bell-button chrome — matches the other size-9 rounded
          // affordances in the sidebar/topbar.
          "group/notif relative inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-transparent text-muted-foreground outline-none transition-colors",
          "hover:bg-slate-50 hover:text-primary",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "data-popup-open:bg-primary/10 data-popup-open:text-primary",
        )}
      >
        <BellIcon className="size-4" />
        {unreadCount > 0 ? (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-[5px] text-[10px] leading-none font-semibold text-white shadow-sm ring-2 ring-white"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
        <span className="sr-only">
          {unreadCount > 0
            ? unreadCount === 1
              ? LABELS.unreadOne
              : LABELS.unreadMany(unreadCount)
            : LABELS.allCaughtUp}
        </span>
      </PopoverTrigger>

      <PopoverContent
        // Sidebar bell lives at the bottom-left of the screen → fly out
        // to the right. Mobile topbar bell sits top-right → drop down
        // and align to the right edge of the viewport.
        side={isSidebar ? "right" : "bottom"}
        align="end"
        sideOffset={isSidebar ? 12 : 10}
        alignOffset={-4}
        collisionPadding={12}
        className={cn(
          // Wider surface so the filter chips fit comfortably alongside
          // the title in the header. The min() guard keeps the card
          // honest on small viewports.
          "flex w-[min(440px,calc(100vw-1.5rem))] flex-col p-0",
          // The sidebar variant gets a bit more height because there's
          // more vertical room to play with; the mobile variant stays
          // compact to avoid covering the page content.
          isSidebar ? "max-h-[560px]" : "max-h-[72vh]",
        )}
      >
        <NotificationsHeader
          counts={counts}
          filter={filter}
          onFilterChange={setFilter}
          onMarkAllRead={markAllRead}
        />

        <div
          className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="region"
          aria-label={LABELS.notifications}
        >
          {visibleItems.length === 0 ? (
            <EmptyState filtered={items.length > 0} />
          ) : (
            <>
              {grouped.today.length > 0 && (
                <Section title={LABELS.sectionToday}>
                  {grouped.today.map((item) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      onActivate={markRead}
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
                    />
                  ))}
                </Section>
              )}
            </>
          )}
        </div>

        <NotificationsFooter onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Header — title + counts + read/unread/all filter chips + mark-all-read.
// ---------------------------------------------------------------------------

function NotificationsHeader({
  counts,
  filter,
  onFilterChange,
  onMarkAllRead,
}: {
  counts: { all: number; unread: number; read: number };
  filter: NotificationReadFilter;
  onFilterChange: (filter: NotificationReadFilter) => void;
  onMarkAllRead: () => void;
}) {
  const subtitle =
    counts.unread === 0
      ? LABELS.allCaughtUp
      : counts.unread === 1
        ? LABELS.unreadOne
        : LABELS.unreadMany(counts.unread);

  return (
    <header className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-white px-4 pt-3.5 pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] leading-tight font-semibold text-primary">
            {LABELS.notifications}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span
              aria-hidden
              className={cn(
                "inline-block size-1.5 rounded-full",
                counts.unread > 0 ? "bg-destructive" : "bg-success",
              )}
            />
            {subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={counts.unread === 0}
          className={cn(
            "shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors",
            "text-primary hover:bg-primary/10",
            "disabled:cursor-default disabled:text-muted-foreground/60 disabled:hover:bg-transparent",
          )}
        >
          {LABELS.markAllRead}
        </button>
      </div>

      {/* Read-state filter chips. Live on the expanded right side of
          the wider card and let the user narrow the feed without
          leaving the popover. */}
      <ReadFilterChips
        filter={filter}
        counts={counts}
        onChange={onFilterChange}
      />
    </header>
  );
}

function ReadFilterChips({
  filter,
  counts,
  onChange,
}: {
  filter: NotificationReadFilter;
  counts: { all: number; unread: number; read: number };
  onChange: (filter: NotificationReadFilter) => void;
}) {
  const chipDefs: Array<{
    id: NotificationReadFilter;
    count: number;
  }> = [
    { id: "all", count: counts.all },
    { id: "unread", count: counts.unread },
    { id: "read", count: counts.read },
  ];

  return (
    <div
      role="tablist"
      aria-label="Filter notifications"
      className="inline-flex w-fit gap-1 rounded-xl bg-slate-100/80 p-1"
    >
      {chipDefs.map((chip) => {
        const active = filter === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(chip.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
              active
                ? "bg-white text-primary shadow-sm ring-1 ring-black/[0.03]"
                : "text-muted-foreground hover:text-primary",
            )}
          >
            {READ_FILTER_LABEL[chip.id]}
            <span
              className={cn(
                "inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-[1px] text-[10px] font-bold tabular-nums",
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

// ---------------------------------------------------------------------------
// Footer with the deep-link to the dedicated inbox page.
// ---------------------------------------------------------------------------

function NotificationsFooter({ onNavigate }: { onNavigate: () => void }) {
  return (
    <footer className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-center">
      <Link
        href="/notifications"
        onClick={onNavigate}
        className="inline-flex items-center justify-center text-[12px] font-semibold text-primary transition-colors hover:text-surface-tint"
      >
        {LABELS.viewAll}
      </Link>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Row + section primitives. Identical visual language to the inbox page
// (both consume the shared TONE_STYLES / KIND_META).
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-2 pt-2 pb-1">
      <p className="font-label-caps px-2 pb-1 text-[10px] tracking-wide text-muted-foreground/80 uppercase">
        {title}
      </p>
      <ul className="flex flex-col gap-1">{children}</ul>
    </section>
  );
}

function NotificationRow({
  item,
  onActivate,
}: {
  item: NotificationItem;
  onActivate: (id: string) => void;
}) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const SevIcon = SEVERITY_ICON[item.severity];
  const tone = TONE_STYLES[item.severity];

  // Visual chrome lives on a single class string shared between the
  // <Link> and <div> branches so the row looks identical regardless of
  // whether the notification has a deep-link target.
  const rowClass = cn(
    "group relative flex gap-3 rounded-xl px-2.5 py-2.5 transition-colors outline-none",
    "before:absolute before:top-2.5 before:bottom-2.5 before:left-0 before:w-[3px] before:rounded-r-full before:opacity-0 before:transition-opacity",
    "hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-primary/30",
    !item.read && "before:opacity-100",
    !item.read && tone.stripe,
    item.read && "opacity-90",
  );

  const body = (
    <>
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
          tone.tile,
        )}
        aria-hidden
      >
        <Icon className={cn("size-[18px]", tone.icon)} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-[13px] leading-tight text-primary",
              item.read ? "font-medium" : "font-semibold",
            )}
          >
            {item.title}
          </p>
          {!item.read && (
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-full", tone.dotBg)}
            />
          )}
        </div>

        <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
          {item.message}
        </p>

        <div className="mt-1.5 flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-[2px] text-[10px] font-semibold tracking-wide uppercase",
              tone.pill,
            )}
          >
            <SevIcon className="size-3" />
            {meta.label}
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">
            {formatRelative(item.createdAt)}
          </span>
        </div>
      </div>
    </>
  );

  const ariaLabel = `${meta.label}: ${item.title}`;

  return (
    <li>
      {item.href ? (
        <Link
          href={item.href}
          onClick={() => onActivate(item.id)}
          className={rowClass}
          aria-label={ariaLabel}
        >
          {body}
        </Link>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => onActivate(item.id)}
          className={rowClass}
          aria-label={ariaLabel}
        >
          {body}
        </div>
      )}
    </li>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <BellIcon className="size-5" />
      </span>
      <p className="text-sm font-semibold text-primary">
        {filtered ? LABELS.emptyFilteredTitle : LABELS.emptyTitle}
      </p>
      <p className="max-w-[260px] text-[12px] leading-snug text-muted-foreground">
        {filtered ? LABELS.emptyFilteredBody : LABELS.emptyBody}
      </p>
    </div>
  );
}
