"use client";

// Lightweight, dependency-free toast notification system used to surface
// transient success / failure messages.
//
// Why we built our own rather than pulling in a library: we only need a
// handful of features (success + error variants, auto-dismiss, manual
// close, queue, slide animations) and the styling has to match the
// FleetSite tokens precisely. The library equivalents (sonner,
// react-hot-toast, etc.) come with their own theming opinions and add a
// non-trivial bundle.
//
// Layout:
// - Mobile (default viewport): fixed banner stack anchored just below
//   the fixed top bar (top-[76px], mirroring the dashboard <main>
//   padding), full width, slides in from above and out the same way.
// - Desktop (>= lg): the same provider renders into the bottom-right
//   corner where toasts are commonly placed. Existing inline panels
//   keep working untouched so the desktop experience matches what was
//   already shipped.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { CheckCircle2, Info, TriangleAlert, X } from "@/lib/icons";

import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "info";

export interface ToastInput {
  variant?: ToastVariant;
  title?: string;
  message: string;
  // Optional override for the auto-dismiss timer (ms). Falls back to a
  // variant-specific default so errors stick around longer than successes.
  durationMs?: number;
}

// Internal lifecycle state used to drive the slide-in / slide-out CSS
// transitions on each banner without needing a third-party animation lib.
type ToastState = "entering" | "open" | "leaving";

interface ToastRecord extends Required<Omit<ToastInput, "title">> {
  id: number;
  title?: string;
  state: ToastState;
}

interface ToastContextValue {
  showToast: (input: ToastInput) => number;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS: Record<ToastVariant, number> = {
  success: 3500,
  info: 4000,
  // Errors stay visible longer because the user usually needs to read
  // the message and decide what to do next.
  error: 6000,
};

// Has to match the `duration-300` Tailwind utility on the banner: when
// the user dismisses (or the auto timer fires) we flip the state to
// "leaving", wait this long for the CSS transition to finish, and only
// then remove the node so React can run the slide-out smoothly.
const EXIT_ANIMATION_MS = 250;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  // Monotonically increasing ID so React keys are stable even after a
  // toast is removed and a new one with the same content is added.
  const nextIdRef = useRef(1);
  // Two parallel timer maps:
  //  - autoTimers: the per-toast auto-dismiss schedule (variant-based).
  //  - exitTimers: the short follow-up scheduled by dismissToast that
  //    actually unmounts the banner once its slide-out has finished.
  const autoTimersRef = useRef<Map<number, number>>(new Map());
  const exitTimersRef = useRef<Map<number, number>>(new Map());

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    exitTimersRef.current.delete(id);
  }, []);

  const dismissToast = useCallback(
    (id: number) => {
      // Cancel any pending auto-dismiss so it doesn't race the manual close.
      const autoTimer = autoTimersRef.current.get(id);
      if (autoTimer !== undefined) {
        window.clearTimeout(autoTimer);
        autoTimersRef.current.delete(id);
      }
      // Idempotent: if a leaving animation is already underway, leave it.
      const existingExit = exitTimersRef.current.get(id);
      if (existingExit !== undefined) return;

      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, state: "leaving" } : t)),
      );
      const exitTimer = window.setTimeout(
        () => removeToast(id),
        EXIT_ANIMATION_MS,
      );
      exitTimersRef.current.set(id, exitTimer);
    },
    [removeToast],
  );

  const showToast = useCallback(
    (input: ToastInput) => {
      const id = nextIdRef.current++;
      const variant: ToastVariant = input.variant ?? "info";
      const durationMs = input.durationMs ?? DEFAULT_DURATION_MS[variant];
      const record: ToastRecord = {
        id,
        variant,
        message: input.message,
        title: input.title,
        durationMs,
        state: "entering",
      };
      setToasts((prev) => [...prev, record]);
      // Auto-dismiss after the variant-specific duration; banner handles
      // its own enter animation on mount.
      if (durationMs > 0) {
        const timer = window.setTimeout(() => dismissToast(id), durationMs);
        autoTimersRef.current.set(id, timer);
      }
      return id;
    },
    [dismissToast],
  );

  // Flush any in-flight timers when the provider unmounts to avoid setting
  // state on an unmounted tree (would warn in StrictMode dev builds).
  useEffect(() => {
    const auto = autoTimersRef.current;
    const exit = exitTimersRef.current;
    return () => {
      for (const t of auto.values()) window.clearTimeout(t);
      for (const t of exit.values()) window.clearTimeout(t);
      auto.clear();
      exit.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <>
      {/* Mobile: stacked banners pinned just below the fixed top bar. The
          dashboard layout offsets <main> with pt-[76px] for the same
          header — we mirror that so toasts never sit underneath it. */}
      <div
        className="pointer-events-none fixed inset-x-0 top-[76px] z-[60] flex flex-col gap-2 px-3 pt-1 lg:hidden"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <ToastBanner key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </div>
      {/* Desktop: discreet stack in the bottom-right corner. */}
      <div
        className="pointer-events-none fixed right-6 bottom-6 z-[60] hidden w-[360px] max-w-[calc(100vw-3rem)] flex-col gap-2 lg:flex"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <ToastBanner key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </div>
    </>
  );
}

function ToastBanner({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: number) => void;
}) {
  // Drives the slide-in transition. We mount in the "entering" state
  // (off-screen + transparent) and flip to "open" on the next frame so
  // the browser actually applies the transition between the two states.
  // Without the rAF gate the element appears already-open with no anim.
  const [hasEntered, setHasEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setHasEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const Icon =
    toast.variant === "success"
      ? CheckCircle2
      : toast.variant === "error"
        ? TriangleAlert
        : Info;

  // Variant only changes the leading icon color. The body uses the
  // requested palette across the board: gray surface, primary-blue text.
  const iconColor =
    toast.variant === "success"
      ? "text-success"
      : toast.variant === "error"
        ? "text-destructive"
        : "text-primary";

  const isLeaving = toast.state === "leaving";
  const isOpen = hasEntered && !isLeaving;

  return (
    <div
      role="status"
      aria-live={toast.variant === "error" ? "assertive" : "polite"}
      className={cn(
        "pointer-events-auto flex items-start gap-3.5 rounded-xl border border-slate-300 bg-slate-200 px-4 py-3.5 text-primary shadow-xl ring-1 ring-black/5 transition-all duration-300 ease-out",
        // Slide + fade between the entering / open / leaving states. We
        // use `-translate-y-3` on mobile so the banner enters from above
        // the header, and `translate-y-3` on desktop so the bottom-right
        // stack slides in from below.
        isOpen
          ? "translate-y-0 opacity-100"
          : "-translate-y-3 opacity-0 lg:translate-y-3 lg:-translate-x-0",
      )}
    >
      <Icon className={cn("mt-0.5 size-6 shrink-0", iconColor)} aria-hidden />
      <div className="min-w-0 flex-1 text-left">
        {toast.title && (
          <p className="text-base leading-tight font-semibold text-primary">
            {toast.title}
          </p>
        )}
        <p
          className={cn(
            "leading-snug text-primary",
            toast.title ? "mt-0.5 text-sm" : "text-sm font-medium",
          )}
        >
          {toast.message}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="-mt-1 -mr-1 shrink-0 rounded-md p-1.5 text-primary/70 transition-colors hover:bg-slate-300/70 hover:text-primary focus:bg-slate-300/70 focus:text-primary focus:outline-none"
        aria-label="Dismiss notification"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
