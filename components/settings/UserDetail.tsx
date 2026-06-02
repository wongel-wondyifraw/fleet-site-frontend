"use client";

// Single-user detail page rendered at /users/[id]. Mirrors the
// shape of VehicleDetail: load -> read-only view by default -> flip into an
// inline edit form. Admin-only; the parent route is gated by the auth guard
// on /api/users/* and by the settings sub-section's adminOnly flag.
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Calendar,
  Eye,
  EyeOff,
  IdCard,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  UserCog,
  X,
} from "@/lib/icons";
import Link from "next/link";
import {
  useCallback,
  useEffect,
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
import { useCan } from "@/components/auth/Can";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiError } from "@/lib/api/client";
import { listSites, type ListedSite } from "@/lib/api/sites";
import {
  formatRoleName,
  getRolePillClass,
  type ApiRole,
  type ApiUser,
} from "@/lib/api/types";
import { listRoles } from "@/lib/api/roles";
import {
  assignUserSites,
  deactivateUser,
  getUser,
  reactivateUser,
  resetUserPassword,
  setUserRole,
  updateUser,
} from "@/lib/api/users";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate, formatDateTime } from "@/lib/time/format";
import { useTimeSettings } from "@/lib/time/TimeSettingsContext";
import { cn } from "@/lib/utils";

