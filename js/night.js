// 平日の夜（22時）：休む／自室でメイドと密談／お母様・お嬢様の部屋を訪ねる
// 表現は、性的な描写はせず、大人が読めば分かる程度にとどめる（暗転・翌朝の様子で示す）
import { PEOPLE } from './data.js';
import { activeMaids, fatherHome, rng, dayIndex, isAlly, WEEKS_PER_CHAPTER } from './state.js';
import { joined, told, sulking, sis, afterSisterNight, afterMaidNight, tell } from './sister.js';

const N = 'n', B = 'butler', M = 'mother', D = 'daughter';
const R = 'red', BL = 'blue', K = 'black', W = 'white', S = 'shizuku';

const visits = (s, who) => s.counters[`night_${who}`] || 0;
const NEED = { mother: 60, daughter: 60, red: 50, blue: 50, white: 50 };

// その夜に夜の時間があるか（決行の前夜＝最後の金曜は無し）
export function hasNight(s) {
  return !(s.chapter === 3 && s.week === WEEKS_PER_CHAPTER - 1 && s.day === 4);
}

// 選べる行動の一覧。ok でない物は理由付きで灰色にする
export function nightOptions(s) {
  // 雫が来た日の夜は、必ず雫を呼び出す
  if (joined(s) && !s.flags.shizuku_reunion) return [{ id: K, label: '黒メイド――雫を、自室に呼び出す', ok: true }];
  const opts = [{ id: 'rest', label: '休む', ok: true }];
  for (const m of activeMaids(s)) opts.push(m === K
    ? { id: m, label: '自室に雫（黒メイド）を呼ぶ', ok: true }
    : { id: m, label: `自室に${PEOPLE[m].name}を呼んで密談する`, ok: s.aff[m] >= NEED[m], why: `好感度${NEED[m]}以上` });
  opts.push({ id: 'mother', label: 'お母様の部屋（主寝室）を訪ねる', ok: s.aff.mother >= NEED.mother && !fatherHome(s),
    why: s.aff.mother < NEED.mother ? `好感度${NEED.mother}以上` : '今夜は旦那様が家にいる' });
  opts.push({ id: 'daughter', label: 'お嬢様の部屋を訪ねる', ok: s.aff.daughter >= NEED.daughter, why: `好感度${NEED.daughter}以上` });
  return opts;
}

// 夜の2階を歩けば、夜食を取りに来た赤メイドに見られることがある。雫が来てからは、雫が見回りの順路を変えてくれる
const patrol = s => joined(s) ? [[N, '（廊下の角で、黒メイドの懐中電灯がふっと逸れた。……雫が、見回りの順路を変えてくれたらしい）']]
  : rng(dayIndex(s) * 97 + 5)() < 0.25 && !isAlly(s, R)
  ? [[R, '「……執事さん？ こんな時間に、2階で何してるの」'], [B, '（「戸締まりの確認だ」とごまかしたが、赤の目は眠そうなまま疑っていた）'], { fx: { susp: 10 } }] : [];
// メイドを夜に呼ぶと、ほかのメイドに噂される。雫と会うと、打ち明けていないメイドに強く妬まれる
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
  if (id === 'rest') return [[N, '夜は早めに休んだ。明日も、完璧な執事でいなければならない。']];
  if (id === 'mother') return motherScene(s);
  if (id === 'daughter') return daughterScene(s);
  // 来た日の呼び出しは避けられないので、噂や妬みの元にはしない
  if (id === K) return [...sisterScene(s), ...(s.flags.shizuku_reunion ? [gossip(K)] : []), count(K)];
  return [[N, `夜10時。使用人棟の自室に、${PEOPLE[id].name}をそっと招き入れた。`], ...maidScene(s, id), ...confess(s, id), gossip(id), count(id)];
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
  return [];
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
  streak: [[S, '「……最近、ずっと他の子ばっかり呼んでたでしょ。廊下で足音、聞こえてたんだから」']],
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
  return [[S, '「今日もお疲れさま、お兄ちゃん。……昼間は冷たくしてごめんね。あれ、けっこう楽しんでるけど」']];
}
