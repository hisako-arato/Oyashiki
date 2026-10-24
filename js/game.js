// ゲーム進行と画面描画
import { PEOPLE, ROOMS, CHORES, CLUES, MAIDS, FAMILY, ALLY_AFF, PASSCODE, START_HOUR, END_HOUR, MAID_CAPACITY, BASEMENT_HINTS } from './data.js';
import { newState, save, load, clearSave, clamp, applyFx, fxNote, setFlag, dayIndex, activeMaids, isAlly,
  generateChores, buildPlan, maidLoad, maidHours, whereIs, peopleIn, hoursLeft, dateLabel,
  fatherHome, motherOutDay, rng, WEEKS_PER_CHAPTER } from './state.js';
import { SPOTS } from './actions.js';
import * as DL from './daylogic.js';
import { PROLOGUE, WEEKENDS, ROUTES, ENDINGS, ARRIVAL } from './story.js';
import { hasNight, nightOptions, nightScene } from './night.js';
import { morningEvents, joined } from './sister.js';
import { PROFILES, profileOf, STORY, storyText, chapterProgress } from './profiles.js';
import { faceOf } from './faces.js';
import { richNodes } from './richtext.js';
import { VERSION, VERSION_DATE } from './version.js';

const CHAPTER_TITLES = ['第1章　11月前半　情報収集', '第2章　11月後半　隠し部屋', '第3章　12月前半　月下の庭', '最終章　12月後半　決行'];

let s = null;
const app = () => document.getElementById('app');

