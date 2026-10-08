"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, MessageSquare, Pencil, Pin, Search, SearchX, Trash2, X } from "lucide-react";
import { PresenceDot } from "@/components/shared/Avatar";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/States";
import { useApp } from "@/providers/AppProvider";
import { useRealtime, useRealtimeEvents } from "@/providers/RealtimeProvider";
import { useToast } from "@/providers/ToastProvider";
import { useResource } from "@/hooks/useResource";
import { channelService, errorMessage } from "@/services";
import { cx } from "@/lib/utils";
import type { Attachment, ChatMessage, ConversationDetail, ID } from "@/types/models";
import { Composer } from "./Composer";
import { MembersPanel } from "./MembersPanel";
import { MessageItem } from "./MessageItem";
import { TypingIndicator } from "./TypingIndicator";
import styles from "./Channels.module.css";

interface ConversationViewProps {
  id: string;
  /** Called when something changed that affects the list (read state, favorite). */
  onListChanged: () => void;
  onDeleted: () => void;
  /** Switch to another conversation (used after starting a private message from the members panel). */
  onOpenConversation: (id: string) => void | Promise<void>;
}

/** Thread + details for one conversation. Keyed by id so state resets when you switch. */
export function ConversationView({ id, onListChanged, onDeleted, onOpenConversation }: ConversationViewProps) {
  const fetcher = useCallback(() => channelService.detail(id), [id]);
  const detail = useResource(fetcher);

  if (detail.loading) {
    return (
      <>
        <div className={styles.pane}>
          <LoadingState label="Loading conversation…" />
        </div>
        <aside className={cx(styles.pane, styles.details)} aria-hidden="true" />
      </>
    );
  }
  if (!detail.data) {
    return (
      <>
        <div className={styles.pane}>
          <ErrorState message={detail.error ?? "Couldn't load this conversation."} onRetry={detail.reload} />
        </div>
        <aside className={cx(styles.pane, styles.details)} aria-hidden="true" />
      </>
    );
  }

  return <Loaded data={detail.data} update={detail.setData} reload={detail.reload} onListChanged={onListChanged} onDeleted={onDeleted} onOpenConversation={onOpenConversation} />;
}

type Update = React.Dispatch<React.SetStateAction<ConversationDetail | undefined>>;

/** Apply updated/new messages to the thread: replace by id, otherwise insert in time order. */
function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  let added = false;
  for (const m of incoming) {
    if (!byId.has(m.id)) added = true;
    byId.set(m.id, m);
  }
  const next = Array.from(byId.values());
  return added ? next.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : next;
}

const NEAR_BOTTOM_PX = 140;
const TYPING_EXPIRES_MS = 7_000;

interface LoadedProps {
  data: ConversationDetail;
  update: Update;
  reload: () => Promise<void>;
  onListChanged: () => void;
  onDeleted: () => void;
  onOpenConversation: (id: string) => void | Promise<void>;
}

