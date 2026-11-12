"""Static WCAG contrast check of the design-token pairs used by the theme."""
def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda v: v/12.92 if v<=0.03928 else ((v+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    l1,l2=sorted([lum(a),lum(b)],reverse=True); return (l1+0.05)/(l2+0.05)
T={ # name: (foreground, background, required)
 "ink on page":("#0f172a","#f1f5f9",4.5),"ink on surface":("#0f172a","#ffffff",4.5),
 "ink-2 on surface":("#334155","#ffffff",4.5),"ink-2 on page":("#334155","#f1f5f9",4.5),
 "ink-3 on surface":("#475569","#ffffff",4.5),"ink-3 on page":("#475569","#f1f5f9",4.5),
 "placeholder(slate-600) on white":("#475569","#ffffff",4.5),
 "on-dark on nav":("#f8fafc","#0f172a",4.5),"on-dark-2 on nav":("#cbd5e1","#0f172a",4.5),
 "on-dark-2 on nav-2":("#cbd5e1","#1e293b",4.5),"on-dark on nav-2":("#f8fafc","#1e293b",4.5),
 "white on brand":("#ffffff","#1d4ed8",4.5),"white on brand-hover":("#ffffff","#1e40af",4.5),
 "brand link on white":("#1d4ed8","#ffffff",4.5),"brand link on page":("#1d4ed8","#f1f5f9",4.5),
 "white on danger btn":("#ffffff","#b91c1c",4.5),"danger text on white":("#b91c1c","#ffffff",4.5),
 "ok badge":("#14532d","#dcfce7",4.5),"warn badge":("#78350f","#fef3c7",4.5),
 "danger badge":("#7f1d1d","#fee2e2",4.5),"info badge":("#1e3a8a","#dbeafe",4.5),
 "neutral badge":("#1e293b","#e2e8f0",4.5),
 "selected card text (ink on brand-soft)":("#0f172a","#eff6ff",4.5),
 "disabled btn text":("#475569","#e2e8f0",4.5),
 "table header text":("#334155","#f1f5f9",4.5),
 "input border (UI component)":("#64748b","#ffffff",3.0),
 "focus ring on white":("#2563eb","#ffffff",3.0),"focus ring on nav":("#93c5fd","#0f172a",3.0),
 "chart: spent bar vs white":("#1d4ed8","#ffffff",3.0),"chart: remaining bar vs white":("#64748b","#ffffff",3.0),
 "chart: dropoff bar vs white":("#b91c1c","#ffffff",3.0),
 "progress fill vs track":("#1d4ed8","#e2e8f0",3.0),
 "nav border/outline btn vs nav":("#94a3b8","#0f172a",3.0),
 "selected-card border vs white":("#1d4ed8","#ffffff",3.0),
}
bad=0
for k,(f,b,need) in T.items():
    r=cr(f,b); ok=r>=need; bad+=not ok
    print(f"{'PASS' if ok else 'FAIL'}  {r:5.2f}:1 (need {need})  {k}  {f} on {b}")
print("\n%d pairs, %d failing"%(len(T),bad))
