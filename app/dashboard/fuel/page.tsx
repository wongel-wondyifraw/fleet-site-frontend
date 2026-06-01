import { FuelManagement } from "@/components/fuel/FuelManagement";

export const metadata = {
  title: "FleetSite | Fuel Management",
  description:
    "Estimate daily fuel consumption from attendance odometer readings and vehicle km/L ratings.",
};

export default function FuelPage() {
  return <FuelManagement />;
}
