// Shared types and form-state helpers for the trip create / edit form.
// Extracted from the TripsPanel monolith so the form sub-tree
// (TripForm, FormCard, TripDistancePreview) and the list view can both
// reference them without re-importing the entire 3,000+ line module.

import type { ApiTrip, TripStatus } from "@/lib/api/types";

export type TripFormState = {
  vehicleId: string;
  driverId: string;
  status: TripStatus;
  startAddress: string;
  startCity: string;
  startState: string;
  startLat: number | null;
  startLon: number | null;
  endAddress: string;
  endCity: string;
  endState: string;
  endLat: number | null;
  endLon: number | null;
  isRoundTrip: boolean;
};

export function emptyForm(): TripFormState {
  return {
    vehicleId: "",
    driverId: "",
    status: "PLANNED",
    startAddress: "",
    startCity: "",
    startState: "",
    startLat: null,
    startLon: null,
    endAddress: "",
    endCity: "",
    endState: "",
    endLat: null,
    endLon: null,
    isRoundTrip: false,
  };
}

export function tripToForm(trip: ApiTrip): TripFormState {
  return {
    vehicleId: trip.vehicleId,
    driverId: trip.driverId ?? "",
    status: trip.status,
    startAddress: trip.startAddress,
    startCity: trip.startCity ?? "",
    startState: trip.startState ?? "",
    startLat: trip.startLat ?? null,
    startLon: trip.startLon ?? null,
    endAddress: trip.endAddress,
    endCity: trip.endCity ?? "",
    endState: trip.endState ?? "",
    endLat: trip.endLat ?? null,
    endLon: trip.endLon ?? null,
    isRoundTrip: trip.isRoundTrip ?? false,
  };
}

// "Today" / "Yesterday" / "Choose Date" date filter for the trips list.
// Choose Date pairs with a single YYYY-MM-DD value the user picks below.
export type DateFilter = "TODAY" | "YESTERDAY" | "CUSTOM";

export type TripGroup = {
  key: string;
  driverId: string | null;
  trips: ApiTrip[];
};

// Discriminated union driving the panel between list, create, and edit.
export type TripsPanelMode =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; trip: ApiTrip };

// Tailwind tokens for the trip-status pill, kept in one place so status
// colors stay consistent everywhere they're rendered.
export const TRIP_STATUS_PILL: Record<TripStatus, string> = {
  PLANNED: "bg-blue-50 text-blue-700",
  IN_PROGRESS: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-success/15 text-success",
  CANCELLED: "bg-slate-200 text-slate-700",
};
