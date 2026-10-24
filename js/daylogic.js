// 執事パートの処理（仕事・調査・会話）。画面の描き方に依らない部分
// ボタン式の画面（game.js）と3Dの屋敷（explore/day3d.js）の両方から使う
import { PEOPLE, CHORES, ROOMS, PASSCODE, END_HOUR, SISTER } from './data.js';
import { applyFx, fxNote, setFlag, dayIndex, whereIs, isAlly, peopleIn, activeMaids, rng } from './state.js';
import { pickTalk } from './actions.js';
import { joined, sisterTalk, sulking, otherMaids, told } from './sister.js';

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
    if (def.xmas) setFlag(s, `deco_${c.id}`);
    if (c.id === 'escortM') msg += fxNote(applyFx(s, { aff: { mother: 12 } }));
    if (c.id === 'tutorD') msg += fxNote(applyFx(s, { aff: { daughter: 10 } }));
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
    msg += `　……${seen.map(p => PEOPLE[p].name).join('、')}に見られた！` + fxNote(applyFx(s, { susp: amount }));
  }
  return { msg, code: !!res.code, clue: !!res.clue };
}

export function tryCode(s, code) {
  if (code !== PASSCODE) return false;
  setFlag(s, 'key_hidden');
  return true;
}

// 会話。その日の最初の会話だけ好感度が上がる。{ msg, forgery } を返す
// others：近くにいる他の人の数（雫は人目があると他人のふりをする）
export function talk(s, p, others = 0) {
  const t = s.today;
  if (p === SISTER && joined(s)) {
    const repeat = !!t.talked[p];
    t.talked[p] = true;
    return { msg: `${PEOPLE[p].name}${sisterTalk(s, others)}`, forgery: false, repeat };
  }
  const tk = pickTalk(s, p);
  if (t.talked[p]) return { msg: `${PEOPLE[p].name}${tk.line}`, forgery: false, repeat: true };
  t.talked[p] = true;
  const notes = applyFx(s, p === 'father' ? { trust: 3 } : { aff: { [p]: 5 } });
  if (tk.flag) { setFlag(s, tk.flag); notes.push('手帳に記録した'); }
  return { msg: `${PEOPLE[p].name}${tk.line}${fxNote(notes)}`, forgery: !!tk.forgery };
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
  return `${PEOPLE[owner].name}「……何か用？」${fxNote(notes)}`;
}

export const witnessesIn = (s, room) => peopleIn(s, room).filter(p => !isAlly(s, p));

// ---- 地下室 ----
// 地下にいる間は、屋敷のどこにも姿が見えない「不在」になる。30分までは気づかれない。
// それを過ぎると15分ごとに、誰かが執事を探し始める確率が上がる（自分が付き添う仕事の時間なら必ず探される）
export const UNDER_SAFE = 30, UNDER_STEP = 15;
const nowMin = s => s.today.hour * 60 + (s.today.min || 0);
export const isUnder = room => !!(ROOMS[room] && ROOMS[room].under);
export const absentMin = s => s.today && s.today.goneAt != null ? Math.max(0, Math.floor(nowMin(s) - s.today.goneAt)) : 0;
export function goUnder(s) { if (s.today.goneAt == null) s.today.goneAt = nowMin(s); }

// 資料室の床の扉を開けて降りる。降りられたら null、だめなら理由の文を返す
export function openHatch(s, seen) {
  if (!s.flags.b_key) return '床の扉には鍵が掛かっている。旦那様のセラーの鍵が要る。';
  if (!s.flags.b_light) return '扉を少し持ち上げてみたが、下は真っ暗で何も見えない。明かりが要る。';
  if (seen.length) return '人の目がある。今は降りられない。';
  setFlag(s, 'b_found');
  return null;
}

// 地上に戻ったとき。探されていたら { line, options } を返す（options は言い訳の選択肢。run() で結果の文を返す）
export function comeBack(s) {
  const t = s.today, gone = absentMin(s);
  t.goneAt = null;
  const duty = t.chores.find(c => c.assignee === 'butler' && !c.done && CHORES[c.id].with && choreAvailability(s, c).ok);
  if (gone <= UNDER_SAFE && !duty) return null;
  const steps = Math.max(0, Math.floor((gone - UNDER_SAFE) / UNDER_STEP) + 1);
  const chance = duty ? 1 : Math.min(0.9, 0.25 * steps);
  if (rng(dayIndex(s) * 977 + Math.round(nowMin(s)))() >= chance) return null;
  const base = Math.min(25, 6 + 4 * Math.max(0, steps - 1) + (duty ? 6 : 0));
  const pool = activeMaids(s).filter(m => m !== SISTER);
  const seeker = duty ? CHORES[duty.id].with : pool[dayIndex(s) % pool.length];
  const line = duty
    ? `${PEOPLE[seeker].name}「執事さん、どこに行ってたの？ ずっと待ってたのに」（不在 ${gone}分）`
    : `${PEOPLE[seeker].name}「執事さん、どこにいたんですか？ さっきから探してたんですけど」（不在 ${gone}分）`;
  return { line, options: excuses(s, base) };
}
function excuses(s, base) {
  const hour = s.today.hour, out = [];
  const lie = (where, room) => ({ t: `「${where}をしていました」とごまかす`, run: () => {
    const seen = peopleIn(s, room, hour).filter(p => !isAlly(s, p));
    return seen.length
      ? `……${PEOPLE[seen[0]].name}がずっと${ROOMS[room].name}にいた。嘘はすぐにばれた。${fxNote(applyFx(s, { susp: Math.round(base * 1.5) }))}`
      : `なんとか信じてもらえたようだ。${fxNote(applyFx(s, { susp: Math.round(base * 0.5) }))}`;
  } });
  if (!s.today.covered) {
    if (joined(s) && !sulking(s)) out.push({ t: '雫にかばってもらう', run: () => {
      s.today.covered = true;
      return '黒メイド「執事さんには、私の仕事を手伝っていただいていました」……雫が、表情ひとつ変えずに言い切った。';
    } });
    const ally = otherMaids(s).find(m => isAlly(s, m) || told(s, m));
    if (ally) out.push({ t: `${PEOPLE[ally].name}に口裏を合わせてもらう`, run: () => {
      s.today.covered = true;
      return `${PEOPLE[ally].name}「執事さんなら、さっきまで私と一緒でしたよ」……助かった。`;
    } });
  }
  out.push(lie('庭の手入れ', 'garden'), lie('倉庫の整理', 'storage'));
  out.push({ t: '黙って頭を下げる', run: () => `「……申し訳ありません」${fxNote(applyFx(s, { susp: base }))}` });
  return out;
}
// 地下にいるまま一日が終わったとき（夕方まで姿を見せなかった）
export function dayEndAbsence(s) {
  if (s.today.goneAt == null) return '';
  const gone = absentMin(s);
  s.today.goneAt = null;
  if (gone <= UNDER_SAFE) return '';
  return `夕方まで姿を見せなかった。${fxNote(applyFx(s, { susp: Math.min(20, 6 + Math.floor(gone / 30) * 3) }))}`;
}
