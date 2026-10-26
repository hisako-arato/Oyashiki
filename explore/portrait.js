// 会話の話し手を、胸から上の VRM で映す（台詞に合わせて表情を変え、話している間は口を動かす）
// 物語パートの会話画面と、3Dの屋敷のメッセージ欄の両方で使う。描画は1つの canvas を使い回す
// 端末のメモリを節約するため、屋敷と同じレンダラー（engine.js）で描き、屋敷で使っている VRM をそのまま借りる
// （VRM の複製や、2つ目の3D描画を作らない）。借りるのは描く一瞬だけで、描いたら屋敷の中の元の場所へ戻す
import { THREE, loadVRM, disposeVRM, loaded, driveVRM, talkMouth, crowdMode, setOutline } from './vrm.js';
import { renderer } from './engine.js';

let canvas = null, ctx = null, scene, camera, rt = null, buf = null, img = null;
let cur = null, want = null, face = 'neutral', talkLeft = 0, last = 0, lastDraw = 0, looping = false, dirty = true, activeUntil = 0;
const heads = new Map();
const ALT = new Set(['butler2', 'mother2', 'daughter2', 'black2', 'black3']);
let lastAlt = null;
// 覚えている着替えを手放す（屋敷で着ている物は手放さない）。昼の屋敷に戻るときにも呼ぶ
export function releaseAlt() {
  if (!lastAlt) return;
  const id = lastAlt; lastAlt = null;
  if (cur && cur.id === id) { cur = null; if (canvas) canvas.classList.remove('ready'); }
  if (loaded(id)) loadVRM(id, 'lite').then(v => { if (!v.scene.parent) disposeVRM(id, 'lite'); }).catch(() => {});
}

export function portraitCanvas() {
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.className = 'vportrait';
  ctx = canvas.getContext('2d');
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(24, 3 / 4, 0.05, 20);
  scene.add(new THREE.HemisphereLight('#fff4e6', '#6a5a50', 1.7));
  const key = new THREE.DirectionalLight('#ffffff', 1.8);
  key.position.set(0.8, 1.6, 2.4); scene.add(key);
  return canvas;
}

// id の人物を、face の表情で映す。textLen：台詞の長さ（口を動かす時間。心の声なら 0）
export function showPortrait(id, f, textLen = 0) {
  portraitCanvas();
  face = f || 'neutral';
  talkLeft = textLen ? Math.min(3, 0.4 + textLen * 0.07) : 0;
  want = id;
  // 別の人に替わったら、読み込み終わるまで前の人は映さない
  if (cur && cur.id !== id) { cur = null; canvas.classList.remove('ready'); }
  // 部屋着などの着替え（屋敷に置いていない VRM）は、最後に使った1着だけ覚えておく（別の着替えが要るときに手放す）
  if (ALT.has(id) && lastAlt !== id) { releaseAlt(); lastAlt = id; }
  loadVRM(id, 'lite').then(vrm => {
    if (want !== id) return;
    if (!cur) cur = { id, vrm, head: headHeight(id, vrm) };
    dirty = true;
  }).catch(() => {});
  dirty = true;
  if (!looping) { looping = true; last = performance.now(); requestAnimationFrame(frame); }
}

// 足元から頭の骨（あごの辺り）までの高さ。屋敷の中のどこに立っていても同じになるよう、VRM の中の座標で測る
function headHeight(id, vrm) {
  if (heads.has(id)) return heads.get(id);
  const head = vrm.humanoid.getNormalizedBoneNode('head');
  let y = 1.4;
  if (head) {
    vrm.scene.updateMatrixWorld(true);
    y = vrm.scene.worldToLocal(head.getWorldPosition(new THREE.Vector3())).y;
  }
  heads.set(id, y);
  return y;
}

