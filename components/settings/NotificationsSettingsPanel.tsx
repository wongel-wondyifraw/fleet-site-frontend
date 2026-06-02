"use client";

import { useEffect, useState } from "react";

import { Bell } from "@/lib/icons";
import {
  SettingsSection,
  ToggleRow,
} from "@/components/settings/SettingsShared";
import { sendTestNotification } from "@/lib/api/notifications";
import { ensurePermission } from "@/lib/notifications/browserToast";
import {
  disablePush,
  enablePush,
  isPushEnabledLocally,
  isPushSupportedHere,
} from "@/lib/notifications/push";
import { useNotificationPreferences } from "@/lib/notifications/usePreferences";
import { useToast } from "@/lib/toast/ToastContext";

// Single master switch for notifications.
//
// The toggle's source of truth is `prefs.notificationsEnabled` (a boolean
// the server persists explicitly). New users start with this flag false so
// the very first click on the panel is unambiguously "turn ON".
//
// Side-effect order matters for cross-browser correctness:
//   1. `ensurePermission()` is initiated SYNCHRONOUSLY inside the click
//      handler so the OS permission prompt stays inside the user-gesture
//      chain (iOS Safari + some Android browsers silently suppress the
//      prompt otherwise).
//   2. `patch()` flips the server flag immediately so the UI reflects the
//      user's intent even when push setup fails.
//   3. `enablePush()` / `disablePush()` run as background promises that
//      are time-bounded internally — they can never freeze the toggle.
export function NotificationsSettingsPanel({
  wrapInSection = true,
}: {
  wrapInSection?: boolean;
}) {
  const { prefs, patch } = useNotificationPreferences();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [pushSupported, setPushSupported] = useState(true);
  const [isIosNonPwa, setIsIosNonPwa] = useState(false);

  // Capability detection has to wait for mount so SSR doesn't crash. We
  // surface two distinct conditions:
  //   - pushSupported: the Web Push / Notification APIs are present.
  //   - isIosNonPwa: iPhone/iPad in regular Safari — push is technically
  //     unavailable here until the user installs the PWA to the home
  //     screen, so we show a separate hint.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setPushSupported(isPushSupportedHere());
    const ua = navigator.userAgent || "";
    const isIos = /iPad|iPhone|iPod/.test(ua);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;
    setIsIosNonPwa(isIos && !isStandalone);
  }, []);

  async function handleTestPush() {
    if (testBusy) return;
    setTestBusy(true);
    try {
      await sendTestNotification();
      showToast({
        variant: "success",
        message:
          "Test notification sent. Check the bell, your OS notifications, and any subscribed devices.",
      });
    } catch {
      showToast({
        variant: "error",
        message: "Could not send the test notification.",
      });
    } finally {
      setTestBusy(false);
    }
  }

  function setAll(next: boolean): void {
    if (!prefs || busy) return;

    // Capture the user gesture for the OS permission prompt BEFORE any
    // awaits. iOS Safari + some Android browsers only surface the prompt
    // when requestPermission() is initiated inside the same gesture as
    // the click — awaiting an HTTP call first invalidates that.
    let pendingPermission: Promise<NotificationPermission> | null = null;
    if (next && typeof window !== "undefined" && "Notification" in window) {
      try {
        pendingPermission = ensurePermission();
      } catch {
        pendingPermission = null;
      }
    }

    setBusy(true);
    void (async () => {
      try {
        const allTo = (map: Record<string, boolean>) =>
          Object.fromEntries(Object.keys(map).map((k) => [k, next]));

        // Flip the master switch + every per-kind map in one round-trip.
        // This is what makes the UI reflect intent immediately — push
        // subscription happens afterwards as a fire-and-forget side
        // effect and can never block the toggle from updating.
        await patch({
          notificationsEnabled: next,
          inAppPerKind: allTo(prefs.inAppPerKind),
          osToastPerKind: allTo(prefs.osToastPerKind),
          webPushPerKind: allTo(prefs.webPushPerKind),
        });

        if (next) {
          // Let the permission promise resolve in the background; we
          // don't care about the outcome here — enablePush() will check
          // permission state on its own when it tries to subscribe.
          pendingPermission?.catch(() => null);
          // Fire-and-forget. enablePush internally bounds itself with a
          // serviceWorker.ready timeout, so even on dev / iOS-Safari it
          // resolves quickly with false rather than hanging.
          enablePush().catch(() => undefined);
        } else {
          disablePush().catch(() => undefined);
        }
      } catch {
        showToast({
          variant: "error",
          message: "Could not update notification setting.",
        });
      } finally {
        setBusy(false);
      }
    })();
  }

  if (!prefs) {
    const loading = (
      <p className="text-sm text-muted-foreground">
        Loading notification settings...
      </p>
    );
    if (!wrapInSection) return loading;
    return (
      <SettingsSection
        title="Notifications"
        description="Turn notifications on or off for this account."
        icon={Bell}
      >
        {loading}
      </SettingsSection>
    );
  }

  const masterOn = prefs.notificationsEnabled;
  const statusLine = busy
    ? "Updating..."
    : !masterOn
      ? "Off - you will not receive any alerts."
      : isPushEnabledLocally()
        ? "On - push is active on this device."
        : pushSupported
          ? "On - push is not active on this device yet."
          : "On - in-app only on this device.";

  const content = (
    <>
      <ToggleRow
        label="Notifications"
        description="Receive alerts for trips, fuel, attendance, vehicles, drivers, and site health. Turn off to silence the bell, browser toasts, and PWA push on every device."
        checked={masterOn}
        onChange={setAll}
      />
      <p className="px-1 text-[11px] text-muted-foreground">{statusLine}</p>

      {isIosNonPwa ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
          <p className="text-xs font-semibold text-amber-900">
            Install FleetSite to your home screen for push on iPhone
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-amber-900/80">
            iOS only delivers push notifications to apps installed from the
            home screen. Tap the Share button in Safari, then "Add to Home
            Screen" - open FleetSite from that icon and turn this switch on
            again to receive push alerts.
          </p>
        </div>
      ) : !pushSupported ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-primary">
            Push not available on this browser
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            In-app notifications and the bell badge still work here. For
            browser toasts and PWA push, open FleetSite in Chrome, Edge, or
            Safari on a supported device.
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">Send a test notification</p>
          <p className="text-[11px] text-muted-foreground">
            Fires a sample alert at your own account so you can verify the bell, browser toasts, and push delivery.
          </p>
        </div>
        <button
          type="button"
          onClick={handleTestPush}
          disabled={testBusy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/30 bg-white px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
        >
          <Bell className="size-3.5" />
          {testBusy ? "Sending..." : "Send test"}
        </button>
      </div>
    </>
  );

  if (!wrapInSection) return content;
  return (
    <SettingsSection
      title="Notifications"
      description="Turn notifications on or off for this account."
      icon={Bell}
    >
      {content}
    </SettingsSection>
  );
}
