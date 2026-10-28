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
if (typeof document !== 'undefined') {   // 画面の無い所（動作確認用の node）では何もしない
  document.addEventListener('pointerdown', unlock, { capture: true });
  document.addEventListener('keydown', unlock, { capture: true });
  // 別のアプリに切り替えたら止め、戻ったら続ける
  document.addEventListener('visibilitychange', () => { if (ctx) document.hidden ? ctx.suspend() : ctx.resume(); });
}

// ---- 効果音（録音ファイルを使わず、その場で合成する）：足音・扉・警報・停電・鐘・食器・タップ ----
const SFX_KEY = 'oyashiki-sfx-vol';
export function sfxVolume() {
  try { const v = localStorage.getItem(SFX_KEY); return v == null ? 60 : Math.max(0, Math.min(100, +v)); } catch (e) { return 60; }
}
export function setSfxVolume(v) { try { localStorage.setItem(SFX_KEY, String(v)); } catch (e) { /* noop */ } }
let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const n = ctx.createBufferSource(); n.buffer = noiseBuf; return n;
}
// 音の一つ：type 波形、f 周波数（[始め, 終わり]）、t0 始まり（秒後）、dur 長さ、g 大きさ
function tone(out, { type = 'sine', f = 440, t0 = 0, dur = 0.2, g = 0.3, filter }) {
  const now = ctx.currentTime + t0, gn = ctx.createGain();
  const src = type === 'noise' ? noise() : ctx.createOscillator();
  if (type !== 'noise') { src.type = type; const [a, b] = [].concat(f); src.frequency.setValueAtTime(a, now); if (b) src.frequency.exponentialRampToValueAtTime(b, now + dur); }
  gn.gain.setValueAtTime(0, now); gn.gain.linearRampToValueAtTime(g, now + 0.005); gn.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  let node = src;
  if (filter) { const fl = ctx.createBiquadFilter(); fl.type = filter[0]; fl.frequency.value = filter[1]; node.connect(fl); node = fl; }
  node.connect(gn).connect(out);
  src.start(now); src.stop(now + dur + 0.05);
}
const SFX = {
  step: o => tone(o, { type: 'noise', dur: 0.05, g: 0.12, filter: ['lowpass', 650] }),
  door: o => { tone(o, { type: 'noise', dur: 0.18, g: 0.18, filter: ['bandpass', 420] }); tone(o, { f: [95, 60], t0: 0.12, dur: 0.25, g: 0.35 }); },
  alarm: o => { for (let i = 0; i < 8; i++) tone(o, { type: 'square', f: i % 2 ? 660 : 880, t0: i * 0.2, dur: 0.19, g: 0.12 }); },
  blackout: o => { tone(o, { f: [70, 35], dur: 0.6, g: 0.5 }); tone(o, { type: 'noise', t0: 0.05, dur: 1.2, g: 0.12, filter: ['lowpass', 900] }); tone(o, { type: 'sawtooth', f: [120, 40], dur: 0.5, g: 0.06, filter: ['lowpass', 400] }); },
  bell: o => { for (let k = 0; k < 3; k++) for (const [m, g] of [[1, 0.25], [2.76, 0.1], [5.4, 0.05]]) tone(o, { f: 392 * m, t0: k * 0.9, dur: 2.4, g }); },
  clink: o => { tone(o, { f: 2400, dur: 0.18, g: 0.12 }); tone(o, { f: 3300, t0: 0.03, dur: 0.15, g: 0.08 }); },
  tap: o => tone(o, { f: 990, dur: 0.07, g: 0.15 }),
  miss: o => tone(o, { type: 'triangle', f: [300, 180], dur: 0.15, g: 0.12 }),
};
export function sfx(name) {
  if (!unlocked || !ctx || !SFX[name] || document.hidden) return;
  const v = sfxVolume();
  if (!v) return;
  const out = ctx.createGain(); out.gain.value = (v / 100) ** 2; out.connect(ctx.destination);
  SFX[name](out);
  setTimeout(() => out.disconnect(), 4000);
}
