// 探索の試作：屋敷全体（使用人棟・庭・1F・2F）を主人公で歩き回る
import '../js/lockdown.js';
import { THREE, renderer, scene, camera, CAM_OFFSET, hemi, sun, makeChar, animate } from './engine.js';
import { buildArea, AREA_INFO } from './world.js';

const LOW = 0.17, VIEW_RANGE = 5.5, VIEW_FOV = Math.PI * 0.42, PASSCODE = '1103', CONE_RAYS = 24;

// ---- 状態 ----
const state = {
  susp: 0, busy: false,
  blueprint: false, windowsOut: false, windowsIn: false, receipt: false,
  hasKey: false, shelfOpen: false, found: false, hiddenNoticed: false,
};
const hiddenKnown = () => state.blueprint || (state.windowsOut && state.windowsIn);

const player = { ...makeChar(scene, { outfit: '#22223a', hair: '#2a2a2a' }), x: 2.5, z: 3, r: 0.3 };
const areas = {};
let cur = null;

// ---- メッセージ ----
const msgEl = document.getElementById('msg');
let msgQueue = [], afterMsg = null;
function say(...lines) { msgQueue = lines.filter(Boolean); nextMsg(); }
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
  if (codeEl.value === PASSCODE) { state.hasKey = true; say('カチリ、と錠が外れた。中には古びた真鍮の鍵が入っていた。'); }
  else say('……開かない。');
});
document.getElementById('dialNo').addEventListener('click', () => { dial.classList.add('hidden'); state.busy = false; });

// ---- 謎解きの進行（world.js から呼ばれる） ----
const api = {
  state, say,
  hiddenCheck() {
    if (!hiddenKnown() || state.hiddenNoticed) return [];
    state.hiddenNoticed = true;
    return [['執事', '（書斎と物置の間に、隠し部屋がある。入口は書斎のどこかだ）']];
  },
  windowCheck() {
    if (!(state.windowsOut && state.windowsIn)) return [];
    return ['外から数えると7つ、中から数えると6つ。……窓が一つ足りない。', ...api.hiddenCheck()];
  },
  shelf() {
    if (state.shelfOpen) return say('本棚の奥に、暗い小部屋が続いている。');
    if (!hiddenKnown()) return say('洋書がぎっしり並んだ本棚。');
    if (!state.hasKey) return say('隠し部屋側の壁に面した本棚だ。……上から5段目の赤い本だけ、埃が積もっていない。', '引いてみると、棚の奥に鍵穴が現れた。鍵が要るようだ。');
    openShelf();
    say('赤い本を引き、鍵を差し込む。本棚がゆっくりと手前に開き出した……！');
  },
  desk() {
    if (state.hasKey) return say('引き出しは空だ。鍵はもう手元にある。');
    afterMsg = openDial;
    say('机の引き出しには4桁のダイヤル錠が掛かっている。');
  },
  found() {
    state.found = true;
    say('月明かりの下、白い花が咲く庭。', ['執事', '（「月下の庭」……母さん、見つけたよ）'], '——探索試作はここまで。お疲れさまでした。');
  },
};

let shelfAnim = 0;
function openShelf() {
  state.shelfOpen = true;
  shelfAnim = 0.0001;
  const a = areas.f2;
  Object.assign(a.shelf.box, { minX: 7.6, maxX: 9.8, minZ: 1.0, maxZ: 1.5 });
  for (const o of a.secret.objs) o.visible = true;
}

// ---- エリア ----
function getArea(id) {
  if (!areas[id]) {
    const a = buildArea(id, scene, api);
    for (const n of a.npcs) if (n.path) {
      n.target = 1; n.wait = 0; n.look = 0;
      n.coneMat = new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
      n.coneGeo = new THREE.BufferGeometry();
      n.coneGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((CONE_RAYS + 2) * 3), 3));
      n.coneGeo.setIndex(Array.from({ length: CONE_RAYS }, (_, i) => [0, i + 1, i + 2]).flat());
      const cone = new THREE.Mesh(n.coneGeo, n.coneMat);
      cone.position.y = 0.03; cone.frustumCulled = false;
      a.group.add(cone);
    }
    if (a.secret) for (const o of a.secret.objs) o.visible = state.shelfOpen;
    a.group.visible = false;
    areas[id] = a;
  }
  return areas[id];
}

