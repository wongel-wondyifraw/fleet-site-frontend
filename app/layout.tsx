import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Work_Sans } from "next/font/google";
import "./globals.css";

// AuthProvider owns the authenticated user state for the whole app.
import { AuthProvider } from "@/lib/auth/AuthContext";
// Registers the PWA service worker so the site is installable and serves an
// offline fallback. No-op in development; see the component for details.
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";

// Display font configured via next/font for performance.
const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

// Mono font for code/numeric displays.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["600"],
});

export const metadata: Metadata = {
  title: "FleetSite | Sign In",
  description: "Access your site dashboard and vehicle tracking.",
  // applicationName + appleWebApp give iOS Safari the metadata it needs to
  // treat the site as a full-screen app when added to the home screen.
  applicationName: "FleetSite",
  appleWebApp: {
    capable: true,
    title: "FleetSite",
    statusBarStyle: "default",
  },
  // Apple devices ignore the manifest's icons array - they look for
  // <link rel="apple-touch-icon"> instead.
  icons: {
    apple: [{ url: "/Fleetsite.png", sizes: "180x180", type: "image/png" }],
  },
  // Formats addresses / phone numbers as plain text instead of auto-linking
  // them, which is what we want for a tool-style app.
  formatDetection: { telephone: false },
};

// `viewport` is the Next 15 location for theme-color and viewport tags.
// theme_color in the manifest also still matters, but this one drives the
// system UI on Chrome / Android in real time.
export const viewport: Viewport = {
  themeColor: "#123570",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning on <html> only: browser extensions (e.g. Scribe,
    // Grammarly, ColorZilla) inject attributes like data-scribe-recorder-ready
    // after SSR, which would otherwise trigger React hydration mismatch warnings.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${workSans.variable} ${jetbrainsMono.variable} light`}
    >
      <body
        suppressHydrationWarning
        className="m-0 min-h-dvh overflow-x-hidden bg-background p-0 antialiased"
      >
        {/* AuthProvider hydrates the user from localStorage and exposes useAuth() to the tree. */}
        <AuthProvider>{children}</AuthProvider>
        {/* Registers the PWA service worker (production-only). */}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
