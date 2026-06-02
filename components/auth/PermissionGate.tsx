"use client";

import { ShieldAlert } from "@/lib/icons";
import Link from "next/link";
import type { ReactNode } from "react";

import { useAuth } from "@/lib/auth/AuthContext";
import { hasPermission } from "@/lib/api/types";

/**
 * Page-level RBAC gate. If the current user does not hold the required
 * permission slug, render an "Access denied" view instead of the children.
 * This stops the page from firing API calls it will be 403'd on and gives
 * the user a clear reason for the block.
 */
export function PermissionGate({
  permission,
  children,
  pageLabel,
}: {
  permission: string;
  children: ReactNode;
  pageLabel?: string;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-slate-200 border-t-primary" />
      </div>
    );
  }

  if (!hasPermission(user, permission)) {
    return <AccessDenied permission={permission} pageLabel={pageLabel} />;
  }

  return <>{children}</>;
}

function AccessDenied({
  permission,
  pageLabel,
}: {
  permission: string;
  pageLabel?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldAlert className="size-7" aria-hidden />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-on-surface">
          You don&apos;t have access{pageLabel ? ` to ${pageLabel}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          Your role is missing the <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{permission}</code> permission.
          Ask an administrator to grant it from Settings → Roles &amp; Permissions.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
