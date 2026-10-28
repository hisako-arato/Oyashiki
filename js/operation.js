// ENDING 3「月下作戦」：執事は指揮役、4人のメイドが主役の盗み
//  ・作戦会議（3回）：会議1 狙いと作戦名／会議2 役割分担／会議3 12月22日の夜のリハーサル。誤った答えは、本番の取り調べの疑いに +1
//  ・本番の小さな遊び（白：鐘に合わせて照明の主幹を落とす／赤：客の目が集まった瞬間に光る仮面を落とす）は、画面の上に重ねて出す
//  ・役割カード（作業が切り替わる瞬間）と、エンディングの4人のハイライト
// 3Dの屋敷での本番の進行は explore/day3d.js（startOp）。台詞は playScript の形（[話し手の id, 文]、N は地の文）
import * as music from './music.js';

const N = 'n', B = 'butler', R = 'red', BL = 'blue', W = 'white', S = 'shizuku';

// 役割カード：顔・名前・役割・決め台詞
export const ROLE = {
  white: { name: '白メイド', face: 'white', role: '電気係', line: '「理由は聞きません。……時間どおりに落とすだけです」' },
  red: { name: '赤メイド', face: 'red', role: '影の役', line: '「……見せ場、ちょうだいね」' },
  black: { name: '雫', face: 'black2', role: '絵の回収', line: '「お兄ちゃん、見ててね」' },
  blue: { name: '青メイド', face: 'blue', role: '配膳車', line: '「堂々としてれば、誰も疑いません！」' },
  butler: { name: '執事', face: 'butler', role: '指揮', line: '「今宵の月を、いただきに」' },
  caterer: { name: '仕出し屋', face: 'caterer', role: 'もう一人の執事', line: '「白は冷やしすぎない、ですよね」' },
};
const NAMES = { tsukishita: '月下作戦', kamen: '仮面舞踏会作戦', waltz: 'ワルツ作戦' };
export const opName = s => NAMES[s.flags.op_name] || NAMES.tsukishita;

// 会議で選んだ誤った答え（本番の取り調べで、一つにつき疑い +1）。会議の記録は手帳の手がかりではないので、flags に直接書く
const WRONG = ['op_frame', 'op_drop_blue', 'op_piano', 'op_cottage'];
export const planDoubt = s => WRONG.filter(f => s.flags[f]).length;

