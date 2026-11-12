// End-to-end API / authorization checks (direct HTTP requests, no browser).
// Usage:  BASE=http://localhost:3100 FOREIGN_CAMPAIGN_ID=<id of a campaign of another advertiser> node tests/api_checks.mjs
// Prints PASS/FAIL per check, exits 1 if any fail. Creates a few "API-TEST ..." campaigns/ads in the DB.
const BASE = process.env.BASE ?? "http://localhost:3100";
const FOREIGN = process.env.FOREIGN_CAMPAIGN_ID ? Number(process.env.FOREIGN_CAMPAIGN_ID) : null;
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "   <-- " + detail}`); };

async function http(method, path, { cookie, body } = {}) {
  const res = await fetch(BASE + path, {
    method, redirect: "manual",
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers, location: res.headers.get("location") };
}
async function login(email, password) {
  const r = await http("POST", "/api/auth/login", { body: { email, password } });
  const set = r.headers.get("set-cookie") ?? "";
  return { r, cookie: set.split(";")[0], set };
}

const stamp = Date.now().toString(36);

// ---------- unauthenticated ----------
console.log("\n== Unauthenticated access ==");
for (const p of ["/api/campaigns", "/api/campaigns/1/funnel", "/api/lookups", "/api/admin/campaigns", "/api/admin/ads", "/api/admin/audit"]) {
  const r = await http("GET", p); check(`GET ${p} -> 401`, r.status === 401, r.status);
}
for (const [m, p] of [["POST", "/api/snapshot"], ["PATCH", "/api/campaigns/1/budget"], ["POST", "/api/admin/campaigns"], ["DELETE", "/api/admin/ads/1"]]) {
  const r = await http(m, p, { body: m === "DELETE" ? undefined : {} }); check(`${m} ${p} -> 401`, r.status === 401, r.status);
}
for (const p of ["/dashboard", "/admin/campaigns", "/admin/ads", "/admin/audit"]) {
  const r = await http("GET", p); check(`page ${p} redirects to /login`, [307, 308].includes(r.status) && (r.location ?? "").includes("/login"), `${r.status} ${r.location}`);
}
{ const r = await http("GET", "/api/campaigns", { cookie: "adtech_session=not.a.valid.jwt" }); check("forged/garbage session cookie -> 401", r.status === 401, r.status); }

// ---------- login ----------
console.log("\n== Login ==");
{ const { r } = await login("admin@acme.test", "wrong"); check("wrong password -> 401", r.status === 401, r.status); }
{ const { r } = await login("nobody@acme.test", "x"); check("unknown user -> 401", r.status === 401, r.status); }
{ const r = await http("POST", "/api/auth/login", { body: { email: "not-an-email", password: "x" } }); check("invalid email format -> 400", r.status === 400, r.status); }
const A = await login("admin@acme.test", "Admin@123");
const N = await login("analyst@acme.test", "Analyst@123");
check("admin login -> 200 role ADMIN", A.r.status === 200 && A.r.json?.role === "ADMIN", JSON.stringify(A.r.json));
check("analyst login -> 200 role ANALYST", N.r.status === 200 && N.r.json?.role === "ANALYST", JSON.stringify(N.r.json));
check("session cookie is HttpOnly + SameSite=lax", /httponly/i.test(A.set) && /samesite=lax/i.test(A.set), A.set);
check("login response never contains a password hash", !/\$2[aby]\$/.test(A.r.text));

// ---------- analyst: read OK, every write/admin endpoint forbidden ----------
console.log("\n== Analyst permissions (direct API calls) ==");
const camps = await http("GET", "/api/campaigns", { cookie: N.cookie });
check("analyst can read campaigns", camps.status === 200 && camps.json.length >= 3, camps.status);
const cid = camps.json[0].campaign_id;
{ const r = await http("GET", `/api/campaigns/${cid}/funnel`, { cookie: N.cookie }); check("analyst can read funnel", r.status === 200 && r.json.stages.length === 5, r.status); }
for (const [m, p, b] of [
  ["PATCH", `/api/campaigns/${cid}/budget`, { budget: 999 }],
  ["POST", "/api/snapshot", undefined],
  ["GET", "/api/admin/campaigns"], ["POST", "/api/admin/campaigns", { name: "x" }], ["PATCH", `/api/admin/campaigns/${cid}`, { name: "Hacked" }],
  ["GET", "/api/admin/ads"], ["POST", "/api/admin/ads", { campaign_id: cid }], ["PATCH", "/api/admin/ads/1", { ad_name: "Hacked" }], ["DELETE", "/api/admin/ads/1"],
  ["GET", "/api/admin/audit"],
]) { const r = await http(m, p, { cookie: N.cookie, body: b }); check(`analyst ${m} ${p} -> 403`, r.status === 403, r.status); }
for (const p of ["/admin/campaigns", "/admin/ads", "/admin/audit"]) {
  const r = await http("GET", p, { cookie: N.cookie }); check(`analyst page ${p} redirected to /dashboard?denied=1`, [307, 308].includes(r.status) && (r.location ?? "").includes("/dashboard?denied=1"), `${r.status} ${r.location}`);
}
{ const before = (await http("GET", "/api/campaigns", { cookie: A.cookie })).json.find((c) => c.campaign_id === cid).total_budget;
  const after = (await http("GET", "/api/campaigns", { cookie: N.cookie })).json.find((c) => c.campaign_id === cid).total_budget;
  check("analyst attempts left the budget unchanged", before === after, `${before} vs ${after}`); }

// ---------- admin: campaign management ----------
console.log("\n== Admin: campaign create / edit ==");
const today = new Date().toISOString().slice(0, 10);
const later = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
const name = `API-TEST ${stamp}`;
const created = await http("POST", "/api/admin/campaigns", { cookie: A.cookie, body: { name, objective: "SALES", total_budget: 120.5, start_date: today, end_date: later, status: "DRAFT" } });
check("create campaign -> 201", created.status === 201 && created.json?.name === name, `${created.status} ${created.text}`);
const newId = created.json?.campaign_id;
{ const r = await http("POST", "/api/admin/campaigns", { cookie: A.cookie, body: { name, total_budget: 10, start_date: today, end_date: later } }); check("duplicate name -> 409 with clear message", r.status === 409 && /already exists/i.test(r.json?.error ?? ""), `${r.status} ${r.text}`); }
{ const r = await http("POST", "/api/admin/campaigns", { cookie: A.cookie, body: { name: "x", total_budget: -5, start_date: "2026-13-45", end_date: later } });
  check("invalid input -> 400 with per-field errors", r.status === 400 && r.json?.fields?.name && r.json?.fields?.total_budget && r.json?.fields?.start_date, `${r.status} ${r.text}`); }
{ const r = await http("POST", "/api/admin/campaigns", { cookie: A.cookie, body: { name: `${name} b`, total_budget: 10, start_date: later, end_date: today } }); check("end date before start date -> 400", r.status === 400 && r.json?.fields?.end_date, r.text); }
{ const r = await http("POST", "/api/admin/campaigns", { cookie: A.cookie, body: { name: `${name} c`, total_budget: 10.999, start_date: today, end_date: later } }); check("budget with 3 decimals -> 400", r.status === 400 && r.json?.fields?.total_budget, r.text); }
{ const r = await http("POST", "/api/admin/campaigns", { cookie: A.cookie, body: "not json" }); check("malformed body -> 400 (not 500)", r.status === 400, r.status); }
{ const r = await http("PATCH", `/api/admin/campaigns/${newId}`, { cookie: A.cookie, body: { name: `${name} renamed`, status: "ACTIVE", objective: "" } });
  check("edit name/status/objective -> 200", r.status === 200, r.text);
  const list = (await http("GET", "/api/admin/campaigns", { cookie: A.cookie })).json.find((c) => c.campaign_id === newId);
  check("edit persisted (objective cleared to null)", list.name === `${name} renamed` && list.status === "ACTIVE" && list.objective === null, JSON.stringify(list)); }
{ const r = await http("PATCH", `/api/admin/campaigns/${newId}`, { cookie: A.cookie, body: { end_date: "2000-01-01" } }); check("DB CHECK (end >= start) surfaces as a clear 400", r.status === 400 && /end date/i.test(r.json?.error ?? ""), r.text); }
{ const r = await http("PATCH", `/api/admin/campaigns/${newId}`, { cookie: A.cookie, body: {} }); check("empty edit -> 400", r.status === 400, r.text); }
{ const r = await http("DELETE", `/api/admin/campaigns/${newId}`, { cookie: A.cookie }); check("no hard-delete endpoint for campaigns (405)", r.status === 405, r.status); }
{ const r = await http("PATCH", "/api/admin/campaigns/99999", { cookie: A.cookie, body: { name: "Nope Nope" } }); check("edit unknown campaign -> 404", r.status === 404, r.status); }
if (FOREIGN) {
  const r = await http("PATCH", `/api/admin/campaigns/${FOREIGN}`, { cookie: A.cookie, body: { name: "Cross tenant" } }); check("cannot edit another advertiser's campaign (404)", r.status === 404, r.status);
  const b = await http("PATCH", `/api/campaigns/${FOREIGN}/budget`, { cookie: A.cookie, body: { budget: 5 } }); check("cannot change another advertiser's budget", [400, 403, 404].includes(b.status), `${b.status} ${b.text}`);
  const f = await http("GET", `/api/campaigns/${FOREIGN}/funnel`, { cookie: A.cookie }); check("cannot read another advertiser's funnel (404)", f.status === 404, f.status);
}

console.log("\n== Admin: budget rules ==");
{ const spent = camps.json.find((c) => c.campaign_id === cid).spent;
  const orig = camps.json.find((c) => c.campaign_id === cid);
  const r = await http("PATCH", `/api/admin/campaigns/${cid}`, { cookie: A.cookie, body: { name: "SHOULD ROLL BACK", total_budget: Math.max(0.01, spent / 2) } });
  check("budget below spend rejected with explanatory message", r.status === 400 && /below amount already spent/i.test(r.json?.error ?? ""), `${r.status} ${r.text}`);
  const after = (await http("GET", "/api/admin/campaigns", { cookie: A.cookie })).json.find((c) => c.campaign_id === cid);
  check("rejected edit rolled back ALL changes (name + budget unchanged)", after.name === orig.name && after.total_budget === orig.total_budget, JSON.stringify(after));
  const up = await http("PATCH", `/api/admin/campaigns/${newId}`, { cookie: A.cookie, body: { total_budget: 200 } });
  check("budget increase via procedure -> 200", up.status === 200, up.text);
  const direct = await http("PATCH", `/api/campaigns/${newId}/budget`, { cookie: A.cookie, body: { budget: 250 } });
  check("dashboard budget endpoint still works for admin", direct.status === 200, direct.text); }

// ---------- admin: ad CRUD ----------
console.log("\n== Admin: ad management ==");
const adBody = { campaign_id: newId, channel_id: 1, ad_name: `API-TEST ad ${stamp}`, ad_format: "banner", pricing_model: "CPC", unit_cost: 0.55, status: "ACTIVE" };
const ad = await http("POST", "/api/admin/ads", { cookie: A.cookie, body: adBody });
check("create ad -> 201", ad.status === 201 && ad.json?.ad_name === adBody.ad_name, `${ad.status} ${ad.text}`);
const adId = ad.json?.ad_id;
{ const r = await http("POST", "/api/admin/ads", { cookie: A.cookie, body: { ...adBody, pricing_model: "CPX", unit_cost: -1, ad_name: "" } }); check("invalid ad -> 400 with field errors", r.status === 400 && r.json?.fields?.pricing_model && r.json?.fields?.unit_cost && r.json?.fields?.ad_name, r.text); }
{ const r = await http("POST", "/api/admin/ads", { cookie: A.cookie, body: { ...adBody, channel_id: 9999 } }); check("unknown channel -> 400/409 clear message (not 500)", [400, 409].includes(r.status) && /channel/i.test(r.json?.error ?? ""), `${r.status} ${r.text}`); }
if (FOREIGN) { const r = await http("POST", "/api/admin/ads", { cookie: A.cookie, body: { ...adBody, campaign_id: FOREIGN } }); check("cannot create an ad in another advertiser's campaign (404)", r.status === 404, r.status); }
{ const r = await http("PATCH", `/api/admin/ads/${adId}`, { cookie: A.cookie, body: { unit_cost: 0.7, status: "PAUSED" } }); check("edit ad -> 200", r.status === 200, r.text);
  const row = (await http("GET", `/api/admin/ads?campaign_id=${newId}`, { cookie: A.cookie })).json.find((a) => a.ad_id === adId);
  check("ad edit persisted + campaign filter works", row?.unit_cost === 0.7 && row?.status === "PAUSED", JSON.stringify(row)); }
{ const r = await http("PATCH", `/api/admin/ads/${adId}`, { cookie: A.cookie, body: { campaign_id: cid } });
  const row = (await http("GET", `/api/admin/ads?campaign_id=${newId}`, { cookie: A.cookie })).json.find((a) => a.ad_id === adId);
  check("ad cannot be moved to another campaign (field ignored / rejected)", row?.campaign_id === newId, `${r.status} ${JSON.stringify(row)}`); }
const allAds = (await http("GET", "/api/admin/ads", { cookie: A.cookie })).json;
const used = allAds.find((a) => a.tracked_events > 0);
{ const r = await http("DELETE", `/api/admin/ads/${used.ad_id}`, { cookie: A.cookie });
  check("deleting an ad with tracked events is refused (409) with a helpful message", r.status === 409 && /paused/i.test(r.json?.error ?? ""), `${r.status} ${r.text}`);
  const still = (await http("GET", "/api/admin/ads", { cookie: A.cookie })).json.some((a) => a.ad_id === used.ad_id);
  check("refused delete left the ad and its events intact", still); }
{ const r = await http("DELETE", `/api/admin/ads/${adId}`, { cookie: A.cookie }); check("delete an unused ad -> 200 (SQL DELETE)", r.status === 200, r.text);
  const gone = !(await http("GET", "/api/admin/ads", { cookie: A.cookie })).json.some((a) => a.ad_id === adId); check("deleted ad no longer listed", gone);
  const again = await http("DELETE", `/api/admin/ads/${adId}`, { cookie: A.cookie }); check("deleting it again -> 404", again.status === 404, again.status); }

// ---------- audit log ----------
console.log("\n== Admin: audit log ==");
const au = await http("GET", "/api/admin/audit?limit=100", { cookie: A.cookie });
check("audit log readable by admin", au.status === 200 && Array.isArray(au.json?.rows), au.status);
const mine = au.json.rows.filter((r) => r.campaign_id === newId);
check("campaign creation was audited with the acting user", mine.some((r) => r.action === "INSERT" && r.changed_by_name === "Ava Admin"), JSON.stringify(mine.map((r) => [r.action, r.changed_by_name])));
check("budget change audited with old and new values", mine.some((r) => r.action === "UPDATE" && r.changes?.total_budget && Number(r.changes.total_budget.new) === 200 && Number(r.changes.total_budget.old) === 120.5), JSON.stringify(mine.map((r) => r.changes)));
check("audit rows ordered newest first", au.json.rows.every((r, i, a) => i === 0 || new Date(a[i - 1].changed_at) >= new Date(r.changed_at)));
check("audit payload exposes no credentials", !/password|\$2[aby]\$|hash/i.test(au.text));
{ const r = await http("GET", `/api/admin/audit?action=INSERT&campaign_id=${newId}`, { cookie: A.cookie }); check("audit filters (action + campaign) work", r.status === 200 && r.json.rows.length === 1 && r.json.total === 1, r.text.slice(0, 200)); }
{ const r = await http("GET", `/api/admin/audit?from=${today}&to=${today}`, { cookie: A.cookie }); check("audit date range (today) returns today's entries", r.status === 200 && r.json.total >= 1, r.text.slice(0, 200)); }
{ const r = await http("GET", "/api/admin/audit?from=2026-12-31&to=2026-01-01", { cookie: A.cookie }); check("audit inverted date range -> 400", r.status === 400, r.status); }
{ const r = await http("GET", "/api/admin/audit?limit=2&offset=1", { cookie: A.cookie }); check("audit pagination (limit/offset)", r.status === 200 && r.json.rows.length === 2 && r.json.offset === 1, r.text.slice(0, 120)); }

// ---------- funnel, date filters, snapshots ----------
console.log("\n== Funnel analytics: date filters and snapshots ==");
const all = (await http("GET", `/api/campaigns/${cid}/funnel`, { cookie: N.cookie })).json;
const imp = (j) => j.stages[0].visitors;
check("live funnel has 5 ordered stages IMPRESSION..PURCHASE", all.stages.map((s) => s.stage).join() === "IMPRESSION,CLICK,VISIT,CART,PURCHASE", all.stages.map((s) => s.stage).join());
check("funnel is monotonic (no stage larger than the previous)", all.stages.every((s, i, a) => i === 0 || s.visitors <= a[i - 1].visitors));
const d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const recent = (await http("GET", `/api/campaigns/${cid}/funnel?from=${d(7)}&to=${d(0)}`, { cookie: N.cookie })).json;
check("last-7-days range returns fewer impressions than all-time", imp(recent) > 0 && imp(recent) < imp(all), `${imp(recent)} vs ${imp(all)}`);
const left = (await http("GET", `/api/campaigns/${cid}/funnel?from=${d(60)}&to=${d(21)}`, { cookie: N.cookie })).json;
const right = (await http("GET", `/api/campaigns/${cid}/funnel?from=${d(20)}&to=${d(0)}`, { cookie: N.cookie })).json;
check("adjacent ranges are disjoint (impressions add up to ~all-time)", Math.abs(imp(left) + imp(right) - imp(all)) <= Math.max(2, imp(all) * 0.05), `${imp(left)}+${imp(right)} vs ${imp(all)}`);
{ const r = await http("GET", `/api/campaigns/${cid}/funnel?from=${d(0)}&to=${d(5)}`, { cookie: N.cookie }); check("inverted range -> 400 with message", r.status === 400 && /from/i.test(r.json?.error ?? ""), r.text); }
{ const r = await http("GET", `/api/campaigns/${cid}/funnel?from=notadate`, { cookie: N.cookie }); check("malformed date -> 400", r.status === 400, r.text); }
{ const r = await http("GET", `/api/campaigns/${cid}/funnel?from=2000-01-01&to=2000-01-02`, { cookie: N.cookie }); check("range with no data returns zeros (UI shows an empty state)", r.status === 200 && imp(r.json) === 0, r.text.slice(0, 120)); }
{ const r = await http("GET", `/api/campaigns/${cid}/funnel?source=bogus`, { cookie: N.cookie }); check("invalid source -> 400", r.status === 400, r.text); }

const refresh = await http("POST", "/api/snapshot", { cookie: A.cookie });
check("admin snapshot refresh -> 200 with snapshot_date", refresh.status === 200 && /^\d{4}-\d{2}-\d{2}$/.test(refresh.json?.snapshot_date ?? ""), refresh.text);
const snap = (await http("GET", `/api/campaigns/${cid}/funnel?source=snapshot`, { cookie: N.cookie })).json;
check("snapshot view reports the refreshed snapshot_date", snap.snapshot_date === refresh.json.snapshot_date, `${snap.snapshot_date} vs ${refresh.json?.snapshot_date}`);
check("snapshot (cumulative through today) equals the live all-time funnel stage by stage", snap.stages.every((s, i) => s.visitors === all.stages[i].visitors), JSON.stringify([snap.stages.map((s) => s.visitors), all.stages.map((s) => s.visitors)]));
{ const list = (await http("GET", "/api/campaigns", { cookie: N.cookie })).json; check("campaign list exposes snapshot_date after refresh", list.every((c) => c.snapshot_date === refresh.json.snapshot_date), JSON.stringify(list.map((c) => c.snapshot_date))); }
{ const r2 = await http("POST", "/api/snapshot", { cookie: A.cookie }); const s2 = (await http("GET", `/api/campaigns/${cid}/funnel?source=snapshot`, { cookie: N.cookie })).json;
  check("refreshing twice is idempotent (upsert, same counts)", r2.status === 200 && s2.stages.every((s, i) => s.visitors === snap.stages[i].visitors)); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
