// 執事パートと決行の夜を3Dの屋敷で遊ぶ
// 本編（js/）の状態・予定・調査・会話をそのまま使い、移動と見た目だけを3Dにする
import { THREE, renderer, scene, camera, CAM_OFFSET, hemi, sun, makeChar, animate, resize, box, mat, M, TEX } from './engine.js';
import { buildArea, AREA_INFO, HOUSE, LOOKS, WORK } from './world.js';
import { buildNav, planRoute } from './nav.js';
import { PEOPLE, CHORES, ROOMS, END_HOUR, MAIDS } from '../js/data.js';
import { faceOf } from '../js/faces.js';
import { richNodes } from '../js/richtext.js';
import { whereIs, isAlly, fatherHome, dateLabel, eveCountdown, clamp, buildPlan, setFlag, maidAvailable, fillUnassigned, castNeeded, isEve, applyFx, fxNote, clockRate } from '../js/state.js';
import { SPOTS } from '../js/actions.js';
import * as DL from '../js/daylogic.js';
import { whiteSaw } from '../js/white.js';
import * as BALL from '../js/ball.js';
import * as music from '../js/music.js';
import { recall } from '../js/recall.js';
import * as EV from '../js/events.js';
import { maskVRM, unmaskVRM, liftMask, updateMasks, styleOf } from './masks.js';

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
const SPEAKER = { ...Object.fromEntries(Object.entries(LOOKS).map(([id, l]) => [l.name, id])), '執事': 'butler', '雫': 'black', '巡回員': 'guard', '赤羽': 'red', '青島': 'blue', '白井': 'white' };
// 台詞の話し手の欄は「赤メイド」などで出す（台詞の中では実名で呼び合う）
const LABEL = { 赤羽: '赤メイド', 青島: '青メイド', 白井: '白メイド' };
let portrait = null, faced = null;
function speakerOf(l) {
  if (Array.isArray(l)) return [SPEAKER[l[0]], l[1], l[2]];
  const m = typeof l === 'string' && l.match(/^([^「（]+)([「（].*)$/s);
  return m && SPEAKER[m[1]] ? [SPEAKER[m[1]], m[2]] : [null, ''];
}
function setFace(id, face) {
  if (faced && faced.vrm) faced.vrm.motion.face = Object.fromEntries(Object.keys(faced.vrm.motion.face).map(k => [k, 0]));
  faced = id ? (st.mode === 'ball' ? holderOf(id) : id === 'butler' ? player : people[id]) : null;
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
  if (named && LABEL[named[0]]) named[0] = LABEL[named[0]];
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
  if (ball && st.ball && st.ball.op && st.ball.op.dark) darkLights(true);
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
  // イブ（ルート2）：準備を終えてからすり替えまで、旦那様は大広間で雫に引き止められている
  if ((p.id === 'father' || p.id === 'black') && fatherHeld()) {
    const [x, z, yaw] = p.id === 'father' ? [27, 4.2, -Math.PI / 2] : [25.8, 4.2, Math.PI / 2];
    Object.assign(p, { area: 'f1', x, z, route: null, key: 'held' });
    const here = cur.id === 'f1';
    p.g.visible = here; p.cone.visible = here;
    if (here) { p.g.position.set(x, 0, z); p.g.rotation.y = yaw; driveSeen(p, false, dt); sight(p); } else p.seeing = false;
    return;
  }
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
  p.g.visible = here; p.cone.visible = here && st.mode !== 'morning';   // 朝礼の前と朝礼の間は、視界の扇を出さない
  if (!here) { p.seeing = false; return; }
  p.g.position.set(p.x, 0, p.z);
  driveSeen(p, moving && !st.busy, dt);
  // 舞踏会では、誰に見られても怪しまれない（視線の扇は出さない）
  const opWatch = st.mode === 'ball' && st.ball.op && st.ball.op.carry && !MAIDS.includes(p.id) && p.id !== 'caterer' && (!st.ball.op.dark || p.id === 'guard');
  if (st.mode === 'ball' && !opWatch) { p.cone.visible = false; p.seeing = false; return; }
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
    if (!WORK[c.id]) return;
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
    if (c.assignee !== 'butler' || c.done || withPerson(c.id) || !WORK[c.id]) return;
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
      const on = d.when ? !!d.when(s) : !!s.flags[`deco_${key}`];
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
  if (st.mode !== 'night' && !(st.mode === 'ball' && st.ball.op)) for (const p of Object.values(people)) if (p.area === cur.id && !guiding(p)) consider({ name: p.name, at: () => [p.x, p.z], label: 'TALK', person: p }, st.mode === 'ball' && st.ball.search && p.id === 'black' ? 1.2 : 0);
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
  if (cur.id === 'f2' && N.route === 'swap' && N.carry === 'painting' && !N.morning) list.push({ name: 'クローゼット', at: at(...CLOSET), label: '本物を隠す', night: () => {
    N.carry = null;
    caption('すり替え完了', `深夜 ${nightClock()}`);
    afterMsg = startCarry;
    say('お嬢様の寝息を確かめ、クローゼットの奥に本物をそっと隠した。', '……あとは朝、運び屋が偽物を運び出す騒ぎにまぎれて、本物を持ち出すだけだ。');
  } });
  if (cur.id === 'grounds' && N.route === 'night' && N.carry === 'painting') list.push({ name: '正門', at: at(38, 56.6), label: '調べる', night: () =>
    say('正門には閂が下ろされ、巡回員が行き来している。……怪盗が正面から出ていくわけにはいかない。', s.flags.b_exit ? '（地下の搬入路の、鉄の扉へ）' : '（屋敷のどこかに、ほかの出口は……）') });
  return list;
}
// 25日の朝：クローゼットから本物を取り出し、洗濯かごに隠して、使用人棟の自室まで運ぶ
function morningThings(N, list, at) {
  if (cur.id === 'f2' && !N.carry) list.push({ name: 'クローゼット', at: at(...CLOSET), label: '本物を取り出す', night: () => {
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
// 屋敷を抜け出す（一夜で持ち去るルート）。絵を傷めずに出られるのは、地下の搬入路の鉄の扉だけ
function escape(how) {
  const N = st.night;
  N.exit = how;
  caption('脱出', `深夜 ${nightClock()}`);
  afterMsg = () => endNight('night');
  say('錆びた閂を、少しずつ、音を殺して外す。……20分かかった。鉄の扉を押し開けると、塀の外の水路沿いの小道に出た。屋敷の誰の目にも触れずに。', '腕の中の額縁が、月明かりを受けて鈍く光った。');
}
function nightAct(t) {
  const N = st.night;
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
    : `絵を抱えて、屋敷の中を1階へ降り、${s.flags.b_exit && s.flags.b_key ? '資料室の床の扉から地下へ降りて搬入路の非常口' : '屋敷のどこかの出口'}から抜け出す（梯子と井戸は絵を傷める。玄関には警報${isAlly(s, 'red') ? '' : '。勝手口の前の赤羽は、1時半ごろに休む'}）`;
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
    N.min += dt * clockRate() * 60 / NIGHT_SEC_PER_HOUR;
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
const endAsk = q => { if (st.dayCarry === 'crate') return `木箱を抱えたままです。食料庫に置いてから終えましょう。\n${q}`; if (st.dayCarry === 'forgery') return `青島の模写を抱えたままです。このまま終えると、すり替えはできません。\n${q}`; if (st.dayCarry) return `本物の絵を抱えたままです。お嬢様の部屋のクローゼットに隠してから終えましょう。\n${q}`; const tr = DL.traces(s); return tr.length ? `まだ元に戻していない物があります（${tr.map(x => DL.TRACE_NAME[x]).join('、')}）。\nこのままだと、気づかれて疑われるかもしれません。\n${q}` : q; };

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
    const todo = t.chores.filter(c => c.assignee === 'butler' && !CHORES[c.id].mission).map(c => `${c.done ? '✓' : '・'}${CHORES[c.id].name}${withPerson(c.id) && !c.done ? `（任意・${PEOPLE[withPerson(c.id)].name}に話しかける）` : CHORES[c.id].after && !c.done && t.hour < CHORES[c.id].after ? `（任意・${CHORES[c.id].after}時から）` : CHORES[c.id].optional ? '（任意）' : ''}`);
    const mg = mission() && missionGoal();
    if (mg) todo.unshift(`【模写】${mg}`);
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
  if (st.dayCarry === 'forgery') { st.dayCarry = null; s.today.traceNotes.push('模写を抱えたまま18時の鐘が鳴った。……慌てて元の場所に戻した。すり替えは、もうできない'); }
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
    s.today.min = (s.today.min || 0) + dt * clockRate() * 60 / SEC_PER_HOUR;
    while (s.today.min >= 60) { s.today.min -= 60; s.today.hour++; }
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
  else {
    if (st.autoWalk) autoWalkTick(rawDt);
    player.g.position.set(player.x, 0, player.z); animate(player, moving || !!st.autoWalk, dt);
  }
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
    if (st.dayCarry === 'forgery' && cur.id === 'f2' && player.x > 40 && !s.flags.forgery_stashed && !st.busy) stashForgery();
    if ((st.dayCarry === 'painting' || st.dayCarry === 'forgery') && !st.busy) {
      carried.painting && (carried.painting.visible = true);
      // お嬢様は「贈り物の絵」を預かると約束してくれている。本物を抱えて近くを通れば、声をかけてくる（怪しまれない）
      const dg = people.daughter, keeper = st.dayCarry === 'painting' && s.flags.hide_ok;
      if (keeper && !st.carrySeen.daughter && dg.area === cur.id && Math.hypot(dg.x - player.x, dg.z - player.z) < 4.5) {
        st.carrySeen.daughter = true;
        dg.g.rotation.y = Math.atan2(player.x - dg.x, player.z - dg.z); dg.wait = Math.max(dg.wait, 4);
        say(...DAUGHTER_SECRET);
      }
      for (const id of watchers()) {
        if (id === 'daughter' && keeper) continue;
        if (!st.carrySeen[id]) { st.carrySeen[id] = true; s.susp = clamp(s.susp + 20); hooks.toast(`${people[id].name}に、布で包んだ大きな荷物を見られた（疑惑 +20）`); }
      }
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
  // 外の巡回員は、屋敷の前庭から正門の前、西の芝生（古井戸の手前）までを回る
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
// イブの舞踏会の間だけ、大広間の北の壁（大階段の東）に「月下の庭」が飾られる（18時ごろ、旦那様が隠し部屋から運ぶ）
let hallArt = null;
function syncHallArt() {
  if (!hallArt) {
    hallArt = new THREE.Group(); areas.f1.group.add(hallArt);
    box(hallArt, 1.75, 1.3, 0.05, M.gold, 28, 1.25, 0.1);
    box(hallArt, 1.5, 1.05, 0.06, mat('#ffffff', { map: TEX.painting }), 28, 1.37, 0.14);
    const spot = new THREE.PointLight('#ffe7b0', 14, 4, 1.6); spot.position.set(28, 2.9, 1.2); spot.userData.keepNight = true; hallArt.add(spot);
    hallArt.traverse(o => { if (o.isMesh) o.castShadow = false; });
  }
  hallArt.visible = st.mode === 'ball';
  if (shards) shards.visible = st.mode === 'ball';
  syncForgery();
}
// イブの絵は、18時ごろに旦那様が自ら隠し部屋から大広間へ運ぶ。すり替えは、それまでに隠し部屋で
const prepDone = () => !!(s.today && (s.today.chores.find(c => c.id === 'evePrep') || {}).done);
// 舞踏会の準備を終えたあと、すり替えが済むまで、雫が大広間で旦那様を引き止めている
const fatherHeld = () => st.mode === 'day' && isEve(s) && !!mission() && prepDone() && !s.flags.swapped;
// ルート2（すり替え）：イブの昼、隠し部屋の絵を青島の模写とすり替え、本物をお嬢様のクローゼットへ
// 見張りの目（協力者は数えない）があるとすり替えられない。本物を抱えて運ぶ間に見られると、疑われる
function eveThings() {
  if (st.mode !== 'day' || !isEve(s)) return [];
  const list = [], f = s.flags, ms = mission();
  // ルート2の朝の仕事：青島の部屋の模写を、勝手口から屋敷に入れ、裏階段で2階の納戸へ運んで隠す
  if (ms && !f.forgery_stashed) {
    if (cur.id === 'cottage' && !st.dayCarry) list.push({ name: '布に包んだ模写', at: () => BLUE_FORGERY, label: '模写を持つ', night: () => {
      st.dayCarry = 'forgery';
      say('青島の部屋の壁に、布に包んだ板が立て掛けてあった。……青島の模写だ。', '勝手口から屋敷に入り、裏階段で2階の納戸へ運ぼう。人に見られないように。');
    } });
  }
  // 舞踏会の準備を済ませ、旦那様が絵を掛けたら、納戸から模写を取り出して大広間ですり替える
  const prepped = prepDone();
  if (f.forgery_stashed && !f.swapped && cur.id === 'f2' && !st.dayCarry && prepped && roomAt(player.x, player.z) && roomAt(player.x, player.z).name === '納戸')
    list.push({ name: '納戸の奥', at: () => STORE_AT, label: '模写を取り出す', night: () => {
      st.dayCarry = 'forgery';
      say('屏風の裏から、模写を取り出した。', '大広間の「月下の庭」と、すり替えよう。');
    } });
  if (cur.id === 'f2' && f.hidden_open && !f.swapped && st.dayCarry === 'forgery') list.push({ name: '月下の庭', at: () => [8, 3.2], label: 'すり替える', night: () => {
    if (watchers().length) return say('人の目がある。……今は手を出せない。');
    if (!confirm('青島の模写とすり替えますか？（本物は、お嬢様の部屋のクローゼットへ運ぶ）')) return;
    setFlag(s, 'swapped');
    st.dayCarry = 'painting';
    recall(s, 'stamp');
    say('イーゼルの本物を外し、青島の模写を代わりに据える。布を掛け直すと、何ひとつ変わらないように見えた。',
      ['執事', '（18時、旦那様がこれを大広間へ運ぶ。……運ばれるのは、青島の模写だ）'],
      '本物を、お嬢様の部屋のクローゼットへ運ぼう。人に見られないように。');
  } });
  if (cur.id === 'f2' && st.dayCarry === 'painting') list.push({ name: 'クローゼット', at: () => CLOSET, label: '本物を隠す', night: () => {
    st.dayCarry = null;
    setFlag(s, 'swap_hidden');
    const d = people.daughter, here = d.area === 'f2' && whereIs(s, 'daughter', s.today.hour) === 'droom';
    const first = here && !st.carrySeen.daughter;
    if (first) st.carrySeen.daughter = true;
    say(...(first ? DAUGHTER_SECRET : []),
      here ? 'お嬢様がクローゼットの扉を開け、ドレスを脇へ寄せてくれた。その奥に、本物を寝かせる。' : 'クローゼットの奥、ドレスの陰に本物を寝かせた。',
      here ? ['お嬢様', '「……今夜、パパが自慢するのは偽物なのね。ふふ、楽しみ」'] : null,
      '（あとは今夜、旦那様が偽物を自慢するのを見届けて……25日の朝、運び出すだけだ）');
  } });
  return list;
}
// 朝礼で「模写を運ぶ」を引き受けた日の、その仕事
const mission = () => s.today && s.today.chores.find(c => c.id === 'eveForgery' && c.assignee === 'butler');
const BLUE_FORGERY = [10.6, 11.2], STORE_AT = [46.6, 16.8], CLOSET = [40.9, 14.4];
// 本物を抱えているところをお嬢様に見られたとき
const DAUGHTER_SECRET = [
  ['お嬢様', '「……それが、例の“贈り物の絵”？」'],
  ['お嬢様', '「いいわ、何も聞かない。クローゼットの奥なら、誰も開けないから」'],
  ['お嬢様', '「ふふ。……あなたと私だけの秘密ね」'],
];
// 布に包んだ模写（青島の部屋の壁際・納戸の奥に立て掛けてある間だけ見せる）
let forgeryProp = null;
function syncForgery() {
  const f = s.flags, ms = st.mode === 'day' && isEve(s) && mission();
  const where = !ms || st.dayCarry === 'forgery' || f.swapped ? null : !f.forgery_stashed ? ['cottage', BLUE_FORGERY, -Math.PI / 2] : ['f2', STORE_AT, Math.PI];
  if (!where) { if (forgeryProp) forgeryProp.visible = false; return; }
  if (!forgeryProp) { forgeryProp = new THREE.Group(); box(forgeryProp, 1.0, 0.8, 0.06, mat('#d8cfc0'), 0, 0.05, 0); forgeryProp.children[0].rotation.x = -0.12; }
  const [a, [x, z], yaw] = where;
  if (forgeryProp.parent !== areas[a].group) areas[a].group.add(forgeryProp);
  forgeryProp.position.set(x, 0, z); forgeryProp.rotation.y = yaw; forgeryProp.visible = true;
}
// 模写を抱えて2階の東の端（裏階段の上）まで来ると、廊下の奥に人影が見え、目の前の納戸へ急いで隠す。その直後、お母様に声をかけられる（気づかれない）
function stashForgery() {
  st.busy = true;
  setFlag(s, 'forgery_stashed');
  say('2階に上がったところで、廊下の奥に人影が見えた。', ['執事', '（まずい……！）']);
  // 会話を閉じたら、執事は自分で納戸へ駆け込み、屏風の裏に模写を押し込む
  afterMsg = () => {
    st.busy = true;
    walkPlayer([[45, 12.4], [45, 14.2], [STORE_AT[0], STORE_AT[1] - 0.8]], () => {
      st.dayCarry = null;
      const ms = mission();
      if (ms) ms.done = true;
      refreshMarkers();
      say('執事は納戸へ飛び込み、古い屏風の裏に模写を押し込んだ。……足音は、こちらへは来なかった。', ...EVE_MOTHER);
      afterMsg = toHallWithMother;
    });
  };
}
// 執事を決まった道順で歩かせる（その間、操作は受け付けない）。着いたら done
function walkPlayer(path, done) { st.autoWalk = { path: [...path], done }; }
function autoWalkTick(dt) {
  const w = st.autoWalk, [tx, tz] = w.path[0];
  const dx = tx - player.x, dz = tz - player.z, d = Math.hypot(dx, dz), step = 3.6 * dt;
  st.busy = true;
  if (d > 1e-3) player.g.rotation.y = Math.atan2(dx, dz);
  if (d > step) { player.x += dx / d * step; player.z += dz / d * step; return; }
  player.x = tx; player.z = tz; w.path.shift();
  if (!w.path.length) { st.autoWalk = null; w.done(); }
}
// お母様に連れられて大広間へ行き、舞踏会の準備を手伝わされる。終わると旦那様が「月下の庭」を掛けに来る
function toHallWithMother() {
  const i = s.today.chores.findIndex(c => c.id === 'evePrep' && !c.done);
  st.busy = true;
  fade('お母様に腕を取られ、大広間へ連れていかれた……', () => {
    enter('f1', 26.5, 7.4);
    Object.assign(people.mother, { area: 'f1', x: 25.4, z: 7.6, route: null, wait: 8, target: null });
    if (i < 0) return say(['お母様', '「さあ、今夜のために頑張ってちょうだい」']);
    say(['お母様', '「飾り付けが全然終わらないの。手伝ってちょうだい」'], ['執事', '「……かしこまりました」']);
    afterMsg = () => { st.busy = true; fade('お母様に言われるまま、大広間で舞踏会の準備を手伝っています……', () => {
      const msg = DL.doChore(s, i);
      refreshMarkers(); syncDeco();
      say(msg, ['お母様', '「ふふ、さすがね。これで今夜は完璧よ」'], ...EVE_HANG_LINES);
    }, 900); };
  }, 900);
}
// 模写を納戸に隠した直後：お母様に声をかけられる（気づかれない）
const EVE_MOTHER = [
  '（納戸を出たところで、背後から声をかけられた）',
  ['お母様', '「あら、執事さん。そんな所で何をしているの？」'],
  ['執事', '「今夜のお客様用の膝掛けを、探しておりました」'],
  ['お母様', '「ふふ、働き者ね。……今夜は私のドレスも、ちゃんと見てちょうだいね」'],
  ['執事', '（……気づかれていない）'],
  ['お母様', '「そうだわ、執事さん。ちょうどいいところに。一緒に来てちょうだい」'],
];
// 準備を終えると旦那様が大広間を見に来る。絵はまだ飾らず、言いつけだけを残す。雫が旦那様を大広間に引き止める
const EVE_HANG_LINES = [
  'そこへ旦那様が、大広間の様子を見にやって来た。',
  ['お父様', '「この壁には、18時ごろに絵を飾る。周りには何も置くな」'],
  ['お父様', '「あの絵は、私が自分で運ぶ。誰も触るな」'],
  ['黒メイド', '「旦那様、客席の配置で、ご判断いただきたいことがございます。少しお時間を」'],
  ['お父様', '「……ふん。見せてみろ」'],
  '雫が、旦那様を大広間に引き止めてくれている。',
  ['執事', '（絵は、まだ書斎の奥の隠し部屋だ。……納戸から模写を取ってきて、18時までにすり替えよう）'],
];
const missionGoal = () => {
  const f = s.flags;
  if (!f.forgery_stashed) return st.dayCarry === 'forgery' ? '模写を、勝手口から裏階段で2階へ（人に見られないように）' : '使用人棟の青島の部屋から、模写を持ち出す';
  const prep = s.today.chores.find(c => c.id === 'evePrep');
  if (prep && !prep.done) return '大広間で、舞踏会の準備をする';
  if (f.swapped) return f.swap_hidden ? '' : '本物を、お嬢様の部屋のクローゼットへ';
  if (st.dayCarry !== 'forgery') return '2階の納戸から模写を取り出す（18時まで。雫が旦那様を大広間に引き止めている）';
  return f.hidden_open ? '隠し部屋の「月下の庭」と、すり替える（18時まで）' : '書斎の机の鍵で本棚を開け、隠し部屋へ（18時まで）';
};

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
  recall(s, 'oil');
  run();
}
const ballMin = () => st.ball.min;
// 時刻ごとの出来事（会話の間は時間が止まる）
function ballTick(dt) {
  const B = st.ball;
  if (!st.busy && !B.search && !document.querySelector('.modal-back')) B.min += dt * clockRate() * 60 / BALL_SEC_PER_HOUR;
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
  if (B.op) return opTick(dt);   // 月下作戦の最中は、時刻の出来事を止める
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
  if (at(BALL.AT.unmask) && once('unmask')) {
    B.reqs = []; B.glasses = 0;
    if (s.flags.plan_blackout) return startOp();
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

// ---- ENDING 3「月下作戦」：執事は指揮役、4人のメイドが主役 ----
// 0時の鐘で白メイドが照明を落とし、赤メイドが2階の吹き抜けから光る仮面を落とす。その隙に雫がキャンバスを外して白メイドへ
// 白メイドは配膳車の二重底に隠して電気を戻し、青メイドが配膳車を大広間の空の額縁の前へ。取り調べのあと、雫が資料室の棚へ移し
// 最後に執事が資料室から地下へ降り、搬入路の鉄の扉の外で待つ仕出し屋へ渡す
// メイドを操作する区切りでは、執事とメイドの体（VRM）を入れ替える（執事の体は、旦那様の隣に立たせておく）
// 区切りごとの失敗は、その場では終わらず「疑い」が上がるだけ。最後に、疑い4以上なら見破られる（story.js の opVerdict）
const DARK_SEC = 90;
const STAND = [26.8, 3.3], STAND_YAW = Math.PI / 2 + 0.3;   // 執事の立ち位置（旦那様の隣。大階段の東）
const OP = {
  breaker: [43.2, 0.9], whiteAt: [43.2, 1.9],          // キッチン裏の配電盤
  redAt: [28, 9.6], rail: [20.6, 8.5],                  // 2階の廊下と、吹き抜けの手すり
  maskFall: [20.6, 6.0],                                // 光る仮面が落ちる所（大広間）
  takeAt: [23.6, 9.8], art: [28, 1.0],                  // 雫の出発点（大広間の見回りの途中。ツリーの南東）と、壁の額縁
  handoff: [30.0, 10.0], whiteWait: [31.4, 10.2],       // 食堂の戸口で白メイドが待つ
  cart: [33.2, 6.4], cartTarget: [27.6, 3.6], corner: [19.4, 5.9],   // 配膳車（キッチン→空の額縁の前→大広間の端）
  blueAt: [33.2, 7.4], shelf: [12, 1.1], hatch: [8.5, 6.2], ironDoor: [22, 2.6], under: [1.0, 4.0], caterer: [38.6, 2.0],
};
let opProps = null;
const holderOf = id => { const c = st.ball && st.ball.op && st.ball.op.ctl; return c && id === c.id ? player : c && id === 'butler' ? people[c.id] : id === 'butler' ? player : people[id]; };
function opPropsInit() {
  if (opProps) return opProps;
  opProps = new THREE.Group(); ballGroup.add(opProps);
  // 予告状のカード（空の額縁の中に残す）
  const cardM = box(opProps, 0.22, 0.14, 0.01, mat('#ffffff'), OP.art[0], 1.3, 0.17); opProps.userData.card = cardM;
  // 配膳車：上段に赤メイドのケーキ、下段は二重底
  const cart = new THREE.Group();
  box(cart, 0.9, 0.06, 0.6, M.metal, 0, 0.82, 0); box(cart, 0.9, 0.06, 0.6, M.metal, 0, 0.35, 0);
  for (const [dx, dz] of [[-0.42, -0.27], [0.42, -0.27], [-0.42, 0.27], [0.42, 0.27]]) box(cart, 0.04, 0.85, 0.04, M.metal, dx, 0, dz);
  opMesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 18), mat('#fbf4ea'), 0, 0.98, 0, cart);
  opMesh(new THREE.CylinderGeometry(0.15, 0.15, 0.14, 18), mat('#fbf4ea'), 0, 1.15, 0, cart);
  opBall(cart, 0.04, mat('#d03040'), 0, 1.26, 0);
  opProps.add(cart); opProps.userData.cart = cart;
  // 光る仮面とマント（青メイドの光る塗料）
  const ghost = new THREE.Group();
  const glow = new THREE.MeshBasicMaterial({ color: '#bfefff' });
  opMesh(new THREE.CircleGeometry(0.18, 16), glow, 0, 0, 0, ghost);
  const cape = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#1a2a40', side: THREE.DoubleSide }));
  cape.position.y = -0.62; ghost.add(cape);
  ghost.visible = false; opProps.add(ghost); opProps.userData.ghost = ghost;
  opProps.traverse(o => { if (o.isMesh) o.castShadow = false; });
  // 押している間の配膳車（執事の前）
  carried.cart = cart.clone(); carried.cart.position.set(0, 0, 0.75); player.g.add(carried.cart); carried.cart.visible = false;
  return opProps;
}
function opMesh(geo, material, x, y, z, parent) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); parent.add(m); return m; }
function opBall(parent, r, material, x, y, z) { return opMesh(new THREE.SphereGeometry(r, 10, 8), material, x, y, z, parent); }
function placeCart(at) { const c = opProps.userData.cart; c.visible = !!at; if (at) c.position.set(at[0], 0, at[1]); }

function opSave() { const O = st.ball.op; s.op = { doubt: O.doubt, res: O.res, left: Math.max(0, Math.round(O.left)), seen: O.seen }; }
function addDoubt(n, why) {
  const O = st.ball.op;
  if (O.after) s.counters.doubt = (s.counters.doubt || 0) + n; else O.doubt += n;
  O.seen++;
  opSave();
  if (why) hooks.toast(`${why}（疑い +${n}）`);
}
// 執事とメイドの体（VRM）を入れ替える。屋敷の人物は画面の外にいる間は描かない印（visible=false）が付くので、外しておく
function swapBodies(p) {
  if (!VM) return;
  const a = player.vrm, b = p.vrm;
  if (!a || !b) return;
  VM.attachVRM(player, b); VM.attachVRM(p, a);
  a.scene.visible = true; b.scene.visible = true;
}
// メイドを操作する：執事の体と入れ替え、執事の体は旦那様の隣に立たせる
function possess(id, area, x, z, yaw = 0) {
  const O = st.ball.op;
  if (O.ctl) unpossess();
  const p = people[id];
  O.ctl = { id, name: p.name };
  swapBodies(p);
  Object.assign(p, { area: 'f1', x: STAND[0], z: STAND[1], wait: 0, look: 0, route: null, nightRole: { i: 0, yaw: STAND_YAW }, name: '執事' });
  enter(area, x, z); player.g.rotation.y = yaw;
}
// 執事に戻す。rest：メイドがその場に残る位置（[area, x, z, yaw]）
function unpossess(rest) {
  const O = st.ball.op, c = O.ctl;
  if (!c) return;
  const p = people[c.id];
  const [area, x, z, yaw] = rest || [cur.id, player.x, player.z, player.g.rotation.y];
  swapBodies(p);
  Object.assign(p, { area, x, z, wait: 0, look: 0, route: null, nightRole: { i: 0, yaw }, name: c.name });
  O.ctl = null;
  enter('f1', STAND[0], STAND[1]); player.g.rotation.y = STAND_YAW;
}
const opCard = (id, place, then) => { st.busy = true; ROLECARD(id, place, () => { st.busy = false; then(); }); };
let ROLECARD = (id, place, then) => then(), BREAKER = (o, done) => done(true), DROP = done => done(true);

// 0時の鐘の前：作戦の始まり
async function startOp() {
  const B = st.ball;
  B.op = { step: 'talk', doubt: 0, seen: 0, res: {}, left: DARK_SEC, dark: false, carry: null, seenBy: {}, ctl: null, after: false };
  st.busy = true;
  if (!TEST) VM = VM || await import('./vrm.js');
  const M3 = await import('../js/operation.js');
  ROLECARD = M3.flashCard; BREAKER = M3.breakerGame; DROP = M3.dropGame;
  st.busy = false;
  opPropsInit(); placeCart(OP.cart); opProps.visible = true; opProps.userData.card.visible = false;
  if (cur.id !== 'f1') enter('f1', STAND[0], STAND[1]);
  player.x = STAND[0]; player.z = STAND[1]; player.g.rotation.y = STAND_YAW;
  // 4人を持ち場に立たせる（赤と青はキッチン、白は食堂の戸口、雫は大広間の見回り。ワルツで雫がバルコニーへ行っていても戻す）
  B.search = false;
  for (const [id, x, z, yaw] of [['red', 34.2, 1.7, 0], ['blue', ...BLUE_AT, Math.PI / 2], ['white', 31.4, 10.2, -Math.PI / 2], ['black', ...OP.takeAt, Math.PI]])
    Object.assign(people[id], { area: 'f1', x, z, wait: 0, look: 0, route: null, dancing: false, nightRole: { i: 0, yaw } });
  opSave();
  say(['旦那様', '「……執事、グラスを」'], ['執事', '「旦那様、今夜は最高の夜ですね。……グラスが空いております」'], `（――${M3.opName(s)}、開始）`);
  afterMsg = () => hooks.askChoice('旦那様の目を、大広間の中央へ向けておく。', [
    { t: '「麗子様が、旦那様のお話を聞きたいと」', id: 'ok', run: () => '' },
    { t: '「あちらの絵、本当に見事でございます」', id: 'ng', run: () => '' },
    { t: '「次のワルツは、旦那様の番でございます」', id: 'ok', run: () => '' },
  ], (msg, o) => {
    B.op.res.talk = o.id === 'ok';
    if (o.id === 'ng') { people.father.nightRole = { i: 0, yaw: Math.PI }; addDoubt(1, '旦那様が、壁の絵の方を向いてしまった'); }
    else people.father.nightRole = { i: 0, yaw: -Math.PI / 2 };
    afterMsg = opBreaker;
    say(o.id === 'ng' ? '旦那様は満足げに、壁の「月下の庭」を振り返った。' : '旦那様は上機嫌で、大広間の真ん中へ目を向けた。', ['司会', '「皆さま、0時の鐘とともに、仮面をお外しください！」']);
  });
}
// ① 白メイド：12回目の鐘で照明の主幹を落とす
function opBreaker() {
  const O = st.ball.op;
  O.step = 'breaker';
  opCard('white', '――同じ頃、キッチン裏', () => {
    possess('white', 'f1', OP.whiteAt[0], OP.whiteAt[1], Math.PI);
    music.stop();
    st.busy = true;
    BREAKER({}, ok => {
      st.busy = false;
      O.res.breaker = ok;
      if (!ok) addDoubt(1, '一拍遅れて、明かりが落ちた');
      setDark(true); O.dark = true;
      afterMsg = opDrop;
      say('――屋敷じゅうの明かりが、一瞬で落ちた。', '悲鳴と、グラスの割れる音。', ['白メイド', '「……落ちました。復旧まで、90秒」']);
    });
  });
}
// ② 赤メイド：2階の吹き抜けから、光る仮面を落とす
function opDrop() {
  const O = st.ball.op;
  O.step = 'drop';
  unpossess(['f1', OP.whiteWait[0], OP.whiteWait[1], -Math.PI / 2]);   // 白メイドは、暗闇の中を食堂の戸口へ
  opCard('red', '――2階、吹き抜けの廊下', () => {
    possess('red', 'f2', OP.redAt[0], OP.redAt[1], -Math.PI / 2);
    if (s.flags.op_drop_blue) say(['赤メイド', '「……結局、わたしが上がることになった。青さんは配膳車で手が離せない」']);
  });
}
function dropNow() {
  const O = st.ball.op;
  st.busy = true;
  DROP(ok => {
    st.busy = false;
    O.res.drop = ok;
    if (!ok) addDoubt(1, '客の目が、十分に集まらなかった');
    const g = opProps.userData.ghost; g.visible = true; g.position.set(OP.maskFall[0], 5.6, OP.maskFall[1]); O.fall = 0;
    recall(s, 'masks');
    gatherCrowd();
    afterMsg = opTake;
    say('暗闇の中、白く光る仮面とマントが、ひらりと宙を舞った。', ['客', '「か、怪盗だ！ あそこに！」'], ['旦那様', '「なんだ、あれは……！」']);
  });
}
// ③ 雫：額縁からキャンバスを外し、食堂の戸口の白メイドへ
function opTake() {
  const O = st.ball.op;
  O.step = 'take';
  unpossess(['f2', OP.rail[0], OP.rail[1] + 0.4, Math.PI]);
  opCard('black', '――大広間、北の壁', () => {
    possess('black', 'f1', OP.takeAt[0], OP.takeAt[1], Math.PI / 2);
    recall(s, 'storm');
    say(['雫', '「……今だ」'], BALL.firstTime('op_take') ? '【雫】巡回員の懐中電灯を避けて、壁の額縁へ。キャンバスを外したら、食堂の戸口で待つ白メイドへ渡そう。' : null);
  });
}
// ④ 白メイド：配膳車の二重底に隠し、配電盤で電気を戻す
function opHide() {
  const O = st.ball.op;
  O.step = 'hide';
  unpossess(['f1', OP.handoff[0] - 0.8, OP.handoff[1], -Math.PI / 2]);
  opCard('white', '――食堂の戸口', () => {
    possess('white', 'f1', OP.whiteWait[0], OP.whiteWait[1], Math.PI);
    O.carry = 'canvas';
    if (s.flags.op_piano) say(['白メイド', '「……ピアノは、明日の調律で開けられる。やっぱり配膳車に」']);
  });
}
// 明かりが戻る（⑤）
function opLightsBack() {
  const O = st.ball.op;
  O.dark = false; O.carry = null;
  setDark(false);
  music.play('ball');
  unpossess(['f1', OP.whiteAt[0], OP.whiteAt[1], Math.PI]);
  opProps.userData.card.visible = true;
  setFlag(s, 'blackout_done');
  recall(s, 'stamp');
  Object.assign(people.guard, { area: 'f1', x: 24, z: 12, range: 6, wait: 0, look: 0, nightRole: { i: 0, path: [[22, 10.5, 1], [26, 10.5, 1], [26.6, 5.6, 1.5], [21.4, 5.6, 1.5]] } });
  afterMsg = opCart;
  say('パッ、と明かりが戻った。',
    ['旦那様', '「……え、絵が……ない！？」'],
    '壁には、空の額縁と、白いカードが一枚だけ。『仮面が外れる時刻に、月をいただく』',
    ['旦那様', '「巡回員！ 玄関も勝手口も閉めろ！ 誰も外へ出すな！」'],
    ['旦那様', '「白！ なぜ電気が落ちた！」'],
    ['白メイド', s.flags.pipe_done ? '「配電盤の老朽化です。嵐の夜にも一度落ちています。……水道管も破裂した屋敷ですから。今、直りました」' : '「配電盤の老朽化です。嵐の夜にも一度落ちています。……今、直りました」'],
    ['旦那様', '「……くそっ。屋敷じゅうを探せ！」']);
}
// ⑥ 青メイド：料理を載せた配膳車を、空の額縁の目の前へ
function opCart() {
  const O = st.ball.op;
  O.step = 'cart';
  opCard('blue', '――キッチン', () => {
    possess('blue', 'f1', OP.blueAt[0], OP.blueAt[1], Math.PI);
    say(['青メイド', '「……よし。堂々と、堂々と」'], BALL.firstTime('op_cart') ? '【青メイド】配膳車を押して、大広間の空の額縁の目の前へ。旦那様や巡回員に見とがめられたら、うまく答えよう。' : null);
  });
}
function cartArrive() {
  const O = st.ball.op;
  O.carry = null; O.res.cart = !O.cartSlip;
  placeCart(OP.cartTarget);
  afterMsg = opInterrogate;
  say(['青メイド', '「皆さま、少し落ち着いて、甘い物をどうぞ！ 赤羽さん特製のケーキです！」'], ['旦那様', '「……今はそれどころでは……」'], ['麗子', '「あら、いただくわ」'],
    '客たちが、空の額縁の目の前の配膳車に群がった。');
}
// ⑦ 取り調べ（会話の画面）。終わったら屋敷へ戻って、⑧へ
function opInterrogate() {
  const O = st.ball.op;
  unpossess(['f1', OP.cartTarget[0] + 0.9, OP.cartTarget[1] + 0.4, Math.PI]);
  opSave();
  running = false; root.classList.add('hidden');
  hooks.interrogate(() => {
    O.after = true;
    root.classList.remove('hidden'); run();
    opMove();
  });
}
// ⑧ 雫：配膳車からキャンバスを抜き取り、探されたばかりの資料室の棚へ
function opMove() {
  const O = st.ball.op;
  O.step = 'move';
  placeCart(OP.corner);
  people.father.nightRole = { i: 0, yaw: Math.PI / 2 };
  opCard('black', '――0時20分、大広間の端', () => {
    possess('black', 'f1', OP.corner[0] + 1.0, OP.corner[1] + 0.4, -Math.PI / 2);
    say('青メイドが配膳車を大広間の端へ寄せ、片付けるふりをしている。', ['雫', '（……一度探した場所は、二度は探さない）'],
      s.flags.op_cottage ? ['雫', '（使用人棟は、真っ先に探される。……やっぱり資料室にしよう）'] : null);
  });
}
// ⑨ 執事：資料室から地下へ降り、搬入路の鉄の扉の外の仕出し屋へ（地下を知らなければ、キッチンの仕出し屋の料理箱へ）
function opOut() {
  const O = st.ball.op;
  O.step = 'out';
  unpossess(['f1', 22.6, 6.4, Math.PI / 2]);
  for (const [id, x, z] of [['red', 28.6, 4.6], ['white', 28.8, 3.6], ['blue', 27.0, 4.8]]) Object.assign(people[id], { area: 'f1', x, z, nightRole: { i: 0, yaw: -Math.PI / 2 } });
  people.father.nightRole = { i: 0, yaw: Math.PI / 2 };
  Object.assign(people.guard, { x: 24, z: 16.9, nightRole: { i: 0, yaw: Math.PI } });
  say('メイドたちが旦那様の前に集まり、口々に何かを訴えている。旦那様の目は、メイドたちに釘付けだ。', ['執事', '（今だ。……資料室の棚から、キャンバスを）']);
}
function opFinish() {
  const O = st.ball.op;
  O.step = 'end';
  opSave();
  afterMsg = endBall;
  say('執事は何食わぬ顔で、大広間の旦那様の隣に戻った。', ['旦那様', '「……執事。どこに行っていた」'], ['執事', '「お客様のお帰りの支度を。……旦那様、グラスが空いております」']);
}
// 客と家族を、大広間の中央（光る仮面が落ちた所の東）へ集め、仮面の方を向かせる
const CROWD = [22.8, 6.8];
function gatherCrowd() {
  const O = st.ball.op, [cx, cz] = CROWD, look = (x, z) => Math.atan2(OP.maskFall[0] - x, OP.maskFall[1] - z);
  O.crowd = ballGuests.map((gu, i) => {
    const a = i * 2.39996, r = 0.7 + 0.55 * Math.sqrt(i);   // ひまわりの種の並び（重ならない）
    const tx = cx + Math.cos(a) * r * 1.2, tz = cz + Math.sin(a) * r;
    return { gu, tx, tz, yaw: look(tx, tz) };
  });
  ['mother', 'daughter', 'reiko', 'dealer'].forEach((id, i) => {
    const p = people[id];
    if (p.area !== 'f1') return;
    const tx = cx + 1.6 + (i % 2) * 0.8, tz = cz - 1.0 + Math.floor(i / 2) * 1.6;
    Object.assign(p, { wait: 0, nightRole: { i: 0, path: [[tx, tz, 99999]] } });
  });
  people.father.nightRole = { i: 0, yaw: look(people.father.x, people.father.z) };
}
function crowdTick(dt) {
  const O = st.ball.op;
  if (!O.crowd) return;
  for (const c of O.crowd) {
    const dx = c.tx - c.gu.x, dz = c.tz - c.gu.z, d = Math.hypot(dx, dz);
    if (d > 0.01) { const k = Math.min(1, Math.max(dt * 2.5, dt * 3.2 / d)); c.gu.x += dx * k; c.gu.z += dz * k; }
    if (c.gu.g) { c.gu.g.position.set(c.gu.x, 0, c.gu.z); c.gu.g.rotation.y = d > 0.2 ? Math.atan2(dx, dz) : c.yaw; }
  }
}
function opTick(dt) {
  const O = st.ball.op;
  crowdTick(dt);
  const g = opProps && opProps.userData.ghost;
  if (g && g.visible && O.fall != null && O.fall < 1) { O.fall = Math.min(1, O.fall + dt * 0.8); g.position.y = 5.6 - O.fall * 4.9; g.rotation.y += dt * 3; }
  carried.painting.visible = O.carry === 'canvas';
  if (carried.cart) carried.cart.visible = O.carry === 'cart';
  if (st.busy || document.querySelector('.modal-back, .op-layer')) return;
  // 暗闇の残り時間（③④）
  if (O.dark) {
    O.left -= dt;
    for (const b of darkProps.children) if (b.userData.bob != null) { b.userData.bob += dt * 2; b.position.y = 1.2 + Math.sin(b.userData.bob) * 0.08; }
    if (O.left <= 0) {
      addDoubt(1, '明かりが戻るのが遅れた');
      if (O.step === 'take') { hallArt.children[1].visible = false; O.carry = null; return opHide(); }
      if (O.step === 'hide') { O.res.hide = false; return opLightsBack(); }
    }
  }
  // 運んでいるところを見られた（協力者は数えない）
  if (O.carry) for (const id of watchers()) {
    if (O.seenBy[id]) continue;
    O.seenBy[id] = true;
    if (O.step === 'cart') { cartAsk(id); return; }
    addDoubt(O.dark ? 2 : 1, `${people[id].name}に見られた`);
  }
  if (O.step === 'cart' && O.carry === 'cart' && cur.id === 'f1' && Math.hypot(player.x - OP.cartTarget[0], player.z - OP.cartTarget[1]) < 1.2) return cartArrive();
  if (O.step === 'out' && O.handed && cur.id === 'f1' && roomAt(player.x, player.z) && roomAt(player.x, player.z).key === 'great') return opFinish();
}
// 配膳車を押しているところを、旦那様か巡回員に見とがめられた
function cartAsk(id) {
  const O = st.ball.op, who = people[id].name;
  st.busy = true;
  hooks.askChoice(`${who}「おい、それは何だ」`, [
    { t: '「皆さまに、甘い物をお持ちしました！」', id: 'ok', run: () => '' },
    { t: '「ち、ちょっと通りますね……！」', id: 'ng', run: () => '' },
  ], (msg, o) => {
    st.busy = false;
    if (o.id === 'ng') { O.cartSlip = true; addDoubt(1, `${who}の目が細くなった`); return; }
    say([who, id === 'father' ? '「……ふん。こんなときに」' : '「……ああ、料理か」'], `${who}は、配膳車から目をそらした。`);
  });
}
function opThings() {
  const O = st.ball.op, list = [];
  if (!O || st.busy) return list;
  if (O.step === 'drop' && cur.id === 'f2') list.push({ name: '吹き抜けの手すり', at: () => OP.rail, label: '光る仮面を落とす', night: dropNow });
  if (O.step === 'take' && cur.id === 'f1') {
    if (!O.carry) list.push({ name: '月下の庭', at: () => OP.art, label: 'キャンバスを外す', night: () => {
      O.carry = 'canvas'; O.res.take = true;
      hallArt.children[1].visible = false;
      say(s.flags.op_frame ? ['雫', '（額縁ごとは、やっぱり無理。……キャンバスだけにする）'] : null, '雫は額縁の裏の留め具を外し、キャンバスだけを、音もなく丸めた。', '空の額縁の中に、白いカードを一枚。');
      if (s.flags.op_frame) addDoubt(1, null);
    } });
    else list.push({ name: '白メイド', at: () => OP.handoff, label: '白メイドに渡す', night: () => {
      O.carry = null;
      if (O.seenBy.guard) O.res.take = false;
      afterMsg = opHide;
      say(['雫', '「……はい、白さん」'], ['白メイド', '「受け取りました」']);
    } });
  }
  if (O.step === 'hide' && cur.id === 'f1') {
    if (O.carry === 'canvas') list.push({ name: '配膳車', at: () => OP.cart, label: '二重底に隠す', night: () => {
      O.carry = 'hidden'; O.res.hide = true;
      say('配膳車の上段には、赤メイドの大きなクリスマスケーキ。その下の板一枚に、母の絵が眠っている。', '（配電盤へ戻って、電気を戻そう）');
    } });
    if (O.carry === 'hidden') list.push({ name: '配電盤', at: () => OP.breaker, label: '電気を戻す', night: () => { say(['白メイド', '「……戻します」']); afterMsg = opLightsBack; } });
  }
  if (O.step === 'cart' && cur.id === 'f1' && !O.carry) list.push({ name: '配膳車', at: () => OP.cart, label: '配膳車を押す', night: () => {
    O.carry = 'cart'; placeCart(null);
    say('ケーキの載った配膳車を、ゆっくりと押し出した。', '（行き先は、大広間の空の額縁の目の前）');
  } });
  if (O.step === 'move' && cur.id === 'f1') {
    if (!O.carry && !O.moved) list.push({ name: '配膳車', at: () => OP.corner, label: 'キャンバスを抜き取る', night: () => { O.carry = 'canvas'; say('二重底の板をずらし、丸めたキャンバスを抜き取った。'); } });
    if (O.carry === 'canvas') list.push({ name: '古い図面棚', at: () => OP.shelf, label: '棚の奥に隠す', night: () => {
      O.carry = null; O.moved = true;
      afterMsg = opOut;
      say('図面の束の奥に、キャンバスを差し込んだ。巡回員が、ついさっき「異状なし」と言って出ていった棚だ。', ['雫', '（……あとは、お兄ちゃん）']);
    } });
  }
  if (O.step === 'out') {
    const under = !!(s.flags.b_key && s.flags.b_vault && s.flags.b_exit);   // 床の扉の鍵・隠し扉・鉄の扉を知っていれば、地下から
    if (cur.id === 'f1' && !O.carry && !O.handed) list.push({ name: '古い図面棚', at: () => OP.shelf, label: 'キャンバスを取り出す', night: () => {
      O.carry = 'canvas';
      say('棚の奥から、丸めたキャンバスを取り出した。', under ? '（資料室の床の扉から地下へ。搬入路の鉄の扉の外に、仕出し屋が待っている）' : '（キッチンの仕出し屋の料理箱へ）');
    } });
    if (under && cur.id === 'f1' && O.carry === 'canvas') list.push({ name: '床の扉', at: () => OP.hatch, label: '地下へ降りる', night: () => travel({ area: 'basement', x: OP.under[0], z: OP.under[1] }) });
    const give = (name, at) => list.push({ name, at: () => at, label: 'キャンバスを渡す', night: () => {
      O.carry = null; O.handed = true;
      say(['仕出し屋', '「……雫ちゃんのお兄さん。確かに」'], ['執事', '「頼む」'], under ? '鉄の扉の向こうで、白いバンのエンジンが、静かにかかった。' : '料理箱の一番下に、キャンバスが収まった。', '（大広間へ戻ろう。何事もなかった顔で）');
    } });
    if (under && cur.id === 'basement' && O.carry === 'canvas') give('鉄の扉の外の仕出し屋', OP.ironDoor);
    if (!under && cur.id === 'f1' && O.carry === 'canvas') give('仕出し屋', OP.caterer);
    if (under && cur.id === 'basement' && O.handed) list.push({ name: '石段', at: () => OP.under, label: '資料室へ戻る', night: () => travel({ area: 'f1', x: OP.hatch[0], z: OP.hatch[1] + 0.5 }) });
  }
  return list;
}
function opGoal() {
  const O = st.ball.op, t = O.dark ? `【暗闇　残り${Math.max(0, Math.ceil(O.left))}秒】` : '';
  const g = {
    talk: '旦那様の目を、大広間の中央へ', breaker: '12回目の鐘で、照明の主幹を落とす',
    drop: '【赤メイド】2階の廊下を、吹き抜けの手すりへ',
    take: O.carry ? '【雫】食堂の戸口で待つ白メイドへ渡す（懐中電灯に気をつけて）' : '【雫】壁の額縁から、キャンバスを外す',
    hide: O.carry === 'canvas' ? '【白メイド】キッチンの配膳車の二重底に隠す' : '【白メイド】キッチン裏の配電盤で、電気を戻す',
    cart: O.carry ? '【青メイド】大広間の空の額縁の目の前へ' : '【青メイド】キッチンの配膳車を押す',
    move: O.carry ? '【雫】資料室の古い図面棚へ' : '【雫】大広間の端の配膳車から、キャンバスを抜き取る',
    out: O.handed ? '大広間へ戻る' : O.carry ? (s.flags.b_key && s.flags.b_vault && s.flags.b_exit ? '資料室の床の扉から地下へ。ワイン棚の隠し扉を抜け、搬入路の鉄の扉の外の仕出し屋へ' : 'キッチンの仕出し屋へ') : '資料室の古い図面棚から、キャンバスを取り出す',
    end: '',
  }[O.step];
  return t + (g || '');
}
let darkProps = null;
// 停電の明るさ（エリアを移るたびに enter が明るさを戻すので、作戦中はもう一度かける）
function darkLights(on) {
  for (const l of LIGHTS) l.o.intensity = on ? 0 : l.base;
  if (hallArt) hallArt.children[2].intensity = on ? 0 : 14;
  hemi.intensity = on ? 0.07 : 0.95; sun.intensity = on ? 0.03 : 0.7;
  lantern.intensity = on ? 1.6 : 0;
  scene.background = on ? new THREE.Color('#020204') : NIGHT_SKY;
}
function setDark(on) {
  darkLights(on);
  if (!darkProps) {
    darkProps = new THREE.Group(); ballGroup.add(darkProps);
    // 客のスマートフォンの灯り（光源は増やさず、光る点だけ）
    const glowMat = new THREE.MeshBasicMaterial({ color: '#cfe6ff' });
    for (const [x, z] of GUEST_SPOTS.slice(0, 8)) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), glowMat); b.position.set(x + 0.25, 1.25, z + 0.1); b.userData.bob = Math.random() * 6; darkProps.add(b); }
  }
  darkProps.visible = true;
  for (const b of darkProps.children) if (b.userData.bob != null) b.visible = on;
  // 増やされた巡回員：大広間を懐中電灯で回る
  const g = people.guard;
  if (on) Object.assign(g, { area: 'f1', x: 24, z: 12, range: 6, wait: 0, look: 0, nightRole: { i: 0, path: [[22, 10.5, 1], [26, 10.5, 1], [26.6, 5.6, 1.5], [21.4, 5.6, 1.5]] } });
  else Object.assign(g, { x: 24, z: 16.9, nightRole: { i: 0, yaw: Math.PI } });
}

