// Event Radar service worker: offline shell, fresh event data, push notifications.
const VERSION = "v1";
const SHELL = `radar-shell-${VERSION}`;
const DATA = "radar-data";
const SHELL_FILES = [
  "./",
  "index.html",
  "app.js",
  "styles.css",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/badge-96.png",
  "icons/favicon-64.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("radar-shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // Event data: always try the network first so the list is fresh; fall back to the last copy offline.
  if (url.pathname.endsWith("/data/events.json")) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then((res) => {
          const copy = res.clone();
          caches.open(DATA).then((c) => c.put("data/events.json", copy));
          return res;
        })
        .catch(() => caches.open(DATA).then((c) => c.match("data/events.json")))
    );
    return;
  }

  // App shell: cache first, refresh in the background.
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      const net = fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { body: e.data ? e.data.text() : "" }; }
  const title = data.title || "Event Radar";
  e.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Your events were updated.",
      icon: "icons/icon-192.png",
      badge: "icons/badge-96.png",
      tag: data.tag || "radar-update",
      renotify: true,
      data: { url: data.url || "./" }
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL(e.notification.data && e.notification.data.url ? e.notification.data.url : "./", self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope) && "focus" in c) { c.navigate(target); return c.focus(); }
      }
      return self.clients.openWindow(target);
    })
  );
});
