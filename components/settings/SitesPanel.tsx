"use client";

import {
  ArrowLeft,
  Building2,
  Hash,
  MapPin,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  FieldGrid,
  SettingsField,
  fieldClass,
} from "@/components/settings/SettingsShared";
import { cn } from "@/lib/utils";

export const SITE_TYPES = [
  "CONSTRUCTION",
  "MINING",
  "INFRASTRUCTURE",
  "DEMOLITION",
  "QUARRY",
  "DEPOT",
  "OTHER",
] as const;

export const SITE_STATUSES = [
  "PLANNING",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CLOSED",
] as const;

export type SiteType = (typeof SITE_TYPES)[number];
export type SiteStatus = (typeof SITE_STATUSES)[number];

export type Site = {
  id: string;
  code: string;
  name: string;
  type: SiteType;
  status: SiteStatus;
  address: string;
  city: string;
  region: string;
  startDate: string;
  endDate: string;
  managerEmployeeId: string;
};

const INITIAL_SITES: Site[] = [
  {
    id: "1",
    code: "NCB-01",
    name: "North Creek Bridge",
    type: "INFRASTRUCTURE",
    status: "ACTIVE",
    address: "Hwy 26, Mile 14",
    city: "Portland",
    region: "OR",
    startDate: "2025-03-01",
    endDate: "",
    managerEmployeeId: "EMP-00482",
  },
  {
    id: "2",
    code: "EQ-02",
    name: "Eastside Quarry",
    type: "QUARRY",
    status: "ACTIVE",
    address: "Mountain Rd 5",
    city: "Bend",
    region: "OR",
    startDate: "2024-09-15",
    endDate: "",
    managerEmployeeId: "EMP-00120",
  },
  {
    id: "3",
    code: "RP-03",
    name: "Riverbend Plant",
    type: "CONSTRUCTION",
    status: "PLANNING",
    address: "Riverbend Ave 200",
    city: "Eugene",
    region: "OR",
    startDate: "2026-08-01",
    endDate: "",
    managerEmployeeId: "EMP-00318",
  },
  {
    id: "4",
    code: "H14-04",
    name: "Highway 14 Expansion",
    type: "INFRASTRUCTURE",
    status: "ON_HOLD",
    address: "Hwy 14 corridor",
    city: "Salem",
    region: "OR",
    startDate: "2025-01-10",
    endDate: "",
    managerEmployeeId: "EMP-00210",
  },
];

const STATUS_PILL: Record<SiteStatus, string> = {
  PLANNING: "bg-blue-50 text-blue-700",
  ACTIVE: "bg-success/15 text-success",
  ON_HOLD: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-slate-100 text-slate-700",
  CLOSED: "bg-slate-200 text-slate-700",
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `site-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptySite(): Site {
  return {
    id: "",
    code: "",
    name: "",
    type: "CONSTRUCTION",
    status: "PLANNING",
    address: "",
    city: "",
    region: "",
    startDate: "",
    endDate: "",
    managerEmployeeId: "",
  };
}

type Mode = { kind: "list" } | { kind: "form"; editingId: string | null };

export function SitesPanel({
  density = "comfortable",
}: {
  density?: "comfortable" | "compact";
}) {
  const [sites, setSites] = useState<Site[]>(INITIAL_SITES);
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  const editingSite =
    mode.kind === "form" && mode.editingId
      ? sites.find((s) => s.id === mode.editingId)
      : undefined;

  function startAdd() {
    setMode({ kind: "form", editingId: null });
  }

  function startEdit(id: string) {
    setMode({ kind: "form", editingId: id });
  }

  function cancel() {
    setMode({ kind: "list" });
  }

  function save(data: Site) {
    setSites((prev) => {
      if (mode.kind === "form" && mode.editingId) {
        return prev.map((s) =>
          s.id === mode.editingId ? { ...data, id: mode.editingId } : s,
        );
      }
      return [...prev, { ...data, id: newId() }];
    });
    setMode({ kind: "list" });
  }

  function remove(id: string) {
    setSites((prev) => prev.filter((s) => s.id !== id));
  }

  if (mode.kind === "form") {
    return (
      <SiteForm
        initial={editingSite ?? emptySite()}
        isNew={!editingSite}
        onSave={save}
        onCancel={cancel}
      />
    );
  }

  return (
    <SiteList
      sites={sites}
      density={density}
      onAdd={startAdd}
      onEdit={startEdit}
      onDelete={remove}
    />
  );
}

function SiteList({
  sites,
  density,
  onAdd,
  onEdit,
  onDelete,
}: {
  sites: Site[];
  density: "comfortable" | "compact";
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-primary">{sites.length}</span>{" "}
          {sites.length === 1 ? "site" : "sites"} configured
        </p>
        <Button
          onClick={onAdd}
          className="h-9 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint"
        >
          <Plus className="size-4" />
          Add Site
        </Button>
      </div>

      {sites.length === 0 ? (
        <EmptyState onAdd={onAdd} />
      ) : (
        <div className="space-y-2">
          {sites.map((site) => (
            <SiteRow
              key={site.id}
              site={site}
              density={density}
              onEdit={() => onEdit(site.id)}
              onDelete={() => onDelete(site.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SiteRow({
  site,
  density,
  onEdit,
  onDelete,
}: {
  site: Site;
  density: "comfortable" | "compact";
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 transition-colors hover:bg-slate-50",
        density === "compact" ? "p-3" : "p-4",
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Building2 className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {site.code}
          </span>
          <span className="text-slate-300">·</span>
          <p className="truncate text-sm font-semibold text-primary">
            {site.name}
          </p>
          <StatusPill status={site.status} />
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          <MapPin className="mr-1 inline size-3 -translate-y-px" />
          {site.city}
          {site.region ? `, ${site.region}` : ""}
          <span className="mx-1.5 text-slate-300">·</span>
          {prettyType(site.type)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-8 rounded-lg hover:bg-primary/10 hover:text-primary"
          aria-label={`Edit ${site.name}`}
          onClick={onEdit}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-8 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Delete ${site.name}`}
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: SiteStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
        STATUS_PILL[status],
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Building2 className="size-6" />
      </span>
      <div>
        <p className="text-sm font-semibold text-primary">No sites yet</p>
        <p className="text-xs text-muted-foreground">
          Add your first site to start tracking fleet operations.
        </p>
      </div>
      <Button
        onClick={onAdd}
        className="h-9 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold"
      >
        <Plus className="size-4" />
        Add Site
      </Button>
    </div>
  );
}

