// 平日の夜（22時）：休む／自室でメイドと密談／お母様・お嬢様の部屋を訪ねる
// 表現は、性的な描写はせず、大人が読めば分かる程度にとどめる（暗転・翌朝の様子で示す）
import { PEOPLE } from './data.js';
import { activeMaids, fatherHome, rng, dayIndex, isAlly, WEEKS_PER_CHAPTER } from './state.js';

const N = 'n', B = 'butler', M = 'mother', D = 'daughter';
const R = 'red', BL = 'blue', K = 'black', W = 'white';

const visits = (s, who) => s.counters[`night_${who}`] || 0;
const NEED = { mother: 60, daughter: 60, red: 50, blue: 50, white: 50, black: 40 };

// その夜に夜の時間があるか（決行の前夜＝最後の金曜は無し）
export function hasNight(s) {
  return !(s.chapter === 3 && s.week === WEEKS_PER_CHAPTER - 1 && s.day === 4);
}

// 選べる行動の一覧。ok でない物は理由付きで灰色にする
export function nightOptions(s) {
  const opts = [{ id: 'rest', label: '休む', ok: true }];
  for (const m of activeMaids(s)) opts.push({ id: m, label: `自室に${PEOPLE[m].name}を呼んで密談する`, ok: s.aff[m] >= NEED[m], why: `好感度${NEED[m]}以上` });
  opts.push({ id: 'mother', label: 'お母様の部屋（主寝室）を訪ねる', ok: s.aff.mother >= NEED.mother && !fatherHome(s),
    why: s.aff.mother < NEED.mother ? `好感度${NEED.mother}以上` : '今夜は旦那様が家にいる' });
  opts.push({ id: 'daughter', label: 'お嬢様の部屋を訪ねる', ok: s.aff.daughter >= NEED.daughter, why: `好感度${NEED.daughter}以上` });
  return opts;
}

// 夜の2階を歩けば、黒メイドの見回りに見られることがある（協力者なら見逃してくれる）
const patrol = s => (isAlly(s, 'black') || s.flags.black_ally) ? [] : rng(dayIndex(s) * 97 + 5)() < 0.25
  ? [[K, '「……執事さん？ こんな時間に2階で何をしているんですか」'], [B, '（「見回りの確認だ」とごまかしたが、黒の目は疑っていた）'], { fx: { susp: 10 } }] : [];
// メイドを夜に呼ぶと、ほかのメイドに噂される
const gossip = (s, who) => ({ fx: { aff: Object.fromEntries(activeMaids(s).filter(m => m !== who).map(m => [m, -1])) } });
const count = who => ({ call: s => { s.counters[`night_${who}`] = (s.counters[`night_${who}`] || 0) + 1; } });

// 母娘の両方と深い仲になると、いずれ鉢合わせる
const clash = s => visits(s, 'mother') >= 2 && visits(s, 'daughter') >= 2 && !s.flags.family_rift;
const CLASH = [
  [N, '夜明け前。部屋を出たところで――廊下の向こうに、もう一人の姿があった。'],
  [M, '「……どうして、あの子の部屋から出てくるの」'],
  [D, '「ママこそ……なんでそんな顔するの。……まさか」'],
  [B, '（最悪の形で、すべてが露見した）'],
  [N, 'その朝の食卓は、凍りついたように静かだった。お父様だけが、何も知らずに新聞をめくっていた。'],
  { fx: { aff: { mother: -15, daughter: -10 }, susp: 10, flag: 'family_rift' } },
];

export function nightScene(s, id) {
  if (id === 'rest') return [[N, '夜は早めに休んだ。明日も、完璧な執事でいなければならない。']];
  if (id === 'mother') return motherScene(s);
  if (id === 'daughter') return daughterScene(s);
  return [[N, `夜10時。使用人棟の自室に、${PEOPLE[id].name}をそっと招き入れた。`], ...maidScene(s, id), gossip(s, id), count(id)];
}

