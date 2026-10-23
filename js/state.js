// ゲーム状態と、状態にまつわる計算
import { PEOPLE, MAIDS, ALLY_AFF, CHORES, CHORE_POOL, CHORES_PER_CHAPTER, SPEED, XMAS,
  MAID_CAPACITY, BLUE_FAIL_RATE, SISTER, START_HOUR, END_HOUR } from './data.js';

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

export function save(s) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* 保存できない環境でも続行 */ }
}
export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ }
}

export const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

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
  if (notes) notes.push('手帳に記録した');
  // 組み合わせで成立する手がかり
  if (s.flags.h_window && s.flags.h_blueprint && !s.flags.hidden_room) setFlag(s, 'hidden_room', notes);
  return true;
}

export const maidAvailable = (s, m) => s.chapter >= PEOPLE[m].from;
export const activeMaids = s => MAIDS.filter(m => maidAvailable(s, m));
// 好感度70以上のメイドは協力者。黒メイド（妹の雫）は、屋敷に来た日から味方
export const isAlly = (s, who) => MAIDS.includes(who) && (who === SISTER ? !!s.flags.shizuku : s.aff[who] >= ALLY_AFF);

// ---- 1日の予定 ----

export function fatherHome(s) { return s.day === (s.week * 2 + s.chapter) % 5; }
export function motherOutDay(s) { return (s.day + s.week) % 2 === 0; }

export function generateChores(s) {
  const r = rng(dayIndex(s) * 7919 + 13);
  const pool = CHORE_POOL.filter(id => id !== 'study');
  if (!fatherHome(s) && dayIndex(s) >= 3) pool.push('study', 'study'); // 書斎の掃除は旦那様不在日のみ
  const picks = [];
  while (picks.length < CHORES_PER_CHAPTER[s.chapter] && pool.length) {
    const id = pool.splice(Math.floor(r() * pool.length), 1)[0];
    if (!picks.includes(id)) picks.push(id);
  }
  const ids = ['cook', ...picks];
  // イブまでの1週間は、まだ飾っていないクリスマスの飾り付けが毎日2つ入る。飾り終えたら手直しだけ
  if (s.chapter === 3 && s.week === WEEKS_PER_CHAPTER - 1) {
    const todo = XMAS.filter(id => !s.flags[`deco_${id}`]).slice(0, 2);
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

export function maidLoad(s, m) {
  return s.today.chores.filter(c => c.assignee === m).reduce((a, c) => a + maidHours(m, c), 0);
}

// 人物がその時刻にいる場所（'out' は外出中）
export function whereIs(s, who, hour) {
  const t = s.today;
  if (t.escort && t.escort.who === who && hour >= t.escort.from && hour < t.escort.to) return t.escort.room;
  if (who === 'father') return fatherHome(s) ? 'study' : 'out';
  if (who === 'mother') {
    if (motherOutDay(s)) return 'out';
    return hour < 13 ? 'great' : 'master';
  }
  if (who === 'daughter') {
    if (hour < 13) return 'out';
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

export function dateLabel(s) {
  // 11月前半・後半、12月前半・後半が各章
  const month = 11 + Math.floor(s.chapter / 2);
  const week = (s.chapter % 2) * WEEKS_PER_CHAPTER + s.week + 1;
  const days = ['月', '火', '水', '木', '金'];
  const day = s.phase === 'weekend' ? '土・日' : days[s.day] + '曜';
  return `${month}月 第${week}週 ${day}`;
}
