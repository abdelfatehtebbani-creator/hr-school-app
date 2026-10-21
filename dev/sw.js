/**
 * Service worker of the installable app (24_PWA §3 P4): keeps the app shell so the app opens without a connection.
 * Only this site's own files are cached; server calls and data are never cached.
 * scripts/build-app.js replaces dev-20261021164845 so each build replaces the previous cache.
 */
var CACHE = 'hr-shell-__VERSION__';
var SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('hr-shell-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Network first, so a new version shows as soon as it is online; the cached shell only when offline.
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || url.pathname.indexOf(scope.pathname) !== 0) return;
  if (url.pathname.indexOf(scope.pathname + 'dev/') === 0) return; // the test app nested under the production one has its own worker
  event.respondWith(fetch(req).then(function (res) {
    if (res.ok) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (hit) {
      return hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
    });
  }));
});

// --- Push notifications and the icon badge (D47, 24_PWA §7) ---------------------------------
// Firebase Cloud Messaging delivers a standard Web Push; its data is {title, body, page, badge}.
// Every push shows a notification (iPhone revokes subscriptions that receive silent pushes).
self.addEventListener('push', function (event) {
  var payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) { payload = {}; }
  var data = payload.data || payload;
  var badge = Number(data.badge || 0);
  var shown = self.registration.showNotification(data.title || 'Royal Crown HR', {
    body: data.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'hr-' + (data.page || 'app'),
    renotify: true, data: { page: data.page || '' },
  });
  var counted = badge > 0 && self.navigator.setAppBadge ? self.navigator.setAppBadge(badge).catch(function () {}) : Promise.resolve();
  event.waitUntil(Promise.all([shown, counted]));
});

// A tap opens the app on the page the notification is about, reusing an open window.
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var page = event.notification.data && event.notification.data.page;
  var url = new URL(page ? './?page=' + encodeURIComponent(page) : './', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf(self.registration.scope) === 0 && 'focus' in list[i]) {
        return list[i].navigate(url).then(function (c) { return (c || list[i]).focus(); });
      }
    }
    return self.clients.openWindow(url);
  }));
});
