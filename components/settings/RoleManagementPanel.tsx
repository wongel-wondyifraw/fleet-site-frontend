"use client";

import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Loader2,
  Plus,
  Save,
  Search,
  ShieldCheck,
  X,
} from "@/lib/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { PermissionPicker } from "@/components/settings/PermissionPicker";
import {
  FieldGrid,
  SettingsField,
  fieldClass,
} from "@/components/settings/SettingsShared";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { listPermissions } from "@/lib/api/permissions";
import { createRole } from "@/lib/api/roles";
import type { ApiRole } from "@/lib/api/types";
import { listRoles } from "@/lib/api/roles";
import { cn } from "@/lib/utils";

type Mode = { kind: "list" } | { kind: "form" };

export function RoleManagementPanel({
  density = "comfortable",
}: {
  density?: "comfortable" | "compact";
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setRoles(await listRoles());
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to load roles.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) => {
      const hay = `${r.name} ${r.key}`.toLowerCase();
      return hay.includes(q);
    });
  }, [roles, searchQuery]);

  if (mode.kind === "form") {
    return (
      <RoleForm
        onCancel={() => setMode({ kind: "list" })}
        onCreated={(role) => {
          setMode({ kind: "list" });
          router.push(`/roles/${role.id}`);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search by name or key"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`${fieldClass} pl-9`}
          />
        </div>
        <Can permission="roles.create">
          <Button
            type="button"
            onClick={() => setMode({ kind: "form" })}
            className="h-10 gap-2 rounded-xl bg-primary px-4 font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint"
          >
            <Plus className="size-4" />
            Add Role
          </Button>
        </Can>
      </div>

      {loadError && <PanelError message={loadError} />}

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
          <ShieldCheck className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="text-sm font-medium text-primary">
            {searchQuery ? "No roles match your search." : "No roles yet."}
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "space-y-2",
            density === "compact" && "space-y-1.5",
          )}
        >
          {filtered.map((role) => (
            <Link
              key={role.id}
              href={`/roles/${role.id}`}
              className={cn(
                "group flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3 transition-colors hover:border-primary/30 hover:bg-slate-50/60",
                density === "compact" && "p-2.5",
              )}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-sm font-semibold text-primary">
                  {role.name}
                  {role.isSystem && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
                      System
                    </span>
                  )}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {role.key}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {role.permissions?.length ?? 0} permission(s)
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function RoleForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (role: ApiRole) => void;
}) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [catalog, setCatalog] = useState<
    Awaited<ReturnType<typeof listPermissions>>
  >({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    listPermissions()
      .then(setCatalog)
      .catch(() => setFormError("Unable to load permission catalog."))
      .finally(() => setIsLoadingCatalog(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const trimmedKey = key.trim().toUpperCase().replace(/\s+/g, "_");
    const trimmedName = name.trim();
    if (!trimmedKey || !trimmedName) {
      setFormError("Key and name are required.");
      return;
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(trimmedKey)) {
      setFormError(
        "Key must be uppercase letters, digits, and underscores (e.g. FLEET_SUPERVISOR).",
      );
      return;
    }
    if (selected.size === 0) {
      setFormError("Select at least one permission.");
      return;
    }

    setIsSubmitting(true);
    try {
      const role = await createRole({
        key: trimmedKey,
        name: trimmedName,
        description: description.trim() || undefined,
        permissionSlugs: [...selected],
      });
      onCreated(role);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Could not create role.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSubmitting}
          className="h-9 gap-2 rounded-xl px-3 text-sm"
        >
          <ArrowLeft className="size-4" />
          Back to list
        </Button>
        <p className="text-sm font-semibold text-primary">New Role</p>
      </div>

      {formError && <PanelError message={formError} />}

      <FieldGrid>
        <SettingsField
          label="Key"
          hint="Uppercase identifier, e.g. FLEET_SUPERVISOR. Cannot be changed later."
        >
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={isSubmitting}
            placeholder="FLEET_SUPERVISOR"
            className={`${fieldClass} font-mono uppercase`}
          />
        </SettingsField>
        <SettingsField label="Display name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            className={fieldClass}
          />
        </SettingsField>
        <SettingsField label="Description">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting}
            className={fieldClass}
          />
        </SettingsField>
      </FieldGrid>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-primary">Permissions</p>
            <p className="text-[11px] text-muted-foreground">
              Choose what this role can access, grouped by area.
            </p>
          </div>
        </div>
        {isLoadingCatalog ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
        ) : (
          <PermissionPicker
            catalog={catalog}
            selected={selected}
            onChange={setSelected}
            disabled={isSubmitting}
          />
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSubmitting}
          className="h-10 gap-2 rounded-xl text-sm"
        >
          <X className="size-4" />
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || isLoadingCatalog}
          className="h-10 gap-2 rounded-xl bg-primary px-5 font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="size-4" />
              Create role
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function PanelError({ message }: { message: string }) {
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
