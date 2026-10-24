/*! Mah-Arghavan · ماه‌ارغوان · © 2026 Mohammad Farmani. All rights reserved. */
// Offline cache for the iPhone / web app. The app shell is cached on install; the songs are cached
// in the background and served with byte ranges, which Safari needs to play audio offline.
const CORE = "mah-arghavan-1.5.0-12678044ab";
const SONGS = "mah-arghavan-songs-2";
const CORE_FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
const SONG_FILES = ["songs/beyond.mp3","songs/lightitup-1.mp3","songs/lightitup-2.mp3","songs/mystar-ambient.mp3","songs/mystar-meditation.mp3","songs/star-ta.mp3","songs/star.mp3","songs/unfading.mp3"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CORE).then(c => c.addAll(CORE_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CORE && k !== SONGS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
async function warmSongs() {
  const c = await caches.open(SONGS);
  for (const f of SONG_FILES) {
    const url = new URL(f, self.registration.scope).href;
    if (await c.match(url)) continue;
    try { const r = await fetch(url, { cache: "no-store" }); if (r.ok && r.status === 200) await c.put(url, r); } catch (err) { break; }
  }
}
self.addEventListener("message", e => { if (e.data === "warm") e.waitUntil(warmSongs()); });
async function songResponse(req) {
  const url = req.url.split("#")[0];
  const c = await caches.open(SONGS);
  let full = await c.match(url);
  if (!full) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok || r.status !== 200) return r;
      await c.put(url, r.clone());
      full = r;
    } catch (err) { return new Response("", { status: 504 }); }
  }
  const range = req.headers.get("range");
  if (!range) return full;
  const buf = await full.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? parseInt(m[1], 10) : 0, end = m[2] ? parseInt(m[2], 10) : buf.byteLength - 1;
  if (!m[1] && m[2]) { start = Math.max(0, buf.byteLength - parseInt(m[2], 10)); end = buf.byteLength - 1; }
  end = Math.min(end, buf.byteLength - 1);
  if (start > end) return new Response("", { status: 416, headers: { "Content-Range": "bytes */" + buf.byteLength } });
  return new Response(buf.slice(start, end + 1), { status: 206, statusText: "Partial Content",
    headers: { "Content-Type": "audio/mpeg", "Content-Range": `bytes ${start}-${end}/${buf.byteLength}`, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" } });
}
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (new URL(req.url).pathname.includes("/songs/")) { e.respondWith(songResponse(req)); return; }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => {
    if (r.ok && r.status === 200) { const copy = r.clone(); caches.open(CORE).then(c => c.put(req, copy)); }
    return r;
  }).catch(() => req.mode === "navigate" ? caches.match("index.html") : new Response("", { status: 504 }))));
});
