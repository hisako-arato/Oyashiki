// 執事パートと決行の夜を3Dの屋敷で遊ぶ
// 本編（js/）の状態・予定・調査・会話をそのまま使い、移動と見た目だけを3Dにする
import { THREE, renderer, scene, camera, CAM_OFFSET, hemi, sun, makeChar, animate, resize, box, mat, M, TEX } from './engine.js';
import { buildArea, AREA_INFO, HOUSE, LOOKS, WORK } from './world.js';
import { buildNav, planRoute } from './nav.js';
import { PEOPLE, CHORES, END_HOUR, MAIDS } from '../js/data.js';
import { whereIs, isAlly, fatherHome, dateLabel, clamp, buildPlan, setFlag } from '../js/state.js';
import { SPOTS } from '../js/actions.js';
import * as DL from '../js/daylogic.js';

const SEC_PER_HOUR = 45;     // ゲーム内の1時間が現実の何秒か（昼）
const NIGHT_SEC_PER_HOUR = 75; // 決行の夜
const ACT_MIN = 20;          // 調べる・話すにかかる時間（分）
const WALK_SPEED = 5.2;      // 歩く速さ（m/秒）
const NPC_SPEED = 2.2;       // 人物が部屋を移るときの速さ
const LOW = 0.17, VIEW_RANGE = 5.5, VIEW_FOV = Math.PI * 0.42, CONE_RAYS = 24;
const OWNERS = { master: 'mother', droom: 'daughter' };
const AREA_SIZE = { grounds: [92, 58], cottage: [20, 15], f1: [48, 18], f2: [48, 18] };
const GATE = { area: 'grounds', x: 38, z: 56 };

let s = null, hooks = null, cur = null, running = false;
const areas = {};
const $ = id => document.getElementById(id);
const root = $('day3d');

// ---- 状態（その日だけ） ----
// mode：morning（朝礼前）／day（仕事中）／night（決行の夜）
const st = { busy: false, lastKey: null, shelfAnim: 0, mode: 'day', tut: null, night: null };
const player = { ...makeChar(scene, { outfit: '#22223a', hair: '#2a2a2a' }), x: 0, z: 0, r: 0.3 };
const lantern = new THREE.PointLight('#ffcf8a', 0, 9, 1.6);
lantern.position.set(0.3, 1.3, 0.2);
player.g.add(lantern);

// ---- メッセージ ----
const msgEl = $('msg3d');
let msgQueue = [], afterMsg = null, actLock = 0;
function say(...lines) { msgQueue = lines.filter(Boolean); nextMsg(); }
function nextMsg() {
  const l = msgQueue.shift();
  if (!l) {
    msgEl.classList.add('hidden'); st.busy = false;
    actLock = performance.now() + 500;
    if (afterMsg) { const f = afterMsg; afterMsg = null; f(); }
    return;
  }
  st.busy = true;
  msgEl.replaceChildren();
  if (Array.isArray(l)) { const b = document.createElement('b'); b.textContent = l[0]; msgEl.append(b, l[1]); }
  else msgEl.append(l);
  msgEl.classList.remove('hidden');
}
msgEl.addEventListener('click', nextMsg);
$('view').addEventListener('pointerdown', () => { if (!msgEl.classList.contains('hidden')) nextMsg(); });

// ---- エリア ----
const ROOM_OF = {};   // 本編の部屋名 → { area, rect }
const LIGHTS = [];    // 屋敷の照明（夜は落とす）
function getArea(id) {
  if (!areas[id]) {
    const a = buildArea(id, scene);
    a.group.visible = false;
    a.markers = [];
    areas[id] = a;
    for (const r of [...a.rooms, ...a.zones]) if (r.key) ROOM_OF[r.key] = { area: id, rect: r };
    a.group.traverse(o => { if (o.isPointLight) LIGHTS.push({ o, base: o.intensity }); });
    buildNav(a, ...AREA_SIZE[id]);
  }
  return areas[id];
}
const SKY = new THREE.Color('#9cbfd6'), NIGHT_SKY = new THREE.Color('#0b1020');
let zoomBase = 1;
function enter(id, x, z) {
  const a = getArea(id);
  if (cur) cur.group.visible = false;
  cur = a;
  a.group.visible = true;
  player.x = x; player.z = z;
  const info = AREA_INFO[id];
  // 屋内にいるときも、窓や低くした壁の向こうに庭が見えるよう、敷地を一緒に表示する
  const g = getArea('grounds');
  g.group.visible = true;
  if (info.outdoor) g.group.position.set(0, 0, 0);
  else g.group.position.set(-info.origin.x, -0.03 - info.below, -info.origin.z);
  for (const b of g.blocks) b.g.visible = info.outdoor || b.name !== info.hide;
  const night = st.mode === 'night';
  scene.background = night ? NIGHT_SKY : SKY;
  hemi.intensity = night ? (info.outdoor ? 0.35 : 0.25) : info.outdoor ? 1.4 : 1.0;
  sun.intensity = night ? 0.45 : info.outdoor ? 2.4 : 1.2;
  camTarget.set(x, 0, z);
  zoomBase = info.outdoor ? 0.6 : 1;
  camera.zoom = zoomBase;
  camera.updateProjectionMatrix();
  st.lastKey = undefined;
}
function setLights(night) {
  hemi.color.set(night ? '#6a7aa8' : '#fff1dc');
  sun.color.set(night ? '#9ab0ff' : '#ffe2b8');
  lantern.intensity = night ? 7 : 0;
  for (const l of LIGHTS) l.o.intensity = night ? l.base * 0.12 : l.base;
  root.classList.toggle('night', night);
}
const fadeEl = $('fade3d'), fadeText = $('fadeText');
function fade(text, mid, ms = 280) {
  st.busy = true;
  fadeText.textContent = text || '';
  fadeEl.classList.add('on');
  setTimeout(() => { mid(); fadeEl.classList.remove('on'); }, ms);
}
const travel = to => fade('', () => { enter(to.area, to.x, to.z); st.busy = false; });

function roomAt(x, z) {
  for (const r of cur.zones) if (x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d) return r;
  if (cur.id === 'grounds') return { name: z < HOUSE.z ? '裏庭' : z > HOUSE.z + 18 ? '前庭' : x > HOUSE.x + 48 ? '使用人棟の前' : '庭' };
  return cur.rooms.find(r => r.type !== 'void' && x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d) || null;
}

