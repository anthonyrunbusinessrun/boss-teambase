"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Paperclip, Pencil, Pin, Search, SearchX, Send, Smile, SmilePlus, Trash2, X } from "lucide-react";
import { Avatar, PresenceDot } from "@/components/shared/Avatar";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/States";
import { useApp } from "@/providers/AppProvider";
import { useToast } from "@/providers/ToastProvider";
import { useDismiss } from "@/hooks/useClickOutside";
import { useResource } from "@/hooks/useResource";
import { channelService, errorMessage } from "@/services";
import { formatTimeShort } from "@/lib/time";
import { cx, formatBytes, makeInitials } from "@/lib/utils";
import type { Attachment, ChatMessage, ConversationDetail, TeamMember } from "@/types/models";
import styles from "./Channels.module.css";

const REACTION_CHOICES = ["👍", "🚀", "✅", "👀", "❤️", "🎉"];
const EMOJI_CHOICES = ["😀", "😂", "😊", "😍", "🤔", "😅", "👍", "👏", "🙏", "🚀", "🎉", "✅", "🔥", "💡", "👀", "❤️", "💯", "🙌"];

interface ConversationViewProps {
  id: string;
  refreshToken: number;
  /** Called when something changed that affects the list (read state, favorite). */
  onListChanged: () => void;
  onDeleted: () => void;
}

/** Thread + details for one conversation. Keyed by id so state resets when you switch. */
export function ConversationView({ id, refreshToken, onListChanged, onDeleted }: ConversationViewProps) {
  const fetcher = useCallback(() => channelService.detail(id), [id]);
  const detail = useResource(fetcher);
  const reloadDetail = detail.reload;
  const { refreshUnread } = useApp();
  const marked = useRef(false);
  const unread = detail.data?.conversation.unread ?? 0;

  useEffect(() => {
    if (refreshToken > 0) void reloadDetail();
  }, [refreshToken, reloadDetail]);

  // Opening a conversation reads it: clears its badge here and in the sidebar.
  useEffect(() => {
    if (unread > 0 && !marked.current) {
      marked.current = true;
      channelService
        .markRead(id)
        .then(() => {
          onListChanged();
          return refreshUnread();
        })
        .catch(() => {
          marked.current = false;
        });
    }
  }, [unread, id, onListChanged, refreshUnread]);

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
  if (detail.error || !detail.data) {
    return (
      <>
        <div className={styles.pane}>
          <ErrorState message={detail.error ?? "Couldn't load this conversation."} onRetry={detail.reload} />
        </div>
        <aside className={cx(styles.pane, styles.details)} aria-hidden="true" />
      </>
    );
  }

  return <Loaded data={detail.data} update={detail.setData} onListChanged={onListChanged} onDeleted={onDeleted} />;
}

type Update = React.Dispatch<React.SetStateAction<ConversationDetail | undefined>>;

