/* Chat Center admin push worker.
 *
 * Plain script on purpose: it is served from /public, has no bundler step and
 * must keep working after an admin deployments swaps the app bundle.
 */

self.addEventListener("install", function () {
  // Take over as soon as a new worker is available; the page sends no state
  // that would need a coordinated handover.
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

function readPayload(event) {
  if (!event.data) return {};
  try {
    var parsed = event.data.json();
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return { body: event.data.text() };
  }
}

function text(value, fallback) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

self.addEventListener("push", function (event) {
  var payload = readPayload(event);
  var title = text(payload.title, "Tin nhắn mới");
  var body = text(payload.body, "Bạn có thông báo mới trong Chat Center.");
  var icon = text(payload.icon, "/favicon.ico");
  var tag = text(payload.tag, "");
  var data = payload.data && typeof payload.data === "object" ? payload.data : {};
  var url = text(data.url, "/inbox");

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: icon,
      tag: tag || undefined,
      // A tag groups a conversation's alerts; only then does renotify apply.
      renotify: !!tag,
      data: { url: url },
    })
  );
});

function safeTargetUrl(raw) {
  var fallback = self.location.origin + "/inbox";
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    var url = new URL(raw, self.location.origin);
    // A push payload never gets to point the panel at another origin.
    return url.origin === self.location.origin ? url.href : fallback;
  } catch (error) {
    return fallback;
  }
}

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var targetUrl = safeTargetUrl(event.notification.data && event.notification.data.url);
  var target = new URL(targetUrl);

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clients) {
        var sameOrigin = clients.filter(function (client) {
          try {
            return new URL(client.url).origin === self.location.origin;
          } catch (error) {
            return false;
          }
        });

        // Prefer a window already showing the target conversation.
        var chosen = null;
        for (var index = 0; index < sameOrigin.length; index += 1) {
          try {
            if (new URL(sameOrigin[index].url).href === target.href) {
              chosen = sameOrigin[index];
              break;
            }
          } catch (error) {
            // Ignore unparsable client urls and keep looking.
          }
        }
        if (!chosen && sameOrigin.length) chosen = sameOrigin[0];

        if (!chosen) return self.clients.openWindow(targetUrl);

        return Promise.resolve(chosen.navigate(targetUrl))
          .catch(function () {
            // Navigation can be refused while the page is unloading; focusing
            // the existing window is still better than doing nothing.
            return chosen;
          })
          .then(function () {
            return chosen.focus();
          });
      })
  );
});
