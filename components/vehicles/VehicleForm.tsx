"use client";

// Reusable vehicle add/edit form. Owns the controlled form state, validates
// inputs, and exposes a single onSubmit that hands the assembled payload +
// driver selection back to the caller (panel or detail page) which is
// responsible for the actual API calls. This keeps the form decoupled from
// where it lives in the route tree.
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Fuel,
  Gauge,
  Hash,
  IdCard,
  Loader2,
  Plus,
  Save,
  Search,
  User as UserIcon,
  UserPlus,
  X,
} from "@/lib/icons";
import {
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  FieldGrid,
  SettingsField,
  fieldClass,
} from "@/components/settings/SettingsShared";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { type CreateDriverRequest } from "@/lib/api/drivers";
import {
  FUEL_TYPES,
  LICENSE_CLASSES,
  VEHICLE_STATUSES,
  VEHICLE_TYPES,
  formatLicenseClass,
  prettyEnum,
  type ApiDriver,
  type ApiSite,
  type ApiVehicle,
  type FuelType,
  type LicenseClass,
  type VehicleStatus,
  type VehicleType,
} from "@/lib/api/types";
import { type CreateVehicleRequest } from "@/lib/api/vehicles";
import { cn } from "@/lib/utils";

// ----- Public types ---------------------------------------------------------

// Driver selection emitted by the form. The caller decides what to do with
// each variant: "none" -> unassign any existing driver; "existing" -> assign
// the driver id; "new" -> create the driver record and link it.
export type DriverSelection =
  | { kind: "none" }
  | { kind: "existing"; driverId: string }
  | { kind: "new"; payload: CreateDriverRequest };

// ----- Internal state types -------------------------------------------------

// Form state for the vehicle form. Mirrors CreateVehicleRequest plus status.
// Numeric inputs are kept as raw strings so the user can fully clear them
// (a `number` state forces "0" into the box and blocks erasure).
type VehicleFormState = {
  plateNumber: string;
  type: VehicleType;
  status: VehicleStatus;
  fuelType: FuelType;
  fuelCapacity: string;
  mileage: string;
  assignedSite: string;
};

function emptyVehicleForm(): VehicleFormState {
  return {
    plateNumber: "",
    type: "TRUCK",
    status: "ACTIVE",
    fuelType: "DIESEL",
    fuelCapacity: "",
    mileage: "",
    assignedSite: "",
  };
}

