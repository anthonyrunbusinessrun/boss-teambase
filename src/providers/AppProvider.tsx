"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "@/components/shared/States";
import { channelService, errorMessage, memberService, sessionService, settingsService } from "@/services";
import { getZone, type ZoneDef } from "@/lib/zones";
import type { ID, Settings, TeamMember } from "@/types/models";

type SettingsChanges = Parameters<typeof settingsService.update>[0];

interface AppContextValue {
  me: TeamMember;
  members: TeamMember[];
  settings: Settings;
  primaryZone: ZoneDef;
  secondaryZone: ZoneDef;
  /** Total unread conversations (drives the Channels badge). */
  unread: number;
  refreshMembers: () => Promise<void>;
  refreshUnread: () => Promise<void>;
  updateSettings: (changes: SettingsChanges) => Promise<void>;
  /** Overlays hosted by the shell. */
  profileId: ID | null;
  settingsOpen: boolean;
  openProfile: (memberId?: ID) => void;
  closeProfile: () => void;
  openSettings: () => void;
  closeSettings: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

interface Bootstrap {
  userId: ID;
  members: TeamMember[];
  settings: Settings;
  unread: number;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<ID | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [session, members, settings, convos] = await Promise.all([
        sessionService.get(),
        memberService.list(),
        settingsService.get(),
        channelService.list(),
      ]);
      setBoot({ userId: session.userId, members, settings, unread: convos.unreadTotal });
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([sessionService.get(), memberService.list(), settingsService.get(), channelService.list()])
      .then(([session, members, settings, convos]) => {
        if (!cancelled) setBoot({ userId: session.userId, members, settings, unread: convos.unreadTotal });
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const motion = boot?.settings.reduceMotion;
  useEffect(() => {
    if (motion === undefined) return;
    document.documentElement.dataset.reduceMotion = String(motion);
  }, [motion]);

  const refreshMembers = useCallback(async () => {
    const members = await memberService.list();
    setBoot((b) => (b ? { ...b, members } : b));
  }, []);

  const refreshUnread = useCallback(async () => {
    const { unreadTotal } = await channelService.list();
    setBoot((b) => (b ? { ...b, unread: unreadTotal } : b));
  }, []);

  const updateSettings = useCallback(async (changes: SettingsChanges) => {
    const settings = await settingsService.update(changes);
    setBoot((b) => (b ? { ...b, settings } : b));
  }, []);

  const value = useMemo<AppContextValue | null>(() => {
    if (!boot) return null;
    const me = boot.members.find((m) => m.id === boot.userId) ?? boot.members[0];
    return {
      me,
      members: boot.members,
      settings: boot.settings,
      primaryZone: getZone(boot.settings.primaryZoneId),
      secondaryZone: getZone(boot.settings.secondaryZoneId),
      unread: boot.unread,
      refreshMembers,
      refreshUnread,
      updateSettings,
      profileId,
      settingsOpen,
      openProfile: (memberId) => setProfileId(memberId ?? boot.userId),
      closeProfile: () => setProfileId(null),
      openSettings: () => setSettingsOpen(true),
      closeSettings: () => setSettingsOpen(false),
    };
  }, [boot, profileId, settingsOpen, refreshMembers, refreshUnread, updateSettings]);

  if (error && !value) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  if (!value) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <LoadingState label="Loading Teambase…" />
      </div>
    );
  }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
