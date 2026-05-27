"use client";

import {
  AlertCircle,
  Eye,
  EyeOff,
  Gavel,
  Loader2,
  Lock,
  LogIn,
  Mail,
} from "@/lib/icons";
import { useRouter } from "next/navigation";
import {
  useState,
  type ChangeEvent,
  type ComponentType,
  type FormEvent,
} from "react";

import { FleetSiteLogo } from "@/components/brand/FleetSiteLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/utils";

export function MobileLogin() {
  // Router used to redirect to /dashboard on success.
  const router = useRouter();
  // Pull the login helper out of auth context.
  const { login } = useAuth();

  // Form state: controlled inputs + UI flags.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Submit handler shared by the form and the button click.
  async function handleSubmit(e?: FormEvent<HTMLFormElement>) {
    // Prevent the default browser submission when triggered by a form.
    e?.preventDefault();
    // Reset the inline error per attempt for clear feedback.
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMessage("Please enter both your email and password.");
      return;
    }

    setIsAuthenticating(true);
    try {
      await login(trimmedEmail, password);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Unexpected error. Please try again.");
      }
    } finally {
      setIsAuthenticating(false);
    }
  }

  return (
    <main className="relative z-10 flex min-h-dvh w-full flex-col bg-white lg:hidden">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6">
        <header className="mb-10 flex w-full flex-col items-center text-center">
          <FleetSiteLogo size="md" className="mb-4" />
          <h1 className="font-headline-md text-headline-md font-bold tracking-tight text-primary">
            FleetSite
          </h1>
          <p className="font-body-sm text-body-sm mt-1 text-muted-foreground">
            Site Operations Portal v1.0
          </p>
        </header>

        {/* form element gives us Enter-to-submit behavior on mobile keyboards. */}
        <form className="w-full" onSubmit={handleSubmit} noValidate>
          <LoginForm
            email={email}
            password={password}
            showPassword={showPassword}
            errorMessage={errorMessage}
            isAuthenticating={isAuthenticating}
            onEmailChange={(e) => setEmail(e.target.value)}
            onPasswordChange={(e) => setPassword(e.target.value)}
            onTogglePassword={() => setShowPassword((v) => !v)}
          />
        </form>
      </div>

      <footer className="pb-8 text-center">
        <SecureBadge />
      </footer>
    </main>
  );
}

// Form body: inputs, error banner, and submit button.
function LoginForm({
  email,
  password,
  showPassword,
  errorMessage,
  isAuthenticating,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
}: {
  email: string;
  password: string;
  showPassword: boolean;
  errorMessage: string | null;
  isAuthenticating: boolean;
  onEmailChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onPasswordChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onTogglePassword: () => void;
}) {
  return (
    <div className="w-full space-y-6">
      <div className="space-y-4">
        <MobileField
          id="mobile-email"
          label="Email"
          icon={Mail}
          type="email"
          autoComplete="email"
          placeholder="Enter your email"
          value={email}
          onChange={onEmailChange}
          disabled={isAuthenticating}
        />
        <MobilePasswordField
          id="mobile-password"
          label="Password"
          value={password}
          showPassword={showPassword}
          onChange={onPasswordChange}
          onToggle={onTogglePassword}
          disabled={isAuthenticating}
        />
      </div>

      {/* Inline error: shown only when we have something to report. */}
      {errorMessage && <ErrorBanner message={errorMessage} />}

      <Button
        type="submit"
        className="h-12 w-full gap-2 rounded-lg bg-primary-container font-semibold shadow-sm hover:bg-primary active:scale-[0.98] disabled:opacity-70"
        disabled={isAuthenticating}
      >
        {isAuthenticating ? (
          <>
            <Loader2 className="size-5 animate-spin" />
            <span>Authenticating...</span>
          </>
        ) : (
          <>
            <span>Sign In</span>
            <LogIn className="size-5" />
          </>
        )}
      </Button>

      <ForgotPasswordLink />
    </div>
  );
}

// Visual-only "Forgot Password" affordance; wiring deferred.
function ForgotPasswordLink() {
  return (
    <div className="flex flex-col items-center gap-4 pt-2">
      <Button
        type="button"
        variant="link"
        className="font-body-sm text-body-sm h-auto p-0 font-medium"
      >
        Forgot Password
      </Button>
    </div>
  );
}

// Inline alert rendered above the submit button.
function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

// Password field with show/hide toggle — mirrors DesktopLogin PasswordInput.
function MobilePasswordField({
  id,
  label,
  value,
  showPassword,
  onChange,
  onToggle,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  showPassword: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={id}
        className="font-label-caps text-label-caps px-1 uppercase text-muted-foreground"
      >
        {label}
      </Label>
      <div className="group relative">
        <Lock className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
        <Input
          id={id}
          name={id}
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          placeholder="••••••••"
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={cn(
            "h-12 border-border bg-transparent pr-12 pl-10 placeholder:text-outline-variant",
            "focus-visible:border-primary focus-visible:ring-primary/30",
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-1/2 right-1 size-9 -translate-y-1/2 text-muted-foreground hover:text-primary"
          aria-label={showPassword ? "Hide password" : "Show password"}
          onClick={onToggle}
          disabled={disabled}
        >
          {showPassword ? (
            <EyeOff className="size-5" />
          ) : (
            <Eye className="size-5" />
          )}
        </Button>
      </div>
    </div>
  );
}

// Labeled input field with a leading icon - the mobile look uses uppercase labels.
function MobileField({
  id,
  label,
  icon: Icon,
  type,
  placeholder,
  value,
  onChange,
  disabled,
  autoComplete,
}: {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  type: string;
  placeholder: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={id}
        className="font-label-caps text-label-caps px-1 uppercase text-muted-foreground"
      >
        {label}
      </Label>
      <div className="group relative">
        <Icon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
        <Input
          id={id}
          name={id}
          type={type}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={cn(
            "h-12 border-border bg-transparent pl-10 placeholder:text-outline-variant",
            "focus-visible:border-primary focus-visible:ring-primary/30",
          )}
        />
      </div>
    </div>
  );
}

// "Secure Access Only" pill at the bottom of the screen.
function SecureBadge() {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/30 bg-surface-container-low px-3 py-1">
      <Gavel className="size-3.5 text-destructive" />
      <span className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
        Secure Access Only
      </span>
    </div>
  );
}
