/** Tiny test client: sign-in, JSON API calls, and a Server-Sent-Events reader with "wait until" helpers. */
export const PASSWORD = "TestPass-12345";

export async function login(base, email) {
  const res = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  if (res.status !== 200) throw new Error(`login ${email} → ${res.status}`);
  return { email, cookie: res.headers.get("set-cookie").split(";")[0], base };
}

export async function api(user, path, init = {}) {
  const isForm = init.body instanceof FormData;
  const res = await fetch(user.base + "/api" + path, { ...init, headers: { cookie: user.cookie, ...(init.body && !isForm ? { "content-type": "application/json" } : {}), ...(init.headers || {}) } });
  const type = res.headers.get("content-type") || "";
  return { status: res.status, headers: res.headers, json: type.includes("json") ? await res.json().catch(() => null) : null, res };
}
export const post = (u, p, body) => api(u, p, { method: "POST", body: JSON.stringify(body ?? {}) });

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openStream(user) {
  const ctrl = new AbortController();
  const res = await fetch(user.base + "/api/channels/events", { headers: { cookie: user.cookie }, signal: ctrl.signal });
  if (res.status !== 200) throw new Error("events → " + res.status);
  const events = [];
  (async () => {
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ done: true }));
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, i).split("\n").find((l) => l.startsWith("data: ")); buf = buf.slice(i + 2);
        if (line) events.push(JSON.parse(line.slice(6)));
      }
    }
  })();
  const s = {
    events, close: () => ctrl.abort(), mark: () => events.length,
    async waitFor(pred, { from = 0, ms = 8000 } = {}) {
      const end = Date.now() + ms;
      while (Date.now() < end) { const hit = events.slice(from).find(pred); if (hit) return hit; await sleep(20); }
      return null;
    },
    /** True if NO matching event arrives within `ms` (used to prove something is NOT delivered). */
    async stays(pred, { from = 0, ms = 700 } = {}) { await sleep(ms); return !events.slice(from).some(pred); },
  };
  await s.waitFor((e) => e.type === "ready");
  return s;
}

/* ---- minimal test runner ---- */
const results = [];
export async function test(name, fn) {
  try { await fn(); results.push([name, true]); console.log("  PASS ", name); }
  catch (e) { results.push([name, false, e.message]); console.log("  FAIL ", name, "\n        ", String(e.message).split("\n")[0]); }
}
export const section = (t) => console.log("\n== " + t + " ==");
export function summary() {
  const failed = results.filter((r) => !r[1]);
  console.log(`\n==== ${results.length - failed.length}/${results.length} passed, ${failed.length} failed ====`);
  for (const f of failed) console.log(" ✗", f[0], "→", f[2]);
  process.exit(failed.length ? 1 : 0);
}
export function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
export function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || "not equal"}\n   expected: ${JSON.stringify(b)}\n   actual:   ${JSON.stringify(a)}`); }