// ---- 当たり判定・視線 ----
const blockedIn = (a, x, z, r) => a.solids.some(o => x + r > o.minX && x - r < o.maxX && z + r > o.minZ && z - r < o.maxZ);
function moveBy(o, dx, dz, r) {
  if (!blockedIn(cur, o.x + dx, o.z, r)) o.x += dx;
  if (!blockedIn(cur, o.x, o.z + dz, r)) o.z += dz;
}
function rayDist(x, z, dx, dz, max) {
  let best = max;
  for (const o of cur.solids) {
    if (o.tag) continue;
    if (x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ) continue;
    let t0 = 0, t1 = max, hit = true;
    for (const [d, p, lo, hi] of [[dx, x, o.minX, o.maxX], [dz, z, o.minZ, o.maxZ]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) hit = false; continue; }
      let ta = (lo - p) / d, tb = (hi - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    if (hit && t0 <= t1 && t0 < best) best = t0;
  }
  return best;
}

// ---- 人物 ----
// 本編の予定表どおりの部屋へ、扉・廊下・階段を歩いて移る。着いたら部屋の中を歩き回る
const people = {};
const coneMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
function makePeople() {
  for (const id of Object.keys(LOOKS)) {
    const ch = makeChar(scene, LOOKS[id]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((CONE_RAYS + 2) * 3), 3));
    geo.setIndex(Array.from({ length: CONE_RAYS }, (_, i) => [0, i + 1, i + 2]).flat());
    const mat = coneMat('#ffe08a');
    const cone = new THREE.Mesh(geo, mat);
    cone.position.y = 0.03; cone.frustumCulled = false;
    scene.add(cone);
    people[id] = { id, name: LOOKS[id].name, ...ch, cone, coneGeo: geo, coneMat: mat, x: 0, z: 0, area: null, key: undefined, target: null, wait: 0, look: 0, seeing: false, range: VIEW_RANGE };
  }
}
function freePoint(a, r) {
  for (let i = 0; i < 40; i++) {
    const x = r.x + 0.8 + Math.random() * (r.w - 1.6), z = r.z + 0.8 + Math.random() * (r.d - 1.6);
    if (!blockedIn(a, x, z, 0.4)) return [x, z];
  }
  return [r.x + r.w / 2, r.z + r.d / 2];
}
function clearPath(a, x1, z1, x2, z2) {
  const n = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.3);
  for (let i = 1; i <= n; i++) if (blockedIn(a, x1 + (x2 - x1) * i / n, z1 + (z2 - z1) * i / n, 0.25)) return false;
  return true;
}
// 使用人は勝手口と裏階段、家族は玄関と大階段を通りたがる
const SERVANT_WAYS = /勝手口|裏階段/, FAMILY_WAYS = /玄関|2Fへ上がる|1Fへ降りる/;
const preferFor = p => t => MAIDS.includes(p.id) ? (FAMILY_WAYS.test(t.name) ? 25 : 0) : (SERVANT_WAYS.test(t.name) || /倉庫/.test(t.name) ? 25 : 0);
const FATHER_DESK = [14.5, 1.95];
// 行き先を決める。instant なら歩かずにその場へ置く
function goTo(p, key, instant) {
  const wasOut = p.key === 'out' || !p.area;
  p.key = key; p.route = null; p.still = false; p.leaving = false; p.target = null;
  const where = key && key !== 'out' ? ROOM_OF[key] : null;
  if (!where && key !== 'out') { p.area = null; return; }
  let dest;
  if (key === 'out') {
    if (!p.area || instant) { p.area = null; return; }
    dest = GATE; p.leaving = true;
  } else {
    p.rect = where.rect;
    const [x, z] = p.id === 'father' && key === 'study' ? FATHER_DESK : freePoint(areas[where.area], where.rect);
    dest = { area: where.area, x, z };
    if (instant) { p.area = dest.area; p.x = x; p.z = z; arrive(p); return; }
    if (wasOut) { p.area = GATE.area; p.x = GATE.x; p.z = GATE.z; }   // 外出から戻るときは正門から
  }
  const legs = planRoute(areas, { area: p.area, x: p.x, z: p.z }, dest, preferFor(p));
  if (!legs) { if (key === 'out') p.area = null; else { p.area = dest.area; p.x = dest.x; p.z = dest.z; arrive(p); } return; }
  p.route = legs; p.ri = 0; p.pt = 0;
}
function arrive(p) {
  p.route = null;
  if (p.leaving) { p.area = null; p.leaving = false; return; }
  p.wait = 1 + Math.random() * 2;
  if (p.id === 'father' && p.key === 'study') { p.still = true; p.g.rotation.y = 0; }
}
// 道順に沿って歩く（別のエリアにいる間も進む）
function walkLegs(p, dt) {
  const leg = p.route[p.ri], [tx, tz] = leg.pts[p.pt];
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), step = NPC_SPEED * dt;
  if (d > step) { p.x += dx / d * step; p.z += dz / d * step; p.g.rotation.y = Math.atan2(dx, dz); return true; }
  p.x = tx; p.z = tz; p.pt++;
  if (p.pt >= leg.pts.length) {
    if (leg.then) { p.area = leg.then.area; p.x = leg.then.x; p.z = leg.then.z; p.ri++; p.pt = 0; }
    else arrive(p);
  }
  return true;
}
// 部屋の中を歩き回る
function wander(p, dt) {
  const a = areas[p.area];
  if (p.wait > 0) {
    p.wait -= dt; p.look += dt;
    p.g.rotation.y = (p.baseYaw || 0) + Math.sin(p.look * 1.3) * 0.8;
    return false;
  }
  if (!p.target) {
    for (let i = 0; i < 8 && !p.target; i++) { const t = freePoint(a, p.rect); if (clearPath(a, p.x, p.z, t[0], t[1])) p.target = t; }
    if (!p.target) { p.wait = 2; return false; }
  }
  const dx = p.target[0] - p.x, dz = p.target[1] - p.z, d = Math.hypot(dx, dz);
  if (d < 0.05) { p.target = null; p.wait = 2 + Math.random() * 2.5; p.look = 0; p.baseYaw = p.g.rotation.y; return false; }
  const step = Math.min(d, 1.1 * dt);
  p.x += dx / d * step; p.z += dz / d * step; p.g.rotation.y = Math.atan2(dx, dz);
  return true;
}
// 視線と、視界の扇形
function sight(p) {
  const vx = player.x - p.x, vz = player.z - p.z, d = Math.hypot(vx, vz);
  let diff = Math.atan2(vx, vz) - p.g.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  p.seeing = d < p.range && d > 1e-6 && Math.abs(diff) < VIEW_FOV / 2 && rayDist(p.x, p.z, vx / d, vz / d, d) >= d;
  const pos = p.coneGeo.attributes.position, yaw = p.g.rotation.y;
  pos.setXYZ(0, p.x, 0, p.z);
  for (let i = 0; i <= CONE_RAYS; i++) {
    const ang = yaw - VIEW_FOV / 2 + VIEW_FOV * i / CONE_RAYS, cx = Math.sin(ang), cz = Math.cos(ang);
    const r = rayDist(p.x, p.z, cx, cz, p.range);
    pos.setXYZ(i + 1, p.x + cx * r, 0, p.z + cz * r);
  }
  pos.needsUpdate = true;
}
// 朝礼前の使用人棟：赤はお茶を淹れ、黒は先に席で待ち、青と白は身支度中。家族は母屋にいる
const MORNING = { red: 'c_kettle', blue: 'c_blue', black: 'servants', white: 'c_white' };
function wantedKey(p) {
  if (st.mode === 'morning') return MORNING[p.id] && whereIs(s, p.id, 9) ? MORNING[p.id] : null;
  return whereIs(s, p.id, s.today.hour);
}
function updatePerson(p, dt) {
  let moving = false;
  if (st.mode === 'night') moving = nightPerson(p, dt);
  else if (st.tut && p.id === 'red') moving = tutorGuide(p, dt);
  else {
    const key = wantedKey(p);
    if (key !== p.key) goTo(p, key, st.mode === 'morning' || st.placeNow);
    if (!st.busy && p.area) moving = p.route ? walkLegs(p, dt) : p.still ? false : wander(p, dt);
  }
  const here = p.area === cur.id;
  p.g.visible = here; p.cone.visible = here;
  if (!here) { p.seeing = false; return; }
  animate(p, moving && !st.busy, dt);
  p.g.position.set(p.x, 0, p.z);
  sight(p);
}
// 今こちらを見ている人（協力者は数えない）
// チュートリアルで付き添う赤メイドは、資料室の練習のとき以外は数えない
const guiding = p => st.tut && p.id === 'red' && st.tut.step !== 2;
const watchers = () => Object.values(people).filter(p => p.area === cur.id && p.seeing && !isAlly(s, p.id) && !guiding(p)).map(p => p.id);

