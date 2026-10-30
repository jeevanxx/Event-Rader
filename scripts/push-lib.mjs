// Shared helpers for Event Radar's notification workflows.
import crypto from "node:crypto";
import webpush from "web-push";

const { GITHUB_TOKEN, GITHUB_REPOSITORY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, SUB_PRIVATE_KEY } = process.env;
export const OWNER = (GITHUB_REPOSITORY || "").split("/")[0];
export const LABEL = "push-subscription";
export const APP_URL = `https://${OWNER}.github.io/${(GITHUB_REPOSITORY || "").split("/")[1]}/`;

export function setupPush() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SUB_PRIVATE_KEY) throw new Error("Missing VAPID or subscription key secrets.");
  webpush.setVapidDetails("mailto:noreply@github.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export async function gh(path, opts = {}) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}${path}`, {
    ...opts,
    headers: {
      authorization: `Bearer ${GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(opts.body ? { "content-type": "application/json" } : {}),
      ...(opts.headers || {})
    }
  });
  if (!res.ok) throw new Error(`GitHub ${opts.method || "GET"} ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// The app encrypts its push address with our RSA public key so it never sits in a public issue as plain text.
export function decryptCode(text) {
  const m = String(text || "").match(/ER1\.([A-Za-z0-9+/=]+)/);
  if (!m) throw new Error("No subscription code found.");
  const env = JSON.parse(Buffer.from(m[1], "base64").toString("utf8"));
  const key = crypto.privateDecrypt(
    { key: SUB_PRIVATE_KEY, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(env.k, "base64")
  );
  const data = Buffer.from(env.c, "base64");
  const tag = data.subarray(data.length - 16);
  const body = data.subarray(0, data.length - 16);
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(env.iv, "base64"));
  d.setAuthTag(tag);
  const sub = JSON.parse(Buffer.concat([d.update(body), d.final()]).toString("utf8"));
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) throw new Error("Subscription is incomplete.");
  return sub;
}

export async function listSubscriptions() {
  const issues = await gh(`/issues?state=open&labels=${LABEL}&per_page=100`);
  const subs = [];
  for (const issue of issues) {
    if (issue.pull_request || !issue.user || issue.user.login !== OWNER) continue;
    try { subs.push({ issue, sub: decryptCode(issue.body) }); }
    catch (err) { console.log(`Skipping issue #${issue.number}: ${err.message}`); }
  }
  return subs;
}

// Sends one notification. Returns "ok", "gone" (device unsubscribed) or "error".
export async function send(sub, payload) {
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: "normal" });
    return "ok";
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) return "gone";
    console.log(`Push failed (${err.statusCode || "?"}): ${err.body || err.message}`);
    return "error";
  }
}

export async function retire(issue, reason) {
  await gh(`/issues/${issue.number}/comments`, { method: "POST", body: JSON.stringify({ body: reason }) });
  await gh(`/issues/${issue.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
}
