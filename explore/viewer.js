// 人物照会の VRM ビューア
//  1本指（マウスはドラッグ）：くるくる回す。離すと少し惰性で回り続ける。上下に動かすと見下ろし・見上げ
//  2本指でつまむ／ホイール：ズーム（顔のアップから全身まで）　2本指で上下になぞる：見る高さを変える
//  ダブルタップ：元に戻す　何も触らずにいると、ゆっくり自動で回る
import { THREE, loadVRM, disposeVRM, driveVRM } from './vrm.js';

export const FACES = [['neutral', 'ふつう'], ['happy', '笑顔'], ['angry', '怒り'], ['sad', '悲しみ'], ['surprised', '驚き'], ['relaxed', '穏やか']];
export const POSES = [['stand', '立ち姿'], ['bow', 'お辞儀'], ['wave', '手を振る']];

// canvas に id の人物を表示する。戻り値の close() で後片付けする
export function openViewer(canvas, id, { onProgress, onReady, onError } = {}) {
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
  const view = { yaw: 0, pitch: 0.08, dist: 3, pan: 0, vyaw: 0, idle: 0, auto: true };
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
  let lastTap = 0, pinch = null, moved = 0;
  const down = e => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    view.vyaw = 0; view.idle = 0; moved = 0;
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
    view.idle = 0;
    const L = limits();
    if (pts.size === 1) {
      moved += Math.abs(dx) + Math.abs(dy);
      view.yaw += dx * 0.012;
      view.vyaw = dx * 0.012 / (1 / 60);
      view.pitch = clamp(view.pitch + dy * 0.006, -0.35, 0.9);
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
    if (pts.size === 0 && moved < 8) {
      const now = performance.now();
      if (now - lastTap < 320) { Object.assign(view, home); lastTap = 0; } else lastTap = now;
    }
  };
  const wheel = e => {
    e.preventDefault();
    const L = limits();
    view.dist = clamp(view.dist * (1 + Math.sign(e.deltaY) * 0.1), L.minD, L.maxD);
    view.idle = 0;
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
      view.yaw += view.vyaw * dt;
      view.vyaw *= Math.pow(0.04, dt);              // 惰性はゆっくり止まる
      view.idle += dt;
      if (view.auto && view.idle > 2.5 && Math.abs(view.vyaw) < 0.05) view.yaw += dt * 0.45;
    }
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
    setAuto(on) { view.auto = on; view.idle = 0; },
    get auto() { return view.auto; },
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
