// ゲームの静的データ（人物・部屋・仕事・調査ポイント）

export const START_HOUR = 9;
export const END_HOUR = 18;
export const ALLY_AFF = 70;
export const PASSCODE = '1103';

export const PEOPLE = {
  butler:  { name: '執事',     color: '#2b2b3a' },
  father:  { name: 'お父様',   color: '#6b5640' },
  mother:  { name: 'お母様',   color: '#b8436f' },
  daughter:{ name: 'お嬢様',   color: '#d68a1c' },
  red:     { name: '赤メイド', color: '#c8362d', maid: true, from: 0 },
  blue:    { name: '青メイド', color: '#2f6fd0', maid: true, from: 0 },   // 11月1日に来た新人
  black:   { name: '黒メイド', color: '#222222', maid: true, from: 2 },
  white:   { name: '白メイド', color: '#9aa3ad', maid: true, from: 1 },
  // 黒メイドの正体は主人公の妹。二人きりの場面だけ「雫」として話す（好感度は持たない）
  shizuku: { name: '雫',       color: '#222222' },
  guard:   { name: '巡回員',   color: '#41608f' },
};
export const SISTER = 'black';

export const MAIDS = ['red', 'blue', 'black', 'white'];
export const FAMILY = ['father', 'mother', 'daughter'];

// 仕事の種類ごとの作業速度（倍率）。高いほど早い
export const SPEED = {
  red:   { cook: 2,   clean: 1,   misc: 1,   art: 0.7 },
  blue:  { cook: 0.6, clean: 0.7, misc: 0.8, art: 2 },
  black: { cook: 0.8, clean: 2,   misc: 1,   art: 0.6 },
  white: { cook: 1.3, clean: 1.3, misc: 1.3, art: 1 },
};
export const MAID_CAPACITY = 8;
export const BLUE_FAIL_RATE = 0.25;

export const ROOMS = {
  hall:     { name: '玄関ホール',     floor: 1 },
  great:    { name: '大広間',         floor: 1 },
  kitchen:  { name: 'キッチン',       floor: 1 },
  kback:    { name: 'キッチン裏',     floor: 1 },
  archive:  { name: '資料室',         floor: 1 },
  laundry:  { name: '洗濯室',         floor: 1 },
  servants: { name: '使用人室',       floor: 1 },
  garden:   { name: '裏庭',           floor: 1 },
  storage:  { name: '倉庫',           floor: 1 },
  corridor: { name: '2F廊下',         floor: 2 },
  balcony:  { name: 'バルコニー',     floor: 2 },
  study:    { name: '書斎',           floor: 2, owner: 'father' },
  hidden:   { name: '隠し部屋',       floor: 2, secret: true },
  master:   { name: '主寝室',         floor: 2, owner: 'mother' },
  droom:    { name: 'お嬢様の部屋',   floor: 2, owner: 'daughter' },
  // 地下（資料室の床の扉から降りる。見つけるまでは出てこない）。ここにいる間は「不在」になる
  cellar:   { name: 'ワイン貯蔵庫',   floor: 0, secret: true, reveal: 'b_found', under: true },
  vault:    { name: '保管庫と搬入路', floor: 0, secret: true, reveal: 'b_vault', under: true, private: true },
};
ROOMS.hidden.reveal = 'hidden_open';

// 仕事の定義。butlerOnly は執事しか担当できない。optional は未完了でも減点なし
export const CHORES = {
  cook:     { name: '料理',               type: 'cook',  hours: 4, room: 'kitchen' },
  great:    { name: '大広間の掃除',       type: 'clean', hours: 3, room: 'great' },
  corridor: { name: '2F廊下の掃除',       type: 'clean', hours: 2, room: 'corridor' },
  garden:   { name: '庭の手入れ',         type: 'misc',  hours: 3, room: 'garden' },
  laundry:  { name: '洗濯',               type: 'misc',  hours: 2, room: 'laundry' },
  study:    { name: '書斎の掃除',         type: 'clean', hours: 2, room: 'study' },
  master:   { name: '主寝室のベッドメイク', type: 'clean', hours: 2, room: 'master' },
  droom:    { name: 'お嬢様の部屋の掃除', type: 'clean', hours: 2, room: 'droom' },
  storage:  { name: '倉庫の整理',         type: 'misc',  hours: 3, room: 'storage' },
  archive:  { name: '資料室の整理',       type: 'misc',  hours: 2, room: 'archive' },
  shopping: { name: '買い出し',           type: 'misc',  hours: 3, room: 'out' },
  flowers:  { name: '花の飾り付け',       type: 'art',   hours: 2, room: 'hall' },
  windows:  { name: '大広間の窓拭き',     type: 'clean', hours: 2, room: 'great' },
  silver:   { name: '銀器磨き',           type: 'misc',  hours: 2, room: 'kitchen' },
  ironing:  { name: 'アイロンがけ',       type: 'misc',  hours: 2, room: 'laundry' },
  hallClean:{ name: '玄関ホールの掃除',   type: 'clean', hours: 2, room: 'hall' },
  escortM:  { name: 'お母様のお供',       type: 'escort', hours: 4, room: 'out', butlerOnly: true, optional: true, with: 'mother' },
  tutorD:   { name: 'お嬢様の勉強の手伝い', type: 'escort', hours: 2, room: 'droom', butlerOnly: true, optional: true, with: 'daughter', after: 13 },
};

