"use client";

import { Gavel, Loader2, Lock, LogIn, Mail } from "lucide-react";
import { useState, type ComponentType } from "react";

import { FleetSiteLogo } from "@/components/brand/FleetSiteLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function MobileLogin() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  function handleSignIn() {
    setIsAuthenticating(true);
    setTimeout(() => setIsAuthenticating(false), 2000);
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

        <LoginForm
          isAuthenticating={isAuthenticating}
          onSignIn={handleSignIn}
        />
      </div>

      <footer className="pb-8 text-center">
        <SecureBadge />
      </footer>
    </main>
  );
}

function LoginForm({
  isAuthenticating,
  onSignIn,
}: {
  isAuthenticating: boolean;
  onSignIn: () => void;
}) {
  return (
    <div className="w-full space-y-6">
      <div className="space-y-4">
        <MobileField
          id="mobile-email"
          label="Email"
          icon={Mail}
          type="email"
          placeholder="Enter your email"
        />
        <MobileField
          id="mobile-password"
          label="Password"
          icon={Lock}
          type="password"
          placeholder="••••••••"
        />
      </div>

      <Button
        type="button"
        className="h-12 w-full gap-2 rounded-lg bg-primary-container font-semibold shadow-sm hover:bg-primary active:scale-[0.98]"
        disabled={isAuthenticating}
        onClick={onSignIn}
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

function MobileField({
  id,
  label,
  icon: Icon,
  type,
  placeholder,
}: {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  type: string;
  placeholder: string;
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
          placeholder={placeholder}
          className={cn(
            "h-12 border-border bg-transparent pl-10 placeholder:text-outline-variant",
            "focus-visible:border-primary focus-visible:ring-primary/30",
          )}
        />
      </div>
    </div>
  );
}

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
