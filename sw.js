// 붕붕 — 오프라인에서도 열리게
// - 설치할 때 핵심 파일을 미리 저장 (첫 방문에 설치해도 오프라인으로 열림)
// - 인터넷 되면 항상 새 버전 (브라우저 HTTP 캐시도 건너뜀 → 배포 직후 옛/새 파일이 섞이지 않게)
// - 인터넷이 느리면 4초 뒤 저장해 둔 것으로
const CACHE = 'boongboong-v6';
const CORE = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/net-config.js', 'js/audio.js', 'js/sfx.js', 'js/track.js', 'js/stages-more.js', 'js/draw.js',
  'js/render3d.js', 'js/online.js', 'js/net.js', 'js/game.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
function withTimeout(p, ms) { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); }); }
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const cdn = url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!same && !cdn) return;   // 친구 연결(Supabase) 등은 손대지 않음
  const net = fetch(same ? new Request(req, { cache: 'no-cache' }) : req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
    return res;
  });
  e.respondWith(
    withTimeout(net, 4000).catch(() =>
      caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('./') : net))
    )
  );
});
