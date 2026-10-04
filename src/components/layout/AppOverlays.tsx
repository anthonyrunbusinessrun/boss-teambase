"use client";

import { ProfileModal } from "@/components/profile/ProfileModal";
import { SettingsModal } from "@/components/settings/SettingsModal";

/** Overlays reachable from anywhere (header user menu, team cards): profile + settings. */
export function AppOverlays() {
  return (
    <>
      <ProfileModal />
      <SettingsModal />
    </>
  );
}
