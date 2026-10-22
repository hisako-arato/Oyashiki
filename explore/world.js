// 屋敷の間取り・家具・人物・調べられる場所
// 座標は1マス1m。x は東向き、z は南向き（間取り図の上が北＝z の小さい側）
import { THREE, TEX, M, mat, tiled, box, cyl, ball, mesh, plane, rand } from './engine.js';

const WALL_H = 3, WALL_T = 0.2;
export const HOUSE = { x: 14, z: 16 };    // 屋敷の1F原点が敷地のどこにあるか
export const COTTAGE = { x: 70, z: 2 };   // 使用人棟の原点が敷地のどこにあるか
export const FLOOR2_Y = 3.32;             // 2Fの床の高さ（2Fから外を見るときに使う）

// 組み立て中のエリア
let A = null;
const solid = (minX, maxX, minZ, maxZ, tag) => { const s = { minX, maxX, minZ, maxZ, tag }; A.solids.push(s); return s; };

// ---- 家具：中心 (x, z)、rot は 90度単位の向き（0 で正面が南、1 で東、2 で北、3 で西） ----
function piece(x, z, rot, w, d, build, { solidify = true } = {}) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = [0, Math.PI / 2, Math.PI, -Math.PI / 2][rot];
  build(g);
  A.group.add(g);
  const [hw, hd] = rot % 2 ? [d / 2, w / 2] : [w / 2, d / 2];
  if (solidify) solid(x - hw, x + hw, z - hd, z + hd, 'furniture');
  return g;
}
const DRESS_COLORS = ['#b8436f', '#3a2a6a', '#e8c04a', '#2a6a5a', '#f4f1ea', '#8a2a3a', '#6a8ac8', '#d89aa8'];
const F = {
  bed: (x, z, rot, color = '#7a2a3a', w = 1.6, d = 2.1) => piece(x, z, rot, w, d, g => {
    box(g, w, 0.35, d, M.darkWood, 0, 0, 0);
    box(g, w - 0.1, 0.2, d - 0.1, M.cloth, 0, 0.35, 0);
    box(g, w - 0.08, 0.06, d * 0.6, mat(color), 0, 0.55, 0.2);
    box(g, w * 0.7, 0.12, 0.35, M.white, 0, 0.55, -d / 2 + 0.3);
    box(g, w, 1.0, 0.1, M.darkWood, 0, 0, -d / 2 + 0.05);
  }),
  desk: (x, z, rot, w = 1.6) => piece(x, z, rot, w, 0.8, g => {
    box(g, w, 0.08, 0.8, M.wood, 0, 0.72, 0);
    box(g, 0.45, 0.72, 0.75, M.darkWood, -w / 2 + 0.25, 0, 0);
    box(g, 0.08, 0.72, 0.08, M.darkWood, w / 2 - 0.08, 0, 0.3);
    box(g, 0.08, 0.72, 0.08, M.darkWood, w / 2 - 0.08, 0, -0.3);
    box(g, 0.45, 0.02, 0.32, M.paper, 0.2, 0.8, 0);
  }),
  chair: (x, z, rot, color = '#6a2a2a') => piece(x, z, rot, 0.5, 0.5, g => {
    box(g, 0.48, 0.08, 0.48, mat(color), 0, 0.42, 0);
    for (const [a, b] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) box(g, 0.05, 0.42, 0.05, M.darkWood, a, 0, b);
    box(g, 0.48, 0.5, 0.06, M.darkWood, 0, 0.5, -0.21);
  }, { solidify: false }),
  table: (x, z, w, d, material = M.wood) => piece(x, z, 0, w, d, g => {
    box(g, w, 0.08, d, material, 0, 0.72, 0);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 0.08, 0.72, 0.08, M.darkWood, a * (w / 2 - 0.1), 0, b * (d / 2 - 0.1));
  }),
  sofa: (x, z, rot, color = '#7a3a2a', w = 1.8) => piece(x, z, rot, w, 0.85, g => {
    const m = mat(color);
    box(g, w, 0.42, 0.85, m, 0, 0, 0);
    box(g, w, 0.5, 0.2, m, 0, 0.42, -0.33);
    for (const s of [-1, 1]) box(g, 0.18, 0.3, 0.85, m, s * (w / 2 - 0.09), 0.42, 0);
  }),
  shelf: (x, z, rot, w = 2, h = 2.4) => piece(x, z, rot, w, 0.45, g => bookshelf(g, w, h)),
  cabinet: (x, z, rot, w = 1.4, h = 1.0, color) => piece(x, z, rot, w, 0.5, g => {
    box(g, w, h, 0.5, color ? mat(color) : M.wood, 0, 0, 0);
    box(g, w + 0.06, 0.05, 0.56, M.darkWood, 0, h, 0);
    for (let i = 0; i < Math.max(1, Math.round(w / 0.5)); i++) box(g, 0.06, 0.06, 0.04, M.gold, -w / 2 + 0.25 + i * 0.5, h * 0.7, 0.26);
  }),
  counter: (x, z, rot, w = 2) => piece(x, z, rot, w, 0.65, g => {
    box(g, w, 0.85, 0.65, M.white, 0, 0, 0);
    box(g, w + 0.04, 0.05, 0.7, mat('#5a5a60'), 0, 0.85, 0);
  }),
  stove: (x, z, rot) => piece(x, z, rot, 1, 0.7, g => {
    box(g, 1, 0.85, 0.7, M.black, 0, 0, 0);
    for (const a of [-0.25, 0.25]) for (const b of [-0.15, 0.15]) cyl(g, 0.12, 0.12, 0.03, M.metal, a, 0.85, b);
  }),
  fridge: (x, z, rot) => piece(x, z, rot, 0.8, 0.7, g => { box(g, 0.8, 1.9, 0.7, M.white, 0, 0, 0); box(g, 0.04, 0.6, 0.04, M.metal, 0.3, 1.0, 0.36); }),
  crate: (x, z, s = 0.8) => piece(x, z, 0, s, s, g => { box(g, s, s, s, M.lightWood, 0, 0, 0); box(g, s + 0.02, 0.08, s + 0.02, M.wood, 0, s * 0.5, 0); }),
  plant: (x, z) => piece(x, z, 0, 0.5, 0.5, g => { box(g, 0.4, 0.4, 0.4, mat('#8a5a3a'), 0, 0, 0); ball(g, 0.42, M.green, 0, 0.85, 0); }),
  fireplace: (x, z, rot) => piece(x, z, rot, 1.8, 0.6, g => {
    box(g, 1.8, 1.2, 0.6, M.stoneM, 0, 0, 0);
    box(g, 0.9, 0.7, 0.1, M.black, 0, 0.05, 0.26);
    box(g, 2.0, 0.1, 0.7, M.darkWood, 0, 1.2, 0);
    ball(g, 0.18, mat('#ff9a3a', { emissive: '#ff6a1a', emissiveIntensity: 1.2 }), 0, 0.25, 0.2).castShadow = false;
  }),
  piano: (x, z, rot) => piece(x, z, rot, 1.5, 1.6, g => {
    box(g, 1.5, 0.3, 1.6, M.black, 0, 0.7, 0);
    box(g, 1.5, 0.12, 0.3, M.white, 0, 0.8, 0.7);
    for (const [a, b] of [[-0.6, -0.6], [0.6, -0.6], [0, 0.6]]) box(g, 0.1, 0.7, 0.1, M.black, a, 0, b);
  }),
  washer: (x, z, rot) => piece(x, z, rot, 0.7, 0.7, g => {
    box(g, 0.7, 0.9, 0.7, M.white, 0, 0, 0);
    mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12), M.glass, 0, 0.45, 0.36, g).rotation.x = Math.PI / 2;
  }),
  tub: (x, z, rot) => piece(x, z, rot, 1.8, 0.85, g => {
    box(g, 1.8, 0.55, 0.85, M.white, 0, 0, 0);
    box(g, 1.6, 0.02, 0.65, mat('#9ac8e8', { emissive: '#3a6a8a', emissiveIntensity: 0.3 }), 0, 0.5, 0);
    for (const s of [-1, 1]) box(g, 0.1, 0.12, 0.1, M.gold, s * 0.75, -0.12, 0.3);
  }),
  shower: (x, z, rot) => piece(x, z, rot, 1.0, 1.0, g => {
    box(g, 1.0, 0.06, 1.0, M.white, 0, 0, 0);
    cyl(g, 0.03, 0.03, 2.1, M.metal, 0, 0, -0.45);
    box(g, 0.3, 0.05, 0.3, M.metal, 0, 2.05, -0.3);
    box(g, 1.0, 1.9, 0.03, mat('#cfe6f0', { transparent: true, opacity: 0.35 }), 0, 0.06, 0.5);
  }, { solidify: true }),
  sink: (x, z, rot) => piece(x, z, rot, 0.9, 0.55, g => {
    box(g, 0.9, 0.85, 0.55, M.white, 0, 0, 0);
    box(g, 0.5, 0.05, 0.3, mat('#cfe6f0'), 0, 0.84, 0.03);
    box(g, 0.7, 0.85, 0.04, M.glass, 0, 1.2, -0.25);
    box(g, 0.8, 0.95, 0.03, M.gold, 0, 1.15, -0.27);
  }),
  clock: (x, z, rot) => piece(x, z, rot, 0.6, 0.4, g => {
    box(g, 0.6, 2.1, 0.4, M.darkWood, 0, 0, 0);
    mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 16), M.paper, 0, 1.7, 0.21, g).rotation.x = Math.PI / 2;
  }),
  wardrobe: (x, z, rot, w = 1.4) => piece(x, z, rot, w, 0.6, g => {
    box(g, w, 2.1, 0.6, M.wood, 0, 0, 0);
    box(g, 0.02, 1.8, 0.02, M.darkWood, 0, 0.15, 0.31);
    for (const s of [-0.1, 0.1]) box(g, 0.05, 0.2, 0.05, M.gold, s, 1.0, 0.32);
  }),
  dresser: (x, z, rot) => piece(x, z, rot, 1.2, 0.5, g => {
    box(g, 1.2, 0.75, 0.5, M.white, 0, 0, 0);
    box(g, 0.7, 0.9, 0.05, M.glass, 0, 0.8, -0.2);
    box(g, 0.8, 1.0, 0.04, M.gold, 0, 0.75, -0.23);
    for (const c of ['#e0607a', '#c9a24a', '#8a5aa0']) cyl(g, 0.04, 0.04, 0.12, mat(c), -0.4 + rand() * 0.8, 0.75, 0.05);
  }),
  rug: (x, z, w, d, tex = TEX.carpet) => { plane(A.group, w, d, mat('#ffffff', { map: tex }), x, 0.012, z); },
  chandelier: (x, z, y = 2.2) => {
    const g = new THREE.Group(); g.position.set(x, y, z); A.group.add(g);
    cyl(g, 0.02, 0.02, 3 - y, M.gold, 0, 0.3, 0);
    mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 12), M.gold, 0, 0.3, 0, g).rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      ball(g, 0.07, mat('#fff4cc', { emissive: '#ffd27a', emissiveIntensity: 1 }), Math.cos(a) * 0.55, 0.4, Math.sin(a) * 0.55).castShadow = false;
    }
    const l = new THREE.PointLight('#ffd9a0', 8, 10, 1.4); g.add(l);
  },
  pillar: (x, z) => piece(x, z, 0, 0.5, 0.5, g => { cyl(g, 0.22, 0.22, WALL_H, M.white, 0, 0, 0, 10); box(g, 0.55, 0.15, 0.55, M.gold, 0, 0, 0); }),
  pedestalVase: (x, z, color = '#2a4a8a') => piece(x, z, 0, 0.45, 0.45, g => { box(g, 0.45, 0.9, 0.45, M.white, 0, 0, 0); cyl(g, 0.14, 0.2, 0.42, mat(color), 0, 0.9, 0); }),
  globe: (x, z) => piece(x, z, 0, 0.5, 0.5, g => { cyl(g, 0.04, 0.04, 0.8, M.darkWood, 0, 0, 0); ball(g, 0.3, mat('#3a6a9a'), 0, 1.1, 0, 1); }),
  armchair: (x, z, rot, color = '#7a3a2a') => piece(x, z, rot, 0.9, 0.9, g => {
    const m = mat(color);
    box(g, 0.9, 0.45, 0.9, m, 0, 0, 0); box(g, 0.9, 0.6, 0.2, m, 0, 0.45, -0.35);
  }),
  // 見た目だけの階段。dir は上っていく方向
  stairs: (x1, z1, x2, z2, dir, rise = 2.8, steps = 10) => {
    const g = new THREE.Group(); A.group.add(g);
    const w = x2 - x1, d = z2 - z1;
    for (let i = 0; i < steps; i++) {
      const h = rise * (i + 1) / steps;
      if (dir === 'n' || dir === 's') {
        const sd = d / steps, z = dir === 'n' ? z2 - (i + 0.5) * sd : z1 + (i + 0.5) * sd;
        box(g, w, h, sd, i % 2 ? M.wood : M.lightWood, (x1 + x2) / 2, 0, z);
      } else {
        const sw = w / steps, x = dir === 'w' ? x2 - (i + 0.5) * sw : x1 + (i + 0.5) * sw;
        box(g, sw, h, d, i % 2 ? M.wood : M.lightWood, x, 0, (z1 + z2) / 2);
      }
    }
    solid(x1, x2, z1, z2, 'furniture');
  },
  // 庭師の長い梯子（壁に立て掛けてある）
  ladder: (x, z, rot) => piece(x, z, rot, 0.6, 0.3, g => {
    const lean = new THREE.Group(); lean.rotation.x = -0.12; g.add(lean);
    for (const s of [-0.25, 0.25]) box(lean, 0.06, 2.9, 0.06, M.lightWood, s, 0, 0);
    for (let i = 0; i < 9; i++) box(lean, 0.5, 0.04, 0.04, M.lightWood, 0, 0.25 + i * 0.3, 0);
  }),
  basket: (x, z) => piece(x, z, 0, 0.6, 0.45, g => { box(g, 0.6, 0.4, 0.45, M.lightWood, 0, 0, 0); box(g, 0.5, 0.12, 0.35, M.white, 0, 0.4, 0); }),
  // ドレスを吊るしたハンガーラック（壁沿いに置く）
  dressRack: (x, z, rot, w = 3) => piece(x, z, rot, w, 0.6, g => {
    for (const s of [-1, 1]) box(g, 0.05, 1.8, 0.05, M.gold, s * w / 2, 0, 0);
    box(g, w, 0.04, 0.04, M.gold, 0, 1.75, 0);
    const n = Math.floor((w - 0.3) / 0.42);
    for (let i = 0; i < n; i++) {
      const dx = -w / 2 + 0.35 + i * (w - 0.6) / Math.max(1, n - 1), c = mat(DRESS_COLORS[i % DRESS_COLORS.length]);
      box(g, 0.02, 0.1, 0.02, M.black, dx, 1.62, 0);
      box(g, 0.32, 0.36, 0.14, c, dx, 1.24, 0);
      mesh(new THREE.ConeGeometry(0.24, 0.85, 8), c, dx, 0.82, 0, g);
    }
  }),
  mannequin: (x, z, color = '#b8436f') => piece(x, z, 0, 0.6, 0.6, g => {
    cyl(g, 0.25, 0.25, 0.04, M.darkWood, 0, 0, 0); cyl(g, 0.03, 0.03, 0.6, M.darkWood, 0, 0, 0);
    mesh(new THREE.ConeGeometry(0.3, 0.8, 8), mat(color), 0, 0.95, 0, g);
    box(g, 0.34, 0.4, 0.18, mat(color), 0, 1.35, 0); ball(g, 0.1, M.cloth, 0, 1.85, 0);
  }),
  linen: (x, z, rot, w = 1.6) => piece(x, z, rot, w, 0.5, g => {
    box(g, w, 2, 0.5, M.lightWood, 0, 0, 0);
    for (let r = 0; r < 4; r++) box(g, w - 0.2, 0.25, 0.4, mat(['#f4f1ea', '#d8e6f2', '#f2e6d8'][r % 3]), 0, 0.2 + r * 0.45, 0.06);
  }),
  // ---- 屋外 ----
  tree: (x, z, s = 1) => piece(x, z, 0, 0.5 * s, 0.5 * s, g => {
    cyl(g, 0.15 * s, 0.2 * s, 1.2 * s, M.darkWood, 0, 0, 0);
    mesh(new THREE.ConeGeometry(1.1 * s, 1.6 * s, 7), M.leaf, 0, 1.9 * s, 0, g);
    mesh(new THREE.ConeGeometry(0.8 * s, 1.3 * s, 7), M.green, 0, 2.6 * s, 0, g);
  }),
  bush: (x, z, roses) => piece(x, z, 0, 0.9, 0.9, g => {
    ball(g, 0.5, M.green, 0, 0.4, 0);
    if (roses) for (let i = 0; i < 5; i++) ball(g, 0.09, mat(['#d03050', '#f4f1ea', '#e07090'][i % 3]), (rand() - 0.5) * 0.7, 0.45 + rand() * 0.4, (rand() - 0.5) * 0.7);
  }),
  fountain: (x, z) => piece(x, z, 0, 3.2, 3.2, g => {
    cyl(g, 1.6, 1.7, 0.5, M.stoneM, 0, 0, 0, 16);
    cyl(g, 1.4, 1.4, 0.05, mat('#7ab0d8', { emissive: '#2a5a7a', emissiveIntensity: 0.4 }), 0, 0.46, 0, 16);
    cyl(g, 0.2, 0.3, 1.2, M.stoneM, 0, 0.5, 0); cyl(g, 0.6, 0.4, 0.15, M.stoneM, 0, 1.6, 0, 12);
  }),
  gazebo: (x, z) => piece(x, z, 0, 3, 3, g => {
    box(g, 3, 0.15, 3, M.white, 0, 0, 0);
    for (const [a, b] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) cyl(g, 0.08, 0.08, 2.4, M.white, a, 0.15, b);
    mesh(new THREE.ConeGeometry(2.3, 1.1, 4), mat('#6a8a7a'), 0, 3.05, 0, g).rotation.y = Math.PI / 4;
    cyl(g, 0.5, 0.5, 0.05, M.white, 0, 0.75, 0, 12); cyl(g, 0.06, 0.06, 0.6, M.white, 0, 0.15, 0);
  }, { solidify: false }),
  lamp: (x, z) => piece(x, z, 0, 0.3, 0.3, g => { cyl(g, 0.05, 0.07, 2.4, M.black, 0, 0, 0); ball(g, 0.18, mat('#fff4cc', { emissive: '#ffd27a', emissiveIntensity: 0.8 }), 0, 2.5, 0); }),
  vegBed: (x, z, w, d) => piece(x, z, 0, w, d, g => {
    box(g, w, 0.25, d, M.lightWood, 0, 0, 0);
    box(g, w - 0.2, 0.02, d - 0.2, mat('#ffffff', { map: TEX.soil }), 0, 0.25, 0);
    for (let i = 0; i < w * 2; i++) ball(g, 0.13, M.leaf, -w / 2 + 0.3 + i * 0.5, 0.36, (rand() - 0.5) * (d - 0.5));
  }),
  laundryLine: (x, z, len) => piece(x, z, 0, len, 0.3, g => {
    for (const s of [-1, 1]) cyl(g, 0.04, 0.04, 1.9, M.metal, s * len / 2, 0, 0);
    box(g, len, 0.02, 0.02, M.white, 0, 1.85, 0);
    for (let i = 0; i < len - 1; i++) box(g, 0.6, 0.7, 0.02, mat(['#f4f1ea', '#d8e6f2', '#f2d8e0'][i % 3]), -len / 2 + 0.8 + i, 1.15, 0);
  }),
  bench: (x, z, rot) => piece(x, z, rot, 1.6, 0.5, g => {
    box(g, 1.6, 0.06, 0.5, M.lightWood, 0, 0.42, 0); box(g, 1.6, 0.4, 0.06, M.lightWood, 0, 0.48, -0.22);
    for (const s of [-0.7, 0.7]) box(g, 0.06, 0.42, 0.45, M.black, s, 0, 0);
  }),
};

