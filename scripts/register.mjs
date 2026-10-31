// Registers devices for alerts. Runs when a "push-subscribe" issue is opened, and also on demand / on code
// changes to pick up any requests that are still waiting (open, unlabeled push-subscribe issues).
import fs from "node:fs";
import { setupPush, gh, decryptCode, send, LABEL, OWNER, APP_URL } from "./push-lib.mjs";

const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
const isSubIssue = (i) => i && !i.pull_request && /^push-subscribe/i.test(i.title || "");
const hasLabel = (i) => (i.labels || []).some((l) => (l.name || l) === LABEL);

const reply = (n, text) => gh(`/issues/${n}/comments`, { method: "POST", body: JSON.stringify({ body: text }) });
const close = (n) => gh(`/issues/${n}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });

// Which requests to handle this run.
let pending;
if (event.issue) {
  pending = isSubIssue(event.issue) ? [event.issue] : [];
} else {
  const open = await gh(`/issues?state=open&per_page=100`);
  pending = open.filter((i) => isSubIssue(i) && !hasLabel(i));
}
if (!pending.length) { console.log("No device requests waiting."); process.exit(0); }

setupPush();

// Newest first, so if the same device asked twice we keep the latest request.
pending.sort((a, b) => b.number - a.number);
const handled = new Set();

for (const issue of pending) {
  console.log(`Request #${issue.number}: ${issue.title}`);
  if (issue.user.login !== OWNER) {
    await reply(issue.number, "Only the owner of this app can turn on notifications here.");
    await close(issue.number);
    continue;
  }
  let sub;
  try { sub = decryptCode(issue.body); }
  catch (err) {
    await reply(issue.number, `I couldn't read the device code (${err.message}). Open Event Radar on the device and tap **Turn on alerts** again.`);
    await close(issue.number);
    continue;
  }
  if (handled.has(sub.endpoint)) {
    await reply(issue.number, "This device already has a newer request, so I've closed this one.");
    await close(issue.number);
    continue;
  }
  handled.add(sub.endpoint);

  // One active subscription per device: retire older labeled issues with the same push address.
  const active = await gh(`/issues?state=open&labels=${LABEL}&per_page=100`);
  for (const other of active) {
    if (other.number === issue.number || other.user.login !== OWNER) continue;
    try { if (decryptCode(other.body).endpoint === sub.endpoint) await close(other.number); } catch (_) {}
  }

  const result = await send(sub, {
    title: "Event Radar alerts are on",
    body: "You'll hear about new events, changed dates and closing registrations every morning.",
    url: APP_URL,
    tag: "radar-welcome"
  });
  console.log(`  test alert: ${result}`);

  if (result === "ok") {
    await gh(`/issues/${issue.number}/labels`, { method: "POST", body: JSON.stringify({ labels: [LABEL] }) });
    await reply(issue.number, "Notifications are on for this device. A test alert was just sent. Keep this issue open; closing it turns alerts off for this device.");
  } else {
    await reply(issue.number, "The test alert couldn't be delivered. Open Event Radar on the device and tap **Turn on alerts** again.");
    await close(issue.number);
  }
}
