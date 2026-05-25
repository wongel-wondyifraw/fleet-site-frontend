// Mirrors backend src/common/enums.ts UserRole - kept in sync manually.
export type UserRole = "ADMIN" | "SITE_MANAGER" | "TIME_KEEPER";

// Ordered list of roles used by select inputs and filter dropdowns.
export const USER_ROLES: UserRole[] = ["ADMIN", "SITE_MANAGER", "TIME_KEEPER"];

// Pretty-print a role code for display (e.g. "SITE_MANAGER" -> "Site Manager").
export function formatRole(role: UserRole | string): string {
  return role
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
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
  role: UserRole;
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
  role: UserRole;
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
  // assignedSite stores the site UUID (nullable). The UI joins to ApiSite.
  assignedSite?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Driver types.
// ---------------------------------------------------------------------------
export const LICENSE_CLASSES = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "HEAVY_EQUIPMENT",
] as const;

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
  homeSite?: string | null;
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
