import type { Metadata } from "next";
import { JetBrains_Mono, Work_Sans } from "next/font/google";
import "./globals.css";

// AuthProvider owns the authenticated user state for the whole app.
import { AuthProvider } from "@/lib/auth/AuthContext";

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
      </body>
    </html>
  );
}