function SiteForm({
  initial,
  isNew,
  onSave,
  onCancel,
}: {
  initial: Site;
  isNew: boolean;
  onSave: (data: Site) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Site>(initial);

  function update<K extends keyof Site>(key: K, value: Site[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim() || !form.city.trim()) return;
    onSave({
      ...form,
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      city: form.city.trim(),
    });
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8 rounded-lg hover:bg-primary/10 hover:text-primary"
            aria-label="Back to sites list"
            onClick={onCancel}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <p className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
              {isNew ? "New site" : `Editing ${initial.code}`}
            </p>
            <h3 className="text-base font-semibold text-primary">
              {isNew ? "Add a site" : initial.name}
            </h3>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="h-9 gap-2 rounded-xl border-slate-200 bg-white px-4 text-sm"
          >
            <X className="size-4" />
            Cancel
          </Button>
          <Button
            type="submit"
            className="h-9 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint"
          >
            <Save className="size-4" />
            {isNew ? "Create Site" : "Save Changes"}
          </Button>
        </div>
      </div>

      <FormCard
        title="Identifiers"
        description="Unique code and human-friendly site name."
        icon={Hash}
      >
        <FieldGrid>
          <SettingsField label="Site Code" hint="Uppercase letters, digits, or hyphens">
            <input
              type="text"
              required
              value={form.code}
              onChange={(e) => update("code", e.target.value.toUpperCase())}
              placeholder="NCB-01"
              className={cn(fieldClass, "font-mono tracking-wide uppercase")}
            />
          </SettingsField>
          <SettingsField label="Site Name">
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="North Creek Bridge"
              className={fieldClass}
            />
          </SettingsField>
          <SettingsField label="Type">
            <select
              className={fieldClass}
              value={form.type}
              onChange={(e) => update("type", e.target.value as SiteType)}
            >
              {SITE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {prettyType(t)}
                </option>
              ))}
            </select>
          </SettingsField>
          <SettingsField label="Status">
            <select
              className={fieldClass}
              value={form.status}
              onChange={(e) => update("status", e.target.value as SiteStatus)}
            >
              {SITE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </SettingsField>
        </FieldGrid>
      </FormCard>

      <FormCard
        title="Location"
        description="Where this site is operating from."
        icon={MapPin}
      >
        <FieldGrid>
          <SettingsField label="Address">
            <input
              type="text"
              required
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="Hwy 26, Mile 14"
              className={fieldClass}
            />
          </SettingsField>
          <SettingsField label="City">
            <input
              type="text"
              required
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              placeholder="Portland"
              className={fieldClass}
            />
          </SettingsField>
          <SettingsField label="Region / State">
            <input
              type="text"
              value={form.region}
              onChange={(e) => update("region", e.target.value)}
              placeholder="OR"
              className={fieldClass}
            />
          </SettingsField>
          <SettingsField label="Manager Employee ID">
            <input
              type="text"
              value={form.managerEmployeeId}
              onChange={(e) => update("managerEmployeeId", e.target.value)}
              placeholder="EMP-00482"
              className={fieldClass}
            />
          </SettingsField>
        </FieldGrid>
      </FormCard>

      <FormCard
        title="Schedule"
        description="Optional start and end dates for the project."
        icon={Building2}
      >
        <FieldGrid>
          <SettingsField label="Start Date">
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => update("startDate", e.target.value)}
              className={fieldClass}
            />
          </SettingsField>
          <SettingsField label="End Date">
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => update("endDate", e.target.value)}
              className={fieldClass}
            />
          </SettingsField>
        </FieldGrid>
      </FormCard>
    </form>
  );
}

function FormCard({
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

function prettyType(t: SiteType): string {
  return t.charAt(0) + t.slice(1).toLowerCase();
}
