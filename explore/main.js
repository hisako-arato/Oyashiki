// 探索の試作：2F 書斎と廊下（ローポリ3D・斜め見下ろし）
import '../js/lockdown.js';
import * as THREE from '../vendor/three.module.min.js';

// ---- 描画の準備 ----
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#120c14');
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
const CAM_OFFSET = new THREE.Vector3(12, 14, 12);

function resize() {
  const w = innerWidth, h = innerHeight, a = w / h;
  renderer.setSize(w, h, false);
  const halfH = a >= 1 ? 6.5 : 6.5 / a * 0.7;
  camera.left = -halfH * a; camera.right = halfH * a; camera.top = halfH; camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

scene.add(new THREE.HemisphereLight('#fff1dc', '#3a2a30', 1.1));
const sun = new THREE.DirectionalLight('#ffe2b8', 1.8);
sun.position.set(-8, 16, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 });
sun.shadow.bias = -0.0008;
scene.add(sun);

// ---- 素材（テクスチャはすべてプログラムで描く） ----
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const rand = (() => { let a = 7; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();

const woodTex = canvasTex(256, 256, (g, w, h) => {
  for (let i = 0; i < 8; i++) {
    const l = 30 + rand() * 10;
    g.fillStyle = `hsl(25, 45%, ${l}%)`;
    g.fillRect(0, i * 32, w, 32);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(0, i * 32, w, 2);
    const joint = rand() * w;
    g.fillRect(joint, i * 32, 2, 32);
    g.fillStyle = 'rgba(255,255,255,.05)';
    for (let k = 0; k < 6; k++) g.fillRect(0, i * 32 + 4 + rand() * 24, w, 1);
  }
});
const wallTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d8c7a2';
  for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 12, h);
  g.fillStyle = '#c9b38a';
  for (let y = 16; y < h; y += 32) for (let x = 6; x < w; x += 32) {
    g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 5, y); g.lineTo(x, y + 6); g.lineTo(x - 5, y); g.fill();
  }
});
const carpetTex = canvasTex(256, 192, (g, w, h) => {
  g.fillStyle = '#c9a24a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#7a2a2a'; g.fillRect(8, 8, w - 16, h - 16);
  g.fillStyle = '#2f6a4a'; g.fillRect(18, 18, w - 36, h - 36);
  g.strokeStyle = '#c9a24a'; g.lineWidth = 2; g.strokeRect(26, 26, w - 52, h - 52);
});
const runnerTex = canvasTex(256, 32, (g, w, h) => {
  g.fillStyle = '#8a1f2a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d4a94e'; g.fillRect(0, 3, w, 2); g.fillRect(0, h - 5, w, 2);
});
const paintingTex = canvasTex(128, 96, (g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0b1a3a'); sky.addColorStop(1, '#25406a');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f6eab0'; g.beginPath(); g.arc(92, 22, 11, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1c3a2a'; g.fillRect(0, 60, w, 36);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(240,240,255,${0.5 + rand() * 0.5})`; g.beginPath(); g.arc(rand() * w, 62 + rand() * 32, 1.5 + rand() * 1.5, 0, 7); g.fill(); }
});
function tiled(tex, rx, ry) { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return t; }

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });
const M = {
  wood: mat('#6b3f22'), darkWood: mat('#3f2414'), gold: mat('#c9a24a', { metalness: 0.5, roughness: 0.4 }),
  white: mat('#f4f1ea'), black: mat('#1e1e26'), skin: mat('#f1d1b5'), glass: mat('#bfe0ff', { emissive: '#6b8fb8', emissiveIntensity: 0.6 }),
  green: mat('#3f6b3a'), paper: mat('#efe6cf'), wainscot: mat('#4a2a18'),
};

function mesh(geo, material, x = 0, y = 0, z = 0, parent = scene) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
// y は底面の高さ
const box = (w, h, d, material, x, y, z, parent) => mesh(new THREE.BoxGeometry(w, h, d), material, x, y + h / 2, z, parent);

// ---- 当たり判定 ----
const solids = [];
const solid = (minX, maxX, minZ, maxZ, tag) => { const s = { minX, maxX, minZ, maxZ, tag }; solids.push(s); return s; };

