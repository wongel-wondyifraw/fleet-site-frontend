"use client";

// Lightweight wrapper around @base-ui/react/popover that mirrors the
// shadcn-style API used elsewhere in this codebase (see select.tsx). The
// content surface is pre-themed with FleetSite tokens: rounded-xl panel,
// slate-200 hairline border, white surface, primary-blue body text, and
// the scale/opacity transition idiom (`data-starting-style` /
// `data-ending-style`) we already use for the Select dropdown so every
// popover in the app feels like part of the same family.

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

type PositionerProps = ComponentProps<typeof PopoverPrimitive.Positioner>;
type PopupProps = ComponentProps<typeof PopoverPrimitive.Popup>;

export interface PopoverContentProps extends Omit<PopupProps, "children"> {
  children: ReactNode;
  // Anchor placement options forwarded to the Positioner. We expose
  // just the knobs callers actually use so the API stays small.
  side?: PositionerProps["side"];
  align?: PositionerProps["align"];
  sideOffset?: PositionerProps["sideOffset"];
  alignOffset?: PositionerProps["alignOffset"];
  collisionPadding?: PositionerProps["collisionPadding"];
  // Optional className for the Positioner wrapper (useful for z-index
  // overrides above modal layers).
  positionerClassName?: string;
}

export function PopoverContent({
  className,
  children,
  side = "bottom",
  align = "end",
  sideOffset = 8,
  alignOffset = 0,
  collisionPadding = 12,
  positionerClassName,
  ...popupProps
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        className={cn("z-50 outline-none", positionerClassName)}
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        collisionPadding={collisionPadding}
      >
        <PopoverPrimitive.Popup
          className={cn(
            // Visual identity: FleetSite tokens (white surface, slate
            // border, primary-blue text) so the popover reads as part of
            // the dashboard rather than a generic floating panel.
            "origin-[var(--transform-origin)] overflow-hidden rounded-2xl border border-slate-200 bg-white text-primary shadow-2xl ring-1 ring-black/5",
            // Same enter/exit transition the Select popup uses so every
            // floating surface in the app animates identically.
            "transition-[transform,scale,opacity] duration-150 ease-out",
            "data-starting-style:scale-95 data-starting-style:opacity-0",
            "data-ending-style:scale-95 data-ending-style:opacity-0",
            className,
          )}
          {...popupProps}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}
