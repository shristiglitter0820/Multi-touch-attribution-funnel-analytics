// End-to-end integration test:  MongoDB ingestion -> sync -> PostgreSQL -> sessionization -> conversion -> attribution -> analytics APIs
// Needs: the app running (BASE), MongoDB reachable (MONGODB_URI / MONGODB_DB containing "test"), INGEST_API_KEY set for BOTH the app and this script.
//   BASE=http://localhost:3100 MONGODB_URI=mongodb://127.0.0.1:27017 MONGODB_DB=adtech_test INGEST_API_KEY=... node tests/integration_flow.mjs
import { MongoClient } from "mongodb";
const BASE = process.env.BASE ?? "http://localhost:3100";
const KEY = process.env.INGEST_API_KEY;
const DBNAME = process.env.MONGODB_DB ?? "adtech_test";
if (!KEY) { console.error("INGEST_API_KEY must be set"); process.exit(2); }
if (!/test/i.test(DBNAME)) { console.error("Refusing to run: MONGODB_DB must contain 'test' because this script clears ad_events"); process.exit(2); }
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "   <-- " + detail}`); };
async function http(method, path, { cookie, body, key, raw } = {}) {
  const res = await fetch(BASE + path, { method, redirect: "manual",
    headers: { ...(cookie ? { cookie } : {}), ...(key ? { "x-api-key": key } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
}
async function login(email, password) { const r = await http("POST", "/api/auth/login", { body: { email, password } }); return (r.headers.get("set-cookie") ?? "").split(";")[0]; }
const ev = (key, body) => http("POST", "/api/events", { key, body });

const mongo = await new MongoClient(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017", { serverSelectionTimeoutMS: 5000 }).connect();
const col = mongo.db(DBNAME).collection("ad_events");
await col.deleteMany({});

const A = await login("admin@acme.test", "Admin@123");
const N = await login("analyst@acme.test", "Analyst@123");
const stamp = Date.now().toString(36);
const base = 70000 + Math.floor(Math.random() * 20000);   // unique external user ids per run

// ---- look up real ad ids (event senders must use the ids shown on the Ads page)
const ads = (await http("GET", "/api/admin/ads", { cookie: A })).json;
const adId = (name) => ads.find((a) => a.ad_name === name)?.ad_id;
const GOOGLE = adId("Google Search Ad"), INSTA = adId("Instagram Summer Ad");
check("Member 1 demo ads are present (ids found)", !!GOOGLE && !!INSTA, JSON.stringify([GOOGLE, INSTA]));
const campId = ads.find((a) => a.ad_id === INSTA).campaign_id;

const funnel = async () => (await http("GET", `/api/campaigns/${campId}/funnel`, { cookie: N })).json.stages.map((s) => s.visitors);
const attr = async () => (await http("GET", `/api/analytics/attribution?campaign_id=${campId}`, { cookie: N })).json;
const rev = (rows, ch, model) => rows.filter((r) => r.channel_name === ch && r.model_name === model).reduce((a, r) => a + r.attributed_revenue, 0);
const roi = async (model) => (await http("GET", `/api/analytics/roi?model=${model}`, { cookie: N })).json.campaigns.find((c) => c.campaign_id === campId);

console.log("\n== Health ==");
{ const r = await http("GET", "/api/health"); check("GET /api/health -> running, postgres ok, mongodb ok", r.status === 200 && r.json?.postgres === "ok" && r.json?.mongodb === "ok" && /running/.test(r.json?.message), r.text); }

console.log("\n== Ingestion security ==");
{ const r = await ev(undefined, { user_id: 1, event_type: "CLICK", channel: "x" }); check("POST /api/events without API key -> 401", r.status === 401, r.status); }
{ const r = await ev("wrong-key-wrong-key", { user_id: 1, event_type: "CLICK", channel: "x" }); check("wrong API key -> 401", r.status === 401, r.status); }
{ const r = await http("POST", "/api/events", { cookie: A, body: { user_id: 1, event_type: "CLICK", channel: "x" } }); check("a browser session alone cannot ingest (API key required)", r.status === 401, r.status); }
{ const r = await http("POST", "/api/events/sync"); check("sync without credentials -> 401", r.status === 401, r.status); }
{ const r = await http("POST", "/api/events/sync", { cookie: N }); check("ANALYST cannot trigger sync -> 403", r.status === 403, r.status); }
{ const r = await http("POST", "/api/events/sync", { key: "wrong-key-wrong-key" }); check("sync with wrong API key -> 401", r.status === 401, r.status); }
{ const r = await http("GET", "/api/admin/events", { cookie: N }); check("ANALYST cannot read sync status (admin API) -> 403", r.status === 403, r.status); }
check("no documents stored by rejected requests", (await col.countDocuments()) === 0);

console.log("\n== Ingestion validation (Member 1's rules and messages) ==");
const bad = [
  ["user_id as text", { user_id: "3", event_type: "CLICK", channel: "Google Ads" }, "user_id must be a positive integer"],
  ["user_id 0", { user_id: 0, event_type: "CLICK", channel: "Google Ads" }, "user_id must be a positive integer"],
  ["unknown event_type", { user_id: 1, event_type: "HOVER", channel: "Google Ads" }, "Invalid event_type"],
  ["missing channel", { user_id: 1, event_type: "CLICK" }, "channel is required"],
  ["purchase without revenue", { user_id: 1, event_type: "PURCHASE", channel: "Direct", order_reference: "X" }, "revenue must be a non-negative number"],
  ["negative revenue", { user_id: 1, event_type: "PURCHASE", channel: "Direct", revenue: -5, order_reference: "X" }, "revenue must be a non-negative number"],
  ["purchase without order_reference", { user_id: 1, event_type: "PURCHASE", channel: "Direct", revenue: 5 }, "order_reference is required"],
  ["order_reference 101 chars", { user_id: 1, event_type: "PURCHASE", channel: "Direct", revenue: 5, order_reference: "x".repeat(101) }, "order_reference is required"],
  ["ad_id 0", { user_id: 1, event_type: "CLICK", channel: "Google Ads", ad_id: 0 }, "ad_id must be a positive integer"],
  ["device_type number", { user_id: 1, event_type: "CLICK", channel: "Google Ads", device_type: 5 }, "device_type must be a string"],
  ["bad session_id on purchase", { user_id: 1, event_type: "PURCHASE", channel: "Direct", revenue: 1, order_reference: "X", session_id: -2 }, "session_id must be a positive integer"],
];
for (const [name, body, msg] of bad) { const r = await ev(KEY, body); check(`400 for ${name}`, r.status === 400 && (r.json?.error ?? "").includes(msg), `${r.status} ${r.text}`); }
{ const r = await ev(KEY, { user_id: 1, event_type: "HOVER", channel: "x" }); check("invalid event_type response lists the allowed types", Array.isArray(r.json?.allowed) && r.json.allowed.length === 5); }
{ const r = await http("POST", "/api/events", { key: KEY, raw: "not json" }); check("malformed JSON -> 400 (not 500)", r.status === 400, r.status); }
{ const r = await http("POST", "/api/events", { key: KEY, raw: "[1,2]" }); check("JSON array body -> 400", r.status === 400, r.status); }
{ const r = await http("POST", "/api/events", { key: KEY, raw: JSON.stringify({ user_id: 1, event_type: "CLICK", channel: "x", pad: "a".repeat(120000) }) }); check("oversized body -> 413", r.status === 413, r.status); }
check("invalid events were NOT stored in MongoDB", (await col.countDocuments()) === 0);

console.log("\n== Ingest a complete customer journey (user A) ==");
const uA = base + 1, order = `INT-${stamp}-A`;
const f0 = await funnel(), a0 = await attr(), r0 = await roi("LAST_TOUCH");
const journey = [
  { user_id: uA, event_type: "IMPRESSION", channel: "Google Ads", ad_id: GOOGLE, device_type: "Mobile" },
  { user_id: uA, event_type: "CLICK", channel: "Instagram", ad_id: INSTA, device_type: "Mobile" },
  { user_id: uA, event_type: "VISIT", channel: "Direct", device_type: "Mobile" },
  { user_id: uA, event_type: "ADD_TO_CART", channel: "Direct", device_type: "Mobile" },
  { user_id: uA, event_type: "PURCHASE", channel: "Direct", revenue: 600, order_reference: order, device_type: "Mobile" },
];
let ids = [];
for (const e of journey) { const r = await ev(KEY, e); check(`201 stored ${e.event_type}`, r.status === 201 && r.json?.event_id && r.json?.message === "Event stored successfully", r.text); ids.push(r.json?.event_id); await new Promise((s) => setTimeout(s, 15)); }
check("5 raw events are in MongoDB", (await col.countDocuments({ user_id: uA })) === 5);
{ const d = await col.findOne({ user_id: uA, event_type: "PURCHASE" }); check("Mongo document keeps the raw event (revenue, order_reference, timestamps)", d?.revenue === 600 && d?.order_reference === order && d?.event_time instanceof Date && d?.received_at instanceof Date); }

console.log("\n== Synchronise (Mongo -> Postgres) ==");
const s1 = await http("POST", "/api/events/sync", { cookie: A });
check("admin sync -> 200 with Member 1's response keys", s1.status === 200 && s1.json?.message === "Event synchronization completed" && "total" in s1.json && "synced" in s1.json && "skipped" in s1.json, s1.text);
check("all 5 events synced, 1 conversion, 4 attribution rows (1 first + 1 last + 2 linear)", s1.json?.synced === 5 && s1.json?.conversions_created === 1 && s1.json?.attribution_rows === 4 && s1.json?.rejected === 0, s1.text);
const f1 = await funnel();
check("funnel (existing logic): +1 visitor at IMPRESSION, CLICK, VISIT, CART and PURCHASE", f1.every((v, i) => v === f0[i] + 1), JSON.stringify([f0, f1]));
const a1 = await attr();
check("FIRST_TOUCH credits the Google Ads impression with 600", rev(a1, "Google Ads", "FIRST_TOUCH") - rev(a0, "Google Ads", "FIRST_TOUCH") === 600, "");
check("LAST_TOUCH credits the Instagram click with 600 (and Google none)", rev(a1, "Instagram", "LAST_TOUCH") - rev(a0, "Instagram", "LAST_TOUCH") === 600 && rev(a1, "Google Ads", "LAST_TOUCH") === rev(a0, "Google Ads", "LAST_TOUCH"), "");
check("LINEAR splits 300 / 300 between Google Ads and Instagram", rev(a1, "Google Ads", "LINEAR") - rev(a0, "Google Ads", "LINEAR") === 300 && rev(a1, "Instagram", "LINEAR") - rev(a0, "Instagram", "LINEAR") === 300, "");
const r1 = await roi("LAST_TOUCH");
check("ROI view: clicks +1, impressions unchanged for this campaign's Instagram ad, revenue +600, credited conversions +1", r1.clicks === r0.clicks + 1 && r1.attributed_revenue - r0.attributed_revenue === 600 && Math.abs(r1.credited_conversions - r0.credited_conversions - 1) < 1e-6, JSON.stringify([r0, r1]));
check("spend increased by one CPC click (1,000)", Math.abs(r1.spend - r0.spend - 1000) < 0.01, `${r0.spend} -> ${r1.spend}`);

console.log("\n== Idempotency ==");
const s2 = await http("POST", "/api/events/sync", { cookie: A });
check("second sync imports nothing new", s2.status === 200 && s2.json.staged_new === 0 && s2.json.synced === 0 && s2.json.conversions_created === 0, s2.text);
const a2 = await attr();
check("second sync did not duplicate conversions or credits", JSON.stringify(a2) === JSON.stringify(a1));
{ const s3 = await http("POST", "/api/events/sync", { key: KEY }); check("sync with the API key also works (for schedulers)", s3.status === 200 && s3.json.synced === 0, s3.text); }

console.log("\n== Edge cases: zero revenue, duplicates, bad events, malformed documents ==");
const uB = base + 2;
await ev(KEY, { user_id: uB, event_type: "CLICK", channel: "Instagram", ad_id: INSTA });
await ev(KEY, { user_id: uB, event_type: "PURCHASE", channel: "Direct", revenue: 0, order_reference: `INT-${stamp}-FREE` });
await ev(KEY, { user_id: uB, event_type: "PURCHASE", channel: "Direct", revenue: 10, order_reference: `INT-${stamp}-FREE` });          // duplicate order reference
await ev(KEY, { user_id: base + 3, event_type: "CLICK", channel: "NoSuchChannel", ad_id: INSTA });                                     // unknown channel
await ev(KEY, { user_id: base + 4, event_type: "CLICK", channel: "Google Ads", ad_id: INSTA });                                        // ad does not belong to channel
await ev(KEY, { user_id: base + 5, event_type: "CLICK", channel: "Google Ads" });                                                      // click without ad
await col.insertOne({ user_id: "oops", event_type: "BOGUS", channel: 5, received_at: new Date() });                                      // malformed raw document
const s4 = await http("POST", "/api/events/sync", { cookie: A });
check("batch with 4 bad events + 1 malformed doc still syncs the good ones (2 synced, 4 rejected, 1 malformed)", s4.status === 200 && s4.json.synced === 2 && s4.json.rejected === 4 && s4.json.malformed === 1 && s4.json.conversions_created === 1, s4.text);
{ const st = (await http("GET", "/api/admin/events", { cookie: A })).json;
  const reasons = st.rejected.map((r) => r.reject_reason).join(" | ");
  check("admin Events API lists rejection reasons (unknown channel, wrong-channel ad, missing ad, duplicate order)",
    /unknown channel/.test(reasons) && /does not belong to channel/.test(reasons) && /require an ad_id/.test(reasons) && /duplicate order_reference/.test(reasons), reasons);
  check("admin Events API shows run history and counts", st.runs.length >= 3 && st.runs[0].status === "SUCCESS" && st.counts.PROCESSED >= 7 && st.counts.REJECTED >= 4, JSON.stringify(st.counts)); }
{ const rf = await roi("LAST_TOUCH"); check("zero-revenue order created a credited conversion with 0 revenue", Math.abs(rf.credited_conversions - r1.credited_conversions - 1) < 1e-6 && rf.attributed_revenue === r1.attributed_revenue, JSON.stringify([r1, rf])); }

console.log("\n== Sessionization with real event times (30-minute rule) ==");
const uC = base + 6, t0 = Date.now() - 2 * 3600e3, min = 60e3;
const f2 = await funnel();
const mk = (type, offsetMin, extra = {}) => ({ user_id: uC, event_type: type, channel: type === "CLICK" ? "Instagram" : "Direct", ad_id: type === "CLICK" ? INSTA : null, device_type: null,
  revenue: null, order_reference: null, session_id: null, event_time: new Date(t0 + offsetMin * min), received_at: new Date(), ...extra });
await col.insertMany([ mk("CLICK", 0), mk("VISIT", 29), mk("PURCHASE", 60, { revenue: 80, order_reference: `INT-${stamp}-C` }) ]);   // 29 min gap: same session; 31 min gap: new session
const s5 = await http("POST", "/api/events/sync", { cookie: A });
check("backdated raw events sync (3 events, 1 conversion)", s5.status === 200 && s5.json.synced === 3 && s5.json.conversions_created === 1, s5.text);
const f3 = await funnel();
check("click (+1) and the visit 29 min later (+1) share a session; the purchase 31 min after that is a NEW session, so it is not in the click session's funnel (purchase +0)",
  f3[1] === f2[1] + 1 && f3[2] === f2[2] + 1 && f3[4] === f2[4], JSON.stringify([f2, f3]));
{ const rc = await roi("LAST_TOUCH"); const rf = await roi("LAST_TOUCH");
  check("...yet the purchase is still attributed to the earlier click (multi-touch, not session-bound)", rc.attributed_revenue >= r1.attributed_revenue + 80, JSON.stringify(rf)); }

console.log("\n== Existing Member 2 APIs unaffected ==");
{ const r = await http("GET", "/api/campaigns", { cookie: N }); check("campaign list still works", r.status === 200 && r.json.length >= 5, r.status); }
{ const r = await http("GET", "/api/admin/audit", { cookie: A }); check("audit log still readable by admin", r.status === 200 && Array.isArray(r.json.rows), r.status); }
{ const r = await http("GET", "/api/admin/audit", { cookie: N }); check("audit log still forbidden for analyst", r.status === 403, r.status); }
{ const r = await http("GET", "/api/analytics/roi?model=NOPE", { cookie: N }); check("analytics rejects an invalid model with 400", r.status === 400, r.status); }
{ const r = await http("GET", "/api/analytics/roi", { }); check("analytics requires a session", r.status === 401, r.status); }

await mongo.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
