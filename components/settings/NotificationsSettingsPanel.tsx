"use client";

import { useMemo, useState } from "react";

import { Bell } from "@/lib/icons";
import {
  SettingsSection,
  ToggleRow,
} from "@/components/settings/SettingsShared";
import { ensurePermission } from "@/lib/notifications/browserToast";
import {
  disablePush,
  enablePush,
  isPushEnabledLocally,
} from "@/lib/notifications/push";
import { useNotificationPreferences } from "@/lib/notifications/usePreferences";
import { useToast } from "@/lib/toast/ToastContext";

// Single master switch for notifications.
//
// We keep the per-kind / per-channel preference shape on the server so we
// don't have to migrate data, but the UI now collapses into one toggle:
//   - ON  -> request browser permission, subscribe to push, and set every
//            channel for every kind to true.
//   - OFF -> unsubscribe push and flip every channel for every kind to
//            false so the server stops creating notifications, the bell
//            stops badging, and OS toasts stop firing.
//
// Browser permission / push subscription failures don't block the toggle:
// the user's stated intent ("notifications on") is honoured for in-app
// delivery even if the OS denies system toasts or the server doesn't have
// VAPID keys configured yet. We just surface a discreet status line so the
// user knows what actually went through.
export function NotificationsSettingsPanel({
  wrapInSection = true,
}: {
  wrapInSection?: boolean;
}) {
  const { prefs, patch } = useNotificationPreferences();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  // The single source of truth for "is the bell on?". We treat it as ON
  // when ANY kind in ANY channel is currently true. This means a user
  // who previously customised individual kinds still sees the switch as
  // ON, and flipping it OFF then back ON is what resets to all-true.
  const masterOn = useMemo(() => {
    if (!prefs) return false;
    const has = (m: Record<string, boolean>) =>
      Object.values(m).some(Boolean);
    return has(prefs.inAppPerKind) || has(prefs.osToastPerKind) || has(prefs.webPushPerKind);
  }, [prefs]);

  async function setAll(next: boolean) {
    if (!prefs || busy) return;
    setBusy(true);
    try {
      if (next) {
        // Side effects first: request OS permission + push subscription.
        // Failures here are non-fatal; in-app delivery still works.
        try {
          await ensurePermission();
        } catch {
          /* permission flow rejected — keep going */
        }
        try {
          await enablePush();
        } catch {
          /* push unavailable (no VAPID, no PushManager, etc.) */
        }
      } else {
        try {
          await disablePush();
        } catch {
          /* best effort */
        }
      }

      const allTo = (map: Record<string, boolean>) =>
        Object.fromEntries(Object.keys(map).map((k) => [k, next]));

      await patch({
        inAppPerKind: allTo(prefs.inAppPerKind),
        osToastPerKind: allTo(prefs.osToastPerKind),
        webPushPerKind: allTo(prefs.webPushPerKind),
      });
    } catch {
      showToast({
        variant: "error",
        message: "Could not update notification setting.",
      });
    } finally {
      setBusy(false);
    }
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

  const content = (
    <>
      <ToggleRow
        label="Notifications"
        description="Receive alerts for trips, fuel, attendance, vehicles, drivers, and site health. Turn off to silence the bell, browser toasts, and PWA push on every device."
        checked={masterOn}
        onChange={setAll}
      />
      <p className="px-1 text-[11px] text-muted-foreground">
        {busy
          ? "Updating..."
          : masterOn
            ? isPushEnabledLocally()
              ? "On - push is active on this device."
              : "On - push is not active on this device yet."
            : "Off - you will not receive any alerts."}
      </p>
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