const BOOK_COLORS = ['#7a2a2a', '#2a4a6a', '#3a5a2a', '#6a5a2a', '#4a2a4a', '#2a2a2a', '#8a6a3a'];
function bookshelf(g, w, h, redBook) {
  const d = 0.45, rows = 5;
  box(g, w, h, 0.06, M.darkWood, 0, 0, -d / 2 + 0.03);
  for (const sx of [-w / 2, w / 2]) box(g, 0.08, h, d, M.wood, sx, 0, 0);
  let red = null;
  for (let r = 0; r <= rows; r++) {
    const y = 0.1 + r * (h - 0.2) / rows;
    box(g, w, 0.06, d, M.wood, 0, y, 0);
    if (r === rows) break;
    let bx = -w / 2 + 0.1, i = 0;
    while (bx < w / 2 - 0.15) {
      const bw = 0.07 + rand() * 0.05, bh = Math.min(0.3 + rand() * 0.12, (h - 0.2) / rows - 0.1);
      const isRed = redBook && r === 0 && i === 6; // 上から5段目
      const b = box(g, bw, bh, 0.3, isRed ? mat('#d0221c', { emissive: '#400000' }) : mat(BOOK_COLORS[Math.floor(rand() * BOOK_COLORS.length)]), bx + bw / 2, y + 0.06, 0.02);
      if (isRed) red = b;
      bx += bw + 0.01; i++;
    }
  }
  return red;
}

