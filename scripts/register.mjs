// Runs when a "push-subscribe" issue is opened: validates the device code, sends a test alert, labels the issue.
import fs from "node:fs";
import { setupPush, gh, decryptCode, send, LABEL, OWNER, APP_URL } from "./push-lib.mjs";

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const issue = event.issue;

async function reply(text) {
  await gh(`/issues/${issue.number}/comments`, { method: "POST", body: JSON.stringify({ body: text }) });
}

if (!issue || !/^push-subscribe/i.test(issue.title || "")) {
  console.log("Not a subscription issue.");
  process.exit(0);
}
if (issue.user.login !== OWNER) {
  await reply("Only the owner of this app can turn on notifications here.");
  await gh(`/issues/${issue.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
  process.exit(0);
}

setupPush();
let sub;
try {
  sub = decryptCode(issue.body);
} catch (err) {
  await reply(`I couldn't read the device code (${err.message}). Open Event Radar on the device and tap **Turn on alerts** again.`);
  await gh(`/issues/${issue.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
  process.exit(0);
}

// One open subscription per device: retire older issues with the same push address.
const open = await gh(`/issues?state=open&labels=${LABEL}&per_page=100`);
for (const other of open) {
  if (other.number === issue.number || other.user.login !== OWNER) continue;
  try {
    if (decryptCode(other.body).endpoint === sub.endpoint) {
      await gh(`/issues/${other.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
    }
  } catch (_) {}
}

const result = await send(sub, {
  title: "Event Radar alerts are on",
  body: "You'll hear about new events, changed dates and closing registrations every morning.",
  url: APP_URL,
  tag: "radar-welcome"
});

if (result === "ok") {
  await gh(`/issues/${issue.number}/labels`, { method: "POST", body: JSON.stringify({ labels: [LABEL] }) });
  await reply("Notifications are on for this device. A test alert was just sent. Keep this issue open; closing it turns alerts off for this device.");
} else {
  await reply("The test alert couldn't be delivered. Open Event Radar on the device and tap **Turn on alerts** again.");
  await gh(`/issues/${issue.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
}