// ---- 床 ----
function floor(x1, x2, z1, z2, material) {
  const m = mesh(new THREE.PlaneGeometry(x2 - x1, z2 - z1), material, (x1 + x2) / 2, 0, (z1 + z2) / 2);
  m.rotation.x = -Math.PI / 2; m.castShadow = false;
  return m;
}
floor(-5, 5, -5, 3, mat('#ffffff', { map: tiled(woodTex, 3, 3) }));
floor(-9, 9, 3, 6, mat('#d9c3a0', { map: tiled(woodTex, 6, 1) }));
const secretObjs = [floor(-4, -1, -8, -5, mat('#5a4a40'))];
const carpet = mesh(new THREE.PlaneGeometry(6, 4.5), mat('#ffffff', { map: carpetTex }), -0.2, 0.01, -0.6);
carpet.rotation.x = -Math.PI / 2; carpet.castShadow = false;
const runner = mesh(new THREE.PlaneGeometry(17, 1.1), mat('#ffffff', { map: tiled(runnerTex, 6, 1) }), 0, 0.01, 4.6);
runner.rotation.x = -Math.PI / 2; runner.castShadow = false;

// ---- 壁（カメラ側の壁は、主人公の位置に応じて低くする） ----
const WALL_H = 3, WALL_T = 0.2, LOW = 0.17;
const walls = [];
function wall(axis, c, a, b, opts = {}) {
  const len = b - a, mid = (a + b) / 2;
  const g = new THREE.Group();
  const y0 = opts.y0 || 0, h = opts.h || WALL_H;
  g.position.set(axis === 'z' ? mid : c, y0, axis === 'z' ? c : mid);
  if (axis === 'x') g.rotation.y = Math.PI / 2;
  box(len, h, WALL_T, mat('#ffffff', { map: tiled(wallTex, len / 1.5, h / 1.5) }), 0, 0, 0, g);
  if (!opts.y0) {
    box(len, 1, WALL_T + 0.06, M.wainscot, 0, 0, 0, g);
    box(len, 0.08, WALL_T + 0.1, M.gold, 0, 1, 0, g);
  }
  box(len, 0.15, WALL_T + 0.12, M.darkWood, 0, h - 0.15, 0, g);
  scene.add(g);
  const w = { g, axis, c, scale: 1, hideWhenLow: !!opts.y0, decor: [] };
  walls.push(w);
  if (!opts.y0) {
    const half = WALL_T / 2;
    if (axis === 'z') solid(a, b, c - half, c + half); else solid(c - half, c + half, a, b);
  }
  return w;
}
// 書斎
const backL = wall('z', -5, -5, -3.4);
wall('z', -5, -1.6, 5);
wall('z', -5, -3.4, -1.6, { y0: 2.6, h: 0.4 });
const studyLeft = wall('x', -5, -5, 3);
wall('x', 5, -5, 3);
// 書斎と廊下の境（扉の開口あり）
const divL = wall('z', 3, -9, -1);
const divR = wall('z', 3, 1, 9);
wall('z', 3, -1, 1, { y0: 2.4, h: 0.6 });
// 廊下
wall('z', 6, -9, 9);
wall('x', -9, 3, 6);
wall('x', 9, 3, 6);
// 隠し部屋
secretObjs.push(wall('z', -8, -4, -1).g, wall('x', -4, -8, -5).g, wall('x', -1, -8, -5).g);

function decor(w, obj) { w.g.add(obj); w.decor.push(obj); }

// 扉の枠
for (const x of [-1.05, 1.05]) box(0.12, 2.5, 0.3, M.gold, x, 0, 3);
// 廊下の閉じた扉（主寝室・お嬢様の部屋）
for (const [w, x] of [[divL, -7 - (-5)], [divR, 7 - 5]]) {
  const d = box(1.2, 2.3, 0.08, M.darkWood, x, 0, 0.14, w.g); decor(w, d);
  const knob = box(0.1, 0.1, 0.08, M.gold, x + 0.4, 1.1, 0.2, w.g); decor(w, knob);
}
// 廊下の肖像画
for (const [w, x] of [[divL, 2], [divR, -2]]) {
  const f = box(1.1, 1.3, 0.06, M.gold, x, 1.3, 0.13, w.g); decor(w, f);
  const p = box(0.9, 1.1, 0.04, mat('#5a4636'), x, 1.4, 0.16, w.g); decor(w, p);
}
// 書斎の左壁：窓と肖像画
{
  const win = box(1.8, 1.5, 0.05, M.glass, 1, 1.0, 0.12, studyLeft.g); decor(studyLeft, win);
  for (const dx of [-0.95, 0.95]) decor(studyLeft, box(0.1, 1.6, 0.1, M.gold, 1 + dx, 0.95, 0.12, studyLeft.g));
  decor(studyLeft, box(1.9, 0.1, 0.12, M.gold, 1, 2.5, 0.12, studyLeft.g));
  decor(studyLeft, box(1.9, 0.1, 0.12, M.gold, 1, 0.95, 0.12, studyLeft.g));
  decor(studyLeft, box(1.0, 1.2, 0.06, M.gold, -2.4, 1.2, 0.12, studyLeft.g));
  decor(studyLeft, box(0.8, 1.0, 0.05, mat('#2e3a52'), -2.4, 1.3, 0.15, studyLeft.g));
}

