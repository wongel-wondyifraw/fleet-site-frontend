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
  return <RoleDetail roleId={id} />;
}
