/** i18n-ready keys for site health UI copy. */
export const SITE_HEALTH_LABELS = {
  "siteHealth.status.good": "Good",
  "siteHealth.status.watch": "Watch",
  "siteHealth.status.critical": "Critical",
  "siteHealth.status.insufficient": "Insufficient data",
  "siteHealth.dimension.attendance": "Driver attendance",
  "siteHealth.dimension.vehicles": "Vehicle availability",
  "siteHealth.dimension.trips": "Trip target",
  "siteHealth.dimension.schedule": "Schedule compliance",
  "siteHealth.dimension.fuel": "Fuel efficiency",
  "siteHealth.dimension.data": "Data completeness",
  "siteHealth.breakdown.title": "Score breakdown",
  "siteHealth.trucksOnSite": "trucks on site",
  "siteHealth.tripsToday": "trips today",
  "siteHealth.fuelToday": "fuel today",
} as const;

export type SiteHealthLabelKey = keyof typeof SITE_HEALTH_LABELS;

export function siteHealthLabel(key: SiteHealthLabelKey): string {
  return SITE_HEALTH_LABELS[key];
}
