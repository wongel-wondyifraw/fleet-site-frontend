"use client";

// Dedicated account-management page (route: /account).
//
// Two cards stacked vertically (single column on mobile, two columns
// from `lg` up):
//   1. Profile  - first / last name editable; email + role + assigned
//                 sites + last sign-in shown as read-only context. Email
//                 is intentionally locked (handled by an admin via the
//                 Users panel) so we communicate that explicitly with a
//                 caption + lock icon and disable the field.
//   2. Security - change-password form that asks for the current
//                 password and the new password (with confirm + show /
//                 hide toggles + strength check).
//
// Both surfaces:
//   - surface optimistic loading states on their submit buttons,
//   - report success via the global useToast(),
//   - surface backend errors inline so the user can correct + retry
//     without losing what they typed.

import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  MapPin,
  RotateCcw,
  Save,
  ShieldCheck,
  User,
} from "@/lib/icons";
import Link from "next/link";
import {
  useEffect,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { changeOwnPasswordRequest } from "@/lib/api/auth";
import { formatRole } from "@/lib/api/types";
import { updateUser } from "@/lib/api/users";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDateTime } from "@/lib/time/format";
import { useTimeSettings } from "@/lib/time/TimeSettingsContext";
import { useToast } from "@/lib/toast/ToastContext";
import { cn } from "@/lib/utils";

// Minimum password length enforced by the backend (NestJS DTO uses
// `@MinLength(8)`). We mirror it client-side for instant feedback.
const PASSWORD_MIN_LENGTH = 8;
// Hard cap on name fields to match the backend `@MaxLength(50)`.
const NAME_MAX_LENGTH = 50;

