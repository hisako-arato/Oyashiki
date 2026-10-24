// 人物照会とストーリーの文章。物語で明かされるまでは伏せる（ネタバレ防止）
import { WEEKS_PER_CHAPTER } from './state.js';

// shown：照会できるか / name・age・text は状態に応じて変えられる / notes：分かったこと（フラグが立つと表示）
export const PROFILES = [
  { id: 'butler', name: '執事（主人公）', age: '30代', shown: () => true,
    text: '元・一流ホテルのホテルマン。リストラに遭ったという触れ込みで、4月から鷹宮家に住み込みで働いている。料理、掃除、ベッドメイク、何でもこなす。',
    notes: [
      [() => true, '本当の目的は、この屋敷に隠された絵「月下の庭」を取り戻すこと。20年前に美術館から盗まれた、母との思い出の絵だ。'],
      [s => s.flags.shizuku_reunion, '妹の雫が、黒メイドとして屋敷に潜り込んできた。人前では他人のふりをしている。'],
    ] },
  { id: 'father', name: 'お父様', age: '50代', shown: () => true,
    text: '鷹宮家の当主。大手企業の役員で、家族のことには無頓着。ほとんど家にいない。',
    notes: [
      [s => s.flags.c_red, '夜中に書斎で「あの絵は年明けに海外で」と電話していた。'],
      [s => s.flags.p_lover, '「麗子」という愛人がいる。'],
      [s => s.flags.p_bday, '麗子の誕生日は11月3日。花屋の領収書が残っていた。'],
      [s => s.flags.n_codehint, '金庫も鍵も、番号は全部「麗子の誕生日」にしている。'],
      [s => s.flags.found_painting, '書斎の奥の隠し部屋に「月下の庭」を隠し持っている。'],
    ] },
  { id: 'mother', name: 'お母様', age: '40代', shown: () => true,
    text: '40代とは思えないほど若々しく美しい。仕事はせず、エステやブティック通いが日課。若い男が好きで、執事にちょっかいをかけてくる。',
    notes: [
      [s => s.flags.m_secret, '【秘密】若い男に、多額の贈り物をしている。'],
      [s => s.flags.eve_mother, 'イブの夜、主寝室に招かれている。'],
      [s => s.flags.family_rift, '執事とお嬢様の関係を知ってしまった。'],
    ] },
  { id: 'daughter', name: 'お嬢様', age: '21歳', shown: () => true,
    text: '鷹宮家の一人娘。どこにでもいる普通の大学生で、世間のことはよく知らない。執事の働きぶりに感心している。',
    notes: [
      [s => s.flags.hint_redbook, '子どもの頃、父の本棚の「赤い本」に触れてひどく叱られた。'],
      [s => s.flags.d_secret, '【秘密】大学を半年前にこっそり辞めている。'],
      [s => s.flags.hide_ok, '執事の「大事な物」を、クローゼットで預かってくれる。'],
      [s => s.flags.eve_daughter, 'イブの夜、自分の部屋に招いてくれている。'],
      [s => s.flags.family_rift, '執事とお母様の関係を知ってしまった。'],
    ] },
  { id: 'red', name: '赤メイド', age: '年齢不詳', shown: () => true,
    text: '執事が来る前から働いているメイド。いつもぼーっとしていて、何を考えているのか分からない。料理がとても早い。',
    notes: [
      [s => s.flags.n_red_night, '夜中の1時ごろ、キッチン裏で翌日の仕込みをしている。'],
      [s => s.flags.told_red, '雫とのことを打ち明けた。二人を見守ってくれている。'],
    ] },
  { id: 'blue', name: '青メイド', shown: s => s.chapter >= 1,
    text: '11月後半に来たメイド。仕事はできないが、明るく活発。絵がとても上手い。',
    notes: [
      [s => s.flags.forgery_start, '「月下の庭」の模写を引き受けてくれた。'],
      [s => s.flags.forgery_ready, '模写が完成した。見分けがつかないほどの出来だ。'],
      [s => s.flags.told_blue, '雫とのことを打ち明けた。いつか兄妹の絵を描きたいらしい。'],
    ] },
  { id: 'white', name: '白メイド', shown: s => s.chapter >= 1,
    text: '11月後半に来たメイド。どんな仕事もテキパキとこなす。大学で電気工学をやっていた。',
    notes: [
      [s => s.flags.white_elec, '屋敷の警報が、独立した系統になっていると見抜いた。'],
      [s => s.flags.white_ally, 'イブの深夜1時、警報の系統を落としてくれる。'],
      [s => s.flags.told_white, '雫とのことを打ち明けた。会う夜は口裏を合わせてくれる。'],
    ] },
  { id: 'black', shown: s => !!s.flags.shizuku,
    name: s => s.flags.shizuku_reunion ? '黒メイド ＝ 雫（妹）' : '黒メイド',
    age: s => s.flags.shizuku_reunion ? '24歳' : '',
    text: s => s.flags.shizuku_reunion
      ? '執事の妹。兄が大好きで、母との思い出の絵を二人で取り戻すため、こっそりメイドに応募していた。人前では真面目で厳しい新人を演じ、二人きりになると甘えてくる。'
      : '12月に来た新人のメイド。真面目で正義感が強く、言われたことは必ずやる。掃除がとても早い。……その顔に、見覚えがある。',
    notes: [
      [s => s.flags.shizuku_diary, '母の日記を持ってきた。「月下の庭」の額縁の裏には、美術館の蔵印がある。'],
      [s => s.flags.hall_patrol, '夜は大広間を見回る役目。兄のことは見逃してくれる。'],
      [s => s.flags.guard_info, 'イブの夜の巡回員の癖を教えてくれた。'],
    ] },
  { id: 'guard', name: '巡回員', shown: s => !!s.flags.guard_known,
    text: 'イブの夜だけ、旦那様が警備会社から呼んだ巡回員。2階の廊下を見回る。',
    notes: [[s => s.flags.guard_info, '廊下の西の端（物置の前）で、必ず立ち止まって窓の外を眺める。']] },
];

