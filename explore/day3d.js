// 執事パートを3Dの屋敷で遊ぶ
// 本編（js/）の状態・予定・調査・会話をそのまま使い、移動と見た目だけを3Dにする
import { THREE, renderer, scene, camera, CAM_OFFSET, hemi, sun, makeChar, animate, resize } from './engine.js';
import { buildArea, AREA_INFO, HOUSE, LOOKS, WORK } from './world.js';
import { PEOPLE, CHORES, END_HOUR } from '../js/data.js';
import { whereIs, isAlly, fatherHome, dateLabel, clamp } from '../js/state.js';
import { SPOTS } from '../js/actions.js';
import * as DL from '../js/daylogic.js';

const SEC_PER_HOUR = 45;     // ゲーム内の1時間が現実の何秒か
const ACT_MIN = 20;          // 調べる・話すにかかる時間（分）
const WALK_SPEED = 5.2;      // 歩く速さ（m/秒）
const LOW = 0.17, VIEW_RANGE = 5.5, VIEW_FOV = Math.PI * 0.42, CONE_RAYS = 24;
const OWNERS = { master: 'mother', droom: 'daughter' };

let s = null, hooks = null, cur = null, running = false;
const areas = {};
const $ = id => document.getElementById(id);
const root = $('day3d');

// ---- 状態（その日だけ） ----
const st = { busy: false, lastKey: null, shelfAnim: 0, mode: 'day' };  // mode：morning（朝礼前）／day
const player = { ...makeChar(scene, { outfit: '#22223a', hair: '#2a2a2a' }), x: 0, z: 0, r: 0.3 };

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
function getArea(id) {
  if (!areas[id]) {
    const a = buildArea(id, scene);
    a.group.visible = false;
    a.markers = [];
    areas[id] = a;
    for (const r of [...a.rooms, ...a.zones]) if (r.key) ROOM_OF[r.key] = { area: id, rect: r };
  }
  return areas[id];
}
const SKY = new THREE.Color('#9cbfd6');
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
  scene.background = SKY;
  hemi.intensity = info.outdoor ? 1.4 : 1.0;
  sun.intensity = info.outdoor ? 2.4 : 1.2;
  camTarget.set(x, 0, z);
  zoomBase = info.outdoor ? 0.6 : 1;
  camera.zoom = zoomBase;
  camera.updateProjectionMatrix();
  st.lastKey = undefined;
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

