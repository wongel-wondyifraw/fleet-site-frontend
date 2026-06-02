"use client";

import { Bell } from "@/lib/icons";
import { KIND_META } from "@/lib/notifications/data";
import { ensurePermission } from "@/lib/notifications/browserToast";
import { disablePush, enablePush, isPushEnabledLocally } from "@/lib/notifications/push";
import { useNotificationPreferences } from "@/lib/notifications/usePreferences";
import { useToast } from "@/lib/toast/ToastContext";
import { SettingsSection, SettingsSwitch } from "@/components/settings/SettingsShared";

export function NotificationsSettingsPanel({
  wrapInSection = true,
}: {
  wrapInSection?: boolean;
}) {
  const { prefs, patch } = useNotificationPreferences();
  const { showToast } = useToast();

  async function setChannel(
    channel: "inAppPerKind" | "osToastPerKind" | "webPushPerKind",
    kind: string,
    value: boolean,
  ) {
    if (!prefs) return;
    await patch({
      [channel]: { ...prefs[channel], [kind]: value },
    });
  }

  async function toggleBrowserToasts(next: boolean) {
    if (next) {
      const perm = await ensurePermission();
      if (perm !== "granted") {
        showToast({
          variant: "error",
          message: "Browser notification permission was not granted.",
        });
        return;
      }
    }
    if (!prefs) return;
    const nextMap = Object.fromEntries(
      Object.keys(prefs.osToastPerKind).map((k) => [k, next]),
    );
    await patch({ osToastPerKind: nextMap });
  }

  async function togglePush(next: boolean) {
    try {
      if (next) await enablePush();
      else await disablePush();
      if (!prefs) return;
      const nextMap = Object.fromEntries(
        Object.keys(prefs.webPushPerKind).map((k) => [k, next]),
      );
      await patch({ webPushPerKind: nextMap });
    } catch {
      showToast({ variant: "error", message: "Could not update push setting." });
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
        description="Manage in-app alerts, browser toasts, and push delivery."
        icon={Bell}
      >
        {loading}
      </SettingsSection>
    );
  }

  const kinds = Object.entries(KIND_META);
  const inAppMaster = Object.values(prefs.inAppPerKind).some(Boolean);
  const osToastMaster = Object.values(prefs.osToastPerKind).some(Boolean);
  const webPushMaster = Object.values(prefs.webPushPerKind).some(Boolean);

  const content = (
    <>
      <div className="space-y-2">
        <SettingsSwitch
          checked={inAppMaster}
          onChange={(next) =>
            patch({
              inAppPerKind: Object.fromEntries(
                Object.keys(prefs.inAppPerKind).map((k) => [k, next]),
              ),
            })
          }
          label="In-app notifications"
        />
        <SettingsSwitch
          checked={osToastMaster}
          onChange={toggleBrowserToasts}
          label="Browser notifications (tab hidden)"
        />
        <SettingsSwitch
          checked={webPushMaster || isPushEnabledLocally()}
          onChange={togglePush}
          label="PWA push notifications"
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Kind</th>
              <th className="px-3 py-2 text-left">In-app</th>
              <th className="px-3 py-2 text-left">Browser</th>
              <th className="px-3 py-2 text-left">Push</th>
            </tr>
          </thead>
          <tbody>
            {kinds.map(([kind, meta]) => (
              <tr key={kind} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-primary">{meta.label}</td>
                <td className="px-3 py-2">
                  <SettingsSwitch
                    checked={prefs.inAppPerKind[kind] !== false}
                    onChange={(next) => setChannel("inAppPerKind", kind, next)}
                    label={`${meta.label} in-app`}
                  />
                </td>
                <td className="px-3 py-2">
                  <SettingsSwitch
                    checked={prefs.osToastPerKind[kind] !== false}
                    onChange={(next) => setChannel("osToastPerKind", kind, next)}
                    label={`${meta.label} browser`}
                  />
                </td>
                <td className="px-3 py-2">
                  <SettingsSwitch
                    checked={prefs.webPushPerKind[kind] !== false}
                    onChange={(next) => setChannel("webPushPerKind", kind, next)}
                    label={`${meta.label} push`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  if (!wrapInSection) return content;
  return (
    <SettingsSection
      title="Notifications"
      description="Manage in-app alerts, browser toasts, and push delivery."
      icon={Bell}
    >
      {content}
    </SettingsSection>
  );
}