// 12月：クリスマスの飾り付け（飾り終えた物は屋敷に残る）と、イブのパーティーの支度
Object.assign(CHORES, {
  xmasStair:   { name: '大階段の手すり飾り',       type: 'art', hours: 2, room: 'great', xmas: true },
  xmasDoor:    { name: '玄関扉のクリスマス飾り',   type: 'art', hours: 1, room: 'hall', xmas: true },
  xmasCards:   { name: 'パーティーの招待状書き',   type: 'art', hours: 3, room: 'archive' },
  xmasSweets:  { name: 'クリスマス菓子の仕込み',   type: 'cook', hours: 4, room: 'kitchen' },
  guestPrep:   { name: '客用の食器とリネンの準備', type: 'misc', hours: 4, room: 'storage' },
  xmasTree:    { name: '大広間のツリーの飾り付け', type: 'art', hours: 3, room: 'great', xmas: true },
  xmasWreath:  { name: '玄関ホールのリース飾り',   type: 'art', hours: 2, room: 'hall', xmas: true },
  xmasGarland: { name: '2F廊下のガーランド飾り',   type: 'art', hours: 2, room: 'corridor', xmas: true },
  xmasLights:  { name: '前庭のイルミネーション',   type: 'art', hours: 3, room: 'garden', xmas: true },
  xmasTouch:   { name: 'クリスマス飾りの手直し',   type: 'art', hours: 1, room: 'great' },
});
export const XMAS = ['xmasTree', 'xmasWreath', 'xmasGarland', 'xmasLights', 'xmasStair', 'xmasDoor'];
// 12月だけ、ふだんの仕事に加わる支度
export const XMAS_POOL = ['xmasCards', 'xmasSweets', 'guestPrep'];

export const CHORE_POOL = ['great', 'corridor', 'garden', 'laundry', 'master', 'droom', 'storage', 'archive', 'shopping', 'flowers', 'windows', 'silver', 'ironing', 'hallClean'];
// 料理のほかに、毎日これだけの仕事が出る（メイドが手持ち無沙汰にならないように。メイドは1人8時間まで）
export const CHORES_PER_CHAPTER = [4, 7, 10, 10];

