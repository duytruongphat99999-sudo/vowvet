/**
 * VowVet Service Worker (M5 push + M11 offline cache).
 *
 * Strategy:
 *   - precache: offline shell, favicon, manifest
 *   - runtime cache (stale-while-revalidate):
 *     /dashboard /emergency /chat /faq /pets/:id (read-only shell when offline)
 *   - network-only: /api/* (never cache user data — staleness risk)
 *   - cache-first: static assets (_astro chunks, fonts)
 *
 * Cache version bump VERSION khi update SW logic → triggers reinstall.
 */

// IMPORTANT: bump VERSION every release that ships HTML/CSS changes — otherwise
// stale-while-revalidate keeps serving old cached HTML for /dashboard /chat /alerts /etc.
// (root cause of "không thấy thay đổi" feedback during Brand Sync Pass 3.)
const VERSION = "vowvet-v321-foster-leaderboard";
const PRECACHE = `${VERSION}-precache`;
const RUNTIME = `${VERSION}-runtime`;

const PRECACHE_URLS = [
  "/offline",
  "/favicon.svg",
  "/manifest.webmanifest",
];

// ============================================================
// Install — precache shell
// ============================================================
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

// ============================================================
// Activate — cleanup old caches + claim clients + notify on UPDATE
// ============================================================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      const oldCaches = names.filter(
        (n) => n.startsWith("vowvet-") && !n.startsWith(VERSION)
      );
      await Promise.all(oldCaches.map((n) => caches.delete(n)));
      await self.clients.claim();

      // v136: Only postMessage on UPDATE (had old caches), not first install.
      // Layout listener shows toast "Đã có bản mới, nhấn để cập nhật".
      if (oldCaches.length > 0) {
        const clients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        for (const client of clients) {
          client.postMessage({ type: "SW_UPDATED", version: VERSION });
        }
      }
    })()
  );
});

// v136: skipWaiting handler — Layout có thể trigger update tức thì khi user click toast
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ============================================================
// Fetch handler — routing strategy
// ============================================================
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Skip cross-origin (fonts, gemini, etc — let browser handle)
  if (url.origin !== self.location.origin) return;

  // API: network-only (KHÔNG cache user data)
  if (url.pathname.startsWith("/api/")) return;

  // Static assets: cache-first
  if (
    url.pathname.startsWith("/_astro/") ||
    /\.(css|js|svg|png|jpg|jpeg|webp|ico|woff2?|ttf)$/i.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // v43: Document navigation: network-first (auth-safe — luôn fetch fresh để pickup auth state)
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(networkFirstWithCacheFallback(req));
    return;
  }

  // Default: network with cache fallback
  event.respondWith(networkWithCacheFallback(req));
});

// ============================================================
// Cache strategies
// ============================================================

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(RUNTIME);
      cache.put(req, res.clone()).catch(() => undefined);
    }
    return res;
  } catch (err) {
    return new Response("", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      // Only cache successful + non-redirect responses
      if (res.ok && !res.redirected) {
        cache.put(req, res.clone()).catch(() => undefined);
      }
      return res;
    })
    .catch(() => null);

  // If we have cached version, return it instantly (network updates in bg)
  if (cached) {
    fetchPromise; // fire-and-forget
    return cached;
  }
  // No cache → wait for network → fallback offline
  const networkRes = await fetchPromise;
  if (networkRes) return networkRes;
  const offline = await caches.match("/offline");
  return offline || new Response("Offline", { status: 503 });
}

async function networkWithCacheFallback(req) {
  try {
    const res = await fetch(req);
    return res;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    return new Response("Offline", { status: 503 });
  }
}

// v43: Network-first cho HTML navigation — đảm bảo auth state luôn fresh.
// Khác networkWithCacheFallback ở chỗ: cache thành công vào RUNTIME (để dùng làm offline fallback).
async function networkFirstWithCacheFallback(req) {
  const cache = await caches.open(RUNTIME);
  try {
    const res = await fetch(req);
    if (res.ok && !res.redirected) {
      cache.put(req, res.clone()).catch(() => undefined);
    }
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    const offline = await caches.match("/offline");
    return offline || new Response("Offline", { status: 503 });
  }
}

// ============================================================
// Push event (M5) — unchanged
// ============================================================
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: "VowVet", body: event.data.text() };
  }

  const title = payload.title || "VowVet";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/favicon.svg",
    badge: payload.badge || "/favicon.svg",
    data: payload.data || {},
    tag: payload.data?.alert_id
      ? `alert-${payload.data.alert_id}`
      : payload.data?.session_id
      ? `triage-${payload.data.session_id}`
      : undefined,
    vibrate: payload.data?.test ? [100] : [200, 100, 200],
    requireInteraction: payload.data?.urgency === 5, // emergency triage keeps notification
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ============================================================
// Notification click — focus or open tab
// ============================================================
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (
            client.url.includes("vowvet") ||
            client.url.includes("monminpet") ||
            client.url.includes("localhost")
          ) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});
