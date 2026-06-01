// Pure helpers for the fuel consumption management view.

import type { ApiFuelConsumptionDay } from "@/lib/api/types";

export type {
  DateFilter,
} from "@/lib/attendance/attendanceHelpers";

export {
  ALL_SITES_TAB,
  UNASSIGNED_TAB,
  toLocalDateKey,
} from "@/lib/attendance/attendanceHelpers";

export function driverName(day: ApiFuelConsumptionDay): string {
  const driver = day.driver;
  if (!driver) return "Unknown driver";
  const composed = `${driver.firstName ?? ""} ${driver.lastName ?? ""}`.trim();
  return composed || driver.employeeId || "Unnamed driver";
}

export type ConsumptionDataFilter = "ALL" | "HAS_CONSUMPTION" | "MISSING_DATA";

export const CONSUMPTION_DATA_OPTIONS: {
  value: ConsumptionDataFilter;
  label: string;
}[] = [
  { value: "ALL", label: "All rows" },
  { value: "HAS_CONSUMPTION", label: "Has consumption data" },
  { value: "MISSING_DATA", label: "Missing data" },
];

export function parseWorkDistanceKm(
  raw: string | null | undefined,
): number | null {
  if (raw === null || raw === undefined) return null;
  const parsed = Number.parseFloat(String(raw));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function isDistanceIncomplete(day: ApiFuelConsumptionDay): boolean {
  return day.distanceIncomplete;
}

export function hasConsumptionEstimate(day: ApiFuelConsumptionDay): boolean {
  return day.estimatedLiters != null && Number.isFinite(day.estimatedLiters);
}

export function formatEstimatedLiters(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)} L`;
}

export function formatKmPerLitre(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  return `${value.toFixed(1)} km/L`;
}

export function formatDistanceKm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} km`;
}

export type ConsumptionIssue =
  | "NO_VEHICLE"
  | "NO_MILEAGE"
  | "NO_DISTANCE"
  | "INCOMPLETE_DISTANCE";

export function consumptionIssues(
  day: ApiFuelConsumptionDay,
): ConsumptionIssue[] {
  const issues: ConsumptionIssue[] = [];
  if (!day.vehicleId || !day.vehicle) {
    issues.push("NO_VEHICLE");
  } else if (
    day.ratedKmPerLitre == null ||
    !Number.isFinite(day.ratedKmPerLitre) ||
    day.ratedKmPerLitre <= 0
  ) {
    issues.push("NO_MILEAGE");
  }
  const distance = parseWorkDistanceKm(day.workDistanceKm);
  if (distance == null) {
    issues.push("NO_DISTANCE");
  }
  if (isDistanceIncomplete(day)) {
    issues.push("INCOMPLETE_DISTANCE");
  }
  return issues;
}

export const CONSUMPTION_ISSUE_LABELS: Record<ConsumptionIssue, string> = {
  NO_VEHICLE: "No vehicle assigned",
  NO_MILEAGE: "No km/L rating on vehicle",
  NO_DISTANCE: "No odometer distance",
  INCOMPLETE_DISTANCE: "Distance incomplete",
};

export function vehicleLabel(day: ApiFuelConsumptionDay): string {
  const vehicle = day.vehicle;
  if (!vehicle) return "—";
  if (vehicle.assetNumber) {
    return `${vehicle.assetNumber} · ${vehicle.plateNumber}`;
  }
  return vehicle.plateNumber;
}

export function matchesConsumptionFilter(
  day: ApiFuelConsumptionDay,
  filter: ConsumptionDataFilter,
): boolean {
  if (filter === "ALL") return true;
  if (filter === "HAS_CONSUMPTION") return hasConsumptionEstimate(day);
  return consumptionIssues(day).length > 0;
}

export function computeRosterTotals(days: ApiFuelConsumptionDay[]): {
  totalKm: number;
  totalLiters: number;
  rowsWithEstimate: number;
  rowsMissingData: number;
} {
  let totalKm = 0;
  let totalLiters = 0;
  let rowsWithEstimate = 0;
  let rowsMissingData = 0;

  for (const day of days) {
    const distance = parseWorkDistanceKm(day.workDistanceKm);
    if (distance != null) totalKm += distance;
    if (hasConsumptionEstimate(day)) {
      totalLiters += day.estimatedLiters ?? 0;
      rowsWithEstimate += 1;
    }
    if (consumptionIssues(day).length > 0) {
      rowsMissingData += 1;
    }
  }

  return {
    totalKm: Number(totalKm.toFixed(2)),
    totalLiters: Number(totalLiters.toFixed(2)),
    rowsWithEstimate,
    rowsMissingData,
  };
}
