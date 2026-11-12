"""UI contrast audit + screenshots (Playwright/Chromium).
Usage: python3 ui_audit.py <base_url> <label> [--scheme light|dark] [--pages /login,/dashboard,...] [--states]
Logs in as admin and analyst, visits pages at desktop and mobile sizes, computes WCAG contrast for every visible
text node / form control / placeholder / SVG text (colours converted via canvas, so oklch() etc. are handled),
checks for horizontal overflow, and saves screenshots to /home/claude/shots.
--states additionally opens modals / error states (admin) and audits those too.
"""
import sys, argparse, os
from playwright.sync_api import sync_playwright
os.makedirs("/home/claude/shots", exist_ok=True)

JS = r"""
() => {
  const cv=document.createElement('canvas'); cv.width=cv.height=1; const cx=cv.getContext('2d',{willReadFrequently:true});
  const parse = c => { if(!c) return null; cx.clearRect(0,0,1,1); cx.fillStyle='#000'; cx.fillStyle=c; cx.fillRect(0,0,1,1);
    const d=cx.getImageData(0,0,1,1).data; return {r:d[0],g:d[1],b:d[2],a:d[3]/255}; };
  const over = (f,b) => ({r:f.r*f.a+b.r*(1-f.a), g:f.g*f.a+b.g*(1-f.a), b:f.b*f.a+b.b*(1-f.a), a:1});
  const lum = c => { const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}; return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); };
  const ratio = (a,b) => { const l1=lum(a), l2=lum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); };
  const bgOf = el => { const stack=[]; for(let e=el;e;e=e.parentElement){ const bg=parse(getComputedStyle(e).backgroundColor); if(bg&&bg.a>0){stack.push(bg); if(bg.a>=1)break;} }
    let base={r:255,g:255,b:255,a:1}; for(let i=stack.length-1;i>=0;i--) base=over(stack[i],base); return base; };
  const vis = el => { const s=getComputedStyle(el), r=el.getBoundingClientRect(); return s.visibility!=='hidden'&&s.display!=='none'&&parseFloat(s.opacity)>0&&r.width>0&&r.height>0; };
  const out=[];
  const check=(el,fg,text,kind)=>{ const bg=bgOf(el); const f=over(fg,bg); const s=getComputedStyle(el);
    const px=parseFloat(s.fontSize), bold=parseInt(s.fontWeight)>=700; const large=px>=24||(px>=18.66&&bold);
    const r=ratio(f,bg); const need=large?3:4.5;
    out.push({kind,text:text.trim().slice(0,40),ratio:Math.round(r*100)/100,need,ok:r>=need,
      el:el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.split(' ').slice(0,3).join('.'):'')}); };
  document.querySelectorAll('body *').forEach(el=>{
    if(!vis(el)) return;
    const tag=el.tagName.toLowerCase();
    if(tag==='svg'||tag==='script'||tag==='style') return;
    if(el instanceof SVGElement){ if(tag==='text'||tag==='tspan'){ const t=el.textContent||''; if(t.trim()){ const fill=parse(getComputedStyle(el).fill); if(fill) check(el.closest('svg'),fill,t,'svg-text'); } } return; }
    const own=[...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent).join(' ');
    if(own){ const fg=parse(getComputedStyle(el).color); check(el,fg,own,'text'); }
    if(['input','textarea','select'].includes(tag)){
      const ph=el.getAttribute('placeholder'); if(ph){ const pc=parse(getComputedStyle(el,'::placeholder').color); check(el,pc,'[placeholder] '+ph,'placeholder'); }
      if(tag==='input'&&el.type==='date'){ check(el,parse(getComputedStyle(el).color),'[date value]','input-value'); }
    }
  });
  const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
  return {items: out, overflow, sw: document.documentElement.scrollWidth, iw: window.innerWidth};
}
"""

def login(page, base, email, pw):
    page.goto(base + "/login"); page.wait_for_load_state("networkidle"); page.wait_for_timeout(800); page.fill('#email', email); page.fill('#password', pw)
    page.click('form button'); page.wait_for_url("**/dashboard", timeout=20000)

