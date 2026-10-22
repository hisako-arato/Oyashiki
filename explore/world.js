// 屋敷の間取り・家具・人物・調べられる場所
// 座標は1マス1m。x は東向き、z は南向き（間取り図の上が北＝z の小さい側）
import { THREE, TEX, M, mat, tiled, box, cyl, ball, mesh, plane, makeChar, rand } from './engine.js';

const WALL_H = 3, WALL_T = 0.2;

// 組み立て中のエリア
let A = null;
const solid = (minX, maxX, minZ, maxZ, tag) => { const s = { minX, maxX, minZ, maxZ, tag }; A.solids.push(s); return s; };

// ---- 家具：中心 (x, z)、rot は 90度単位の向き（0 で正面が南） ----
function piece(x, z, rot, w, d, build, { solidify = true, y = 0 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = [0, Math.PI / 2, Math.PI, -Math.PI / 2][rot];
  build(g);
  A.group.add(g);
  const [hw, hd] = rot % 2 ? [d / 2, w / 2] : [w / 2, d / 2];
  if (solidify) solid(x - hw, x + hw, z - hd, z + hd, 'furniture');
  return g;
}
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
    for (let i = 0; i < Math.round(w / 0.5); i++) box(g, 0.06, 0.06, 0.04, M.gold, -w / 2 + 0.25 + i * 0.5, h * 0.7, 0.26);
  }),
  counter: (x, z, rot, w = 2) => piece(x, z, rot, w, 0.65, g => {
    box(g, w, 0.85, 0.65, M.white, 0, 0, 0);
    box(g, w + 0.04, 0.05, 0.7, mat('#5a5a60'), 0, 0.85, 0);
  }),
  stove: (x, z, rot) => piece(x, z, rot, 1, 0.7, g => {
    box(g, 1, 0.85, 0.7, M.black, 0, 0, 0);
    for (const a of [-0.25, 0.25]) for (const b of [-0.15, 0.15]) cyl(g, 0.12, 0.12, 0.03, M.metal, a, 0.85, b);
    box(g, 1, 0.8, 0.1, M.metal, 0, 1.6, -0.3);
  }),
  fridge: (x, z, rot) => piece(x, z, rot, 0.8, 0.7, g => { box(g, 0.8, 1.9, 0.7, M.white, 0, 0, 0); box(g, 0.04, 0.6, 0.04, M.metal, 0.3, 1.0, 0.36); }),
  crate: (x, z, s = 0.8) => piece(x, z, 0, s, s, g => { box(g, s, s, s, M.lightWood, 0, 0, 0); box(g, s + 0.02, 0.08, s + 0.02, M.wood, 0, s * 0.5, 0); }),
  plant: (x, z) => piece(x, z, 0, 0.5, 0.5, g => { box(g, 0.4, 0.4, 0.4, mat('#8a5a3a'), 0, 0, 0); ball(g, 0.42, M.green, 0, 0.85, 0); }),
  fireplace: (x, z, rot) => piece(x, z, rot, 1.8, 0.6, g => {
    box(g, 1.8, 1.2, 0.6, M.stoneM, 0, 0, 0);
    box(g, 0.9, 0.7, 0.1, M.black, 0, 0.05, 0.26);
    box(g, 2.0, 0.1, 0.7, M.darkWood, 0, 1.2, 0);
    const fire = ball(g, 0.18, mat('#ff9a3a', { emissive: '#ff6a1a', emissiveIntensity: 1.2 }), 0, 0.25, 0.2);
    fire.castShadow = false;
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
  tub: (x, z, rot) => piece(x, z, rot, 1.7, 0.8, g => {
    box(g, 1.7, 0.55, 0.8, M.white, 0, 0, 0);
    box(g, 1.5, 0.02, 0.6, mat('#9ac8e8', { emissive: '#3a6a8a', emissiveIntensity: 0.3 }), 0, 0.5, 0);
  }),
  sink: (x, z, rot) => piece(x, z, rot, 0.8, 0.5, g => { box(g, 0.8, 0.85, 0.5, M.white, 0, 0, 0); box(g, 0.6, 0.8, 0.04, M.glass, 0, 1.2, -0.23); }),
  clock: (x, z, rot) => piece(x, z, rot, 0.6, 0.4, g => {
    box(g, 0.6, 2.1, 0.4, M.darkWood, 0, 0, 0);
    mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 16), M.paper, 0, 1.7, 0.21, g).rotation.x = Math.PI / 2;
  }),
  wardrobe: (x, z, rot, w = 1.4) => piece(x, z, rot, w, 0.6, g => {
    box(g, w, 2.1, 0.6, M.wood, 0, 0, 0);
    box(g, 0.02, 1.8, 0.02, M.darkWood, 0, 0.15, 0.31);
    for (const s of [-0.1, 0.1]) box(g, 0.05, 0.2, 0.05, M.gold, s, 1.0, 0.32);
  }),
  dresser: (x, z, rot) => piece(x, z, rot, 1.1, 0.5, g => {
    box(g, 1.1, 0.75, 0.5, M.white, 0, 0, 0);
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
    const l = new THREE.PointLight('#ffd9a0', 8, 9, 1.4); l.position.set(0, 0, 0); g.add(l);
  },
  pillar: (x, z) => piece(x, z, 0, 0.5, 0.5, g => { cyl(g, 0.22, 0.22, WALL_H, M.white, 0, 0, 0, 10); box(g, 0.55, 0.15, 0.55, M.gold, 0, 0, 0); }),
  pedestalVase: (x, z, color = '#2a4a8a') => piece(x, z, 0, 0.45, 0.45, g => { box(g, 0.45, 0.9, 0.45, M.white, 0, 0, 0); cyl(g, 0.14, 0.2, 0.42, mat(color), 0, 0.9, 0); }),
  globe: (x, z) => piece(x, z, 0, 0.5, 0.5, g => { cyl(g, 0.04, 0.04, 0.8, M.darkWood, 0, 0, 0); ball(g, 0.3, mat('#3a6a9a'), 0, 1.1, 0, 1); }),
  armchair: (x, z, rot, color = '#7a3a2a') => piece(x, z, rot, 0.9, 0.9, g => {
    const m = mat(color);
    box(g, 0.9, 0.45, 0.9, m, 0, 0, 0); box(g, 0.9, 0.6, 0.2, m, 0, 0.45, -0.35);
  }),
  stairs: (x1, z1, x2, z2, dir, rise = 2.8, steps = 10) => {
    // dir：上っていく方向（'n','s','e','w'）。見た目だけの階段
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
  liftCage: (x, z, rot) => piece(x, z, rot, 1.4, 1.4, g => {
    box(g, 1.4, 0.1, 1.4, M.metal, 0, 0, 0);
    for (const [a, b] of [[-0.65, -0.65], [0.65, -0.65], [-0.65, 0.65], [0.65, 0.65]]) box(g, 0.08, 2.4, 0.08, M.metal, a, 0, b);
    box(g, 1.4, 0.08, 1.4, M.metal, 0, 2.4, 0);
    for (let i = -3; i <= 3; i++) box(g, 0.03, 2.3, 0.03, M.metal, i * 0.2, 0.1, -0.65);
    box(g, 0.25, 0.4, 0.06, mat('#c8362d', { emissive: '#400' }), 0.5, 1.1, 0.68);
  }),
  basket: (x, z) => piece(x, z, 0, 0.6, 0.45, g => { box(g, 0.6, 0.4, 0.45, M.lightWood, 0, 0, 0); box(g, 0.5, 0.12, 0.35, M.white, 0, 0.4, 0); }),
  rack: (x, z, rot, w = 1.6) => piece(x, z, rot, w, 0.5, g => {
    box(g, 0.05, 1.7, 0.05, M.gold, -w / 2, 0, 0); box(g, 0.05, 1.7, 0.05, M.gold, w / 2, 0, 0); box(g, w, 0.04, 0.04, M.gold, 0, 1.65, 0);
    for (let i = 0; i < 5; i++) mesh(new THREE.ConeGeometry(0.22, 1.1, 6), mat(['#b8436f', '#3a2a6a', '#e8c04a', '#2a6a5a', '#f4f1ea'][i]), -w / 2 + 0.25 + i * (w - 0.5) / 4, 1.05, 0, g);
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
  hedge: (x1, z1, x2, z2) => { const g = new THREE.Group(); A.group.add(g); box(g, x2 - x1, 0.9, z2 - z1, M.green, (x1 + x2) / 2, 0, (z1 + z2) / 2); solid(x1, x2, z1, z2, 'furniture'); },
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
  car: (x, z, rot) => piece(x, z, rot, 1.8, 4.2, g => {
    box(g, 1.8, 0.7, 4.2, mat('#1a1a22', { metalness: 0.4, roughness: 0.3 }), 0, 0.3, 0);
    box(g, 1.6, 0.55, 2.2, mat('#1a1a22', { metalness: 0.4, roughness: 0.3 }), 0, 1.0, -0.2);
    box(g, 1.62, 0.4, 2.0, M.glass, 0, 1.05, -0.2);
    for (const [a, b] of [[-0.85, -1.3], [0.85, -1.3], [-0.85, 1.3], [0.85, 1.3]]) mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.2, 10), M.black, a, 0.33, b, g).rotation.z = Math.PI / 2;
  }),
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
  }, { solidify: true }),
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
const FLOOR = {
  wood: () => TEX.wood, marble: () => TEX.marble, tile: () => TEX.tile, stone: () => TEX.stone, grass: () => TEX.grass,
};
function floorOf(r) {
  if (r.floor === 'carpet') return mat('#7a3a48');
  const tex = FLOOR[r.floor || 'wood']();
  const s = r.floor === 'wood' || !r.floor ? 3 : 2;
  return mat('#ffffff', { map: tiled(tex, r.w / s, r.d / s) });
}

