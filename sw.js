// 인계장 서비스 워커: 앱 파일만 캐시한다. 인계 기록은 IndexedDB에 암호화되어 있고 여기서 다루지 않는다.
const VERSION = '1.2.1';
const CACHE = 'handoff-' + VERSION;
const ASSETS = [
  './',
  './index.html',
  './app.css?v=' + VERSION,
  './app.js?v=' + VERSION,
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('handoff-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // 화면(HTML)은 네트워크 우선: 새 버전이 있으면 받고, 없으면(오프라인) 캐시로 연다.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 나머지 파일은 캐시 우선.
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