// ---- 人物：本編の予定表どおりの部屋にいて、部屋の中を歩き回る ----
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
    people[id] = { id, name: LOOKS[id].name, ...ch, cone, coneGeo: geo, coneMat: mat, x: 0, z: 0, area: null, key: undefined, target: null, wait: 0, look: 0, seeing: false };
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
function place(p, key) {
  p.key = key;
  const where = key && ROOM_OF[key];
  if (!where) { p.area = null; return; }
  p.area = where.area; p.rect = where.rect;
  const a = areas[p.area];
  if (p.id === 'father' && key === 'study') { p.x = 14.5; p.z = 1.95; p.g.rotation.y = 0; p.still = true; }
  else { [p.x, p.z] = freePoint(a, p.rect); p.still = false; }
  p.target = null; p.wait = Math.random() * 2;
}
// 朝礼前の使用人棟：赤はお茶を淹れ、黒は先に席で待ち、青と白は身支度中。家族は母屋にいる
const MORNING = { red: 'c_kettle', blue: 'c_blue', black: 'servants', white: 'c_white' };
function updatePerson(p, dt) {
  const key = st.mode === 'morning' ? (MORNING[p.id] && whereIs(s, p.id, 9) ? MORNING[p.id] : null) : whereIs(s, p.id, s.today.hour);
  if (key !== p.key) place(p, key);
  const here = p.area === cur.id;
  p.g.visible = here; p.cone.visible = here;
  if (!here) { p.seeing = false; return; }
  const a = cur;
  if (!st.busy && !p.still) {
    if (p.wait > 0) {
      p.wait -= dt; p.look += dt;
      p.g.rotation.y = (p.baseYaw || 0) + Math.sin(p.look * 1.3) * 0.8;
      animate(p, false, dt);
    } else {
      if (!p.target) {
        for (let i = 0; i < 8 && !p.target; i++) { const t = freePoint(a, p.rect); if (clearPath(a, p.x, p.z, t[0], t[1])) p.target = t; }
        if (!p.target) { p.wait = 2; return; }
      }
      const dx = p.target[0] - p.x, dz = p.target[1] - p.z, d = Math.hypot(dx, dz);
      if (d < 0.05) { p.target = null; p.wait = 2 + Math.random() * 2.5; p.look = 0; p.baseYaw = p.g.rotation.y; }
      else { const step = Math.min(d, 1.1 * dt); p.x += dx / d * step; p.z += dz / d * step; p.g.rotation.y = Math.atan2(dx, dz); }
      animate(p, d >= 0.05, dt);
    }
  } else animate(p, false, dt);
  p.g.position.set(p.x, 0, p.z);
  // 視線
  const vx = player.x - p.x, vz = player.z - p.z, d = Math.hypot(vx, vz);
  let diff = Math.atan2(vx, vz) - p.g.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  p.seeing = d < VIEW_RANGE && d > 1e-6 && Math.abs(diff) < VIEW_FOV / 2 && rayDist(p.x, p.z, vx / d, vz / d, d) >= d;
  const pos = p.coneGeo.attributes.position, yaw = p.g.rotation.y;
  pos.setXYZ(0, p.x, 0, p.z);
  for (let i = 0; i <= CONE_RAYS; i++) {
    const ang = yaw - VIEW_FOV / 2 + VIEW_FOV * i / CONE_RAYS, cx = Math.sin(ang), cz = Math.cos(ang);
    const r = rayDist(p.x, p.z, cx, cz, VIEW_RANGE);
    pos.setXYZ(i + 1, p.x + cx * r, 0, p.z + cz * r);
  }
  pos.needsUpdate = true;
}
// 今こちらを見ている人（協力者は数えない）
const watchers = () => Object.values(people).filter(p => p.area === cur.id && p.seeing && !isAlly(s, p.id)).map(p => p.id);

// ---- 仕事の印 ----
const workMat = new THREE.MeshStandardMaterial({ color: '#7ad08a', emissive: '#4ab06a', emissiveIntensity: 0.6, transparent: true, opacity: 0.6 });
function refreshMarkers() {
  for (const a of Object.values(areas)) { for (const m of a.markers) a.group.remove(m); a.markers = []; }
  if (st.mode === 'morning') return;
  s.today.chores.forEach((c, i) => {
    if (c.assignee !== 'butler' || c.done) return;
    const [area, x, z] = WORK[c.id];
    const a = areas[area], m = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.6, 20), workMat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z);
    a.group.add(m); a.markers.push(m);
  });
}
// 朝礼の席（朝礼前だけ）と、ベッドで休む（仕事中だけ）
const SEAT = [9.05, 7.5];
function morningThings() {
  if (cur.id !== 'cottage') return [];
  if (st.mode === 'morning') return [{ name: '朝礼の席', at: () => SEAT, label: '朝礼', meeting: true }];
  return [{ name: 'ベッド', at: () => [2.4, 12.5], label: '休む', rest: true }];
}
function choreThings() {
  const list = [];
  if (st.mode === 'morning') return list;
  s.today.chores.forEach((c, i) => {
    if (c.assignee !== 'butler' || c.done) return;
    const [area, x, z] = WORK[c.id];
    if (area === cur.id) list.push({ name: CHORES[c.id].name, at: () => [x, z], label: '仕事', chore: i });
  });
  return list;
}
const choreHere = key => s.today.chores.some(c => c.assignee === 'butler' && !c.done && CHORES[c.id].room === key);

// ---- 隠し部屋 ----
function syncSecret() {
  const a = areas.f2, open = !!s.flags.hidden_open;
  for (const o of a.secret.objs) o.visible = open;
  a.secret.spot.intensity = open ? 30 : 0;
  a.shelf.hinge.rotation.y = open ? Math.PI : Math.PI / 2;
  Object.assign(a.shelf.box, open ? { minX: 10.6, maxX: 12.8, minZ: 1.8, maxZ: 2.3 } : { minX: 10.1, maxX: 10.6, minZ: 1.8, maxZ: 4.0 });
}