function frame(now) {
  if (!canvas || !canvas.isConnected) { looping = false; return; }
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  talkLeft = Math.max(0, talkLeft - dt);
  // 1秒に30回まで（人が多い場面は15回）。話していない間は、表情が落ち着くまで描いたら止める
  if (now - lastDraw < (crowdMode() ? 66 : 33)) return;
  if (talkLeft > 0 || dirty) { activeUntil = now + 700; dirty = false; }
  if (crowdMode() && now > activeUntil) return;   // 人が多い場面だけ、黙っている間は描くのを止める
  lastDraw = now;
  const pr = Math.min(devicePixelRatio, canvas.clientWidth > 200 ? 1.5 : 2);
  const w = Math.round(canvas.clientWidth * pr), h = Math.round(canvas.clientHeight * pr);
  if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (rt) rt.dispose();
    rt = new THREE.WebGLRenderTarget(w, h, { samples: 2 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    buf = new Uint8Array(w * h * 4);
    img = ctx.createImageData(w, h);
    activeUntil = now + 700;
  }
  if (!cur) { ctx.clearRect(0, 0, w, h); return; }
  const { vrm } = cur;
  const faces = { happy: 0, angry: 0, sad: 0, surprised: 0, relaxed: 0 };
  if (face in faces) faces[face] = 1;
  const talk = talkLeft > 0 ? 1 : 0;
  // 屋敷で動いている人なら、動きは屋敷に任せて口だけ動かす。そうでなければ、ここで動かす
  if (now - (vrm.motion.lastDrive || 0) < 80) talkMouth(vrm, talk);
  else driveVRM(vrm, false, dt, { face: faces, talk, portrait: true });
  draw(vrm, w, h);
}

const clearColor = new THREE.Color();
function draw(vrm, w, h) {
  const s = vrm.scene, home = s.parent, vis = s.visible;
  const pos = s.position.clone(), rot = s.quaternion.clone();
  scene.add(s);
  s.position.set(0, 0, 0); s.quaternion.identity(); s.visible = true;
  // 頭の骨はあごの辺り。髪の上までと胸元が収まるように映す
  const y = cur.head;
  camera.position.set(0, y + 0.04, 1.5);
  camera.lookAt(0, y - 0.01, 0);
  const crowd = crowdMode();
  if (crowd) setOutline(s, true);   // 舞踏会で省いている輪郭線を、顔を描く間だけ戻す
  const prevTarget = renderer.getRenderTarget(), alpha = renderer.getClearAlpha();
  renderer.getClearColor(clearColor);
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(clearColor, alpha);
  if (crowd) setOutline(s, false);
  // 屋敷の元の場所へ戻す
  if (home) home.add(s); else scene.remove(s);
  s.position.copy(pos); s.quaternion.copy(rot); s.visible = vis;
  // 上下を反転し、半透明の縁（髪の先など）の色を戻して、2D の canvas に写す
  const d = img.data, row = w * 4;
  for (let yy = 0; yy < h; yy++) {
    const src = (h - 1 - yy) * row, dst = yy * row;
    for (let x = 0; x < row; x += 4) {
      const a = buf[src + x + 3];
      if (a === 255 || a === 0) {
        d[dst + x] = buf[src + x]; d[dst + x + 1] = buf[src + x + 1]; d[dst + x + 2] = buf[src + x + 2]; d[dst + x + 3] = a;
      } else {
        const k = 255 / a;
        d[dst + x] = Math.min(255, buf[src + x] * k); d[dst + x + 1] = Math.min(255, buf[src + x + 1] * k); d[dst + x + 2] = Math.min(255, buf[src + x + 2] * k); d[dst + x + 3] = a;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  // 本当に描けたか（真ん中の縦一列に、透明でない点があるか）を確かめてから顔アイコンと入れ替える
  // 端末が重くて描けなかったときは、顔アイコンを出したままにする
  let ok = false;
  for (let yy = 0; yy < h && !ok; yy += 4) if (buf[(yy * w + (w >> 1)) * 4 + 3] > 0) ok = true;
  canvas.classList.toggle('ready', ok);
}