// ---- DOM ヘルパー ----
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(k));
  return e;
}
function render(...nodes) { const a = app(); a.replaceChildren(...nodes); a.scrollTop = 0; window.scrollTo(0, 0); }
function badge(who) {
  const p = PEOPLE[who];
  return el('span', { class: 'badge', style: `--c:${p.color}` }, p.name);
}
function meter(label, value, cls) {
  return el('div', { class: `meter ${cls}` }, el('span', {}, label),
    el('div', { class: 'bar' }, el('i', { style: `width:${value}%` })), el('b', {}, String(Math.round(value))));
}
function statusBar() {
  const hour = s.phase === 'day' ? `　${s.today.hour}:${String(Math.floor(s.today.min || 0)).padStart(2, '0')}` : '';
  return el('header', { class: 'status' },
    el('div', { class: 'date' }, dateLabel(s) + hour),
    meter('心象', s.trust, 'trust'), meter('疑惑', s.susp, 'susp'),
    el('button', { class: 'ghost', onclick: () => openNotebook() }, 'メニュー'));
}
function modal(...content) {
  const back = el('div', { class: 'modal-back' });
  const box = el('div', { class: 'modal' }, ...content);
  back.append(box);
  // 外側をタップして閉じたときは onDismiss を呼ぶ（選ばずに閉じても、3Dの屋敷が入力待ちのまま止まらないように）
  back.addEventListener('click', e => { if (e.target === back) { back.remove(); if (back.onDismiss) back.onDismiss(); } });
  document.body.append(back);
  return back;
}
function toast(text) {
  const t = el('div', { class: `toast ${/〔/.test(text) ? 'fx-toast' : ''}` }, richNodes(text));
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

// ---- タイトル ----
export function title() {
  // ゲームの途中から戻ったときは、3Dの屋敷・人物照会・朝礼の重ね表示を閉じる
  if (day3d) day3d.leave();
  document.querySelectorAll('.viewer, .modal-back').forEach(e => e.remove());
  app().classList.remove('overlay');
  const saved = load();
  render(el('div', { class: 'title' },
    el('p', { class: 'sub' }, 'お屋敷の宝を盗み出す物語'),
    el('h1', {}, 'OYASHIKI'),
    el('p', { class: 'sub2' }, '執事と月下の絵'),
    el('div', { class: 'menu' },
      saved && saved.phase !== 'ending' ? el('button', { onclick: () => resume(saved) }, 'つづきから') : null,
      el('button', { onclick: startNew }, 'はじめから'),
      el('button', { class: 'ghost', onclick: titleSettings }, '設定')),
    el('p', { class: 'note' }, versionLabel())));
  // 新しい版で初めて起動したときに、一度だけ知らせる
  try {
    const seen = localStorage.getItem('oyashiki-version');
    if (seen && seen !== VERSION) toast(`バージョン ${VERSION} に更新しました`);
    localStorage.setItem('oyashiki-version', VERSION);
  } catch (e) { /* noop */ }
}

// ---- バージョンと更新 ----
const versionLabel = (v = VERSION, d = VERSION_DATE) => `バージョン ${v}（${d.replaceAll('-', '/')} 更新）`;
const newerThan = (a, b) => {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
// 公開ページの最新バージョンを聞く（オフラインなら null）
async function latestVersion() {
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}
// 端末に保存しているゲームのファイルを捨てて、最新版を読み込み直す（セーブと VRM は残す）
async function updateGame() {
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update().catch(() => {});
    if (window.caches) for (const k of await caches.keys()) if (!k.startsWith('oyashiki-vrm')) await caches.delete(k);
  } catch (e) { /* noop */ }
  location.reload();
}
// 「最新です」／「新しい版があります」と、更新ボタン
function updateBox() {
  const status = el('p', { class: 'hint' }, '最新の版を確認しています…');
  const btn = el('button', { class: 'ghost', onclick: () => { btn.disabled = true; btn.textContent = '更新しています…'; updateGame(); } }, '最新版に更新する');
  latestVersion().then(v => {
    if (!v) status.textContent = '最新の版を確認できなかった（オフラインかもしれない）。';
    else if (newerThan(v.version, VERSION)) {
      status.textContent = `新しい版（${v.version}）があります。`;
      status.className = 'notice'; btn.className = 'primary';
    } else status.textContent = 'いま遊んでいるのが最新です。';
  });
  return el('div', { class: 'update' }, status, btn,
    el('p', { class: 'hint' }, '更新しても、セーブデータとキャラクターのモデルはそのまま残る。'));
}
// キャラクター表示の切り替え（トップ画面とゲーム中の両方で使う）
function vrmChoice(after) {
  let vrmOn = true;
  try { vrmOn = localStorage.getItem('oyashiki-vrm') !== 'off'; } catch (e) { /* noop */ }
  const setVRM = on => {
    try { localStorage.setItem('oyashiki-vrm', on ? 'on' : 'off'); } catch (e) { /* noop */ }
    if (day3d) day3d.refreshCast();
    if (on) loadPortrait();
    after();
  };
  return [
    el('div', { class: 'choice2' },
      el('button', { class: vrmOn ? 'on' : 'ghost', onclick: () => setVRM(true) }, '3Dモデル（VRM）'),
      el('button', { class: vrmOn ? 'ghost' : 'on', onclick: () => setVRM(false) }, '簡易モデル（軽い）')),
    el('p', { class: 'hint' }, '動きが重いときは「簡易モデル」にすると軽くなる（会話の顔も簡易表示になる）。人物照会の3D表示は、どちらでも使える。'),
  ];
}
// トップ画面の設定
function titleSettings() {
  render(el('div', { class: 'panel settings' },
    el('h2', {}, '設定'),
    el('h4', {}, 'バージョン'),
    el('p', {}, versionLabel()),
    updateBox(),
    el('h4', {}, 'キャラクターの表示'),
    ...vrmChoice(titleSettings),
    el('button', { class: 'primary', onclick: title }, 'タイトルに戻る')));
}

function startNew() {
  loadPortrait();
  s = newState();
  playScript(PROLOGUE, () => chapterIntro());
}

function resume(saved) {
  loadPortrait();
  s = saved;
  if (s.phase === 'weekend') startWeekend();
  else startWeekday();
}

// ---- シナリオ再生 ----
function playScript(steps, done) {
  const queue = [...steps];
  const next = () => {
    if (!queue.length) return done();
    const st = queue.shift();
    if (Array.isArray(st)) return showLine(st[0], st[1], next, st[2]);
    if (st.fx) { const notes = applyFx(s, typeof st.fx === 'function' ? st.fx(s) : st.fx); if (notes.length) toast(fxNote(notes)); return next(); }
    if (st.call) { st.call(s); return next(); }
    if (st.if) { queue.unshift(...((st.if(s) ? st.then : st.else) || [])); return next(); }
    if (st.report) return showReport(next);
    if (st.choice) return showChoice(st.choice, c => {
      const notes = applyFx(s, c.fx);
      if (notes.length) toast(fxNote(notes));
      queue.unshift(...(c.then || []));
      next();
    });
    next();
  };
  next();
}

// 会話の顔：3D が使えて VRM を表示する設定なら、話し手の VRM を胸から上で映す（台詞に合わせて表情を変える）
let portrait = null;
// 二人きりのとき（話し手が「雫」）は部屋着。来た日の夜の呼び出しだけは、まだメイド服のまま
const VRM_OF = { shizuku: () => (s.counters.night_black ? 'black2' : 'black') };
const CAST_IDS = ['butler', 'father', 'mother', 'daughter', 'red', 'blue', 'white', 'black', 'black2', 'guard'];
function vrmOn() {
  if (!can3D() || new URLSearchParams(location.search).has('lowpoly')) return false;
  try { return localStorage.getItem('oyashiki-vrm') !== 'off'; } catch (e) { return true; }
}
function loadPortrait() {
  if (portrait || !vrmOn()) return;
  portrait = import('../explore/portrait.js').then(m => (portrait = m)).catch(e => { console.warn(e); portrait = null; });
}
function portraitFor(who, text, face) {
  const id = VRM_OF[who] ? VRM_OF[who]() : who;
  if (!portrait || portrait instanceof Promise || !vrmOn() || !CAST_IDS.includes(id)) return null;
  portrait.showPortrait(id, faceOf(text, face, who), /^（/.test(text) ? 0 : text.length);   // 心の声（…）では口を動かさない
  return portrait.portraitCanvas();
}

function stage(who, content, text = '', face) {
  const p = PEOPLE[who];
  const vrm = p ? portraitFor(who, text, face) : null;
  return el('div', { class: 'stage' },
    s && s.phase !== 'prologue' ? statusBar() : null,
    el('div', { class: `scene ${vrm ? 'has-vrm' : ''}` },
      p ? el('div', { class: 'portrait', style: `--c:${p.color}` }, p.name.slice(0, 1)) : null, vrm),
    el('div', { class: 'textbox' }, p ? el('div', { class: 'speaker', style: `--c:${p.color}` }, p.name) : null, content));
}

function showLine(who, text, next, face) {
  const box = stage(who === 'n' ? null : who, el('p', { class: who === 'n' ? 'narr' : '' }, text, el('span', { class: 'cursor' }, '▼')), text, face);
  box.addEventListener('click', next, { once: true });
  render(box);
}

function showChoice(choices, pick) {
  render(stage(null, el('div', { class: 'choices' },
    choices.map(c => el('button', { onclick: () => pick(c) }, c.t)))));
}

function showReport(next) {
  const w = s.weekStats;
  render(el('div', { class: 'panel' }, statusBar(),
    el('h2', {}, '今週の仕事の成果'),
    el('p', {}, `完了した仕事：${w.done}件　残した仕事：${w.missed}件`),
    el('p', {}, w.missed === 0 ? 'お屋敷は隅々まで行き届いていた。' : w.missed <= 3 ? 'いくつか手の回らない仕事があった。' : '屋敷のあちこちが荒れている……。'),
    affList(),
    el('button', { onclick: () => { s.weekStats = { done: 0, missed: 0 }; next(); } }, '次へ')));
}

function affList() {
  // 黒メイド（妹の雫）は好感度を持たない
  const people = [...FAMILY, ...activeMaids(s)].filter(p => !(p === 'black' && joined(s)));
  return el('div', { class: 'affs' }, people.map(p => el('div', { class: 'aff' }, badge(p),
    el('div', { class: 'bar' }, el('i', { style: `width:${s.aff[p]}%;background:${PEOPLE[p].color}` })),
    el('b', {}, String(s.aff[p])), isAlly(s, p) ? el('small', { class: 'ally' }, s.flags[`told_${p}`] ? '協力者・打ち明けた' : '協力者') : null)),
    joined(s) ? el('div', { class: 'aff' }, badge('black'), el('span', { class: 'sister' }, '＝ 妹の雫（いつでも密談できる）')) : null);
}

// ---- 章の進行 ----
function chapterIntro() {
  s.phase = 'intro';
  const card = el('div', { class: 'card' }, el('h2', {}, CHAPTER_TITLES[s.chapter]), el('p', {}, 'タップで開始'));
  card.addEventListener('click', startWeekday, { once: true });
  render(card);
}

async function startWeekday() {
  // 第3章の初日は、新しいメイド（妹の雫）がやって来る
  if (s.chapter >= 2 && !s.flags.shizuku) return playScript(ARRIVAL, startWeekday);
  s.phase = 'meeting';
  if (!s.today || s.today.dayIndex !== dayIndex(s)) {
    s.today = { dayIndex: dayIndex(s), chores: generateChores(s), hour: START_HOUR, min: 0, loc: 'servants', talked: {}, log: [], plan: {}, escort: null };
    s.today.notices = morningEvents(s);
  }
  if (checkFatal()) return;
  save(s);
  // 3Dの屋敷では、執事の部屋で目を覚まし、共用室の席に着いて朝礼を始める
  app().replaceChildren();
  if (await load3D()) {
    return day3d.startMorning(s, {
      openMeeting: (done, hint) => {
        app().classList.add('overlay');
        meetingHint = hint;
        renderMeeting(() => { meetingHint = null; buildPlan(s); s.phase = 'day'; app().classList.remove('overlay'); app().replaceChildren(); done(); });
      },
      endDay, fatal: checkFatal, notebook: openNotebook, askCode, askForgery, askChoice, toast,
    });
  }
  renderMeeting(beginDay);
}

// ---- 朝礼（メイドへの仕事の割り振り） ----
let meetingDone = null, meetingHint = null;
function renderMeeting(done = meetingDone) {
  meetingDone = done;
  const t = s.today;
  const maids = activeMaids(s);
  const info = [
    `お父様：${fatherHome(s) ? `終日在宅（書斎）${s.flags.b_found ? `。17時ごろ、地下へワインを取りに行く${s.chapter >= 3 ? '（保管庫の荷物も確かめる）' : ''}` : ''}` : '出勤'}`,
    `お母様：${motherOutDay(s) ? 'エステで外出' : '在宅（午前 大広間／午後 主寝室）'}`,
    `お嬢様：午前は大学、午後は${s.day % 2 === 0 ? '大広間' : '自室'}`,
  ];
  const butlerHours = t.chores.filter(c => c.assignee === 'butler').reduce((a, c) => a + CHORES[c.id].hours, 0);
  const rows = t.chores.map((c, i) => {
    const def = CHORES[c.id];
    const opts = def.butlerOnly
      ? [['butler', '執事が引き受ける'], [null, '今日は断る']]
      : [[null, '― 未割当 ―'], ['butler', `執事（${def.hours}h）`], ...maids.map(m => [m, `${PEOPLE[m].name}（${maidHours(m, c)}h）`])];
    const sel = el('select', { disabled: !!c.forced, onchange: e => { c.assignee = e.target.value || null; renderMeeting(); } },
      opts.map(([v, label]) => el('option', { value: v || '', selected: c.assignee === v }, label)));
    return el('tr', {}, el('td', {}, def.name, def.optional ? el('small', {}, '（任意）') : null),
      el('td', {}, ROOMS[def.room] ? ROOMS[def.room].name : '外出'), el('td', {}, sel));
  });
  const loads = maids.map(m => {
    const l = maidLoad(s, m);
    return el('div', { class: `load ${l > MAID_CAPACITY ? 'over' : ''}` }, badge(m), ` ${l}/${MAID_CAPACITY}h`);
  });
  render(el('div', { class: 'panel' }, statusBar(),
    el('h2', {}, '朝礼'),
    meetingHint ? el('p', { class: 'tutorial' }, meetingHint) : null,
    (t.notices || []).map(n => el('p', { class: 'notice' }, n)),
    el('ul', { class: 'info' }, info.map(i => el('li', {}, i))),
    el('table', { class: 'chores' }, el('tr', {}, el('th', {}, '仕事'), el('th', {}, '場所'), el('th', {}, '担当')), rows),
    el('div', { class: 'loads' }, loads, el('div', { class: 'load' }, badge('butler'), ` ${butlerHours}/${END_HOUR - START_HOUR}h`)),
    el('button', { class: 'ghost', onclick: () => { autoAssign(s); renderMeeting(); } }, 'おまかせで割り振る'),
    el('p', { class: 'hint' }, 'メイドは担当した部屋で働く。調べたい部屋にメイドを置かないのがコツ。8時間を超えた仕事は終わらない。'),
    el('button', { class: 'primary', onclick: () => meetingDone() }, '朝礼を終えて仕事を始める')));
}

// 得意な仕事を、余裕のあるメイドから順に割り振る。収まらない分は執事
function autoAssign(s) {
  const chores = s.today.chores.filter(c => !CHORES[c.id].butlerOnly && !c.forced);
  chores.forEach(c => { c.assignee = null; });
  chores.sort((a, b) => CHORES[b.id].hours - CHORES[a.id].hours);
  for (const c of chores) {
    const best = activeMaids(s)
      .filter(m => maidLoad(s, m) + maidHours(m, c) <= MAID_CAPACITY)
      .sort((a, b) => maidHours(a, c) - maidHours(b, c) || maidLoad(s, a) - maidLoad(s, b))[0];
    c.assignee = best || 'butler';
  }
}

// 執事パートは3Dの屋敷で遊ぶ。3D描画が使えない端末や ?2d を付けたときはボタン式の画面
let day3d = null;
function can3D() {
  if (new URLSearchParams(location.search).has('2d')) return false;
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}
async function load3D() {
  if (!can3D()) return false;
  const loading = document.getElementById('loading3d');
  try {
    if (!day3d) { loading.classList.remove('hidden'); day3d = await import('../explore/day3d.js'); }
    return true;
  } catch (e) {
    console.error(e);
    return false;
  } finally {
    loading.classList.add('hidden');
  }
}
// ボタン式の画面のとき
function beginDay() {
  buildPlan(s);
  s.phase = 'day';
  renderDay();
}

// ---- 執事パート ----
function renderDay(msg) {
  const t = s.today;
  if (t.hour >= END_HOUR) return endDay();
  const wine = wineCheck();
  if (wine) { msg = msg ? `${msg}　${wine}` : wine; if (checkFatal()) return; }
  if (DL.isUnder(t.loc) && fatherHome(s) && t.hour === DL.WINE_HOUR - 1 && !t.wineDone) msg = `${msg ? msg + '　' : ''}（そろそろ旦那様がワインを取りに降りてくる時間だ。貯蔵庫にいると見つかる）`;
  const room = t.loc;
  const here = peopleIn(s, room);
  const shown = r => !r.secret || s.flags[r.reveal];
  const floors = [2, 1, 0].filter(f => Object.values(ROOMS).some(r => r.floor === f && shown(r))).map(f => el('div', { class: 'floor' }, el('h3', {}, f ? `${f}F` : 'B1（地下）'),
    el('div', { class: 'rooms' }, Object.entries(ROOMS).filter(([id, r]) => r.floor === f && shown(r)).map(([id, r]) => {
      const ppl = peopleIn(s, id);
      return el('button', { class: `room ${id === room ? 'here' : ''} ${r.owner ? 'private' : ''}`, onclick: () => move(id) },
        el('span', {}, r.name), el('span', { class: 'dots' }, ppl.map(p => el('i', { style: `--c:${PEOPLE[p].color}`, title: PEOPLE[p].name }))));
    }))));

  const actions = [];
  // 自分の担当の仕事
  t.chores.forEach((c, i) => {
    const def = CHORES[c.id];
    if (c.assignee !== 'butler' || c.done) return;
    const at = def.room === 'out' ? 'hall' : def.room;
    if (at !== room) return;
    const { ok, why } = DL.choreAvailability(s, c);
    actions.push(el('button', { class: 'work', disabled: !ok, onclick: () => renderDay(DL.doChore(s, i)) },
      `${def.name}をする（残り${def.hours - c.progress}h）${why ? `（${why}）` : ''}`));
  });
  // 調査
  for (const sp of SPOTS[room] || []) actions.push(el('button', { class: 'search', onclick: () => investigate(sp) }, `調べる：${sp.name}`));
  if (room === 'study' && s.flags.red_book && s.flags.key_hidden && !s.flags.hidden_open)
    actions.push(el('button', { class: 'search', onclick: openHidden }, '赤い本を引き、鍵を使う'));
  if (room === 'archive' && s.flags.b_hatch)
    actions.push(el('button', { class: 'search', onclick: () => {
      const why = DL.openHatch(s, DL.witnessesIn(s, 'archive'));
      if (why) return renderDay(why);
      t.loc = 'cellar';
      renderDay('床の扉を開け、懐中電灯を手に石段を降りた。……ひんやりとした空気。古いワイン貯蔵庫だ。上がるときは、人に見られないよう気をつけなければ。');
    } }, '床の扉を開けて地下へ降りる'));
  // 会話
  for (const p of here) actions.push(el('button', { class: 'talk', disabled: !!t.talked[p], onclick: () => talk(p) }, `話す：${PEOPLE[p].name}`));

  const pending = t.chores.filter(c => c.assignee === 'butler' && !c.done);
  render(el('div', { class: 'panel day' }, statusBar(),
    msg ? el('div', { class: 'msg' }, richNodes(msg)) : null,
    el('section', { class: 'current' },
      el('h2', {}, ROOMS[room].name),
      el('p', { class: 'who' }, here.length ? ['ここにいる人：', ...here.map(badge)] : '誰もいない。'),
      el('div', { class: 'actions' }, actions.length ? actions : el('p', {}, 'ここでできることはない。'))),
    el('section', { class: 'map' }, floors),
    el('p', { class: 'hint' }, `残り${hoursLeft(s)}時間。執事の未完了の仕事：${pending.length ? pending.map(c => CHORES[c.id].name).join('、') : 'なし'}`),
    el('button', { class: 'ghost', onclick: () => { if (confirm('今日の業務を終えますか？')) endDay(); } }, '今日の業務を終える')));
}

function move(id) {
  const t = s.today;
  if (id === t.loc) return;
  // 地下：資料室の床の扉から出入りする（搬入路の鉄格子を外せば、庭の古井戸からも）。奥の保管庫へは貯蔵庫から
  const under = DL.isUnder(t.loc), toUnder = DL.isUnder(id);
  if (toUnder && !under) return renderDay('地下へは、資料室の床の扉から降りる。');
  if (id === 'vault' && t.loc !== 'cellar') return renderDay('保管庫へは、ワイン貯蔵庫の隠し扉から入る。');
  if (under && !toUnder) {
    const out = t.loc === 'cellar' ? 'archive' : s.flags.b_grate ? 'garden' : null;
    if (id !== out && !(t.loc === 'vault' && id === 'archive')) return renderDay(out ? `地上へは${ROOMS[out].name}${t.loc === 'cellar' ? '' : '（古井戸）'}にしか出られない。` : '地上へは、ワイン貯蔵庫の石段から戻る。');
    if (t.loc === 'vault' && id === 'archive') return renderDay('資料室へは、ワイン貯蔵庫の石段から戻る。');
    return climbUp(id, msg => { if (msg !== null) renderDay(msg); });
  }
  if (t.loc === 'hidden' && id !== 'study') return renderDay('隠し部屋からは書斎にしか戻れない。');
  if (id === 'hidden') {
    if (t.loc !== 'study') return renderDay('隠し部屋へは書斎から入る。');
    if (DL.witnessesIn(s, 'study').length) return renderDay('人の目がある。今は入れない。');
  }
  t.loc = id;
  const r = ROOMS[id];
  const hasWork = t.chores.some(c => c.assignee === 'butler' && !c.done && CHORES[c.id].room === id);
  if (r.owner && r.owner !== 'father' && whereIs(s, r.owner, t.hour) === id && !hasWork) return renderDay(DL.intrude(s, r.owner));
  renderDay();
}

function investigate(sp) {
  const seen = DL.witnessesIn(s, s.today.loc);
  DL.spendHours(s, 1);
  const res = DL.investigate(s, sp, seen);
  if (res.code) return askCode(res.msg, renderDay);
  if (res.clue) toast('手帳に記録した');
  checkFatal() || renderDay(res.msg);
}

// ダイヤル錠。done(文) で結果を返す（3Dの屋敷からも使う）
function askCode(msg, done) {
  const input = el('input', { type: 'text', inputmode: 'numeric', maxlength: '4', placeholder: '0000', class: 'code' });
  const hints = ['p_lover', 'p_bday'].filter(f => s.flags[f]).map(f => el('li', {}, CLUES[f].text));
  const back = modal(el('h3', {}, 'ダイヤル錠'), el('p', {}, '4桁の数字を合わせる。'),
    hints.length ? el('ul', { class: 'clues' }, hints) : el('p', { class: 'hint' }, '手がかりがない。適当に回しても開きそうにない。'),
    input,
    el('div', { class: 'row' },
      el('button', { onclick: () => {
        back.remove();
        if (DL.tryCode(s, input.value)) { toast('手帳に記録した'); done('カチリ、と錠が外れた。中には古びた真鍮の鍵が入っていた。'); }
        else done(msg + '　……開かない。');
      } }, '合わせる'),
      el('button', { class: 'ghost', onclick: () => { back.remove(); done(msg); } }, 'やめる')));
  back.onDismiss = () => done(msg);
  input.focus();
}

function openHidden() {
  if (s.chapter < 2) return renderDay('本を引こうとして、手が止まった。……まだ早い。もう少し屋敷の様子を探ってからだ。');
  const why = DL.openHidden(s, DL.witnessesIn(s, 'study'));
  if (why) return renderDay(why);
  DL.spendHours(s, 1);
  s.today.loc = 'hidden';
  renderDay('赤い本を引くと、本棚の奥で何かが外れる音がした。鍵を差し込むと、棚がゆっくりと動き、暗い小部屋が現れた。');
}

function talk(p) {
  DL.spendHours(s, 1);
  const { msg, forgery } = DL.talk(s, p, peopleIn(s, s.today.loc).filter(x => x !== p).length);
  if (forgery) return askForgery(msg, renderDay);
  renderDay(msg);
}

// 選択肢のモーダル。options は { t, run() → 結果の文 }（3Dの屋敷からも使う）
function askChoice(line, options, done) {
  const back = el('div', { class: 'modal-back' });
  const box = el('div', { class: 'modal' }, el('p', {}, line),
    el('div', { class: 'choices' }, options.map(o => el('button', { onclick: () => { back.remove(); done(o.run(), o); checkFatal(); } }, o.t))));
  back.append(box);
  document.body.append(back);
}
// ボタン式の画面：地下から地上（資料室・庭）へ上がる。上に人がいれば、待つか上がるかを選ぶ。見られたら言い訳
function climbUp(room, done) {
  const t = s.today;
  const go = () => {
    t.loc = room;
    const c = DL.caughtEmerging(s, room);
    if (!c) return done(room === 'archive' ? '床の扉を押し上げ、資料室に戻った。誰にも見られていない。' : '古井戸から這い出した。誰にも見られていない。');
    askChoice(c.line, c.options, msg => done(msg));
  };
  const l = DL.listenAbove(s, room);
  if (!l) return go();
  askChoice(l.line, l.options, (msg, o) => o.go ? go() : done(msg));
}
// ボタン式の画面：17時台、地下にいると旦那様が降りてくる（保管庫・搬入路に隠れていれば、やり過ごせる）
function wineCheck() {
  const t = s.today;
  if (!DL.isUnder(t.loc) || !DL.wineDue(s)) return null;
  return DL.fatherWine(s, t.loc === 'vault' ? (s.chapter >= 3 ? 'tunnel' : 'vault') : 'cellar');
}

// 青メイドへの模写の依頼（3Dの屋敷からも使う）
function askForgery(msg, done) {
  const back = modal(el('p', {}, msg), el('p', {}, '青メイドに「月下の庭」の模写を頼みますか？ 絵の特徴は口頭で伝える。'),
    el('div', { class: 'row' },
      el('button', { onclick: () => { back.remove(); done(DL.startForgery(s)); } }, '頼む'),
      el('button', { class: 'ghost', onclick: () => { back.remove(); done(msg); } }, 'やめておく')));
  back.onDismiss = () => done(msg);
}

// ---- 1日の終わり ----
function endDay() {
  const t = s.today;
  s.susp = Math.round(s.susp);
  const lines = [];
  let trust = 0;
  const maidFx = {};
  for (const c of t.chores) {
    const def = CHORES[c.id];
    if (c.assignee === 'butler' && c.progress >= def.hours) c.done = true;
    if (c.done && !c.failed) { trust += 1; s.weekStats.done++; lines.push(`○ ${def.name}`); if (def.xmas) setFlag(s, `deco_${c.id}`); }
    else if (c.failed) { trust -= 2; s.weekStats.done++; lines.push(`△ ${def.name}（青メイドが失敗）`); }
    else if (!def.optional) { trust -= c.id === 'cook' ? 10 : 5; s.weekStats.missed++; lines.push(`× ${def.name}${c.overload ? '（時間内に終わらず）' : ''}`); }
    if (MAIDS.includes(c.assignee)) {
      const m = c.assignee;
      maidFx[m] = (maidFx[m] || 0) + (c.overload ? -4 : (def.type === 'art' && m === 'blue') ? 4 : maidHours(m, c) < def.hours ? 2 : 0);
    }
  }
  for (const m of activeMaids(s)) if (!(m in maidFx) && m !== 'red') maidFx[m] = -1;
  if (joined(s)) delete maidFx.black;
  const notes = applyFx(s, { trust: Math.min(trust, 2), aff: maidFx, susp: -2 });

  if (s.flags.forgery_start && !s.flags.forgery_ready && dayIndex(s) - s.forgeryDay >= DL.FORGERY_DAYS) {
    setFlag(s, 'forgery_ready');
    notes.push('青メイドの模写が完成した！');
  }
  if (checkFatal()) return;
  render(el('div', { class: 'panel' }, statusBar(),
    el('h2', {}, '本日の業務報告'),
    el('ul', { class: 'report' }, lines.map(l => el('li', {}, l))),
    el('p', { class: 'hint' }, richNodes(fxNote(notes))),

    el('button', { class: 'primary', onclick: () => hasNight(s) ? night() : nextDay() }, '次へ')));
}

// ---- 夜（22時）：休む／密談／部屋を訪ねる ----
function night() {
  render(el('div', { class: 'panel night' }, statusBar(),
    el('h2', {}, '夜　22時'),
    el('p', { class: 'hint' }, '今夜はどう過ごす？（1つだけ選べる）'),
    el('div', { class: 'nightopts' }, nightOptions(s).map(o => el('button', { class: o.ok ? '' : 'ghost', disabled: !o.ok,
      onclick: () => { s.phase = 'night'; playScript(nightScene(s, o.id), () => checkFatal() || nextDay()); } },
      o.label, !o.ok ? el('small', {}, `（${o.why}）`) : null)))));
}

function nextDay() {
  s.day++;
  s.today = null;
  if (s.day >= 5) return startWeekend();
  startWeekday();
}

function checkFatal() {
  if (s.trust <= 0) { ending('fired'); return true; }
  if (s.susp >= 100) { ending(s.today && s.today.rumor ? 'sibling' : 'exposed'); return true; }
  return false;
}

// ---- 週末（物語パート） ----
function startWeekend() {
  s.phase = 'weekend';
  save(s);
  if (s.chapter === 3 && s.week === WEEKS_PER_CHAPTER - 1) return execution();
  playScript(WEEKENDS[s.chapter][s.week], afterWeekend);
}

function afterWeekend() {
  s.day = 0;
  s.week++;
  if (s.week >= WEEKS_PER_CHAPTER) { s.week = 0; s.chapter++; return chapterIntro(); }
  startWeekday();
}

// ---- 決行 ----
function execution() {
  const avail = ROUTES.filter(r => r.ok(s));
  const intro = [
    ['n', '12月24日、クリスマス・イブの深夜。パーティーの客も帰り、屋敷は寝静まった。'],
    ['butler', '（今夜しかない。明日の朝には、絵は梱包されて運び出される）'],
  ];
  playScript(intro, () => {
    if (!avail.length) return ending('timeup');
    render(el('div', { class: 'panel' }, statusBar(),
      el('h2', {}, '作戦を選ぶ'),
      ROUTES.map(r => el('button', { class: 'route', disabled: !r.ok(s), onclick: () => runRoute(r.id) },
        el('b', {}, r.name), el('small', {}, r.ok(s) ? r.desc : '条件が揃っていない')))));
  });
}

async function runRoute(id) {
  if (id === 'persuade' || id === 'deal') return ending(id);
  // 3Dの屋敷では、夜の屋敷を歩いて絵を盗み出す
  app().replaceChildren();
  if (await load3D()) return day3d.startNight(s, id, { ending, notebook: openNotebook, toast });
  let alarmOff = false;
  const fail = text => playScript([['n', text]], () => ending('caught'));
  const toPainting = () => playScript([
    ['n', '書斎。上から5段目の赤い本を引き、鍵を差し込む。棚が音もなく動いた。'],
    ['butler', '（「月下の庭」……今、迎えに来た）'],
  ], () => {
    if (!alarmOff) return fail('額縁に手をかけた瞬間、甲高い警報が屋敷中に鳴り響いた。');
    if (id === 'night') return playScript([['n', '絵を布で包み、バルコニーから梯子で前庭へ降りる。闇に紛れて、屋敷を後にした。']], () => ending('night'));
    playScript([
      ['n', '青の模写を額に収め、本物を布で包む。見た目には、何ひとつ変わらない。'],
      ['n', 'お嬢様の部屋のクローゼットに本物を隠し、執事は何食わぬ顔で自室に戻った。'],
      ['n', '数日後、休暇を取った執事は「母への贈り物」を受け取り、屋敷を去った。'],
    ], () => ending('swap'));
  });
  // 2階の廊下は、警備会社の巡回員が往復している。雫から癖を聞いていれば、背後を抜けられる
  const corridor = () => {
    if (s.flags.guard_info) return playScript([['n', '2階の廊下。巡回員の懐中電灯が、西の端で止まった。雫の言ったとおり、窓の外を眺めている。'],
      ['butler', '（今だ）'], ['n', '背後を音もなく抜け、書斎の扉に滑り込んだ。']], toPainting);
    const lucky = rng(dayIndex(s) * 131 + 17)() < 0.5;
    playScript([['n', '2階の廊下に、見慣れない懐中電灯の光が揺れている。警備会社の巡回員だ。']], () => showChoice([
      { t: '物陰で、巡回員が通り過ぎるのを待つ', ok: lucky }, { t: '巡回員が向こうを向いた隙に、書斎へ走る', ok: !lucky },
    ], o => o.ok ? playScript([['n', '光が遠ざかった。息を殺したまま、書斎の扉に滑り込んだ。']], toPainting)
      : fail('「誰だ！」懐中電灯の光が、まっすぐ執事を捉えた。巡回員の笛が、屋敷中に響き渡った。')));
  };
  const path = () => {
    const room = s.flags.eve_daughter ? 'お嬢様の部屋' : s.flags.eve_mother ? '主寝室' : null;
    const opts = [
      ...(room ? [{ t: `${room}から、そっと書斎へ向かう`, go: () => playScript([['n', `寝息を確かめ、${room}を抜け出した。`]], corridor) }] : []),
      // 夜は倉庫から資料室への扉に鍵が掛かる。屋敷に入るには、勝手口（赤メイドの前）か、地下の搬入路を通る
      { t: `${s.flags.b_grate && s.flags.b_found ? '古井戸から地下を抜けて屋敷に入り、' : '屋敷に入り、'}大広間の大階段を上る${s.flags.hall_patrol ? '（黒メイド――雫が見回っている）' : ''}`, go: () => {
        const way = s.flags.b_grate && s.flags.b_found ? 'tunnel' : s.aff.red >= ALLY_AFF ? 'back' : null;
        if (!way) return fail('倉庫の奥の扉には、夜は鍵が掛かっていた。勝手口に回ると、キッチン裏の赤メイドが振り返った。「……誰？」');
        const inside = way === 'tunnel'
          ? ['n', '古井戸の底の横穴から搬入路へ。保管庫を抜け、資料室の床の扉を下から押し上げた。誰にも見られていない。']
          : ['n', '勝手口から入る。仕込みをしていた赤メイドは、こちらを見ないふりをしてくれた。'];
        if (!isAlly(s, 'black')) return fail('大広間に足を踏み入れた瞬間、懐中電灯の光が執事を照らした。');
        playScript([inside, ['n', '大広間の懐中電灯の光は、執事の前でわざと逸らされた。すれ違いざま、雫が小さく頷いた。']], corridor);
      } },
      { t: '裏階段を使う（キッチン裏の赤メイドの前を通る）', go: () => s.aff.red >= ALLY_AFF
        ? playScript([['n', '仕込みをしていた赤メイドと目が合った気がしたが、彼女は黙って鍋に向き直った。']], corridor)
        : fail('「……誰？」キッチン裏の赤メイドが振り返った。足音を聞かれてしまった。') },
    ];
    if (s.flags.ladder) opts.push({ t: '倉庫の梯子を前庭に運び、バルコニーから2階へ', go: () => s.flags.balcony_open
      ? playScript([['n', '前庭の闇に梯子を立て、バルコニーへ登る。昼のうちに鍵を外しておいたガラス戸は、音もなく開いた。']], corridor)
      : fail('バルコニーのガラス戸には鍵が掛かっていた。こじ開けようとした音に、屋敷の明かりが灯った。') });
    showChoice(opts, o => o.go());
  };
  const breaker = () => {
    if (s.flags.white_ally) {
      alarmOff = true;
      return playScript([['white', '「（小声で）警報の系統、落としました。照明はそのままです」']], path);
    }
    playScript([['butler', '（まずは絵の警報だ。どうする……）']], () => showChoice([
      { t: 'キッチン裏の配電盤を自分で操作する', go: () => fail('どれが警報の系統か分からないまま切ったブレーカーは、屋敷全体の電源だった。真っ暗な屋敷に家族の悲鳴が響く。') },
      { t: '警報は気にせず進む', go: path },
    ], o => o.go()));
  };
  breaker();
}

// ---- エンディング ----
function ending(id) {
  const e = ENDINGS[id];
  s.phase = 'ending';
  playScript(e.lines, () => {
    if (e.good) clearSave();
    const retry = !e.good ? load() : null;
    render(el('div', { class: 'card end' },
      el('h2', {}, e.title),
      el('p', {}, e.good ? 'CLEAR' : ''),
      el('div', { class: 'menu' },
        retry ? el('button', { onclick: () => resume(retry) }, '直前のセーブからやり直す') : null,
        el('button', { onclick: title }, 'タイトルへ'))));
  });
}

// ---- メニュー（手帳・人物・ストーリー・設定） ----
const MENU_TABS = [['note', '手帳'], ['people', '人物'], ['story', 'ストーリー'], ['settings', '設定']];
function openNotebook(tab = 'note') {
  if (!s) return;
  document.querySelector('.modal-back.game-menu')?.remove();
  const body = el('div', { class: 'menu-body' });
  const tabs = el('div', { class: 'tabs' }, MENU_TABS.map(([id, label]) =>
    el('button', { class: id === tab ? 'on' : 'ghost', onclick: () => { back.remove(); openNotebook(id); } }, label)));
  const back = modal(tabs, body, el('div', { class: 'row' }, el('button', { onclick: () => back.remove() }, '閉じる')));
  back.classList.add('game-menu');
  body.append(...({ note: noteTab, people: peopleTab, story: storyTab, settings: settingsTab })[tab](back));
}

function noteTab() {
  const got = Object.entries(CLUES).filter(([k]) => s.flags[k]);
  const goals = [
    !s.flags.hidden_room && '屋敷の構造を調べ、絵の隠し場所を突き止める',
    s.flags.hidden_room && !s.flags.red_book && '書斎の本棚に隠し扉の仕掛けがあるはずだ',
    s.flags.desk_lock && !s.flags.key_hidden && '机の引き出しのダイヤル錠を開ける番号を探す',
    s.flags.red_book && s.flags.key_hidden && !s.flags.found_painting && '人のいない時に、書斎から隠し部屋へ入る（12月以降）',
    s.chapter >= 3 && s.flags.ladder && !s.flags.balcony_open && '昼のうちに、バルコニーのガラス戸の鍵を外しておく',
    s.flags.found_painting && !s.flags.white_ally && '絵の警報をどうにかする方法が要る',
    s.chapter >= 2 && BASEMENT_HINTS.filter(f => s.flags[f]).length >= 2 && !s.flags.b_hatch && '地下があるらしい。資料室の床を調べる',
    s.flags.b_hatch && !s.flags.b_key && '床の扉の鍵を手に入れる（旦那様が出かける日の、食料庫あたり？）',
    s.flags.b_hatch && !s.flags.b_light && '地下を照らす明かりが要る（倉庫の工具棚）',
    s.flags.b_found && !s.flags.b_vault && 'ワイン貯蔵庫の奥を調べる（旦那様が在宅の日は、17時台に降りてくる）',
    s.flags.b_key_lost && !s.flags.b_key && '地下の鍵を取り上げられた。新しい鍵を手に入れる（雫なら……）',
    s.flags.b_tunnel && !s.flags.b_grate && '搬入路の鉄格子を外す道具を探す（倉庫の工具棚）',
    s.chapter >= 3 && !(s.flags.eve_mother || s.flags.eve_daughter || s.flags.b_grate || s.aff.red >= ALLY_AFF || (s.flags.ladder && s.flags.balcony_open))
      && '決行の夜、屋敷に入る道を考える（夜は倉庫の奥の扉に鍵。勝手口の先には赤メイド）',
  ].filter(Boolean);
  return [
    goals.length ? el('div', {}, el('h4', {}, 'いまの目標'), el('ul', {}, goals.map(g => el('li', {}, g)))) : null,
    el('h4', {}, '手がかり'),
    got.length ? el('ul', { class: 'clues' }, got.map(([, c]) => el('li', {}, c.text))) : el('p', {}, 'まだ何もない。'),
    el('h4', {}, '好感度'), affList(),
    lookLine(),
  ];
}
// 屋敷の小物を、いくつ調べたか（3Dの屋敷で遊んでいるときだけ）
function lookLine() {
  if (!day3d || !day3d.lookStats) return null;
  const { seen, total } = day3d.lookStats();
  return total ? el('p', { class: 'hint' }, `屋敷で調べた物：${seen}／${total}`) : null;
}

function peopleTab(back) {
  return [
    el('p', { class: 'hint' }, can3D() ? 'タップすると、その人物を3Dで眺められる。' : '人物の情報（この端末では3D表示は使えない）。'),
    el('div', { class: 'people' }, PROFILES.map(p => {
      if (!p.shown(s)) return el('button', { class: 'person ghost', disabled: true }, el('b', {}, '？？？'), el('small', {}, 'まだ会っていない'));
      const pr = profileOf(p, s);
      return el('button', { class: 'person', style: `--c:${PEOPLE[p.id].color}`, onclick: () => { back.remove(); openPerson(p.id); } },
        el('b', {}, pr.name), el('small', {}, pr.age || '　'));
    })),
  ];
}

function storyTab() {
  return [
    el('p', { class: 'hint' }, `${dateLabel(s)}（${chapterProgress(s)}）`),
    ...STORY.filter(e => e.from(s)).map(e => el('section', { class: 'story' }, el('h4', {}, e.title), el('p', {}, storyText(e, s)))),
  ];
}

function settingsTab(back) {
  return [
    el('h4', {}, 'キャラクターの表示'),
    ...vrmChoice(() => { back.remove(); openNotebook('settings'); }),
    el('h4', {}, 'バージョン'),
    el('p', {}, versionLabel()),
    el('p', { class: 'hint' }, '更新はタイトル画面の「設定」から行う。'),
    el('h4', {}, 'ゲーム'),
    el('button', { class: 'ghost', onclick: () => { back.remove(); if (confirm('タイトルに戻りますか？（その日の朝からやり直しになります）')) title(); } }, 'タイトルへ戻る'),
  ];
}

// 人物照会：VRM を回したりズームしたりして眺める
// model：表示する VRM（雫は、再会のあとは「部屋着」black2 にも着替えられる）
async function openPerson(id, model = id) {
  const pr = profileOf(PROFILES.find(p => p.id === id), s);
  const canvas = el('canvas', { class: 'vcanvas' });
  const status = el('div', { class: 'vstatus' }, '読み込み中…');
  const aff = s.aff[id] != null && !(id === 'black' && joined(s));
  const faceBtns = el('div', { class: 'vbtns' }), poseBtns = el('div', { class: 'vbtns' }), turnRow = el('div', { class: 'vturn' });
  const info = el('div', { class: 'vinfo' },
    el('h3', {}, pr.name, pr.age ? el('small', {}, `　${pr.age}`) : null),
    el('p', {}, pr.text),
    aff ? el('div', { class: 'aff' }, badge(id), el('div', { class: 'bar' }, el('i', { style: `width:${s.aff[id]}%;background:${PEOPLE[id].color}` })),
      el('b', {}, String(s.aff[id])), isAlly(s, id) ? el('small', { class: 'ally' }, '協力者') : null) : null,
    pr.notes.length ? el('ul', { class: 'clues' }, pr.notes.map(n => el('li', {}, n))) : null);
  let viewer = null;
  const close = () => { viewer && viewer.close(); root.remove(); if (day3d) day3d.resume(); openNotebook('people'); };
  const root = el('div', { class: 'viewer' },
    el('div', { class: 'vstage' }, canvas, status,
      el('div', { class: 'vhelp' }, '1本指で上下左右に回す／2本指でズーム／ダブルタップで元に戻す'),
      el('button', { class: 'vclose', onclick: close }, '×')),
    el('div', { class: 'vpanel' }, outfitRow(), turnRow, faceBtns, poseBtns, info));
  document.body.append(root);
  function outfitRow() {
    if (id !== 'black' || !s.flags.shizuku_reunion) return null;
    const pick = m => { if (m === model) return; viewer && viewer.close(); root.remove(); openPerson(id, m); };
    return el('div', { class: 'vbtns' }, el('span', { class: 'hint' }, '服装'),
      ...[['black', 'メイド服'], ['black2', '部屋着']].map(([m, label]) => el('button', { class: m === model ? 'on' : 'ghost', onclick: () => pick(m) }, label)));
  }
  if (!can3D()) { canvas.remove(); status.textContent = 'この端末では3D表示が使えない。'; return; }
  if (day3d) day3d.suspend();
  try {
    const { openViewer, FACES, POSES } = await import('../explore/viewer.js');
    if (!root.isConnected) return;
    // 向き：スライダーで0〜360度、ボタンで正面・右・背面・左
    let sliding = false;
    const slider = el('input', { type: 'range', min: '0', max: '359', value: '0', 'aria-label': '向き' });
    slider.addEventListener('pointerdown', () => { sliding = true; });
    slider.addEventListener('pointerup', () => { sliding = false; });
    slider.addEventListener('input', () => viewer && viewer.setAngle(+slider.value));
    turnRow.append(el('span', {}, '向き'), slider,
      ...[['正面', 0], ['右', 270], ['背面', 180], ['左', 90]].map(([label, deg]) => el('button', { class: 'ghost', onclick: () => viewer.setAngle(deg, true) }, label)));
    viewer = openViewer(canvas, model, {
      onAngle: deg => { if (!sliding) slider.value = String(Math.round(deg) % 360); },
      onProgress: r => { status.textContent = `読み込み中… ${Math.round(r * 100)}%`; },
      onReady: () => status.remove(),
      onError: () => { status.textContent = '3Dモデルを読み込めなかった。'; },
    });
    const group = (box, list, set, extra) => {
      const btns = list.map(([k, label], i) => el('button', { class: i ? 'ghost' : 'on', onclick: e => {
        set(k); btns.forEach(b => b.className = b === e.currentTarget ? 'on' : 'ghost');
      } }, label));
      box.append(...btns, ...(extra || []));
    };
    group(faceBtns, FACES, f => viewer.setFace(f));
    group(poseBtns, POSES, p => viewer.setPose(p));
  } catch (e) {
    console.error(e);
    status.textContent = '3D表示を開けなかった。';
  }
}

// テスト用に状態を覗けるようにする
window.__oyashiki = { get state() { return s; }, set state(v) { s = v; } };