function Loaded({ data, update, onListChanged, onDeleted }: { data: ConversationDetail; update: Update; onListChanged: () => void; onDeleted: () => void }) {
  const { conversation: c, messages, members } = data;
  const { me, primaryZone } = useApp();
  const toast = useToast();
  const [finding, setFinding] = useState(false);
  const [find, setFind] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const q = find.trim().toLowerCase();
  const shown = q ? messages.filter((m) => m.body.toLowerCase().includes(q) || m.authorName.toLowerCase().includes(q)) : messages;

  // Keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, q]);

  const replaceMessage = (m: ChatMessage) => update((cur) => cur && { ...cur, messages: cur.messages.map((x) => (x.id === m.id ? m : x)) });

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
    } catch (error) { toast.error(errorMessage(error)); }
  };

  const deleteConversation = async () => {
    if (!window.confirm(`Delete ${label(c)} and all of its messages? This can't be undone.`)) return;
    try {
      await channelService.remove(c.id);
      toast.success(`${label(c)} deleted`);
      onDeleted();
    } catch (error) { toast.error(errorMessage(error)); }
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
    update((cur) => cur && { ...cur, messages: [...cur.messages, msg], conversation: { ...cur.conversation, typingUser: undefined } });
  };

  // Details-panel people. DM peers aren't directory members, so they're built from the conversation.
  const people: { key: string; initials: string; name: string; role: string; online: boolean }[] =
    c.type === "dm" && c.peer
      ? [
          { key: me.id, initials: me.initials, name: me.name, role: me.role, online: me.status === "active" },
          { key: "peer", initials: makeInitials(c.peer.name), name: c.peer.name, role: "Direct message", online: c.peer.online },
        ]
      : [...members]
          .sort((a, b) => Number(b.id === me.id) - Number(a.id === me.id))
          .map((m: TeamMember) => ({ key: m.id, initials: m.initials, name: m.name, role: m.role, online: m.status === "active" }));
  const onlineCount = people.filter((p) => p.online).length;

  return (
    <>
      <section className={styles.pane} aria-label={`${label(c)} conversation`}>
        <header className={styles.threadHead}>
          <div style={{ minWidth: 0 }}>
            <h2 className={styles.threadTitle}>{c.type === "channel" ? `# ${c.name}` : c.name}</h2>
            <p className={styles.threadDesc}>{c.description}</p>
          </div>
          <div className={styles.headActions}>
            {c.type === "channel" && <button type="button" className={styles.headBtn} aria-label="Rename channel" onClick={editChannel}><Pencil size={17} /></button>}
            <button type="button" className={styles.headBtn} aria-label={`Delete ${label(c)}`} onClick={deleteConversation}><Trash2 size={17} /></button>
            <button type="button" className={cx(styles.headBtn, finding && styles.headBtnOn)} aria-label="Search messages" aria-pressed={finding} onClick={() => { setFinding((f) => !f); setFind(""); }}>
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
              <button type="button" className={styles.headBtn} style={{ width: 24, height: 24 }} aria-label="Close search" onClick={() => { setFinding(false); setFind(""); }}>
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <div className={styles.messages} ref={scrollRef} role="log" aria-live="polite" aria-label="Messages">
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
            shown.map((m) => <MessageItem key={m.id} message={m} self={m.authorMemberId === me.id} tz={primaryZone.tz} onReact={(emoji) => react(m, emoji)} />)
          )}
          {c.typingUser && !q && (
            <p className={styles.typing} aria-live="polite">
              {c.typingUser} is typing…
            </p>
          )}
        </div>


        <Composer placeholder={c.type === "channel" ? `Message #${c.name}` : `Message ${c.name}`} onSend={send} />
      </section>

      <aside className={cx(styles.pane, styles.details)} aria-label="Channel details">
        <h2 className={styles.detailsTitle}>{c.type === "channel" ? "Channel Details" : "Conversation Details"}</h2>
        <p className="section-label">Topic</p>
        <p className={styles.topic}>{c.topic}</p>
        <hr className={styles.divider} />
        <p className="section-label">
          Members — {onlineCount} online
        </p>
        <ul className={styles.members}>
          {people.map((p) => (
            <li key={p.key} className={styles.member}>
              <Avatar initials={p.initials} size={36} />
              <div className={styles.memberText}>
                <div className={styles.memberName}>{p.name}</div>
                <div className={styles.memberRole}>{p.role}</div>
              </div>
              <PresenceDot online={p.online} />
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}

const label = (c: { type: string; name: string }) => (c.type === "channel" ? `#${c.name}` : c.name);

/* ------------------------------------------------------------------ */

function MessageItem({ message: m, self, tz, onReact }: { message: ChatMessage; self: boolean; tz: string; onReact: (emoji: string) => void }) {
  const [picker, setPicker] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, picker, () => setPicker(false));

  return (
    <article className={cx(styles.message, self && styles.messageSelf)} aria-label={`${m.authorName} at ${formatTimeShort(new Date(m.createdAt), tz)}`}>
      {!self && <Avatar initials={m.authorInitials} size={36} />}
      <div className={styles.bubbleWrap}>
        <div className={styles.byline}>
          <span className={styles.author}>{m.authorName}</span>
          <span className={styles.time} suppressHydrationWarning>
            {formatTimeShort(new Date(m.createdAt), tz)}
          </span>
        </div>
        <div className={cx(styles.bubble, self && styles.bubbleSelf)}>
          {m.body}
          {m.attachments.length > 0 && (
            <div className={styles.attachments} style={{ marginTop: m.body ? 8 : 0 }}>
              {m.attachments.map((a, i) => (
                <span key={`${a.name}-${i}`} className={styles.attachment}>
                  <Paperclip size={12} /> {a.name}
                  {a.size > 0 && <span style={{ color: "var(--text-muted)" }}>{formatBytes(a.size)}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className={styles.reactions} ref={ref}>
          {m.reactions.map((r) => (
            <button key={r.emoji} type="button" className={cx(styles.reaction, r.reacted && styles.reactionOn)} aria-pressed={r.reacted} aria-label={`${r.emoji} ${r.count}${r.reacted ? ", you reacted" : ""}`} onClick={() => onReact(r.emoji)}>
              <span aria-hidden="true">{r.emoji}</span> {r.count}
            </button>
          ))}
          <button type="button" className={styles.addReaction} aria-label="Add reaction" aria-expanded={picker} onClick={() => setPicker((p) => !p)}>
            <SmilePlus size={15} />
          </button>
          {picker && (
            <div className={styles.picker} role="menu" aria-label="Choose a reaction">
              {REACTION_CHOICES.map((e) => (
                <button key={e} type="button" role="menuitem" className={styles.pick} onClick={() => { setPicker(false); onReact(e); }}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function Composer({ placeholder, onSend }: { placeholder: string; onSend: (body: string, attachments: Attachment[]) => Promise<void> }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useDismiss(panelRef, emoji, () => setEmoji(false));

  const canSend = (text.trim().length > 0 || files.length > 0) && !sending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    try {
      await onSend(text.trim(), files);
      setText("");
      setFiles([]);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className={styles.composerWrap} ref={panelRef}>
      {files.length > 0 && (
        <div className={styles.pending}>
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className={styles.pendingChip}>
              <Paperclip size={12} /> {f.name} · {formatBytes(f.size)}
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {emoji && (
        <div className={styles.emojiPanel} role="menu" aria-label="Insert emoji">
          {EMOJI_CHOICES.map((e) => (
            <button
              key={e}
              type="button"
              role="menuitem"
              className={styles.pick}
              onClick={() => {
                setText((t) => t + e);
                setEmoji(false);
                inputRef.current?.focus();
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      <form className={styles.composer} onSubmit={submit}>
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          aria-label="Attach files"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []).map((f) => ({ name: f.name, size: f.size }));
            setFiles((cur) => [...cur, ...picked].slice(0, 5));
            e.target.value = "";
          }}
        />
        <button type="button" className={styles.composerBtn} aria-label="Attach file" onClick={() => fileRef.current?.click()}>
          <Paperclip size={18} />
        </button>
        <input ref={inputRef} className={styles.composerInput} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} maxLength={4000} autoComplete="off" />
        <button type="button" className={styles.composerBtn} aria-label="Insert emoji" aria-expanded={emoji} onClick={() => setEmoji((v) => !v)}>
          <Smile size={18} />
        </button>
        <button type="submit" className={cx(styles.composerBtn, styles.send)} aria-label="Send message" disabled={!canSend}>
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