// ---- 仕事の印 ----
const workMat = new THREE.MeshStandardMaterial({ color: '#7ad08a', emissive: '#4ab06a', emissiveIntensity: 0.6, transparent: true, opacity: 0.6 });
function refreshMarkers() {
  for (const a of Object.values(areas)) { for (const m of a.markers) a.group.remove(m); a.markers = []; }
  if (st.mode !== 'day') return;
  s.today.chores.forEach(c => {
    if (c.assignee !== 'butler' || c.done) return;
    const [area, x, z] = WORK[c.id];
    const a = areas[area], m = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.6, 20), workMat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z);
    a.group.add(m); a.markers.push(m);
  });
}
// 朝礼の席（朝礼前だけ）と、ベッドで休む（仕事中だけ）
const SEAT = [9.05, 7.5];
function cottageThings() {
  if (cur.id !== 'cottage' || st.mode === 'night') return [];
  if (st.mode === 'morning') return [{ name: '朝礼の席', at: () => SEAT, label: '朝礼', meeting: true }];
  return [{ name: 'ベッド', at: () => [2.4, 12.5], label: '休む', rest: true }];
}
function choreThings() {
  const list = [];
  if (st.mode !== 'day') return list;
  s.today.chores.forEach((c, i) => {
    if (c.assignee !== 'butler' || c.done) return;
    const [area, x, z] = WORK[c.id];
    if (area === cur.id) list.push({ name: CHORES[c.id].name, at: () => [x, z], label: '仕事', chore: i });
  });
  return list;
}
const choreHere = key => st.mode === 'day' && s.today.chores.some(c => c.assignee === 'butler' && !c.done && CHORES[c.id].room === key);

// ---- 隠し部屋 ----
function syncSecret() {
  const a = areas.f2, open = !!s.flags.hidden_open;
  for (const o of a.secret.objs) o.visible = open;
  a.secret.spot.intensity = open ? 30 : 0;
  a.shelf.hinge.rotation.y = open ? Math.PI : Math.PI / 2;
  Object.assign(a.shelf.box, open ? { minX: 10.6, maxX: 12.8, minZ: 1.8, maxZ: 2.3 } : { minX: 10.1, maxX: 10.6, minZ: 1.8, maxZ: 4.0 });
}
function openShelf() {
  st.shelfAnim = 0.0001;
  const a = areas.f2;
  for (const o of a.secret.objs) o.visible = true;
  Object.assign(a.shelf.box, { minX: 10.6, maxX: 12.8, minZ: 1.8, maxZ: 2.3 });
}

// ---- 調べる・話す・仕事・移動 ----
let target = null;
function findTarget() {
  let best = null, bd = 1.3;
  // bias を引いた距離で比べる（朝礼の席やベッドは、近くの人物より優先する）
  const consider = (t, bias = 0) => {
    if (t.secretOnly && !s.flags.hidden_open) return;
    const [x, z] = t.at(), d = Math.hypot(x - player.x, z - player.z) - bias;
    if (d < bd) { bd = d; best = t; }
  };
  for (const t of cur.things) consider(t);
  for (const t of choreThings()) consider(t);
  for (const t of cottageThings()) consider(t, 0.8);
  for (const t of nightThings()) consider(t, 0.8);   // 夜だけの操作を、同じ場所の昼の調べものや出入口より優先する
  if (st.mode !== 'night') for (const p of Object.values(people)) if (p.area === cur.id) consider({ name: p.name, at: () => [p.x, p.z], label: 'TALK', person: p });
  return best;
}
function act() {
  if (!msgEl.classList.contains('hidden')) return nextMsg();
  // 会話を閉じた直後の連打では、次の会話を始めない（押し続けている間は待ち時間を延ばす）
  if (performance.now() < actLock) { actLock = performance.now() + 500; return; }
  if (st.busy || !target) return;
  const t = target;
  if (t.night) return t.night();
  if (st.mode === 'night') return nightAct(t);
  if (t.meeting) return startMeeting();
  if (t.rest) { if (confirm('今日の業務を終えて休みますか？')) finish(); return; }
  if (t.exit) return travel(t.exit);
  if (t.person) return talkTo(t.person);
  if (t.chore !== undefined) return work(t.chore);
  if (t.say) return say(...t.say);
  if (t.special) return special(t.special);
  if (t.spot) return search(t.spot);
}
// 席に着くと、メイドたちも集まって朝礼が始まる
function startMeeting() {
  st.busy = true;
  player.x = SEAT[0]; player.z = SEAT[1]; player.g.rotation.y = Math.PI / 2;
  const seats = [[10, 6.55, 0], [12, 6.55, 0], [10, 8.45, Math.PI], [12, 8.45, Math.PI]];
  Object.values(people).filter(p => p.area === 'cottage').forEach((p, i) => {
    const [x, z, yaw] = seats[i % seats.length];
    p.x = x; p.z = z; p.g.rotation.y = yaw; p.still = true; p.route = null; p.g.position.set(x, 0, z);
  });
  const hint = st.tutPending ? '【旦那様の新しい決まり①】朝礼で、メイドと執事の担当を決める。執事が担当した仕事は、屋敷の緑の印の場所で行う。迷ったら「おまかせで割り振る」。' : null;
  hooks.openMeeting(() => {
    st.mode = 'day';
    s.today.hour = 9; s.today.min = 0;
    if (st.tutPending) ensureButlerChore();
    // メイドは席から持ち場へ歩いていく。家族は最初からそれぞれの場所にいる
    for (const p of Object.values(people)) if (!MAIDS.includes(p.id)) goTo(p, wantedKey(p), true); else p.still = false;
    refreshMarkers();
    if (st.tutPending) { st.tutPending = false; return tutorStart(); }
    const mine = s.today.chores.filter(c => c.assignee === 'butler').map(c => CHORES[c.id].name);
    say(['朝礼', `9時、仕事の始まりだ。執事の担当は${mine.length ? `「${mine.join('」「')}」` : 'なし'}。`],
      mine.length ? '緑の印が仕事の場所だ。空いた時間で、屋敷を探ろう。' : '今日は自由に動ける。屋敷を探ろう。');
  }, hint);
}

