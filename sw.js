/* sw.js — 離線快取（cache-first） */
const CACHE = 'snit-v8';

const ASSETS = [
  '.',
  'index.html',
  'manifest.webmanifest',
  'version.json',
  'css/tokens.css',
  'css/base.css',
  'css/components.css',
  'js/app.js',
  'js/core/db.js',
  'js/core/content.js',
  'js/core/settings.js',
  'js/core/search.js',
  'js/core/dom.js',
  'js/features/home.js',
  'js/features/knowledge.js',
  'js/features/practice.js',
  'js/features/exam.js',
  'js/features/cram.js',
  'js/features/notes.js',
  'js/features/settings.js',
  'js/features/records.js',
  'js/features/setup.js',
  'js/features/placeholder.js',
  'js/speech/tts.js',
  'js/speech/recorder.js',
  'js/speech/stt.js',
  'js/ai/scorer.js',
  'js/ai/examiner.js',
  'data/dimensions.json',
  'data/questions/self.json',
  'data/questions/emergency.json',
  'data/questions/infectious.json',
  'data/questions/parent.json',
  'data/questions/mental.json',
  'data/questions/promotion.json',
  'data/questions/admin.json',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-180.png',
  'assets/icons/icon-512-maskable.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && new URL(req.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
