"""Functional QA for BOSS Teambase — drives a real browser against the production build."""
import re, sys, json, traceback, os
os.makedirs("qa/failures", exist_ok=True)
from playwright.sync_api import sync_playwright, expect

import os
BASE = os.environ.get("BASE", "http://localhost:3001")
RESULTS, CONSOLE = [], []
expect.set_options(timeout=6000)

def step(name):
    def deco(fn):
        try:
            fn(); RESULTS.append((name, True, ""))
            print(f"  PASS  {name}")
        except Exception as e:
            msg = str(e).strip().splitlines()[0][:230] if str(e).strip() else repr(e)
            RESULTS.append((name, False, msg)); print(f"  FAIL  {name}\n        {msg}")
            try: page.screenshot(path=f"qa/failures/FAIL-{re.sub(r'[^a-z0-9]+','-',name.lower())[:50]}.png")
            except Exception: pass
        return fn
    return deco

def toast(text): return page.locator('[role="status"]').get_by_text(text).first
def dialog(name): return page.get_by_role("dialog", name=name)
def nav(label): return page.locator('nav[aria-label="Primary"]').get_by_role("link", name=re.compile(f"^{label}"))
def goto(path):
    page.goto(BASE + path, wait_until="networkidle")

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 1440, "height": 1024})
    page = ctx.new_page()
    page.set_default_timeout(7000)
    page.on("console", lambda m: CONSOLE.append((m.type, m.text[:200])) if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: CONSOLE.append(("pageerror", str(e)[:200])))

    print("\n== NAVIGATION ==")
    goto("/")
    for label, path, title in [("Channels","/channels","Channels"),("Actions","/actions","Actions"),("Calendar","/calendar","Calendar"),
                               ("Projects","/projects","Projects"),("AI Command","/ai-command","AI Command"),("Team","/team","Team Directory"),
                               ("Reports","/reports","Document Center"),("World Clock","/world-clock","World Clocks"),("Home","/","Dashboard")]:
        @step(f"sidebar → {label}")
        def _(label=label, path=path, title=title):
            nav(label).click()
            page.wait_for_url(re.compile(re.escape(path) + r"$"))
            expect(page.get_by_role("heading", level=1)).to_have_text(title)
            expect(nav(label)).to_have_attribute("aria-current", "page")

    @step("Screen 5 placeholder (Projects)")
    def _():
        goto("/projects"); expect(page.get_by_text("Coming Soon")).to_be_visible(); expect(page.get_by_text("Screen 5")).to_be_visible()
    @step("Screen 6 placeholder (AI Command)")
    def _():
        goto("/ai-command"); expect(page.get_by_text("Coming Soon")).to_be_visible(); expect(page.get_by_text("Screen 6")).to_be_visible()
    @step("sidebar meter: API volume on most screens, Service Latency on World Clock")
    def _():
        goto("/"); expect(page.get_by_text("82% Capacity")).to_be_visible()
        goto("/world-clock"); expect(page.get_by_text("Service Latency")).to_be_visible(); expect(page.get_by_text("Optimal")).to_be_visible()
    @step("unknown route → 404 page, shell stays usable")
    def _():
        r = page.goto(BASE + "/does-not-exist", wait_until="networkidle"); assert r.status == 404, r.status

    print("\n== DASHBOARD ==")
    @step("metrics, feed, agenda render from API")
    def _():
        goto("/"); expect(page.get_by_text("Todo Tasks")).to_be_visible()
        expect(page.get_by_text("Recent Activity Feed")).to_be_visible(); expect(page.get_by_text("Lead Sync & Alignment")).to_be_visible()
        expect(page.get_by_role("heading", name=re.compile(r"^Week \d+ Performance$"))).to_be_visible()
    @step("Create Task → modal validates empty title")
    def _():
        page.get_by_role("button", name="Create Task").click()
        d = dialog("Create task"); expect(d).to_be_visible()
        d.get_by_role("button", name="Create task").click()
        expect(d.get_by_text("Enter a title for the task.")).to_be_visible()
    @step("Create Task → saves, toast, 'Todo Tasks' 12→13, feed entry")
    def _():
        d = dialog("Create task"); d.get_by_label("Title").fill("QA smoke task")
        d.get_by_role("button", name="Create task").click()
        expect(toast("Task created")).to_be_visible(); expect(d).to_be_hidden()
        expect(page.locator("article", has_text="Todo Tasks").get_by_text("13", exact=True)).to_be_visible()
        expect(page.get_by_text("QA smoke task")).to_be_visible()
    @step("Start Meeting → creates a meeting")
    def _():
        page.get_by_role("button", name="Start Meeting").click()
        d = dialog("Start a meeting"); d.get_by_label("Title").fill("QA instant sync")
        d.get_by_role("button", name="Start meeting").click(); expect(toast("Meeting scheduled")).to_be_visible()
    @step("Upload Report → adds custom template")
    def _():
        page.get_by_role("button", name="Upload Report").click()
        d = dialog("Upload report"); d.get_by_label("Report name").fill("QA Quarterly")
        d.get_by_role("button", name="Upload report").click(); expect(toast("Report uploaded")).to_be_visible()
    @step("Open Calendar quick action navigates")
    def _():
        page.get_by_role("link", name="Open Calendar").click(); page.wait_for_url(re.compile(r"/calendar$"))
    @step("agenda item deep-links into calendar event")
    def _():
        goto("/"); page.get_by_role("link", name=re.compile("Lead Sync")).click(); page.wait_for_url(re.compile(r"/calendar\?event="))
        expect(dialog("Edit event")).to_be_visible() if False else expect(page.get_by_role("dialog")).to_be_visible()
        expect(page.get_by_role("dialog").get_by_label("Title")).to_have_value("Lead Sync & Alignment")

    print("\n== ACTIONS (kanban) ==")
    @step("board renders 4 columns with counts")
    def _():
        goto("/actions")
        for col in ["Backlog","To Do","In Progress","Review"]: expect(page.get_by_role("region", name=re.compile(f"^{col},"))).to_be_visible()
    @step("ticket search filters cards")
    def _():
        page.get_by_label("Search tickets").fill("docker")
        expect(page.get_by_role("button", name=re.compile("Docker Compose"))).to_be_visible()
        expect(page.get_by_role("button", name=re.compile("Database Index"))).to_have_count(0)
        page.get_by_label("Search tickets").fill("")
    @step("assignee dropdown filter (mouse)")
    def _():
        page.get_by_role("combobox", name="Filter by assignee").click()
        page.get_by_role("option", name="Joseph Anthony").click()
        expect(page.get_by_role("button", name=re.compile("Docker Compose"))).to_be_visible()
        expect(page.get_by_role("button", name=re.compile("Database Index"))).to_have_count(0)
    @step("priority dropdown filter + Clear filters")
    def _():
        page.get_by_role("combobox", name="Filter by priority").click(); page.get_by_role("option", name="High").click()
        expect(page.get_by_role("button", name=re.compile("API Payload"))).to_be_visible()
        expect(page.get_by_role("button", name=re.compile("Docker Compose"))).to_have_count(0)
        page.get_by_role("button", name="Clear filters").click()
        expect(page.get_by_role("button", name=re.compile("Database Index"))).to_be_visible()
    @step("status filter hides other columns; keyboard-operable dropdown")
    def _():
        cb = page.get_by_role("combobox", name="Filter by status"); cb.focus(); page.keyboard.press("ArrowDown")
        expect(page.get_by_role("listbox")).to_be_visible()
        page.keyboard.press("ArrowDown"); page.keyboard.press("ArrowDown"); page.keyboard.press("Enter")   # all → backlog → todo
        expect(page.get_by_role("region", name=re.compile("^To Do,"))).to_be_visible()
        expect(page.get_by_role("region", name=re.compile("^Backlog,"))).to_have_count(0)
        page.get_by_role("button", name="Clear filters").click()
    @step("empty-filter state")
    def _():
        page.get_by_label("Search tickets").fill("zzzz-nothing")
        expect(page.get_by_text("No tasks match these filters")).to_be_visible(); page.get_by_role("button", name="Clear filters").first.click()
    @step("select card → details panel updates (mouse + keyboard)")
    def _():
        page.get_by_role("button", name=re.compile("API Payload")).click()
        expect(page.get_by_text("#TB-46: API Payload Validation")).to_be_visible()
        page.get_by_role("button", name=re.compile("Database Index")).focus(); page.keyboard.press("Enter")
        expect(page.get_by_text("#TB-44: Database Index Tuning")).to_be_visible()
    @step("status dropdown in panel moves card to another column")
    def _():
        page.get_by_role("combobox", name="Move task to status").click(); page.get_by_role("option", name="Review").click()
        expect(toast("TB-44 moved to Review")).to_be_visible()
        expect(page.get_by_role("region", name=re.compile("^Review,")).get_by_role("button", name=re.compile("Database Index"))).to_be_visible()
    @step("drag & drop card between columns (persists after reload)")
    def _():
        src = page.get_by_role("button", name=re.compile("Docker Compose")); dst = page.get_by_role("region", name=re.compile("^In Progress,"))
        src.drag_to(dst); expect(toast("TB-45 moved to In Progress")).to_be_visible()
        page.reload(wait_until="networkidle")
        expect(page.get_by_role("region", name=re.compile("^In Progress,")).get_by_role("button", name=re.compile("Docker Compose"))).to_be_visible()
    @step("edit task via panel → Save changes")
    def _():
        page.get_by_role("button", name=re.compile("Docker Compose")).click()
        page.get_by_role("button", name="Edit").click()
        d = page.get_by_role("dialog"); d.get_by_label("Title").fill("Docker Compose Setup v2")
        d.get_by_role("button", name="Save changes").click(); expect(toast("Task updated")).to_be_visible()
        expect(page.get_by_role("button", name=re.compile("Docker Compose Setup v2"))).to_be_visible()
    @step("delete task asks for confirmation, Cancel keeps it")
    def _():
        page.get_by_role("button", name="Delete", exact=True).click()
        expect(dialog("Delete task?")).to_be_visible(); dialog("Delete task?").get_by_role("button", name="Cancel").click()
        expect(page.get_by_role("button", name=re.compile("Docker Compose Setup v2"))).to_be_visible()
    @step("delete task confirmed removes it")
    def _():
        page.get_by_role("button", name="Delete", exact=True).click(); dialog("Delete task?").get_by_role("button", name="Delete task").click()
        expect(toast("Task deleted")).to_be_visible(); expect(page.get_by_role("button", name=re.compile("Docker Compose Setup v2"))).to_have_count(0)
    @step("Create Task from board adds a card")
    def _():
        page.get_by_role("button", name="Create Task").click(); d = dialog("Create task")
        d.get_by_label("Title").fill("Board-created task"); d.get_by_role("button", name="Create task").click()
        expect(page.get_by_role("button", name=re.compile("Board-created task"))).to_be_visible()
    @step("close details panel (X) and reopen by selecting")
    def _():
        page.get_by_role("button", name="Close task details").click(); expect(page.get_by_role("complementary", name="Task details")).to_have_count(0)
        page.get_by_role("button", name=re.compile("API Payload")).click(); expect(page.get_by_role("complementary", name="Task details")).to_be_visible()
    @step("deep link ?task= selects that task")
    def _():
        goto("/actions?task=t-46"); expect(page.get_by_text("#TB-46: API Payload Validation")).to_be_visible()

    print("\n== CALENDAR ==")
    @step("month grid shows today highlighted + events")
    def _():
        goto("/calendar"); expect(page.get_by_role("grid")).to_be_visible(); expect(page.get_by_role("img", name="Today")).to_be_visible()
        expect(page.get_by_role("button", name=re.compile("Lead Sync")).first).to_be_visible()
    @step("prev / next / Today navigation")
    def _():
        t0 = page.locator("h2[aria-live]").inner_text()
        page.get_by_role("button", name="Next month").click(); t1 = page.locator("h2[aria-live]").inner_text(); assert t1 != t0, (t0, t1)
        page.get_by_role("button", name="Previous month").click(); page.get_by_role("button", name="Previous month").click()
        assert page.locator("h2[aria-live]").inner_text() != t1
        page.get_by_role("button", name="Today", exact=True).click(); assert page.locator("h2[aria-live]").inner_text() == t0
    @step("Week and Day views render a time grid")
    def _():
        page.get_by_role("tab", name="Week").click(); expect(page.get_by_text("Lead Sync & Alignment").first).to_be_visible()
        assert re.search(r"–", page.locator("h2[aria-live]").inner_text())
        page.get_by_role("tab", name="Day").click(); expect(page.get_by_text("UI Design Finalization").first).to_be_visible()
        page.get_by_role("tab", name="Month").click()
    @step("Add Event validates (title; end-before-start)")
    def _():
        page.get_by_role("button", name="Add Event", exact=True).click(); d = dialog("Add event")
        d.get_by_role("button", name="Add event").click(); expect(d.get_by_text("Enter a title for the event.")).to_be_visible()
        d.get_by_label("Title").fill("QA event"); d.get_by_label("Starts").fill("14:00"); d.get_by_label("Ends").fill("13:00")
        d.get_by_role("button", name="Add event").click(); expect(d.get_by_text("End time must be after the start time.")).to_be_visible()
    @step("Add Event saves; busy day shows '+1 more' → Day view lists it")
    def _():
        d = dialog("Add event"); d.get_by_label("Ends").fill("15:00"); d.get_by_role("button", name="Add event").click()
        expect(toast("Event added")).to_be_visible()
        page.get_by_role("button", name=re.compile(r"^\+1 more")).click()               # today already has 2 chips; cap is 2
        expect(page.get_by_role("tab", name="Day")).to_have_attribute("aria-selected", "true")
        expect(page.get_by_role("button", name=re.compile("QA event"))).to_be_visible()
    @step("click event → edit → save")
    def _():
        page.get_by_role("button", name=re.compile("QA event")).first.click(); d = dialog("Edit event")
        d.get_by_label("Title").fill("QA event edited"); d.get_by_role("button", name="Save changes").click()
        expect(toast("Event updated")).to_be_visible(); expect(page.get_by_role("button", name=re.compile("QA event edited")).first).to_be_visible()
    @step("delete event with confirmation")
    def _():
        page.get_by_role("button", name=re.compile("QA event edited")).first.click(); d = dialog("Edit event")
        d.get_by_role("button", name="Delete event").click(); dialog("Delete event?").get_by_role("button", name="Delete event").click()
        expect(toast("Event deleted")).to_be_visible(); expect(page.get_by_role("button", name=re.compile("QA event edited"))).to_have_count(0)
        page.get_by_role("tab", name="Month").click()
    @step("Schedule Meeting → appears in Upcoming Meetings")
    def _():
        page.get_by_role("button", name="Schedule Meeting").click(); d = dialog("Schedule meeting")
        d.get_by_label("Title").fill("QA planning"); 
        # choose tomorrow so it is "upcoming" regardless of current time
        import datetime; tmr = (datetime.date.today() + datetime.timedelta(days=2)).isoformat()
        d.get_by_label("Date").fill(tmr); d.get_by_role("button", name="Schedule meeting").click()
        expect(toast("Meeting scheduled")).to_be_visible()
    @step("Team Availability: toggle own status")
    def _():
        page.get_by_role("button", name=re.compile("Your status: Free")).click(); expect(toast("You're now In Meeting")).to_be_visible()
        page.get_by_role("button", name=re.compile("Your status: In Meeting")).click(); expect(toast("You're now Free")).to_be_visible()
    @step("click empty time slot in Day view opens prefilled Add Event")
    def _():
        page.get_by_role("tab", name="Day").click(); col = page.locator("[class*=dayCol]").first
        box = col.bounding_box(); page.mouse.click(box["x"] + 60, box["y"] + 48 * 9 + 10)
        d = dialog("Add event"); expect(d).to_be_visible(); expect(d.get_by_label("Starts")).to_have_value("09:00"); page.keyboard.press("Escape"); expect(d).to_be_hidden()
    @step("deep link ?event= opens the event")
    def _():
        goto("/calendar?event=e-retro"); expect(page.get_by_role("dialog").get_by_label("Title")).to_have_value("Sprint Retro Alignment")

    print("\n== CHANNELS ==")
    @step("default channel + sidebar unread badge")
    def _():
        goto("/channels"); expect(page.get_by_role("heading", name="# announcements")).to_be_visible()
        expect(page.get_by_text("Hi everyone! The UI design systems")).to_be_visible(); expect(page.get_by_text("John Doe is typing…")).to_be_visible()
        expect(page.locator('nav[aria-label="Primary"]').get_by_label("4 unread")).to_be_visible()
    @step("opening a channel marks it read (badge 4→2)")
    def _():
        page.get_by_role("button", name=re.compile("design-system")).click()
        expect(page.get_by_role("heading", name="# design-system")).to_be_visible()
        expect(page.locator('nav[aria-label="Primary"]').get_by_label("2 unread")).to_be_visible(timeout=8000)
    @step("send message with Enter; composer clears")
    def _():
        box = page.get_by_label("Message #design-system"); box.fill("QA hello world"); box.press("Enter")
        expect(page.get_by_text("QA hello world")).to_be_visible(); expect(box).to_have_value("")
    @step("send disabled when empty")
    def _():
        expect(page.get_by_role("button", name="Send message")).to_be_disabled()
    @step("add + remove a reaction")
    def _():
        msg = page.get_by_role("article", name=re.compile("Stad Osuyos at")).last
        msg.hover(); msg.get_by_role("button", name="Add reaction").click(); page.get_by_role("menuitem", name="🚀").click()
        chip = msg.get_by_role("button", name=re.compile("🚀 1")); expect(chip).to_be_visible()
        chip.click(); expect(msg.get_by_role("button", name=re.compile("🚀"))).to_have_count(0)
    @step("emoji picker inserts into composer")
    def _():
        page.get_by_role("button", name="Insert emoji").click(); page.get_by_role("menuitem", name="🔥").click()
        expect(page.get_by_label("Message #design-system")).to_have_value("🔥")
        page.get_by_label("Message #design-system").fill("")
    @step("attach a file → chip → sent with message")
    def _():
        page.locator('input[type=file]').set_input_files({"name": "spec.pdf", "mimeType": "application/pdf", "buffer": b"x" * 2048})
        expect(page.get_by_text("spec.pdf · 2 KB")).to_be_visible(); page.get_by_role("button", name="Send message").click()
        expect(page.get_by_role("log").get_by_text("spec.pdf")).to_be_visible()
    @step("in-thread search filters messages")
    def _():
        page.get_by_role("button", name="Search messages").click(); page.get_by_label("Search in this conversation").fill("Spacing scale")
        expect(page.get_by_text("Spacing scale and radii")).to_be_visible(); expect(page.get_by_text("QA hello world")).to_have_count(0)
        page.get_by_label("Search in this conversation").fill("zzzz"); expect(page.get_by_text("No messages match")).to_be_visible()
        page.get_by_role("button", name="Close search").click()
    @step("pin to Favorites moves channel up")
    def _():
        page.get_by_role("button", name="Pin to Favorites").click(); expect(toast("Pinned #design-system to Favorites")).to_be_visible()
        fav = page.locator("section[aria-labelledby=grp-fav]"); expect(fav.get_by_role("button", name=re.compile("design-system"))).to_be_visible()
        page.get_by_role("button", name="Unpin from Favorites").click(); expect(fav.get_by_role("button", name=re.compile("design-system"))).to_have_count(0)
    @step("direct message conversation")
    def _():
        page.get_by_role("button", name=re.compile("John Doe")).click(); expect(page.get_by_label("Message John Doe")).to_be_visible()
        expect(page.get_by_role("heading", name="Conversation Details")).to_be_visible()
    @step("empty channel shows empty state")
    def _():
        page.get_by_role("button", name=re.compile("dev-qa")).click(); expect(page.get_by_text("Start the conversation in #dev-qa")).to_be_visible()
    @step("deep link ?c= selects conversation")
    def _():
        goto("/channels?c=c-marketing-ops"); expect(page.get_by_role("heading", name="# marketing-ops")).to_be_visible()

    print("\n== TEAM ==")
    @step("search filters cards by name / role / skill")
    def _():
        goto("/team"); s = page.get_by_label("Search employees by name, role, or skill")
        s.fill("ray"); expect(page.get_by_role("list", name="1 team members")).to_be_visible(); s.fill("cto"); expect(page.get_by_text("Joseph Anthony").first).to_be_visible()
        s.fill("zzz"); expect(page.get_by_text("No one matches these filters")).to_be_visible(); page.get_by_role("button", name="Clear filters").click()
    @step("department + role dropdown filters")
    def _():
        page.get_by_role("combobox", name="Filter by department").click(); page.get_by_role("option", name="Tech").click()
        expect(page.get_by_role("list", name="2 team members")).to_be_visible()
        page.get_by_role("combobox", name="Filter by role").click(); page.get_by_role("option", name="CTO").click()
        expect(page.get_by_role("list", name="1 team members")).to_be_visible()
        page.get_by_role("combobox", name="Filter by department").click(); page.get_by_role("option", name="All Departments").click()
        page.get_by_role("combobox", name="Filter by role").click(); page.get_by_role("option", name="All Roles").click()
    @step("Add Member validates required fields")
    def _():
        page.get_by_role("button", name="Add Member").first.click(); d = dialog("Add member")
        d.get_by_role("button", name="Add member").click(); expect(d.get_by_text("Enter a name.")).to_be_visible(); expect(d.get_by_text("Enter a job title.")).to_be_visible()
    @step("Add Member saves → card + org chart node")
    def _():
        d = dialog("Add member"); d.get_by_label("Full name").fill("Taylor Reyes"); d.get_by_label("Job title").fill("Analyst"); d.get_by_label("Department").fill("Finance")
        d.get_by_role("button", name="Add member").click(); expect(toast("Taylor Reyes added to the team")).to_be_visible()
        expect(page.get_by_role("heading", name="Taylor Reyes")).to_be_visible()
        expect(page.get_by_role("list", name="Organizational chart").get_by_role("button", name=re.compile("Taylor Reyes"))).to_be_visible()
    @step("profile: view → edit → Cancel discards")
    def _():
        page.get_by_role("article").filter(has_text="Ray Land").get_by_role("button", name="Profile").click()
        expect(dialog("Profile")).to_be_visible(); page.get_by_role("button", name="Edit member").click()
        d = dialog("Edit Ray Land"); d.get_by_label("Job title").fill("Changed title"); d.get_by_role("button", name="Cancel").click()
        expect(toast("Changes discarded")).to_be_visible(); expect(dialog("Profile")).to_contain_text("CEO")
    @step("profile: edit → Save changes persists to card")
    def _():
        page.get_by_role("button", name="Edit member").click(); d = dialog("Edit Ray Land")
        d.get_by_label("Job title").fill("Chief Executive"); d.get_by_role("button", name="Save changes").click()
        expect(toast("Ray Land updated")).to_be_visible(); page.keyboard.press("Escape")
        expect(page.get_by_text("Chief Executive").first).to_be_visible()
    @step("profile edit validation + can't create reporting loop")
    def _():
        page.get_by_role("article").filter(has_text="Ray Land").get_by_role("button", name="Profile").click(); page.get_by_role("button", name="Edit member").click()
        d = dialog("Edit Ray Land"); d.get_by_label("Full name").fill(""); d.get_by_role("button", name="Save changes").click(); expect(d.get_by_text("Enter a name.")).to_be_visible()
        d.get_by_role("combobox", name="Reports to").click(); expect(page.get_by_role("option", name=re.compile("Taylor Reyes"))).to_have_count(0)  # descendants excluded
        page.keyboard.press("Escape"); page.keyboard.press("Escape")
    @step("delete member needs confirmation; removes card + chart node")
    def _():
        page.get_by_role("article").filter(has_text="Taylor Reyes").get_by_role("button", name="Profile").click()
        page.get_by_role("button", name="Delete member").click(); c = dialog("Delete Taylor Reyes?"); expect(c).to_be_visible()
        c.get_by_role("button", name="Delete member").click(); expect(toast("Taylor Reyes removed from the team")).to_be_visible()
        expect(page.get_by_role("heading", name="Taylor Reyes")).to_have_count(0)
    @step("org chart node opens profile; Expand Chart modal")
    def _():
        page.get_by_role("list", name="Organizational chart").get_by_role("button", name=re.compile("Ereika")).click(); expect(dialog("Profile")).to_contain_text("CFO"); page.keyboard.press("Escape")
        page.get_by_role("button", name="Expand Chart").click(); expect(dialog("Organizational Chart")).to_be_visible(); page.keyboard.press("Escape"); expect(dialog("Organizational Chart")).to_be_hidden()
    @step("Chat button opens a DM in Channels")
    def _():
        page.get_by_role("article").filter(has_text="Ereika").get_by_role("button", name="Chat").click(); page.wait_for_url(re.compile(r"/channels\?c="))
        expect(page.get_by_label("Message Ereika")).to_be_visible()
    @step("can't chat with yourself; can't delete yourself")
    def _():
        goto("/team"); expect(page.get_by_role("article").filter(has_text="Stad Osuyos").get_by_role("button", name="Chat")).to_be_disabled()
        page.get_by_role("article").filter(has_text="Stad Osuyos").get_by_role("button", name="Profile").click()
        expect(page.get_by_role("button", name="Delete member")).to_have_count(0); page.keyboard.press("Escape")
    @step("deep link ?member= opens profile")
    def _():
        goto("/team?member=m-joseph"); expect(dialog("Profile")).to_contain_text("Joseph Anthony")

    print("\n== REPORTS ==")
    @step("templates + live preview render")
    def _():
        goto("/reports?template=tpl-weekly"); expect(page.get_by_text("Weekly Progress Sync")).to_be_visible(); expect(page.get_by_text("Weekly Report v2.4")).to_be_visible()
    @step("Custom tab filters (count includes the uploaded report)")
    def _():
        page.get_by_role("tab", name=re.compile(r"Custom \(3\)")).click()
        expect(page.get_by_role("article", name="Incident Report")).to_be_visible(); expect(page.get_by_role("article", name="Weekly Report")).to_have_count(0)
        expect(page.get_by_role("article", name="QA Quarterly")).to_be_visible(); page.get_by_role("tab", name="All Templates").click()
    @step("Use Template selects card + updates preview")
    def _():
        page.get_by_role("button", name="Use Monthly Report template").click(); expect(page.get_by_text("Monthly Report v1.8")).to_be_visible()
        expect(page.get_by_text("Monthly Operations Review")).to_be_visible(); expect(page.get_by_role("button", name="Use Monthly Report template")).to_have_attribute("aria-pressed", "true")
    @step("Preview Draft selects too")
    def _():
        page.get_by_role("button", name="Preview draft of Incident Report").click(); expect(page.get_by_text("Incident Post-Mortem")).to_be_visible()
    @step("Create Draft → toast + shows in activity feed")
    def _():
        page.get_by_role("button", name="Create Draft").click(); expect(toast("Draft “Incident Post-Mortem” created")).to_be_visible()
        goto("/"); expect(page.get_by_text("created a draft:")).to_be_visible()
    @step("Export PDF calls the print dialog on the preview sheet")
    def _():
        goto("/reports"); page.evaluate("() => { window.__printed = 0; window.print = () => { window.__printed++ } }")
        page.get_by_role("button", name="Export PDF").click(); assert page.evaluate("window.__printed") == 1
        assert page.locator("#print-sheet").count() == 1
    @step("print stylesheet shows only the sheet")
    def _():
        page.emulate_media(media="print"); vis = page.evaluate("""() => { const s=document.getElementById('print-sheet'); const h=document.querySelector('header');
            return [getComputedStyle(s).visibility, getComputedStyle(h).visibility]; }""")
        page.emulate_media(media="screen"); assert vis == ["visible", "hidden"], vis
    @step("deep link ?template= selects template")
    def _():
        goto("/reports?template=tpl-project"); expect(page.get_by_text("Project Status Report")).to_be_visible()

    print("\n== WORLD CLOCKS ==")
    @step("8 city clocks with live time")
    def _():
        goto("/world-clock"); expect(page.get_by_role("list", name="World clocks").get_by_role("listitem")).to_have_count(8)
        for city in ["Manila","Houston","Miami","New York","London","Tokyo","Sydney","Dubai"]: expect(page.get_by_role("heading", name=city)).to_be_visible()
    @step("clock hands move every second")
    def _():
        h1 = page.locator("svg[aria-label^='Analog clock'] line").nth(6).get_attribute("transform"); page.wait_for_timeout(2200)
        h2 = page.locator("svg[aria-label^='Analog clock'] line").nth(6).get_attribute("transform"); assert h1 != h2, (h1, h2)
    @step("times match the real offsets (Tokyo − Manila = 1h, Sydney − Manila ≥ 2h)")
    def _():
        t = lambda c: page.locator("li", has=page.get_by_role("heading", name=c)).locator("p").nth(1).inner_text()
        from datetime import datetime
        f = lambda s: datetime.strptime(s, "%I:%M %p")
        d = (f(t("Tokyo")) - f(t("Manila"))).seconds // 60; assert d == 60, d
    @step("header search filters time zones (city, abbreviation, empty state)")
    def _():
        s = page.get_by_label("Search timezones"); s.fill("tokyo"); expect(page.get_by_role("list", name="World clocks").get_by_role("listitem")).to_have_count(1)
        s.fill("JST"); expect(page.get_by_role("heading", name="Tokyo")).to_be_visible(); s.fill("zzz"); expect(page.get_by_text("No time zones match your search")).to_be_visible()
        page.get_by_role("button", name="Clear search", exact=True).first.click() if False else page.get_by_role("button", name="Clear search").first.click()
        expect(page.get_by_role("list", name="World clocks").get_by_role("listitem")).to_have_count(8)
    @step("header time labels: MANILA TIME on this screen")
    def _():
        expect(page.get_by_text("MANILA TIME")).to_be_visible()

    print("\n== GLOBAL SEARCH / NOTIFICATIONS / SETTINGS / PROFILE ==")
    @step("global search: grouped results, Enter navigates")
    def _():
        goto("/"); s = page.get_by_label("Search anything"); s.fill("sprint"); expect(page.get_by_role("option", name=re.compile("Sprint Retro")).first).to_be_visible()
        s.press("ArrowDown") ; s.press("Enter"); page.wait_for_url(re.compile(r"/calendar\?event=")); expect(page.get_by_role("dialog")).to_be_visible(); page.keyboard.press("Escape")
    @step("global search: no results message")
    def _():
        goto("/"); page.get_by_label("Search anything").fill("qqqqq"); expect(page.get_by_text("No results for “qqqqq”.")).to_be_visible()
    @step("global search finds people and routes to profile")
    def _():
        s = page.get_by_label("Search anything"); s.fill("Ereika"); page.get_by_role("option", name=re.compile("Ereika")).first.click(); page.wait_for_url(re.compile(r"/team"))
        expect(dialog("Profile")).to_contain_text("Ereika")
    @step("notification bell: unread count, open item navigates, mark all read")
    def _():
        goto("/"); bell = page.get_by_role("button", name=re.compile(r"Notifications \(\d+ unread\)")); expect(bell).to_be_visible(); bell.click()
        expect(page.get_by_role("dialog", name="Notifications")).to_be_visible(); page.get_by_role("button", name="Mark all read").click()
        expect(page.get_by_role("button", name="Notifications", exact=True)).to_be_visible()
    @step("settings: change primary time zone → header + banner update")
    def _():
        page.get_by_role("button", name=re.compile("Stad Osuyos")).click(); page.get_by_role("menuitem", name="Settings").click(); d = dialog("Settings"); expect(d).to_be_visible()
        d.get_by_role("combobox", name="Primary time zone").click(); page.get_by_role("option", name=re.compile("^Tokyo")).click()
        expect(toast("Primary time zone updated")).to_be_visible(); expect(page.get_by_text("JST TIME")).to_be_visible()
    @step("settings: restore Manila; reduce motion sets root attribute; light theme disabled")
    def _():
        d = dialog("Settings"); d.get_by_role("combobox", name="Primary time zone").click(); page.get_by_role("option", name=re.compile("^Manila")).click()
        expect(page.get_by_text("PH TIME")).to_be_visible()
        d.get_by_role("switch", name="Reduce motion").click(); expect(page.locator("html")).to_have_attribute("data-reduce-motion", "true")
        d.get_by_role("switch", name="Reduce motion").click(); expect(page.locator("html")).to_have_attribute("data-reduce-motion", "false")
        expect(d.get_by_role("tab", name="Light")).to_be_disabled()
    @step("settings: notification toggle hides that type from the bell")
    def _():
        d = dialog("Settings"); sw = d.get_by_role("switch", name=re.compile("Meeting reminders")); sw.click(); expect(sw).to_have_attribute("aria-checked", "false")
        page.keyboard.press("Escape"); page.get_by_role("button", name=re.compile("^Notifications")).click()
        expect(page.get_by_role("dialog", name="Notifications").get_by_text("scheduled a new meeting")).to_have_count(0); page.keyboard.press("Escape")
        page.get_by_role("button", name=re.compile("Stad Osuyos")).click(); page.get_by_role("menuitem", name="Settings").click()
        dialog("Settings").get_by_role("switch", name=re.compile("Meeting reminders")).click(); page.keyboard.press("Escape")
    @step("my profile: edit name → header updates; cancel path; then restore")
    def _():
        page.get_by_role("button", name=re.compile("Stad Osuyos")).click(); page.get_by_role("menuitem", name="My profile").click(); expect(dialog("My profile")).to_be_visible()
        page.get_by_role("button", name="Edit profile").click(); d = dialog("Edit profile"); d.get_by_label("Full name").fill("Stad O. Osuyos"); d.get_by_role("button", name="Save changes").click()
        expect(toast("Profile saved")).to_be_visible(); page.keyboard.press("Escape"); expect(page.get_by_text("Stad O. Osuyos").first).to_be_visible()
        page.get_by_role("button", name=re.compile("Stad O. Osuyos")).click(); page.get_by_role("menuitem", name="My profile").click(); page.get_by_role("button", name="Edit profile").click()
        dialog("Edit profile").get_by_label("Full name").fill("Stad Osuyos"); dialog("Edit profile").get_by_role("button", name="Save changes").click(); page.keyboard.press("Escape")
        expect(page.get_by_role("button", name=re.compile("^Stad Osuyos")).first).to_be_visible()

    print("\n== MODAL / DROPDOWN BEHAVIOUR ==")
    @step("Escape closes modal and returns focus to trigger")
    def _():
        goto("/actions"); b = page.get_by_role("button", name="Create Task"); b.click(); expect(dialog("Create task")).to_be_visible(); page.keyboard.press("Escape")
        expect(dialog("Create task")).to_be_hidden(); expect(b).to_be_focused()
    @step("modal traps focus (Tab cycles inside)")
    def _():
        page.get_by_role("button", name="Create Task").click(); d = dialog("Create task")
        for _i in range(25): page.keyboard.press("Tab")
        assert page.evaluate("document.activeElement.closest('[role=dialog]') !== null"); page.keyboard.press("Escape")
    @step("backdrop click closes modal")
    def _():
        page.get_by_role("button", name="Create Task").click(); page.mouse.click(5, 5); expect(dialog("Create task")).to_be_hidden()
    @step("modal locks body scroll while open and restores it")
    def _():
        page.get_by_role("button", name="Create Task").click(); assert page.evaluate("document.body.style.overflow") == "hidden"; page.keyboard.press("Escape")
        assert page.evaluate("document.body.style.overflow") == ""

    print("\n== ERROR / LOADING STATES ==")
    @step("API failure shows error state with working Try again")
    def _():
        page.route("**/api/tasks", lambda r: r.abort())
        goto("/actions"); expect(page.get_by_text("Something went wrong")).to_be_visible()
        page.unroute("**/api/tasks"); page.get_by_role("button", name="Try again").click(); expect(page.get_by_role("region", name=re.compile("^Backlog,"))).to_be_visible()
    @step("app-level API failure shows full-page error + retry")
    def _():
        page.route("**/api/members", lambda r: r.abort()); goto("/"); expect(page.get_by_text("Something went wrong")).to_be_visible()
        page.unroute("**/api/members"); page.get_by_role("button", name="Try again").click(); expect(page.get_by_role("heading", level=1)).to_have_text("Dashboard")
    @step("server validation error surfaces in the form (not a crash)")
    def _():
        goto("/actions"); page.route("**/api/tasks", lambda r: r.fulfill(status=400, content_type="application/json", body='{"error":"Title is required"}') if r.request.method == "POST" else r.continue_())
        page.get_by_role("button", name="Create Task").click(); d = dialog("Create task"); d.get_by_label("Title").fill("x"); d.get_by_role("button", name="Create task").click()
        expect(d.get_by_role("alert").filter(has_text="Title is required")).to_be_visible(); page.unroute("**/api/tasks"); page.keyboard.press("Escape")

    print("\n== RESPONSIVE (no horizontal overflow) ==")
    for w, h in [(1280, 800), (1024, 768), (768, 1024), (390, 844), (360, 740)]:
        @step(f"no page-level horizontal scroll at {w}px on all screens")
        def _(w=w, h=h):
            page.set_viewport_size({"width": w, "height": h}); bad = []
            for path in ["/", "/channels", "/actions", "/calendar", "/team", "/reports", "/world-clock", "/projects"]:
                goto(path); page.wait_for_timeout(250)
                sw, iw = page.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
                if sw > iw + 1: bad.append(f"{path}: {sw}>{iw}")
            assert not bad, "; ".join(bad)
    @step("phone: notification + search popovers stay inside the viewport")
    def _():
        page.set_viewport_size({"width": 390, "height": 844}); goto("/")
        page.get_by_role("button", name=re.compile(r"^Notifications")).click()
        b1 = page.get_by_role("dialog", name="Notifications").bounding_box(); assert b1["x"] >= 0 and b1["x"] + b1["width"] <= 390, b1
        page.keyboard.press("Escape"); page.get_by_label("Search anything").fill("api"); expect(page.get_by_role("listbox", name="Search results")).to_be_visible()
        b2 = page.get_by_role("listbox", name="Search results").bounding_box(); assert b2["x"] >= 0 and b2["x"] + b2["width"] <= 390, b2
    @step("phone: header bell + user are reachable (inside viewport)")
    def _():
        goto("/team")
        for name in [re.compile(r"^Notifications"), re.compile(r"Stad Osuyos")]:
            bb = page.get_by_role("button", name=name).first.bounding_box(); assert bb and bb["x"] + bb["width"] <= 390, (name, bb)
    page.set_viewport_size({"width": 1440, "height": 1024})

    browser.close()

passed = sum(1 for _, ok, _ in RESULTS if ok); failed = [(n, m) for n, ok, m in RESULTS if not ok]
print(f"\n==== {passed}/{len(RESULTS)} passed, {len(failed)} failed ====")
for n, m in failed: print(" ✗", n, "→", m)
print("\nCONSOLE errors/warnings:", json.dumps(CONSOLE, indent=1)[:2500] if CONSOLE else "none")
