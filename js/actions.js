// 執事パートで行える調査・会話の内容
import { setFlag, fatherHome, dayIndex, afterNight } from './state.js';
import { BASEMENT_HINTS } from './data.js';

const ch = s => s.chapter;
const hints = s => BASEMENT_HINTS.filter(f => s.flags[f]).length;

// 各部屋の調査ポイント。run は {text} を返す。code:true ならダイヤル錠入力へ
export const SPOTS = {
  hall: [
    { id: 'clock', name: '柱時計', run: () => ({ text: '古い柱時計。毎朝ネジを巻くのも執事の仕事だ。' }) },
  ],
  great: [
    { id: 'portrait', name: '家族の肖像画', run: s => ({ text: ch(s) >= 1
      ? '家族3人の肖像画。お父様だけが、どこか別の場所を見ている。'
      : '家族3人の肖像画。お嬢様はまだ幼い。' }) },
    { id: 'stairs', name: '大階段', run: () => ({ text: '2階へ続く大階段。夜でも誰かの目に付きやすい場所だ。' }) },
  ],
  kitchen: [
    { id: 'pantry', name: '食料庫', run: s => {
      if (!s.flags.b_hatch || s.flags.b_key) return { text: '赤羽が整理した食料庫。几帳面に並んでいる。' };
      if (s.flags.b_key_lost) return { text: '奥の釘には何も掛かっていない。錠を付け替えてから、旦那様は鍵を肌身離さず持ち歩いている。' };
      if (fatherHome(s)) return { text: '奥の釘には何も掛かっていない。旦那様が家にいる日は、鍵束を持ち歩いているのだろう。' };
      setFlag(s, 'b_key');
      return { text: '食料庫の奥の釘に、古い鍵が一本だけ掛かっていた。札には「セラー」。旦那様は出かけるとき、ここに置いていくらしい。', clue: true };
    } },
  ],
  kback: [
    { id: 'breaker', name: '配電盤', run: s => {
      if (ch(s) < 1) return { text: '古い配電盤。今は特に気になるところはない。' };
      setFlag(s, 'breaker_seen');
      return { text: '配電盤の奥に、ひとつだけ新しい系統がある。警報装置用だろうか……だが配線が入り組んでいて、素人には見分けられない。', clue: true };
    } },
  ],
  archive: [
    { id: 'blueprint', name: '古い図面棚', run: s => {
      if (ch(s) < 1) return { text: '図面棚には古い書類が詰まっている。今は手を付ける理由がない。' };
      if (!s.flags.h_blueprint) {
        setFlag(s, 'h_blueprint');
        return { text: '屋敷の古い設計図を見つけた。2階、書斎の奥に用途の書かれていない空間がある……。', clue: true };
      }
      if (s.flags.b_plan) return { text: '設計図の1階、資料室の床下に描かれた階段の記号。……地下がある。' };
      setFlag(s, 'b_plan');
      return { text: 'もう一度設計図を見直すと、1階の資料室の床下に、小さく階段の記号が描かれていた。地下……？', clue: true };
    } },
    { id: 'floor', name: '床の敷物', run: s => {
      if (s.flags.b_hatch) return { text: '敷物の下に、床の扉がある。' };
      if (ch(s) < 2 || hints(s) < 2) return { text: hints(s) ? '古い敷物。踏むと、下の床が少しだけ響く気がする。' : '古い敷物。端がすり切れている。' };
      setFlag(s, 'b_hatch');
      return { text: '敷物をめくると、床に四角い扉が埋め込まれていた。真鍮の鍵穴がある。……設計図の階段は、ここだ。', clue: true };
    } },
  ],
  laundry: [
    { id: 'basket', name: '洗濯かご', run: () => ({ text: '洗濯物が溜まっている。ポケットの中身を確かめるのは、洗濯をする者の役目だ。' }) },
  ],
  servants: [
    { id: 'keys', name: '鍵掛け', run: () => ({ text: '屋敷中の合鍵が掛かっている。書斎の鍵だけは、ここにない。' }) },
  ],
  garden: [
    { id: 'path', name: '裏口への小道', run: () => ({ text: '裏庭から倉庫へ抜ける小道。屋敷の窓からは死角になっている。' }) },
    { id: 'well', name: '古井戸', run: s => {
      if (s.flags.b_grate) return { text: '古井戸の底の横穴は、地下の搬入路につながっている。鉄格子はもう外してある。' };
      if (ch(s) < 1) return { text: '今は使われていない古井戸。覗き込むと、ひんやりとした風が上がってくる。' };
      setFlag(s, 'b_well');
      return { text: '覗き込むと、底の方から冷たい風が上がってくる。井戸の底に横穴……？ 地下に空洞があるのかもしれない。', clue: true };
    } },
  ],
  storage: [
    { id: 'slips', name: '古い伝票の束', run: s => {
      setFlag(s, 'c_import');
      return { text: '20年前の運送伝票。差出人不明、品名は「額装品」。宛先はこの屋敷、受取人は旦那様だ。', clue: true };
    } },
    { id: 'flashlight', name: '工具棚', run: s => {
      if (ch(s) < 1) return { text: '庭師さんの工具棚。よく手入れされている。' };
      const got = [];
      if (setFlag(s, 'b_light')) got.push('懐中電灯');
      if (ch(s) >= 2 && setFlag(s, 'b_tool')) got.push('バール');
      if (!got.length) return { text: '工具棚。必要な物は、もう借りてある。' };
      return { text: `工具棚から${got.join('と')}をこっそり借りた。`, clue: true };
    } },
    { id: 'ladder', name: '庭師の梯子', run: s => {
      setFlag(s, 'ladder');
      return { text: '倉庫の奥に、庭師の長い梯子が立て掛けてある。伸ばせば、2階のバルコニーまで届きそうだ。', clue: true };
    } },
  ],
  corridor: [
    { id: 'windows', name: '廊下の窓', run: s => {
      if (ch(s) < 1) return { text: '窓から庭がよく見える。' };
      setFlag(s, 'h_window');
      return { text: '外から数えた2階の窓は7つ。だが部屋の中から数えると6つしかない。書斎の奥に、もう一つ部屋がある……？', clue: true };
    } },
  ],
  study: [
    { id: 'air', name: '部屋の空気', run: s => {
      setFlag(s, 'c_study');
      return { text: 'かすかに油絵具とニスの匂いがする。この部屋のどこかに、絵がある。', clue: true };
    } },
    { id: 'shelf', name: '本棚', run: s => {
      if (!s.flags.hidden_room) return { text: '洋書がぎっしり並んだ本棚。' };
      if (s.flags.red_book) return { text: '上から5段目の赤い本。これが仕掛けだ。' };
      const need = s.flags.hint_redbook ? 1 : 3;
      s.counters.shelf = (s.counters.shelf || 0) + 1;
      if (s.counters.shelf < need) return { text: `隠し部屋に通じる仕掛けがあるはずだ……一冊ずつ確かめていく。（調査 ${s.counters.shelf}/${need}）` };
      setFlag(s, 'red_book');
      return { text: '上から5段目、赤い背表紙の本だけ埃が積もっていない。これだ。', clue: true };
    } },
    { id: 'desk', name: '机の引き出し', run: s => {
      // 隠し部屋の鍵は、使うたびに取り出し、使い終わったら戻す（番号は分かっている）
      if (s.flags.key_hidden && s.flags.key_out) { s.flags.key_out = false; return { text: '隠し部屋の鍵を引き出しに戻し、ダイヤルを回して錠を掛けた。' }; }
      if (s.flags.key_hidden) { s.flags.key_out = true; return { text: '番号を合わせ、引き出しから隠し部屋の鍵を取り出した。……使ったら、戻しておかなければ。' }; }
      setFlag(s, 'desk_lock');
      return { text: '4桁のダイヤル錠が掛かっている。', code: true };
    } },
  ],
  hidden: [
    { id: 'painting', name: '布の掛かった額', run: s => {
      setFlag(s, 'found_painting');
      return { text: '布をめくると、月明かりの庭が現れた。「月下の庭」——母と見た、あの絵だ。額縁には警報センサーの線が繋がっている。触れれば警報が鳴るだろう。', clue: true };
    } },
  ],
  // ---- 地下（ワイン貯蔵庫と、奥の保管庫・搬入路） ----
  cellar: [
    { id: 'rack', name: 'ワイン棚', run: s => {
      if (s.flags.b_vault) return { text: '奥への隠し扉になっているワイン棚。押せば、静かに動く。' };
      s.counters.rack = (s.counters.rack || 0) + 1;
      if (s.counters.rack < 2) return { text: '年代物のワインがぎっしり並んでいる。……床に、棚を引きずったような弧の跡がある。（調査 1/2）' };
      setFlag(s, 'b_vault');
      return { text: '一つだけ、床に擦れた跡のある棚を押すと、棚ごと奥へ動いた。冷たい空気が流れ出してくる。隠し扉だ。', clue: true };
    } },
    { id: 'barrel', name: '樽', run: () => ({ text: '古い樽がいくつも並んでいる。……どれも空だ。ワインのための部屋にしては、手入れが雑すぎる。' }) },
  ],
  vault: [
    { id: 'frames', name: '布を掛けた額縁', run: s => {
      setFlag(s, 'b_frames');
      return { text: '布をめくると、どれも見覚えのある構図だった。美術館の盗難のニュースで見た絵ばかりだ。……この一枚一枚にも、誰かの思い出があったのかもしれない。', clue: true };
    } },
    { id: 'ledger', name: '仕入れ帳', run: s => {
      if (s.flags.b_ledger) return { text: '仕入れ帳。必要なページは、もう写真に収めてある。' };
      setFlag(s, 'b_ledger');
      return { text: '革の帳面に、符丁で書かれた絵の名前、金額、仲介人の頭文字が並ぶ。最初のページに「月の庭」――20年前の日付だ。要所を写真に収めた。', clue: true };
    } },
    { id: 'letters', name: '手紙の束', run: s => {
      setFlag(s, 'b_letter');
      return { text: 'オークション会社からの手紙。「年明けの出品は、来歴を整えた上で」。盗品の出所を、書類ごとすり替えるつもりだ。', clue: true };
    } },
    { id: 'slip', name: '発送伝票', run: s => {
      setFlag(s, 'b_slip');
      return { text: '12月25日付の発送伝票。「月下の庭」の名前の下に、この部屋の絵がすべて書き連ねてある。全部まとめて、海の向こうへ消すつもりだ。', clue: true };
    } },
    { id: 'grate', name: '搬入路の鉄格子', run: s => {
      if (s.flags.b_grate) return { text: '鉄格子のボルトは外してある。古井戸から出入りできる。' };
      setFlag(s, 'b_tunnel');
      if (!s.flags.b_tool) return { text: '細い搬入路の先に、錆びた鉄格子。その向こうに古井戸の底が見える。……ボルトを外す道具があれば。', clue: true };
      setFlag(s, 'b_grate');
      return { text: 'バールで錆びたボルトを外した。鉄格子は、押せば開く。古井戸から地下へ、誰にも見られずに出入りできる。', clue: true };
    } },
    // 旦那様の、万一のための逃げ道。平らな道なので、絵を抱えたままでも外へ出られる（決行の夜の逃げ道）
    { id: 'exitdoor', name: '搬入路の鉄の扉', run: s => {
      if (s.flags.b_exit) return { text: '塀の外の水路へ出る鉄の扉。重い閂は、内側から外せる。……絵を抱えたままでも通れる、平らな道だ。' };
      setFlag(s, 'b_exit');
      return { text: '搬入路の途中の壁に、錆びた鉄の扉があった。耳を当てると、向こうで水の流れる音がする。……塀の外の水路だ。内側に、重い閂が掛かっている。旦那様の、万一のための逃げ道だろう。ここなら、絵を抱えたまま平らな道で外へ出られる。', clue: true };
    } },
  ],
  balcony: [
    { id: 'door', name: 'ガラス戸の鍵', run: s => {
      if (s.chapter < 3) return { text: 'バルコニーのガラス戸。夜は旦那様が鍵を掛けるらしい。' };
      if (s.flags.balcony_open) return { text: 'ガラス戸の鍵は外したままだ。誰も気づいていない。' };
      setFlag(s, 'balcony_open');
      return { text: '人目のない隙に、ガラス戸の鍵をそっと外しておいた。決行の夜、ここから入れる。', clue: true };
    } },
  ],
  master: [
    { id: 'dresser', name: '鏡台', run: s => {
      if (ch(s) < 1) return { text: '高価な化粧品が並んでいる。' };
      setFlag(s, 'm_secret');
      return { text: '引き出しに、若い男への高級時計の領収書が何枚も。お母様の秘密だ。', clue: true };
    } },
  ],
  droom: [
    { id: 'desk', name: '勉強机', run: s => {
      if (ch(s) < 1) return { text: '大学の教科書が並んでいる。' };
      setFlag(s, 'd_secret');
      return { text: '教科書の間に「退学届（控）」——日付は半年前だ。お嬢様の秘密を知ってしまった。', clue: true };
    } },
  ],
};

