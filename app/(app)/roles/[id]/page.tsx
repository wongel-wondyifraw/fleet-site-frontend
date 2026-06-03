import { PermissionGate } from "@/components/auth/PermissionGate";
import { RoleDetail } from "@/components/settings/RoleDetail";

export const metadata = {
  title: "FleetSite | Role Details",
  description: "View and edit a role and its permissions.",
};

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PermissionGate permission="roles.read" pageLabel="Role Details">
      <RoleDetail roleId={id} />
    </PermissionGate>
  );
}
