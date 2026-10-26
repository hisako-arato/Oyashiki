// 舞踏会の一般客：4体の軽い VRM（assets/vrm/guest/）を、形と画像を共有したまま複製して10〜20人に見せる
// 複製は骨だけを別に持つ。毎フレーム、元の VRM にその客の姿勢をつけ、骨の向きを複製へ写す
// （複製の作り方は three.js の SkeletonUtils.clone と同じ。MIT License, Copyright 2010-2024 three.js authors）
import * as THREE from '../vendor/three.module.min.js';
import { loadVRM, poseWith } from './vrm.js';
import { wearMask, liftMask, styleOf } from './masks.js';

export const GUEST_IDS = ['guest_m1', 'guest_m2', 'guest_f1', 'guest_f2'];
export const loadGuest = (id, onProgress) => loadVRM(id, 'guest', onProgress);

function walk(a, b, fn) { fn(a, b); for (let i = 0; i < a.children.length; i++) walk(a.children[i], b.children[i], fn); }
function cloneScene(source) {
  const toSrc = new Map(), toClone = new Map();
  const copy = source.clone();
  walk(source, copy, (s, c) => { toSrc.set(c, s); toClone.set(s, c); });
  copy.traverse(node => {
    if (!node.isSkinnedMesh) return;
    const src = toSrc.get(node);
    node.skeleton = src.skeleton.clone();
    node.bindMatrix.copy(src.bindMatrix);
    node.skeleton.bones = src.skeleton.bones.map(b => toClone.get(b));
    node.bind(node.skeleton, node.bindMatrix);
  });
  return { copy, toClone };
}

// 客を1人作る。k：仮面の色を選ぶ番号。戻り値の g を場面に置き、update(dt, moving, extra) を毎フレーム呼ぶ
export function makeGuest(master, k = 0) {
  const { copy, toClone } = cloneScene(master.scene);
  // 写す骨（元 → 複製）
  const pairs = [];
  master.scene.traverse(o => { if (o.isBone || o.type === 'Bone') pairs.push([o, toClone.get(o)]); });
  const raw = n => toClone.get(master.humanoid.getRawBoneNode(n));
  const g = new THREE.Group();
  g.add(copy);
  const m = { t: Math.random() * 10 };
  const guest = {
    g, mask: null, k,
    hand: raw('rightHand'),
    update(dt, moving = false, extra = {}) {
      poseWith(master, m, moving, dt, extra);
      master.humanoid.update();
      for (const [a, b] of pairs) { b.quaternion.copy(a.quaternion); b.position.copy(a.position); }
    },
    wearMask() { if (!guest.mask) guest.mask = wearMask(copy, raw('head'), [raw('leftEye'), raw('rightEye')], styleOf('guest', k)); return guest.mask; },
    unmask() { liftMask(guest.mask, guest.hand); },
    dispose() { g.parent && g.parent.remove(g); },
  };
  guest.update(0);
  return guest;
}
