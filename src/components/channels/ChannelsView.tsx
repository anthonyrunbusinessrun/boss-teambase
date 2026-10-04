"use client";

import { useCallback } from "react";
import { ChannelList } from "./ChannelList";
import { ConversationView } from "./ConversationView";
import { ErrorState, LoadingState } from "@/components/shared/States";
import { useParamSelection } from "@/hooks/useParamSelection";
import { useResource } from "@/hooks/useResource";
import { channelService } from "@/services";
import styles from "./Channels.module.css";

export function ChannelsView() {
  const list = useResource(channelService.list);
  const [paramSel, setSel] = useParamSelection("c");
  const reload = list.reload;
  const onListChanged = useCallback(() => void reload(), [reload]);

  if (list.loading) return <LoadingState label="Loading channels…" />;
  if (list.error || !list.data) return <ErrorState message={list.error ?? "Couldn't load channels."} onRetry={list.reload} />;

  const convos = list.data.conversations;
  const fallback = convos.find((c) => c.favorite) ?? convos[0];
  const selected = convos.find((c) => c.id === paramSel) ?? fallback;

  return (
    <div className={styles.layout}>
      <div className={styles.pane} style={{ minHeight: 0 }}>
        <ChannelList conversations={convos} selectedId={selected?.id ?? null} onSelect={setSel} />
      </div>
      {selected && <ConversationView key={selected.id} id={selected.id} onListChanged={onListChanged} />}
    </div>
  );
}
