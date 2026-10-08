"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChannelList } from "./ChannelList";
import { ConversationView } from "./ConversationView";
import { NewMessageModal } from "./NewMessageModal";
import { ErrorState, LoadingState } from "@/components/shared/States";
import { useParamSelection } from "@/hooks/useParamSelection";
import { useResource } from "@/hooks/useResource";
import { channelService } from "@/services";
import { useToast } from "@/providers/ToastProvider";
import { useRealtime, useRealtimeEvents } from "@/providers/RealtimeProvider";
import type { ID } from "@/types/models";
import styles from "./Channels.module.css";

export function ChannelsView() {
  const list = useResource(channelService.list);
  const [paramSel, setSel] = useParamSelection("c");
  const toast = useToast();
  const reload = list.reload;
  const onListChanged = useCallback(() => void reload(), [reload]);
  const rt = useRealtime();
  const [newMessageOpen, setNewMessageOpen] = useState(false);

  // The browser regained its network: catch up (the live connection also resyncs itself when it reconnects).
  useEffect(() => {
    const onOnline = () => void reload();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [reload]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The app-wide live connection tells us when the list may have changed (new message, new DM, deleted channel…).
  useRealtimeEvents((event) => {
    const relevant = event.type === "ready" || event.type === "conversation" || (event.type === "message" && event.change === "created");
    if (!relevant) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void reload(), 200);
  });

  /** Open a conversation, making sure the list already contains it (a brand-new DM isn't in it yet). */
  const openConversation = async (id: ID) => {
    await reload();
    setSel(id);
  };

  const startDirect = async (memberId: ID) => {
    try {
      const conversation = await channelService.openDirect(memberId);
      setNewMessageOpen(false);
      await openConversation(conversation.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start the conversation.");
    }
  };

  const createChannel = async () => {
    const name = window.prompt("Channel name (for example: product-launch)")?.trim();
    if (!name) return;
    try {
      const created = await channelService.create({ name });
      await reload();
      setSel(created.id);
      toast.success(`#${created.name} created`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create the channel.");
    }
  };

  if (list.loading) return <LoadingState label="Loading channels…" />;
  // Only when there is nothing to show. A failed refresh keeps the conversations already on screen.
  if (!list.data) return <ErrorState message={list.error ?? "Couldn't load channels."} onRetry={list.reload} />;

  const convos = list.data.conversations;
  const fallback = convos.find((c) => c.favorite) ?? convos[0];
  const selected = convos.find((c) => c.id === paramSel) ?? fallback;

  return (
    <>
      {rt.ready && !rt.connected && (
        <p className={styles.offlineBanner} role="status">
          Reconnecting… you can keep reading; new messages, typing and online status resume when the connection is back.
        </p>
      )}
    <div className={styles.layout}>
      <div className={styles.pane} style={{ minHeight: 0 }}>
        <ChannelList conversations={convos} selectedId={selected?.id ?? null} onSelect={setSel} onCreate={createChannel} onNewMessage={() => setNewMessageOpen(true)} />
      </div>
      {selected && <ConversationView key={selected.id} id={selected.id} onListChanged={onListChanged} onDeleted={() => { setSel(""); void reload(); }} onOpenConversation={openConversation} />}
      <NewMessageModal open={newMessageOpen} onClose={() => setNewMessageOpen(false)} onPick={startDirect} />
    </div>
    </>
  );
}
