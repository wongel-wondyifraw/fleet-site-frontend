// Curated list of IANA timezones used by the Time settings selector.
// Grouped roughly by region; ordered by typical GMT offset within each
// group. Not exhaustive — covers the zones most likely to be picked
// for a fleet operation. Selecting "Other" is not supported (the
// dropdown is the source of truth) so the backend rejects unknown
// IANA names defensively.

export interface TimezoneOption {
  value: string;
  label: string;
  region: string;
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  // Africa
  { value: "Africa/Casablanca", label: "Casablanca (GMT+1)", region: "Africa" },
  { value: "Africa/Lagos", label: "Lagos (GMT+1)", region: "Africa" },
  { value: "Africa/Cairo", label: "Cairo (GMT+2)", region: "Africa" },
  { value: "Africa/Johannesburg", label: "Johannesburg (GMT+2)", region: "Africa" },
  { value: "Africa/Addis_Ababa", label: "Addis Ababa (GMT+3)", region: "Africa" },
  { value: "Africa/Nairobi", label: "Nairobi (GMT+3)", region: "Africa" },

  // Middle East
  { value: "Asia/Riyadh", label: "Riyadh (GMT+3)", region: "Middle East" },
  { value: "Asia/Dubai", label: "Dubai (GMT+4)", region: "Middle East" },
  { value: "Asia/Tehran", label: "Tehran (GMT+3:30)", region: "Middle East" },
  { value: "Asia/Jerusalem", label: "Jerusalem (GMT+2/3)", region: "Middle East" },

  // Europe
  { value: "Europe/London", label: "London (GMT+0/1)", region: "Europe" },
  { value: "Europe/Berlin", label: "Berlin (GMT+1/2)", region: "Europe" },
  { value: "Europe/Paris", label: "Paris (GMT+1/2)", region: "Europe" },
  { value: "Europe/Madrid", label: "Madrid (GMT+1/2)", region: "Europe" },
  { value: "Europe/Rome", label: "Rome (GMT+1/2)", region: "Europe" },
  { value: "Europe/Istanbul", label: "Istanbul (GMT+3)", region: "Europe" },
  { value: "Europe/Moscow", label: "Moscow (GMT+3)", region: "Europe" },

  // Asia
  { value: "Asia/Karachi", label: "Karachi (GMT+5)", region: "Asia" },
  { value: "Asia/Kolkata", label: "Kolkata (GMT+5:30)", region: "Asia" },
  { value: "Asia/Bangkok", label: "Bangkok (GMT+7)", region: "Asia" },
  { value: "Asia/Singapore", label: "Singapore (GMT+8)", region: "Asia" },
  { value: "Asia/Shanghai", label: "Shanghai (GMT+8)", region: "Asia" },
  { value: "Asia/Tokyo", label: "Tokyo (GMT+9)", region: "Asia" },

  // Oceania
  { value: "Australia/Perth", label: "Perth (GMT+8)", region: "Oceania" },
  { value: "Australia/Sydney", label: "Sydney (GMT+10/11)", region: "Oceania" },
  { value: "Pacific/Auckland", label: "Auckland (GMT+12/13)", region: "Oceania" },

  // Americas
  { value: "America/New_York", label: "New York (GMT-5/-4)", region: "Americas" },
  { value: "America/Chicago", label: "Chicago (GMT-6/-5)", region: "Americas" },
  { value: "America/Denver", label: "Denver (GMT-7/-6)", region: "Americas" },
  { value: "America/Los_Angeles", label: "Los Angeles (GMT-8/-7)", region: "Americas" },
  { value: "America/Sao_Paulo", label: "São Paulo (GMT-3)", region: "Americas" },
  { value: "America/Mexico_City", label: "Mexico City (GMT-6/-5)", region: "Americas" },

  // UTC
  { value: "UTC", label: "UTC (GMT+0)", region: "UTC" },
];

export const DEFAULT_TIMEZONE = "Africa/Addis_Ababa";
export const DEFAULT_TIME_FORMAT: "12" | "24" = "12";

export function findTimezoneOption(value: string): TimezoneOption | undefined {
  return TIMEZONE_OPTIONS.find((opt) => opt.value === value);
}
