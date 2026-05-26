"use client";

// Reusable driver add/edit form. Owns the controlled form state, validates
// inputs, and exposes a single onSubmit that hands the assembled payload back
// to the caller (DriversPanel) which performs the actual create/update API
// calls. Mirrors the structure of VehicleForm so the two feel consistent.
//
// The form also lets the user either pick an already-registered unassigned
// vehicle, or register a brand-new vehicle inline at the same time as the
// driver (mirror of the new-driver subform in VehicleForm).
import {
  ArrowLeft,
  Building2,
  Fuel,
  Gauge,
  Hash,
  IdCard,
  Loader2,
  Mail,
  Phone,
  Plus,
  Save,
  Search,
  Truck,
  User as UserIcon,
  X,
} from "lucide-react";
import {
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
} from "react";

import {
  FieldGrid,
  SettingsField,
  fieldClass,
} from "@/components/settings/SettingsShared";
import { Button } from "@/components/ui/button";
import { PanelError } from "@/components/vehicles/VehicleForm";
import { ApiError } from "@/lib/api/client";
import type {
  CreateDriverRequest,
  UpdateDriverRequest,
} from "@/lib/api/drivers";
import {
  DRIVER_STATUSES,
  FUEL_TYPES,
  LICENSE_CLASSES,
  VEHICLE_TYPES,
  formatLicenseClass,
  prettyEnum,
  type ApiDriver,
  type ApiSite,
  type ApiVehicle,
  type DriverStatus,
  type FuelType,
  type LicenseClass,
  type VehicleType,
} from "@/lib/api/types";
import type { CreateVehicleRequest } from "@/lib/api/vehicles";
import { cn } from "@/lib/utils";

// Vehicle selection emitted by the form. The caller decides what to do with
// each variant:
//   "none"     -> ensure no vehicle is linked (clears any previous link).
//   "existing" -> link this driver to the given vehicle id.
//   "new"      -> create the vehicle record and link it.
export type VehicleSelection =
  | { kind: "none" }
  | { kind: "existing"; vehicleId: string }
  | { kind: "new"; payload: CreateVehicleRequest };

// Public submit payload. For create the caller uses `createPayload`; for
// edit it uses `updatePayload`. `vehicleSelection` is independent and is
// applied by the caller after the driver record itself is persisted.
export interface DriverFormSubmit {
  createPayload: CreateDriverRequest;
  updatePayload: UpdateDriverRequest;
  vehicleSelection: VehicleSelection;
}

// ---- Inline new-vehicle sub-form state ------------------------------------

type NewVehicleFormState = {
  plateNumber: string;
  type: VehicleType;
  fuelType: FuelType;
  fuelCapacity: string;
  mileage: string;
  assignedSite: string;
};

function emptyNewVehicleForm(): NewVehicleFormState {
  return {
    plateNumber: "",
    type: "TRUCK",
    fuelType: "DIESEL",
    fuelCapacity: "",
    mileage: "",
    assignedSite: "",
  };
}

// Parse a free-text numeric field. Empty -> 0, anything unparseable -> NaN
// so the caller can flag it before submitting.
function parseNumericField(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const num = Number.parseFloat(trimmed);
  return Number.isFinite(num) ? num : Number.NaN;
}

// ---- Component ------------------------------------------------------------

