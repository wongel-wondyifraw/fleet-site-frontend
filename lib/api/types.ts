export interface ApiPermission {
  id: string;
  slug: string;
  name: string;
  category: string;
  description?: string | null;
}

export interface ApiRole {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  permissions: ApiPermission[];
  createdAt?: string;
  updatedAt?: string;
}

/** Pretty-print a role key when only the key is available. */
export function formatRoleKey(key: string): string {
  return key
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatRoleName(role: ApiRole | { name: string; key?: string }): string {
  return role.name || (role.key ? formatRoleKey(role.key) : "Unknown");
}

export function hasPermission(
  user: ApiUser | null | undefined,
  slug: string,
): boolean {
  return (
    user?.role?.permissions?.some((p) => p.slug === slug) ?? false
  );
}

const ROLE_PILL_BY_KEY: Record<string, string> = {
  ADMIN: "bg-destructive/15 text-destructive",
  SITE_MANAGER: "bg-primary/10 text-primary",
  TIME_KEEPER: "bg-amber-50 text-amber-700",
};

export function getRolePillClass(roleKey: string): string {
  return ROLE_PILL_BY_KEY[roleKey] ?? "bg-slate-100 text-muted-foreground";
}

// Mirrors backend Site entity - the trimmed set of fields the API now exposes.
// Extend this only with fields the UI actually needs.
export const SITE_TYPES = [
  "CONSTRUCTION",
  "MINING",
  "INFRASTRUCTURE",
  "DEMOLITION",
  "QUARRY",
  "DEPOT",
  "OTHER",
] as const;

export const SITE_STATUSES = [
  "PLANNING",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CLOSED",
] as const;

export type SiteType = (typeof SITE_TYPES)[number];
export type SiteStatus = (typeof SITE_STATUSES)[number];

// Slim user shape returned inside a Site's `users` relation. Kept separate
// from ApiUser to avoid a circular type (ApiUser also includes ApiSite[]).
export interface SiteAssignee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: ApiRole;
  roleId?: string;
}

export interface ApiSite {
  id: string;
  name: string;
  type: SiteType;
  status: SiteStatus;
  address: string;
  city: string;
  state: string;
  // Assignees attached to this site. Optional because list views may omit it
  // and older snapshots in storage won't have it.
  users?: SiteAssignee[];
  createdAt?: string;
  updatedAt?: string;
}

// Mirrors backend User entity (passwordHash is stripped server-side).
export interface ApiUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: ApiRole;
  roleId: string;
  isActive: boolean;
  lastLoginAt: string | null;
  sites: ApiSite[];
  createdAt: string;
  updatedAt: string;
}

// Response payload from POST /auth/login.
export interface LoginResponse {
  accessToken: string;
  user: ApiUser;
}

// Body for POST /auth/login.
export interface LoginRequest {
  email: string;
  password: string;
}

