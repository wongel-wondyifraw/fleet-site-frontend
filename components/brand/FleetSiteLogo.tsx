import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "h-48 w-48",
  md: "h-56 w-56",
  lg: "h-64 w-64",
} as const;

const sizePixels = {
  sm: 192,
  md: 224,
  lg: 256,
} as const;

type FleetSiteLogoProps = {
  className?: string;
  size?: keyof typeof sizeClasses;
};

export function FleetSiteLogo({ className, size = "sm" }: FleetSiteLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/Fleetsite.svg"
      alt="FleetSite"
      width={sizePixels[size]}
      height={sizePixels[size]}
      className={cn("shrink-0 object-contain", sizeClasses[size], className)}
    />
  );
}