// ---- 家具 ----
const BOOK_COLORS = ['#7a2a2a', '#2a4a6a', '#3a5a2a', '#6a5a2a', '#4a2a4a', '#2a2a2a', '#8a6a3a'];
function bookshelf(x, z, w, withRed) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const d = 0.5, h = 2.6, rows = 5;
  box(w, h, 0.06, M.darkWood, 0, 0, -d / 2 + 0.03, g);
  for (const sx of [-w / 2, w / 2]) box(0.08, h, d, M.wood, sx, 0, 0, g);
  let red = null;
  for (let r = 0; r <= rows; r++) {
    const y = 0.1 + r * (h - 0.2) / rows;
    box(w, 0.06, d, M.wood, 0, y, 0, g);
    if (r === rows) break;
    let bx = -w / 2 + 0.1;
    let i = 0;
    while (bx < w / 2 - 0.15) {
      const bw = 0.07 + rand() * 0.05, bh = 0.3 + rand() * 0.12;
      const isRed = withRed && r === 0 && i === 6; // 上から5段目
      const b = box(bw, bh, 0.32, isRed ? mat('#d0221c', { emissive: '#400000' }) : mat(BOOK_COLORS[Math.floor(rand() * BOOK_COLORS.length)]), bx + bw / 2, y + 0.06, 0.02, g);
      if (isRed) red = b;
      bx += bw + 0.01; i++;
    }
  }
  scene.add(g);
  return { g, red, box: solid(x - w / 2, x + w / 2, z - d / 2, z + d / 2) };
}
const secretShelf = bookshelf(-2.5, -4.65, 2.2, true);
// 隠し本棚は左端を軸に、扉のように手前へ開く
const hinge = new THREE.Group();
hinge.position.set(-3.6, 0, -4.4);
scene.add(hinge);
hinge.add(secretShelf.g);
secretShelf.g.position.set(1.1, 0, -0.25);
bookshelf(2.5, -4.65, 2.2, false);

// 机と椅子
box(1.9, 0.08, 0.95, M.wood, 2.4, 0.75, -1.2);
for (const [dx, dz] of [[-0.85, -0.4], [0.85, -0.4], [-0.85, 0.4], [0.85, 0.4]]) box(0.1, 0.75, 0.1, M.darkWood, 2.4 + dx, 0, -1.2 + dz);
box(0.5, 0.4, 0.85, M.darkWood, 1.8, 0.35, -1.2);
box(0.5, 0.02, 0.35, M.paper, 2.6, 0.83, -1.1);
box(0.08, 0.4, 0.08, M.gold, 3.1, 0.83, -1.5);
mesh(new THREE.ConeGeometry(0.22, 0.25, 8, 1, true), mat('#2f6a4a', { side: THREE.DoubleSide, emissive: '#c99a3a', emissiveIntensity: 0.3 }), 3.1, 1.32, -1.5);
const lamp = new THREE.PointLight('#ffcf8a', 6, 7, 1.5);
lamp.position.set(3.1, 1.3, -1.5);
scene.add(lamp);
box(0.6, 0.45, 0.6, mat('#6a2a2a'), 3.6, 0, -1.2);
box(0.6, 0.6, 0.12, mat('#6a2a2a'), 3.6, 0.45, -0.95);
solid(1.4, 3.95, -1.7, -0.7, 'desk');

// 地球儀
box(0.08, 0.8, 0.08, M.darkWood, -3.8, 0, 1.8);
mesh(new THREE.IcosahedronGeometry(0.32, 1), mat('#3a6a9a'), -3.8, 1.1, 1.8);
solid(-4.1, -3.5, 1.5, 2.1);
// 肘掛け椅子
box(0.9, 0.45, 0.9, mat('#7a3a2a'), -3.9, 0, -0.6);
box(0.2, 0.7, 0.9, mat('#7a3a2a'), -4.3, 0.45, -0.6);
solid(-4.4, -3.45, -1.05, -0.15);
// 鉢植え
box(0.4, 0.4, 0.4, mat('#8a5a3a'), 4.5, 0, 2.4);
mesh(new THREE.IcosahedronGeometry(0.45, 0), M.green, 4.5, 0.9, 2.4);
solid(4.25, 4.75, 2.15, 2.65);