// ---- 床・壁を間取りから組み立てる ----
const FLOOR = { wood: TEX.wood, marble: TEX.marble, tile: TEX.tile, stone: TEX.stone };
function floorOf(r) {
  if (r.floor === 'carpet') return mat('#7a3a48');
  const s = !r.floor || r.floor === 'wood' ? 3 : 2;
  return mat('#ffffff', { map: tiled(FLOOR[r.floor || 'wood'], r.w / s, r.d / s) });
}
// 壁の仕上げ：damask（家族の部屋の壁紙）、plain（使用人の場所）、tile（水回り）
const WALL_STYLE = {
  damask: { tex: TEX.wall, wains: '#4a2a18' },
  plain: { tex: TEX.plain, wains: '#8a6a4a' },
  tile: { tex: TEX.wallTile, wains: '#c8d6da' },
};

function buildRooms(def) {
  for (const r of def.rooms) {
    if (r.type === 'void') continue;
    r.floorMesh = plane(A.group, r.w, r.d, floorOf(r), r.x + r.w / 2, 0, r.z + r.d / 2);
  }
  // 単位辺ごとに、北側（西側）と南側（東側）の部屋を記録する
  const edges = new Map();
  const add = (ori, x, z, side, r) => {
    const k = `${ori},${x},${z}`;
    if (!edges.has(k)) edges.set(k, { ori, x, z, neg: null, pos: null });
    edges.get(k)[side] = r;
  };
  for (const r of def.rooms) {
    for (let x = r.x; x < r.x + r.w; x++) { add('h', x, r.z, 'pos', r); add('h', x, r.z + r.d, 'neg', r); }
    for (let z = r.z; z < r.z + r.d; z++) { add('v', r.x, z, 'pos', r); add('v', r.x + r.w, z, 'neg', r); }
  }
  const opened = new Set();
  for (const [ori, x, z, len] of def.doors) for (let i = 0; i < len; i++) opened.add(ori === 'h' ? `h,${x + i},${z}` : `v,${x},${z + i}`);
  const style = r => (!r || r.type === 'void' ? def.wallStyle || 'damask' : r.wall || def.wallStyle || 'damask');
  const runs = {};
  for (const [k, e] of edges) {
    if (opened.has(k)) continue;
    const rs = [e.neg, e.pos].filter(Boolean), isVoid = r => r.type === 'void';
    let kind;
    if (rs.length === 2) {
      if (rs.every(isVoid)) continue;
      kind = rs.some(isVoid) ? 'rail' : 'wall';
    } else kind = !isVoid(rs[0]) && rs[0].open ? 'rail' : 'wall';
    const line = `${e.ori},${e.ori === 'h' ? e.z : e.x},${kind},${style(e.neg)},${style(e.pos)}`;
    (runs[line] ||= []).push(e.ori === 'h' ? e.x : e.z);
  }
  for (const [line, list] of Object.entries(runs)) {
    const [ori, c, kind, sNeg, sPos] = line.split(',');
    list.sort((a, b) => a - b);
    let start = list[0], prev = list[0];
    for (let i = 1; i <= list.length; i++) {
      if (list[i] === prev + 1) { prev = list[i]; continue; }
      if (kind === 'wall') wallSeg(ori, +c, start, prev + 1, sNeg, sPos); else railSeg(ori, +c, start, prev + 1);
      start = prev = list[i];
    }
  }
  // 扉の枠
  for (const [ori, x, z, len, kind] of def.doors) {
    if (kind === 'secret') continue;
    const c = ori === 'h' ? z : x, a = ori === 'h' ? x : z;
    const w = entry(ori, c, a, a + len);
    for (const p of [0, len]) box(w.g, 0.12, 2.4, WALL_T + 0.14, M.gold, p - len / 2, 0, 0);
    w.decor.push(box(w.g, len + 0.12, 0.6, WALL_T, mat('#e8dcc0'), 0, 2.4, 0));
  }
  for (const [ori, c, pos, kind] of def.windows || []) decorate(ori, c, pos, kind || 'window');
}

