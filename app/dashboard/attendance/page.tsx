import { AttendanceManagement } from "@/components/attendance/AttendanceManagement";

export const metadata = {
  title: "FleetSite | Attendance Management",
  description:
    "Track employee check-ins and check-outs across sites and shifts.",
};

export default function AttendancePage() {
  return <AttendanceManagement />;
}
