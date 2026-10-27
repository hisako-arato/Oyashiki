// 執事パートと決行の夜を3Dの屋敷で遊ぶ
// 本編（js/）の状態・予定・調査・会話をそのまま使い、移動と見た目だけを3Dにする
import { THREE, renderer, scene, camera, CAM_OFFSET, hemi, sun, makeChar, animate, resize, box, mat, M, TEX } from './engine.js';
import { buildArea, AREA_INFO, HOUSE, LOOKS, WORK } from './world.js';
import { buildNav, planRoute } from './nav.js';
import { PEOPLE, CHORES, ROOMS, END_HOUR, MAIDS } from '../js/data.js';
import { faceOf } from '../js/faces.js';
import { richNodes } from '../js/richtext.js';
import { whereIs, isAlly, fatherHome, dateLabel, eveCountdown, clamp, buildPlan, setFlag, maidAvailable, fillUnassigned, castNeeded, isEve, applyFx, fxNote } from '../js/state.js';
import { SPOTS } from '../js/actions.js';
import * as DL from '../js/daylogic.js';
import { whiteSaw } from '../js/white.js';
import * as BALL from '../js/ball.js';
import * as music from '../js/music.js';
import { recall } from '../js/recall.js';
import * as EV from '../js/events.js';
import { maskVRM, unmaskVRM, liftMask, updateMasks, styleOf, maskFragment } from './masks.js';

const SEC_PER_HOUR = 45;     // ゲーム内の1時間が現実の何秒か（昼）
const NIGHT_SEC_PER_HOUR = 75; // 決行の夜
const BALL_SEC_PER_HOUR = 40;  // 仮面舞踏会（19:00〜0:30）
const ACT_MIN = 20;          // 調べる・話すにかかる時間（分）
const WALK_SPEED = 5.2;      // 歩く速さ（m/秒）
const NPC_SPEED = 2.2;       // 人物が部屋を移るときの速さ
const LOW = 0.17, VIEW_RANGE = 5.5, VIEW_FOV = Math.PI * 0.42, CONE_RAYS = 24;
const OWNERS = { master: 'mother', droom: 'daughter' };
const AREA_SIZE = { grounds: [92, 58], cottage: [20, 15], f1: [48, 18], f2: [48, 18], basement: [30, 7] };
const GATE = { area: 'grounds', x: 38, z: 56 };

let s = null, hooks = null, cur = null, running = false;
const areas = {};
const $ = id => document.getElementById(id);
const root = $('day3d');

// ---- 状態（その日だけ） ----
// mode：morning（朝礼前）／day（仕事中）／ball（イブの仮面舞踏会）／night（決行の夜）
const st = { busy: false, lastKey: null, shelfAnim: 0, mode: 'day', tut: null, night: null };
const player = { ...makeChar(scene), x: 0, z: 0, r: 0.3 };
const lantern = new THREE.PointLight('#ffcf8a', 0, 9, 1.6);
lantern.position.set(0.3, 1.3, 0.2);
player.g.add(lantern);

// ---- メッセージ ----
const msgEl = $('msg3d');
let msgQueue = [], afterMsg = null, actLock = 0;
function say(...lines) { msgQueue = lines.filter(Boolean); nextMsg(); }
// 台詞の話し手（表示名 → 人物）。会話の顔を映し、屋敷の中の VRM の表情も変える
const SPEAKER = { ...Object.fromEntries(Object.entries(LOOKS).map(([id, l]) => [l.name, id])), '執事': 'butler', '雫': 'black', '巡回員': 'guard' };
let portrait = null, faced = null;
function speakerOf(l) {
  if (Array.isArray(l)) return [SPEAKER[l[0]], l[1], l[2]];
  const m = typeof l === 'string' && l.match(/^([^「（]+)([「（].*)$/s);
  return m && SPEAKER[m[1]] ? [SPEAKER[m[1]], m[2]] : [null, ''];
}
function setFace(id, face) {
  if (faced && faced.vrm) faced.vrm.motion.face = Object.fromEntries(Object.keys(faced.vrm.motion.face).map(k => [k, 0]));
  faced = id ? (id === 'butler' ? player : people[id]) : null;
  if (faced && faced.vrm && face !== 'neutral') faced.vrm.motion.face = { [face]: 1 };
}
function nextMsg() {
  const l = msgQueue.shift();
  if (!l) {
    setFace(null);
    msgEl.classList.remove('with-face');
    msgEl.classList.add('hidden'); st.busy = false;
    actLock = performance.now() + 500;
    if (afterMsg) { const f = afterMsg; afterMsg = null; f(); }
    return;
  }
  st.busy = true;
  msgEl.replaceChildren();
  const [who, text, override] = speakerOf(l);
  // 話し手の名前は太字に、効果のお知らせ（〔好感度 +5〕など）は色付きで別の行に出す
  const named = Array.isArray(l) ? [l[0], l[1]] : who ? [l.slice(0, l.length - text.length), text] : null;
  if (named) { const b = document.createElement('b'); b.textContent = named[0]; msgEl.append(b, ...richNodes(named[1])); }
  else msgEl.append(...richNodes(l));
  // 二人きりの雫（「お兄ちゃん」と呼ぶとき）は、雫としての顔にする
  const said = text.replace(/〔[^〕]*〕/g, '');
  const face = who ? faceOf(said, override, who === 'black' && /お兄ちゃん/.test(said) ? 'shizuku' : who) : 'neutral';
  setFace(who, face);
  // 話し手の顔：胸から上の VRM。読み込み終わるまでは、同じ VRM から作った顔アイコンを出しておく
  const faceId = Array.isArray(l) && l[0] === '雫' && s.counters.night_black ? 'black2' : who === 'butler' && st.mode === 'night' ? 'butler2' : who === 'daughter' && st.mode === 'ball' ? 'daughter3' : who;
  msgEl.classList.toggle('with-face', !!who);
  if (who) {
    const icon = document.createElement('img');
    icon.className = 'face-fallback'; icon.alt = ''; icon.src = `assets/faces/${faceId}.webp`;
    msgEl.prepend(icon);
    if (portrait && !TEST) { portrait.showPortrait(faceId, face, /^（/.test(said) ? 0 : said.length); msgEl.prepend(portrait.portraitCanvas()); }
  }
  msgEl.classList.remove('hidden');
}
msgEl.addEventListener('click', nextMsg);

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
    a.group.traverse(o => { if (o.isPointLight && !o.userData.keepNight) LIGHTS.push({ o, base: o.intensity }); });
    buildNav(a, ...AREA_SIZE[id]);
  }
  return areas[id];
}
const SKY = new THREE.Color('#9cbfd6'), NIGHT_SKY = new THREE.Color('#0b1020'), UNDER_SKY = new THREE.Color('#050404');
let zoomBase = 1;
function enter(id, x, z) {
  const a = getArea(id);
  if (cur) cur.group.visible = false;
  cur = a;
  a.group.visible = true;
  player.x = x; player.z = z;
  if (st.mode === 'night') shareGuard();
  const info = AREA_INFO[id];
  // 屋内にいるときも、窓や低くした壁の向こうに庭が見えるよう、敷地を一緒に表示する
  const g = getArea('grounds');
  g.group.visible = !info.underground;
  if (info.outdoor) g.group.position.set(0, 0, 0);
  else g.group.position.set(-info.origin.x, -0.03 - info.below, -info.origin.z);
  for (const b of g.blocks) b.g.visible = info.outdoor || b.name !== info.hide;
  const night = st.mode === 'night', ball = st.mode === 'ball';
  scene.background = info.underground ? UNDER_SKY : night || ball ? NIGHT_SKY : SKY;
  // 舞踏会の夜は、外は暗く、屋敷の中はシャンデリアで明るい
  hemi.intensity = info.underground ? 0.12 : night ? (info.outdoor ? 0.35 : 0.25) : ball ? (info.outdoor ? 0.35 : 0.95) : info.outdoor ? 1.4 : 1.0;
  sun.intensity = info.underground ? 0.05 : night ? 0.45 : ball ? (info.outdoor ? 0.4 : 0.7) : info.outdoor ? 2.4 : 1.2;
  lantern.intensity = night || info.underground ? 7 : 0;
  camTarget.set(x, 0, z);
  zoomBase = info.outdoor ? 0.6 : 1;
  camera.zoom = zoomBase;
  camera.updateProjectionMatrix();
  st.lastKey = undefined;
  if (areas.basement && areas.f1) syncUnder();
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
const travel = (to, then) => (music.sfx('door'), fade('', () => { enter(to.area, to.x, to.z); st.busy = false; if (then) then(); }));
// 地下から地上（資料室・庭の古井戸）へ上がる。上に人がいれば気配で分かる。上がった瞬間を見られたら言い訳
function climb(to) {
  const room = to.area === 'f1' ? 'archive' : 'garden';
  const go = () => travel(to, () => {
    const c = DL.caughtEmerging(s, room);
    if (!c) return;
    st.busy = true;
    hooks.askChoice(c.line, c.options, msg => { st.busy = false; say(msg); fatal(); });
  });
  const l = DL.listenAbove(s, room);
  if (!l) return go();
  st.busy = true;
  hooks.askChoice(l.line, l.options, (msg, o) => { st.busy = false; if (o.go) go(); else say(msg); });
}

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
// ベッドに寝かせる。お嬢様の部屋のベッドは枕が南（頭は +z）、執事の部屋のベッドは枕が北（頭は -z）。足元から頭まで約1.5m
const BEDS = { daughter: { area: 'f2', x: 39, z: 16.1, yaw: Math.PI }, butler: { area: 'cottage', x: 1.2, z: 13.3, yaw: 0 } };
function sleepInBed(p, bed = BEDS.daughter) { Object.assign(p, { sleep: bed, area: bed.area, x: bed.x, z: bed.z, nightRole: null }); }
function wake(p) {
  if (!p.sleep) return;
  p.sleep = false; p.g.rotation.set(0, 0, 0, 'XYZ');
  if (p.blob) p.blob.visible = true;
}
// 人物の足元の丸い影（人物は影を落とさない）
const blobMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.32, depthWrite: false });
const blobGeo = new THREE.CircleGeometry(0.32, 16).rotateX(-Math.PI / 2);
function blob() { const b = new THREE.Mesh(blobGeo, blobMat); b.position.y = 0.015; b.renderOrder = -1; return b; }
function makePeople() {
  player.blob = blob(); player.g.add(player.blob);
  for (const [slot, id] of Object.keys(LOOKS).entries()) {
    const ch = { ...makeChar(scene), slot };
    ch.blob = blob(); ch.g.add(ch.blob);
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
// 人物に VRM を入れる。ゲームの開始前と章の初日に読み込んであるので（explore/vrm.js の preloadCast）、すぐに入る
// ?test（動作確認用）のときは読み込まない（人物は見えないまま動く）
export const TEST = new URLSearchParams(location.search).has('test');
// 読み込むのは、今の章で屋敷にいる人だけ（state.js の castNeeded）
let castLoading = null;
// 決行の夜は、執事を決行の服（butler2）に着替えさせる。昼に戻ったら執事服に戻す
function dressPlayer(night) {
  if (TEST) return;
  const want = night ? 'butler2' : 'butler';
  if (player.vrmId === want || (!night && !player.vrmId)) return;
  import('./vrm.js').then(V => V.loadVRM(want).then(v => { V.attachVRM(player, v); player.vrmId = want; })).catch(e => console.warn('VRM', e));
}
function syncCast() {
  if (castLoading || TEST) return;
  const chars = { butler: player, ...people };
  const ids = castNeeded(s).filter(id => chars[id] && !chars[id].vrm);
  if (!ids.length) return;
  castLoading = (async () => {
    const V = await import('./vrm.js');
    for (const id of ids) V.attachVRM(chars[id], await V.loadVRM(id));
  })().catch(e => console.warn('VRM', e)).finally(() => { castLoading = null; });
}
// 見た目を変えずに負担を減らす：画面の外にいる人は動きの計算と描画を止め、遠くの人は計算を2フレームに1回にする
const frustum = new THREE.Frustum(), projView = new THREE.Matrix4(), bodySphere = new THREE.Sphere(new THREE.Vector3(), 1.4);
let frameNo = 0;
function updateFrustum() {
  frameNo++;
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
}
function driveSeen(ch, moving, dt) {
  bodySphere.center.set(ch.x, 0.9, ch.z);
  const seen = frustum.intersectsSphere(bodySphere);
  if (ch.vrm) ch.vrm.scene.visible = seen;
  ch.lag = (ch.lag || 0) + dt;
  if (!seen) { ch.lag = Math.min(ch.lag, 0.1); return; }
  const far = Math.hypot(ch.x - player.x, ch.z - player.z) > 9;
  if (far && (frameNo + (ch.slot || 0)) % 2) return;
  animate(ch, moving, Math.min(ch.lag, 0.1));
  ch.lag = 0;
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
// 朝礼前の使用人棟：赤羽はお茶を淹れ、黒は先に席で待ち、青島と白井は身支度中。家族は母屋にいる
const MORNING = { red: 'c_kettle', blue: 'c_blue', black: 'servants', white: 'c_white' };
function wantedKey(p) {
  if (LOOKS[p.id].nightOnly || LOOKS[p.id].ballOnly) return null;   // 夜だけの人（外の巡回員）と舞踏会の客は、昼は屋敷にいない
  if (st.mode === 'morning') return st.tutPending && p.id === 'blue' ? 'servants' : MORNING[p.id] && whereIs(s, p.id, 9) ? MORNING[p.id] : null;
  return whereIs(s, p.id, s.today.hour);
}
function updatePerson(p, dt) {
  let moving = false;
  // ベッドで眠っている人（決行の夜、お嬢様の部屋から始めたときのお嬢様）
  if (p.sleep) {
    p.g.visible = p.area === cur.id; p.cone.visible = false; p.seeing = false;
    if (p.blob) p.blob.visible = false;
    p.g.position.set(p.x, 0.62, p.z); p.g.rotation.set(-Math.PI / 2, p.sleep.yaw, 0, 'YXZ');
    if (p.g.visible) driveSeen(p, false, dt);
    return;
  }
  // ワルツの相手は、ダンスの間 danceTick が動かす
  if (p.dancing) { p.g.visible = p.area === cur.id; p.cone.visible = false; p.seeing = false; return; }
  // 11月5日：仕出し屋は、勝手口の外の白いバンの横で待っている
  if (p.id === 'caterer' && delivering()) {
    Object.assign(p, { area: 'grounds', x: VAN[0] - 0.9, z: VAN[1] + 0.7 });
    const here = cur.id === 'grounds';
    p.g.visible = here; p.cone.visible = false; p.seeing = false;
    if (here) { p.g.position.set(p.x, 0, p.z); p.g.rotation.y = Math.atan2(player.x - p.x, player.z - p.z); driveSeen(p, false, dt); }
    return;
  }
  // 夜だけの人（外を回る巡回員）は、昼は屋敷にいない
  if ((LOOKS[p.id].nightOnly && st.mode !== 'night') || (LOOKS[p.id].ballOnly && st.mode !== 'ball')) { p.area = null; p.g.visible = false; p.cone.visible = false; p.seeing = false; return; }
  if (st.mode === 'night' || st.mode === 'ball') moving = nightPerson(p, dt);
  else if (st.tut && p.id === 'blue') moving = tutorGuide(p, dt);
  else {
    const key = wantedKey(p);
    if (key !== p.key) goTo(p, key, st.mode === 'morning' || st.placeNow);
    if (!st.busy && p.area) moving = p.route ? walkLegs(p, dt) : p.still ? false : wander(p, dt);
  }
  const here = p.area === cur.id;
  p.g.visible = here; p.cone.visible = here;
  if (!here) { p.seeing = false; return; }
  p.g.position.set(p.x, 0, p.z);
  driveSeen(p, moving && !st.busy, dt);
  // 舞踏会では、誰に見られても怪しまれない（視線の扇は出さない）
  if (st.mode === 'ball' && !(st.ball.dark && p.id === 'guard')) { p.cone.visible = false; p.seeing = false; return; }
  sight(p);
}
// 今こちらを見ている人（協力者は数えない）
// チュートリアルで付いてくる青島は、資料室の練習のとき以外は数えない
const guiding = p => st.tut && p.id === 'blue' && st.tut.step !== 2;
const watchers = () => Object.values(people).filter(p => p.area === cur.id && p.seeing && !isAlly(s, p.id) && !guiding(p)).map(p => p.id);

// ---- 仕事の印 ----
const workMat = new THREE.MeshStandardMaterial({ color: '#7ad08a', emissive: '#4ab06a', emissiveIntensity: 0.6, transparent: true, opacity: 0.6 });
// 人に付いていく仕事（お母様のお供）：場所が決まっていないので、その人の頭の上に目印を出し、話しかけて始める
const withPerson = id => CHORES[id].with && CHORES[id].room === 'out' ? CHORES[id].with : null;
const personGems = [];
function refreshMarkers() {
  for (const a of Object.values(areas)) { for (const m of a.markers) a.group.remove(m); a.markers = []; }
  for (const g of personGems.splice(0)) g.parent && g.parent.remove(g);
  if (st.mode !== 'day') return;
  s.today.chores.forEach(c => {
    if (c.assignee !== 'butler' || c.done) return;
    const who = withPerson(c.id);
    if (who) {
      if (!people[who]) return;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), gemMat);
      gem.position.set(0, 2.25, 0); gem.userData.bob = 0; gem.userData.base = 2.25;
      people[who].g.add(gem); personGems.push(gem);
      return;
    }
    const [area, x, z] = WORK[c.id];
    const a = areas[area], m = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.6, 20), workMat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z);
    // 人や家具に隠れても分かるよう、頭より高い所に揺れる目印を浮かべる
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), gemMat);
    gem.position.set(x, 2.4, z); gem.userData.bob = Math.random() * 6;
    a.group.add(m, gem); a.markers.push(m, gem);
  });
}
const gemMat = new THREE.MeshBasicMaterial({ color: '#5fe08a', transparent: true, opacity: 0.9, depthTest: false });
function bobMarkers(dt) {
  for (const m of [...cur.markers, ...personGems]) if (m.userData.bob != null) {
    m.userData.bob += dt * 3;
    m.position.y = (m.userData.base ?? 2.4) + Math.sin(m.userData.bob) * 0.15;
    m.rotation.y += dt * 1.5;
  }
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
    if (c.assignee !== 'butler' || c.done || withPerson(c.id)) return;
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
// 地下まわり：床の扉、搬入路の鉄格子、条件付きの出入口の印
function syncUnder() {
  areas.f1.hatch.visible = !!s.flags.b_hatch;
  const gr = areas.basement.grate, open = !!s.flags.b_grate;
  gr.g.visible = !open;
  Object.assign(gr.box, open ? { minX: -999, maxX: -998, minZ: -999, maxZ: -998 } : (gr.at ||= { ...gr.box }));
  for (const a of Object.values(areas)) for (const th of a.things) if (th.mark && th.when) th.mark.visible = !!th.when(s);
}
// クリスマスの飾り：飾り付けを終えた物だけ見せ、当たり判定を置く。人物の道順も作り直す
function syncDeco() {
  for (const [id, a] of Object.entries(areas)) {
    let changed = false;
    for (const [key, d] of Object.entries(a.deco)) {
      const on = !!s.flags[`deco_${key}`];
      if (d.g.visible !== on) changed = true;
      d.g.visible = on;
      for (const b of d.boxes) Object.assign(b, on ? b.at : { minX: -999, maxX: -998, minZ: -999, maxZ: -998 });
    }
    if (changed && a.deco && Object.values(a.deco).some(d => d.boxes.length)) buildNav(a, ...AREA_SIZE[id]);
  }
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
    if (t.when && !t.when(s)) return;
    const [x, z] = t.at(), d = Math.hypot(x - player.x, z - player.z) - bias;
    if (d < bd) { bd = d; best = t; }
  };
  for (const t of cur.things) consider(t);
  for (const t of choreThings()) consider(t);
  for (const t of cottageThings()) consider(t, 0.8);
  for (const t of nightThings()) consider(t, 0.8);   // 夜だけの操作を、同じ場所の昼の調べものや出入口より優先する
  for (const t of ballThings()) consider(t, 0.6);
  for (const t of eveThings()) consider(t, 0.8);
  for (const t of deliveryThings()) consider(t, 1.0);
  // 舞踏会で雫を探しているときは、見つけた雫に話しかけるのを優先する
  if (st.mode !== 'night') for (const p of Object.values(people)) if (p.area === cur.id && !guiding(p)) consider({ name: p.name, at: () => [p.x, p.z], label: 'TALK', person: p }, st.mode === 'ball' && st.ball.search && p.id === 'black' ? 1.2 : 0);
  return best;
}
function act() {
  if (st.dance) return danceTap();
  if (!msgEl.classList.contains('hidden')) return nextMsg();
  // 会話を閉じた直後の連打では、次の会話を始めない（押し続けている間は待ち時間を延ばす）
  if (performance.now() < actLock) { actLock = performance.now() + 500; return; }
  if (st.busy || !target) return;
  const t = target;
  if (t.night) return t.night();
  if (st.mode === 'night') return nightAct(t);
  if (st.mode === 'ball') return ballAct(t);
  if (t.night) return t.night();
  if (t.meeting) return startMeeting();
  if (t.rest) { if (confirm(endAsk('今日の業務を終えて休みますか？'))) finish(); return; }
  // 地下から上がるとき・古井戸から降りるとき
  if (t.exit && st.mode === 'day' && cur.id === 'basement' && t.exit.area !== 'basement') return climb(t.exit);
  if (t.exit && st.mode === 'day' && cur.id === 'grounds' && t.exit.area === 'basement' && watchers().length) return say('人の目がある。今は降りられない。');
  // 朝礼を済ませるまでは、使用人棟から出られない
  if (t.exit && st.mode === 'morning' && cur.id === 'cottage' && t.exit.area !== 'cottage')
    return say(['執事', '（まだ朝礼が済んでいない。まずは共用室の席に着いて、朝礼を始めよう）']);
  if (t.exit) return travel(t.exit);
  if (t.person && t.person.id === 'caterer') return say(['仕出し屋', st.dayCarry === 'crate' ? '「それ、食料庫にお願いします！」' : '「木箱は荷台です。重いので、気をつけて！」']);
  if (t.person) return talkTo(t.person);
  if (t.chore !== undefined) return work(t.chore);
  if (t.say) {
    // 調べた物は手帳の「屋敷で調べた物」に数える
    const text = t.say.map(l => typeof l === 'function' ? l(s) : l);
    if (s.flags[lookKey(t)]) return say(...text);
    s.flags[lookKey(t)] = true;
    // 数えるのは場所ごと（使用人棟・庭・屋敷 1F・屋敷 2F・地下）。場所をすべて調べたら知らせる
    const here = lookStats().areas.find(x => x.id === cur.id), lines = text;
    if (here) {
      lines[lines.length - 1] += `〔${here.name}で調べた物 ${here.seen} / ${here.total}〕`;
      if (here.seen === here.total) hooks.toast(`★ ${here.name}の物を、すべて調べた！`);
    }
    return say(...lines);
  }
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
  const hint = st.tutPending ? '【朝礼】メイドが二人になったので、今日から執事が仕事を割り振る。赤羽は料理が速く、新人の青島は絵（花の飾り付け）が得意だが、掃除や料理は苦手でときどき失敗する。執事が担当した仕事は、屋敷の緑の印の場所で行う。迷ったら「おまかせで割り振る」。' : null;
  hooks.openMeeting(() => {
    st.mode = 'day';
    s.today.hour = 9; s.today.min = 0;
    // チュートリアルの日は、執事の担当を一つ決め、割り振られていない仕事はメイドに振っておく
    let filled = [];
    if (st.tutPending) { ensureButlerChore(); filled = fillUnassigned(s); buildPlan(s); }
    // メイドは席から持ち場へ歩いていく。家族は最初からそれぞれの場所にいる
    for (const p of Object.values(people)) if (!MAIDS.includes(p.id)) goTo(p, wantedKey(p), true); else p.still = false;
    refreshMarkers();
    if (st.tutPending) { st.tutPending = false; return tutorStart(filled); }
    const mine = s.today.chores.filter(c => c.assignee === 'butler').map(c => CHORES[c.id].name);
    say(['朝礼', `9時、仕事の始まりだ。執事の担当は${mine.length ? `「${mine.join('」「')}」` : 'なし'}。`],
      mine.length ? '緑の印が仕事の場所だ。空いた時間で、屋敷を探ろう。' : '今日は自由に動ける。屋敷を探ろう。');
  }, hint);
}

