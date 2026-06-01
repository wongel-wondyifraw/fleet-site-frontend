import Image from "next/image";

import { cn } from "@/lib/utils";

const sizeClasses = {
  xs: "h-9 w-9",
  sidebar: "h-28 w-28",
  sm: "h-48 w-48",
  md: "h-56 w-56",
  lg: "h-64 w-64",
} as const;

const sizePixels = {
  xs: 36,
  sidebar: 112,
  sm: 192,
  md: 224,
  lg: 256,
} as const;

type FleetSiteLogoProps = {
  className?: string;
  size?: keyof typeof sizeClasses;
};

export function FleetSiteLogo({ className, size = "sm" }: FleetSiteLogoProps) {
  const px = sizePixels[size];
  return (
    <Image
      src="/Fleetsite.svg"
      alt="FleetSite"
      width={px}
      height={px}
      priority={size === "sidebar"}
      className={cn("shrink-0 object-contain", sizeClasses[size], className)}
    />
  );
}
