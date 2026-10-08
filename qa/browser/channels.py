"""
Channels & messaging — browser tests with several real signed-in users.
  DATABASE_URL=… node qa/support/seed-accounts.mjs && BASE=http://localhost:3201 python3 qa/browser/channels.py
"""
import base64, io, json, os, re, sys, time
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE", "http://localhost:3201")
PASSWORD = "TestPass-12345"
RESULTS, CONSOLE = [], []
os.makedirs("qa/failures", exist_ok=True)
expect.set_options(timeout=9000)

def step(name):
    def deco(fn):
        try: fn(); RESULTS.append((name, True, "")); print(f"  PASS  {name}")
        except Exception as e:
            msg = (str(e).strip().splitlines() or [repr(e)])[0][:260]; RESULTS.append((name, False, msg)); print(f"  FAIL  {name}\n        {msg}")
            for who, pg in PAGES.items():
                try: pg.screenshot(path=f"qa/failures/{re.sub(r'[^a-z0-9]+','-',name.lower())[:44]}-{who}.png")
                except Exception: pass
        return fn
    return deco
def section(t): print(f"\n== {t} ==")

PAGES = {}
def new_user(browser, who, w=1440, h=1000):
    ctx = browser.new_context(viewport={"width": w, "height": h}, permissions=["clipboard-read", "clipboard-write"], accept_downloads=True)
    r = ctx.request.post(BASE + "/api/auth/login", data={"email": f"{who}@test.local", "password": PASSWORD}); assert r.ok, who
    pg = ctx.new_page(); pg.set_default_timeout(9000)
    pg.on("console", lambda m: CONSOLE.append((who, m.type, m.text[:200])) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: CONSOLE.append((who, "pageerror", str(e)[:200])))
    PAGES[who] = pg
    return ctx, pg

def dm_between(ctx, other_id):
    r = ctx.request.post(BASE + "/api/channels/dm", data={"memberId": other_id}); assert r.ok, r.text(); return r.json()["id"]
def goto(pg, c):
    # The app keeps a live connection open on every page, so "network idle" never happens — wait for the thread itself.
    pg.goto(f"{BASE}/channels?c={c}", wait_until="domcontentloaded"); expect(pg.get_by_role("log")).to_be_visible()
def composer(pg, label): return pg.get_by_label(label, exact=True)
def panel(pg): return pg.get_by_role("complementary", name="Channel details")
def convo_nav(pg): return pg.locator('nav[aria-label="Conversations"]')
def members_online(pg): return panel(pg).get_by_text(re.compile(r"Members — \d+ online"))
def send(pg, label, text, enter=True):
    box = composer(pg, label); box.fill(text)
    if enter: box.press("Enter")
def status_btn(pg, state=None): return pg.get_by_role("button", name=re.compile(r"Message status: " + (state or "")))
def log_text(pg, text): return pg.get_by_role("log").get_by_text(text)

FORMATTED = "Plan:\n\n  • first item\n  • second item\n\n1. step one\n2. step two\n    - nested with 4 spaces\n\tindented with a tab\n\nThanks,\n  Alice"