function talkTo(p) {
  p.g.rotation.y = Math.atan2(player.x - p.x, player.z - p.z);
  p.wait = Math.max(p.wait, 3); p.baseYaw = p.g.rotation.y; p.target = null;
  const res = DL.talk(s, p.id);
  if (!res.repeat) DL.spendMinutes(s, ACT_MIN);
  if (res.forgery) { st.busy = true; return hooks.askForgery(res.msg, m => say(m)); }
  say(res.msg);
}
function work(i) {
  const c = s.today.chores[i], { ok, why } = DL.choreAvailability(s, c);
  if (!ok) return say(`${CHORES[c.id].name}は今はできない（${why}）。`);
  fade(`${CHORES[c.id].name}をしています……`, () => {
    const msg = DL.doChore(s, i);
    refreshMarkers();
    say(msg);
    if (st.tut) tutorEvent('chore');
  }, 900);
}
function search([key, id], extraMsg) {
  const sp = (SPOTS[key] || []).find(o => o.id === id);
  if (!sp) return;
  const seen = watchers();
  DL.spendMinutes(s, ACT_MIN);
  const res = DL.investigate(s, sp, seen);
  if (res.clue) hooks.toast('手帳に記録した');
  if (res.code) { st.busy = true; return hooks.askCode(res.msg, m => { say(m); }); }
  say(extraMsg, res.msg);
  if (st.tut) tutorEvent('search', key, id);
}
function special(kind) {
  if (kind === 'notebook') return hooks.notebook();
  if (kind === 'garage') return say(fatherHome(s) ? 'お父様の車はガレージの奥に停めてある。今日は一日、書斎にいるらしい。' : 'シャッターが半分開いている。中は空っぽだ。お父様は車で会社に出かけている。');
  if (kind === 'shelf') {
    if (s.flags.hidden_open) return say('本棚の奥に、暗い小部屋が続いている。');
    if (s.flags.red_book && s.flags.key_hidden) {
      const why = DL.openHidden(s, watchers());
      if (why) return say(why);
      DL.spendMinutes(s, ACT_MIN);
      openShelf();
      return say('赤い本を引き、鍵を差し込む。本棚がゆっくりと手前に開き出した……！');
    }
    return search(['study', 'shelf']);
  }
}

// ============================================================
// 初日のチュートリアル：旦那様の「新しい決まり」の確認に、赤メイドが付き添う
// （執事は何か月も働いているので、屋敷の案内ではなく、11月から変わった決まりの確認という形にする）
// ============================================================
const TUT = [
  { goal: '担当の仕事を、緑の印の場所で済ませる', say: [['赤メイド', '「……新しい決まりの1つめ。執事さんの担当は、緑の印の場所でやる。わたしが付いていく」']] },
  { goal: '倉庫で、古い運送伝票を確認する（調べる）', at: ['f1', 4.7, 2.0],
    say: [['赤メイド', '「……決まりの2つめ。倉庫の古い記録を整理し直す。伝票を調べて、手帳に控えておいて」']] },
  { goal: '試しに、資料室に入ってみる', at: ['f1', 12, 4], red: ['f1', 19.2, 4, -Math.PI / 2],
    say: [['執事', '（何か月も働いた屋敷だ。だが、盗む者の目で見直すと、まるで違って見える）'],
      ['赤メイド', '「……決まりの3つめ。書斎や資料室、奥様やお嬢様のお部屋に、用もなく入っているのを見られたら、旦那様に報告しなきゃいけない」'],
      ['赤メイド', '「……試しに、資料室に入ってみて。わたしはここから見てる」']] },
];
function tutorStart() {
  st.tut = { step: 0, lastPlan: 0 };
  say(['赤メイド', '「……今日から旦那様の新しい決まり。12月のお客様に備えて、だって。全部いっしょに確認する」'], ...TUT[0].say);
}
function tutorNext() {
  st.tut.step++;
  const step = TUT[st.tut.step];
  if (step) return say(...step.say);
  setFlag(s, 'tutorial_done');
  st.tut = null;
  people.red.key = undefined;   // 自分の持ち場へ戻る
  say(['赤メイド', '「……決まりは以上。あとは、いつもどおり。わたしは持ち場に戻る」'],
    ['赤メイド', '「……夕方になったら、使用人棟のベッドで休んで。お疲れさま」'],
    '（手帳で、手がかりや好感度をいつでも確認できる）');
}
function tutorEvent(kind, key, id) {
  if (!st.tut) return;
  const step = st.tut.step;
  if (step === 0 && kind === 'chore') afterMsg = tutorNext;
  if (step === 1 && kind === 'search' && key === 'storage') afterMsg = tutorNext;
}
// 赤メイドは執事についてくる。3つめの決まりの間は、資料室の入口で見張る
function tutorGuide(p, dt) {
  const step = TUT[st.tut.step];
  if (step && step.red) {
    const [area, x, z, yaw] = step.red;
    if (p.area !== area || Math.hypot(p.x - x, p.z - z) > 0.2) {
      if (!p.route || p.guideTo !== 'post') { p.route = planRoute(areas, { area: p.area || cur.id, x: p.x, z: p.z }, { area, x, z }) || null; p.ri = 0; p.pt = 0; p.guideTo = 'post'; if (!p.area) p.area = area; }
      if (p.route) return walkLegs(p, dt);
      p.area = area; p.x = x; p.z = z;
    }
    p.route = null; p.g.rotation.y = yaw;
    return false;
  }
  // ついてくる：別のエリアに移ったら、少し後ろに現れる
  if (p.area !== cur.id) { p.area = cur.id; p.x = player.x - 0.8; p.z = player.z - 0.8; p.route = null; if (blockedIn(cur, p.x, p.z, 0.3)) { p.x = player.x; p.z = player.z; } }
  const d = Math.hypot(player.x - p.x, player.z - p.z);
  if (d < 1.8) { p.route = null; p.g.rotation.y = Math.atan2(player.x - p.x, player.z - p.z); return false; }
  const now = performance.now();
  if (!p.route || now - st.tut.lastPlan > 800) {
    st.tut.lastPlan = now; p.guideTo = 'player';
    p.route = planRoute(areas, { area: p.area, x: p.x, z: p.z }, { area: cur.id, x: player.x, z: player.z }); p.ri = 0; p.pt = 0;
  }
  if (!p.route) return false;
  return walkLegs(p, dt * 1.4);
}
// 3つめの決まり：資料室に入ったところを赤メイドに見られたら、練習として説明する
function tutorCheck(key) {
  if (!st.tut || st.tut.step !== 2 || st.busy) return;
  if (key === 'archive' && people.red.seeing) {
    const before = st.tut.susp ?? s.susp;
    afterMsg = () => { s.susp = before; tutorNext(); };
    say(['赤メイド', '「……今のです。わたしの視界が赤くなったでしょう。わたし以外の人だったら、旦那様に報告されて、執事さんへの疑いが強まる」'],
      ['赤メイド', '「……用があるとき（その部屋が担当の仕事のとき）は大丈夫。今のは練習だから、黙っておく」'],
      '（左上の「疑惑」が100になると、正体が露見してしまう。私室を調べるときは、人の視界に入らないように）');
  } else if (key !== 'archive') st.tut.susp = s.susp;
}
function ensureButlerChore() {
  const mine = s.today.chores.filter(c => c.assignee === 'butler' && !CHORES[c.id].optional);
  if (mine.length) return;
  const c = s.today.chores.filter(c => c.id !== 'cook' && !CHORES[c.id].butlerOnly && WORK[c.id][0] !== 'grounds').sort((a, b) => CHORES[a.id].hours - CHORES[b.id].hours)[0];
  if (!c) return;
  c.assignee = 'butler';
  buildPlan(s);
}

