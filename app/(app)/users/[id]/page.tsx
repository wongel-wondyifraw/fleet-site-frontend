import { PermissionGate } from "@/components/auth/PermissionGate";
import { UserDetail } from "@/components/settings/UserDetail";

export const metadata = {
  title: "FleetSite | User Details",
  description: "View and edit a teammate's profile and access.",
};

// Next 16 passes route params as a Promise so the framework can stream them.
// We await once here and hand the resolved id to the client detail component.
export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PermissionGate permission="users.read" pageLabel="User Details">
      <UserDetail userId={id} />
    </PermissionGate>
  );
}
