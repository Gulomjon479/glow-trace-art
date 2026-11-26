// Shared camera + MediaPipe helpers for all FX sections
import {
  FilesetResolver,
  HandLandmarker,
  FaceLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

export { HandLandmarker, FaceLandmarker };

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let filesetPromise = null;
function fileset() {
  if (!filesetPromise) filesetPromise = FilesetResolver.forVisionTasks(WASM);
  return filesetPromise;
}

async function createWithFallback(Cls, modelPath, extra) {
  const vision = await fileset();
  const make = (delegate) =>
    Cls.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelPath, delegate },
      runningMode: 'VIDEO',
      ...extra,
    });
  try {
    return await make('GPU');
  } catch (e) {
    console.warn('GPU delegate unavailable, falling back to CPU', e);
    return await make('CPU');
  }
}

export function createHands(numHands = 2) {
  return createWithFallback(HandLandmarker, HAND_MODEL, {
    numHands,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export function createFace() {
  return createWithFallback(FaceLandmarker, FACE_MODEL, {
    numFaces: 1,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export async function startCamera(video, facingMode = 'user') {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Bu brauzer kamerani qo‘llab-quvvatlamaydi');
  }
  if (video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: 960 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await new Promise((resolve) => {
    if (video.readyState >= 1) return resolve();
    video.onloadedmetadata = () => resolve();
  });
  await video.play();
  return stream;
}

export function stopCamera(video) {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
}

// Maps normalized landmark coords (0..1 of the raw video frame) to CSS pixels of a
// full-screen element where the video is drawn with object-fit: cover (+ optional mirror).
export class CoverMapper {
  constructor(video, el, mirror = true) {
    this.video = video;
    this.el = el;
    this.mirror = mirror;
    this.update();
  }
  update() {
    const W = this.el.clientWidth || window.innerWidth;
    const H = this.el.clientHeight || window.innerHeight;
    const vw = this.video.videoWidth || 640;
    const vh = this.video.videoHeight || 480;
    const s = Math.max(W / vw, H / vh);
    this.W = W;
    this.H = H;
    this.dw = vw * s;
    this.dh = vh * s;
    this.ox = (W - this.dw) / 2;
    this.oy = (H - this.dh) / 2;
  }
  map(p) {
    let x = this.ox + p.x * this.dw;
    if (this.mirror) x = this.W - x;
    return { x, y: this.oy + p.y * this.dh, z: p.z || 0 };
  }
  mapAll(arr) {
    return arr.map((p) => this.map(p));
  }
  // Draw current video frame (cover + mirror) into a 2D context
  drawVideo(ctx) {
    ctx.save();
    if (this.mirror) {
      ctx.translate(this.W, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(this.video, this.ox, this.oy, this.dw, this.dh);
    ctx.restore();
  }
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Finger states from (mapped or raw) landmarks
export function fingerStates(lm) {
  const wrist = lm[0];
  const palm = dist(wrist, lm[9]) || 1;
  const ext = (tip, pip) => dist(lm[tip], wrist) > dist(lm[pip], wrist) * 1.12;
  const index = ext(8, 6);
  const middle = ext(12, 10);
  const ring = ext(16, 14);
  const pinky = ext(20, 18);
  const thumb =
    dist(lm[4], lm[17]) > dist(lm[3], lm[17]) * 1.12 && dist(lm[4], lm[5]) > palm * 0.45;
  const count = [index, middle, ring, pinky].filter(Boolean).length;
  return {
    thumb, index, middle, ring, pinky, count,
    palm,
    pinch: dist(lm[4], lm[8]) / palm,
    fist: count === 0,
    open: count >= 4,
  };
}

export function palmCenter(lm) {
  const ids = [0, 5, 9, 13, 17];
  let x = 0, y = 0;
  for (const i of ids) { x += lm[i].x; y += lm[i].y; }
  return { x: x / ids.length, y: y / ids.length };
}

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
export const TIPS = [4, 8, 12, 16, 20];

// Smooths landmark sets between frames, keeping identity by handedness
export class HandSmoother {
  constructor(alpha = 0.55) {
    this.alpha = alpha;
    this.prev = {};
  }
  smooth(key, pts) {
    const prev = this.prev[key];
    if (!prev || prev.length !== pts.length) {
      this.prev[key] = pts.map((p) => ({ ...p }));
      return this.prev[key];
    }
    const a = this.alpha;
    for (let i = 0; i < pts.length; i++) {
      prev[i].x += (pts[i].x - prev[i].x) * a;
      prev[i].y += (pts[i].y - prev[i].y) * a;
      prev[i].z = pts[i].z;
    }
    return prev;
  }
  forget(keepKeys) {
    for (const k of Object.keys(this.prev)) if (!keepKeys.includes(k)) delete this.prev[k];
  }
}

// Runs hand detection once per new video frame and returns mapped, smoothed hands
export class HandSource {
  constructor(landmarker, video, mapper) {
    this.lm = landmarker;
    this.video = video;
    this.mapper = mapper;
    this.smoother = new HandSmoother(0.6);
    this.lastTime = -1;
    this.hands = [];
  }
  update() {
    const v = this.video;
    if (!this.lm || v.readyState < 2) return this.hands;
    if (v.currentTime === this.lastTime) return this.hands;
    this.lastTime = v.currentTime;
    let res;
    try {
      res = this.lm.detectForVideo(v, performance.now());
    } catch (e) {
      return this.hands;
    }
    const out = [];
    const keys = [];
    (res.landmarks || []).forEach((raw, i) => {
      const hd = res.handednesses && res.handednesses[i] && res.handednesses[i][0];
      let key = hd ? hd.categoryName : 'h' + i;
      if (keys.includes(key)) key += i;
      keys.push(key);
      const pts = this.smoother.smooth(key, this.mapper.mapAll(raw));
      const f = fingerStates(pts);
      out.push({ key, pts, f, center: palmCenter(pts), size: f.palm });
    });
    this.smoother.forget(keys);
    this.hands = out;
    return out;
  }
}

// Fullscreen DPR-aware canvas helper
export function fitCanvas(canvas, maxDpr = 2) {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h, dpr };
}

export function isMobile() {
  return window.innerWidth < 760 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Common page boot: Telegram expand, start overlay, camera switch, status
export function bootPage({ onStart, onFlip }) {
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg) { tg.ready(); tg.expand(); }
  } catch (e) {}

  const overlay = document.getElementById('fxStart');
  const startBtn = document.getElementById('fxStartBtn');
  const status = document.getElementById('fxStatus');
  const flipBtn = document.getElementById('fxFlip');
  const setStatus = (t, state) => {
    if (!status) return;
    status.textContent = t;
    status.dataset.state = state || '';
  };
  let facing = 'user';

  const go = async () => {
    startBtn.disabled = true;
    startBtn.textContent = '⏳ Yuklanmoqda...';
    try {
      await onStart(facing, setStatus);
      overlay.classList.add('hidden');
    } catch (e) {
      console.error(e);
      setStatus('Kamera ochilmadi', 'error');
      const msg = document.getElementById('fxStartErr');
      if (msg) {
        msg.textContent =
          'Kameraga ruxsat berilmadi yoki qurilma qo‘llab-quvvatlamaydi. Brauzer sozlamalaridan kameraga ruxsat bering va qayta urinib ko‘ring (Chrome / Safari’da ochish tavsiya etiladi).';
      }
      startBtn.disabled = false;
      startBtn.textContent = '🔄 Qayta urinish';
    }
  };
  startBtn.addEventListener('click', go);

  if (flipBtn) {
    flipBtn.addEventListener('click', async () => {
      facing = facing === 'user' ? 'environment' : 'user';
      try {
        await onFlip(facing);
      } catch (e) {
        facing = 'user';
      }
    });
  }
  return { setStatus };
}

// Mode chips helper
export function bindChips(containerId, attr, onChange) {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-' + attr + ']');
    if (!btn) return;
    box.querySelectorAll('[data-' + attr + ']').forEach((b) => b.classList.toggle('active', b === btn));
    onChange(btn.dataset[attr]);
  });
}

export function toast(text, ms = 1600) {
  let el = document.getElementById('fxToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fxToast';
    el.className = 'fx-toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

// Save canvas(es) as PNG (download, or open in new tab inside Telegram)
export function savePNG(canvas, name = 'glow-fx.png') {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('💾 Rasm saqlandi');
  }, 'image/png');
}
