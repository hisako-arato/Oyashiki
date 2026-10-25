// 平日の夜（22時）：休む／仕事のあと共用室でメイドに声をかける（一杯飲みながら話す）／自室に雫を呼ぶ／お母様・お嬢様の部屋を訪ねる
// 選べるようになるまでは、選択肢そのものを出さない（選べる相手がいない夜は、夜の画面を出さずに休む）
// 表現は、性的な描写はせず、大人が読めば分かる程度にとどめる（暗転・翌朝の様子で示す）
import { PEOPLE } from './data.js';
import { activeMaids, fatherHome, rng, dayIndex, isAlly, WEEKS_PER_CHAPTER } from './state.js';
import { joined, told, sulking, sis, afterSisterNight, afterMaidNight, tell } from './sister.js';

const N = 'n', B = 'butler', M = 'mother', D = 'daughter';
const R = 'red', BL = 'blue', K = 'black', W = 'white', S = 'shizuku';

const visits = (s, who) => s.counters[`night_${who}`] || 0;
const NEED = { mother: 60, daughter: 60, red: 35, blue: 35, white: 35 };

// その夜に夜の時間があるか（決行の前夜＝最後の金曜は無し）
export function hasNight(s) {
  return !(s.chapter === 3 && s.week === WEEKS_PER_CHAPTER - 1 && s.day === 4);
}

// 今夜選べる行動の一覧（選べない物は出さない）。fresh：初めて選べるようになった相手
export function nightOptions(s) {
  // 雫が来た日の夜は、必ず雫を呼び出す
  if (joined(s) && !s.flags.shizuku_reunion) return [{ id: K, label: '黒メイド――雫を、自室に呼び出す', ok: true }];
  const opts = [{ id: 'rest', label: '休む', ok: true }];
  for (const m of activeMaids(s)) {
    if (m === K) opts.push({ id: m, label: '自室に雫（黒メイド）を呼ぶ', ok: true });
    else if (s.aff[m] >= NEED[m]) opts.push({ id: m, label: `共用室で${PEOPLE[m].name}に声をかける`, ok: true });
  }
  if (s.aff.mother >= NEED.mother && !fatherHome(s)) opts.push({ id: 'mother', label: 'お母様の部屋（主寝室）を訪ねる', ok: true });
  if (s.aff.daughter >= NEED.daughter) opts.push({ id: 'daughter', label: 'お嬢様の部屋を訪ねる', ok: true });
  for (const o of opts) o.fresh = o.id !== 'rest' && !s.counters[`night_${o.id}`] && !s.counters[`nightseen_${o.id}`];
  return opts;
}
// 夜の画面を出したら、新しく選べるようになった相手を覚えておく（「NEW」は一度だけ）
export function markNightSeen(s) {
  for (const o of nightOptions(s)) if (o.id !== 'rest') s.counters[`nightseen_${o.id}`] = 1;
}
// 休む以外に選べることがあるか（無ければ夜の画面を出さない）
export const nightChoices = s => nightOptions(s).some(o => o.id !== 'rest');
export const REST = [[N, '夜は早めに休んだ。明日も、完璧な執事でいなければならない。']];

// 夜の2階を歩けば、夜食を取りに来た赤メイドに見られることがある。雫が来てからは、雫が見回りの順路を変えてくれる
const patrol = s => joined(s) ? [[N, '（廊下の角で、黒メイドの懐中電灯がふっと逸れた。……雫が、見回りの順路を変えてくれたらしい）']]
  : rng(dayIndex(s) * 97 + 5)() < 0.25 && !isAlly(s, R)
  ? [[R, '「……執事さん？ こんな時間に、2階で何してるの」'], [B, '（「戸締まりの確認だ」とごまかしたが、赤の目は眠そうなまま疑っていた）'], { fx: { susp: 10 } }] : [];
// 共用室でメイドと飲むだけなら噂にはならない（雫だけは、続くと少しすねる）。雫と会うと、打ち明けていないメイドに妬まれる
const gossip = who => ({ fx: s => who === K ? afterSisterNight(s) : afterMaidNight(s, who) });
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
  if (id === 'rest') return REST;
  if (id === 'mother') return motherScene(s);
  if (id === 'daughter') return daughterScene(s);
  // 来た日の呼び出しは避けられないので、噂や妬みの元にはしない
  if (id === K) return [...sisterScene(s), ...(s.flags.shizuku_reunion ? [gossip(K)] : []), count(K)];
  return [[N, `夜10時。仕事を終えた使用人棟の共用室で、${PEOPLE[id].name}に「一杯どう？」と声をかけた。${DRINK[id]}`],
    ...maidScene(s, id), ...confess(s, id), gossip(id), count(id)];
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

