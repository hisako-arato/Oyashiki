// 音楽：場面ごとに曲を流す（曲はパブリックドメインの演奏。assets/music に 96kbps の AAC で置く）
// iPhone では audio の音量を変えられないため、Web Audio の GainNode で音量とフェードを扱う
// 曲は丸ごと取ってきて端末のキャッシュ（oyashiki-music-v1）に入れ、blob の URL で鳴らす（オフラインでも鳴る）
const MUSIC_CACHE = 'oyashiki-music-v1';
export const TRACKS = {
  title: 'clair',        // ドビュッシー「月の光」：タイトル・プロローグ・週末・エンディング
  day: 'quartet',        // 弦楽四重奏曲 第1楽章：昼の執事パート
  heist: 'moonlight3',   // ベートーヴェン「月光」第3楽章：決行
  ball: 'danube',        // シュトラウス2世「美しく青きドナウ」：仮面舞踏会・お嬢様とのダンス
  shizuku: 'farewell',   // ショパン「別れのワルツ」：雫とのダンス
};
const FADE = 1.5;   // 秒
const VOL_KEY = 'oyashiki-music-vol';

let ctx = null, cur = null, want = null, unlocked = false, seq = 0;
const urlOf = name => new URL(`../assets/music/${name}.m4a`, import.meta.url).href;

export function volume() {
  try { const v = localStorage.getItem(VOL_KEY); return v == null ? 60 : Math.max(0, Math.min(100, +v)); } catch (e) { return 60; }
}
const gainOf = v => (v / 100) ** 2;
export function setVolume(v) {
  try { localStorage.setItem(VOL_KEY, String(v)); } catch (e) { /* noop */ }
  if (cur && ctx) cur.gain.gain.setTargetAtTime(gainOf(v), ctx.currentTime, 0.05);
  if (v > 0 && want && !cur) start(want);
  if (v === 0) stop();
}

async function blobUrl(name) {
  const url = urlOf(name);
  let res = null;
  try { const c = await caches.open(MUSIC_CACHE); res = await c.match(url); if (!res) { const r = await fetch(url); if (r.ok) { await c.put(url, r.clone()); res = r; } } }
  catch (e) { res = await fetch(url).catch(() => null); }
  if (!res || !res.ok) return null;
  return URL.createObjectURL(await res.blob());
}

function fadeOut(t) {
  if (!t) return;
  const g = t.gain.gain, now = ctx.currentTime;
  g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + FADE);
  setTimeout(() => { t.audio.pause(); t.audio.removeAttribute('src'); t.audio.load(); t.src.disconnect(); URL.revokeObjectURL(t.url); }, FADE * 1000 + 100);
}

async function start(scene) {
  const name = TRACKS[scene];
  if (!name || !unlocked || volume() === 0) return;
  if (cur && cur.scene === scene) return;
  const my = ++seq;
  fadeOut(cur); cur = null;
  const url = await blobUrl(name);
  if (!url) return;
  if (my !== seq || want !== scene) return URL.revokeObjectURL(url);   // 取ってくる間に場面が変わった
  const audio = new Audio(url);
  audio.loop = true;
  const src = ctx.createMediaElementSource(audio), gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(gain).connect(ctx.destination);
  cur = { scene, audio, src, gain, url };
  try { await audio.play(); } catch (e) { return; }
  gain.gain.linearRampToValueAtTime(gainOf(volume()), ctx.currentTime + FADE);
}

// 場面の曲にする（同じ曲なら続けて流す）。null で止める
export function play(scene) {
  want = scene;
  if (!scene) return stop();
  start(scene);
}
// いま鳴っている場面（確かめる用）
export const nowPlaying = () => cur && !cur.audio.paused ? cur.scene : null;
export function stop() { want = null; seq++; if (cur && ctx) fadeOut(cur); cur = null; }

// スマホは、最初のタップの後でなければ音を出せない
function unlock() {
  if (unlocked) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  ctx.resume();
  unlocked = true;
  if (want) start(want);
}
document.addEventListener('pointerdown', unlock, { capture: true });
document.addEventListener('keydown', unlock, { capture: true });
// 別のアプリに切り替えたら止め、戻ったら続ける
document.addEventListener('visibilitychange', () => { if (ctx) document.hidden ? ctx.suspend() : ctx.resume(); });
