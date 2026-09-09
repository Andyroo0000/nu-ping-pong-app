/*
  Service worker for NU Ping Pong.

  Two jobs: receive Web Push messages, and satisfy the browser's requirements
  for being installable. It deliberately does NOT cache pages — the app is
  almost entirely live data (who's online, who's waiting, unread messages), so
  serving a stale shell would show people a version of the club that isn't
  true. The fetch handler exists because Chrome requires one before it will
  offer to install.
*/

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every old tab to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Pass through to the network. Present only so the app is installable.
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "NU Ping Pong", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "NU Ping Pong";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // Same tag replaces an earlier notification instead of stacking five
    // "new message" alerts from one conversation.
    tag: payload.tag || "nupp",
    renotify: Boolean(payload.tag),
    data: { url: payload.url || "/leaderboard" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/leaderboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Reuse an already-open tab where we can, rather than piling up windows.
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