export function AccountPage() {
  const { user, isLoading } = useAuth();

  // While auth is still bootstrapping (or the user signed out in
  // another tab), render a tiny placeholder so the page doesn't crash.
  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl items-center justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="mx-auto w-full max-w-5xl py-16 text-center text-sm text-muted-foreground">
        You need to be signed in to manage your account.
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 lg:gap-6">
      <PageHeader />
      <div className="grid gap-5 lg:grid-cols-5 lg:gap-6">
        <div className="lg:col-span-3">
          <ProfileCard />
        </div>
        <div className="lg:col-span-2">
          <PasswordCard />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page header
// ---------------------------------------------------------------------------

function PageHeader() {
  return (
    <header className="flex flex-col gap-3">
      <Link
        href="/dashboard"
        className="inline-flex w-fit items-center gap-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-3.5" />
        Back to dashboard
      </Link>
      <div>
        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-primary lg:text-3xl">
          Account settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update your personal details and change your password. Email is
          managed by an administrator and can&rsquo;t be changed here.
        </p>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Profile card — editable name fields + read-only identity context.
// ---------------------------------------------------------------------------

function ProfileCard() {
  const { user, refresh } = useAuth();
  const { settings: timeSettings } = useTimeSettings();
  const { showToast } = useToast();

  // Snapshot the server-side values so we can detect "dirty" state and
  // offer a Reset button that restores them without a refetch.
  const serverFirstName = user?.firstName ?? "";
  const serverLastName = user?.lastName ?? "";

  const [firstName, setFirstName] = useState(serverFirstName);
  const [lastName, setLastName] = useState(serverLastName);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Re-sync local form state whenever the server-side values shift
  // (e.g. after a successful save calls refresh(), or the user signs
  // out / in again in another tab). The composite key includes the
  // user id so a profile swap also drops any in-flight edits.
  const serverIdentity = `${user?.id ?? ""}|${serverFirstName}|${serverLastName}`;
  useEffect(() => {
    setFirstName(serverFirstName);
    setLastName(serverLastName);
    setErrorMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverIdentity]);

  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();

  const hasChanges =
    trimmedFirst !== serverFirstName || trimmedLast !== serverLastName;

  const validationError = (() => {
    if (!trimmedFirst) return "First name is required.";
    if (!trimmedLast) return "Last name is required.";
    if (trimmedFirst.length > NAME_MAX_LENGTH)
      return `First name must be ${NAME_MAX_LENGTH} characters or fewer.`;
    if (trimmedLast.length > NAME_MAX_LENGTH)
      return `Last name must be ${NAME_MAX_LENGTH} characters or fewer.`;
    return null;
  })();

  function handleReset() {
    setFirstName(serverFirstName);
    setLastName(serverLastName);
    setErrorMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !hasChanges || validationError) return;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await updateUser(user.id, {
        firstName: trimmedFirst,
        lastName: trimmedLast,
      });
      // Re-fetch /auth/me so the rest of the app (sidebar avatar,
      // mobile top bar, etc.) reflects the new name immediately.
      await refresh();
      showToast({
        variant: "success",
        title: "Profile updated",
        message: "Your name has been saved.",
      });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Couldn't save your changes. Please try again.";
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  }

  if (!user) return null;

  const initials =
    `${(user.firstName[0] ?? "").toUpperCase()}${(user.lastName[0] ?? "").toUpperCase()}` ||
    "?";
  const siteList =
    user.sites.length > 0
      ? user.sites.map((site) => site.name).join(", ")
      : "Not assigned to any site";
  const lastLoginLabel = user.lastLoginAt
    ? formatDateTime(user.lastLoginAt, timeSettings)
    : "First sign-in";

  return (
    <Card icon={User} title="Profile" description="How your name appears across FleetSite.">
      <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        {/* Identity strip — avatar + display name + role pill. */}
        <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
          <div
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-bold text-primary"
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-primary">
              {trimmedFirst || serverFirstName} {trimmedLast || serverLastName}
            </p>
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-[2px] text-[10px] font-bold tracking-wide text-primary uppercase">
              <ShieldCheck className="size-3" aria-hidden />
              {formatRole(user.role)}
            </span>
          </div>
        </div>

        {/* Editable name fields. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="account-first-name"
            label="First name"
            icon={User}
            value={firstName}
            onChange={setFirstName}
            disabled={isSaving}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="given-name"
            required
          />
          <FormField
            id="account-last-name"
            label="Last name"
            icon={User}
            value={lastName}
            onChange={setLastName}
            disabled={isSaving}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="family-name"
            required
          />
        </div>

        {/* Email — read-only with explanatory caption. */}
        <FormField
          id="account-email"
          label="Email"
          icon={Mail}
          value={user.email}
          onChange={() => undefined}
          readOnly
          disabled
          hint={
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Lock className="size-3" aria-hidden />
              Email is managed by an administrator and can&rsquo;t be changed
              here.
            </span>
          }
          autoComplete="email"
        />

        {/* Read-only context strip — assigned sites + last sign-in. */}
        <div className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 sm:grid-cols-2">
          <ContextRow icon={MapPin} label="Assigned sites" value={siteList} />
          <ContextRow icon={Clock} label="Last signed in" value={lastLoginLabel} />
        </div>

        {/* Inline error banner. */}
        {(errorMessage || validationError) && hasChanges && (
          <InlineAlert message={errorMessage ?? validationError ?? ""} />
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleReset}
            disabled={!hasChanges || isSaving}
            className="h-10 gap-1.5 rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:text-primary"
          >
            <RotateCcw className="size-4" />
            Reset
          </Button>
          <Button
            type="submit"
            disabled={!hasChanges || !!validationError || isSaving}
            className="h-10 gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 hover:bg-surface-tint disabled:opacity-60"
          >
            {isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
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
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Password card — change-password form with current + new + confirm.
// ---------------------------------------------------------------------------

function PasswordCard() {
  const { showToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const newStrength = scorePasswordStrength(newPassword);

  const validationError = (() => {
    if (!currentPassword || !newPassword || !confirmPassword) return null;
    if (newPassword.length < PASSWORD_MIN_LENGTH)
      return `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    if (newPassword === currentPassword)
      return "New password must be different from your current password.";
    if (newPassword !== confirmPassword) return "New passwords don't match.";
    return null;
  })();

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= PASSWORD_MIN_LENGTH &&
    confirmPassword === newPassword &&
    newPassword !== currentPassword &&
    !isSaving;

  function resetForm() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setErrorMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await changeOwnPasswordRequest({ currentPassword, newPassword });
      resetForm();
      showToast({
        variant: "success",
        title: "Password updated",
        message: "Use your new password the next time you sign in.",
      });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Couldn't update your password. Please try again.";
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card
      icon={ShieldCheck}
      title="Password"
      description="Use a strong, unique password. You'll stay signed in on this device."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <PasswordFormField
          id="account-current-password"
          label="Current password"
          value={currentPassword}
          onChange={setCurrentPassword}
          show={showCurrent}
          onToggle={() => setShowCurrent((v) => !v)}
          disabled={isSaving}
          autoComplete="current-password"
        />
        <PasswordFormField
          id="account-new-password"
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          show={showNew}
          onToggle={() => setShowNew((v) => !v)}
          disabled={isSaving}
          autoComplete="new-password"
          hint={
            newPassword.length > 0 ? (
              <PasswordStrength strength={newStrength} />
            ) : (
              <span className="text-[11px] text-muted-foreground">
                At least {PASSWORD_MIN_LENGTH} characters.
              </span>
            )
          }
        />
        <PasswordFormField
          id="account-confirm-password"
          label="Confirm new password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          show={showConfirm}
          onToggle={() => setShowConfirm((v) => !v)}
          disabled={isSaving}
          autoComplete="new-password"
          hint={
            confirmPassword.length > 0 &&
            confirmPassword === newPassword &&
            newPassword.length >= PASSWORD_MIN_LENGTH ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
                <CheckCircle className="size-3" />
                Passwords match
              </span>
            ) : null
          }
        />

        {(errorMessage || validationError) && (
          <InlineAlert message={errorMessage ?? validationError ?? ""} />
        )}

        <Button
          type="submit"
          disabled={!canSubmit}
          className="mt-1 h-10 w-full gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 hover:bg-surface-tint disabled:opacity-60"
        >
          {isSaving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Updating…
            </>
          ) : (
            <>
              <Check className="size-4" />
              Update password
            </>
          )}
        </Button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function Card({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lg:p-6">
      <header className="mb-5 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <h2 className="text-base leading-tight font-semibold text-primary lg:text-lg">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground lg:text-sm">
              {description}
            </p>
          ) : null}
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  );
}

function FormField({
  id,
  label,
  icon: Icon,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled = false,
  readOnly = false,
  required = false,
  autoComplete,
  maxLength,
  hint,
}: {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  value: string;
  onChange: (next: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  autoComplete?: string;
  maxLength?: number;
  hint?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={id}
        className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase"
      >
        {label}
      </Label>
      <div className="group relative">
        {Icon ? (
          <Icon
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary"
            aria-hidden
          />
        ) : null}
        <Input
          id={id}
          name={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          autoComplete={autoComplete}
          maxLength={maxLength}
          placeholder={placeholder}
          className={cn(
            "h-11 rounded-xl border-slate-200 bg-white text-sm",
            Icon ? "pl-9" : "pl-3",
            "focus-visible:border-primary focus-visible:ring-primary/25",
            readOnly && "bg-slate-50 text-muted-foreground",
          )}
        />
      </div>
      {hint ? <div className="px-0.5">{hint}</div> : null}
    </div>
  );
}

function PasswordFormField({
  id,
  label,
  value,
  onChange,
  show,
  onToggle,
  disabled,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  show: boolean;
  onToggle: () => void;
  disabled?: boolean;
  autoComplete?: string;
  hint?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={id}
        className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase"
      >
        {label}
      </Label>
      <div className="group relative">
        <Lock
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary"
          aria-hidden
        />
        <Input
          id={id}
          name={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete={autoComplete}
          placeholder="••••••••"
          className={cn(
            "h-11 rounded-xl border-slate-200 bg-white pr-11 pl-9 text-sm",
            "focus-visible:border-primary focus-visible:ring-primary/25",
          )}
        />
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute top-1/2 right-1.5 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-slate-50 hover:text-primary focus:outline-none focus-visible:bg-slate-50 focus-visible:text-primary"
        >
          {show ? (
            <EyeOff className="size-4" />
          ) : (
            <Eye className="size-4" />
          )}
        </button>
      </div>
      {hint ? <div className="px-0.5">{hint}</div> : null}
    </div>
  );
}

function ContextRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className="mt-0.5 truncate text-[13px] font-medium text-primary">
          {value}
        </p>
      </div>
    </div>
  );
}

function InlineAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12px] font-medium text-destructive"
    >
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Password strength
//
// Lightweight heuristic - good enough for UI feedback without pulling in
// a dictionary attack library. The scoring isn't shown to the server,
// just to the user as a "weak / fair / strong" cue alongside the
// MinLength validation.
// ---------------------------------------------------------------------------

type Strength = "weak" | "fair" | "strong";

function scorePasswordStrength(password: string): Strength {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score <= 2) return "weak";
  if (score <= 3) return "fair";
  return "strong";
}

function PasswordStrength({ strength }: { strength: Strength }) {
  const meta: Record<
    Strength,
    { label: string; barClass: string; textClass: string; filled: number }
  > = {
    weak: {
      label: "Weak",
      barClass: "bg-destructive",
      textClass: "text-destructive",
      filled: 1,
    },
    fair: {
      label: "Fair",
      barClass: "bg-secondary",
      textClass: "text-secondary-foreground",
      filled: 2,
    },
    strong: {
      label: "Strong",
      barClass: "bg-success",
      textClass: "text-success",
      filled: 3,
    },
  };
  const { label, barClass, textClass, filled } = meta[strength];
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-8 rounded-full transition-colors",
              i < filled ? barClass : "bg-slate-200",
            )}
          />
        ))}
      </div>
      <span className={cn("text-[11px] font-semibold", textClass)}>{label}</span>
    </div>
  );
}