// 廊下：台座の花瓶と花台
for (const x of [-4.2, 4.2]) {
  box(0.5, 0.9, 0.5, M.white, x, 0, 3.45);
  mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.45, 8), mat('#2a4a8a'), x, 1.12, 3.45);
  solid(x - 0.25, x + 0.25, 3.2, 3.7);
}
box(1.0, 0.75, 0.5, M.wood, -1.6, 0, 5.6);
mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.3, 8), M.white, -1.6, 0.9, 5.6);
for (let i = 0; i < 5; i++) mesh(new THREE.IcosahedronGeometry(0.09, 0), mat(['#e0607a', '#f4f1ea', '#e8c04a'][i % 3]), -1.6 + (rand() - 0.5) * 0.25, 1.1 + rand() * 0.15, 5.6 + (rand() - 0.5) * 0.2);
box(0.25, 0.01, 0.15, M.paper, -1.25, 0.75, 5.5);
solid(-2.1, -1.1, 5.35, 5.85);

// 隠し部屋：イーゼルと絵
const easel = new THREE.Group();
easel.position.set(-2.5, 0, -7.2);
box(0.08, 1.8, 0.08, M.darkWood, -0.5, 0, 0, easel);
box(0.08, 1.8, 0.08, M.darkWood, 0.5, 0, 0, easel);
box(1.3, 1.0, 0.08, M.gold, 0, 0.8, 0.05, easel);
box(1.15, 0.85, 0.02, mat('#ffffff', { map: paintingTex, emissive: '#222244' }), 0, 0.88, 0.1, easel);
scene.add(easel);
secretObjs.push(easel);
// 本棚を開けるまで、隠し部屋は見えない
for (const o of secretObjs) o.visible = false;
solid(-3.2, -1.8, -7.5, -6.9);
const spot = new THREE.SpotLight('#cfe0ff', 0, 6, 0.5, 0.6);
spot.position.set(-2.5, 2.8, -5.6);
spot.target.position.set(-2.5, 1.2, -7.2);
scene.add(spot, spot.target);

// ---- 人物 ----
function makeChar({ outfit, hair, maid }) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const legs = [];
  for (const x of [-0.1, 0.1]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.55, 0);
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6), M.black, 0, -0.27, 0, leg);
    body.add(leg); legs.push(leg);
  }
  if (maid) {
    mesh(new THREE.ConeGeometry(0.36, 0.6, 8), mat(outfit), 0, 0.72, 0, body);
    box(0.36, 0.5, 0.04, M.white, 0, 0.45, 0.19, body);
    mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.4, 8), mat(outfit), 0, 1.15, 0, body);
  } else {
    mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.6, 8), mat(outfit), 0, 0.98, 0, body);
    box(0.14, 0.3, 0.04, M.white, 0, 1.0, 0.17, body);
    box(0.14, 0.05, 0.05, M.black, 0, 1.24, 0.19, body);
  }
  for (const x of [-0.24, 0.24]) {
    const arm = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), maid ? mat(outfit) : mat(outfit), x, 1.05, 0, body);
    arm.rotation.z = x > 0 ? 0.15 : -0.15;
  }
  mesh(new THREE.IcosahedronGeometry(0.25, 1), M.skin, 0, 1.55, 0, body);
  const hairM = mat(hair);
  const cap = mesh(new THREE.SphereGeometry(0.27, 10, 6, 0, Math.PI * 2, 0, Math.PI / 1.9), hairM, 0, 1.58, -0.02, body);
  cap.rotation.x = -0.25;
  if (maid) box(0.42, 0.06, 0.1, M.white, 0, 1.78, 0.02, body);
  for (const x of [-0.08, 0.08]) box(0.04, 0.06, 0.02, M.black, x, 1.53, 0.24, body);
  scene.add(g);
  return { g, body, legs, walk: 0 };
}
function animate(ch, moving, dt) {
  ch.walk = moving ? ch.walk + dt * 10 : 0;
  const s = Math.sin(ch.walk);
  ch.legs[0].rotation.x = s * 0.6;
  ch.legs[1].rotation.x = -s * 0.6;
  ch.body.position.y = moving ? Math.abs(s) * 0.05 : 0;
}

const player = { ...makeChar({ outfit: '#22223a', hair: '#2a2a2a' }), x: 0, z: 4.6, r: 0.3 };
player.g.rotation.y = Math.PI;

const red = { ...makeChar({ outfit: '#c8362d', hair: '#7a2a1a', maid: true }), x: -5.4, z: 3.75, name: '赤メイド', talk: 0 };
red.g.position.set(red.x, 0, red.z);
red.g.rotation.y = 0.4;

