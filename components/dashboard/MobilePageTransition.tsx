"use client";

// Wraps the dashboard children so each route change replays a subtle
// fade + slide-in animation. The `key={pathname}` forces React to remount
// the subtree on navigation, which restarts the CSS animation. The effect
// only renders on mobile (`lg:animate-none`) since desktop uses a sidebar
// layout where animating the main panel would be distracting.
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function MobilePageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  return (
    <div
      key={pathname}
      className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out lg:animate-none lg:opacity-100"
    >
      {children}
    </div>
  );
}
