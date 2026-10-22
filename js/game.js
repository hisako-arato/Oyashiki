// ゲーム進行と画面描画
import { PEOPLE, ROOMS, CHORES, CLUES, MAIDS, FAMILY, ALLY_AFF, PASSCODE, START_HOUR, END_HOUR, MAID_CAPACITY } from './data.js';
import { newState, save, load, clearSave, clamp, applyFx, setFlag, dayIndex, activeMaids, isAlly,
  generateChores, buildPlan, maidLoad, maidHours, whereIs, peopleIn, hoursLeft, dateLabel,
  fatherHome, motherOutDay } from './state.js';
import { SPOTS, pickTalk } from './actions.js';
import { PROLOGUE, WEEKENDS, ROUTES, ENDINGS } from './story.js';

const CHAPTER_TITLES = ['第1章　9月　情報収集', '第2章　10月　隠し部屋', '第3章　11月　月下の庭', '最終章　12月　決行'];
const FORGERY_DAYS = 8;

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
    el('div', { class: 'bar' }, el('i', { style: `width:${value}%` })), el('b', {}, String(value)));
}
function statusBar() {
  const hour = s.phase === 'day' ? `　${s.today.hour}:00` : '';
  return el('header', { class: 'status' },
    el('div', { class: 'date' }, dateLabel(s) + hour),
    meter('心象', s.trust, 'trust'), meter('疑惑', s.susp, 'susp'),
    el('button', { class: 'ghost', onclick: openNotebook }, '手帳'));
}
function modal(...content) {
  const back = el('div', { class: 'modal-back' });
  const box = el('div', { class: 'modal' }, ...content);
  back.append(box);
  back.addEventListener('click', e => { if (e.target === back) back.remove(); });
  document.body.append(back);
  return back;
}
function toast(text) {
  const t = el('div', { class: 'toast' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

// ---- タイトル ----
export function title() {
  const saved = load();
  render(el('div', { class: 'title' },
    el('p', { class: 'sub' }, 'お屋敷の宝を盗み出す物語'),
    el('h1', {}, 'OYASHIKI'),
    el('p', { class: 'sub2' }, '執事と月下の絵'),
    el('div', { class: 'menu' },
      saved && saved.phase !== 'ending' ? el('button', { onclick: () => resume(saved) }, 'つづきから') : null,
      el('button', { onclick: startNew }, 'はじめから')),
    el('p', { class: 'note' }, '試作版')));
}

function startNew() {
  s = newState();
  playScript(PROLOGUE, () => chapterIntro());
}

function resume(saved) {
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
    if (Array.isArray(st)) return showLine(st[0], st[1], next);
    if (st.fx) { const notes = applyFx(s, st.fx); if (notes.length) toast(notes.join('／')); return next(); }
    if (st.if) { queue.unshift(...((st.if(s) ? st.then : st.else) || [])); return next(); }
    if (st.report) return showReport(next);
    if (st.choice) return showChoice(st.choice, c => {
      const notes = applyFx(s, c.fx);
      if (notes.length) toast(notes.join('／'));
      queue.unshift(...(c.then || []));
      next();
    });
    next();
  };
  next();
}

function stage(who, content) {
  const p = PEOPLE[who];
  return el('div', { class: 'stage' },
    s && s.phase !== 'prologue' ? statusBar() : null,
    el('div', { class: 'scene' },
      p ? el('div', { class: 'portrait', style: `--c:${p.color}` }, p.name.slice(0, 1)) : null),
    el('div', { class: 'textbox' }, p ? el('div', { class: 'speaker', style: `--c:${p.color}` }, p.name) : null, content));
}

function showLine(who, text, next) {
  const box = stage(who === 'n' ? null : who, el('p', { class: who === 'n' ? 'narr' : '' }, text, el('span', { class: 'cursor' }, '▼')));
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
  const people = [...FAMILY, ...activeMaids(s)];
  return el('div', { class: 'affs' }, people.map(p => el('div', { class: 'aff' }, badge(p),
    el('div', { class: 'bar' }, el('i', { style: `width:${s.aff[p]}%;background:${PEOPLE[p].color}` })),
    el('b', {}, String(s.aff[p])), isAlly(s, p) ? el('small', { class: 'ally' }, '協力者') : null)));
}

// ---- 章の進行 ----
function chapterIntro() {
  s.phase = 'intro';
  const card = el('div', { class: 'card' }, el('h2', {}, CHAPTER_TITLES[s.chapter]), el('p', {}, 'タップで開始'));
  card.addEventListener('click', startWeekday, { once: true });
  render(card);
}

function startWeekday() {
  s.phase = 'meeting';
  if (!s.today || s.today.dayIndex !== dayIndex(s)) {
    s.today = { dayIndex: dayIndex(s), chores: generateChores(s), hour: START_HOUR, loc: 'servants', talked: {}, log: [], plan: {}, escort: null };
  }
  save(s);
  renderMeeting();
}

// ---- メイド定例会議 ----
function renderMeeting() {
  const t = s.today;
  const maids = activeMaids(s);
  const info = [
    `お父様：${fatherHome(s) ? '終日在宅（書斎）' : '出勤'}`,
    `お母様：${motherOutDay(s) ? 'エステで外出' : '在宅（午前 大広間／午後 主寝室）'}`,
    `お嬢様：午前は大学、午後は${s.day % 2 === 0 ? '大広間' : '自室'}`,
  ];
  const butlerHours = t.chores.filter(c => c.assignee === 'butler').reduce((a, c) => a + CHORES[c.id].hours, 0);
  const rows = t.chores.map((c, i) => {
    const def = CHORES[c.id];
    const opts = def.butlerOnly
      ? [['butler', '執事が引き受ける'], [null, '今日は断る']]
      : [[null, '― 未割当 ―'], ['butler', `執事（${def.hours}h）`], ...maids.map(m => [m, `${PEOPLE[m].name}（${maidHours(m, c)}h）`])];
    const sel = el('select', { onchange: e => { c.assignee = e.target.value || null; renderMeeting(); } },
      opts.map(([v, label]) => el('option', { value: v || '', selected: c.assignee === v }, label)));
    return el('tr', {}, el('td', {}, def.name, def.optional ? el('small', {}, '（任意）') : null),
      el('td', {}, ROOMS[def.room] ? ROOMS[def.room].name : '外出'), el('td', {}, sel));
  });
  const loads = maids.map(m => {
    const l = maidLoad(s, m);
    return el('div', { class: `load ${l > MAID_CAPACITY ? 'over' : ''}` }, badge(m), ` ${l}/${MAID_CAPACITY}h`);
  });
  render(el('div', { class: 'panel' }, statusBar(),
    el('h2', {}, 'メイド定例会議'),
    el('ul', { class: 'info' }, info.map(i => el('li', {}, i))),
    el('table', { class: 'chores' }, el('tr', {}, el('th', {}, '仕事'), el('th', {}, '場所'), el('th', {}, '担当')), rows),
    el('div', { class: 'loads' }, loads, el('div', { class: 'load' }, badge('butler'), ` ${butlerHours}/${END_HOUR - START_HOUR}h`)),
    el('button', { class: 'ghost', onclick: () => { autoAssign(s); renderMeeting(); } }, 'おまかせで割り振る'),
    el('p', { class: 'hint' }, 'メイドは担当した部屋で働く。調べたい部屋にメイドを置かないのがコツ。8時間を超えた仕事は終わらない。'),
    el('button', { class: 'primary', onclick: beginDay }, '会議を終えて仕事を始める')));
}

// 得意な仕事を、余裕のあるメイドから順に割り振る。収まらない分は執事
function autoAssign(s) {
  const chores = s.today.chores.filter(c => !CHORES[c.id].butlerOnly);
  chores.forEach(c => { c.assignee = null; });
  chores.sort((a, b) => CHORES[b.id].hours - CHORES[a.id].hours);
  for (const c of chores) {
    const best = activeMaids(s)
      .filter(m => maidLoad(s, m) + maidHours(m, c) <= MAID_CAPACITY)
      .sort((a, b) => maidHours(a, c) - maidHours(b, c) || maidLoad(s, a) - maidLoad(s, b))[0];
    c.assignee = best || 'butler';
  }
}

function beginDay() {
  buildPlan(s);
  s.phase = 'day';
  renderDay();
}

// ---- 執事パート ----
function renderDay(msg) {
  const t = s.today;
  if (t.hour >= END_HOUR) return endDay();
  const room = t.loc;
  const here = peopleIn(s, room);
  const floors = [2, 1].map(f => el('div', { class: 'floor' }, el('h3', {}, `${f}F`),
    el('div', { class: 'rooms' }, Object.entries(ROOMS).filter(([id, r]) => r.floor === f && (!r.secret || s.flags.hidden_open)).map(([id, r]) => {
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
    let ok = true, why = '';
    const partner = def.with && whereIs(s, def.with, t.hour);
    if (def.with && (partner === 'out' || (def.room !== 'out' && partner !== def.room))) { ok = false; why = `（${PEOPLE[def.with].name}が不在）`; }
    if (def.after && t.hour < def.after) { ok = false; why = `（${def.after}時以降）`; }
    actions.push(el('button', { class: 'work', disabled: !ok, onclick: () => doChore(i) },
      `${def.name}をする（残り${def.hours - c.progress}h）${why}`));
  });
  // 調査
  for (const sp of SPOTS[room] || []) actions.push(el('button', { class: 'search', onclick: () => investigate(sp) }, `調べる：${sp.name}`));
  if (room === 'study' && s.flags.red_book && s.flags.key_hidden && !s.flags.hidden_open)
    actions.push(el('button', { class: 'search', onclick: openHidden }, '赤い本を引き、鍵を使う'));
  // 会話
  for (const p of here) actions.push(el('button', { class: 'talk', disabled: !!t.talked[p], onclick: () => talk(p) }, `話す：${PEOPLE[p].name}`));

  const pending = t.chores.filter(c => c.assignee === 'butler' && !c.done);
  render(el('div', { class: 'panel day' }, statusBar(),
    msg ? el('div', { class: 'msg' }, msg) : null,
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
  if (t.loc === 'hidden' && id !== 'study') return renderDay('隠し部屋からは書斎にしか戻れない。');
  if (id === 'hidden') {
    if (t.loc !== 'study') return renderDay('隠し部屋へは書斎から入る。');
    if (witnesses('study').length) return renderDay('人の目がある。今は入れない。');
  }
  t.loc = id;
  const r = ROOMS[id];
  const hasWork = t.chores.some(c => c.assignee === 'butler' && !c.done && CHORES[c.id].room === id);
  if (r.owner && r.owner !== 'father' && whereIs(s, r.owner, t.hour) === id && !hasWork) {
    const notes = applyFx(s, { susp: 5, aff: { [r.owner]: -2 } });
    return renderDay(`${PEOPLE[r.owner].name}「……何か用？」　${notes.join('／')}`);
  }
  renderDay();
}

function witnesses(room) {
  return peopleIn(s, room).filter(p => !isAlly(s, p));
}

function spend(h) {
  s.today.hour = Math.min(END_HOUR, s.today.hour + h);
}

function doChore(i) {
  const t = s.today, c = t.chores[i], def = CHORES[c.id];
  const h = Math.min(def.hours - c.progress, hoursLeft(s));
  if (def.with) t.escort = { who: def.with, from: t.hour, to: t.hour + h, room: def.room === 'out' ? 'out' : def.room };
  c.progress += h;
  spend(h);
  let msg = `${def.name}を${c.progress >= def.hours ? '終えた' : '途中まで進めた'}。`;
  if (c.progress >= def.hours) {
    c.done = true;
    if (c.id === 'escortM') msg += ' ' + applyFx(s, { aff: { mother: 8 } }).join('／');
    if (c.id === 'tutorD') msg += ' ' + applyFx(s, { aff: { daughter: 6 } }).join('／');
    if (c.id === 'laundry' && s.chapter >= 1 && setFlag(s, 'p_bday'))
      msg += ' 旦那様のスーツのポケットに、花屋の領収書が入っていた。「麗子様 お誕生日 11月3日」……。（手帳に記録した）';
  }
  renderDay(msg);
}

function investigate(sp) {
  const room = s.today.loc;
  const seen = witnesses(room);
  spend(1);
  const res = sp.run(s);
  let msg = res.text;
  if (seen.length) {
    const amount = Math.min(25, seen.length * (seen.includes('father') ? 20 : 10));
    msg += `　……${seen.map(p => PEOPLE[p].name).join('、')}に見られた！ ` + applyFx(s, { susp: amount }).join('／');
  }
  if (res.code) return askCode(msg);
  if (res.clue) toast('手帳に記録した');
  checkFatal() || renderDay(msg);
}

function askCode(msg) {
  const input = el('input', { type: 'text', inputmode: 'numeric', maxlength: '4', placeholder: '0000', class: 'code' });
  const hints = ['p_lover', 'p_bday'].filter(f => s.flags[f]).map(f => el('li', {}, CLUES[f].text));
  const back = modal(el('h3', {}, 'ダイヤル錠'), el('p', {}, '4桁の数字を合わせる。'),
    hints.length ? el('ul', { class: 'clues' }, hints) : el('p', { class: 'hint' }, '手がかりがない。適当に回しても開きそうにない。'),
    input,
    el('div', { class: 'row' },
      el('button', { onclick: () => {
        back.remove();
        if (input.value === PASSCODE) { setFlag(s, 'key_hidden'); toast('手帳に記録した'); renderDay('カチリ、と錠が外れた。中には古びた真鍮の鍵が入っていた。'); }
        else renderDay(msg + '　……開かない。');
      } }, '合わせる'),
      el('button', { class: 'ghost', onclick: () => { back.remove(); renderDay(msg); } }, 'やめる')));
  input.focus();
}

function openHidden() {
  if (s.chapter < 2) return renderDay('本を引こうとして、手が止まった。……まだ早い。もう少し屋敷の様子を探ってからだ。');
  if (witnesses('study').length) return renderDay('人の目がある。今はできない。');
  spend(1);
  s.flags.hidden_open = true;
  s.today.loc = 'hidden';
  renderDay('赤い本を引くと、本棚の奥で何かが外れる音がした。鍵を差し込むと、棚がゆっくりと動き、暗い小部屋が現れた。');
}

function talk(p) {
  const t = s.today;
  t.talked[p] = true;
  spend(1);
  const tk = pickTalk(s, p);
  const fx = p === 'father' ? { trust: 2 } : { aff: { [p]: 3 } };
  const notes = applyFx(s, fx);
  if (tk.flag) { setFlag(s, tk.flag); notes.push('手帳に記録した'); }
  const msg = `${PEOPLE[p].name}${tk.line}　${notes.join('／')}`;
  if (tk.forgery) {
    const back = modal(el('p', {}, msg), el('p', {}, '青メイドに「月下の庭」の模写を頼みますか？ 絵の特徴は口頭で伝える。'),
      el('div', { class: 'row' },
        el('button', { onclick: () => { back.remove(); setFlag(s, 'forgery_start'); s.forgeryDay = dayIndex(s); renderDay('青メイドは目を輝かせて引き受けてくれた。完成まで8日ほどかかるらしい。'); } }, '頼む'),
        el('button', { class: 'ghost', onclick: () => { back.remove(); renderDay(msg); } }, 'やめておく')));
    return;
  }
  renderDay(msg);
}

// ---- 1日の終わり ----
function endDay() {
  const t = s.today;
  const lines = [];
  let trust = 0;
  const maidFx = {};
  for (const c of t.chores) {
    const def = CHORES[c.id];
    if (c.assignee === 'butler' && c.progress >= def.hours) c.done = true;
    if (c.done && !c.failed) { trust += 1; s.weekStats.done++; lines.push(`○ ${def.name}`); }
    else if (c.failed) { trust -= 2; s.weekStats.done++; lines.push(`△ ${def.name}（青メイドが失敗）`); }
    else if (!def.optional) { trust -= c.id === 'cook' ? 10 : 5; s.weekStats.missed++; lines.push(`× ${def.name}${c.overload ? '（時間内に終わらず）' : ''}`); }
    if (MAIDS.includes(c.assignee)) {
      const m = c.assignee;
      maidFx[m] = (maidFx[m] || 0) + (c.overload ? -4 : (def.type === 'art' && m === 'blue') ? 2 : maidHours(m, c) < def.hours ? 1 : 0);
    }
  }
  for (const m of activeMaids(s)) if (!(m in maidFx) && m !== 'red') maidFx[m] = -1;
  const notes = applyFx(s, { trust: Math.min(trust, 2), aff: maidFx, susp: -2 });
  if (s.flags.forgery_start && !s.flags.forgery_ready && dayIndex(s) - s.forgeryDay >= FORGERY_DAYS) {
    setFlag(s, 'forgery_ready');
    notes.push('青メイドの模写が完成した！');
  }
  if (checkFatal()) return;
  render(el('div', { class: 'panel' }, statusBar(),
    el('h2', {}, '本日の業務報告'),
    el('ul', { class: 'report' }, lines.map(l => el('li', {}, l))),
    el('p', { class: 'hint' }, notes.join('／')),
    el('button', { class: 'primary', onclick: nextDay }, '次へ')));
}

function nextDay() {
  s.day++;
  s.today = null;
  if (s.day >= 5) return startWeekend();
  startWeekday();
}

function checkFatal() {
  if (s.trust <= 0) { ending('fired'); return true; }
  if (s.susp >= 100) { ending('exposed'); return true; }
  return false;
}

// ---- 週末（物語パート） ----
function startWeekend() {
  s.phase = 'weekend';
  save(s);
  if (s.chapter === 3 && s.week === 3) return execution();
  playScript(WEEKENDS[s.chapter][s.week], afterWeekend);
}

function afterWeekend() {
  s.day = 0;
  s.week++;
  if (s.week >= 4) { s.week = 0; s.chapter++; return chapterIntro(); }
  startWeekday();
}

// ---- 決行 ----
function execution() {
  const avail = ROUTES.filter(r => r.ok(s));
  const intro = [
    ['n', '12月26日、深夜。会食の客も帰り、屋敷は寝静まった。'],
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

function runRoute(id) {
  if (id === 'persuade') return ending('persuade');
  let alarmOff = false;
  const fail = text => playScript([['n', text]], () => ending('caught'));
  const toPainting = () => playScript([
    ['n', '書斎。上から5段目の赤い本を引き、鍵を差し込む。棚が音もなく動いた。'],
    ['butler', '（「月下の庭」……今、迎えに来た）'],
  ], () => {
    if (!alarmOff) return fail('額縁に手をかけた瞬間、甲高い警報が屋敷中に鳴り響いた。');
    if (id === 'night') return playScript([['n', '絵を布で包み、貨物エレベーターで1階へ。裏庭の闇を抜け、屋敷を後にした。']], () => ending('night'));
    playScript([
      ['n', '青の模写を額に収め、本物を布で包む。見た目には、何ひとつ変わらない。'],
      ['n', 'お嬢様の部屋のクローゼットに本物を隠し、執事は何食わぬ顔で自室に戻った。'],
      ['n', '数日後、休暇を取った執事は「母への贈り物」を受け取り、屋敷を去った。'],
    ], () => ending('swap'));
  });
  const path = () => {
    const opts = [
      { t: `大広間の大階段を上る${s.flags.hall_patrol ? '（黒メイドが見回っている）' : ''}`, go: () => fail('大広間に足を踏み入れた瞬間、懐中電灯の光が執事を照らした。「……執事さん？ こんな時間に何を」黒メイドだった。') },
      { t: '使用人用の階段を使う（赤メイドの部屋の前を通る）', go: () => s.aff.red >= ALLY_AFF
        ? playScript([['n', '赤メイドの部屋の扉が少し開いていた。目が合った気がしたが、彼女は寝返りを打っただけだった。']], toPainting)
        : fail('「……誰？」赤メイドの部屋に明かりが点いた。足音を聞かれてしまった。') },
    ];
    if (s.flags.elevator) opts.push({ t: '裏庭から倉庫へ回り、貨物エレベーターで2階へ', go: () => playScript([['n', '裏庭の死角を抜け、倉庫の貨物エレベーターへ。誰にも見られず、書斎横の物置に着いた。']], toPainting) });
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

// ---- 手帳 ----
function openNotebook() {
  if (!s) return;
  const got = Object.entries(CLUES).filter(([k]) => s.flags[k]);
  const goals = [
    !s.flags.hidden_room && '屋敷の構造を調べ、絵の隠し場所を突き止める',
    s.flags.hidden_room && !s.flags.red_book && '書斎の本棚に隠し扉の仕掛けがあるはずだ',
    s.flags.desk_lock && !s.flags.key_hidden && '机の引き出しのダイヤル錠を開ける番号を探す',
    s.flags.red_book && s.flags.key_hidden && !s.flags.found_painting && '人のいない時に、書斎から隠し部屋へ入る（11月以降）',
    s.flags.found_painting && !s.flags.white_ally && '絵の警報をどうにかする方法が要る',
  ].filter(Boolean);
  const back = modal(
    el('h3', {}, '手帳'),
    goals.length ? el('div', {}, el('h4', {}, 'いまの目標'), el('ul', {}, goals.map(g => el('li', {}, g)))) : null,
    el('h4', {}, '手がかり'),
    got.length ? el('ul', { class: 'clues' }, got.map(([, c]) => el('li', {}, c.text))) : el('p', {}, 'まだ何もない。'),
    el('h4', {}, '人物'), affList(),
    el('div', { class: 'row' },
      el('button', { onclick: () => back.remove() }, '閉じる'),
      el('button', { class: 'ghost', onclick: () => { back.remove(); if (confirm('タイトルに戻りますか？（その日の朝からやり直しになります）')) title(); } }, 'タイトルへ')));
}

// テスト用に状態を覗けるようにする
window.__oyashiki = { get state() { return s; }, set state(v) { s = v; } };
