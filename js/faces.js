// 会話の台詞から、話し手の表情を決める（VRM の表情：neutral / happy / angry / sad / surprised / relaxed）
// シナリオの行に3つ目の要素で表情を書けば、それを優先する： ['mother', '「……」', 'sad']
// どの規則にも当たらなければ、人物ごとのふだんの顔（DEFAULT）にする
const RULES = [
  ['surprised', /[！!][？?]|[？?][！!]|^「え、|^「……え、|えっ|ええっ|まさか|嘘でしょ|なんでそんな|なぜ、ここに|……！|しまった|あわわ|無事か|^「……っ」$/],
  ['angry', /許せ|出て行け|出て行ってもらう|次はない|ふざけ|何が目的|企んで|散らかって|ふん|誰だ|嗅ぎ回|やだ。絶対|ずるい。そう言えば|ちぇっ|つまらない男|どうして、あの子|ばっかり|見ようとしない/],
  ['sad', /ごめん|寂しそう|悲し|辛い|泣|間に合わなかった|もう一度だけ|言えなく|会いたかった|背負わせたく|震え|後戻り|胸の重さ|あと一歩|怒ってない|だけがよかった|一人でやりました/],
  ['happy', /ふふ|えへへ|うふ|嬉し|ありがと|楽し|笑っちゃう|笑ってる|いいよ[。、！]|いいよ」|♪|できました|任せて|大好き|似合|ぜひ|よろしくね|おめでと|やっと、取り戻した|一緒に見よう|ドキドキ|面白い|いってらっしゃい|お手紙|嫌いじゃない|期待しちゃう|お兄ちゃん！|覚えてたんだ|遅いよ|迎えに行った|いい家族|正解だった|厳しくするからね|いい男|好きな人/],
  ['relaxed', /……そう。|おやすみ|ホットミルク|温めて|落ち着く|大丈夫|見守|静か|眠れな|朝まで|もうちょっとだけ|ゆっくり|固くならないで|一緒にいたい|家族の目|納得しました|せいじゃない|寂しくさせない/],
];
const DEFAULT = { mother: 'relaxed', shizuku: 'happy' };
export const FACE_KEYS = ['neutral', 'happy', 'angry', 'sad', 'surprised', 'relaxed'];

export function faceOf(text, override, who) {
  if (override && FACE_KEYS.includes(override)) return override;
  const t = String(text || '');
  for (const [face, re] of RULES) if (re.test(t)) return face;
  if (who === 'blue' && /！/.test(t)) return 'happy';   // 青島はいつも元気
  return DEFAULT[who] || 'neutral';
}