function motherScene(s) {
  const n = visits(s, 'mother');
  const intro = [[N, '夜11時。主寝室の扉を、そっと叩く。'], ...patrol(s)];
  if (clash(s)) return [...intro, ...CLASH, count('mother')];
  if (n === 0) return [...intro,
    [M, '「……来てくれたのね。あの人？ 今夜も麗子のところよ」'],
    { fx: { flag: 'p_lover' } },
    [M, '「座って。……そんなに固くならないで。今夜は、執事でいなくていいの」'],
    { choice: [
      { t: '隣に座り、グラスを受け取る', fx: { aff: { mother: 6 } }, then: [
        [N, 'ワインの香り。ランプの灯りが、お母様の横顔を柔らかく照らす。'],
        [M, '「あなたの手、冷たいのね。……温めてあげる」'],
        [N, '細い指が、執事の手を胸元へ導いた。――ランプの灯りが、静かに落とされた。'],
        [B, '（夜明け前。寝息を立てるお母様の隣で、天井を見つめた。……これも、絵のためだ）'],
      ] },
      { t: '「奥様、今夜はお話だけに」', fx: { aff: { mother: 3 } }, then: [[M, '「……ずるい人。でも、嫌いじゃないわ」']] },
    ] },
    count('mother')];
  if (n === 1) return [...intro,
    [M, '「待っていたのよ。……ねえ、聞いて。あの人ったら、金庫も鍵も、番号は全部あの女の誕生日なの。笑っちゃうでしょう」'],
    { fx: { flag: 'n_codehint', aff: { mother: 3 } } },
    [B, '（麗子の誕生日……書斎の机の錠も、おそらく）'],
    [N, 'お母様は執事の胸に頭を預け、その髪を指に絡めた。――その夜も、灯りは早く消えた。'],
    count('mother')];
  if (s.chapter === 3 && s.aff.mother >= 75 && !s.flags.eve_mother) return [...intro,
    [M, '「イブの夜……パーティーが終わったら、ここへ来て。あの人はどうせ、麗子のところで朝を迎えるわ」'],
    { fx: { flag: 'eve_mother', aff: { mother: 3 } } },
    [B, '（イブの夜、2階の主寝室にいられる。屋敷の外を回らずに、書斎へ行ける）'],
    [N, '――ガウンの紐がほどける音がして、灯りが落ちた。'],
    count('mother')];
  return [...intro,
    [M, '「あなたがいると、この家も少しだけ暖かいわ。……今夜も、朝までいて」'],
    [N, '――灯りが落ち、夜が更けていった。'],
    { fx: { aff: { mother: 3 } } }, count('mother')];
}

function daughterScene(s) {
  const n = visits(s, 'daughter');
  const intro = [[N, '夜11時。お嬢様の部屋から、まだ明かりが漏れている。'], ...patrol(s)];
  if (clash(s)) return [...intro, ...CLASH, count('daughter')];
  if (n === 0) return [...intro,
    [D, '「執事さん？ ……眠れなくて。ちょっとだけ、話し相手になって」'],
    [D, '「子どもの頃さ、パパの本棚の赤い本に触って、すっごく怒られたの。……なんでだろうね」'],
    { fx: { flag: 'hint_redbook' } },
    [D, '「ねえ、執事さんって、好きな人いる？」'],
    { choice: [
      { t: '「……いますよ」と微笑む', fx: { aff: { daughter: 6 } }, then: [
        [D, '「……ずるい。そういうの、期待しちゃうじゃん」'],
        [N, 'お嬢様は執事の肩にもたれ、指先を絡めてきた。'],
        [N, '――ベッドサイドの灯りを消したのが、どちらだったのかは覚えていない。'],
        [B, '（夜明け前、そっと部屋を出た。……後戻りは、もうできない）'],
      ] },
      { t: '「お嬢様、もうお休みの時間です」', fx: { aff: { daughter: 2 } }, then: [[D, '「……ちぇっ。おやすみ、執事さん」']] },
    ] },
    count('daughter')];
  if (n === 1 && s.aff.daughter >= 65 && !s.flags.d_secret) return [...intro,
    [D, '「……誰にも言わないでね。私、大学、もう辞めてるの。パパにもママにも言えなくて」'],
    { fx: { flag: 'd_secret', aff: { daughter: 4 } } },
    [N, '震える肩を、そっと抱き寄せた。――その夜、お嬢様は執事の腕の中で眠った。'],
    count('daughter')];
  if (s.chapter >= 2 && s.aff.daughter >= 70 && !s.flags.hide_ok) return [...intro,
    [D, '「執事さんの大事な物なら、私のクローゼットに置いていいよ。誰にも言わない」'],
    { fx: { flag: 'hide_ok', aff: { daughter: 3 } } },
    [N, '――灯りの消えた部屋で、二人分の寝息が重なった。'],
    count('daughter')];
  if (s.chapter === 3 && s.aff.daughter >= 75 && !s.flags.eve_daughter) return [...intro,
    [D, '「イブの夜はさ、パーティーが終わったら、ここに来て。……一緒にいたいの」'],
    { fx: { flag: 'eve_daughter', aff: { daughter: 3 } } },
    [B, '（イブの夜、2階のお嬢様の部屋にいられる。屋敷の外を回らずに、書斎へ行ける）'],
    count('daughter')];
  return [...intro,
    [D, '「来てくれた。……今夜も、朝までいてくれる？」'],
    [N, '――窓の外で、冬の風が鳴っていた。'],
    { fx: { aff: { daughter: 3 } } }, count('daughter')];
}

