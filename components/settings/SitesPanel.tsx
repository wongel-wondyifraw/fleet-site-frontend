"use client";

// Admin-only panel for registering and managing sites.
// Captures only the fields the product currently needs:
// name, type, status, address, city, state. Wired to the backend /sites API.
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Users,
  X,
} from "@/lib/icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";

import { Can, useCan } from "@/components/auth/Can";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  FieldGrid,
  SettingsField,
  fieldClass,
} from "@/components/settings/SettingsShared";
import {
  LocationAutocomplete,
  type PickedLocation,
} from "@/components/shared/LocationAutocomplete";
import { ApiError } from "@/lib/api/client";
import {
  createSite,
  deleteSite,
  listSites,
  updateSite,
  type CreateSiteRequest,
} from "@/lib/api/sites";
import { listUsers } from "@/lib/api/users";
import {
  SITE_STATUSES,
  SITE_TYPES,
  formatRoleName,
  type ApiSite,
  type ApiUser,
  type SiteStatus,
  type SiteType,
} from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";
import { staggerStyle } from "@/lib/animations";
import { cn } from "@/lib/utils";

// Re-export so any callers that imported these from SitesPanel keep working.
export { SITE_TYPES, SITE_STATUSES };
export type { SiteType, SiteStatus };

// Status pill colors - one map keeps the look consistent across rows.
const STATUS_PILL: Record<SiteStatus, string> = {
  PLANNING: "bg-blue-50 text-blue-700",
  ACTIVE: "bg-success/15 text-success",
  ON_HOLD: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-slate-100 text-slate-700",
  CLOSED: "bg-slate-200 text-slate-700",
};

// Shape of the controlled form state - mirrors CreateSiteRequest plus status.
type SiteFormState = {
  name: string;
  type: SiteType;
  status: SiteStatus;
  address: string;
  city: string;
  state: string;
};

// Blank form used when adding a new site.
function emptyForm(): SiteFormState {
  return {
    name: "",
    type: "CONSTRUCTION",
    status: "PLANNING",
    address: "",
    city: "",
    state: "",
  };
}

// View modes: list (default) or form (add/edit).
type Mode = { kind: "list" } | { kind: "form"; editing: ApiSite | null };