const val = (v, s) => typeof v === 'function' ? v(s) : v;
export function profileOf(p, s) {
  return { id: p.id, name: val(p.name, s), age: val(p.age, s) || '', text: val(p.text, s), notes: p.notes.filter(([c]) => c(s)).map(([, t]) => t) };
}

// ストーリー：たどり着いた章まで読み返せる
export const STORY = [
  { from: s => true, title: 'プロローグ　4月〜10月',
    text: '都内の高台に建つ鷹宮家の屋敷に、一人の執事が雇われた。目的は、屋敷のどこかに隠された絵「月下の庭」を取り戻すこと。年明けには海外のオークションに出されてしまう。半年かけて信用を築き、残された時間はあと2か月。' },
  { from: s => s.chapter >= 0, title: '第1章　11月前半　情報収集',
    text: '書斎だけは誰も入れない。伝票、メイドの証言、油絵具の匂い……。少しずつ、絵がこの屋敷にあるという確信が強まっていく。旦那様は来週から新しいメイドを二人雇うと言った。' },
  { from: s => s.chapter >= 1, title: '第2章　11月後半　隠し部屋',
    text: '明るい青メイドと、有能な白メイドがやって来た。外から見える窓の数と、2階の部屋の数が合わない。書斎の奥には、何かがある。嵐の夜、旦那様は警報装置の電源を気にしていた。' },
  { from: s => s.chapter >= 2, title: '第3章　12月前半　月下の庭',
    text: s => (s.flags.shizuku_reunion
      ? '新しく来た黒メイドは、妹の雫だった。人前では他人のふりをしながら、二人で絵を取り戻すと誓い合う。'
      : '新しいメイドが一人やって来た。') + 'そして書斎の電話から漏れた声――絵はイブのパーティーの翌朝、梱包されて運び出される。' },
  { from: s => s.chapter >= 3, title: '最終章　12月後半　決行',
    text: '屋敷はクリスマスの飾り付けで華やいでいく。決行は12月24日、クリスマス・イブの深夜。協力者を集め、道順を決め、夜明けまでに絵を持ち出す。' },
];
export const storyText = (e, s) => val(e.text, s);
export const chapterProgress = s => `第${s.chapter + 1}章　${s.week + 1}/${WEEKS_PER_CHAPTER}週目`;
