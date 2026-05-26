import type { MetadataRoute } from "next";

// PWA manifest. Next.js serves this at /manifest.webmanifest and automatically
// links it in the document head from the App Router. Together with the
// service worker registered by ServiceWorkerRegister and the brand icons in
// /public, this gives the site Add-to-Home-Screen / "Install app" support
// on Chrome (desktop + Android), Edge, Safari (iOS via apple-touch-icon),
// and other Chromium-based browsers.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FleetSite",
    short_name: "FleetSite",
    description: "Site operations portal for fleet, drivers, and vehicles.",
    // start_url is what the standalone app loads when launched from the home
    // screen. We send users to the dashboard - the layout itself bounces
    // unauthenticated users back to the login screen.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    // Matches --palette-primary so the browser chrome / splash screen tints
    // the same blue as the in-app brand.
    theme_color: "#123570",
    categories: ["business", "productivity", "utilities"],
    icons: [
      {
        src: "/Fleetsite.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/Fleetsite.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/Fleetsite.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