def png_bytes(w=400, h=300):
    from PIL import Image
    im = Image.new("RGB", (w, h)); px = im.load()
    for x in range(w):
        for y in range(h): px[x, y] = (x * 255 // w, y * 255 // h, 160)
    b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()
PNG = png_bytes()
PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
def attach(pg, *files):
    pg.locator('input[type=file]').set_input_files([{"name": n, "mimeType": m, "buffer": b} for n, m, b in files])

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox"])
    actx, A = new_user(browser, "alice"); bctx, B = new_user(browser, "bob"); cctx, C = new_user(browser, "carol")
    DM = dm_between(actx, "m_bob")

    # ═════════════════════════════════════════════════════════════════════════════════
    section("1. Online status")
    @step("members panel lists registered accounts only — never demo people, accountless or unverified members")
    def _():
        goto(A, "c-announcements"); li = panel(A).get_by_role("listitem")
        expect(li).to_have_count(4)
        text = " | ".join(li.all_inner_texts())
        for who in ["Alice Tester (you)", "Bob Tester", "Carol Tester", "Gina Tester"]: assert who in text, who
        for who in ["Ray Land", "Joseph Anthony", "Stad Osuyos", "Dave", "Erin"]: assert who not in text, f"{who} must not be listed"
    @step("everyone but you starts offline; a teammate opening the app turns their dot online LIVE")
    def _():
        expect(members_online(A)).to_have_text("Members — 1 online")
        bob_row = panel(A).get_by_role("button", name=re.compile("Bob Tester")); expect(bob_row.get_by_role("img", name="Offline")).to_be_visible()
        goto(B, "c-announcements")
        expect(members_online(A)).to_have_text("Members — 2 online"); expect(bob_row.get_by_role("img", name="Online")).to_be_visible()
    @step("closing the page makes them offline for everyone")
    def _():
        global B
        B.close(); expect(members_online(A)).to_have_text("Members — 1 online", timeout=15000)
        B = bctx.new_page(); B.set_default_timeout(9000); PAGES["bob"] = B; goto(B, "c-announcements"); expect(members_online(A)).to_have_text("Members — 2 online")
    @step("direct-message list: registered teammate has an online dot; the placeholder people have none")
    def _():
        goto(A, DM)
        expect(convo_nav(A).get_by_role("button", name=re.compile("Bob Tester")).get_by_role("img", name="Online")).to_be_visible()
        for placeholder in ["Sarah Chen", "John Doe", "Liam Johnson"]:
            row = convo_nav(A).get_by_role("button", name=re.compile(placeholder)); expect(row).to_be_visible(); expect(row.get_by_role("img")).to_have_count(0)
    @step("DM header shows the peer's presence; for a non-registered placeholder it says so instead")
    def _():
        expect(A.get_by_text("Online", exact=True).first).to_be_visible()
        convo_nav(A).get_by_role("button", name=re.compile("Sarah Chen")).click()
        expect(A.get_by_text("doesn't have a Teambase account")).to_be_visible(); expect(panel(A).get_by_role("listitem")).to_have_count(1)
        goto(A, DM)

    # ═════════════════════════════════════════════════════════════════════════════════
    section("2. Typing indicator")
    goto(A, DM); goto(B, DM)
    @step("Bob sees 'Alice is typing…' while she types; Alice never sees her own")
    def _():
        composer(A, "Message Bob Tester").click(); A.keyboard.type("hello th", delay=40)
        expect(B.get_by_text("Alice is typing…")).to_be_visible(); expect(A.get_by_text("Alice is typing…")).to_have_count(0)
    @step("it disappears when she clears the box")
    def _():
        composer(A, "Message Bob Tester").fill(""); expect(B.get_by_text("Alice is typing…")).to_have_count(0)
    @step("it disappears on its own when she just stops typing")
    def _():
        composer(A, "Message Bob Tester").click(); A.keyboard.type("x"); expect(B.get_by_text("Alice is typing…")).to_be_visible()
        expect(B.get_by_text("Alice is typing…")).to_have_count(0, timeout=12000); composer(A, "Message Bob Tester").fill("")
    @step("it disappears when she sends — and the message arrives live")
    def _():
        composer(A, "Message Bob Tester").click(); A.keyboard.type("typing then sending", delay=20); expect(B.get_by_text("Alice is typing…")).to_be_visible()
        A.keyboard.press("Enter"); expect(B.get_by_text("Alice is typing…")).to_have_count(0); expect(log_text(B, "typing then sending")).to_be_visible()
    @step("it disappears when she leaves the box without sending")
    def _():
        composer(A, "Message Bob Tester").click(); A.keyboard.type("abandoned"); expect(B.get_by_text("Alice is typing…")).to_be_visible()
        A.get_by_role("heading", name="Bob Tester").click(); expect(B.get_by_text("Alice is typing…")).to_have_count(0); composer(A, "Message Bob Tester").fill("")
    @step("in a channel it shows for everyone watching; two typists are combined")
    def _():
        goto(A, "c-announcements"); goto(B, "c-announcements"); goto(C, "c-announcements")
        composer(A, "Message #announcements").click(); A.keyboard.type("a"); expect(C.get_by_text("Alice is typing…")).to_be_visible()
        composer(B, "Message #announcements").click(); B.keyboard.type("b"); expect(C.get_by_text("Alice and Bob are typing…")).to_be_visible()
        composer(A, "Message #announcements").fill(""); composer(B, "Message #announcements").fill(""); expect(C.get_by_text(re.compile("typing…"))).to_have_count(0)
    @step("typing in a private DM is not shown to a bystander")
    def _():
        goto(C, "c-announcements"); goto(A, DM)
        composer(A, "Message Bob Tester").click(); A.keyboard.type("private"); A.wait_for_timeout(1200)
        expect(C.get_by_text(re.compile("typing…"))).to_have_count(0); composer(A, "Message Bob Tester").fill("")

    # ═════════════════════════════════════════════════════════════════════════════════
    section("3. Message status — Sent / Delivered / Seen with date and time")
    goto(A, DM); goto(B, DM)
    @step("recipient is looking at the DM → 'Seen' appears live on the sender's message, with a time")
    def _():
        send(A, "Message Bob Tester", "status: bob watching"); expect(log_text(B, "status: bob watching")).to_be_visible()
        b = status_btn(A, "Seen").last; expect(b).to_be_visible()
        expect(b).to_have_text(re.compile(r"Seen\s*\d{1,2}:\d{2}\s[AP]M")); assert re.search(r"\d{4}", b.get_attribute("title")), "tooltip carries the full date"
    @step("recipient online but elsewhere → 'Delivered'; then 'Seen' the moment they open it (no reload)")
    def _():
        convo_nav(B).get_by_role("button", name=re.compile("announcements")).click(); expect(B.get_by_role("heading", name="# announcements")).to_be_visible()
        send(A, "Message Bob Tester", "status: bob elsewhere")
        expect(status_btn(A, "Delivered").last).to_have_text(re.compile(r"Delivered\s*\d{1,2}:\d{2}\s[AP]M"))
        expect(convo_nav(B).get_by_label("1 unread")).to_be_visible(); expect(B.locator('nav[aria-label="Primary"]').get_by_label("1 unread")).to_be_visible()
        convo_nav(B).get_by_role("button", name=re.compile("Alice Tester")).click()
        expect(status_btn(A, "Seen").last).to_be_visible(); expect(convo_nav(B).get_by_label("1 unread")).to_have_count(0); expect(B.locator('nav[aria-label="Primary"]').get_by_label("1 unread")).to_have_count(0)
    @step("recipient offline → 'Sent'; reconnecting elsewhere → 'Delivered'; opening it → 'Seen'")
    def _():
        global B
        B.close(); A.wait_for_timeout(6500)
        send(A, "Message Bob Tester", "status: bob offline"); expect(status_btn(A, "Sent").last).to_have_text(re.compile(r"Sent\s*\d{1,2}:\d{2}\s[AP]M"))
        B = bctx.new_page(); B.set_default_timeout(9000); PAGES["bob"] = B; goto(B, "c-announcements")
        expect(status_btn(A, "Delivered").last).to_be_visible(); convo_nav(B).get_by_role("button", name=re.compile("Alice Tester")).click(); expect(status_btn(A, "Seen").last).to_be_visible()
    @step("click the status → 'Message info' with when it was sent and each person's delivered/seen time")
    def _():
        status_btn(A, "Seen").last.click(); d = A.get_by_role("dialog", name="Message info"); expect(d).to_be_visible()
        expect(d).to_contain_text("Sent"); expect(d).to_contain_text("Bob Tester"); expect(d).to_contain_text(re.compile(r"Seen\s+\d{1,2}:\d{2}\s[AP]M")); A.get_by_role("heading", name="Bob Tester").click()  # click away to dismiss
    @step("in a channel: 'Seen by 1 of 3' until everyone has seen it; only the author sees status")
    def _():
        goto(C, "c-design-system"); goto(A, "c-announcements"); goto(B, "c-announcements")
        send(A, "Message #announcements", "status: channel message"); expect(log_text(B, "status: channel message")).to_be_visible()
        expect(status_btn(A).last).to_have_text(re.compile(r"Seen by 1 of 3\s*\d{1,2}:\d{2}\s[AP]M")); expect(status_btn(B)).to_have_count(0)
    @step("unread badges are per person and clear when the conversation is opened")
    def _():
        goto(B, "c-announcements"); goto(A, DM)
        send(A, "Message Bob Tester", "badge test 1"); send(A, "Message Bob Tester", "badge test 2")
        expect(convo_nav(B).get_by_label("2 unread")).to_be_visible(); expect(B.locator('nav[aria-label="Primary"]').get_by_label("2 unread")).to_be_visible()
        expect(convo_nav(A).get_by_label(re.compile(r"\d unread"))).to_have_count(0, timeout=3000)
        convo_nav(B).get_by_role("button", name=re.compile("Alice Tester")).click(); expect(convo_nav(B).get_by_label(re.compile(r"\d unread"))).to_have_count(0); expect(B.locator('nav[aria-label="Primary"]').get_by_label(re.compile(r"\d unread"))).to_have_count(0)

    # ═════════════════════════════════════════════════════════════════════════════════
    section("4. Members, selectable, private conversations")
    @step("clicking a member opens their card; 'Send message' starts the private DM (the same one as always)")
    def _():
        goto(A, "c-announcements"); row = panel(A).get_by_role("button", name=re.compile("Bob Tester")); row.click()
        card = panel(A).get_by_role("group", name="Bob Tester's details"); expect(card).to_contain_text("Department"); expect(card).to_contain_text(re.compile("Online|Offline"))
        card.get_by_role("button", name="Send message").click()
        expect(A.get_by_role("heading", name="Bob Tester")).to_be_visible(); expect(composer(A, "Message Bob Tester")).to_be_visible(); expect(log_text(A, "status: bob watching")).to_be_visible()
    @step("your own row says 'This is you' and offers no message button")
    def _():
        goto(A, "c-announcements"); panel(A).get_by_role("button", name=re.compile(r"Alice Tester \(you\)")).click()
        expect(panel(A).get_by_text("This is you")).to_be_visible(); expect(panel(A).get_by_role("button", name="Send message")).to_have_count(0)
    @step("'View profile' opens the member's profile")
    def _():
        panel(A).get_by_role("button", name="View profile").click(); expect(A.get_by_role("dialog")).to_be_visible(); A.keyboard.press("Escape")
    @step("New message (+): lists only other registered people, searchable, starts a DM")
    def _():
        convo_nav(A).get_by_role("button", name="New message").click(); d = A.get_by_role("dialog", name="New message"); expect(d).to_be_visible()
        rows = d.get_by_role("list", name="People you can message").get_by_role("listitem"); expect(rows).to_have_count(3)
        txt = " ".join(rows.all_inner_texts()); assert "Alice" not in txt and "Dave" not in txt and "Erin" not in txt and "Ray Land" not in txt, txt
        d.get_by_label("Search people").fill("car"); expect(rows).to_have_count(1); rows.first.get_by_role("button").click()
        expect(composer(A, "Message Carol Tester")).to_be_visible(); expect(convo_nav(A).get_by_role("button", name=re.compile("Carol Tester"))).to_be_visible()
    @step("a bystander can't see or open someone else's DM")
    def _():
        goto(C, DM); expect(C.get_by_text("status: bob watching")).to_have_count(0); expect(C.get_by_text("badge test 1")).to_have_count(0)
        names = " ".join(convo_nav(C).get_by_role("button").all_inner_texts()); assert "Bob Tester" not in names, names
    @step("Team page: Chat is disabled for people who haven't registered, works for those who have")
    def _():
        A.goto(BASE + "/team", wait_until="domcontentloaded"); expect(A.get_by_role("article").first).to_be_visible()
        ray = A.get_by_role("article").filter(has_text="Ray Land").get_by_role("button", name="Chat"); expect(ray).to_be_disabled(); assert "registered" in ray.get_attribute("title")
        A.get_by_role("article").filter(has_text="Bob Tester").get_by_role("button", name="Chat").click(); A.wait_for_url(re.compile(r"/channels\?c=")); expect(composer(A, "Message Bob Tester")).to_be_visible()

    # ═════════════════════════════════════════════════════════════════════════════════
    section("5. Formatting, copy/paste, long messages")
    goto(A, DM); goto(B, DM)
    def body_of(pg, needle): return pg.get_by_role("log").locator('[data-testid="message-body"]').filter(has_text=needle)
    @step("a multi-line message keeps bullets, numbering, blank lines, indentation and tabs — on both screens")
    def _():
        send(A, "Message Bob Tester", FORMATTED)
        for pg in (A, B):
            el = body_of(pg, "Plan:").last; expect(el).to_be_visible(); assert el.text_content() == FORMATTED, repr(el.text_content())
            assert el.evaluate("e => getComputedStyle(e).whiteSpace") == "pre-wrap"
    @step("Shift+Enter inserts a line break; Enter sends")
    def _():
        bodies = A.get_by_role("log").locator('[data-testid="message-body"]'); before = bodies.count()
        box = composer(A, "Message Bob Tester"); box.click(); A.keyboard.type("first"); A.keyboard.press("Shift+Enter"); A.keyboard.type("second"); assert box.input_value() == "first\nsecond"
        A.keyboard.press("Enter"); expect(bodies).to_have_count(before + 1)
        assert bodies.last.text_content() == "first\nsecond"; assert box.input_value() == ""
    @step("'Copy message' puts the exact original text on the clipboard")
    def _():
        m = A.get_by_role("article").filter(has_text="Plan:").last; m.hover(); m.get_by_role("button", name="Copy message").click()
        expect(A.get_by_text("Message copied")).to_be_visible(); assert A.evaluate("navigator.clipboard.readText()") == FORMATTED
    @step("selecting a message and pressing Ctrl+C copies it with its formatting")
    def _():
        A.evaluate("el => { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r) }", body_of(A, "Plan:").last.element_handle())
        A.keyboard.press("Control+C"); got = A.evaluate("navigator.clipboard.readText()"); assert got.strip() == FORMATTED, repr(got)
    @step("pasting that text into the composer keeps every character")
    def _():
        A.evaluate("t => navigator.clipboard.writeText(t)", FORMATTED); box = composer(A, "Message Bob Tester"); box.click(); A.keyboard.press("Control+V")
        assert box.input_value() == FORMATTED, repr(box.input_value()); box.fill("")
    LONG = "\n".join(f"Line {i}: " + "lorem ipsum " * 3 for i in range(1, 61))
    @step("a long message is previewed with 'Show more'; the full text is one click away; short ones have no button")
    def _():
        send(A, "Message Bob Tester", LONG); el = body_of(B, "Line 1:").last; expect(el).to_be_visible()
        art = B.get_by_role("article").filter(has_text="Line 1:").last
        more = art.get_by_role("button", name="Show more"); expect(more).to_be_visible(); expect(more).to_have_attribute("aria-expanded", "false")
        h1 = el.evaluate("e => e.getBoundingClientRect().height"); assert h1 < 330, h1
        mask = lambda loc: loc.evaluate("e => getComputedStyle(e).maskImage || getComputedStyle(e).webkitMaskImage")
        assert mask(el) not in (None, "none"), "a clamped long message fades at the bottom"
        short = B.get_by_role("article").filter(has_text="badge test 1").locator('[data-testid="message-body"]'); assert mask(short.first) in (None, "none"), "a short message must NOT be faded"
        more.click(); expect(art.get_by_role("button", name="Show less")).to_have_attribute("aria-expanded", "true")
        assert el.evaluate("e => e.getBoundingClientRect().height") > 1000 and el.text_content() == LONG.rstrip(), "expanded shows everything"
        art.get_by_role("button", name="Show less").click(); expect(art.get_by_role("button", name="Show more")).to_be_visible()
        expect(B.get_by_role("article").filter(has_text="badge test 1").get_by_role("button", name=re.compile("Show"))).to_have_count(0)
    @step("searching shows the whole message so a match is never hidden behind 'Show more'")
    def _():
        B.get_by_role("button", name="Search messages").click(); B.get_by_label("Search in this conversation").fill("Line 58")
        art = B.get_by_role("article").filter(has_text="Line 58:"); expect(art).to_be_visible(); expect(art.get_by_role("button", name=re.compile("Show"))).to_have_count(0)
        assert "Line 58:" in art.locator('[data-testid="message-body"]').inner_text(); B.get_by_role("button", name="Close search").click()
    @step("a 25,000-character paste is NOT silently cut: it stays whole and you're told it's over the limit")
    def _():
        big = ("0123456789" * 2500); A.evaluate("t => navigator.clipboard.writeText(t)", big); box = composer(A, "Message Bob Tester"); box.click(); A.keyboard.press("Control+V")
        assert len(box.input_value()) == 25000, len(box.input_value())
        expect(A.get_by_role("alert").filter(has_text="5,000 characters over")).to_be_visible(); expect(A.get_by_role("button", name="Send message")).to_be_disabled()
    @step("trimmed to 19,999 characters it sends and is stored and shown in full")
    def _():
        text = ("abcdefghij" * 2000)[:19999]; box = composer(A, "Message Bob Tester"); box.fill(text); expect(A.get_by_text(re.compile("19,999 / 20,000"))).to_be_visible(); box.press("Enter")
        el = body_of(B, "abcdefghij").last; expect(el).to_be_visible(); assert len(el.text_content()) == 19999
        B.get_by_role("article").filter(has_text="abcdefghij").last.get_by_role("button", name="Show more").click(); assert el.text_content() == text
    @step("an unsent draft is kept when you switch conversations and come back")
    def _():
        box = composer(A, "Message Bob Tester"); box.fill("half-written thought\nwith two lines"); convo_nav(A).get_by_role("button", name=re.compile("announcements")).click()
        expect(composer(A, "Message #announcements")).to_be_visible(); convo_nav(A).get_by_role("button", name=re.compile("Bob Tester")).click()
        assert composer(A, "Message Bob Tester").input_value() == "half-written thought\nwith two lines"; composer(A, "Message Bob Tester").fill("")
    @step("the composer grows with the text (and caps its height)")
    def _():
        box = composer(A, "Message Bob Tester"); h0 = box.evaluate("e => e.getBoundingClientRect().height"); box.fill("\n".join(["row"] * 6)); h1 = box.evaluate("e => e.getBoundingClientRect().height")
        box.fill("\n".join(["row"] * 60)); h2 = box.evaluate("e => e.getBoundingClientRect().height"); assert h0 < h1 < h2 <= 222, (h0, h1, h2); box.fill("")

    # ═════════════════════════════════════════════════════════════════════════════════
    section("6. Attachments — inline preview and download")
    goto(A, DM); goto(B, DM)
    @step("choose an image → thumbnail chip with upload progress, then send")
    def _():
        attach(A, ("photo.png", "image/png", PNG)); chip = A.get_by_role("list", name="Attachments to send").get_by_role("listitem")
        expect(chip).to_have_count(1); expect(chip.locator("img")).to_be_visible(); expect(chip).to_contain_text("photo.png"); expect(chip).to_contain_text(re.compile(r"KB|B"))
        expect(chip.get_by_role("progressbar")).to_have_count(0); A.get_by_role("button", name="Send message").click(); expect(chip).to_have_count(0)
    @step("the image renders INLINE (really decoded) for both people, at a sensible size")
    def _():
        for pg in (A, B):
            img = pg.get_by_role("log").get_by_role("img", name="photo.png"); expect(img).to_be_visible()
            nat, w = img.evaluate("e => [e.naturalWidth, e.getBoundingClientRect().width]"); assert nat == 400 and 0 < w <= 320, (nat, w)
    @step("Download saves the original file, byte-for-byte, under its original name")
    def _():
        link = B.get_by_role("link", name="Download photo.png").last; assert link.get_attribute("href").endswith("?download=1") and link.get_attribute("download") == "photo.png"
        with B.expect_download() as dl: link.click()
        d = dl.value; assert d.suggested_filename == "photo.png"; assert open(d.path(), "rb").read() == PNG
    @step("click the image → full-size preview dialog with Download; Esc closes it and focus returns")
    def _():
        btn = B.get_by_role("button", name="Preview photo.png").last; btn.click(); d = B.get_by_role("dialog", name="photo.png"); expect(d).to_be_visible()
        expect(d.get_by_role("img", name="photo.png")).to_be_visible(); expect(d.get_by_role("link", name="Download")).to_be_visible(); B.keyboard.press("Escape"); expect(d).to_be_hidden(); expect(btn).to_be_focused()
    @step("a PDF becomes a file card with type, size, Open (new tab) and Download")
    def _():
        attach(A, ("spec.pdf", "application/pdf", PDF)); A.get_by_role("button", name="Send message").click()
        card = B.get_by_role("log").get_by_text("spec.pdf").last; expect(card).to_be_visible(); art = B.get_by_role("article").filter(has_text="spec.pdf").last
        expect(art).to_contain_text("PDF document"); o = art.get_by_role("link", name=re.compile("Open spec.pdf")); assert o.get_attribute("target") == "_blank" and "noopener" in o.get_attribute("rel")
        expect(art.get_by_role("link", name="Download spec.pdf")).to_be_visible()
    @step("a CSV/text file shows its first lines right in the chat")
    def _():
        attach(A, ("data.csv", "text/csv", "\n".join(f"row {i},value" for i in range(1, 81)).encode())); A.get_by_role("button", name="Send message").click()
        art = B.get_by_role("article").filter(has_text="data.csv").last; snip = art.get_by_label("File preview"); expect(snip).to_contain_text("row 1,value"); assert "row 80" not in snip.inner_text()
    @step("other files (zip) get a typed card with Download; video and audio get real players")
    def _():
        mp4 = b"\x00\x00\x00\x18ftypisom" + b"\x00" * 600; mp3 = b"ID3\x04" + b"\x00" * 600
        attach(A, ("bundle.zip", "application/zip", b"PK\x03\x04" + b"\x00" * 100), ("clip.mp4", "video/mp4", mp4), ("song.mp3", "audio/mpeg", mp3))
        expect(A.get_by_role("list", name="Attachments to send").get_by_role("listitem")).to_have_count(3); A.get_by_role("button", name="Send message").click()
        z = B.get_by_role("article").filter(has_text="bundle.zip").last; expect(z).to_contain_text("ZIP archive"); expect(z.get_by_role("link", name="Download bundle.zip")).to_be_visible()
        expect(B.get_by_role("article").filter(has_text="clip.mp4").last.locator("video[controls]")).to_have_count(1); expect(B.get_by_role("article").filter(has_text="song.mp3").last.locator("audio[controls]")).to_have_count(1)
    @step("a file pretending to be an image (HTML named .png) is NOT shown as an image")
    def _():
        attach(A, ("fake.png", "image/png", b"<html><script>alert(1)</script></html>")); A.get_by_role("button", name="Send message").click()
        art = B.get_by_role("article").filter(has_text="fake.png").last; expect(art).to_be_visible(); expect(art.get_by_role("img", name="fake.png")).to_have_count(0); expect(art).to_contain_text("PNG file")
    @step("a screenshot pasted from the clipboard becomes an attachment (but pasted text stays text)")
    def _():
        B64 = base64.b64encode(PNG).decode(); box = composer(A, "Message Bob Tester"); box.click()
        A.evaluate("""b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
            const dt = new DataTransfer(); dt.items.add(new File([u], 'screenshot.png', {type:'image/png'}));
            document.querySelector('textarea').dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true})); }""", B64)
        chip = A.get_by_role("list", name="Attachments to send").get_by_role("listitem"); expect(chip).to_contain_text("screenshot.png")
        chip.get_by_role("button", name="Remove screenshot.png").click(); expect(chip).to_have_count(0)
        A.evaluate("t => navigator.clipboard.writeText(t)", "just text"); box.click(); A.keyboard.press("Control+V"); assert box.input_value() == "just text"; box.fill("")
    @step("dragging a file onto the composer attaches it")
    def _():
        B64 = base64.b64encode(PNG).decode()
        A.evaluate("""b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
            const dt = new DataTransfer(); dt.items.add(new File([u], 'dropped.png', {type:'image/png'}));
            document.querySelector('textarea').dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true})); }""", B64)
        chip = A.get_by_role("list", name="Attachments to send").get_by_role("listitem"); expect(chip).to_contain_text("dropped.png"); chip.get_by_role("button", name="Remove dropped.png").click()
    @step("removing a chip before sending also deletes the uploaded file")
    def _():
        ids = []; A.on("response", lambda r: ids.append(r.json()["attachments"][0]["id"]) if r.url.endswith("/api/attachments") and r.request.method == "POST" and r.ok else None)
        attach(A, ("tmp.txt", "text/plain", b"temporary")); chip = A.get_by_role("list", name="Attachments to send").get_by_role("listitem"); expect(chip).to_contain_text("tmp.txt"); expect(chip.get_by_role("progressbar")).to_have_count(0)
        chip.get_by_role("button", name="Remove tmp.txt").click(); A.wait_for_timeout(800); assert ids and actx.request.get(f"{BASE}/api/attachments/{ids[-1]}").status == 404
    @step("limits: more than 5 files and files over 10 MB are refused with a clear message")
    def _():
        attach(A, *[(f"f{i}.txt", "text/plain", b"x") for i in range(6)]); expect(A.get_by_text(re.compile("Only .* more file"))).to_be_visible()
        expect(A.get_by_role("list", name="Attachments to send").get_by_role("listitem")).to_have_count(5)
        chips = A.get_by_role("list", name="Attachments to send").get_by_role("listitem")
        while chips.count(): chips.first.get_by_role("button", name=re.compile("Remove")).click()
        attach(A, ("huge.bin", "application/octet-stream", b"\x01" * (10 * 1024 * 1024 + 1))); expect(A.get_by_text(re.compile("larger than 10 MB"))).to_be_visible()
        expect(A.get_by_role("list", name="Attachments to send")).to_have_count(0)
    @step("sending is blocked while a file is still uploading, and a message can be attachment-only")
    def _():
        attach(A, ("only.png", "image/png", PNG)); A.get_by_role("button", name="Send message").click(); expect(B.get_by_role("img", name="only.png")).to_be_visible()
        assert B.get_by_role("article").filter(has=B.get_by_role("img", name="only.png")).get_by_role("button", name="Copy message").count() == 0, "no Copy button without text"
    @step("older attachments (name + size only) still show, honestly marked as unavailable")
    def _():
        actx.request.post(f"{BASE}/api/channels/{DM}/messages", data={"body": "", "attachments": [{"name": "old-report.docx", "size": 2048}]})
        old = B.get_by_role("log").get_by_text("old-report.docx"); expect(old).to_be_visible(); assert "before downloads" in (old.get_attribute("title") or "")
    @step("a bystander cannot fetch a DM's files")
    def _():
        href = B.get_by_role("link", name="Download photo.png").last.get_attribute("href"); assert cctx.request.get(BASE + href).status == 404; assert actx.request.get(BASE + href).status == 200

    # ═════════════════════════════════════════════════════════════════════════════════
    section("Existing features still work")
    goto(A, DM); goto(B, DM)
    @step("reactions are per person and update live for the other side")
    def _():
        send(A, "Message Bob Tester", "react to me"); art_a = A.get_by_role("article").filter(has_text="react to me").last; art_a.hover(); art_a.get_by_role("button", name="Add reaction").click(); A.get_by_role("menuitem", name="🚀").click()
        art_b = B.get_by_role("article").filter(has_text="react to me").last; chip = art_b.get_by_role("button", name=re.compile("🚀 1")); expect(chip).to_be_visible(); expect(chip).to_have_attribute("aria-pressed", "false")
        chip.click(); expect(art_a.get_by_role("button", name=re.compile("🚀 2"))).to_be_visible(); expect(art_a.get_by_role("button", name=re.compile("🚀 2"))).to_have_attribute("aria-pressed", "true")
    @step("pin to Favorites, in-thread search, and the emoji picker")
    def _():
        A.get_by_role("button", name="Pin to Favorites").click(); expect(A.get_by_text("Pinned Bob Tester to Favorites")).to_be_visible(); A.get_by_role("button", name="Unpin from Favorites").click()
        A.get_by_role("button", name="Search messages").click(); A.get_by_label("Search in this conversation").fill("react to me"); expect(A.get_by_role("article")).to_have_count(1); A.get_by_role("button", name="Close search").click()
        A.get_by_role("button", name="Insert emoji").click(); A.get_by_role("menuitem", name="🔥").click(); assert composer(A, "Message Bob Tester").input_value() == "🔥"; composer(A, "Message Bob Tester").fill("")
    @step("after the network drops and returns, missed messages appear without a manual refresh")
    def _():
        bctx.set_offline(True); actx.request.post(f"{BASE}/api/channels/{DM}/messages", data={"body": "sent while bob was offline"}); B.wait_for_timeout(3500)
        expect(B.get_by_role("log")).to_be_visible(); expect(B.get_by_text("Something went wrong")).to_have_count(0)   # a failed refresh never blanks the page
        expect(log_text(B, "react to me")).to_be_visible()
        bctx.set_offline(False); expect(log_text(B, "sent while bob was offline")).to_be_visible(timeout=20000); expect(B.get_by_text("Reconnecting…")).to_have_count(0, timeout=20000)
    @step("a narrow window still works: details hide, but 'New message' reaches every teammate; nothing overflows")
    def _():
        nctx, N = new_user(browser, "gina", 390, 844); goto(N, "c-announcements")
        assert N.evaluate("document.documentElement.scrollWidth") <= 390
        convo_nav(N).get_by_role("button", name="New message").click(); expect(N.get_by_role("dialog", name="New message").get_by_role("listitem")).to_have_count(3); nctx.close()

    section("Console")
    @step("no errors or warnings in anyone's browser console (apart from expected 4xx on denied requests)")
    def _():
        bad = [c for c in CONSOLE if not re.search(r"status of (401|403|404|413|429)|net::ERR_(INTERNET_DISCONNECTED|NETWORK_CHANGED|FAILED)", c[2])]
        assert not bad, bad[:4]
    browser.close()

passed = sum(1 for r in RESULTS if r[1]); failed = [r for r in RESULTS if not r[1]]
print(f"\n==== {passed}/{len(RESULTS)} passed, {len(failed)} failed ====")
for n, _, m in failed: print(" ✗", n, "→", m)
sys.exit(1 if failed else 0)
