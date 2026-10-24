// 会話の話し手を、胸から上の VRM で映す（台詞に合わせて表情を変え、話している間は口を動かす）
// 物語パートの会話画面と、3Dの屋敷のメッセージ欄の両方で使う。描画は1つの canvas を使い回す
import { THREE, loadVRM, disposeVRM, driveVRM } from './vrm.js';

const KEEP = 4;          // 同時に覚えておく人数（それ以上は古い順に捨てる）
const SLOT = 'face';
let renderer = null, scene, camera, canvas = null, cur = null, want = null, face = 'neutral', talkLeft = 0, last = 0, looping = false;
const recent = [];

export function portraitCanvas() {
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.className = 'vportrait';
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
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
  if (cur && cur.id !== id) { scene.remove(cur.vrm.scene); cur = null; canvas.classList.remove('ready'); }
  loadVRM(id, 'lite', null, SLOT).then(vrm => {
    if (want !== id) return;
    if (!cur) {
      scene.add(vrm.scene);
      vrm.scene.rotation.y = 0;
      vrm.motion.face = {};
      cur = { id, vrm, head: headHeight(vrm) };
    }
    remember(id);
    canvas.classList.add('ready');
  }).catch(() => {});
  if (!looping) { looping = true; last = performance.now(); requestAnimationFrame(frame); }
}

function headHeight(vrm) {
  vrm.update(0);
  const p = new THREE.Vector3();
  const head = vrm.humanoid.getNormalizedBoneNode('head');
  return head ? head.getWorldPosition(p).y : 1.4;
}
function remember(id) {
  const i = recent.indexOf(id);
  if (i >= 0) recent.splice(i, 1);
  recent.push(id);
  while (recent.length > KEEP) {
    const old = recent.shift();
    if (cur && cur.id === old) continue;
    disposeVRM(old, 'lite', SLOT);
  }
}

function frame(now) {
  if (!canvas || !canvas.isConnected) { looping = false; return; }
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (w && h && (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio()))) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  if (cur) {
    talkLeft = Math.max(0, talkLeft - dt);
    const faces = { happy: 0, angry: 0, sad: 0, surprised: 0, relaxed: 0 };
    if (face in faces) faces[face] = 1;
    driveVRM(cur.vrm, false, dt, { face: faces, talk: talkLeft > 0 ? 1 : 0 });
    // 顔のやや下を見て、胸から上を映す
    // 頭の骨はあごの辺り。髪の上までと胸元が収まるように映す
    const y = cur.head;
    camera.position.set(0, y + 0.04, 1.5);
    camera.lookAt(0, y - 0.01, 0);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
