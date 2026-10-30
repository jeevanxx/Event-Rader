// Runs when data/events.json changes: works out what's new or changed and pushes one summary alert to every device.
import fs from "node:fs";
import { execSync } from "node:child_process";
import { setupPush, listSubscriptions, send, retire, APP_URL } from "./push-lib.mjs";

const read = (s) => { try { return JSON.parse(s); } catch (_) { return null; } };
const cur = read(fs.readFileSync("data/events.json", "utf8")) || { events: [] };
let prev = { events: [] };
const before = process.env.BEFORE_SHA;
if (before && !/^0+$/.test(before)) {
  try { prev = read(execSync(`git show ${before}:data/events.json`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })) || prev; }
  catch (_) { console.log("No previous events.json; treating everything as new."); }
}

// Today's date in India.
const todayIST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const dayDiff = (s) => (s ? Math.round((Date.parse(s) - Date.parse(todayIST)) / 86400000) : null);
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (s) => { if (!s) return "date TBA"; const [, m, d] = s.split("-").map(Number); return `${d} ${MONTHS[m - 1]}`; };
const upcoming = (e) => { const end = e.end || e.start; return !end || end >= todayIST; };

const prevById = new Map((prev.events || []).map((e) => [e.id, e]));
const events = (cur.events || []).filter(upcoming);

const added = events.filter((e) => !prevById.has(e.id));
const changes = [];
for (const e of events) {
  const p = prevById.get(e.id);
  if (!p) continue;
  const bits = [];
  if (p.start !== e.start) bits.push(e.start ? `now on ${fmt(e.start)}` : "date removed");
  if (p.deadline !== e.deadline && e.deadline) bits.push(`register by ${fmt(e.deadline)}`);
  if (p.venue !== e.venue && e.venue) bits.push(`venue: ${e.venue}`);
  if (p.warning && !e.warning) bits.push("details confirmed");
  else if (e.warning && e.warning !== p.warning && /closed|cancel|postpon/i.test(e.warning)) bits.push(e.warning.split(".")[0]);
  if (bits.length) changes.push(`${e.title}: ${bits.join(", ")}`);
}
const closing = events.filter((e) => { const n = dayDiff(e.deadline); return n !== null && n >= 0 && n <= 3; });
const top = [...events].filter((e) => typeof e.fit === "number" && !(e.deadline && dayDiff(e.deadline) < 0)).sort((a, b) => b.fit - a.fit)[0];

const lines = [];
for (const e of added.slice(0, 3)) lines.push(`New: ${e.title} · ${fmt(e.start)} · ${e.city || ""}${typeof e.fit === "number" ? ` · fit ${e.fit}` : ""}`);
if (added.length > 3) lines.push(`+${added.length - 3} more new events`);
for (const c of changes.slice(0, 3)) lines.push(`Update: ${c}`);
for (const e of closing.slice(0, 2)) {
  const n = dayDiff(e.deadline);
  lines.push(`Closing ${n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`}: ${e.title}`);
}

let title;
if (added.length || changes.length) {
  const parts = [];
  if (added.length) parts.push(`${added.length} new`);
  if (changes.length) parts.push(`${changes.length} update${changes.length > 1 ? "s" : ""}`);
  title = `Event Radar: ${parts.join(", ")}`;
} else if (closing.length) {
  title = "Event Radar: registration closing soon";
} else {
  title = "Event Radar: no changes today";
}
if (!lines.length && top) lines.push(`Top pick: ${top.title} · ${fmt(top.start)} · fit ${top.fit}`);
if (!lines.length) lines.push("Nothing new yet. The daily check runs again tomorrow.");

const body = lines.join("\n");
const target = added[0] || (closing[0]) || null;
const payload = { title, body, url: target ? `${APP_URL}#ev-${target.id}` : APP_URL, tag: "radar-daily" };
console.log(JSON.stringify(payload, null, 2));

if (process.env.DRY_RUN) process.exit(0);
setupPush();
const subs = await listSubscriptions();
console.log(`Sending to ${subs.length} device(s).`);
for (const { issue, sub } of subs) {
  const r = await send(sub, payload);
  console.log(`#${issue.number}: ${r}`);
  if (r === "gone") await retire(issue, "This device stopped accepting notifications (it was unsubscribed or the app was removed), so I've turned alerts off for it. Tap **Turn on alerts** in the app to turn them back on.");
}
