import { PermissionGate } from "@/components/auth/PermissionGate";
import { DriverAttendanceDetail } from "@/components/attendance/DriverAttendanceDetail";

export const metadata = {
  title: "FleetSite | Driver Attendance",
  description:
    "Per-driver attendance history with absences, late days, missed punches, and daily working hours.",
};

// Next 16 passes route params as a Promise so the framework can stream them.
// We await once here and hand the resolved id to the client detail component.
export default async function DriverAttendanceDetailPage({
  params,
}: {
  params: Promise<{ driverId: string }>;
}) {
  const { driverId } = await params;
  return (
    <PermissionGate permission="attendance.read" pageLabel="Driver Attendance">
      <DriverAttendanceDetail driverId={driverId} />
    </PermissionGate>
  );
}
