"use client";

// Lightweight, dependency-free toast notification system used to surface
// transient success / failure messages.
//
// Why we built our own rather than pulling in a library: we only need a
// handful of features (success + error variants, auto-dismiss, manual
// close, queue) and the styling has to match the FleetSite tokens
// precisely. The library equivalents (sonner, react-hot-toast, etc.) come
// with their own theming opinions and add a non-trivial bundle.
//
// Layout:
// - Mobile (default viewport): fixed banner stack pinned to the top of
//   the screen, full width, slides in from above. This is what the user
//   requested ("on the mobile ui all success and failures must have a
//   banner from top").
// - Desktop (>= lg): the same provider can still be used, but it renders
//   into the bottom-right corner where toast notifications are commonly
//   placed. Existing inline error/success panels keep working untouched
//   so the desktop experience matches what was already shipped.

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

import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

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

interface ToastRecord extends Required<Omit<ToastInput, "title">> {
  id: number;
  title?: string;
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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  // Monotonically increasing ID so React keys are stable even after a
  // toast is removed and a new one with the same content is added.
  const nextIdRef = useRef(1);
  // Track each toast's dismiss timer so we can clear it on manual close.
  const timersRef = useRef<Map<number, number>>(new Map());

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

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
      };
      setToasts((prev) => [...prev, record]);
      if (durationMs > 0) {
        const timer = window.setTimeout(() => dismissToast(id), durationMs);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismissToast],
  );

  // Clear pending timers on unmount so we don't fire dismiss into an
  // already-unmounted tree (would warn in StrictMode dev builds).
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
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
      {/* Mobile: stacked banners pinned to the top of the viewport. */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col gap-2 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] lg:hidden"
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
  const Icon =
    toast.variant === "success"
      ? CheckCircle2
      : toast.variant === "error"
        ? TriangleAlert
        : Info;
  const tone =
    toast.variant === "success"
      ? "border-success/30 bg-success/10 text-success"
      : toast.variant === "error"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-primary/30 bg-primary/10 text-primary";
  return (
    <div
      role="status"
      aria-live={toast.variant === "error" ? "assertive" : "polite"}
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-3 py-2.5 shadow-lg ring-1 ring-black/5 animate-in slide-in-from-top-2 fade-in",
        tone,
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-left">
        {toast.title && (
          <p className="text-sm font-semibold text-primary">{toast.title}</p>
        )}
        <p
          className={cn(
            "text-xs leading-snug",
            toast.title ? "text-muted-foreground" : "text-primary",
          )}
        >
          {toast.message}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-black/5 hover:text-primary"
        aria-label="Dismiss notification"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
