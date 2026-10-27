// オフラインでも遊べるよう、ゲームのファイルをキャッシュする
const CACHE = 'oyashiki-1.48';
// VRM は大きいので、版を上げても消さない別のキャッシュに置き、キャッシュを優先して使う
// 中身を差し替えた VRM（black2・daughter2）を新しく読み込ませるため v2 にした。v1 は sw.js の activate で消える
const VRM_CACHE = 'oyashiki-vrm-v2';
// 音楽は js/music.js が自分で oyashiki-music-v1 に入れる（版を上げても消さない）
const MUSIC_CACHE = 'oyashiki-music-v1';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css', 'css/day3d.css',
  'js/main.js', 'js/music.js', 'js/evetest.js', 'js/ball.js', 'js/recall.js', 'js/version.js', 'js/lockdown.js', 'js/game.js', 'js/daylogic.js', 'js/night.js', 'js/events.js', 'js/pipe.js', 'js/sister.js', 'js/profiles.js', 'js/faces.js', 'js/state.js', 'js/vrmstore.js', 'js/white.js', 'js/data.js', 'js/actions.js', 'js/story.js',
  'explore/day3d.js', 'explore/engine.js', 'explore/world.js', 'explore/nav.js', 'explore/vrm.js', 'explore/viewer.js', 'explore/portrait.js', 'explore/masks.js', 'explore/guests.js',
  'vendor/three.module.min.js', 'vendor/GLTFLoader.js', 'vendor/BufferGeometryUtils.js', 'vendor/three-vrm.module.min.js',
  ...['butler', 'butler2', 'father', 'mother', 'mother2', 'daughter', 'daughter2', 'red', 'blue', 'white', 'black', 'black2', 'black3', 'guard', 'daughter3', 'reiko', 'dealer', 'caterer'].map(id => `assets/faces/${id}.webp`),
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => ![CACHE, VRM_CACHE, MUSIC_CACHE].includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// ネットワーク優先、オフライン時はキャッシュから返す
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const path = new URL(e.request.url).pathname;
  if (path.endsWith('/version.json')) return;   // 最新のバージョン番号は、いつも公開ページに聞く
  if (path.includes('/assets/music/')) return;   // 音楽は js/music.js のキャッシュから鳴らす
  if (path.includes('/assets/vrm/')) {
    e.respondWith(caches.open(VRM_CACHE).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }))));
    return;
  }
  // ブラウザの HTTP キャッシュに古い版が残っていても、公開ページに確かめてから使う
  const req = e.request.mode === 'navigate' ? fetch(e.request.url, { cache: 'no-cache' }) : fetch(e.request, { cache: 'no-cache' });
  e.respondWith(req
    .then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
