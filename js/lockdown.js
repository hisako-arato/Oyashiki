// 一般的なスマホゲームのように、ズーム・文字選択・引っ張って更新を無効にする
// （CSS 側の user-select / touch-action / overscroll-behavior と組み合わせて使う）

const stop = e => e.preventDefault();
const isEditable = node => {
  const el = node && node.nodeType === 1 ? node : node && node.parentElement;
  return !!(el && el.closest('input, textarea, select'));
};

// iOS Safari はビューポートの user-scalable=no を無視するため、ピンチ操作自体を止める
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, stop, { passive: false });

// PC：Ctrl + ホイール / Ctrl + +- でのズーム
document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0', ';'].includes(e.key)) e.preventDefault();
});

// 文字の選択・コピー・長押しメニュー（入力欄は除く）
document.addEventListener('selectstart', e => { if (!isEditable(e.target)) e.preventDefault(); });
document.addEventListener('copy', e => { if (!isEditable(e.target)) e.preventDefault(); });
document.addEventListener('cut', e => { if (!isEditable(e.target)) e.preventDefault(); });
document.addEventListener('contextmenu', e => { if (!isEditable(e.target)) e.preventDefault(); });

// 2本指の操作と、スクロールの端を越えて引っ張る操作（引っ張って更新・バウンド）を止める
function scroller(node) {
  for (let el = node && node.nodeType === 1 ? node : node && node.parentElement; el && el !== document.body; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}
let startY = 0;
document.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
document.addEventListener('touchmove', e => {
  if (e.touches.length > 1) return e.preventDefault();
  const dy = e.touches[0].clientY - startY;
  const sc = scroller(e.target);
  if (!sc) return e.preventDefault();
  const atTop = sc.scrollTop <= 0 && dy > 0;
  const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1 && dy < 0;
  if (atTop || atBottom) e.preventDefault();
}, { passive: false });
