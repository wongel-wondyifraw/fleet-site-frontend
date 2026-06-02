"use client";

import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  Pencil,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "@/lib/icons";
import Link from "next/link";
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
import { useCan } from "@/components/auth/Can";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError } from "@/lib/api/client";
import { listPermissions } from "@/lib/api/permissions";
import { deleteRole, getRole, updateRole } from "@/lib/api/roles";
import type { ApiPermission, ApiRole } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const ADMIN_KEY = "ADMIN";

export function RoleDetail({ roleId }: { roleId: string }) {
  const [role, setRole] = useState<ApiRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const canUpdateRole = useCan("roles.update");
  const canDeleteRole = useCan("roles.delete");

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setRole(await getRole(roleId));
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to load role.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [roleId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const permissionsByCategory = useMemo(() => {
    if (!role?.permissions) return {};
    const grouped: Record<string, ApiPermission[]> = {};
    for (const p of role.permissions) {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    }
    return grouped;
  }, [role]);

  async function handleDelete() {
    if (!role || role.isSystem) return;
    setIsMutating(true);
    try {
      await deleteRole(role.id);
      window.location.href = "/settings?section=roles";
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to delete role.",
      );
    } finally {
      setIsMutating(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-10">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError || !role) {
    return (
      <div className="space-y-3">
        <BackLink />
        <PanelError message={loadError ?? "Role not found."} />
      </div>
    );
  }

  if (mode === "edit") {
    return (
      <div className="space-y-4">
        <BackLink />
        <RoleEditForm
          initial={role}
          onCancel={() => setMode("view")}
          onSaved={async () => {
            setMode("view");
            await refresh();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <BackLink />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
              Role
            </p>
            <h2 className="text-xl font-semibold text-primary">{role.name}</h2>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {role.key}
            </p>
            {role.description ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {role.description}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {role.isSystem && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
                  System
                </span>
              )}
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary uppercase">
                {role.permissions.length} permissions
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canUpdateRole && (
              <Button
                type="button"
                onClick={() => setMode("edit")}
                disabled={isMutating}
                className="h-10 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold"
              >
                <Pencil className="size-4" />
                Edit
              </Button>
            )}
            {canDeleteRole && !role.isSystem && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={isMutating}
                className="h-10 gap-2 rounded-xl border-destructive/30 text-destructive"
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          <p className="text-sm font-semibold text-primary">Permissions</p>
        </div>
        {Object.keys(permissionsByCategory).length === 0 ? (
          <p className="text-xs text-muted-foreground">No permissions assigned.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(permissionsByCategory).map(([category, perms]) => (
              <div key={category}>
                <p className="mb-1 text-xs font-semibold text-primary">
                  {category}
                </p>
                <ul className="space-y-1">
                  {perms.map((p) => (
                    <li
                      key={p.slug}
                      className="flex flex-col rounded-lg border border-slate-100 bg-white px-3 py-2"
                    >
                      <span className="text-sm font-medium text-primary">
                        {p.name}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {p.slug}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete role?"
        description={
          <>
            Users assigned to <span className="font-semibold">{role.name}</span>{" "}
            must be reassigned first. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}

function RoleEditForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: ApiRole;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [catalog, setCatalog] = useState<
    Awaited<ReturnType<typeof listPermissions>>
  >({});
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initial.permissions.map((p) => p.slug)),
  );
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const lockedAll = initial.key === ADMIN_KEY;

  useEffect(() => {
    listPermissions()
      .then((c) => {
        setCatalog(c);
        if (lockedAll) {
          const all = Object.values(c).flat().map((p) => p.slug);
          setSelected(new Set(all));
        }
      })
      .catch(() => setFormError("Unable to load permission catalog."))
      .finally(() => setIsLoadingCatalog(false));
  }, [lockedAll]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!lockedAll && selected.size === 0) {
      setFormError("Select at least one permission.");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateRole(initial.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        permissionSlugs: lockedAll ? undefined : [...selected],
      });
      await onSaved();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Could not save role.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      noValidate
    >
      {formError && (
        <div className="mb-4">
          <PanelError message={formError} />
        </div>
      )}

      <FieldGrid>
        <SettingsField label="Key">
          <input
            type="text"
            value={initial.key}
            disabled
            className={cn(fieldClass, "font-mono opacity-60")}
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

      <div className="mt-5">
        <SettingsField label="Permissions">
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
              lockedAll={lockedAll}
            />
          )}
        </SettingsField>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
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
          className="h-10 gap-2 rounded-xl bg-primary px-5 font-semibold"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="size-4" />
              Save changes
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function BackLink() {
  return (
    <Link
      href="/settings?section=roles"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"
    >
      <ArrowLeft className="size-3.5" />
      Back to roles
    </Link>
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
