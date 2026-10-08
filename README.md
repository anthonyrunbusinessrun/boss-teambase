# BOSS Teambase

A working prototype of **Teambase**, the remote-team collaboration workspace from the BOSS product family,
built from the supplied design handoff (7 screens + design system) with **Next.js 16 · React 19 · TypeScript · Node**.

It looks like the designs and behaves like a real product: every button, tab, filter, dropdown, form and modal
does something. Production data is persisted in PostgreSQL; local development can still run with an in-memory fallback.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
# or a production build
npm run build && npm start
```

Requires Node 20.9+ (Next.js 16). Copy `.env.example` to `.env.local` to use PostgreSQL and Resend locally.

## Signing in

Teambase uses verified work-email accounts and password authentication. Choose **Create profile**, enter your profile details,
and follow the verification link delivered by Resend. All application routes and API data require a valid signed session.

Signing in as different people shows the app from their point of view (who "me" is in chat, availability, the "can't delete yourself"
rule, the activity feed). Sign out is in the header user menu.

| Setting | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection URL. Railway should reference the Postgres service's `DATABASE_URL`. |
| `SESSION_SECRET` | Signs session cookies. Set a stable, random production value. |
| `APP_URL` | Public origin used in verification links. |
| `RESEND_API_KEY` | Resend API key used only on the server. |
| `RESEND_FROM_EMAIL` | Sender using a Resend-verified domain. |

Copy `.env.example` to `.env.local` to set these values.

## What's here

| Screen | Route | Notes |
|---|---|---|
| Dashboard | `/` | Live greeting, KPIs (move with the task board), activity feed, quick actions, today's agenda |
| Channels | `/channels` | Channels + private DMs, live online status and typing, Sent/Delivered/Seen, formatted messages, attachment previews + downloads, reactions, in-thread search, pin to favorites |
| Actions | `/actions` | Kanban with drag-and-drop, filters, task details panel, create / edit / delete |
| Calendar | `/calendar` | Month / Week / Day, add / edit / delete events and meetings, team availability |
| Team Directory | `/team` | Search + filters, member cards, org chart built from reporting lines, add / edit / delete members |
| Document Center | `/reports` | Template cards, live preview, create draft, **Export PDF** (prints the preview sheet) |
| World Clocks | `/world-clock` | 8 live analog clocks, real offsets incl. daylight saving, header search filters zones |
| **Projects** (Screen 5) | `/projects` | **Placeholder — "Coming Soon".** Not yet designed |
| **AI Command** (Screen 6) | `/ai-command` | **Placeholder — "Coming Soon".** Not yet designed |

Profile and Settings open from the header user menu (they have no screen in the design). Settings are intentionally small:
time zones, reduce motion, notification preferences. Global search (header) finds people, channels, tasks, events and reports.

## Architecture

```
UI components  ──►  src/services  ──►  /api route handlers  ──►  src/server/db.ts  ──►  PostgreSQL
(src/components)    (typed fetch)      (src/app/api, Node)        (transactional state)
```

- `src/types/models.ts` — the domain interfaces shared by every layer. These are the contract.
- `src/services/` — the **only** place the UI talks to the backend. Point `NEXT_PUBLIC_API_BASE` at another server, or edit `http.ts`.
- `src/app/api/**` — Node route handlers with validation. They only call `getDb()` and its helpers.
- `src/server/db.ts` — transactional PostgreSQL persistence with a no-config local fallback.
- `src/server/chat.ts` — the messaging **rules** as pure functions (who is registered, who may see a DM, receipts, unread, status). Unit-tested.
- `src/server/realtime.ts` — the live-connection hub: presence, typing, event fan-out across server replicas.
- `src/server/files.ts` — attachment storage and byte-level file-type detection. `src/server/chat-events.ts` — publishing helpers.
- `src/server/auth.ts` — session tokens and `authed()`, which wraps every protected API route.
- `src/proxy.ts` — redirects signed-out visitors (an optimistic cookie check only; see below).
- `src/components/` — `buttons`, `cards`, `forms`, `modals`, `header`, `navigation`, `layout`, `shared`, plus one folder per screen.
- `src/config/navigation.ts` — sidebar items, page titles, glow and meter per screen. Add a route here.
- `src/app/globals.css` — design tokens (CSS variables).

### How sign-in works

- **Session:** a signed token (HMAC-SHA256) in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over HTTPS), valid 12 hours. Nothing is kept in JS-readable storage.
- **Two layers, as the Next.js auth guide recommends.** `proxy.ts` only *looks* at the cookie to redirect (fast, optimistic).
  Every API route then **verifies the signature and loads the user** via `authed()`, so a forged cookie can open the page shell but never any data.
  A bad cookie is cleared by the 401 that rejects it, which prevents redirect loops.
- **Who you are** comes from the session on the server (message author, activity feed, "can't delete yourself"), never from the client.
- **Also in place:** cross-origin write requests are refused, and `?next=` only accepts same-site paths (no open redirects).
- **Client:** any 401 sends the user to `/signin?reason=expired` and back to the same page after signing in. Pages restored from the
  browser's back/forward cache re-check the session.

### Channels & messaging

**Who counts as a registered user.** An account with a password *and* a verified email (`isRegisteredAccount` in `src/server/chat.ts`) — exactly the
people who can sign in. Only they can be online, appear in a members list, or be messaged. Seeded demo people, members added without an account, and
unverified accounts never show presence and aren't listed. Change that one function if your definition differs.

| Requirement | How it works |
|---|---|
| **Online / Offline** | Every signed-in browser keeps one live connection open (Server-Sent Events, `/api/channels/events`, opened by `RealtimeProvider` for the whole app — not just the Channels page). Connected = online. Several tabs count as one person; a page reload doesn't flash "offline" (4 s grace). |
| **Typing** | Sent while composing (`POST /api/channels/:id/typing`), shown as "Stad is typing…" / "Stad and Ray are typing…". Never stored in the database. Clears when the person sends, clears the box, leaves the box, goes idle, disconnects, or after 6 s server-side. Private conversations only tell their participants. |
| **Sent / Delivered / Seen** | Each message keeps a receipt per registered recipient, snapshotted at send time. *Delivered* = reached their open app (instantly if they're online, otherwise the moment the app next connects). *Seen* = they were looking at the conversation (tab visible, scrolled to the bottom). Shown on your own messages with the date/time; click for a per-person breakdown. In channels it reads "Seen by 2 of 3" until everyone has. |
| **Members + private DMs** | The members panel lists registered people only; each is selectable and opens a card with **Send message**. The **+** next to *Direct Messages* opens a picker. A DM has a participant list: one conversation per pair, same for both of them, invisible to everyone else (every route enforces it). |
| **Formatting, copy/paste, long messages** | Text is stored exactly as written (only blank lines at the very start and whitespace at the very end are trimmed). The composer is a multi-line box — Enter sends, Shift+Enter adds a line. Limit **20,000** characters; over-long pastes are *flagged, never silently cut*. Long messages show a 12-line preview with **Show more / Show less**. A **Copy** button and normal selection both copy the original text. Unsent drafts survive switching conversations. |
| **Attachments** | Up to 5 files of 10 MB per message, stored in PostgreSQL. Images preview inline (click for a full-size view), video/audio get players, text files show their first lines, everything else is a file card. Every attachment has **Download** (original filename). Paste a screenshot or drag files onto the composer. A file's type comes from its *bytes*, never its name — HTML named `.png` is never rendered, SVG/HTML/executables are download-only, and nothing uploaded can run script on your origin. |

**Data and tables.** Messages, receipts, conversations and participants live in the existing `teambase_state` JSON document, as before.
Two small tables are created automatically on first start: `teambase_presence` (who is connected right now — changes every few seconds, so it must not go
through the single locked state row) and `teambase_attachments` (file bytes; messages only hold a reference).

**Several servers.** Events fan out through PostgreSQL `LISTEN/NOTIFY`, so replicas and rolling deploys stay in sync with no extra infrastructure.
Each server keeps one extra dedicated database connection for this. If a server crashes without disconnecting, its users go offline everywhere once
their heartbeat expires (about 75 s).

**Upgrading existing data.** Done automatically on read, nothing to run: DMs saved before participants existed get them from who is in the
conversation (so outsiders lose access and participants keep it); messages saved before receipts existed count as already read (no unread flood);
reactions saved with the old single shared flag keep their counts; old name-and-size-only attachments still display, marked as unavailable.
The Sarah / John / Liam placeholder DMs stay visible to everyone but have no presence, members or status, because they aren't registered users.

**Behaviour changes worth knowing.** Unread counts are now per person (they used to be one number shared by everyone). Reactions are per person
(they used to share one "you reacted" flag). Typing and presence are real (the old `typingUser` demo value is gone).

### Adding Screens 5 and 6 later
Replace the `ComingSoon` in `src/app/projects/page.tsx` / `src/app/ai-command/page.tsx`. Routes, sidebar items and titles already exist.

## Design notes

- **Measured from the PNGs, not the doc.** The design-system doc's pixel values are approximate. The real 1440px designs have a
  214px sidebar (doc: 192), 72px header (doc: 64) and 32px content padding, so tokens use the measured values.
- **Real time zones.** The design shows fixed "CST/EST/GMT" labels. The app uses real IANA zones, so labels follow daylight
  saving (CDT/EDT/BST). Dates in the design are samples; the app is always relative to today.
- **Not in the design, added for function:** a *Create Task* button on Actions, a *Today* button on Calendar, edit/delete controls in
  the Task Details panel, unread badges in the channel list, and a status dropdown (keyboard alternative to drag-and-drop).
- **Light theme** is not designed, so Settings shows it disabled.
- **Chat alignment:** your own messages sit on the right and everyone else's on the left (the standard chat layout). The design file shows your message on the left, aligned with the others.
- **Sidebar icons are emoji** (by request, to make the rail stand out) instead of the design's blue line icons. They're decorative — link names come from the labels — and live in `src/config/navigation.ts`, one string per item, so swapping any of them is a one-character change.
- Fonts are self-hosted (`@fontsource-variable/plus-jakarta-sans`), so the build needs no network access to Google Fonts.

## Quality

- `npx tsc --noEmit`, `npm run lint` and `npm run build` are clean.
- Sign-in: redirects, API lockdown, validation, forged/tampered cookies, expiry, sign-out and open-redirect guards are all covered by the browser suite.
- Keyboard: dropdowns (↑ ↓ Home End Enter Esc), modals (focus trap, Esc, focus return), cards (Enter / Space), skip link, visible focus rings.
- Respects `prefers-reduced-motion` and the in-app *Reduce motion* setting.
- No horizontal overflow from 320px to desktop. The design is desktop-first; narrow screens shrink the same layout (sidebar becomes an icon rail).
- Unit assertions: `npx tsx src/lib/calendar.test.ts` (date/time maths) and `npx tsx src/lib/auth.test.ts` (redirect guard, token decoding).

## Known limits (prototype)

- New accounts must verify their email before signing in. Resend and a verified sender domain are required in production.
- Report uploads (Document Center) still keep only the file name. Chat attachments are stored (see above).
- Without `DATABASE_URL` (local fallback) everything is in memory: presence is per process and data resets on restart.
- Presence means "has Teambase open", not "is active": there is no idle/away state yet.
- Files are loaded fully into memory to serve them (fine at the 10 MB limit; move to object storage before raising it much).

## Testing

Current suites (they need a PostgreSQL `DATABASE_URL`, a production build, and `pip install playwright && playwright install chromium` for the browser one):

```bash
npx tsx src/server/chat.test.ts            # messaging rules + helpers (no database needed)
npx tsx src/lib/calendar.test.ts           # date/time maths
npx tsx src/lib/auth.test.ts               # redirect guard, token decoding

# integration — use a scratch database; these create test users and data
npm run build
DATABASE_URL=postgresql://… node qa/support/seed-accounts.mjs      # after the app has started once
BASE=http://localhost:3201 node qa/api/channels.test.mjs           # backend over real HTTP + live events (52 checks)
A=http://localhost:3201 B=http://localhost:3202 PID_B=/tmp/pid3202 \
  node qa/api/multi-instance.test.mjs                              # two servers, one database, incl. a hard crash (10 checks)
BASE=http://localhost:3201 python3 qa/browser/channels.py          # real browser, several signed-in users (55 checks)
```

`qa/support/seed-accounts.mjs` creates accounts with a **known test password** — never run it against a real database.

> Browser tests can't use Playwright's `wait_until="networkidle"`: every page now holds a live connection open, so the network is never idle.
> Wait for an element instead.

`qa/functional.py` and `qa/overflow.py` are the earlier whole-app suite. They predate password sign-in and the always-open live connection, so they
need updating before they pass again; they were left untouched.