// 壁・枠のまとまり（カメラ側にあると低くなる）
function entry(ori, c, a, b) {
  const g = new THREE.Group();
  const mid = (a + b) / 2;
  g.position.set(ori === 'h' ? mid : c, 0, ori === 'h' ? c : mid);
  if (ori === 'v') g.rotation.y = Math.PI / 2;
  A.group.add(g);
  const w = { g, ori, c, a, b, mid, scale: 1, decor: [] };
  A.walls.push(w);
  return w;
}
function wallSeg(ori, c, a, b, sNeg, sPos) {
  const len = b - a, w = entry(ori, c, a, b);
  const face = s => mat('#ffffff', { map: tiled(WALL_STYLE[s].tex, len / 1.5, WALL_H / 1.5) });
  const wains = s => mat(WALL_STYLE[s].wains);
  // 面の順番は [+x, -x, +y, -y, +z, -z]。+z が南（東）側、-z が北（西）側の部屋に向く
  const fn = face(sNeg), fp = face(sPos), wn = wains(sNeg), wp = wains(sPos);
  box(w.g, len, WALL_H, WALL_T, [fp, fp, fp, fp, fp, fn], 0, 0, 0);
  box(w.g, len, 1, WALL_T + 0.06, [wp, wp, wp, wp, wp, wn], 0, 0, 0);
  box(w.g, len, 0.08, WALL_T + 0.1, M.gold, 0, 1, 0);
  // 上端の飾り縁は壁より少し高くし、隣の壁と高さをずらして面の重なり（ちらつき）を防ぐ
  const lift = 0.02 + (A.walls.length % 4) * 0.004;
  box(w.g, len + 0.02, 0.17 + lift, WALL_T + 0.12, M.darkWood, 0, WALL_H - 0.15, 0);
  const h = WALL_T / 2;
  if (ori === 'h') solid(a, b, c - h, c + h); else solid(c - h, c + h, a, b);
  w.kind = 'wall';
}
function railSeg(ori, c, a, b) {
  const g = new THREE.Group(), len = b - a, mid = (a + b) / 2;
  g.position.set(ori === 'h' ? mid : c, 0, ori === 'h' ? c : mid);
  if (ori === 'v') g.rotation.y = Math.PI / 2;
  A.group.add(g);
  box(g, len, 0.08, 0.14, M.white, 0, 0, 0);
  box(g, len, 0.08, 0.16, M.darkWood, 0, 0.95, 0);
  for (let p = 0.15; p < len; p += 0.3) cyl(g, 0.035, 0.05, 0.9, M.white, p - len / 2, 0.06, 0, 6);
  const h = 0.1;
  if (ori === 'h') solid(a, b, c - h, c + h, 'rail'); else solid(c - h, c + h, a, b, 'rail');
}
// 壁に窓・扉・配電盤・肖像画を付ける
function decorate(ori, c, pos, kind) {
  const w = A.walls.find(e => e.kind === 'wall' && e.ori === ori && Math.abs(e.c - c) < 0.01 && pos > e.a && pos < e.b);
  if (!w) return;
  const lx = ori === 'h' ? pos - w.mid : -(pos - w.mid);
  const add = (...args) => w.decor.push(box(w.g, ...args));
  if (kind === 'window' || kind === 'boarded') {
    add(1.2, 1.3, WALL_T + 0.04, kind === 'boarded' ? M.darkWood : M.glass, lx, 1.05, 0);
    add(1.36, 0.1, WALL_T + 0.08, M.gold, lx, 1.0, 0);
    add(1.36, 0.1, WALL_T + 0.08, M.gold, lx, 2.35, 0);
    if (kind === 'boarded') for (const y of [1.3, 1.75, 2.1]) add(1.3, 0.12, WALL_T + 0.1, M.lightWood, lx, y, 0);
  } else if (kind === 'door') {
    add(1.2, 2.3, WALL_T + 0.08, M.darkWood, lx, 0, 0);
    add(0.1, 0.1, WALL_T + 0.16, M.gold, lx + 0.4, 1.1, 0);
  } else if (kind === 'panel') {
    add(0.9, 1.1, WALL_T + 0.16, mat('#5a6068'), lx, 1.1, 0);
    for (let i = 0; i < 4; i++) add(0.12, 0.25, WALL_T + 0.22, mat(i === 2 ? '#c8362d' : '#2a2a2a'), lx - 0.3 + i * 0.2, 1.5, 0);
  } else if (kind === 'portrait') {
    add(1.5, 1.8, WALL_T + 0.08, M.gold, lx, 1.0, 0);
    add(1.3, 1.6, WALL_T + 0.12, mat('#5a4636'), lx, 1.1, 0);
  }
}

// 屋外の建物（主人公を隠すときは低くなる）
function block({ name, x1, x2, z1, z2, h, color = '#e8dcc0', roof = '#7a4a3a', windows = [] }) {
  const g = new THREE.Group(); A.group.add(g);
  const w = x2 - x1, d = z2 - z1, cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  // 上面は屋根の色（低くしたときに見える）
  const side = mat(color), top = mat(roof);
  box(g, w, h, d, [side, side, top, side, side, side], cx, 0, cz);
  box(g, w + 0.1, 0.5, d + 0.1, mat('#d8c7a2'), cx, 0, cz);
  const roofG = new THREE.Group(); g.add(roofG);
  box(roofG, w + 0.6, 0.25, d + 0.6, M.darkWood, cx, h, cz);
  const r = mesh(new THREE.CylinderGeometry(0.01, Math.SQRT1_2, 1, 4, 1), mat(roof, { map: tiled(TEX.roof, 4, 2) }), cx, h + 0.25 + 0.9, cz, roofG);
  r.rotation.y = Math.PI / 4; r.scale.set(w + 0.4, 1.8, d + 0.4);
  const decor = [roofG];
  // 窓 [面, 位置, 高さ, 種類]
  for (const [face, p, y = 1.2, kind] of windows) {
    const [ww, wh, wm] = kind === 'door' ? [1.4, 2.4, M.darkWood] : kind === 'garage' ? [3.8, 2.7, mat('#2a2a30')] : [1.1, 1.3, M.glass];
    const pos = { n: [p, z1 - 0.02, 0], s: [p, z2 + 0.02, 0], e: [x2 + 0.02, p, 1], w: [x1 - 0.02, p, 1] }[face];
    const m = pos[2] ? box(g, 0.1, wh, ww, wm, pos[0], y, pos[1]) : box(g, ww, wh, 0.1, wm, pos[0], y, pos[1]);
    decor.push(m);
    if (kind === 'garage') {
      // 半分だけ上がったシャッター
      for (let i = 0; i < 5; i++) decor.push(box(g, 3.8, 0.16, 0.14, mat('#b8bcc2'), p, 1.7 + i * 0.2, z2 + 0.06));
    }
  }
  solid(x1, x2, z1, z2);
  const b = { name, g, x1, x2, z1, z2, h, decor, scale: 1 };
  A.blocks.push(b);
  return b;
}