// ============================================================
// 決行の夜（12月26日、深夜1時〜夜明け5時）
// ============================================================
function makeLadder(parent) {
  const g = new THREE.Group();
  for (const sx of [-0.25, 0.25]) box(g, 0.06, 4.6, 0.06, M.lightWood, sx, 0, 0);
  for (let i = 0; i < 14; i++) box(g, 0.5, 0.04, 0.04, M.lightWood, 0, 0.25 + i * 0.32, 0);
  parent.add(g);
  return g;
}
const carried = { ladder: null, painting: null };
let wallLadder = null;
function setupNightProps() {
  if (!carried.ladder) {
    carried.ladder = makeLadder(player.g);
    carried.ladder.rotation.set(0, 0, Math.PI / 2); carried.ladder.position.set(1.6, 1.1, -0.25); carried.ladder.scale.set(1, 0.7, 1);
    carried.painting = new THREE.Group(); player.g.add(carried.painting);
    box(carried.painting, 1.0, 0.75, 0.06, mat('#ffffff', { map: TEX.painting }), 0, 0.7, 0.32);
    wallLadder = makeLadder(areas.grounds.group);
    wallLadder.position.set(HOUSE.x + 24, 0, HOUSE.z + 18.45); wallLadder.rotation.x = -0.18;
  }
  carried.ladder.visible = false; carried.painting.visible = false; wallLadder.visible = false;
}
function nightPerson(p, dt) {
  const n = p.nightRole;
  if (!n) { p.area = null; return false; }
  if (n.path) {
    if (p.wait > 0) { p.wait -= dt; p.look += dt; p.g.rotation.y = p.baseYaw + Math.sin(p.look * 1.4) * 0.9; return false; }
    const [tx, tz, w] = n.path[n.i];
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { n.i = (n.i + 1) % n.path.length; if (w) { p.wait = w; p.look = 0; p.baseYaw = p.g.rotation.y; } return false; }
    const step = Math.min(d, 1.4 * dt);
    p.x += dx / d * step; p.z += dz / d * step; p.g.rotation.y = Math.atan2(dx, dz);
    return true;
  }
  p.look += dt; p.g.rotation.y = n.yaw + Math.sin(p.look * 0.7) * 0.5;
  return false;
}
function nightThings() {
  const N = st.night;
  if (!N) return [];
  const list = [], at = (x, z) => () => [x, z];
  if (cur.id === 'f1' && !N.ladderTaken) list.push({ name: '庭師の梯子', at: at(1.3, 5), label: '梯子を持つ', night: () => {
    if (N.carry) return say('両手がふさがっている。');
    N.ladderTaken = true; N.carry = 'ladder';
    say('長い梯子を担いだ。重い……。前庭へ回って、2階のバルコニーに掛けよう。');
  } });
  const below = [HOUSE.x + 24, HOUSE.z + 18.9];
  if (cur.id === 'grounds' && N.carry === 'ladder') list.push({ name: 'バルコニーの下', at: at(...below), label: '梯子を掛ける', night: () => {
    N.carry = null; N.ladderUp = true;
    say('バルコニーの手すりに、そっと梯子を掛けた。');
  } });
  if (cur.id === 'grounds' && N.ladderUp && !N.carry) list.push({ name: '梯子', at: at(...below), label: '梯子を登る', night: () => {
    if (!s.flags.balcony_open) return say('登ってみたが、バルコニーのガラス戸には鍵が掛かっていた。こじ開ければ音が出る……別の道を探すしかない。');
    travel({ area: 'f2', x: 24, z: 16.4 });
  } });
  if (cur.id === 'grounds' && N.ladderUp && N.carry === 'painting') list.push({ name: '梯子', at: at(...below), label: '梯子を登る', night: () => say('絵を抱えたままでは登れない。') });
  if (cur.id === 'f2' && N.ladderUp) list.push({ name: '梯子', at: at(24, 17.4), label: '梯子で降りる', night: () => travel({ area: 'grounds', x: below[0], z: below[1] + 0.6 }) });
  if (cur.id === 'f2' && s.flags.hidden_open && !N.taken) list.push({ name: '月下の庭', at: at(8, 3.2), label: '絵を外す', night: takePainting });
  if (cur.id === 'f2' && N.route === 'swap' && N.carry === 'painting') list.push({ name: 'クローゼット', at: at(41.3, 14), label: '本物を隠す', night: () => {
    N.carry = null;
    afterMsg = () => endNight('swap');
    say('お嬢様の寝息を確かめ、クローゼットの奥に本物をそっと隠した。……あとは、何食わぬ顔で朝を迎えるだけだ。');
  } });
  if (cur.id === 'grounds' && N.route === 'night' && N.carry === 'painting') list.push({ name: '正門', at: at(38, 56.6), label: '屋敷を去る', night: () => {
    afterMsg = () => endNight('night');
    say('門の鍵を外し、夜の街へ出た。腕の中の額縁が、月明かりを受けて鈍く光った。');
  } });
  return list;
}
function takePainting() {
  const N = st.night;
  if (N.carry) return say('両手がふさがっている。梯子はどこかに置いてこよう。');
  if (!N.alarmOff) { afterMsg = () => endNight('caught'); return say('額縁に手をかけた瞬間、甲高い警報が屋敷中に鳴り響いた！'); }
  N.taken = true; N.carry = 'painting';
  areas.f2.secret.objs[0].visible = false;
  if (N.route === 'swap') return say('青の模写を額に収め、本物を布で包む。見た目には、何ひとつ変わらない。', '本物をお嬢様の部屋のクローゼットに隠そう。');
  say('「月下の庭」を額ごと外し、布で包んだ。……あとは、誰にも見つからずに正門から出るだけだ。');
}
function nightAct(t) {
  const N = st.night;
  if (t.exit) {
    if (/玄関/.test(t.name)) return say('玄関は内側から閂が掛けられている。');
    if (N.carry === 'ladder' && t.exit.area !== 'grounds' && cur.id === 'grounds') return say('梯子を担いだままでは、屋敷の中を通れない。');
    return travel(t.exit);
  }
  if (t.spot && t.spot[0] === 'kback') {
    if (N.alarmOff) return say('警報の系統のランプが消えている。白は約束を守ってくれた。');
    if (!confirm('配電盤を自分で操作しますか？')) return;
    afterMsg = () => endNight('caught');
    return say('どれが警報の系統か分からないまま切ったブレーカーは、屋敷全体の電源だった。真っ暗な屋敷に、家族の悲鳴が響く。');
  }
  if (t.special === 'shelf') {
    if (s.flags.hidden_open) return say('本棚の奥に、隠し部屋が口を開けている。');
    s.flags.hidden_open = true; openShelf();
    return say('赤い本を引き、鍵を差し込む。本棚が音もなく開いた。');
  }
  if (t.special === 'notebook') return hooks.notebook();
  if (t.say) return say(...t.say);
  say('今は調べている場合ではない。');
}
function nightGoal() {
  const N = st.night;
  if (N.carry === 'painting') return N.route === 'swap' ? '本物を、お嬢様の部屋のクローゼットに隠す' : '絵を抱えて、正門から屋敷を出る';
  if (N.carry === 'ladder') return '前庭に回り、バルコニーの下に梯子を掛ける';
  if (cur.id === 'f2') return '書斎の隠し部屋へ。絵に触れる前に、警報が切れているか確かめたか？';
  return '2階の書斎へ。大広間は黒メイドが、キッチン裏は赤メイドが見張っている';
}
function endNight(id) {
  running = false;
  root.classList.add('hidden');
  setLights(false);
  hooks.ending(id);
}
let seenTime = 0;
function nightTick(dt) {
  const N = st.night;
  if (!st.busy) {
    N.min += dt * 60 / NIGHT_SEC_PER_HOUR;
    if (N.min >= 240 && !N.dawn) {
      N.dawn = true;
      afterMsg = () => endNight('caught');
      say('東の空が白み始めた。屋敷の明かりが一つ、また一つと灯っていく……。');
    }
  }
  const seers = Object.values(people).filter(p => p.area === cur.id && p.seeing && !isAlly(s, p.id));
  seenTime = seers.length ? seenTime + dt : 0;
  if (seenTime > 0.3 && !st.busy && !N.caught) {
    N.caught = true;
    const p = seers[0];
    afterMsg = () => endNight('caught');
    say([p.name, p.id === 'black' ? '「……執事さん？ こんな時間に、何をしているんですか」' : '「……誰？ ……執事さん？」'], '懐中電灯の光が、執事の顔を照らした。');
  }
}

