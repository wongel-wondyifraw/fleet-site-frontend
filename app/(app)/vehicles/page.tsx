import { VehicleRegistry } from "@/components/vehicles/VehicleRegistry";

export const metadata = {
  title: "FleetSite | Vehicle Registry",
  description: "Register vehicles, assign drivers, and link them to sites.",
};

export default function VehiclesPage() {
  return <VehicleRegistry />;
}
