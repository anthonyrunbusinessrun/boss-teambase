import { authed } from "@/server/auth";
import { getDbVersion } from "@/server/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Server-sent change notifications. Clients fetch canonical channel data after each version change. */
export const GET = authed(async (req: Request) => {
  let version = await getDbVersion();
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`event: ready\ndata: ${version}\n\n`));
      timer = setInterval(async () => {
        if (closed) return;
        try {
          const next = await getDbVersion();
          if (next !== version) {
            version = next;
            controller.enqueue(encoder.encode(`data: ${version}\n\n`));
          } else {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
          }
        } catch {
          controller.error(new Error("Realtime connection lost"));
          if (timer) clearInterval(timer);
        }
      }, 1500);

      req.signal.addEventListener("abort", () => {
        closed = true;
        if (timer) clearInterval(timer);
        try { controller.close(); } catch { /* already closed */ }
      }, { once: true });
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
