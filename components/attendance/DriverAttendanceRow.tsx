"use client";

import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  LogIn,
  LogOut,
  Pencil,
  Trash2,
} from "@/lib/icons";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useCan } from "@/components/auth/Can";
import { Button } from "@/components/ui/button";
import { WorkedHoursDonut } from "@/components/attendance/WorkedHoursDonut";
import type {
  ApiAttendanceDay,
  ApiAttendancePunch,
  ApiTimeSettings,
  AttendancePunchType,
} from "@/lib/api/types";
import {
  AUTO_CLOSE_REASON_LABELS,
  ODOMETER_REQUIRED_PUNCH_TYPES,
  PUNCH_PAIRS,
  STATUS_STYLES,
  computeWorkedHours,
  driverName,
  formatPunchTime,
  isPairOpen,
  prettyStatus,
  toLivePunches,
  type FeatherIcon,
} from "@/lib/attendance/attendanceHelpers";
import { formatDateTime } from "@/lib/time/format";
import { cn } from "@/lib/utils";

export function DriverAttendanceRow({
  day,
  dateKey,
  targetHours,
  density,
  actionMenu,
  isOnActiveTrip,
  pendingOdometer,
  onChangeOdometer,
  pendingReason,
  onChangeReason,
  onToggleMenu,
  onPunch,
  onPunchWithOdometer,
  onEditPunch,
  onDeletePunch,
  isMutating,
  timeSettings,
}: {
  day: ApiAttendanceDay;
  dateKey: string;
  targetHours: number;
  density: "comfortable" | "compact";
  actionMenu: { dayId: string; pair: "day" | "lunch" | "maint" } | null;
  isOnActiveTrip: boolean;
  pendingOdometer: { value: string; error: string | null };
  onChangeOdometer: (value: string) => void;
  pendingReason: { value: string; error: string | null };
  onChangeReason: (value: string) => void;
  onToggleMenu: (pair: "day" | "lunch" | "maint") => void;
  onPunch: (day: ApiAttendanceDay, type: AttendancePunchType) => Promise<void>;
  onPunchWithOdometer: (
    day: ApiAttendanceDay,
    type: AttendancePunchType,
  ) => Promise<void>;
  onEditPunch: (punch: ApiAttendancePunch) => void;
  onDeletePunch: (punch: ApiAttendancePunch) => void;
  isMutating: boolean;
  timeSettings: ApiTimeSettings;
}) {
  const punches = toLivePunches(day);
  const worked = computeWorkedHours(day, dateKey);
  const metTarget = worked >= targetHours;
  const dayOpen = isPairOpen(punches, "DAY_IN", "DAY_OUT");
  const lunchOpen = isPairOpen(punches, "LUNCH_OUT", "LUNCH_IN");
  const maintOpen = isPairOpen(punches, "MAINT_OUT", "MAINT_IN");
  // workDistanceKm is sent as a numeric string by Postgres; parse it
  // defensively so a stray null / undefined / non-numeric doesn't blow up
  // the row. We treat it as "not yet computed" when no readings have been
  // captured.
  const distanceKmRaw =
    day.workDistanceKm !== null && day.workDistanceKm !== undefined
      ? Number.parseFloat(String(day.workDistanceKm))
      : NaN;
  const hasDistance = Number.isFinite(distanceKmRaw);
  const distanceIncomplete = (day.autoCloseReason ?? "")
    .split(",")
    .map((c) => c.trim())
    .includes("INCOMPLETE_DISTANCE");
  const anyBreakOpen = lunchOpen || maintOpen;
  const hasDayIn = punches.some((p) => p.type === "DAY_IN");
  const hasDayOut = punches.some((p) => p.type === "DAY_OUT");

  function nextAction(pair: "day" | "lunch" | "maint"): {
    label: string;
    type: AttendancePunchType;
  } | null {
    if (pair === "day") {
      if (!hasDayIn) return { label: "Punch in", type: "DAY_IN" };
      if (!hasDayOut && !anyBreakOpen) return { label: "Punch out", type: "DAY_OUT" };
      return null;
    }
    if (pair === "lunch") {
      if (!hasDayIn || hasDayOut) return null;
      if (lunchOpen) return { label: "End lunch", type: "LUNCH_IN" };
      if (!anyBreakOpen) return { label: "Start lunch", type: "LUNCH_OUT" };
      return null;
    }
    if (!hasDayIn || hasDayOut) return null;
    if (maintOpen) return { label: "End maint", type: "MAINT_IN" };
    if (!anyBreakOpen) return { label: "Start maint", type: "MAINT_OUT" };
    return null;
  }

  function pairState(pair: "day" | "lunch" | "maint"): "IN" | "OUT" | "IDLE" {
    if (pair === "day") return dayOpen ? "IN" : hasDayOut ? "OUT" : "IDLE";
    if (pair === "lunch") return lunchOpen ? "OUT" : "IN";
    return maintOpen ? "OUT" : "IN";
  }

  return (
    <article
      className={cn(
        "rounded-xl border border-slate-100 bg-slate-50/50 transition-colors",
        density === "compact" ? "p-3" : "p-4",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left half: the driver identity + status badges. Wrapped in a
            Link so the timekeeper can click through to the per-driver
            history page. We deliberately *don't* wrap the whole article
            in a Link — the right half holds interactive punch buttons
            and a Link ancestor would swallow their clicks. The hover
            background gives a subtle "this is clickable" cue. */}
        <Link
          href={`/attendance/drivers/${day.driverId}`}
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg -mx-1 px-1 py-1 transition-colors hover:bg-primary/5"
          aria-label={`Open attendance detail for ${driverName(day)}`}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
            {day.driver?.firstName?.[0] ?? "?"}
            {day.driver?.lastName?.[0] ?? ""}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-primary group-hover:underline">
                {driverName(day)}
              </p>
              <span
                className={cn(
                  "inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                  STATUS_STYLES[day.status],
                )}
              >
                {prettyStatus(day.status)}
              </span>
              {day.autoClosedAt &&
                (day.autoCloseReason ?? "")
                  .split(",")
                  .map((code) => code.trim())
                  .filter(Boolean)
                  .map((code) => (
                    <span
                      key={code}
                      title={`System auto-closed this day at ${formatDateTime(day.autoClosedAt as string, timeSettings)}`}
                      className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-800 uppercase ring-1 ring-amber-300/60"
                    >
                      <AlertTriangle className="size-2.5" />
                      {AUTO_CLOSE_REASON_LABELS[code] ?? "Auto-closed"}
                    </span>
                  ))}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {day.driver?.employeeId ?? "No employee ID"}
            </p>
          </div>
        </Link>
        <div className="flex flex-wrap items-end justify-start gap-2 lg:justify-end lg:shrink-0">
          {PUNCH_PAIRS.map((pair) => {
            // Break pairs (Lunch / Maintenance) only make sense once the
            // driver is on the clock — the backend rejects LUNCH_OUT and
            // MAINT_OUT without a prior DAY_IN, so we hide them entirely
            // instead of showing a button that can never be used.
            const isBreakPair = pair.key === "lunch" || pair.key === "maint";
            if (isBreakPair && !hasDayIn) return null;

            const open = actionMenu?.dayId === day.id && actionMenu.pair === pair.key;
            const state = pairState(pair.key);
            const next = nextAction(pair.key);
            const pairPunches = punches.filter(
              (p) => p.type === pair.outType || p.type === pair.inType,
            );
            // Break punches conflict with an in-progress trip — you can't
            // start/end a lunch while you're physically driving — so we
            // disable the action button when the driver has an active trip.
            // The pill stays clickable so the user can still inspect past
            // punches; only the next-punch action is blocked.
            const blockedByTrip = isBreakPair && isOnActiveTrip;
            // State is communicated by the IN / OUT / IDLE label itself; we
            // keep the colour unified on the primary palette so the row reads
            // as one cohesive control instead of a rainbow of tones. Active
            // (IN) gets a fully saturated primary, finished (OUT) gets a
            // muted primary, and IDLE stays softest.
            const stateClass =
              state === "IN"
                ? "text-primary"
                : state === "OUT"
                  ? "text-primary/60"
                  : "text-primary/70";
            // Action icon for the dropdown next-punch button. The verbs map
            // cleanly to LogIn / LogOut so the icon reinforces what tapping
            // will actually do (LUNCH_OUT and MAINT_OUT are "leaving work" so
            // they get LogOut; LUNCH_IN / MAINT_IN come back to work so
            // they get LogIn).
            const NextIcon: FeatherIcon | null = next
              ? next.type === "DAY_IN" ||
                next.type === "LUNCH_IN" ||
                next.type === "MAINT_IN"
                ? LogIn
                : LogOut
              : null;
            return (
              <PunchPairControl
                key={pair.key}
                pair={pair}
                open={open}
                state={state}
                stateClass={stateClass}
                blockedByTrip={blockedByTrip}
                next={next}
                nextIcon={NextIcon}
                pairPunches={pairPunches}
                pendingOdometer={pendingOdometer}
                onChangeOdometer={onChangeOdometer}
                pendingReason={pendingReason}
                onChangeReason={onChangeReason}
                onToggleMenu={() => onToggleMenu(pair.key)}
                onPunch={onPunch}
                onPunchWithOdometer={onPunchWithOdometer}
                onEditPunch={onEditPunch}
                onDeletePunch={onDeletePunch}
                day={day}
                isMutating={isMutating}
                timeSettings={timeSettings}
              />
            );
          })}
          <WorkedHoursDonut worked={worked} target={targetHours} />
          <span
            className={cn(
              "inline-flex flex-col items-center rounded-md border px-2 py-1 text-[10px] font-black tracking-wide uppercase",
              hasDistance
                ? "border-primary/20 bg-primary/5 text-primary"
                : "border-slate-200 bg-slate-50 text-slate-500",
            )}
            title={
              hasDistance
                ? distanceIncomplete
                  ? `Distance partial — odometer missing on one or more punches. Edit the punch to add it. (${distanceKmRaw.toFixed(2)} km computed)`
                  : `Work distance: (LUNCH_OUT − DAY_IN) + (DAY_OUT − LUNCH_IN) = ${distanceKmRaw.toFixed(2)} km`
                : "Capture odometer at DAY_IN / LUNCH_OUT / LUNCH_IN / DAY_OUT to compute distance"
            }
          >
            <span
              className={cn(
                "text-[9px]",
                hasDistance ? "text-primary/70" : "text-slate-500",
              )}
            >
              Distance
            </span>
            <span className="text-xs tabular-nums">
              {hasDistance ? (
                <>
                  {distanceKmRaw.toFixed(1)} km
                  {distanceIncomplete ? "*" : null}
                </>
              ) : (
                "—"
              )}
            </span>
          </span>
          <Link
            href={`/attendance/drivers/${day.driverId}`}
            aria-label={`Open attendance detail for ${driverName(day)}`}
            className="group/chev flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          >
            <ChevronRight className="size-4 transition-transform group-hover/chev:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function PunchPairControl({
  pair,
  open,
  state,
  stateClass,
  blockedByTrip,
  next,
  nextIcon: NextIcon,
  pairPunches,
  pendingOdometer,
  onChangeOdometer,
  pendingReason,
  onChangeReason,
  onToggleMenu,
  onPunch,
  onPunchWithOdometer,
  onEditPunch,
  onDeletePunch,
  day,
  isMutating,
  timeSettings,
}: {
  pair: (typeof PUNCH_PAIRS)[number];
  open: boolean;
  state: "IN" | "OUT" | "IDLE";
  stateClass: string;
  blockedByTrip: boolean;
  next: { label: string; type: AttendancePunchType } | null;
  nextIcon: FeatherIcon | null;
  pairPunches: ApiAttendancePunch[];
  pendingOdometer: { value: string; error: string | null };
  onChangeOdometer: (value: string) => void;
  pendingReason: { value: string; error: string | null };
  onChangeReason: (value: string) => void;
  onToggleMenu: () => void;
  onPunch: (day: ApiAttendanceDay, type: AttendancePunchType) => Promise<void>;
  onPunchWithOdometer: (
    day: ApiAttendanceDay,
    type: AttendancePunchType,
  ) => Promise<void>;
  onEditPunch: (punch: ApiAttendancePunch) => void;
  onDeletePunch: (punch: ApiAttendancePunch) => void;
  day: ApiAttendanceDay;
  isMutating: boolean;
  timeSettings: ApiTimeSettings;
}) {
  const canCreatePunch = useCan("attendance.create");
  const canUpdatePunch = useCan("attendance.update");
  const canDeletePunch = useCan("attendance.delete");

  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const PairIcon = pair.Icon;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuPos(null);
      return;
    }
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPos({ top: rect.bottom + 6, left: rect.left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  const needsOdometer =
    next != null && ODOMETER_REQUIRED_PUNCH_TYPES.has(next.type);
  // Starting a maintenance break requires a reason that we persist on the
  // punch note.
  const needsReason = next != null && next.type === "MAINT_OUT";
  const trimmed = pendingOdometer.value.trim();
  const reasonTrimmed = pendingReason.value.trim();
  const submitDisabled =
    isMutating ||
    (needsOdometer && trimmed.length === 0) ||
    (needsReason && reasonTrimmed.length === 0);

  const menuPanel = open && menuPos && (
    <div
      role="dialog"
      aria-label={`${pair.label} punch actions`}
      data-action-menu="true"
      style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999 }}
      className="w-64 overflow-hidden rounded-xl border border-slate-200 bg-[#ffffff] shadow-[0_12px_40px_rgba(18,53,112,0.22)]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-[#f4f6f9] px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-primary uppercase">
          <PairIcon className="size-3.5" />
          {pair.label}
        </span>
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[9px] font-black tracking-wide uppercase",
            state === "IN"
              ? "bg-primary text-primary-foreground"
              : state === "OUT"
                ? "bg-slate-200 text-primary"
                : "bg-slate-200 text-slate-600",
          )}
        >
          {state}
        </span>
      </div>
      <div className="bg-[#ffffff] p-2.5">
        {blockedByTrip ? (
          <p className="px-2 py-1 text-[11px] font-medium text-rose-600">
            Driver is on an active trip. Complete the trip before recording a{" "}
            {pair.label.toLowerCase()} punch.
          </p>
        ) : next && canCreatePunch ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (needsOdometer) {
                void onPunchWithOdometer(day, next.type);
              } else {
                void onPunch(day, next.type);
              }
            }}
            className="space-y-2"
          >
            {needsOdometer && (
              <label className="block">
                <span className="mb-1 block text-[9px] font-bold tracking-wide text-slate-600 uppercase">
                  Odometer (km)
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  autoFocus
                  value={pendingOdometer.value}
                  onChange={(e) => onChangeOdometer(e.target.value)}
                  placeholder="e.g. 152340.50"
                  aria-invalid={pendingOdometer.error ? true : undefined}
                  className="block h-9 w-full rounded-lg border border-slate-200 bg-[#ffffff] px-2.5 text-xs tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {pendingOdometer.error && (
                  <span className="mt-1 block text-[10px] font-medium text-rose-600">
                    {pendingOdometer.error}
                  </span>
                )}
              </label>
            )}
            {needsReason && (
              <label className="block">
                <span className="mb-1 block text-[9px] font-bold tracking-wide text-slate-600 uppercase">
                  Reason
                </span>
                <textarea
                  rows={2}
                  autoFocus
                  value={pendingReason.value}
                  onChange={(e) => onChangeReason(e.target.value)}
                  placeholder="e.g. Tyre change, engine check"
                  aria-invalid={pendingReason.error ? true : undefined}
                  className="block w-full resize-none rounded-lg border border-slate-200 bg-[#ffffff] px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {pendingReason.error && (
                  <span className="mt-1 block text-[10px] font-medium text-rose-600">
                    {pendingReason.error}
                  </span>
                )}
              </label>
            )}
            <Button
              type="submit"
              disabled={submitDisabled}
              className="h-9 w-full justify-center gap-2 rounded-lg px-2 text-xs font-semibold"
            >
              {isMutating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : NextIcon ? (
                <NextIcon className="size-3.5" />
              ) : null}
              {next.label}
            </Button>
          </form>
        ) : next && !canCreatePunch ? (
          <p className="rounded-lg bg-slate-100 px-2 py-1.5 text-center text-[11px] text-slate-600">
            View only — you cannot record punches
          </p>
        ) : (
          <p className="rounded-lg bg-slate-100 px-2 py-1.5 text-center text-[11px] text-slate-600">
            No action available
          </p>
        )}
        <div className="mt-2.5 space-y-0.5 border-t border-slate-200 pt-2">
          <p className="px-1 pb-1 text-[9px] font-bold tracking-wide text-slate-500 uppercase">
            History
          </p>
          {pairPunches.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-slate-500">No punches yet</p>
          ) : (
            pairPunches.map((p) => {
              const isInPunch =
                p.type === "DAY_IN" ||
                p.type === "LUNCH_IN" ||
                p.type === "MAINT_IN";
              const HistoryIcon = isInPunch ? LogIn : LogOut;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[11px] text-slate-800 transition-colors hover:bg-slate-100"
                >
                  <span className="inline-flex min-w-0 flex-col">
                    <span className="inline-flex items-center gap-1.5 truncate">
                      <HistoryIcon
                        className={cn(
                          "size-3 shrink-0",
                          isInPunch ? "text-primary" : "text-slate-500",
                        )}
                      />
                      <span className="truncate">
                        {p.type.replace("_", " ")} ·{" "}
                        {formatPunchTime(p.at, timeSettings)}
                      </span>
                    </span>
                    {p.note && (
                      <span
                        className="truncate pl-[18px] text-[10px] text-muted-foreground"
                        title={p.note}
                      >
                        {p.note}
                      </span>
                    )}
                  </span>
                  {(canUpdatePunch || canDeletePunch) && (
                    <div className="flex items-center gap-0.5">
                      {canUpdatePunch && (
                        <button
                          type="button"
                          className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-primary"
                          onClick={() => onEditPunch(p)}
                          aria-label="Edit punch"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                      {canDeletePunch && (
                        <button
                          type="button"
                          className="rounded p-1 text-slate-500 transition-colors hover:bg-rose-100 hover:text-rose-600"
                          onClick={() => onDeletePunch(p)}
                          aria-label="Void punch"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div data-action-menu="true" className="relative flex flex-col items-center gap-1">
      <span className="text-[10px] font-black tracking-wide text-primary/70 uppercase">
        {pair.label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        onClick={onToggleMenu}
        aria-label={
          blockedByTrip
            ? `${pair.label} (${state}) - driver is on an active trip`
            : `${pair.label} (${state}) - tap to manage punches`
        }
        title={blockedByTrip ? "Driver is on an active trip" : undefined}
        className={cn(
          "group inline-flex w-24 items-center justify-between gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-[11px] font-black shadow-sm shadow-primary/10 transition-colors hover:bg-primary/10 hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/40",
          blockedByTrip && "opacity-70",
        )}
      >
        <span className={cn("inline-flex items-center gap-1.5", stateClass)}>
          <PairIcon className="size-4" />
          <span className="tracking-wide">{state}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-3 text-primary/60 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {typeof document !== "undefined" && menuPanel
        ? createPortal(menuPanel, document.body)
        : null}
    </div>
  );
}