// 会話。上から順に条件を満たす最初のものを使う。flag の手がかりは一度だけ
// ask：主人公から振る一言（手がかりの話は、主人公が尋ねて相手が答える形にする）
export const TALKS = {
  father: [
    // 白井の報告で疑惑が上がった翌週
    { if: s => s.counters.w_warn != null && dayIndex(s) - s.counters.w_warn <= 5,
      line: '「最近、仕事の合間に屋敷をうろついているそうだな。……執事の仕事は、屋敷の中を嗅ぎ回ることではないぞ」' },
    { line: '「報告は手短に。……君の仕事ぶりには満足している」' },
  ],
  mother: [
    { if: s => afterNight(s, 'mother') && s.flags.m_close, line: '「おはよう、執事さん。……よく眠れた？ 私は、あまり」（すれ違いざま、袖を指先でつままれた）' },
    { if: s => s.aff.mother >= 50 && ch(s) >= 1 && !s.flags.p_lover, flag: 'p_lover', ask: '「旦那様は、今夜もお帰りが遅いのでしょうか」',
      line: '「あの人、また麗子って女のところよ。……ねえ、あなたは私を一人にしないでしょう？」' },
    { if: s => s.aff.mother >= 60, line: '「あなたの淹れる紅茶が一番好き。ねえ、今夜も少し付き合って？」' },
    { line: '「あら執事さん。今日もいい男ね。エステの予約、覚えてくれてる？」' },
  ],
  daughter: [
    { if: s => afterNight(s, 'daughter') && s.flags.d_close, line: '「……おはよ」（目が合った瞬間、ぱっと逸らされた。耳まで赤い）「昨日のこと、誰にも言ってないからね」' },
    { if: s => s.aff.daughter >= 35 && ch(s) >= 1 && !s.flags.hint_redbook, flag: 'hint_redbook', ask: '「お嬢様は、旦那様の書斎に入られたことは？」',
      line: '「子どもの頃ね、パパの本棚の赤い本を触ったら、すごく怒られたの。なんでだろう？」' },
    { if: s => s.aff.daughter >= 60, line: '「執事さんといると落ち着くな。……ずっとこの家にいてくれる？」' },
    { line: '「執事さんって何でもできるよね。私、何にもできないや」' },
  ],
  red: [
    { if: s => (afterNight(s, 'mother') && s.flags.m_close) || (afterNight(s, 'daughter') && s.flags.d_close), line: '「……今朝の執事さん、甘い匂い」（赤羽は鍋をかき混ぜながら、こちらを見ずに言った）' },
    { if: s => s.aff.red >= 25 && !s.flags.c_red, flag: 'c_red', ask: '「赤羽さん、旦那様は夜も遅くまで起きていらっしゃるのかな」',
      line: '「……うん。わたし、夜中に仕込みしてるから、聞こえる。この前、書斎で電話してた。『あの絵は年明けに海外で』って。……それだけ」' },
    { if: s => s.aff.red >= 35 && !s.counters.night_red, line: '「……仕事のあと、たまに共用室で熱燗飲んでる。……執事さんも、来る？」' },
    { if: s => s.aff.red >= 40 && !s.flags.ladder, flag: 'ladder', ask: '「2階のバルコニーの窓、外側が汚れていてね。外から拭けないものかな」',
      line: '「……倉庫に庭師さんの梯子。バルコニーまで届く。危ないから、使っちゃだめって言われてる」' },
    { if: s => s.aff.red >= 45 && ch(s) >= 1 && !s.flags.b_wine, flag: 'b_wine', ask: '「今夜のワインは、旦那様がご自分で選ばれるのかな」',
      line: '「……旦那様、ワインは自分で取りに行く。いつもなかなか戻ってこない。……セラー、どこにあるのか、わたしも知らない」' },
    { if: s => s.aff.red >= 70, line: '「……執事さんが何をしてても、わたしは見てないことにする。……あの人には、悪い意味で借りがあるから」' },
    { line: '「……（ぼーっとしている）……あ、お昼もうできてます」' },
  ],
  blue: [
    { if: s => s.flags.found_painting && !s.flags.forgery_start && s.aff.blue >= 60, forgery: true, ask: '「青島さん、絵の模写を頼めないかな。見たままを、そっくりに」',
      line: '「え、絵の模写ですか？ 任せてください！ 美大の模写の授業、ずっといちばんだったんです！」' },
    { if: s => s.flags.forgery_start && !s.flags.forgery_ready, line: '「模写、順調ですよ！ 筆が乗ってきました！」' },
    { if: s => s.aff.blue >= 35 && !s.counters.night_blue, line: '「今夜、共用室で一緒に飲みませんか？ 甘いの、冷やしてあるんです！」' },
    { if: s => s.aff.blue >= 70, line: '「執事さんの似顔絵、また描いちゃいました！ ほら、ちょっと笑ってる顔です」' },
    { line: '「あわわ、お皿割っちゃいました……でも次は大丈夫です！」' },
  ],
  black: [
    { if: s => s.aff.black >= 30 && !s.flags.hall_patrol, flag: 'hall_patrol', ask: '「黒さん、夜の見回りは誰の担当に？」',
      line: '「夜は私が大広間を見回るよう、旦那様から言いつかっています。怪しい者は見逃しません」' },
    { if: s => s.aff.black >= 70, line: '「執事さんは信頼しています。……だから、裏切らないでくださいね」' },
    { line: '「掃除は終わりました。次の指示をお願いします」' },
  ],
  white: [
    { if: s => s.aff.white >= 40 && !s.flags.white_elec, flag: 'white_elec', ask: '「白井さん、この屋敷の配電盤は古いね。見たことはある？」',
      line: '「この屋敷、警報だけ独立した系統なんですよ。大学で電気工学をやってたので、配線を見れば分かります」' },
    { if: s => s.aff.white >= 35 && !s.counters.night_white, line: '「仕事のあと、共用室でハイボールでもどうです？ 一人で飲むのは、非合理なので」' },
    { if: s => s.aff.white >= 45 && ch(s) >= 1 && s.flags.white_elec && !s.flags.b_circuit, flag: 'b_circuit', ask: '「配電盤のことで、ほかに気づいたことは？」',
      line: '「そういえば配電盤に、どこにもつながっていない系統があるんですよ。温度と湿度を一定に保つ設備の電源みたいです。……美術館の収蔵庫みたいな。屋敷のどこかに、誰も知らない部屋がある計算になります」' },
    { if: s => s.aff.white >= 70, line: '「執事さんの頼みなら、多少のことは聞きますよ。理由は聞きません」' },
    { line: '「担当分、全部片付けておきました。他に何かあります？」' },
  ],
};

export function pickTalk(s, who) {
  return TALKS[who].find(t => !t.if || t.if(s));
}
