// ゲーム状態と、状態にまつわる計算
import { PEOPLE, MAIDS, ALLY_AFF, CHORES, CHORE_POOL, CHORES_PER_CHAPTER, SPEED, XMAS,
  MAID_CAPACITY, BLUE_FAIL_RATE, SISTER, START_HOUR, END_HOUR, XMAS_POOL } from './data.js';

const SAVE_KEY = 'oyashiki-save-v1';

export function newState() {
  return {
    v: 1,
    chapter: 0, week: 0, day: 0,
    phase: 'prologue',
    trust: 60, susp: 0,
    aff: { father: 40, mother: 30, daughter: 30, red: 25, blue: 20, black: 15, white: 15 },
    flags: {}, counters: {},
    today: null,
    weekStats: { done: 0, missed: 0 },
    forgeryDay: null,
    ending: null,
  };
}

// ---- セーブ：5つの枠に、それぞれ別のプレイを自動で保存する ----
export const SLOTS = 5;
const slotKey = n => `oyashiki-save-v2-${n}`;
let slot = 1;                       // いま遊んでいる枠
export const currentSlot = () => slot;
export function useSlot(n) { slot = n; testing = false; }
// テストプレイ（タイトルの隠し入口から）：どの枠にも保存しない
let testing = false;
export const isTesting = () => testing;
export function setTesting(on) { testing = on; }
// 以前の1つだけのセーブは、枠1に移す
function migrate() {
  try {
    const old = localStorage.getItem(SAVE_KEY);
    if (old == null) return;
    if (localStorage.getItem(slotKey(1)) == null) localStorage.setItem(slotKey(1), old);
    localStorage.removeItem(SAVE_KEY);
  } catch (e) { /* noop */ }
}
export function save(s, n = slot) {
  if (testing) return;
  s.savedAt = Date.now();
  try { localStorage.setItem(slotKey(n), JSON.stringify(s)); } catch (e) { /* 保存できない環境でも続行 */ }
}
// イブの朝の自動セーブ（枠ごとに1つ）。結末の画面から「イブの朝からやり直す」
const eveKey = n => `oyashiki-eve-${n}`;
export function saveEve(s, n = slot) {
  if (testing) return;
  try { localStorage.setItem(eveKey(n), JSON.stringify(s)); } catch (e) { /* noop */ }
}
export function loadEve(n = slot) {
  try { const raw = localStorage.getItem(eveKey(n)); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
// 見た結末（端末に覚える。エンディング一覧に出す）
const SEEN_END = 'oyashiki-endings';
export function seenEndings() { try { return new Set(JSON.parse(localStorage.getItem(SEEN_END) || '[]')); } catch (e) { return new Set(); } }
export function markSeenEnding(id) { try { const set = seenEndings(); set.add(id); localStorage.setItem(SEEN_END, JSON.stringify([...set])); } catch (e) { /* noop */ } }
export function load(n = slot) {
  migrate();
  try {
    const raw = localStorage.getItem(slotKey(n));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
export function clearSave(n = slot) {
  try { localStorage.removeItem(slotKey(n)); } catch (e) { /* noop */ }
}
export const listSlots = () => Array.from({ length: SLOTS }, (_, i) => ({ n: i + 1, data: load(i + 1) }));
export function copySlot(from, to) {
  const d = load(from);
  if (!d) return false;
  try { localStorage.setItem(slotKey(to), JSON.stringify(d)); return true; } catch (e) { return false; }
}
// クリアした結末を、枠のセーブ（最後に保存した日の朝）に書き足す。セーブ自体は消さない
export function markCleared(s, id, n = slot) {
  if (testing) return;
  const d = load(n) || s;
  const add = list => [...new Set([...(list || []), id])];
  d.cleared = add(d.cleared);
  s.cleared = add(s.cleared);
  try { localStorage.setItem(slotKey(n), JSON.stringify(d)); } catch (e) { /* noop */ }
}
// 書き出し・読み込み：セーブを1行の文字列にする（「OYASHIKI1:」＋JSON を base64 にしたもの）
const PREFIX = 'OYASHIKI1:';
export function exportSave(n) {
  const d = load(n);
  if (!d) return null;
  const bytes = new TextEncoder().encode(JSON.stringify(d));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return PREFIX + btoa(bin);
}
// 文字列を読んでセーブに戻す。おかしな文字列なら null
export function parseSave(text) {
  try {
    const t = String(text || '').replace(/\s+/g, '');
    if (!t.startsWith(PREFIX)) return null;
    const bin = atob(t.slice(PREFIX.length));
    const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    const ok = d && typeof d === 'object' && Number.isInteger(d.chapter) && Number.isInteger(d.week)
      && Number.isInteger(d.day) && typeof d.phase === 'string' && d.aff && d.flags && d.counters;
    return ok ? d : null;
  } catch (e) { return null; }
}
export function importSave(d, n) {
  try { localStorage.setItem(slotKey(n), JSON.stringify(d)); return true; } catch (e) { return false; }
}

export const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
// 効果のお知らせを〔〕で包む。画面では js/richtext.js が色付きにする
export const fxNote = notes => notes.length ? `〔${notes.join('／')}〕` : '';

export const WEEKS_PER_CHAPTER = 2;
export function dayIndex(s) { return (s.chapter * WEEKS_PER_CHAPTER + s.week) * 5 + s.day; }

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 効果の適用。{aff:{mother:3}, trust, susp, flag:[...]}
export function applyFx(s, fx) {
  if (!fx) return [];
  const notes = [];
  if (fx.aff) for (const [k, v] of Object.entries(fx.aff)) {
    if (!v) continue;
    s.aff[k] = clamp(s.aff[k] + v);
    notes.push(`${PEOPLE[k].name}の好感度 ${v > 0 ? '+' : ''}${v}`);
  }
  if (fx.trust) { s.trust = clamp(s.trust + fx.trust); notes.push(`お父様の心象 ${fx.trust > 0 ? '+' : ''}${fx.trust}`); }
  if (fx.susp) { s.susp = clamp(s.susp + fx.susp); notes.push(`疑惑 ${fx.susp > 0 ? '+' : ''}${fx.susp}`); }
  for (const f of [].concat(fx.flag || [])) setFlag(s, f, notes);
  return notes;
}

export function setFlag(s, f, notes) {
  if (s.flags[f]) return false;
  s.flags[f] = true;
  // 手がかりを得た日（回想カードに出す）
  (s.clueDay ||= {})[f] = dayOffset(s);
  if (notes) notes.push('手帳に記録した');
  // 組み合わせで成立する手がかり
  if (s.flags.h_window && s.flags.h_blueprint && !s.flags.hidden_room) setFlag(s, 'hidden_room', notes);
  return true;
}

export const maidAvailable = (s, m) => s.chapter >= PEOPLE[m].from;
export const activeMaids = s => MAIDS.filter(m => maidAvailable(s, m));
// 今の章で屋敷にいる人（VRM を読み込む人）。巡回員は最終章（イブの夜）だけ
// 決行の夜は、執事が決行の服（butler2）に着替える
// 仮面舞踏会の夜だけ来る人と、お嬢様のドレス、一般客の4体（客は形と画像を共有したまま複製する）
export const BALL_CAST = ['reiko', 'dealer', 'caterer', 'daughter3', 'guest_m1', 'guest_m2', 'guest_f1', 'guest_f2'];
// 11月5日（金）は、仕出し屋が冬の食料を搬入しに来る（js/events.js）
export const CATERER_DAY = 4;
export const castNeeded = s => ['butler', 'father', 'mother', 'daughter', ...activeMaids(s), ...(s.chapter >= 3 ? ['guard'] : []), ...(s.phase === 'execution' ? ['butler2'] : []), ...(s.phase === 'ball' ? BALL_CAST : []),
  ...(s.phase !== 'ball' && dayOffset(s) === CATERER_DAY && !s.flags.caterer_nov ? ['caterer'] : [])];
// 好感度70以上のメイドは協力者。黒メイド（妹の雫）は、屋敷に来た日から味方
// 白井は、寝返った後（white_turned）も味方
export const isAlly = (s, who) => MAIDS.includes(who) && (who === SISTER ? !!s.flags.shizuku : s.aff[who] >= ALLY_AFF || (who === 'white' && !!s.flags.white_turned));

// ---- 1日の予定 ----

export function fatherHome(s) { return s.day === (s.week * 2 + s.chapter) % 5; }
// 前の夜を who と過ごした翌日か
export const afterNight = (s, who) => s.counters.last_night_who === who && s.counters.last_night_day === dayIndex(s) - 1;
export function motherOutDay(s) { return (s.day + s.week) % 2 === 0; }

export function generateChores(s) {
  const r = rng(dayIndex(s) * 7919 + 13);
  const pool = CHORE_POOL.filter(id => id !== 'study');
  if (s.chapter >= 2) pool.push(...XMAS_POOL);   // 12月はパーティーの支度も加わる
  if (!fatherHome(s) && dayIndex(s) >= 3) pool.push('study', 'study'); // 書斎の掃除は旦那様不在日のみ
  const picks = [];
  while (picks.length < CHORES_PER_CHAPTER[s.chapter] && pool.length) {
    const id = pool.splice(Math.floor(r() * pool.length), 1)[0];
    if (!picks.includes(id)) picks.push(id);
  }
  const ids = ['cook', ...picks];
  // 12月に入ると、まだ飾っていないクリスマスの飾り付けが毎日入る（12月前半は1つ、後半は2つ）。飾り終えたら手直しだけ
  if (s.chapter >= 2) {
    const todo = XMAS.filter(id => !s.flags[`deco_${id}`]).slice(0, s.chapter >= 3 ? 2 : 1);
    ids.push(...(todo.length ? todo : ['xmasTouch']));
  }
  if (!motherOutDay(s)) ids.push('escortM');
  if (s.day % 2 === 1 || s.chapter >= 2) ids.push('tutorD');
  return ids.map(id => ({ id, assignee: id.startsWith('escort') || id === 'tutorD' ? 'butler' : null, progress: 0, done: false, failed: false }));
}

export function maidHours(m, chore) {
  const c = CHORES[chore.id];
  return Math.ceil(c.hours / SPEED[m][c.type]);
}

// 朝礼の割り振りから、メイドの1日の行動表を作る
export function buildPlan(s) {
  const t = s.today;
  const r = rng(dayIndex(s) * 31 + 7);
  t.plan = {};
  for (const m of activeMaids(s)) {
    let h = START_HOUR;
    const slots = [];
    t.chores.forEach((ch, i) => {
      if (ch.assignee !== m) return;
      const need = maidHours(m, ch);
      const end = Math.min(h + need, START_HOUR + MAID_CAPACITY);
      slots.push({ room: CHORES[ch.id].room, start: h, end, chore: i });
      ch.done = h + need <= START_HOUR + MAID_CAPACITY;
      ch.overload = !ch.done;
      if (ch.done && m === 'blue' && CHORES[ch.id].type !== 'art' && r() < BLUE_FAIL_RATE) ch.failed = true;
      h += need;
    });
    t.plan[m] = slots;
  }
}

// まだ誰にも割り振られていない仕事を、得意で余裕のあるメイドに振る（チュートリアルの日だけ使う）。振ったメイドの一覧を返す
export function fillUnassigned(s) {
  const left = s.today.chores.filter(c => c.assignee == null && !CHORES[c.id].butlerOnly)
    .sort((a, b) => CHORES[b.id].hours - CHORES[a.id].hours);
  const who = new Set();
  for (const c of left) {
    const best = activeMaids(s)
      .filter(m => maidLoad(s, m) + maidHours(m, c) <= MAID_CAPACITY)
      .sort((a, b) => maidHours(a, c) - maidHours(b, c) || maidLoad(s, a) - maidLoad(s, b))[0];
    if (best) { c.assignee = best; who.add(best); }
  }
  return [...who];
}

export function maidLoad(s, m) {
  return s.today.chores.filter(c => c.assignee === m).reduce((a, c) => a + maidHours(m, c), 0);
}

// 人物がその時刻にいる場所（'out' は外出中）
export function whereIs(s, who, hour) {
  const t = s.today;
  if (!PEOPLE[who]) return null;
  if (t.escort && t.escort.who === who && hour >= t.escort.from && hour < t.escort.to) return t.escort.room;
  if (who === 'father') return fatherHome(s) ? 'study' : 'out';
  if (who === 'mother') {
    if (motherOutDay(s)) return 'out';
    return hour < 13 ? 'great' : 'master';
  }
  if (who === 'daughter') {
    if (hour < 13) return 'out';
    // 勉強の手伝いの日は、13時に自室へ戻ってくる
    if (t.chores && t.chores.some(c => c.id === 'tutorD' && c.assignee === 'butler' && !c.done)) return 'droom';
    return s.day % 2 === 0 ? 'great' : 'droom';
  }
  if (!maidAvailable(s, who)) return null;
  const slot = (t.plan[who] || []).find(p => hour >= p.start && hour < p.end);
  if (slot) return slot.room;
  return 'servants';
}

export function peopleIn(s, room, hour = s.today.hour) {
  return Object.keys(PEOPLE).filter(p => p !== 'butler' && whereIs(s, p, hour) === room);
}

export function hoursLeft(s) { return END_HOUR - s.today.hour; }

// ---- 暦 ----
// 11月1日を月曜とし、週の月〜金が平日、土日が週末。最後の週の金曜（12月24日）がクリスマス・イブ
// 8週目の月曜が12月20日なので、イブの翌日の25日（土）の朝に運び屋が来る
export const EVE_OFFSET = 53;   // 11月1日から数えて何日目がイブか（0 始まり）
const DOW = ['月', '火', '水', '木', '金', '土', '日'];
export const dayOffset = s => (s.chapter * WEEKS_PER_CHAPTER + s.week) * 7 + Math.min(s.day, 5);
export function dateOf(offset) {
  const n = 1 + offset;
  return n <= 30 ? { m: 11, d: n, w: DOW[offset % 7] } : { m: 12, d: n - 30, w: DOW[offset % 7] };
}
export const isEve = s => dayOffset(s) === EVE_OFFSET;
export const daysToEve = s => EVE_OFFSET - dayOffset(s);
export function dateLabel(s) {
  if (s.phase === 'execution' || s.phase === 'ending' && dayOffset(s) >= EVE_OFFSET) return '12月24日（金）クリスマス・イブ';
  if (s.phase === 'weekend' || s.day >= 5) {
    const a = dateOf(dayOffset(s)), b = dateOf(dayOffset(s) + 1);
    return a.m === b.m ? `${a.m}月${a.d}日（土）・${b.d}日（日）` : `${a.m}月${a.d}日（土）・${b.m}月${b.d}日（日）`;
  }
  const d = dateOf(dayOffset(s));
  return `${d.m}月${d.d}日（${d.w}）${isEve(s) ? 'クリスマス・イブ' : ''}`;
}
// 状況表示に添える、イブまでの日数
export const eveCountdown = s => { const n = daysToEve(s); return n > 0 ? `イブまで あと${n}日` : n === 0 ? '今日はイブ' : ''; };