const VIEW_RANGE = 5.5, VIEW_FOV = Math.PI * 0.42;
const blue = {
  ...makeChar({ outfit: '#2f6fd0', hair: '#e8c070', maid: true }), x: 7, z: 4.6, name: '青メイド', talk: 0,
  // [x, z, 立ち止まって見回す秒数]
  path: [[7, 4.6, 2.2], [0, 4.6], [0, 1.6], [-1.5, -0.2, 2.5], [0, 1.6], [0, 4.6], [-7.5, 4.6, 2.2], [0, 4.6]], target: 1, wait: 0, look: 0,
  seeing: false,
};
blue.g.position.set(blue.x, 0, blue.z);
const coneMat = new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
const CONE_RAYS = 24;
const coneGeo = new THREE.BufferGeometry();
coneGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((CONE_RAYS + 2) * 3), 3));
coneGeo.setIndex(Array.from({ length: CONE_RAYS }, (_, i) => [0, i + 2, i + 1]).flat());
const cone = new THREE.Mesh(coneGeo, coneMat);
cone.position.y = 0.03;
cone.frustumCulled = false;
scene.add(cone);
// 壁に当たるまでの距離で扇形を作り直す
function updateCone() {
  const pos = coneGeo.attributes.position;
  pos.setXYZ(0, blue.x, 0, blue.z);
  const yaw = blue.g.rotation.y;
  for (let i = 0; i <= CONE_RAYS; i++) {
    const a = yaw - VIEW_FOV / 2 + VIEW_FOV * i / CONE_RAYS;
    const dx = Math.sin(a), dz = Math.cos(a);
    const d = rayDist(blue.x, blue.z, dx, dz, VIEW_RANGE);
    pos.setXYZ(i + 1, blue.x + dx * d, 0, blue.z + dz * d);
  }
  pos.needsUpdate = true;
}

// ---- 状態 ----
const state = { susp: 0, hasKey: false, shelfOpen: false, found: false, busy: false };
const regionOf = (x, z) => (z > 3 ? 'corridor' : z < -5 ? 'hidden' : 'study');
const REGION_NAME = { corridor: '2F 廊下', study: '書斎', hidden: '隠し部屋' };

