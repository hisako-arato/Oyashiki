// 12月2日の水道管の破裂：短いミニゲーム（約40秒）。js/events.js の台詞の間に挟む
//  1. 元栓を閉める（15秒）：破裂した所から、水の来る方へ配管をたどり、近いバルブから順にタップする。脇道のバルブや順番違いは水が噴いて −2秒
//  2. 水を拭く（25秒）：床に広がる水たまりを、タップかなぞって拭き取る。大きくなりきった水たまりは、絨毯に染みる
// done(tier)：'great'／'ok'／'poor'
import * as music from './music.js';

const VALVE_SEC = 15, MOP_SEC = 25;
// 配管の形（盤面の %）。最初が元栓、最後が破裂した所。branch は脇道（[元の点の番号, 行き先]）
const LAYOUTS = [
  { path: [[10, 14], [38, 14], [38, 48], [66, 48], [66, 84], [90, 84]], branch: [[2, [10, 62]], [3, [90, 30]]] },
  { path: [[90, 12], [60, 12], [60, 40], [24, 40], [24, 78], [80, 78]], branch: [[1, [30, 12]], [4, [8, 92]]] },
  { path: [[12, 86], [12, 52], [46, 52], [46, 18], [82, 18], [82, 66]], branch: [[2, [46, 88]], [3, [16, 18]]] },
];
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