// ---- 調べる・話す・仕事・移動 ----
let target = null;
function findTarget() {
  let best = null, bd = 1.3;
  const consider = t => {
    if (t.secretOnly && !s.flags.hidden_open) return;
    const [x, z] = t.at(), d = Math.hypot(x - player.x, z - player.z);
    if (d < bd) { bd = d; best = t; }
  };
  for (const t of cur.things) consider(t);
  for (const t of choreThings()) consider(t);
  for (const t of morningThings()) consider(t);
  for (const p of Object.values(people)) if (p.area === cur.id) consider({ name: p.name, at: () => [p.x, p.z], label: 'TALK', person: p });
  return best;
}
function act() {
  if (!msgEl.classList.contains('hidden')) return nextMsg();
  // 会話を閉じた直後の連打では、次の会話を始めない（押し続けている間は待ち時間を延ばす）
  if (performance.now() < actLock) { actLock = performance.now() + 500; return; }
  if (st.busy || !target) return;
  const t = target;
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
    p.x = x; p.z = z; p.g.rotation.y = yaw; p.still = true; p.g.position.set(x, 0, z);
  });
  hooks.openMeeting(() => {
    st.mode = 'day';
    s.today.hour = 9; s.today.min = 0;
    for (const p of Object.values(people)) p.key = undefined;   // それぞれの持ち場へ
    refreshMarkers();
    const mine = s.today.chores.filter(c => c.assignee === 'butler').map(c => CHORES[c.id].name);
    say(['朝礼', `9時、仕事の始まりだ。執事の担当は${mine.length ? `「${mine.join('」「')}」` : 'なし'}。`],
      mine.length ? '緑の印が仕事の場所だ。空いた時間で、屋敷を探ろう。' : '今日は自由に動ける。屋敷を探ろう。');
  });
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
      st.shelfAnim = 0.0001;
      const a = areas.f2;
      for (const o of a.secret.objs) o.visible = true;
      Object.assign(a.shelf.box, { minX: 10.6, maxX: 12.8, minZ: 1.8, maxZ: 2.3 });
      return say('赤い本を引き、鍵を差し込む。本棚がゆっくりと手前に開き出した……！');
    }
    return search(['study', 'shelf']);
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
  const ex = cur.id === 'grounds' ? 92 : Math.max(...cur.rooms.map(r => r.x + r.w));
  const ez = cur.id === 'grounds' ? 58 : Math.max(...cur.rooms.map(r => r.z + r.d));
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
  for (const t of choreThings()) { const [x, z] = t.at(); mm.fillStyle = '#7ad08a'; mm.fillRect(px(x) - 4, pz(z) - 4, 8, 8); }
  for (const p of Object.values(people)) {
    if (p.area !== cur.id) continue;
    mm.fillStyle = PEOPLE[p.id].color; mm.beginPath(); mm.arc(px(p.x), pz(p.z), 4, 0, 7); mm.fill();
  }
  mm.fillStyle = '#e3c06f'; mm.beginPath(); mm.arc(px(player.x), pz(player.z), 5, 0, 7); mm.fill();
}
function drawHud(room) {
  const t = s.today, mm2 = String(Math.floor(t.min || 0)).padStart(2, '0');
  $('clock3d').textContent = `${dateLabel(s)}　${st.mode === 'morning' ? '7:30' : `${t.hour}:${mm2}`}`;
  $('place3d').textContent = `${AREA_INFO[cur.id].name}　${room ? room.name : ''}`;
  $('trust3d').style.width = `${s.trust}%`;
  $('susp3d').style.width = `${s.susp}%`;
  const todo = s.today.chores.filter(c => c.assignee === 'butler').map(c => `${c.done ? '✓' : '・'}${CHORES[c.id].name}${CHORES[c.id].optional ? '（任意）' : ''}`);
  $('end3d').classList.toggle('hidden', st.mode === 'morning');
  const text = st.mode === 'morning' ? '共用室の席に着いて、朝礼を始めよう' : todo.length ? todo.join('　') : '執事の担当なし';
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
    const sp = WALK_SPEED * Math.min(1, il) / il;
    const dx = (FWD.x * iy + RIGHT.x * ix) * sp * dt, dz = (FWD.y * iy + RIGHT.y * ix) * sp * dt;
    moveBy(player, dx, dz, player.r);
    player.g.rotation.y = Math.atan2(dx, dz);
  }
  if (st.lying) { player.g.position.set(player.x, 0.62, player.z); player.g.rotation.set(-Math.PI / 2, 0, 0); }
  else { player.g.position.set(player.x, 0, player.z); animate(player, moving, dt); }

  // 今いる部屋
  const room = roomAt(player.x, player.z);
  const key = room && room.key || null;
  s.today.loc = key || 'elsewhere';
  if (key !== st.lastKey) {
    const owner = OWNERS[key];
    if (st.lastKey !== undefined && owner && whereIs(s, owner, s.today.hour) === key && !choreHere(key) && !st.busy) say(DL.intrude(s, owner));
    st.lastKey = key;
  }

  for (const p of Object.values(people)) updatePerson(p, dt);
  const seen = watchers();
  const inPrivate = !!(room && room.private) && !choreHere(key);
  for (const p of Object.values(people)) p.coneMat.color.set(isAlly(s, p.id) ? '#8ad0a0' : p.seeing && inPrivate ? '#ff5a4a' : '#ffe08a');
  if (!st.busy && seen.length && inPrivate) s.susp = clamp(s.susp + 8 * dt);
  if (fatal()) return;

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
  actBtn.textContent = talking ? '次へ' : target ? (target.exit ? '移動' : target.person ? '話す' : target.chore !== undefined ? '仕事' : target.meeting ? '朝礼' : target.rest ? '休む' : '調べる') : '';
  const labels = [];
  for (const p of Object.values(people)) {
    if (p.area !== cur.id) continue;
    const alert = p.seeing && inPrivate && !isAlly(s, p.id);
    labels.push({ x: p.x, y: 2.1, z: p.z, text: alert ? '！' : p.name, cls: alert ? 'alert' : 'name' });
  }
  for (const t of choreThings()) { const [x, z] = t.at(); labels.push({ x, y: 0.6, z, text: `仕事：${t.name}`, cls: 'work' }); }
  if (target) {
    const [x, z] = target.at();
    labels.push({ x, z, y: target.person ? 2.5 : 1.6, text: target.person ? 'TALK' : target.exit || target.meeting || target.rest ? target.label : target.chore !== undefined ? '仕事' : '調べる', cls: target.exit ? 'exit' : '' });
  }
  drawLabels(labels);
  drawMinimap(room);
  drawHud(room);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// 本編から呼ばれる：朝、執事の部屋のベッドで目を覚ますところから1日を始める
export function startMorning(state, h) {
  s = state; hooks = h;
  root.classList.remove('hidden');
  resize();
  if (!areas.grounds) {
    for (const id of ['grounds', 'cottage', 'f1', 'f2']) getArea(id);
    makePeople();
  }
  st.mode = 'morning';
  for (const p of Object.values(people)) p.key = undefined;
  syncSecret();
  refreshMarkers();
  s.today.min = s.today.min || 0;
  ending = false; st.busy = false; st.shelfAnim = 0; msgQueue = []; afterMsg = null;
  enter('cottage', 1.2, 13.3);
  st.lying = true;
  afterMsg = () => { st.lying = false; player.g.rotation.set(0, Math.PI / 2, 0); player.x = 2.4; player.z = 12.5; };
  say(['執事', `（${dateLabel(s)}、朝7時30分。……さて、今日も完璧な執事を演じるとしよう）`],
    '身支度を整えたら、共用室の席に着いて朝礼を始めよう。');
  running = true;
  last = performance.now();
  requestAnimationFrame(tick);
}

// テスト用
window.__day3d = { get state() { return s; }, st, player, people, areas, enter, act, get cur() { return cur; }, blocked: (x, z, r) => blockedIn(cur, x, z, r) };