def report(tag, res, stats):
    fails = [r for r in res["items"] if not r["ok"]]
    stats["total"] += len(res["items"]); stats["fail"] += len(fails); stats["overflow"] += 1 if res["overflow"] else 0
    print(f"[{tag}] {len(res['items'])} text items, {len(fails)} below WCAG AA" + (f", HORIZONTAL OVERFLOW ({res['sw']}>{res['iw']})" if res["overflow"] else ""))
    seen=set()
    for f in fails:
        k=(f['kind'],f['text'],f['ratio'])
        if k in seen: continue
        seen.add(k)
        if len(seen)<=6: print(f"    FAIL {f['ratio']}:1 (need {f['need']}) {f['kind']} '{f['text']}' <{f['el']}>")

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("base"); ap.add_argument("label")
    ap.add_argument("--scheme", default="light"); ap.add_argument("--pages", default="/login,/dashboard")
    ap.add_argument("--states", action="store_true")
    a = ap.parse_args(); pages = a.pages.split(","); stats = {"total":0,"fail":0,"overflow":0}
    with sync_playwright() as p:
        b = p.chromium.launch()
        for who, email, pw in [("admin","admin@acme.test","Admin@123"),("analyst","analyst@acme.test","Analyst@123")]:
            for vp, size in [("desktop",{"width":1366,"height":900}),("mobile",{"width":390,"height":844})]:
                ctx = b.new_context(viewport=size, color_scheme=a.scheme); page = ctx.new_page()
                for path in pages:
                    if path == "/login":
                        page.goto(a.base + "/login")
                    else:
                        if "/login" in page.url or page.url == "about:blank": login(page, a.base, email, pw)
                        page.goto(a.base + path)
                    page.wait_for_load_state("networkidle"); page.wait_for_timeout(900)
                    res = page.evaluate(JS)
                    name = f"{a.label}_{who}_{vp}_{path.strip('/').replace('/','-') or 'root'}"
                    page.screenshot(path=f"/home/claude/shots/{name}.png", full_page=True)
                    report(f"{who}/{vp}] {path} (url={page.url.replace(a.base,'')}", res, stats)
                    if path == "/login": page.context.clear_cookies()
                if a.states and who == "admin":
                    def state(label, fn):
                        fn(); page.wait_for_timeout(500); res = page.evaluate(JS)
                        page.screenshot(path=f"/home/claude/shots/{a.label}_{who}_{vp}_state-{label}.png")
                        report(f"{who}/{vp}] state: {label}", res, stats)
                    page.goto(a.base + "/admin/campaigns"); page.wait_for_load_state("networkidle"); page.wait_for_timeout(700)
                    state("campaign-form-errors", lambda: (page.click("text=New campaign >> nth=0"), page.fill("#c-name","x"), page.click("button:has-text('Create campaign')")))
                    page.keyboard.press("Escape")
                    page.goto(a.base + "/admin/ads"); page.wait_for_load_state("networkidle"); page.wait_for_timeout(700)
                    state("ad-delete-confirm", lambda: page.click("button[aria-label^='Delete'] >> nth=0"))
                    page.keyboard.press("Escape")
                    state("ad-form-open", lambda: page.click("button:has-text('New ad')"))
                    page.keyboard.press("Escape")
                    page.goto(a.base + "/dashboard"); page.wait_for_load_state("networkidle"); page.wait_for_timeout(700)
                    state("dashboard-snapshot-view", lambda: page.click("button:has-text('Latest snapshot')"))
                    state("dashboard-range-error", lambda: (page.click("button:has-text('Live query')"), page.fill("#from","2026-10-20"), page.fill("#to","2026-10-01")))
                ctx.close()
        b.close()
    print(f"TOTAL: {stats['total']} text checks, {stats['fail']} failing WCAG AA, {stats['overflow']} screens with horizontal overflow")
    sys.exit(1 if (stats['fail'] or stats['overflow']) else 0)
main()
