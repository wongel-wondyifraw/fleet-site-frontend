"use client";

// Compact "Install app" button shown only on supported browsers (Chromium /
// Android Chrome) and only while the PWA is not already installed.
//
// How it works:
//  - The browser fires `beforeinstallprompt` once it decides the site is
//    installable. We stash the event and reveal the button.
//  - Tapping the button calls .prompt() on the stashed event, then hides
//    itself based on the user's choice or the `appinstalled` event.
//  - We also bail out early when the app is already running in standalone
//    display mode (i.e. it was installed) or on iOS Safari where the
//    Add-to-Home-Screen flow lives in the system share sheet and there is
//    no programmatic prompt API.
import { Download } from "@/lib/icons";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

// Minimal shape of the BeforeInstallPromptEvent (not in lib.dom typings).
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  // Standard PWA check.
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari uses a non-standard navigator.standalone flag.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

export function InstallPWAButton() {
  // Deferred install prompt - kept in state so re-renders see the latest one.
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  // Already running as an installed PWA? Then never show the install button.
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandaloneDisplay());

    function onBeforeInstall(event: Event) {
      // Block Chrome's mini-infobar so we can show our own button instead.
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    function onAppInstalled() {
      setDeferredPrompt(null);
      setInstalled(true);
    }
    function onDisplayChange(e: MediaQueryListEvent) {
      if (e.matches) setInstalled(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);
    const mql = window.matchMedia?.("(display-mode: standalone)");
    mql?.addEventListener?.("change", onDisplayChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
      mql?.removeEventListener?.("change", onDisplayChange);
    };
  }, []);

  const handleClick = useCallback(async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstalled(true);
      }
    } catch (err) {
      // Browser may throw if prompt() was already called or the event is
      // stale; either way the right move is to drop the prompt.
      if (process.env.NODE_ENV !== "production") {
        console.warn("PWA install prompt failed:", err);
      }
    } finally {
      // beforeinstallprompt events are one-shot - discard regardless.
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  // Hide the button when the app is installed or no prompt is available
  // (e.g. iOS Safari, or browser hasn't decided we're installable yet).
  if (installed || !deferredPrompt) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={handleClick}
      className="size-9 shrink-0 rounded-xl text-primary hover:bg-primary/10"
      aria-label="Install FleetSite app"
      title="Install FleetSite"
    >
      <Download className="size-4" />
    </Button>
  );
}
