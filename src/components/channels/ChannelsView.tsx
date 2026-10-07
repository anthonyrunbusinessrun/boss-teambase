"use client";

import { useCallback, useEffect, useState } from "react";
import { ChannelList } from "./ChannelList";
import { ConversationView } from "./ConversationView";
import { ErrorState, LoadingState } from "@/components/shared/States";
import { useParamSelection } from "@/hooks/useParamSelection";
import { useResource } from "@/hooks/useResource";
import { channelService } from "@/services";
import { useToast } from "@/providers/ToastProvider";
import styles from "./Channels.module.css";

export function ChannelsView() {
  const list = useResource(channelService.list);
  const [paramSel, setSel] = useParamSelection("c");
  const toast = useToast();
  const reload = list.reload;
  const onListChanged = useCallback(() => void reload(), [reload]);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const events = new EventSource("/api/channels/events");
    events.onmessage = () => {
      setRefreshToken((value) => value + 1);
      void reload();
    };
    return () => events.close();
  }, [reload]);

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
  if (list.error || !list.data) return <ErrorState message={list.error ?? "Couldn't load channels."} onRetry={list.reload} />;

  const convos = list.data.conversations;
  const fallback = convos.find((c) => c.favorite) ?? convos[0];
  const selected = convos.find((c) => c.id === paramSel) ?? fallback;

  return (
    <div className={styles.layout}>
      <div className={styles.pane} style={{ minHeight: 0 }}>
        <ChannelList conversations={convos} selectedId={selected?.id ?? null} onSelect={setSel} onCreate={createChannel} />
      </div>
      {selected && <ConversationView key={selected.id} id={selected.id} refreshToken={refreshToken} onListChanged={onListChanged} onDeleted={() => { setSel(""); void reload(); }} />}
    </div>
  );
}