const fadeEl = document.getElementById('fade');
function enter(id, x, z) {
  const a = getArea(id);
  if (cur) cur.group.visible = false;
  cur = a;
  a.group.visible = true;
  player.x = x; player.z = z;
  const info = AREA_INFO[id];
  scene.background = new THREE.Color(info.bg);
  hemi.intensity = info.outdoor ? 1.4 : 1.0;
  sun.intensity = info.outdoor ? 2.4 : 1.2;
  camTarget.set(x, 0, z);
  camera.zoom = info.outdoor ? 0.6 : 1;
  camera.updateProjectionMatrix();
}
function travel(to) {
  state.busy = true;
  fadeEl.classList.add('on');
  setTimeout(() => {
    enter(to.area, to.x, to.z);
    fadeEl.classList.remove('on');
    state.busy = false;
  }, 280);
}

// ---- 部屋の名前 ----
function roomAt(x, z) {
  if (!cur) return null;
  if (cur.id === 'grounds') return z < 12 ? '裏庭' : z > 27 ? '前庭' : x < 10 ? 'バラ園' : x > 44 ? '通用口' : '庭';
  return cur.rooms.find(r => r.type !== 'void' && x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d) || null;
}

// ---- 入力 ----
const keys = new Set();
addEventListener('keydown', e => {
  keys.add(e.key.toLowerCase());
  if ((e.key === ' ' || e.key.toLowerCase() === 'e' || e.key === 'Enter') && !e.repeat && dial.classList.contains('hidden')) { e.preventDefault(); act(); }
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

// ---- 調べる・話す・移動 ----
let target = null;
function findTarget() {
  let best = null, bd = 1.3;
  for (const t of cur.things) {
    if (t.secretOnly && !state.shelfOpen) continue;
    const [x, z] = t.at();
    const d = Math.hypot(x - player.x, z - player.z);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}
function act() {
  if (!msgEl.classList.contains('hidden')) return nextMsg();
  if (state.busy || !target) return;
  if (target.exit) return travel(target.exit);
  if (target.npc) target.npc.g.rotation.y = Math.atan2(player.x - target.npc.x, player.z - target.npc.z);
  else if (target.private && watchers().length) addSusp(25);
  target.run(api);
}

// ---- 当たり判定 ----
function blocked(x, z, r) {
  return cur.solids.some(s => x + r > s.minX && x - r < s.maxX && z + r > s.minZ && z - r < s.maxZ);
}
function moveBy(o, dx, dz, r) {
  if (!blocked(o.x + dx, o.z, r)) o.x += dx;
  if (!blocked(o.x, o.z + dz, r)) o.z += dz;
}
// 壁に当たるまでの距離（視線の判定。家具や手すりは視線を遮らない）
function rayDist(x, z, dx, dz, max) {
  let best = max;
  for (const s of cur.solids) {
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
function sees(n) {
  const vx = player.x - n.x, vz = player.z - n.z, d = Math.hypot(vx, vz);
  if (d > VIEW_RANGE || d < 1e-6) return d < 1e-6;
  let diff = Math.atan2(vx, vz) - n.g.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return Math.abs(diff) < VIEW_FOV / 2 && rayDist(n.x, n.z, vx / d, vz / d, d) >= d;
}
const watchers = () => cur.npcs.filter(n => n.path && n.seeing);

// ---- 疑惑 ----
const suspEl = document.getElementById('susp');
function addSusp(v) {
  state.susp = Math.max(0, Math.min(100, state.susp + v));
  if (state.susp >= 100) caught();
}
function caught() {
  const w = watchers()[0];
  state.susp = 30;
  afterMsg = () => travel({ area: 'cottage', x: 2.5, z: 3 });
  say([w ? w.name : '？', '「執事さん！？ そこで何をしているんですか……！」'], '（見つかってしまった。本編ならここで疑惑が一気に高まり、屋敷を追われる）');
}

// ---- 巡回 ----
function updateNpc(n, dt) {
  if (!n.path) { animate(n, false, dt); return; }
  if (n.wait > 0) {
    n.wait -= dt; n.look += dt;
    n.g.rotation.y = n.baseYaw + Math.sin(n.look * 1.5) * 0.9;
    animate(n, false, dt);
  } else {
    const [tx, tz, wait] = n.path[n.target];
    const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
    if (d < 0.05) {
      n.target = (n.target + 1) % n.path.length;
      if (wait) { n.wait = wait; n.look = 0; n.baseYaw = n.g.rotation.y; }
    } else {
      const st = Math.min(d, (n.speed || 1.6) * dt);
      n.x += dx / d * st; n.z += dz / d * st;
      n.g.rotation.y = Math.atan2(dx, dz);
    }
    animate(n, d >= 0.05, dt);
  }
  n.g.position.set(n.x, 0, n.z);
  n.seeing = sees(n);
  // 視界の扇形（壁で遮られる）
  const pos = n.coneGeo.attributes.position;
  pos.setXYZ(0, n.x, 0, n.z);
  const yaw = n.g.rotation.y;
  for (let i = 0; i <= CONE_RAYS; i++) {
    const a = yaw - VIEW_FOV / 2 + VIEW_FOV * i / CONE_RAYS;
    const dx = Math.sin(a), dz = Math.cos(a), r = rayDist(n.x, n.z, dx, dz, VIEW_RANGE);
    pos.setXYZ(i + 1, n.x + dx * r, 0, n.z + dz * r);
  }
  pos.needsUpdate = true;
}

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
  // 屋外の建物：画面上で主人公に重なり、主人公より手前にあるなら低くする
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

// ---- ラベル・ミニマップ・目標 ----
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
const mmCanvas = document.getElementById('minimap'), mm = mmCanvas.getContext('2d');
function drawMinimap(here) {
  const W = mmCanvas.width, H = mmCanvas.height;
  const ex = cur.id === 'grounds' ? 64 : Math.max(...cur.rooms.map(r => r.x + r.w));
  const ez = cur.id === 'grounds' ? 42 : Math.max(...cur.rooms.map(r => r.z + r.d));
  const S = Math.min((W - 10) / ex, (H - 10) / ez);
  const ox = (W - ex * S) / 2, oz = (H - ez * S) / 2;
  const px = x => ox + x * S, pz = z => oz + z * S;
  mm.clearRect(0, 0, W, H);
  if (cur.id === 'grounds') {
    mm.fillStyle = '#4f6a3a'; mm.fillRect(px(0), pz(0), ex * S, ez * S);
    mm.fillStyle = '#8a7a66';
    for (const b of cur.blocks) mm.fillRect(px(b.x1), pz(b.z1), (b.x2 - b.x1) * S, (b.z2 - b.z1) * S);
  } else {
    for (const r of cur.rooms) {
      if (r.secret && !state.shelfOpen) continue;
      mm.fillStyle = r.type === 'void' ? '#221a24' : r === here ? '#a07a4a' : '#5a4636';
      mm.fillRect(px(r.x) + 0.5, pz(r.z) + 0.5, r.w * S - 1, r.d * S - 1);
    }
  }
  for (const n of cur.npcs) {
    if (n.path) {
      mm.fillStyle = n.seeing ? 'rgba(255,90,74,.5)' : 'rgba(255,224,138,.35)';
      mm.beginPath(); mm.moveTo(px(n.x), pz(n.z));
      const yaw = n.g.rotation.y;
      for (const a of [-VIEW_FOV / 2, 0, VIEW_FOV / 2]) mm.lineTo(px(n.x + Math.sin(yaw + a) * VIEW_RANGE), pz(n.z + Math.cos(yaw + a) * VIEW_RANGE));
      mm.fill();
    }
    mm.fillStyle = '#f4f1ea'; mm.beginPath(); mm.arc(px(n.x), pz(n.z), 3, 0, 7); mm.fill();
  }
  mm.fillStyle = '#e3c06f'; mm.beginPath(); mm.arc(px(player.x), pz(player.z), 4, 0, 7); mm.fill();
}
function goal() {
  if (state.found) return '試作クリア！';
  if (state.shelfOpen) return '隠し部屋の奥を調べる';
  if (hiddenKnown() && state.hasKey) return '書斎の本棚を調べる';
  if (hiddenKnown()) return '書斎の机の引き出しを開ける番号を探す';
  return '屋敷を調べ、絵の隠し場所を突き止める';
}

// ---- メインループ ----
const placeEl = document.getElementById('place'), goalEl = document.getElementById('goal'), actBtn = document.getElementById('act');
const camTarget = new THREE.Vector3();
const FWD = new THREE.Vector2(-1, -1).normalize(), RIGHT = new THREE.Vector2(1, -1).normalize();
let last = performance.now();

function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  let ix = 0, iy = 0;
  if (!state.busy) {
    if (keys.has('arrowup') || keys.has('w')) iy += 1;
    if (keys.has('arrowdown') || keys.has('s')) iy -= 1;
    if (keys.has('arrowright') || keys.has('d')) ix += 1;
    if (keys.has('arrowleft') || keys.has('a')) ix -= 1;
    ix += stick.x; iy -= stick.y;
  }
  const il = Math.hypot(ix, iy), moving = il > 0.15;
  if (moving) {
    const sp = 3.6 * Math.min(1, il) / il;
    const dx = (FWD.x * iy + RIGHT.x * ix) * sp * dt, dz = (FWD.y * iy + RIGHT.y * ix) * sp * dt;
    moveBy(player, dx, dz, player.r);
    player.g.rotation.y = Math.atan2(dx, dz);
  }
  player.g.position.set(player.x, 0, player.z);
  animate(player, moving, dt);

  const room = roomAt(player.x, player.z);
  placeEl.textContent = `${AREA_INFO[cur.id].name}　${typeof room === 'string' ? room : room ? room.name : ''}`;
  goalEl.textContent = '目標：' + goal();

  if (!state.busy) for (const n of cur.npcs) updateNpc(n, dt);
  const inPrivate = !!(room && room.private);
  for (const n of cur.npcs) if (n.coneMat) n.coneMat.color.set(n.seeing && inPrivate ? '#ff5a4a' : '#ffe08a');
  if (!state.busy) addSusp(watchers().length && inPrivate ? 18 * dt : -4 * dt);
  suspEl.style.width = `${state.susp}%`;

  if (shelfAnim > 0 && shelfAnim < 1) {
    shelfAnim = Math.min(1, shelfAnim + dt * 0.6);
    areas.f2.shelf.hinge.rotation.y = Math.PI / 2 + Math.PI / 2 * (1 - (1 - shelfAnim) ** 2);
    areas.f2.secret.spot.intensity = 30 * shelfAnim;
  }
  if (cur.shelf) cur.shelf.red.material.emissiveIntensity = hiddenKnown() && !state.shelfOpen ? 0.6 + Math.sin(now / 300) * 0.4 : 0;

  updateCutaway(dt);

  camTarget.lerp(tmpV.set(player.x, 0, player.z), Math.min(1, dt * 5));
  camera.position.copy(camTarget).add(CAM_OFFSET);
  camera.lookAt(camTarget);
  sun.target.position.copy(camTarget);
  sun.position.copy(camTarget).add(new THREE.Vector3(-8, 16, 10));
  sun.target.updateMatrixWorld();

  target = state.busy ? null : findTarget();
  actBtn.classList.toggle('hidden', !target);
  if (target) actBtn.textContent = target.exit ? '移動' : target.npc ? '話す' : '調べる';
  const labels = cur.npcs.map(n => {
    const alert = n.seeing && inPrivate;
    return { x: n.x, y: 2.1, z: n.z, text: alert ? '！' : n.name, cls: alert ? 'alert' : 'name' };
  });
  if (target) {
    const [x, z] = target.at();
    labels.push({ x, z, y: target.npc ? 2.5 : 1.6, text: target.npc ? 'TALK' : target.exit ? target.label : '調べる', cls: target.exit ? 'exit' : '' });
  }
  drawLabels(labels);
  drawMinimap(room);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

enter('cottage', 2.5, 3);
requestAnimationFrame(tick);
say(['試作', '鷹宮邸の全体を歩ける探索試作です。朝礼を終え、使用人棟から屋敷へ向かおう。'],
  '移動は矢印キー／WASD（スマホは左下のスティック）、調べる・話す・移動はスペースキー（スマホは右下のボタン）。',
  '書斎などの私室で、巡回中のメイドの視界（黄色い扇形）に入ると疑われる。手がかりを集め、隠された絵を探そう。');

window.__explore = { state, player, areas, travel, enter, blocked: (x, z, r) => blocked(x, z, r), get cur() { return cur; } };
