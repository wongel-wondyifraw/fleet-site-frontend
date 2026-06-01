"use client";

import { ChevronDown, ChevronUp, Loader2 } from "@/lib/icons";
import { useEffect, useState } from "react";

import type { ApiTripTargetEffective } from "@/lib/api/types";

export function DailyTargetEditor({
  target,
  isSaving,
  onSave,
  onReset,
}: {
  target: ApiTripTargetEffective | null;
  isSaving: boolean;
  onSave: (count: number) => Promise<void> | void;
  onReset: () => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<string>(
    target ? String(target.count) : "",
  );

  useEffect(() => {
    if (target) setDraft(String(target.count));
  }, [target]);

  async function commit() {
    if (!target) return;
    const parsed = Number.parseInt(draft, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      setDraft(String(target.count));
      return;
    }
    if (parsed === target.count) return;
    await onSave(parsed);
  }

  async function step(delta: number) {
    if (!target) return;
    const base = Number.parseInt(draft, 10);
    const current = Number.isFinite(base) ? base : target.count;
    const next = Math.max(0, Math.min(1000, current + delta));
    setDraft(String(next));
    if (next === target.count) return;
    await onSave(next);
  }

  const disabled = !target || isSaving;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm">
      <span className="text-[10px] font-semibold tracking-wide text-primary/70 uppercase">
        Daily target
      </span>
      <div className="flex items-stretch overflow-hidden rounded-md border border-primary/30 bg-white">
        <input
          type="number"
          min={0}
          max={1000}
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          disabled={disabled}
          aria-label="Expected trips for the selected day"
          className="w-12 border-0 bg-transparent px-2 py-0.5 text-center text-sm font-bold text-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0"
        />
        <div className="flex flex-col border-l border-primary/30">
          <button
            type="button"
            onClick={() => void step(1)}
            disabled={disabled}
            aria-label="Increase daily target"
            className="flex h-1/2 w-6 items-center justify-center bg-primary text-white transition-colors hover:bg-primary/90 active:bg-primary/80 disabled:opacity-50"
          >
            <ChevronUp className="size-3.5" strokeWidth={3} />
          </button>
          <button
            type="button"
            onClick={() => void step(-1)}
            disabled={disabled}
            aria-label="Decrease daily target"
            className="flex h-1/2 w-6 items-center justify-center border-t border-white/30 bg-primary text-white transition-colors hover:bg-primary/90 active:bg-primary/80 disabled:opacity-50"
          >
            <ChevronDown className="size-3.5" strokeWidth={3} />
          </button>
        </div>
      </div>
      <span className="text-[11px] text-primary/70">trips</span>
      {target?.isOverride && (
        <button
          type="button"
          onClick={() => void onReset()}
          disabled={isSaving}
          className="text-[11px] font-semibold text-primary/70 underline-offset-2 hover:text-primary hover:underline disabled:opacity-50"
        >
          Reset to default ({target.defaultCount})
        </button>
      )}
      {isSaving && <Loader2 className="size-3.5 animate-spin text-primary" />}
    </div>
  );
}
