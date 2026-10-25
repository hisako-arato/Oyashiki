// キャラクター（VRM）を端末に保存しておく（設定の「キャラクターを端末に保存」）
// sw.js と同じキャッシュ oyashiki-vrm-v2 に入れるので、次からはダウンロードせずに読み込める
const VRM_CACHE = 'oyashiki-vrm-v2';
export const VRM_IDS = ['butler', 'butler2', 'father', 'mother', 'mother2', 'daughter', 'daughter2', 'red', 'blue', 'white', 'black', 'black2', 'black3', 'guard'];
// lite：屋敷と会話の顔に使う　view：人物照会の高画質版
export const KINDS = { lite: { label: '屋敷・会話用', size: '約58MB' }, view: { label: '人物照会用（高画質）', size: '約97MB' } };
const urlOf = (kind, id) => new URL(`../assets/vrm/${kind}/${id}.vrm`, import.meta.url).href;

// 保存済みの人数
export async function savedCount(kind) {
  if (!window.caches) return null;
  try {
    const c = await caches.open(VRM_CACHE);
    let n = 0;
    for (const id of VRM_IDS) if (await c.match(urlOf(kind, id))) n++;
    return n;
  } catch (e) { return null; }
}

// まだ保存していない人を落として保存する。onProgress(保存済みの人数, 全員の人数)
export async function saveKind(kind, onProgress) {
  const c = await caches.open(VRM_CACHE);
  let n = 0;
  for (const id of VRM_IDS) {
    const url = urlOf(kind, id);
    if (!await c.match(url)) {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`${id}: ${r.status}`);
      await c.put(url, r);
    }
    onProgress && onProgress(++n, VRM_IDS.length);
  }
}

// 端末からの保存を消せないように、ブラウザに「消さないで」と頼む（対応しているブラウザだけ）
export function keepStorage() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* noop */ }
}
