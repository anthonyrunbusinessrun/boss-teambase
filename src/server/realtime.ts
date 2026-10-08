/**
 * Realtime hub — presence, typing indicators and live message events.
 *
 * Why this isn't stored in the application state: presence and typing change every few seconds. The app state is one JSON
 * document behind a row lock, so writing them there would serialise every user on every keystroke. Instead:
 *
 *   • Events are fanned out in-process to open browser connections (Server-Sent Events), and — when PostgreSQL is configured —
 *     also through `pg_notify`, so every server replica delivers every event. No extra infrastructure.
 *   • Presence = one row per live connection in `teambase_presence`, refreshed by a heartbeat. A person is online while at
 *     least one non-stale row exists. Rows left behind by a crashed replica expire on their own.
 *   • Typing is held in memory by the replica that received it and expires server-side, so the indicator clears even if
 *     the typist's browser vanishes.
 *
 * Without DATABASE_URL (local development) everything runs in-process.
 */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { connectionConfig, getPool, hasDatabase } from "./db";
import type { Audience } from "./chat";
import type { ID, RealtimeEvent } from "@/types/models";

const CHANNEL = "teambase_rt";
const TYPING_TTL_MS = 6_000;
const OFFLINE_GRACE_MS = 4_000; // a page reload reconnects within this window → no offline flash
const HEARTBEAT_MS = 20_000;
const STALE_SECONDS = 75;
const MAX_NOTIFY_BYTES = 7_000; // pg_notify payloads are limited to 8,000 bytes

type Send = (event: RealtimeEvent) => void;
interface Conn { id: string; memberId: ID; send: Send }
interface TypingEntry { conversationId: ID; memberId: ID; name: string; aud: Audience; expires: number }
interface Envelope { o: string; ev: RealtimeEvent; aud: Audience }

class Hub {
  readonly instanceId = randomUUID();
  readonly conns = new Map<string, Conn>();
  /** Everyone who is online anywhere in the cluster (this replica's connections + other replicas', from the DB). */
  readonly online = new Set<ID>();
  readonly typing = new Map<string, TypingEntry>();
  readonly graceTimers = new Map<ID, ReturnType<typeof setTimeout>>();
  readonly audiences = new Map<ID, { aud: Audience; expires: number }>();
  startPromise?: Promise<void>;
  sweeper?: ReturnType<typeof setInterval>;
  listener?: Client;
  retry = 0;

  /* ----- delivery ----- */

  deliverLocal(ev: RealtimeEvent, aud: Audience) {
    for (const c of this.conns.values()) {
      if (aud === "all" || aud.includes(c.memberId)) {
        try {
          c.send(ev);
        } catch {
          /* a dead connection is cleaned up by its own abort handler */
        }
      }
    }
  }

  /** Deliver to this replica's connections now, and to every other replica through PostgreSQL. */
  emit(ev: RealtimeEvent, aud: Audience) {
    this.deliverLocal(ev, aud);
    if (!hasDatabase()) return;
    let payload = JSON.stringify({ o: this.instanceId, ev, aud } satisfies Envelope);
    if (payload.length > MAX_NOTIFY_BYTES) payload = JSON.stringify({ o: this.instanceId, ev, aud: "all" } satisfies Envelope);
    getPool().query("SELECT pg_notify($1, $2)", [CHANNEL, payload]).catch((e) => console.error("[realtime] notify failed", e.message));
  }

  /** An event from another replica. */
  receive(env: Envelope) {
    if (env.o === this.instanceId) return;
    if (env.ev.type === "presence") {
      const { memberId, online } = env.ev;
      if (online) this.online.add(memberId);
      else if (!this.localMembers().has(memberId)) this.online.delete(memberId);
    }
    this.deliverLocal(env.ev, env.aud);
  }

  /* ----- lifecycle ----- */

  async ensureStarted(): Promise<void> {
    this.startPromise ??= (async () => {
      if (!hasDatabase()) return;
      await this.syncOnline();
      void this.listen();
      setInterval(() => void this.heartbeat(), HEARTBEAT_MS).unref();
    })();
    return this.startPromise;
  }

  private async listen() {
    try {
      const client = new Client({ ...connectionConfig(), keepAlive: true });
      this.listener = client;
      client.on("notification", (m) => {
        if (m.channel !== CHANNEL || !m.payload) return;
        try {
          this.receive(JSON.parse(m.payload) as Envelope);
        } catch {
          /* ignore malformed payloads */
        }
      });
      const reconnect = () => {
        if (this.listener !== client) return;
        this.listener = undefined;
        const wait = Math.min(30_000, 1_000 * 2 ** this.retry++);
        setTimeout(() => void this.listen(), wait).unref();
      };
      client.on("error", reconnect);
      client.on("end", reconnect);
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      this.retry = 0;
      await this.syncOnline(); // anything missed while disconnected
    } catch (e) {
      console.error("[realtime] listener failed, retrying", (e as Error).message);
      this.listener = undefined;
      setTimeout(() => void this.listen(), Math.min(30_000, 1_000 * 2 ** this.retry++)).unref();
    }
  }

  /* ----- presence ----- */

  private localMembers(): Set<ID> {
    return new Set([...this.conns.values()].map((c) => c.memberId));
  }

  /** Reconcile `online` with the database (authoritative across replicas). Emits local-only presence changes for any differences. */
  async syncOnline() {
    if (!hasDatabase()) return;
    try {
      const rows = await getPool().query<{ member_id: string }>(
        `SELECT DISTINCT member_id FROM teambase_presence WHERE last_seen > NOW() - ($1 || ' seconds')::interval`,
        [String(STALE_SECONDS)],
      );
      const next = new Set(rows.rows.map((r) => r.member_id));
      for (const id of this.localMembers()) next.add(id);
      for (const id of next) if (!this.online.has(id)) { this.online.add(id); this.deliverLocal({ type: "presence", memberId: id, online: true }, "all"); }
      for (const id of [...this.online]) if (!next.has(id)) { this.online.delete(id); this.deliverLocal({ type: "presence", memberId: id, online: false }, "all"); }
    } catch (e) {
      console.error("[realtime] presence sync failed", (e as Error).message);
    }
  }

