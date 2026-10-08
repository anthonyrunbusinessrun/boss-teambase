"""
Actions — companies, 4-status boards, live updates, sprints — real browser, several signed-in users, real PostgreSQL.
  DATABASE_URL=… node qa/support/seed-accounts.mjs && BASE=http://localhost:3201 python3 qa/browser/actions.py
(needs a FRESH database: the seeded demo boards are what it expects)
"""
import os, re, sys
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE", "http://localhost:3201")
PASSWORD = "TestPass-12345"
RESULTS, CONSOLE, PAGES = [], [], {}
os.makedirs("qa/failures", exist_ok=True)
expect.set_options(timeout=9000)

def step(name):
    def deco(fn):
        try: fn(); RESULTS.append((name, True, "")); print(f"  PASS  {name}")
        except Exception as e:
            msg = (str(e).strip().splitlines() or [repr(e)])[0][:260]; RESULTS.append((name, False, msg)); print(f"  FAIL  {name}\n        {msg}")
            for who, pg in PAGES.items():
                try: pg.screenshot(path=f"qa/failures/act-{re.sub(r'[^a-z0-9]+','-',name.lower())[:40]}-{who}.png", full_page=True)
                except Exception: pass
        return fn
    return deco
def section(t): print(f"\n== {t} ==")

def new_user(browser, who, w=1440, h=1100):
    ctx = browser.new_context(viewport={"width": w, "height": h}, accept_downloads=True)
    r = ctx.request.post(BASE + "/api/auth/login", data={"email": f"{who}@test.local", "password": PASSWORD}); assert r.ok, who
    pg = ctx.new_page(); pg.set_default_timeout(9000); PAGES[who] = pg
    pg.on("console", lambda m: CONSOLE.append((who, m.type, m.text[:200])) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: CONSOLE.append((who, "pageerror", str(e)[:200])))
    return ctx, pg

def api(ctx, method, path, data=None):
    r = getattr(ctx.request, method)(BASE + path, **({"data": data} if data is not None else {}))
    assert r.ok, f"{method} {path} → {r.status} {r.text()[:160]}"; return r.json()
def mk(ctx, title, company="boss", **kw): return api(ctx, "post", "/api/tasks", {"title": title, "companyId": company, **kw})
def rm(ctx, tid): ctx.request.delete(f"{BASE}/api/tasks/{tid}")

def open_page(pg, path):
    pg.goto(BASE + path, wait_until="domcontentloaded"); expect(pg.get_by_role("navigation", name="Companies")).to_be_visible(); expect(pg.get_by_test_id("live-badge")).to_contain_text(re.compile("Live|Reconnecting"))
