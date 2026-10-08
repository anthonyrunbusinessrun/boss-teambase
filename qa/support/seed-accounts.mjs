/**
 * Test-only: provisions accounts straight in PostgreSQL, the same shape /api/auth/signup + /api/auth/verify produce
 * (bcrypt hash + verified email), so the test suite doesn't depend on Resend.
 *
 *   DATABASE_URL=... node qa/support/seed-accounts.mjs
 *
 * Registered (can sign in):  alice, bob, carol, gina
 * NOT registered, on purpose: dave (member with no account), erin (account never verified)
 * The seeded demo members (Ray, Joseph, Stad…) also have no password, so they are not registered either.
 */
import pg from "pg";
import bcrypt from "bcryptjs";

export const TEST_PASSWORD = "TestPass-12345";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const member = (id, name, role, dept, initials) => ({ id, name, role, department: dept, initials, status: "active", availability: "free", managerId: null, skills: [] });
const MEMBERS = [
  member("m_alice", "Alice Tester", "Engineer", "Tech", "AT"),
  member("m_bob", "Bob Tester", "Designer", "Tech", "BT"),
  member("m_carol", "Carol Tester", "Producer", "Ops", "CT"),
  member("m_gina", "Gina Tester", "Analyst", "Finance", "GT"),
  member("m_dave", "Dave NoAccount", "Contractor", "Ops", "DN"),
  member("m_erin", "Erin Unverified", "Intern", "Tech", "EU"),
];

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query("CREATE TABLE IF NOT EXISTS teambase_state (id SMALLINT PRIMARY KEY CHECK (id = 1), data JSONB NOT NULL, version BIGINT NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
const row = await client.query("SELECT data FROM teambase_state WHERE id = 1");
if (!row.rows[0]) throw new Error("Start the app once first (GET /api/health) so it seeds the state row");
const data = row.rows[0].data;
const hash = await bcrypt.hash(TEST_PASSWORD, 10);
const now = new Date().toISOString();

data.members = data.members.filter((m) => !m.id.startsWith("m_") || !MEMBERS.some((t) => t.id === m.id));
data.accounts = data.accounts.filter((a) => !MEMBERS.some((t) => t.id === a.memberId));
data.members.push(...MEMBERS);
for (const m of MEMBERS) {
  const email = `${m.name.split(" ")[0].toLowerCase()}@test.local`;
  if (m.id === "m_dave") continue;                                                   // member only — no account at all
  data.accounts.push({ memberId: m.id, email, passwordHash: hash, createdAt: now, ...(m.id === "m_erin" ? {} : { emailVerifiedAt: now }) });
}
await client.query("UPDATE teambase_state SET data = $1::jsonb, version = version + 1 WHERE id = 1", [JSON.stringify(data)]);
console.log("seeded:", MEMBERS.map((m) => m.id).join(", "));
await client.end();
