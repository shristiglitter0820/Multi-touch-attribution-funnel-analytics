"""Browser end-to-end checks (Playwright/Chromium) for the real UI flows. Usage: python3 tests/ui_e2e.py [base_url]"""
import sys, time
from playwright.sync_api import sync_playwright, expect
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100"
ok = bad = 0
def check(name, cond, detail=""):
    global ok, bad
    ok += bool(cond); bad += (not cond)
    print(("PASS  " if cond else "FAIL  ") + name + ("" if cond else f"   <-- {detail}"))
def vis(loc, timeout=7000):
    try:
        loc.first.wait_for(state="visible", timeout=timeout); return True
    except Exception:
        return False
def login(page, email, pw):
    page.goto(BASE + "/login"); page.wait_for_load_state("networkidle"); page.wait_for_timeout(600)
    page.fill("#email", email); page.fill("#password", pw); page.click("form button"); page.wait_for_url("**/dashboard", timeout=20000)
    page.wait_for_load_state("networkidle")
stamp = str(int(time.time()))[-6:]
with sync_playwright() as p:
    b = p.chromium.launch()
    # ---------------- admin ----------------
    page = b.new_context(viewport={"width":1366,"height":900}).new_page()
    page.goto(BASE + "/login"); page.wait_for_load_state("networkidle"); page.wait_for_timeout(600)
    page.fill("#email","admin@acme.test"); page.fill("#password","bad"); page.click("form button")
    check("login with wrong password shows a readable error", vis(page.locator("[role=alert]")))
    login(page, "admin@acme.test", "Admin@123")
    page.wait_for_selector("text=Visitors per stage")
    links = [a.inner_text().strip() for a in page.locator("nav[aria-label=Main] a").all()]
    check("admin sees Dashboard / Attribution / Campaigns / Ads / Events / Audit log links", links == ["Dashboard","Attribution","Campaigns","Ads","Events","Audit log"], str(links))
    check("dashboard lists the seeded campaigns (>= 3 cards)", page.locator("ul >> button[aria-pressed]").count()>=3, str(page.locator("ul >> button[aria-pressed]").count()))
    check("funnel table has the 5 stages", page.locator("table tbody tr").count()==5)
    # date filter changes the numbers
    all_imp = page.locator("table tbody tr").first.locator("td").nth(1).inner_text()
    page.fill("#from", time.strftime("%Y-%m-%d", time.gmtime(time.time()-3*86400))); page.wait_for_timeout(1200)
    narrow_imp = page.locator("table tbody tr").first.locator("td").nth(1).inner_text()
    check("date filter changes the funnel numbers", all_imp != narrow_imp, f"{all_imp} vs {narrow_imp}")
    page.fill("#to", "2000-01-01"); page.wait_for_timeout(500)
    check("inverted date range shows a readable error (no request sent)", vis(page.get_by_text("'From' date must not be after 'To' date.")))
    page.click("button:has-text('Clear dates')"); page.wait_for_timeout(800)
    # snapshot refresh reloads displayed data
    page.click("button:has-text('Refresh snapshots')")
    page.wait_for_selector("text=Funnel snapshots rebuilt through", timeout=10000)
    check("refresh shows a success message", True)
    today = time.strftime("%-d %b %Y", time.gmtime())
    check("campaign cards now display today's snapshot date", page.locator("ul >> button[aria-pressed]").first.inner_text().count("Snapshot")==1 and today in page.locator("ul >> button[aria-pressed]").first.inner_text(), page.locator("ul >> button[aria-pressed]").first.inner_text())
    page.click("button:has-text('Latest snapshot')"); page.wait_for_selector("text=Showing the stored snapshot from", timeout=8000)
    check("'Latest snapshot' source shows the 5-stage stored funnel", page.locator("table tbody tr").count()==5)
    page.click("button:has-text('Live query')")
    # budget edit from dashboard
    page.fill("#budget", "0.5"); page.click("button:has-text('Save budget')")
    check("budget below spend shows a readable error message", vis(page.locator("[role=alert]").filter(has_text="below amount already spent")))
    # campaign create via UI
    page.click("nav >> text=Campaigns"); page.wait_for_url("**/admin/campaigns"); page.wait_for_load_state("networkidle")
    page.click("text=New campaign >> nth=0"); page.fill("#c-name","x"); page.click("button:has-text('Create campaign')")
    check("campaign form shows field-level errors", vis(page.get_by_text("At least 3 characters")))
    name = f"UI Test {stamp}"
    page.fill("#c-name", name); page.fill("#c-budget","321"); page.fill("#c-start", time.strftime("%Y-%m-%d")); page.fill("#c-end", time.strftime("%Y-%m-%d", time.gmtime(time.time()+7*86400)))
    page.click("button:has-text('Create campaign')")
    page.wait_for_selector(f"text={name}", timeout=8000)
    check("new campaign created and listed with success message", vis(page.get_by_text(f'Campaign "{name}" created.')))
    page.click(f"button[aria-label='Edit {name}']"); page.select_option("#c-status","ACTIVE"); page.fill("#c-budget","400"); page.click("button:has-text('Save changes')")
    page.wait_for_selector("text=updated.", timeout=8000)
    check("campaign edit saved (status ACTIVE, budget $400.00)", page.locator("tr", has_text=name).inner_text().count("ACTIVE")==1 and "$400.00" in page.locator("tr", has_text=name).inner_text())
    # ads
    page.click("nav >> text=Ads"); page.wait_for_url("**/admin/ads"); page.wait_for_load_state("networkidle"); page.wait_for_selector("table")
    page.click("button:has-text('New ad')"); page.fill("#a-name", f"UI Ad {stamp}"); page.fill("#a-cost","0.4")
    page.select_option("#a-campaign", label=name); page.click("button:has-text('Create ad')")
    page.wait_for_selector(f"text=UI Ad {stamp}", timeout=8000)
    check("ad created via UI", True)
    page.click(f"button[aria-label='Delete UI Ad {stamp}']"); page.click("dialog >> button:has-text('Delete ad')")
    page.wait_for_selector("text=deleted.", timeout=8000)
    page.wait_for_timeout(800)
    check("unused ad deleted via UI with confirmation", page.locator("tr", has_text=f"UI Ad {stamp}").count()==0)
    page.click("button[aria-label^='Delete'] >> nth=0"); page.click("dialog >> button:has-text('Delete ad')")
    check("deleting an ad with tracked events shows the database protection message", vis(page.locator("dialog [role=alert]").filter(has_text="cannot be deleted")))
    page.keyboard.press("Escape")
    # audit
    page.click("nav >> text=Audit log"); page.wait_for_url("**/admin/audit"); page.get_by_role("table", name="Campaign audit log").wait_for(state="visible", timeout=8000)
    txt = page.get_by_role("table", name="Campaign audit log").inner_text()
    check("audit log lists the new campaign creation by the admin", name in txt and "Created" in txt and "Ava Admin" in txt)
    check("audit log shows budget old -> new", "$321.00" in txt and "$400.00" in txt)
    # attribution page
    page.click("nav >> text=Attribution"); page.wait_for_url("**/attribution"); page.wait_for_selector("text=Campaign performance", timeout=10000)
    perf = page.get_by_role("table", name="Campaign performance under the Last touch model")
    vis(perf.locator("tbody tr"))
    check("attribution page lists campaigns with spend / CTR / ROI columns", perf.locator("tbody tr").count()>=3 and vis(page.get_by_role("columnheader", name="ROI")), str(perf.locator("tbody tr").count()))
    page.click("button:has-text('First touch')"); page.wait_for_selector("text=Campaign performance under the First touch model", state="attached", timeout=8000)
    check("switching the model re-renders the table for that model", vis(page.get_by_text("Attributed revenue (first touch)")))
    check("channel chart or its empty state is shown", vis(page.locator("[role=img]")) or vis(page.get_by_text("No attributed conversions yet")))
    # events page (needs MongoDB; enabled with E2E_WITH_MONGO=1)
    import os
    if os.environ.get("E2E_WITH_MONGO") == "1":
        page.click("nav >> text=Events"); page.wait_for_url("**/admin/events"); page.wait_for_selector("text=Recent synchronisation runs", timeout=10000)
        page.click("button:has-text('Synchronise events now')")
        check("admin can synchronise events from the Events page (readable result message)", vis(page.get_by_text("Synchronisation finished."), 15000))
    # ---------------- analyst ----------------
    page2 = b.new_context(viewport={"width":390,"height":844}).new_page()
    login(page2, "analyst@acme.test", "Analyst@123")
    page2.wait_for_selector("text=Visitors per stage")
    check("analyst nav has only Dashboard and Attribution", [a.inner_text().strip() for a in page2.locator("nav[aria-label=Main] a").all()]==["Dashboard","Attribution"])
    check("analyst has no Refresh snapshots button", page2.get_by_role("button", name="Refresh snapshots").count()==0)
    page2.wait_for_selector("text=Visitors per stage")
    check("analyst sees read-only budget notice instead of an editor", vis(page2.get_by_text("Analysts have read-only access")) and page2.locator("#budget").count()==0)
    page2.goto(BASE + "/admin/campaigns"); page2.wait_for_url("**/dashboard?denied=1")
    check("analyst typing an admin URL is redirected with a readable message", vis(page2.get_by_text("You do not have access to that page")))
    page2.goto(BASE + "/attribution"); page2.wait_for_selector("text=Campaign performance", timeout=10000)
    check("analyst can open the attribution page", vis(page2.get_by_text("Attribution & ROI")))
    page2.goto(BASE + "/admin/events"); page2.wait_for_url("**/dashboard?denied=1")
    check("analyst is redirected away from the Events page", vis(page2.get_by_text("You do not have access to that page")))
    b.close()
print(f"\n{ok} passed, {bad} failed"); sys.exit(1 if bad else 0)
