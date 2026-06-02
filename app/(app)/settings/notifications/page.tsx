import { NotificationsSettingsPanel } from "@/components/settings/NotificationsSettingsPanel";

export const metadata = {
  title: "FleetSite | Notification Settings",
  description: "Manage in-app, browser, and PWA push notification channels.",
};

export default function NotificationSettingsPage() {
  return <NotificationsSettingsPanel />;
}
