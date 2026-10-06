# BOSS Teambase

A working prototype of **Teambase**, the remote-team collaboration workspace from the BOSS product family,
built from the supplied design handoff (7 screens + design system) with **Next.js 16 · React 19 · TypeScript · Node**.

It looks like the designs and behaves like a real product: every button, tab, filter, dropdown, form and modal
does something. Data lives in an in-memory mock "database" so the whole app runs with zero setup.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
# or a production build
npm run build && npm start
```

Requires Node 20.9+ (Next.js 16). No database, environment variables or external services.

## Signing in

Teambase is an internal app: **there is no sign-up and no password**. Open the app and you land on `/signin`; click **Sign in** to go in.
The work email is pre-filled with the default account (Stad Osuyos, the person the designs are drawn for), so one click is enough.
Type another teammate's email to enter as them. Everything else — every page and every API route — requires being signed in;
signed-out visitors are redirected to `/signin` and returned to the page they wanted.

> **This is access, not security.** With no password, signing in only *selects who you are*; it proves nothing, and anyone who can
> reach the app can sign in as anyone. That's fine for a prototype on a trusted network — don't put real data behind it or expose it
> to the internet. To add real authentication, verify a password or SSO assertion in `src/app/api/auth/login/route.ts`; the session
> cookie, `authed()` and the proxy that protect everything else stay as they are.

Seeded accounts (mock data), one per team member, `<first name>@teambase.test`:

| Account | Email |
|---|---|
| Stad Osuyos (UI/UX Designer) — the default | `stad@teambase.test` |
| Ray Land (CEO) | `ray@teambase.test` |
| Joseph Anthony (CTO) | `joseph@teambase.test` |
| Ereika · Andrea · Shiela · Benj | `ereika@` · `andrea@` · `shiela@` · `benj@` `teambase.test` |

Signing in as different people shows the app from their point of view (who "me" is in chat, availability, the "can't delete yourself"
rule, the activity feed). Sign out is in the header user menu.

| Setting | Purpose |
|---|---|
| `SESSION_SECRET` | Signs session cookies. Optional: if unset a random one is generated per server start (everyone is signed out on restart). |

Copy `.env.example` to `.env.local` to set it. The default sign-in email lives in `src/config/auth.ts`.

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
UI components  ──►  src/services  ──►  /api route handlers  ──►  src/server/db.ts  ──►  (future) real database
(src/components)    (typed fetch)      (src/app/api, Node)        (in-memory mock)
```

- `src/types/models.ts` — the domain interfaces shared by every layer. These are the contract.
- `src/services/` — the **only** place the UI talks to the backend. Point `NEXT_PUBLIC_API_BASE` at another server, or edit `http.ts`.
- `src/app/api/**` — Node route handlers with validation. They only call `getDb()` and its helpers.
- `src/server/db.ts` — the **only** file that knows data is in memory. **Replace this file to add a real database.**
- `src/server/auth.ts` — session tokens and `authed()`, which wraps every API route. `src/config/auth.ts` — the default sign-in email.
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

- **Sign-in doesn't authenticate** (no password, by design for now) — see "Signing in" above.
- Accounts exist only for the seeded demo members. Members added through the UI can't sign in until an account is provisioned
  (there is no admin screen for that yet).
- The session signing key lives in server memory unless `SESSION_SECRET` is set; behind a load balancer, set it.
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
