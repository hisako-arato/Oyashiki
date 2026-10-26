// VRM キャラクターの読み込みと動き（歩く・立つ・まばたき・お辞儀・手を振る）
// assets/vrm/lite/ は屋敷の中用（テクスチャ512px）、assets/vrm/view/ は人物照会用（1024px）
// 元のファイル（assets/vrm/*.vrm）から tools/vrm_lite.py で作る
import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '../vendor/three-vrm.module.min.js';

export const CAST = ['butler', 'father', 'mother', 'daughter', 'red', 'blue', 'white', 'black', 'guard'];

const loader = new GLTFLoader();
loader.register(p => new VRMLoaderPlugin(p));
const cache = new Map();

// 同じ人物の VRM は一度だけ読み込む。onProgress(0〜1)
// slot：同じファイルを別の場面（会話の顔など）で同時に使うときの、別の複製の名前
export function loadVRM(id, kind = 'lite', onProgress, slot = '') {
  const key = `${kind}/${id}${slot ? '#' + slot : ''}`;
  if (!cache.has(key)) {
    const url = new URL(`../assets/vrm/${kind}/${id}.vrm`, import.meta.url).href;
    cache.set(key, loader.loadAsync(url, e => onProgress && e.total && onProgress(e.loaded / e.total)).then(g => {
      const vrm = g.userData.vrm;
      VRMUtils.removeUnnecessaryVertices(g.scene);
      VRMUtils.combineSkeletons(g.scene);
      vrm.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      vrm.motion = { walk: 0, t: Math.random() * 10, blink: 2 + Math.random() * 3, pose: 'stand', poseT: 0, face: {} };
      pose(vrm, 0, 0);
      vrm.update(0);
      return vrm;
    }).catch(e => { cache.delete(key); throw e; }));
  }
  return cache.get(key);
}
// 人物照会では使い終わったら捨てる（屋敷の中の lite は残す）
export function disposeVRM(id, kind, slot = '') {
  const key = `${kind}/${id}${slot ? '#' + slot : ''}`;
  const p = cache.get(key);
  if (!p) return;
  cache.delete(key);
  p.then(vrm => VRMUtils.deepDispose(vrm.scene)).catch(() => {});
}

const bone = (vrm, name) => vrm.humanoid.getNormalizedBoneNode(name);
const set = (vrm, name, x = 0, y = 0, z = 0) => { const b = bone(vrm, name); if (b) b.rotation.set(x, y, z); };
const smooth = (a, b, k) => a + (b - a) * Math.min(1, k);

// 姿勢をつける。walk：歩きの位相、amt：歩きの強さ（0〜1）
function pose(vrm, walk, amt, t = 0, extra = {}) {
  const s = Math.sin(walk), breath = Math.sin(t * 1.6) * 0.015;
  const bow = extra.bow || 0, wave = extra.wave || 0;
  if (extra.dance) return waltz(vrm, extra.dance);
  set(vrm, 'spine', bow * 0.35 + breath);
  set(vrm, 'chest', bow * 0.25 - breath * 0.5);
  set(vrm, 'neck', bow * 0.15);
  set(vrm, 'head', bow * 0.2);
  set(vrm, 'leftUpperLeg', -s * 0.45 * amt);
  set(vrm, 'rightUpperLeg', s * 0.45 * amt);
  set(vrm, 'leftLowerLeg', Math.max(0, s) * 0.6 * amt);
  set(vrm, 'rightLowerLeg', Math.max(0, -s) * 0.6 * amt);
  // 腕は下ろし、歩くと脚と逆に振る。お辞儀では前で手を重ねる
  const sway = Math.sin(t * 1.1) * 0.02;
  set(vrm, 'leftUpperArm', s * 0.35 * amt - bow * 0.3, 0, -1.28 + sway + bow * 0.25);
  set(vrm, 'leftLowerArm', 0, -bow * 0.6 - 0.08, 0);
  if (wave) {
    // 右手を上げて振る
    set(vrm, 'rightUpperArm', 0, 0, 1.28 - wave * 1.5);
    set(vrm, 'rightLowerArm', 0, 0, -wave * (1.35 + Math.sin(t * 8) * 0.35));
  } else {
    set(vrm, 'rightUpperArm', -s * 0.35 * amt - bow * 0.3, 0, 1.28 - sway - bow * 0.25);
    set(vrm, 'rightLowerArm', 0, bow * 0.6 + 0.08, 0);
  }
}