// ---- 共用室でメイドと一杯 ----
// 「世間話をする」か、主人公から話題を振る。話題は、主人公が調べて分かったことから生まれる（手がかり → 質問 → 答え）
const DRINK = {
  red: '赤は黙って頷き、小さな鍋で熱燗をつけ始めた。',
  blue: '青は「わーい！」と冷蔵庫から甘い缶チューハイを2本持ってきた。',
  white: '白は「では一杯だけ」と、手際よくハイボールを2杯作った。',
};
// 世間話：上から順に1つずつ。全部話したら、最後の話を繰り返す
const CHATS = {
  red: [
    [[B, '「赤さんは、いつも眠そうだね」'],
      [R, '「……朝4時起き。朝ごはんの仕込み。……それに、夜中の1時ごろも、キッチン裏で明日の仕込みしてる。裏階段の前」'],
      [R, '「……だから、昼間はぼーっとしてる。……執事さんも、夜は静か。何してるのかは、聞かない」'], { fx: { flag: 'n_red_night', aff: { red: 3 } } }],
    [[R, '「……お嬢様、にんじんが嫌い。細かく刻んでハンバーグに入れると、気づかない。……内緒」'],
      { choice: [
        { t: '「さすがだね」と笑う', fx: { aff: { red: 3 } }, then: [[R, '「……ふふ。6年もいれば、好みは全部わかる」']] },
        { t: '「お嬢様に教えてあげようか」とからかう', fx: { aff: { red: 1 } }, then: [[R, '「……だめ。執事さんのお皿にも、刻んで入れる」']] },
      ] }],
    [[R, '「……お酒、温めると甘くなる。……執事さんも、もう一杯」'],
      [N, '赤は猪口を両手で包み、湯気の向こうでぼんやりと目を細めた。'],
      [R, '「……執事さんが来てから、台所が静か。いい意味で。……前は、もっとぴりぴりしてた」'], { fx: { aff: { red: 3 } } }],
    [[R, '「……ホットミルクのほうがよかった？ ……今度は作る。……おやすみ」'], { fx: { aff: { red: 2 } } }],
  ],
  blue: [
    [[BL, '「えへへ、一本で顔が真っ赤になっちゃいました……！ 執事さんは、お酒強そうですね」'],
      [BL, '「わたし、美大を受けたんですけど、落ちちゃって。でも描くのは、やめてないんです！」'], { fx: { aff: { blue: 3 } } }],
    [[BL, '「実家、みかん農家なんです。冬になると箱で届くので、みんなで食べましょうね！」'],
      [BL, '「……ここのお屋敷、広すぎて、最初の夜は迷子になりかけました。執事さんがいてくれて、よかったです」'], { fx: { aff: { blue: 3 } } }],
    [[BL, '「ねえ執事さん、なんで執事になったんですか？」'],
      { choice: [
        { t: '「ホテルで働いていたんだ。人をもてなすのが好きでね」', fx: { aff: { blue: 3 } }, then: [[BL, '「かっこいい……！ だから、紅茶を淹れる手つきがきれいなんですね」']] },
        { t: '「……秘密だ」と微笑む', fx: { aff: { blue: 2 } }, then: [[BL, '「えーっ、ずるい！ いつか絶対、聞き出しますからね！」']] },
      ] }],
    [[BL, '「執事さんの似顔絵、今度は笑ってる顔を描かせてください！ ……あ、もう一本だけ飲んでいいですか？」'], { fx: { aff: { blue: 2 } } }],
  ],
  white: [
    [[W, '「大学では、電力系統の研究をしてました。……メイドになった理由ですか？ それは、もう少し酔ってからにします」'], { fx: { aff: { white: 3 } } }],
    [[W, '「恋愛は非合理です。……でも、非合理なものほど面白いんですよね。この屋敷の人たちも」'],
      { choice: [
        { t: '「白さんにも、非合理なところがあるのか」と聞く', fx: { aff: { white: 3 } }, then: [[W, '「……ハイボールを2杯作ったのは、非合理でしたね。一人で飲むつもりだったのに」']] },
        { t: '「この屋敷の人たち？」と聞き返す', fx: { aff: { white: 2 } }, then: [[W, '「ええ。みんな、何かを隠してる顔をしてます。……執事さんも」']] },
      ] }],
    [[W, '「夜は工具の手入れの時間なんですよ。……執事さんも、何か直したい物があるんですか？」'], { fx: { aff: { white: 2 } } }],
  ],
};
function chatScene(s, m) {
  const list = CHATS[m], n = s.counters[`chat_${m}`] || 0;
  return [...list[Math.min(n, list.length - 1)], { call: s => { s.counters[`chat_${m}`] = n + 1; } }];
}
// 主人公から振る話題。if を満たすあいだ選べ、答えを聞いたら消える（done）
const TOPICS = {
  red: [
    { t: '「旦那様は、どんな方だと思う？」', if: s => s.aff.red >= 40, done: s => s.flags.r_past, then: [
      [R, '「……」（猪口を置いて、しばらく黙っている）'],
      [R, '「……前にいたメイドさん。旦那様の部屋の掃除のあと、『万年筆がなくなった』って言われて、辞めさせられた」'],
      [R, '「……その万年筆、次の週に、旦那様の机の引き出しから出てきた。わたしが見つけた。……でも、誰も謝らなかった」'],
      [R, '「……それから、あの人のことは信じてない。……言わないだけ」'],
      { fx: { flag: 'r_past', aff: { red: 4 } } },
      [B, '（赤は、ずっと黙って見てきたのだ。この屋敷と、旦那様を）']] },
    { t: '「倉庫に、古い額装品の伝票があった。何か知らない？」', if: s => s.flags.c_import && s.flags.r_past, done: s => s.flags.r_parcel, then: [
      [R, '「……額縁の荷物。年に何度か、夜中に来る。トラックじゃなくて、普通の車」'],
      [R, '「……旦那様が、自分で勝手口まで出て受け取る。わたしたちには、触らせない。台所の窓から、見えるだけ」'],
      { fx: { flag: 'r_parcel', aff: { red: 3 } } },
      [B, '（20年前の一枚だけではない。旦那様は、今も夜中に絵を受け取り続けている……）']] },
  ],
  blue: [
    { t: '「青さんの目で見て、この屋敷の絵はどう？」', if: s => s.aff.blue >= 40, done: s => s.flags.bl_frame, then: [
      [BL, '「大広間の肖像画、額縁がすごく立派なんです。あれ、美術館で展示に使うような古い型ですよ」'],
      [BL, '「それに旦那様の書斎の前を通ると、ときどき油絵具とニスの匂いがするんです。……旦那様、絵を描くんでしょうか？」'],
      { fx: { flag: 'bl_frame', aff: { blue: 3 } } },
      [B, '（絵を描く人ではない。……絵を手入れする人の匂いだ）']] },
    { t: '「模写の進み具合はどう？」', if: s => s.flags.forgery_start && !s.flags.forgery_ready, done: s => s.counters.blue_rush, then: [
      [BL, '「順調です！ ……夜も描いていいなら、見張っててくれるなら、もっと早く仕上げます！」'],
      { call: s => { s.forgeryDay -= 2; s.counters.blue_rush = 1; } }, { fx: { aff: { blue: 3 } } },
      [B, '（模写の完成が、2日ほど早まりそうだ）']] },
  ],
  white: [
    { t: '「停電したら、この屋敷の警報はどうなるんだろう」', if: s => !s.flags.white_elec, done: s => s.flags.white_elec, then: [
      [W, '「いい質問ですね。……実は気になって、配線を図面に起こしてみたんです」'],
      [W, '「警報の系統は、照明とは完全に独立してます。ブレーカーを落とすなら、あの系統だけ。……何に使うかは聞きませんけど」'],
      { fx: { flag: 'white_elec', aff: { white: 3 } } }] },
    { t: '「イブの夜、警報の系統を落としてもらえないか」', if: s => s.chapter === 3 && s.aff.white >= 70 && s.flags.white_elec, done: s => s.flags.white_ally, then: [
      [W, '「……イブの深夜1時、警報の系統だけ落とせばいいんですね。理由は聞きません」'],
      [W, '「非合理なお願いですけど。……非合理なものほど、面白いので」'],
      { fx: { flag: 'white_ally' } }] },
  ],
};
function maidScene(s, m) {
  const topics = (TOPICS[m] || []).filter(o => o.if(s) && !o.done(s));
  if (m === 'red' && !s.flags.n_red_night) return chatScene(s, m);   // 最初の夜は、まず世間話から
  if (!topics.length) return chatScene(s, m);
  return [{ choice: [
    { t: '世間話をする', then: chatScene(s, m) },
    ...topics.map(o => ({ t: o.t, then: [[B, o.t], ...o.then] })),
  ] }];
}