export function SitesPanel({
  density = "comfortable",
}: {
  density?: "comfortable" | "compact";
}) {
  // refresh() re-fetches /auth/me so the Profile panel's "Assigned sites"
  // line reflects any assignment changes the admin just made here.
  const { user: currentUser, refresh: refreshCurrentUser } = useAuth();
  const [sites, setSites] = useState<ApiSite[]>([]);
  // Users list powers the assignee picker; loaded alongside sites.
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Site queued for delete confirmation. `null` keeps the dialog closed.
  const [pendingDelete, setPendingDelete] = useState<ApiSite | null>(null);

  // Reusable loader so we can refresh after mutations.
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      // Fetch sites + users in parallel; users power the assignee picker.
      // listUsers may 403 for non-admins; we tolerate that and just leave
      // the picker empty rather than failing the whole panel.
      const sitesPromise = listSites();
      const usersPromise = listUsers({ expand: "sites" }).catch((err) => {
        if (err instanceof ApiError && err.isAuth) return [] as ApiUser[];
        throw err;
      });
      const [s, u] = await Promise.all([sitesPromise, usersPromise]);
      setSites(s);
      setUsers(u);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to load sites.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Called by the form on submit; throws on failure so the form can show it.
  async function handleSave(
    payload: CreateSiteRequest,
    editingId: string | null,
  ): Promise<void> {
    if (editingId) {
      await updateSite(editingId, payload);
    } else {
      await createSite(payload);
    }
    setMode({ kind: "list" });
    // Refresh both the panel list AND the auth context so the Profile
    // section's "Assigned sites" picks up the change immediately when the
    // current user's assignment was affected.
    await refreshAfterMutation(payload.userIds, editingId);
  }

  // Runs after the confirm dialog resolves. Mirrors the previous handler
  // minus the inline window.confirm prompt (now driven by ConfirmDialog).
  async function handleConfirmedDelete(target: ApiSite): Promise<void> {
    try {
      await deleteSite(target.id);
      // Deleting a site the current user belonged to also changes their
      // assigned-sites list, so always refresh the auth context here.
      const affectsMe =
        !!currentUser &&
        users.some(
          (u) =>
            u.id === currentUser.id &&
            u.sites?.some((s) => s.id === target.id),
        );
      await refresh();
      if (affectsMe) await refreshCurrentUser();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to delete site.",
      );
    }
  }

  // Refreshes the local sites list, and additionally re-fetches the signed-in
  // user when the mutation could have changed *their* assignments.
  async function refreshAfterMutation(
    nextUserIds: string[] | undefined,
    editingId: string | null,
  ): Promise<void> {
    await refresh();
    if (!currentUser) return;
    const nextSet = new Set(nextUserIds ?? []);
    const meIsAssignedNow = nextSet.has(currentUser.id);
    const previousSite = editingId
      ? sites.find((s) => s.id === editingId)
      : undefined;
    const meWasAssignedBefore =
      !!previousSite &&
      users.some(
        (u) =>
          u.id === currentUser.id &&
          u.sites?.some((s) => s.id === previousSite.id),
      );
    // Reload /auth/me only when the current user's membership flipped (or for
    // a brand-new site that includes them) so we don't spam the endpoint.
    if (meIsAssignedNow || meWasAssignedBefore) {
      await refreshCurrentUser();
    }
  }

  if (mode.kind === "form") {
    return (
      <SiteForm
        initial={mode.editing}
        users={users}
        onCancel={() => setMode({ kind: "list" })}
        onSubmit={(payload) => handleSave(payload, mode.editing?.id ?? null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-primary">{sites.length}</span>{" "}
          {sites.length === 1 ? "site" : "sites"} registered
        </p>
        <Can permission="sites.create">
          <Button
            onClick={() => setMode({ kind: "form", editing: null })}
            className="h-9 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint"
          >
            <Plus className="size-4" />
            Add Site
          </Button>
        </Can>
      </div>

      {loadError && <PanelError message={loadError} />}

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : sites.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2 fs-content-fade">
          {sites.map((site, index) => (
            <div
              key={site.id}
              className="fs-row-in"
              style={staggerStyle(index)}
            >
            <SiteRow
              site={site}
              allUsers={users}
              density={density}
              onEdit={() => setMode({ kind: "form", editing: site })}
              onDelete={() => setPendingDelete(site)}
            />
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete site?"
        description={
          pendingDelete ? (
            <>
              You&apos;re about to permanently delete{" "}
              <span className="font-semibold text-primary">
                {pendingDelete.name}
              </span>
              . Assigned users will be unlinked. This action cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete site"
        destructive
        onConfirm={async () => {
          if (pendingDelete) await handleConfirmedDelete(pendingDelete);
        }}
      />
    </div>
  );
}

function SiteRow({
  site,
  allUsers,
  density,
  onEdit,
  onDelete,
}: {
  site: ApiSite;
  allUsers: ApiUser[];
  density: "comfortable" | "compact";
  onEdit: () => void;
  onDelete: () => void;
}) {
  const canUpdateSite = useCan("sites.update");
  const canDeleteSite = useCan("sites.delete");

  const assignees = allUsers.filter((u) =>
    u.sites?.some((s) => s.id === site.id),
  );
  const assigneeCount = assignees.length;
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
          <p className="truncate text-sm font-semibold text-primary">
            {site.name}
          </p>
          <StatusPill status={site.status} />
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          <MapPin className="mr-1 inline size-3 -translate-y-px" />
          {site.city}
          {site.state ? `, ${site.state}` : ""}
          <span className="mx-1.5 text-slate-300">·</span>
          {prettyType(site.type)}
        </p>
        {assigneeCount > 0 && (
          <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <Users className="size-3" />
            <span className="font-semibold text-primary">{assigneeCount}</span>
            <span>{assigneeCount === 1 ? "assignee" : "assignees"}</span>
            <span className="mx-1 text-slate-300">·</span>
            <span className="truncate">
              {assignees
                .slice(0, 3)
                .map((u) => `${u.firstName} ${u.lastName}`)
                .join(", ")}
              {assigneeCount > 3 ? ` +${assigneeCount - 3}` : ""}
            </span>
          </p>
        )}
      </div>
      {(canUpdateSite || canDeleteSite) && (
        <div className="flex shrink-0 items-center gap-1">
          {canUpdateSite && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8 rounded-lg hover:bg-primary/10 hover:text-primary"
              aria-label={`Edit ${site.name}`}
              onClick={onEdit}
            >
              <Pencil className="size-4" />
            </Button>
          )}
          {canDeleteSite && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Delete ${site.name}`}
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      )}
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

// Shown when no sites exist at all. Intentionally has no "Add" button —
// the toolbar above the list already exposes one, so we avoid duplicating
// the call to action inside the empty card.
function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Building2 className="size-6" />
      </span>
      <div>
        <p className="text-sm font-semibold text-primary">No sites yet</p>
        <p className="text-xs text-muted-foreground">
          Register your first site to start tracking fleet operations.
        </p>
      </div>
    </div>
  );
}

function SiteForm({
  initial,
  users,
  onCancel,
  onSubmit,
}: {
  initial: ApiSite | null;
  users: ApiUser[];
  onCancel: () => void;
  onSubmit: (payload: CreateSiteRequest) => Promise<void>;
}) {
  const isNew = initial === null;
  const [form, setForm] = useState<SiteFormState>(() =>
    initial
      ? {
          name: initial.name,
          type: initial.type,
          status: initial.status,
          address: initial.address,
          city: initial.city,
          state: initial.state,
        }
      : emptyForm(),
  );
  // Free-text query bound to the LocationIQ search box. Seeded from the
  // existing site's address fields on edit so the input doesn't look empty
  // when an admin opens an already-saved site.
  const [locationQuery, setLocationQuery] = useState<string>(() =>
    initial
      ? [initial.address, initial.city, initial.state]
          .filter(Boolean)
          .join(", ")
      : "",
  );
  // Selected assignee IDs - seeded from the site's existing users on edit.
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(() =>
    initial?.users?.map((u) => u.id) ?? [],
  );
  const [userSearch, setUserSearch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function update<K extends keyof SiteFormState>(
    key: K,
    value: SiteFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Picking a LocationIQ suggestion auto-fills the structured fields below.
  // We only overwrite a manual entry when the suggestion actually has a
  // value for that piece, so users can refine after selecting.
  function applyPickedLocation(picked: PickedLocation) {
    setForm((prev) => ({
      ...prev,
      address: picked.address || prev.address,
      city: picked.city || prev.city,
      state: picked.state || prev.state,
    }));
  }

  function toggleUser(id: string) {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const trimmedName = form.name.trim();
    const trimmedAddress = form.address.trim();
    const trimmedCity = form.city.trim();
    const trimmedState = form.state.trim();

    if (!trimmedName || !trimmedAddress || !trimmedCity || !trimmedState) {
      setFormError("Name, address, city, and state are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: trimmedName,
        type: form.type,
        status: form.status,
        address: trimmedAddress,
        city: trimmedCity,
        state: trimmedState,
        // Always send userIds so PATCH replaces the assignment set,
        // including clearing it (empty array).
        userIds: selectedUserIds,
      });
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Could not save site.",
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
          aria-label="Back to sites list"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <p className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
            {isNew ? "New site" : `Editing ${initial?.name}`}
          </p>
          <h3 className="text-base font-semibold text-primary">
            {isNew ? "Register a site" : initial?.name}
          </h3>
        </div>
      </div>

      {formError && <PanelError message={formError} />}

      <FormCard
        title="Site details"
        description="Identify the site and classify it for reporting."
        icon={Building2}
      >
        <FieldGrid>
          <SettingsField label="Site Name">
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              disabled={isSubmitting}
              placeholder="North Creek Bridge"
              className={fieldClass}
            />
          </SettingsField>
          <SettingsField label="Type">
            <Select
              value={form.type}
              onValueChange={(v) => update("type", v as SiteType)}
              disabled={isSubmitting}
              searchable={false}
              options={SITE_TYPES.map((t) => ({
                value: t,
                label: prettyType(t),
              }))}
            />
          </SettingsField>
          <SettingsField label="Status">
            <Select
              value={form.status}
              onValueChange={(v) => update("status", v as SiteStatus)}
              disabled={isSubmitting}
              searchable={false}
              options={SITE_STATUSES.map((s) => ({
                value: s,
                label: s.replace("_", " "),
              }))}
            />
          </SettingsField>
        </FieldGrid>
      </FormCard>

      <FormCard
        title="Location"
        description="Search for a place to auto-fill, or enter the address manually below."
        icon={MapPin}
      >
        <div className="space-y-4">
          <SettingsField
            label="Search Location"
            hint="Powered by LocationIQ. Pick a suggestion to fill the fields below."
          >
            <LocationAutocomplete
              value={locationQuery}
              onChange={setLocationQuery}
              onSelect={applyPickedLocation}
              disabled={isSubmitting}
            />
          </SettingsField>

          <FieldGrid>
            <SettingsField label="Address">
              <input
                type="text"
                required
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
                disabled={isSubmitting}
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
                disabled={isSubmitting}
                placeholder="Portland"
                className={fieldClass}
              />
            </SettingsField>
            <SettingsField label="State">
              <input
                type="text"
                required
                value={form.state}
                onChange={(e) => update("state", e.target.value)}
                disabled={isSubmitting}
                placeholder="OR"
                className={fieldClass}
              />
            </SettingsField>
          </FieldGrid>
        </div>
      </FormCard>

      <FormCard
        title="Assignees"
        description="Pick the team members responsible for this site."
        icon={Users}
      >
        <AssigneePicker
          users={users}
          selectedIds={selectedUserIds}
          search={userSearch}
          onSearchChange={setUserSearch}
          onToggle={toggleUser}
          onClear={() => setSelectedUserIds([])}
          disabled={isSubmitting}
        />
      </FormCard>

      {/* Sticky action footer at the bottom of the form. Cancel sits on the
          left (secondary) and the primary action sits on the right where the
          eye expects to confirm. */}
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
              {isNew ? "Create Site" : "Save Changes"}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

// Assignee picker split into two sections:
//   1. "Assigned" - cards for the currently selected users, with a remove button
//      and a clear empty state when nothing is assigned yet.
//   2. "Available" - search box + filtered list of unassigned users, each with
//      an explicit "Assign" button so adding someone is an unambiguous action.
function AssigneePicker({
  users,
  selectedIds,
  search,
  onSearchChange,
  onToggle,
  onClear,
  disabled,
}: {
  users: ApiUser[];
  selectedIds: string[];
  search: string;
  onSearchChange: (value: string) => void;
  onToggle: (id: string) => void;
  onClear: () => void;
  disabled: boolean;
}) {
  // O(1) selection lookup used by both sections.
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Resolve selected IDs back to full user objects for the "Assigned" cards.
  // Preserve the order users were added in for a stable visual.
  const assignedUsers = useMemo(() => {
    const byId = new Map(users.map((u) => [u.id, u]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((u): u is ApiUser => Boolean(u));
  }, [users, selectedIds]);

  // Available pool = users not currently assigned, filtered by the search query.
  const availableUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => !selectedSet.has(u.id))
      .filter((u) => {
        if (!q) return true;
        const hay =
          `${u.firstName} ${u.lastName} ${u.email} ${formatRoleName(u.role)}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(
          `${b.firstName} ${b.lastName}`,
        ),
      );
  }, [users, search, selectedSet]);

  return (
    <div className="space-y-5">
      {/* ---- Assigned section -------------------------------------------- */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
            Assigned ({assignedUsers.length})
          </p>
          {assignedUsers.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClear}
              disabled={disabled}
              className="h-7 px-2 text-xs"
            >
              Clear all
            </Button>
          )}
        </div>

        {assignedUsers.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Users className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-primary">
                No assignees yet
              </p>
              <p className="text-xs text-muted-foreground">
                Search below and use the Assign button to add team members.
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {assignedUsers.map((u) => (
              <li
                key={u.id}
                className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-white">
                  {u.firstName[0]}
                  {u.lastName[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-primary">
                    {u.firstName} {u.lastName}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {u.email}
                    <span className="mx-1.5 text-slate-300">·</span>
                    {formatRoleName(u.role)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onToggle(u.id)}
                  disabled={disabled}
                  aria-label={`Remove ${u.firstName} ${u.lastName}`}
                  className="h-8 gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="size-3.5" />
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- Available section ------------------------------------------- */}
      <div className="space-y-2">
        <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
          Available users
        </p>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            disabled={disabled || users.length === 0}
            placeholder="Search by name, email, or role"
            className={`${fieldClass} pl-9`}
            aria-label="Search available users"
          />
        </div>

        {users.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-center text-xs text-muted-foreground">
            No users available. Create users first to assign them here.
          </div>
        ) : availableUsers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-center text-xs text-muted-foreground">
            {search.trim()
              ? `No users match "${search}".`
              : "All users are already assigned to this site."}
          </div>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-slate-100 bg-white p-2">
            {availableUsers.map((u) => (
              <li
                key={u.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-transparent px-3 py-2 hover:border-slate-200 hover:bg-slate-50",
                  !u.isActive && "opacity-60",
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                  {u.firstName[0]}
                  {u.lastName[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold text-primary">
                    <span className="truncate">
                      {u.firstName} {u.lastName}
                    </span>
                    {!u.isActive && (
                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
                        Inactive
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {u.email}
                    <span className="mx-1.5 text-slate-300">·</span>
                    {formatRoleName(u.role)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onToggle(u.id)}
                  disabled={disabled || !u.isActive}
                  className="h-8 gap-1 rounded-lg bg-primary px-3 text-xs font-semibold shadow-sm hover:bg-surface-tint"
                >
                  <Plus className="size-3.5" />
                  Assign
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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

// Inline error banner matching the look used by UserManagementPanel.
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

function prettyType(t: SiteType): string {
  return t.charAt(0) + t.slice(1).toLowerCase();
}
