"use client";

export function RosterSummaryPill({
  summary,
}: {
  summary: Record<
    "EXPECTED" | "PRESENT" | "ON_BREAK" | "DONE" | "ABSENT",
    number
  >;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
      <span>
        Expected{" "}
        <span className="text-primary tabular-nums">{summary.EXPECTED}</span>
      </span>
      <span>
        Present{" "}
        <span className="text-primary tabular-nums">{summary.PRESENT}</span>
      </span>
      <span>
        OnBreak{" "}
        <span className="text-primary tabular-nums">{summary.ON_BREAK}</span>
      </span>
      <span>
        Done <span className="text-primary tabular-nums">{summary.DONE}</span>
      </span>
      <span>
        Absent <span className="text-primary tabular-nums">{summary.ABSENT}</span>
      </span>
    </span>
  );
}