// ワルツの姿勢（dance.beat：拍の位置、dance.role：lead 執事／follow 相手）
// lead は左手で相手の右手を取り、右手を相手の背中へ。follow は右手を預け、左手を相手の肩に置く
// 左腕は y がマイナスで前へ、右腕は y がプラスで前へ（z で上げ下げ）
function waltz(vrm, d) {
  const sway = Math.sin(d.beat / 3 * Math.PI * 2);        // 1小節で揺れが一巡
  const down = d.beat % 3 < 1 ? 1 - (d.beat % 3) : 0;       // 1拍目で沈み、2・3拍目で伸び上がる
  const step = Math.sin(d.beat * Math.PI);                  // 拍ごとに出す脚が替わる（ボックスステップ）
  const lead = d.role === 'lead';
  set(vrm, 'spine', 0.03 + down * 0.05, 0, sway * 0.08);
  set(vrm, 'chest', -0.04, 0, sway * 0.04);
  set(vrm, 'neck', 0, lead ? 0.2 : -0.2, 0);
  set(vrm, 'head', -0.06, lead ? 0.25 : -0.25, sway * 0.05);   // 顔は相手の肩越しに
  set(vrm, 'leftUpperLeg', -step * 0.28 - down * 0.1); set(vrm, 'rightUpperLeg', step * 0.28 - down * 0.1);
  set(vrm, 'leftLowerLeg', Math.max(0, step) * 0.35 + down * 0.15); set(vrm, 'rightLowerLeg', Math.max(0, -step) * 0.35 + down * 0.15);
  if (lead) {
    set(vrm, 'leftUpperArm', 0, -0.45, -0.3); set(vrm, 'leftLowerArm', 0, -1.2, 0);
    set(vrm, 'rightUpperArm', 0, 0.85, 0.65); set(vrm, 'rightLowerArm', 0, 1.25, 0);
  } else {
    set(vrm, 'rightUpperArm', 0, 0.45, 0.3); set(vrm, 'rightLowerArm', 0, 1.2, 0);
    set(vrm, 'leftUpperArm', 0, -1.0, -0.45); set(vrm, 'leftLowerArm', 0, -0.7, 0);
  }
}

