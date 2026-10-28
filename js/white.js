// 白井：お父様が自分の会社から連れてきた、予定外の新人。屋敷の様子を週末にお父様へ報告する（スパイ）
//  ・白井に見られると「報告の種」がたまり、週末の報告で疑惑が上がる（白井の好感度が高いほど、伏せてくれる）
//  ・会社で帳簿に載らない電気工事に気づいて屋敷へ飛ばされた過去を聞き、地下の保管庫の話をすると、寝返る
//  ・寝返るか、雫のことを打ち明けて協力者になると、嘘の報告で執事をかばう
//  ・味方にしないまま報告が積み重なると、最終章でお父様がイブの夜の巡回を厳しくする
import { maidAvailable, setFlag, dayIndex } from './state.js';

const N = 'n', B = 'butler', F = 'father', W = 'white', R = 'red', BL = 'blue';
export const STRICT_AT = 20;   // 報告で上がった疑惑の合計がこれ以上なら、最終章で巡回が厳しくなる

export const whiteActive = s => maidAvailable(s, W) && !!s.flags.white_spy;
// 白井がかばってくれる（嘘の報告をする）か
export const whiteCovers = s => !!s.flags.white_turned || !!s.flags.told_white;

// 白井に見られた。pts：報告の種。画面に出す一言を返す
export function whiteSaw(s, pts) {
  if (!whiteActive(s) || whiteCovers(s)) return '';
  s.counters.w_watch = (s.counters.w_watch || 0) + pts;
  return '（白井に見られた。週末に旦那様へ報告されるかもしれない）';
}

// 第2章の初日の朝：お父様が白井を連れてくる
export const WHITE_ARRIVAL = [
  [N, '11月後半、最初の朝。共用室に、珍しい人影があった。'],
  [F, '「朝から邪魔をする。……今日から入る、白だ」'],
  [W, '「白井です。よろしくお願いします」'],
  [F, '「私の会社の、電力設備の部署にいた者だ。屋敷の電気まわりは、今後すべて彼女に任せる。年明けに向けて、警報も見直させる」'],
  [B, '（旦那様が使用人を自ら連れてくるなど、半年で初めてだ。……年明け。あの絵を手放す、その前に）'],
  [R, '「……メイドの募集、12月からの一人だけだったはず。……白井さんは、予定外」（小声で）'],
  [F, '「それから白井。屋敷で変わったことがあれば、週末に私に報告しろ。どんな小さなことでもだ」'],
  [W, '「承知しました」'],
  [N, 'お父様が出ていくと、共用室にほっとした空気が流れた。'],
  [W, '「……というわけで、週に一度、旦那様に屋敷の様子を報告します。執事さんのことも、です」'],
  [W, '「悪く思わないでください。仕事なので。見たままを報告するだけです」'],
  [BL, '「えっ、えっ、わたしがお皿割ったのも報告されちゃうんですか……！」'],
  [W, '「それは……見なかったことにします。非合理なので」'],
  [B, '（見たままを、か。……白井の前では、迂闊な真似はできない）'],
  { fx: { flag: ['white_arrived', 'white_spy'] } },
];

// 週末の始め（金曜の夜）：白井が書斎へ報告に入る
export function whiteReport(s) {
  if (!whiteActive(s)) return [];
  const pts = s.counters.w_watch || 0;
  s.counters.w_watch = 0;
  const into = [N, '金曜の夜。白井が、書斎へ報告に入っていくのが見えた。'];
  if (whiteCovers(s)) return [into,
    [W, '「旦那様には、執事さんは毎晩早く休んでいる、と報告しておきました。……嘘も、たまには合理的です」'],
    { fx: { susp: -5 } }];
  if (!pts) return [into, [N, '出てきた白井は、こちらを見て小さく頷いた。報告することは、何もなかったらしい。']];
  const amount = s.aff.white >= 60 ? 0 : s.aff.white >= 40 ? Math.ceil(pts / 2) : pts;
  const said = s.aff.white >= 60 ? '「今週は、特に変わったことはありませんでした、と。……今回は、そういうことにしておきます」'
    : s.aff.white >= 40 ? '「書斎の前で見かけたことは、伏せておきました。……今回だけです」'
    : '「今週の分、報告しました。……見たままを」';
  const steps = [into, [W, said]];
  if (amount) steps.push({ fx: { susp: amount } }, { call: s => {
    s.counters.w_reported = (s.counters.w_reported || 0) + amount;
    s.counters.w_warn = dayIndex(s);
  } });
  return steps;
}

// 最終章の初日：白井を味方にしないまま報告が積み重なっていれば、お父様がイブの夜の巡回を厳しくする
export const strictDue = s => s.chapter >= 3 && !s.flags.strict_checked && whiteActive(s);
export function strictScene(s) {
  setFlag(s, 'strict_checked');
  if (whiteCovers(s) || (s.counters.w_reported || 0) < STRICT_AT) return [];
  return [
    [N, '最終章の朝。白井が、書斎から出てくるのが見えた。'],
    [F, '「……執事。イブの夜は、警備会社の巡回員を呼ぶ。窓の外など眺めずに、廊下をよく見るよう言い聞かせておく」'],
    [B, '（白井の報告だ。……イブの夜の2階は、厳しくなる）'],
    { fx: { flag: ['guard_known', 'guard_strict'] } },
  ];
}