  private async heartbeat() {
    try {
      const ids = [...this.conns.keys()];
      const pool = getPool();
      if (ids.length) await pool.query("UPDATE teambase_presence SET last_seen = NOW() WHERE conn_id = ANY($1)", [ids]);
      await pool.query(`DELETE FROM teambase_presence WHERE last_seen < NOW() - ($1 || ' seconds')::interval`, [String(STALE_SECONDS)]);
      await this.syncOnline();
    } catch (e) {
      console.error("[realtime] heartbeat failed", (e as Error).message);
    }
  }

  async connect(memberId: ID, send: Send): Promise<{ id: string; online: ID[]; close: () => void }> {
    await this.ensureStarted();
    const id = randomUUID();
    this.conns.set(id, { id, memberId, send });
    const grace = this.graceTimers.get(memberId);
    if (grace) { clearTimeout(grace); this.graceTimers.delete(memberId); }

    const wasOnline = this.online.has(memberId);
    this.online.add(memberId);
    if (hasDatabase()) {
      await getPool()
        .query("INSERT INTO teambase_presence (conn_id, member_id, instance_id) VALUES ($1, $2, $3)", [id, memberId, this.instanceId])
        .catch((e) => console.error("[realtime] presence insert failed", e.message));
    }
    if (!wasOnline) this.emit({ type: "presence", memberId, online: true }, "all");

    let closed = false;
    return {
      id,
      online: [...this.online],
      close: () => {
        if (closed) return;
        closed = true;
        this.conns.delete(id);
        if (hasDatabase()) getPool().query("DELETE FROM teambase_presence WHERE conn_id = $1", [id]).catch(() => undefined);
        if (!this.localMembers().has(memberId)) {
          this.clearTypingFor(memberId);
          this.graceTimers.set(memberId, setTimeout(() => void this.goOffline(memberId), OFFLINE_GRACE_MS));
        }
      },
    };
  }

  private async goOffline(memberId: ID) {
    this.graceTimers.delete(memberId);
    if (this.localMembers().has(memberId)) return;
    if (hasDatabase()) {
      // Still connected through another replica?
      const r = await getPool()
        .query(`SELECT 1 FROM teambase_presence WHERE member_id = $1 AND last_seen > NOW() - ($2 || ' seconds')::interval LIMIT 1`, [memberId, String(STALE_SECONDS)])
        .catch(() => undefined);
      if (r?.rowCount) return;
    }
    if (this.online.delete(memberId)) this.emit({ type: "presence", memberId, online: false }, "all");
  }

  /** Presence as shown in the UI. Includes the short reload grace period, so a page refresh doesn't flash "offline". */
  isOnline = (memberId: ID): boolean => this.online.has(memberId);

  /** Can a message reach this person's device right now? Stricter than isOnline: no grace period — a closed tab can't receive it. */
  isReachable = (memberId: ID): boolean => this.localMembers().has(memberId) || (this.online.has(memberId) && !this.graceTimers.has(memberId));

  /* ----- typing ----- */

  setTyping(e: { conversationId: ID; memberId: ID; name: string; typing: boolean }, aud: Audience) {
    const key = `${e.conversationId}|${e.memberId}`;
    if (e.typing) {
      this.typing.set(key, { conversationId: e.conversationId, memberId: e.memberId, name: e.name, aud, expires: Date.now() + TYPING_TTL_MS });
      this.sweeper ??= setInterval(() => this.sweep(), 1_000);
      this.sweeper.unref?.();
      this.emit({ type: "typing", ...e }, aud);
    } else if (this.typing.delete(key)) {
      this.emit({ type: "typing", ...e }, aud);
    }
  }

  clearTyping(conversationId: ID, memberId: ID) {
    const t = this.typing.get(`${conversationId}|${memberId}`);
    if (t) this.setTyping({ conversationId, memberId, name: t.name, typing: false }, t.aud);
  }

  private clearTypingFor(memberId: ID) {
    for (const t of [...this.typing.values()]) if (t.memberId === memberId) this.clearTyping(t.conversationId, memberId);
  }

  private sweep() {
    const now = Date.now();
    for (const [key, t] of [...this.typing]) {
      if (t.expires <= now) {
        this.typing.delete(key);
        this.emit({ type: "typing", conversationId: t.conversationId, memberId: t.memberId, name: t.name, typing: false }, t.aud);
      }
    }
    if (!this.typing.size && this.sweeper) { clearInterval(this.sweeper); this.sweeper = undefined; }
  }

  /* ----- who may hear about a conversation (cached so a typing keystroke never reads the whole state) ----- */

  cachedAudience(conversationId: ID): Audience | undefined {
    const hit = this.audiences.get(conversationId);
    return hit && hit.expires > Date.now() ? hit.aud : undefined;
  }

  cacheAudience(conversationId: ID, aud: Audience) {
    this.audiences.set(conversationId, { aud, expires: Date.now() + 15_000 });
    if (this.audiences.size > 500) for (const [k, v] of this.audiences) if (v.expires < Date.now()) this.audiences.delete(k);
  }

  forgetAudience(conversationId: ID) {
    this.audiences.delete(conversationId);
  }
}

const g = globalThis as unknown as { __teambaseHub?: Hub };
export const hub: Hub = (g.__teambaseHub ??= new Hub());