// Body for PATCH /auth/me/password.
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// Shape returned by Nest's default exception filter for non-200 responses.
// Used by the API client to surface a useful message to the UI.
export interface ApiErrorPayload {
  statusCode: number;
  message: string | string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Vehicle types - mirror backend src/common/enums.ts.
// ---------------------------------------------------------------------------
export const VEHICLE_TYPES = [
  "TRUCK",
  "EXCAVATOR",
  "LOADER",
  "BULLDOZER",
  "CRANE",
  "PICKUP",
  "TANKER",
  "OTHER",
] as const;

export const VEHICLE_STATUSES = [
  "ACTIVE",
  "IDLE",
  "IN_MAINTENANCE",
  "OUT_OF_SERVICE",
  "RETIRED",
] as const;

export const FUEL_TYPES = [
  "DIESEL",
  "PETROL",
  "ELECTRIC",
  "HYBRID",
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];
export type FuelType = (typeof FUEL_TYPES)[number];

// Mirrors backend Vehicle entity (selected fields the UI consumes).
export interface ApiVehicle {
  id: string;
  // Server-issued asset tag (e.g. "AST-001"). Auto-generated on create.
  assetNumber: string;
  plateNumber: string;
  type: VehicleType;
  status: VehicleStatus;
  fuelType: FuelType;
  fuelCapacity: number;
  // Fuel economy in km/L.
  mileage: number;
  currentOdometer: number;
  // Site UUID (nullable). Join to ApiSite for display.
  siteId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Driver types.
// ---------------------------------------------------------------------------
// Ethiopian driving license classes.
//   PUBLIC_* (ህዝብ)    -> passenger / public-transport classes.
//   DRY_CARGO_* (ደረቅ) -> dry-cargo / freight classes.
// Order here is the order shown in select dropdowns.
export const LICENSE_CLASSES = [
  "PUBLIC_1",
  "PUBLIC_2",
  "PUBLIC_3",
  "DRY_CARGO_1",
  "DRY_CARGO_2",
  "DRY_CARGO_3",
] as const;

// Bilingual (English + Amharic) label for each license class. Used by every
// dropdown and detail view so the displayed name matches the local licensing
// scheme. The short form is convenient for compact pills in list rows.
export const LICENSE_CLASS_LABELS: Record<
  (typeof LICENSE_CLASSES)[number],
  { long: string; short: string }
> = {
  PUBLIC_1: { long: "Public 1 (ህዝብ - 1)", short: "Public 1" },
  PUBLIC_2: { long: "Public 2 (ህዝብ - 2)", short: "Public 2" },
  PUBLIC_3: { long: "Public 3 (ህዝብ - 3)", short: "Public 3" },
  DRY_CARGO_1: { long: "Dry Cargo 1 (ደረቅ - 1)", short: "Dry Cargo 1" },
  DRY_CARGO_2: { long: "Dry Cargo 2 (ደረቅ - 2)", short: "Dry Cargo 2" },
  DRY_CARGO_3: { long: "Dry Cargo 3 (ደረቅ - 3)", short: "Dry Cargo 3" },
};

// Pretty-print a LicenseClass. Falls back to prettyEnum for any unknown
// value (e.g. legacy A/B/C drivers from before the migration) so the UI
// doesn't render an empty string.
export function formatLicenseClass(
  value: LicenseClass | string,
  variant: "long" | "short" = "long",
): string {
  const label = LICENSE_CLASS_LABELS[value as LicenseClass];
  return label ? label[variant] : prettyEnum(String(value));
}

export const DRIVER_STATUSES = [
  "ACTIVE",
  "ON_LEAVE",
  "SUSPENDED",
  "TERMINATED",
] as const;

export type LicenseClass = (typeof LICENSE_CLASSES)[number];
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

// Mirrors backend Driver entity. assignedVehicleId is the link between
// drivers and vehicles - vehicles do not store the inverse FK.
export interface ApiDriver {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  licenseClass: LicenseClass;
  licenseExpiry: string;
  phoneNumber: string;
  email?: string | null;
  hireDate: string;
  status: DriverStatus;
  assignedVehicleId?: string | null;
  // Optional nested vehicle, present when the backend joins it in.
  assignedVehicle?: ApiVehicle | null;
  siteId?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// Pretty-print a code-style enum value (e.g. "IN_MAINTENANCE" -> "In Maintenance").
export function prettyEnum(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

// ---------------------------------------------------------------------------
// Trip types - mirror backend TripStatus enum.
// ---------------------------------------------------------------------------
export const TRIP_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type TripStatus = (typeof TRIP_STATUSES)[number];

// Slim vehicle shape nested on trip list responses.
export interface TripVehicleSummary {
  id: string;
  assetNumber?: string | null;
  plateNumber: string;
  type: VehicleType;
}

// Slim driver shape nested on trip list responses.
export interface TripDriverSummary {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
}

export interface ApiTrip {
  id: string;
  vehicleId: string;
  driverId?: string | null;
  status: TripStatus;
  startAddress: string;
  startCity?: string | null;
  startState?: string | null;
  startLat?: number | null;
  startLon?: number | null;
  endAddress: string;
  endCity?: string | null;
  endState?: string | null;
  endLat?: number | null;
  endLon?: number | null;
  scheduledAt?: string | null;
  // ISO timestamp set when the trip transitions to IN_PROGRESS via the
  // checkout action. Powers the live elapsed-time counter in the UI.
  startedAt?: string | null;
  // ISO timestamp set when the trip transitions to COMPLETED via the
  // check-in action. Required for downstream reporting (durations, costs).
  completedAt?: string | null;
  // Persisted distance for the trip in kilometres, populated at check-in
  // time by the client (LocationIQ driving distance with a haversine
  // fallback). Nullable for trips checked in before this field shipped.
  distanceKm?: number | null;
  // Round-trip flag — when true the driver returns to the starting
  // location, so the distance preview and check-in distance include the
  // return leg (A → B → A) instead of just A → B.
  isRoundTrip?: boolean;
  notes?: string | null;
  vehicle?: TripVehicleSummary;
  driver?: TripDriverSummary | null;
  createdAt?: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Custom trip routes - admin-defined start/end presets surfaced on the
// trip-creation form as "Custom" pickers. Mirrors backend CustomTripRoute.
// ---------------------------------------------------------------------------
export interface ApiCustomTripRoute {
  id: string;
  startName: string;
  // City / state are persisted silently. Older rows or settings-form
  // submissions may leave them empty, so both reads and writes treat
  // them as optional / nullable.
  startCity?: string | null;
  startState?: string | null;
  endName: string;
  endCity?: string | null;
  endState?: string | null;
  // Admin-entered driving distance in kilometres between start and end.
  distanceKm: number;
  createdAt?: string;
  updatedAt?: string;
}

// Effective trip target returned by GET /trip-targets/effective. `count`
// is the value the UI should display for the requested date (override
// if present, otherwise default). `defaultCount` and `isOverride` let
// the UI render a "Reset" affordance only when it actually changes
// anything.
export interface ApiTripTargetEffective {
  date: string;
  count: number;
  isOverride: boolean;
  defaultCount: number;
}

// ---------------------------------------------------------------------------
// Attendance roster types - mirror backend AttendanceDay / AttendancePunch.
// EXPECTED is the lazy default before any punches; PRESENT/ON_BREAK/DONE are
// derived from the punch stream; ABSENT only applies to past dates with no
// DAY_IN; ON_LEAVE is a manual override that survives recalculation.
// ---------------------------------------------------------------------------
export const ATTENDANCE_DAY_STATUSES = [
  "EXPECTED",
  "PRESENT",
  "ON_BREAK",
  "DONE",
  "ABSENT",
  "ON_LEAVE",
] as const;

export type AttendanceDayStatus = (typeof ATTENDANCE_DAY_STATUSES)[number];

// Discrete clock events on an AttendanceDay. DAY_IN/DAY_OUT bracket the
// shift; LUNCH_* and MAINT_* are paired in/out events for breaks within it.
export const ATTENDANCE_PUNCH_TYPES = [
  "DAY_IN",
  "DAY_OUT",
  "LUNCH_OUT",
  "LUNCH_IN",
  "MAINT_OUT",
  "MAINT_IN",
] as const;

export type AttendancePunchType = (typeof ATTENDANCE_PUNCH_TYPES)[number];

// One punch event against an AttendanceDay. Voided punches are kept so the
// audit trail stays intact - UI filters them out of derived calculations.
export interface ApiAttendancePunch {
  id: string;
  dayId: string;
  type: AttendancePunchType;
  // ISO timestamp.
  at: string;
  actorUserId?: string | null;
  note?: string | null;
  correctedFromPunchId?: string | null;
  isVoided: boolean;
  // Optional odometer value (in kilometres) captured at this punch. Lives
  // in the OdometerReading table on the backend but the roster response
  // joins it onto the punch for the UI's convenience. Sent as a numeric
  // string from Postgres; parse before display.
  odometer?: string | null;
  createdAt?: string;
}

// One row per (driver, site, calendar day). Returned by GET /attendance/roster
// with `driver`, `site`, and `punches` joined in. `status` is the derived
// roll-up state (or ON_LEAVE when manually overridden).
export interface ApiAttendanceDay {
  id: string;
  driverId: string;
  siteId: string;
  // YYYY-MM-DD calendar day.
  date: string;
  shift: "DAY" | "NIGHT" | "SPLIT";
  expected: boolean;
  status: AttendanceDayStatus;
  notes?: string | null;
  // Cached work distance for the shift, in kilometres, computed by the
  // backend as (LUNCH_OUT - DAY_IN) + (DAY_OUT - LUNCH_IN). When the
  // driver skipped lunch the backend falls back to DAY_OUT - DAY_IN.
  // Sent as a numeric string by Postgres (`numeric(12,2)`) so the UI
  // parses it before display. Null until enough odometer readings are
  // recorded to compute it.
  workDistanceKm?: string | null;
  // ISO timestamp set when the backend auto-closed a stale day on the
  // next read after midnight (because the driver forgot to punch out or
  // forgot to return from a break). Null on normally-closed days.
  autoClosedAt?: string | null;
  // Comma-separated list of auto-close reason codes from a fixed
  // vocabulary: MISSING_DAY_OUT, MISSING_LUNCH_RETURN, MISSING_MAINT_RETURN.
  // The UI splits on "," to render one badge per reason.
  autoCloseReason?: string | null;
  driver?: ApiDriver | null;
  site?: ApiSite | null;
  punches?: ApiAttendancePunch[];
  createdAt?: string;
  updatedAt?: string;
}

// Global attendance schedule and working-hours target configured in Settings.
export interface ApiAttendanceRules {
  dayInTime: string;
  lunchOutTime: string;
  lunchInTime: string;
  dayOutTime: string;
  targetHours: number;
}

// ---------------------------------------------------------------------------
// Fuel consumption types — mirror backend FuelConsumptionDayDto.
// ---------------------------------------------------------------------------

/** Slim driver snapshot on a fuel consumption roster row. */
export interface ApiFuelConsumptionDriver {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
}

/** Slim site snapshot on a fuel consumption roster row. */
export interface ApiFuelConsumptionSite {
  id: string;
  name: string;
}

/** Slim vehicle snapshot on a fuel consumption roster row. */
export interface ApiFuelConsumptionVehicle {
  id: string;
  plateNumber: string;
  assetNumber?: string | null;
  mileage: number;
  fuelType: FuelType;
}

/** Latest odometer reading per punch type for the day. */
export interface ApiFuelOdometerSummary {
  dayIn?: number | null;
  lunchOut?: number | null;
  lunchIn?: number | null;
  dayOut?: number | null;
}

/** One driver-day row from GET /fuel/consumption/roster. */
export interface ApiFuelConsumptionDay {
  attendanceDayId: string;
  date: string;
  driverId: string;
  siteId: string;
  workDistanceKm?: string | null;
  autoCloseReason?: string | null;
  driver?: ApiFuelConsumptionDriver | null;
  site?: ApiFuelConsumptionSite | null;
  vehicleId?: string | null;
  vehicle?: ApiFuelConsumptionVehicle | null;
  ratedKmPerLitre?: number | null;
  estimatedLiters?: number | null;
  distanceIncomplete: boolean;
  odometerSummary?: ApiFuelOdometerSummary | null;
}

// Global time / locale settings — IANA timezone + 12h vs 24h format
// preference. Configured in Settings → Time and used app-wide for any
// surface that renders timestamps.
export interface ApiTimeSettings {
  timezone: string;
  timeFormat: "12" | "24";
}

// ---------------------------------------------------------------------------
// Site health scoring — snapshots from GET /sites/health
// ---------------------------------------------------------------------------

export type SiteHealthStatusBand = "GOOD" | "WATCH" | "CRITICAL";

export interface ApiSiteHealthDimension {
  value: number;
  normalized: number;
  weight: number;
  rescaledWeight: number;
  applicable: boolean;
}

export interface ApiSiteHealthScore {
  siteId: string;
  date: string;
  score: number | null;
  status: SiteHealthStatusBand | null;
  insufficientData: boolean;
  dimensions: {
    driverAttendance: ApiSiteHealthDimension;
    vehicleAvailability: ApiSiteHealthDimension;
    tripTargetAchievement: ApiSiteHealthDimension;
    scheduleCompliance: ApiSiteHealthDimension;
    fuelEfficiencyVariance: ApiSiteHealthDimension;
    dataCompleteness: ApiSiteHealthDimension;
  };
  trucks: { total: number; onsite: number };
  trips: { completed: number; total: number; target: number };
  fuel: { liters: number };
  computedAt: string;
}

export interface SiteScoringWeights {
  driverAttendance: number;
  vehicleAvailability: number;
  tripTargetAchievement: number;
  scheduleCompliance: number;
  fuelEfficiencyVariance: number;
  dataCompleteness: number;
}

export interface SiteScoringBands {
  goodMin: number;
  watchMin: number;
}

export interface ApiSiteScoringConfig {
  weights: SiteScoringWeights;
  bands: SiteScoringBands;
  dataCompletenessFloor: number;
}

// ---------------------------------------------------------------------------
// Fleet activity report — GET /reports/fleet-activity
// ---------------------------------------------------------------------------

export interface ApiFleetActivitySiteRow {
  siteId: string;
  siteName: string;
  tripsCompleted: number;
  tripsStarted: number;
  fuelLiters: number;
  fuelCost: number;
  checkIns: number;
  checkOuts: number;
}

export interface ApiFleetActivityReport {
  windowStart: string;
  windowEnd: string;
  totals: {
    tripsCompleted: number;
    tripsStarted: number;
    fuelLiters: number;
    fuelCost: number;
    checkIns: number;
    checkOuts: number;
    activeSites: number;
  };
  perSite: ApiFleetActivitySiteRow[];
}
