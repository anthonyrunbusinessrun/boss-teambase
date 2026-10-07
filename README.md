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
| Channels | `/channels` | Channels + DMs, unread badges, send, reactions, attachments, emoji, in-thread search, pin to favorites |
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
- File attachments and report uploads keep only the file name — there is no file storage.
- The in-memory store is per server process and resets on restart.

## Testing

`qa/functional.py` is a Playwright (Python) suite that drives a real browser through the whole app — navigation, every form,
drag-and-drop, keyboard use, error states, print styles and responsive overflow (including the sign-in flows). `qa/overflow.py <width>` lists any element
that overflows the viewport at a given width.

```bash
pip install playwright && playwright install chromium
npm run build && npm start -- -p 3001     # use a fresh server: the suite creates data
python3 qa/functional.py                  # BASE=http://host:port to target another server
```