function ballThings() {
  if (st.mode !== 'ball') return [];
  const B = st.ball, list = [];
  if (B.op) return opThings();
  if (cur.id !== 'f1') return [];
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
  if (t.person && st.ball.op) return say('（今は作戦の最中だ）');
  if (t.person) {
    const id = t.person.id;
    afterMsg = () => { const k = { red: s.flags.dealer_seen && 'dealer', caterer: 'caterer', guard: 'guard', white: 'company' }[id]; if (k) recall(s, k); };
    return say(...BALL.ballTalk(s, id, ballMin()));
  }
  if (t.exit) {
    const out = st.ball.op && st.ball.op.step === 'out';
    if (out && t.exit.area === 'grounds') return say('古井戸の縄梯子では、キャンバスが擦れる。……鉄の扉へ行こう。');
    if (!['f1', 'f2'].includes(t.exit.area) && !(out && t.exit.area === 'basement')) return say('今は舞踏会の最中だ。屋敷を離れるわけにはいかない。');
    return travel(t.exit);
  }
  if (t.say) return say(...t.say.map(l => typeof l === 'function' ? l(s) : l));
  say('今は舞踏会の最中だ。');
}
function ballLabels(labels) {
  if (cur.id !== 'f1') return;
  if (st.ball.op) {
    // 作戦中は、次に向かう所に印を出す
    for (const th of opThings()) { const [x, z] = th.at(); labels.push({ x, y: 1.4, z, text: th.name, cls: 'work' }); }
    if (st.ball.op.step === 'cart' && st.ball.op.carry === 'cart') labels.push({ x: OP.cartTarget[0], y: 0.6, z: OP.cartTarget[1], text: '空の額縁の前', cls: 'work' });
    return;
  }
  for (const r of st.ball.reqs) labels.push({ x: r.g.x, y: 2.2, z: r.g.z, text: '！シャンパン', cls: 'alert' });
  if (st.ball.reqs.length && !st.ball.glasses) labels.push({ x: WAGON[0], y: 1.2, z: WAGON[1], text: 'ワゴン', cls: 'work' });
}
function ballGoal() {
  const B = st.ball, m = B.min, st2 = s.ballStats;
  if (B.op) return opGoal();
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
  // 月下作戦の片付け：外したキャンバスを額に戻し（次に遊ぶとき用）、配膳車やカードをしまう
  if (hallArt) hallArt.children[1].visible = true;
  if (darkProps) darkProps.visible = false;
  if (B.op) { if (B.op.ctl) unpossess(); if (B.op.dark) setDark(false); }
  if (opProps) { opProps.visible = false; opProps.userData.ghost.visible = false; }
  if (carried.cart) carried.cart.visible = false;
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
window.__day3d = { get state() { return s; }, st, player, people, areas, enter, act, planRoute, ROOM_OF, GATE, get cur() { return cur; }, blocked: (x, z, r) => blockedIn(cur, x, z, r), get target() { return target && target.name; }, get things() { return st.mode === "ball" ? ballThings().map(t => [t.name, ...t.at()]) : null; } };
