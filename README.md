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

> **Data resets when the server restarts.** The mock store lives in server memory (`src/server/db.ts`).

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
- `src/components/` — `buttons`, `cards`, `forms`, `modals`, `header`, `navigation`, `layout`, `shared`, plus one folder per screen.
- `src/config/navigation.ts` — sidebar items, page titles, glow and meter per screen. Add a route here.
- `src/app/globals.css` — design tokens (CSS variables).

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
- Fonts are self-hosted (`@fontsource-variable/plus-jakarta-sans`), so the build needs no network access to Google Fonts.

## Quality

- `npx tsc --noEmit`, `npm run lint` and `npm run build` are clean.
- Keyboard: dropdowns (↑ ↓ Home End Enter Esc), modals (focus trap, Esc, focus return), cards (Enter / Space), skip link, visible focus rings.
- Respects `prefers-reduced-motion` and the in-app *Reduce motion* setting.
- No horizontal overflow from 320px to desktop. The design is desktop-first; narrow screens shrink the same layout (sidebar becomes an icon rail).
- Date/time maths has unit assertions: `npx tsx src/lib/calendar.test.ts`.

## Known limits (prototype)

- One fixed signed-in user (Stad Osuyos); there is no authentication.
- File attachments and report uploads keep only the file name — there is no file storage.
- The in-memory store is per server process and resets on restart.

## Testing

`qa/functional.py` is a Playwright (Python) suite that drives a real browser through the whole app — navigation, every form,
drag-and-drop, keyboard use, error states, print styles and responsive overflow (105 steps). `qa/overflow.py <width>` lists any element
that overflows the viewport at a given width.

```bash
pip install playwright && playwright install chromium
npm run build && npm start -- -p 3001     # use a fresh server: the suite creates data
python3 qa/functional.py                  # BASE=http://host:port to target another server
```
