import { DashboardSkeleton } from "@/components/dashboard/PageSkeleton";

// Next.js renders this as a Suspense fallback while /dashboard streams in.
// Shows a layout-matching skeleton so the user sees structure immediately
// instead of a blank screen on tab switches or slow networks.
export default function Loading() {
  return <DashboardSkeleton />;
}