export function pipeGame(done) {
  const root = el('div', 'pipe-game');
  const head = el('div', 'pipe-head'), title = el('b'), timer = el('span', 'pipe-timer'), tip = el('p', 'pipe-tip');
  head.append(title, timer);
  const board = el('div', 'pipe-board');
  root.append(head, tip, board);
  document.body.append(root);
  let misses = 0, late = false, soaked = 0;

  // ---- 1. 元栓 ----
  const L = LAYOUTS[Math.floor(Math.random() * LAYOUTS.length)];
  title.textContent = '1. 元栓を閉める';
  tip.textContent = '破裂した所（💥）から、水の来る方へ配管をたどり、近いバルブから順に閉める';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none');
  const line = (a, b, cls) => { const l = document.createElementNS(svg.namespaceURI, 'line'); l.setAttribute('x1', a[0]); l.setAttribute('y1', a[1]); l.setAttribute('x2', b[0]); l.setAttribute('y2', b[1]); l.setAttribute('class', cls); svg.append(l); return l; };
  const segs = [];
  for (let i = 0; i < L.path.length - 1; i++) segs.push(line(L.path[i], L.path[i + 1], 'pipe-line flow'));
  for (const [i, to] of L.branch) line(L.path[i], to, 'pipe-line');
  board.append(svg);
  const mark = (p, text, cls) => { const m = el('div', cls, text); m.style.left = `${p[0]}%`; m.style.top = `${p[1]}%`; board.append(m); return m; };
  mark(L.path[0], '元栓', 'pipe-label');
  mark(L.path[L.path.length - 1], '💥', 'pipe-burst');
  // 正しい順：破裂した所に近い区間から元栓へ
  const valves = [];
  for (let i = segs.length - 1; i >= 0; i--) valves.push({ at: mid(L.path[i], L.path[i + 1]), seg: i });
  const decoys = L.branch.map(([i, to]) => ({ at: mid(L.path[i], to), decoy: true }));
  let next = 0;
  for (const v of [...valves, ...decoys]) {
    v.el = mark(v.at, '', 'pipe-valve');
    if (!v.decoy) v.el.dataset.ord = valves.indexOf(v);
    else v.el.dataset.decoy = '1';
    v.el.addEventListener('pointerdown', e => { e.preventDefault(); tapValve(v); });
  }
  let left = VALVE_SEC, stage = 1, lastT = performance.now();
  function spray(v) {
    music.sfx('miss'); misses++; left -= 2;
    v.el.classList.remove('spray'); void v.el.offsetWidth; v.el.classList.add('spray');
  }
  function tapValve(v) {
    if (stage !== 1 || v.closed) return;
    if (v.decoy || valves.indexOf(v) !== next) return spray(v);
    music.sfx('tap');
    v.closed = true; v.el.classList.add('closed');
    next++;
    // 閉めたバルブより下流の区間は、水が止まる
    for (let i = v.seg; i < segs.length; i++) segs[i].classList.remove('flow');
    if (next >= valves.length) setTimeout(startMop, 500);
  }

  // ---- 2. 拭き取り ----
  const puddles = [];
  let spawnT = 0, pressed = false;
  function startMop() {
    if (stage !== 1 && stage !== 1.5) return;
    stage = 2; left = MOP_SEC;
    board.replaceChildren(); board.classList.add('mop');
    title.textContent = '2. 水を拭く';
    tip.textContent = '水たまりをタップするか、指でなぞって拭き取る。大きくなりきると、絨毯に染みる';
    const first = 3 + Math.min(4, misses) + (late ? 3 : 0);
    for (let i = 0; i < first; i++) spawn(18 + Math.random() * 14);
  }
  function spawn(r = 14) {
    const p = { x: 8 + Math.random() * 84, y: 10 + Math.random() * 80, r, el: el('div', 'pipe-puddle') };
    board.append(p.el); puddles.push(p); place(p);
  }
  const MAX_R = 46;
  function place(p) { p.el.style.left = `${p.x}%`; p.el.style.top = `${p.y}%`; p.el.style.width = p.el.style.height = `${p.r * 2}px`; }
  function wipe(cx, cy, amount) {
    const b = board.getBoundingClientRect();
    for (const p of [...puddles]) {
      const px = b.left + b.width * p.x / 100, py = b.top + b.height * p.y / 100;
      if (Math.hypot(cx - px, cy - py) > p.r + 14) continue;
      p.r -= amount;
      if (p.r < 9) { p.el.remove(); puddles.splice(puddles.indexOf(p), 1); music.sfx('tap'); }
      else place(p);
    }
  }
  board.addEventListener('pointerdown', e => { if (stage !== 2) return; e.preventDefault(); pressed = true; wipe(e.clientX, e.clientY, 16); });
  board.addEventListener('pointermove', e => { if (stage === 2 && pressed) wipe(e.clientX, e.clientY, 2.2); });
  const up = () => { pressed = false; };
  addEventListener('pointerup', up);
  board.addEventListener('pointercancel', () => { pressed = false; });

  function tick(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    left -= dt;
    if (stage === 1) {
      if (left <= 0) {
        // 間に合わなかった：赤羽が元栓の場所を叫び、残りのバルブをまとめて閉める
        late = true;
        for (const v of valves) v.el.classList.add('closed');
        tip.textContent = '赤羽「執事さん、元栓はそっち！」……水が床に広がってしまった';
        stage = 1.5; setTimeout(startMop, 1200);
      }
    } else if (stage === 2) {
      spawnT -= dt;
      if (spawnT <= 0) { spawn(); spawnT = late ? 1.1 : 1.6; }
      for (const p of [...puddles]) {
        p.r += dt * (late ? 6.5 : 5);
        if (p.r >= MAX_R) {
          soaked++; music.sfx('miss');
          p.el.classList.add('soak'); puddles.splice(puddles.indexOf(p), 1);
          setTimeout(() => p.el.remove(), 600);
        } else place(p);
      }
      if (left <= 0) return finish();
    }
    timer.textContent = stage === 1.5 ? '' : `残り ${Math.max(0, Math.ceil(left))}秒`;
    requestAnimationFrame(tick);
  }
  function finish() {
    stage = 3;
    removeEventListener('pointerup', up);
    if (puddles.length > 2) soaked++;
    const tier = !late && soaked === 0 && misses <= 1 ? 'great' : soaked <= 2 && !(late && soaked) ? 'ok' : 'poor';
    board.replaceChildren(el('div', 'pipe-result', { great: '見事に食い止めた！', ok: 'なんとか食い止めた', poor: '絨毯が濡れてしまった……' }[tier]));
    tip.textContent = `バルブの間違い ${misses}回／絨毯に染みた水たまり ${soaked}`;
    timer.textContent = '';
    setTimeout(() => { root.remove(); done(tier); }, 1600);
  }
  requestAnimationFrame(tick);
  return { root };
}
