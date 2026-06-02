import { NotificationsInbox } from "@/components/notifications/NotificationsInbox";

export const metadata = {
  title: "FleetSite | Notifications",
  description:
    "Every alert from your fleet — trips, fuel, attendance, vehicles, drivers — in one place.",
};

export default function NotificationsPage() {
  return <NotificationsInbox />;
}