// ---- 人物 ----
export const LOOKS = {
  father: { outfit: '#3a3028', hair: '#6a6a6a', name: 'お父様' },
  red: { outfit: '#c8362d', hair: '#7a2a1a', maid: true, name: '赤メイド' },
  blue: { outfit: '#2f6fd0', hair: '#e8c070', maid: true, name: '青メイド' },
  black: { outfit: '#222230', hair: '#141414', maid: true, longHair: true, name: '黒メイド' },
  white: { outfit: '#c8ccd2', hair: '#c0c0c8', maid: true, name: '白メイド' },
  mother: { outfit: '#8a2a4a', hair: '#5a3020', dress: true, longHair: true, name: 'お母様' },
  daughter: { outfit: '#f0d070', hair: '#3a2418', dress: true, longHair: true, name: 'お嬢様' },
};

// ---- 調べられる場所・出入口 ----
const spot = (name, x, z, key, id, extra = {}) => A.things.push({ name, at: () => [x, z], label: '調べる', spot: [key, id], ...extra });
const flavor = (name, x, z, ...lines) => A.things.push({ name, at: () => [x, z], label: '調べる', say: lines });
const special = (name, x, z, kind, extra = {}) => A.things.push({ name, at: () => [x, z], label: '調べる', special: kind, ...extra });
const exitMat = mat('#e3c06f', { emissive: '#e3c06f', emissiveIntensity: 0.35, transparent: true, opacity: 0.55 });
function exit(name, x, z, to) {
  A.things.push({ name, at: () => [x, z], label: name, exit: to });
  plane(A.group, 0.9, 0.9, exitMat, x, 0.02, z).receiveShadow = false;
}

// 本編の仕事をする場所 [エリア, x, z]
export const WORK = {
  cook: ['f1', 36, 1.4], great: ['f1', 24, 9], corridor: ['f2', 30, 9.5], garden: ['grounds', 7, 20], laundry: ['f1', 46, 14.4],
  study: ['f2', 12.5, 5.5], master: ['f2', 9, 14.5], droom: ['f2', 36, 12.5], storage: ['f1', 4.5, 3.5], archive: ['f1', 14.5, 3],
  shopping: ['grounds', 38, 55.5], flowers: ['f1', 24, 13.6], escortM: ['grounds', 38, 55.5], tutorD: ['f2', 35, 16.4],
};

// ============================================================
// エリア定義
// ============================================================
const AREAS = {};

// ---- 使用人棟（20m×15m） ----
AREAS.cottage = {
  name: '使用人棟', wallStyle: 'plain', origin: COTTAGE, hide: 'cottage',
  rooms: [
    { name: '執事の部屋', x: 0, z: 0, w: 7, d: 15, key: 'c_butler' },
    { name: '赤の部屋', x: 7, z: 0, w: 4, d: 5, key: 'c_red' },
    { name: '青の部屋', x: 11, z: 0, w: 4, d: 5, key: 'c_blue' },
    { name: '共用室', x: 7, z: 5, w: 8, d: 5, key: 'servants' },
    { name: '黒の部屋', x: 7, z: 10, w: 4, d: 5, key: 'c_black' },
    { name: '白の部屋', x: 11, z: 10, w: 4, d: 5, key: 'c_white' },
    { name: '浴室', x: 15, z: 0, w: 5, d: 5, floor: 'tile', wall: 'tile' },
    { name: '給湯室', x: 15, z: 5, w: 5, d: 5, floor: 'tile', wall: 'tile', key: 'c_kettle' },
    { name: '玄関', x: 15, z: 10, w: 5, d: 5, floor: 'stone' },
  ],
  doors: [['v', 7, 6, 2], ['h', 8, 5, 1], ['h', 12, 5, 1], ['h', 8, 10, 1], ['h', 12, 10, 1], ['h', 17, 5, 1], ['v', 15, 6, 2], ['h', 17, 10, 1]],
  windows: [['h', 0, 1.5], ['v', 0, 4], ['v', 0, 10], ['h', 0, 9], ['h', 0, 13], ['h', 0, 17.5], ['h', 15, 17.5, 'door'], ['h', 15, 3.5]],
  build() {
    // 執事の部屋
    F.desk(4.5, 0.6, 0, 1.8); F.chair(4.5, 1.4, 2);
    F.shelf(6.75, 2.5, 3, 2.2);
    F.wardrobe(0.35, 7, 1);
    F.bed(1.2, 12.5, 0, '#2a3a5a');
    F.rug(3.6, 7, 4, 4, TEX.carpet);
    F.armchair(5.6, 12.5, 3, '#4a5a6a');
    // メイドの部屋
    for (const [x0, z0, c, flip] of [[7, 0, '#c8362d', 0], [11, 0, '#2f6fd0', 0], [7, 10, '#222230', 1], [11, 10, '#c8ccd2', 1]]) {
      F.bed(x0 + 2.85, flip ? z0 + 3.85 : z0 + 1.15, flip ? 2 : 0, c, 0.9, 1.9);
      F.cabinet(x0 + 0.5, flip ? z0 + 4.7 : z0 + 0.3, flip ? 2 : 0, 0.6, 0.8);
    }
    // 共用室：朝礼のテーブル
    F.table(11, 7.5, 3, 1.4);
    for (const [x, z, r] of [[10, 6.55, 0], [12, 6.55, 0], [10, 8.45, 2], [12, 8.45, 2], [9.05, 7.5, 1], [12.95, 7.5, 3]]) F.chair(x, z, r);
    F.chandelier(11, 7.5, 2.4);
    // 浴室・給湯室・玄関
    F.tub(18, 0.55, 0); F.sink(19.65, 3, 3);
    F.counter(19.6, 7.5, 3, 2.4);
    F.cabinet(19.7, 12.5, 3, 1.2, 0.9, '#8a6a4a');
  },
  setup() {
    special('机', 4.5, 1.6, 'notebook');
    flavor('窓', 0.8, 4, '窓の向こうに、屋敷の北側の壁が見える。');
    flavor('朝礼のテーブル', 11, 9.0, '毎朝ここで朝礼を開き、メイドたちに仕事を割り振る。');
    flavor('赤の部屋', 8.5, 3, 'きちんと片付いている。枕元に料理の本が積まれている。');
    flavor('青の部屋', 12.5, 3, '壁一面にスケッチが貼られている。どれも上手い。');
    flavor('黒の部屋', 8.5, 12, '物がほとんどない。机の上に聖書が一冊。');
    flavor('白の部屋', 12.5, 12, '工具箱と電気工学の教科書が置いてある。');
    spot('鍵掛け', 18.9, 12.5, 'servants', 'keys');
    exit('外へ出る', 17.5, 14.2, { area: 'grounds', x: COTTAGE.x + 17.5, z: COTTAGE.z + 15.7 });
  },
};

