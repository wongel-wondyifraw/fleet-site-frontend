// Shared save orchestration for the vehicle form. The form component itself
// only collects state and validates; this helper translates the assembled
// payload + driver selection into the right sequence of API calls.
//
// Used by both the registry panel (add new) and the detail page (edit), so
// behaviour stays identical regardless of where the form is rendered.
import {
  assignDriverVehicle,
  createDriver,
  unassignDriverVehicle,
} from "@/lib/api/drivers";
import type { VehicleStatus } from "@/lib/api/types";
import {
  createVehicle,
  updateVehicle,
  type CreateVehicleRequest,
} from "@/lib/api/vehicles";
import type { DriverSelection } from "@/components/vehicles/VehicleForm";

export interface SaveVehicleArgs {
  payload: CreateVehicleRequest;
  // Status update sent only when editing; null on create (backend defaults
  // to ACTIVE in that case).
  status: VehicleStatus | null;
  driverSelection: DriverSelection;
  editingVehicleId: string | null;
  // Driver currently linked to the vehicle (when editing). Used to decide
  // whether we need to clear or change the link.
  previousDriverId: string | null;
}

// Persists the vehicle, then reconciles the driver assignment. Returns the
// id of the saved vehicle so callers can route to it (e.g. detail page).
export async function saveVehicleWithDriver(
  args: SaveVehicleArgs,
): Promise<string> {
  const {
    payload,
    status,
    driverSelection,
    editingVehicleId,
    previousDriverId,
  } = args;

  let savedId: string;
  if (editingVehicleId) {
    const updated = await updateVehicle(editingVehicleId, {
      ...payload,
      ...(status ? { status } : {}),
    });
    savedId = updated.id;
  } else {
    const created = await createVehicle(payload);
    savedId = created.id;
  }

  const nextDriverId =
    driverSelection.kind === "existing" ? driverSelection.driverId : null;

  if (driverSelection.kind === "new") {
    await createDriver({
      ...driverSelection.payload,
      assignedVehicleId: savedId,
    });
  } else if (driverSelection.kind === "existing") {
    if (previousDriverId !== nextDriverId) {
      await assignDriverVehicle(driverSelection.driverId, savedId);
    }
  } else if (previousDriverId) {
    await unassignDriverVehicle(previousDriverId);
  }

  return savedId;
}
