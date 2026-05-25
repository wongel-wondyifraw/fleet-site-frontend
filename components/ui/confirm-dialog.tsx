"use client";

// One-shot confirmation dialog used in place of `window.confirm`. Wraps the
// shadcn-style AlertDialog primitives so a destructive action only needs to
// say "delete X?" and provide the actual handler.
import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  // Controlled open state - callers usually flip this from a "pending target"
  // ref (e.g. "the vehicle the user just clicked delete on").
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  // Defaults to "Confirm". Overridden by callers ("Delete", "Deactivate"...).
  confirmLabel?: string;
  cancelLabel?: string;
  // When true the confirm button uses the destructive palette so dangerous
  // actions read as such.
  destructive?: boolean;
  // Sync or async confirm callback. The dialog stays open with a spinner
  // until an async handler resolves, then closes. Errors from `onConfirm`
  // close the dialog as well - callers are expected to surface them in the
  // page (most existing panels already do via `setLoadError`).
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [isRunning, setIsRunning] = useState(false);

  async function handleConfirm() {
    setIsRunning(true);
    try {
      await onConfirm();
    } finally {
      setIsRunning(false);
      onOpenChange(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Block dismiss while the async handler is running so the user can't
        // close the dialog mid-flight and lose the spinner feedback.
        if (isRunning && !next) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRunning}>
            {cancelLabel}
          </AlertDialogCancel>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isRunning}
            className={cn(
              "h-10 gap-2 rounded-xl px-4 text-sm font-semibold shadow-md",
              destructive
                ? "bg-destructive text-white shadow-destructive/25 hover:bg-destructive/90"
                : "bg-primary text-primary-foreground shadow-primary/20 hover:bg-surface-tint",
            )}
          >
            {isRunning ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Working...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
