import { PermissionGate } from "@/components/auth/PermissionGate";
import { AttendanceManagement } from "@/components/attendance/AttendanceManagement";

export const metadata = {
  title: "FleetSite | Attendance Management",
  description:
    "Track employee check-ins and check-outs across sites and shifts.",
};

export default function AttendancePage() {
  return (
    <PermissionGate permission="attendance.read" pageLabel="Attendance Management">
      <AttendanceManagement />
    </PermissionGate>
  );
}
