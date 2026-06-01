"use client";

import { Loader2 } from "@/lib/icons";

import { fieldClass } from "@/components/settings/SettingsShared";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type PunchCorrectionState = {
  at: string;
  note: string;
};

export function AttendancePunchCorrectionDialog({
  open,
  onOpenChange,
  correction,
  onCorrectionChange,
  isMutating,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  correction: PunchCorrectionState | null;
  onCorrectionChange: (
    updater: (prev: PunchCorrectionState | null) => PunchCorrectionState | null,
  ) => void;
  isMutating: boolean;
  onSave: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Correct punch</AlertDialogTitle>
        </AlertDialogHeader>
        {correction && (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Time
              </span>
              <input
                type="datetime-local"
                value={correction.at}
                onChange={(e) =>
                  onCorrectionChange((prev) =>
                    prev ? { ...prev, at: e.target.value } : prev,
                  )
                }
                className={fieldClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Note
              </span>
              <input
                type="text"
                value={correction.note}
                onChange={(e) =>
                  onCorrectionChange((prev) =>
                    prev ? { ...prev, note: e.target.value } : prev,
                  )
                }
                placeholder="Optional correction note"
                className={fieldClass}
              />
            </label>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isMutating}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            onClick={onSave}
            disabled={isMutating || !correction?.at}
            className="h-10 gap-2 rounded-xl px-4 text-sm font-semibold"
          >
            {isMutating ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
