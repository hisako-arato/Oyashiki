// 仮面舞踏会の仮面：ベネチア風の半仮面を、ゲームの中で作って頭の骨に付ける（仮面姿の VRM は作らない）
// 人物ごとに色と飾りを変える。0時の仮面外し（仮面を右手へ下ろす）と、床に落ちた仮面の切れ端も作る
import * as THREE from '../vendor/three.module.min.js';

// 人物ごとの仮面：base 仮面の色、trim 縁取り、deco 飾り（feather 羽根／gem 宝石／lace 下の縁飾り）
export const MASK_STYLE = {
  butler: { base: 0x15151c, trim: 0xc9a45c, deco: null },
  father: { base: 0x6b1020, trim: 0xd8b25a, deco: 'gem' },
  mother: { base: 0x2c1d4a, trim: 0xd9c08a, deco: 'feather', plume: 0x6d4fb0 },
  daughter: { base: 0xf2e6ee, trim: 0xc9a45c, deco: 'feather', plume: 0xf6c6d8 },
  reiko: { base: 0xa01a2a, trim: 0x1b1b1b, deco: 'lace' },
  dealer: { base: 0x34343c, trim: 0xb8b8c2, deco: null },
  black: { base: 0x1c1c26, trim: 0x9aa3b5, deco: 'lace' },
  guest: [
    { base: 0x1f4a6b, trim: 0xd8b25a, deco: 'feather', plume: 0x3d7fb0 },
    { base: 0x2f5a2a, trim: 0xd8b25a, deco: 'gem' },
    { base: 0x7a4a10, trim: 0xf0d58a, deco: null },
    { base: 0x5a1a50, trim: 0xd8b25a, deco: 'feather', plume: 0xb04a9a },
    { base: 0xd9cfb4, trim: 0x8a6a2a, deco: 'lace' },
    { base: 0x101010, trim: 0xb0b0b8, deco: 'gem' },
  ],
};
export const styleOf = (id, k = 0) => (id !== 'guest' && MASK_STYLE[id]) || MASK_STYLE.guest[k % MASK_STYLE.guest.length];

