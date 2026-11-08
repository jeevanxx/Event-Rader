// Event Radar automatic scout. Runs daily on GitHub Actions with no AI involved.
// It reads structured event data from public listing sites, keeps events Jeevan can join
// (Tamil Nadu, Kerala, Bengaluru, online, and anything at Joy University), and merges them
// into data/events.json. It also refreshes data/joy.json with Joy University's campus events.
//
// Accuracy rules: every field comes straight from the source listing. Nothing is guessed;
// fields the source doesn't give are left out. Auto-found events are marked `auto: true`.

import fs from "node:fs";

const UA = "Mozilla/5.0 (compatible; EventRadarBot/1.0; +https://github.com/jeevanxx/Event-Rader)";
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()); // YYYY-MM-DD
const NICE = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date());
const DRY = !!process.env.DRY_RUN;
const MAX_DETAIL_FETCHES = 60;

const TECH = /hack|\bcode\b|coding|programming|developer|software|\bweb\b|web dev|\bapps?\b|android|flutter|react|javascript|python|\bjava\b|\bai\b|artificial intelligence|machine learning|\bml\b|deep learning|genai|generative|\bllm|agentic|ai agent|data science|cloud|aws|azure|gcp|devops|cyber|ctf|blockchain|web3|\biot\b|robotic|embedded|startup|ideathon|buildathon|technical symposium|full.?stack|computer vision|n8n|automation|prompt/i;
const STRONG = /hack|\bcode\b|coding|programming|ctf|capture the flag|\bai\b|artificial intelligence|machine learning|genai|generative|agentic|\bllm|web dev|full.?stack|\bapps?\b|developer|prompt|data science|cyber|buildathon|ideathon|cloud|startup/i;
const EXCLUDE = /\bfdp\b|faculty development|for faculty|faculty members|women only|only women|girls only|only girls|female only|all-girls|school students only|class (9|10|11|12)|classes 9|high school|medical|nursing|pharma|dental|mba admission|study abroad|quiz\b|valorant|bgmi|free fire|ludo|wwe|minecraft|dance|singing|cultural|case (competition|challenge|study)|marketing|finance|stock|investing|consult|debate|chess|aeromodel|business plan|scholarship test|higher studies|career guidance|admission/i;
const REGION_OF_STATE = { "tamil nadu": "tamilnadu", kerala: "kerala", karnataka: "bangalore" };
const KANYAKUMARI = /nagercoil|kanyakumari|kanniyakumari|kumaracoil|thuckalay|marthandam|kuzhithurai|colachel|joy university/i;
const BENGALURU = /bengaluru|bangalore/i;
const log = (...a) => console.log(...a);