// ---- 入力 ----
const keys = new Set();
addEventListener('keydown', e => {
  keys.add(e.key.toLowerCase());
  if ((e.key === ' ' || e.key.toLowerCase() === 'e' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); act(); }
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
const stick = { x: 0, y: 0, id: null };
const stickEl = document.getElementById('stick'), knob = stickEl.querySelector('i');
stickEl.addEventListener('pointerdown', e => { stick.id = e.pointerId; stickEl.setPointerCapture(e.pointerId); moveStick(e); });
stickEl.addEventListener('pointermove', e => { if (e.pointerId === stick.id) moveStick(e); });
const endStick = () => { stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; };
stickEl.addEventListener('pointerup', endStick);
stickEl.addEventListener('pointercancel', endStick);
function moveStick(e) {
  const r = stickEl.getBoundingClientRect();
  let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
  const l = Math.hypot(dx, dy);
  if (l > 1) { dx /= l; dy /= l; }
  stick.x = dx; stick.y = dy;
  knob.style.transform = `translate(${dx * 35}px, ${dy * 35}px)`;
}
document.getElementById('act').addEventListener('click', act);

// ---- メッセージ ----
const msgEl = document.getElementById('msg');
let msgQueue = [], afterMsg = null;
function say(...lines) { msgQueue = lines; nextMsg(); }
function nextMsg() {
  const l = msgQueue.shift();
  if (!l) {
    msgEl.classList.add('hidden'); state.busy = false;
    if (afterMsg) { const f = afterMsg; afterMsg = null; f(); }
    return;
  }
  state.busy = true;
  msgEl.replaceChildren();
  if (Array.isArray(l)) { const b = document.createElement('b'); b.textContent = l[0]; msgEl.append(b, l[1]); }
  else msgEl.append(l);
  msgEl.classList.remove('hidden');
}
msgEl.addEventListener('click', nextMsg);

// ---- ダイヤル錠 ----
const dial = document.getElementById('dial'), codeEl = document.getElementById('code');
function openDial() {
  state.busy = true;
  codeEl.value = '';
  dial.classList.remove('hidden');
  setTimeout(() => codeEl.focus(), 50);
}
document.getElementById('dialOk').addEventListener('click', () => {
  dial.classList.add('hidden');
  if (codeEl.value === '1103') { state.hasKey = true; say('カチリ、と錠が外れた。中には古びた真鍮の鍵が入っていた。'); }
  else say('……開かない。');
});
document.getElementById('dialNo').addEventListener('click', () => { dial.classList.add('hidden'); state.busy = false; });

// ---- 調べられるもの ----
const things = [
  { name: '本棚', at: () => [-2.5, -4.0], label: '調べる', run: () => {
    if (state.shelfOpen) return say('本棚の奥に、暗い小部屋が続いている。');
    if (!state.hasKey) return say('洋書がぎっしり並んでいる。……上から5段目の赤い本だけ、埃が積もっていない。', '引いてみると、棚の奥に鍵穴が現れた。鍵が要るようだ。');
    openShelf();
    say('赤い本を引き、鍵を差し込む。棚がゆっくりと横に動き出した……！');
  } },
  { name: '机の引き出し', at: () => [2.4, -0.4], label: '調べる', run: () => {
    if (state.hasKey) return say('引き出しは空だ。鍵はもう手元にある。');
    afterMsg = openDial;
    say('机の引き出しには4桁のダイヤル錠が掛かっている。');
  } },
  { name: '本棚', at: () => [2.5, -4.0], label: '調べる', run: () => say('分厚い経済書と、美術品のオークションカタログが並んでいる。') },
  { name: '窓', at: () => [-4.4, -2.0], label: '調べる', run: () => say('窓の外に裏庭が見える。倉庫の屋根の上で、カラスが鳴いた。') },
  { name: '地球儀', at: () => [-3.6, 1.4], label: '調べる', run: () => say('古い地球儀。ヨーロッパのあたりだけ、指の跡で色が褪せている。') },
  { name: '花台', at: () => [-1.6, 5.1], label: '調べる', run: () => say('花瓶の横に、花屋の伝票が挟まっている。', ['伝票', '「麗子様　お誕生日　11月3日」……旦那様の字だ。']) },
  { name: '肖像画', at: () => [-4, 3.5], label: '調べる', run: () => say('鷹宮家の先代の肖像画。厳しい目でこちらを見下ろしている。') },
  { name: '月下の庭', at: () => [-2.5, -6.5], label: '調べる', run: () => {
    state.found = true;
    say('月明かりの下、白い花が咲く庭。', ['執事', '（「月下の庭」……母さん、見つけたよ）'], '——探索試作はここまで。お疲れさまでした。');
  } },
  { name: '赤メイド', npc: red, at: () => [red.x, red.z], label: 'TALK', run: () => {
    const lines = [
      ['赤メイド', '「……旦那様、毎年11月3日になると花を買ってくる。誰に渡すのかは、知らない」'],
      ['赤メイド', '「……青は、ときどき書斎を覗きに行く。気をつけて」'],
      ['赤メイド', '「……（ぼーっとしている）」'],
    ];
    say(lines[red.talk++ % lines.length]);
  } },
  { name: '青メイド', npc: blue, at: () => [blue.x, blue.z], label: 'TALK', run: () => {
    say(['青メイド', state.region === 'corridor'
      ? '「あっ執事さん！ 見回り中です！ 書斎は旦那様のお部屋だから、勝手に入っちゃダメなんですよ〜」'
      : '「あれ？ 執事さん、書斎で何してるんですか？」']);
    if (state.region !== 'corridor') addSusp(15);
  } },
];

let shelfAnim = 0;
function openShelf() {
  state.shelfOpen = true;
  shelfAnim = 0.0001;
  for (const o of secretObjs) o.visible = true;
  Object.assign(secretShelf.box, { minX: -3.6, maxX: -3.1, minZ: -4.4, maxZ: -2.2 });
}

let target = null;
function findTarget() {
  let best = null, bd = 1.4;
  for (const t of things) {
    const [x, z] = t.at();
    if (t.name === '月下の庭' && !state.shelfOpen) continue;
    const d = Math.hypot(x - player.x, z - player.z);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}
function act() {
  if (!msgEl.classList.contains('hidden')) return nextMsg();
  if (state.busy || !target) return;
  if (blue.seeing && !target.npc && state.region !== 'corridor') addSusp(25);
  if (target.npc) target.npc.g.rotation.y = Math.atan2(player.x - target.npc.x, player.z - target.npc.z);
  target.run();
}

// ---- 当たり判定付きの移動 ----
function blocked(x, z, r) {
  return solids.some(s => x + r > s.minX && x - r < s.maxX && z + r > s.minZ && z - r < s.maxZ);
}
function moveBy(o, dx, dz, r) {
  if (!blocked(o.x + dx, o.z, r)) o.x += dx;
  if (!blocked(o.x, o.z + dz, r)) o.z += dz;
}

// (x, z) から向き (dx, dz) に進んで壁に当たるまでの距離（視線の判定）
function rayDist(x, z, dx, dz, max) {
  let best = max;
  for (const s of solids) {
    if (s.tag) continue;
    if (x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ) continue;
    let t0 = 0, t1 = max, hit = true;
    for (const [d, o, lo, hi] of [[dx, x, s.minX, s.maxX], [dz, z, s.minZ, s.maxZ]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) hit = false; continue; }
      let ta = (lo - o) / d, tb = (hi - o) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    if (hit && t0 <= t1 && t0 < best) best = t0;
  }
  return best;
}
const lineBlocked = (x1, z1, x2, z2) => {
  const d = Math.hypot(x2 - x1, z2 - z1);
  return rayDist(x1, z1, (x2 - x1) / d, (z2 - z1) / d, d) < d;
};

// ---- 疑惑 ----
const suspEl = document.getElementById('susp');
function addSusp(v) {
  state.susp = Math.max(0, Math.min(100, state.susp + v));
  if (state.susp >= 100) caught();
}
function caught() {
  state.susp = 30;
  player.x = 6; player.z = 4.6;
  say(['青メイド', '「執事さん！？ 旦那様のお部屋で何を……！」'], '（見つかってしまった。本編ならここで疑惑が一気に高まり、屋敷を追われる）');
}

// ---- ラベルとミニマップ ----
const labelsEl = document.getElementById('labels');
const labelPool = [];
function drawLabels(list) {
  while (labelPool.length < list.length) { const d = document.createElement('div'); labelsEl.append(d); labelPool.push(d); }
  labelPool.forEach((d, i) => {
    const l = list[i];
    if (!l) { d.style.display = 'none'; return; }
    const v = new THREE.Vector3(l.x, l.y, l.z).project(camera);
    d.style.display = '';
    d.className = 'label ' + (l.cls || '');
    d.textContent = l.text;
    d.style.left = `${(v.x + 1) / 2 * innerWidth}px`;
    d.style.top = `${(1 - v.y) / 2 * innerHeight}px`;
  });
}
const mm = document.getElementById('minimap').getContext('2d');
function drawMinimap() {
  const S = 150 / 20, ox = 10, oz = 9;
  const px = x => (x + ox) * S, pz = z => (z + oz) * S - 10;
  mm.clearRect(0, 0, 150, 150);
  mm.fillStyle = '#5a4636';
  mm.fillRect(px(-5), pz(-5), 10 * S, 8 * S);
  mm.fillRect(px(-9), pz(3), 18 * S, 3 * S);
  if (state.shelfOpen) mm.fillRect(px(-4), pz(-8), 3 * S, 3 * S);
  mm.fillStyle = 'rgba(255,224,138,.35)';
  mm.beginPath();
  mm.moveTo(px(blue.x), pz(blue.z));
  const yaw = blue.g.rotation.y;
  for (const a of [-VIEW_FOV / 2, 0, VIEW_FOV / 2]) mm.lineTo(px(blue.x + Math.sin(yaw + a) * VIEW_RANGE), pz(blue.z + Math.cos(yaw + a) * VIEW_RANGE));
  mm.fill();
  for (const [o, c] of [[red, '#c8362d'], [blue, '#2f6fd0'], [player, '#e3c06f']]) {
    mm.fillStyle = c; mm.beginPath(); mm.arc(px(o.x), pz(o.z), 4, 0, 7); mm.fill();
  }
}

// ---- メインループ ----
const placeEl = document.getElementById('place'), actBtn = document.getElementById('act');
const camTarget = new THREE.Vector3(player.x, 0, player.z);
const FWD = new THREE.Vector2(-1, -1).normalize(), RIGHT = new THREE.Vector2(1, -1).normalize();
let last = performance.now();

function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // 主人公
  let ix = 0, iy = 0;
  if (!state.busy) {
    if (keys.has('arrowup') || keys.has('w')) iy += 1;
    if (keys.has('arrowdown') || keys.has('s')) iy -= 1;
    if (keys.has('arrowright') || keys.has('d')) ix += 1;
    if (keys.has('arrowleft') || keys.has('a')) ix -= 1;
    ix += stick.x; iy -= stick.y;
  }
  const il = Math.hypot(ix, iy);
  const moving = il > 0.15;
  if (moving) {
    const sp = 3.4 * Math.min(1, il) / il;
    const dx = (FWD.x * iy + RIGHT.x * ix) * sp * dt, dz = (FWD.y * iy + RIGHT.y * ix) * sp * dt;
    moveBy(player, dx, dz, player.r);
    player.g.rotation.y = Math.atan2(dx, dz);
  }
  player.g.position.set(player.x, 0, player.z);
  animate(player, moving, dt);
  state.region = regionOf(player.x, player.z);
  placeEl.textContent = REGION_NAME[state.region];

  // 青メイドの巡回
  if (!state.busy) {
    if (blue.wait > 0) {
      blue.wait -= dt;
      blue.look += dt;
      blue.g.rotation.y = blue.baseYaw + Math.sin(blue.look * 1.5) * 0.9;
      animate(blue, false, dt);
    } else {
      const [tx, tz, wait] = blue.path[blue.target];
      const dx = tx - blue.x, dz = tz - blue.z, d = Math.hypot(dx, dz);
      if (d < 0.05) {
        blue.target = (blue.target + 1) % blue.path.length;
        if (wait) { blue.wait = wait; blue.look = 0; blue.baseYaw = blue.g.rotation.y; }
      } else {
        const st = Math.min(d, 1.6 * dt);
        blue.x += dx / d * st; blue.z += dz / d * st;
        blue.g.rotation.y = Math.atan2(dx, dz);
      }
      animate(blue, d >= 0.05, dt);
    }
    blue.g.position.set(blue.x, 0, blue.z);
  }

  // 視界の判定
  const vx = player.x - blue.x, vz = player.z - blue.z, vd = Math.hypot(vx, vz);
  let diff = Math.atan2(vx, vz) - blue.g.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  blue.seeing = vd < VIEW_RANGE && Math.abs(diff) < VIEW_FOV / 2 && !lineBlocked(blue.x, blue.z, player.x, player.z);
  coneMat.color.set(blue.seeing ? '#ff5a4a' : '#ffe08a');
  updateCone();
  if (!state.busy) {
    if (blue.seeing && state.region !== 'corridor') addSusp(18 * dt);
    else if (!blue.seeing) addSusp(-4 * dt);
  }
  suspEl.style.width = `${state.susp}%`;

  // 本棚が動く
  if (shelfAnim > 0 && shelfAnim < 1) {
    shelfAnim = Math.min(1, shelfAnim + dt * 0.6);
    hinge.rotation.y = -Math.PI / 2 * (1 - (1 - shelfAnim) ** 2);
    spot.intensity = 30 * shelfAnim;
  }
  if (secretShelf.red) secretShelf.red.material.emissiveIntensity = 0.6 + Math.sin(now / 300) * 0.4;

  // カメラ側の壁を低くする
  for (const w of walls) {
    const low = w.axis === 'z' ? w.c > player.z + 0.2 : w.c > player.x + 0.2;
    w.scale += ((low ? LOW : 1) - w.scale) * Math.min(1, dt * 8);
    w.g.scale.y = w.hideWhenLow ? 1 : w.scale;
    if (w.hideWhenLow) w.g.visible = !low;
    for (const d of w.decor) d.visible = w.scale > 0.6;
  }

  // カメラ
  camTarget.lerp(new THREE.Vector3(player.x, 0, player.z), Math.min(1, dt * 5));
  camera.position.copy(camTarget).add(CAM_OFFSET);
  camera.lookAt(camTarget);
  sun.target.position.copy(camTarget);
  sun.position.copy(camTarget).add(new THREE.Vector3(-8, 16, 10));
  sun.target.updateMatrixWorld();

  // 調べる対象
  target = state.busy ? null : findTarget();
  actBtn.classList.toggle('hidden', !target);
  if (target) actBtn.textContent = target.label === 'TALK' ? '話す' : '調べる';
  const labels = [
    { x: red.x, y: 2.1, z: red.z, text: red.name, cls: 'name' },
    { x: blue.x, y: 2.1, z: blue.z, text: blue.seeing && state.region !== 'corridor' ? '！' : blue.name, cls: blue.seeing && state.region !== 'corridor' ? 'alert' : 'name' },
  ];
  if (target) { const [x, z] = target.at(); labels.push({ x, y: target.npc ? 2.5 : 1.6, z, text: target.label === 'TALK' ? 'TALK' : '調べる' }); }
  drawLabels(labels);
  drawMinimap();

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
say(['試作', '2F 書斎と廊下。青メイドの視界（黄色い扇形）に入らないよう書斎を調べ、隠された絵を探そう。'], '移動は矢印キー／WASD（スマホは左下のスティック）、調べる・話すはスペースキー（スマホは右下のボタン）。');

window.__explore = { state, player, blue, things };