// Today's date in YYYY-MM-DD format - used to seed the inline new-driver form.
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// Default license expiry suggestion: one year out from today.
function oneYearFromTodayIso(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

// Parse a free-text numeric field into a non-negative number. Empty string
// maps to 0 so the user can leave a field blank to mean "unknown". Returns
// NaN for values we can't interpret so the caller can flag them.
function parseNumericField(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const num = Number.parseFloat(trimmed);
  return Number.isFinite(num) ? num : Number.NaN;
}

type NewDriverFormState = {
  firstName: string;
  lastName: string;
  licenseNumber: string;
  licenseClass: LicenseClass;
  licenseExpiry: string;
  phoneNumber: string;
  email: string;
  hireDate: string;
};

function emptyNewDriverForm(): NewDriverFormState {
  return {
    firstName: "",
    lastName: "",
    licenseNumber: "",
    licenseClass: "PUBLIC_1",
    licenseExpiry: oneYearFromTodayIso(),
    phoneNumber: "+251",
    email: "",
    hireDate: todayIsoDate(),
  };
}

// ----- VehicleForm ----------------------------------------------------------

export function VehicleForm({
  initial,
  initialDriver,
  sites,
  drivers,
  onCancel,
  onSubmit,
}: {
  initial: ApiVehicle | null;
  initialDriver: ApiDriver | null;
  sites: ApiSite[];
  drivers: ApiDriver[];
  onCancel: () => void;
  onSubmit: (args: {
    payload: CreateVehicleRequest;
    // Patch-only status update sent when editing; null on create.
    status: VehicleStatus | null;
    driverSelection: DriverSelection;
  }) => Promise<void>;
}) {
  const isNew = initial === null;
  const [form, setForm] = useState<VehicleFormState>(() =>
    initial
      ? {
          plateNumber: initial.plateNumber,
          type: initial.type,
          status: initial.status,
          fuelType: initial.fuelType,
          fuelCapacity:
            initial.fuelCapacity != null ? String(initial.fuelCapacity) : "",
          mileage: initial.mileage != null ? String(initial.mileage) : "",
          assignedSite: initial.assignedSite ?? "",
        }
      : emptyVehicleForm(),
  );

  const [driverSelection, setDriverSelection] = useState<DriverSelection>(
    () => {
      if (initialDriver) {
        return { kind: "existing", driverId: initialDriver.id };
      }
      return { kind: "none" };
    },
  );
  const [driverSearch, setDriverSearch] = useState("");
  const [newDriverForm, setNewDriverForm] = useState<NewDriverFormState>(
    emptyNewDriverForm,
  );
  const [isCreatingNewDriver, setIsCreatingNewDriver] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function update<K extends keyof VehicleFormState>(
    key: K,
    value: VehicleFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateDriver<K extends keyof NewDriverFormState>(
    key: K,
    value: NewDriverFormState[K],
  ) {
    setNewDriverForm((prev) => ({ ...prev, [key]: value }));
  }

  function selectExistingDriver(id: string) {
    setIsCreatingNewDriver(false);
    setDriverSelection({ kind: "existing", driverId: id });
  }

  function clearDriverSelection() {
    setIsCreatingNewDriver(false);
    setDriverSelection({ kind: "none" });
  }

  function startCreatingDriver() {
    setIsCreatingNewDriver(true);
    setDriverSelection({ kind: "none" });
  }

  function cancelCreatingDriver() {
    setIsCreatingNewDriver(false);
    setNewDriverForm(emptyNewDriverForm());
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const plateNumber = form.plateNumber.trim();
    if (!plateNumber) {
      setFormError("Plate number is required.");
      return;
    }
    const fuelCapacity = parseNumericField(form.fuelCapacity);
    if (!Number.isFinite(fuelCapacity) || fuelCapacity < 0) {
      setFormError("Fuel capacity must be a number 0 or greater.");
      return;
    }
    const mileage = parseNumericField(form.mileage);
    if (!Number.isFinite(mileage) || mileage < 0) {
      setFormError("Mileage must be a number 0 or greater.");
      return;
    }

    let resolvedDriverSelection: DriverSelection = driverSelection;
    if (isCreatingNewDriver) {
      const newDriverPayload = trimNewDriver(newDriverForm);
      const driverError = validateNewDriver(newDriverPayload);
      if (driverError) {
        setFormError(driverError);
        return;
      }
      resolvedDriverSelection = { kind: "new", payload: newDriverPayload };
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        payload: {
          plateNumber,
          type: form.type,
          fuelType: form.fuelType,
          fuelCapacity,
          mileage,
          assignedSite: form.assignedSite ? form.assignedSite : null,
        },
        status: isNew ? null : form.status,
        driverSelection: resolvedDriverSelection,
      });
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Could not save vehicle.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-8 rounded-lg hover:bg-primary/10 hover:text-primary"
          aria-label={isNew ? "Back to vehicle list" : "Cancel edit"}
          onClick={onCancel}
          disabled={isSubmitting}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <p className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
            {isNew ? "New vehicle" : `Editing ${initial?.assetNumber}`}
          </p>
          <h3 className="text-base font-semibold text-primary">
            {isNew ? "Register a vehicle" : initial?.assetNumber}
          </h3>
        </div>
      </div>

      {formError && <PanelError message={formError} />}

      <FormCard
        title="Identification"
        description={
          isNew
            ? "Asset number is generated automatically (AST-XXX)."
            : "Asset number is fixed; plate and category can be updated."
        }
        icon={IdCard}
      >
        <FieldGrid>
          <SettingsField
            label="Asset Number"
            hint={
              isNew
                ? "Generated on save - this field is read-only."
                : undefined
            }
          >
            <div className="relative">
              <Hash className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={isNew ? "AST-XXX (auto)" : (initial?.assetNumber ?? "")}
                readOnly
                disabled={isSubmitting}
                className={`${fieldClass} bg-slate-50 pl-9 font-mono`}
                aria-label="Asset number"
              />
            </div>
          </SettingsField>
          <SettingsField label="Plate Number">
            <input
              type="text"
              required
              value={form.plateNumber}
              onChange={(e) =>
                update("plateNumber", e.target.value.toUpperCase())
              }
              disabled={isSubmitting}
              placeholder="AA-1234"
              className={fieldClass}
            />
          </SettingsField>
          <SettingsField label="Type">
            <select
              className={fieldClass}
              value={form.type}
              onChange={(e) => update("type", e.target.value as VehicleType)}
              disabled={isSubmitting}
            >
              {VEHICLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {prettyEnum(t)}
                </option>
              ))}
            </select>
          </SettingsField>
          {!isNew && (
            <SettingsField label="Status">
              <select
                className={fieldClass}
                value={form.status}
                onChange={(e) =>
                  update("status", e.target.value as VehicleStatus)
                }
                disabled={isSubmitting}
              >
                {VEHICLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {prettyEnum(s)}
                  </option>
                ))}
              </select>
            </SettingsField>
          )}
        </FieldGrid>
      </FormCard>

      <FormCard
        title="Fuel & Mileage"
        description="Fuel type, tank size, and current fuel economy."
        icon={Fuel}
      >
        <FieldGrid>
          <SettingsField label="Fuel Type">
            <select
              className={fieldClass}
              value={form.fuelType}
              onChange={(e) => update("fuelType", e.target.value as FuelType)}
              disabled={isSubmitting}
            >
              {FUEL_TYPES.map((f) => (
                <option key={f} value={f}>
                  {prettyEnum(f)}
                </option>
              ))}
            </select>
          </SettingsField>
          <SettingsField label="Fuel Capacity (L)">
            <input
              type="number"
              min={0}
              step="0.1"
              inputMode="decimal"
              value={form.fuelCapacity}
              onChange={(e) => update("fuelCapacity", e.target.value)}
              disabled={isSubmitting}
              placeholder="e.g. 250"
              className={fieldClass}
            />
          </SettingsField>
          <SettingsField
            label="Mileage (KM/L)"
            hint="Fuel economy. Leave blank if unknown."
          >
            <div className="relative">
              <Gauge className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                value={form.mileage}
                onChange={(e) => update("mileage", e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. 4.5"
                className={`${fieldClass} pl-9`}
              />
            </div>
          </SettingsField>
        </FieldGrid>
      </FormCard>

      <FormCard
        title="Assigned Site"
        description="Which site this vehicle is operating out of."
        icon={Building2}
      >
        <SettingsField
          label="Site"
          hint={
            sites.length === 0
              ? "No sites available yet. Create one from Settings → Sites."
              : "Optional - leave empty to register without a site."
          }
        >
          <select
            className={fieldClass}
            value={form.assignedSite}
            onChange={(e) => update("assignedSite", e.target.value)}
            disabled={isSubmitting || sites.length === 0}
          >
            <option value="">— No site —</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.city}
              </option>
            ))}
          </select>
        </SettingsField>
      </FormCard>

      <FormCard
        title="Driver"
        description="Search and assign an existing driver, or register a new one."
        icon={UserIcon}
      >
        <DriverPicker
          drivers={drivers}
          driverSelection={driverSelection}
          search={driverSearch}
          onSearchChange={setDriverSearch}
          onSelectExisting={selectExistingDriver}
          onClear={clearDriverSelection}
          onStartNew={startCreatingDriver}
          isCreatingNew={isCreatingNewDriver}
          onCancelNew={cancelCreatingDriver}
          newDriverForm={newDriverForm}
          updateDriver={updateDriver}
          disabled={isSubmitting}
          excludeVehicleId={initial?.id ?? null}
        />
      </FormCard>

      <div className="sticky bottom-0 -mx-2 mt-6 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white/95 px-2 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="h-10 gap-2 rounded-xl border-slate-200 bg-white px-4 text-sm"
        >
          <X className="size-4" />
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-10 gap-2 rounded-xl bg-primary px-5 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="size-4" />
              {isNew ? "Register Vehicle" : "Save Changes"}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

