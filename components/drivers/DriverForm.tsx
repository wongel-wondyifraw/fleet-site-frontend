"use client";

// Reusable driver add/edit form. Owns the controlled form state, validates
// inputs, and exposes a single onSubmit that hands the assembled payload back
// to the caller (DriversPanel) which performs the actual create/update API
// calls. Mirrors the structure of VehicleForm so the two feel consistent.
import {
  ArrowLeft,
  Building2,
  IdCard,
  Loader2,
  Mail,
  Phone,
  Save,
  User as UserIcon,
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
  LICENSE_CLASSES,
  prettyEnum,
  type ApiDriver,
  type ApiSite,
  type DriverStatus,
  type LicenseClass,
} from "@/lib/api/types";

// Public submit payload. For create, the caller uses `createPayload`. For
// edit, the caller uses `updatePayload` (which leaves status/etc. untouched
// when the user didn't change them).
export interface DriverFormSubmit {
  // For create flows.
  createPayload: CreateDriverRequest;
  // For edit flows (subset of fields that can be patched).
  updatePayload: UpdateDriverRequest;
}

// ---- Component ------------------------------------------------------------

export function DriverForm({
  initial,
  sites,
  onCancel,
  onSubmit,
}: {
  // Pass the driver record to edit; pass `null` to render the create form.
  initial: ApiDriver | null;
  // Available sites for the home-site dropdown.
  sites: ApiSite[];
  onCancel: () => void;
  // Caller decides whether to create or update based on `initial`.
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
    initial?.licenseClass ?? "B",
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Site dropdown options - sorted alphabetically by name for usability.
  const sortedSites = useMemo(
    () => [...sites].sort((a, b) => a.name.localeCompare(b.name)),
    [sites],
  );

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

    setIsSubmitting(true);
    try {
      await onSubmit({ createPayload, updatePayload });
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
                {prettyEnum(c)}
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
