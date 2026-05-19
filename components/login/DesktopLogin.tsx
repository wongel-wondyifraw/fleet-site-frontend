"use client";

import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import {
  FormEvent,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

import { FleetSiteLogo } from "@/components/brand/FleetSiteLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CONSTRUCTION_IMAGE = "/construction-site.jpg";

export function DesktopLogin() {
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
  }

  return (
    <main className="hidden min-h-dvh w-full lg:flex lg:items-stretch">
      <section className="relative flex w-3/5 flex-1 items-center justify-center self-stretch overflow-hidden bg-inverse-surface xl:w-2/3">
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-60 grayscale"
          style={{ backgroundImage: `url("${CONSTRUCTION_IMAGE}")` }}
        />
        <HeroPanel />
        <BlueprintSvg />
      </section>

      <section className="flex w-full flex-col items-center justify-center self-stretch bg-surface-container-lowest p-gutter py-12 lg:w-2/5 xl:w-1/3">
        <Card className="w-full max-w-md rounded-lg border border-outline-variant bg-white py-0 shadow-sm ring-0">
          <CardContent className="p-10">
            <BrandHeader />
            <SignInHeader />

            <form className="space-y-6" onSubmit={handleSubmit}>
              <FieldGroup id="desktop-email" label="Email" icon={Mail}>
                <Input
                  id="desktop-email"
                  type="email"
                  placeholder="name@company.com"
                  className="h-10 border-outline bg-surface pl-10"
                />
              </FieldGroup>

              <FieldGroup id="desktop-password" label="Password" icon={Lock}>
                <PasswordInput
                  showPassword={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                />
              </FieldGroup>

              <RememberRow />

              <Button
                type="submit"
                className="h-10 w-full gap-2 rounded-lg bg-primary font-bold hover:bg-surface-tint active:scale-[0.98]"
              >
                Sign In
                <ArrowRight className="size-[18px]" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function HeroPanel() {
  return (
    <div className="relative z-10 max-w-2xl px-24">
      <h1 className="font-display-lg text-display-lg mb-4 text-white">
        Precision Logistics. <br />
        Engineered Performance.
      </h1>
      <p className="font-body-base text-body-base border-l-2 border-primary-container pl-6 text-on-primary-container opacity-80">
        Managing fleet operations across complex construction environments with
        real-time tracking and structural integrity. Site Ops v1.0.
      </p>
    </div>
  );
}

function BlueprintSvg() {
  return (
    <svg
      fill="none"
      viewBox="0 0 400 200"
      xmlns="http://www.w3.org/2000/svg"
      className="pointer-events-none absolute right-[3rem] bottom-[3rem] h-auto w-[min(25vw,25rem)] opacity-20"
    >
      <path d="M10 10H390V190H10V10Z" stroke="white" strokeWidth="1" />
      <path d="M10 50H390" stroke="white" strokeWidth="1" />
      <path d="M10 90H390" stroke="white" strokeWidth="1" />
      <path d="M10 130H390" stroke="white" strokeWidth="1" />
      <path d="M50 10V190" stroke="white" strokeWidth="1" />
      <path d="M100 10V190" stroke="white" strokeWidth="1" />
    </svg>
  );
}

function BrandHeader() {
  return (
    <div className="mb-10 flex w-full flex-col items-center text-center">
      <div className="relative z-0">
        <FleetSiteLogo />
      </div>
      <span className="relative z-10 -mt-3 bg-white px-3 text-3xl font-bold tracking-tight text-primary">
        FleetSite
      </span>
    </div>
  );
}

function SignInHeader() {
  return (
    <div className="mb-8">
      <h2 className="font-headline-md text-headline-md mb-2 text-on-surface">
        Sign In
      </h2>
      <p className="font-body-sm text-body-sm text-muted-foreground">
        Access your site dashboard and vehicle tracking.
      </p>
    </div>
  );
}

function PasswordInput({
  showPassword,
  onToggle,
}: {
  showPassword: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <Input
        id="desktop-password"
        type={showPassword ? "text" : "password"}
        placeholder="••••••••"
        className="h-10 border-outline bg-surface pr-12 pl-10"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:text-primary"
        aria-label={showPassword ? "Hide password" : "Show password"}
        onClick={onToggle}
      >
        {showPassword ? (
          <EyeOff className="size-4" />
        ) : (
          <Eye className="size-4" />
        )}
      </Button>
    </div>
  );
}

function RememberRow() {
  return (
    <div className="flex items-center justify-between py-2">
      <label className="flex cursor-pointer items-center gap-3">
        <Checkbox id="remember" />
        <Label
          htmlFor="remember"
          className="font-body-sm text-body-sm cursor-pointer font-normal text-muted-foreground"
        >
          Remember me
        </Label>
      </label>
      <a
        href="#"
        className="font-body-sm text-body-sm text-primary hover:underline"
      >
        Forgot Access?
      </a>
    </div>
  );
}

function FieldGroup({
  id,
  label,
  icon: Icon,
  children,
}: {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="font-body-sm text-body-sm text-on-surface">
        {label}
      </Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
        {children}
      </div>
    </div>
  );
}