export function DriverForm({
  initial,
  sites,
  vehicles,
  driverByVehicleId,
  onCancel,
  onSubmit,
}: {
  // Pass the driver record to edit; pass `null` to render the create form.
  initial: ApiDriver | null;
  // Available sites for the home-site dropdown and inline new-vehicle form.
  sites: ApiSite[];
  // Full list of vehicles - the form filters to unassigned ones (plus the
  // currently-linked one when editing) for the assignment picker.
  vehicles: ApiVehicle[];
  // Map of vehicleId -> the driver who already has that vehicle assigned.
  // Used to hide vehicles that are claimed by other drivers from the picker
  // (the driver being edited is always allowed to keep their own vehicle).
  driverByVehicleId: Map<string, ApiDriver>;
  onCancel: () => void;
  // Caller decides whether to create or update based on `initial`, and
  // applies the vehicle selection separately.
  onSubmit: (args: DriverFormSubmit) => Promise<void>;
}) {
  const isEdit = initial !== null;

  // Employee IDs are server-issued (EMP-001, EMP-002, ...). On edit we show
  // the existing value read-only; on create we display a placeholder and let
  // the backend assign the real value when the record is persisted.
  const employeeId = initial?.employeeId ?? "";

  // Form state - seeded from `initial` when editing.
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [licenseNumber, setLicenseNumber] = useState(
    initial?.licenseNumber ?? "",
  );
  const [licenseClass, setLicenseClass] = useState<LicenseClass>(
    initial?.licenseClass ?? "PUBLIC_1",
  );
  // Dates are kept as YYYY-MM-DD strings so they map cleanly to <input type="date">.
  const [licenseExpiry, setLicenseExpiry] = useState(
    isoDate(initial?.licenseExpiry),
  );
  const [hireDate, setHireDate] = useState(isoDate(initial?.hireDate));
  const [phoneNumber, setPhoneNumber] = useState(initial?.phoneNumber ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  // homeSite is a free-text column on the entity; we model it here as the
  // site *name* so the dropdown shows nice labels and search-by-site works.
  const [homeSite, setHomeSite] = useState(initial?.homeSite ?? "");
  const [status, setStatus] = useState<DriverStatus>(
    initial?.status ?? "ACTIVE",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  // Vehicle assignment state. Seed from the driver's existing assignment.
  const [vehicleSelection, setVehicleSelection] = useState<VehicleSelection>(
    () =>
      initial?.assignedVehicleId
        ? { kind: "existing", vehicleId: initial.assignedVehicleId }
        : { kind: "none" },
  );
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [newVehicleForm, setNewVehicleForm] = useState<NewVehicleFormState>(
    emptyNewVehicleForm,
  );
  const [isCreatingNewVehicle, setIsCreatingNewVehicle] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Site dropdown options - sorted alphabetically by name for usability.
  const sortedSites = useMemo(
    () => [...sites].sort((a, b) => a.name.localeCompare(b.name)),
    [sites],
  );

  function updateNewVehicle<K extends keyof NewVehicleFormState>(
    key: K,
    value: NewVehicleFormState[K],
  ) {
    setNewVehicleForm((prev) => ({ ...prev, [key]: value }));
  }

  function selectExistingVehicle(id: string) {
    setIsCreatingNewVehicle(false);
    setVehicleSelection({ kind: "existing", vehicleId: id });
  }

  function clearVehicleSelection() {
    setIsCreatingNewVehicle(false);
    setVehicleSelection({ kind: "none" });
  }

  function startCreatingVehicle() {
    setIsCreatingNewVehicle(true);
    setVehicleSelection({ kind: "none" });
  }

  function cancelCreatingVehicle() {
    setIsCreatingNewVehicle(false);
    setNewVehicleForm(emptyNewVehicleForm());
  }

  // Inline validation. Returns the first error string, or null when valid.
  function validate(): string | null {
    if (!firstName.trim()) return "First name is required.";
    if (!lastName.trim()) return "Last name is required.";
    if (!licenseNumber.trim()) return "License number is required.";
    if (!licenseExpiry) return "License expiry date is required.";
    if (!hireDate) return "Hire date is required.";
    if (!phoneNumber.trim()) return "Phone number is required.";
    // Loose phone check that matches the backend regex.
    if (!/^[+\d][\d\s\-()]{5,}$/.test(phoneNumber.trim())) {
      return "Phone number format looks invalid.";
    }
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return "Email address looks invalid.";
    }

    if (isCreatingNewVehicle) {
      const plate = newVehicleForm.plateNumber.trim();
      if (!plate) return "Vehicle: plate number is required.";
      if (plate.length < 2) return "Vehicle: plate number is too short.";
      const fuelCapacity = parseNumericField(newVehicleForm.fuelCapacity);
      if (!Number.isFinite(fuelCapacity) || fuelCapacity < 0) {
        return "Vehicle: fuel capacity must be a number 0 or greater.";
      }
      const mileage = parseNumericField(newVehicleForm.mileage);
      if (!Number.isFinite(mileage) || mileage < 0) {
        return "Vehicle: mileage must be a number 0 or greater.";
      }
    }
    return null;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);

    const err = validate();
    if (err) {
      setErrorMessage(err);
      return;
    }

    // Coalesce empty optional strings to undefined / null so the backend
    // can tell "leave it" from "clear it".
    const trimmedEmail = email.trim();
    const trimmedSite = homeSite.trim();
    const trimmedNotes = notes.trim();

    const createPayload: CreateDriverRequest = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      licenseNumber: licenseNumber.trim(),
      licenseClass,
      licenseExpiry,
      hireDate,
      phoneNumber: phoneNumber.trim(),
      email: trimmedEmail || undefined,
      homeSite: trimmedSite || undefined,
      notes: trimmedNotes || undefined,
    };

    const updatePayload: UpdateDriverRequest = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      licenseNumber: licenseNumber.trim(),
      licenseClass,
      licenseExpiry,
      phoneNumber: phoneNumber.trim(),
      email: trimmedEmail || null,
      status,
      homeSite: trimmedSite || null,
      notes: trimmedNotes || null,
    };

    // Resolve the vehicle selection now so the caller never has to inspect
    // form state. When creating a new vehicle inline we synthesize the
    // CreateVehicleRequest from the sub-form here.
    let resolvedVehicleSelection: VehicleSelection = vehicleSelection;
    if (isCreatingNewVehicle) {
      const fuelCapacity = parseNumericField(newVehicleForm.fuelCapacity);
      const mileage = parseNumericField(newVehicleForm.mileage);
      resolvedVehicleSelection = {
        kind: "new",
        payload: {
          plateNumber: newVehicleForm.plateNumber.trim(),
          type: newVehicleForm.type,
          fuelType: newVehicleForm.fuelType,
          fuelCapacity,
          mileage,
          assignedSite: newVehicleForm.assignedSite || undefined,
        },
      };
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        createPayload,
        updatePayload,
        vehicleSelection: resolvedVehicleSelection,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : isEdit
            ? "Unable to update driver."
            : "Unable to create driver.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isSubmitting}
            className="h-9 gap-1.5 rounded-lg px-2 text-sm text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <h3 className="text-base font-semibold text-primary">
            {isEdit ? "Edit driver" : "Add new driver"}
          </h3>
        </div>
      </header>

      {errorMessage && <PanelError message={errorMessage} />}

      <FieldGrid>
        <SettingsField
          label="Employee ID"
          hint={
            isEdit
              ? "Server-issued and immutable."
              : "Assigned automatically (e.g. EMP-001) when this driver is created."
          }
        >
          <IconInput
            icon={IdCard}
            value={isEdit ? employeeId : "Auto-generated"}
            onChange={() => {
              /* read-only - the backend assigns this. */
            }}
            disabled
          />
        </SettingsField>
        <SettingsField label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as DriverStatus)}
            className={fieldClass}
            disabled={!isEdit || isSubmitting}
            aria-label="Driver status"
          >
            {DRIVER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {prettyEnum(s)}
              </option>
            ))}
          </select>
        </SettingsField>
      </FieldGrid>

      <FieldGrid>
        <SettingsField label="First name">
          <IconInput
            icon={UserIcon}
            value={firstName}
            onChange={setFirstName}
            placeholder="Jane"
            disabled={isSubmitting}
          />
        </SettingsField>
        <SettingsField label="Last name">
          <IconInput
            icon={UserIcon}
            value={lastName}
            onChange={setLastName}
            placeholder="Doe"
            disabled={isSubmitting}
          />
        </SettingsField>
      </FieldGrid>

      <FieldGrid>
        <SettingsField label="License number">
          <IconInput
            icon={IdCard}
            value={licenseNumber}
            onChange={setLicenseNumber}
            placeholder="DL-1234567"
            disabled={isSubmitting}
          />
        </SettingsField>
        <SettingsField label="License class">
          <select
            value={licenseClass}
            onChange={(e) => setLicenseClass(e.target.value as LicenseClass)}
            className={fieldClass}
            disabled={isSubmitting}
            aria-label="License class"
          >
            {LICENSE_CLASSES.map((c) => (
              <option key={c} value={c}>
                {formatLicenseClass(c)}
              </option>
            ))}
          </select>
        </SettingsField>
      </FieldGrid>

      <FieldGrid>
        <SettingsField label="License expiry">
          <input
            type="date"
            value={licenseExpiry}
            onChange={(e) => setLicenseExpiry(e.target.value)}
            className={fieldClass}
            disabled={isSubmitting}
            aria-label="License expiry"
          />
        </SettingsField>
        <SettingsField label="Hire date">
          <input
            type="date"
            value={hireDate}
            onChange={(e) => setHireDate(e.target.value)}
            className={fieldClass}
            disabled={isSubmitting}
            aria-label="Hire date"
          />
        </SettingsField>
      </FieldGrid>

      <FieldGrid>
        <SettingsField label="Phone number">
          <IconInput
            icon={Phone}
            value={phoneNumber}
            onChange={setPhoneNumber}
            placeholder="+1 555 0100"
            disabled={isSubmitting}
            type="tel"
          />
        </SettingsField>
        <SettingsField label="Email" hint="Optional">
          <IconInput
            icon={Mail}
            value={email}
            onChange={setEmail}
            placeholder="jane.doe@example.com"
            disabled={isSubmitting}
            type="email"
          />
        </SettingsField>
      </FieldGrid>

      <SettingsField
        label="Assigned site"
        hint={
          sortedSites.length === 0
            ? "No sites available yet - create one from Settings first."
            : "Select the construction site this driver is assigned to."
        }
      >
        <SiteSelect
          value={homeSite}
          onChange={setHomeSite}
          sites={sortedSites}
          disabled={isSubmitting}
        />
      </SettingsField>

      <VehicleAssignmentSection
        vehicles={vehicles}
        driverByVehicleId={driverByVehicleId}
        currentDriverId={initial?.id ?? null}
        vehicleSelection={vehicleSelection}
        search={vehicleSearch}
        onSearchChange={setVehicleSearch}
        onSelectExisting={selectExistingVehicle}
        onClear={clearVehicleSelection}
        onStartNew={startCreatingVehicle}
        isCreatingNew={isCreatingNewVehicle}
        onCancelNew={cancelCreatingVehicle}
        newVehicleForm={newVehicleForm}
        updateNewVehicle={updateNewVehicle}
        sites={sortedSites}
        disabled={isSubmitting}
      />

      <SettingsField label="Notes" hint="Optional">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Any extra context worth recording..."
          className={`${fieldClass} h-auto min-h-[80px] py-2`}
          disabled={isSubmitting}
        />
      </SettingsField>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="h-10 rounded-xl border-slate-200 bg-white px-4 text-sm"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-10 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {isEdit ? "Saving..." : "Creating..."}
            </>
          ) : (
            <>
              <Save className="size-4" />
              {isEdit ? "Save changes" : "Create driver"}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

// ---- Vehicle assignment section -------------------------------------------

function VehicleAssignmentSection({
  vehicles,
  driverByVehicleId,
  currentDriverId,
  vehicleSelection,
  search,
  onSearchChange,
  onSelectExisting,
  onClear,
  onStartNew,
  isCreatingNew,
  onCancelNew,
  newVehicleForm,
  updateNewVehicle,
  sites,
  disabled,
}: {
  vehicles: ApiVehicle[];
  // Map of vehicleId -> the driver already linked to it. A vehicle is
  // considered "taken" if it has an entry here for someone other than the
  // driver we're currently editing.
  driverByVehicleId: Map<string, ApiDriver>;
  // The driver record being edited, if any. Their already-linked vehicle
  // must stay selectable so editing a driver without changing the vehicle
  // assignment doesn't accidentally drop it from the list.
  currentDriverId: string | null;
  vehicleSelection: VehicleSelection;
  search: string;
  onSearchChange: (next: string) => void;
  onSelectExisting: (id: string) => void;
  onClear: () => void;
  onStartNew: () => void;
  isCreatingNew: boolean;
  onCancelNew: () => void;
  newVehicleForm: NewVehicleFormState;
  updateNewVehicle: <K extends keyof NewVehicleFormState>(
    key: K,
    value: NewVehicleFormState[K],
  ) => void;
  sites: ApiSite[];
  disabled: boolean;
}) {
  // Filter: only show vehicles that have no driver linked, plus the one
  // already linked to the driver being edited. Vehicles claimed by other
  // drivers are hidden so the user can't double-assign by mistake.
  const availableVehicles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles
      .filter((v) => {
        const claimedBy = driverByVehicleId.get(v.id);
        if (!claimedBy) return true;
        // Still allow the driver being edited to keep their own vehicle.
        return currentDriverId !== null && claimedBy.id === currentDriverId;
      })
      .filter((v) => {
        if (!q) return true;
        const hay =
          `${v.assetNumber} ${v.plateNumber} ${prettyEnum(v.type)}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        (a.assetNumber ?? "").localeCompare(b.assetNumber ?? ""),
      );
  }, [vehicles, driverByVehicleId, currentDriverId, search]);

  const selectedExisting =
    vehicleSelection.kind === "existing"
      ? (vehicles.find((v) => v.id === vehicleSelection.vehicleId) ?? null)
      : null;

  // Number of vehicles in the system that are already taken by someone
  // other than the driver being edited. Used to tailor the empty-state
  // message so it's obvious *why* the list is empty.
  const claimedByOthers = vehicles.reduce((count, v) => {
    const claimedBy = driverByVehicleId.get(v.id);
    if (!claimedBy) return count;
    if (currentDriverId && claimedBy.id === currentDriverId) return count;
    return count + 1;
  }, 0);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/40 p-4">
      <header className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Truck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-primary">
            Assigned vehicle
          </h4>
          <p className="text-[11px] text-muted-foreground">
            Link this driver to an already-registered vehicle, or register a
            new one inline.
          </p>
        </div>
      </header>

      {selectedExisting && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
            <Truck className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-semibold text-primary">
              {selectedExisting.assetNumber}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {selectedExisting.plateNumber}
              <span className="mx-1.5 text-slate-300">·</span>
              {prettyEnum(selectedExisting.type)}
              <span className="mx-1.5 text-slate-300">·</span>
              {prettyEnum(selectedExisting.fuelType)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={disabled}
            aria-label="Remove vehicle"
            className="h-8 gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="size-3.5" />
            Remove
          </Button>
        </div>
      )}

      {isCreatingNew ? (
        <NewVehicleSubForm
          form={newVehicleForm}
          onChange={updateNewVehicle}
          onCancel={onCancelNew}
          sites={sites}
          disabled={disabled}
        />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              Available vehicles ({availableVehicles.length})
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onStartNew}
              disabled={disabled}
              className="h-8 gap-1 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/10"
            >
              <Plus className="size-3.5" />
              Register new vehicle
            </Button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              disabled={disabled || vehicles.length === 0}
              placeholder="Search by asset, plate, or type"
              className={`${fieldClass} pl-9`}
              aria-label="Search vehicles"
            />
          </div>

          {vehicles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white/50 px-3 py-4 text-center text-xs text-muted-foreground">
              No vehicles in the system yet. Use{" "}
              <button
                type="button"
                onClick={onStartNew}
                disabled={disabled}
                className="font-semibold text-primary hover:underline"
              >
                Register new vehicle
              </button>{" "}
              above.
            </div>
          ) : availableVehicles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white/50 px-3 py-4 text-center text-xs text-muted-foreground">
              {search.trim() ? (
                `No unassigned vehicles match "${search}".`
              ) : claimedByOthers > 0 ? (
                <>
                  All {claimedByOthers}{" "}
                  {claimedByOthers === 1 ? "vehicle is" : "vehicles are"}{" "}
                  already assigned to other drivers. Use{" "}
                  <button
                    type="button"
                    onClick={onStartNew}
                    disabled={disabled}
                    className="font-semibold text-primary hover:underline"
                  >
                    Register new vehicle
                  </button>{" "}
                  to add one.
                </>
              ) : (
                "No unassigned vehicles available."
              )}
            </div>
          ) : (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-slate-100 bg-white p-2">
              {availableVehicles.map((v) => {
                const isSelected =
                  vehicleSelection.kind === "existing" &&
                  vehicleSelection.vehicleId === v.id;
                return (
                  <li
                    key={v.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                      isSelected
                        ? "border-primary/40 bg-primary/5"
                        : "border-transparent hover:border-slate-200 hover:bg-slate-50",
                    )}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Truck className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm font-semibold text-primary">
                        {v.assetNumber}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {v.plateNumber}
                        <span className="mx-1.5 text-slate-300">·</span>
                        {prettyEnum(v.type)}
                        <span className="mx-1.5 text-slate-300">·</span>
                        {prettyEnum(v.fuelType)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onSelectExisting(v.id)}
                      disabled={disabled || isSelected}
                      className="h-8 gap-1 rounded-lg bg-primary px-3 text-xs font-semibold shadow-sm hover:bg-surface-tint disabled:bg-slate-200 disabled:text-muted-foreground"
                    >
                      {isSelected ? "Selected" : "Select"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Inline new-vehicle sub-form ------------------------------------------

function NewVehicleSubForm({
  form,
  onChange,
  onCancel,
  sites,
  disabled,
}: {
  form: NewVehicleFormState;
  onChange: <K extends keyof NewVehicleFormState>(
    key: K,
    value: NewVehicleFormState[K],
  ) => void;
  onCancel: () => void;
  sites: ApiSite[];
  disabled: boolean;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-white">
            <Plus className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-primary">
              Register a new vehicle
            </p>
            <p className="text-[11px] text-muted-foreground">
              These details create a new record in the vehicle table.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={disabled}
          className="h-8 gap-1 rounded-lg px-2 text-xs"
        >
          <X className="size-3.5" />
          Cancel
        </Button>
      </div>

      <FieldGrid>
        <SettingsField label="Plate number">
          <IconInput
            icon={Hash}
            value={form.plateNumber}
            onChange={(v) => onChange("plateNumber", v)}
            placeholder="ABC-1234"
            disabled={disabled}
          />
        </SettingsField>
        <SettingsField label="Vehicle type">
          <select
            className={fieldClass}
            value={form.type}
            onChange={(e) => onChange("type", e.target.value as VehicleType)}
            disabled={disabled}
            aria-label="Vehicle type"
          >
            {VEHICLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {prettyEnum(t)}
              </option>
            ))}
          </select>
        </SettingsField>
        <SettingsField label="Fuel type">
          <div className="relative">
            <Fuel className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <select
              className={`${fieldClass} pl-9`}
              value={form.fuelType}
              onChange={(e) =>
                onChange("fuelType", e.target.value as FuelType)
              }
              disabled={disabled}
              aria-label="Fuel type"
            >
              {FUEL_TYPES.map((f) => (
                <option key={f} value={f}>
                  {prettyEnum(f)}
                </option>
              ))}
            </select>
          </div>
        </SettingsField>
        <SettingsField label="Fuel capacity (L)">
          <IconInput
            icon={Fuel}
            type="number"
            value={form.fuelCapacity}
            onChange={(v) => onChange("fuelCapacity", v)}
            placeholder="200"
            disabled={disabled}
          />
        </SettingsField>
        <SettingsField label="Mileage (km/L)" hint="Optional">
          <IconInput
            icon={Gauge}
            type="number"
            value={form.mileage}
            onChange={(v) => onChange("mileage", v)}
            placeholder="3.5"
            disabled={disabled}
          />
        </SettingsField>
        <SettingsField label="Assigned site" hint="Optional">
          <div className="relative">
            <Building2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <select
              className={`${fieldClass} pl-9`}
              value={form.assignedSite}
              onChange={(e) => onChange("assignedSite", e.target.value)}
              disabled={disabled}
              aria-label="Assigned site (vehicle)"
            >
              <option value="">No site</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </SettingsField>
      </FieldGrid>
    </div>
  );
}

// ---- Helpers --------------------------------------------------------------

// Coerce an arbitrary ISO date(time) string into a YYYY-MM-DD value suitable
// for <input type="date">. Returns "" if the input is missing or invalid.
function isoDate(input?: string | null): string {
  if (!input) return "";
  // Already a YYYY-MM-DD value (typical for date-only columns).
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function IconInput({
  icon: Icon,
  value,
  onChange,
  placeholder,
  disabled,
  type = "text",
}: {
  icon: ComponentType<{ className?: string }>;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`${fieldClass} pl-9`}
      />
    </div>
  );
}

function SiteSelect({
  value,
  onChange,
  sites,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  sites: ApiSite[];
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <Building2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`${fieldClass} pl-9`}
        aria-label="Assigned site"
      >
        <option value="">No site (unassigned)</option>
        {sites.map((site) => (
          <option key={site.id} value={site.name}>
            {site.name}
          </option>
        ))}
      </select>
    </div>
  );
}
