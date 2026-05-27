"use client";

import { Phone } from "lucide-react";
import { useMemo } from "react";

import { fieldClass } from "@/components/settings/SettingsShared";
import { cn } from "@/lib/utils";

const ETH_PREFIX = "+251";

/** Strip stored value to the local digits shown after the locked +251 prefix. */
export function toLocalDisplay(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === ETH_PREFIX) return "";

  if (trimmed.startsWith("+251")) {
    return trimmed.slice(4).replace(/^[\s-]+/, "");
  }

  if (trimmed.startsWith("0")) {
    return trimmed.slice(1);
  }

  // Legacy international or other formats — show as-is so data is never lost.
  return trimmed;
}

/** Whether the stored value is a non-Ethiopian legacy number. */
function isLegacyValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed === ETH_PREFIX) return false;
  return !trimmed.startsWith("+251") && !trimmed.startsWith("0");
}

function composeFromLocal(local: string, currentValue: string): string {
  const trimmedLocal = local.trim();

  if (isLegacyValue(currentValue)) {
    if (!trimmedLocal) return ETH_PREFIX;
    if (trimmedLocal.startsWith("+")) return trimmedLocal;
    const digits = trimmedLocal.replace(/\D/g, "");
    return digits ? `${ETH_PREFIX}${digits}` : ETH_PREFIX;
  }

  const digits = trimmedLocal.replace(/\D/g, "");
  return digits ? `${ETH_PREFIX}${digits}` : ETH_PREFIX;
}

export type PhoneInputProps = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
};

/**
 * Ethiopian phone input with a locked +251 prefix. Parent state always holds the
 * full value (e.g. "+251911223344"); the user edits only the local part.
 */
export function PhoneInput({
  value,
  onChange,
  disabled,
  placeholder = "9XX XXX XXX",
  id,
  className,
}: PhoneInputProps) {
  const localDisplay = useMemo(() => toLocalDisplay(value), [value]);

  function handleChange(nextLocal: string) {
    onChange(composeFromLocal(nextLocal, value));
  }

  return (
    <div className={cn("relative flex", className)}>
      <div
        className={cn(
          fieldClass,
          "pointer-events-none flex w-[4.25rem] shrink-0 items-center justify-center gap-1 rounded-r-none border-r-0 bg-slate-50 pl-2 pr-1 text-sm font-medium text-primary",
          disabled && "opacity-50",
        )}
        aria-hidden
      >
        <Phone className="size-4 text-muted-foreground" />
        <span>{ETH_PREFIX}</span>
      </div>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        maxLength={12}
        value={localDisplay}
        onChange={(e) => handleChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        aria-label="Phone number"
        className={cn(
          fieldClass,
          "min-w-0 flex-1 rounded-l-none border-l-0 pl-3",
        )}
      />
    </div>
  );
}