// ---- 入力 ----
const keys = new Set();
addEventListener('keydown', e => {
  if (!running) return;
  keys.add(e.key.toLowerCase());
  if ((e.key === ' ' || e.key.toLowerCase() === 'e' || e.key === 'Enter') && !e.repeat && !document.querySelector('.modal-back')) { e.preventDefault(); act(); }
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
const stick = { x: 0, y: 0, id: null };
const stickEl = $('stick'), knob = stickEl.querySelector('i');
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
$('act').addEventListener('click', act);
$('nb3d').addEventListener('click', () => { if (!st.busy) hooks.notebook(); });
$('end3d').addEventListener('click', () => { if (!st.busy && st.mode === 'day' && confirm('今日の業務を終えますか？')) finish(); });

// ---- 手前の壁・建物を低くする ----
const tmpV = new THREE.Vector3();
function updateCutaway(dt) {
  const k = Math.min(1, dt * 8);
  for (const w of cur.walls) {
    const low = w.ori === 'h' ? w.c > player.z + 0.2 : w.c > player.x + 0.2;
    w.scale += ((low ? LOW : 1) - w.scale) * k;
    w.g.scale.y = w.scale;
    for (const d of w.decor) d.visible = w.scale > 0.6;
  }
  for (const b of cur.blocks) {
    let minX = 1, maxX = -1, minY = 1, maxY = -1;
    for (const x of [b.x1, b.x2]) for (const z of [b.z1, b.z2]) for (const y of [0, b.h + 2]) {
      tmpV.set(x, y, z).project(camera);
      minX = Math.min(minX, tmpV.x); maxX = Math.max(maxX, tmpV.x); minY = Math.min(minY, tmpV.y); maxY = Math.max(maxY, tmpV.y);
    }
    tmpV.set(player.x, 1, player.z).project(camera);
    const overlap = tmpV.x > minX && tmpV.x < maxX && tmpV.y > minY && tmpV.y < maxY;
    const behind = player.x + player.z < (b.x1 + b.x2) / 2 + (b.z1 + b.z2) / 2;
    b.scale += ((overlap && behind ? 0.12 : 1) - b.scale) * k;
    b.g.scale.y = b.scale;
    for (const d of b.decor) d.visible = b.scale > 0.6;
  }
}

// ---- 影のちらつき対策：影の計算位置を影の1画素単位にそろえる ----
const LIGHT_OFF = new THREE.Vector3(-8, 16, 10);
const LF = LIGHT_OFF.clone().negate().normalize();
const LR = new THREE.Vector3().crossVectors(LF, new THREE.Vector3(0, 1, 0)).normalize();
const LU = new THREE.Vector3().crossVectors(LR, LF).normalize();
const TEXEL = (sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.x;
function snapShadow(t, out) {
  const r = Math.round(t.dot(LR) / TEXEL) * TEXEL, u = Math.round(t.dot(LU) / TEXEL) * TEXEL;
  out.set(0, 0, 0).addScaledVector(LR, r).addScaledVector(LU, u).addScaledVector(LF, t.dot(LF));
}

// ---- 表示 ----
const labelPool = [];
function drawLabels(list) {
  const holder = $('labels');
  while (labelPool.length < list.length) { const d = document.createElement('div'); holder.append(d); labelPool.push(d); }
  labelPool.forEach((d, i) => {
    const l = list[i];
    if (!l) { d.style.display = 'none'; return; }
    const v = tmpV.set(l.x, l.y, l.z).project(camera);
    d.style.display = '';
    d.className = 'label ' + (l.cls || '');
    d.textContent = l.text;
    d.style.left = `${(v.x + 1) / 2 * innerWidth}px`;
    d.style.top = `${(1 - v.y) / 2 * innerHeight}px`;
  });
}
const mmCanvas = $('minimap'), mm = mmCanvas.getContext('2d');
function drawMinimap(here) {
  const W = mmCanvas.width, H = mmCanvas.height;
  const [ex, ez] = AREA_SIZE[cur.id];
  const S = Math.min((W - 10) / ex, (H - 10) / ez), ox = (W - ex * S) / 2, oz = (H - ez * S) / 2;
  const px = x => ox + x * S, pz = z => oz + z * S;
  mm.clearRect(0, 0, W, H);
  if (cur.id === 'grounds') {
    mm.fillStyle = '#4f6a3a'; mm.fillRect(px(0), pz(0), ex * S, ez * S);
    mm.fillStyle = '#8a7a66';
    for (const b of cur.blocks) mm.fillRect(px(b.x1), pz(b.z1), (b.x2 - b.x1) * S, (b.z2 - b.z1) * S);
  } else {
    for (const r of cur.rooms) {
      if (r.secret && !s.flags.hidden_open) continue;
      mm.fillStyle = r.type === 'void' ? '#221a24' : r === here ? '#a07a4a' : '#5a4636';
      mm.fillRect(px(r.x) + 0.5, pz(r.z) + 0.5, r.w * S - 1, r.d * S - 1);
    }
  }
  for (const t of [...choreThings(), ...tutorTargets()]) { const [x, z] = t.at(); mm.fillStyle = t.tut ? '#e3c06f' : '#7ad08a'; mm.fillRect(px(x) - 4, pz(z) - 4, 8, 8); }
  for (const p of Object.values(people)) {
    if (p.area !== cur.id) continue;
    mm.fillStyle = PEOPLE[p.id].color; mm.beginPath(); mm.arc(px(p.x), pz(p.z), 4, 0, 7); mm.fill();
  }
  mm.fillStyle = '#e3c06f'; mm.beginPath(); mm.arc(px(player.x), pz(player.z), 5, 0, 7); mm.fill();
}
// チュートリアルの「ここ」の印
function tutorTargets() {
  if (!st.tut) return [];
  const step = TUT[st.tut.step];
  return step && step.at && step.at[0] === cur.id ? [{ at: () => [step.at[1], step.at[2]], tut: true }] : [];
}
function drawHud(room) {
  const t = s.today;
  let clock, text;
  if (st.mode === 'night') {
    const m = Math.floor(st.night.min), h = 1 + Math.floor(m / 60);
    clock = `12月26日　深夜 ${h}:${String(m % 60).padStart(2, '0')}`;
    text = '目的：' + nightGoal();
  } else {
    clock = `${dateLabel(s)}　${st.mode === 'morning' ? '7:30' : `${t.hour}:${String(Math.floor(t.min || 0)).padStart(2, '0')}`}`;
    const todo = t.chores.filter(c => c.assignee === 'butler').map(c => `${c.done ? '✓' : '・'}${CHORES[c.id].name}${CHORES[c.id].optional ? '（任意）' : ''}`);
    text = st.mode === 'morning' ? '共用室の席に着いて、朝礼を始めよう'
      : st.tut && TUT[st.tut.step] ? `【新しい決まり ${st.tut.step + 1}/3】${TUT[st.tut.step].goal}`
      : todo.length ? todo.join('　') : '執事の担当なし';
  }
  $('clock3d').textContent = clock;
  $('place3d').textContent = `${AREA_INFO[cur.id].name}　${room ? room.name : ''}`;
  $('trust3d').style.width = `${s.trust}%`;
  $('susp3d').style.width = `${s.susp}%`;
  $('end3d').classList.toggle('hidden', st.mode !== 'day');
  if ($('todo3d').textContent !== text) $('todo3d').textContent = text;
}

// ---- 1日の流れ ----
function finish() {
  running = false;
  root.classList.add('hidden');
  hooks.endDay();
}
function fatal() {
  if (s.susp < 100 && s.trust > 0) return false;
  running = false;
  root.classList.add('hidden');
  hooks.fatal();
  return true;
}

const actBtn = $('act');
const camTarget = new THREE.Vector3();
const FWD = new THREE.Vector2(-1, -1).normalize(), RIGHT = new THREE.Vector2(1, -1).normalize();
let last = 0, ending = false;

function tick(now) {
  if (!running) return;
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  const night = st.mode === 'night';

  // 時間が進む（メッセージや操作待ちの間は止まる）
  if (st.mode === 'day' && !st.busy && !document.querySelector('.modal-back')) {
    s.today.min = (s.today.min || 0) + dt * 60 / SEC_PER_HOUR;
    if (s.today.min >= 60) { s.today.min -= 60; s.today.hour++; }
  }
  if (st.mode === 'day' && s.today.hour >= END_HOUR && !ending) {
    ending = true;
    s.today.hour = END_HOUR; s.today.min = 0;
    afterMsg = finish;
    say('18時になった。今日の業務はここまでだ。');
  }

  let ix = 0, iy = 0;
  if (!st.busy && !document.querySelector('.modal-back')) {
    if (keys.has('arrowup') || keys.has('w')) iy += 1;
    if (keys.has('arrowdown') || keys.has('s')) iy -= 1;
    if (keys.has('arrowright') || keys.has('d')) ix += 1;
    if (keys.has('arrowleft') || keys.has('a')) ix -= 1;
    ix += stick.x; iy -= stick.y;
  }
  const il = Math.hypot(ix, iy), moving = il > 0.15 && !st.lying;
  if (moving) {
    const speed = night && st.night.carry === 'ladder' ? 3.0 : night && st.night.carry === 'painting' ? 4.0 : WALK_SPEED;
    const sp = speed * Math.min(1, il) / il;
    const dx = (FWD.x * iy + RIGHT.x * ix) * sp * dt, dz = (FWD.y * iy + RIGHT.y * ix) * sp * dt;
    moveBy(player, dx, dz, player.r);
    player.g.rotation.y = Math.atan2(dx, dz);
  }
  if (st.lying) { player.g.position.set(player.x, 0.62, player.z); player.g.rotation.set(-Math.PI / 2, 0, 0); }
  else { player.g.position.set(player.x, 0, player.z); animate(player, moving, dt); }
  if (night) {
    carried.ladder.visible = st.night.carry === 'ladder';
    carried.painting.visible = st.night.carry === 'painting';
    wallLadder.visible = !!st.night.ladderUp;
  }

  // 今いる部屋
  const room = roomAt(player.x, player.z);
  const key = room && room.key || null;
  if (!night) {
    s.today.loc = key || 'elsewhere';
    if (key !== st.lastKey) {
      const owner = OWNERS[key];
      if (st.lastKey !== undefined && owner && whereIs(s, owner, s.today.hour) === key && !choreHere(key) && !st.busy && !st.tut) say(DL.intrude(s, owner));
      st.lastKey = key;
    }
  }

  for (const p of Object.values(people)) updatePerson(p, dt);
  st.placeNow = false;
  const inPrivate = !night && !!(room && room.private) && !choreHere(key);
  for (const p of Object.values(people)) p.coneMat.color.set(isAlly(s, p.id) ? '#8ad0a0' : (night || inPrivate) && p.seeing ? '#ff5a4a' : night ? '#fff2b0' : '#ffe08a');
  if (night) nightTick(dt);
  else {
    if (!st.busy && watchers().length && inPrivate) s.susp = clamp(s.susp + 8 * dt);
    tutorCheck(key);
    if (fatal()) return;
  }

  if (st.shelfAnim > 0 && st.shelfAnim < 1) {
    st.shelfAnim = Math.min(1, st.shelfAnim + dt * 0.6);
    areas.f2.shelf.hinge.rotation.y = Math.PI / 2 + Math.PI / 2 * (1 - (1 - st.shelfAnim) ** 2);
    areas.f2.secret.spot.intensity = 30 * st.shelfAnim;
  }
  if (cur.shelf) cur.shelf.red.material.emissiveIntensity = s.flags.hidden_room && !s.flags.hidden_open ? 0.6 + Math.sin(now / 300) * 0.4 : 0;

  updateCutaway(dt);
  camTarget.lerp(tmpV.set(player.x, 0, player.z), Math.min(1, dt * 5));
  camera.position.copy(camTarget).add(CAM_OFFSET);
  camera.lookAt(camTarget);
  snapShadow(camTarget, sun.target.position);
  sun.position.copy(sun.target.position).add(LIGHT_OFF);
  sun.target.updateMatrixWorld();
  const zoomTo = room && room.name === 'バルコニー' ? 0.7 : zoomBase;
  if (Math.abs(camera.zoom - zoomTo) > 0.001) { camera.zoom += (zoomTo - camera.zoom) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }

  // メッセージ表示中もボタンを「次へ」として残し、同じ場所を連打して読み進められるようにする
  const talking = !msgEl.classList.contains('hidden');
  target = st.busy ? null : findTarget();
  actBtn.classList.toggle('hidden', !target && !talking);
  const verb = t => t.night ? t.label : t.exit ? '移動' : t.person ? '話す' : t.chore !== undefined ? '仕事' : t.meeting ? '朝礼' : t.rest ? '休む' : '調べる';
  actBtn.textContent = talking ? '次へ' : target ? verb(target) : '';
  const labels = [];
  for (const p of Object.values(people)) {
    if (p.area !== cur.id) continue;
    const alert = p.seeing && (inPrivate || night) && !isAlly(s, p.id);
    labels.push({ x: p.x, y: 2.1, z: p.z, text: alert ? '！' : p.name, cls: alert ? 'alert' : 'name' });
  }
  for (const t of choreThings()) { const [x, z] = t.at(); labels.push({ x, y: 0.6, z, text: `仕事：${t.name}`, cls: 'work' }); }
  for (const t of tutorTargets()) { const [x, z] = t.at(); labels.push({ x, y: 0.6, z, text: 'ここ', cls: 'work' }); }
  if (target) {
    const [x, z] = target.at();
    labels.push({ x, z, y: target.person ? 2.5 : 1.6, text: target.person ? 'TALK' : target.night || target.exit || target.meeting || target.rest ? target.label : verb(target), cls: target.exit ? 'exit' : '' });
  }
  drawLabels(labels);
  drawMinimap(room);
  drawHud(room);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

function prepare(state, h) {
  s = state; hooks = h;
  root.classList.remove('hidden');
  resize();
  if (!areas.grounds) {
    for (const id of ['grounds', 'cottage', 'f1', 'f2']) getArea(id);
    makePeople();
  }
  for (const p of Object.values(people)) { p.key = undefined; p.route = null; p.nightRole = null; p.range = VIEW_RANGE; }
  syncSecret();
  ending = false; st.busy = false; st.shelfAnim = 0; st.tut = null; st.tutPending = false; st.night = null; msgQueue = []; afterMsg = null;
}
function run() {
  running = true;
  last = performance.now();
  requestAnimationFrame(tick);
}

// 本編から呼ばれる：朝、執事の部屋のベッドで目を覚ますところから1日を始める
export function startMorning(state, h) {
  prepare(state, h);
  st.mode = 'morning';
  setLights(false);
  refreshMarkers();
  s.today.min = s.today.min || 0;
  enter('cottage', 1.2, 13.3);
  st.lying = true;
  afterMsg = () => { st.lying = false; player.g.rotation.set(0, Math.PI / 2, 0); player.x = 2.4; player.z = 12.5; };
  // 初日だけ、赤メイドが「新しい決まり」の確認に来る
  const firstDay = s.chapter === 0 && s.week === 0 && s.day === 0 && !s.flags.tutorial_done;
  st.tutPending = firstDay;
  if (firstDay) {
    say(['執事', `（${dateLabel(s)}、朝7時30分。……さて、今日も完璧な執事を演じるとしよう）`],
      ['赤メイド', '「……執事さん、起きてる？ 今日から、旦那様の新しい決まりが始まる日。朝礼で説明する」'],
      ['執事', '（12月の来客に備えて、旦那様が屋敷の決まりを改めると言っていたな。……ちょうどいい。屋敷を見直す口実になる）'],
      '身支度を整えたら、共用室の席に着いて朝礼を始めよう。');
  } else {
    say(['執事', `（${dateLabel(s)}、朝7時30分。……さて、今日も完璧な執事を演じるとしよう）`],
      '身支度を整えたら、共用室の席に着いて朝礼を始めよう。');
  }
  run();
}

// 本編から呼ばれる：決行の夜。route は 'night'（一夜で持ち去る）か 'swap'（贋作とすり替える）
export function startNight(state, route, h) {
  prepare(state, h);
  st.mode = 'night';
  st.night = { route, min: 0, carry: null, ladderTaken: false, ladderUp: false, taken: false, alarmOff: !!s.flags.white_ally };
  setLights(true);
  setupNightProps();
  refreshMarkers();
  // 夜の見張り：黒メイドは懐中電灯で大広間と玄関ホールを見回り、赤メイドはキッチン裏で仕込み
  const black = people.black, red = people.red;
  Object.assign(black, { area: 'f1', x: 24, z: 10.5, range: 7.5, wait: 0, look: 0,
    nightRole: { i: 0, path: [[24, 10.5, 2], [20.5, 7.5], [20.5, 4.5, 2.5], [27.5, 4.5, 2], [27.5, 10.5], [24, 15, 2.5], [24, 10.5]] } });
  Object.assign(red, { area: 'f1', x: 44.6, z: 4.6, range: 5.5, look: 0, nightRole: { yaw: 0 } });
  red.g.rotation.y = 0;
  enter('cottage', 2.4, 12.5);
  player.g.rotation.set(0, Math.PI / 2, 0);
  say('12月26日、深夜1時。会食の客も帰り、屋敷は寝静まった。',
    s.flags.white_ally ? ['執事', '（白は約束どおり、警報の系統を落としてくれたはずだ）'] : ['執事', '（警報はまだ生きている。絵に触れれば鳴るだろう……）'],
    ['執事', '（夜明けまでに、終わらせる）']);
  run();
}

// テスト用
window.__day3d = { get state() { return s; }, st, player, people, areas, enter, act, planRoute, ROOM_OF, GATE, get cur() { return cur; }, blocked: (x, z, r) => blockedIn(cur, x, z, r) };
