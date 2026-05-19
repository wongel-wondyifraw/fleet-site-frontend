import type { Metadata } from "next";
import { JetBrains_Mono, Work_Sans } from "next/font/google";
import "./globals.css";

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

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
    <html lang="en" className={`${workSans.variable} ${jetbrainsMono.variable} light`}>
      <body className="m-0 min-h-dvh overflow-x-hidden bg-background p-0 antialiased">
        {children}
      </body>
    </html>
  );
}
