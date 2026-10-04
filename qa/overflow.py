import sys
from playwright.sync_api import sync_playwright
W = int(sys.argv[1]) if len(sys.argv) > 1 else 390
JS = """(vw) => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el); if (cs.position === 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
    // ignore anything that lives inside its own scroll container
    let p = el.parentElement, scrolled = false;
    while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { scrolled = true; break; } p = p.parentElement; }
    if (scrolled) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > vw + 1) out.push([Math.round(r.right), Math.round(r.width), el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0].replace(/^.*?_/, '').slice(0,40)]);
  }
  out.sort((a,b) => b[0]-a[0]); return out.slice(0, 6);
}"""
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"]); page = b.new_page(viewport={"width": W, "height": 844})
    for path in ["/", "/channels", "/actions", "/calendar", "/team", "/reports", "/world-clock", "/projects"]:
        page.goto("" + __import__("os").environ.get("BASE", "http://localhost:3001") + "" + path, wait_until="networkidle"); page.wait_for_timeout(300)
        sw = page.evaluate("document.documentElement.scrollWidth")
        print(f"{path:14s} scrollWidth={sw}  offenders: {page.evaluate(JS, W)}")
    b.close()
