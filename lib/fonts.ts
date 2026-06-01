import localFont from "next/font/local";

export const workSans = localFont({
  src: "../app/fonts/work-sans.woff2",
  variable: "--font-work-sans",
  display: "swap",
  weight: "100 900",
});

export const jetbrainsMono = localFont({
  src: "../app/fonts/jetbrains-mono.woff2",
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: "100 800",
});
