// 文の中の効果のお知らせ（〔赤メイドの好感度 +5／疑惑 +10〕）を、色付きで見分けやすく表示する
// 効果は state.js の fxNote() で〔〕に包んでおく
export function fxKind(note) {
  if (/好感度 \+/.test(note)) return 'up';        // 好感度が上がった：赤
  if (/好感度 -/.test(note)) return 'down';       // 下がった：青
  if (/疑惑 \+|心象 -/.test(note)) return 'bad';  // 疑われた・心象が下がった：紫
  if (/疑惑 -|心象 \+/.test(note)) return 'good';
  return 'note';                                   // 手帳に記録した など
}
// 文字列を、ふつうの文字と色付きの効果に分けた DOM ノードの配列にする
export function richNodes(text) {
  const out = [];
  for (const part of String(text).split(/(〔[^〕]*〕)/)) {
    if (!part) continue;
    const m = part.match(/^〔([^〕]*)〕$/);
    if (!m) { out.push(document.createTextNode(part)); continue; }
    const box = document.createElement('span');
    box.className = 'fxs';
    for (const note of m[1].split('／').filter(Boolean)) {
      const sp = document.createElement('span');
      sp.className = `fx fx-${fxKind(note)}`;
      sp.textContent = (fxKind(note) === 'up' ? '♥ ' : '') + note;
      box.append(sp);
    }
    out.push(box);
  }
  return out;
}
