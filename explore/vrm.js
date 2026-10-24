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
export function loadVRM(id, kind = 'lite', onProgress) {
  const key = `${kind}/${id}`;
  if (!cache.has(key)) {
    const url = new URL(`../assets/vrm/${key}.vrm`, import.meta.url).href;
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
export function disposeVRM(id, kind) {
  const key = `${kind}/${id}`;
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

// 毎フレーム呼ぶ。moving：歩いているか
export function driveVRM(vrm, moving, dt, extra = {}) {
  const m = vrm.motion;
  m.t += dt;
  m.walk = moving ? m.walk + dt * 10 : 0;
  m.amt = smooth(m.amt || 0, moving ? 1 : 0, dt * 8);
  m.bow = smooth(m.bow || 0, extra.pose === 'bow' ? 1 : 0, dt * 4);
  m.wave = smooth(m.wave || 0, extra.pose === 'wave' ? 1 : 0, dt * 5);
  pose(vrm, m.walk, m.amt, m.t, { bow: m.bow, wave: m.wave });
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
  }
  vrm.update(dt);
}

// 屋敷の簡易モデル（engine.makeChar）を VRM に差し替える
export function attachVRM(ch, vrm) {
  if (ch.vrm) ch.g.remove(ch.vrm.scene);
  ch.vrm = vrm;
  ch.body.visible = false;
  ch.g.add(vrm.scene);
  ch.drive = (moving, dt) => driveVRM(vrm, moving, dt);
}
export function detachVRM(ch) {
  if (!ch.vrm) return;
  ch.g.remove(ch.vrm.scene);
  ch.vrm = null; ch.drive = null;
  ch.body.visible = true;
}

export { THREE };