// ---- 敷地（92m×58m） ----
const HX = HOUSE.x, HZ = HOUSE.z;
AREAS.grounds = {
  name: '庭', outdoor: true,
  zones: [{ name: 'バラ園', key: 'garden', x: 1, z: 16, w: 12, d: 20 }],
  rooms: [],
  doors: [],
  build() {
    plane(A.group, 92, 58, mat('#ffffff', { map: tiled(TEX.grass, 23, 14) }), 46, 0, 29);
    const path = (x1, z1, x2, z2) => plane(A.group, x2 - x1, z2 - z1, mat('#ffffff', { map: tiled(TEX.stone, (x2 - x1) / 2, (z2 - z1) / 2) }), (x1 + x2) / 2, 0.01, (z1 + z2) / 2);
    path(36.5, 34, 39.5, 58);        // 正門から玄関
    path(28, 42, 48, 50);            // 噴水の周りの車寄せ
    path(48, 46, 82, 50);            // ガレージへ
    path(16, 12, 61, 14);            // 裏庭の小道（倉庫・勝手口）
    path(16, 14, 18, 16); path(58, 14, 60, 16);
    path(61, 12, 66, 14); path(64, 14, 66, 20); path(64, 18, 89, 20); path(86.5, 17, 88.5, 18); // 使用人棟へ
    // 屋敷（48m×18m、2階建て）
    const n2 = [3, 8, 14, 24, 33, 39, 45].map(x => ['n', HX + x, 4.4]);
    const house = block({ name: 'house', x1: HX, x2: HX + 48, z1: HZ, z2: HZ + 18, h: 6.6, windows: [
      ...n2, ['n', HX + 12, 1.2], ['n', HX + 24, 1.2], ['n', HX + 36, 1.2], ['n', HX + 3, 0, 'door'], ['n', HX + 45, 0, 'door'],
      ...[5, 13, 34, 38, 47].map(x => ['s', HX + x, 1.2]), ['s', HX + 24, 0, 'door'],
      ...[3, 9, 15, 20, 24, 28, 33, 39, 45].map(x => ['s', HX + x, 4.4]),
      ['e', HZ + 4, 1.2], ['e', HZ + 10, 1.2], ['e', HZ + 15, 1.2], ['e', HZ + 4, 4.4], ['e', HZ + 15, 4.4],
      ['w', HZ + 4, 1.2], ['w', HZ + 10, 1.2], ['w', HZ + 4, 4.4],
    ] });
    // 玄関のひさし（屋敷と一緒に表示・非表示になる）
    for (const x of [HX + 20.5, HX + 27.5]) house.decor.push(cyl(house.g, 0.18, 0.18, 3, M.white, x, 0, HZ + 20));
    house.decor.push(box(house.g, 8, 0.2, 2.4, mat('#7a4a3a'), HX + 24, 3, HZ + 19.2));
    // 使用人棟
    block({ name: 'cottage', x1: COTTAGE.x, x2: COTTAGE.x + 20, z1: COTTAGE.z, z2: COTTAGE.z + 15, h: 3.2, color: '#d8ccb4', roof: '#6a4a3a',
      windows: [['s', COTTAGE.x + 17.5, 0, 'door'], ['s', COTTAGE.x + 3.5, 1.2], ['w', COTTAGE.z + 4, 1.2], ['w', COTTAGE.z + 10, 1.2], ['n', COTTAGE.x + 1.5, 1.2], ['n', COTTAGE.x + 9, 1.2], ['n', COTTAGE.x + 13, 1.2]] });
    // ガレージ（車が出入りできるシャッター）
    block({ name: 'garage', x1: 72, x2: 82, z1: 38, z2: 46, h: 3.4, color: '#cfc6b8', roof: '#4a4a52', windows: [['s', 77, 0, 'garage'], ['w', 42, 1.2]] });
    // 塀と門
    const fence = (x1, z1, x2, z2) => { box(A.group, x2 - x1, 1.4, z2 - z1, mat('#cfc6b8'), (x1 + x2) / 2, 0, (z1 + z2) / 2); solid(x1, x2, z1, z2); };
    fence(0, -0.3, 92, 0); fence(-0.3, 0, 0, 58); fence(92, 0, 92.3, 58); fence(0, 58, 35, 58.3); fence(41, 58, 92, 58.3);
    for (let x = 35.2; x < 41; x += 0.3) cyl(A.group, 0.03, 0.03, 1.8, M.black, x, 0, 58.1, 5);
    solid(35, 41, 57.9, 58.3);
    for (const x of [35, 41]) box(A.group, 0.6, 2, 0.6, mat('#bfb6a8'), x, 0, 58.1);
    // 前庭
    F.fountain(38, 46);
    for (const [x, z] of [[26, 40], [50, 40], [26, 54], [50, 54], [20, 47], [56, 47]]) F.bush(x, z, false);
    F.lamp(35.5, 37); F.lamp(40.5, 37);
    // バラ園とガゼボ
    F.gazebo(7, 26);
    for (let z = 17.5; z <= 35; z += 2.5) { F.bush(3, z, true); F.bush(11, z, true); }
    F.bench(7, 32, 2);
    // 裏庭
    F.vegBed(26, 6, 5, 2); F.vegBed(34, 6, 5, 2);
    F.laundryLine(46, 6, 6);
    F.crate(20, 10.5, 0.9);
    // 木
    for (const [x, z, s] of [[4, 4, 1.3], [10, 3, 1], [60, 4, 1.1], [4, 44, 1.3], [10, 54, 1], [16, 40, 0.9], [62, 54, 1.2], [88, 52, 1.1], [88, 28, 1], [64, 30, 0.9], [88, 36, 1.2]]) F.tree(x, z, s);
  },
  setup() {
    exit('使用人棟に入る', COTTAGE.x + 17.5, COTTAGE.z + 15.6, { area: 'cottage', x: 17.5, z: 14.2 });
    exit('勝手口から入る', HX + 45, HZ - 0.6, { area: 'f1', x: 45, z: 0.9 });
    exit('倉庫に入る', HX + 3, HZ - 0.6, { area: 'f1', x: 3, z: 0.9 });
    exit('玄関から入る', HX + 24, HZ + 18.6, { area: 'f1', x: 24, z: 17.2 });
    flavor('2階の窓', 38, 13, '屋敷の北側を見上げる。2階の窓は……7つ。');
    spot('裏口への小道', 22, 12.6, 'garden', 'path');
    flavor('噴水', 38, 43.6, '白い大理石の噴水。水音が涼しげだ。');
    flavor('ガゼボ', 7, 28.6, 'バラ園のガゼボ。週末、お母様とお嬢様がここでお茶を楽しむ。');
    special('ガレージ', 77, 47, 'garage');
    flavor('家庭菜園', 30, 8, 'トマトとハーブが育っている。赤メイドが世話をしているらしい。');
    flavor('正門', 40.5, 56.8, '正門には鍵が掛かっている。夜は閉ざされる。');
  },
};

