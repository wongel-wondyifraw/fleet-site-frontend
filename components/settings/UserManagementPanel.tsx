"use client";

// Admin-only panel: lists existing users, creates new ones with a role and
// optional site assignments. Visually matches SitesPanel (list <-> form modes).
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  User as UserIcon,
  UserPlus,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { Button } from "@/components/ui/button";
import {
  FieldGrid,
  SettingsField,
  fieldClass,
} from "@/components/settings/SettingsShared";
import { ApiError } from "@/lib/api/client";
import { listSites, type ListedSite } from "@/lib/api/sites";
import { USER_ROLES, formatRole, type ApiUser, type UserRole } from "@/lib/api/types";
import {
  createUser,
  deactivateUser,
  listUsers,
  type CreateUserRequest,
} from "@/lib/api/users";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/utils";

// Color tokens for the role pill - kept in one place so the UI stays consistent.
const ROLE_PILL: Record<UserRole, string> = {
  ADMIN: "bg-destructive/15 text-destructive",
  SITE_MANAGER: "bg-primary/10 text-primary",
  TIME_KEEPER: "bg-amber-50 text-amber-700",
};

// View modes: list view (default) or form view (add new user).
type Mode = { kind: "list" } | { kind: "form" };

export function UserManagementPanel({
  density = "comfortable",
}: {
  density?: "comfortable" | "compact";
}) {
  // Current user is needed to show "(you)" tags and to gate deactivation of self.
  const { user: currentUser } = useAuth();

  // Mode controls whether we render the list or the add-user form.
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  // Server-side data + filters.
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [sites, setSites] = useState<ListedSite[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  // UI flags.
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Loader for both users and sites; sites are needed by the create form.
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [u, s] = await Promise.all([listUsers(), listSites()]);
      setUsers(u);
      setSites(s);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to load users.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load on mount.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Client-side search across name + email + role for snappy UX.
  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const haystack = `${u.firstName} ${u.lastName} ${u.email} ${formatRole(u.role)}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [users, searchQuery]);

  // Save handler called by the form on submit; closes form and reloads list.
  async function handleCreate(payload: CreateUserRequest): Promise<void> {
    await createUser(payload);
    setMode({ kind: "list" });
    // Optimistic refetch so the new user appears immediately.
    await refresh();
  }

  // Deactivate (soft-delete) - confirms with the user before firing.
  async function handleDeactivate(target: ApiUser): Promise<void> {
    if (target.id === currentUser?.id) return;
    const ok = window.confirm(
      `Deactivate ${target.firstName} ${target.lastName}? They will no longer be able to sign in.`,
    );
    if (!ok) return;
    try {
      await deactivateUser(target.id);
      await refresh();
    } catch (err) {
      // Surface the error inline at the top of the list.
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to deactivate user.",
      );
    }
  }

  // ---- Form view -----------------------------------------------------------
  if (mode.kind === "form") {
    return (
      <UserForm
        sites={sites}
        onCancel={() => setMode({ kind: "list" })}
        onSubmit={handleCreate}
      />
    );
  }

  // ---- List view -----------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* Header strip: search + Add User button. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search by name, email, or role"
            value={searchQuery}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setSearchQuery(e.target.value)
            }
            className={`${fieldClass} pl-9`}
          />
        </div>
        <Button
          type="button"
          onClick={() => setMode({ kind: "form" })}
          className="h-10 gap-2 rounded-xl bg-primary px-4 font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint"
        >
          <UserPlus className="size-4" />
          Add User
        </Button>
      </div>

      {/* Inline error banner for load/deactivate failures. */}
      {loadError && <PanelError message={loadError} />}

      {/* Loading skeleton (single spinner row keeps the layout calm). */}
      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : filteredUsers.length === 0 ? (
        // Empty state - either no users at all or no matches for the filter.
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
          <UserIcon className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="text-sm font-medium text-primary">
            {searchQuery ? "No users match your search." : "No users yet."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {searchQuery
              ? "Try a different name, email, or role."
              : "Add the first teammate to get started."}
          </p>
        </div>
      ) : (
        // User list rendered as cards for visual consistency with SitesPanel.
        <ul className={cn("space-y-2", density === "compact" && "space-y-1.5")}>
          {filteredUsers.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              isSelf={u.id === currentUser?.id}
              onDeactivate={() => handleDeactivate(u)}
              density={density}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// Single user row in the list. Self-row hides the deactivate action.
function UserRow({
  user,
  isSelf,
  onDeactivate,
  density,
}: {
  user: ApiUser;
  isSelf: boolean;
  onDeactivate: () => void;
  density: "comfortable" | "compact";
}) {
  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-3 transition-colors hover:border-slate-200 sm:flex-row sm:items-center sm:justify-between",
        density === "compact" && "p-2.5",
        !user.isActive && "opacity-60",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* Initials avatar - same look as the sidebar identity strip. */}
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
          {user.firstName[0]}
          {user.lastName[0]}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-sm font-semibold text-primary">
            <span className="truncate">
              {user.firstName} {user.lastName}
            </span>
            {isSelf && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
                You
              </span>
            )}
            {!user.isActive && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
                Inactive
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          {/* Sites the user belongs to; truncated to keep the row compact. */}
          {user.sites.length > 0 && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {user.sites.map((s) => s.code).join(" · ")}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 sm:ml-auto">
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase",
            ROLE_PILL[user.role],
          )}
        >
          {formatRole(user.role)}
        </span>
        {/* Deactivate button hidden for the currently logged-in admin. */}
        {!isSelf && user.isActive && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDeactivate}
            aria-label={`Deactivate ${user.firstName} ${user.lastName}`}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </li>
  );
}

// Add User form - controlled inputs + role select + multi-site checkboxes.
function UserForm({
  sites,
  onCancel,
  onSubmit,
}: {
  sites: ListedSite[];
  onCancel: () => void;
  onSubmit: (payload: CreateUserRequest) => Promise<void>;
}) {
  // Local controlled state for every field.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("TIME_KEEPER");
  const [siteIds, setSiteIds] = useState<string[]>([]);
  // UI flags for password visibility, submit-in-flight, and validation error.
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Toggle a site assignment in the multi-select chip list.
  function toggleSite(id: string) {
    setSiteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  // Submit handler: client validation -> API call -> propagate any error.
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    if (!trimmedFirst || !trimmedLast || !trimmedEmail || !password) {
      setFormError("All fields are required.");
      return;
    }
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        firstName: trimmedFirst,
        lastName: trimmedLast,
        email: trimmedEmail,
        password,
        role,
        siteIds: siteIds.length > 0 ? siteIds : undefined,
      });
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Could not create user.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Back button + form title row. */}
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
        <p className="text-sm font-semibold text-primary">New User</p>
      </div>

      {/* Inline error banner, rendered above the fields when present. */}
      {formError && <PanelError message={formError} />}

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
              placeholder="name@company.com"
              className={`${fieldClass} pl-9`}
            />
          </div>
        </SettingsField>
        <SettingsField
          label="Temporary password"
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
        <SettingsField label="Role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            disabled={isSubmitting}
            className={fieldClass}
          >
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {formatRole(r)}
              </option>
            ))}
          </select>
        </SettingsField>
      </FieldGrid>

      {/* Site assignment - chip-style multi-select for compact display. */}
      <SettingsField
        label="Assigned sites"
        hint={
          sites.length === 0
            ? "No sites available. Create sites first to assign them here."
            : "Optional. Pick one or more sites this user can work with."
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
                  <span className="font-mono text-[11px] uppercase">
                    {s.code}
                  </span>
                  <span>·</span>
                  <span>{s.name}</span>
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

      {/* Action row: cancel + submit. */}
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
              Create user
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

// Inline error pill used both in the list view and the form.
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
