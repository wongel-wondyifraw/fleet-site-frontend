import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.3"],

  // Pin Turbopack's workspace root to this folder so Next stops warning
  // about the higher-up package-lock.json in the user profile and stops
  // trying to walk it. Quieter dev startup, fewer files in the watcher.
  turbopack: {
    root: __dirname,
  },

  // Tree-shake heavy named-export packages so dev bundles don't ship
  // every member of the module. react-feather is imported via the
  // lib/icons.ts barrel and would otherwise pull all ~280 icons into
  // every page chunk in dev mode, which inflates source maps and
  // exhausts the Chrome DevTools renderer heap ("Approaching the
  // memory limit" warning).
  experimental: {
    optimizePackageImports: ["react-feather"],
  },
};

export default nextConfig;