def board(pg, co="boss"): open_page(pg, f"/actions/{co}/board")
def sprints(pg, co="boss"): open_page(pg, f"/actions/{co}/sprints")
def folders(pg): return pg.get_by_role("navigation", name="Companies")
def tab(pg, name): return pg.get_by_role("navigation", name=re.compile(r" views$")).get_by_role("link", name=name)
def folder(pg, code): return folders(pg).get_by_role("link", name=re.compile(f"^{code} — "))
def col(pg, status): return pg.locator(f'section[data-status="{status}"]')
def card(pg, tid): return pg.locator(f'article[data-task-id="{tid}"]')
def row(pg, tid): return pg.locator(f'li[data-task-id="{tid}"]')
def sec(pg, sid): return pg.locator(f'section[data-sprint="{sid}"]')
def option(pg, label): return pg.get_by_role("option", name=label, exact=True)
def toast(pg, text): return pg.get_by_text(re.compile(text)).first
def alive(pg): pg.evaluate("window.__alive = 'yes'")
def still_alive(pg): return pg.evaluate("window.__alive") == "yes"
def pick(pg, combo_name, label, exact=True):
    pg.get_by_role("combobox", name=combo_name, exact=exact).click(); option(pg, label).click()

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox"])
    actx, A = new_user(browser, "alice"); bctx, B = new_user(browser, "bob")

    # ══════════════════════════════════════════════════════════════════════════════════
    section("1. Organization — three company folders, each with its own Board and Sprint")
    @step("/actions opens the BOSS board; three folders are shown with their full names")
    def _():
        A.goto(BASE + "/actions", wait_until="domcontentloaded"); expect(A).to_have_url(re.compile(r"/actions/boss/board$")); expect(folders(A)).to_be_visible()
        links = folders(A).get_by_role("link"); expect(links).to_have_count(3)
        assert [l.get_attribute("aria-label") for l in links.all()] == ["BOSS — Business Operating Systems Solutions", "RLI — Rayland Inc.", "LL — Land Logistics"]
        expect(folder(A, "BOSS")).to_have_attribute("aria-current", "page")
    @step("each company has its OWN board: no BOSS work on RLI's board, no RLI work on LL's")
    def _():
        board(A, "boss"); expect(card(A, "t-44")).to_be_visible(); expect(A.get_by_text("Q4 budget review")).to_have_count(0); expect(A.get_by_text("Route optimisation audit")).to_have_count(0)
        folder(A, "RLI").click(); expect(A).to_have_url(re.compile(r"/actions/rli/board$")); expect(card(A, "t-55")).to_be_visible(); expect(A.get_by_text("Database Index Tuning")).to_have_count(0)
        folder(A, "LL").click(); expect(card(A, "t-60")).to_be_visible(); expect(A.get_by_text("Q4 budget review")).to_have_count(0)
    @step("each company has its OWN sprint, with its own goal and dates")
    def _():
        for co, name, goal in [("boss", "Sprint 2", "Ship the Actions board"), ("rli", "Sprint 1", "Close the quarter"), ("ll", "Sprint 1", "Stabilise routes")]:
            board(A, co); bar = A.get_by_role("heading", name=name, exact=True).first; expect(bar).to_be_visible(); expect(A.get_by_text(goal)).to_be_visible()
    @step("the folder cards show each company's live sprint summary")
    def _():
        board(A); expect(folder(A, "BOSS")).to_contain_text("Sprint 2 · 5 open · 1 done"); expect(folder(A, "RLI")).to_contain_text("Sprint 1 · 3 open · 1 done"); expect(folder(A, "LL")).to_contain_text("Sprint 1 · 3 open · 1 done")
    @step("switching company keeps you on the same view (Board stays Board, Sprints stays Sprints)")
    def _():
        sprints(A, "boss"); folder(A, "RLI").click(); expect(A).to_have_url(re.compile(r"/actions/rli/sprints$")); expect(A.get_by_role("heading", name="RLI sprints")).to_be_visible()
        tab(A, "Board").click(); expect(A).to_have_url(re.compile(r"/actions/rli/board$")); folder(A, "LL").click(); expect(A).to_have_url(re.compile(r"/actions/ll/board$"))
    @step("Actions remembers the company you used last")
    def _():
        board(A, "ll"); A.goto(BASE + "/actions", wait_until="domcontentloaded"); expect(A).to_have_url(re.compile(r"/actions/ll/board$")); board(A, "boss"); A.goto(BASE + "/actions", wait_until="domcontentloaded"); expect(A).to_have_url(re.compile(r"/actions/boss/board$"))
    @step("an unknown company is a 404, not a broken page")
    def _():
        r = A.goto(BASE + "/actions/acme/board", wait_until="domcontentloaded"); assert r.status == 404, r.status
    @step("old links keep working: /actions?task=… goes to that task's company board, or its sprints screen if it isn't in the active sprint")
    def _():
        A.goto(BASE + "/actions?task=t-60", wait_until="domcontentloaded"); expect(A).to_have_url(re.compile(r"/actions/ll/board\?task=t-60")); expect(A.get_by_text("#LL-60: Route optimisation audit")).to_be_visible()
        A.goto(BASE + "/actions?task=t-59", wait_until="domcontentloaded"); expect(A).to_have_url(re.compile(r"/actions/rli/sprints\?task=t-59")); expect(row(A, "t-59")).to_be_visible()
    @step("searching from the header finds a task and opens the right screen")
    def _():
        board(A); box = A.get_by_placeholder("Search anything…"); box.fill("fuel cost"); A.get_by_text("Fuel cost dashboard").first.click(); expect(A).to_have_url(re.compile(r"/actions/ll/sprints\?task=t-64")); expect(row(A, "t-64")).to_be_visible()

    # ══════════════════════════════════════════════════════════════════════════════════
    section("2. Exactly four statuses — Backlog is gone")
    @step("the board has exactly To Do · In Progress · Review · Done, in that order")
    def _():
        board(A); heads = A.locator("section[data-status] h2"); expect(heads).to_have_count(4); assert heads.all_inner_texts() == ["To Do", "In Progress", "Review", "Done"], heads.all_inner_texts()
        expect(A.locator("section[data-status]")).to_have_count(4)
    @step("the word 'Backlog' appears nowhere on the board, its filters, the form or the dashboard")
    def _():
        board(A); assert "backlog" not in A.locator("main").inner_text().lower()
        A.get_by_role("combobox", name="Filter by status").click(); labels = A.get_by_role("option").all_inner_texts(); assert labels == ["All statuses", "To Do", "In Progress", "Review", "Done"], labels; A.keyboard.press("Escape")
        A.get_by_role("button", name="Create Task").click(); A.get_by_role("combobox", name="Status", exact=True).click(); assert A.get_by_role("option").all_inner_texts() == ["To Do", "In Progress", "Review", "Done"]; A.keyboard.press("Escape"); A.keyboard.press("Escape")
        A.goto(BASE + "/", wait_until="domcontentloaded"); expect(A.get_by_text("Todo Tasks")).to_be_visible(); assert "backlog" not in A.locator("main").inner_text().lower()
    @step("dragging a card to Done completes it (100%, tick) and drag back leaves it open at 90%")
    def _():
        board(A); t = mk(actx, "drag to done", progress=30); A.reload(); expect(card(A, t["id"])).to_be_visible()
        card(A, t["id"]).drag_to(col(A, "done")); expect(col(A, "done").locator(f'article[data-task-id="{t["id"]}"]')).to_contain_text("100%"); expect(col(A, "done").locator(f'article[data-task-id="{t["id"]}"]').get_by_label("Done")).to_be_visible()
        col(A, "done").locator(f'article[data-task-id="{t["id"]}"]').drag_to(col(A, "review")); expect(col(A, "review").locator(f'article[data-task-id="{t["id"]}"]')).to_contain_text("90%"); rm(actx, t["id"])
    @step("the details panel can set any of the four statuses")
    def _():
        board(A); card(A, "t-46").click(); pick(A, "Move task to status", "Review"); expect(col(A, "review").locator('article[data-task-id="t-46"]')).to_be_visible(); pick(A, "Move task to status", "To Do"); expect(col(A, "todo").locator('article[data-task-id="t-46"]')).to_be_visible()
    @step("every company's board is made only of the four columns (nothing falls outside them)")
    def _():
        for co in ("boss", "rli", "ll"):
            board(A, co); expect(A.locator("section[data-status]")).to_have_count(4); total = sum(int(re.search(r"(\d+) tasks", s.get_attribute("aria-label")).group(1)) for s in A.locator("section[data-status]").all()); assert total >= 4, (co, total)

    # ══════════════════════════════════════════════════════════════════════════════════
    section("3. Real-time board updates — no refreshing")
    board(A); board(B); alive(B); alive(A)
    @step("Alice moves a card → it moves on Bob's board by itself, and Bob is told who did it")
    def _():
        card(A, "t-44").drag_to(col(A, "review"))
        expect(col(B, "review").locator('article[data-task-id="t-44"]')).to_be_visible(); expect(col(B, "todo").locator('article[data-task-id="t-44"]')).to_have_count(0)
        expect(B.get_by_test_id("announcement")).to_have_text("Alice moved TB-44 to Review"); assert still_alive(B), "the page was reloaded"
    @step("Alice (who made the change) gets no announcement about her own move")
    def _():
        card(A, "t-44").drag_to(col(A, "in-progress")); expect(B.get_by_test_id("announcement")).to_have_text("Alice moved TB-44 to In Progress"); expect(A.get_by_test_id("announcement")).to_have_count(0)
    @step("column counts update live too")
    def _():
        expect(col(B, "in-progress")).to_have_attribute("aria-label", re.compile(r"In Progress, 2 tasks")); expect(col(B, "review")).to_have_attribute("aria-label", re.compile(r"Review, 1 tasks"))
        card(A, "t-44").drag_to(col(A, "todo")); expect(col(B, "todo")).to_have_attribute("aria-label", re.compile(r"To Do, 3 tasks"))
    @step("a task created by Alice appears on Bob's board (right column, her name on it)")
    def _():
        t = mk(actx, "Created live by Alice", priority="high"); expect(col(B, "todo").locator(f'article[data-task-id="{t["id"]}"]')).to_be_visible(); expect(B.get_by_test_id("announcement")).to_have_text(re.compile(r"^Alice added BOSS-\d+$"))
        globals()["LIVE"] = t
    @step("an edit (title + priority) shows on Bob's board")
    def _():
        t = LIVE; api(actx, "patch", f"/api/tasks/{t['id']}", {"title": "Edited live by Alice", "priority": "low"}); c = card(B, t["id"]); expect(c).to_contain_text("Edited live by Alice"); expect(c).to_contain_text("Low")
    @step("when Alice deletes a task Bob is looking at, it disappears and his details panel closes")
    def _():
        t = LIVE; card(B, t["id"]).click(); expect(B.get_by_text(f"#{t['key']}: Edited live by Alice")).to_be_visible(); rm(actx, t["id"])
        expect(card(B, t["id"])).to_have_count(0); expect(B.get_by_text(f"#{t['key']}: Edited live by Alice")).to_have_count(0); expect(B.get_by_test_id("announcement")).to_contain_text("Alice removed")
    @step("moving a card out of the active sprint removes it from Bob's board — and it shows up in his Sprints view")
    def _():
        t = mk(actx, "Leaving the sprint"); expect(card(B, t["id"])).to_be_visible(); card(A, t["id"]).click(); pick(A, "Move task to sprint", "Unscheduled (leave the board)")
        expect(card(B, t["id"])).to_have_count(0); expect(B.get_by_test_id("announcement")).to_have_text(f"Alice moved {t['key']} to Unscheduled"); tab(B, "Sprints").click(); expect(row(B, t["id"])).to_be_visible(); globals()["LEAVER"] = t
    @step("the Sprints screen is live as well: planning work into a sprint shows for the other person without a refresh")
    def _():
        sprints(A); sprints(B); alive(B); t = LEAVER
        row(A, t["id"]).drag_to(sec(A, "sp-boss-3")); expect(sec(B, "sp-boss-3").locator(f'li[data-task-id="{t["id"]}"]')).to_be_visible(); expect(sec(B, "unscheduled").locator(f'li[data-task-id="{t["id"]}"]')).to_have_count(0); assert still_alive(B)
        rm(actx, t["id"])
    @step("work in another company doesn't disturb Bob's board, but the folder cards he sees still update")
    def _():
        board(B, "rli"); before = folder(B, "BOSS").inner_text(); t = mk(actx, "Quiet BOSS task"); expect(folder(B, "BOSS")).not_to_have_text(before); expect(B.locator("article[data-task-id]").filter(has_text="Quiet BOSS task")).to_have_count(0); rm(actx, t["id"])
    @step("the Live indicator is on; losing the connection never blanks the board")
    def _():
        board(B); expect(B.get_by_test_id("live-badge")).to_have_text(re.compile("Live"))
        bctx.set_offline(True); B.wait_for_timeout(1500); expect(card(B, "t-45")).to_be_visible(); expect(B.get_by_text("Something went wrong")).to_have_count(0); bctx.set_offline(False)
    @step("changes made while Bob was offline appear when he is back (no manual refresh)")
    def _():
        board(B); alive(B); bctx.set_offline(True); api(actx, "patch", "/api/tasks/t-45", {"status": "done"}); B.wait_for_timeout(1500)
        bctx.set_offline(False); expect(col(B, "done").locator('article[data-task-id="t-45"]')).to_be_visible(timeout=20000); expect(B.get_by_test_id("live-badge")).to_have_text(re.compile("Live"), timeout=20000)
        api(actx, "patch", "/api/tasks/t-45", {"status": "todo"}); expect(col(B, "todo").locator('article[data-task-id="t-45"]')).to_be_visible()
    @step("two people moving different cards at the same moment: both boards end up identical")
    def _():
        board(A); board(B); import threading
        a = threading.Thread(target=lambda: api(actx, "patch", "/api/tasks/t-46", {"status": "review"})); b = threading.Thread(target=lambda: api(bctx, "patch", "/api/tasks/t-45", {"status": "in-progress"})); a.start(); b.start(); a.join(); b.join()
        for pg in (A, B): expect(col(pg, "review").locator('article[data-task-id="t-46"]')).to_be_visible(); expect(col(pg, "in-progress").locator('article[data-task-id="t-45"]')).to_be_visible()
        api(actx, "patch", "/api/tasks/t-46", {"status": "todo"}); api(actx, "patch", "/api/tasks/t-45", {"status": "todo"})
    @step("a task deleted while Bob was offline is gone from his board when he is back")
    def _():
        board(A); board(B); t = mk(actx, "Doomed"); expect(card(B, t["id"])).to_be_visible(); bctx.set_offline(True); rm(actx, t["id"]); B.wait_for_timeout(300)
        bctx.set_offline(False); expect(card(B, t["id"])).to_have_count(0, timeout=20000)  # he catches up and the deleted card is gone

    # ══════════════════════════════════════════════════════════════════════════════════
    section("4. Sprints — plan, start, run, complete")
    @step("the Sprints screen: active · planned · unscheduled · completed (collapsed, with its record)")
    def _():
        sprints(A); expect(sec(A, "sp-boss-2")).to_have_attribute("data-status", "active"); expect(sec(A, "sp-boss-3")).to_have_attribute("data-status", "planned"); expect(sec(A, "unscheduled")).to_be_visible()
        done = sec(A, "sp-boss-1"); expect(done).to_have_attribute("data-status", "completed"); expect(done).to_contain_text("Completed"); expect(done).to_contain_text("3 of 3 done"); expect(done.locator("li")).to_have_count(0)
        done.get_by_role("button", name=re.compile("Sprint 1")).click(); expect(done.locator("li")).to_have_count(3); expect(done.get_by_role("combobox")).to_have_count(0)
    @step("'Unscheduled' is explicitly not a status — and there is no Backlog section")
    def _():
        expect(sec(A, "unscheduled")).to_contain_text("This isn't a status"); assert "backlog" not in A.locator("main").inner_text().lower()
    @step("only one sprint can run at a time: Start is disabled while another is active, with the reason")
    def _():
        b = sec(A, "sp-boss-3").get_by_role("button", name="Start sprint"); expect(b).to_be_disabled(); assert "Sprint 2 is still active" in b.get_attribute("title")
    @step("create a sprint: defaults, validation, numbering per company")
    def _():
        A.get_by_role("button", name="Create sprint").click(); d = A.get_by_role("dialog", name="New BOSS sprint"); expect(d).to_be_visible()
        s, e = d.get_by_label("Start date").input_value(), d.get_by_label("End date").input_value(); import datetime as dt; assert (dt.date.fromisoformat(e) - dt.date.fromisoformat(s)).days == 14
        d.get_by_label("End date").fill("2020-01-01"); d.get_by_role("button", name="Create sprint").click(); expect(d.get_by_text("can't end before it starts")).to_be_visible()
        d.get_by_label("Start date").fill("2026-12-01"); d.get_by_label("End date").fill("2026-12-14"); d.get_by_label("Sprint name").fill("Hardening"); d.get_by_label("Sprint goal").fill("Fix what we found in QA"); d.get_by_role("button", name="Create sprint").click()
        s4 = A.get_by_role("region", name="Hardening"); expect(s4).to_be_visible(); expect(s4).to_contain_text("Planned"); expect(s4).to_contain_text("Dec 1 – Dec 14"); expect(s4).to_contain_text("Fix what we found in QA")
        sprints(A, "rli"); A.get_by_role("button", name="Create sprint").click(); A.get_by_role("dialog").get_by_role("button", name="Create sprint").click(); expect(A.get_by_role("region", name="Sprint 2")).to_be_visible()
    @step("the other person sees the new sprint appear, live")
    def _():
        sprints(B, "rli"); alive(B); A.get_by_role("button", name="Create sprint").click(); A.get_by_role("dialog").get_by_label("Sprint name").fill("Live sprint"); A.get_by_role("dialog").get_by_role("button", name="Create sprint").click()
        expect(B.get_by_role("region", name="Live sprint")).to_be_visible(); expect(B.get_by_test_id("announcement")).to_have_text("Alice planned Live sprint"); assert still_alive(B)
    @step("edit a planned sprint (name, goal)")
    def _():
        s = A.get_by_role("region", name="Live sprint"); s.get_by_role("button", name="Edit Live sprint").click(); d = A.get_by_role("dialog", name="Edit Live sprint"); d.get_by_label("Sprint name").fill("Renamed sprint"); d.get_by_label("Sprint goal").fill("A new goal"); d.get_by_role("button", name="Save changes").click()
        expect(A.get_by_role("region", name="Renamed sprint")).to_contain_text("A new goal"); expect(B.get_by_role("region", name="Renamed sprint")).to_be_visible()
    @step("delete a planned sprint: confirmation says what happens to its work; the work goes back to Unscheduled")
    def _():
        sprints(A, "boss"); t = mk(actx, "Orphan-to-be", sprintId="sp-boss-3"); A.reload(); expect(row(A, t["id"])).to_be_visible()
        A.get_by_role("region", name="Hardening").get_by_role("button", name="Delete Hardening").click(); expect(A.get_by_role("dialog")).to_contain_text("It has no tasks")
        A.get_by_role("dialog").get_by_role("button", name="Delete sprint").click(); expect(A.get_by_role("region", name="Hardening")).to_have_count(0)
        sec(A, "sp-boss-3").get_by_role("button", name="Delete Sprint 3").click(); expect(A.get_by_role("dialog")).to_contain_text("tasks move to Unscheduled"); A.get_by_role("dialog").get_by_role("button", name="Delete sprint").click()
        expect(sec(A, "unscheduled").locator(f'li[data-task-id="{t["id"]}"]')).to_be_visible(); expect(A.get_by_role("region", name="Sprint 3")).to_have_count(0); rm(actx, t["id"])
    @step("plan work by drag-and-drop, and with the keyboard-friendly 'Move to' menu")
    def _():
        api(actx, "post", "/api/sprints", {"companyId": "boss", "name": "Sprint 3"}); sprints(A); new = A.get_by_role("region", name="Sprint 3"); expect(new).to_be_visible(); sid = new.get_attribute("data-sprint")
        row(A, "t-51").drag_to(sec(A, sid)); expect(sec(A, sid).locator('li[data-task-id="t-51"]')).to_be_visible(); expect(sec(A, sid)).to_contain_text("1 to do")
        A.get_by_role("combobox", name="Move TB-44 to a sprint").click(); option(A, "Sprint 3").click(); expect(sec(A, sid).locator('li[data-task-id="t-44"]')).to_be_visible(); expect(sec(A, "sp-boss-2").locator('li[data-task-id="t-44"]')).to_have_count(0)
        A.get_by_role("combobox", name="Move TB-44 to a sprint").click(); option(A, "Sprint 2 (active)").click(); expect(sec(A, "sp-boss-2").locator('li[data-task-id="t-44"]')).to_be_visible()
        globals()["S3"] = sid
    @step("a completed sprint is a record: nothing can be dropped into it or moved out")
    def _():
        done = sec(A, "sp-boss-1"); done.get_by_role("button", name=re.compile("Sprint 1")).click() if done.locator("li").count() == 0 else None
        assert done.locator("li").first.get_attribute("draggable") != "true"; expect(done.get_by_role("button", name=re.compile("Start|Edit|Delete|Complete"))).to_have_count(0)
    @step("the board shows ONLY the active sprint: planned work isn't on it")
    def _():
        board(A); expect(card(A, "t-51")).to_have_count(0); expect(card(A, "t-44")).to_be_visible()
    @step("create a task from the board → it goes into the active sprint; from a sprint card → into that sprint; the form can pick another company")
    def _():
        board(A); A.get_by_role("button", name="Create Task").click(); d = A.get_by_role("dialog", name="Create task"); expect(d.get_by_role("combobox", name="Sprint")).to_contain_text("Sprint 2 (active)"); expect(d.get_by_role("combobox", name="Company")).to_contain_text("BOSS")
        d.get_by_label("Title").fill("From the board"); d.get_by_role("button", name="Create task").click(); expect(A.locator("article[data-task-id]").filter(has_text="From the board")).to_be_visible()
        sprints(A); sec(A, S3).get_by_role("button", name="Create task in Sprint 3").click(); d = A.get_by_role("dialog", name="Create task"); expect(d.get_by_role("combobox", name="Sprint")).to_contain_text("Sprint 3")
        d.get_by_role("combobox", name="Company").click(); option(A, "RLI — Rayland Inc.").click(); expect(d.get_by_role("combobox", name="Sprint")).to_contain_text("Sprint 1 (active)"); d.get_by_role("combobox", name="Sprint").click(); labels = A.get_by_role("option").all_inner_texts(); assert "Unscheduled (not in a sprint)" in labels and not any("Sprint 3" in l for l in labels), labels; A.keyboard.press("Escape"); A.keyboard.press("Escape")
    @step("editing a task's company moves it to that company's active sprint, with that company's ticket prefix")
    def _():
        t = mk(actx, "Relocating"); board(A); card(A, t["id"]).click(); A.get_by_role("button", name="Edit", exact=True).click(); d = A.get_by_role("dialog", name=re.compile("Edit")); d.get_by_role("combobox", name="Company").click(); option(A, "LL — Land Logistics").click(); d.get_by_role("button", name="Save changes").click()
        expect(card(A, t["id"])).to_have_count(0); board(A, "ll"); c = card(A, t["id"]); expect(c).to_be_visible(); expect(c).to_contain_text("#LL-"); rm(actx, t["id"])
    @step("complete the active sprint from the board (counts, destination for unfinished work) — and Bob's open board follows live")
    def _():
        board(B); board(A); alive(B); A.get_by_role("button", name="Complete sprint").click(); d = A.get_by_role("dialog", name="Complete Sprint 2")
        stats = d.locator("dl dd").all_inner_texts(); assert stats[1] != "0" and int(stats[0]) + int(stats[1]) == int(stats[2]), stats
        expect(d.get_by_role("combobox", name="Move unfinished tasks to")).to_contain_text("Sprint 3"); d.get_by_role("button", name="Complete sprint").click()
        expect(A.get_by_text("No active sprint for BOSS")).to_be_visible(); expect(A.get_by_role("button", name="Start Sprint 3")).to_be_visible(); expect(folder(A, "BOSS")).to_contain_text("No active sprint")
        # Bob never touched anything: his open board switched by itself and told him who did it
        expect(B.get_by_text("No active sprint for BOSS")).to_be_visible(); expect(B.get_by_test_id("announcement")).to_have_text("Alice completed Sprint 2"); assert still_alive(B)
    @step("unfinished work moved into Sprint 3; the finished work stayed in Sprint 2 as its record")
    def _():
        sprints(A); s2 = sec(A, "sp-boss-2"); expect(s2).to_have_attribute("data-status", "completed"); expect(s2).to_contain_text(re.compile(r"\d+ of \d+ done · \d+ moved on")); expect(sec(A, S3).locator("li")).not_to_have_count(0)
        s2.get_by_role("button", name=re.compile("Sprint 2")).click(); assert all("Done" in t for t in s2.locator("li").all_inner_texts()), "only finished work stays"
    @step("start the next sprint from the empty board → its work appears on the board")
    def _():
        board(A); A.get_by_role("button", name="Start Sprint 3").click(); d = A.get_by_role("dialog", name="Start Sprint 3"); expect(d).to_contain_text("go onto the BOSS board"); d.get_by_label("Sprint goal").fill("Round three"); d.get_by_role("button", name="Start sprint").click()
        expect(A.get_by_role("heading", name="Sprint 3", exact=True).first).to_be_visible(); expect(A.get_by_text("Round three")).to_be_visible(); expect(card(A, "t-51")).to_be_visible(); expect(folder(A, "BOSS")).to_contain_text("Sprint 3")
    @step("completing with 'Unscheduled' sends unfinished work out of any sprint")
    def _():
        board(A); A.get_by_role("button", name="Complete sprint").click(); d = A.get_by_role("dialog", name="Complete Sprint 3"); d.get_by_role("combobox", name="Move unfinished tasks to").click(); option(A, "Unscheduled (not in any sprint)").click(); d.get_by_role("button", name="Complete sprint").click()
        expect(A.get_by_text("No active sprint for BOSS")).to_be_visible(); sprints(A); expect(sec(A, "unscheduled").locator("li")).not_to_have_count(0)
    @step("a company with no sprint at all gets a clear first step: Create sprint")
    def _():
        board(A, "rli"); A.get_by_role("button", name="Complete sprint").click(); d = A.get_by_role("dialog", name="Complete Sprint 1"); d.get_by_role("combobox", name="Move unfinished tasks to").click(); option(A, "Unscheduled (not in any sprint)").click(); d.get_by_role("button", name="Complete sprint").click()
        expect(A.get_by_text("No active sprint for RLI")).to_be_visible(); expect(A.get_by_role("link", name="Open sprints")).to_be_visible()

    # ══════════════════════════════════════════════════════════════════════════════════
    section("5. Existing Actions features still work")
    @step("filters: search, assignee, priority, status; clear filters")
    def _():
        board(A, "ll"); expect(A.locator("article[data-task-id]")).to_have_count(4)
        A.get_by_label("Search tickets").fill("fleet"); expect(A.locator("article[data-task-id]")).to_have_count(1); A.get_by_role("button", name="Clear filters").click(); expect(A.locator("article[data-task-id]")).to_have_count(4)
        pick(A, "Filter by priority", "High"); expect(A.locator("article[data-task-id]")).to_have_count(1); A.get_by_role("button", name="Clear filters").click()
        pick(A, "Filter by status", "Done"); expect(A.locator("section[data-status]")).to_have_count(1); A.get_by_role("button", name="Clear filters").click(); expect(A.locator("section[data-status]")).to_have_count(4)
    @step("select a card with the keyboard, edit it, delete it")
    def _():
        t = mk(actx, "Edit and delete me", "ll"); board(A, "ll"); c = card(A, t["id"]); c.focus(); A.keyboard.press("Enter"); expect(A.get_by_text(f"#{t['key']}: Edit and delete me")).to_be_visible()
        A.get_by_role("button", name="Edit", exact=True).click(); d = A.get_by_role("dialog", name=re.compile("Edit")); d.get_by_label("Title").fill("Edited title"); d.get_by_role("button", name="Save changes").click(); expect(card(A, t["id"])).to_contain_text("Edited title")
        A.get_by_role("button", name="Delete", exact=True).click(); A.get_by_role("dialog").get_by_role("button", name="Delete task").click(); expect(card(A, t["id"])).to_have_count(0)
    @step("the dashboard counts follow the work in the active sprints, and Create Task works from there")
    def _():
        A.goto(BASE + "/", wait_until="domcontentloaded"); expect(A.get_by_text("Todo Tasks")).to_be_visible(); A.get_by_role("button", name="Create Task").first.click(); d = A.get_by_role("dialog", name="Create task"); d.get_by_label("Title").fill("From the dashboard"); d.get_by_role("button", name="Create task").click(); expect(A.get_by_text("Task created")).to_be_visible()
    @step("a narrow window: folders stack, nothing overflows sideways")
    def _():
        nctx, N = new_user(browser, "gina", 390, 844)
        for path in ("/actions/boss/board", "/actions/boss/sprints"):
            N.goto(BASE + path, wait_until="domcontentloaded"); expect(folders(N)).to_be_visible(); N.wait_for_timeout(600); assert N.evaluate("document.documentElement.scrollWidth") <= 390, (path, N.evaluate("document.documentElement.scrollWidth"))
        nctx.close()
    @step("no console errors or warnings in anyone's browser (apart from expected denied/offline requests)")
    def _():
        bad = [c for c in CONSOLE if not re.search(r"status of (401|403|404|409|413|429)|net::ERR_(INTERNET_DISCONNECTED|NETWORK_CHANGED|FAILED)|Failed to load resource", c[2])]
        assert not bad, bad[:4]
    browser.close()

passed = sum(1 for r in RESULTS if r[1]); failed = [r for r in RESULTS if not r[1]]
print(f"\n==== {passed}/{len(RESULTS)} passed, {len(failed)} failed ====")
for n, _, m in failed: print(" ✗", n, "→", m)
sys.exit(1 if failed else 0)