// 仮面の輪郭（幅 1、目の高さが 0）。外側の端が猫の目のように跳ね上がり、下の真ん中は鼻の形にくぼむ
function outline(scale = 1) {
  const s = new THREE.Shape(), k = scale;
  s.moveTo(0, 0.2 * k);
  s.bezierCurveTo(0.18 * k, 0.26 * k, 0.36 * k, 0.24 * k, 0.5 * k, 0.32 * k);   // 右の上の縁（跳ね上がり）
  s.bezierCurveTo(0.53 * k, 0.12 * k, 0.48 * k, -0.12 * k, 0.34 * k, -0.2 * k);  // 右の外側
  s.bezierCurveTo(0.22 * k, -0.26 * k, 0.12 * k, -0.2 * k, 0.07 * k, -0.08 * k); // 右の頬から鼻へ
  s.quadraticCurveTo(0, 0.02 * k, -0.07 * k, -0.08 * k);                         // 鼻のくぼみ
  s.bezierCurveTo(-0.12 * k, -0.2 * k, -0.22 * k, -0.26 * k, -0.34 * k, -0.2 * k);
  s.bezierCurveTo(-0.48 * k, -0.12 * k, -0.53 * k, 0.12 * k, -0.5 * k, 0.32 * k);
  s.bezierCurveTo(-0.36 * k, 0.24 * k, -0.18 * k, 0.26 * k, 0, 0.2 * k);
  return s;
}
function eyeHole(x) {
  const h = new THREE.Path();
  h.absellipse(x, 0, 0.14, 0.09, 0, Math.PI * 2, false, x > 0 ? -0.18 : 0.18);
  return h;
}
// 顔の丸みに沿わせて曲げる（端ほど後ろへ）
function bend(geo, r = 0.55) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, p.getZ(i) - (x * x) / (2 * r)); }
  geo.computeVertexNormals();
  return geo;
}
const mats = new Map();
function mat(color, metal = 0.35) {
  const key = `${color}/${metal}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: metal > 0.5 ? 0.35 : 0.7, side: THREE.DoubleSide }));
  return mats.get(key);
}

// 仮面を1つ作る（幅 1。付けるときに顔の大きさへ縮める）。前は +Z
export function makeMask(style) {
  const g = new THREE.Group();
  const face = outline(1);
  face.holes.push(eyeHole(0.2), eyeHole(-0.2));
  g.add(new THREE.Mesh(bend(new THREE.ShapeGeometry(face, 14)), mat(style.base, 0.15)));
  // 縁取り：少し大きい輪郭から仮面の形をくり抜いた輪
  const rim = outline(1.07), inner = outline(1);
  rim.holes.push(new THREE.Path(inner.getPoints(24).reverse()));
  const rm = new THREE.Mesh(bend(new THREE.ShapeGeometry(rim, 14)), mat(style.trim, 0.8));
  rm.position.set(0, -0.004, -0.002); g.add(rm);
  if (style.deco === 'feather') {
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), mat(i ? style.plume : style.trim, i ? 0.05 : 0.8));
      f.scale.set(0.12 - i * 0.02, 0.5 - i * 0.08, 1);
      f.position.set(0.46 + i * 0.05, 0.62 - i * 0.05, -0.14 - i * 0.01);
      f.rotation.z = -0.5 - i * 0.25;
      g.add(f);
    }
  } else if (style.deco === 'gem') {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), mat(0xe8f4ff, 0.9));
    gem.position.set(0, 0.24, 0.02); g.add(gem);
  } else if (style.deco === 'lace') {
    // 頬の下の縁に沿って、小さな飾りを下げる（鼻の下には付けない）
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.028, 8), mat(style.trim, 0.3));
      const x = side * (0.16 + i * 0.07);
      d.position.set(x, -0.24 + 1.2 * (Math.abs(x) - 0.3) ** 2 + (i === 4 ? 0.06 : 0), 0.004 - (x * x) / 1.1);
      g.add(d);
    }
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; o.userData.maskPart = true; } });
  g.userData.mask = true;
  return g;
}

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q = new THREE.Quaternion();
// 頭の骨に仮面を付ける。root：VRM の scene（複製した客なら複製の scene）、head・eyes：骨のノード
// 目の骨の高さで、顔の正面から光線を当てて顔の表面を探し、その少し前に置く（目の骨は頭の奥にあるので、前後は当てにしない）
const ray = new THREE.Raycaster();
export function wearMask(root, head, eyes, style, width) {
  if (!head) return null;
  root.updateMatrixWorld(true);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(q)).normalize();
  head.getWorldPosition(v1);
  const eyeY = eyes && eyes[0] ? eyes[0].getWorldPosition(v2).y : v1.y + 0.065;
  const axis = v1.clone(); axis.y = eyeY;
  let center = axis.clone().addScaledVector(fwd, 0.085);
  ray.set(axis.clone().addScaledVector(fwd, 0.6), fwd.clone().negate());
  ray.far = 0.6;
  const meshes = [];
  root.traverse(o => { if (o.isMesh && !o.userData.maskPart) meshes.push(o); });
  const hit = ray.intersectObjects(meshes, false)[0];
  if (hit) center = hit.point.clone().addScaledVector(fwd, 0.008);
  // 大きさは背の高さで少し変える（目の高さ 1.55m で幅 15cm）
  width = width || 0.15 * Math.sqrt(Math.max(0.6, eyeY) / 1.55);
  // 見た目の位置（世界の座標）で作ってから、そのまま頭の骨へ付け替える
  const m = makeMask(style);
  m.position.copy(center); m.quaternion.copy(root.getWorldQuaternion(q)); m.scale.setScalar(width);
  m.updateMatrixWorld(true);
  head.attach(m);
  m.userData.home = { p: m.position.clone(), q: m.quaternion.clone() };
  return m;
}
// VRM（three-vrm）に仮面を付ける
export function maskVRM(vrm, style) {
  const h = vrm.humanoid, raw = n => h.getRawBoneNode(n);
  if (vrm.mask) return vrm.mask;
  vrm.mask = wearMask(vrm.scene, raw('head'), [raw('leftEye'), raw('rightEye')], style);
  return vrm.mask;
}
export function unmaskVRM(vrm) {
  if (!vrm.mask) return;
  vrm.mask.parent && vrm.mask.parent.remove(vrm.mask);
  vrm.mask = null;
}

// 0時の仮面外し：仮面を顔から外し、右手まで下ろして持たせる（dur 秒）
const tweens = new Set();
export function liftMask(mask, hand, dur = 0.9) {
  if (!mask || !hand) return;
  const from = { p: mask.getWorldPosition(new THREE.Vector3()), q: mask.getWorldQuaternion(new THREE.Quaternion()) };
  tweens.add({ mask, hand, from, t: 0, dur });
}
export function updateMasks(dt) {
  for (const tw of tweens) {
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur), e = k * k * (3 - 2 * k);
    const to = tw.hand.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.04, 0.05));
    const p = tw.from.p.clone().lerp(to, e);
    p.y += Math.sin(k * Math.PI) * 0.08;   // 一度持ち上げてから下ろす
    const parent = tw.mask.parent;
    if (parent) { parent.updateMatrixWorld(true); tw.mask.position.copy(parent.worldToLocal(p)); }
    if (k >= 1) { tw.hand.attach(tw.mask); tweens.delete(tw); }
  }
}

// 床に落ちた仮面の切れ端（ENDING 3）：仮面の右の端だけを割った形
export function maskFragment(style, size = 0.17) {
  const s = new THREE.Shape();
  s.moveTo(0.18, 0.24); s.bezierCurveTo(0.36, 0.24, 0.42, 0.26, 0.5, 0.32);
  s.bezierCurveTo(0.53, 0.12, 0.48, -0.12, 0.34, -0.2);
  s.lineTo(0.27, -0.05); s.lineTo(0.31, 0.06); s.lineTo(0.22, 0.12); s.lineTo(0.18, 0.24);
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s, 8), mat(style.base, 0.15));
  const r = new THREE.Mesh(new THREE.ShapeGeometry(s, 8), mat(style.trim, 0.8));
  r.scale.setScalar(1.05); r.position.z = -0.003;
  g.add(m, r);
  g.scale.setScalar(size);
  g.rotation.x = -Math.PI / 2;   // 床に寝かせる
  return g;
}
