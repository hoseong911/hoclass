/* ════════════════════════════════════════════════════════════════
   2027 LMS 서비스워커 (hoistory/sw.js에서 옮김): 런타임 캐싱으로 오프라인/빠른 로딩 지원.

   전략
   - Firebase 실시간 데이터(Firestore/RTDB/Auth)는 건드리지 않는다(항상 네트워크 →
     오래된 데이터가 뜨지 않게). 쓰기 요청(GET 아님)도 그대로 통과.
   - HTML 페이지 이동(navigate)은 네트워크 우선, 실패하면(오프라인) 캐시로 대체.
   - 그림도 네트워크 우선이다. CSS/JS는 ?v= 를 붙여 URL이 바뀌지만, 그림은 파일명을
     그대로 두고 내용만 갈아끼우는 일이 많아서(28_5.png를 다른 사진으로 교체 등)
     캐시 우선으로 두면 바꾼 그림이 다음 접속에서야 보인다. 캐시는 오프라인 대비로만 쓴다.
   - 그 밖의 정적 자원(CSS, JS, 폰트)은 캐시 우선 + 백그라운드 갱신
     (stale-while-revalidate). ?v= 버전이 바뀐 파일은 URL이 달라 자동으로 새로 받는다.

   캐시 로직을 바꿀 땐 CACHE 이름의 버전을 올린다(예: v1 → v2). 그러면 activate에서
   옛 캐시를 지운다.
   ════════════════════════════════════════════════════════════════ */
const CACHE = 'lms2027-v3';

/* 폰트는 install 때 미리 받아 둔다(선생님 지시 2026-10-31: 기기마다 폰트가 늦거나 다르게 떠서 분량이
   달라지지 않게). 주소가 고정인 Paperlogy(제목)와 구글폰트 CSS만 프리캐시하고, 구글폰트가 참조하는
   실제 woff2(fonts.gstatic)는 아래 SWR 규칙이 처음 온라인 접속 때 캐시한다. */
const FONT_PRECACHE = [
  'https://cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-4Regular.woff2',
  'https://cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-6SemiBold.woff2',
  'https://cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2',
  'https://cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-8ExtraBold.woff2',
  'https://cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-9Black.woff2',
  'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700&family=Gowun+Batang:wght@400;700&family=Great+Vibes&display=swap',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  // 하나가 실패해도(네트워크/CORS) 나머지는 받도록 개별 처리한다. 설치를 막지는 않는다.
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(FONT_PRECACHE.map((u) =>
      fetch(u, { mode: 'cors' }).then((r) => (r && r.ok) ? cache.put(u, r.clone()) : null).catch(() => {})));
  })());
});

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
  await self.clients.claim();
})()));

// Firebase 실시간/인증 계열 호스트: SW가 관여하지 않고 네트워크로 그대로 보낸다.
const BYPASS = /firestore\.googleapis|firebasedatabase\.app|firebaseio\.com|identitytoolkit\.googleapis|securetoken\.googleapis/;

/* 수첩(desk/)은 파일 이름에 ?v= 를 붙이지 않는다. 캐시 우선으로 두면 고친 것이
   다음 접속에야 보여서, 한 번 잘못 받으면 계속 그것을 쓴다. 늘 네트워크를 먼저 본다. */
const FRESH = /\/desk\//;

// 이름은 그대로 두고 내용만 바뀌는 자원: 그림. 캐시보다 네트워크를 먼저 본다.
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg|ico)$/i;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // 쓰기 요청은 통과
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (BYPASS.test(url.host)) return;                // Firebase 데이터는 항상 네트워크

  // 페이지 이동: 네트워크 우선, 실패 시 캐시(오프라인 대비)
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(req))
            || (await caches.match('./index.html'))
            || Response.error();
      }
    })());
    return;
  }

  // 수첩과 그림: 네트워크 우선, 실패하면(오프라인) 캐시
  if (FRESH.test(url.pathname) || req.destination === 'image' || IMAGE.test(url.pathname)) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.status === 200 && (fresh.type === 'basic' || fresh.type === 'cors')) {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch {
        return (await caches.match(req)) || Response.error();
      }
    })());
    return;
  }

  // 그 밖의 정적 자원: 캐시 우선 + 백그라운드 갱신
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then((res) => {
      if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
        caches.open(CACHE).then((c) => c.put(req, res.clone()));
      }
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
