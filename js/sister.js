// 妹・雫（黒メイド）にまつわる仕組み
// 新しいメーターは作らず、他のメイドの好感度と疑惑だけで「噂」と「嫉妬」を表す
//  ・雫と夜に会うと、打ち明けていない他のメイドの好感度が下がる（新人ばかり贔屓している、という陰口）
//  ・雫と会って間もないうちに、好感度30未満のメイドがいると、朝礼で噂になり疑惑が上がる
//  ・協力者（好感度70）になったメイドには、共用室で飲む夜に雫とのことを打ち明けられる。打ち明けたメイドは噂も妬みもしない
//  ・雫と会わずに他のメイドと2夜続けて会う／他のメイドが協力者になる／打ち明ける と、雫がすねる
//    すねている間は、朝礼で重い仕事を押し付けられ、次に会った夜は情報をくれない（会えば機嫌が直る）
import { PEOPLE, CHORES, SISTER } from './data.js';
import { activeMaids, applyFx, setFlag, dayIndex, isAlly } from './state.js';

export const RUMOR_AFF = 30, RUMOR_SUSP = 5, RUMOR_DAYS = 2;

export const joined = s => !!s.flags.shizuku;
export const told = (s, m) => !!s.flags[`told_${m}`];
// 噂や妬みの対象になる、雫以外のメイド
export const otherMaids = s => activeMaids(s).filter(m => m !== SISTER);
export function sis(s) {
  if (!s.sister) s.sister = { last: null, streak: 0, sulk: null };
  return s.sister;
}
export const sulking = s => !!sis(s).sulk;
function sulk(s, why) { if (joined(s) && !sis(s).sulk) sis(s).sulk = why; }

// 雫と夜を過ごしたあと
export function afterSisterNight(s) {
  const st = sis(s);
  st.last = dayIndex(s); st.streak = 0; st.sulk = null;
  return { aff: Object.fromEntries(otherMaids(s).filter(m => !told(s, m)).map(m => [m, -2])) };
}
// 主寝室・お嬢様の部屋で夜を過ごしたあと。雫を呼ばない夜として数え、3回続くとすねる（理由は「部屋」）
export function afterRoomNight(s) {
  if (joined(s) && ++sis(s).streak >= 3) sulk(s, 'room');
  return {};
}
// 他のメイドと共用室で飲んだあと。噂にはならないが、雫を呼ばない夜が3回続くと、雫が少しすねる
export function afterMaidNight(s) {
  if (joined(s) && ++sis(s).streak >= 3) sulk(s, 'streak');
  return {};
}
export function tell(s, m) {
  setFlag(s, `told_${m}`);
  sulk(s, 'told');
}
// 協力者が増えたら、雫は少し妬く（雫が来る前からの協力者は数えない）
function checkNewAllies(s) {
  for (const m of otherMaids(s)) if (isAlly(s, m) && !s.flags[`ally_seen_${m}`]) {
    s.flags[`ally_seen_${m}`] = true;
    sulk(s, 'ally');
  }
}

// 朝礼の前に一度だけ呼ぶ。お知らせの文の一覧を返す
export function morningEvents(s) {
  const t = s.today, notes = [];
  if (!joined(s)) return notes;
  s.aff[SISTER] = 100;   // 雫の好感度は 100 のまま
  checkNewAllies(s);
  const st = sis(s);
  if (st.last != null && dayIndex(s) - st.last <= RUMOR_DAYS) {
    const who = otherMaids(s).filter(m => !told(s, m) && s.aff[m] < RUMOR_AFF);
    if (who.length) {
      applyFx(s, { susp: RUMOR_SUSP });
      t.rumor = true;
      notes.push(`（噂）${who.map(m => PEOPLE[m].name).join('と')}が、執事と黒メイドを見てひそひそ話している。「新人の子ばかり、夜に呼ばれてるって……」　疑惑 +${RUMOR_SUSP}`);
    }
  }
  if (st.sulk) {
    const c = t.chores.filter(c => !CHORES[c.id].butlerOnly && c.id !== 'cook').sort((a, b) => CHORES[b.id].hours - CHORES[a.id].hours)[0];
    if (c) {
      c.assignee = 'butler'; c.forced = true;
      notes.push(`黒メイド「${CHORES[c.id].name}は、執事さんがご自分でなさってください」……目が笑っていない。（雫がすねている。今夜、自室に呼んでなだめよう）`);
    }
  }
  return notes;
}

// 昼に話しかけたとき。人目があれば他人行儀、二人きりなら甘えて手がかりをくれる
export function sisterTalk(s, others) {
  if (others) return [
    '「執事さん、廊下の埃が残っています。……以上です」（人前では、雫は目も合わせない）',
    '「仕事中です。私語は慎んでください」（冷たい声。……人目があるうちは、これでいい）',
  ][dayIndex(s) % 2];
  if (sulking(s)) return '「……ふん。他の子と仲良くしてれば？」（二人きりなのに、そっぽを向かれた）';
  // 前の夜、主寝室やお嬢様の部屋にいたことは、雫にはお見通し
  const room = ['mother', 'daughter'].find(w => s.counters.last_night_who === w && s.counters.last_night_day === dayIndex(s) - 1);
  if (room) return `（雫は袖をつまんだまま、じっとこちらを見上げた）「……今朝、${room === 'mother' ? '主寝室' : 'お嬢様の部屋'}のほうから戻ってきたでしょ。見てたんだから。……作戦なのは、分かってるけど」`;
  // ほかのメイドと仲が良いと、ちくりと言う（2日に1度）
  const close = ['blue', 'red', 'white'].filter(m => s.aff[m] >= 60);
  if (close.length && dayIndex(s) % 2) return `（雫は廊下の角でこちらを引き止め、頬をふくらませた）「${PEOPLE[close[dayIndex(s) % close.length]].name}と、ずいぶん楽しそうだったね。……べつに、いいけど。お兄ちゃんのこと一番知ってるの、私だから」`;
  const hint = !s.flags.hidden_room ? '2階の窓の数と部屋の数、合ってないよ。資料室に古い設計図があるんだって'
    : !s.flags.red_book ? '書斎の本棚にね、一冊だけ埃をかぶってない本があるの。掃除のとき気づいちゃった'
    : s.flags.desk_lock && !s.flags.key_hidden ? '麗子さんって人の誕生日、11月3日なんだって。旦那様、番号は何でもそれにしてそう'
    : !s.flags.found_painting ? '隠し部屋に入るなら、旦那様がいない日にね。見張っててあげる'
    : s.chapter >= 3 && !s.flags.balcony_open ? 'バルコニーのガラス戸、昼のうちに鍵を外しておけば、夜に梯子で入れるよ'
    : 'お兄ちゃん、無理しないでね。……ほら、人が来る前に行って';
  return `（周りに誰もいないのを確かめると、雫は袖をつまんで小声になった）「お兄ちゃん。……${hint}」`;
}
