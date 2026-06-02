const DEFAULT_LOCALE = "en-US";

export function formatSiteHealthPercent(
  ratio: number,
  locale: string = DEFAULT_LOCALE,
): string {
  if (!Number.isFinite(ratio)) return "—";
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(ratio);
}

export function formatSiteHealthScore(
  score: number | null,
  locale: string = DEFAULT_LOCALE,
): string {
  if (score == null || !Number.isFinite(score)) return "—";
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(score);
}

export function formatFuelLiters(
  liters: number,
  locale: string = DEFAULT_LOCALE,
): string {
  if (!Number.isFinite(liters)) return "—";
  try {
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit: "liter",
      unitDisplay: "narrow",
      maximumFractionDigits: 0,
    }).format(liters);
  } catch {
    return `${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
    }).format(liters)} L`;
  }
}

export function formatCount(
  value: number,
  locale: string = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(value);
}