// ---- 屋敷 1F（48m×18m） ----
AREAS.f1 = {
  name: '屋敷 1F', origin: HOUSE, hide: 'house',
  rooms: [
    { name: '倉庫', x: 0, z: 0, w: 6, d: 8, floor: 'stone', wall: 'plain', key: 'storage' },
    { name: '資料室', x: 6, z: 0, w: 12, d: 8, private: true, key: 'archive' },
    { name: '応接室', x: 0, z: 8, w: 18, d: 10 },
    { name: '大広間', x: 18, z: 0, w: 12, d: 12, floor: 'marble', key: 'great' },
    { name: '玄関ホール', x: 18, z: 12, w: 12, d: 6, floor: 'marble', key: 'hall' },
    { name: 'キッチン', x: 30, z: 0, w: 12, d: 8, floor: 'tile', wall: 'tile', key: 'kitchen' },
    { name: 'キッチン裏', x: 42, z: 0, w: 6, d: 8, floor: 'stone', wall: 'plain', key: 'kback' },
    { name: '食堂', x: 30, z: 8, w: 12, d: 10 },
    { name: '裏階段', x: 42, z: 8, w: 6, d: 5, wall: 'plain' },
    { name: '洗濯室', x: 42, z: 13, w: 6, d: 5, floor: 'tile', wall: 'tile', key: 'laundry' },
  ],
  doors: [['v', 6, 3, 2], ['v', 18, 3, 2], ['h', 10, 8, 2], ['v', 18, 9, 2], ['v', 18, 14, 2], ['h', 22, 12, 4],
    ['v', 30, 9, 2], ['v', 30, 14, 2], ['h', 34, 8, 2], ['v', 42, 3, 2], ['h', 44, 8, 2], ['h', 44, 13, 2]],
  windows: [['h', 0, 3, 'door'], ['h', 0, 12], ['h', 0, 24, 'portrait'], ['h', 0, 36], ['h', 0, 45, 'door'], ['h', 0, 43.2, 'panel'],
    ['h', 18, 5], ['h', 18, 13], ['h', 18, 24, 'door'], ['h', 18, 34], ['h', 18, 38], ['h', 18, 47],
    ['v', 0, 4], ['v', 0, 10], ['v', 48, 4], ['v', 48, 10], ['v', 48, 15]],
  build() {
    // 倉庫：庭師の梯子が壁に立て掛けてある
    F.ladder(0.45, 5, 1); F.crate(2.2, 4.2); F.basket(2.6, 6.6);
    F.crate(5.2, 1.0); F.crate(4.3, 0.9, 0.6); F.crate(5.2, 7.2); F.crate(4.3, 7.3, 0.6);
    F.linen(0.3, 1.8, 1, 1.6);
    // 資料室
    F.cabinet(12, 0.35, 0, 2, 1.0, '#5a4a3a');
    F.shelf(8.2, 0.3, 0, 2.4); F.shelf(15.8, 0.3, 0, 2.4); F.shelf(15.5, 7.7, 2, 2.4);
    F.table(12, 4.5, 2.4, 1.2); F.chair(11.2, 5.4, 2); F.chair(12.8, 5.4, 2);
    // 応接室
    F.rug(8, 13, 7, 5, TEX.redCarpet);
    F.sofa(8, 11.2, 0); F.sofa(8, 14.8, 2); F.table(8, 13, 1.6, 0.9, M.darkWood);
    F.fireplace(0.35, 14.5, 1); F.armchair(3.4, 13, 1);
    F.piano(15.4, 10.6, 3); F.plant(17.3, 17.3); F.cabinet(9, 17.7, 2, 1.4, 0.9); F.plant(0.6, 8.6);
    // 大広間
    F.stairs(22, 0, 26, 4, 'n');
    F.rug(24, 8, 6, 5, TEX.redCarpet);
    for (const [x, z] of [[19.5, 5.5], [28.5, 5.5], [19.5, 10.5], [28.5, 10.5]]) F.pillar(x, z);
    F.chandelier(24, 7.5, 2.0);
    F.pedestalVase(18.5, 7); F.pedestalVase(29.5, 7, '#8a2a4a');
    // 玄関ホール
    F.clock(18.35, 17.2, 1); F.plant(29.5, 17.4); F.plant(18.6, 12.6); F.rug(24, 15.6, 4, 2.4, TEX.carpet);
    // キッチン
    F.fridge(31, 0.4, 0); F.counter(34, 0.35, 0, 3); F.stove(37, 0.4, 0); F.counter(39.6, 0.35, 0, 2.2);
    F.table(36, 4, 2.6, 1.2, M.white); F.cabinet(41.7, 6.6, 3, 1.2, 1.9, '#f4f1ea');
    // キッチン裏：勝手口と配電盤は北の壁
    F.crate(47.3, 7.3); F.crate(46.4, 7.4, 0.6); F.basket(47.4, 3);
    // 食堂
    F.table(36, 13, 5, 1.4, M.wood);
    for (const x of [34, 35.33, 36.67, 38]) { F.chair(x, 12.05, 0); F.chair(x, 13.95, 2); }
    F.chair(33.1, 13, 1); F.chair(38.9, 13, 3);
    F.cabinet(41.7, 13, 3, 2.4, 1.0); F.chandelier(36, 13, 2.2);
    // 裏階段
    F.stairs(46, 8, 48, 13, 'n', 2.8, 8);
    // 洗濯室
    F.washer(47.6, 15, 3); F.washer(47.6, 16.2, 3); F.basket(44.5, 17.4);
    F.linen(42.3, 16, 1, 1.6);
  },
  setup() {
    exit('倉庫から外へ', 3, 0.9, { area: 'grounds', x: HX + 3, z: HZ - 0.7 });
    exit('2Fへ上がる', 24, 4.6, { area: 'f2', x: 24, z: 9.5 });
    exit('玄関から外へ', 24, 17.3, { area: 'grounds', x: HX + 24, z: HZ + 18.7 });
    exit('勝手口から外へ', 45, 0.9, { area: 'grounds', x: HX + 45, z: HZ - 0.7 });
    exit('裏階段で2Fへ', 45.2, 10.5, { area: 'f2', x: 45.2, z: 10.5 });
    spot('古い図面棚', 12, 1.1, 'archive', 'blueprint');
    spot('運送伝票', 4.7, 2.0, 'storage', 'slips');
    spot('庭師の梯子', 1.3, 5, 'storage', 'ladder');
    spot('洗濯かご', 44.5, 16.7, 'laundry', 'basket');
    spot('配電盤', 43.2, 0.9, 'kback', 'breaker');
    spot('柱時計', 19, 17.2, 'hall', 'clock');
    spot('家族の肖像画', 22, 4.6, 'great', 'portrait');
    spot('食料庫', 39.6, 1.2, 'kitchen', 'pantry');
    flavor('暖炉', 1.3, 14.5, 'よく磨かれた暖炉。冬が近い。');
  },
};

