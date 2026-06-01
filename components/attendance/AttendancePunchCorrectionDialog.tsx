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
import type { AttendancePunchType } from "@/lib/api/types";
import { ODOMETER_REQUIRED_PUNCH_TYPES } from "@/lib/attendance/attendanceHelpers";

export type PunchCorrectionState = {
  at: string;
  note: string;
  odometer: string;
  type: AttendancePunchType;
};

export function AttendancePunchCorrectionDialog({
  open,
  onOpenChange,
  correction,
  odometerError,
  onCorrectionChange,
  isMutating,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  correction: PunchCorrectionState | null;
  odometerError?: string | null;
  onCorrectionChange: (
    updater: (prev: PunchCorrectionState | null) => PunchCorrectionState | null,
  ) => void;
  isMutating: boolean;
  onSave: () => void;
}) {
  const needsOdometer =
    correction != null && ODOMETER_REQUIRED_PUNCH_TYPES.has(correction.type);
  const odometerMissing =
    needsOdometer && correction != null && correction.odometer.trim().length === 0;

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
            {needsOdometer && (
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Odometer (km)
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  value={correction.odometer}
                  onChange={(e) =>
                    onCorrectionChange((prev) =>
                      prev ? { ...prev, odometer: e.target.value } : prev,
                    )
                  }
                  placeholder="e.g. 152340.50"
                  aria-invalid={odometerError || odometerMissing ? true : undefined}
                  className={fieldClass}
                />
                {(odometerError || odometerMissing) && (
                  <span className="mt-1 block text-[10px] font-medium text-rose-600">
                    {odometerError ??
                      "Enter an odometer reading before saving this punch."}
                  </span>
                )}
              </label>
            )}
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
            disabled={
              isMutating ||
              !correction?.at ||
              (needsOdometer && odometerMissing)
            }
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