// ---- 作戦会議 ----
const MEET_CAST = [{ place: '22:00　使用人棟　共用室' }, { cast: ['red', 'blue', 'white', 'shizuku'] }];
const askWhat = [
  { choice: [
    { t: 'キャンバスだけを外して丸める', then: [[S, '「額縁は残す。空の額縁の方が、きっと効くよ」']] },
    { t: '額縁ごと持ち出す', then: [{ call: s => { s.flags.op_frame = true; } }, [W, '「重いし、大きすぎます。どこにも隠せません」'], [S, '「……当日は、私がその場で考える」']] },
  ] },
];
const askName = [
  [N, '作戦の名前を決めよう。'],
  { choice: [
    { t: '「月下作戦」', then: [{ call: s => { s.flags.op_name = 'tsukishita'; } }] },
    { t: '「仮面舞踏会作戦」', then: [{ call: s => { s.flags.op_name = 'kamen'; } }] },
    { t: '「ワルツ作戦」', then: [{ call: s => { s.flags.op_name = 'waltz'; } }] },
  ] },
];
export const OP_MEET1 = [
  ...MEET_CAST,
  [N, '共用室。五人がテーブルを囲む。雫が、屋敷の見取り図を広げた。'],
  [S, '「イブの夜、旦那様は大広間に絵を飾る。……0時の仮面外しで、屋敷じゅうの目が互いの顔に向く」'],
  [W, '「その瞬間なら、私は電気を落とせます。復旧まで、90秒」'],
  [BL, '「90秒……！ 映画みたいです！」'],
  [B, '「狙いは一つ。……旦那様の目の前で、絵を消す」'],
  [N, '何を持ち出す？'],
  ...askWhat,
  ...askName,
  [R, '「……いいね。なんだか、わくわくする」'],
  { call: s => { s.flags.op_meet1 = true; } }, { cast: null },
];
const askDrop = [
  [B, '「役割を決めよう。白は電気、雫は絵。……影を落とす役が要る」'],
  [N, '2階の吹き抜けから、光る仮面を落とすのは？'],
  { choice: [
    { t: '赤メイド', then: [[R, '「……わたし。階段を上がって、落とすだけ。走らない」'], [W, '「赤羽さん、身重なのに」'], [R, '「だから、誰も疑わない」']] },
    { t: '青メイド', then: [{ call: s => { s.flags.op_drop_blue = true; } }, [S, '「青さんには、配膳車をお願いしたいの。いちばん度胸が要る役」'], [N, '結局、当日の動きは決まらないままになった。']] },
  ] },
];
const askHide = [
  [N, '暗闇の中で、絵を最初に隠すのは？'],
  { choice: [
    { t: 'キッチンの配膳車', then: [[R, '「……上にケーキ。下に二重底。作っておく」']] },
    { t: '大広間のピアノの中', then: [{ call: s => { s.flags.op_piano = true; } }, [W, '「調律師が明日来ます。開けられます」']] },
  ] },
  [N, '探された後に、絵を移す場所は？'],
  { choice: [
    { t: '資料室の棚', then: [[S, '「一度探した場所は、二度は探さない」']] },
    { t: '使用人棟', then: [{ call: s => { s.flags.op_cottage = true; } }, [W, '「使用人は真っ先に疑われます」']] },
  ] },
];
export const OP_MEET2 = [
  ...MEET_CAST,
  [N, '二度目の作戦会議。テーブルの見取り図に、四つの駒が並べられた。'],
  ...askDrop,
  ...askHide,
  { wait: (s, next) => showRoleCards(s, next) },
  { call: s => { s.flags.op_meet2 = true; } }, { cast: null },
];
// まだ開いていない会議の中身を、手短に決める（会議3や、12月23日の決起会の冒頭で）
export const catchUp = s => [
  ...(s.flags.op_meet1 ? [] : [[S, '「……まだ、何を持ち出すかも決めてなかったね。今、決めよう」'], ...askWhat, ...askName, { call: s => { s.flags.op_meet1 = true; } }]),
  ...(s.flags.op_meet2 ? [] : [[S, '「役割も、今決めちゃおう」'], ...askDrop, ...askHide, { call: s => { s.flags.op_meet2 = true; } }]),
];
// 12月22日の夜：誰もいない大広間でリハーサル。会議を済ませていなければ、ここで手短に決める
export const opMeet3 = s => [
  { place: '23:00　屋敷 1F　大広間（明かりを落として）' }, { cast: ['red', 'blue', 'white', 'shizuku'] },
  [N, '夜の大広間。誰もいない。雫が懐中電灯で、壁の額縁の場所を照らした。'],
  ...catchUp(s),
  [S, '「本番と同じ順番で、一度だけ通すよ」'],
  [W, '「では、私から。……12回目の鐘で、照明の主幹だけを落とします」'],
  { wait: (s, next) => breakerGame({ practice: true }, () => next()) },
  [BL, '「光る仮面、描けました！ 暗い所で見ると……ほら！」'],
  [N, '青い光の仮面が、暗がりにぼうっと浮かんだ。'],
  [R, '「……配膳車、二重底。キャンバスは、ちょうど入る」'],
  [W, s.flags.pipe_done ? '「配電盤の老朽化は、嵐の夜にも一度起きています。水道管だって破裂した屋敷です。旦那様も信じます」' : '「配電盤の老朽化は、嵐の夜に一度起きています。旦那様も信じます」'],
  [W, '「それから、庭の古井戸の鉄格子。……ボルトは、さっき外しておきました。理由は聞かないでくださいね」'],
  { call: s => { s.flags.b_grate = true; } },
  [BL, '「あと、頼まれてた仮面、もう一枚できました！ 執事さんのと、そっくり同じのです！」'],
  [B, '「ありがとう。……仕出し屋の彼に、渡しておいてくれ」'],
  [S, '「……お兄ちゃん。私たち、きっとうまくいくよ」'],
  [B, '「明日の夜。……母さんの絵を、迎えに行こう」'],
  { call: s => { s.flags.op_meet3 = true; } }, { cast: null },
];

// ---- 画面の上に重ねる部品 ----
function layer(cls) {
  const d = document.createElement('div');
  d.className = `op-layer ${cls}`;
  document.body.append(d);
  return d;
}
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
function card(id) {
  const r = ROLE[id], c = h('div', 'op-card');
  const img = h('img'); img.src = `assets/faces/${r.face}.webp`; img.alt = '';
  c.append(img, h('small', null, r.role), h('b', null, r.name), h('p', null, r.line));
  return c;
}
// 作業が切り替わる瞬間の役割カード（約1.8秒。タップで先へ）
export function flashCard(id, place, done) {
  const L = layer('op-flash');
  if (place) L.append(h('p', 'op-place', place));
  L.append(card(id));
  music.sfx('tap');
  let over = false;
  const end = () => { if (over) return; over = true; L.classList.add('out'); setTimeout(() => { L.remove(); done(); }, 300); };
  L.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); end(); });
  setTimeout(end, 1800);
}
// 会議2の最後：四人の役割カードを並べる
export function showRoleCards(s, done) {
  const L = layer('op-cards');
  L.append(h('h3', null, `――${opName(s)}――`));
  const row = h('div', 'op-row');
  for (const id of ['white', 'red', 'black', 'blue']) row.append(card(id));
  L.append(row);
  const b = h('button', 'primary', '次へ');
  b.addEventListener('click', () => { L.remove(); done(); });
  L.append(b);
}
// エンディング：四人のハイライト（本番の出来を一言ずつ）
export function highlights(s, done) {
  const r = (s.op && s.op.res) || {};
  const L = layer('op-cards op-high');
  L.append(h('h3', null, `――${opName(s)}　ハイライト――`));
  const row = h('div', 'op-row');
  const note = {
    white: r.breaker ? '12回目の鐘、ぴったりに主幹を落とした' : '一拍遅れて、屋敷の明かりを落とした',
    red: r.drop ? '光る仮面が、客の視線をさらった' : '仮面は少し早く、少し遅く――それでも宙を舞った',
    black: r.take ? '暗闇の中、懐中電灯をすり抜けた' : '光をかすめながらも、キャンバスを丸めきった',
    blue: r.cart ? '空の額縁の目の前に、ケーキの配膳車を' : 'ひやりとしながら、配膳車を大広間へ',
    caterer: '同じ仮面と執事服で、旦那様の隣に立ち続けた',
    butler: '古井戸から地下へ。保管庫の十数枚を、一枚残らず運び出した',
  };
  for (const id of ['white', 'red', 'black', 'blue', 'caterer', 'butler']) { const c = card(id); c.append(h('em', null, note[id])); row.append(c); }
  L.append(row);
  const b = h('button', 'primary', '次へ');
  b.addEventListener('click', () => { L.remove(); done(); });
  L.append(b);
}