// Role pill palette - duplicated from UserManagementPanel to keep this page
// renderable on its own without cross-importing internal helpers.
export function UserDetail({ userId }: { userId: string }) {
  // The currently signed-in user; used to gate destructive actions against
  // self (admins can't deactivate their own account from this UI).
  const { user: currentUser } = useAuth();
  const { settings: timeSettings } = useTimeSettings();
  const canUpdateUser = useCan("users.update");

  const [user, setUser] = useState<ApiUser | null>(null);
  const [sites, setSites] = useState<ListedSite[]>([]);
  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  // Tracks any single-shot mutation (deactivate, reactivate) so we can
  // disable buttons while the request is in flight.
  const [isMutating, setIsMutating] = useState(false);
  // Controls the two confirmation dialogs hanging off this page.
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [confirmReactivateOpen, setConfirmReactivateOpen] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [u, s, r] = await Promise.all([
        getUser(userId),
        listSites().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ListedSite[];
          throw err;
        }),
        listRoles().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiRole[];
          throw err;
        }),
      ]);
      setUser(u);
      setSites(s);
      setRoles(r);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to load user.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isSelf = !!currentUser && !!user && currentUser.id === user.id;

  // Save handler driven by the embedded UserEditForm. Issues the minimal set
  // of requests needed to reflect the diff: profile fields, role (if changed),
  // and site assignments (always sent so users can be cleared to none).
  async function handleEditSave(payload: UserEditPayload): Promise<void> {
    if (!user) return;
    // 1. Profile fields (name + email + isActive flip when needed).
    const profilePatch: Parameters<typeof updateUser>[1] = {};
    if (payload.firstName !== user.firstName)
      profilePatch.firstName = payload.firstName;
    if (payload.lastName !== user.lastName)
      profilePatch.lastName = payload.lastName;
    if (payload.email !== user.email) profilePatch.email = payload.email;
    if (Object.keys(profilePatch).length > 0) {
      await updateUser(user.id, profilePatch);
    }
    // 2. Role - dedicated endpoint for auditability on the backend.
    if (payload.roleId !== user.roleId) {
      await setUserRole(user.id, payload.roleId);
    }
    // 3. Sites - PUT replaces the full set; we always send so clearing works.
    const prevSiteIds = (user.sites ?? []).map((s) => s.id).sort();
    const nextSiteIds = [...payload.siteIds].sort();
    const sitesChanged =
      prevSiteIds.length !== nextSiteIds.length ||
      prevSiteIds.some((id, i) => id !== nextSiteIds[i]);
    if (sitesChanged) {
      await assignUserSites(user.id, payload.siteIds);
    }
    setMode("view");
    await refresh();
  }

  async function handleConfirmedDeactivate(): Promise<void> {
    if (!user || isSelf) return;
    setIsMutating(true);
    try {
      await deactivateUser(user.id);
      await refresh();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to deactivate user.",
      );
    } finally {
      setIsMutating(false);
    }
  }

  async function handleConfirmedReactivate(): Promise<void> {
    if (!user) return;
    setIsMutating(true);
    try {
      await reactivateUser(user.id);
      await refresh();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to reactivate user.",
      );
    } finally {
      setIsMutating(false);
    }
  }

  // ---- Loading / error states --------------------------------------------
  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-10">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError || !user) {
    return (
      <div className="space-y-3">
        <BackLink />
        <PanelError message={loadError ?? "User not found."} />
      </div>
    );
  }

  // ---- Edit mode ----------------------------------------------------------
  if (mode === "edit") {
    return (
      <div className="space-y-4">
        <BackLink />
        <UserEditForm
          initial={user}
          sites={sites}
          roles={roles}
          onCancel={() => setMode("view")}
          onSubmit={handleEditSave}
        />
      </div>
    );
  }

  // ---- View mode ----------------------------------------------------------
  return (
    <div className="space-y-5">
      <BackLink />

      {/* Header card: identity + primary actions. */}
      <div
        className={cn(
          "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm",
          !user.isActive && "opacity-90",
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-base font-semibold text-primary">
              {user.firstName[0]}
              {user.lastName[0]}
            </span>
            <div className="min-w-0">
              <p className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
                Teammate
              </p>
              <h2 className="truncate text-xl font-semibold text-primary">
                {user.firstName} {user.lastName}
                {isSelf ? (
                  <span className="ml-2 align-middle text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                    (You)
                  </span>
                ) : null}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                    getRolePillClass(user.role.key),
                  )}
                >
                  {formatRoleName(user.role)}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                    user.isActive
                      ? "bg-success/15 text-success"
                      : "bg-slate-200 text-muted-foreground",
                  )}
                >
                  {user.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="mt-2 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                <Mail className="size-3.5" />
                {user.email}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canUpdateUser && (
              <Button
                type="button"
                onClick={() => setMode("edit")}
                disabled={isMutating}
                className="h-10 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint"
              >
                <Pencil className="size-4" />
                Edit
              </Button>
            )}
            {/* Deactivate hidden for self and already-inactive users. */}
            {canUpdateUser && user.isActive && !isSelf && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDeactivateOpen(true)}
                disabled={isMutating}
                className="h-10 gap-2 rounded-xl border-destructive/30 bg-white px-4 text-sm font-semibold text-destructive hover:bg-destructive/10"
              >
                {isMutating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Deactivate
              </Button>
            )}
            {/* Reactivate appears only on inactive users. */}
            {canUpdateUser && !user.isActive && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmReactivateOpen(true)}
                disabled={isMutating}
                className="h-10 gap-2 rounded-xl border-success/30 bg-white px-4 text-sm font-semibold text-success hover:bg-success/10"
              >
                {isMutating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RotateCcw className="size-4" />
                )}
                Reactivate
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FormCard
          title="Identity"
          description="Name, email, and role."
          icon={IdCard}
        >
          <dl className="grid gap-3 sm:grid-cols-2">
            <DetailField label="First name">{user.firstName}</DetailField>
            <DetailField label="Last name">{user.lastName}</DetailField>
            <DetailField icon={Mail} label="Email">
              {user.email}
            </DetailField>
            <DetailField icon={UserCog} label="Role">
              {formatRoleName(user.role)}
            </DetailField>
          </dl>
        </FormCard>

        <FormCard
          title="Activity"
          description="Account status and last sign-in."
          icon={Calendar}
        >
          <dl className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Status">
              {user.isActive ? "Active" : "Inactive"}
            </DetailField>
            <DetailField label="Last login">
              {user.lastLoginAt
                ? formatDateTime(user.lastLoginAt, timeSettings)
                : "Never signed in"}
            </DetailField>
            <DetailField label="Member since">
              {formatDate(user.createdAt, timeSettings)}
            </DetailField>
            <DetailField label="Updated">
              {formatDate(user.updatedAt, timeSettings)}
            </DetailField>
          </dl>
        </FormCard>

        <FormCard
          title="Assigned sites"
          description="Sites this user can work with."
          icon={Building2}
          className="lg:col-span-2"
        >
          {user.sites.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {user.sites.map((s) => (
                <li
                  key={s.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary"
                >
                  <Building2 className="size-3" />
                  <span>{s.name}</span>
                  {s.city ? (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <MapPin className="size-3" />
                        {s.city}
                      </span>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-center text-xs italic text-muted-foreground">
              No sites assigned yet.
            </p>
          )}
        </FormCard>

        {/* Password reset is its own card so the UI clearly separates a
            destructive credential change from the basic edit flow. */}
        <PasswordResetCard userId={user.id} userName={user.firstName} />
      </div>

      <ConfirmDialog
        open={confirmDeactivateOpen}
        onOpenChange={setConfirmDeactivateOpen}
        title="Deactivate user?"
        description={
          <>
            <span className="font-semibold text-primary">
              {user.firstName} {user.lastName}
            </span>{" "}
            will no longer be able to sign in. You can reactivate them later if
            needed.
          </>
        }
        confirmLabel="Deactivate"
        destructive
        onConfirm={handleConfirmedDeactivate}
      />
      <ConfirmDialog
        open={confirmReactivateOpen}
        onOpenChange={setConfirmReactivateOpen}
        title="Reactivate user?"
        description={
          <>
            <span className="font-semibold text-primary">
              {user.firstName} {user.lastName}
            </span>{" "}
            will be able to sign in again with their existing password.
          </>
        }
        confirmLabel="Reactivate"
        onConfirm={handleConfirmedReactivate}
      />
    </div>
  );
}

// ----- Edit form -----------------------------------------------------------

interface UserEditPayload {
  firstName: string;
  lastName: string;
  email: string;
  roleId: string;
  siteIds: string[];
}

// Edit-only form. Distinct from UserManagementPanel's create form because we
// don't accept a password here (that's a separate flow in `PasswordResetCard`)
// and because the role + site assignments hit dedicated backend endpoints.
function UserEditForm({
  initial,
  sites,
  roles,
  onCancel,
  onSubmit,
}: {
  initial: ApiUser;
  sites: ListedSite[];
  roles: ApiRole[];
  onCancel: () => void;
  onSubmit: (payload: UserEditPayload) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [email, setEmail] = useState(initial.email);
  const [roleId, setRoleId] = useState(initial.roleId);
  const [siteIds, setSiteIds] = useState<string[]>(
    initial.sites.map((s) => s.id),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function toggleSite(id: string) {
    setSiteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedFirst || !trimmedLast || !trimmedEmail) {
      setFormError("First name, last name, and email are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        firstName: trimmedFirst,
        lastName: trimmedLast,
        email: trimmedEmail,
        roleId,
        siteIds,
      });
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Could not save changes.",
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
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
            Edit teammate
          </p>
          <h2 className="text-base font-semibold text-primary">
            {initial.firstName} {initial.lastName}
          </h2>
        </div>
      </div>

      {formError && (
        <div className="mb-4">
          <PanelError message={formError} />
        </div>
      )}

      <FieldGrid>
        <SettingsField label="First name">
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={isSubmitting}
            autoComplete="given-name"
            className={fieldClass}
          />
        </SettingsField>
        <SettingsField label="Last name">
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={isSubmitting}
            autoComplete="family-name"
            className={fieldClass}
          />
        </SettingsField>
        <SettingsField label="Email">
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              autoComplete="email"
              className={`${fieldClass} pl-9`}
            />
          </div>
        </SettingsField>
        <SettingsField label="Role">
          <Select
            value={roleId}
            onValueChange={setRoleId}
            disabled={isSubmitting || roles.length === 0}
            searchable={false}
            options={roles.map((r) => ({
              value: r.id,
              label: r.name,
            }))}
          />
        </SettingsField>
      </FieldGrid>

      <div className="mt-5">
        <SettingsField
          label="Assigned sites"
          hint={
            sites.length === 0
              ? "No sites available yet."
              : "Pick one or more sites this user can work with."
          }
        >
          {sites.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {sites.map((s) => {
                const checked = siteIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSite(s.id)}
                    disabled={isSubmitting}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      checked
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-slate-200 bg-white text-muted-foreground hover:border-slate-300 hover:text-primary",
                    )}
                  >
                    {checked && <Plus className="size-3 rotate-45" />}
                    <span>{s.name}</span>
                    {s.city && (
                      <>
                        <span>·</span>
                        <span className="text-[11px] text-muted-foreground">
                          {s.city}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-center text-xs text-muted-foreground">
              No sites available.
            </div>
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
          disabled={isSubmitting}
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
              Save changes
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

// ----- Password reset card --------------------------------------------------

// Admin-only inline form for setting a new password on someone else's
// account. Lives in its own card so the credential change is visually
// separated from the regular profile edit.
function PasswordResetCard({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Brief success indicator so the admin gets confirmation without a
  // full-blown toast system. Clears after a few seconds.
  const [success, setSuccess] = useState(false);

  const trimmedLength = useMemo(() => password.length, [password]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (trimmedLength < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setIsSubmitting(true);
    try {
      await resetUserPassword(userId, password);
      setPassword("");
      setSuccess(true);
      // Collapse the card after a short delay so the success state is visible.
      setTimeout(() => {
        setSuccess(false);
        setIsExpanded(false);
      }, 2000);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not reset password.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <FormCard
      title="Password"
      description="Set a new password for this user."
      icon={ShieldCheck}
      className="lg:col-span-2"
    >
      {!isExpanded ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Reset {userName}&apos;s password if they&apos;ve forgotten it. The
            user can change it again after signing in.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsExpanded(true)}
            className="h-9 gap-2 rounded-xl text-sm"
          >
            <ShieldCheck className="size-4" />
            Reset password
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          {error && <PanelError message={error} />}
          {success && (
            <p
              role="status"
              className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs font-medium text-success"
            >
              Password updated.
            </p>
          )}
          <SettingsField
            label="New password"
            hint="At least 8 characters. The user can change it after signing in."
          >
            <div className="relative">
              <ShieldCheck className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                autoComplete="new-password"
                className={`${fieldClass} pr-10 pl-9`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowPassword((v) => !v)}
                disabled={isSubmitting}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:text-primary"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
            </div>
          </SettingsField>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIsExpanded(false);
                setPassword("");
                setError(null);
              }}
              disabled={isSubmitting}
              className="h-9 gap-2 rounded-xl text-sm"
            >
              <X className="size-4" />
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || trimmedLength < 8}
              className="h-9 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  Save new password
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </FormCard>
  );
}

// ----- Local presentational helpers ----------------------------------------

// Sized like the VehicleDetail BackLink for visual consistency. Lands the user
// back on the settings page with the Users sub-section pre-selected.
function BackLink() {
  return (
    <Link
      href="/settings?section=users"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"
    >
      <ArrowLeft className="size-3.5" />
      Back to users
    </Link>
  );
}

// Single label/value row used to render read-only fields. Mirrors the look
// of `SettingsField` but with a dt/dd pair so it's a proper description list.
function DetailField({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2">
      <dt className="font-label-caps mb-1 flex items-center gap-1 text-[10px] tracking-wide text-muted-foreground uppercase">
        {Icon ? <Icon className="size-3" /> : null}
        {label}
      </dt>
      <dd className="text-sm font-semibold text-primary">{children}</dd>
    </div>
  );
}

// Sub-card used inside the detail page grid. Local to avoid importing from
// the vehicles namespace; structurally identical to the VehicleDetail one.
function FormCard({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-100 bg-slate-50/40 p-4",
        className,
      )}
    >
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

// Inline error banner; matches the look used by other settings panels.
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