// 協力者になったメイドには、雫とのことを打ち明けられる
const CONFESS = {
  red: [[R, '「……やっぱり。黒さんを見る執事さんの目、家族の目だった」'], [R, '「……大丈夫。わたし、お姉さんの代わりくらいはできる。二人とも、見守ってる」']],
  blue: [[BL, '「妹さん……！ じゃあ、お母様と見た絵って、雫さんの思い出の絵でもあるんですね」'],
    [BL, '「……ねえ執事さん、小さい頃の二人の話、もっと聞かせてください。いつか、三人の絵を描きたいな」']],
  white: [[W, '「なるほど。それで二人とも、人前であんなにぎこちなかったんですね。合理的に納得しました」'],
    [W, '「では、雫さんと会う夜は、私が口裏を合わせます。『執事さんは白と配線の打ち合わせ』。……理由は聞きませんよ」']],
};
function confess(s, m) {
  if (!joined(s) || told(s, m) || !isAlly(s, m)) return [];
  return [
    [B, `（${PEOPLE[m].name}なら、信じられる。……雫のことを、話すべきだろうか）`],
    { choice: [
      { t: '黒メイドが妹の雫だと打ち明ける', then: [
        [B, '「実は……黒は、私の妹なんだ。名前は雫。ここへは、二人で母の絵を取り戻しに来た」'],
        ...CONFESS[m], { call: s => tell(s, m) }, { fx: { aff: { [m]: 3 } } },
        [B, '（これで、彼女が雫とのことを噂することはない。……ただ、雫が知ったら何と言うか）'],
      ] },
      { t: 'まだ黙っておく' },
    ] },
  ];
}

