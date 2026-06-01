"use client";

import { cn } from "@/lib/utils";

export function WorkedHoursDonut({
  worked,
  target,
}: {
  worked: number;
  target: number;
}) {
  const size = 44;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const rawRatio = target > 0 ? worked / target : 0;
  const ratio = Math.min(rawRatio, 1);
  const dashOffset = circumference - circumference * ratio;
  const label = `Worked ${worked.toFixed(1)}h of ${target}h target`;
  const display =
    worked >= 10 ? Math.round(worked).toString() : worked.toFixed(1);
  const tierColor =
    rawRatio >= 0.9
      ? "text-emerald-600"
      : rawRatio >= 0.5
        ? "text-amber-500"
        : "text-rose-600";

  return (
    <span
      className={cn(
        "relative ml-1 inline-flex shrink-0 items-center justify-center",
        tierColor,
      )}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
      title={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={strokeWidth}
        />
        {target > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 400ms ease-out" }}
          />
        )}
      </svg>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums">
        {display}
      </span>
    </span>
  );
}
