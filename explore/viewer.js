// 人物照会の VRM ビューア
//  1本指（マウスはドラッグ）：くるくる回す（画面の幅いっぱいで半回転）。勢いよく離すと少し惰性で回る
//  上下に動かすと見下ろし・見上げ　2本指でつまむ／ホイール：ズーム（顔のアップから全身まで）
//  2本指で上下になぞる：見る高さを変える　ダブルタップ：元に戻す
//  向きは setAngle（0〜360度）でも変えられる（スライダーや「背面」ボタン用）
import { THREE, loadVRM, disposeVRM, driveVRM } from './vrm.js';

export const FACES = [['neutral', 'ふつう'], ['happy', '笑顔'], ['angry', '怒り'], ['sad', '悲しみ'], ['surprised', '驚き'], ['relaxed', '穏やか']];
export const POSES = [['stand', '立ち姿'], ['bow', 'お辞儀'], ['wave', '手を振る']];

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
  Object.assign(key.shadow.camera, { left: -1, right: 1, top: 2.2, bottom: -0.2 });
  scene.add(key);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.ShadowMaterial({ opacity: 0.25 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 0.9, 64), new THREE.MeshBasicMaterial({ color: '#c9a45c', transparent: true, opacity: 0.6 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; scene.add(ring);

  // 視点：モデルを回し（照明はそのまま）、カメラは見下ろし角と距離と高さで決める
  const view = { yaw: 0, pitch: 0.08, dist: 3, pan: 0, vyaw: 0, goal: null };
  window.__viewer = view;   // テスト用
  let home = { ...view }, height = 1.6, vrm = null, alive = true, face = 'neutral', pose = 'stand';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const limits = () => ({ minD: height * 0.28, maxD: height * 2.6 });
  // 寄るほど顔の高さを見る（全身では体の中ほど）
  const lookY = () => {
    const k = clamp((home.dist - view.dist) / (home.dist - limits().minD), 0, 1);
    return clamp(height * (0.55 + 0.37 * k) + view.pan, height * 0.1, height);
  };

  loadVRM(id, 'view', onProgress).then(v => {
    if (!alive) return;
    vrm = v;
    scene.add(vrm.scene);
    vrm.scene.rotation.y = 0;
    const box = new THREE.Box3().setFromObject(vrm.scene);
    height = box.max.y - box.min.y;
    home = { ...view, yaw: 0, pitch: 0.08, dist: height * 1.75, pan: 0, vyaw: 0 };
    Object.assign(view, home);
    onReady && onReady();
  }).catch(e => onError && onError(e));

  // ---- 操作 ----
  const pts = new Map();
  let lastTap = 0, pinch = null, moved = 0, trail = [];
  const down = e => {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 古い端末 */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    view.vyaw = 0; view.goal = null; moved = 0; trail = [];
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
      view.yaw += dx * Math.PI / Math.max(240, canvas.clientWidth);
      view.pitch = clamp(view.pitch + dy * 0.004, -0.35, 0.9);
      // 離したときの勢いは、直前0.1秒の動きから決める
      const now = performance.now();
      trail.push([now, view.yaw]);
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
      const [t0, y0] = trail[0], [t1, y1] = trail[trail.length - 1], now = performance.now();
      view.vyaw = now - t1 < 80 && t1 > t0 ? clamp((y1 - y0) / ((t1 - t0) / 1000), -5, 5) : 0;
    }
    if (pts.size === 0 && moved < 8) {
      const now = performance.now();
      if (now - lastTap < 320) { Object.assign(view, home); lastTap = 0; } else lastTap = now;
    }
  };
  const wheel = e => {
    e.preventDefault();
    const L = limits();
    view.dist = clamp(view.dist * (1 + Math.sign(e.deltaY) * 0.1), L.minD, L.maxD);
  };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('dblclick', () => Object.assign(view, home));

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
      if (view.goal != null) {
        // ボタンやスライダーで選んだ向きへ、近い回り方でなめらかに向ける
        const d = Math.atan2(Math.sin(view.goal - view.yaw), Math.cos(view.goal - view.yaw));
        view.yaw += d * Math.min(1, dt * 8);
        if (Math.abs(d) < 0.002) view.goal = null;
      } else {
        view.yaw += view.vyaw * dt;
        view.vyaw *= Math.pow(0.12, dt);             // 惰性は1秒ほどで止まる
        if (Math.abs(view.vyaw) < 0.02) view.vyaw = 0;
      }
    }
    if (onAngle) onAngle(((view.yaw * 180 / Math.PI) % 360 + 360) % 360);
    if (vrm) {
      vrm.scene.rotation.y = view.yaw;
      driveVRM(vrm, false, dt, { pose, face: Object.fromEntries(FACES.filter(([k]) => k !== 'neutral').map(([k]) => [k, k === face ? 1 : 0])) });
    }
    const ty = lookY();
    camera.position.set(0, ty + Math.sin(view.pitch) * view.dist, Math.cos(view.pitch) * view.dist);
    camera.lookAt(0, ty, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  return {
    setFace(f) { face = f; },
    setPose(p) { pose = p; },
    // 向き（度）。0 が正面、180 が背面。smooth なら近い回り方でなめらかに向ける
    setAngle(deg, smooth) {
      view.vyaw = 0;
      const r = deg * Math.PI / 180;
      if (smooth) view.goal = r; else { view.goal = null; view.yaw = r; }
    },
    reset() { Object.assign(view, home); },
    close() {
      alive = false;
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
      if (vrm) scene.remove(vrm.scene);
      disposeVRM(id, 'view');
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