async function get(url, { json = false, tries = 2 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: json ? "application/json" : "text/html,*/*" }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return json ? await res.json() : await res.text();
    } catch (err) {
      if (i === tries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}
const day = (s) => (s ? String(s).slice(0, 10) : undefined);
const slug = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
const normTitle = (s) => String(s || "").toLowerCase().replace(/\b20\d\d\b|'2\d\b|’2\d\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const clean = (s, n = 400) => {
  if (!s) return undefined;
  const t = String(s).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "));
  return (end > n * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…");
};
// Turn an HTML description into 1–2 plain sentences, skipping links, social handles and housekeeping lines.
const ENT = { ndash: "–", mdash: "—", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', amp: "&", nbsp: " ", quot: '"', hellip: "…", bull: "•" };
function summarize(htmlText, max = 280) {
  if (!htmlText) return undefined;
  const text = String(htmlText)
    .replace(/<\/(p|li|h\d|div)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? " ").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
  const parts = text.split(/\n+|(?<=[.!?])\s+/).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  const keep = [];
  for (const s of parts) {
    if (s.length < 30) continue;
    if (/https?:|www\.|whatsapp|telegram|instagram|linkedin|discord|join (the|our|now)|official (group|community|handles?)|contact|phone|\+91|@/i.test(s)) continue;
    if (/^(about|overview|introduction|benefits|rules|eligibility|rounds?)\b[^a-z]*$/i.test(s)) continue;
    keep.push(/[.!?]$/.test(s) ? s : s + ".");
    if (keep.join(" ").length >= max * 0.7) break;
  }
  return keep.length ? clean(keep.join(" "), max) : undefined;
}

const ldEvents = (html) => {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    let j; try { j = JSON.parse(m[1]); } catch (_) { continue; }
    const items = Array.isArray(j) ? j : j["@graph"] || [j];
    for (const o of items) if (o && /Event/.test(String(o["@type"]))) out.push(o);
  }
  return out;
};
const ldItemListUrls = (html, prefix) => {
  const urls = new Set();
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    let j; try { j = JSON.parse(m[1]); } catch (_) { continue; }
    const list = (Array.isArray(j) ? j : [j]).flatMap((x) => (x && x["@type"] === "ItemList" ? x.itemListElement || [] : []));
    for (const it of list) if (it.url && it.url.startsWith(prefix)) urls.add(it.url);
  }
  return [...urls];
};
const placeText = (loc) => {
  if (!loc) return {};
  const L = Array.isArray(loc) ? loc[0] : loc;
  if (!L) return {};
  if (/VirtualLocation/.test(L["@type"] || "")) return { online: true };
  const a = L.address || {};
  const addr = typeof a === "string" ? a : [a.streetAddress, a.addressLocality, a.addressRegion].filter(Boolean).join(", ");
  return { venue: L.name, address: addr || undefined, city: typeof a === "object" ? a.addressLocality : undefined, state: typeof a === "object" ? a.addressRegion : undefined };
};

// ---------- Fit score: simple, explainable rules (no AI) ----------
function score(e) {
  let s = 50; const why = [];
  const text = `${e.title} ${e.theme || ""} ${e.summary || ""}`;
  if (e.joy) { s += 20; why.push("at your own campus"); }
  else if (e.region === "online") { s += 4; why.push("online, no travel"); }
  else if (e.region === "kanyakumari") { s += 15; why.push("close to home"); }
  else if (e.region === "kerala" && /trivandrum|thiruvananthapuram|kovalam/i.test(`${e.city} ${e.address}`)) { s += 8; why.push("Trivandrum is a short trip"); }
  else if (e.region === "bangalore") { s -= 8; why.push("needs a Bengaluru trip"); }
  else { s -= 4; why.push("needs travel"); }
  if (/^free/i.test(e.cost || "")) { s += 8; why.push("free"); }
  else if (e.cost && /₹|paid/i.test(e.cost)) { s -= 4; why.push("paid"); }
  if (/\bai\b|genai|generative|llm|agent|machine learning|web|app|full.?stack|startup|saas|cloud/i.test(text)) { s += 8; why.push("matches your AI/web/startup interests"); }
  if (/beginner|no prior|no coding|first.?time|all levels|freshers/i.test(text)) { s += 5; why.push("beginner-friendly"); }
  if (e.kind === "hackathon") s += 3;
  if (e.deadline) { const d = (Date.parse(e.deadline) - Date.parse(TODAY)) / 86400000; if (d <= 2) { s -= 8; why.push("registration closes very soon"); } }
  if (e.region === "online") s = Math.min(s, 65); // online events are easy to join but plentiful; keep them below nearby ones
  s = Math.max(5, Math.min(75, Math.round(s))); // auto scores stay at or below 75 so reviewed picks rank above them
  return { fit: s, fitReason: `Auto-scored: ${why.join(", ")}. Details come straight from the listing and haven't been reviewed.` };
}
const regionFor = ({ online, state, city, text }) => {
  if (KANYAKUMARI.test(text || "") || KANYAKUMARI.test(city || "")) return "kanyakumari";
  if (online) return "online";
  const st = String(state || "").toLowerCase();
  if (st === "karnataka") return BENGALURU.test(`${city} ${text}`) ? "bangalore" : null;
  if (REGION_OF_STATE[st]) return REGION_OF_STATE[st];
  if (BENGALURU.test(city || "")) return "bangalore";
  if (/chennai|coimbatore|madurai|trichy|tiruchirappalli|tirunelveli|salem|erode|vellore|thoothukudi|tuticorin|pollachi|sivakasi|karur|thanjavur|hosur/i.test(`${city} ${text}`)) return "tamilnadu";
  if (/kochi|cochin|trivandrum|thiruvananthapuram|kozhikode|calicut|thrissur|kottayam|kollam|ernakulam|palakkad|kannur|alappuzha|kovalam/i.test(`${city} ${text}`)) return "kerala";
  return null;
};
const kindOf = (t, fallback) => (/hack|buildathon|ideathon|ctf/i.test(t) ? "hackathon" : /workshop|bootcamp|hands.?on|training/i.test(t) ? "workshop" : /meetup|meet-up/i.test(t) ? "meetup" : /summit|conference|devfest|symposium|conclave|expo/i.test(t) ? "conference" : fallback || "competition");

// ---------- Source 1: Unstop public API ----------
async function fromUnstop() {
  const out = [];
  for (const type of ["hackathons", "workshops", "competitions"]) {
    let page = 1, last = 1;
    do {
      const d = await get(`https://unstop.com/api/public/opportunity/search-result?opportunity=${type}&per_page=50&oppstatus=open&page=${page}`, { json: true });
      const data = d.data || {}; last = Math.min(data.last_page || 1, 12);
      for (const i of data.data || []) {
        const org = (i.organisation || {}).name || "";
        const a = i.address_with_country_logo || {};
        const online = i.region === "online";
        const isJoy = /joy university/i.test(org);
        const r = i.regnRequirements || {};
        const deadline = day(r.end_regn_dt);
        const eligible = (i.filters || []).filter((f) => f.type === "eligible").map((f) => f.name);
        const text = `${i.title} ${org} ${(i.workfunction || []).map?.((w) => w.name).join(" ") || ""}`;
        if (i.status !== "LIVE" || (deadline && deadline < TODAY)) continue;
        if (!isJoy && (EXCLUDE.test(text) || (eligible.length && eligible.every((n) => /school/i.test(n))))) continue;
        if (!isJoy) {
          if (type === "competitions" && (online || !STRONG.test(i.title))) continue; // online competitions are mostly noise
          if (type === "workshops" && (online ? (!STRONG.test(i.title) || i.isPaid) : !TECH.test(i.title))) continue;
          if (type === "hackathons" && !TECH.test(text) && !/hack|buildathon|ideathon/i.test(i.title)) continue;
        }
        const region = isJoy ? "kanyakumari" : regionFor({ online, state: a.state, city: a.city, text: `${a.address || ""} ${org}` });
        if (!region) continue;
        const cash = (i.prizes || []).reduce((n, p) => n + (Number(p.cash) || 0), 0);
        const team = r.min_team_size && r.max_team_size ? (r.min_team_size === r.max_team_size ? `${r.min_team_size}` : `${r.min_team_size}–${r.max_team_size}`) : undefined;
        out.push({
          id: `auto-unstop-${i.id}`, title: clean(i.title, 140), kind: kindOf(i.title, type === "workshops" ? "workshop" : type === "hackathons" ? "hackathon" : "competition"),
          start: day(i.start_date), end: day(i.end_date), deadline,
          city: online ? "Online" : a.city || undefined, region, mode: online ? "Online" : "In person",
          venue: online ? "Online" : a.address || org || undefined, address: online ? undefined : [a.city, a.state].filter(Boolean).join(", ") || undefined,
          organizer: org || undefined, cost: i.isPaid ? "Paid (amount on the listing)" : "Free",
          team, eligibility: eligible.length ? eligible.join(", ") : undefined,
          prizes: cash ? `₹${cash.toLocaleString("en-IN")} in cash prizes (total listed)` : undefined,
          summary: summarize(i.details),
          theme: i.festival && i.festival.title ? `Part of ${clean(i.festival.title, 80)}` : undefined,
          url: i.seo_url || `https://unstop.com/${i.public_url}`,
          sources: [{ title: "Unstop", url: i.seo_url || `https://unstop.com/${i.public_url}` }],
          joy: isJoy || undefined, _src: "Unstop"
        });
      }
      page++;
    } while (page <= last);
  }
  return out;
}

// ---------- Source 2 & 3: event pages with schema.org Event data ----------
async function fromLdPages(listingUrls, prefix, sourceName, budget) {
  const urls = new Set();
  for (const l of listingUrls) {
    try {
      const html = await get(l);
      const found = ldItemListUrls(html, prefix);
      if (found.length) found.forEach((u) => urls.add(u));
      else for (const m of html.matchAll(/href="(\/events\/[a-z0-9-]+)"/g)) urls.add(new URL(m[1], prefix).href);
    } catch (err) { log(`  ${sourceName}: listing ${l} failed: ${err.message}`); }
  }
  const out = [];
  for (const u of [...urls].slice(0, budget)) {
    let html; try { html = await get(u); } catch (err) { log(`  ${sourceName}: ${u} failed: ${err.message}`); continue; }
    for (const ev of ldEvents(html)) {
      const start = day(ev.startDate), end = day(ev.endDate) || start;
      if (!start || (end || start) < TODAY) continue;
      const p = placeText(ev.location);
      const online = p.online || /OnlineEventAttendanceMode/.test(ev.eventAttendanceMode || "");
      const org = Array.isArray(ev.organizer) ? ev.organizer[0]?.name : ev.organizer?.name;
      const text = `${ev.name} ${ev.description || ""} ${org || ""}`;
      const isJoy = /joy university/i.test(text);
      if (!isJoy && (EXCLUDE.test(text) || !TECH.test(`${ev.name} ${ev.description || ""}`))) continue;
      const region = isJoy ? "kanyakumari" : regionFor({ online, state: p.state, city: p.city, text: `${p.venue || ""} ${p.address || ""} ${text}` });
      if (!region) continue;
      const offer = Array.isArray(ev.offers) ? ev.offers[0] : ev.offers;
      const price = offer && offer.price !== undefined && offer.price !== "" ? Number(offer.price) : undefined;
      out.push({
        id: `auto-${slug(sourceName)}-${slug(ev.name)}-${start}`, title: clean(ev.name, 140), kind: kindOf(ev.name),
        start, end, city: online ? "Online" : p.city || undefined, region, mode: online ? "Online" : "In person",
        venue: online ? "Online" : p.venue || undefined, address: online ? undefined : p.address || undefined,
        organizer: org && !/^(eventopia|india ?hackathons|hackathons india)$/i.test(org.trim()) ? org : undefined, cost: price === 0 ? "Free" : Number.isFinite(price) ? `₹${price.toLocaleString("en-IN")}` : undefined,
        summary: clean(ev.description, 300), url: ev.url || u, sources: [{ title: sourceName, url: u }],
        joy: isJoy || undefined, _src: sourceName
      });
    }
  }
  return out;
}

// ---------- Source 4: Joy University campus events ----------
async function joyFeed() {
  const html = await get("https://joyuniversity.edu.in/Latest-Events");
  const items = [];
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  for (const m of html.matchAll(/<a href='(\/Event-Listing\/\d+)'>\s*<span>([\s\S]*?)<\/span><\/a>/g)) {
    const raw = clean(m[2], 300);
    const mm = raw.match(/^(.*?)[:;]\s*([A-Za-z]+)\s+(\d{1,2})(?:\s*(?:-|–|to)\s*(?:[A-Za-z]+\s+)?\d{1,2})?,?\s*(20\d\d)\s*$/);
    let title = raw, date;
    if (mm && MONTHS[mm[2].slice(0, 3).toLowerCase()] !== undefined) {
      title = mm[1].trim();
      const dt = new Date(Date.UTC(+mm[4], MONTHS[mm[2].slice(0, 3).toLowerCase()], +mm[3]));
      date = dt.toISOString().slice(0, 10);
    }
    items.push({ title, date, kind: kindOf(title, "campus"), url: new URL(m[1], "https://joyuniversity.edu.in").href, tech: TECH.test(title) });
  }
  return items;
}

// ---------- Merge ----------
const run = { date: TODAY, sources: {} };
async function trySource(name, fn) {
  try { const r = await fn(); run.sources[name] = { ok: true, found: r.length }; log(`${name}: ${r.length}`); return r; }
  catch (err) { run.sources[name] = { ok: false, error: String(err.message || err).slice(0, 160) }; log(`${name} FAILED: ${err.message}`); return []; }
}

const found = [
  ...(await trySource("Unstop", fromUnstop)),
  ...(await trySource("Eventopia", () => fromLdPages(["https://eventopia.in/events/state/tamil-nadu", "https://eventopia.in/events/state/kerala", "https://eventopia.in/events/state/karnataka"], "https://eventopia.in/event/", "Eventopia", MAX_DETAIL_FETCHES))),
  ...(await trySource("India Hackathons", () => fromLdPages(["https://indiahackathons.com/hackathons/bengaluru", "https://indiahackathons.com/hackathons/chennai"], "https://indiahackathons.com/", "India Hackathons", MAX_DETAIL_FETCHES)))
];
const joyItems = await trySource("Joy University", joyFeed);
{
  const online = found.filter((e) => e.region === "online" && !e.joy).map((e) => ({ e, s: score(e).fit }));
  const keep = new Set([
    ...online.filter((x) => x.e.kind !== "workshop").sort((a, b) => b.s - a.s).slice(0, 25).map((x) => x.e),
    ...online.filter((x) => x.e.kind === "workshop").sort((a, b) => b.s - a.s).slice(0, 12).map((x) => x.e)
  ]);
  for (let i = found.length - 1; i >= 0; i--) if (found[i].region === "online" && !found[i].joy && !keep.has(found[i])) found.splice(i, 1);
}

const path = "data/events.json";
const d = JSON.parse(fs.readFileSync(path, "utf8"));
const keyOf = (e) => `${normTitle(e.title)}|${e.start || ""}`;
const GENERIC = new Set(["hackathon", "hack", "national", "level", "the", "a", "of", "and", "for", "by", "online", "workshop", "event", "edition", "inter", "college", "intercollege", "expo", "challenge", "competition", "summit", "fest"]);
const tokens = (s) => new Set(normTitle(s).split(" ").filter((w) => w && !GENERIC.has(w) && w.length > 1));
// Two events are "near" if any of their known dates are within 4 days (one site may give the start, another the end).
const datesOf = (e) => [e.start, e.end, e.deadline].filter(Boolean).map((s) => Date.parse(s));
function sameEvent(a, b) {
  if (a.url && b.url && a.url === b.url) return true;
  const ta = tokens(a.title), tb = tokens(b.title);
  if (!ta.size || !tb.size) return false;
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  const inter = [...small].filter((w) => big.has(w)).length;
  const da = datesOf(a), db = datesOf(b);
  const close = !da.length || !db.length || da.some((x) => db.some((y) => Math.abs(x - y) <= 4 * 86400000));
  return inter === small.size && close;
}
const humanKeys = new Set(d.events.filter((e) => !e.auto).flatMap((e) => [keyOf(e), normTitle(e.title), e.url].filter(Boolean)));
const byId = new Map(d.events.map((e) => [e.id, e]));
let added = 0, refreshed = 0;
const seen = new Set();
const keptThisRun = [];
const perOrg = {};
const humanEvents = d.events.filter((e) => !e.auto);

// Process events we already have first, so caps keep yesterday's cards instead of swapping them daily.
found.sort((a, b) => (byId.has(b.id) ? 1 : 0) - (byId.has(a.id) ? 1 : 0));
const existingAuto = d.events.filter((e) => e.auto);
for (const raw of found) {
  const { _src, ...e } = raw;
  for (const k of Object.keys(e)) if (e[k] === undefined || e[k] === "") delete e[k];
  if (!e.title) continue;
  const k = keyOf(e);
  if (seen.has(k) || seen.has(e.url) || keptThisRun.some((x) => sameEvent(x, e))) continue; // same event from two sources this run
  seen.add(k); seen.add(e.url);
  if (humanKeys.has(k) || humanKeys.has(normTitle(e.title)) || humanKeys.has(e.url) || humanEvents.some((h) => sameEvent(h, e))) continue; // already covered by a reviewed card
  if (!byId.has(e.id) && existingAuto.some((x) => x.id !== e.id && sameEvent(x, e))) continue; // already listed from another site
  const orgKey = `${e.region === "online" ? "on" : "off"}|${(e.organizer || "").toLowerCase()}`;
  perOrg[orgKey] = (perOrg[orgKey] || 0) + 1;
  if (e.organizer && perOrg[orgKey] > (e.region === "online" ? 2 : 12)) continue; // one organizer can't flood the list
  keptThisRun.push(e);
  Object.assign(e, score(e), { auto: true, verifiedAt: NICE });
  const prev = byId.get(e.id);
  if (prev) { Object.assign(prev, e, { isNew: prev.isNew, added: prev.added }); refreshed++; }
  else { e.isNew = true; e.added = TODAY; d.events.push(e); byId.set(e.id, e); added++; }
}

// Merge duplicates already saved (same event listed on two sites): keep the Unstop/older copy.
{
  const autos = d.events.filter((e) => e.auto);
  const drop = new Set();
  for (let i = 0; i < autos.length; i++) for (let j = i + 1; j < autos.length; j++) {
    const a = autos[i], b = autos[j];
    if (drop.has(a) || drop.has(b) || !sameEvent(a, b)) continue;
    const rank = (e) => (e.id.startsWith("auto-unstop-") ? 0 : 1);
    drop.add(rank(a) <= rank(b) ? b : a);
  }
  if (drop.size) { d.events = d.events.filter((e) => !drop.has(e)); log(`Merged ${drop.size} duplicate(s).`); }
}

// Keep the online list short: best 25 online hackathons/challenges and 12 online workshops overall.
{
  const onl = d.events.filter((e) => e.auto && e.region === "online" && !e.joy);
  const keep = new Set([
    ...onl.filter((e) => e.kind !== "workshop").sort((a, b) => b.fit - a.fit || (a.added || "").localeCompare(b.added || "")).slice(0, 25),
    ...onl.filter((e) => e.kind === "workshop").sort((a, b) => b.fit - a.fit || (a.added || "").localeCompare(b.added || "")).slice(0, 12)
  ]);
  d.events = d.events.filter((e) => !(e.auto && e.region === "online" && !e.joy) || keep.has(e));
}

// Housekeeping: drop events that ended over 14 days ago; drop auto events whose registration closed and that no source still lists.
const cutoff = new Date(Date.parse(TODAY) - 14 * 86400000).toISOString().slice(0, 10);
const liveIds = new Set(found.map((e) => e.id));
const before = d.events.length;
d.events = d.events.filter((e) => {
  const end = e.end || e.start;
  if (end && end < cutoff) return false;
  if (e.auto && !liveIds.has(e.id) && e.deadline && e.deadline < TODAY && !(e.start && e.start >= TODAY)) return false;
  return true;
});
for (const e of d.events) if (e.isNew && e.added && (Date.parse(TODAY) - Date.parse(e.added)) / 86400000 > 3) e.isNew = false;
const removed = before - d.events.length;
d.lastAutoRun = NICE;
if (added) { d.lastRun = NICE; d.added = added; }

run.added = added; run.refreshed = refreshed; run.removed = removed;
log(`Merged: ${added} added, ${refreshed} refreshed, ${removed} removed. Total ${d.events.length}.`);

if (DRY) { log(JSON.stringify(found.slice(0, 5), null, 2)); process.exit(0); }
fs.writeFileSync(path, JSON.stringify(d, null, 2) + "\n");
const joyCut = new Date(Date.parse(TODAY) - 45 * 86400000).toISOString().slice(0, 10);
const joyRecent = joyItems.filter((x) => x.date && x.date >= joyCut).slice(0, 40);
if (joyItems.length) fs.writeFileSync("data/joy.json", JSON.stringify({ updated: NICE, source: "https://joyuniversity.edu.in/Latest-Events", items: joyRecent }, null, 2) + "\n");
fs.writeFileSync("data/auto-run.json", JSON.stringify(run, null, 2) + "\n");
