// Station alert worker: shows OS-level alarm notifications and brings the station tab
// forward when one is clicked. Notifications fire even when the tab is in the background
// or minimised, and need no click on the page once permission is granted.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
