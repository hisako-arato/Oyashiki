// 執事パートの処理（仕事・調査・会話）。画面の描き方に依らない部分
// ボタン式の画面（game.js）と3Dの屋敷（explore/day3d.js）の両方から使う
import { PEOPLE, CHORES, PASSCODE, END_HOUR } from './data.js';
import { applyFx, setFlag, dayIndex, whereIs, isAlly, peopleIn } from './state.js';
import { pickTalk } from './actions.js';

export const FORGERY_DAYS = 5;

// 時間を進める（分単位。s.today.min が分）
export function spendMinutes(s, m) {
  const t = s.today;
  const total = t.hour * 60 + (t.min || 0) + m;
  t.hour = Math.min(END_HOUR, Math.floor(total / 60));
  t.min = t.hour >= END_HOUR ? 0 : total % 60;
}
export const spendHours = (s, h) => spendMinutes(s, h * 60);
export const minutesLeft = s => (END_HOUR - s.today.hour) * 60 - (s.today.min || 0);

// 自分の担当の仕事が、今できるか
export function choreAvailability(s, c) {
  const def = CHORES[c.id], hour = s.today.hour;
  const partner = def.with && whereIs(s, def.with, hour);
  if (def.with && (partner === 'out' || (def.room !== 'out' && partner !== def.room))) return { ok: false, why: `${PEOPLE[def.with].name}が不在` };
  if (def.after && hour < def.after) return { ok: false, why: `${def.after}時以降` };
  return { ok: true, why: '' };
}

// 仕事をする。残り時間の分だけ進め、結果の文を返す
export function doChore(s, i) {
  const t = s.today, c = t.chores[i], def = CHORES[c.id];
  const h = Math.min(def.hours - c.progress, Math.ceil(minutesLeft(s) / 60));
  if (def.with) t.escort = { who: def.with, from: t.hour, to: t.hour + h, room: def.room === 'out' ? 'out' : def.room };
  c.progress += h;
  spendHours(s, h);
  let msg = `${def.name}を${c.progress >= def.hours ? '終えた' : '途中まで進めた'}。`;
  if (c.progress >= def.hours) {
    c.done = true;
    if (c.id === 'escortM') msg += ' ' + applyFx(s, { aff: { mother: 12 } }).join('／');
    if (c.id === 'tutorD') msg += ' ' + applyFx(s, { aff: { daughter: 10 } }).join('／');
    if (c.id === 'laundry' && s.chapter >= 1 && setFlag(s, 'p_bday'))
      msg += ' 旦那様のスーツのポケットに、花屋の領収書が入っていた。「麗子様 お誕生日 11月3日」……。（手帳に記録した）';
  }
  return msg;
}

// 調査。seen は見ていた人の一覧。{ msg, code, clue } を返す
export function investigate(s, spot, seen) {
  const res = spot.run(s);
  let msg = res.text;
  if (seen.length) {
    const amount = Math.min(25, seen.length * (seen.includes('father') ? 20 : 10));
    msg += `　……${seen.map(p => PEOPLE[p].name).join('、')}に見られた！ ` + applyFx(s, { susp: amount }).join('／');
  }
  return { msg, code: !!res.code, clue: !!res.clue };
}

export function tryCode(s, code) {
  if (code !== PASSCODE) return false;
  setFlag(s, 'key_hidden');
  return true;
}

// 会話。その日の最初の会話だけ好感度が上がる。{ msg, forgery } を返す
export function talk(s, p) {
  const t = s.today;
  const tk = pickTalk(s, p);
  if (t.talked[p]) return { msg: `${PEOPLE[p].name}${tk.line}`, forgery: false, repeat: true };
  t.talked[p] = true;
  const notes = applyFx(s, p === 'father' ? { trust: 3 } : { aff: { [p]: 5 } });
  if (tk.flag) { setFlag(s, tk.flag); notes.push('手帳に記録した'); }
  return { msg: `${PEOPLE[p].name}${tk.line}　${notes.join('／')}`, forgery: !!tk.forgery };
}

export function startForgery(s) {
  setFlag(s, 'forgery_start');
  s.forgeryDay = dayIndex(s);
  return `青メイドは目を輝かせて引き受けてくれた。完成まで${FORGERY_DAYS}日ほどかかるらしい。`;
}

// 隠し部屋を開ける。開けられたら null、だめなら理由の文を返す
export function openHidden(s, seen) {
  if (s.chapter < 2) return '本を引こうとして、手が止まった。……まだ早い。もう少し屋敷の様子を探ってからだ。';
  if (seen.length) return '人の目がある。今はできない。';
  s.flags.hidden_open = true;
  return null;
}

// 持ち主のいる私室に、用もなく入ったとき
export function intrude(s, owner) {
  const notes = applyFx(s, { susp: 5, aff: { [owner]: -2 } });
  return `${PEOPLE[owner].name}「……何か用？」　${notes.join('／')}`;
}

export const witnessesIn = (s, room) => peopleIn(s, room).filter(p => !isAlly(s, p));
