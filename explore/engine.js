// 描画の土台：レンダラー・素材・形の部品・人物モデル
import * as THREE from '../vendor/three.module.min.js';
export { THREE };

export const canvas = document.getElementById('view');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// 端末のメモリが足りなくなって3D描画が止まったときは、白い画面のままにせず、読み込み直せるようにする
// （セーブはその日の朝。読み込み直すと「つづきから」で、その日の朝から遊べる）
canvas.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  if (document.getElementById('gl-lost')) return;
  const box = document.createElement('div');
  box.id = 'gl-lost'; box.className = 'modal-back';
  box.innerHTML = '<div class="modal"><p>3Dの表示が止まりました（端末のメモリが足りなくなった可能性があります）。</p>'
    + '<p class="hint">読み込み直すと、タイトルの「つづきから」で、その日の朝から続けられます。ほかのアプリやタブを閉じると、止まりにくくなります。</p>'
    + '<div class="row"><button class="primary">読み込み直す</button></div></div>';
  box.querySelector('button').onclick = () => location.reload();
  document.body.append(box);
});

export const scene = new THREE.Scene();
export const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
export const CAM_OFFSET = new THREE.Vector3(12, 14, 12);

export function resize() {
  const w = innerWidth, h = innerHeight, a = w / h;
  renderer.setSize(w, h, false);
  const halfH = a >= 1 ? 7 : 7 / a * 0.7;
  camera.left = -halfH * a; camera.right = halfH * a; camera.top = halfH; camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

export const hemi = new THREE.HemisphereLight('#fff1dc', '#3a2a30', 1.1);
export const sun = new THREE.DirectionalLight('#ffe2b8', 1.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 60 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(hemi, sun, sun.target);

// ---- テクスチャ（すべてプログラムで描く） ----
let seed = 7;
export const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function tiled(tex, rx, ry) { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return t; }

export const TEX = {
  wood: canvasTex(256, 256, (g, w) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `hsl(25, 45%, ${30 + rand() * 10}%)`; g.fillRect(0, i * 32, w, 32);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, i * 32, w, 2); g.fillRect(rand() * w, i * 32, 2, 32);
      g.fillStyle = 'rgba(255,255,255,.05)';
      for (let k = 0; k < 6; k++) g.fillRect(0, i * 32 + 4 + rand() * 24, w, 1);
    }
  }),
  marble: canvasTex(128, 128, (g) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? '#e9e2d4' : '#cfc4b0'; g.fillRect(x * 64, y * 64, 64, 64);
    }
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.strokeRect(0, 0, 128, 128);
  }),
  tile: canvasTex(64, 64, (g) => {
    g.fillStyle = '#d8dcd6'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#aab0aa'; g.lineWidth = 2; g.strokeRect(0, 0, 32, 32); g.strokeRect(32, 32, 32, 32); g.strokeRect(32, 0, 32, 32); g.strokeRect(0, 32, 32, 32);
  }),
  wall: canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d8c7a2'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 12, h);
    g.fillStyle = '#c9b38a';
    for (let y = 16; y < h; y += 32) for (let x = 6; x < w; x += 32) { g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 5, y); g.lineTo(x, y + 6); g.lineTo(x - 5, y); g.fill(); }
  }),
  wallTile: canvasTex(64, 64, (g) => {
    g.fillStyle = '#eef3f4'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#b8c8cc'; g.lineWidth = 2;
    for (let i = 0; i <= 64; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); }
  }),
  plain: canvasTex(64, 64, (g) => { g.fillStyle = '#efe7d8'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#e4dac6'; g.fillRect(0, 60, 64, 4); }),
  grass: canvasTex(128, 128, (g) => {
    g.fillStyle = '#6f9a4e'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) { g.fillStyle = `hsl(${85 + rand() * 25}, 40%, ${30 + rand() * 18}%)`; g.fillRect(rand() * 128, rand() * 128, 2, 3); }
  }),
  stone: canvasTex(128, 128, (g) => {
    g.fillStyle = '#b9b0a2'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#8e8576'; g.lineWidth = 2;
    for (let y = 0; y < 128; y += 32) for (let x = (y / 32) % 2 * 16; x < 128; x += 32) g.strokeRect(x, y, 32, 32);
  }),
  soil: canvasTex(64, 64, (g) => { g.fillStyle = '#6b4a32'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#5a3d28'; for (let y = 4; y < 64; y += 10) g.fillRect(0, y, 64, 3); }),
  carpet: canvasTex(256, 192, (g, w, h) => {
    g.fillStyle = '#c9a24a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#7a2a2a'; g.fillRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#2f6a4a'; g.fillRect(18, 18, w - 36, h - 36);
    g.strokeStyle = '#c9a24a'; g.lineWidth = 2; g.strokeRect(26, 26, w - 52, h - 52);
  }),
  redCarpet: canvasTex(256, 192, (g, w, h) => {
    g.fillStyle = '#d4a94e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8a1f2a'; g.fillRect(8, 8, w - 16, h - 16);
    g.strokeStyle = '#d4a94e'; g.lineWidth = 2; g.strokeRect(20, 20, w - 40, h - 40);
  }),
  painting: canvasTex(128, 96, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#0b1a3a'); sky.addColorStop(1, '#25406a');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f6eab0'; g.beginPath(); g.arc(92, 22, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1c3a2a'; g.fillRect(0, 60, w, 36);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(240,240,255,${0.5 + rand() * 0.5})`; g.beginPath(); g.arc(rand() * w, 62 + rand() * 32, 1.5 + rand() * 1.5, 0, 7); g.fill(); }
  }),
  roof: canvasTex(64, 64, (g) => { g.fillStyle = '#e8e4e0'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#b8b0aa'; for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 2); }),
};

export const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });
export const M = {
  wood: mat('#6b3f22'), darkWood: mat('#3f2414'), lightWood: mat('#a87a4a'), gold: mat('#c9a24a', { metalness: 0.5, roughness: 0.4 }),
  white: mat('#f4f1ea'), black: mat('#1e1e26'), skin: mat('#f1d1b5'), metal: mat('#9aa3ad', { metalness: 0.6, roughness: 0.4 }),
  glass: mat('#bfe0ff', { emissive: '#6b8fb8', emissiveIntensity: 0.6 }), green: mat('#3f6b3a'), leaf: mat('#4f7f3a'),
  paper: mat('#efe6cf'), wainscot: mat('#4a2a18'), red: mat('#8a2a2a'), cloth: mat('#e8e2d4'), stoneM: mat('#c8c0b2'),
};

// ---- 形の部品（parent に追加。y は底面の高さ） ----
export function mesh(geo, material, x, y, z, parent) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
export const box = (parent, w, h, d, material, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), material, x, y + h / 2, z, parent);
export const cyl = (parent, r1, r2, h, material, x, y, z, seg = 8) => mesh(new THREE.CylinderGeometry(r1, r2, h, seg), material, x, y + h / 2, z, parent);
export const ball = (parent, r, material, x, y, z, detail = 0) => mesh(new THREE.IcosahedronGeometry(r, detail), material, x, y, z, parent);
export function plane(parent, w, d, material, x, y, z) {
  const m = mesh(new THREE.PlaneGeometry(w, d), material, x, y, z, parent);
  m.rotation.x = -Math.PI / 2; m.castShadow = false;
  return m;
}

// ---- 人物 ----
// 人物の入れ物。中身の VRM は explore/vrm.js の attachVRM で入れる
export function makeChar(parent) {
  const g = new THREE.Group();
  parent.add(g);
  return { g };
}
export function animate(ch, moving, dt) {
  if (ch.drive) ch.drive(moving, dt);   // VRM の動き（explore/vrm.js）
}
