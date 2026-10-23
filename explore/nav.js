// 人物の道順：エリアごとに歩ける場所の網目を作り、A* で道を探す
// 別のエリアへ行くときは出入口（扉・階段）を通る
// 網目は0.25m刻み。幅1mの扉も通れるよう、壁からの余白は0.28m
const CELL = 0.25, CLEAR = 0.28;

const blockedIn = (a, x, z, r) => a.solids.some(o => x + r > o.minX && x - r < o.maxX && z + r > o.minZ && z - r < o.maxZ);

// エリアの歩ける場所の網目
export function buildNav(a, W, H) {
  const nx = Math.ceil(W / CELL), nz = Math.ceil(H / CELL);
  const walk = new Uint8Array(nx * nz);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) walk[k * nx + i] = blockedIn(a, (i + 0.5) * CELL, (k + 0.5) * CELL, CLEAR) ? 0 : 1;
  a.nav = { nx, nz, walk };
}
const cellOf = (nav, x, z) => [Math.min(nav.nx - 1, Math.max(0, Math.floor(x / CELL))), Math.min(nav.nz - 1, Math.max(0, Math.floor(z / CELL)))];
const ok = (nav, i, k) => i >= 0 && k >= 0 && i < nav.nx && k < nav.nz && nav.walk[k * nav.nx + i];
function nearestWalkable(nav, i, k) {
  if (ok(nav, i, k)) return [i, k];
  for (let r = 1; r < 8; r++) for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++)
    if (Math.max(Math.abs(di), Math.abs(dk)) === r && ok(nav, i + di, k + dk)) return [i + di, k + dk];
  return null;
}
// 網目の上で、2点の間をまっすぐ歩けるか
function lineOk(nav, x1, z1, x2, z2) {
  const n = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / (CELL / 2));
  for (let j = 1; j <= n; j++) {
    const [i, k] = cellOf(nav, x1 + (x2 - x1) * j / n, z1 + (z2 - z1) * j / n);
    if (!ok(nav, i, k)) return false;
  }
  return true;
}

// A*。歩く点の列 [[x, z], ...] を返す（見つからなければ null）
export function findPath(a, x1, z1, x2, z2) {
  const nav = a.nav;
  const s0 = nearestWalkable(nav, ...cellOf(nav, x1, z1)), g0 = nearestWalkable(nav, ...cellOf(nav, x2, z2));
  if (!s0 || !g0) return null;
  const N = nav.nx * nav.nz, start = s0[1] * nav.nx + s0[0], goal = g0[1] * nav.nx + g0[0];
  const gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap = [];
  const push = (n, f) => { heap.push([f, n]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => {
    const top = heap[0], end = heap.pop();
    if (heap.length) { heap[0] = end; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } }
    return top[1];
  };
  const h = n => Math.hypot(n % nav.nx - g0[0], Math.floor(n / nav.nx) - g0[1]);
  gs[start] = 0; push(start, h(start));
  while (heap.length) {
    const n = pop();
    if (n === goal) break;
    if (closed[n]) continue;
    closed[n] = 1;
    const i = n % nav.nx, k = Math.floor(n / nav.nx);
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      if (!di && !dk) continue;
      if (!ok(nav, i + di, k + dk)) continue;
      if (di && dk && (!ok(nav, i + di, k) || !ok(nav, i, k + dk))) continue;   // 角を斜めにすり抜けない
      const m = (k + dk) * nav.nx + i + di, g = gs[n] + (di && dk ? 1.414 : 1);
      if (g < gs[m]) { gs[m] = g; from[m] = n; push(m, g + h(m)); }
    }
  }
  if (from[goal] < 0 && goal !== start) return null;
  const cells = [];
  for (let n = goal; n >= 0; n = from[n]) { cells.push([(n % nav.nx + 0.5) * CELL, (Math.floor(n / nav.nx) + 0.5) * CELL]); if (n === start) break; }
  cells.reverse();
  cells.push([x2, z2]);
  // まっすぐ歩ける区間は、途中の点を省く
  const out = [];
  let cx = x1, cz = z1;
  for (let j = 0; j < cells.length; j++) {
    const nxt = cells[j + 1];
    if (nxt && lineOk(nav, cx, cz, nxt[0], nxt[1])) continue;
    out.push(cells[j]); [cx, cz] = cells[j];
  }
  return out;
}

// エリアをまたぐ道順。区間の列 [{ area, pts, then: { area, x, z } }] を返す
// prefer(出入口) が大きいほど、その出入口を選びにくくする（使用人は勝手口と裏階段、家族は玄関と大階段を好む）
export function planRoute(areas, from, to, prefer = () => 0) {
  // エリアのつながり（幅優先で、通るエリアの順を決める）
  const prev = { [from.area]: null }, q = [from.area];
  while (q.length) {
    const id = q.shift();
    if (id === to.area) break;
    for (const t of areas[id].things) if (t.exit && !(t.exit.area in prev)) { prev[t.exit.area] = id; q.push(t.exit.area); }
  }
  if (!(to.area in prev)) return null;
  const chain = [];
  for (let id = to.area; id; id = prev[id]) chain.unshift(id);
  const legs = [];
  let x = from.x, z = from.z;
  for (let j = 0; j < chain.length; j++) {
    const a = areas[chain[j]];
    if (j === chain.length - 1) {
      const pts = findPath(a, x, z, to.x, to.z);
      if (!pts) return null;
      legs.push({ area: a.id, pts });
      break;
    }
    const exits = a.things.filter(t => t.exit && t.exit.area === chain[j + 1]);
    const best = exits.map(t => { const [ex, ez] = t.at(); return { t, cost: Math.hypot(ex - x, ez - z) + prefer(t) }; }).sort((p, q) => p.cost - q.cost)[0];
    if (!best) return null;
    const [ex, ez] = best.t.at();
    const pts = findPath(a, x, z, ex, ez);
    if (!pts) return null;
    legs.push({ area: a.id, pts, then: best.t.exit });
    ({ x, z } = best.t.exit);
  }
  return legs;
}
