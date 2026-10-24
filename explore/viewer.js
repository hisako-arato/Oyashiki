// 人物照会の VRM ビューア
//  1本指（マウスはドラッグ）：左右になぞると横に、上下になぞると縦に、どちらも360度くるくる回る
//    （画面の幅いっぱいで半回転。勢いよく離すと少し惰性で回る）
//  2本指でつまむ／ホイール：ズーム（顔のアップから全身まで）　2本指で上下になぞる：見る高さを変える
//  ダブルタップ：元に戻す　向きは setAngle（0〜360度）でも変えられる（スライダーや「背面」ボタン用）
//  回すときの中心は、いま見ている所（全身なら体の中ほど、寄れば顔）なので、逆さにしても画面から外れない
import { THREE, loadVRM, disposeVRM, driveVRM } from './vrm.js';

export const FACES = [['neutral', 'ふつう'], ['happy', '笑顔'], ['angry', '怒り'], ['sad', '悲しみ'], ['surprised', '驚き'], ['relaxed', '穏やか']];
export const POSES = [['stand', '立ち姿'], ['bow', 'お辞儀'], ['wave', '手を振る']];

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);

// canvas に id の人物を表示する。戻り値の close() で後片付けする
export function openViewer(canvas, id, { onProgress, onReady, onError, onAngle } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  scene.add(new THREE.HemisphereLight('#fff4e6', '#5a4a40', 1.6));
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(1.2, 2.5, 2.5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 2.4, bottom: -0.4 });
  scene.add(key);
  // 足元の円（立っているときだけ見せる）
  const ground = new THREE.Group(); scene.add(ground);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.ShadowMaterial({ opacity: 0.25 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; ground.add(floor);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#c9a45c', transparent: true, opacity: 0.6 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 0.9, 64), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; ground.add(ring);

  // 回転は pivot の向き（クォータニオン）で持つ。pivot は「いま見ている高さ」に置き、モデルをその分下げて吊るす
  const pivot = new THREE.Group(); scene.add(pivot);
  const view = { dist: 3, pan: 0, vx: 0, vy: 0, goal: null };
  window.__viewer = view;   // テスト用
  let home = { ...view }, height = 1.6, vrm = null, alive = true, face = 'neutral', pose = 'stand';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const limits = () => ({ minD: height * 0.28, maxD: height * 2.6 });
  // 寄るほど顔の高さを見る（全身では体の中ほど）
  const lookY = () => {
    const k = clamp((home.dist - view.dist) / (home.dist - limits().minD), 0, 1);
    return clamp(height * (0.55 + 0.37 * k) + view.pan, height * 0.1, height);
  };
  // 画面の横・縦方向に回す（どちらも制限なし）
  const q = new THREE.Quaternion(), tmp = new THREE.Quaternion();
  const turn = (ax, ay) => {
    if (ax) q.premultiply(tmp.setFromAxisAngle(Y, ax));
    if (ay) q.premultiply(tmp.setFromAxisAngle(X, ay));
    q.normalize();
  };
  // 正面からの横の向き（度）と、どれだけまっすぐ立っているか（1：直立、-1：逆さ）
  const facing = () => {
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    return ((Math.atan2(f.x, f.z) * 180 / Math.PI) % 360 + 360) % 360;
  };
  const upright = () => new THREE.Vector3(0, 1, 0).applyQuaternion(q).y;
  window.__viewerQ = q;   // テスト用

  loadVRM(id, 'view', onProgress).then(v => {
    if (!alive) return;
    vrm = v;
    vrm.scene.rotation.set(0, 0, 0);
    vrm.scene.position.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(vrm.scene);
    height = box.max.y - box.min.y;
    pivot.add(vrm.scene);
    home = { ...view, dist: height * 1.75, pan: 0, vx: 0, vy: 0, goal: null };
    Object.assign(view, home);
    onReady && onReady();
  }).catch(e => onError && onError(e));

  // ---- 操作 ----
  const pts = new Map();
  let lastTap = 0, pinch = null, moved = 0, trail = [];
  const down = e => {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 古い端末 */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    view.vx = view.vy = 0; view.goal = null; moved = 0; trail = [];
    if (pts.size === 2) pinch = gesture();
  };
  const gesture = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), y: (a.y + b.y) / 2 };
  };
  const move = e => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    const L = limits();
    if (pts.size === 1) {
      moved += Math.abs(dx) + Math.abs(dy);
      const k = Math.PI / Math.max(240, canvas.clientWidth);
      turn(dx * k, dy * k);
      // 離したときの勢いは、直前0.1秒の動きから決める
      const now = performance.now();
      trail.push([now, dx * k, dy * k]);
      while (trail.length > 2 && now - trail[0][0] > 100) trail.shift();
    } else if (pts.size === 2 && pinch) {
      const g = gesture();
      view.dist = clamp(view.dist * pinch.d / Math.max(1, g.d), L.minD, L.maxD);
      view.pan = clamp(view.pan + (g.y - pinch.y) * 0.004 * view.dist, -height * 0.6, height * 0.6);
      pinch = g; moved = 99;
    }
  };
  const up = e => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0 && trail.length >= 2) {
      const t0 = trail[0][0], t1 = trail[trail.length - 1][0], now = performance.now();
      if (now - t1 < 80 && t1 > t0) {
        const sx = trail.slice(1).reduce((a, s) => a + s[1], 0), sy = trail.slice(1).reduce((a, s) => a + s[2], 0);
        view.vx = clamp(sx / ((t1 - t0) / 1000), -5, 5);
        view.vy = clamp(sy / ((t1 - t0) / 1000), -5, 5);
      }
    }
    if (pts.size === 0 && moved < 8) {
      const now = performance.now();
      if (now - lastTap < 320) { reset(); lastTap = 0; } else lastTap = now;
    }
  };
  const wheel = e => {
    e.preventDefault();
    const L = limits();
    view.dist = clamp(view.dist * (1 + Math.sign(e.deltaY) * 0.1), L.minD, L.maxD);
  };
  const reset = () => { Object.assign(view, home); q.identity(); };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('dblclick', reset);

  // ---- 描画 ----
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
  };
  let last = performance.now();
  const frame = now => {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    resize();
    if (!pts.size) {
      if (view.goal) {
        // ボタンやスライダーで選んだ向きへ、立った姿勢でなめらかに向ける
        q.slerp(view.goal, Math.min(1, dt * 8));
        if (q.angleTo(view.goal) < 0.002) { q.copy(view.goal); view.goal = null; }
      } else if (view.vx || view.vy) {
        turn(view.vx * dt, view.vy * dt);
        const f = Math.pow(0.12, dt);                // 惰性は1秒ほどで止まる
        view.vx *= f; view.vy *= f;
        if (Math.hypot(view.vx, view.vy) < 0.02) view.vx = view.vy = 0;
      }
    }
    if (onAngle) onAngle(facing());
    const ty = lookY();
    pivot.position.set(0, ty, 0);
    pivot.quaternion.copy(q);
    if (vrm) {
      vrm.scene.position.y = -ty;
      driveVRM(vrm, false, dt, { pose, face: Object.fromEntries(FACES.filter(([k]) => k !== 'neutral').map(([k]) => [k, k === face ? 1 : 0])) });
    }
    // 足元の円は、まっすぐ立っているときだけ見せる（逆さや横倒しのときは消す）
    const u = upright();
    ground.visible = u > 0.5;
    ringMat.opacity = 0.6 * clamp((u - 0.5) * 4, 0, 1);
    camera.position.set(0, ty + Math.sin(0.08) * view.dist, Math.cos(0.08) * view.dist);
    camera.lookAt(0, ty, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  return {
    setFace(f) { face = f; },
    setPose(p) { pose = p; },
    // 横の向き（度）。0 が正面、180 が背面。立った姿勢に戻す。smooth ならなめらかに向ける
    setAngle(deg, smooth) {
      view.vx = view.vy = 0;
      const g = new THREE.Quaternion().setFromAxisAngle(Y, deg * Math.PI / 180);
      if (smooth) view.goal = g; else { view.goal = null; q.copy(g); }
    },
    reset,
    close() {
      alive = false;
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('dblclick', reset);
      if (vrm) { pivot.remove(vrm.scene); vrm.scene.position.set(0, 0, 0); }
      disposeVRM(id, 'view');
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
