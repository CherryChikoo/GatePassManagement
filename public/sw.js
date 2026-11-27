/*
 * GatePass service worker — phone / desktop notifications only.
 * (No page caching: the portal always loads fresh from the server.)
 *
 * push: always shows the device notification — also while the portal is open
 *       (the in-portal alert shows as well).
 * notificationclick: opens the portal on the right screen (reusing an open tab).
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Gate Pass", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      const urgent = data.level === "URGENT";
      await self.registration.showNotification(data.title || "Gate Pass", {
        body: data.body || "",
        icon: "/brand/icon-192.png",
        badge: "/brand/badge-96.png",
        tag: data.tag || undefined,
        renotify: !!data.tag,
        requireInteraction: urgent,
        vibrate: urgent ? [180, 80, 180, 80, 180] : [120, 60, 120],
        data: { link: data.link || "/" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  const url = new URL(link, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          await w.focus();
          if ("navigate" in w) await w.navigate(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
