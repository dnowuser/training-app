// Keeps the app working without signal.
//
// App shell: pages load network-first and fall back to the cached copy; hashed
// build assets are cached as they're used. Only real assets are cached: never
// an error, and never an HTML page standing in for a missing file (that once
// left the app unstyled).
//
// Data: every Supabase read (GET /rest/v1/...) is saved as it comes back. With
// no signal, or signal too slow to answer within a few seconds, the saved copy
// is served instead, so every screen opens offline with what it last showed.
// Writes are never cached; the app queues those itself (src/lib/offline.ts,
// src/lib/outbox.ts). Bump a cache name to throw away what an earlier version
// saved.
const CACHE = 'training-shell-v3'
const DATA = 'training-data-v1'
const SLOW_MS = 4000

const cacheable = (res, wantHtml) =>
  res.ok && res.type === 'basic' && (res.headers.get('content-type') || '').includes('text/html') === wantHtml

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/favicon.svg'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Signing out clears the saved data.
self.addEventListener('message', (event) => {
  if (event.data === 'clear-data') event.waitUntil(caches.delete(DATA))
})

/** The same URL can be asked for as a list or as one object; keep those apart. */
function dataKey(req) {
  const url = new URL(req.url)
  if ((req.headers.get('accept') || '').includes('vnd.pgrst.object')) url.searchParams.set('__one', '1')
  return url.toString()
}

function fromNetworkOrSaved(event) {
  const req = event.request
  const key = dataKey(req)
  const network = fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone()
      event.waitUntil(caches.open(DATA).then((c) => c.put(key, copy)))
    }
    return res
  })
  const saved = () => caches.open(DATA).then((c) => c.match(key, { ignoreVary: true }))
  const slow = new Promise((resolve) => setTimeout(resolve, SLOW_MS)).then(saved)
  // Whichever comes first: the network, or (after a few seconds) the saved copy if there is one.
  return Promise.race([network, slow.then((hit) => hit || network)]).catch(() => saved().then((hit) => hit || network))
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET') return

  if (url.origin !== self.location.origin) {
    if (url.pathname.startsWith('/rest/v1/')) event.respondWith(fromNetworkOrSaved(event))
    return
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (cacheable(res, true)) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put('/', copy))
          }
          return res
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (cacheable(res, false)) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})
