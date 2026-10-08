import { getDb, mutateDb } from "@/server/db";
import { hasUndelivered, markDelivered } from "@/server/chat";
import { publishStatus } from "@/server/chat-events";
import { hub } from "@/server/realtime";
import { authed } from "@/server/auth";
import type { RealtimeEvent } from "@/types/models";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events: the single live connection each signed-in browser keeps open while Teambase is open.
 * Being connected is what makes someone "online". Pushes presence, typing, message and conversation events.
 */
export const GET = authed(async (req: Request, _ctx, me) => {
  const encoder = new TextEncoder();
  let close: (() => void) | undefined;
  let aborted = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* stream already closed */
        }
      };
      // Events that arrive while we're still connecting are queued so `ready` (the presence snapshot) is always first.
      let ready = false;
      const queued: RealtimeEvent[] = [];
      const send = (event: RealtimeEvent) => (ready ? write(`data: ${JSON.stringify(event)}\n\n`) : queued.push(event));

      const conn = await hub.connect(me.id, send);
      const keepAlive = setInterval(() => write(": keep-alive\n\n"), 15_000);
      close = () => {
        clearInterval(keepAlive);
        conn.close();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      if (aborted) return close();

      write("retry: 3000\n\n");
      write(`data: ${JSON.stringify({ type: "ready", connectionId: conn.id, online: conn.online } satisfies RealtimeEvent)}\n\n`);
      ready = true;
      for (const event of queued.splice(0)) send(event);

      // The app just opened on this person's device: whatever was waiting for them is now Delivered.
      void (async () => {
        if (!hasUndelivered(await getDb(), me.id)) return;
        const changes = await mutateDb((db) => markDelivered(db, me.id, new Date().toISOString()));
        for (const change of changes) publishStatus({ ...change }, me.id);
      })().catch((error) => console.error("[realtime] delivery marking failed", error));
    },
    cancel() {
      aborted = true;
      close?.();
    },
  });

  req.signal.addEventListener("abort", () => { aborted = true; close?.(); }, { once: true });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