function buildRooms(def) {
  const wallMat = len => mat('#ffffff', { map: tiled(def.wallTex === 'plain' ? TEX.plain : TEX.wall, len / 1.5, WALL_H / 1.5) });
  for (const r of def.rooms) {
    if (r.type === 'void') continue;
    const f = plane(A.group, r.w, r.d, floorOf(r), r.x + r.w / 2, 0, r.z + r.d / 2);
    r.floorMesh = f;
  }
  // 単位辺ごとに、両側の部屋を記録する
  const edges = new Map();
  const add = (ori, x, z, r) => {
    const k = `${ori},${x},${z}`;
    if (!edges.has(k)) edges.set(k, { ori, x, z, rooms: [] });
    edges.get(k).rooms.push(r);
  };
  for (const r of def.rooms) {
    for (let x = r.x; x < r.x + r.w; x++) { add('h', x, r.z, r); add('h', x, r.z + r.d, r); }
    for (let z = r.z; z < r.z + r.d; z++) { add('v', r.x, z, r); add('v', r.x + r.w, z, r); }
  }
  const opened = new Set();
  for (const [ori, x, z, len] of def.doors) for (let i = 0; i < len; i++) opened.add(ori === 'h' ? `h,${x + i},${z}` : `v,${x},${z + i}`);
  const runs = {};
  for (const [k, e] of edges) {
    if (opened.has(k)) continue;
    const rs = e.rooms, isVoid = r => r.type === 'void';
    let kind;
    if (rs.length === 2) {
      if (rs.every(isVoid)) continue;
      kind = rs.some(isVoid) ? 'rail' : 'wall';
    } else kind = !isVoid(rs[0]) && rs[0].open ? 'rail' : 'wall';
    const line = `${e.ori},${e.ori === 'h' ? e.z : e.x},${kind}`;
    (runs[line] ||= []).push(e.ori === 'h' ? e.x : e.z);
  }
  for (const [line, list] of Object.entries(runs)) {
    const [ori, c, kind] = line.split(',');
    list.sort((a, b) => a - b);
    let start = list[0], prev = list[0];
    for (let i = 1; i <= list.length; i++) {
      if (list[i] === prev + 1) { prev = list[i]; continue; }
      (kind === 'wall' ? wallSeg : railSeg)(ori, +c, start, prev + 1, wallMat);
      start = prev = list[i];
    }
  }
  // 扉の枠
  for (const [ori, x, z, len, kind] of def.doors) {
    if (kind === 'secret') continue;
    const c = ori === 'h' ? z : x, a = ori === 'h' ? x : z;
    const w = entry(ori, c, a, a + len);
    for (const p of [0, len]) box(w.g, 0.12, 2.4, WALL_T + 0.14, M.gold, p - len / 2, 0, 0);
    w.decor.push(box(w.g, len + 0.12, 0.6, WALL_T, wallMat(len), 0, 2.4, 0));
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
function wallSeg(ori, c, a, b, wallMat) {
  const len = b - a, w = entry(ori, c, a, b);
  box(w.g, len, WALL_H, WALL_T, wallMat(len), 0, 0, 0);
  box(w.g, len, 1, WALL_T + 0.06, M.wainscot, 0, 0, 0);
  box(w.g, len, 0.08, WALL_T + 0.1, M.gold, 0, 1, 0);
  box(w.g, len, 0.15, WALL_T + 0.12, M.darkWood, 0, WALL_H - 0.15, 0);
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
// 壁に窓・扉・板を付ける
function decorate(ori, c, pos, kind) {
  const w = A.walls.find(e => e.kind === 'wall' && e.ori === ori && Math.abs(e.c - c) < 0.01 && pos > e.a && pos < e.b);
  if (!w) return;
  const lx = ori === 'h' ? pos - w.mid : -(pos - w.mid);
  if (kind === 'window' || kind === 'boarded') {
    w.decor.push(box(w.g, 1.2, 1.3, WALL_T + 0.04, kind === 'boarded' ? M.darkWood : M.glass, lx, 1.05, 0));
    w.decor.push(box(w.g, 1.36, 0.1, WALL_T + 0.08, M.gold, lx, 1.0, 0));
    w.decor.push(box(w.g, 1.36, 0.1, WALL_T + 0.08, M.gold, lx, 2.35, 0));
    if (kind === 'boarded') for (const y of [1.3, 1.75, 2.1]) w.decor.push(box(w.g, 1.3, 0.12, WALL_T + 0.1, M.lightWood, lx, y, 0));
  } else if (kind === 'door') {
    w.decor.push(box(w.g, 1.2, 2.3, WALL_T + 0.08, M.darkWood, lx, 0, 0));
    w.decor.push(box(w.g, 0.1, 0.1, WALL_T + 0.16, M.gold, lx + 0.4, 1.1, 0));
  } else if (kind === 'panel') {
    w.decor.push(box(w.g, 0.9, 1.1, WALL_T + 0.16, mat('#5a6068'), lx, 1.1, 0));
    for (let i = 0; i < 4; i++) w.decor.push(box(w.g, 0.12, 0.25, WALL_T + 0.22, mat(i === 2 ? '#c8362d' : '#2a2a2a'), lx - 0.3 + i * 0.2, 1.5, 0));
  } else if (kind === 'portrait') {
    w.decor.push(box(w.g, 1.3, 1.6, WALL_T + 0.08, M.gold, lx, 1.2, 0));
    w.decor.push(box(w.g, 1.1, 1.4, WALL_T + 0.12, mat('#5a4636'), lx, 1.3, 0));
  }
}

// 屋外の建物（プレイヤーを隠すときは低くなる）
function block({ x1, x2, z1, z2, h, color = '#e8dcc0', roof = '#7a4a3a', windows = [] }) {
  const g = new THREE.Group(); A.group.add(g);
  const w = x2 - x1, d = z2 - z1, cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  // 上面は屋根の色（低くしたときに見える）
  const side = mat(color), top = mat(roof);
  box(g, w, h, d, [side, side, top, side, side, side], cx, 0, cz);
  box(g, w, 0.5, d, mat('#d8c7a2'), cx, 0, cz).scale.set(1.01, 1, 1.01);
  const roofG = new THREE.Group(); g.add(roofG);
  box(roofG, w + 0.6, 0.25, d + 0.6, M.darkWood, cx, h, cz);
  const r = mesh(new THREE.CylinderGeometry(0.01, Math.SQRT1_2, 1, 4, 1), mat(roof, { map: tiled(TEX.roof, 4, 2) }), cx, h + 0.25 + 0.9, cz, roofG);
  r.rotation.y = Math.PI / 4; r.scale.set(w + 0.4, 1.8, d + 0.4);
  const decor = [roofG];
  // 窓 [面, 位置, 高さ]
  for (const [face, p, y = 1.2, kind] of windows) {
    const wm = kind === 'door' ? M.darkWood : M.glass, ww = kind === 'door' ? 1.4 : 1.1, wh = kind === 'door' ? 2.4 : 1.3;
    let m;
    if (face === 'n') m = box(g, ww, wh, 0.1, wm, p, y, z1 - 0.02);
    if (face === 's') m = box(g, ww, wh, 0.1, wm, p, y, z2 + 0.02);
    if (face === 'e') m = box(g, 0.1, wh, ww, wm, x2 + 0.02, y, p);
    if (face === 'w') m = box(g, 0.1, wh, ww, wm, x1 - 0.02, y, p);
    decor.push(m);
  }
  solid(x1, x2, z1, z2);
  const b = { g, x1, x2, z1, z2, h, decor, scale: 1 };
  A.blocks.push(b);
  return b;
}

// ---- 人物 ----
const LOOKS = {
  red: { outfit: '#c8362d', hair: '#7a2a1a', maid: true, name: '赤メイド' },
  blue: { outfit: '#2f6fd0', hair: '#e8c070', maid: true, name: '青メイド' },
  black: { outfit: '#222230', hair: '#141414', maid: true, longHair: true, name: '黒メイド' },
  white: { outfit: '#c8ccd2', hair: '#c0c0c8', maid: true, name: '白メイド' },
  mother: { outfit: '#8a2a4a', hair: '#5a3020', dress: true, longHair: true, name: 'お母様' },
  daughter: { outfit: '#f0d070', hair: '#3a2418', dress: true, longHair: true, name: 'お嬢様' },
};
function npc(id, x, z, facing = 0, extra = {}) {
  const look = LOOKS[id];
  const ch = makeChar(A.group, look);
  const n = { id, name: look.name, ...ch, x, z, talk: 0, ...extra };
  ch.g.position.set(x, 0, z);
  ch.g.rotation.y = facing;
  A.npcs.push(n);
  return n;
}

// ---- 調べられる場所・出入口 ----
const thing = (name, x, z, run, extra = {}) => A.things.push({ name, at: () => [x, z], label: '調べる', run, ...extra });
const exit = (name, x, z, to) => A.things.push({ name, at: () => [x, z], label: name, exit: to });
const talker = (n, lines) => A.things.push({ name: n.name, npc: n, at: () => [n.x, n.z], label: 'TALK', run: api => api.say([n.name, lines[n.talk++ % lines.length]]) });

// ============================================================
// エリア定義
// ============================================================
const AREAS = {};

// ---- 使用人棟 ----
AREAS.cottage = {
  name: '使用人棟', bg: '#120c14', light: 1.0, wallTex: 'plain',
  rooms: [
    { name: '執事の部屋', x: 0, z: 0, w: 5, d: 10 },
    { name: '赤の部屋', x: 5, z: 0, w: 3, d: 3 },
    { name: '青の部屋', x: 8, z: 0, w: 3, d: 3 },
    { name: '共用室', x: 5, z: 3, w: 6, d: 4 },
    { name: '黒の部屋', x: 5, z: 7, w: 3, d: 3 },
    { name: '白の部屋', x: 8, z: 7, w: 3, d: 3 },
    { name: '浴室', x: 11, z: 0, w: 3, d: 3, floor: 'tile' },
    { name: '給湯室', x: 11, z: 3, w: 3, d: 4, floor: 'tile' },
    { name: '玄関', x: 11, z: 7, w: 3, d: 3, floor: 'stone' },
  ],
  doors: [['v', 5, 4, 2], ['h', 6, 3, 1], ['h', 9, 3, 1], ['h', 6, 7, 1], ['h', 9, 7, 1], ['h', 12, 3, 1], ['v', 11, 4, 2], ['h', 12, 7, 1]],
  windows: [['v', 0, 3], ['v', 0, 7], ['h', 0, 2.5], ['h', 0, 6.5], ['h', 0, 9.5], ['h', 10, 12.5, 'door']],
  build() {
    // 執事の部屋
    F.bed(1, 8.6, 0, '#2a3a5a');
    F.desk(2.5, 0.6, 0, 1.8); F.chair(2.5, 1.4, 2);
    F.shelf(4.6, 1.8, 3, 2.2);
    F.rug(2.5, 5, 3, 3.5, TEX.carpet);
    F.wardrobe(0.4, 4.5, 1);
    // メイドの部屋
    for (const [x, z, c, flip] of [[6, 0.2, '#c8362d', 0], [9, 0.2, '#2f6fd0', 0], [6, 9.8, '#222230', 2], [9, 9.8, '#c8ccd2', 2]]) {
      F.bed(x - 0.35, flip ? z - 1.0 : z + 1.0, flip, c, 0.9, 1.9);
      F.cabinet(x + 1.4, flip ? z - 0.35 : z + 0.35, flip, 0.6, 0.8);
    }
    // 共用室：朝礼のテーブル
    F.table(8, 5, 2.6, 1.3);
    for (const [x, z, r] of [[7.2, 4.0, 0], [8.8, 4.0, 0], [7.2, 6.0, 2], [8.8, 6.0, 2], [6.3, 5, 3]]) F.chair(x, z, r);
    F.chandelier(8, 5, 2.4);
    // 給湯室・浴室・玄関
    F.counter(13.6, 5, 3, 2.4);
    F.tub(12.5, 0.6, 0); F.sink(13.6, 2.2, 3);
    F.cabinet(13.6, 8.3, 3, 1.2, 0.9, '#8a6a4a');
  },
  setup(api) {
    thing('机', 2.5, 1.4, () => api.say('執事の机。手帳と万年筆が置いてある。', '（本編では、ここで手帳を整理してセーブする）'));
    thing('窓', 0.6, 3, () => api.say('窓の向こうに、屋敷の北側の壁が見える。'));
    thing('朝礼のテーブル', 8, 6.3, () => api.say('毎朝ここで定例会議を開き、メイドたちに仕事を割り振る。'));
    thing('赤の部屋', 6.5, 2.4, () => api.say('きちんと片付いている。枕元に料理の本が積まれている。'));
    thing('青の部屋', 9.5, 2.4, () => api.say('壁一面にスケッチが貼られている。どれも上手い。'));
    thing('黒の部屋', 6.5, 7.6, () => api.say('物がほとんどない。机の上に聖書が一冊。'));
    thing('白の部屋', 9.5, 7.6, () => api.say('工具箱と電気工学の教科書が置いてある。'));
    exit('外へ出る', 12.5, 9.3, { area: 'grounds', x: 60.5, z: 11.8 });
  },
};

// ---- 敷地（庭） ----
const HX = 10, HZ = 12; // 屋敷の1Fの原点が敷地のどこにあるか
AREAS.grounds = {
  name: '庭', bg: '#9cbfd6', light: 1.5, outdoor: true,
  rooms: [],
  doors: [],
  build() {
    plane(A.group, 64, 42, mat('#ffffff', { map: tiled(TEX.grass, 16, 10) }), 32, 0, 21);
    const path = (x1, z1, x2, z2) => plane(A.group, x2 - x1, z2 - z1, mat('#ffffff', { map: tiled(TEX.stone, (x2 - x1) / 2, (z2 - z1) / 2) }), (x1 + x2) / 2, 0.01, (z1 + z2) / 2);
    path(25.5, 27, 28.5, 42);                    // 正門から玄関
    path(20, 31, 34, 37);                         // 車寄せ
    path(44, 21, 61.5, 23);                       // 勝手口から使用人棟
    path(59.5, 11, 61.5, 23);
    path(11, 9, 13, 12);                          // 倉庫の扉
    path(11, 8, 44, 9.5);                         // 裏庭の小道
    path(43.5, 9.5, 45, 21);
    // 屋敷（1F・2F）
    const n2 = [2, 5.5, 10, 15, 19, 24.5, 31].map(x => ['n', HX + x, 4.4]);
    const n1 = [8.5, 17, 24.5, 31].map(x => ['n', HX + x, 1.2]);
    block({ x1: HX, x2: HX + 34, z1: HZ, z2: HZ + 12, h: 6.4, windows: [
      ...n2, ...n1, ['n', HX + 2, 0, 'door'],
      ...[3, 7, 10, 24, 26, 32].map(x => ['s', HX + x, 1.2]), ...[2, 6, 11, 23, 26, 31].map(x => ['s', HX + x, 4.4]),
      ['e', HZ + 5, 1.2], ['e', HZ + 10, 0, 'door'], ['e', HZ + 4, 4.4], ['e', HZ + 9, 4.4],
      ['w', HZ + 3, 1.2], ['w', HZ + 9, 1.2], ['w', HZ + 3, 4.4], ['w', HZ + 9, 4.4],
    ] });
    block({ x1: HX + 13, x2: HX + 21, z1: HZ + 12, z2: HZ + 15, h: 3.2, roof: '#6a4038', windows: [['s', HX + 17, 0, 'door'], ['e', HZ + 13.5, 1.2], ['w', HZ + 13.5, 1.2]] });
    for (const x of [HX + 13.4, HX + 20.6]) cyl(A.group, 0.18, 0.18, 3.2, M.white, x, 0, HZ + 15.2);
    // 使用人棟
    block({ x1: 48, x2: 62, z1: 1, z2: 11, h: 3.2, color: '#d8ccb4', roof: '#5a3a2a', windows: [['s', 60.5, 0, 'door'], ['s', 51, 1.2], ['s', 56, 1.2], ['w', 4, 1.2], ['w', 8, 1.2], ['n', 52, 1.2]] });
    // ガレージ
    block({ x1: 48, x2: 56, z1: 27, z2: 33, h: 3, color: '#cfc6b8', roof: '#3a3a40', windows: [['s', 52, 0, 'door']] });
    plane(A.group, 8, 6, mat('#ffffff', { map: tiled(TEX.stone, 4, 3) }), 52, 0.01, 36);
    // 塀と門
    const fence = (x1, z1, x2, z2) => { box(A.group, x2 - x1, 1.4, z2 - z1, mat('#cfc6b8'), (x1 + x2) / 2, 0, (z1 + z2) / 2); solid(x1, x2, z1, z2); };
    fence(0, -0.3, 64, 0); fence(-0.3, 0, 0, 42); fence(64, 0, 64.3, 42); fence(0, 42, 24, 42.3); fence(30, 42, 64, 42.3);
    for (let x = 24.2; x < 30; x += 0.3) cyl(A.group, 0.03, 0.03, 1.8, M.black, x, 0, 42.1, 5);
    solid(24, 30, 41.9, 42.3);
    for (const x of [24, 30]) box(A.group, 0.6, 2, 0.6, mat('#bfb6a8'), x, 0, 42.1);
    // 前庭
    F.fountain(27, 34);
    for (const [x, z] of [[18, 30], [36, 30], [18, 38], [36, 38]]) F.bush(x, z, false);
    F.lamp(24, 29); F.lamp(30.5, 29);
    // バラ園とガゼボ
    F.gazebo(5, 19);
    for (let z = 13; z <= 25; z += 2) { F.bush(1.5, z, true); F.bush(8.5, z, true); }
    F.bench(5, 23.5, 2);
    // 裏庭
    F.vegBed(18, 4, 4, 1.6); F.vegBed(24, 4, 4, 1.6);
    F.laundryLine(34, 4.5, 5);
    F.crate(14, 10.5, 0.9);
    // 木
    for (const [x, z, s] of [[3, 3, 1.2], [8, 2, 1], [42, 3, 1.1], [3, 33, 1.3], [8, 39, 1], [12, 30, 0.9], [44, 39, 1.2], [60, 38, 1.1], [61, 18, 1], [40, 30, 0.9]]) F.tree(x, z, s);
  },
  setup(api) {
    exit('使用人棟に入る', 60.5, 11.6, { area: 'cottage', x: 12.5, z: 9.2 });
    exit('勝手口から入る', 44.6, 22, { area: 'f1', x: 33.2, z: 10 });
    exit('倉庫に入る', 12, 11.4, { area: 'f1', x: 2, z: 0.9 });
    exit('玄関から入る', 27, 27.6, { area: 'f1', x: 17, z: 14.2 });
    thing('2階の窓', 27, 10, () => { api.state.windowsOut = true; api.say('屋敷の北側を見上げる。2階の窓は……7つ。', ...api.windowCheck()); });
    thing('噴水', 27, 32, () => api.say('白い大理石の噴水。水音が涼しげだ。'));
    thing('ガゼボ', 5, 21, () => api.say('バラ園のガゼボ。週末、お母様とお嬢様がここでお茶を楽しむ。'));
    thing('ガレージ', 52, 34, () => api.say('ガレージは空っぽだ。お父様は今日、会社に出かけている。'));
    thing('家庭菜園', 21, 5.5, () => api.say('トマトとハーブが育っている。赤メイドが世話をしているらしい。'));
    thing('正門', 27, 41, () => api.say('正門には鍵が掛かっている。夜は閉ざされる。'));
    const w = npc('white', 5.5, 25, Math.PI);
    talker(w, ['「庭の照明、配線が古くて。今度まとめて直しておきますね」', '「お屋敷の警報、照明とは別の系統なんですよ。キッチン裏の配電盤です」']);
  },
};

// ---- 屋敷 1F ----
AREAS.f1 = {
  name: '屋敷 1F', bg: '#120c14', light: 1.0,
  rooms: [
    { name: '倉庫', x: 0, z: 0, w: 4, d: 6, floor: 'stone' },
    { name: '資料室', x: 4, z: 0, w: 9, d: 6, private: true },
    { name: '応接室', x: 0, z: 6, w: 13, d: 6 },
    { name: '大広間', x: 13, z: 0, w: 8, d: 12, floor: 'marble' },
    { name: '玄関ホール', x: 13, z: 12, w: 8, d: 3, floor: 'marble' },
    { name: '食堂', x: 21, z: 0, w: 7, d: 6 },
    { name: 'キッチン', x: 21, z: 6, w: 7, d: 6, floor: 'tile' },
    { name: '裏階段', x: 28, z: 0, w: 6, d: 3 },
    { name: '洗濯室', x: 28, z: 3, w: 6, d: 4, floor: 'tile' },
    { name: 'キッチン裏', x: 28, z: 7, w: 6, d: 5, floor: 'stone' },
  ],
  doors: [['v', 13, 2, 2], ['v', 13, 8, 2], ['h', 8, 6, 2], ['h', 16, 12, 2], ['v', 21, 2, 2], ['h', 23, 6, 2], ['v', 28, 6, 1], ['v', 28, 9, 2], ['h', 30, 3, 2], ['h', 30, 7, 2]],
  windows: [['h', 0, 8.5], ['h', 0, 24.5], ['h', 0, 31.5], ['h', 0, 2, 'door'], ['h', 12, 3], ['h', 12, 9], ['h', 12, 23], ['h', 12, 26], ['h', 15, 17, 'door'],
    ['v', 34, 5], ['v', 34, 10, 'door'], ['v', 0, 9], ['h', 0, 17, 'portrait'], ['v', 34, 8, 'panel']],
  build() {
    // 倉庫
    F.liftCage(0.85, 3.2, 1);
    F.crate(3.3, 4.9); F.crate(3.3, 4.0, 0.7); F.crate(3.3, 1.4); F.linen(2.6, 5.7, 2, 1.4);
    // 資料室
    F.cabinet(6, 0.4, 0, 1.8, 1.1, '#5a4a3a');
    F.shelf(9, 0.35, 0, 2); F.shelf(11.5, 0.35, 0, 2);
    F.table(8.5, 3.5, 2, 1.1); F.chair(8.5, 4.4, 2); F.shelf(4.35, 3.2, 1, 2.4);
    // 応接室
    F.rug(6, 9, 5, 3.6, TEX.redCarpet);
    F.sofa(6, 7.6, 0); F.sofa(6, 10.6, 2); F.table(6, 9.1, 1.4, 0.8, M.darkWood);
    F.fireplace(0.35, 9, 1); F.piano(11.2, 7.5, 3); F.plant(12.4, 11.4); F.armchair(2.8, 9, 1);
    // 大広間
    F.stairs(15.5, 0, 18.5, 3, 'n');
    F.rug(17, 7.5, 5, 6, TEX.redCarpet);
    for (const [x, z] of [[14, 4.5], [20, 4.5], [14, 10.5], [20, 10.5]]) F.pillar(x, z);
    F.chandelier(17, 7.5, 2.0);
    F.pedestalVase(13.6, 6.8); F.pedestalVase(20.4, 6.8, '#8a2a4a');
    // 玄関ホール
    F.clock(13.4, 13.5, 1); F.plant(20.5, 13.5); F.rug(17, 14, 3, 1.6, TEX.carpet);
    // 食堂
    F.table(24.5, 3, 4.2, 1.3, M.wood);
    for (let i = 0; i < 4; i++) { F.chair(23 + i, 1.95, 0); F.chair(23 + i, 4.05, 2); }
    F.chair(21.8, 3, 1); F.chair(27.2, 3, 3);
    F.cabinet(24.5, 0.3, 0, 2.4, 1.0);
    // キッチン
    F.counter(25, 11.6, 2, 3); F.stove(22.2, 11.6, 2); F.fridge(21.5, 6.5, 0);
    F.table(24.5, 8.6, 2.2, 1, M.white); F.cabinet(27.6, 11.3, 3, 1, 1.9, '#f4f1ea');
    // 裏階段
    F.stairs(32, 0, 34, 2.8, 'n', 2.8, 8);
    // 洗濯室
    F.washer(33.5, 4.2, 3); F.washer(33.5, 5.2, 3); F.basket(29.3, 5.6); F.linen(31, 6.7, 2, 1.6);
    // キッチン裏
    F.crate(29, 11.3, 0.8); F.crate(29.9, 11.4, 0.6); F.basket(31.5, 11.5);
  },
  setup(api) {
    exit('倉庫から外へ', 2, 0.8, { area: 'grounds', x: HX + 2, z: HZ - 0.7 });
    exit('貨物EVで2Fへ', 1.9, 3.2, { area: 'f2', x: 1.9, z: 3.2 });
    exit('2Fへ上がる', 17, 3.6, { area: 'f2', x: 17, z: 6.9 });
    exit('玄関から外へ', 17, 14.4, { area: 'grounds', x: HX + 17, z: HZ + 15.7 });
    exit('勝手口から外へ', 33.4, 10, { area: 'grounds', x: HX + 34.7, z: HZ + 10 });
    exit('裏階段で2Fへ', 31, 1.5, { area: 'f2', x: 31, z: 1.6 });
    thing('古い図面棚', 6, 1.0, () => {
      api.state.blueprint = true;
      api.say('屋敷の古い設計図を見つけた。', '2階の書斎と物置の間に、用途の書かれていない細長い空間がある……。', ...api.hiddenCheck());
    }, { private: true });
    thing('運送伝票', 3.3, 2.2, () => api.say('20年前の運送伝票。差出人不明、品名は「額装品」。受取人は旦那様だ。'));
    thing('洗濯かご', 29.3, 6.2, () => { api.state.receipt = true; api.say('旦那様のスーツのポケットに、花屋の領収書が入っていた。', ['領収書', '「麗子様　お誕生日　11月3日」']); });
    thing('配電盤', 33.2, 8, () => api.say('配電盤。ひとつだけ新しい系統がある。警報装置用だろうか……配線が入り組んでいて、素人には見分けられない。'));
    thing('暖炉', 1.2, 9, () => api.say('よく磨かれた暖炉。冬が近い。'));
    thing('柱時計', 14, 13.5, () => api.say('毎朝ネジを巻くのも執事の仕事だ。'));
    const r = npc('red', 24.5, 10.4, Math.PI);
    talker(r, ['「……旦那様、毎年11月3日になると花を買ってくる。誰に渡すのかは、知らない」', '「……夜は、ここで明日の仕込みをしてる。裏階段の音、よく聞こえる」', '「……（ぼーっとしている）」']);
    const m = npc('mother', 3.6, 9, Math.PI / 2);
    talker(m, ['「あら執事さん。ねえ、少し隣に座っていかない？」', '「あの人、家族より絵が好きなのよ。夜中に書斎にこもってばかり」']);
    const k = npc('black', 17, 10.5, Math.PI, {
      path: [[17, 10.5, 2], [17, 5.5], [15, 3.5], [11.2, 3, 2.5], [15, 3.5], [17, 5.5]], speed: 1.5,
    });
    talker(k, ['「大広間の見回り中です。怪しい者は見逃しません」', '「資料室は旦那様の大切な書類ばかりです。用もなく入らないでください」']);
  },
};

// ---- 屋敷 2F ----
AREAS.f2 = {
  name: '屋敷 2F', bg: '#120c14', light: 1.0,
  rooms: [
    { name: '物置', x: 0, z: 0, w: 4, d: 6 },
    { name: '隠し部屋', x: 4, z: 0, w: 3, d: 6, private: true, secret: true },
    { name: '書斎', x: 7, z: 0, w: 6, d: 6, private: true },
    { name: '吹き抜け', x: 13, z: 0, w: 8, d: 6, type: 'void' },
    { name: '浴室・化粧室', x: 21, z: 0, w: 7, d: 6, floor: 'tile' },
    { name: '2F廊下', x: 0, z: 6, w: 28, d: 2 },
    { name: '主寝室', x: 0, z: 8, w: 9, d: 4, floor: 'carpet', private: true },
    { name: '客間', x: 9, z: 8, w: 4, d: 4 },
    { name: 'バルコニー', x: 13, z: 8, w: 8, d: 4, floor: 'stone', open: true },
    { name: 'お嬢様の部屋', x: 21, z: 8, w: 7, d: 4, private: true },
    { name: '裏階段', x: 28, z: 0, w: 6, d: 3 },
    { name: 'リネン室', x: 28, z: 3, w: 6, d: 3, floor: 'tile' },
    { name: '衣装部屋', x: 28, z: 6, w: 6, d: 6, floor: 'carpet', private: true },
  ],
  doors: [['h', 1, 6, 2], ['h', 9, 6, 2], ['h', 24, 6, 2], ['h', 4, 8, 2], ['h', 10, 8, 2], ['h', 16, 8, 2], ['h', 23, 8, 2],
    ['v', 28, 6, 2], ['h', 30, 6, 2], ['h', 30, 3, 2], ['v', 7, 1, 2, 'secret'], ['h', 16, 6, 2, 'secret']],
  windows: [['h', 0, 2], ['h', 0, 5.5, 'boarded'], ['h', 0, 10], ['h', 0, 24.5], ['h', 0, 31],
    ['h', 12, 3], ['h', 12, 6.5], ['h', 12, 11], ['h', 12, 23], ['h', 12, 26], ['v', 34, 9], ['v', 0, 10], ['v', 34, 4.5]],
  build(api) {
    // 吹き抜け：下に大広間が見える
    plane(A.group, 8, 6, mat('#ffffff', { map: tiled(TEX.marble, 4, 3) }), 17, -3.2, 3);
    F.chandelier(17, 3, 1.4);
    solid(16, 18, 3.2, 6, 'rail');
    for (let i = 0; i < 8; i++) box(A.group, 2, 0.12, 0.35, i % 2 ? M.wood : M.lightWood, 17, -0.4 * (i + 1), 5.8 - i * 0.35);
    // 物置
    F.liftCage(0.85, 3.2, 1); F.crate(3.3, 0.8); F.crate(3.3, 1.7, 0.7); F.linen(2.4, 0.3, 0, 1.4);
    // 隠し部屋（本棚を開けるまで中は見えない）
    const easel = piece(5.5, 1.5, 0, 1.3, 0.6, g => {
      box(g, 0.08, 1.8, 0.08, M.darkWood, -0.5, 0, 0); box(g, 0.08, 1.8, 0.08, M.darkWood, 0.5, 0, 0);
      box(g, 1.3, 1.0, 0.08, M.gold, 0, 0.8, 0.05);
      box(g, 1.15, 0.85, 0.02, mat('#ffffff', { map: TEX.painting, emissive: '#222244' }), 0, 0.88, 0.1);
    });
    const spot = new THREE.SpotLight('#cfe0ff', 0, 6, 0.6, 0.6);
    spot.position.set(5.5, 2.8, 4); spot.target.position.set(5.5, 1.2, 1.5);
    A.group.add(spot, spot.target);
    const hiddenRoom = A.def.rooms.find(r => r.secret);
    A.secret = { objs: [easel, hiddenRoom.floorMesh], spot };
    // 書斎
    F.rug(10, 3.2, 4, 3, TEX.carpet);
    F.desk(10.3, 2.4, 0, 1.8); F.chair(10.3, 1.6, 0, '#5a2a2a');
    F.shelf(12.7, 3, 3, 2.4); F.armchair(8.4, 5, 0); F.globe(12.4, 5.3); F.plant(8, 0.5);
    // 隠し本棚：西の壁沿い。左端を軸に扉のように開く
    const hinge = new THREE.Group(); hinge.position.set(7.6, 0, 1.0); hinge.rotation.y = Math.PI / 2; A.group.add(hinge);
    const sg = new THREE.Group(); sg.position.set(-1.1, 0, -0.25); hinge.add(sg);
    const red = bookshelf(sg, 2.2, 2.6, true);
    const shelfBox = solid(7.1, 7.6, 1.0, 3.2, 'furniture');
    A.shelf = { hinge, red, box: shelfBox };
    // 浴室
    F.tub(25, 0.6, 0); F.sink(22, 0.4, 0); F.cabinet(27.6, 3, 3, 1.2, 1.1, '#f4f1ea');
    // 廊下
    plane(A.group, 27.6, 1.1, mat('#8a1f2a'), 14, 0.013, 7);
    F.pedestalVase(6.6, 6.3); F.pedestalVase(20.6, 6.3, '#8a2a4a');
    // 主寝室
    F.bed(4.5, 10.8, 2, '#8a2a4a', 2.2, 2.2); F.dresser(8.3, 9.3, 3); F.wardrobe(0.4, 9.6, 1, 1.6); F.plant(0.5, 11.5);
    // 客間
    F.bed(11, 11.0, 2, '#3a5a7a', 1.3, 1.9); F.cabinet(12.6, 8.6, 3, 0.8, 0.8);
    // バルコニー
    F.bench(17, 11.3, 2); F.plant(13.5, 11.5); F.plant(20.5, 11.5);
    // お嬢様の部屋
    F.bed(26.4, 10.8, 2, '#f0a0b0', 1.4, 2.0); F.desk(22.5, 11.5, 2, 1.4); F.chair(22.5, 10.7, 0, '#f0a0b0');
    F.shelf(21.4, 10, 1, 1.4, 1.6); F.rug(24.5, 10, 2.5, 1.8, TEX.carpet);
    // 裏階段・リネン室・衣装部屋
    plane(A.group, 2, 2.8, mat('#2a1a14'), 33, 0.015, 1.4);
    solid(32, 34, 0, 2.8, 'furniture');
    F.linen(28.35, 4.5, 1, 2.2); F.linen(33.6, 4.5, 3, 1.6);
    F.rack(31, 7, 0, 2.4); F.rack(31, 11, 2, 2.4); F.dresser(33.6, 9, 3);
    void api;
  },
  setup(api) {
    exit('貨物EVで1Fへ', 1.9, 3.2, { area: 'f1', x: 1.9, z: 3.2 });
    exit('1Fへ降りる', 17, 6.6, { area: 'f1', x: 17, z: 4.3 });
    exit('裏階段で1Fへ', 31, 1.6, { area: 'f1', x: 31, z: 1.6 });
    thing('廊下の窓', 4.5, 6.6, () => { api.state.windowsIn = true; api.say('各部屋の北側の窓を、中から数えてみた。物置、書斎、吹き抜け、浴室、裏階段……全部で6つ。', ...api.windowCheck()); });
    thing('本棚', 7.95, 2.1, () => api.shelf(), { private: true });
    thing('机の引き出し', 10.3, 3.2, () => api.desk(), { private: true });
    thing('月下の庭', 5.5, 2.6, () => api.found(), { secretOnly: true, private: true });
    thing('鏡台', 7.6, 9.3, () => api.say('鏡台の引き出しに、若い男への高級時計の領収書が何枚も……。お母様の秘密だ。'), { private: true });
    thing('勉強机', 22.5, 10.6, () => api.say('教科書の間に「退学届（控）」——日付は半年前だ。'), { private: true });
    thing('ドレス', 31, 8, () => api.say('お母様のドレスがずらりと並んでいる。どれも一度しか袖を通していないようだ。'), { private: true });
    thing('バルコニー', 17, 10.4, () => api.say('前庭と噴水が一望できる。正門の向こうに街の灯りが見える。'));
    const d = npc('daughter', 24.5, 10.2, Math.PI);
    talker(d, ['「執事さん！ ねえ、課題手伝ってくれない？」', '「子どもの頃ね、パパの本棚の赤い本を触ったら、すごく怒られたの。なんでだろう？」']);
    const b = npc('blue', 26, 7, -Math.PI / 2, {
      path: [[26, 7, 2], [17, 7], [10, 7], [10, 4.3, 2.5], [10, 7], [2.5, 7, 2], [17, 7]], speed: 1.6,
    });
    talker(b, ['「あっ執事さん！ 見回り中です！ 書斎は旦那様のお部屋だから、勝手に入っちゃダメなんですよ〜」', '「廊下の花、私が生けたんです！ 上手でしょ？」']);
  },
};

export function buildArea(id, scene, api) {
  const def = AREAS[id];
  A = { id, def, name: def.name, group: new THREE.Group(), solids: [], walls: [], blocks: [], things: [], npcs: [], rooms: def.rooms, secret: null, shelf: null };
  scene.add(A.group);
  if (def.rooms.length) buildRooms(def);
  def.build(api);
  def.setup(api);
  const area = A;
  A = null;
  return area;
}
export const AREA_INFO = Object.fromEntries(Object.entries(AREAS).map(([k, v]) => [k, { name: v.name, bg: v.bg, light: v.light, outdoor: !!v.outdoor }]));
