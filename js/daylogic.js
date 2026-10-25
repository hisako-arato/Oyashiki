// 執事パートの処理（仕事・調査・会話）。画面の描き方に依らない部分
// ボタン式の画面（game.js）と3Dの屋敷（explore/day3d.js）の両方から使う
import { PEOPLE, CHORES, ROOMS, PASSCODE, END_HOUR, SISTER } from './data.js';
import { applyFx, fxNote, setFlag, dayIndex, whereIs, isAlly, peopleIn, fatherHome } from './state.js';
import { pickTalk } from './actions.js';
import { joined, sisterTalk, told } from './sister.js';
import { whiteSaw } from './white.js';

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

// 調査。seen は見ていた人の一覧、room は調べた部屋。{ msg, code, clue } を返す
// 白メイドに見られると、週末にお父様へ報告される（書斎・私室なら重い）
export function investigate(s, spot, seen, room) {
  const res = spot.run(s);
  let msg = res.text;
  if (seen.length) {
    const amount = Math.min(25, seen.length * (seen.includes('father') ? 20 : 10));
    msg += `　……${seen.map(p => PEOPLE[p].name).join('、')}に見られた！` + fxNote(applyFx(s, { susp: amount }));
    if (seen.includes('white')) msg += whiteSaw(s, room === 'study' || (ROOMS[room] && ROOMS[room].private) ? 10 : 5);
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
  // ask：先に主人公が尋ねる一言（初めて話すときだけ）
  return { msg: `${PEOPLE[p].name}${tk.line}${fxNote(notes)}`, ask: tk.ask ? `執事${tk.ask}` : null, forgery: !!tk.forgery };
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
// 地下にいる時間そのものに罰はない。家の者に「無断で地下に入っている」ところを見られると罰がある
//  ・床の扉（資料室）や古井戸から上がった瞬間に、そこに人がいれば見られる（協力者・雫・打ち明けたメイドは見逃す）
//  ・旦那様が在宅の日は、17時台に晩酌のワインを取りに降りてくる。貯蔵庫にいれば見つかる。保管庫の奥か搬入路に隠れればやり過ごせる
//    （最終章は発送前の荷物を確かめに保管庫まで入ってくるので、隠れられるのは搬入路だけ）
export const WINE_HOUR = 17;
export const isUnder = room => !!(ROOMS[room] && ROOMS[room].under);
const quiet = (s, p) => isAlly(s, p) || told(s, p);
// その部屋で、地下から上がってくるところを見てしまう人
export const watchersAt = (s, room) => peopleIn(s, room).filter(p => !quiet(s, p));
export const wineDue = s => fatherHome(s) && s.today.hour === WINE_HOUR && !s.today.wineDone;

// 資料室の床の扉を開けて降りる。降りられたら null、だめなら理由の文を返す
export function openHatch(s, seen) {
  if (!s.flags.b_key) return s.flags.b_key_lost ? '床の扉の錠が、新しい物に付け替えられている。手持ちの鍵は合わない。' : '床の扉には鍵が掛かっている。旦那様のセラーの鍵が要る。';
  if (!s.flags.b_light) return '扉を少し持ち上げてみたが、下は真っ暗で何も見えない。明かりが要る。';
  if (seen.length) return '人の目がある。今は降りられない。';
  setFlag(s, 'b_found');
  return null;
}

// 上がる前の気配。上に人がいれば { line, options }（待つか、思い切って上がるか）を返す
export function listenAbove(s, room) {
  const w = watchersAt(s, room);
  if (!w.length) return null;
  return {
    line: room === 'archive' ? '頭上から、足音が聞こえる……。資料室に誰かいるようだ。' : '井戸の上から、話し声が聞こえる……。庭に誰かいるようだ。',
    options: [
      { t: '様子をうかがって待つ（15分）', wait: true, run: () => { spendMinutes(s, 15); return '……しばらく息をひそめて待った。'; } },
      { t: '思い切って上がる', go: true, run: () => '' },
    ],
  };
}

// 上がったところを見られた。{ line, options }（言い訳の選択肢）を返す
export function caughtEmerging(s, room) {
  const who = watchersAt(s, room)[0];
  if (!who) return null;
  const name = PEOPLE[who].name;
  const fx = n => fxNote(applyFx(s, { susp: n })) + (who === 'white' ? whiteSaw(s, 10) : '');
  if (room === 'archive') return {
    line: `床の扉から顔を出した瞬間、${name}と目が合った。${name}「……執事さん？ 今、床の下から……」`,
    options: [
      { t: '「旦那様に頼まれて、ワインを選びに」', run: () => fatherHome(s)
        ? `${name}「……そうなんですか」　どうにか納得してもらえたようだ。${fx(5)}`
        : `${name}「でも旦那様、今日はお出かけですよね……？」　苦しい言い訳だった。${fx(15)}` },
      { t: '「床がきしむので、下を点検していました」', run: () => `${name}「……ふうん」　疑わしそうな目だ。${fx(10)}` },
      { t: '黙って頭を下げる', run: () => `「……申し訳ありません。見なかったことに」${fx(15)}` },
    ],
  };
  return {
    line: `古井戸から這い出したところを、${name}に見られた。${name}「……執事さん？ 井戸で、何を……？」`,
    options: [
      { t: '「井戸の蓋が外れていないか、確かめていました」', run: () => `${name}「……そうですか」${fx(8)}` },
      { t: '黙って頭を下げる', run: () => `「……申し訳ありません」${fx(12)}` },
    ],
  };
}

// 旦那様が晩酌のワインを取りに降りてきた。where は 'cellar' / 'vault' / 'tunnel' / 'up'（石段を上がろうとした）/ 'out'（古井戸から逃げた）
export function fatherWine(s, where) {
  s.today.wineDone = true;
  const check = s.chapter >= 3;   // 最終章は保管庫の荷物も確かめに来る
  const loseKey = () => { s.flags.b_key = false; s.flags.b_key_lost = true; };
  if (where === 'out' || where === 'tunnel' || (where === 'vault' && !check))
    return where === 'out' ? '古井戸から地上へ抜け出した。……下で、旦那様の足音が遠ざかっていく。'
      : `${where === 'tunnel' ? '搬入路の暗がりで' : '保管庫の棚の陰で'}息をひそめた。旦那様は${check ? '保管庫の荷物を確かめ、' : ''}ワインを一本選ぶと、上へ戻っていった。……危なかった。`;
  if (where === 'vault') {
    const notes = applyFx(s, { susp: 40, trust: -20 }); loseKey();
    return `保管庫の扉が開いた。懐中電灯の光が、執事の顔を照らす。お父様「……貴様、ここで何をしている」　低い声だった。「今すぐ上がれ。次はないと思え」　セラーの鍵は取り上げられ、錠は付け替えられた。${fxNote(notes)}`;
  }
  const notes = applyFx(s, { susp: 20, trust: -10 }); loseKey();
  return `石段を降りてきたお父様と、鉢合わせた。お父様「……地下には勝手に入るなと言ったはずだ」　セラーの鍵は取り上げられ、錠は付け替えられた。${fxNote(notes)}`;
}