// 毎フレーム呼ぶ。moving：歩いているか
// 会話の顔（portrait.js）は同じ VRM を借りて描くので、屋敷で動かした時刻を覚えておき、二重に動かさないようにする
// 姿勢だけをつける（m：動きの状態。舞踏会の客の複製は、それぞれの状態で同じ型の VRM を動かす）
export function poseWith(vrm, m, moving, dt, extra = {}) {
  m.t = (m.t || 0) + dt;
  m.walk = moving ? (m.walk || 0) + dt * 10 : 0;
  m.amt = smooth(m.amt || 0, moving ? 1 : 0, dt * 8);
  m.bow = smooth(m.bow || 0, extra.pose === 'bow' ? 1 : 0, dt * 4);
  m.wave = smooth(m.wave || 0, extra.pose === 'wave' ? 1 : 0, dt * 5);
  pose(vrm, m.walk, m.amt, m.t, { bow: m.bow, wave: m.wave, dance: extra.dance });
}
export function driveVRM(vrm, moving, dt, extra = {}) {
  const m = vrm.motion;
  if (!extra.portrait) m.lastDrive = performance.now();
  poseWith(vrm, m, moving, dt, extra);
  // まばたき（表情を作っている間は控えめに）
  m.blink -= dt;
  let b = 0;
  if (m.blink < 0.15) b = Math.sin(Math.max(0, m.blink) / 0.15 * Math.PI);
  if (m.blink < 0) m.blink = 2 + Math.random() * 4;
  const em = vrm.expressionManager;
  if (em) {
    for (const [k, v] of Object.entries(extra.face || {})) m.face[k] = v;
    let busy = 0;
    for (const [k, target] of Object.entries(m.face)) {
      const now = smooth(em.getValue(k) || 0, target, dt * 8);
      em.setValue(k, now); busy = Math.max(busy, now);
    }
    em.setValue('blink', b * (1 - busy));
    // 話している間は口を動かす（extra.talk：0〜1）
    if (extra.talk != null) em.setValue('aa', extra.talk * (0.25 + 0.5 * Math.abs(Math.sin(m.t * 13))) * (1 - busy * 0.5));
  }
  // 屋敷の中の人物は、揺れもの（髪・スカート）・視線・材質の時間の計算を省き、骨と表情だけ動かす（形は固定）
  // とても小さく映るので、見た目はほとんど変わらない。会話の顔（portrait）と人物照会（viewer）では揺らす
  if (vrm.scene.userData.mansion && !extra.portrait) { vrm.humanoid.update(); if (em) em.update(); }
  else vrm.update(dt);
}
// 人が多い場面（舞踏会）：会話の顔を描く回数も減らす（portrait.js）
let crowd = false;
export function setCrowd(on) { crowd = on; }
export const crowdMode = () => crowd;
export function setOutline(root, on) {
  root.traverse(o => { if (o.isMesh && Array.isArray(o.material)) for (const m of o.material) if (m.isOutline) m.visible = on; });
}

// 口だけ動かす（屋敷で動いている人を会話の顔に映すとき）。talk：0〜1
export function talkMouth(vrm, talk) {
  const em = vrm.expressionManager;
  if (!em) return;
  em.setValue('aa', talk * (0.25 + 0.5 * Math.abs(Math.sin(vrm.motion.t * 13))));
  em.update();
}

// 屋敷の人物（engine.makeChar の入れ物）に VRM を入れる
// 屋敷の中では、輪郭線を省き、影を落とさない（足元の丸い影は day3d.js が置く）。会話の顔を描くときだけ輪郭線を戻す
export function attachVRM(ch, vrm) {
  if (ch.vrm) ch.g.remove(ch.vrm.scene);
  if (!vrm.scene.userData.mansion) {
    vrm.scene.userData.mansion = true;
    setOutline(vrm.scene, false);
    vrm.scene.traverse(o => { if (o.isMesh) o.castShadow = false; });
  }
  ch.vrm = vrm;
  ch.g.add(vrm.scene);
  ch.drive = (moving, dt) => driveVRM(vrm, moving, dt);
}

// ゲームを始める前に、今の章で屋敷にいる人を読み込んでおく（人物が後から現れたり、顔が空のまま話したりしないように）
// 端末のメモリを節約するため、まだ来ていないメイドや、最終章だけの巡回員は、要るときまで読み込まない
// 二人きりの雫の部屋着（black2）は会話の顔だけで使うので、ファイルを端末に落とすだけにする（会話で初めて使うときに読み込む）
// onProgress(0〜1, 読み込み済みの人数, 全員の人数)
// 舞踏会の一般客（guest_*）は assets/vrm/guest/ にある軽い版
export const kindOf = id => id.startsWith('guest_') ? 'guest' : 'lite';
export const loaded = (id, kind = kindOf(id)) => cache.has(`${kind}/${id}`);
export async function preloadCast(onProgress, want = CAST) {
  const ids = [...want, ...(want.includes('black') ? ['black2'] : [])], n = ids.length;
  for (let i = 0; i < n; i++) {
    const tell = f => onProgress && onProgress((i + f) / n, i, n);
    tell(0);
    if (ids[i] === 'black2') await fetchOnly(new URL('../assets/vrm/lite/black2.vrm', import.meta.url).href);
    else await loadVRM(ids[i], kindOf(ids[i]), tell);
  }
  onProgress && onProgress(1, n, n);
}
async function fetchOnly(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  await r.arrayBuffer();
}

export { THREE };
