import { SiteDashboard } from "@/components/dashboard/SiteDashboard";

export const metadata = {
  title: "FleetSite | Site Dashboard",
  description: "Per-site health score, operations, and trend.",
};

export default async function SitePage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  return <SiteDashboard siteId={siteId} />;
}