// ----- Driver picker --------------------------------------------------------

function DriverPicker({
  drivers,
  driverSelection,
  search,
  onSearchChange,
  onSelectExisting,
  onClear,
  onStartNew,
  isCreatingNew,
  onCancelNew,
  newDriverForm,
  updateDriver,
  disabled,
  excludeVehicleId,
}: {
  drivers: ApiDriver[];
  driverSelection: DriverSelection;
  search: string;
  onSearchChange: (value: string) => void;
  onSelectExisting: (id: string) => void;
  onClear: () => void;
  onStartNew: () => void;
  isCreatingNew: boolean;
  onCancelNew: () => void;
  newDriverForm: NewDriverFormState;
  updateDriver: <K extends keyof NewDriverFormState>(
    key: K,
    value: NewDriverFormState[K],
  ) => void;
  disabled: boolean;
  excludeVehicleId: string | null;
}) {
  const availableDrivers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers
      .filter((d) => {
        if (!d.assignedVehicleId) return true;
        if (excludeVehicleId && d.assignedVehicleId === excludeVehicleId) {
          return true;
        }
        return false;
      })
      .filter((d) => {
        if (!q) return true;
        const hay =
          `${d.firstName} ${d.lastName} ${d.employeeId} ${d.licenseNumber} ${d.phoneNumber}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(
          `${b.lastName} ${b.firstName}`,
        ),
      );
  }, [drivers, search, excludeVehicleId]);

  const selectedExisting =
    driverSelection.kind === "existing"
      ? (drivers.find((d) => d.id === driverSelection.driverId) ?? null)
      : null;

  return (
    <div className="space-y-4">
      {selectedExisting && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white">
            {selectedExisting.firstName[0]}
            {selectedExisting.lastName[0]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-primary">
              {selectedExisting.firstName} {selectedExisting.lastName}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {selectedExisting.employeeId}
              <span className="mx-1.5 text-slate-300">·</span>
              {selectedExisting.licenseNumber}
              {selectedExisting.phoneNumber && (
                <>
                  <span className="mx-1.5 text-slate-300">·</span>
                  {selectedExisting.phoneNumber}
                </>
              )}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={disabled}
            aria-label="Remove driver"
            className="h-8 gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="size-3.5" />
            Remove
          </Button>
        </div>
      )}

      {isCreatingNew ? (
        <NewDriverSubForm
          form={newDriverForm}
          onChange={updateDriver}
          onCancel={onCancelNew}
          disabled={disabled}
        />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              Available drivers ({availableDrivers.length})
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onStartNew}
              disabled={disabled}
              className="h-8 gap-1 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/10"
            >
              <UserPlus className="size-3.5" />
              Register new driver
            </Button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              disabled={disabled || drivers.length === 0}
              placeholder="Search by name, employee ID, or license"
              className={`${fieldClass} pl-9`}
              aria-label="Search drivers"
            />
          </div>

          {drivers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-center text-xs text-muted-foreground">
              No drivers in the system yet. Use{" "}
              <button
                type="button"
                onClick={onStartNew}
                disabled={disabled}
                className="font-semibold text-primary hover:underline"
              >
                Register new driver
              </button>{" "}
              above.
            </div>
          ) : availableDrivers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-center text-xs text-muted-foreground">
              {search.trim()
                ? `No available drivers match "${search}".`
                : "All drivers are already assigned to a vehicle."}
            </div>
          ) : (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-slate-100 bg-white p-2">
              {availableDrivers.map((d) => {
                const isSelected =
                  driverSelection.kind === "existing" &&
                  driverSelection.driverId === d.id;
                return (
                  <li
                    key={d.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                      isSelected
                        ? "border-primary/40 bg-primary/5"
                        : "border-transparent hover:border-slate-200 hover:bg-slate-50",
                    )}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                      {d.firstName[0]}
                      {d.lastName[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-primary">
                        {d.firstName} {d.lastName}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {d.employeeId}
                        <span className="mx-1.5 text-slate-300">·</span>
                        {d.licenseNumber}
                        <span className="mx-1.5 text-slate-300">·</span>
                        {formatLicenseClass(d.licenseClass, "short")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onSelectExisting(d.id)}
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

function NewDriverSubForm({
  form,
  onChange,
  onCancel,
  disabled,
}: {
  form: NewDriverFormState;
  onChange: <K extends keyof NewDriverFormState>(
    key: K,
    value: NewDriverFormState[K],
  ) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-white">
            <UserPlus className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-primary">
              Register a new driver
            </p>
            <p className="text-[11px] text-muted-foreground">
              These details create a new record in the driver table.
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
        <SettingsField label="First name">
          <input
            type="text"
            value={form.firstName}
            onChange={(e) => onChange("firstName", e.target.value)}
            disabled={disabled}
            className={fieldClass}
          />
        </SettingsField>
        <SettingsField label="Last name">
          <input
            type="text"
            value={form.lastName}
            onChange={(e) => onChange("lastName", e.target.value)}
            disabled={disabled}
            className={fieldClass}
          />
        </SettingsField>
        <SettingsField label="Phone number">
          <PhoneInput
            value={form.phoneNumber}
            onChange={(v) => onChange("phoneNumber", v)}
            disabled={disabled}
          />
        </SettingsField>
        <SettingsField label="License number">
          <input
            type="text"
            value={form.licenseNumber}
            onChange={(e) => onChange("licenseNumber", e.target.value)}
            disabled={disabled}
            placeholder="DL-998877"
            className={fieldClass}
          />
        </SettingsField>
        <SettingsField label="License class">
          <select
            className={fieldClass}
            value={form.licenseClass}
            onChange={(e) =>
              onChange("licenseClass", e.target.value as LicenseClass)
            }
            disabled={disabled}
          >
            {LICENSE_CLASSES.map((c) => (
              <option key={c} value={c}>
                {formatLicenseClass(c)}
              </option>
            ))}
          </select>
        </SettingsField>
        <SettingsField label="License expiry">
          <input
            type="date"
            value={form.licenseExpiry}
            onChange={(e) => onChange("licenseExpiry", e.target.value)}
            disabled={disabled}
            className={fieldClass}
          />
        </SettingsField>
        <SettingsField label="Hire date">
          <input
            type="date"
            value={form.hireDate}
            onChange={(e) => onChange("hireDate", e.target.value)}
            disabled={disabled}
            className={fieldClass}
          />
        </SettingsField>
        <SettingsField label="Email (optional)">
          <input
            type="email"
            value={form.email}
            onChange={(e) => onChange("email", e.target.value)}
            disabled={disabled}
            placeholder="driver@company.com"
            className={fieldClass}
          />
        </SettingsField>
      </FieldGrid>
    </div>
  );
}

// ----- Helpers --------------------------------------------------------------

function trimNewDriver(form: NewDriverFormState): CreateDriverRequest {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    licenseNumber: form.licenseNumber.trim(),
    licenseClass: form.licenseClass,
    licenseExpiry: form.licenseExpiry,
    phoneNumber: form.phoneNumber.trim(),
    hireDate: form.hireDate,
    email: form.email.trim() || undefined,
  };
}

function validateNewDriver(payload: CreateDriverRequest): string | null {
  if (!payload.firstName) return "Driver: first name is required.";
  if (!payload.lastName) return "Driver: last name is required.";
  if (!payload.licenseNumber) return "Driver: license number is required.";
  if (!payload.phoneNumber || payload.phoneNumber === "+251") {
    return "Driver: phone number is required.";
  }
  if (!/^[+\d][\d\s\-()]{5,}$/.test(payload.phoneNumber)) {
    return "Driver: phone number looks invalid.";
  }
  if (!payload.licenseExpiry) return "Driver: license expiry is required.";
  if (!payload.hireDate) return "Driver: hire date is required.";
  return null;
}

// ----- Shared visual primitives --------------------------------------------

// Card wrapper reused by every form section. Exported so the detail page can
// build its read-only view with the same visual rhythm.
export function FormCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
      <div className="mb-3 flex items-center gap-2.5">
        {Icon ? (
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
        ) : null}
        <div>
          <p className="text-sm font-semibold text-primary">{title}</p>
          {description ? (
            <p className="text-[11px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

// Inline error banner matching the look used by SitesPanel.
export function PanelError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}