// ---- 屋敷 2F（48m×18m） ----
AREAS.f2 = {
  name: '屋敷 2F', origin: HOUSE, hide: 'house', below: FLOOR2_Y,
  rooms: [
    { name: '物置', x: 0, z: 0, w: 6, d: 8, wall: 'plain' },
    { name: '隠し部屋', x: 6, z: 0, w: 4, d: 8, private: true, secret: true, wall: 'plain', key: 'hidden' },
    { name: '書斎', x: 10, z: 0, w: 8, d: 8, private: true, key: 'study' },
    { name: '吹き抜け', x: 18, z: 0, w: 12, d: 8, type: 'void' },
    { name: '浴室', x: 30, z: 0, w: 6, d: 8, floor: 'tile', wall: 'tile' },
    { name: '洗面所（化粧室）', x: 36, z: 0, w: 6, d: 8, floor: 'tile', wall: 'tile' },
    { name: 'リネン室', x: 42, z: 0, w: 6, d: 8, floor: 'tile', wall: 'plain' },
    { name: '2F廊下', x: 0, z: 8, w: 42, d: 3, key: 'corridor' },
    { name: '裏階段', x: 42, z: 8, w: 6, d: 5, wall: 'plain' },
    { name: '衣装部屋', x: 0, z: 11, w: 6, d: 7, floor: 'carpet', private: true },
    { name: '主寝室', x: 6, z: 11, w: 12, d: 7, floor: 'carpet', private: true, key: 'master' },
    { name: 'サロン', x: 18, z: 11, w: 12, d: 4 },
    { name: 'バルコニー', x: 18, z: 15, w: 12, d: 3, floor: 'stone', open: true, key: 'balcony' },
    { name: 'お嬢様の部屋', x: 30, z: 11, w: 12, d: 7, private: true, key: 'droom' },
    { name: '納戸', x: 42, z: 13, w: 6, d: 5, wall: 'plain' },
  ],
  doors: [['h', 2, 8, 2], ['h', 13, 8, 2], ['h', 32, 8, 2], ['h', 38, 8, 2], ['v', 36, 3, 2], ['v', 42, 9, 2], ['h', 44, 8, 2], ['h', 44, 13, 2],
    ['v', 6, 14, 2], ['h', 10, 11, 2], ['h', 22, 11, 4], ['h', 22, 15, 4], ['h', 34, 11, 2],
    ['v', 10, 2, 2, 'secret'], ['h', 23, 8, 2, 'secret']],
  windows: [['h', 0, 3], ['h', 0, 8, 'boarded'], ['h', 0, 14], ['h', 0, 24], ['h', 0, 33], ['h', 0, 39], ['h', 0, 45],
    ['h', 18, 3], ['h', 18, 9], ['h', 18, 15], ['h', 18, 33], ['h', 18, 39], ['h', 18, 45],
    ['v', 0, 4], ['v', 48, 4], ['v', 48, 15]],
  build() {
    // 1Fの外壁（バルコニーや窓の外から、屋敷が宙に浮いて見えないように）
    const shell = mat('#e8dcc0'), sh = FLOOR2_Y - 0.04;
    box(A.group, 48, sh, 0.2, shell, 24, -FLOOR2_Y, 0.1); box(A.group, 48, sh, 0.2, shell, 24, -FLOOR2_Y, 17.9);
    box(A.group, 0.2, sh, 18, shell, 0.1, -FLOOR2_Y, 9); box(A.group, 0.2, sh, 18, shell, 47.9, -FLOOR2_Y, 9);
    // 吹き抜け：下に大広間が見える
    plane(A.group, 48, 18, mat('#3a2a22'), 24, -FLOOR2_Y + 0.04, 9);
    plane(A.group, 12, 12, mat('#ffffff', { map: tiled(TEX.marble, 6, 6) }), 24, -FLOOR2_Y + 0.05, 6);
    F.chandelier(24, 4, 1.2);
    solid(23, 25, 4, 8, 'rail');
    for (let i = 0; i < 9; i++) box(A.group, 2, 0.12, 0.42, i % 2 ? M.wood : M.lightWood, 24, -0.37 * (i + 1), 7.8 - i * 0.42);
    // 物置
    F.crate(1.2, 5.6); F.crate(2.1, 6.6, 0.6); F.cabinet(0.35, 4.6, 1, 1.2, 1.0);
    F.crate(5.2, 1); F.crate(4.4, 0.9, 0.6); F.linen(0.3, 1.8, 1, 1.6);
    // 隠し部屋（本棚を開けるまで中は見えない）
    const easel = piece(8, 2, 0, 1.3, 0.6, g => {
      box(g, 0.08, 1.8, 0.08, M.darkWood, -0.5, 0, 0); box(g, 0.08, 1.8, 0.08, M.darkWood, 0.5, 0, 0);
      box(g, 1.3, 1.0, 0.08, M.gold, 0, 0.8, 0.05);
      box(g, 1.15, 0.85, 0.02, mat('#ffffff', { map: TEX.painting, emissive: '#222244' }), 0, 0.88, 0.1);
    });
    const spot = new THREE.SpotLight('#cfe0ff', 0, 7, 0.6, 0.6);
    spot.position.set(8, 2.8, 5); spot.target.position.set(8, 1.2, 2);
    A.group.add(spot, spot.target);
    A.secret = { objs: [easel, A.def.rooms.find(r => r.secret).floorMesh], spot };
    // 書斎
    F.rug(14, 4.5, 5, 4, TEX.carpet);
    F.desk(14.5, 3.2, 0, 1.8); F.chair(14.5, 2.4, 0, '#5a2a2a');
    F.shelf(17.7, 3, 3, 2.4); F.armchair(11.6, 6.6, 0); F.globe(17.3, 6.8); F.plant(17.3, 0.6);
    // 隠し本棚：西の壁沿い。北端を軸に、扉のように手前へ開く
    const hinge = new THREE.Group(); hinge.position.set(10.6, 0, 1.8); hinge.rotation.y = Math.PI / 2; A.group.add(hinge);
    const sg = new THREE.Group(); sg.position.set(-1.1, 0, -0.25); hinge.add(sg);
    const red = bookshelf(sg, 2.2, 2.6, true);
    A.shelf = { hinge, red, box: solid(10.1, 10.6, 1.8, 4.0, 'furniture') };
    // 浴室：浴槽とシャワー
    F.tub(33, 0.55, 0); F.shower(35.4, 6.4, 3); F.cabinet(30.4, 6, 1, 1.2, 1.0, '#f4f1ea');
    // 洗面所（化粧室）：鏡付きの洗面台が二つ
    F.sink(36.4, 1.4, 1); F.sink(36.4, 6.4, 1); F.linen(41.65, 2.4, 3, 1.4); F.plant(41.5, 7.4);
    // リネン室
    F.linen(42.35, 3, 1, 2.2); F.linen(47.65, 3, 3, 2.2); F.table(45, 5, 1.4, 0.8);
    // 廊下
    plane(A.group, 41.6, 1.4, mat('#8a1f2a'), 21, 0.013, 9.5);
    F.pedestalVase(8, 8.4); F.pedestalVase(16.5, 8.4, '#8a2a4a'); F.pedestalVase(36, 8.4);
    // 裏階段（1Fへ降りる吹き抜け）
    plane(A.group, 2, 5, mat('#2a1a14'), 47, 0.015, 10.5);
    solid(46, 48, 8, 13, 'furniture');
    // 納戸
    F.crate(47, 17); F.crate(43, 17.3, 0.7); F.linen(47.65, 15, 3, 1.6);
    // 衣装部屋：壁沿いにドレスを吊るす
    F.dressRack(3, 11.45, 0, 4.4); F.dressRack(0.45, 15, 1, 3.6);
    F.mannequin(3.6, 15.4); F.dresser(5.55, 12.5, 3);
    // 主寝室
    F.bed(12, 16.8, 2, '#8a2a4a', 2.2, 2.3);
    F.cabinet(10.4, 17.65, 2, 0.6, 0.6); F.cabinet(13.6, 17.65, 2, 0.6, 0.6);
    F.dresser(15.6, 11.35, 0); F.wardrobe(6.4, 12.4, 1, 1.6); F.rug(12, 14, 5, 2.6, TEX.carpet); F.armchair(16.8, 15.5, 3);
    // サロン
    F.sofa(19.5, 13, 1, '#2a4a6a'); F.sofa(28.5, 13, 3, '#2a4a6a'); F.plant(18.5, 11.5); F.plant(29.5, 11.5);
    // バルコニー
    F.bench(20.5, 17.4, 2); F.plant(18.5, 17.5); F.plant(29.5, 17.5); F.table(27.5, 16.6, 1, 1, M.white);
    // お嬢様の部屋
    F.bed(39, 16.85, 2, '#f0a0b0', 1.6, 2.1); F.desk(33, 17.5, 2, 1.4); F.chair(33, 16.7, 0, '#f0a0b0');
    F.shelf(38, 11.3, 0, 2, 1.8); F.rug(36, 14.5, 3, 2.5, TEX.carpet); F.plant(41.5, 11.5);
  },
  setup() {
    exit('1Fへ降りる', 24, 9.4, { area: 'f1', x: 24, z: 4.6 });
    exit('裏階段で1Fへ', 45.2, 10.5, { area: 'f1', x: 45.2, z: 10.5 });
    spot('廊下の窓', 16, 9.6, 'corridor', 'windows');
    special('本棚', 10.95, 2.7, 'shelf');
    spot('机の引き出し', 14.5, 4.1, 'study', 'desk');
    spot('部屋の空気', 16.2, 5.6, 'study', 'air');
    spot('布の掛かった額', 8, 3.2, 'hidden', 'painting', { secretOnly: true });
    spot('鏡台', 15.6, 12.2, 'master', 'dresser');
    spot('勉強机', 33, 16.3, 'droom', 'desk');
    flavor('ドレス', 3, 12.4, 'お母様のドレスがずらりと並んでいる。どれも一度しか袖を通していないようだ。');
    flavor('浴槽', 33, 1.6, '大理石の浴槽。毎晩、お母様が長風呂をする。');
    flavor('洗面台', 37.2, 1.4, '鏡付きの洗面台が二つ並ぶ化粧室。お嬢様の化粧品が少しだけ置いてある。');
    spot('ガラス戸の鍵', 22.6, 14.4, 'balcony', 'door');
    flavor('バルコニー', 24, 17.0, '前庭と噴水が一望できる。正門の向こうに街の灯りが見える。');
  },
};

export function buildArea(id, scene) {
  const def = AREAS[id];
  A = { id, def, name: def.name, group: new THREE.Group(), solids: [], walls: [], blocks: [], things: [], rooms: def.rooms, zones: def.zones || [], secret: null, shelf: null };
  scene.add(A.group);
  if (def.rooms.length) buildRooms(def);
  def.build();
  def.setup();
  const area = A;
  A = null;
  return area;
}
export const AREA_INFO = Object.fromEntries(Object.entries(AREAS).map(([k, v]) => [k, { name: v.name, outdoor: !!v.outdoor, origin: v.origin, hide: v.hide, below: v.below || 0 }]));
