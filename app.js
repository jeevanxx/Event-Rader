(() => {
  "use strict";

  // ---- Config -------------------------------------------------------------
  const REPO = "jeevanxx/Event-Rader";
  const VAPID_PUBLIC_KEY = "BOVqmwOmYWGHcrA42Y3-Bww5A1QiQzLji_gXJ3dIgZK-2iBRCxJU9eoHb200QO-QDHo5E_KMsv-SnqxqKaP9-yc";
  // Public half of the key that encrypts this device's push address before it goes into a GitHub issue.
  const SUB_PUBLIC_SPKI = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlov9fRBCD2BZVZxHcxoumwia0ubxjAk0hg3m/ovIZ/A7ZnrhrCmVQgZHNr5cMoEIaaNcg9HFD58LedfArRP8ce5/7t2z0lAOt8QydgRC6azfcphy2HnBXvf5R6tRPaUZjLYs/9gkm/P6uBLu7IEdE4POSwNTCCKCG9p2co9Kud9F81OxVzJ3v9vbAnScULVZl5Jz4r1MeTCjr0teAQ9AC3ZHMmjaT+i8qAkATi4MzJRmqWj4UNsNP/EdoN4C4XhlVDwTmjYK6sbL5xKfNWdgzk1jkEUs+luqsvTLSQEaAWaxWQPT9lie2ivYK6pEfR0TLFSwe+CMu/mImYQISKs/YwIDAQAB";

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const KIND = { hackathon:"Hackathon", workshop:"Workshop", conference:"Conference", meetup:"Meetup", competition:"Challenge" };
  const REGION = { kanyakumari:"Kanyakumari", tamilnadu:"Tamil Nadu", kerala:"Kerala", bangalore:"Bengaluru", online:"Online" };
  const $ = (id) => document.getElementById(id);

  // ---- Local state (per device) ------------------------------------------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  };
  let statuses = store.get("radar-status", {});
  let { view = "upcoming", region = "all" } = store.get("radar-filters", {});
  let events = [];

  // ---- Helpers -------------------------------------------------------------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (_) { return ""; } };
  const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const parse = (s) => { if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const days = (s) => { const d = parse(s); return d ? Math.round((d - today()) / 86400000) : null; };
  const fmt = (s) => { const d = parse(s); return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : s; };
  const isPast = (e) => { const end = parse(e.end) || parse(e.start); return end ? end < today() : false; };
  const statusOf = (e) => statuses[e.id] || "new";

  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200);
  }

  // ---- Rendering ----------------------------------------------------------
  function bucket(e) {
    if (isPast(e)) return "past";
    const st = statusOf(e);
    return st === "new" ? "upcoming" : st;
  }
  function inView(e) {
    const b = bucket(e);
    if (view === "upcoming") return b !== "past" && b !== "skipped";
    return b === view;
  }
  function deadlineChip(e) {
    if (!e.deadline) return "";
    const n = days(e.deadline);
    if (n === null) return `<span class="dl calm">Register by ${esc(e.deadline)}</span>`;
    if (n < 0) return `<span class="dl closed">Registration closed</span>`;
    const cls = n <= 3 ? "hot" : n <= 10 ? "warn" : "calm";
    const when = n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
    return `<span class="dl ${cls}">Register by ${fmt(e.deadline)} · ${when}</span>`;
  }
  function stub(e) {
    const s = parse(e.start);
    if (!s) return `<div class="stub tba"><span class="mo">Date</span><span class="d">TBA</span></div>`;
    const en = parse(e.end);
    const range = en && en - s > 0 ? `<span class="to">to ${en.getDate()} ${MONTHS[en.getMonth()]}</span>` : "";
    return `<div class="stub"><span class="mo">${MONTHS[s.getMonth()]} ${s.getFullYear()}</span><span class="d">${s.getDate()}</span>${range}</div>`;
  }
  function facts(e) {
    const rows = [["Cost", e.cost], ["Team size", e.team], ["Who can join", e.eligibility], ["Prizes", e.prizes], ["Topic", e.theme], ["Perks", e.perks], ["Bring", e.bring]].filter((r) => r[1]);
    if (!rows.length) return "";
    return `<dl class="facts">${rows.map((r) => `<div><dt>${r[0]}</dt><dd>${esc(r[1])}</dd></div>`).join("")}</dl>`;
  }
  function sources(e) {
    const list = Array.isArray(e.sources) ? e.sources.map((s) => ({ u: safeUrl(s.url), t: s.title || "source" })).filter((s) => s.u) : [];
    if (!list.length && !e.verifiedAt) return "";
    return `<p class="src">${e.verifiedAt ? `Checked ${esc(e.verifiedAt)}` : ""}${list.length ? ` · Sources: ${list.map((s) => `<a href="${esc(s.u)}" target="_blank" rel="noopener">${esc(s.t)}</a>`).join(", ")}` : ""}</p>`;
  }
  function card(e) {
    const st = statusOf(e);
    const url = safeUrl(e.url);
    const btn = (val, label) => `<button class="act ${st === val ? "on" : ""}" data-id="${esc(e.id)}" data-set="${val}">${label}</button>`;
    return `<article class="pass" id="ev-${esc(e.id)}">
      ${stub(e)}
      <div class="body">
        <div class="top">
          <h2 class="title">${esc(e.title)}</h2>
          <span class="tag">${esc(KIND[e.kind] || e.kind || "Event")}</span>
          ${e.isNew && st === "new" ? '<span class="tag new">New</span>' : ""}
        </div>
        <div class="place">
          <span class="v">${esc(e.venue || e.city || REGION[e.region] || "Venue not announced")}${e.mode ? ` · ${esc(e.mode)}` : ""}</span>
          ${e.address ? `<span class="o">${esc(e.address)}</span>` : ""}
          ${e.organizer ? `<span class="o">Run by ${esc(e.organizer)}</span>` : ""}
        </div>
        ${deadlineChip(e)}
        ${e.warning ? `<p class="warnbox">${esc(e.warning)}</p>` : ""}
        ${e.summary ? `<p class="summary">${esc(e.summary)}</p>` : ""}
        ${facts(e)}
        ${typeof e.fit === "number" ? `<div class="fit"><span class="score">${e.fit}<small>/100</small></span><span>${esc(e.fitReason || "")}</span></div>` : ""}
        ${sources(e)}
        <div class="actions">
          ${btn("interested", "Interested")}
          ${btn("registered", "Registered")}
          ${btn("skipped", "Skip")}
          ${url ? `<a class="link" href="${esc(url)}" target="_blank" rel="noopener">Event page ↗</a>` : ""}
        </div>
      </div>
    </article>`;
  }
  function renderPicks() {
    const open = events.filter((e) => !isPast(e) && statusOf(e) !== "skipped" && typeof e.fit === "number" && !(e.deadline && days(e.deadline) < 0));
    open.sort((a, b) => b.fit - a.fit);
    const top = open.slice(0, 3);
    $("picks").hidden = !top.length;
    $("pickList").innerHTML = top.map((e) => `<li><b>${esc(e.title)}</b> · ${e.start ? fmt(e.start) : "date TBA"} · ${esc(e.city || "")}<span class="why">${esc(e.fitReason || "")}</span></li>`).join("");
  }
  const sortKey = (e) => { const d = parse(e.start); return d ? d.getTime() : 8.64e15; };

  function render() {
    document.querySelectorAll("#views .chip").forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === view));
    document.querySelectorAll("#regions .chip").forEach((b) => b.setAttribute("aria-pressed", b.dataset.region === region));
    renderPicks();
    const inRegion = events.filter((e) => region === "all" || e.region === region);
    const counts = { upcoming: 0, interested: 0, registered: 0, skipped: 0, past: 0 };
    inRegion.forEach((e) => { const b = bucket(e); counts[b]++; if (b === "interested" || b === "registered") counts.upcoming++; });
    Object.keys(counts).forEach((k) => { $("n-" + k).textContent = counts[k] || ""; });
    const list = inRegion.filter(inView).sort((a, b) => view === "past" ? sortKey(b) - sortKey(a) : sortKey(a) - sortKey(b));
    if (!list.length) {
      $("list").innerHTML = `<div class="empty"><strong>${events.length ? "Nothing here for this filter yet." : "No events yet."}</strong>The daily check adds new hackathons, workshops and meetups as it finds them.</div>`;
      return;
    }
    $("list").innerHTML = list.map(card).join("");
    if (location.hash.startsWith("#ev-")) { const el = document.querySelector(location.hash); if (el) el.scrollIntoView({ block: "start" }); }
  }

  document.addEventListener("click", (ev) => {
    const v = ev.target.closest("[data-view]"); if (v) { view = v.dataset.view; store.set("radar-filters", { view, region }); render(); return; }
    const r = ev.target.closest("[data-region]"); if (r) { region = r.dataset.region; store.set("radar-filters", { view, region }); render(); return; }
    const a = ev.target.closest("[data-set]");
    if (a) {
      const id = a.dataset.id, next = statuses[id] === a.dataset.set ? "new" : a.dataset.set;
      if (next === "new") delete statuses[id]; else statuses[id] = next;
      store.set("radar-status", statuses); render();
    }
  });

  async function load() {
    try {
      const res = await fetch("data/events.json?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      events = Array.isArray(data.events) ? data.events : [];
      let line = data.lastRun ? `Last checked ${data.lastRun}${typeof data.added === "number" ? ` · ${data.added} new` : ""}` : "";
      try {
        const cov = await (await fetch("data/coverage.json?t=" + Date.now(), { cache: "no-store" })).json();
        const secs = Object.values(cov.sections || {});
        if (secs.length) line += ` · ${secs.filter((s) => s.checked).length} of ${secs.length} source groups checked`;
        if (cov.notes) $("scout").title = cov.notes;
      } catch (_) {}
      if (line) $("scout").textContent = line;
      $("status").textContent = navigator.onLine ? "" : "You're offline. Showing the last saved list.";
      render();
    } catch (err) {
      $("list").innerHTML = '<div class="empty"><strong>Couldn\'t load events.</strong>Check your connection and pull to refresh.</div>';
    }
  }

  // ---- Install ------------------------------------------------------------
  let installEvent = null;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvent = e; $("installBtn").hidden = false; });
  window.addEventListener("appinstalled", () => { $("installBtn").hidden = true; toast("Event Radar installed"); });
  $("installBtn").addEventListener("click", async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice.catch(() => null);
    installEvent = null; $("installBtn").hidden = true;
  });
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS && !standalone) $("iosHint").hidden = false;

  // ---- Push notifications -------------------------------------------------
  const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const b64uToBytes = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
  const bytesToB64 = (buf) => { const a = new Uint8Array(buf); let s = ""; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };

  async function encryptSubscription(sub) {
    const rsa = await crypto.subtle.importKey("spki", Uint8Array.from(atob(SUB_PUBLIC_SPKI), (ch) => ch.charCodeAt(0)), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
    const aes = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(sub));
    const c = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, plain);
    const k = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, rsa, await crypto.subtle.exportKey("raw", aes));
    return "ER1." + btoa(JSON.stringify({ k: bytesToB64(k), iv: bytesToB64(iv), c: bytesToB64(c) }));
  }

  function deviceName() {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return "Android phone";
    if (/iphone|ipad/i.test(ua)) return "iPhone";
    if (/windows/i.test(ua)) return "Windows laptop";
    if (/mac os/i.test(ua)) return "Mac";
    if (/linux/i.test(ua)) return "Linux laptop";
    return "device";
  }

  function issueUrl(code, name) {
    const title = `push-subscribe: ${name}`;
    const body = `Turn on Event Radar notifications for this device. Just press **Submit new issue**.\n\n<!-- radar-subscription -->\n\`\`\`\n${code}\n\`\`\`\n`;
    return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  }

  function showPushPanel(html, actionsHtml) {
    $("pushPanel").hidden = false;
    $("pushText").innerHTML = html;
    $("pushActions").innerHTML = actionsHtml || "";
  }

  async function refreshPushUi() {
    if (!pushSupported) {
      if (isIOS && !standalone) return; // iOS hint already explains.
      showPushPanel("This browser can't receive notifications. Use Chrome or Edge, or install the app first.");
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const registered = store.get("radar-push-registered", null);
    if (Notification.permission === "denied") {
      $("notifyBtn").hidden = true;
      showPushPanel("<strong>Notifications are blocked.</strong> Allow them for this site in your browser's site settings, then reopen the app.");
      return;
    }
    if (sub && registered && registered.endpoint === sub.endpoint && registered.confirmed) {
      $("notifyBtn").hidden = true; $("pushPanel").hidden = true; return;
    }
    if (sub && registered && registered.endpoint === sub.endpoint) {
      $("notifyBtn").hidden = true;
      showPushPanel(
        "<strong>Almost done.</strong> Submit the GitHub issue that opened, then you'll get a test notification within a minute or two. Got it already?",
        `<button class="btn" id="pushConfirm">Yes, I got it</button><a class="btn ghost" href="${esc(registered.issueUrl)}" target="_blank" rel="noopener">Open GitHub step again</a><button class="btn ghost" id="pushCopy">Copy code</button>`
      );
      return;
    }
    $("notifyBtn").hidden = false;
    showPushPanel("<strong>Get alerts on this device</strong> for new events, changed dates and registrations closing soon.", '<button class="btn" id="pushStart">Turn on alerts</button>');
  }

  async function startPush() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast("Notifications weren't allowed"); refreshPushUi(); return; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(VAPID_PUBLIC_KEY) });
      const code = await encryptSubscription(sub.toJSON());
      const url = issueUrl(code, deviceName());
      store.set("radar-push-registered", { endpoint: sub.endpoint, issueUrl: url, code, confirmed: false });
      reg.showNotification("Event Radar", { body: "Notifications allowed. One last step on GitHub.", icon: "icons/icon-192.png", badge: "icons/badge-96.png", tag: "radar-local" });
      window.open(url, "_blank", "noopener");
      refreshPushUi();
    } catch (err) {
      showPushPanel(`<strong>Couldn't turn on alerts.</strong> ${esc(err && err.message ? err.message : "Try again in Chrome or Edge.")}`, '<button class="btn" id="pushStart">Try again</button>');
    }
  }

  document.addEventListener("click", async (ev) => {
    if (ev.target.closest("#pushStart, #notifyBtn")) { startPush(); return; }
    if (ev.target.closest("#pushConfirm")) {
      const r = store.get("radar-push-registered", null); if (r) { r.confirmed = true; store.set("radar-push-registered", r); }
      toast("Alerts are on for this device"); refreshPushUi(); return;
    }
    if (ev.target.closest("#pushCopy")) {
      const r = store.get("radar-push-registered", null); if (!r) return;
      try { await navigator.clipboard.writeText(r.code); toast("Code copied. Paste it into a new issue titled push-subscribe."); }
      catch (_) { toast("Couldn't copy. Use the GitHub step button instead."); }
    }
  });

  // ---- Boot ---------------------------------------------------------------
  render();
  load();
  window.addEventListener("online", load);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then(refreshPushUi).catch(() => {});
  } else {
    refreshPushUi();
  }
})();