// ---- 白：12回目の鐘に合わせて、照明の主幹を落とす（約12秒） ----
// done(ok)：系統と時刻の両方が合っていれば ok
const SWITCHES = ['警報', '照明 2F', '照明 主幹', '厨房', '空調'];
const RIGHT = '照明 主幹', BELL = 0.75;
export function breakerGame({ practice = false } = {}, done) {
  const L = layer('op-game');
  L.append(h('b', 'op-title', practice ? 'リハーサル：12回目の鐘で、照明の主幹を落とす' : '12回目の鐘で、照明の主幹を落とす'));
  L.append(h('p', 'op-tip', '警報の系統は残したまま、照明の主幹だけ。鐘の数を数えて、12回目に合わせてタップ'));
  const bells = h('div', 'op-bells');
  for (let i = 0; i < 12; i++) bells.append(h('i'));
  L.append(bells);
  const row = h('div', 'op-switches'), msg = h('p', 'op-msg', '');
  for (const name of SWITCHES) {
    const b = h('button', 'op-switch', name);
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); pick(name, b); });
    row.append(b);
  }
  L.append(row, msg);
  const t0 = performance.now() + 900;
  let n = 0, picked = null, over = false;
  const timer = setInterval(() => {
    const k = Math.floor((performance.now() - t0) / 1000 / BELL) + 1;
    if (k > n && k <= 12) { n = k; bells.children[n - 1].classList.add('on'); music.sfx(n === 12 ? 'clink' : 'tap'); }
    if ((performance.now() - t0) / 1000 > 12 * BELL + 0.8 && !picked) finish(false, '鐘が鳴り終わってしまった……');
  }, 30);
  function pick(name, b) {
    if (picked || over) return;
    picked = name; b.classList.add('down');
    const t = (performance.now() - t0) / 1000, at12 = 11 * BELL;
    if (name !== RIGHT) return finish(false, name === '警報' ? '警報の系統を落としてしまった……' : '別の系統を落としてしまった');
    if (t < at12 - 0.35) return finish(false, '早すぎる。……まだ鐘が鳴っている');
    if (t > at12 + 0.6) return finish(false, '一拍遅れた');
    finish(true, '12回目の鐘、ぴったり！');
  }
  function finish(ok, text) {
    if (over) return;
    over = true; clearInterval(timer);
    msg.textContent = practice ? `${text}　（本番も、この呼吸で）` : text;
    msg.className = `op-msg ${ok ? 'ok' : 'ng'}`;
    music.sfx(ok ? 'blackout' : 'miss');
    setTimeout(() => { L.remove(); done(ok); }, 1500);
  }
}

// ---- 赤：客の視線が集まった瞬間に、光る仮面を落とす（約7秒） ----
export function dropGame(done) {
  const L = layer('op-game');
  L.append(h('b', 'op-title', '客の目が集まった瞬間に、光る仮面を落とす'));
  L.append(h('p', 'op-tip', 'ゲージが金色の帯に入ったらタップ'));
  const bar = h('div', 'op-bar'), fill = h('i'), zone = h('em');
  bar.append(zone, fill);
  const btn = h('button', 'op-drop', '仮面を落とす'), msg = h('p', 'op-msg', '');
  L.append(bar, btn, msg);
  const t0 = performance.now();
  let over = false, v = 0;
  const level = t => t < 2.6 ? t / 2.6 * 100 : Math.max(0, 100 - (t - 2.6) * 30);
  const timer = setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    v = level(t); fill.style.width = `${v}%`;
    if (t > 6.5) finish(false, '客の目が、離れてしまった');
  }, 30);
  btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); finish(v >= 75, v >= 75 ? '客の目が、いっせいに上を向いた！' : v < 75 && performance.now() - t0 < 2600 ? '早すぎた……' : '少し遅かった'); });
  function finish(ok, text) {
    if (over) return;
    over = true; clearInterval(timer);
    msg.textContent = text; msg.className = `op-msg ${ok ? 'ok' : 'ng'}`;
    music.sfx(ok ? 'tap' : 'miss');
    setTimeout(() => { L.remove(); done(ok); }, 1300);
  }
}