function maidScene(s, m) {
  if (m === 'red') {
    if (!s.flags.n_red_night) return [[R, '「……夜中の1時ごろ、わたし、キッチン裏で明日の仕込みをしてる。裏階段の前」'],
      [R, '「……執事さんも、夜は静か。何してるのかは、聞かない」'], { fx: { flag: 'n_red_night', aff: { red: 3 } } }];
    if (s.aff.red >= 70) return [[R, '「……執事さんが何をするつもりでも、わたしは見てないことにする。……約束」'], { fx: { aff: { red: 2 } } }];
    return [[R, '「……ホットミルク、作ってきた。……飲む？」'], { fx: { aff: { red: 3 } } }];
  }
  if (m === 'blue') {
    if (s.flags.forgery_start && !s.flags.forgery_ready && !s.counters.blue_rush) return [
      [BL, '「模写の話ですよね！ ……夜も描いていいなら、見張っててくれるなら、もっと早く仕上げます！」'],
      { call: s => { s.forgeryDay -= 2; s.counters.blue_rush = 1; } }, { fx: { aff: { blue: 3 } } },
      [B, '（模写の完成が、2日ほど早まりそうだ）']];
    return [[BL, '「夜にお呼ばれなんて、ドキドキしますね！ ……執事さんの似顔絵、今度は笑ってる顔を描かせてください」'], { fx: { aff: { blue: 3 } } }];
  }
  if (m === 'white') {
    if (!s.flags.white_elec) return [[W, '「警報の系統、図面に起こしてみました。照明とは完全に独立してます。……何に使うかは聞きませんけど」'], { fx: { flag: 'white_elec', aff: { white: 3 } } }];
    if (s.chapter === 3 && s.aff.white >= 70 && !s.flags.white_ally) return [[W, '「……イブの深夜1時、警報の系統だけ落とせばいいんですね。理由は聞きません」'], { fx: { flag: 'white_ally' } }];
    return [[W, '「夜は工具の手入れの時間なんですよ。……執事さんも、何か直したい物があるんですか？」'], { fx: { aff: { white: 3 } } }];
  }
  // 黒：正義感が強いので、呼ぶこと自体が賭け
  if (s.aff.black < 60) return [[K, '「……こんな時間に、使用人を部屋に呼ぶなんて。旦那様にご報告すべきでしょうか」'], { fx: { susp: 8, aff: { black: -3 } } }];
  if (s.flags.found_painting && !s.flags.black_ally) return [
    [K, '「……あの隠し部屋の絵。美術館から盗まれた『月下の庭』ですよね」'],
    [B, '（……！）'],
    [K, '「私、ここに来る前は、盗まれた美術品を追う仕事をしていました。旦那様を告発する証拠を探していたんです」'],
    [K, '「あなたが何をしようとしているのか、薄々気づいています。……絵を、在るべき場所に返すと約束してくれるなら」'],
    { choice: [
      { t: '「約束する。あの絵は、母と見た絵なんだ」', fx: { flag: 'black_ally', aff: { black: 10 } },
        then: [[K, '「……決行の夜、大広間の見回りは、私が引き受けます。あなたは見なかったことにします」']] },
      { t: '何も答えない', fx: { aff: { black: -5 } }, then: [[K, '「……そうですか。では、私は私のやり方でやります」']] },
    ] }];
  return [[K, '「……夜分に失礼します。何か、私にお話があるのでは？」'], { fx: { aff: { black: 3 } } }];
}