// ---- 雫（黒メイド）との夜 ----
const SULK_WHY = {
  streak: [[S, '「……最近、ほかの子と共用室で飲んでばっかり。笑い声、ここまで聞こえてたんだから」']],
  ally: [[S, '「……ねえ。最近あの子と、ずいぶん仲いいよね。作戦の手伝いまでしてもらうんでしょ」']],
  told: [[S, '「……私たちのこと、話したんですか。……ううん、怒ってない。怒ってないけど」'], [S, '「お兄ちゃんの秘密を知ってるのは、私だけがよかったな」']],
};
function sisterScene(s) {
  const intro = [[N, '夜10時。自室の扉を閉めた瞬間、黒メイドの――雫の表情が、ふっとほどけた。']];
  if (!s.flags.shizuku_reunion) return [
    [N, '夜10時。自室に、新しいメイドを呼び出した。扉が閉まり、足音が遠ざかるのを待つ。'],
    [K, '「……ご用件は何でしょうか、執事さん」'],
    [B, '「……雫。どういうことだ」'],
    [S, '「……っ、お兄ちゃん！」'],
    [N, '毅然とした仮面が崩れ、雫は勢いよく執事の胸に飛び込んできた。'],
    [S, '「ずっと会いたかった。半年以上も連絡ひとつくれないで……。ひとりで危ないことしないでよ」'],
    [S, '「お兄ちゃんが執事に応募したとき、私もこっそり出してたの。なかなか採用されなくて、やっと呼ばれたんだから」'],
    [S, '「お母さんの絵……二人で取り戻すって、決めたでしょ。お兄ちゃんだけに背負わせたくなかった」'],
    { choice: [
      { t: '「……無茶をする。だが、来てくれて助かった」と頭を撫でる', then: [[S, '「えへへ……。昔みたい」']] },
      { t: '「危険すぎる。明日にでも辞めろ」と突き放す', then: [[S, '「やだ。絶対やだ。……もう決めたもん」'], [B, '（昔から、こうと決めたら聞かない子だ）']] },
    ] },
    [S, '「それにね、手ぶらで来たんじゃないよ。お母さんの日記、持ってきたの」'],
    [S, '「『月下の庭』の額縁の裏には、美術館の蔵印が押してあるって。盗まれた絵だっていう、動かない証拠になる」'],
    [S, '「あとね、採用の手続きのとき聞いちゃった。オークション会社の運び屋さん、25日の朝7時に来るんだって」'],
    [B, '（25日の朝……。やはり、決行はイブの夜しかない）'],
    { fx: { flag: ['shizuku_reunion', 'shizuku_diary', 'shizuku_courier'] } },
    [S, '「人前では、私たちは他人。私、厳しくするからね。お兄ちゃんは黙って従って」'],
    [S, '「その代わり……夜は、いつでも呼んでいいよ。私からは、いつだって来るから」'],
    [N, '雫は名残惜しそうに袖を離し、何事もなかったような顔で部屋を出ていった。'],
    [B, '（……他のメイドたちに怪しまれないよう、気をつけなければ。新人ばかり呼んでいれば、噂になる）'],
  ];
  if (sulking(s)) return [...intro,
    [S, '「……」（ベッドの端に座ったまま、こちらを見ようとしない）'],
    ...SULK_WHY[sis(s).sulk],
    { choice: [
      { t: '「雫が一番大事だ。作戦のためなんだ」と抱き寄せる', then: [[S, '「……ずるい。そう言えば許すと思って」'], [N, '口ではそう言いながら、雫は執事の胸に額を押しつけた。']] },
      { t: '昔のように、雫の好きな紅茶を淹れる', then: [[S, '「……覚えてたんだ。ミルク多めのやつ」'], [N, '湯気の向こうで、雫の口元がようやく緩んだ。']] },
    ] },
    [B, '（今夜は、話を聞いてやるだけで精一杯だった。……情報はまた今度だ）'],
  ];
  const info = sisterInfo(s);
  return [...intro, ...info,
    [S, '「……ねえ、もうちょっとだけ、ここにいていい？」'],
    [N, '雫は昔のように執事の肩にもたれ、やがて小さな寝息を立て始めた。夜明け前、そっと起こして部屋に帰した。'],
  ];
}
// 雫が持ってきてくれる情報（上から順に、まだ知らないものを1つ）
function sisterInfo(s) {
  if (s.flags.b_ledger && !s.flags.b_shizuku_ledger) return [
    [S, '「地下の帳簿、見たよ。……あの人、お母さんの絵だけじゃなかったんだね」'],
    [S, '「お兄ちゃんの絵だけ取り戻せばいいの。それは変わらない。……でも、これは見なかったことにできないね」'],
    { fx: { flag: 'b_shizuku_ledger' } },
    [B, '（雫の言うとおりだ。あの写真をどうするかは、最後に決めればいい）'],
  ];
  if (s.flags.b_key_lost && !s.flags.b_key) return [
    [S, '「旦那様に見つかったんだって？ ……もう、心配させないでよ」'],
    [S, '「付け替えた錠の鍵、書斎の掃除のときに型を取っておいた。はい、新しい合鍵。今度は気をつけてね」'],
    { fx: { flag: 'b_key' } },
    [B, '（……本当に、頼もしい妹だ）'],
  ];
  if (s.flags.b_hatch && !s.flags.b_key) return [
    [S, '「資料室の床の扉、見つけたんでしょ。……はい、これ」'],
    [S, '「旦那様の書斎を掃除したとき、鍵束から『セラー』って札の鍵を借りて、合鍵を作っておいたの。ばれてないよ」'],
    { fx: { flag: 'b_key' } },
    [B, '（……頼もしい妹だ）'],
  ];
  if (s.chapter >= 3 && !s.flags.guard_info) return [
    [S, '「イブの夜ね、旦那様が警備会社の巡回員を一人呼ぶの。2階の廊下を往復するんだって」'],
    [S, '「でもその人、西の端――物置の前で、必ず立ち止まって窓の外を眺める癖があるの。下見に来たとき、見ちゃった」'],
    { fx: { flag: ['guard_known', 'guard_info'] } },
    [B, '（巡回員が西の端で背を向けている間なら、廊下を抜けられる）'],
  ];
  if (s.flags.desk_lock && !s.flags.key_hidden && !s.flags.p_bday) return [
    [S, '「お兄ちゃん、旦那様の洗濯物から、花屋さんの領収書が出てきたの。『麗子様 お誕生日 11月3日』だって」'],
    { fx: { flag: 'p_bday' } },
  ];
  if (!s.flags.h_blueprint) return [
    [S, '「資料室の整理のとき、屋敷の設計図を見たの。書斎の奥に、何も書いてない空間があったよ」'],
    { fx: { flag: 'h_blueprint' } },
  ];
  if (s.flags.hidden_room && !s.flags.hint_redbook && !s.flags.red_book) return [
    [S, '「書斎を掃除したとき、本棚の赤い本だけ、埃がなかったの。……絶対、何かあるよ」'],
    { fx: { flag: 'hint_redbook' } },
  ];
  return [[S, '「今日もお疲れさま、お兄ちゃん。……昼間は冷たくしてごめんね。あれ、けっこう楽しんでるけど」', 'happy']];
}