function talkTo(p) {
  p.g.rotation.y = Math.atan2(player.x - p.x, player.z - p.z);
  p.wait = Math.max(p.wait, 3); p.baseYaw = p.g.rotation.y; p.target = null;
  // お供の仕事を引き受けている相手なら、お供するか（ふつうに話すか）を選ぶ
  const i = st.mode === 'day' ? s.today.chores.findIndex(c => c.assignee === 'butler' && !c.done && withPerson(c.id) === p.id) : -1;
  if (i >= 0) {
    const c = s.today.chores[i], def = CHORES[c.id];
    st.busy = true;
    return hooks.askChoice(ESCORT_ASK[c.id] || `${p.name}のお供をしますか？`, [
      { t: `お供する（${def.hours - c.progress}時間）`, run: () => '', escort: true },
      { t: 'ふつうに話す', run: () => '' },
    ], (msg, o) => { st.busy = false; if (o.escort) work(i); else chat(p); });
  }
  chat(p);
}
const ESCORT_ASK = { escortM: '「あら執事さん。エステの予約の時間よ。送ってくださる？」' };
function chat(p) {
  const others = Object.values(people).filter(o => o !== p && o.area === cur.id && Math.hypot(o.x - player.x, o.z - player.z) < 8).length;
  const res = DL.talk(s, p.id, others);
  if (!res.repeat) DL.spendMinutes(s, ACT_MIN);
  if (res.forgery) {
    st.busy = true;
    if (res.ask) { say(res.ask); afterMsg = () => { st.busy = true; hooks.askForgery(res.msg, m => say(m)); }; return; }
    return hooks.askForgery(res.msg, m => say(m));
  }
  say(res.ask, res.msg);
}
function work(i) {
  const c = s.today.chores[i], { ok, why } = DL.choreAvailability(s, c);
  if (!ok) {
    // あとでできるようになるなら「その時間まで待つ」を選べる（待っている間も、時間は進む）
    const h = DL.waitTarget(s, c), t = s.today;
    if (h == null) return say(`${CHORES[c.id].name}は今はできない（${why}）。`);
    const mins = Math.ceil(h * 60 - (t.hour * 60 + (t.min || 0))), hh = Math.floor(mins / 60), mm = mins % 60;
    st.busy = true;
    return hooks.askChoice(`${CHORES[c.id].name}は今はできない（${why}）。`, [
      { t: `${h}時まで待つ（あと${hh ? `${hh}時間` : ''}${mm ? `${mm}分` : ''}）`, run: () => '', wait: true },
      { t: 'あとにする', run: () => '' },
    ], (msg, o) => {
      st.busy = false;
      if (!o.wait) return;
      fade(`${h}時まで待っています……`, () => { DL.waitUntil(s, h); st.placeNow = true; work(i); }, 900);
    });
  }
  fade(`${CHORES[c.id].name}をしています……`, () => {
    const msg = DL.doChore(s, i);
    refreshMarkers();
    syncDeco();
    say(msg);
    if (st.tut) tutorEvent('chore');
  }, 900);
}
function search([key, id], extraMsg) {
  const sp = (SPOTS[key] || []).find(o => o.id === id);
  if (!sp) return;
  const seen = watchers();
  DL.spendMinutes(s, ACT_MIN);
  const res = DL.investigate(s, sp, seen, key);
  if (res.clue) hooks.toast('手帳に記録した');
  if (res.code) { st.busy = true; return hooks.askCode(res.msg, m => { say(m); }); }
  say(extraMsg, res.msg);
  syncUnder();
  if (st.tut) tutorEvent('search', key, id);
}
function special(kind) {
  if (kind === 'notebook') return hooks.notebook();
  if (kind === 'garage') return say(fatherHome(s) ? 'お父様の車はガレージの奥に停めてある。今日は一日、書斎にいるらしい。' : 'シャッターが半分開いている。中は空っぽだ。お父様は車で会社に出かけている。');
  if (kind === 'hatch') {
    // 床の扉を開けたまま（上がってきたところ）なら、降りるか、敷物を戻すかを選ぶ
    if (s.flags.hatch_open && st.mode === 'day') {
      st.busy = true;
      return hooks.askChoice('床の扉が開いたままだ。敷物もめくれている。', [
        { t: '石段を降りる', run: () => '', down: true },
        { t: '扉を閉め、敷物を元に戻す', run: () => '' },
      ], (msg, o) => {
        st.busy = false;
        if (o.down) return travel({ area: 'basement', x: 1.0, z: 4.0 });
        s.flags.hatch_open = false;
        say('床の扉を閉め、敷物を元どおりに敷き直した。……これで、誰も気づかないはずだ。');
      });
    }
    const first = !s.flags.b_found;
    const why = DL.openHatch(s, watchers());
    if (why) return say(why);
    afterMsg = () => travel({ area: 'basement', x: 1.0, z: 4.0 });
    return say(first ? '床の扉を開け、懐中電灯を手に石段を降りた。……ひんやりとした空気。ここにいる間は、屋敷のどこにも姿が見えない。長くいれば、誰かが探し始めるだろう。'
      : '床の扉を開け、石段を降りる。');
  }
  if (kind === 'shelf') {
    // 開けた本棚は、元に戻しておく（開けたままにすると、旦那様やメイドに気づかれる）
    if (s.flags.hidden_open) {
      if (watchers().length) return say('人の目がある。今は本棚を動かせない。');
      const inRoom = roomAt(player.x, player.z);
      if (inRoom && inRoom.key === 'hidden') return say('隠し部屋の中からは、本棚を閉められない。');
      s.flags.hidden_open = false; syncSecret();
      return say('赤い本を押し戻すと、本棚が音もなく元の位置に収まった。');
    }
    if (s.flags.red_book && s.flags.key_hidden && !s.flags.key_out) return say('隠し部屋の鍵は、机の引き出しに戻してある。……先に取ってこよう。');
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
// 初日（11月1日）のチュートリアル：新しく来た青島に、執事が屋敷の仕事と決まりを教える
// （執事は何か月も働いているので、教わる側ではなく教える側。青島が後ろを付いて歩く）
// ============================================================
const TUT = [
  { goal: () => {
    // どの仕事を、どこでやるのかを示す（印は別の階や建物にあることもある）
    const c = s.today.chores.find(c => c.assignee === 'butler' && !c.done && !CHORES[c.id].optional);
    if (!c) return '青島に仕事を見せる：担当の仕事を、緑の印の場所で済ませる';
    const [area] = WORK[c.id], room = ROOMS[CHORES[c.id].room];
    return `青島に仕事を見せる：担当の「${CHORES[c.id].name}」を済ませる（${AREA_INFO[area].name}${room ? `・${room.name}` : ''}の緑の印）`;
  }, say: [['執事', '「青島さん、まずは仕事の流れから。朝礼で決めた担当の仕事は、その場所で片付けます。付いてきてください」'],
    ['青島', '「はいっ！ 執事さんの後ろ、ぴったり付いていきます！」']] },
  { goal: '青島に記録の整理を教える：倉庫の古い運送伝票を調べる', at: ['f1', 4.7, 2.0],
    say: [['執事', '「次は倉庫です。古い伝票の整理も仕事のうち。気になる物は、こうして手に取って確かめます」'],
      ['青島', '「伝票……！ 字がいっぱい……がんばります！」']] },
  { goal: '決まりを見せる：青島に見られながら、資料室に入ってみる', at: ['f1', 12, 4], post: ['f1', 19.2, 4, -Math.PI / 2],
    say: [['執事', '（何か月も働いた屋敷だ。だが、盗む者の目で見直すと、まるで違って見える）'],
      ['執事', '「最後に大事な決まりを。書斎や資料室、奥様やお嬢様のお部屋に用もなく入っているのを見られたら、旦那様に報告されます」'],
      ['執事', '「青島さん、そこから見ていてください。私が資料室に入ってみます」'],
      ['青島', '「はいっ、じーっと見てます！」']] },
];
function tutorStart(filled) {
  st.tut = { step: 0, lastPlan: 0 };
  say(['青島', '「今日からよろしくお願いします！ 掃除も料理も苦手ですけど、元気だけは負けません！」'],
    ['執事', '（赤羽と二人で回してきた屋敷も、今日からは三人。仕事の割り振りは、私の役目になった）'],
    filled.length && `（誰にも割り振られていなかった仕事は、${filled.map(m => PEOPLE[m].name).join('と')}に振り分けておいた）`, ...TUT[0].say);
}
function tutorNext() {
  st.tut.step++;
  const step = TUT[st.tut.step];
  if (step) return say(...step.say);
  setFlag(s, 'tutorial_done');
  st.tut = null;
  people.blue.key = undefined;   // 自分の持ち場へ戻る
  say(['青島', '「ぜんぶ覚えました！ ……たぶん！ じゃあ、わたしも持ち場に行ってきます！」'],
    ['執事', '（夕方になったら、使用人棟のベッドで休むとしよう）'],
    '（メニューの「手帳」で、手がかりや好感度をいつでも確認できる）');
}
function tutorEvent(kind, key, id) {
  if (!st.tut) return;
  const step = st.tut.step;
  if (step === 0 && kind === 'chore') afterMsg = tutorNext;
  if (step === 1 && kind === 'search' && key === 'storage') afterMsg = tutorNext;
}
// 青島は執事についてくる。最後の決まりの間は、資料室の入口で見ている
function tutorGuide(p, dt) {
  const step = TUT[st.tut.step];
  if (step && step.post) {
    const [area, x, z, yaw] = step.post;
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
// 最後の決まり：資料室に入ったところを青島に見せて、見られるとどうなるかを教える
function tutorCheck(key) {
  if (!st.tut || st.tut.step !== 2 || st.busy) return;
  if (key === 'archive' && people.blue.seeing) {
    const before = st.tut.susp ?? s.susp;
    afterMsg = () => { s.susp = before; tutorNext(); };
    say(['青島', '「あっ、見えました！ 執事さん、資料室に入ってます！」'],
      ['執事', '「そう、それです。人の視界に入ると、その人の視線が赤く光る。見たのが旦那様に報告する人なら、私でも疑いをかけられます」'],
      ['執事', '「担当の仕事でその部屋にいるときは大丈夫。……今のは練習ですから、黙っていてくださいね」'],
      ['青島', '「はいっ、ないしょです！」'],
      '（左上の「疑惑」が100になると、正体が露見してしまう。私室を調べるときは、人の視界に入らないように）');
  } else if (key !== 'archive') st.tut.susp = s.susp;
}
function ensureButlerChore() {
  const mine = s.today.chores.filter(c => c.assignee === 'butler' && !CHORES[c.id].optional);
  if (mine.length) return;
  const c = s.today.chores.filter(c => c.id !== 'cook' && !CHORES[c.id].butlerOnly && WORK[c.id][0] !== 'grounds').sort((a, b) => CHORES[a.id].hours - CHORES[b.id].hours)[0];
  if (!c) return;
  // メイドに振られていた仕事を付け替えるときは、メイドが済ませる前提で付いた「完了」の印も消す
  Object.assign(c, { assignee: 'butler', done: false, failed: false, overload: false, progress: 0 });
  buildPlan(s);
}

// ============================================================
// 決行の夜（12月24日クリスマス・イブ、深夜1時〜夜明け5時）
// ============================================================
function makeLadder(parent) {
  const g = new THREE.Group();
  for (const sx of [-0.25, 0.25]) box(g, 0.06, 4.6, 0.06, M.lightWood, sx, 0, 0);
  for (let i = 0; i < 14; i++) box(g, 0.5, 0.04, 0.04, M.lightWood, 0, 0.25 + i * 0.32, 0);
  parent.add(g);
  return g;
}
const carried = { ladder: null, painting: null, crate: null };
const VAN = [HOUSE.x + 47.5, HOUSE.z - 3.6];   // 25日の朝、仕出し屋のバンが停まる所（勝手口の外の小道）
let van = null;
let wallLadder = null;
function setupNightProps() {
  if (!carried.ladder) {
    carried.ladder = makeLadder(player.g);
    carried.ladder.rotation.set(0, 0, Math.PI / 2); carried.ladder.position.set(1.6, 1.1, -0.25); carried.ladder.scale.set(1, 0.7, 1);
    carried.painting = new THREE.Group(); player.g.add(carried.painting);
    carried.crate = new THREE.Group(); player.g.add(carried.crate);
    box(carried.crate, 0.62, 0.42, 0.46, M.lightWood, 0, 0.72, 0.36);
    box(carried.painting, 1.0, 0.75, 0.06, mat('#ffffff', { map: TEX.painting }), 0, 0.7, 0.32);
    wallLadder = makeLadder(areas.grounds.group);
    wallLadder.position.set(HOUSE.x + 24, 0, HOUSE.z + 18.45); wallLadder.rotation.x = -0.18;
  }
  carried.ladder.visible = false; carried.painting.visible = false; carried.crate.visible = false; wallLadder.visible = false;
  if (!van) {
    van = new THREE.Group(); areas.grounds.group.add(van);
    box(van, 4.2, 1.9, 1.9, M.white, VAN[0] + 1.2, 0.35, VAN[1] - 1.2);
    for (const [dx, dz] of [[-0.3, -0.9], [-0.3, 0.9], [2.7, -0.9], [2.7, 0.9]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12), M.black); w.rotation.x = Math.PI / 2;
      w.position.set(VAN[0] - 0.3 + dx, 0.35, VAN[1] - 1.2 + dz); van.add(w);
    }
  }
  van.visible = false;
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
  if (N.morning) return morningThings(N, list, at);
  if (cur.id === 'f1') list.push({ name: '資料室への扉', at: at(5.4, 4), label: '調べる', night: () => say('内側から鍵が掛かっている。夜は、倉庫から屋敷の奥へは入れない。') });
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
  if (cur.id === 'grounds' && N.ladderUp && N.carry === 'painting') list.push({ name: '梯子', at: at(...below), label: '梯子を登る', night: () => say('片手で絵を抱えて梯子を降りれば、額縁が手すりに当たる。……傷ひとつ、つけるわけにはいかない。') });
  // 絵を抱えたまま梯子は使えない（額縁が手すりに当たり、キャンバスに傷がつく）
  if (cur.id === 'f2' && N.ladderUp) list.push({ name: '梯子', at: at(24, 17.4), label: '梯子で降りる', night: () => N.carry === 'painting' ? say('片手で絵を抱えて梯子を降りれば、額縁が手すりに当たる。……傷ひとつ、つけるわけにはいかない。')
    : travel({ area: 'grounds', x: below[0], z: below[1] + 0.6 }) });
  if (cur.id === 'f2' && people.daughter.sleep === BEDS.daughter && !N.tucked && !N.morning) list.push({ name: 'お嬢様', at: at(39, 16.4), label: '布団を掛け直す', night: () => {
    N.tucked = true; s.flags.tucked = true;
    say('はだけた布団を、そっと肩まで引き上げた。', ['執事', '（……ごめん）']);
  } });
  // 地下の非常口（昼に見つけておく）：重い閂を外して、塀の外の水路へ。時間がかかる
  if (cur.id === 'basement' && N.route === 'night' && N.carry === 'painting' && s.flags.b_exit) list.push({ name: '水路への鉄の扉', at: at(22, 2.6), label: '閂を外して外へ', night: () => {
    N.min += 20;
    escape('tunnel');
  } });
  if (cur.id === 'f2' && s.flags.hidden_open && !N.taken) list.push({ name: '月下の庭', at: at(8, 3.2), label: '絵を外す', night: takePainting });
  if (cur.id === 'f2' && N.route === 'swap' && N.carry === 'painting' && !N.morning) list.push({ name: 'クローゼット', at: at(41.3, 14), label: '本物を隠す', night: () => {
    N.carry = null;
    caption('すり替え完了', `深夜 ${nightClock()}`);
    afterMsg = startCarry;
    say('お嬢様の寝息を確かめ、クローゼットの奥に本物をそっと隠した。', '……あとは朝、運び屋が偽物を運び出す騒ぎにまぎれて、本物を持ち出すだけだ。');
  } });
  if (cur.id === 'grounds' && N.route === 'night' && N.carry === 'painting') list.push({ name: '正門', at: at(38, 56.6), label: '調べる', night: () =>
    say('正門には閂が下ろされ、巡回員が行き来している。……怪盗が正面から出ていくわけにはいかない。', s.flags.back_gate ? '（バラ園の奥の、庭師の通用口へ）' : '（裏庭のどこかに、ほかの出口は……）') });
  return list;
}
// 25日の朝：クローゼットから本物を取り出し、洗濯かごに隠して、使用人棟の自室まで運ぶ
function morningThings(N, list, at) {
  if (cur.id === 'f2' && !N.carry) list.push({ name: 'クローゼット', at: at(41.3, 14), label: '本物を取り出す', night: () => {
    N.carry = 'painting';
    say(s.flags.d_close ? ['お嬢様', '「……持っていって。私は、何も見てない」'] : 'お嬢様は朝食に下りている。部屋には誰もいない。',
      '洗濯かごの底に本物を寝かせ、上からシーツをかぶせた。……見られても、ただの洗濯物に見えるはずだ。旦那様と警備員を除けば。');
  } });
  // 雫の知人の仕出し屋が、勝手口の外の小道に白いバンを停めている。空の料理箱に紛れ込ませれば、そのまま屋敷の外へ
  if (cur.id === 'grounds' && N.carry === 'painting' && s.flags.caterer_friend) list.push({ name: '仕出し屋の白いバン', at: at(...VAN), label: '料理箱に紛れ込ませる', night: () => {
    N.carry = null; N.exit = 'van';
    recall(s, 'caterer');
    caption('持ち出し完了', `朝 ${7 + Math.floor(N.min / 60)}:${String(Math.floor(N.min) % 60).padStart(2, '0')}`);
    afterMsg = () => endNight('swap');
    say(['仕出し屋', '「おはようございます、空き箱の回収です。……一番下の箱、空けておきました」'],
      '洗濯かごから本物を移し、空の料理箱の底に寝かせた。上に、汚れたテーブルクロスを重ねる。',
      '白いバンは、偽物を積んだトラックより一足先に、裏の小道を出ていった。……誰も、何も気づいていない。');
  } });
  if (cur.id === 'cottage' && N.carry === 'painting') list.push({ name: '執事の部屋のベッド', at: at(2.4, 12.5), label: '本物を隠す', night: () => {
    N.carry = null;
    caption('持ち出し完了', `朝 ${7 + Math.floor(N.min / 60)}:${String(Math.floor(N.min) % 60).padStart(2, '0')}`);
    afterMsg = () => endNight('swap');
    say('ベッドの下のトランクに、本物を収めて鍵を掛けた。', '窓の外で、偽物を積んだトラックが正門を出ていく。……誰も、何も気づいていない。');
  } });
  return list;
}
// すり替えた夜が明けて、25日の朝。運び屋が偽物を梱包している間に、本物を運び出す
function startCarry() {
  const N = st.night;
  fade('夜が明けた――12月25日の朝', () => {
    Object.assign(N, { morning: true, nightMin: N.min, min: 0, carry: null, dawn: false, caught: false, ladderUp: false });
    if (van) van.visible = !!s.flags.caterer_friend;
    setLights(false);
    dressPlayer(false);
    Object.assign(areas.f1.nightDoor.box, { minX: -999, maxX: -998, minZ: -999, maxZ: -998 });
    areas.f1.nightDoor.g.visible = false;
    carried.ladder.visible = false; wallLadder.visible = false;
    for (const p of Object.values(people)) { wake(p); p.nightRole = null; p.area = null; p.route = null; }
    // 旦那様は1階の廊下で梱包を見張り、警備員は2階の書斎から木箱を運び出す（裏階段の近くで引き返す）
    Object.assign(people.father, { area: 'f1', x: 24, z: 6, range: 7, wait: 0, look: 0, nightRole: { i: 0, path: [[24, 6, 2.5], [43, 6, 2], [34, 6, 1]] } });
    Object.assign(people.guard2, { area: 'f2', x: 14, z: 9.5, range: 7, wait: 0, look: 0, nightRole: { i: 0, path: [[12, 9.5, 2.5], [42.5, 9.5, 1.5], [30, 9.5, 1]] } });
    const inRoom = !!s.flags.eve_go_daughter;
    if (inRoom) enter('f2', 37.6, 15.6); else enter('cottage', 2.4, 12.5);
    st.busy = false;
    say(inRoom && 'お嬢様の部屋で目を覚ました。隣の枕は、もう冷たい。お嬢様は朝食に下りたらしい。',
      inRoom && ['執事', '（……クローゼットは、すぐそこだ）'],
      '12月25日、朝7時。正門に、オークション会社のトラックが着いた。',
      '旦那様は1階の廊下で梱包を見張り、警備員が2階の書斎から木箱を運び出している。',
      s.flags.caterer_friend ? '（運び屋が発つのは10時。それまでに、お嬢様の部屋のクローゼットから本物を取り出し、勝手口の外に停まった仕出し屋のバンまで運ぶ）'
        : '（運び屋が発つのは10時。それまでに、お嬢様の部屋のクローゼットから本物を取り出し、この部屋まで運ぶ）');
    setTimeout(() => caption('持ち出し', '12月25日　朝 7:00'), 300);
    recall(s, 'courier');
  }, 1600);
}
function takePainting() {
  const N = st.night;
  if (N.carry) return say('両手がふさがっている。梯子はどこかに置いてこよう。');
  if (!N.alarmOff) { music.sfx('alarm'); afterMsg = () => endNight('caught'); return say('額縁に手をかけた瞬間、甲高い警報が屋敷中に鳴り響いた！'); }
  N.taken = true; N.carry = 'painting';
  areas.f2.secret.objs[0].visible = false;
  recall(s, 'stamp');
  caption('奪取', `深夜 ${nightClock()}　「月下の庭」`);
  if (N.route === 'swap') return say('青島の模写を額に収め、本物を布で包む。見た目には、何ひとつ変わらない。', '本物をお嬢様の部屋のクローゼットに隠そう。');
  // 空になった額縁に、カードを残すか
  st.busy = true;
  hooks.askChoice('月明かりの下、額縁が静かに外れた。……空になった壁に、何か残していくか？', [
    { t: '一枚のカードを残す――「月は、返していただきました」', run: () => '', card: true },
    { t: '何も残さず、影のように去る', run: () => '' },
  ], (msg, o) => {
    st.busy = false;
    N.card = !!o.card;
    say(o.card ? '胸ポケットから白いカードを取り出し、空の額縁の前にそっと立て掛けた。' : '壁に残ったのは、額縁の形に褪せなかった壁紙だけだ。',
      '「月下の庭」を布で包んだ。……梯子も井戸も、絵を傷める。屋敷の中を歩いて1階へ降り、勝手口から庭へ出よう。');
  });
}
const nightClock = () => { const m = Math.floor(st.night.min); return `${1 + Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
// 屋敷を抜け出す（一夜で持ち去るルート）。絵を傷めずに出られるのは、裏庭の通用口だけ
function escape(how) {
  const N = st.night;
  N.exit = how;
  caption('脱出', `深夜 ${nightClock()}`);
  afterMsg = () => endNight('night');
  say(how === 'tunnel' ? '錆びた閂を、少しずつ、音を殺して外す。……20分かかった。鉄の扉を押し開けると、塀の外の水路沿いの小道に出た。屋敷の誰の目にも触れずに。'
      : 'バラ園の奥の木戸の閂を、音を立てずに外した。裏の小道に、人の気配はない。', '腕の中の額縁が、月明かりを受けて鈍く光った。');
}
function nightAct(t) {
  const N = st.night;
  // 裏庭の通用口から抜け出す
  if (t.spot && t.spot[1] === 'backgate') return N.route === 'night' && N.carry === 'painting' ? escape('back')
    : say('裏の小道へ出られる、庭師の木戸だ。……絵を手に入れたら、ここから抜けられる。');
  if (t.exit) {
    // 玄関の扉には、絵とは別の警報が付いている（白井が落としたのは絵の警報だけ）
    if (/玄関/.test(t.name) && !N.morning) return say('玄関の扉には、絵とは別の警報が付いている。白井が落としたのは、絵の警報だけだ。……開ければ鳴る。');
    if (N.carry === 'ladder' && t.exit.area !== 'grounds' && cur.id === 'grounds') return say('梯子を担いだままでは、屋敷の中を通れない。');
    if (N.carry === 'painting' && ((cur.id === 'grounds' && t.exit.area === 'basement') || (cur.id === 'basement' && t.exit.area === 'grounds'))) return say('縄梯子と狭い横穴では、額縁が壁に擦れる。……キャンバスに傷がつく。ここは通れない。');
    return travel(t.exit);
  }
  if (t.spot && t.spot[0] === 'kback') {
    if (N.alarmOff) return say('警報の系統のランプが消えている。白井は約束を守ってくれた。');
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
  if (t.special === 'hatch') return s.flags.b_key ? travel({ area: 'basement', x: 1.0, z: 4.0 }) : say('床の扉には鍵が掛かっている。');
  if (t.say) return say(...t.say.map(l => typeof l === 'function' ? l(s) : l));
  say('今は調べている場合ではない。');
}
function nightGoal() {
  const N = st.night;
  if (N.morning) return N.carry === 'painting' ? (s.flags.caterer_friend ? '本物を、勝手口の外の仕出し屋のバンへ運ぶ（旦那様と警備員に見られないように）' : '本物を、使用人棟の執事の部屋まで運ぶ（旦那様と警備員に見られないように）')
    : 'お嬢様の部屋のクローゼットから、本物を取り出す（運び屋が発つ10時まで）。1階の廊下に旦那様、2階の廊下に木箱を運ぶ警備員';
  if (N.carry === 'painting') return N.route === 'swap' ? '本物を、お嬢様の部屋のクローゼットに隠す'
    : `絵を抱えて、屋敷の中を1階へ降り、${[s.flags.back_gate && '勝手口から庭へ出てバラ園の奥の通用口', s.flags.b_exit && s.flags.b_key && '資料室の床の扉から地下へ降りて搬入路の非常口'].filter(Boolean).join('か、') || '勝手口から庭へ出て、裏庭のどこかの出口'}から抜け出す（梯子と井戸は絵を傷める。玄関には警報${isAlly(s, 'red') ? '' : '。勝手口の前の赤羽は、1時半ごろに休む'}）`;
  if (N.carry === 'ladder') return '前庭に回り、バルコニーの下に梯子を掛ける';
  if (cur.id === 'f2') return '書斎の隠し部屋へ。絵に触れる前に、警報が切れているか確かめたか？';
  const hall = people.black.sleep ? '大広間は眠れない旦那様が歩き回っている' : '大広間は雫（見逃してくれる）';
  return `2階の書斎へ。夜は倉庫から奥への扉に鍵。勝手口の先には赤羽（1時半に休む）、${hall}、2階の廊下には巡回員`;
}
function endNight(id) {
  // 盗み出せたときは、手際（かかった時間・ニアミス・カード）を残してエンディングで見せる
  const N = st.night;
  if (N && (id === 'night' || id === 'swap')) s.heist = { min: Math.round(N.min + (N.nightMin || 0)), near: N.near || 0, card: !!N.card, route: id, exit: N.exit || null };
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
    if (N.morning && N.min >= 180 && !N.dawn) {
      N.dawn = true;
      afterMsg = () => endNight('caught25');
      say('10時。トラックが正門を出ていった。……旦那様が、屋敷じゅうの点検を始めた。');
    } else if (!N.morning && N.min >= 30 && !N.redAsleep) {
      // 1時半、キッチン裏の赤羽は仕込みを終えて休む（勝手口の前が空く）
      N.redAsleep = true;
      Object.assign(people.red, { area: null, nightRole: null, seeing: false });
      if (cur.id === 'f1') hooks.toast('キッチン裏の明かりが消えた。赤羽が、自室へ戻っていった。');
    } else if (!N.morning && N.min >= 240 && !N.dawn) {
      N.dawn = true;
      afterMsg = () => endNight('caught');
      say('東の空が白み始めた。屋敷の明かりが一つ、また一つと灯っていく……。');
    }
  }
  // 25日の朝は、本物を運んでいるところを旦那様か警備員に見られたときだけ見つかる（ふだんの仕事なら怪しまれない）
  const seers = Object.values(people).filter(p => p.area === cur.id && p.seeing && !isAlly(s, p.id) && (!N.morning || N.carry === 'painting'));
  seenTime = seers.length ? seenTime + dt : 0;
  if (seenTime > 0.3 && !st.busy && !N.caught) {
    N.caught = true;
    music.sfx('alarm');
    const p = seers[0];
    if (N.morning) {
      afterMsg = () => endNight('caught25');
      say([p.name, p.id === 'father' ? '「……執事。その洗濯かごの中身は何だ」' : '「ちょっと。そのかご、中を見せてもらえますか」'], 'シーツの端から、額縁の角が覗いていた。');
    } else {
      afterMsg = () => endNight('caught');
      say([p.name, /^guard/.test(p.id) ? '「誰だ！ そこで何をしている！」' : p.id === 'father' ? '「……執事か。こんな夜中に、どこへ行くつもりだ」' : '「……誰？ ……執事さん？」'], p.id === 'father' ? 'ブランデーのグラスを置いた旦那様の目が、まっすぐ執事を射抜いた。' : '懐中電灯の光が、執事の顔を照らした。');
    }
  }
  // ニアミス：見張りの視界のすぐ外を抜けた（華麗さの採点に使う）
  for (const p of Object.values(people)) {
    if (p.area !== cur.id || p.seeing || isAlly(s, p.id) || !p.nightRole) continue;
    const dx = player.x - p.x, dz = player.z - p.z, d = Math.hypot(dx, dz);
    let diff = Math.atan2(dx, dz) - p.g.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (d < p.range + 1.2 && Math.abs(diff) < VIEW_FOV / 2 + 0.35 && performance.now() - (p.nearAt || 0) > 2500) {
      p.nearAt = performance.now(); N.near = (N.near || 0) + 1;
    }
  }
}
// 見せ場の大きな文字（潜入・奪取・脱出）
function caption(text, sub = '') {
  let c = document.getElementById('caption3d');
  if (!c) { c = document.createElement('div'); c.id = 'caption3d'; root.append(c); }
  c.innerHTML = '';
  const b = document.createElement('b'); b.textContent = text; c.append(b);
  if (sub) { const sm = document.createElement('small'); sm.textContent = sub; c.append(sm); }
  c.classList.remove('on'); void c.offsetWidth; c.classList.add('on');
}
// 外の巡回員は、2階の巡回員と同じ VRM を使う（同時に同じエリアにはいないので、いるほうに付け替える）
function shareGuard() {
  const a = people.guard, b = people.guard2, vrm = a.vrm || b.vrm, drive = a.drive || b.drive;
  if (!vrm) return;
  const here = [a, b].find(p => p.area === cur.id);
  if (!here || here.vrm === vrm) return;
  const other = here === a ? b : a;
  other.vrm = null; other.drive = null;
  here.g.add(vrm.scene); here.vrm = vrm; here.drive = drive;
}

// ---- 入力 ----
const keys = new Set();
addEventListener('keydown', e => {
  if (!running) return;
  keys.add(e.key.toLowerCase());
  if ((e.key === ' ' || e.key.toLowerCase() === 'e' || e.key === 'Enter') && !e.repeat && !document.querySelector('.modal-back')) { e.preventDefault(); act(); }
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
// 画面のどこでも：触れた所を起点になぞると、その向きへ歩く（離すと止まる）
// 軽く触れて離すと「決定」（調べる・話す・仕事・移動）。会話中は「次へ」
const stick = { x: 0, y: 0, id: null, x0: 0, y0: 0, moved: false };
const stickEl = $('stick'), knob = stickEl.querySelector('i'), view = $('view');
const STICK_R = 55, TAP_MOVE = 12;
view.addEventListener('pointerdown', e => {
  // 新しく触れた指で操作を始め直す（前の指の「離した」を取りこぼしても、操作が固まらないように）
  knob.style.transform = ''; stickEl.classList.remove('on');
  Object.assign(stick, { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, x: 0, y: 0 });
  try { view.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
});
view.addEventListener('pointermove', e => {
  if (e.pointerId !== stick.id) return;
  let dx = e.clientX - stick.x0, dy = e.clientY - stick.y0;
  if (!stick.moved && Math.hypot(dx, dy) < TAP_MOVE) return;
  if (!stick.moved) {
    stick.moved = true;
    const r = root.getBoundingClientRect();
    stickEl.style.left = `${stick.x0 - r.left - STICK_R}px`; stickEl.style.top = `${stick.y0 - r.top - STICK_R}px`;
    stickEl.classList.add('on');
  }
  const l = Math.hypot(dx, dy) / STICK_R;
  if (l > 1) { dx /= l; dy /= l; }
  stick.x = dx / STICK_R; stick.y = dy / STICK_R;
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
});
const endStick = e => {
  if (e.pointerId !== stick.id) return;
  const tap = !stick.moved;   // 指を動かさずに離したら「決定」（長めに押しても同じ）
  stick.id = null; stick.x = stick.y = 0; knob.style.transform = '';
  stickEl.classList.remove('on');
  if (tap && e.type === 'pointerup') act();
};
view.addEventListener('pointerup', endStick);
view.addEventListener('pointercancel', endStick);
view.addEventListener('lostpointercapture', endStick);
$('nb3d').addEventListener('click', () => { if (!st.busy) hooks.notebook(); });
$('end3d').addEventListener('click', () => { if (!st.busy && st.mode === 'day' && confirm(endAsk('今日の業務を終えますか？'))) finish(); });
// 業務を終えるときに痕跡が残っていれば、一度引き留める
const endAsk = q => { if (st.dayCarry === 'crate') return `木箱を抱えたままです。食料庫に置いてから終えましょう。\n${q}`; if (st.dayCarry) return `本物の絵を抱えたままです。お嬢様の部屋のクローゼットに隠してから終えましょう。\n${q}`; const tr = DL.traces(s); return tr.length ? `まだ元に戻していない物があります（${tr.map(x => DL.TRACE_NAME[x]).join('、')}）。\nこのままだと、気づかれて疑われるかもしれません。\n${q}` : q; };

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
  for (const p of Object.values(people)) {
    if (p.area !== cur.id) continue;
    mm.fillStyle = (PEOPLE[p.id] || PEOPLE.guard).color; mm.beginPath(); mm.arc(px(p.x), pz(p.z), 4, 0, 7); mm.fill();
  }
  for (const t of [...choreThings(), ...tutorTargets()]) {
    const [x, z] = t.at();
    mm.fillStyle = '#ffffff'; mm.fillRect(px(x) - 6, pz(z) - 6, 12, 12);
    mm.fillStyle = t.tut ? '#e3c06f' : '#3fc06a'; mm.fillRect(px(x) - 4, pz(z) - 4, 8, 8);
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
  if (st.mode === 'ball') {
    const m = Math.floor(st.ball.min), h = BALL.BALL_START + Math.floor(m / 60);
    clock = `12月24日 イブ　仮面舞踏会　${h % 24}:${String(m % 60).padStart(2, '0')}`;
    text = ballGoal();
  } else if (st.mode === 'night') {
    const m = Math.floor(st.night.min), h = (st.night.morning ? 7 : 1) + Math.floor(m / 60);
    clock = st.night.morning ? `12月25日　朝 ${h}:${String(m % 60).padStart(2, '0')}` : `12月24日 イブ　深夜 ${h}:${String(m % 60).padStart(2, '0')}`;
    text = '目的：' + nightGoal();
  } else {
    clock = `${dateLabel(s)}　${st.mode === 'morning' ? '7:30' : `${t.hour}:${String(Math.floor(t.min || 0)).padStart(2, '0')}`}${eveCountdown(s) ? `　${eveCountdown(s)}` : ''}`;
    if (st.wine) clock += `　旦那様が降りてくる！ あと${Math.ceil(st.wine.left)}秒`;
    else if (cur.id === 'basement' && fatherHome(s) && t.hour === DL.WINE_HOUR - 1 && !t.wineDone) clock += '　（17時ごろ旦那様が降りてくる）';
    const todo = t.chores.filter(c => c.assignee === 'butler').map(c => `${c.done ? '✓' : '・'}${CHORES[c.id].name}${withPerson(c.id) && !c.done ? `（任意・${PEOPLE[withPerson(c.id)].name}に話しかける）` : CHORES[c.id].after && !c.done && t.hour < CHORES[c.id].after ? `（任意・${CHORES[c.id].after}時から）` : CHORES[c.id].optional ? '（任意）' : ''}`);
    if (delivering()) todo.push(`・${st.dayCarry === 'crate' ? '木箱をキッチンの食料庫へ' : '勝手口の外のバンから木箱を運ぶ'}（任意・${t.crates || 0}/${EV.CRATES}）`);
    text = st.mode === 'morning' ? '共用室の席に着いて、朝礼を始めよう'
      : st.tut && TUT[st.tut.step] ? `【青島に教える ${st.tut.step + 1}/3】${typeof TUT[st.tut.step].goal === 'function' ? TUT[st.tut.step].goal() : TUT[st.tut.step].goal}`
      : todo.length ? todo.join('　') : '執事の担当なし';
    // 痕跡が残っていれば、目立つように知らせる
    const tr = st.mode === 'day' ? DL.traces(s) : [];
    if (tr.length) text += `　⚠ 痕跡：${tr.map(x => DL.TRACE_NAME[x]).join('、')}`;
  }
  $('clock3d').textContent = clock;
  // まだ来ていないメイドの部屋は「空き部屋」と表示する
  const roomName = room ? (room.owner && !maidAvailable(s, room.owner) ? '空き部屋' : room.name) : '';
  $('place3d').textContent = `${AREA_INFO[cur.id].name}　${roomName}`;
  $('trust3d').style.width = `${s.trust}%`;
  $('susp3d').style.width = `${s.susp}%`;
  $('end3d').classList.toggle('hidden', st.mode !== 'day');
  if ($('todo3d').textContent !== text) $('todo3d').textContent = text;
}

// ---- 1日の流れ ----
function finish() {
  s.today.traceNotes = DL.settleTraces(s);
  // 本物を抱えたまま18時になったら、慌ててクローゼットへ押し込む（見られていたかもしれない）
  if (st.dayCarry === 'crate') st.dayCarry = null;
  if (st.dayCarry) { st.dayCarry = null; setFlag(s, 'swap_hidden'); s.susp = clamp(s.susp + 15); s.today.traceNotes.push('18時の鐘に追われ、本物をクローゼットへ押し込んだ。……誰かに見られていなければいいが（疑惑+15）'); }
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

const camTarget = new THREE.Vector3();
const FWD = new THREE.Vector2(-1, -1).normalize(), RIGHT = new THREE.Vector2(1, -1).normalize();
let last = 0, ending = false;

function tick(now) {
  if (!running) return;
  const rawDt = Math.min(0.5, (now - last) / 1000 || 0);   // 実時間（描画が重い端末でも、秒数を守る）
  const dt = Math.min(0.05, rawDt);
  last = now;
  const night = st.mode === 'night', ball = st.mode === 'ball';

  // 時間が進む（メッセージや操作待ちの間は止まる）
  if (st.mode === 'day' && !st.busy && !document.querySelector('.modal-back')) {
    s.today.min = (s.today.min || 0) + dt * 60 / SEC_PER_HOUR;
    if (s.today.min >= 60) { s.today.min -= 60; s.today.hour++; }
  }
  if (st.mode === 'day' && DL.wineDue(s) && !st.wine) {
    if (cur.id === 'basement') { st.wine = { left: 8 }; hooks.toast('石段の上で、床の扉が開く音……旦那様だ！ 奥に隠れろ！'); }
    else s.today.wineDone = true;
  }
  if (st.wine && !st.busy) {
    st.wine.left -= rawDt;
    if (st.wine.left <= 0) {
      const room = roomAt(player.x, player.z);
      const where = cur.id !== 'basement' ? (cur.id === 'f1' ? 'up' : 'out') : player.x >= 16 ? 'tunnel' : room && room.key === 'vault' ? 'vault' : 'cellar';
      st.wine = null;
      say(DL.fatherWine(s, where === 'up' ? 'cellar' : where));
      afterMsg = () => fatal();
    }
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
  // 足音（歩いている間、0.36秒ごと。地下と屋外は少し間をあける）
  st.stepT = moving ? (st.stepT || 0) - rawDt : 0;
  if (moving && st.stepT <= 0) { music.sfx('step'); st.stepT = AREA_INFO[cur.id].outdoor ? 0.42 : 0.36; }
  if (moving) {
    const speed = night && st.night.carry === 'ladder' ? 3.0 : night && st.night.carry === 'painting' ? 4.0 : WALK_SPEED;
    const sp = speed * Math.min(1, il) / il;
    const dx = (FWD.x * iy + RIGHT.x * ix) * sp * dt, dz = (FWD.y * iy + RIGHT.y * ix) * sp * dt;
    moveBy(player, dx, dz, player.r);
    player.g.rotation.y = Math.atan2(dx, dz);
  }
  if (player.blob) player.blob.visible = !st.lying;   // ベッドに寝ている間は、足元の影を出さない
  if (st.lying) { player.g.position.set(player.x, st.lyingY ?? 0.62, player.z); player.g.rotation.set(-Math.PI / 2, 0, 0); }
  else if (st.dance) danceTick(rawDt);
  else { player.g.position.set(player.x, 0, player.z); animate(player, moving, dt); }
  if (carried.tray) {
    carried.tray.visible = ball && st.ball.glasses > 0;
    carried.tray.children.forEach((c, i) => { if (c.userData.glass != null) c.visible = c.userData.glass < (ball ? st.ball.glasses : 0); });
  }
  if (night) {
    carried.ladder.visible = st.night.carry === 'ladder';
    carried.painting.visible = st.night.carry === 'painting';
    wallLadder.visible = !!st.night.ladderUp;
  }

  // 今いる部屋
  const room = roomAt(player.x, player.z);
  const key = room && room.key || null;
  if (!night && !ball) {
    s.today.loc = key || 'elsewhere';
    if (key !== st.lastKey) {
      const owner = OWNERS[key];
      if (st.lastKey !== undefined && owner && whereIs(s, owner, s.today.hour) === key && !choreHere(key) && !st.busy && !st.tut) say(DL.intrude(s, owner));
      st.lastKey = key;
    }
  }

  updateFrustum();
  for (const p of Object.values(people)) updatePerson(p, dt);
  bobMarkers(dt);
  st.placeNow = false;
  const inPrivate = !night && !ball && !!(room && room.private) && !choreHere(key);
  for (const p of Object.values(people)) p.coneMat.color.set(isAlly(s, p.id) ? '#8ad0a0' : (night || inPrivate) && p.seeing ? '#ff5a4a' : night ? '#fff2b0' : '#ffe08a');
  updateMasks(dt);
  syncHallArt();
  if (night) nightTick(dt);
  else if (ball) ballTick(dt);
  else {
    if (carried.crate) carried.crate.visible = st.dayCarry === 'crate';
    if (van && !st.night) van.visible = delivering();
    if (st.dayCarry === 'painting' && !st.busy) {
      carried.painting && (carried.painting.visible = true);
      for (const id of watchers()) if (!st.carrySeen[id]) { st.carrySeen[id] = true; s.susp = clamp(s.susp + 20); hooks.toast(`${people[id].name}に、布で包んだ大きな荷物を見られた（疑惑 +20）`); }
    } else if (carried.painting && st.mode === 'day') carried.painting.visible = false;
    if (!st.busy && watchers().length && inPrivate) {
      s.susp = clamp(s.susp + 8 * dt);
      // 白井に私室にいるところを見られたら、その部屋につき一度だけ報告の種になる
      if (st.wSaw !== key && watchers().includes('white')) { st.wSaw = key; const n = whiteSaw(s, 10); if (n) hooks.toast(n); }
    }
    if (!inPrivate) st.wSaw = null;
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

  // 軽くタップすると、いちばん近い対象（印の付いた物・人・出入口）に決定する
  target = st.busy ? null : findTarget();
  const verb = t => t.night ? t.label : t.exit ? '移動' : t.person ? '話す' : t.chore !== undefined ? '仕事' : t.meeting ? '朝礼' : t.rest ? '休む' : '調べる';
  const labels = [];
  for (const p of Object.values(people)) {
    if (p.area !== cur.id) continue;
    const alert = p.seeing && (inPrivate || night) && !isAlly(s, p.id);
    labels.push({ x: p.x, y: p.sleep ? 0.9 : 2.1, z: p.z, text: alert ? '！' : p.name, cls: alert ? 'alert' : 'name' });
  }
  for (const t of choreThings()) { const [x, z] = t.at(); labels.push({ x, y: 0.6, z, text: `仕事：${t.name}`, cls: 'work' }); }
  if (ball) ballLabels(labels);
  for (const t of tutorTargets()) { const [x, z] = t.at(); labels.push({ x, y: 0.6, z, text: 'ここ', cls: 'work' }); }
  if (target) {
    const [x, z] = target.at();
    labels.push({ x, z, y: target.person ? 2.5 : 1.6, text: `▶ ${target.person ? '話す' : target.night || target.exit || target.meeting || target.rest ? target.label : verb(target)}`, cls: target.exit ? 'exit' : '' });
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
    for (const id of ['grounds', 'cottage', 'f1', 'f2', 'basement']) getArea(id);
    makePeople();
  }
  syncCast();
  dressPlayer(false);
  if (portrait && portrait.releaseAlt) portrait.releaseAlt();
  if (!portrait && !TEST) import('./portrait.js').then(m => { portrait = m; }).catch(() => {});
  for (const p of Object.values(people)) { wake(p); p.key = undefined; p.route = null; p.nightRole = null; p.range = VIEW_RANGE; }
  syncSecret();
  syncDeco();
  syncUnder();
  Object.assign(areas.f1.nightDoor.box, { minX: -999, maxX: -998, minZ: -999, maxZ: -998 });
  areas.f1.nightDoor.g.visible = false;
  ending = false; st.busy = false; st.shelfAnim = 0; st.tut = null; st.tutPending = false; st.night = null; st.wine = null; st.dayCarry = null; st.carrySeen = {}; msgQueue = []; afterMsg = null;
  setupNightProps();
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
  // 初日（11月1日）は、新しいメイド（青島）が来る日。赤羽が起こしに来る
  const firstDay = s.chapter === 0 && s.week === 0 && s.day === 0 && !s.flags.tutorial_done;
  st.tutPending = firstDay;
  if (firstDay) {
    say(['執事', `（${dateLabel(s)}、朝7時30分。……さて、今日も完璧な執事を演じるとしよう）`],
      ['赤羽', '「……執事さん、起きてる？ 新しい子、今日から。もう共用室で待ってる。……緊張してるみたい」'],
      ['執事', '（赤羽さんが春から産休に入るのに備えて、旦那様が雇ったメイドだ。今日から、屋敷の仕事の割り振りは私が任される。……都合がいい。誰をどこに置くか、私が決められる）'],
      '身支度を整えたら、共用室の席に着いて朝礼を始めよう。');
  } else {
    say(['執事', `（${dateLabel(s)}、朝7時30分。……さて、今日も完璧な執事を演じるとしよう）`],
      '身支度を整えたら、共用室の席に着いて朝礼を始めよう。');
  }
  // 操作の案内（一度だけ）
  if (!s.flags.hint_touch) {
    s.flags.hint_touch = true;
    msgQueue.push('【操作】画面のどこでも、指を置いてなぞると歩く。軽くタップすると、▶の付いた物を調べる・人と話す・会話を進める。');
  }
  run();
}

// 本編から呼ばれる：決行の夜。route は 'night'（一夜で持ち去る）か 'swap'（贋作とすり替える）
export function startNight(state, route, h) {
  prepare(state, h);
  st.mode = 'night';
  dressPlayer(true);
  st.night = { route, min: 0, carry: null, ladderTaken: false, ladderUp: false, taken: false, alarmOff: !!s.flags.white_ally };
  setLights(true);
  setupNightProps();
  refreshMarkers();
  // ルート2はイブの昼にすり替えてあるので、25日の朝から始める
  if (route === 'swap') { enter('cottage', 2.4, 12.5); run(); return startCarry(); }
  Object.assign(areas.f1.nightDoor.box, { minX: 5.86, maxX: 6.14, minZ: 3, maxZ: 5 });
  areas.f1.nightDoor.g.visible = true;
  // 夜の見張り：黒メイド（雫）は大広間と玄関ホールを見回るが、兄を見逃す。赤羽はキッチン裏で仕込み
  // 2階の廊下は警備会社の巡回員が往復し、西の端（物置の前）で立ち止まって窓の外を眺める
  const black = people.black, red = people.red, guard = people.guard;
  // 白井の報告でお父様が巡回を厳しくさせたとき（guard_strict）は、西の端で立ち止まる時間が短く、よく見ている
  // 2階の巡回員は、西の端で立ち止まって窓の外を眺める（雫の情報）。ときどき途中で引き返す
  // 外の巡回員は、屋敷の前庭から正門の前、西の芝生（古井戸と通用口の手前）までを回る
  const strict = !!s.flags.guard_strict;
  Object.assign(guard, { area: 'f2', x: 30, z: 9.5, range: strict ? 8 : 7, wait: 0, look: 0,
    nightRole: { i: 0, path: [[3.2, 9.5, strict ? 2.5 : 6], [24, 9.5, 1.2], [14, 9.5], [40.5, 9.5, 1.5], [30, 9.5, 1.2]] } });
  Object.assign(people.guard2, { area: 'grounds', x: 24, z: 39, range: 7.5, wait: 0, look: 0,
    nightRole: { i: 0, path: [[24, 39, 2], [38, 39.6], [38, 39, 2.5], [52, 39, 2.5], [52, 52], [42, 53, 2], [24, 52], [8, 50], [7, 41, 3], [16, 39]] } });
  Object.assign(black, { area: 'f1', x: 24, z: 10.5, range: 7.5, wait: 0, look: 0,
    nightRole: { i: 0, path: [[24, 10.5, 2], [23, 6.5], [20.5, 4.5, 2.5], [27.5, 4.5, 2], [27.5, 10.5], [24, 15, 2.5], [24, 10.5]] } });
  Object.assign(red, { area: 'f1', x: 44.6, z: 4.6, range: 5.5, look: 0, nightRole: { yaw: 0 } });
  red.g.rotation.y = 0;
  // イブの夜にお嬢様・お母様の部屋へ招かれていれば、2階から始められる
  const eve = s.flags.eve_go_daughter ? ['f2', 37.6, 15.6, 'お嬢様の部屋'] : null;
  if (eve) enter(eve[0], eve[1], eve[2]); else enter('cottage', 2.4, 12.5);
  const withD = !!s.flags.eve_go_daughter;
  if (withD) { st.night.min = 30; sleepInBed(people.daughter); }
  // 雫と踊った夜：雫は執事のベッドで眠っている（大広間の見回りはいない）。執事は床で目を覚ます
  const withS = !withD && s.flags.dance === 'shizuku';
  if (withS) {
    sleepInBed(black, BEDS.butler);
    // 雫の代わりに、眠れない旦那様が大広間をゆっくり歩き回る（絵を手放す前の夜。見つかれば失敗）
    Object.assign(people.father, { area: 'f1', x: 22, z: 10.5, range: 6.5, wait: 0, look: 0,
      nightRole: { i: 0, path: [[22, 10.5, 3], [26, 10.5, 2], [26.5, 6, 2.5], [21.5, 6, 3]] } });
    Object.assign(player, { x: 2.8, z: 13.4 }); st.lying = true; st.lyingY = 0.06;
    afterMsg = () => { st.lying = false; st.lyingY = null; player.g.rotation.set(0, Math.PI / 2, 0); };
  }
  setTimeout(() => caption('潜入', `12月24日　深夜 ${withD ? '1:30' : '1:00'}`), 400);
  player.g.rotation.set(0, Math.PI / 2, 0);
  say(withD ? '12月24日、クリスマス・イブの深夜1時半。仮面舞踏会の客も帰り、絵は隠し部屋に戻され、屋敷は寝静まった。'
      : '12月24日、クリスマス・イブの深夜1時。仮面舞踏会の客も帰り、絵は隠し部屋に戻され、屋敷は寝静まった。',
    withD && '隣で、お嬢様が小さな寝息を立てている。',
    withS && '床の上で目を覚ました。……背中が痛い。ベッドでは、雫がすやすやと眠っている。',
    withS && ['執事', '（起こさないでおこう。……行ってくる）'],
    withS && ['執事', '（雫が眠っている今夜は、大広間の見回りがいない。……いや、大広間の明かりが一つ点いている。旦那様が、眠れずに歩き回っているらしい）'],
    withD && ['お嬢様', '「（寝言）……執事さん……」'],
    eve && ['執事', withD ? '（起こさないように、そっとベッドを抜け出した。ここは2階だ。書斎は近い）' : `（${eve[3]}の寝息を確かめ、そっとベッドを抜け出した。ここは2階だ。書斎は近い）`],
    s.flags.white_ally ? ['執事', '（白井は約束どおり、警報の系統を落としてくれたはずだ）'] : ['執事', '（警報はまだ生きている。絵に触れれば鳴るだろう……）'],
    s.flags.guard_info ? ['執事', '（2階の廊下には巡回員。雫の話では、西の端で立ち止まって窓の外を眺める。その隙に背後を抜ける）']
      : ['執事', '（2階の廊下には、警備会社の巡回員がいるはずだ。懐中電灯の光に気をつけろ）'],
    ['執事', '（夜明けまでに、終わらせる）']);
  run();
}

// ============================================================
// イブの仮面舞踏会（12月24日 19:00〜0:30）。大広間に客が集まり、執事は料理を運ぶ
// ============================================================
const WAGON = [36, 5.3];                // キッチンのワゴン（料理を受け取る）
// 一般客の立つ所 [x, z, 向き]（大広間と玄関ホール。柱・大階段・ツリーを避ける）
const GUEST_SPOTS = [[20.7, 6.6, 1.2], [22.5, 6.2, -2.4], [26.3, 6.4, 2.6], [27.7, 7.9, -1.6], [25.7, 10.9, 3.0], [23.0, 11.0, 0.4],
  [20.4, 11.3, 2.2], [27.9, 11.2, -2.8], [21.0, 14.7, 1.0], [24.4, 15.3, 3.1], [27.1, 14.4, -1.0], [19.9, 16.5, 0.8]];
let ballGroup = null, ballGuests = [], ballMasters = [];
function setupBallProps() {
  if (!carried.tray) {
    carried.tray = new THREE.Group(); player.g.add(carried.tray);
    // 銀のお盆に、シャンパングラス4本（配ると1本ずつ減る）
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 20), M.metal);
    disc.position.set(0.05, 1.06, 0.36); carried.tray.add(disc);
    const glassMat = new THREE.MeshStandardMaterial({ color: '#f3e3a0', transparent: true, opacity: 0.75, roughness: 0.15 });
    [[-0.07, -0.07], [0.07, -0.07], [-0.07, 0.07], [0.07, 0.07]].forEach(([dx, dz], i) => {
      const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.012, 0.16, 8), glassMat);
      gl.position.set(0.05 + dx, 1.15, 0.36 + dz); gl.userData.glass = i; carried.tray.add(gl);
    });
  }
  if (!ballGroup) {
    ballGroup = new THREE.Group(); areas.f1.group.add(ballGroup);
    // 料理のワゴン（キッチン）
    box(ballGroup, 1.1, 0.8, 0.6, M.metal, WAGON[0], 0, WAGON[1] - 0.45);
    for (const dx of [-0.3, 0, 0.3]) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.metal); d.position.set(WAGON[0] + dx, 0.8, WAGON[1] - 0.45); ballGroup.add(d); }
    ballGroup.traverse(o => { if (o.isMesh) o.castShadow = false; });
  }
  ballGroup.visible = true;
}
// イブの日だけ、大広間の北の壁（大階段の東）に「月下の庭」が飾られる（昼の13時から、舞踏会の終わりまで）
let hallArt = null;
function syncHallArt() {
  if (!hallArt) {
    hallArt = new THREE.Group(); areas.f1.group.add(hallArt);
    box(hallArt, 1.75, 1.3, 0.05, M.gold, 28, 1.25, 0.1);
    box(hallArt, 1.5, 1.05, 0.06, mat('#ffffff', { map: TEX.painting }), 28, 1.37, 0.14);
    const spot = new THREE.PointLight('#ffe7b0', 14, 4, 1.6); spot.position.set(28, 2.9, 1.2); spot.userData.keepNight = true; hallArt.add(spot);
    hallArt.traverse(o => { if (o.isMesh) o.castShadow = false; });
  }
  hallArt.visible = st.mode === 'ball' || (st.mode === 'day' && isEve(s) && s.today.hour >= EVE_HANG);
  if (shards) shards.visible = st.mode === 'ball';
}
const EVE_HANG = 13;   // イブの昼、旦那様が自ら絵を大広間に掛ける時刻
// ルート2（すり替え）：イブの昼、大広間に飾られた絵を青島の模写とすり替え、本物をお嬢様のクローゼットへ
// 見張りの目（協力者は数えない）があるとすり替えられない。本物を抱えて運ぶ間に見られると、疑われる
function eveThings() {
  if (st.mode !== 'day' || !isEve(s) || s.today.hour < EVE_HANG) return [];
  const list = [];
  if (cur.id === 'f1' && !s.flags.swapped) list.push({ name: '月下の庭', at: () => [28, 1.0], label: s.flags.forgery_ready && s.flags.hide_ok ? 'すり替える' : '絵を見る', night: () => {
    recall(s, 'oil');
    if (!s.flags.forgery_ready || !s.flags.hide_ok) return say('大広間の壁に、「月下の庭」が掛けられていた。旦那様が自ら掛けたらしい。', '（今夜、客の前に出す絵だ。……青島の模写と、隠し場所があれば）');
    if (watchers().length) return say('人の目がある。……今は手を出せない。');
    if (!confirm('青島の模写とすり替えますか？（本物は、お嬢様の部屋のクローゼットへ運ぶ）')) return;
    setFlag(s, 'swapped');
    st.dayCarry = 'painting';
    recall(s, 'stamp');
    say('青島の模写を額に収め、本物をテーブルクロスで包む。壁の絵は、何ひとつ変わらないように見えた。',
      s.flags.shizuku ? ['執事', '（雫が、旦那様を書斎に引き止めてくれている。……今のうちだ）'] : null,
      '本物を、2階のお嬢様の部屋のクローゼットへ運ぼう。人に見られないように。');
  } });
  if (cur.id === 'f2' && st.dayCarry === 'painting') list.push({ name: 'クローゼット', at: () => [41.3, 14], label: '本物を隠す', night: () => {
    st.dayCarry = null;
    setFlag(s, 'swap_hidden');
    say('クローゼットの奥、ドレスの陰に本物を寝かせた。', '（あとは今夜、旦那様が偽物を自慢するのを見届けて……25日の朝、運び出すだけだ）');
  } });
  return list;
}

// 11月5日：仕出し屋の搬入。白いバンの荷台から、木箱を3つ、キッチンの食料庫まで運ぶ（運ぶ間は誰に見られても構わない）
const delivering = () => st.mode === 'day' && EV.deliveryDay(s);
const PANTRY = [39.6, 1.2];
// js/events.js の台詞を、3Dの会話で出す（効果は会話を読み終えてから）
function sayScript(steps) {
  const fx = steps.filter(l => !Array.isArray(l) && l.fx).map(l => l.fx);
  say(...steps.filter(Array.isArray).map(l => l[0] === 'n' ? l[1] : [l[0] === 'butler' ? '執事' : LOOKS[l[0]].name, l[1]]));
  afterMsg = () => { for (const f of fx) { const notes = applyFx(s, f); if (notes.length) hooks.toast(fxNote(notes)); } };
}
function deliveryThings() {
  if (!delivering()) return [];
  const t = s.today, list = [];
  if (cur.id === 'grounds' && !st.dayCarry) list.push({ name: '白いバンの荷台', at: () => [VAN[0] + 0.2, VAN[1] - 0.2], label: '木箱を受け取る', night: () => {
    st.dayCarry = 'crate';
    if (!t.crates) { t.crates = 0; return sayScript(EV.catererHello); }
    say(`木箱を抱えた（${t.crates + 1} / ${EV.CRATES}）。キッチンの食料庫へ運ぼう。`);
  } });
  if (cur.id === 'f1' && st.dayCarry === 'crate') list.push({ name: '食料庫', at: () => PANTRY, label: '木箱を置く', night: () => {
    st.dayCarry = null;
    t.crates = (t.crates || 0) + 1;
    DL.spendMinutes(s, ACT_MIN);
    if (t.crates < EV.CRATES) return say(`木箱を食料庫の棚に収めた（${t.crates} / ${EV.CRATES}）。`);
    sayScript(EV.catererBye(true));
  } });
  return list;
}

// 舞踏会の夜、キッチンの床に散らばった割れたお皿（青島が片付けている）
const BLUE_AT = [38.6, 5.9];
// 黒（雫）の配膳の道順：キッチンの戸口から大広間を回る
const BLACK_SERVE = [[33, 9.2, 1.5], [29, 9], [27.6, 8.6, 2], [24, 6, 1.5], [20.5, 8, 2], [24, 11.4, 1.5], [29, 10]];
let shards = null;
function showShards() {
  if (!shards) {
    shards = new THREE.Group(); areas.f1.group.add(shards);
    const m = mat('#f4f1ea');
    for (const [dx, dz, r, a] of [[0.55, 0.05, 0.09, 0.3], [0.75, -0.22, 0.06, 1.2], [0.62, 0.3, 0.07, 2.1], [0.9, 0.1, 0.05, 0.7], [0.45, -0.3, 0.05, 2.6]]) {
      const c = new THREE.Mesh(new THREE.CircleGeometry(r, 5, a, Math.PI * 1.2), m);
      c.rotation.x = -Math.PI / 2; c.position.set(BLUE_AT[0] + dx, 0.02, BLUE_AT[1] + dz); shards.add(c);
    }
  }
  shards.visible = true;
}

// 舞踏会の人の立ち位置（nightPerson で動かす：path は巡回、yaw はその場で辺りを見る）
function placeBallCast() {
  const at = (id, x, z, role) => Object.assign(people[id], { area: 'f1', x, z, wait: 0, look: Math.random() * 3, nightRole: { i: 0, ...role } });
  at('father', 27.2, 2.3, { yaw: 0.2 });
  at('dealer', 29.1, 3.2, { yaw: -0.7 });
  at('mother', 22.4, 9.7, { yaw: 0.5 });
  at('daughter', 25.4, 9.3, { yaw: -0.3 });
  at('caterer', 38.6, 2.0, { yaw: 0 });
  // 赤羽はキッチンで料理を作り、青島はキッチンで割れたお皿を片付けている（二人とも動かない）。配膳で動くのは白井と黒
  at('red', 34.2, 1.7, { yaw: 0 });
  at('blue', ...BLUE_AT, { yaw: Math.PI / 2 });
  showShards();
  at('guard', 24, 16.9, { yaw: Math.PI });
  if (s.flags.white_arrived) at('white', 35, 9, { path: [[35, 9], [31, 10], [27, 10.5, 2], [21.5, 10.5, 2], [27, 10.5], [31, 10]] });
  if (s.flags.shizuku) at('black', BLACK_SERVE[0][0], BLACK_SERVE[0][1], { path: BLACK_SERVE });
  // 麗子は 21時に玄関から入ってくる
  Object.assign(people.reiko, { area: null, nightRole: null });
}
// 舞踏会の衣装：お嬢様はドレス（daughter3）。家族と客は仮面を付ける（使用人は付けない）
async function dressBall() {
  if (TEST) return;
  if (castLoading) await castLoading;
  const V = await import('./vrm.js');
  const d = people.daughter;
  if (d.vrm && !st.ball.daughterBase) {
    st.ball.daughterBase = d.vrm;
    V.attachVRM(d, await V.loadVRM('daughter3'));
  }
  for (const id of ['father', 'mother', 'daughter', 'reiko', 'dealer']) if (people[id].vrm) maskVRM(people[id].vrm, styleOf(id));
  crowdLook(V, true);
  // 一般客：4体の型を複製して並べる
  const G = await import('./guests.js');
  ballMasters = await Promise.all(G.GUEST_IDS.map(id => G.loadGuest(id)));
  if (st.mode !== 'ball') return;
  for (const m of ballMasters) V.setOutline(m.scene, false);   // 複製は材質を共有するので、型の輪郭線を消せば全員消える
  // 立ち位置だけの客に、見た目（複製した VRM と仮面）を入れる
  ballGuests.forEach((slot, i) => {
    const gu = G.makeGuest(ballMasters[i % ballMasters.length], i);
    gu.g.position.set(slot.x, 0, slot.z); gu.g.rotation.y = slot.yaw;
    gu.wearMask();
    gu.g.traverse(o => { if (o.isMesh) o.castShadow = false; });
    gu.g.add(blob());
    ballGroup.add(gu.g);
    Object.assign(slot, { g: gu.g, update: gu.update, unmask: gu.unmask, dispose: gu.dispose });
  });
}
// ---- 舞踏会の軽い描き方：人数は減らさず、太陽の影（家具や建物の影）も舞踏会の間は落とさない ----
// 人物はいつも、揺れものを止め、輪郭線を省き、足元に丸い影を置いている（explore/vrm.js の attachVRM と、makePeople の blob）
function crowdLook(V, on) {
  V.setCrowd(on);
  sun.castShadow = !on;
}
// 客の立ち位置（見た目は dressBall で入れる。?test では見た目なしで動く）
const guestSlots = () => GUEST_SPOTS.map(([x, z, yaw], i) => ({ x, z, yaw, i, g: null, update() {}, unmask() {}, dispose() {} }));
export function startBall(state, h) {
  prepare(state, h);
  st.mode = 'ball';
  st.ball = { min: 0, done: {}, glasses: 0, reqs: [], next: 6, daughterBase: null };
  s.flags.ball_seen = true;
  s.ballStats = { served: 0, missed: 0 };
  setLights(false);
  setupNightProps();
  setupBallProps();
  refreshMarkers();
  placeBallCast();
  ballGuests = guestSlots();
  enter('f1', 24, 13.6);
  player.g.rotation.set(0, Math.PI, 0);
  dressBall().catch(e => console.warn('ball', e));
  st.ball.done.open = true;
  afterMsg = () => { st.ball.phase = 'serve'; for (const k of ['oil', 'dropout', 'ledger', 'masks']) recall(s, k); };
  say(...BALL.openingLines(s));
  run();
}
const ballMin = () => st.ball.min;
// 時刻ごとの出来事（会話の間は時間が止まる）
function ballTick(dt) {
  const B = st.ball;
  if (!st.busy && !B.search && !document.querySelector('.modal-back')) B.min += dt * 60 / BALL_SEC_PER_HOUR;
  // 客の顔を動かす（画面に入っている客だけ、2フレームに1回）
  // 近い客は2フレームに1回、遠い客（12m 以上）は4フレームに1回
  if (cur.id === 'f1') for (const gu of ballGuests) {
    const far = Math.hypot(gu.x - player.x, gu.z - player.z) > 12, every = far ? 4 : 2;
    if ((frameNo + gu.i) % every) continue;
    bodySphere.center.set(gu.x, 0.9, gu.z);
    const seen = frustum.intersectsSphere(bodySphere);
    if (gu.g) gu.g.visible = seen;
    if (seen) gu.update(dt * every);
  }
  if (st.busy) return;
  const at = t => B.min >= t, once = k => !B.done[k] && (B.done[k] = true);
  const serving = (at(BALL.AT.serve) && !at(BALL.AT.dance)) || (at(BALL.AT.serve2) && !at(BALL.AT.lastCall));
  // 料理を待つ客：「！」を出し、待たせすぎると帰ってしまう（実時間で数える）
  if (serving) {
    B.next -= dt;
    if (B.next <= 0 && B.reqs.length < 4 && ballGuests.length) {
      const free = ballGuests.filter(g => !B.reqs.some(r => r.g === g));
      const g = free[Math.floor(Math.random() * free.length)];
      if (g) B.reqs.push({ g, left: 32 });
      B.next = 5 + Math.random() * 4;
    }
  }
  for (const r of [...B.reqs]) {
    r.left -= dt;
    if (r.left <= 0) { B.reqs.splice(B.reqs.indexOf(r), 1); s.ballStats.missed++; hooks.toast('シャンパンを待っていた客が、不満そうに席を離れた（旦那様の目が光る）'); }
  }
  if (at(BALL.AT.reiko) && once('reiko')) {
    Object.assign(people.reiko, { area: 'f1', x: 24, z: 17, wait: 0, look: 0, nightRole: { i: 0, path: [[24, 13], [26.2, 4.2, 9999]] } });
    if (people.reiko.vrm) maskVRM(people.reiko.vrm, styleOf('reiko'));
    if (cur.id !== 'f1') travel({ area: 'f1', x: 24, z: 13.6 });
    afterMsg = () => recall(s, 'young');
    return say(...BALL.reikoLines(s));
  }
  if (at(BALL.AT.dance) && once('dance')) {
    B.reqs = []; B.glasses = 0;
    const partner = () => hooks.askChoice('22時。楽団がワルツを奏で始めた。……誰と過ごす？', BALL.danceOptions(s).map(o => ({ ...o, run: () => '' })), (msg, o) => {
      if (o.id !== 'work') afterMsg = () => startDance(o.id);
      say(...BALL.danceIntro(s, o.id));
    });
    // 雫と再会していれば、雫は2階のバルコニーにいて、大広間からいなくなる
    if (s.flags.shizuku_reunion) Object.assign(people.black, { area: 'f2', x: 24, z: 17.3, wait: 0, look: 0, nightRole: { i: 0, yaw: 0 } });
    const search = () => { B.search = true; };
    // お嬢様と踊れるときは、まずお嬢様が誘いに来る：「お嬢様とダンスする」か「仕事に戻る」
    // 踊ると決めたところで雫がいないことに気づき、もう一度「お嬢様とダンスする」か「雫を探しに行く」
    if (BALL.daughterCan(s)) {
      const dance = () => { s.flags.dance = 'daughter'; startDance('daughter'); };
      const back = () => {
        const others = BALL.danceOptions(s).filter(o => o.id !== 'daughter');
        if (others.length < 2) { say(...BALL.danceIntro(s, 'work')); return; }
        hooks.askChoice('（仕事に戻ろう。……）', others.map(o => ({ ...o, run: () => '' })), (msg, o) => {
          if (o.id !== 'work') afterMsg = () => startDance(o.id);
          say(...BALL.danceIntro(s, o.id));
        });
      };
      afterMsg = () => hooks.askChoice('お嬢様が、手を差し出している。', [{ t: 'お嬢様とダンスする', id: 'dance', run: () => '' }, { t: '仕事に戻る', id: 'work', run: () => '' }], (msg, o) => {
        if (o.id === 'work') return back();
        if (!s.flags.shizuku_reunion) return dance();
        afterMsg = () => hooks.askChoice('（お嬢様の話を聞きながら、雫のことが頭をよぎる……）', [{ t: 'お嬢様とダンスする', id: 'dance', run: () => '' }, { t: '雫を探しに行く', id: 'search', run: () => '' }], (msg2, o2) => {
          if (o2.id === 'dance') return dance();
          search();
          say(...BALL.daughterLeft);
        });
        say(...BALL.daughterPractice);
      });
      return say(...BALL.daughterAsks);
    }
    // 雫と再会していれば、雫がいないことに気づく。探しに行くと、2階のバルコニーにいる
    if (!s.flags.shizuku_reunion) return partner();
    return hooks.askChoice(BALL.shizukuMissing, [{ t: '雫を探す', id: 'search', run: () => '' }, { t: '仕事に戻る', id: 'work', run: () => '' }], (msg, o) => {
      if (o.id === 'search') { search(); return say('（仕事を置いて、屋敷の中を探そう）'); }
      afterMsg = partner;
      say(BALL.shizukuStayed);
    });
  }
  if (B.dark) return darkTick(dt);
  if (at(BALL.AT.unmask) && once('unmask')) {
    B.reqs = []; B.glasses = 0;
    if (s.flags.plan_blackout) return startBlackout();
    if (cur.id !== 'f1') travel({ area: 'f1', x: 24, z: 13.6 });
    // 鐘に合わせて、仮面を右手へ下ろす（少しずつずらす）
    music.sfx('bell');
    let k = 0;
    for (const id of ['father', 'mother', 'daughter', 'reiko', 'dealer']) {
      const v = people[id].vrm; if (!v || !v.mask) continue;
      setTimeout(() => liftMask(v.mask, v.humanoid.getRawBoneNode('rightHand')), 300 + 180 * k++);
    }
    ballGuests.forEach((g, i) => setTimeout(() => g.unmask(), 200 + i * 120));
    afterMsg = () => { B.min = BALL.AT.close; };
    return say(...BALL.unmaskLines(s));
  }
  if (at(BALL.AT.close) && once('close')) {
    afterMsg = endBall;
    return say(...BALL.closeLines(s));
  }
}
// ---- ワルツ（22時）：二人で回りながら、3拍子の1拍目（輪が重なる瞬間）にタップする ----
const BEAT = 0.5, MEASURES = 16;   // 1拍 0.5秒、16小節（約24秒）
const PARTNER = { daughter: 'daughter', shizuku: 'black', blue: 'blue' };
let VM = null;
async function startDance(id) {
  const p = people[PARTNER[id]];
  const c = id === 'shizuku' ? { area: 'f2', x: 24, z: 16.6 } : { area: 'f1', x: 24, z: 8 };
  if (!TEST) VM = VM || await import('./vrm.js');
  if (id === 'shizuku') music.play('shizuku');
  const back = { area: p.area, x: p.x, z: p.z, nightRole: p.nightRole };
  enter(c.area, c.x, c.z);
  Object.assign(p, { area: c.area, dancing: true });
  const ui = document.createElement('div');
  ui.className = 'dance3d';
  ui.innerHTML = '<div class="dance-target"></div><div class="dance-ring"></div><p class="dance-msg"></p><p class="dance-score"></p>';
  ui.querySelector('.dance-msg').textContent = BALL.firstTime('dance') ? '縮んでくる白い輪が、金色の輪に重なった瞬間にタップ（1小節に1回。ぴったりほど高得点）' : '輪が重なった瞬間にタップ';
  ui.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); danceTap(); });
  root.append(ui);
  st.busy = true;
  st.dance = { id, p, c, back, t: -2 * BEAT * 3, hits: {}, pts: 0, ui };
}
function danceTap() {
  const D = st.dance;
  const beat = D.t / BEAT, mi = Math.round(beat / 3), off = Math.abs(beat - mi * 3) * BEAT;
  if (mi < 1 || mi > MEASURES || D.hits[mi] != null) return;
  const pt = off <= 0.12 ? 2 : off <= 0.25 ? 1 : 0;
  D.hits[mi] = pt; D.pts += pt;
  music.sfx(pt ? 'tap' : 'miss');
  const msg = D.ui.querySelector('.dance-msg');
  msg.textContent = pt === 2 ? 'ぴったり！' : pt === 1 ? 'いいね' : 'ずれた……';
  msg.className = `dance-msg hit${pt}`;
}
function danceTick(dt) {
  const D = st.dance;
  D.t += dt;
  const beat = Math.max(0, D.t / BEAT), turn = beat / 12 * Math.PI * 2, r = 0.24;   // 4小節で一回り
  const me = [D.c.x + Math.cos(turn) * r, D.c.z + Math.sin(turn) * r], you = [D.c.x - Math.cos(turn) * r, D.c.z - Math.sin(turn) * r];
  player.x = me[0]; player.z = me[1];
  player.g.position.set(me[0], 0, me[1]); player.g.rotation.y = Math.atan2(you[0] - me[0], you[1] - me[1]);
  D.p.x = you[0]; D.p.z = you[1];
  D.p.g.position.set(you[0], 0, you[1]); D.p.g.rotation.y = Math.atan2(me[0] - you[0], me[1] - you[1]);
  if (VM) {
    if (player.vrm) VM.driveVRM(player.vrm, false, dt, { dance: { beat, role: 'lead' } });
    if (D.p.vrm) VM.driveVRM(D.p.vrm, false, dt, { dance: { beat, role: 'follow' } });
  }
  // 輪：1小節かけて縮み、1拍目で的に重なる
  const f = D.t < 0 ? 0 : (beat % 3) / 3;
  D.ui.querySelector('.dance-ring').style.transform = `translate(-50%, -50%) scale(${1 + (1 - f) * 1.6})`;
  D.ui.querySelector('.dance-score').textContent = D.t < 0 ? `${Math.ceil(-D.t)}…` : `${Math.min(MEASURES, Math.floor(beat / 3))} / ${MEASURES}小節`;
  if (beat > MEASURES * 3 + 1.5) endDance();
}
function endDance() {
  const D = st.dance;
  D.ui.remove();
  st.dance = null; st.busy = false;
  const ratio = D.pts / (MEASURES * 2), tier = ratio >= 0.7 ? 'great' : ratio >= 0.4 ? 'ok' : 'poor';
  s.flags.dance_score = Math.round(ratio * 100);
  Object.assign(D.p, D.back, { dancing: false });
  // 雫は踊り終えたら、大広間の配膳に戻る
  if (D.id === 'shizuku') Object.assign(D.p, { area: 'f1', x: 20.5, z: 8, wait: 0, nightRole: { i: 4, path: BLACK_SERVE } });
  afterMsg = () => {
    if (D.id === 'shizuku') { music.play('ball'); travel({ area: 'f1', x: 24, z: 13.6 }); }
    // お嬢様と踊ったら、このあと部屋に来てと誘われる（行く：決行はお嬢様の部屋から／行かない：バルコニーの鍵を開けておいてくれる）
    if (D.id === 'daughter') {
      afterMsg = () => hooks.askChoice('お嬢様の部屋へ行く？', [{ t: '行く', id: 'go', run: () => '' }, { t: '行かない', id: 'no', run: () => '' }], (msg, o) => {
        if (o.id === 'go') { setFlag(s, 'eve_go_daughter'); return say(...BALL.inviteGo); }
        setFlag(s, 'eve_balcony'); setFlag(s, 'balcony_open');
        say(...BALL.inviteNo);
      });
      say(...BALL.daughterInvite(s));
    }
  };
  say(`（ワルツの出来：${Math.round(ratio * 100)}点）`, ...BALL.danceResult(s, D.id, tier));
}

// ---- ENDING 3 の停電劇：0時の仮面外しの瞬間、白井が屋敷の電気を落とす。暗闇は90秒 ----
// 壁の絵からキャンバスを外し、昇降機・配膳車・ピアノのどれかに隠して、明かりが戻る前に大広間の元の場所（真ん中）へ戻る
// 停電の間だけ、増やされた巡回員が懐中電灯で大広間を回る。絵を抱えているところを照らされたら失敗
const DARK_SEC = 90, HOME = [24, 8];
const HIDE = {
  dumbwaiter: { name: '料理の昇降機', at: [30.6, 3.2], label: '昇降機に隠す', line: 'キッチンの壁の昇降機に、キャンバスを丸めずに滑り込ませた。扉を閉める。' },
  cart: { name: '仕出し屋の配膳車', at: [36, 5.9], label: '配膳車に隠す', line: '配膳車の空の料理箱に、キャンバスを寝かせた。上に、汚れたテーブルクロスをかぶせる。' },
  piano: { name: '応接室のピアノ', at: [14.6, 10.0], label: 'ピアノの中に隠す', line: '応接室のピアノの蓋を開け、弦の上にキャンバスをそっと寝かせた。' },
};
let darkProps = null;
function startBlackout() {
  const B = st.ball;
  if (cur.id !== 'f1') enter('f1', 24, 13.6);
  music.sfx('bell');
  setTimeout(() => { music.sfx('blackout'); music.stop(); }, 2600);
  afterMsg = () => {
    recall(s, 'storm');
    B.dark = { left: DARK_SEC, stage: 'take', spot: null, back: false, frag: null };
    setDark(true);
    hooks.toast('【暗闇】残り90秒。絵を外して隠し、大広間の真ん中へ戻れ');
  };
  say('深夜0時。大時計の鐘が鳴り始めた。',
    ['お父様', '「皆さん、時間だ。……仮面を――」'],
    '――その瞬間、屋敷じゅうの明かりが消えた。',
    '悲鳴と、グラスの割れる音。暗闇の中で、客たちのスマートフォンの灯りが、小さな影のように揺れる。',
    ['執事', '（白井が、約束どおり電源を落とした。……明かりが戻るまで、90秒）'],
    BALL.firstTime('dark') && '【暗闇】壁の「月下の庭」からキャンバスを外し、昇降機・配膳車・ピアノのどれかに隠して、明かりが戻る前に大広間の真ん中へ戻ろう。巡回員の懐中電灯に気をつけて。');
}
function setDark(on) {
  for (const l of LIGHTS) l.o.intensity = on ? 0 : l.base;
  if (hallArt) hallArt.children[2].intensity = on ? 0 : 14;
  hemi.intensity = on ? 0.07 : 0.95; sun.intensity = on ? 0.03 : 0.7;
  lantern.intensity = on ? 1.6 : 0;
  scene.background = on ? new THREE.Color('#020204') : NIGHT_SKY;
  if (!darkProps) {
    darkProps = new THREE.Group(); ballGroup.add(darkProps);
    // 客のスマートフォンの灯り（光源は増やさず、光る点だけ）
    const glowMat = new THREE.MeshBasicMaterial({ color: '#cfe6ff' });
    for (const [x, z] of GUEST_SPOTS.slice(0, 8)) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), glowMat); b.position.set(x + 0.25, 1.25, z + 0.1); b.userData.bob = Math.random() * 6; darkProps.add(b); }
    // 昇降機の扉（キッチンの西の壁）
    box(darkProps, 0.08, 0.75, 0.75, M.darkWood, 30.08, 0.8, 3.2);
  }
  darkProps.visible = true;
  for (const b of darkProps.children) if (b.userData.bob != null) b.visible = on;
  // 増やされた巡回員：大広間を懐中電灯で回る
  const g = people.guard;
  if (on) Object.assign(g, { area: 'f1', x: 24, z: 12, range: 6, wait: 0, look: 0, nightRole: { i: 0, path: [[22, 10.5, 1], [26, 10.5, 1], [26.6, 5.6, 1.5], [21.4, 5.6, 1.5]] } });
  else Object.assign(g, { x: 24, z: 16.9, nightRole: { i: 0, yaw: Math.PI } });
}
function darkTick(dt) {
  const D = st.ball.dark;
  if (D.over) return;
  D.left -= dt;
  carried.painting.visible = D.stage === 'carry';
  for (const b of darkProps.children) if (b.userData.bob != null) { b.userData.bob += dt * 2; b.position.y = 1.2 + Math.sin(b.userData.bob) * 0.08; }
  // 絵を抱えているところを、懐中電灯に照らされた
  if (D.stage === 'carry' && people.guard.seeing && people.guard.area === cur.id) return darkEnd('caught');
  // 隠し終えて、大広間の真ん中へ戻った
  if (D.stage === 'hidden' && cur.id === 'f1' && Math.hypot(player.x - HOME[0], player.z - HOME[1]) < 1.6) { D.back = true; return darkEnd('done'); }
  if (D.left <= 0) darkEnd(D.stage === 'carry' ? 'caught' : D.stage === 'take' ? 'missed' : 'done');
}
// 明かりが戻る
function darkEnd(how) {
  const D = st.ball.dark;
  D.over = true;
  carried.painting.visible = false;
  setDark(false);
  music.play('ball');
  s.dark = { spot: D.spot, back: D.back, frag: D.frag, left: Math.max(0, Math.round(D.left)) };
  if (how === 'caught') music.sfx('alarm');
  if (how === 'caught') {
    s.flags.dark_caught = true;
    afterMsg = endBall;
    return say('パッ、と明かりが戻った。', '大広間じゅうの目が、布を抱えた執事に集まった。旦那様の顔が、みるみる赤くなっていく。', ['お父様', '「……貴様か！」']);
  }
  if (how === 'missed') {
    // 絵に手が届かなかった：停電は「ただの故障」で終わり、舞踏会はそのまま閉宴へ
    s.flags.plan_blackout = false;
    afterMsg = () => { st.ball.dark = null; st.ball.min = BALL.AT.close; };
    return say('パッ、と明かりが戻った。壁の「月下の庭」は、元のまま掛かっている。', ['お父様', '「……ただの停電か。驚かせおって」'], ['執事', '（間に合わなかった。……今夜のうちに、別の手を考えるしかない）']);
  }
  s.flags.blackout_done = true;
  afterMsg = endBall;
  say('パッ、と明かりが戻った。', '壁の額縁は、空っぽだった。', ['お父様', '「……な、なんだと！ 絵が……『月下の庭』が！」'],
    D.back ? ['執事', '（間に合った。……何も知らない顔で、ここに立っていればいい）'] : ['執事', '（まずい……元の場所に戻れなかった）']);
}
function darkThings() {
  const D = st.ball.dark, list = [];
  if (!D || D.over) return list;
  if (cur.id === 'f1' && D.stage === 'take') list.push({ name: '月下の庭', at: () => [28, 1.0], label: 'キャンバスを外す', night: () => {
    D.stage = 'carry';
    hallArt.children[1].visible = false;
    recall(s, 'stamp');
    st.busy = true;
    hooks.askChoice('額縁からキャンバスを外した。……青島が作った、仮面の切れ端を落としていくか？', [
      { t: '麗子の深紅の仮面の切れ端を落とす', id: 'reiko', run: () => '' },
      { t: '担当者の灰色の仮面の切れ端を落とす', id: 'dealer', run: () => '' },
      { t: '何も落とさない', id: null, run: () => '' },
    ], (msg, o) => {
      st.busy = false;
      D.frag = o.id;
      if (o.id) recall(s, 'masks');
      if (o.id) { const f = maskFragment(styleOf(o.id)); f.position.set(27.6, 0.02, 1.5); f.userData.frag = true; darkProps.add(f); }
      say(o.id ? '額縁の下に、仮面の切れ端をそっと落とした。' : '何も残さず、額縁の前を離れた。', '（昇降機か、配膳車か、ピアノか。……急げ）');
    });
  } });
  if (D.stage === 'carry') for (const [id, h] of Object.entries(HIDE)) if (cur.id === 'f1') list.push({ name: h.name, at: () => h.at, label: h.label, night: () => {
    D.stage = 'hidden'; D.spot = id;
    say(h.line, '（大広間の真ん中へ戻れ。明かりが戻る前に）');
  } });
  return list;
}

function ballThings() {
  if (st.mode !== 'ball' || cur.id !== 'f1') return [];
  const B = st.ball, list = [];
  if (B.dark) return darkThings();
  list.push({ name: 'シャンパンのワゴン', at: () => WAGON, label: B.glasses ? `グラス残り${B.glasses}本` : 'グラスを4本受け取る', night: () => {
    if (B.glasses) return say(`お盆には、まだシャンパンが${B.glasses}本残っている。「！」の客へ配ろう。`);
    B.glasses = 4;
    music.sfx('clink');
    say(['仕出し屋', '「シャンパン、4本どうぞ！ ……こぼさないように」']);
  } });
  for (const r of B.reqs) list.push({ name: '客', at: () => [r.g.x, r.g.z], label: B.glasses ? 'シャンパンを渡す' : 'グラスを待っている', night: () => {
    if (!B.glasses) return say('客「……グラスが空なのだがね」', '（キッチンのワゴンで、シャンパンを受け取ってこよう）');
    B.glasses--;
    B.reqs.splice(B.reqs.indexOf(r), 1);
    if (!B.glasses) afterMsg = () => hooks.toast('お盆が空になった。キッチンのワゴンで、次の4本を受け取ろう');
    s.ballStats.served++;
    music.sfx('clink');
    // 運んだ先で、まだ聞いていない話が一つ聞こえる
    const g = BALL.GOSSIP.find(x => !s.flags[x.id]);
    if (g) {
      s.flags[g.id] = true;
      const k = { g_dealer: 'dealer', g_company: 'company', g_caterer: 'caterer', g_daughter: 'dropout', g_young: 'young', g_storm: 'storm' }[g.id];
      if (k) { const prev = afterMsg; afterMsg = () => { if (prev) prev(); recall(s, k); }; }
      return say(g.line);
    }
    say(BALL.SERVE_THANKS[s.ballStats.served % BALL.SERVE_THANKS.length]);
  } });
  list.push({ name: '月下の庭', at: () => [28, 1.0], label: '絵を見る', night: () => s.flags.swapped
    ? say('壁に飾られた「月下の庭」。……青島の模写だ。客たちは、うっとりと見入っている。', '（本物は、お嬢様のクローゼットの奥で眠っている）')
    : say('壁に飾られた「月下の庭」。月明かりの下、白い花が咲く庭。……母が一番好きだった絵だ。', '（今夜は、客と旦那様の目がある。……手は出せない）') });
  return list;
}
function ballAct(t) {
  if (t.night) return t.night();
  if (t.person && t.person.id === 'black' && st.ball.search) {
    st.ball.search = false;
    music.play('shizuku');
    afterMsg = () => startDance('shizuku');
    return say(...BALL.shizukuScene(s));
  }
  if (t.person) {
    const id = t.person.id;
    afterMsg = () => { const k = { red: s.flags.dealer_seen && 'dealer', caterer: 'caterer', guard: 'guard', white: 'company' }[id]; if (k) recall(s, k); };
    return say(...BALL.ballTalk(s, id, ballMin()));
  }
  if (t.exit) {
    if (!['f1', 'f2'].includes(t.exit.area)) return say('今は舞踏会の最中だ。屋敷を離れるわけにはいかない。');
    return travel(t.exit);
  }
  if (t.say) return say(...t.say.map(l => typeof l === 'function' ? l(s) : l));
  say('今は舞踏会の最中だ。');
}
function ballLabels(labels) {
  if (cur.id !== 'f1') return;
  const D = st.ball.dark;
  if (D && !D.over) {
    if (D.stage === 'take') labels.push({ x: 28, y: 1.6, z: 1.0, text: '絵', cls: 'work' });
    if (D.stage === 'carry') for (const h of Object.values(HIDE)) labels.push({ x: h.at[0], y: 1.2, z: h.at[1], text: h.name, cls: 'work' });
    if (D.stage === 'hidden') labels.push({ x: HOME[0], y: 0.6, z: HOME[1], text: '元の場所', cls: 'work' });
    return;
  }
  for (const r of st.ball.reqs) labels.push({ x: r.g.x, y: 2.2, z: r.g.z, text: '！シャンパン', cls: 'alert' });
  if (st.ball.reqs.length && !st.ball.glasses) labels.push({ x: WAGON[0], y: 1.2, z: WAGON[1], text: 'ワゴン', cls: 'work' });
}
function ballGoal() {
  const B = st.ball, m = B.min, st2 = s.ballStats;
  if (B.dark && !B.dark.over) return `【暗闇　残り${Math.max(0, Math.ceil(B.dark.left))}秒】${{ take: '壁の「月下の庭」からキャンバスを外す', carry: '昇降機・配膳車・ピアノのどれかに隠す（懐中電灯に照らされるな）', hidden: '大広間の真ん中へ戻る' }[B.dark.stage]}`;
  const score = `（配ったシャンパン ${st2.served}杯${st2.missed ? `・待たせた客 ${st2.missed}人` : ''}）`;
  if (m < BALL.AT.serve) return '開宴。旦那様の乾杯を見届けよう';
  if (m >= BALL.AT.lastCall) return '0時の鐘を待つ';
  if (B.search) return '雫を探す（屋敷のどこかにいる）';
  if (m >= BALL.AT.dance && m < BALL.AT.serve2) return 'ワルツの時間';
  return `${B.glasses ? `シャンパンを「！」の客へ配る（お盆に${B.glasses}本）` : B.reqs.length ? 'キッチンのワゴンで、シャンパンを4本受け取る' : '客の様子を見て回る（話しかけてもよい）'}${score}`;
}
// 閉宴：仮面と客を片付け、お嬢様の服を戻し、舞踏会だけの VRM を手放してから本編へ戻す
async function endBall() {
  running = false;
  root.classList.add('hidden');
  const B = st.ball;
  for (const id of ['father', 'mother', 'daughter', 'reiko', 'dealer']) if (people[id].vrm) unmaskVRM(people[id].vrm);
  for (const g of ballGuests) g.dispose();
  ballGuests = [];
  if (ballGroup) ballGroup.visible = false;
  if (carried.tray) carried.tray.visible = false;
  // 停電劇の片付け：外したキャンバスを額に戻し（次に遊ぶとき用）、落とした切れ端を拾う
  if (hallArt) hallArt.children[1].visible = true;
  if (darkProps) { darkProps.visible = false; for (const c of [...darkProps.children]) if (c.userData.frag) darkProps.remove(c); }
  if (B.dark && !B.dark.over) setDark(false);
  if (!TEST) {
    const V = await import('./vrm.js');
    if (B.daughterBase) { unmaskVRM(people.daughter.vrm); V.attachVRM(people.daughter, B.daughterBase); }
    crowdLook(V, false);
    for (const id of ['reiko', 'dealer', 'caterer']) { const p = people[id]; if (p.vrm) { p.g.remove(p.vrm.scene); p.vrm = null; p.drive = null; } V.disposeVRM(id, 'lite'); }
    V.disposeVRM('daughter3', 'lite');
    for (const id of ['guest_m1', 'guest_m2', 'guest_f1', 'guest_f2']) V.disposeVRM(id, 'guest');
    ballMasters = [];
  }
  const d = BALL.settleBall(s);
  st.mode = 'day';
  hooks.done(d);
}

// 調べられる小物（ストーリーに関係のない物）の数
const lookKey = t => `look_${cur.id}_${t.name}`;
// 屋敷で調べた物の数。場所ごと（areas）と全体。地下は見つけるまで数えない
const LOOK_AREAS = ['cottage', 'grounds', 'f1', 'f2', 'basement'];
export function lookStats() {
  const list = LOOK_AREAS.filter(id => areas[id] && (id !== 'basement' || (s && s.flags.b_found))).map(id => {
    const keys = new Set(areas[id].things.filter(t => t.say).map(t => `look_${id}_${t.name}`));
    return { id, name: AREA_INFO[id].name, total: keys.size, seen: [...keys].filter(k => s && s.flags[k]).length };
  });
  return { areas: list, total: list.reduce((n, a) => n + a.total, 0), seen: list.reduce((n, a) => n + a.seen, 0) };
}

// 人物照会を開いている間は、屋敷の時間と描画を止める
// タイトルに戻るとき：屋敷の時間と描画を止めて、画面を閉じる
export function leave() {
  running = false; suspended = false;
  msgQueue = []; afterMsg = null; st.busy = false;
  msgEl.classList.add('hidden');
  root.classList.add('hidden');
  setLights(false);
}
let suspended = false;
export function suspend() { if (!running) return; running = false; suspended = true; }
export function resume() { if (suspended) { suspended = false; run(); } }

// テスト用
window.__day3d = { get state() { return s; }, st, player, people, areas, enter, act, planRoute, ROOM_OF, GATE, get cur() { return cur; }, blocked: (x, z, r) => blockedIn(cur, x, z, r) };
