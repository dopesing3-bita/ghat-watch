/* Ghat Watch offline cache. Only used when the app is served over http(s); opening index.html from disk skips it.
   Network first for the app's own files, so a rebuilt data.js shows up at once; the cached copy is used offline. */
var CACHE = "ghat-watch-v2";
var FILES = ["./", "index.html", "style.css", "app.js", "data.js", "assist-core.js", "analytics.js", "assistant.js", "icon.svg", "manifest.webmanifest",
  "fonts/cormorant-garamond-latin.woff2",
  "fonts/poppins-300-latin.woff2", "fonts/poppins-400-latin.woff2", "fonts/poppins-500-latin.woff2", "fonts/poppins-600-latin.woff2",
  "fonts/poppins-300-devanagari.woff2", "fonts/poppins-400-devanagari.woff2", "fonts/poppins-500-devanagari.woff2",
  "fonts/poppins-600-devanagari.woff2"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;  // report PDFs and WhatsApp are not cached
  if (url.pathname.indexOf("/api/") === 0) return;   // AI answers and AI status are never cached
  e.respondWith(fetch(e.request).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return res;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (hit) { return hit || caches.match("index.html"); });
  }));
});
