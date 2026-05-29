"use client";

// Admin-only panel for managing reusable Custom Trip Routes.
// A Custom Trip Route is a saved start -> end pair (Name + City +
// State for each end) with an admin-entered driving distance. Once
// created, both ends become selectable presets on the Trip Management
// new-trip form, badged "Custom".
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  Route,
  Save,
  Trash2,
  X,
} from "@/lib/icons";
import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  SettingsField,
  fieldClass,
} from "@/components/settings/SettingsShared";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError } from "@/lib/api/client";
import {
  createCustomTripRoute,
  deleteCustomTripRoute,
  listCustomTripRoutes,
  updateCustomTripRoute,
  type CreateCustomTripRouteRequest,
} from "@/lib/api/customTripRoutes";
import type { ApiCustomTripRoute } from "@/lib/api/types";
import { cn } from "@/lib/utils";

// Shape of the controlled form state. City / state are intentionally
// absent — the settings form only collects the location Name and the
// distance; city / state are persisted silently from elsewhere (e.g.
// the trip-creation autocomplete) but never exposed here.
type RouteFormState = {
  startName: string;
  endName: string;
  distanceKm: string;
};

function emptyForm(): RouteFormState {
  return {
    startName: "",
    endName: "",
    distanceKm: "",
  };
}

type Mode = { kind: "list" } | { kind: "form"; editing: ApiCustomTripRoute | null };

