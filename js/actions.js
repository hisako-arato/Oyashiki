// 執事パートで行える調査・会話の内容
import { setFlag } from './state.js';

const ch = s => s.chapter;

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
    { id: 'pantry', name: '食料庫', run: () => ({ text: '赤メイドが整理した食料庫。几帳面に並んでいる。' }) },
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
      setFlag(s, 'h_blueprint');
      return { text: '屋敷の古い設計図を見つけた。2階、書斎の奥に用途の書かれていない空間がある……。', clue: true };
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
  ],
  storage: [
    { id: 'slips', name: '古い伝票の束', run: s => {
      setFlag(s, 'c_import');
      return { text: '20年前の運送伝票。差出人不明、品名は「額装品」。宛先はこの屋敷、受取人は旦那様だ。', clue: true };
    } },
    { id: 'lift', name: '貨物エレベーター', run: s => {
      setFlag(s, 'elevator');
      return { text: '食材を運ぶ貨物エレベーター。行き先表示を見ると、2階の書斎横の物置に通じている。', clue: true };
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
      if (s.flags.key_hidden) return { text: '引き出しは空だ。鍵はもう手元にある。' };
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

// 会話。上から順に条件を満たす最初のものを使う。once の手がかりは一度だけ
export const TALKS = {
  father: [
    { line: '「報告は手短に。……君の仕事ぶりには満足している」' },
  ],
  mother: [
    { if: s => s.aff.mother >= 50 && ch(s) >= 1 && !s.flags.p_lover, flag: 'p_lover',
      line: '「あの人、また麗子って女のところよ。……ねえ、あなたは私を一人にしないでしょう？」' },
    { if: s => s.aff.mother >= 60, line: '「あなたの淹れる紅茶が一番好き。ねえ、今夜も少し付き合って？」' },
    { line: '「あら執事さん。今日もいい男ね。エステの予約、覚えてくれてる？」' },
  ],
  daughter: [
    { if: s => s.aff.daughter >= 35 && ch(s) >= 1 && !s.flags.hint_redbook, flag: 'hint_redbook',
      line: '「子どもの頃ね、パパの本棚の赤い本を触ったら、すごく怒られたの。なんでだろう？」' },
    { if: s => s.aff.daughter >= 60, line: '「執事さんといると落ち着くな。……ずっとこの家にいてくれる？」' },
    { line: '「執事さんって何でもできるよね。私、何にもできないや」' },
  ],
  red: [
    { if: s => s.aff.red >= 25 && !s.flags.c_red, flag: 'c_red',
      line: '「……夜中、旦那様が書斎で電話してた。『あの絵は年明けに海外で』って。……それだけ」' },
    { if: s => s.aff.red >= 40 && !s.flags.elevator, flag: 'elevator',
      line: '「……倉庫のエレベーター。2階の書斎の横に着く。重い物はあれで運ぶと楽」' },
    { if: s => s.aff.red >= 70, line: '「……執事さんが何をしてても、私は見てないことにする」' },
    { line: '「……（ぼーっとしている）……あ、お昼もうできてます」' },
  ],
  blue: [
    { if: s => s.flags.found_painting && !s.flags.forgery_start && s.aff.blue >= 60, forgery: true,
      line: '「え、絵の模写ですか？ 任せてください！ 見たままを描くの、得意なんです！」' },
    { if: s => s.flags.forgery_start && !s.flags.forgery_ready, line: '「模写、順調ですよ！ 筆が乗ってきました！」' },
    { if: s => s.aff.blue >= 70, line: '「執事さんの似顔絵、また描いちゃいました！ ほら、ちょっと笑ってる顔です」' },
    { line: '「あわわ、お皿割っちゃいました……でも次は大丈夫です！」' },
  ],
  black: [
    { if: s => s.aff.black >= 30 && !s.flags.hall_patrol, flag: 'hall_patrol',
      line: '「夜は私が大広間を見回るよう、旦那様から言いつかっています。怪しい者は見逃しません」' },
    { if: s => s.aff.black >= 70, line: '「執事さんは信頼しています。……だから、裏切らないでくださいね」' },
    { line: '「掃除は終わりました。次の指示をお願いします」' },
  ],
  white: [
    { if: s => s.aff.white >= 40 && !s.flags.white_elec, flag: 'white_elec',
      line: '「この屋敷、警報だけ独立した系統なんですよ。大学で電気工学をやってたので、配線を見れば分かります」' },
    { if: s => s.aff.white >= 70, line: '「執事さんの頼みなら、多少のことは聞きますよ。理由は聞きません」' },
    { line: '「担当分、全部片付けておきました。他に何かあります？」' },
  ],
};

export function pickTalk(s, who) {
  return TALKS[who].find(t => !t.if || t.if(s));
}