function Loaded({ data, update, reload, onListChanged, onDeleted, onOpenConversation }: LoadedProps) {
  const { conversation: c, messages, members } = data;
  const { me, primaryZone, refreshUnread } = useApp();
  const rt = useRealtime();
  const toast = useToast();
  const tz = primaryZone.tz;
  const [finding, setFinding] = useState(false);
  const [find, setFind] = useState("");
  const [newBelow, setNewBelow] = useState(false);
  const [typers, setTypers] = useState<Record<ID, { name: string; until: number }>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const pendingSeen = useRef(c.unread > 0);

  const q = find.trim().toLowerCase();
  const shown = q ? messages.filter((m) => m.body.toLowerCase().includes(q) || m.authorName.toLowerCase().includes(q)) : messages;

  /* ----- scrolling: follow new messages only while you're at the bottom (or when you wrote them) ----- */
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const lastId = messages.at(-1)?.id;
  const lastIsMine = messages.at(-1)?.authorMemberId === me.id;
  useLayoutEffect(() => {
    if (nearBottom.current || lastIsMine) scrollToBottom();
  }, [lastId, lastIsMine, q, scrollToBottom]);

  /* ----- seen: "the person is actually looking at this conversation" ----- */
  const trySeen = useCallback(() => {
    if (!pendingSeen.current || document.visibilityState !== "visible") return;
    pendingSeen.current = false;
    channelService
      .markSeen(c.id)
      .then((r) => {
        if (r.changed) {
          onListChanged();
          void refreshUnread().catch(() => undefined);
        }
      })
      .catch(() => {
        pendingSeen.current = true;
      });
  }, [c.id, onListChanged, refreshUnread]);

  useEffect(() => {
    trySeen(); // opened with unread messages
    const onVisible = () => document.visibilityState === "visible" && nearBottom.current && trySeen();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [trySeen]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (nearBottom.current) {
      setNewBelow(false);
      trySeen();
    }
  };

  /* ----- live updates ----- */
  const mergeIn = useCallback((incoming: ChatMessage[]) => update((cur) => cur && { ...cur, messages: mergeMessages(cur.messages, incoming) }), [update]);

  useRealtimeEvents((ev) => {
    if (ev.type === "message" && ev.conversationId === c.id) {
      channelService
        .messages(c.id, ev.messageIds)
        .then(({ messages: fresh }) => {
          mergeIn(fresh);
          const fromOthers = fresh.filter((m) => m.authorMemberId !== me.id);
          if (ev.change === "created" && fromOthers.length) {
            // Whoever wrote it has finished typing.
            setTypers((cur) => {
              const next = { ...cur };
              for (const m of fromOthers) if (m.authorMemberId) delete next[m.authorMemberId];
              return next;
            });
            pendingSeen.current = true;
            if (nearBottom.current && document.visibilityState === "visible") trySeen();
            else setNewBelow(true);
          }
        })
        // A blip while fetching must not lose the update: fall back to reloading the whole thread shortly after.
        .catch(() => void setTimeout(() => void reload(), 2000));
    } else if (ev.type === "typing" && ev.conversationId === c.id && ev.memberId !== me.id) {
      setTypers((cur) => {
        if (!ev.typing) {
          const { [ev.memberId]: _gone, ...rest } = cur;
          void _gone;
          return rest;
        }
        return { ...cur, [ev.memberId]: { name: ev.name, until: Date.now() + TYPING_EXPIRES_MS } };
      });
    } else if (ev.type === "conversation" && ev.conversationId === c.id) {
      if (ev.change === "deleted") onDeleted();
      else if (ev.change === "updated") void reload();
    } else if (ev.type === "ready") {
      void reload(); // reconnected: catch up on anything missed
    }
  });

  // Back online after losing the network: catch up on anything we missed.
  useEffect(() => {
    const onOnline = () => void reload();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [reload]);

  // Safety net: if a "stopped typing" event is ever lost, the indicator still clears itself.
  const anyTypers = Object.keys(typers).length > 0;
  useEffect(() => {
    if (!anyTypers) return;
    const timer = setInterval(() => setTypers((cur) => Object.fromEntries(Object.entries(cur).filter(([, t]) => t.until > Date.now()))), 1000);
    return () => clearInterval(timer);
  }, [anyTypers]);

  /* ----- actions ----- */
  const replaceMessage = (m: ChatMessage) => mergeIn([m]);

  const togglePin = async () => {
    const next = !c.favorite;
    update((cur) => cur && { ...cur, conversation: { ...cur.conversation, favorite: next } });
    try {
      await channelService.setFavorite(c.id, next);
      onListChanged();
      toast.success(next ? `Pinned ${label(c)} to Favorites` : `Removed ${label(c)} from Favorites`);
    } catch (e) {
      update((cur) => cur && { ...cur, conversation: { ...cur.conversation, favorite: !next } });
      toast.error(errorMessage(e));
    }
  };

  const editChannel = async () => {
    const nextName = window.prompt("Channel name", c.name)?.trim();
    if (!nextName || nextName === c.name) return;
    try {
      const changed = await channelService.update(c.id, { name: nextName });
      update((current) => current && { ...current, conversation: changed });
      onListChanged();
      toast.success(`Channel renamed to #${changed.name}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const deleteConversation = async () => {
    if (!window.confirm(`Delete ${label(c)} and all of its messages? This can't be undone.`)) return;
    try {
      await channelService.remove(c.id);
      toast.success(`${label(c)} deleted`);
      onDeleted();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const react = async (m: ChatMessage, emoji: string) => {
    try {
      replaceMessage(await channelService.react(c.id, m.id, emoji));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const send = async (body: string, attachments: Attachment[]) => {
    const msg = await channelService.send(c.id, body, attachments);
    mergeIn([msg]);
    nearBottom.current = true;
  };

  const emitTyping = useCallback((typing: boolean) => void channelService.typing(c.id, typing).catch(() => undefined), [c.id]);

  const openDirect = async (memberId: ID) => {
    try {
      const conversation = await channelService.openDirect(memberId);
      await onOpenConversation(conversation.id);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  // The other person in a DM — presence is shown only when they have a registered account.
  const peer = c.type === "dm" ? c.peer : undefined;
  const peerOnline = peer?.registered && peer.memberId ? (rt.ready ? rt.isOnline(peer.memberId) : !!peer.online) : undefined;

  return (
    <>
      <section className={styles.pane} aria-label={`${label(c)} conversation`}>
        <header className={styles.threadHead}>
          <div style={{ minWidth: 0 }}>
            <h2 className={styles.threadTitle}>{c.type === "channel" ? `# ${c.name}` : c.name}</h2>
            <p className={styles.threadDesc}>
              {peerOnline !== undefined ? (
                <span className={styles.peerPresence}>
                  <PresenceDot online={peerOnline} /> {peerOnline ? "Online" : "Offline"}
                </span>
              ) : (
                c.description
              )}
            </p>
          </div>
          <div className={styles.headActions}>
            {c.type === "channel" && (
              <button type="button" className={styles.headBtn} aria-label="Rename channel" onClick={editChannel}>
                <Pencil size={17} />
              </button>
            )}
            <button type="button" className={styles.headBtn} aria-label={`Delete ${label(c)}`} onClick={deleteConversation}>
              <Trash2 size={17} />
            </button>
            <button
              type="button"
              className={cx(styles.headBtn, finding && styles.headBtnOn)}
              aria-label="Search messages"
              aria-pressed={finding}
              onClick={() => {
                setFinding((f) => !f);
                setFind("");
              }}
            >
              <Search size={18} />
            </button>
            <button type="button" className={cx(styles.headBtn, c.favorite && styles.headBtnOn)} aria-label={c.favorite ? "Unpin from Favorites" : "Pin to Favorites"} aria-pressed={c.favorite} onClick={togglePin}>
              <Pin size={18} fill={c.favorite ? "currentColor" : "none"} />
            </button>
          </div>
        </header>

        {finding && (
          <div className={styles.findBar}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Search size={15} color="var(--text-secondary)" aria-hidden="true" />
              <input
                autoFocus
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="Search in this conversation"
                aria-label="Search in this conversation"
                style={{ flex: 1, background: "transparent", border: 0, outline: 0, fontSize: 13, color: "#fff" }}
              />
              <button
                type="button"
                className={styles.headBtn}
                style={{ width: 24, height: 24 }}
                aria-label="Close search"
                onClick={() => {
                  setFinding(false);
                  setFind("");
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <div className={styles.messagesWrap}>
          <div className={styles.messages} ref={scrollRef} onScroll={onScroll} role="log" aria-live="polite" aria-label="Messages">
            {messages.length === 0 ? (
              <EmptyState
                icon={<MessageSquare size={22} />}
                title={c.type === "channel" ? `Start the conversation in #${c.name}` : `Say hello to ${c.name}`}
                description="Messages you send appear here."
                className=""
              />
            ) : shown.length === 0 ? (
              <div className={styles.noMatch}>
                <SearchX size={22} style={{ margin: "0 auto 8px", display: "block" }} />
                No messages match “{find.trim()}”.
              </div>
            ) : (
              shown.map((m) => <MessageItem key={m.id} message={m} self={m.authorMemberId === me.id} tz={tz} forceExpanded={!!q} onReact={(emoji) => react(m, emoji)} onMediaLoad={() => nearBottom.current && scrollToBottom()} />)
            )}
          </div>
          {newBelow && (
            <button
              type="button"
              className={styles.newBelow}
              onClick={() => {
                scrollToBottom();
                nearBottom.current = true;
                setNewBelow(false);
                trySeen();
              }}
            >
              <ArrowDown size={14} /> New messages
            </button>
          )}
        </div>

        <TypingIndicator names={Object.values(typers).map((t) => t.name)} />

        <Composer conversationId={c.id} placeholder={c.type === "channel" ? `Message #${c.name}` : `Message ${c.name}`} onSend={send} onTyping={emitTyping} />
      </section>

      <aside className={cx(styles.pane, styles.details)} aria-label="Channel details">
        <h2 className={styles.detailsTitle}>{c.type === "channel" ? "Channel Details" : "Conversation Details"}</h2>
        <p className="section-label">Topic</p>
        <p className={styles.topic}>{c.topic}</p>
        <hr className={styles.divider} />
        <MembersPanel members={members} onMessage={openDirect} />
        {peer && !peer.registered && (
          <p className={styles.notRegistered}>{peer.name} doesn&apos;t have a Teambase account, so there&apos;s no online status or profile to show.</p>
        )}
      </aside>
    </>
  );
}

const label = (c: { type: string; name: string }) => (c.type === "channel" ? `#${c.name}` : c.name);