// 手帳に表示する手がかり
export const CLUES = {
  c_import:     { ch: 0, text: '倉庫の古い伝票：20年前、差出人不明の「額装品」が屋敷に運び込まれている。' },
  c_red:        { ch: 0, text: '赤メイドの証言：夜中、旦那様が書斎で「あの絵は年明けに海外で」と電話していた。' },
  c_daughter:   { ch: 0, text: 'お嬢様の話：子どもの頃から書斎だけは入ってはいけないと言われている。' },
  c_study:      { ch: 0, text: '書斎の空気：かすかに油絵具とニスの匂いがする。' },
  h_window:     { ch: 1, text: '2F廊下の窓：外から見える窓の数と、2階の部屋の数が合わない。' },
  h_blueprint:  { ch: 1, text: '資料室の設計図：書斎の奥に、用途の書かれていない空間がある。' },
  hidden_room:  { ch: 1, text: '【確信】書斎の奥に隠し部屋がある。' },
  hint_redbook: { ch: 1, text: 'お嬢様の思い出：父の本棚の「赤い本」に触れて、ひどく叱られたことがある。' },
  red_book:     { ch: 1, text: '【仕掛け】書斎の本棚、上から5段目の赤い本だけ埃がない。これが隠し扉の仕掛けだ。' },
  desk_lock:    { ch: 1, text: '書斎の机の引き出しは4桁のダイヤル錠。中に何か大事な物がありそうだ。' },
  p_lover:      { ch: 1, text: 'お母様の愚痴：旦那様には「麗子」という愛人がいるらしい。' },
  p_bday:       { ch: 1, text: '洗濯物から：旦那様のスーツに花屋の領収書「麗子様 お誕生日 11月3日」。' },
  key_hidden:   { ch: 1, text: '【入手】引き出しから隠し部屋の鍵を手に入れた。' },
  found_painting:{ ch: 2, text: '【発見】隠し部屋に「月下の庭」がある。額縁には警報センサーの線が繋がっている。' },
  breaker_seen: { ch: 1, text: 'キッチン裏の配電盤：警報は独立した系統らしいが、どれがそれか素人には分からない。' },
  white_elec:   { ch: 2, text: '白メイドは電気工学に詳しい。警報の系統も見分けられそうだ。' },
  ladder:       { ch: 0, text: '倉庫の庭師の梯子：長さは2階のバルコニーまで届く。' },
  balcony_open: { ch: 3, text: '【準備】バルコニーのガラス戸の鍵を、昼のうちに外しておいた。' },
  hall_patrol:  { ch: 2, text: '夜は黒メイドが大広間を見回っている。大広間を通れば見つかる。' },
  m_secret:     { ch: 1, text: '【お母様の秘密】若い男に多額の贈り物をしている。' },
  d_secret:     { ch: 1, text: '【お嬢様の秘密】大学を半年前にこっそり辞めている。' },
  forgery_start:{ ch: 2, text: '青メイドに「月下の庭」の模写を頼んだ。完成まで5日ほどかかる。' },
  forgery_ready:{ ch: 2, text: '【贋作】青メイドの模写が完成した。見分けがつかないほどの出来だ。' },
  white_ally:   { ch: 3, text: '【協力者】白メイドが決行の夜にブレーカーを切ってくれる。' },
  n_codehint:   { ch: 1, text: 'お母様の寝物語：旦那様は、金庫も鍵も番号は全部「麗子の誕生日」にしている。' },
  n_red_night:  { ch: 0, text: '赤メイドの話：夜中の1時ごろ、キッチン裏（裏階段の前）で翌日の仕込みをしている。' },
  r_past:       { ch: 0, text: '赤メイドの過去：前のメイドが旦那様に濡れ衣を着せられて辞めさせられた。それ以来、赤は旦那様を信じていない。' },
  r_parcel:     { ch: 0, text: '赤メイドの話：額縁の荷物が年に何度か夜中に届き、旦那様が自分で勝手口まで受け取りに出る。' },
  back_gate:    { ch: 2, text: '裏庭の通用口：バラ園の奥の塀に、庭師の木戸がある。内側の閂だけで、鍵はない。決行の夜の逃げ道になる。' },
  d_cellar:     { ch: 0, text: 'お嬢様の思い出：子どもの頃の夜中、お父様がランプを持って、資料室の床の下へ降りていくのを見た。' },
  d_eveout:     { ch: 2, text: 'お嬢様の話：イブのパーティーの夜、お父様は客を見送ると麗子のところへ行き、朝まで帰らない。' },
  m_dealer:     { ch: 0, text: 'お母様の寝物語：年に何度か、夜中に勝手口から絵の業者が来る。お父様は絵を「投資」と呼んでいる。' },
  m_letter:     { ch: 1, text: 'お母様の寝物語：書斎の引き出しに、オークション会社からの英語の手紙。お父様の字で「来歴」と書き込みがある。' },
  white_spy:    { ch: 1, text: '白メイドの役目：週末ごとに、旦那様へ屋敷の様子を報告する。白に見られたことは、報告されるかもしれない。' },
  w_past:       { ch: 1, text: '白メイドの過去：会社の帳簿で、記録のない「収蔵庫の設備」の電気工事に気づき、屋敷へ飛ばされた。' },
  white_turned: { ch: 2, text: '【寝返り】地下の保管庫は、白が会社で見た工事だった。白は嘘の報告で執事をかばってくれる。' },
  guard_strict: { ch: 3, text: '【警戒】白の報告で、旦那様がイブの夜の巡回員に「廊下をよく見ろ」と言い聞かせた。西の端で立ち止まる時間は短い。' },
  bl_frame:     { ch: 0, text: '青メイドの目：大広間の肖像画の額は美術館の展示用の型。書斎の前では油絵具とニスの匂いがする。' },
  shizuku:      { ch: 2, text: '【雫】黒メイドの正体は、妹の雫。人前では他人のふり。夜に会えば、他のメイドに妬まれる。' },
  shizuku_diary:{ ch: 2, text: '【雫の情報】母の日記：「月下の庭」の額縁の裏には、美術館の蔵印が押されている。盗品である何よりの証拠だ。' },
  shizuku_courier:{ ch: 2, text: '【雫の情報】オークション会社の運び屋は、12月25日の朝7時に屋敷へ来る。' },
  guard_known:  { ch: 3, text: 'イブの夜は、警備会社の巡回員が2階の廊下を見回るらしい。' },
  guard_info:   { ch: 3, text: '【雫の情報】巡回員は2階の廊下を往復し、西の端（物置の前）で必ず立ち止まって窓の外を眺める。その間なら背後を抜けられる。' },
  told_red:     { ch: 2, text: '【打ち明けた】赤メイドに、雫とのことを話した。もう赤が噂することはない。' },
  told_blue:    { ch: 2, text: '【打ち明けた】青メイドに、雫とのことを話した。もう青が噂することはない。' },
  told_white:   { ch: 2, text: '【打ち明けた】白メイドに、雫とのことを話した。もう白が噂することはない。' },
  eve_mother:   { ch: 3, text: '【イブの夜】お母様の部屋（2階の主寝室）に招かれている。決行は2階から始められる。' },
  eve_daughter: { ch: 3, text: '【イブの夜】お嬢様の部屋に招かれている。決行は2階から始められる。' },
  family_rift:  { ch: 1, text: '【鉢合わせ】お母様とお嬢様に、互いの関係を知られてしまった。家族の溝は深い。' },
  hide_ok:      { ch: 3, text: '【協力者】お嬢様が「贈り物の絵」を部屋で預かってくれる。' },
  // ---- 地下室 ----
  b_well:       { ch: 1, text: '庭の古井戸から、冷たい風が上がってくる。地下に空洞があるのだろうか。' },
  b_circuit:    { ch: 1, text: '白メイドの話：配電盤に、どこにもつながっていない系統がある。屋敷のどこかに、知られていない部屋の電灯が……？' },
  b_wine:       { ch: 1, text: '赤メイドの話：旦那様はワインを取りに行くと、いつもなかなか戻ってこない。ワインセラーはどこにある？' },
  b_plan:       { ch: 1, text: '資料室の設計図：資料室の床下に、階段の記号が描かれている。' },
  b_hatch:      { ch: 2, text: '【発見】資料室の敷物の下に、床の扉がある。鍵穴が付いている。' },
  b_key:        { ch: 2, text: '【入手】旦那様のワインセラーの鍵。' },
  b_light:      { ch: 1, text: '倉庫の懐中電灯を借りた。暗い場所を照らせる。' },
  b_tool:       { ch: 2, text: '倉庫のバール。錆びたボルトくらいなら外せそうだ。' },
  b_found:      { ch: 2, text: '【地下】資料室の下は、古いワイン貯蔵庫だった。上がるときに人に見られないよう気をつけろ。旦那様が在宅の日は、17時台にワインを取りに降りてくる。' },
  b_key_lost:   { ch: 2, text: '【失敗】旦那様に地下で見つかり、セラーの鍵を取り上げられた。錠も付け替えられた。' },
  b_vault:      { ch: 2, text: '【地下】ワイン棚の一つが隠し扉だった。奥は温度と湿度が管理された保管庫だ。' },
  b_frames:     { ch: 2, text: '保管庫に、布を掛けた額縁が十数枚。どれも、美術館の盗難のニュースで見た覚えのある構図だ。' },
  b_ledger:     { ch: 2, text: '【証拠】仕入れ帳：符丁で書かれた絵の名前、金額、仲介人の頭文字。20年前の「月の庭」の行もある。写真に収めた。' },
  b_letter:     { ch: 2, text: 'オークション会社との手紙：「年明けの出品は、来歴を整えた上で」。盗品の来歴を偽っている。' },
  b_slip:       { ch: 2, text: '12月25日の発送伝票：「月下の庭」と一緒に、保管庫の絵がすべて運び出される。' },
  b_tunnel:     { ch: 2, text: '保管庫の奥の古い搬入路は、庭の古井戸へ続いている。出口は錆びた鉄格子でふさがれている。' },
  b_grate:      { ch: 2, text: '【準備】搬入路の鉄格子のボルトを外しておいた。古井戸から地下へ出入りできる。' },
};
// 地下室の存在を示す手がかり（2つ集めると、資料室の床が気になり出す）
export const BASEMENT_HINTS = ['b_well', 'b_circuit', 'b_wine', 'b_plan', 'd_cellar'];