export function CustomTripRoutesPanel({
  density = "comfortable",
}: {
  density?: "comfortable" | "compact";
}) {
  const [routes, setRoutes] = useState<ApiCustomTripRoute[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Route queued for delete confirmation. `null` keeps the dialog closed.
  const [pendingDelete, setPendingDelete] = useState<ApiCustomTripRoute | null>(
    null,
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const list = await listCustomTripRoutes();
      setRoutes(list);
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? err.message
          : "Unable to load custom trip routes.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSave(
    payload: CreateCustomTripRouteRequest,
    editingId: string | null,
  ): Promise<void> {
    if (editingId) {
      await updateCustomTripRoute(editingId, payload);
    } else {
      await createCustomTripRoute(payload);
    }
    setMode({ kind: "list" });
    await refresh();
  }

  async function handleConfirmedDelete(
    target: ApiCustomTripRoute,
  ): Promise<void> {
    try {
      await deleteCustomTripRoute(target.id);
      await refresh();
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? err.message
          : "Unable to delete custom trip route.",
      );
    }
  }

  if (mode.kind === "form") {
    return (
      <RouteForm
        initial={mode.editing}
        onCancel={() => setMode({ kind: "list" })}
        onSubmit={(payload) => handleSave(payload, mode.editing?.id ?? null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-primary">{routes.length}</span>{" "}
          {routes.length === 1 ? "custom route" : "custom routes"} saved
        </p>
        <Button
          onClick={() => setMode({ kind: "form", editing: null })}
          className="h-9 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint"
        >
          <Plus className="size-4" />
          Add Route
        </Button>
      </div>

      {loadError && <PanelError message={loadError} />}

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : routes.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {routes.map((route) => (
            <RouteRow
              key={route.id}
              route={route}
              density={density}
              onEdit={() => setMode({ kind: "form", editing: route })}
              onDelete={() => setPendingDelete(route)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete custom route?"
        description={
          pendingDelete ? (
            <>
              You&apos;re about to permanently delete the route{" "}
              <span className="font-semibold text-primary">
                {pendingDelete.startName} → {pendingDelete.endName}
              </span>
              . It will no longer appear as a Custom preset on the trip form.
            </>
          ) : null
        }
        confirmLabel="Delete route"
        destructive
        onConfirm={async () => {
          if (pendingDelete) await handleConfirmedDelete(pendingDelete);
        }}
      />
    </div>
  );
}

function RouteRow({
  route,
  density,
  onEdit,
  onDelete,
}: {
  route: ApiCustomTripRoute;
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
        <Route className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-primary">
            {route.startName}
          </p>
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <p className="truncate text-sm font-semibold text-primary">
            {route.endName}
          </p>
          <CustomTag />
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          <MapPin className="mr-1 inline size-3 -translate-y-px" />
          Saved route
          <span className="mx-1.5 text-slate-300">·</span>
          <span className="font-semibold text-primary">
            {formatDistance(route.distanceKm)}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-8 rounded-lg hover:bg-primary/10 hover:text-primary"
          aria-label={`Edit ${route.startName} to ${route.endName}`}
          onClick={onEdit}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-8 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Delete ${route.startName} to ${route.endName}`}
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// Blue "Custom" badge — surfaced both in the management list and on the
// trip-creation pickers so the source of the suggestion is always clear.
export function CustomTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-blue-700 uppercase",
        className,
      )}
    >
      Custom
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Route className="size-6" />
      </span>
      <div>
        <p className="text-sm font-semibold text-primary">
          No custom routes yet
        </p>
        <p className="text-xs text-muted-foreground">
          Save a start &amp; end pair so the trip-creation form can offer it as
          a Custom preset.
        </p>
      </div>
    </div>
  );
}

function RouteForm({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: ApiCustomTripRoute | null;
  onCancel: () => void;
  onSubmit: (payload: CreateCustomTripRouteRequest) => Promise<void>;
}) {
  const isNew = initial === null;
  const [form, setForm] = useState<RouteFormState>(() =>
    initial
      ? {
          startName: initial.startName,
          endName: initial.endName,
          distanceKm: String(initial.distanceKm ?? ""),
        }
      : emptyForm(),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function update<K extends keyof RouteFormState>(
    key: K,
    value: RouteFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const startName = form.startName.trim();
    const endName = form.endName.trim();

    if (!startName || !endName) {
      setFormError(
        "Both the starting location name and the ending destination are required.",
      );
      return;
    }

    const distance = Number(form.distanceKm);
    if (!Number.isFinite(distance) || distance <= 0) {
      setFormError("Enter a valid distance greater than zero.");
      return;
    }

    setIsSubmitting(true);
    try {
      // City / state are persisted silently — we forward whatever the
      // existing record already carried (so an edit doesn't wipe them)
      // and leave them undefined on create. The trip-creation form is
      // what eventually populates them from a LocationIQ pick.
      await onSubmit({
        startName,
        startCity: initial?.startCity ?? undefined,
        startState: initial?.startState ?? undefined,
        endName,
        endCity: initial?.endCity ?? undefined,
        endState: initial?.endState ?? undefined,
        distanceKm: distance,
      });
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Could not save custom route.",
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
          aria-label="Back to custom routes list"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <p className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
            {isNew
              ? "New custom route"
              : `Editing ${initial?.startName} → ${initial?.endName}`}
          </p>
          <h3 className="text-base font-semibold text-primary">
            {isNew ? "Create a custom route" : "Update custom route"}
          </h3>
        </div>
      </div>

      {formError && <PanelError message={formError} />}

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <FormCard
          title="Starting location"
          description="Where every trip on this route begins."
          icon={MapPin}
        >
          <SettingsField label="Name">
            <input
              type="text"
              required
              value={form.startName}
              onChange={(e) => update("startName", e.target.value)}
              disabled={isSubmitting}
              placeholder="North Depot"
              className={fieldClass}
            />
          </SettingsField>
        </FormCard>

        <FormCard
          title="Ending destination"
          description="Where every trip on this route ends."
          icon={Navigation}
        >
          <SettingsField label="Name">
            <input
              type="text"
              required
              value={form.endName}
              onChange={(e) => update("endName", e.target.value)}
              disabled={isSubmitting}
              placeholder="South Quarry"
              className={fieldClass}
            />
          </SettingsField>
        </FormCard>
      </div>

      <FormCard
        title="Distance"
        description="The driving distance between the two points."
        icon={Route}
      >
        <SettingsField
          label="Distance (km)"
          hint="The trip form will pre-fill this distance when both ends of this route are selected."
        >
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            required
            value={form.distanceKm}
            onChange={(e) => update("distanceKm", e.target.value)}
            disabled={isSubmitting}
            placeholder="12.5"
            className={fieldClass}
          />
        </SettingsField>
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
              {isNew ? "Create Route" : "Save Changes"}
            </>
          )}
        </Button>
      </div>
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

// Renders the distance as a tidy `12.5 km` string. Drops trailing
// `.0` so whole numbers don't read as decimals in the list.
export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return "—";
  const rounded = Math.round(km * 10) / 10;
  const display = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${display} km`;
}
