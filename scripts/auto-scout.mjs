// Event Radar automatic scout. Runs daily on GitHub Actions with no AI involved.
// It reads structured event data from public listing sites (Unstop, Devfolio, Hack2Skill, Luma,
// Knowafest, Eventopia, India Hackathons), keeps tech events Jeevan can join anywhere in India or
// online (near-home ones rank highest, plus anything at Joy University), and merges them
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
const EXCLUDE = /\bfdp\b|faculty development|for faculty|faculty members|women only|only women|girls only|only girls|female only|all-girls|school students only|class (9|10|11|12)|classes 9|high school|medical|nursing|pharma|dental|mba admission|study abroad|quiz\b|valorant|bgmi|free fire|ludo|wwe|minecraft|dance|singing|cultural|case (competition|challenge|study)|marketing|finance|stock|investing|consult|debate|chess|aeromodel|business plan|scholarship test|higher studies|career guidance|admission|\bcivil\b|mechanical|\beee?\b|electrical|chemical engineering|biotech|\bmba\b|\bb\.?\s?arch\b|architecture students|architectural design|trading|beat the market|international conference|short.?term training|\bsttp\b|professional development programme|demo day|procrastination|robo ?race|robowars|multirotor/i;
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
  return { venue: L.name, address: addr || undefined, city: typeof a === "object" ? a.addressLocality : undefined, state: typeof a === "object" ? a.addressRegion : undefined, country: typeof a === "object" ? (typeof a.addressCountry === "object" ? a.addressCountry.name : a.addressCountry) : undefined };
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
  else if (e.region === "india") { s -= 18; why.push(`a long trip${e.city ? ` to ${e.city}` : ""}`); }
  else if (e.region === "tamilnadu" || e.region === "kerala") { s -= 1; why.push("in your state or next door"); }
  else { s -= 4; why.push("needs travel"); }
  if (/^free/i.test(e.cost || "")) { s += 8; why.push("free"); }
  else if (e.cost && /₹|paid/i.test(e.cost)) { s -= 4; why.push("paid"); }
  if (/\bai\b|genai|generative|llm|agent|machine learning|web|app|full.?stack|startup|saas|cloud/i.test(text)) { s += 8; why.push("matches your AI/web/startup interests"); }
  if (/beginner|no prior|no coding|first.?time|all levels|freshers/i.test(text)) { s += 5; why.push("beginner-friendly"); }
  if (e.kind === "hackathon") s += 3;
  if (/webinar|live session|career talk|building your career|still in demand|beyond the (ai )?hype|what should .* learn|inside today|future role|changing landscape|your future in|what is left for/i.test(e.title) || /techbairn|quality thought/i.test(e.organizer || "")) { s -= 25; why.push("a talk or webinar, not hands-on"); }
  if (e.deadline) { const d = (Date.parse(e.deadline) - Date.parse(TODAY)) / 86400000; if (d <= 2) { s -= 8; why.push("registration closes very soon"); } }
  if (e.region === "online") s = Math.min(s, 65); // online events are easy to join but plentiful; keep them below nearby ones
  if (e.region === "india") s = Math.min(s, 48); // far away: only big or very relevant ones are worth the trip
  s = Math.max(5, Math.min(75, Math.round(s))); // auto scores stay at or below 75 so reviewed picks rank above them
  return { fit: s, fitReason: `Auto-scored: ${why.join(", ")}. Details come straight from the listing and haven't been reviewed.` };
}
const regionFor = ({ online, state, city, text, country }) => {
  if (KANYAKUMARI.test(text || "") || KANYAKUMARI.test(city || "")) return "kanyakumari";
  if (online) return "online";
  const st = String(state || "").toLowerCase();
  if (st === "karnataka") return BENGALURU.test(`${city} ${text}`) ? "bangalore" : "india";
  if (REGION_OF_STATE[st]) return REGION_OF_STATE[st];
  if (BENGALURU.test(city || "")) return "bangalore";
  if (/chennai|coimbatore|madurai|trichy|tiruchirappalli|tirunelveli|salem|erode|vellore|thoothukudi|tuticorin|pollachi|sivakasi|karur|thanjavur|hosur/i.test(`${city} ${text}`)) return "tamilnadu";
  if (/kochi|cochin|trivandrum|thiruvananthapuram|kozhikode|calicut|thrissur|kottayam|kollam|ernakulam|palakkad|kannur|alappuzha|kovalam/i.test(`${city} ${text}`)) return "kerala";
  if (st === "keralam") return "kerala";
  // Anywhere else in India: kept as "Rest of India" (ranked lower because of the travel).
  if (country && !/^(india|in)$/i.test(String(country).trim())) return null;
  if (st || city) return "india";
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
          if (type === "workshops" && (online ? (!TECH.test(i.title) || i.isPaid) : !TECH.test(i.title))) continue;
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
async function fromLdPages(listingUrls, prefix, sourceName, budget, linkRe = /href="(\/events\/[a-z0-9-]+)"/g) {
  const urls = new Set();
  for (const l of listingUrls) {
    try {
      const html = await get(l);
      const found = ldItemListUrls(html, prefix);
      if (found.length) found.forEach((u) => urls.add(u));
      else for (const m of html.matchAll(linkRe)) urls.add(new URL(m[1], prefix).href);
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
      const region = isJoy ? "kanyakumari" : regionFor({ online, state: p.state, city: p.city, country: p.country, text: `${p.venue || ""} ${p.address || ""} ${org || ""} ${ev.name}` });
      if (!region) continue;
      const offer = Array.isArray(ev.offers) ? ev.offers[0] : ev.offers;
      const price = offer && offer.price !== undefined && offer.price !== "" ? Number(offer.price) : undefined;
      out.push({
        id: `auto-${slug(sourceName)}-${slug(ev.name)}-${start}`, title: clean(ev.name, 140), kind: kindOf(ev.name),
        start, end, city: online ? "Online" : p.city || undefined, region, mode: online ? "Online" : "In person",
        venue: online ? "Online" : p.venue || undefined, address: online ? undefined : p.address || undefined,
        organizer: org && !/^(eventopia|india ?hackathons|hackathons india|knowafest)$/i.test(org.trim()) ? org : undefined, cost: price === 0 ? "Free" : Number.isFinite(price) ? `₹${price.toLocaleString("en-IN")}` : undefined,
        summary: clean(ev.description, 300), url: ev.url || u, sources: [{ title: sourceName, url: u }],
        joy: isJoy || undefined, _src: sourceName
      });
    }
  }
  return out;
}


// ---------- Source 5: Devfolio (public search API) ----------
async function fromDevfolio() {
  const out = [];
  for (const type of ["application_open", "upcoming"]) {
    const res = await fetch("https://api.devfolio.co/api/search/hackathons", {
      method: "POST", headers: { "user-agent": UA, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ type, from: 0, size: 100 }), signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    for (const h of (j.hits && j.hits.hits) || []) {
      const x = h._source || {}; const st = x.hackathon_setting || {};
      if (!x.name || x.private || st.women_only) continue;
      const deadline = day(st.reg_ends_at), start = day(x.starts_at), end = day(x.ends_at);
      if ((deadline && deadline < TODAY) || (end && end < TODAY)) continue;
      const text = `${x.name} ${x.tagline || ""} ${x.city || ""}`;
      if (EXCLUDE.test(`${x.name} ${x.tagline || ""}`)) continue;
      const region = /joy university/i.test(text) ? "kanyakumari" : regionFor({ online: x.is_online, state: x.state, city: x.city, country: x.country, text: `${x.location || ""} ${x.city || ""}` });
      if (!region) continue;
      const url = `https://${x.slug}.devfolio.co/`;
      const tmax = x.team_size || undefined;
      out.push({
        id: `auto-devfolio-${x.slug}`, title: clean(x.name, 140), kind: "hackathon", start, end, deadline,
        city: x.is_online ? "Online" : x.city || undefined, region, mode: x.is_online ? "Online" : "In person",
        venue: x.is_online ? "Online" : x.location || undefined, address: x.is_online ? undefined : [x.city, x.state].filter(Boolean).join(", ") || undefined,
        team: x.team_min ? (tmax && tmax !== x.team_min ? `${x.team_min}–${tmax}` : tmax ? `${tmax}` : `${x.team_min} or more`) : undefined,
        theme: (x.themes || []).map((t) => t.theme && t.theme.name).filter((n) => n && !/no restrictions/i.test(n)).join(", ") || undefined,
        summary: clean(x.tagline, 200) || summarize(x.desc),
        url, sources: [{ title: "Devfolio", url }], _src: "Devfolio"
      });
    }
  }
  return out;
}

// ---------- Source 6: Hack2Skill (public event list) ----------
async function fromHack2Skill() {
  const j = await get("https://hack2skill.com/api/v1/innovator/public/event/list", { json: true });
  const out = [];
  for (const e of [...((j.data || {}).flagshipEvents || []), ...((j.data || {}).communityEvents || [])]) {
    const t = e.tags || {}; const deadline = day(e.registrationEnd);
    if (!e.title || !deadline || deadline < TODAY || e.status !== "APPROVED") continue;
    if (EXCLUDE.test(e.title)) continue;
    const mode = (t.mode && t.mode.value) || "";
    const url = `https://hack2skill.com/event/${e.eventUrl}`;
    const ts = t.teamSize && !t.teamSize.isHidden ? t.teamSize : null;
    out.push({
      id: `auto-h2s-${slug(e.eventUrl)}`, title: clean(e.title, 140), kind: kindOf(e.title, "hackathon"), deadline,
      region: mode === "IN_PERSON" ? "india" : "online", city: mode === "IN_PERSON" ? undefined : "Online",
      mode: mode === "VIRTUAL" ? "Online" : mode === "HYBRID" ? "Hybrid (online rounds, in-person finale)" : "In person (city on the event page)",
      venue: mode === "VIRTUAL" ? "Online" : undefined, organizer: "Hack2Skill",
      cost: t.ticket && t.ticket.value === "FREE" ? "Free" : t.ticket && t.ticket.value === "PAID" ? "Paid (amount on the listing)" : undefined,
      team: ts ? (ts.min === ts.max ? `${ts.min}` : `${ts.min}–${ts.max}`) : undefined,
      url, sources: [{ title: "Hack2Skill", url }], _src: "Hack2Skill"
    });
  }
  return out;
}

// ---------- Source 7: Luma (public discovery API, by city) ----------
const LUMA_CITIES = [
  ["Bengaluru", 12.97, 77.59], ["Chennai", 13.08, 80.27], ["Kochi", 9.98, 76.28], ["Thiruvananthapuram", 8.52, 76.94],
  ["Coimbatore", 11.02, 76.96], ["Madurai", 9.93, 78.12], ["Hyderabad", 17.39, 78.49], ["Mumbai", 19.08, 72.88],
  ["Pune", 18.52, 73.86], ["Delhi", 28.61, 77.21]
];
async function fromLuma() {
  const out = []; const seenIds = new Set();
  for (const [name, lat, lng] of LUMA_CITIES) {
    let j; try { j = await get(`https://api.lu.ma/discover/get-paginated-events?pagination_limit=50&latitude=${lat}&longitude=${lng}`, { json: true }); }
    catch (err) { log(`  Luma ${name} failed: ${err.message}`); continue; }
    for (const x of j.entries || []) {
      const ev = x.event || {}; if (!ev.name || seenIds.has(ev.api_id)) continue; seenIds.add(ev.api_id);
      const g = ev.geo_address_info || {}; const online = ev.location_type === "online";
      const host = (x.hosts || [])[0]?.name || (x.calendar && x.calendar.name);
      const text = `${ev.name} ${host || ""}`;
      if (!TECH.test(ev.name) || EXCLUDE.test(text) || /women|founder|investor|ceo|cxo|leadership|networking|mixer|coffee|happy hour|party|run club|marketers?|sales|gtm|legal|wealth|crypto trading|trading/i.test(ev.name)) continue;
      const start = day(new Date(Date.parse(ev.start_at) + 5.5 * 3600000).toISOString());
      const end = ev.end_at ? day(new Date(Date.parse(ev.end_at) + 5.5 * 3600000).toISOString()) : start;
      if (!start || end < TODAY) continue;
      if (g.country_code && g.country_code !== "IN") continue;
      const region = regionFor({ online, state: g.region, city: g.city, country: g.country, text: `${g.city || ""} ${g.city_state || ""}` });
      if (!region) continue;
      const ti = x.ticket_info || {};
      const url = `https://luma.com/${ev.url}`;
      out.push({
        id: `auto-luma-${ev.api_id}`, title: clean(ev.name, 140), kind: kindOf(ev.name, "meetup"), start, end,
        city: online ? "Online" : g.city || undefined, region, mode: online ? "Online" : "In person",
        venue: online ? "Online" : undefined, address: online ? undefined : [g.sublocality, g.city_state].filter(Boolean).join(", ") || undefined,
        organizer: host || undefined, cost: ti.is_free ? "Free" : ti.price ? `₹${Math.round(ti.price.cents / 100).toLocaleString("en-IN")}` : undefined,
        eligibility: ti.require_approval ? "Registration needs the host's approval" : undefined,
        url, sources: [{ title: "Luma", url }], _src: "Luma"
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
  ...(await trySource("Devfolio", fromDevfolio)),
  ...(await trySource("Hack2Skill", fromHack2Skill)),
  ...(await trySource("Luma", fromLuma)),
  ...(await trySource("Eventopia", () => fromLdPages(["tamil-nadu", "kerala", "karnataka", "telangana", "andhra-pradesh", "maharashtra", "delhi"].map((s) => `https://eventopia.in/events/state/${s}`), "https://eventopia.in/event/", "Eventopia", 140))),
  ...(await trySource("Knowafest", () => fromLdPages(["categories/hackathons", "categories/workshops", "categories/symposiums", "categories/technical-events", "cities/chennai", "cities/coimbatore", "cities/madurai", "cities/nagercoil", "cities/tirunelveli", "cities/trivandrum", "cities/kochi", "cities/bangalore"].map((s) => `https://www.knowafest.com/${s}`), "https://www.knowafest.com/event/", "Knowafest", 90, /href="https:\/\/www\.knowafest\.com(\/event\/[a-z0-9-]+)"/g))),
  ...(await trySource("India Hackathons", () => fromLdPages(["bengaluru", "chennai", "hyderabad", "pune", "mumbai"].map((c) => `https://indiahackathons.com/hackathons/${c}`), "https://indiahackathons.com/", "India Hackathons", MAX_DETAIL_FETCHES)))
];
const joyItems = await trySource("Joy University", joyFeed);
{
  const online = found.filter((e) => e.region === "online" && !e.joy).map((e) => ({ e, s: score(e).fit }));
  const keep = new Set([
    ...online.filter((x) => x.e.kind !== "workshop").sort((a, b) => b.s - a.s).slice(0, 30).map((x) => x.e),
    ...online.filter((x) => x.e.kind === "workshop").sort((a, b) => b.s - a.s).slice(0, 20).map((x) => x.e)
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
const idsBefore = new Set(d.events.map((e) => e.id));
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
  if ((d.removed || []).includes(e.id)) continue; // removed by a reviewer: don't bring it back
  const k = keyOf(e);
  if (seen.has(k) || seen.has(e.url) || keptThisRun.some((x) => sameEvent(x, e))) continue; // same event from two sources this run
  seen.add(k); seen.add(e.url);
  if (humanKeys.has(k) || humanKeys.has(normTitle(e.title)) || humanKeys.has(e.url) || humanEvents.some((h) => sameEvent(h, e))) continue; // already covered by a reviewed card
  if (!byId.has(e.id) && existingAuto.some((x) => x.id !== e.id && sameEvent(x, e))) continue; // already listed from another site
  const orgKey = `${e.region === "online" ? "on" : e.region === "india" ? "far" : "off"}|${(e.organizer || "").toLowerCase()}`;
  perOrg[orgKey] = (perOrg[orgKey] || 0) + 1;
  if (e.organizer && perOrg[orgKey] > (e.region === "online" ? 2 : e.region === "india" ? 3 : 12)) continue; // one organizer can't flood the list
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

// Keep the online list short: best 30 online hackathons/challenges and 20 online workshops overall.
// Keep "Rest of India" (far away) to the best 50 hackathons/challenges and 15 workshops/meetups.
{
  const onl = d.events.filter((e) => e.auto && e.region === "online" && !e.joy);
  const keep = new Set([
    ...onl.filter((e) => e.kind !== "workshop").sort((a, b) => b.fit - a.fit || (a.added || "").localeCompare(b.added || "")).slice(0, 30),
    ...onl.filter((e) => e.kind === "workshop").sort((a, b) => b.fit - a.fit || (a.added || "").localeCompare(b.added || "")).slice(0, 20)
  ]);
  d.events = d.events.filter((e) => !(e.auto && e.region === "online" && !e.joy) || keep.has(e));
  const far = d.events.filter((e) => e.auto && e.region === "india");
  const big = (e) => (e.kind === "hackathon" || e.kind === "competition" ? 1 : 0);
  const keepFar = new Set([
    ...far.filter(big).sort((a, b) => b.fit - a.fit || (a.added || "").localeCompare(b.added || "")).slice(0, 50),
    ...far.filter((e) => !big(e)).sort((a, b) => b.fit - a.fit || (a.added || "").localeCompare(b.added || "")).slice(0, 15)
  ]);
  d.events = d.events.filter((e) => !(e.auto && e.region === "india") || keepFar.has(e));
}

// Housekeeping: drop events that ended over 14 days ago; drop auto events whose registration closed and that no source still lists.
const cutoff = new Date(Date.parse(TODAY) - 14 * 86400000).toISOString().slice(0, 10);
const liveIds = new Set(found.map((e) => e.id));
const before = d.events.length;
d.events = d.events.filter((e) => {
  const end = e.end || e.start;
  if (end && end < cutoff) return false;
  if (e.auto && !liveIds.has(e.id) && e.deadline && e.deadline < TODAY && !(e.start && e.start >= TODAY)) return false;
  // Auto cards added before a filter was tightened: drop them once they fail it.
  if (e.auto && !e.joy && EXCLUDE.test(`${e.title} ${e.organizer || ""}`)) return false;
  return true;
});
for (const e of d.events) if (e.isNew && e.added && (Date.parse(TODAY) - Date.parse(e.added)) / 86400000 > 3) e.isNew = false;
const removed = before - d.events.length;
// Count only new cards that survived the online cap and housekeeping.
added = d.events.filter((e) => e.auto && e.added === TODAY && !idsBefore.has(e.id)).length;
d.lastAutoRun = NICE;
if (added) { d.lastRun = NICE; d.added = added; }

run.added = added; run.refreshed = refreshed; run.removed = removed;
log(`Merged: ${added} added, ${refreshed} refreshed, ${removed} removed. Total ${d.events.length}.`);

if (DRY) {
  const by = {}; for (const e of d.events) if (e.auto && e.added === TODAY) { const k = `${e.region}|${e.sources?.[0]?.title}`; by[k] = (by[k] || 0) + 1; }
  log("New by region|source:", JSON.stringify(by, null, 1));
  if (process.env.DRY_OUT) fs.writeFileSync(process.env.DRY_OUT, JSON.stringify(d.events.filter((e) => e.auto && e.added === TODAY), null, 1));
  process.exit(0);
}
fs.writeFileSync(path, JSON.stringify(d, null, 2) + "\n");
const joyCut = new Date(Date.parse(TODAY) - 45 * 86400000).toISOString().slice(0, 10);
const joyRecent = joyItems.filter((x) => x.date && x.date >= joyCut).slice(0, 40);
if (joyItems.length) fs.writeFileSync("data/joy.json", JSON.stringify({ updated: NICE, source: "https://joyuniversity.edu.in/Latest-Events", items: joyRecent }, null, 2) + "\n");
fs.writeFileSync("data/auto-run.json", JSON.stringify(run, null, 2) + "\n");
