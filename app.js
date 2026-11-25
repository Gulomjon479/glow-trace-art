(() => {
  'use strict';

  // ===== Canvas & Config =====
  const LOGICAL_W = 800;
  const LOGICAL_H = 940;
  const BG_RGB = [8, 5, 15];

  // Animation timeline (seconds — faithful to coded.by.adri)
  const TIMELINE = {
    TRACE_START: 0.2,
    TRACE_SPREAD: 7.5,
    SEG_LEN: 145,
    SEG_MIN_DUR: 1.45,
    SEG_MAX_DUR: 3.0,
    FILL_START: 6.4,
    FILL_END: 12.8,
    SHIMMER_START: 11.4,
    SHIMMER_DUR: 3.4,
    TEXT_START: 12.8,
    WORD_GAP: 0.30,
    WORD_DUR: 1.35,
    FADE_START: 21.8,
    DURATION: 24.0,
  };

  // Curated Luminous Palettes
  const PALETTES = {
    silver: [
      [255, 252, 248], // pure starlight white
      [212, 232, 255], // glacial silver-ice
      [148, 198, 252], // soft celestial blue
      [226, 224, 255], // moonlit pearl
    ],
    cosmic: [
      [255, 215, 180], // warm peach-gold
      [140, 232, 205], // mint-ice
      [90, 175, 245],  // electric sky blue
      [215, 222, 255], // silver-lavender
    ],
    gold: [
      [255, 246, 218],
      [255, 198, 108],
      [238, 126, 90],
      [255, 226, 175],
    ],
    nebula: [
      [255, 170, 235],
      [172, 128, 255],
      [96, 212, 255],
      [234, 228, 255],
    ],
    aurora: [
      [224, 255, 236],
      [88, 232, 188],
      [78, 165, 255],
      [200, 246, 255],
    ],
  };

  // ===== DOM Elements =====
  const canvas = document.getElementById('artCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const dropZone = document.getElementById('dropZone');
  const dropOverlay = document.getElementById('dropOverlay');
  const processingBadge = document.getElementById('processingBadge');
  const recordingBadge = document.getElementById('recordingBadge');
  const controlPanel = document.getElementById('controlPanel');
  const togglePanelBtn = document.getElementById('togglePanelBtn');
  const compareBtn = document.getElementById('compareBtn');

  const playPauseBtn = document.getElementById('playPauseBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const replayBtn = document.getElementById('replayBtn');
  const timelineSlider = document.getElementById('timelineSlider');
  const timeLabel = document.getElementById('timeLabel');
  const phaseLabel = document.getElementById('phaseLabel');
  const loopToggle = document.getElementById('loopToggle');

  const imageUpload = document.getElementById('imageUpload');
  const resetImageBtn = document.getElementById('resetImageBtn');
  const galleryStrip = document.getElementById('galleryStrip');
  const modeControl = document.getElementById('modeControl');
  const contourStats = document.getElementById('contourStats');
  const detectedModeBadge = document.getElementById('detectedModeBadge');
  const animStyleControl = document.getElementById('animStyleControl');
  const paletteGrid = document.getElementById('paletteGrid');
  const fillModeControl = document.getElementById('fillModeControl');

  const sensitivitySlider = document.getElementById('sensitivitySlider');
  const sensitivityVal = document.getElementById('sensitivityVal');
  const cleanSlider = document.getElementById('cleanSlider');
  const cleanVal = document.getElementById('cleanVal');
  const glowSlider = document.getElementById('glowSlider');
  const glowVal = document.getElementById('glowVal');
  const lineWidthSlider = document.getElementById('lineWidthSlider');
  const lineWidthVal = document.getElementById('lineWidthVal');
  const twinklesSlider = document.getElementById('twinklesSlider');
  const twinklesVal = document.getElementById('twinklesVal');
  const speedSlider = document.getElementById('speedSlider');
  const speedVal = document.getElementById('speedVal');

  const shimmerToggle = document.getElementById('shimmerToggle');
  const bloomToggle = document.getElementById('bloomToggle');
  const sparksToggle = document.getElementById('sparksToggle');
  const cinemaZoomToggle = document.getElementById('cinemaZoomToggle');
  const quoteInput = document.getElementById('quoteInput');

  const savePngBtn = document.getElementById('savePngBtn');
  const recordVideoBtn = document.getElementById('recordVideoBtn');
  const recordBtnText = document.getElementById('recordBtnText');
  const sendTelegramBtn = document.getElementById('sendTelegramBtn');
  const sendTelegramText = document.getElementById('sendTelegramText');
  const tgDot = document.getElementById('tgDot');
  const tgStatusText = document.getElementById('tgStatusText');

  const planBanner = document.getElementById('planBanner');
  const planBannerText = document.getElementById('planBannerText');
  const usersCountVal = document.getElementById('usersCountVal');
  const openPaywallBtn = document.getElementById('openPaywallBtn');
  const payModal = document.getElementById('payModal');
  const closePayModalBtn = document.getElementById('closePayModalBtn');
  const payVideoPrice = document.getElementById('payVideoPrice');
  const payPremiumPrice = document.getElementById('payPremiumPrice');
  const payCardNumber = document.getElementById('payCardNumber');
  const payCardHolder = document.getElementById('payCardHolder');
  const copyCardBtn = document.getElementById('copyCardBtn');
  const refreshStatusBtn = document.getElementById('refreshStatusBtn');

  // Backend API base: same origin on Render/HTTPS, or Render server when opened locally
  const DEFAULT_API_BASE = 'https://glow-trace-art.onrender.com';
  const API_BASE = (window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? DEFAULT_API_BASE
    : '';

  // Offscreen optical bloom buffer (1/2 resolution for silky, fast cinema bloom)
  const bloomCanvas = document.createElement('canvas');
  const BLOOM_SCALE = 0.5;
  bloomCanvas.width = Math.round(LOGICAL_W * BLOOM_SCALE);
  bloomCanvas.height = Math.round(LOGICAL_H * BLOOM_SCALE);
  const bctx = bloomCanvas.getContext('2d');

  // ===== State =====
  const state = {
    gallery: [], // { id, src, name }
    activeGalleryId: null,
    currentImg: null,
    mode: 'auto', // 'auto' | 'sketch' | 'photo' | 'artistic'
    resolvedMode: 'sketch',
    animStyle: 'binary', // 'binary' | 'holo3d' | 'topdown' | 'velnox' | 'bloom' | 'rocket' | 'meteor' | 'supernova' | 'celestial' | 'vortex' | 'lightning' | 'aurora' | 'phoenix'
    paletteKey: 'aurora', // 'silver' | 'cosmic' | 'original' | 'gold' | 'nebula' | 'aurora'
    fillMode: 'tint', // 'tint' | 'photo' | 'none'
    sensitivity: 0.60,
    cleanliness: 0.45,
    glowIntensity: 1.15,
    lineWidth: 1.25,
    twinkleCount: 52,
    speed: 1.0,
    showShimmer: true,
    useBloom: true,
    showSparks: true,
    cinemaZoom: true,
    loop: true,
    comparing: false,
    quote: quoteInput.value,

    // Playback
    playing: true,
    time: 0,
    lastFrameMs: 0,

    // Extracted artwork data
    segments: [],
    twinkles: [],
    ambientDust: [],
    shootingStars: [],
    vortexParticles: [],
    shatterShards: [],
    bloomData: null, // TypedArray particle bloom system (codeb1oom grow mode)
    bloomSharpCanvas: null,
    bloomRevealCanvas: null,
    velnoxNegCanvas: null, // Electric Ice-White X-Ray Negative (velnox.py stage 1)
    velnoxPosCanvas: null, // Vibrant Cel-Shaded Neon Positive (velnox.py stage 2)
    cloud3D: null, // True 3D volumetric point cloud for 3D Hologram Spin!
    binaryGrid: null, // Crisp 0/1 Matrix rain grid for Programmer Binary Art!
    orbit3D: { dragging: false, lastX: 0, lastY: 0, userYaw: 0, userPitch: 0 },
    energyRunners: [],
    phoenixEmbers: [],
    liveSparks: [],
    fillTintCanvas: null,
    fillPhotoCanvas: null,
    artBounds: { x: 80, y: 60, w: 640, h: 720 },

    // Recording & Telegram & Billing
    recording: false,
    recordingTarget: 'download', // 'download' | 'telegram'
    sendingTelegram: false,
    tgChatId: null,
    userStatus: null,
    mediaRecorder: null,
    recordedChunks: [],
  };

  // Setup crisp HiDPI canvas (cap DPR on touch/mobile so 60fps stays silky and never lags)
  const isMobileDevice = window.innerWidth <= 860 || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const DPR = isMobileDevice ? Math.min(window.devicePixelRatio || 1, 1.25) : Math.min(window.devicePixelRatio || 1, 1.75);
  canvas.width = Math.round(LOGICAL_W * DPR);
  canvas.height = Math.round(LOGICAL_H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  // ===== Math & Easing =====
  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function easeInOut(x) {
    const t = clamp(x, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeSine(x) {
    const t = clamp(x, 0, 1);
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }

  function easeOut(x) {
    const t = clamp(x, 0, 1);
    return 1 - Math.pow(1 - t, 3);
  }

  function createRng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function samplePalette(g, paletteKey = state.paletteKey) {
    const stops = PALETTES[paletteKey] || PALETTES.silver;
    const scaled = clamp(g, 0, 1) * (stops.length - 1);
    const idx = Math.min(Math.floor(scaled), stops.length - 2);
    const f = scaled - idx;
    const c0 = stops[idx];
    const c1 = stops[idx + 1];
    return [
      Math.round(c0[0] + (c1[0] - c0[0]) * f),
      Math.round(c0[1] + (c1[1] - c0[1]) * f),
      Math.round(c0[2] + (c1[2] - c0[2]) * f),
    ];
  }

  function boostOriginalColor(r, g, b) {
    // Lift dark colors into vivid, luminous pastel-neon so edges stay glowing & faithful
    const maxC = Math.max(r, g, b, 1);
    const minC = Math.min(r, g, b);
    const sat = (maxC - minC) / maxC;
    const targetMax = 245;
    const scale = targetMax / Math.max(maxC, 55);
    let nr = clamp(r * scale, 0, 255);
    let ng = clamp(g * scale, 0, 255);
    let nb = clamp(b * scale, 0, 255);
    // Keep neutral/low-sat colors crisp icy-silver
    const mix = sat < 0.14 ? 0.45 : 0.22;
    nr = Math.round(nr * (1 - mix) + 232 * mix);
    ng = Math.round(ng * (1 - mix) + 238 * mix);
    nb = Math.round(nb * (1 - mix) + 255 * mix);
    return [nr, ng, nb];
  }

  function getSegmentColor(seg) {
    if (state.paletteKey === 'original' && seg.origColor) {
      return seg.origColor;
    }
    return samplePalette(seg.grad, state.paletteKey === 'original' ? 'silver' : state.paletteKey);
  }

  function initAmbientDust() {
    const rng = createRng(77);
    state.ambientDust = [];
    for (let i = 0; i < 46; i++) {
      state.ambientDust.push({
        x: rng() * LOGICAL_W,
        y: rng() * LOGICAL_H,
        r: 0.55 + rng() * 1.25,
        phase: rng() * Math.PI * 2,
        speed: 0.4 + rng() * 0.9,
        vx: (rng() - 0.5) * 3.2,
        vy: -1.4 - rng() * 2.8,
      });
    }
  }

  // ===== High-Precision Edge Detection & Contour Extraction =====
  function processImage(img, resetTime = true) {
    processingBadge.classList.add('visible');

    requestAnimationFrame(() => {
      try {
        extractContoursFromImage(img);
        rebuildFillLayers();
        if (resetTime) {
          state.time = 0;
          state.playing = true;
          updatePlayButtonUI();
        }
      } finally {
        processingBadge.classList.remove('visible');
      }
    });
  }

  function detectBestMode(gray, pw, ph) {
    // Analyze luminance histogram: sketches/line-art have strong bimodal peaks near extremes
    // and fewer mid-tone transitions than continuous photographs
    let extremeCount = 0;
    let midCount = 0;
    const total = pw * ph;
    for (let i = 0; i < total; i++) {
      const v = gray[i];
      if (v < 38 || v > 217) extremeCount++;
      else if (v > 65 && v < 190) midCount++;
    }
    const extremeRatio = extremeCount / total;
    const midRatio = midCount / total;
    if (extremeRatio > 0.62 && midRatio < 0.26) return 'sketch';
    return 'photo';
  }

  function extractContoursFromImage(img) {
    // 1. Fit image cleanly on stage with balanced breathing room
    const padX = 54;
    const padTop = 44;
    const padBottom = 114;
    const availW = LOGICAL_W - padX * 2;
    const availH = LOGICAL_H - padTop - padBottom;

    const imgAspect = img.width / img.height;
    let drawW, drawH;
    if (imgAspect > availW / availH) {
      drawW = availW;
      drawH = availW / imgAspect;
    } else {
      drawH = availH;
      drawW = availH * imgAspect;
    }
    const drawX = (LOGICAL_W - drawW) / 2;
    const drawY = padTop + (availH - drawH) / 2;
    state.artBounds = { x: drawX, y: drawY, w: drawW, h: drawH };

    // 2. High-detail processing resolution (fast 520px desktop / 440px mobile for instant non-freezing analysis)
    const maxProc = isMobileDevice ? 440 : 520;
    const procScale = Math.min(1, maxProc / Math.max(img.width, img.height));
    const pw = Math.max(80, Math.round(Math.min(maxProc, Math.max(drawW * 0.9, img.width * procScale))));
    const ph = Math.max(80, Math.round(pw / imgAspect));

    const off = document.createElement('canvas');
    off.width = pw;
    off.height = ph;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(img, 0, 0, pw, ph);
    const imgData = octx.getImageData(0, 0, pw, ph);
    const rgba = imgData.data;

    // 3. Perceptual luminance + robust 2%..98% percentile contrast normalization
    const gray = new Float32Array(pw * ph);
    const hist = new Uint32Array(256);
    let borderSum = 0, borderCount = 0;

    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const i = y * pw + x;
        const idx = i * 4;
        const a = rgba[idx + 3] / 255;
        const r = rgba[idx] * a + 255 * (1 - a);
        const g = rgba[idx + 1] * a + 255 * (1 - a);
        const b = rgba[idx + 2] * a + 255 * (1 - a);
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        gray[i] = lum;
        hist[clamp(Math.round(lum), 0, 255)]++;
        if (x < 4 || x >= pw - 4 || y < 4 || y >= ph - 4) {
          borderSum += lum;
          borderCount++;
        }
      }
    }

    const totalPx = pw * ph;
    const loTarget = totalPx * 0.015;
    const hiTarget = totalPx * 0.985;
    let acc = 0, minL = 0, maxL = 255;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= loTarget) { minL = v; break; }
    }
    acc = 0;
    for (let v = 255; v >= 0; v--) {
      acc += hist[v];
      if (acc >= (totalPx - hiTarget)) { maxL = v; break; }
    }
    const rangeL = Math.max(24, maxL - minL);
    for (let i = 0; i < totalPx; i++) {
      gray[i] = clamp(((gray[i] - minL) / rangeL) * 255, 0, 255);
    }

    const avgBorder = borderSum / Math.max(1, borderCount);
    const isLightBg = avgBorder > 128;

    // Resolve mode
    const resolved = state.mode === 'auto' ? detectBestMode(gray, pw, ph) : state.mode;
    state.resolvedMode = resolved;
    const modeNames = {
      sketch: 'Chizma',
      photo: 'Foto / Portret',
      artistic: 'Badiiy (XDoG)',
    };
    detectedModeBadge.textContent = state.mode === 'auto' ? `Avto → ${modeNames[resolved]}` : '';

    // Store raw data for fill layers
    state._rawMask = { gray, rgba, pw, ph, isLightBg };

    // 4. Edge-Preserving Filtering (protects beauty of faces & fine details!)
    const clean = state.cleanliness;
    let prepared;
    if (resolved === 'photo') {
      // Edge-preserving bilateral filter: smooths skin/background grain, keeps eyes/lips/edges crisp!
      const sigmaR = 16 + clean * 32;
      prepared = bilateralFilter5x5(gray, pw, ph, sigmaR);
      if (clean > 0.55) {
        prepared = bilateralFilter5x5(prepared, pw, ph, sigmaR * 0.85);
      }
    } else if (resolved === 'artistic') {
      const b1 = bilateralFilter5x5(gray, pw, ph, 22 + clean * 24);
      prepared = xdogEnhance(b1, pw, ph);
    } else {
      // Sketch / line art: light 3x3 denoise preserves crisp ink lines
      prepared = clean > 0.2 ? gaussianBlur3x3(gray, pw, ph) : gray;
    }

    // 5. Scharr 3x3 Gradient (higher rotational accuracy than Sobel — cleaner diagonal curves!)
    const mag = new Float32Array(totalPx);
    const gxArr = new Float32Array(totalPx);
    const gyArr = new Float32Array(totalPx);
    const borderMargin = 4;

    for (let y = borderMargin; y < ph - borderMargin; y++) {
      const row = y * pw;
      for (let x = borderMargin; x < pw - borderMargin; x++) {
        const tl = prepared[row - pw + x - 1];
        const tc = prepared[row - pw + x];
        const tr = prepared[row - pw + x + 1];
        const ml = prepared[row + x - 1];
        const mr = prepared[row + x + 1];
        const bl = prepared[row + pw + x - 1];
        const bc = prepared[row + pw + x];
        const br = prepared[row + pw + x + 1];

        // Scharr weights: 3, 10, 3
        const gx = (-3 * tl + 3 * tr - 10 * ml + 10 * mr - 3 * bl + 3 * br) / 16;
        const gy = (-3 * tl - 10 * tc - 3 * tr + 3 * bl + 10 * bc + 3 * br) / 16;
        const m = Math.hypot(gx, gy);
        gxArr[row + x] = gx;
        gyArr[row + x] = gy;
        mag[row + x] = m;
      }
    }

    // 6. Sub-pixel Interpolated Non-Maximum Suppression (NMS) -> razor-thin 1px edges
    const nms = new Float32Array(totalPx);
    const nmsValues = [];
    for (let y = borderMargin; y < ph - borderMargin; y++) {
      const row = y * pw;
      for (let x = borderMargin; x < pw - borderMargin; x++) {
        const idx = row + x;
        const m = mag[idx];
        if (m < 4.5) continue;

        const gx = gxArr[idx];
        const gy = gyArr[idx];
        const ax = Math.abs(gx);
        const ay = Math.abs(gy);

        let m1 = 0, m2 = 0;
        if (ax >= ay) {
          const w = ay / (ax + 1e-6);
          const sgn = (gx * gy >= 0) ? 1 : -1;
          m1 = mag[idx + 1] * (1 - w) + mag[idx + 1 + sgn * pw] * w;
          m2 = mag[idx - 1] * (1 - w) + mag[idx - 1 - sgn * pw] * w;
        } else {
          const w = ax / (ay + 1e-6);
          const sgn = (gx * gy >= 0) ? 1 : -1;
          m1 = mag[idx + pw] * (1 - w) + mag[idx + pw + sgn] * w;
          m2 = mag[idx - pw] * (1 - w) + mag[idx - pw - sgn] * w;
        }

        if (m >= m1 && m >= m2) {
          nms[idx] = m;
          nmsValues.push(m);
        }
      }
    }

    if (nmsValues.length === 0) {
      state.segments = [];
      state.twinkles = [];
      contourStats.textContent = 'Konturlar topilmadi';
      return;
    }

    // 7. Adaptive Percentile-Based Hysteresis Thresholding
    nmsValues.sort((a, b) => a - b);
    const sens = clamp(state.sensitivity, 0.15, 0.95);
    // Higher sensitivity -> lower percentile -> more delicate details
    const highPct = resolved === 'sketch'
      ? clamp(0.92 - sens * 0.48, 0.42, 0.90)
      : clamp(0.95 - sens * 0.36, 0.56, 0.93);
    const highThresh = Math.max(
      resolved === 'sketch' ? 12 : 16,
      nmsValues[Math.floor((nmsValues.length - 1) * highPct)]
    );
    const lowThresh = highThresh * (resolved === 'sketch' ? 0.38 : 0.44);
    const p95Mag = Math.max(highThresh * 1.4, nmsValues[Math.floor((nmsValues.length - 1) * 0.96)]);

    const edges = new Uint8Array(totalPx); // 0=none, 1=weak, 2=strong
    const stack = [];
    for (let y = borderMargin; y < ph - borderMargin; y++) {
      const row = y * pw;
      for (let x = borderMargin; x < pw - borderMargin; x++) {
        const idx = row + x;
        const v = nms[idx];
        if (v >= highThresh) {
          edges[idx] = 2;
          stack.push(idx);
        } else if (v >= lowThresh) {
          edges[idx] = 1;
        }
      }
    }

    const offsets = [-pw - 1, -pw, -pw + 1, -1, 1, pw - 1, pw, pw + 1];
    while (stack.length > 0) {
      const curr = stack.pop();
      for (let k = 0; k < 8; k++) {
        const nb = curr + offsets[k];
        if (edges[nb] === 1) {
          edges[nb] = 2;
          stack.push(nb);
        }
      }
    }

    // 8. Strongest-First Bidirectional 8-Connected Contour Chaining
    // Collect strong edge seeds sorted by gradient strength so primary silhouettes trace first!
    const seeds = [];
    for (let y = borderMargin; y < ph - borderMargin; y++) {
      const row = y * pw;
      for (let x = borderMargin; x < pw - borderMargin; x++) {
        const idx = row + x;
        if (edges[idx] === 2) {
          seeds.push(idx);
        }
      }
    }
    seeds.sort((a, b) => nms[b] - nms[a]);

    const visited = new Uint8Array(totalPx);
    const rawChains = [];
    const dirs = [
      [1, 0], [1, 1], [0, 1], [-1, 1],
      [-1, 0], [-1, -1], [0, -1], [1, -1],
    ];

    function traceDirection(startX, startY, initDx, initDy) {
      const pts = [];
      let cx = startX, cy = startY;
      let prevDx = initDx, prevDy = initDy;

      while (true) {
        let bestScore = -999;
        let bestNx = -1, bestNy = -1;

        for (let d = 0; d < 8; d++) {
          const nx = cx + dirs[d][0];
          const ny = cy + dirs[d][1];
          if (nx < borderMargin || nx >= pw - borderMargin || ny < borderMargin || ny >= ph - borderMargin) continue;
          const nIdx = ny * pw + nx;
          if (edges[nIdx] !== 2 || visited[nIdx]) continue;

          const dot = prevDx * dirs[d][0] + prevDy * dirs[d][1];
          const orthoBonus = (dirs[d][0] === 0 || dirs[d][1] === 0) ? 0.2 : 0;
          const strengthBonus = clamp(nms[nIdx] / p95Mag, 0, 1) * 0.45;
          const score = dot * 1.2 + orthoBonus + strengthBonus;
          if (score > bestScore) {
            bestScore = score;
            bestNx = nx;
            bestNy = ny;
          }
        }

        if (bestNx === -1) break;
        visited[bestNy * pw + bestNx] = 1;
        pts.push([bestNx, bestNy]);
        prevDx = bestNx - cx;
        prevDy = bestNy - cy;
        cx = bestNx;
        cy = bestNy;
      }
      return pts;
    }

    // Min chain length filters out tiny noisy speckles (higher cleanliness = cleaner result)
    const minChainPx = Math.round(5 + clean * 11);

    for (let s = 0; s < seeds.length; s++) {
      const startIdx = seeds[s];
      if (visited[startIdx]) continue;
      const sx = startIdx % pw;
      const sy = (startIdx - sx) / pw;
      visited[startIdx] = 1;

      // Trace forward and backward from the strongest seed pixel!
      const fwd = traceDirection(sx, sy, 0, 0);
      const bwdDir = fwd.length > 0 ? [sx - fwd[0][0], sy - fwd[0][1]] : [0, 0];
      const bwd = traceDirection(sx, sy, bwdDir[0], bwdDir[1]);

      bwd.reverse();
      const chain = bwd.concat([[sx, sy]], fwd);

      if (chain.length >= minChainPx) {
        rawChains.push(chain);
      }
    }

    // 9. Convert to Canvas Space, RDP Simplify + Catmull-Rom Smooth + Segment with Strength Hierarchy
    const scaleX = drawW / pw;
    const scaleY = drawH / ph;
    const segments = [];
    const rng = createRng(7);

    const focusX = drawX + drawW * 0.50;
    const focusY = drawY + drawH * 0.24;
    const maxFocusDist = Math.hypot(drawW * 0.65, drawH * 0.85);

    for (const raw of rawChains) {
      // Measure average edge strength & sample original image color along chain
      let sumMag = 0;
      let sumR = 0, sumG = 0, sumB = 0;
      for (let i = 0; i < raw.length; i++) {
        const px = raw[i][0];
        const py = raw[i][1];
        const idx = py * pw + px;
        sumMag += nms[idx];
        const p4 = idx * 4;
        sumR += rgba[p4];
        sumG += rgba[p4 + 1];
        sumB += rgba[p4 + 2];
      }
      const avgStrength = clamp((sumMag / raw.length) / p95Mag, 0.22, 1.0);
      const origColor = boostOriginalColor(
        sumR / raw.length,
        sumG / raw.length,
        sumB / raw.length
      );

      // Map to logical canvas coordinates
      const canvasPts = new Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        canvasPts[i] = [drawX + raw[i][0] * scaleX, drawY + raw[i][1] * scaleY];
      }

      // RDP simplification removes 1px staircase jitter while preserving sharp tips/corners!
      const simplified = rdpSimplify(canvasPts, 1.05);
      // Catmull-Rom spline creates silky, organic hand-drawn curves
      const smoothPts = catmullRomSmooth(simplified, 3);

      // Split into animated segments
      let segPts = [smoothPts[0]];
      let segLen = 0;

      for (let i = 1; i < smoothPts.length; i++) {
        const d = Math.hypot(smoothPts[i][0] - smoothPts[i - 1][0], smoothPts[i][1] - smoothPts[i - 1][1]);
        segPts.push(smoothPts[i]);
        segLen += d;

        if (segLen >= TIMELINE.SEG_LEN && i < smoothPts.length - 4) {
          segments.push(buildSegment(segPts, avgStrength, origColor, drawX, drawY, drawW, drawH, focusX, focusY, maxFocusDist, rng));
          segPts = [smoothPts[i]];
          segLen = 0;
        }
      }
      if (segPts.length >= 2 && segLen >= 6) {
        segments.push(buildSegment(segPts, avgStrength, origColor, drawX, drawY, drawW, drawH, focusX, focusY, maxFocusDist, rng));
      }
    }

    // Sort segments so softer secondary details draw first and bold primary contours sit cleanly on top
    segments.sort((a, b) => a.strength - b.strength);

    state.segments = segments;
    contourStats.textContent = `Konturlar: ${segments.length} ta aniq chiziq`;
    applyAnimationStyle();
  }

  function buildSegment(pts, strength, origColor, drawX, drawY, drawW, drawH, focusX, focusY, maxFocusDist, rng) {
    const cumDist = new Float32Array(pts.length);
    let totalLen = 0;
    let cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) {
      cx += pts[i][0];
      cy += pts[i][1];
      if (i > 0) {
        totalLen += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      }
      cumDist[i] = totalLen;
    }
    cx /= pts.length;
    cy /= pts.length;

    const distRatio = clamp(Math.hypot(cx - focusX, cy - focusY) / maxFocusDist, 0, 1);
    const jitter = (rng() - 0.35) * 0.20;
    const normStart = clamp(distRatio * 0.85 + jitter, 0, 1);

    const startTime = TIMELINE.TRACE_START + normStart * TIMELINE.TRACE_SPREAD;
    const baseDuration = TIMELINE.SEG_MIN_DUR + rng() * (TIMELINE.SEG_MAX_DUR - TIMELINE.SEG_MIN_DUR);

    const nx = clamp((cx - drawX) / Math.max(1, drawW), 0, 1);
    const ny = clamp((cy - drawY) / Math.max(1, drawH), 0, 1);
    const grad = clamp(0.55 * ny + 0.45 * Math.abs(nx - 0.5) * 1.85, 0, 1);
    const diag = clamp(nx * 0.55 + ny * 0.45, 0, 1);

    // Visual hierarchy weight (0.45..1.05): strong primary contours shine brightest
    const lenFactor = clamp(totalLen / 42, 0.55, 1.0);
    const weight = clamp(0.40 + 0.60 * Math.pow(strength, 0.72) * lenFactor, 0.38, 1.05);

    return {
      pts,
      cumDist,
      totalLen: Math.max(1, totalLen),
      cx,
      cy,
      nx,
      ny,
      distRatio,
      jitter,
      startTime,
      duration: baseDuration,
      baseDuration,
      grad,
      diag,
      strength,
      weight,
      origColor,
      seed: rng(),
    };
  }

  // ===== Apply Animation Style & Build Mesmerizing FX Systems =====
  function applyAnimationStyle() {
    const segs = state.segments;
    const style = state.animStyle;

    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      let norm = 0;
      let durMul = 1.0;

      if (style === 'rocket' || style === 'meteor' || style === 'supernova') {
        // Particle-first shatter & reassembly! Contours fade/lock in smoothly as shards arrive (no line drawing!)
        norm = clamp(s.distRatio * 0.65 + s.jitter * 0.5, 0, 1);
        s.startTime = 7.0 + norm * 1.65;
        durMul = 0.55;
      } else if (style === 'vortex') {
        // Particles swirl in first (0..3.6s), then contours lock & ignite rapidly
        norm = clamp(s.distRatio * 0.72 + s.jitter * 0.65, 0, 1);
        s.startTime = 2.6 + norm * 5.2;
        durMul = 0.78;
      } else if (style === 'lightning') {
        // High-voltage rapid chain-reaction ignition from top/center
        norm = clamp(s.distRatio * 0.78 + s.jitter * 0.9, 0, 1);
        s.startTime = 0.15 + norm * 5.8;
        durMul = 0.58;
      } else if (style === 'aurora') {
        // Graceful silk cascade from top to bottom
        norm = clamp(s.ny * 0.85 + Math.abs(s.nx - 0.5) * 0.25 + s.jitter * 0.4, 0, 1);
        s.startTime = 0.2 + norm * 7.6;
        durMul = 1.15;
      } else if (style === 'phoenix') {
        // Rises like glowing fire from bottom to top!
        norm = clamp((1 - s.ny) * 0.86 + Math.abs(s.nx - 0.5) * 0.22 + s.jitter * 0.45, 0, 1);
        s.startTime = 0.2 + norm * 7.4;
        durMul = 1.05;
      } else {
        // 'celestial' — iconic focal-point bloom trace
        norm = clamp(s.distRatio * 0.85 + s.jitter, 0, 1);
        s.startTime = TIMELINE.TRACE_START + norm * TIMELINE.TRACE_SPREAD;
        durMul = 1.0;
      }
      s.duration = Math.max(0.55, s.baseDuration * durMul);
    }

    state.liveSparks = [];
    rebuildTwinkles();
    rebuildCinematicEffects();
  }

  function rebuildCinematicEffects() {
    const segs = state.segments;
    const rng = createRng(1337);
    const artCx = state.artBounds.x + state.artBounds.w / 2;
    const artCy = state.artBounds.y + state.artBounds.h / 2;

    // 1. Shooting Stars across the deep midnight sky
    state.shootingStars = [];
    for (let i = 0; i < 6; i++) {
      state.shootingStars.push({
        startTime: 1.4 + i * 3.4 + rng() * 1.2,
        dur: 0.75 + rng() * 0.45,
        x0: 80 + rng() * (LOGICAL_W - 160),
        y0: 25 + rng() * 260,
        angle: (20 + rng() * 24) * (Math.PI / 180) * (rng() < 0.5 ? 1 : -1),
        dist: 170 + rng() * 190,
      });
    }

    // 2. Vortex Stardust Particles (420 particles spiraling into exact contour points!)
    state.vortexParticles = [];
    if (segs.length > 0) {
      const count = 420;
      for (let i = 0; i < count; i++) {
        const seg = segs[Math.floor(rng() * segs.length)];
        const ptIdx = Math.floor(rng() * seg.pts.length);
        const pt = seg.pts[ptIdx];
        const frac = seg.cumDist[ptIdx] / seg.totalLen;
        const arriveTime = clamp(seg.startTime + frac * seg.duration * 0.45, 1.4, 7.6);
        const angle = Math.atan2(pt[1] - artCy, pt[0] - artCx);
        const startDist = 260 + rng() * 340;
        const swirlTurns = (rng() < 0.5 ? 1 : -1) * (1.2 + rng() * 2.2);

        state.vortexParticles.push({
          tx: pt[0],
          ty: pt[1],
          cx: artCx,
          cy: artCy,
          baseAngle: angle,
          startDist,
          swirlTurns,
          startTime: rng() * 1.2,
          arriveTime,
          size: 1.1 + rng() * 2.1,
          seg,
        });
      }
    }

    // 2.5 Shatter Shards for Rocket / Meteor / Supernova (920 blazing shards -> magnetic reassembly!)
    state.shatterShards = [];
    if (segs.length > 0) {
      const shardCount = 920;
      for (let i = 0; i < shardCount; i++) {
        // Bias slightly toward stronger primary contours so assembled silhouette is crystal-clear!
        const seg = segs[Math.floor(Math.pow(rng(), 0.72) * segs.length)];
        const ptIdx = Math.floor(rng() * seg.pts.length);
        const pt = seg.pts[ptIdx];
        const blastAng = rng() * Math.PI * 2;
        const blastDist = 110 + Math.pow(rng(), 0.65) * 340;
        const bx = artCx + Math.cos(blastAng) * blastDist;
        const by = artCy + Math.sin(blastAng) * blastDist;

        // Curved midpoint control for magnetic swirl return
        const midAng = Math.atan2(pt[1] - by, pt[0] - bx) + (rng() < 0.5 ? 1 : -1) * (0.45 + rng() * 0.75);
        const midDist = Math.hypot(pt[0] - bx, pt[1] - by) * (0.35 + rng() * 0.3);
        const ctrlX = (bx + pt[0]) * 0.5 + Math.cos(midAng) * midDist;
        const ctrlY = (by + pt[1]) * 0.5 + Math.sin(midAng) * midDist;

        state.shatterShards.push({
          ox: artCx,
          oy: artCy,
          bx,
          by,
          ctrlX,
          ctrlY,
          tx: pt[0],
          ty: pt[1],
          assembleStart: 3.95 + rng() * 1.15,
          assembleDur: 2.35 + rng() * 1.35,
          size: 1.4 + rng() * 2.8,
          isCrystal: rng() < 0.45,
          rot: rng() * Math.PI * 2,
          rotSpd: (rng() - 0.5) * 10,
          hotHue: rng(), // warm explosion tint
          seg,
        });
      }
    }

    // 3. Continuous Living Energy Runners (luminous light beads gliding along main contours)
    state.energyRunners = [];
    const longSegs = segs.filter(s => s.totalLen > 45 && s.weight > 0.52);
    const runnerPool = longSegs.length >= 10 ? longSegs : segs;
    const runnerCount = Math.min(36, runnerPool.length);
    for (let i = 0; i < runnerCount; i++) {
      const seg = runnerPool[Math.floor((i / Math.max(1, runnerCount)) * runnerPool.length)];
      state.energyRunners.push({
        seg,
        speed: 0.24 + rng() * 0.34,
        phase: rng(),
        dir: rng() < 0.5 ? 1 : -1,
        size: 2.6 + rng() * 2.6,
      });
    }

    // 4. Rising Phoenix Embers (drifting upward off glowing contours)
    state.phoenixEmbers = [];
    if (segs.length > 0) {
      for (let i = 0; i < 95; i++) {
        const seg = segs[Math.floor(rng() * segs.length)];
        const ptIdx = Math.floor(rng() * seg.pts.length);
        const pt = seg.pts[ptIdx];
        const frac = seg.cumDist[ptIdx] / seg.totalLen;
        state.phoenixEmbers.push({
          ox: pt[0],
          oy: pt[1],
          appearTime: seg.startTime + frac * seg.duration,
          cycle: 2.2 + rng() * 2.8,
          phase: rng() * 5,
          rise: 55 + rng() * 115,
          swayAmp: 6 + rng() * 16,
          swayFreq: 1.4 + rng() * 2.2,
          size: 1.2 + rng() * 2.2,
          seg,
        });
      }
    }
  }

  // ===== Image Filters & Curve Geometry =====
  function gaussianBlur3x3(src, w, h) {
    const out = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      const r = y * w;
      for (let x = 1; x < w - 1; x++) {
        out[r + x] = (
          src[r - w + x - 1] + 2 * src[r - w + x] + src[r - w + x + 1] +
          2 * src[r + x - 1] + 4 * src[r + x] + 2 * src[r + x + 1] +
          src[r + w + x - 1] + 2 * src[r + w + x] + src[r + w + x + 1]
        ) / 16;
      }
    }
    return out;
  }

  function gaussianBlur5x5(src, w, h) {
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    const k = [1, 4, 6, 4, 1];
    for (let y = 0; y < h; y++) {
      const r = y * w;
      for (let x = 2; x < w - 2; x++) {
        tmp[r + x] = (
          src[r + x - 2] * k[0] + src[r + x - 1] * k[1] +
          src[r + x] * k[2] + src[r + x + 1] * k[3] + src[r + x + 2] * k[4]
        ) / 16;
      }
    }
    for (let y = 2; y < h - 2; y++) {
      const r = y * w;
      for (let x = 2; x < w - 2; x++) {
        out[r + x] = (
          tmp[r - 2 * w + x] * k[0] + tmp[r - w + x] * k[1] +
          tmp[r + x] * k[2] + tmp[r + w + x] * k[3] + tmp[r + 2 * w + x] * k[4]
        ) / 16;
      }
    }
    return out;
  }

  function bilateralFilter5x5(src, w, h, sigmaRange) {
    // Fast edge-preserving bilateral filter with precomputed spatial + range LUT
    const out = new Float32Array(src);
    const rangeLut = new Float32Array(256);
    const inv2sr2 = 1 / (2 * sigmaRange * sigmaRange);
    for (let i = 0; i < 256; i++) {
      rangeLut[i] = Math.exp(-(i * i) * inv2sr2);
    }
    const spatial = [
      [0.37, 0.61, 0.72, 0.61, 0.37],
      [0.61, 0.88, 0.96, 0.88, 0.61],
      [0.72, 0.96, 1.00, 0.96, 0.72],
      [0.61, 0.88, 0.96, 0.88, 0.61],
      [0.37, 0.61, 0.72, 0.61, 0.37],
    ];

    for (let y = 2; y < h - 2; y++) {
      const r = y * w;
      for (let x = 2; x < w - 2; x++) {
        const center = src[r + x];
        let sum = 0;
        let wSum = 0;
        for (let ky = -2; ky <= 2; ky++) {
          const nr = (y + ky) * w;
          const spRow = spatial[ky + 2];
          for (let kx = -2; kx <= 2; kx++) {
            const val = src[nr + x + kx];
            const diff = Math.abs(val - center) | 0;
            const wt = spRow[kx + 2] * rangeLut[diff < 256 ? diff : 255];
            sum += val * wt;
            wSum += wt;
          }
        }
        out[r + x] = sum / wSum;
      }
    }
    return out;
  }

  function xdogEnhance(src, w, h) {
    // Extended Difference-of-Gaussians boosts crisp artistic line contours
    const g1 = gaussianBlur3x3(src, w, h);
    const g2 = gaussianBlur5x5(g1, w, h);
    const out = new Float32Array(w * h);
    for (let i = 0; i < out.length; i++) {
      const dog = g1[i] - 0.96 * g2[i];
      out[i] = clamp(src[i] + dog * 1.85, 0, 255);
    }
    return out;
  }

  function rdpSimplify(pts, epsilon) {
    if (pts.length <= 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = 1;
    keep[pts.length - 1] = 1;

    const stack = [[0, pts.length - 1]];
    while (stack.length > 0) {
      const [start, end] = stack.pop();
      let maxD = 0;
      let maxIdx = -1;
      const x1 = pts[start][0], y1 = pts[start][1];
      const x2 = pts[end][0], y2 = pts[end][1];
      const dx = x2 - x1, dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;

      for (let i = start + 1; i < end; i++) {
        let d;
        if (lenSq < 1e-6) {
          d = Math.hypot(pts[i][0] - x1, pts[i][1] - y1);
        } else {
          d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / Math.sqrt(lenSq);
        }
        if (d > maxD) {
          maxD = d;
          maxIdx = i;
        }
      }
      if (maxD > epsilon && maxIdx !== -1) {
        keep[maxIdx] = 1;
        stack.push([start, maxIdx], [maxIdx, end]);
      }
    }

    const out = [];
    for (let i = 0; i < pts.length; i++) {
      if (keep[i]) out.push(pts[i]);
    }
    return out;
  }

  function catmullRomSmooth(pts, subdivisions = 3) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];

      for (let s = 1; s <= subdivisions; s++) {
        const t = s / subdivisions;
        const t2 = t * t;
        const t3 = t2 * t;
        const x = 0.5 * (
          (2 * p1[0]) +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
        );
        const y = 0.5 * (
          (2 * p1[1]) +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
        );
        out.push([x, y]);
      }
    }
    return out;
  }

  // ===== Luminous Inner Fill Layers =====
  function rebuildFillLayers() {
    if (!state._rawMask) return;
    const { gray, rgba, pw, ph, isLightBg } = state._rawMask;

    // 1. Palette-tinted ghostly luminous fill
    const fc = document.createElement('canvas');
    fc.width = pw;
    fc.height = ph;
    const fctx = fc.getContext('2d');
    const outData = fctx.createImageData(pw, ph);
    const d = outData.data;

    // 2. Original photo dark-cinematic reveal canvas
    const pc = document.createElement('canvas');
    pc.width = pw;
    pc.height = ph;
    const pctx = pc.getContext('2d');
    const photoData = pctx.createImageData(pw, ph);
    const pd = photoData.data;

    const palKey = state.paletteKey === 'original' ? 'silver' : state.paletteKey;

    for (let y = 0; y < ph; y++) {
      const ny = y / ph;
      // Soft radial vignette so photo edges melt seamlessly into midnight bg
      const vy = (ny - 0.5) * 2;
      for (let x = 0; x < pw; x++) {
        const nx = x / pw;
        const vx = (nx - 0.5) * 2;
        const vig = clamp(1 - Math.pow(Math.hypot(vx, vy) * 0.72, 3.2), 0, 1);

        const i = y * pw + x;
        const lum = gray[i];
        let strength = isLightBg
          ? clamp((208 - lum) / 172, 0, 1)
          : clamp((lum - 42) / 182, 0, 1);
        strength = strength * strength;

        const p = i * 4;
        if (strength >= 0.03) {
          const g = clamp(0.55 * ny + 0.45 * Math.abs(nx - 0.5) * 1.85, 0, 1);
          const col = state.paletteKey === 'original'
            ? boostOriginalColor(rgba[p], rgba[p + 1], rgba[p + 2])
            : samplePalette(g, palKey);

          d[p] = col[0];
          d[p + 1] = col[1];
          d[p + 2] = col[2];
          d[p + 3] = Math.round(strength * 64);
        }

        // Subtle dark-lit original photo layer
        pd[p] = rgba[p];
        pd[p + 1] = rgba[p + 1];
        pd[p + 2] = rgba[p + 2];
        pd[p + 3] = Math.round(rgba[p + 3] * 0.42 * vig);
      }
    }

    fctx.putImageData(outData, 0, 0);
    pctx.putImageData(photoData, 0, 0);
    state.fillTintCanvas = fc;
    state.fillPhotoCanvas = pc;

    // Invalidate heavy mode-specific caches and build ONLY the active mode's data lazily!
    state.bloomData = null;
    state.bloomSharpCanvas = null;
    state.velnoxNegCanvas = null;
    state.velnoxPosCanvas = null;
    state.cloud3D = null;
    state.binaryGrid = null;
    ensureActiveStyleLayers();
  }

  function ensureActiveStyleLayers() {
    if (!state._rawMask) return;
    const style = state.animStyle;
    if (style === 'binary') {
      if (!state.binaryGrid) buildBinaryGrid();
    } else if (style === 'holo3d') {
      if (!state.bloomData) buildBloomParticles();
      if (!state.cloud3D) build3DPointCloud();
    } else if (style === 'topdown') {
      if (!state.bloomData) buildBloomParticles();
      if (!state.velnoxNegCanvas || !state.velnoxPosCanvas) buildVelnoxLayers();
    } else if (style === 'velnox') {
      if (!state.velnoxNegCanvas || !state.velnoxPosCanvas) buildVelnoxLayers();
    } else if (style === 'bloom') {
      if (!state.bloomData || !state.bloomSharpCanvas) buildBloomParticles();
    }
  }

  function buildBinaryGrid() {
    if (!state._rawMask) return;
    const { gray, rgba, pw, ph, isLightBg } = state._rawMask;
    const { x: drawX, y: drawY, w: drawW, h: drawH } = state.artBounds;

    // Crisp monospace grid (~74 cols x ~68 rows)
    const cellW = 8.4;
    const cellH = 10.6;
    const cols = Math.max(24, Math.floor(drawW / cellW));
    const rows = Math.max(24, Math.floor(drawH / cellH));
    const offsetX = drawX + (drawW - cols * cellW) * 0.5;
    const offsetY = drawY + (drawH - rows * cellH) * 0.5;

    const total = cols * rows;
    const lumArr = new Float32Array(total);
    const bitArr = new Uint8Array(total); // 0 or 1
    const colR = new Uint8Array(total);
    const colG = new Uint8Array(total);
    const colB = new Uint8Array(total);
    const rng = createRng(10101);

    // Per-column staggered rain drop parameters
    const colDelay = new Float32Array(cols);
    const colSpeed = new Float32Array(cols);
    for (let c = 0; c < cols; c++) {
      // Gentle wave from center-out + organic stagger so rain looks super natural
      const centerBias = Math.abs(c / (cols - 1) - 0.5) * 1.4;
      colDelay[c] = 0.1 + centerBias * 1.2 + rng() * 2.1;
      colSpeed[c] = 10.5 + rng() * 5.5; // rows per second
    }

    for (let r = 0; r < rows; r++) {
      const py0 = Math.floor((r / rows) * ph);
      const py1 = Math.max(py0 + 1, Math.floor(((r + 1) / rows) * ph));
      for (let c = 0; c < cols; c++) {
        const px0 = Math.floor((c / cols) * pw);
        const px1 = Math.max(px0 + 1, Math.floor(((c + 1) / cols) * pw));

        let sumL = 0, sumR = 0, sumG = 0, sumB = 0, cnt = 0;
        for (let py = py0; py < py1; py++) {
          for (let px = px0; px < px1; px++) {
            const idx = py * pw + px;
            const p4 = idx * 4;
            sumL += gray[idx];
            sumR += rgba[p4];
            sumG += rgba[p4 + 1];
            sumB += rgba[p4 + 2];
            cnt++;
          }
        }
        const avgL = (sumL / Math.max(1, cnt)) / 255;
        // On light-background drawings, invert so the subject glows brightly on pure black terminal!
        let strength = isLightBg ? (1 - avgL) : avgL;
        // S-curve contrast boost so faces/eyes/details pop sharply in 0s and 1s!
        strength = clamp((strength - 0.14) / 0.80, 0, 1);
        strength = Math.pow(strength, 1.08);

        const gi = r * cols + c;
        lumArr[gi] = strength;
        // Bright highlights -> '1', midtones -> alternating '1'/'0' (like Mona Lisa binary art!)
        bitArr[gi] = strength > 0.56 ? 1 : (strength > 0.34 ? ((r + c) & 1) : 0);

        const boosted = boostOriginalColor(
          sumR / Math.max(1, cnt),
          sumG / Math.max(1, cnt),
          sumB / Math.max(1, cnt)
        );
        colR[gi] = boosted[0];
        colG[gi] = boosted[1];
        colB[gi] = boosted[2];
      }
    }

    state.binaryGrid = {
      cols, rows, cellW, cellH, offsetX, offsetY,
      lumArr, bitArr, colR, colG, colB, colDelay, colSpeed,
    };
  }

  function build3DPointCloud() {
    if (!state._rawMask || !state.bloomData) return;
    const { gray, rgba, pw, ph } = state._rawMask;
    const { x: drawX, y: drawY, w: drawW, h: drawH } = state.artBounds;
    const cx = drawX + drawW / 2;
    const cy = drawY + drawH / 2;

    // Smooth depth map (2 passes of 5x5 Gaussian) so 3D relief is silky & sculpted, never spiky!
    const d1 = gaussianBlur5x5(gray, pw, ph);
    const depthSmooth = gaussianBlur5x5(d1, pw, ph);

    const bd = state.bloomData;
    const max3DBase = isMobileDevice ? 6200 : 8800;
    const baseCount = Math.min(max3DBase, bd.count);
    const backCount = Math.floor(baseCount * 0.32);
    const total = baseCount + backCount;
    const rng = createRng(3030);

    const lx = new Float32Array(total);
    const ly = new Float32Array(total);
    const lz = new Float32Array(total);
    const ox = new Float32Array(total);
    const oy = new Float32Array(total);
    const oz = new Float32Array(total);
    const tStart = new Float32Array(total);
    const dur = new Float32Array(total);
    const size = new Float32Array(total);
    const colR = new Uint8Array(total);
    const colG = new Uint8Array(total);
    const colB = new Uint8Array(total);

    const step = bd.count / baseCount;
    const invW = 1 / Math.max(1, drawW);
    const invH = 1 / Math.max(1, drawH);

    for (let i = 0; i < baseCount; i++) {
      const si = Math.min(bd.count - 1, Math.floor(i * step));
      const xWorld = bd.tx[si] - cx;
      const yWorld = bd.ty[si] - cy;
      const nx = clamp((bd.tx[si] - drawX) * invW, 0, 1);
      const ny = clamp((bd.ty[si] - drawY) * invH, 0, 1);
      const px = clamp(Math.floor(nx * (pw - 1)), 0, pw - 1);
      const py = clamp(Math.floor(ny * (ph - 1)), 0, ph - 1);

      // Sculpted 3D depth: luminance relief + smooth spherical pillow dome!
      const lumNorm = depthSmooth[py * pw + px] / 255;
      const radFromCenter = Math.hypot((nx - 0.5) * 2, (ny - 0.5) * 2);
      const dome = Math.max(0, 1 - radFromCenter * radFromCenter * 0.72);
      const zFront = (lumNorm * 58 + dome * 48 - 22) + (rng() - 0.5) * 6;

      lx[i] = xWorld;
      ly[i] = yWorld;
      lz[i] = zFront;

      // Misty 3D dispersion offset for initial bloom grow
      ox[i] = bd.ox[si] * 1.15;
      oy[i] = bd.oy[si] * 1.15;
      oz[i] = (rng() - 0.5) * 140;

      tStart[i] = bd.tStart[si] * 0.85;
      dur[i] = 1.9 + rng() * 1.7;
      size[i] = 1.25 + rng() * 1.45;
      colR[i] = bd.colR[si];
      colG[i] = bd.colG[si];
      colB[i] = bd.colB[si];
    }

    // Mirrored volumetric back & side thickness shell so 360° rotation shows a SOLID 3D sculpture!
    for (let k = 0; k < backCount; k++) {
      const dst = baseCount + k;
      const src = Math.floor((k / backCount) * baseCount);
      lx[dst] = lx[src] + (rng() - 0.5) * 3;
      ly[dst] = ly[src] + (rng() - 0.5) * 3;
      lz[dst] = -Math.abs(lz[src]) * 0.65 - 14 - rng() * 12;

      ox[dst] = ox[src];
      oy[dst] = oy[src];
      oz[dst] = -oz[src];

      tStart[dst] = tStart[src] + 0.15;
      dur[dst] = dur[src];
      size[dst] = size[src] * 0.92;
      // Subtle atmospheric rim tint on back shell so depth separation looks rich & 3D!
      colR[dst] = Math.round(colR[src] * 0.78);
      colG[dst] = Math.round(colG[src] * 0.84);
      colB[dst] = Math.min(255, Math.round(colB[src] * 0.95 + 18));
    }

    // 3D Floating Golden Bokeh / Stardust orbiting the sculpture (like the Camellia screenshot!)
    const bokeh = [];
    for (let i = 0; i < 65; i++) {
      const ang = rng() * Math.PI * 2;
      const rad = 110 + rng() * 230;
      bokeh.push({
        x: Math.cos(ang) * rad,
        y: (rng() - 0.5) * drawH * 1.1,
        z: Math.sin(ang) * rad,
        r: 1.5 + rng() * 3.8,
        phase: rng() * Math.PI * 2,
        speed: 0.25 + rng() * 0.55,
        warm: rng() < 0.65,
      });
    }

    state.cloud3D = {
      count: total, lx, ly, lz, ox, oy, oz, tStart, dur, size, colR, colG, colB, bokeh,
    };
  }

  function buildVelnoxLayers() {
    if (!state._rawMask) return;
    const { gray, rgba, pw, ph, isLightBg } = state._rawMask;

    const negC = document.createElement('canvas');
    negC.width = pw;
    negC.height = ph;
    const nctx = negC.getContext('2d');
    const negData = nctx.createImageData(pw, ph);
    const nd = negData.data;

    const posC = document.createElement('canvas');
    posC.width = pw;
    posC.height = ph;
    const pctx = posC.getContext('2d');
    const posData = pctx.createImageData(pw, ph);
    const pd = posData.data;

    // Fast Scharr edge map so hair strands, eyes, and crisp ink outlines stay razor-sharp!
    const edgeStr = new Float32Array(pw * ph);
    for (let y = 1; y < ph - 1; y++) {
      const r = y * pw;
      for (let x = 1; x < pw - 1; x++) {
        const gx = (-3 * gray[r - pw + x - 1] + 3 * gray[r - pw + x + 1]
          - 10 * gray[r + x - 1] + 10 * gray[r + x + 1]
          - 3 * gray[r + pw + x - 1] + 3 * gray[r + pw + x + 1]) / 16;
        const gy = (-3 * gray[r - pw + x - 1] - 10 * gray[r - pw + x] - 3 * gray[r - pw + x + 1]
          + 3 * gray[r + pw + x - 1] + 10 * gray[r + pw + x] + 3 * gray[r + pw + x + 1]) / 16;
        edgeStr[r + x] = clamp(Math.hypot(gx, gy) / 72, 0, 1);
      }
    }

    // Velnox vertical gradient (Gold top -> Mint/Cyan middle -> Electric Cobalt Blue bottom)
    // Or user's chosen palette!
    const palKey = state.paletteKey === 'silver' ? 'cosmic' : state.paletteKey;

    for (let y = 0; y < ph; y++) {
      const ny = y / ph;
      const vy = (ny - 0.5) * 2;
      for (let x = 0; x < pw; x++) {
        const nx = x / pw;
        const vx = (nx - 0.5) * 2;
        const idx = y * pw + x;
        const p = idx * 4;
        const origA = rgba[p + 3] / 255;
        if (origA < 0.08) continue;

        const lum = gray[idx] / 255; // 0..1
        const edge = edgeStr[idx];

        // Subject mask: keeps subject crisp, suppresses solid flat background cleanly
        let subjMask = origA;
        if (isLightBg) {
          // Dark ink / shaded subject on light bg: exclude pure bright background near borders
          const borderDist = Math.hypot(vx * 0.9, vy * 0.9);
          const bgFade = lum > 0.91 ? clamp(1 - (lum - 0.91) * 14, 0, 1) : 1;
          subjMask *= clamp(bgFade + edge * 0.85, 0, 1) * clamp(1.15 - Math.pow(borderDist, 5), 0, 1);
        } else {
          const vig = clamp(1 - Math.pow(Math.hypot(vx, vy) * 0.88, 4.0), 0, 1);
          subjMask *= vig;
        }
        if (subjMask < 0.04) continue;

        // === LAYER 1: ELECTRIC ICE-WHITE X-RAY NEGATIVE (Image 3) ===
        // Inverted contrast: dark hair/ink lines glow blazing ice-white, flat skin stays deep black!
        const invTone = isLightBg ? (1 - lum) : lum;
        // High-contrast S-curve + razor-sharp edge highlight
        let negVal = clamp((invTone - 0.28) * 2.15 + edge * 0.95, 0, 1);
        negVal = Math.pow(negVal, 1.15) * subjMask;
        if (negVal > 0.03) {
          nd[p] = Math.min(255, Math.round(175 + negVal * 80));
          nd[p + 1] = Math.min(255, Math.round(220 + negVal * 35));
          nd[p + 2] = 255;
          nd[p + 3] = Math.round(negVal * 255);
        }

        // === LAYER 2: VIBRANT CEL-SHADED POSITIVE NEON (Image 4) ===
        // Bright & midtone areas glow in smooth Gold -> Cyan -> Blue gradient, dark ink lines stay pure black!
        let posTone = isLightBg ? lum : lum;
        // Crisp manga ink cutoff: deep dark strokes & strong dark edges carve pure black lines!
        const inkCut = clamp((posTone - 0.24) * 2.1, 0, 1);
        const celLevel = inkCut < 0.15 ? 0 : (inkCut < 0.55 ? 0.62 : 1.0);
        const smoothCel = inkCut * 0.55 + celLevel * 0.45;
        // Keep background pure black even on light-bg images
        const notWhiteBg = isLightBg ? clamp(1 - Math.max(0, (lum - 0.93) * 16), 0, 1) : 1;
        const posVal = clamp(smoothCel * notWhiteBg * (1 - edge * 0.42), 0, 1) * subjMask;

        if (posVal > 0.03) {
          let col;
          if (palKey === 'original') {
            col = boostOriginalColor(rgba[p], rgba[p + 1], rgba[p + 2]);
          } else {
            // Smooth vertical gradient (Gold top -> Mint/Cyan face -> Electric Blue bottom)
            const g = clamp(ny * 0.88 + Math.abs(nx - 0.5) * 0.18, 0, 1);
            col = samplePalette(g, palKey);
          }
          pd[p] = col[0];
          pd[p + 1] = col[1];
          pd[p + 2] = col[2];
          pd[p + 3] = Math.round(posVal * 255);
        }
      }
    }

    nctx.putImageData(negData, 0, 0);
    pctx.putImageData(posData, 0, 0);
    state.velnoxNegCanvas = negC;
    state.velnoxPosCanvas = posC;
  }

  function buildBloomParticles() {
    if (!state._rawMask) return;
    const { rgba, pw, ph } = state._rawMask;
    const { x: drawX, y: drawY, w: drawW, h: drawH } = state.artBounds;

    // Estimate border RGB to smoothly separate solid dark/light backgrounds
    let br = 0, bg = 0, bb = 0, bc = 0;
    for (let x = 0; x < pw; x++) {
      for (const y of [0, 1, ph - 2, ph - 1]) {
        const p = (y * pw + x) * 4;
        if (rgba[p + 3] > 20) {
          br += rgba[p]; bg += rgba[p + 1]; bb += rgba[p + 2]; bc++;
        }
      }
    }
    for (let y = 2; y < ph - 2; y++) {
      for (const x of [0, 1, pw - 2, pw - 1]) {
        const p = (y * pw + x) * 4;
        if (rgba[p + 3] > 20) {
          br += rgba[p]; bg += rgba[p + 1]; bb += rgba[p + 2]; bc++;
        }
      }
    }
    const hasOpaqueBorder = bc > 0;
    const bR = hasOpaqueBorder ? br / bc : 0;
    const bG = hasOpaqueBorder ? bg / bc : 0;
    const bB = hasOpaqueBorder ? bb / bc : 0;

    // Measure border color uniformity (if border is uniform -> clean studio/solid background!)
    let borderVar = 0;
    if (hasOpaqueBorder) {
      for (let x = 0; x < pw; x += 4) {
        const p = x * 4;
        borderVar += Math.hypot(rgba[p] - bR, rgba[p + 1] - bG, rgba[p + 2] - bB);
      }
      borderVar /= Math.max(1, pw / 4);
    }
    const isSolidBg = hasOpaqueBorder && borderVar < 42;

    // Create clean background-removed photorealistic sharp canvas
    const sharpC = document.createElement('canvas');
    sharpC.width = pw;
    sharpC.height = ph;
    const sctx = sharpC.getContext('2d');
    const sData = sctx.createImageData(pw, ph);
    const sd = sData.data;

    const candidates = [];
    for (let y = 0; y < ph; y++) {
      const ny = y / ph;
      const vy = (ny - 0.5) * 2;
      for (let x = 0; x < pw; x++) {
        const nx = x / pw;
        const vx = (nx - 0.5) * 2;
        const p = (y * pw + x) * 4;
        const aOrig = rgba[p + 3] / 255;
        if (aOrig < 0.08) continue;

        const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
        let mask = aOrig;

        if (isSolidBg) {
          const dist = Math.hypot(r - bR, g - bG, b - bB);
          // Smooth feathered background keying (thresh ~ 16..52)
          mask *= clamp((dist - 14) / 36, 0, 1);
        } else {
          // Soft studio vignette for full-bleed photos
          const vig = clamp(1 - Math.pow(Math.hypot(vx, vy) * 0.84, 3.6), 0, 1);
          mask *= vig;
        }

        if (mask < 0.05) continue;

        sd[p] = r;
        sd[p + 1] = g;
        sd[p + 2] = b;
        sd[p + 3] = Math.round(mask * 255);

        if (mask > 0.25) {
          candidates.push(y * pw + x);
        }
      }
    }
    sctx.putImageData(sData, 0, 0);
    state.bloomSharpCanvas = sharpC;

    // Reusable offscreen canvas for soft feathered vertical reveal
    if (!state.bloomRevealCanvas) {
      state.bloomRevealCanvas = document.createElement('canvas');
    }
    state.bloomRevealCanvas.width = pw;
    state.bloomRevealCanvas.height = ph;

    // Sample up to 11,000 (7,500 on mobile) organic color-true dust particles + micro-hair streaks for 60fps smoothness
    const maxParticles = isMobileDevice ? 7500 : 11000;
    const count = Math.min(maxParticles, candidates.length);
    if (count === 0) {
      state.bloomData = null;
      return;
    }

    const rng = createRng(2026);
    const step = candidates.length / count;

    const tx = new Float32Array(count);
    const ty = new Float32Array(count);
    const ox = new Float32Array(count);
    const oy = new Float32Array(count);
    const tStart = new Float32Array(count);
    const dur = new Float32Array(count);
    const hairDx = new Float32Array(count);
    const hairDy = new Float32Array(count);
    const size = new Float32Array(count);
    const colR = new Uint8Array(count);
    const colG = new Uint8Array(count);
    const colB = new Uint8Array(count);
    const isStreak = new Uint8Array(count);

    const scaleX = drawW / pw;
    const scaleY = drawH / ph;

    for (let i = 0; i < count; i++) {
      const ci = Math.min(candidates.length - 1, Math.floor(i * step + rng() * step));
      const idx = candidates[ci];
      const px = idx % pw;
      const py = (idx - px) / pw;
      const p4 = idx * 4;

      const xPos = drawX + px * scaleX;
      const yPos = drawY + py * scaleY;
      const nx = px / pw;
      const ny = py / ph;

      tx[i] = xPos;
      ty[i] = yPos;

      // Preserve true RGB color with subtle luminous lift so petals/details pop on pure black
      const r = rgba[p4], g = rgba[p4 + 1], b = rgba[p4 + 2];
      colR[i] = Math.min(255, Math.round(r * 1.08 + 10));
      colG[i] = Math.min(255, Math.round(g * 1.08 + 10));
      colB[i] = Math.min(255, Math.round(b * 1.08 + 12));

      // Organic bottom-to-top growth wave (like Bugloss flower blooming upward!)
      const organicNoise = (
        Math.sin(nx * 11.5 + ny * 6.3) * 0.5 +
        Math.cos(nx * 23.0 - ny * 14.0) * 0.3 +
        (rng() - 0.5) * 0.7
      ) * 0.14;
      const growHeight = clamp((1 - ny) + organicNoise, 0, 1);
      tStart[i] = 0.25 + growHeight * 8.6;
      dur[i] = 2.1 + rng() * 2.1;

      // Misty upward & outward ethereal dispersion (rough = 0.7)
      const spread = 22 + Math.pow(rng(), 0.75) * 95;
      const ang = -Math.PI * 0.5 + (rng() - 0.5) * 2.3;
      ox[i] = Math.cos(ang) * spread;
      oy[i] = Math.sin(ang) * spread - (12 + rng() * 38);

      // Fine misty hair-streak vector (like "hairs 60k / streaks 9,000")
      const streak = rng() < 0.28 ? 1 : 0;
      isStreak[i] = streak;
      const hLen = streak ? (10 + rng() * 24) : (3 + rng() * 7);
      const hAng = -Math.PI * 0.5 + (rng() - 0.5) * 1.4;
      hairDx[i] = Math.cos(hAng) * hLen;
      hairDy[i] = Math.sin(hAng) * hLen;
      size[i] = streak ? (0.85 + rng() * 0.95) : (0.9 + rng() * 1.55);
    }

    state.bloomData = {
      count, tx, ty, ox, oy, tStart, dur, hairDx, hairDy, size, colR, colG, colB, isStreak,
    };
  }

  // ===== Smart Curvature-Aware Starlight Twinkles (✦) =====
  function rebuildTwinkles() {
    const count = state.twinkleCount;
    const segs = state.segments;
    state.twinkles = [];
    if (count <= 0 || segs.length === 0) return;

    // Prefer strong primary contours & endpoints/peaks (just like the halo & wing tips!)
    const strongSegs = segs.filter(s => s.strength >= 0.45);
    const pool = strongSegs.length >= 12 ? strongSegs : segs;

    const rng = createRng(42);
    const minDist = 24;
    let attempts = 0;

    while (state.twinkles.length < count && attempts < count * 30) {
      attempts++;
      const seg = pool[Math.floor(rng() * pool.length)];
      // 40% chance to place near segment endpoint (star tips, wing tips), 60% along curve
      const ptIdx = rng() < 0.4
        ? (rng() < 0.5 ? 0 : seg.pts.length - 1)
        : Math.floor(rng() * seg.pts.length);
      const pt = seg.pts[ptIdx];

      let tooClose = false;
      for (let j = 0; j < state.twinkles.length; j++) {
        const t = state.twinkles[j];
        if (Math.hypot(t.x - pt[0], t.y - pt[1]) < minDist) {
          tooClose = true;
          break;
        }
      }
      if (tooClose && attempts < count * 18) continue;

      const frac = seg.cumDist[ptIdx] / seg.totalLen;
      const appearTime = seg.startTime + frac * seg.duration;

      state.twinkles.push({
        x: pt[0],
        y: pt[1],
        size: 5.5 + rng() * 10.5,
        appearTime,
        phase: rng() * Math.PI * 2,
        freq: 1.5 + rng() * 2.3,
        seg,
      });
    }
  }

  // ===== Cinema-Grade Rendering Loop =====
  function renderFrame(t) {
    // Compare mode: show original image cleanly
    if (state.comparing && state.currentImg) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgb(${BG_RGB[0]}, ${BG_RGB[1]}, ${BG_RGB[2]})`;
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      ctx.drawImage(
        state.currentImg,
        state.artBounds.x,
        state.artBounds.y,
        state.artBounds.w,
        state.artBounds.h
      );
      return;
    }

    let masterAlpha = 1;
    if (state.loop && t > TIMELINE.FADE_START) {
      masterAlpha = 1 - easeSine((t - TIMELINE.FADE_START) / (TIMELINE.DURATION - TIMELINE.FADE_START));
    }

    // Dedicated PROGRAMMER BINARY MATRIX 0/1 RAIN -> IMAGE mode!
    if (state.animStyle === 'binary' && state.binaryGrid) {
      renderBinaryMatrixFrame(ctx, t, masterAlpha);
      return;
    }

    // Dedicated TRUE 3D VOLUMETRIC HOLOGRAM BLOOM + 360° ROTATION mode!
    if (state.animStyle === 'holo3d' && state.cloud3D) {
      render3DHologramFrame(ctx, t, masterAlpha);
      return;
    }

    // Dedicated TOP-DOWN PARTICLE GATHER -> X-Ray -> Neon Positive mode!
    if (state.animStyle === 'topdown' && state.velnoxNegCanvas && state.velnoxPosCanvas && state.bloomData) {
      renderTopDownGatherFrame(ctx, t, masterAlpha);
      return;
    }

    // Dedicated VELNOX X-Ray Portal -> Neon Positive Flip mode!
    if (state.animStyle === 'velnox' && state.velnoxNegCanvas && state.velnoxPosCanvas) {
      renderVelnoxFrame(ctx, t, masterAlpha);
      return;
    }

    // Dedicated FULL-COLOR ORGANIC PARTICLE BLOOM GROW mode (codeb1oom.py style!)
    if (state.animStyle === 'bloom' && state.bloomData && state.bloomSharpCanvas) {
      renderBloomGrowFrame(ctx, t, masterAlpha);
      return;
    }

    // 1. Deep midnight background
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgb(${BG_RGB[0]}, ${BG_RGB[1]}, ${BG_RGB[2]})`;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // Subtle cosmic radial aura behind artwork
    const cx = state.artBounds.x + state.artBounds.w / 2;
    const cy = state.artBounds.y + state.artBounds.h * 0.45;
    const auraR = Math.max(state.artBounds.w, state.artBounds.h) * 0.68;
    const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, auraR);
    const midCol = samplePalette(0.55, state.paletteKey === 'original' ? 'silver' : state.paletteKey);
    bgGrad.addColorStop(0, `rgba(${midCol[0]}, ${midCol[1]}, ${midCol[2]}, ${(0.06 * masterAlpha).toFixed(3)})`);
    bgGrad.addColorStop(1, 'rgba(8, 5, 15, 0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // 2. Ambient floating stardust + Shooting Stars
    for (let i = 0; i < state.ambientDust.length; i++) {
      const m = state.ambientDust[i];
      const mx = ((m.x + m.vx * t) % LOGICAL_W + LOGICAL_W) % LOGICAL_W;
      const my = ((m.y + m.vy * t) % LOGICAL_H + LOGICAL_H) % LOGICAL_H;
      const a = (0.10 + 0.18 * (0.5 + 0.5 * Math.sin(t * m.speed + m.phase))) * masterAlpha;
      ctx.fillStyle = `rgba(220, 232, 255, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(mx, my, m.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Occasional delicate shooting stars in deep sky
    if (state.showSparks) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < state.shootingStars.length; i++) {
        const ss = state.shootingStars[i];
        const age = t - ss.startTime;
        if (age < 0 || age > ss.dur) continue;
        const p = age / ss.dur;
        const headX = ss.x0 + Math.cos(ss.angle) * ss.dist * p;
        const headY = ss.y0 + Math.sin(ss.angle) * ss.dist * p;
        const tailLen = 58 * Math.sin(p * Math.PI);
        const tailX = headX - Math.cos(ss.angle) * tailLen;
        const tailY = headY - Math.sin(ss.angle) * tailLen;
        const a = Math.sin(p * Math.PI) * 0.72 * masterAlpha;

        const g = ctx.createLinearGradient(headX, headY, tailX, tailY);
        g.addColorStop(0, `rgba(255, 255, 255, ${a.toFixed(3)})`);
        g.addColorStop(0.35, `rgba(${midCol[0]}, ${midCol[1]}, ${midCol[2]}, ${(a * 0.55).toFixed(3)})`);
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(headX, headY);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Subtle Cinema Camera Breathing + Impact Micro-Shake for Rocket/Meteor/Supernova!
    const style = state.animStyle;
    const isImpactMode = (style === 'rocket' || style === 'meteor' || style === 'supernova');
    const IMPACT_T = 1.85;

    ctx.save();
    let shakeX = 0, shakeY = 0;
    if (isImpactMode && t >= IMPACT_T && t < IMPACT_T + 0.65) {
      const sp = 1 - (t - IMPACT_T) / 0.65;
      const amp = sp * sp * 11;
      shakeX = Math.sin(t * 78) * amp;
      shakeY = Math.cos(t * 91) * amp;
    }

    if (state.cinemaZoom || shakeX || shakeY) {
      const zoomProg = state.cinemaZoom ? easeSine(clamp(t / TIMELINE.FADE_START, 0, 1)) : 0;
      const scale = 1.0 + 0.042 * zoomProg;
      const floatY = state.cinemaZoom ? Math.sin(t * 0.65) * 3.2 : 0;
      const floatX = state.cinemaZoom ? Math.cos(t * 0.42) * 1.6 : 0;
      ctx.translate(cx + floatX + shakeX, cy + floatY + shakeY);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
    }

    // 2.8 IMPACT CINEMATIC SEQUENCE (Rocket / Meteor / Supernova -> Explosion -> 920-Shard Shatter -> Magnetic Reassembly!)
    if (isImpactMode) {
      renderImpactSequence(ctx, t, IMPACT_T, cx, cy, style, midCol, masterAlpha);
    }

    // 3. Inner Fill / Depth Layer (FILL_START -> FILL_END)
    if (state.fillMode !== 'none' && t >= TIMELINE.FILL_START) {
      const fillProg = easeSine((t - TIMELINE.FILL_START) / (TIMELINE.FILL_END - TIMELINE.FILL_START));
      const fillSrc = state.fillMode === 'photo' ? state.fillPhotoCanvas : state.fillTintCanvas;
      if (fillSrc) {
        ctx.save();
        ctx.globalCompositeOperation = state.fillMode === 'photo' ? 'source-over' : 'screen';
        ctx.globalAlpha = fillProg * (state.fillMode === 'photo' ? 0.92 : 0.85) * masterAlpha;
        ctx.drawImage(
          fillSrc,
          state.artBounds.x,
          state.artBounds.y,
          state.artBounds.w,
          state.artBounds.h
        );
        ctx.restore();
      }
    }

    // 4. Shimmer wave + Completion Shockwave Ring state
    let shimmerPos = -1;
    if (state.showShimmer && t >= TIMELINE.SHIMMER_START) {
      const st = (t - TIMELINE.SHIMMER_START) / TIMELINE.SHIMMER_DUR;
      if (st <= 1.25) {
        shimmerPos = st * 1.15 - 0.1;
      } else {
        const repeat = ((t - TIMELINE.SHIMMER_START) % 5.5) / TIMELINE.SHIMMER_DUR;
        if (repeat <= 1.15) shimmerPos = repeat * 1.15 - 0.1;
      }
    }

    // Completion Shockwave Ring (expands from focal center right as contours complete!)
    const shockStart = state.animStyle === 'lightning' ? 7.2 : 9.1;
    const shockDur = 2.1;
    const shockProg = (t >= shockStart && t <= shockStart + shockDur)
      ? (t - shockStart) / shockDur
      : -1;
    const maxArtRad = Math.hypot(state.artBounds.w * 0.62, state.artBounds.h * 0.62);
    const shockRadius = shockProg >= 0 ? easeOut(shockProg) * maxArtRad * 1.25 : -1;

    // Prepare optical bloom buffer if enabled
    const doBloom = state.useBloom && state.glowIntensity > 0.2;
    if (doBloom) {
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
      bctx.setTransform(BLOOM_SCALE, 0, 0, BLOOM_SCALE, 0, 0);
      bctx.lineCap = 'round';
      bctx.lineJoin = 'round';
      bctx.globalCompositeOperation = 'lighter';
    }

    // 4.5 Vortex Stardust Assembly (animStyle === 'vortex')
    if (state.animStyle === 'vortex' && t < 8.4) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < state.vortexParticles.length; i++) {
        const vp = state.vortexParticles[i];
        if (t < vp.startTime) continue;
        const dur = Math.max(0.4, vp.arriveTime - vp.startTime);
        const raw = (t - vp.startTime) / dur;
        if (raw > 1.28) continue;

        const col = getSegmentColor(vp.seg);
        if (raw <= 1) {
          const p = easeInOut(raw);
          const rem = 1 - p;
          const dist = vp.startDist * rem * rem;
          const ang = vp.baseAngle + vp.swirlTurns * rem * rem * Math.PI;
          const px = vp.tx + Math.cos(ang) * dist;
          const py = vp.ty + Math.sin(ang) * dist;

          // Motion trail behind swirling particle
          const prevRem = Math.min(1, rem + 0.045);
          const prevDist = vp.startDist * prevRem * prevRem;
          const prevAng = vp.baseAngle + vp.swirlTurns * prevRem * prevRem * Math.PI;
          const ox = vp.tx + Math.cos(prevAng) * prevDist;
          const oy = vp.ty + Math.sin(prevAng) * prevDist;

          const a = clamp(raw * 3, 0, 1) * 0.85 * masterAlpha;
          ctx.strokeStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${(a * 0.55).toFixed(3)})`;
          ctx.lineWidth = vp.size * 0.9;
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(px, py);
          ctx.stroke();

          ctx.fillStyle = `rgba(255, 255, 255, ${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(px, py, vp.size * 0.7, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Lock-in flash right on the contour!
          const fade = 1 - (raw - 1) / 0.28;
          const rad = vp.size * (2.2 + (1 - fade) * 2.5);
          ctx.fillStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${(fade * 0.7 * masterAlpha).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(vp.tx, vp.ty, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // 5. Render Strength-Weighted Glowing Contour Segments
    const glowMul = state.glowIntensity;
    const baseLw = state.lineWidth;
    const segs = state.segments;
    const activeTips = [];
    const isLightning = style === 'lightning';
    const isAurora = style === 'aurora';
    const isPhoenix = style === 'phoenix';

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (t < seg.startTime) continue;

      const rawP = (t - seg.startTime) / seg.duration;
      const p = rawP >= 1 ? 1 : easeInOut(rawP);
      if (p <= 0.002) continue;

      // In Impact modes (Rocket/Meteor/Supernova), contours materialize cleanly by opacity as shards snap in (no drawing!)
      const segAlphaMul = isImpactMode ? easeSine(clamp(rawP, 0, 1)) : 1;
      const drawP = isImpactMode ? 1 : p;

      let col = getSegmentColor(seg);
      // Aurora mode: gentle iridescent palette wave flowing vertically
      if (isAurora && state.paletteKey !== 'original') {
        const shiftedGrad = (seg.grad + t * 0.065) % 1;
        col = samplePalette(shiftedGrad, state.paletteKey);
      }
      const w = seg.weight;

      // Shimmer wave boost
      let boost = 0;
      if (shimmerPos >= -0.2 && shimmerPos <= 1.25) {
        const d = Math.abs(seg.diag - shimmerPos);
        if (d < 0.22) {
          boost = Math.cos((d / 0.22) * (Math.PI / 2));
          boost = boost * boost;
        }
      }

      // Completion Shockwave boost as ring sweeps across segment!
      if (shockRadius > 0) {
        const segDist = Math.hypot(seg.cx - cx, seg.cy - cy);
        const ringDelta = Math.abs(segDist - shockRadius);
        if (ringDelta < 58) {
          const ringBoost = Math.cos((ringDelta / 58) * (Math.PI / 2));
          boost = Math.max(boost, ringBoost * ringBoost * (1 - shockProg * 0.35) * 1.15);
        }
      }

      // Lightning electric surge flicker while active or pulsing
      let jitterAmp = 0;
      if (isLightning) {
        const surge = Math.pow(0.5 + 0.5 * Math.sin(t * 9.5 + seg.seed * 40), 6);
        boost = Math.max(boost, surge * 0.65);
        if (p < 1) jitterAmp = 1.65;
      }

      // Aurora gentle silk ripple offset
      const auroraDy = isAurora ? Math.sin(t * 1.8 + seg.nx * 5.0 + seg.ny * 2.5) * 1.8 : 0;

      const r = Math.min(255, Math.round(col[0] + boost * 82));
      const g = Math.min(255, Math.round(col[1] + boost * 82));
      const b = Math.min(255, Math.round(col[2] + boost * 82));

      const targetDist = drawP * seg.totalLen;
      ctx.beginPath();
      const x0 = seg.pts[0][0];
      const y0 = seg.pts[0][1] + auroraDy;
      ctx.moveTo(x0, y0);
      if (doBloom) {
        bctx.beginPath();
        bctx.moveTo(x0, y0);
      }

      let tipX = x0;
      let tipY = y0;

      if (drawP >= 1) {
        for (let k = 1; k < seg.pts.length; k++) {
          const px = seg.pts[k][0];
          const py = seg.pts[k][1] + auroraDy;
          ctx.lineTo(px, py);
          if (doBloom) bctx.lineTo(px, py);
        }
      } else {
        for (let k = 1; k < seg.pts.length; k++) {
          if (seg.cumDist[k] <= targetDist) {
            const jx = jitterAmp ? Math.sin(t * 48 + k * 7 + i) * jitterAmp : 0;
            const jy = jitterAmp ? Math.cos(t * 43 + k * 11 + i) * jitterAmp : 0;
            const px = seg.pts[k][0] + jx;
            const py = seg.pts[k][1] + auroraDy + jy;
            ctx.lineTo(px, py);
            if (doBloom) bctx.lineTo(px, py);
            tipX = px;
            tipY = py;
          } else {
            const prevD = seg.cumDist[k - 1];
            const segStep = Math.max(0.0001, seg.cumDist[k] - prevD);
            const f = (targetDist - prevD) / segStep;
            tipX = seg.pts[k - 1][0] + (seg.pts[k][0] - seg.pts[k - 1][0]) * f;
            tipY = seg.pts[k - 1][1] + (seg.pts[k][1] - seg.pts[k - 1][1]) * f + auroraDy;
            ctx.lineTo(tipX, tipY);
            if (doBloom) bctx.lineTo(tipX, tipY);
            break;
          }
        }
        activeTips.push({ x: tipX, y: tipY, r, g, b, w });
      }

      const lw = baseLw * (0.58 + 0.52 * w);

      // Soft Bloom Pass (offscreen)
      if (doBloom) {
        bctx.lineWidth = lw * (2.8 + boost * 1.5);
        bctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${(0.29 * w * glowMul * (1 + boost * 0.75) * masterAlpha * segAlphaMul).toFixed(3)})`;
        bctx.stroke();
      }

      // Mid Neon Halo
      if (glowMul > 0.1) {
        ctx.lineWidth = lw * (2.0 + boost * 0.8);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${(0.28 * w * glowMul * (1 + boost * 0.8) * masterAlpha * segAlphaMul).toFixed(3)})`;
        ctx.stroke();
      }

      // Razor-Crisp Starlight Core
      const coreR = Math.min(255, r + 68);
      const coreG = Math.min(255, g + 68);
      const coreB = Math.min(255, b + 68);
      ctx.lineWidth = lw * (0.88 + boost * 0.34);
      ctx.strokeStyle = `rgba(${coreR}, ${coreG}, ${coreB}, ${(clamp(0.45 + 0.52 * w + boost * 0.16, 0, 1) * masterAlpha * segAlphaMul).toFixed(3)})`;
      ctx.stroke();
    }

      // Fast composite cinema optical bloom onto stage (hardware bilinear upscale without slow CSS blur filter!)
      if (doBloom) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = clamp(0.46 * glowMul, 0, 0.92);
        ctx.drawImage(bloomCanvas, 0, 0, LOGICAL_W, LOGICAL_H);
        ctx.globalAlpha = clamp(0.24 * glowMul, 0, 0.65);
        ctx.drawImage(bloomCanvas, -2, -2, LOGICAL_W + 4, LOGICAL_H + 4);
        ctx.restore();
      }

    // 5.5 Radiant Completion Shockwave Ring Visual
    if (shockRadius > 0) {
      const ringAlpha = Math.sin(shockProg * Math.PI) * 0.42 * masterAlpha;
      const ringGrad = ctx.createRadialGradient(cx, cy, Math.max(1, shockRadius - 26), cx, cy, shockRadius + 16);
      ringGrad.addColorStop(0, 'rgba(0,0,0,0)');
      ringGrad.addColorStop(0.55, `rgba(${midCol[0]}, ${midCol[1]}, ${midCol[2]}, ${(ringAlpha * 0.8).toFixed(3)})`);
      ringGrad.addColorStop(0.75, `rgba(255, 255, 255, ${ringAlpha.toFixed(3)})`);
      ringGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ringGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, shockRadius + 16, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Active Tracing Comet Heads + Emitted Live Sparks
    for (let i = 0; i < activeTips.length; i++) {
      const tip = activeTips[i];
      const rad = (5.4 + 2.6 * glowMul) * (0.7 + 0.4 * tip.w);
      const grad = ctx.createRadialGradient(tip.x, tip.y, 0.4, tip.x, tip.y, rad);
      grad.addColorStop(0, `rgba(255, 255, 255, ${(0.96 * masterAlpha).toFixed(3)})`);
      grad.addColorStop(0.4, `rgba(${tip.r}, ${tip.g}, ${tip.b}, ${(0.58 * masterAlpha).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, rad, 0, Math.PI * 2);
      ctx.fill();

      // Spawn tiny glowing ember sparks from moving tips
      if (state.showSparks && state.playing && state.liveSparks.length < 150 && Math.random() < (isPhoenix ? 0.35 : 0.16)) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 12 + Math.random() * 34;
        state.liveSparks.push({
          x: tip.x,
          y: tip.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - (isPhoenix ? 28 : 12),
          life: 0,
          maxLife: 0.45 + Math.random() * 0.55,
          size: 1.0 + Math.random() * 1.6,
          r: tip.r,
          g: tip.g,
          b: tip.b,
        });
      }
    }

    // Update & draw live emitted sparks
    if (state.showSparks && state.liveSparks.length > 0) {
      for (let i = state.liveSparks.length - 1; i >= 0; i--) {
        const sp = state.liveSparks[i];
        if (state.playing) {
          sp.life += 0.016 * state.speed;
          sp.x += sp.vx * 0.016;
          sp.y += sp.vy * 0.016;
          sp.vx *= 0.96;
          sp.vy *= 0.96;
        }
        if (sp.life >= sp.maxLife) {
          state.liveSparks.splice(i, 1);
          continue;
        }
        const a = (1 - sp.life / sp.maxLife) * 0.85 * masterAlpha;
        ctx.fillStyle = `rgba(255, 255, 255, ${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.size * (1 - sp.life / sp.maxLife * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 6.5 Continuous Living Energy Runners (luminous light beads gliding along main contours!)
    if (state.showSparks && t > 4.0) {
      const speedMul = isLightning ? 2.1 : 1.0;
      for (let i = 0; i < state.energyRunners.length; i++) {
        const er = state.energyRunners[i];
        const seg = er.seg;
        if (t < seg.startTime + seg.duration) continue;
        const fadeIn = easeOut((t - (seg.startTime + seg.duration)) / 0.8);
        const uRaw = ((t * er.speed * speedMul + er.phase) % 1 + 1) % 1;
        const u = er.dir > 0 ? uRaw : 1 - uRaw;
        const targetD = u * seg.totalLen;

        // Binary/linear locate point on segment
        let px = seg.pts[0][0], py = seg.pts[0][1];
        for (let k = 1; k < seg.pts.length; k++) {
          if (seg.cumDist[k] >= targetD) {
            const d0 = seg.cumDist[k - 1];
            const f = (targetD - d0) / Math.max(0.0001, seg.cumDist[k] - d0);
            px = seg.pts[k - 1][0] + (seg.pts[k][0] - seg.pts[k - 1][0]) * f;
            py = seg.pts[k - 1][1] + (seg.pts[k][1] - seg.pts[k - 1][1]) * f;
            break;
          }
        }

        const col = getSegmentColor(seg);
        const edgeFade = Math.sin(uRaw * Math.PI);
        const a = fadeIn * edgeFade * 0.9 * masterAlpha;
        if (a < 0.04) continue;

        const rad = er.size * (1.8 + glowMul * 0.8);
        const g = ctx.createRadialGradient(px, py, 0.2, px, py, rad);
        g.addColorStop(0, `rgba(255, 255, 255, ${a.toFixed(3)})`);
        g.addColorStop(0.45, `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${(a * 0.55).toFixed(3)})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 6.8 Rising Phoenix Embers (full intensity in 'phoenix', subtle fireflies in other styles)
    if (state.showSparks && (isPhoenix || t > 7.5)) {
      const emberLimit = isPhoenix ? state.phoenixEmbers.length : Math.min(28, state.phoenixEmbers.length);
      for (let i = 0; i < emberLimit; i++) {
        const em = state.phoenixEmbers[i];
        if (t < em.appearTime) continue;
        const localT = ((t - em.appearTime + em.phase) % em.cycle) / em.cycle;
        const ex = em.ox + Math.sin(localT * Math.PI * 2 * em.swayFreq + em.phase) * em.swayAmp;
        const ey = em.oy - localT * em.rise;
        const a = Math.sin(localT * Math.PI) * (isPhoenix ? 0.88 : 0.45) * masterAlpha;
        if (a < 0.03) continue;

        const col = isPhoenix ? [255, 195, 110] : getSegmentColor(em.seg);
        const rad = em.size * (1.6 + (1 - localT) * 1.1);
        const g = ctx.createRadialGradient(ex, ey, 0.2, ex, ey, rad);
        g.addColorStop(0, `rgba(255, 255, 255, ${a.toFixed(3)})`);
        g.addColorStop(0.5, `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${(a * 0.65).toFixed(3)})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(ex, ey, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 7. 4-Pointed Starlight Twinkles (✦)
    for (let i = 0; i < state.twinkles.length; i++) {
      const tw = state.twinkles[i];
      if (t < tw.appearTime) continue;

      const fadeIn = easeOut((t - tw.appearTime) / 0.85);
      const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * tw.freq + tw.phase));
      const alpha = fadeIn * pulse * masterAlpha;
      if (alpha < 0.03) continue;

      const col = getSegmentColor(tw.seg);
      drawFourPointStar(ctx, tw.x, tw.y, tw.size * (0.7 + 0.45 * pulse), col, alpha);
    }

    ctx.restore(); // end lighter blend
    ctx.restore(); // end cinema camera zoom transform

    // 8. Word-by-word Poetic Quote at Bottom
    const quote = state.quote.trim();
    if (quote && t >= TIMELINE.TEXT_START) {
      drawPoeticQuote(ctx, quote, t, masterAlpha);
    }
  }

  // ===== Programmer Matrix 0/1 Rain -> Binary Portrait =====
  function renderBinaryMatrixFrame(c, t, masterAlpha) {
    // 1. Pitch-black hacker terminal background
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = '#020406';
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    const bg = state.binaryGrid;
    const {
      cols, rows, cellW, cellH, offsetX, offsetY,
      lumArr, bitArr, colR, colG, colB, colDelay, colSpeed,
    } = bg;

    const palKey = state.paletteKey;
    const useOriginal = palKey === 'original';
    const useMatrixGreen = palKey === 'aurora';
    const tickStep = Math.floor(t * 14); // live digital flicker cadence

    // Shimmer scanner wave after rain settles (10.8s+)
    let scanRow = -999;
    if (state.showShimmer && t >= 10.6) {
      const cycle = ((t - 10.6) % 5.2) / 2.6;
      if (cycle <= 1.15) scanRow = cycle * (rows + 10) - 5;
    }

    c.save();
    c.font = 'bold 10.5px "Cascadia Code", "Fira Code", Consolas, "Courier New", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';

    const glowMul = clamp(state.glowIntensity, 0.4, 1.8);

    // 2. Render Falling 0/1 Rain Columns + Locked-in Binary Portrait!
    for (let col = 0; col < cols; col++) {
      const localT = t - colDelay[col];
      if (localT < 0) continue;

      // Falling rain head position (row index)
      const headRow = localT * colSpeed[col] - 2;
      const x = offsetX + (col + 0.5) * cellW;
      const nx = col / Math.max(1, cols - 1);

      for (let row = 0; row < rows; row++) {
        const distBehind = headRow - row;
        if (distBehind < 0) continue; // rain hasn't reached this row yet!

        const gi = row * cols + col;
        const lum = lumArr[gi];
        const y = offsetY + (row + 0.5) * cellH;
        const ny = row / Math.max(1, rows - 1);

        // Is this cell part of the blazing falling rain head / trail?
        const inRainHead = distBehind < 1.2;
        const inRainTrail = distBehind >= 1.2 && distBehind < 11;

        // If cell is dark background (lum < 0.06), only show transient falling rain tail, then vanish!
        if (lum < 0.06 && !inRainHead && !inRainTrail) continue;

        // Choose '0' or '1': flickers rapidly inside falling head, locks into portrait bit behind it!
        let bit = bitArr[gi];
        if (inRainHead || inRainTrail) {
          bit = ((tickStep + col * 13 + row * 7) & 1);
        } else if (state.showSparks && ((tickStep + gi * 31) % 317) === 0) {
          // Occasional living hacker bit-flip
          bit = bit ^ 1;
        }
        const ch = bit ? '1' : '0';

        // Scanner beam boost
        let scanBoost = 0;
        const scanDist = Math.abs(row - scanRow);
        if (scanDist < 5.5) {
          scanBoost = Math.cos((scanDist / 5.5) * (Math.PI / 2));
          scanBoost = scanBoost * scanBoost;
        }

        if (inRainHead) {
          // Blazing pure white-mint Matrix raindrop head (no per-character shadowBlur so 60fps never lags!)
          const headA = clamp(0.96 * masterAlpha, 0, 1);
          c.fillStyle = useMatrixGreen
            ? `rgba(110, 255, 175, ${(headA * 0.38).toFixed(3)})`
            : `rgba(145, 220, 255, ${(headA * 0.38).toFixed(3)})`;
          c.fillRect(x - cellW * 0.45, y - cellH * 0.45, cellW * 0.9, cellH * 0.9);
          c.fillStyle = `rgba(245, 255, 250, ${headA.toFixed(3)})`;
          c.fillText(ch, x, y);
          continue;
        }

        // Compute locked portrait brightness + fading rain trail contribution
        const trailFade = inRainTrail ? (1 - distBehind / 11) * 0.58 : 0;
        const portraitAlpha = lum >= 0.06 ? clamp(0.14 + lum * 0.86, 0, 1) : 0;
        const finalA = clamp((Math.max(portraitAlpha, trailFade) + scanBoost * 0.45) * masterAlpha, 0, 1);
        if (finalA < 0.04) continue;

        let r, g, b;
        if (useOriginal) {
          r = colR[gi]; g = colG[gi]; b = colB[gi];
        } else if (useMatrixGreen) {
          // Classic Matrix terminal green -> glowing white-green highlights
          r = Math.round(40 + lum * 175);
          g = Math.round(185 + lum * 70);
          b = Math.round(95 + lum * 120);
        } else {
          const grad = clamp(0.55 * ny + 0.45 * Math.abs(nx - 0.5) * 1.7, 0, 1);
          const pCol = samplePalette(grad, palKey);
          r = pCol[0]; g = pCol[1]; b = pCol[2];
        }

        if (scanBoost > 0.1 || trailFade > 0.25) {
          const lift = Math.max(scanBoost * 90, trailFade * 70);
          r = Math.min(255, Math.round(r + lift));
          g = Math.min(255, Math.round(g + lift));
          b = Math.min(255, Math.round(b + lift));
        }

        c.fillStyle = `rgba(${r}, ${g}, ${b}, ${finalA.toFixed(3)})`;
        c.fillText(ch, x, y);
      }
    }

    // 3. Subtle terminal-style typewriter quote at bottom (`> quote_`)
    const quote = state.quote.trim();
    if (quote && t >= TIMELINE.TEXT_START - 2.0) {
      const qTime = t - (TIMELINE.TEXT_START - 2.0);
      const visibleChars = Math.min(quote.length, Math.floor(qTime * 16));
      const cursorOn = Math.floor(t * 2.4) % 2 === 0;
      const line = `> ${quote.slice(0, visibleChars)}${cursorOn ? '_' : ' '}`;
      c.font = '500 16px "Cascadia Code", Consolas, "Courier New", monospace';
      c.shadowColor = useMatrixGreen ? 'rgba(80, 255, 160, 0.65)' : 'rgba(150, 205, 255, 0.65)';
      c.shadowBlur = 10;
      c.fillStyle = useMatrixGreen
        ? `rgba(185, 255, 215, ${(0.9 * masterAlpha).toFixed(3)})`
        : `rgba(225, 240, 255, ${(0.9 * masterAlpha).toFixed(3)})`;
      c.fillText(line, LOGICAL_W / 2, LOGICAL_H - 52);
      c.shadowBlur = 0;
    }

    c.restore();
  }

  // ===== True 3D Volumetric Particle Bloom + 360° Hologram Rotation =====
  function render3DHologramFrame(c, t, masterAlpha) {
    // 1. Pure obsidian studio black background
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = '#020206';
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    const { x: drawX, y: drawY, w: drawW, h: drawH } = state.artBounds;
    const cx = drawX + drawW / 2;
    const cy = drawY + drawH / 2;

    // Subtle cosmic backlight behind 3D sculpture
    const bgGlow = c.createRadialGradient(cx, cy, 12, cx, cy, Math.max(drawW, drawH) * 0.62);
    bgGlow.addColorStop(0, `rgba(140, 175, 255, ${(0.065 * masterAlpha).toFixed(3)})`);
    bgGlow.addColorStop(1, 'rgba(2, 2, 6, 0)');
    c.fillStyle = bgGlow;
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // 2. Smooth 3D Camera Angles:
    // 0..8.6s: gentle breathing front view while blooming organically from bottom to top
    // 8.6..24s: full cinematic 3D orbit revealing left side, right side, depth, and back!
    let autoYaw = Math.sin(t * 0.55) * 0.10;
    let autoPitch = Math.cos(t * 0.4) * 0.05;

    if (t > 8.6) {
      const spinT = t - 8.6;
      const ramp = easeInOut(clamp(spinT / 2.2, 0, 1));
      // Smooth continuous 360° turntable + graceful pitch wave so all sides & depth shine!
      autoYaw = 0.10 * (1 - ramp) + (spinT * 0.48) * ramp;
      autoPitch = Math.sin(spinT * 0.62) * 0.28 * ramp;
    }

    const yaw = autoYaw + state.orbit3D.userYaw;
    const pitch = clamp(autoPitch + state.orbit3D.userPitch, -1.15, 1.15);

    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const cosX = Math.cos(pitch), sinX = Math.sin(pitch);
    const focal = 780;
    const camZoom = state.cinemaZoom ? (1.0 + 0.04 * easeSine(clamp(t / TIMELINE.FADE_START, 0, 1))) : 1.0;

    // 3. Draw Holographic 3D Base Grid / Orbital Ring underneath when in 3D spin phase!
    const spinFade = t > 8.2 ? easeOut(clamp((t - 8.2) / 1.8, 0, 1)) : 0;
    if (spinFade > 0.02) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const ringY = drawH * 0.52;
      const ringR = drawW * 0.44;
      c.strokeStyle = `rgba(145, 205, 255, ${(0.22 * spinFade * masterAlpha).toFixed(3)})`;
      c.lineWidth = 1.4;
      c.beginPath();
      for (let a = 0; a <= 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        const rx = Math.cos(ang) * ringR;
        const rz = Math.sin(ang) * ringR;
        const ry = ringY;
        const x1 = rx * cosY - rz * sinY;
        const z1 = rx * sinY + rz * cosY;
        const y2 = ry * cosX - z1 * sinX;
        const z2 = ry * sinX + z1 * cosX;
        const persp = (focal / (focal - z2)) * camZoom;
        const sx = cx + x1 * persp;
        const sy = cy + y2 * persp;
        if (a === 0) c.moveTo(sx, sy);
        else c.lineTo(sx, sy);
      }
      c.stroke();
      c.restore();
    }

    // 4. Project & Render 14,000+ True 3D Volumetric Particles!
    const cl = state.cloud3D;
    const { count, lx, ly, lz, ox, oy, oz, tStart, dur, size, colR, colG, colB, bokeh } = cl;
    const glowMul = clamp(state.glowIntensity, 0.5, 1.8);

    c.save();
    c.globalCompositeOperation = 'lighter';

    for (let i = 0; i < count; i++) {
      const age = t - tStart[i];
      if (age < 0) continue;

      const raw = age / dur[i];
      let px3, py3, pz3, alpha;

      if (raw < 1) {
        const p = easeOut(raw);
        const rem = 1 - p;
        const rem2 = rem * rem;
        px3 = lx[i] + ox[i] * rem2 + Math.sin(t * 2.0 + i * 0.13) * 8 * rem2;
        py3 = ly[i] + oy[i] * rem2 + Math.cos(t * 1.7 + i * 0.17) * 6 * rem2;
        pz3 = lz[i] + oz[i] * rem2;
        alpha = clamp(raw * 3.0, 0, 1) * (0.35 + 0.58 * p);
      } else {
        px3 = lx[i];
        py3 = ly[i];
        pz3 = lz[i];
        alpha = 0.88;
      }

      // 3D Rotation around Y (yaw) then X (pitch)
      const x1 = px3 * cosY - pz3 * sinY;
      const z1 = px3 * sinY + pz3 * cosY;
      const y2 = py3 * cosX - z1 * sinX;
      const z2 = py3 * sinX + z1 * cosX;

      if (z2 > focal - 60) continue;
      const persp = (focal / (focal - z2)) * camZoom;
      const sx = cx + x1 * persp;
      const sy = cy + y2 * persp;

      // Depth-based atmospheric lighting: closer points are brighter & crisp, back points softer!
      const depthCue = clamp(0.42 + (z2 + 160) / 300, 0.25, 1.15);
      const finalA = clamp(alpha * depthCue * 0.82 * Math.min(1.2, glowMul * 0.85) * masterAlpha, 0, 1);
      if (finalA < 0.025) continue;

      const sz = size[i] * persp * (raw < 1 ? (0.85 + (1 - raw) * 0.8) : 1.0);
      c.fillStyle = `rgba(${colR[i]}, ${colG[i]}, ${colB[i]}, ${finalA.toFixed(3)})`;
      c.fillRect(sx - sz * 0.5, sy - sz * 0.5, sz, sz);
    }

    // 5. Floating 3D Golden Bokeh & Stardust orbiting around the 3D sculpture (Camellia style!)
    if (state.showSparks) {
      for (let i = 0; i < bokeh.length; i++) {
        const b = bokeh[i];
        const bAng = t * b.speed * 0.35;
        const bx0 = b.x * Math.cos(bAng) - b.z * Math.sin(bAng);
        const bz0 = b.x * Math.sin(bAng) + b.z * Math.cos(bAng);
        const by0 = b.y + Math.sin(t * b.speed + b.phase) * 14;

        const x1 = bx0 * cosY - bz0 * sinY;
        const z1 = bx0 * sinY + bz0 * cosY;
        const y2 = by0 * cosX - z1 * sinX;
        const z2 = by0 * sinX + z1 * cosX;
        if (z2 > focal - 80) continue;

        const persp = (focal / (focal - z2)) * camZoom;
        const sx = cx + x1 * persp;
        const sy = cy + y2 * persp;
        const pulse = 0.45 + 0.55 * Math.sin(t * 2.1 + b.phase);
        const a = pulse * 0.65 * masterAlpha;
        const r = b.r * persp;

        const g = c.createRadialGradient(sx, sy, 0.2, sx, sy, r * 2.1);
        if (b.warm) {
          g.addColorStop(0, `rgba(255, 250, 225, ${a.toFixed(3)})`);
          g.addColorStop(0.5, `rgba(255, 212, 130, ${(a * 0.55).toFixed(3)})`);
        } else {
          g.addColorStop(0, `rgba(245, 252, 255, ${a.toFixed(3)})`);
          g.addColorStop(0.5, `rgba(140, 210, 255, ${(a * 0.5).toFixed(3)})`);
        }
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(sx, sy, r * 2.1, 0, Math.PI * 2);
        c.fill();
      }
    }

    c.restore();

    // 6. Minimalist Poetic Quote at Bottom
    const quote = state.quote.trim();
    if (quote && t >= TIMELINE.TEXT_START - 2.0) {
      drawPoeticQuote(c, quote, t + 2.0, masterAlpha);
    }
  }

  // ===== Top-Down Particle Gather -> X-Ray -> Vibrant Neon Positive =====
  function renderTopDownGatherFrame(c, t, masterAlpha) {
    // 1. Deep obsidian black background
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = '#030308';
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    const { x: drawX, y: drawY, w: drawW, h: drawH } = state.artBounds;
    const cx = drawX + drawW / 2;
    const cy = drawY + drawH * 0.45;
    const palKey = state.paletteKey === 'original' || state.paletteKey === 'silver' ? 'cosmic' : state.paletteKey;
    const midCol = samplePalette(0.45, palKey);

    c.save();
    if (state.cinemaZoom) {
      const zp = easeSine(clamp(t / TIMELINE.FADE_START, 0, 1));
      const scale = 1.0 + 0.036 * zp;
      const fy = Math.sin(t * 0.55) * 2.2;
      c.translate(cx, cy + fy);
      c.scale(scale, scale);
      c.translate(-cx, -cy);
    }

    // Subtle atmospheric glow behind artwork
    const aura = c.createRadialGradient(cx, cy, 10, cx, cy, Math.max(drawW, drawH) * 0.68);
    aura.addColorStop(0, `rgba(${midCol[0]}, ${midCol[1]}, ${midCol[2]}, ${(0.065 * masterAlpha).toFixed(3)})`);
    aura.addColorStop(1, 'rgba(3, 3, 8, 0)');
    c.fillStyle = aura;
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // Top-down gathering frontier (0.15s .. 9.6s): starts at top crown (drawY), cascades smoothly down to drawY + drawH!
    const gatherP = easeInOut(clamp((t - 0.15) / 9.4, 0, 1));
    // Curved crown-first expansion radius anchored near top-center (just like Image 3 -> Image 2!)
    const anchorY = drawY + drawH * 0.16;
    const maxGatherR = Math.hypot(drawW * 0.62, drawH * 0.92);
    const gatherR = gatherP * maxGatherR * 1.12;

    // Color transformation sweep (10.2s .. 13.8s): flips gathered ice-white X-Ray -> vibrant Gold/Cyan/Blue Positive!
    const flipP = t >= 10.2 ? easeInOut(clamp((t - 10.2) / 3.5, 0, 1)) : 0;
    const flipY = drawY - 24 + flipP * (drawH + 48);

    // 2. Draw crystallized X-Ray Negative behind the top-down particle frontier
    if (gatherR > 4 && flipP < 1) {
      c.save();
      c.beginPath();
      c.arc(cx, anchorY, gatherR, 0, Math.PI * 2);
      c.clip();
      if (flipP > 0) {
        c.beginPath();
        c.rect(drawX - 40, flipY, drawW + 80, LOGICAL_H - flipY + 80);
        c.clip();
      }
      c.globalAlpha = masterAlpha;
      c.drawImage(state.velnoxNegCanvas, drawX, drawY, drawW, drawH);
      if (state.useBloom && state.glowIntensity > 0.2) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.28 * state.glowIntensity * masterAlpha;
        c.drawImage(state.velnoxNegCanvas, drawX - 1.5, drawY - 1.5, drawW + 3, drawH + 3);
      }
      c.restore();
    }

    // 3. Draw Vibrant Positive Cel-Shaded Artwork above the color-flip wave
    if (flipP > 0) {
      c.save();
      c.beginPath();
      c.rect(drawX - 40, drawY - 40, drawW + 80, flipY - (drawY - 40));
      c.clip();
      c.globalAlpha = masterAlpha;
      c.drawImage(state.velnoxPosCanvas, drawX, drawY, drawW, drawH);
      if (state.useBloom && state.glowIntensity > 0.2) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.26 * state.glowIntensity * masterAlpha;
        c.drawImage(state.velnoxPosCanvas, drawX - 1.5, drawY - 1.5, drawW + 3, drawH + 3);
      }
      c.restore();
    }

    // 4. Streaming Luminous Particles gathering from TOP down into the expanding frontier!
    const bd = state.bloomData;
    if (bd && t < 11.2) {
      const { count, tx, ty, ox, oy, size, isStreak } = bd;
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.lineCap = 'round';

      // Sample every 2nd particle (~8,200 crisp luminous ice-white/cyan particles at 60fps!)
      for (let i = 0; i < count; i += 2) {
        const pxT = tx[i];
        const pyT = ty[i];
        const distFromTop = Math.hypot(pxT - cx, pyT - anchorY);
        const normDist = clamp(distFromTop / maxGatherR, 0, 1);

        // Particle starts gathering slightly BEFORE the frontier reaches it, and locks in right as frontier passes!
        const pArrive = 0.45 + normDist * 8.9;
        const pDur = 1.65 + (i % 7) * 0.16;
        const pStart = pArrive - pDur;
        if (t < pStart || t > pArrive + 0.35) continue;

        if (t <= pArrive) {
          const raw = (t - pStart) / pDur;
          const p = easeOut(raw);
          const rem = 1 - p;
          const rem2 = rem * rem;

          // Rain & swirl down from above/sides into exact pixel
          const startX = pxT + ox[i] * 1.15;
          const startY = pyT - Math.abs(oy[i]) * 1.25 - 35;
          const sx = Math.sin(t * 2.4 + i * 0.19) * 12 * rem2;
          const px = pxT + (startX - pxT) * rem2 + sx;
          const py = pyT + (startY - pyT) * rem2;

          const a = clamp(raw * 3.0, 0, 1) * (0.35 + 0.6 * p) * masterAlpha;
          if (a < 0.02) continue;

          if (isStreak[i] && rem > 0.1) {
            const tailX = px + (startX - pxT) * rem * 0.18;
            const tailY = py + (startY - pyT) * rem * 0.18;
            c.strokeStyle = `rgba(175, 228, 255, ${(a * 0.55).toFixed(3)})`;
            c.lineWidth = size[i] * 0.85;
            c.beginPath();
            c.moveTo(tailX, tailY);
            c.lineTo(px, py);
            c.stroke();
          }

          c.fillStyle = `rgba(235, 248, 255, ${a.toFixed(3)})`;
          const sz = size[i] * (0.8 + rem * 0.9);
          c.fillRect(px - sz * 0.5, py - sz * 0.5, sz, sz);
        } else {
          // Crisp lock-in sparkle right on the frontier!
          const fade = 1 - (t - pArrive) / 0.35;
          c.fillStyle = `rgba(255, 255, 255, ${(fade * 0.72 * masterAlpha).toFixed(3)})`;
          c.fillRect(pxT - 1, pyT - 1, 2.2, 2.2);
        }
      }
      c.restore();
    }

    // Glowing Color-Flip Laser Wave (Stage 2)
    if (flipP > 0.01 && flipP < 0.99) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const waveA = Math.sin(flipP * Math.PI) * masterAlpha;
      const wg = c.createLinearGradient(0, flipY - 24, 0, flipY + 24);
      wg.addColorStop(0, 'rgba(0,0,0,0)');
      wg.addColorStop(0.35, `rgba(${midCol[0]}, ${midCol[1]}, ${midCol[2]}, ${(waveA * 0.65).toFixed(3)})`);
      wg.addColorStop(0.5, `rgba(255, 255, 255, ${(waveA * 0.95).toFixed(3)})`);
      wg.addColorStop(0.65, `rgba(110, 215, 255, ${(waveA * 0.65).toFixed(3)})`);
      wg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = wg;
      c.fillRect(drawX - 24, flipY - 24, drawW + 48, 48);
      c.restore();
    }

    // Subtle 4-point starlight twinkles inside revealed region
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < state.twinkles.length; i++) {
      const tw = state.twinkles[i];
      if (Math.hypot(tw.x - cx, tw.y - anchorY) > gatherR - 6) continue;
      const pulse = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * tw.freq + tw.phase));
      const a = pulse * 0.75 * masterAlpha;
      if (a < 0.04) continue;
      const col = tw.y < flipY ? getSegmentColor(tw.seg) : [210, 240, 255];
      drawFourPointStar(c, tw.x, tw.y, tw.size * (0.65 + 0.4 * pulse), col, a);
    }
    c.restore();

    c.restore(); // end cinema zoom

    // Minimalist Poetic Quote
    const quote = state.quote.trim();
    if (quote && t >= TIMELINE.TEXT_START) {
      drawPoeticQuote(c, quote, t, masterAlpha);
    }
  }

  // ===== Velnox X-Ray Portal -> Positive Neon Flip (velnox.py style!) =====
  function renderVelnoxFrame(c, t, masterAlpha) {
    // 1. Pure deep midnight black background
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = '#04040a';
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    const { x: drawX, y: drawY, w: drawW, h: drawH } = state.artBounds;
    const cx = drawX + drawW / 2;
    const cy = drawY + drawH * 0.44;
    const maxR = Math.hypot(drawW * 0.65, drawH * 0.72);
    const palKey = state.paletteKey === 'original' || state.paletteKey === 'silver' ? 'cosmic' : state.paletteKey;
    const midCol = samplePalette(0.45, palKey);

    // Subtle cinema camera push-in
    c.save();
    if (state.cinemaZoom) {
      const zp = easeSine(clamp(t / TIMELINE.FADE_START, 0, 1));
      const scale = 1.0 + 0.038 * zp;
      const fy = Math.sin(t * 0.6) * 2.4;
      c.translate(cx, cy + fy);
      c.scale(scale, scale);
      c.translate(-cx, -cy);
    }

    // Ambient subtle glow behind portrait
    const aura = c.createRadialGradient(cx, cy, 10, cx, cy, maxR * 0.95);
    aura.addColorStop(0, `rgba(${midCol[0]}, ${midCol[1]}, ${midCol[2]}, ${(0.075 * masterAlpha).toFixed(3)})`);
    aura.addColorStop(1, 'rgba(4, 4, 10, 0)');
    c.fillStyle = aura;
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // STAGE 1 & 2 (0.0s .. 7.8s): Expanding Glowing Circular Portal reveals Electric Ice-White X-Ray Negative!
    const portalStart = 0.25;
    const portalDur = 7.4;
    const portalP = easeInOut(clamp((t - portalStart) / portalDur, 0, 1));
    const portalR = portalP * maxR * 1.15;

    // STAGE 4 (9.0s .. 12.6s): Top-to-Bottom Neon Inversion Wave flips X-Ray Negative -> Vibrant Positive!
    const flipStart = 9.0;
    const flipDur = 3.4;
    const flipP = t >= flipStart ? easeInOut(clamp((t - flipStart) / flipDur, 0, 1)) : 0;
    const flipY = drawY - 24 + flipP * (drawH + 48);

    // Draw X-Ray Negative (clipped inside expanding portal, and ONLY below the flip wave!)
    if (portalR > 2 && flipP < 1) {
      c.save();
      c.beginPath();
      c.arc(cx, cy, portalR, 0, Math.PI * 2);
      c.clip();
      if (flipP > 0) {
        c.beginPath();
        c.rect(drawX - 40, flipY, drawW + 80, LOGICAL_H - flipY + 80);
        c.clip();
      }
      c.globalAlpha = masterAlpha;
      c.drawImage(state.velnoxNegCanvas, drawX, drawY, drawW, drawH);

      // Soft icy glow pass over X-Ray negative (no slow CSS filter)
      if (state.useBloom && state.glowIntensity > 0.2) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.30 * state.glowIntensity * masterAlpha;
        c.drawImage(state.velnoxNegCanvas, drawX - 1.5, drawY - 1.5, drawW + 3, drawH + 3);
      }
      c.restore();
    }

    // Draw Vibrant Positive Neon Cel-Shaded Artwork (revealed above the sweeping flip wave!)
    if (flipP > 0) {
      c.save();
      c.beginPath();
      c.rect(drawX - 40, drawY - 40, drawW + 80, (flipY - (drawY - 40)));
      c.clip();

      c.globalAlpha = masterAlpha;
      c.drawImage(state.velnoxPosCanvas, drawX, drawY, drawW, drawH);

      // Subtle cinema neon bloom over positive artwork (no slow CSS filter)
      if (state.useBloom && state.glowIntensity > 0.2) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.28 * state.glowIntensity * masterAlpha;
        c.drawImage(state.velnoxPosCanvas, drawX - 1.5, drawY - 1.5, drawW + 3, drawH + 3);
      }
      c.restore();
    }

    // Glowing Portal Ring Rim (Stage 1 & 2 — iconic Image 2 glowing circle!)
    if (t >= 0.05 && portalP < 0.995) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const ringAlpha = Math.sin(Math.min(1, portalP * 1.15) * Math.PI) * 0.95 * masterAlpha;
      const rNow = Math.max(8, portalR);

      // Outer misty ring halo
      const rg = c.createRadialGradient(cx, cy, Math.max(1, rNow - 18), cx, cy, rNow + 22);
      rg.addColorStop(0, 'rgba(0,0,0,0)');
      rg.addColorStop(0.45, `rgba(145, 220, 255, ${(ringAlpha * 0.55).toFixed(3)})`);
      rg.addColorStop(0.62, `rgba(255, 255, 255, ${(ringAlpha * 0.85).toFixed(3)})`);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg;
      c.beginPath();
      c.arc(cx, cy, rNow + 22, 0, Math.PI * 2);
      c.fill();

      // Crisp orbital energy arc on the portal perimeter
      c.strokeStyle = `rgba(235, 248, 255, ${(ringAlpha * 0.9).toFixed(3)})`;
      c.lineWidth = 2.2;
      c.beginPath();
      c.arc(cx, cy, rNow, t * 2.5, t * 2.5 + Math.PI * 1.35);
      c.stroke();
      c.restore();
    }

    // Glowing Laser Transformation Wave during Negative -> Positive Flip (Stage 4!)
    if (flipP > 0.01 && flipP < 0.99) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const waveA = Math.sin(flipP * Math.PI) * masterAlpha;
      const wg = c.createLinearGradient(0, flipY - 26, 0, flipY + 26);
      wg.addColorStop(0, 'rgba(0,0,0,0)');
      wg.addColorStop(0.35, `rgba(${midCol[0]}, ${midCol[1]}, ${midCol[2]}, ${(waveA * 0.65).toFixed(3)})`);
      wg.addColorStop(0.5, `rgba(255, 255, 255, ${(waveA * 0.95).toFixed(3)})`);
      wg.addColorStop(0.65, `rgba(110, 215, 255, ${(waveA * 0.6).toFixed(3)})`);
      wg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = wg;
      c.fillRect(drawX - 24, flipY - 26, drawW + 48, 52);
      c.restore();
    }

    // Subtle 4-point twinkling stars along contours + ambient stardust
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < state.twinkles.length; i++) {
      const tw = state.twinkles[i];
      const distFromC = Math.hypot(tw.x - cx, tw.y - cy);
      if (distFromC > portalR - 8) continue;
      const pulse = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * tw.freq + tw.phase));
      const a = pulse * 0.78 * masterAlpha;
      if (a < 0.04) continue;
      const col = tw.y < flipY ? getSegmentColor(tw.seg) : [210, 240, 255];
      drawFourPointStar(c, tw.x, tw.y, tw.size * (0.65 + 0.4 * pulse), col, a);
    }
    c.restore();

    c.restore(); // end cinema zoom

    // Minimalist Poetic Quote at Bottom
    const quote = state.quote.trim();
    if (quote && t >= TIMELINE.TEXT_START) {
      drawPoeticQuote(c, quote, t, masterAlpha);
    }
  }

  // ===== Full-Color Organic Particle Bloom Grow (codeb1oom.py style!) =====
  function renderBloomGrowFrame(c, t, masterAlpha) {
    // 1. Pure obsidian studio black background
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = '#020205';
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    const { x: drawX, y: drawY, w: drawW, h: drawH } = state.artBounds;
    const cx = drawX + drawW / 2;
    const cy = drawY + drawH / 2;

    // Subtle cinema breathing camera zoom
    c.save();
    if (state.cinemaZoom) {
      const zp = easeSine(clamp(t / TIMELINE.FADE_START, 0, 1));
      const scale = 1.0 + 0.036 * zp;
      const fy = Math.sin(t * 0.55) * 2.5;
      c.translate(cx, cy + fy);
      c.scale(scale, scale);
      c.translate(-cx, -cy);
    }

    // 2. Soft feathered bottom-to-top photorealistic crystallization underneath the mist!
    const sharp = state.bloomSharpCanvas;
    const rev = state.bloomRevealCanvas;
    const rctx = rev.getContext('2d');
    const pw = sharp.width;
    const ph = sharp.height;

    // Crystallization frontier rises smoothly behind the misty growing particles (1.6s .. 12.2s)
    const revealProg = clamp((t - 1.35) / 10.6, 0, 1.25);
    if (revealProg > 0) {
      rctx.globalCompositeOperation = 'source-over';
      rctx.clearRect(0, 0, pw, ph);
      rctx.drawImage(sharp, 0, 0);

      // Soft feathered gradient mask from bottom (100% sharp) -> misty frontier (0%)
      rctx.globalCompositeOperation = 'destination-in';
      const cutY = ph * (1 - clamp(revealProg, 0, 1.15));
      const feather = ph * 0.24;
      const grad = rctx.createLinearGradient(0, cutY - feather, 0, cutY + feather * 0.85);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,1)');
      rctx.fillStyle = grad;
      rctx.fillRect(0, 0, pw, ph);

      c.save();
      c.globalAlpha = masterAlpha;
      c.drawImage(rev, drawX, drawY, drawW, drawH);
      c.restore();
    }

    // 3. Render 16,500+ Organic Misty Full-Color Particles + Silky Hair Streaks
    const bd = state.bloomData;
    const {
      count, tx, ty, ox, oy, tStart, dur, hairDx, hairDy, size, colR, colG, colB, isStreak,
    } = bd;

    c.save();
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';

    const glowBoost = clamp(state.glowIntensity, 0.5, 1.8);

    for (let i = 0; i < count; i++) {
      const age = t - tStart[i];
      if (age < 0) continue;

      const d = dur[i];
      const raw = age / d;

      // Once fully crystallized into the sharp layer behind it, fade out most particles
      // while leaving a tiny dreamy shimmer of living stardust
      if (raw > 1.32) {
        if ((i & 15) !== 0) continue;
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + i * 0.7);
        const a = 0.14 * pulse * masterAlpha;
        if (a < 0.02) continue;
        const driftY = Math.sin(t * 0.8 + i) * 3.5;
        c.fillStyle = `rgba(${colR[i]}, ${colG[i]}, ${colB[i]}, ${a.toFixed(3)})`;
        c.fillRect(tx[i], ty[i] + driftY, size[i], size[i]);
        continue;
      }

      if (raw <= 1) {
        // Smooth organic easing from dreamy mist -> exact pixel
        const p = easeOut(raw);
        const rem = 1 - p;
        const rem2 = rem * rem;

        // Gentle organic turbulence swirl as mist gathers
        const swirlX = Math.sin(t * 1.9 + i * 0.13) * 10 * rem2;
        const swirlY = Math.cos(t * 1.6 + i * 0.17) * 8 * rem2;
        const px = tx[i] + ox[i] * rem2 + swirlX;
        const py = ty[i] + oy[i] * rem2 + swirlY;

        const fadeIn = clamp(raw * 3.2, 0, 1);
        const a = fadeIn * (0.28 + 0.58 * p) * Math.min(1, glowBoost * 0.82) * masterAlpha;
        if (a < 0.015) continue;

        if (isStreak[i] && rem > 0.08) {
          // Silky misty hair-streak (signature codeb1oom ethereal smoke-petal look!)
          const sx = px + hairDx[i] * rem * 1.15;
          const sy = py + hairDy[i] * rem * 1.15;
          c.strokeStyle = `rgba(${colR[i]}, ${colG[i]}, ${colB[i]}, ${(a * 0.52).toFixed(3)})`;
          c.lineWidth = size[i] * (0.7 + rem * 1.35);
          c.beginPath();
          c.moveTo(sx, sy);
          c.lineTo(px, py);
          c.stroke();
        } else {
          // Fine glowing color-true dust speck
          const sz = size[i] * (0.75 + rem * 1.1);
          c.fillStyle = `rgba(${colR[i]}, ${colG[i]}, ${colB[i]}, ${a.toFixed(3)})`;
          c.fillRect(px - sz * 0.5, py - sz * 0.5, sz, sz);
        }
      } else {
        // Soft settle blend into crisp photorealistic image (raw: 1.0 .. 1.32)
        const fadeOut = 1 - (raw - 1) / 0.32;
        const a = fadeOut * 0.42 * masterAlpha;
        const sz = size[i] * 0.9;
        c.fillStyle = `rgba(${colR[i]}, ${colG[i]}, ${colB[i]}, ${a.toFixed(3)})`;
        c.fillRect(tx[i] - sz * 0.5, ty[i] - sz * 0.5, sz, sz);
      }
    }

    // 4. Delicate ambient floating stardust around the blooming artwork
    if (state.showSparks) {
      for (let i = 0; i < state.ambientDust.length; i++) {
        const m = state.ambientDust[i];
        const mx = ((m.x + m.vx * t) % LOGICAL_W + LOGICAL_W) % LOGICAL_W;
        const my = ((m.y + m.vy * t) % LOGICAL_H + LOGICAL_H) % LOGICAL_H;
        const a = (0.08 + 0.14 * (0.5 + 0.5 * Math.sin(t * m.speed + m.phase))) * masterAlpha;
        c.fillStyle = `rgba(215, 230, 255, ${a.toFixed(3)})`;
        c.beginPath();
        c.arc(mx, my, m.r, 0, Math.PI * 2);
        c.fill();
      }
    }

    c.restore(); // end lighter
    c.restore(); // end cinema zoom

    // 5. Minimalist Poetic Quote at Bottom
    const quote = state.quote.trim();
    if (quote && t >= TIMELINE.TEXT_START - 2.0) {
      drawPoeticQuote(c, quote, t + 2.0, masterAlpha);
    }
  }

  // ===== Rocket / Meteor / Supernova Shatter & Magnetic Reassembly =====
  function renderImpactSequence(c, t, impactT, cx, cy, style, midCol, masterAlpha) {
    c.save();
    c.globalCompositeOperation = 'lighter';

    // --- PHASE 1: Pre-Impact (0 .. impactT) ---
    if (t < impactT) {
      const p = clamp(t / impactT, 0, 1);

      if (style === 'rocket') {
        // 1a. Hovering crystalline target orb at center
        const orbR = 26 + Math.sin(t * 7) * 2.5;
        const orbGlow = c.createRadialGradient(cx, cy, 2, cx, cy, orbR * 3.0);
        orbGlow.addColorStop(0, `rgba(255, 255, 255, ${(0.95 * masterAlpha).toFixed(3)})`);
        orbGlow.addColorStop(0.28, `rgba(${midCol[0]}, ${midCol[1]}, ${midCol[2]}, ${(0.65 * masterAlpha).toFixed(3)})`);
        orbGlow.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = orbGlow;
        c.beginPath();
        c.arc(cx, cy, orbR * 3.0, 0, Math.PI * 2);
        c.fill();

        // Rotating target rings
        c.save();
        c.translate(cx, cy);
        c.rotate(t * 1.4);
        c.strokeStyle = `rgba(${midCol[0]}, ${midCol[1]}, ${midCol[2]}, ${(0.55 * masterAlpha).toFixed(3)})`;
        c.lineWidth = 1.6;
        c.beginPath();
        c.ellipse(0, 0, orbR * 1.65, orbR * 0.65, 0.35, 0, Math.PI * 2);
        c.stroke();
        c.rotate(-t * 2.6);
        c.strokeStyle = `rgba(255, 235, 200, ${(0.45 * masterAlpha).toFixed(3)})`;
        c.beginPath();
        c.ellipse(0, 0, orbR * 1.35, orbR * 0.55, -0.5, 0, Math.PI * 2);
        c.stroke();
        c.restore();

        // 1b. Incoming Blazing Rocket along curved Bezier trajectory!
        const rp = Math.pow(p, 1.35); // accelerates dramatically into impact
        const sx = 42, sy = LOGICAL_H - 95;
        const kx = 170, ky = cy + 190;
        const inv = 1 - rp;
        const rx = inv * inv * sx + 2 * inv * rp * kx + rp * rp * cx;
        const ry = inv * inv * sy + 2 * inv * rp * ky + rp * rp * cy;
        // Tangent heading angle
        const dx = 2 * inv * (kx - sx) + 2 * rp * (cx - kx);
        const dy = 2 * inv * (ky - sy) + 2 * rp * (cy - ky);
        const ang = Math.atan2(dy, dx);

        // Glowing plasma exhaust trail
        const trailSteps = 22;
        for (let k = 1; k <= trailSteps; k++) {
          const tp = Math.max(0, rp - k * 0.016);
          const tinv = 1 - tp;
          const tx = tinv * tinv * sx + 2 * tinv * tp * kx + tp * tp * cx;
          const ty = tinv * tinv * sy + 2 * tinv * tp * ky + tp * tp * cy;
          const fade = (1 - k / trailSteps) * masterAlpha;
          const rad = (1 - k / trailSteps) * 14 + 2;
          const tg = c.createRadialGradient(tx, ty, 0.5, tx, ty, rad);
          tg.addColorStop(0, `rgba(255, 250, 220, ${(fade * 0.85).toFixed(3)})`);
          tg.addColorStop(0.45, `rgba(255, 130, 50, ${(fade * 0.55).toFixed(3)})`);
          tg.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = tg;
          c.beginPath();
          c.arc(tx, ty, rad, 0, Math.PI * 2);
          c.fill();
        }

        // Rocket body + fins + thruster flame
        c.save();
        c.translate(rx, ry);
        c.rotate(ang);
        // Thruster flame cone
        const flameLen = 26 + Math.sin(t * 70) * 7;
        const flGrad = c.createLinearGradient(-10, 0, -10 - flameLen, 0);
        flGrad.addColorStop(0, `rgba(255, 255, 255, ${masterAlpha.toFixed(3)})`);
        flGrad.addColorStop(0.35, `rgba(255, 185, 70, ${(0.9 * masterAlpha).toFixed(3)})`);
        flGrad.addColorStop(1, 'rgba(255, 60, 20, 0)');
        c.fillStyle = flGrad;
        c.beginPath();
        c.moveTo(-10, -5);
        c.lineTo(-10 - flameLen, 0);
        c.lineTo(-10, 5);
        c.closePath();
        c.fill();

        // Sleek glowing rocket fuselage
        c.fillStyle = `rgba(240, 248, 255, ${(0.96 * masterAlpha).toFixed(3)})`;
        c.beginPath();
        c.moveTo(18, 0);
        c.quadraticCurveTo(6, -6.5, -10, -5.5);
        c.lineTo(-13, -11);
        c.lineTo(-9, -4);
        c.lineTo(-9, 4);
        c.lineTo(-13, 11);
        c.lineTo(-10, 5.5);
        c.quadraticCurveTo(6, 6.5, 18, 0);
        c.closePath();
        c.fill();

        // Nose glow halo
        const ng = c.createRadialGradient(14, 0, 1, 14, 0, 20);
        ng.addColorStop(0, `rgba(255, 255, 255, ${(0.95 * masterAlpha).toFixed(3)})`);
        ng.addColorStop(0.5, `rgba(140, 215, 255, ${(0.45 * masterAlpha).toFixed(3)})`);
        ng.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = ng;
        c.beginPath();
        c.arc(14, 0, 20, 0, Math.PI * 2);
        c.fill();
        c.restore();
      } else if (style === 'meteor') {
        // Flaming Cosmic Meteor plunging from top-right!
        const mp = Math.pow(p, 1.45);
        const sx = LOGICAL_W - 20, sy = -35;
        const mx = sx + (cx - sx) * mp;
        const my = sy + (cy - sy) * mp;
        const tailX = mx - (cx - sx) * 0.24;
        const tailY = my - (cy - sy) * 0.24;

        const tg = c.createLinearGradient(mx, my, tailX, tailY);
        tg.addColorStop(0, `rgba(255, 255, 255, ${(0.95 * masterAlpha).toFixed(3)})`);
        tg.addColorStop(0.25, `rgba(255, 170, 75, ${(0.75 * masterAlpha).toFixed(3)})`);
        tg.addColorStop(0.6, `rgba(100, 185, 255, ${(0.35 * masterAlpha).toFixed(3)})`);
        tg.addColorStop(1, 'rgba(0,0,0,0)');
        c.strokeStyle = tg;
        c.lineWidth = 22;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(mx, my);
        c.lineTo(tailX, tailY);
        c.stroke();

        const cg = c.createRadialGradient(mx, my, 2, mx, my, 46);
        cg.addColorStop(0, `rgba(255, 255, 255, ${masterAlpha.toFixed(3)})`);
        cg.addColorStop(0.35, `rgba(255, 195, 110, ${(0.8 * masterAlpha).toFixed(3)})`);
        cg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = cg;
        c.beginPath();
        c.arc(mx, my, 46, 0, Math.PI * 2);
        c.fill();
      } else {
        // Supernova: gravitational implosion pulling inward!
        const impl = 1 - easeInOut(p);
        const ringR = 240 * impl + 10;
        const coreR = 14 + p * 36;
        const g = c.createRadialGradient(cx, cy, 2, cx, cy, coreR * 2.8);
        g.addColorStop(0, `rgba(255, 255, 255, ${masterAlpha.toFixed(3)})`);
        g.addColorStop(0.35, `rgba(${midCol[0]}, ${midCol[1]}, ${midCol[2]}, ${(0.75 * masterAlpha).toFixed(3)})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(cx, cy, coreR * 2.8, 0, Math.PI * 2);
        c.fill();

        c.strokeStyle = `rgba(255, 240, 220, ${(0.55 * p * masterAlpha).toFixed(3)})`;
        c.lineWidth = 2.2;
        c.beginPath();
        c.arc(cx, cy, ringR, 0, Math.PI * 2);
        c.stroke();
      }

      c.restore();
      return;
    }

    // --- PHASE 2: EXPLOSION FLASH & DUAL SHOCKWAVES (impactT .. impactT + 1.6s) ---
    const dtImp = t - impactT;
    if (dtImp < 0.55) {
      const fp = 1 - dtImp / 0.55;
      const flashR = 90 + (1 - fp) * 320;
      const fg = c.createRadialGradient(cx, cy, 2, cx, cy, flashR);
      fg.addColorStop(0, `rgba(255, 255, 255, ${(fp * fp * 0.98 * masterAlpha).toFixed(3)})`);
      fg.addColorStop(0.32, `rgba(255, 200, 120, ${(fp * fp * 0.65 * masterAlpha).toFixed(3)})`);
      fg.addColorStop(0.68, `rgba(${midCol[0]}, ${midCol[1]}, ${midCol[2]}, ${(fp * 0.25 * masterAlpha).toFixed(3)})`);
      fg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = fg;
      c.beginPath();
      c.arc(cx, cy, flashR, 0, Math.PI * 2);
      c.fill();
    }

    if (dtImp < 1.55) {
      const rp1 = easeOut(dtImp / 1.55);
      const r1 = rp1 * 420;
      const a1 = (1 - rp1) * 0.72 * masterAlpha;
      c.strokeStyle = `rgba(255, 230, 185, ${a1.toFixed(3)})`;
      c.lineWidth = 4.5 * (1 - rp1) + 0.8;
      c.beginPath();
      c.arc(cx, cy, r1, 0, Math.PI * 2);
      c.stroke();

      const rp2 = easeOut(clamp((dtImp - 0.12) / 1.4, 0, 1));
      if (rp2 > 0) {
        const r2 = rp2 * 330;
        const a2 = (1 - rp2) * 0.52 * masterAlpha;
        c.strokeStyle = `rgba(${midCol[0]}, ${midCol[1]}, ${midCol[2]}, ${a2.toFixed(3)})`;
        c.lineWidth = 3.0 * (1 - rp2) + 0.6;
        c.beginPath();
        c.arc(cx, cy, r2, 0, Math.PI * 2);
        c.stroke();
      }
    }

    // --- PHASE 3: 920 SHARDS BALLISTIC SHATTER -> BULLET-TIME -> MAGNETIC REASSEMBLY ---
    const shards = state.shatterShards;
    const blastDur = 1.75; // 1.85s .. 3.60s

    for (let i = 0; i < shards.length; i++) {
      const sh = shards[i];
      const assembleEnd = sh.assembleStart + sh.assembleDur;
      if (t > assembleEnd + 0.55) continue;

      const palCol = getSegmentColor(sh.seg);
      let px, py, prevX, prevY, a, hotMix = 0;

      if (t < sh.assembleStart) {
        // Ballistic shatter outward + dramatic bullet-time suspension
        const bp = clamp(dtImp / blastDur, 0, 1);
        const eased = 1 - Math.pow(1 - bp, 3);
        // Gentle zero-gravity drift during bullet-time hold
        const holdT = Math.max(0, t - (impactT + blastDur));
        const driftX = Math.sin(holdT * 2.2 + sh.rot) * 4 * holdT;
        const driftY = Math.cos(holdT * 1.9 + sh.rot) * 4 * holdT;

        px = sh.ox + (sh.bx - sh.ox) * eased + driftX;
        py = sh.oy + (sh.by - sh.oy) * eased + driftY;

        const prevBp = Math.max(0, bp - 0.045);
        const prevEased = 1 - Math.pow(1 - prevBp, 3);
        prevX = sh.ox + (sh.bx - sh.ox) * prevEased + driftX;
        prevY = sh.oy + (sh.by - sh.oy) * prevEased + driftY;

        hotMix = clamp(1 - bp * 1.25, 0, 1);
        a = 0.92 * masterAlpha;
      } else if (t <= assembleEnd) {
        // Magnetic curved Bezier flight straight to exact contour coordinate!
        const ap = (t - sh.assembleStart) / sh.assembleDur;
        const p = easeInOut(ap);
        const inv = 1 - p;
        px = inv * inv * sh.bx + 2 * inv * p * sh.ctrlX + p * p * sh.tx;
        py = inv * inv * sh.by + 2 * inv * p * sh.ctrlY + p * p * sh.ty;

        const pPrev = easeInOut(Math.max(0, ap - 0.04));
        const invP = 1 - pPrev;
        prevX = invP * invP * sh.bx + 2 * invP * pPrev * sh.ctrlX + pPrev * pPrev * sh.tx;
        prevY = invP * invP * sh.by + 2 * invP * pPrev * sh.ctrlY + pPrev * pPrev * sh.ty;

        a = (0.78 + 0.22 * Math.sin(ap * Math.PI)) * masterAlpha;
      } else {
        // Snap-in lock flash right on the contour!
        const fp = 1 - (t - assembleEnd) / 0.55;
        const rad = sh.size * (1.8 + (1 - fp) * 2.2);
        c.fillStyle = `rgba(${palCol[0]}, ${palCol[1]}, ${palCol[2]}, ${(fp * 0.72 * masterAlpha).toFixed(3)})`;
        c.beginPath();
        c.arc(sh.tx, sh.ty, rad, 0, Math.PI * 2);
        c.fill();
        continue;
      }

      // Blend hot explosion orange-gold into artwork's luminous palette color
      const cr = Math.round(palCol[0] * (1 - hotMix) + 255 * hotMix);
      const cg = Math.round(palCol[1] * (1 - hotMix) + (155 + sh.hotHue * 75) * hotMix);
      const cb = Math.round(palCol[2] * (1 - hotMix) + 65 * hotMix);

      // Motion streak
      c.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${(a * 0.55).toFixed(3)})`;
      c.lineWidth = sh.size * 0.72;
      c.beginPath();
      c.moveTo(prevX, prevY);
      c.lineTo(px, py);
      c.stroke();

      // Rotating glowing crystal shard or starlight orb
      if (sh.isCrystal) {
        const ang = sh.rot + dtImp * sh.rotSpd;
        const cs = Math.cos(ang) * sh.size;
        const sn = Math.sin(ang) * sh.size;
        c.fillStyle = `rgba(255, 255, 255, ${(a * 0.92).toFixed(3)})`;
        c.beginPath();
        c.moveTo(px + cs * 1.4, py + sn * 1.4);
        c.lineTo(px - sn * 0.65, py + cs * 0.65);
        c.lineTo(px - cs * 1.4, py - sn * 1.4);
        c.lineTo(px + sn * 0.65, py - cs * 0.65);
        c.closePath();
        c.fill();
      } else {
        c.fillStyle = `rgba(255, 255, 255, ${(a * 0.9).toFixed(3)})`;
        c.beginPath();
        c.arc(px, py, sh.size * 0.65, 0, Math.PI * 2);
        c.fill();
      }
    }

    c.restore();
  }

  function drawFourPointStar(c, x, y, size, rgb, alpha) {
    const halo = c.createRadialGradient(x, y, 0, x, y, size * 1.15);
    halo.addColorStop(0, `rgba(255, 255, 255, ${(alpha * 0.92).toFixed(3)})`);
    halo.addColorStop(0.35, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(alpha * 0.48).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = halo;
    c.beginPath();
    c.arc(x, y, size * 1.15, 0, Math.PI * 2);
    c.fill();

    const inner = size * 0.13;
    c.fillStyle = `rgba(255, 255, 255, ${(alpha * 0.96).toFixed(3)})`;
    c.beginPath();
    c.moveTo(x, y - size);
    c.lineTo(x + inner, y - inner);
    c.lineTo(x + size, y);
    c.lineTo(x + inner, y + inner);
    c.lineTo(x, y + size);
    c.lineTo(x - inner, y + inner);
    c.lineTo(x - size, y);
    c.lineTo(x - inner, y - inner);
    c.closePath();
    c.fill();
  }

  function drawPoeticQuote(c, quote, t, masterAlpha) {
    const words = quote.split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    c.save();
    c.font = 'italic 300 20px Georgia, "Times New Roman", serif';
    c.textBaseline = 'middle';

    const spaceW = c.measureText(' ').width;
    const widths = words.map(w => c.measureText(w).width);
    const totalW = widths.reduce((a, b) => a + b, 0) + spaceW * (words.length - 1);

    let x = (LOGICAL_W - totalW) / 2;
    const baseY = LOGICAL_H - 54;

    for (let i = 0; i < words.length; i++) {
      const wStart = TIMELINE.TEXT_START + i * TIMELINE.WORD_GAP;
      if (t >= wStart) {
        const p = easeOut((t - wStart) / TIMELINE.WORD_DUR);
        const y = baseY + (1 - p) * 10;
        const a = p * 0.90 * masterAlpha;

        c.shadowColor = 'rgba(165, 205, 255, 0.58)';
        c.shadowBlur = 12;
        c.fillStyle = `rgba(238, 243, 255, ${a.toFixed(3)})`;
        c.fillText(words[i], x, y);
      }
      x += widths[i] + spaceW;
    }

    c.restore();
  }

  // ===== Main Animation Loop =====
  function tick(nowMs) {
    if (!state.lastFrameMs) state.lastFrameMs = nowMs;
    const dt = Math.min(0.05, (nowMs - state.lastFrameMs) / 1000);
    state.lastFrameMs = nowMs;

    if (state.playing && !state.comparing) {
      // Export recording runs at 1.6x internal timeline speed so users get a crisp ~15s video quickly without waiting 24s!
      const effectiveSpeed = state.recording ? Math.max(state.speed, 1.55) : state.speed;
      state.time += dt * effectiveSpeed;
      if (state.time >= TIMELINE.DURATION) {
        if (state.recording) stopRecording();
        if (state.loop) {
          state.time = 0;
        } else {
          state.time = TIMELINE.FADE_START - 0.5;
          state.playing = false;
          updatePlayButtonUI();
        }
      }
      if (!state._lastSliderSync || nowMs - state._lastSliderSync > 90) {
        timelineSlider.value = state.time.toFixed(2);
        updateTimelineLabels(state.time);
        state._lastSliderSync = nowMs;
      }
    }

    renderFrame(state.time);
    requestAnimationFrame(tick);
  }

  function updateTimelineLabels(t) {
    timeLabel.textContent = `${t.toFixed(1)}s / ${TIMELINE.DURATION.toFixed(1)}s`;
    let phase = 'Tayyorlanmoqda';
    if (t < TIMELINE.TRACE_START + TIMELINE.TRACE_SPREAD + 1.5) phase = 'Konturlar chizilmoqda';
    else if (t < TIMELINE.SHIMMER_START) phase = 'Yorqin soya';
    else if (t < TIMELINE.SHIMMER_START + TIMELINE.SHIMMER_DUR) phase = 'Tovlanish to‘lqini ✦';
    else if (t < TIMELINE.FADE_START) phase = 'Yakuniy porlash';
    else phase = 'Yumshoq so‘nish';
    phaseLabel.textContent = phase;
  }

  function updatePlayButtonUI() {
    playIcon.style.display = state.playing ? 'none' : 'block';
    pauseIcon.style.display = state.playing ? 'block' : 'none';
  }

  // ===== Gallery & Image Loading =====
  function renderGallery() {
    galleryStrip.innerHTML = '';
    for (const item of state.gallery) {
      const btn = document.createElement('button');
      btn.className = 'gallery-thumb' + (item.id === state.activeGalleryId ? ' active' : '');
      btn.title = item.name || 'Rasm';
      const im = document.createElement('img');
      im.src = item.src;
      btn.appendChild(im);
      btn.addEventListener('click', () => selectGalleryItem(item.id));
      galleryStrip.appendChild(btn);
    }
  }

  function selectGalleryItem(id) {
    const item = state.gallery.find(g => g.id === id);
    if (!item) return;
    state.activeGalleryId = id;
    renderGallery();
    loadImageFromSrc(item.src);
  }

  function addToGalleryAndLoad(src, name = 'Rasm') {
    const id = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    state.gallery.push({ id, src, name });
    state.activeGalleryId = id;
    renderGallery();
    loadImageFromSrc(src);
  }

  function loadImageFromSrc(src) {
    const img = new Image();
    img.onload = () => {
      state.currentImg = img;
      processImage(img, true);
    };
    img.onerror = () => {
      alert('Rasmni yuklab bo‘lmadi. Boshqa rasm tanlab ko‘ring.');
    };
    img.src = src;
  }

  function fmtSum(n) {
    const v = parseInt(n, 10);
    if (Number.isNaN(v)) return `${n || 0} so‘m`;
    return `${v.toLocaleString('ru-RU')} so‘m`;
  }

  async function fetchUserStatus() {
    try {
      const q = state.tgChatId ? `?chat_id=${encodeURIComponent(state.tgChatId)}` : '';
      const r = await fetch(`${API_BASE}/api/user-status${q}`);
      const data = await r.json();
      if (data && data.ok) {
        state.userStatus = data;
        updatePlanBannerUI();
        populatePayModal();
      }
    } catch (e) {
      console.warn('Status fetch failed:', e);
    }
  }

  function updatePlanBannerUI() {
    const st = state.userStatus;
    if (st && typeof st.total_users === 'number' && usersCountVal) {
      usersCountVal.textContent = st.total_users.toLocaleString('ru-RU');
    }
    if (!st || !planBanner) return;
    planBanner.classList.remove('locked');
    if (st.is_admin) {
      planBannerText.textContent = '⚙️ Admin — cheksiz ruxsat';
    } else if (st.is_premium) {
      planBannerText.textContent = `👑 Premium faol (${st.premium_days_left} kun qoldi)`;
    } else if (st.free_remaining > 0) {
      planBannerText.textContent = '🎁 1-rasmingiz va animatsiyangiz BEPUL';
    } else if (st.credits > 0) {
      planBannerText.textContent = `🎬 Balans: ${st.credits} ta rasm/video qoldi`;
    } else {
      planBanner.classList.add('locked');
      planBannerText.textContent = '🔒 Keyingi rasm uchun to‘lov talab qilinadi';
    }
  }

  function populatePayModal() {
    const s = (state.userStatus && state.userStatus.settings) || {};
    if (payVideoPrice) payVideoPrice.textContent = fmtSum(s.video_price || 10000);
    if (payPremiumPrice) payPremiumPrice.textContent = fmtSum(s.premium_price || 49000);
    if (payCardNumber) payCardNumber.textContent = s.card_number || 'Kiritilmagan';
    if (payCardHolder) payCardHolder.textContent = s.card_holder || 'Kiritilmagan';
  }

  function openPayModal() {
    populatePayModal();
    if (payModal) payModal.classList.add('visible');
  }

  function closePayModal() {
    if (payModal) payModal.classList.remove('visible');
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => f && f.type.startsWith('image/'));
    if (files.length === 0) return;

    // Enforce payment gate BEFORE loading the image (1st image free, 2nd+ requires credit or 1-month Premium!)
    if (state.tgChatId) {
      try {
        const resp = await fetch(`${API_BASE}/api/consume-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: state.tgChatId }),
        });
        const res = await resp.json();
        if (res && res.status) {
          state.userStatus = res.status;
          updatePlanBannerUI();
          populatePayModal();
        }
        if (!res || !res.allowed) {
          openPayModal();
          return;
        }
      } catch (err) {
        console.warn('Consume check error:', err);
      }
    } else {
      // Guest browser without chat_id: allow 1 free upload via localStorage, then ask to pay via bot
      const localFreeUsed = localStorage.getItem('glow_local_free_used') === '1';
      if (localFreeUsed) {
        await fetchUserStatus();
        openPayModal();
        return;
      }
      try { localStorage.setItem('glow_local_free_used', '1'); } catch (_) {}
      if (state.userStatus) {
        state.userStatus.free_remaining = 0;
        state.userStatus.free_used = true;
        updatePlanBannerUI();
      }
    }

    // Load the uploaded image (1st file if metered, or all if admin/premium)
    const allowedFiles = (state.userStatus && (state.userStatus.is_admin || state.userStatus.is_premium))
      ? files
      : [files[0]];

    allowedFiles.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target.result;
        const id = 'img_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).slice(2, 5);
        state.gallery.push({ id, src, name: file.name });
        if (idx === allowedFiles.length - 1) {
          state.activeGalleryId = id;
          loadImageFromSrc(src);
        }
        renderGallery();
      };
      reader.readAsDataURL(file);
    });
  }

  // ===== Telegram WebApp & Chat ID Detection =====
  function initTelegramIntegration() {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg) {
      try {
        tg.ready();
        tg.expand();
      } catch (_) {}
    }

    const params = new URLSearchParams(window.location.search);
    const urlChatId = params.get('chat_id') || params.get('tg_chat_id');
    const webAppUserId = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id;

    let chatId = webAppUserId || urlChatId || localStorage.getItem('glow_tg_chat_id') || null;
    if (chatId) {
      chatId = String(chatId).trim();
      if (/^-?\d+$/.test(chatId)) {
        state.tgChatId = chatId;
        try { localStorage.setItem('glow_tg_chat_id', chatId); } catch (_) {}
      }
    }
    updateTelegramStatusUI();
    fetchUserStatus();
  }

  function updateTelegramStatusUI(customMsg = null, mode = null) {
    tgDot.classList.remove('connected', 'sending');
    if (mode === 'sending') {
      tgDot.classList.add('sending');
      tgStatusText.textContent = customMsg || 'Botga yuborilmoqda...';
      return;
    }
    if (state.tgChatId) {
      tgDot.classList.add('connected');
      tgStatusText.textContent = customMsg || `Telegram ulangan (ID: ${state.tgChatId})`;
    } else {
      tgStatusText.textContent = customMsg || '@quiz15_testbot orqali oching (avtomatik ulanadi)';
    }
  }

  async function uploadVideoToTelegram(blob, mimeType) {
    if (!state.tgChatId) {
      const entered = window.prompt(
        'Telegram Chat ID topilmadi. @quiz15_testbot da /start bosib oching yoki Telegram ID raqamingizni kiriting:'
      );
      if (!entered || !/^-?\d+$/.test(entered.trim())) {
        updateTelegramStatusUI('Bekor qilindi — @quiz15_testbot orqali oching');
        return;
      }
      state.tgChatId = entered.trim();
      try { localStorage.setItem('glow_tg_chat_id', state.tgChatId); } catch (_) {}
    }

    state.sendingTelegram = true;
    sendTelegramBtn.disabled = true;
    sendTelegramText.textContent = 'MP4 tayyorlanib yuborilmoqda...';
    updateTelegramStatusUI('Serverda MP4 qilinib botga yuborilmoqda...', 'sending');

    try {
      const form = new FormData();
      const ext = (mimeType || '').includes('mp4') ? 'mp4' : 'webm';
      form.append('video', blob, `glow-trace-art.${ext}`);
      form.append('chat_id', state.tgChatId);
      form.append('caption', state.quote.trim() || '✦ Glow Trace Art');
      form.append('width', String(LOGICAL_W));
      form.append('height', String(LOGICAL_H));

      const resp = await fetch(`${API_BASE}/api/send-to-telegram`, {
        method: 'POST',
        body: form,
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || `Server xatoligi (${resp.status})`);
      }

      updateTelegramStatusUI('✓ Tayyor video Telegram botga yuborildi!');
      sendTelegramText.textContent = '✓ Botga yuborildi!';
      setTimeout(() => {
        sendTelegramText.textContent = 'Botga tayyor video yuborish';
      }, 3200);
    } catch (err) {
      console.error('Telegram upload error:', err);
      updateTelegramStatusUI(`Xatolik: ${err.message}`);
      alert(`Botga yuborishda xatolik: ${err.message}`);
      sendTelegramText.textContent = 'Botga tayyor video yuborish';
    } finally {
      state.sendingTelegram = false;
      sendTelegramBtn.disabled = false;
    }
  }

  // ===== Video Recording (WebM 60fps -> Local Download or Telegram Bot) =====
  function startRecording(target = 'download') {
    if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
      alert('Brauzeringiz video yozishni qo‘llab-quvvatlamaydi.');
      return;
    }

    if (target === 'telegram' && !state.tgChatId) {
      const entered = window.prompt(
        'Videoni botga yuborish uchun @quiz15_testbot dan oching yoki Telegram ID raqamingizni kiriting:'
      );
      if (!entered || !/^-?\d+$/.test(entered.trim())) {
        return;
      }
      state.tgChatId = entered.trim();
      try { localStorage.setItem('glow_tg_chat_id', state.tgChatId); } catch (_) {}
      updateTelegramStatusUI();
    }

    const stream = canvas.captureStream(30);
    const mimeTypes = [
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp8',
      'video/webm;codecs=vp9',
      'video/webm',
    ];
    const mimeType = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';

    state.recordedChunks = [];
    state.recordingTarget = target;
    const mr = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 2_200_000 } : { videoBitsPerSecond: 2_200_000 });
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) state.recordedChunks.push(e.data);
    };
    mr.onstop = async () => {
      const blob = new Blob(state.recordedChunks, { type: mimeType || 'video/webm' });
      if (state.recordingTarget === 'telegram') {
        uploadVideoToTelegram(blob, mimeType);
      } else {
        recordBtnText.textContent = 'MP4 tayyorlanmoqda...';
        recordVideoBtn.disabled = true;
        try {
          const form = new FormData();
          const ext = (mimeType || '').includes('mp4') ? 'mp4' : 'webm';
          form.append('video', blob, `glow-trace-art.${ext}`);
          const resp = await fetch(`${API_BASE}/api/convert-mp4`, {
            method: 'POST',
            body: form,
          });
          if (!resp.ok) throw new Error('MP4 conversion failed');
          const mp4Blob = await resp.blob();
          const url = URL.createObjectURL(mp4Blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `glow-trace-art-${Date.now()}.mp4`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (err) {
          console.warn('Server MP4 convert fallback:', err);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `glow-trace-art-${Date.now()}.webm`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 3000);
        } finally {
          recordVideoBtn.disabled = false;
          recordBtnText.textContent = 'Video (MP4)';
        }
      }
    };

    state.mediaRecorder = mr;
    state.recording = true;
    state.time = 0;
    state.playing = true;
    updatePlayButtonUI();
    recordingBadge.classList.add('visible');

    if (target === 'telegram') {
      sendTelegramBtn.classList.add('recording');
      sendTelegramText.textContent = 'Yozilmoqda... (to‘xtatib yuborish)';
      updateTelegramStatusUI('Video yozilmoqda — tugagach avtomatik botga ketadi...', 'sending');
    } else {
      recordVideoBtn.classList.add('recording');
      recordBtnText.textContent = 'To‘xtatish';
    }
    mr.start(250);
  }

  function stopRecording() {
    if (!state.recording) return;
    state.recording = false;
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
    recordingBadge.classList.remove('visible');
    recordVideoBtn.classList.remove('recording');
    recordBtnText.textContent = 'Video (MP4)';
    sendTelegramBtn.classList.remove('recording');
    if (state.recordingTarget !== 'telegram') {
      sendTelegramText.textContent = 'Botga tayyor video yuborish';
    }
  }

  // ===== Event Listeners =====
  togglePanelBtn.addEventListener('click', () => {
    if (window.innerWidth <= 860) {
      controlPanel.classList.remove('collapsed');
      controlPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      controlPanel.classList.toggle('collapsed');
    }
  });

  // Press & hold "Asl rasm" to compare
  const startCompare = () => { state.comparing = true; compareBtn.classList.add('active'); };
  const stopCompare = () => { state.comparing = false; compareBtn.classList.remove('active'); };
  compareBtn.addEventListener('mousedown', startCompare);
  compareBtn.addEventListener('touchstart', startCompare, { passive: true });
  window.addEventListener('mouseup', stopCompare);
  window.addEventListener('touchend', stopCompare);

  playPauseBtn.addEventListener('click', () => {
    state.playing = !state.playing;
    updatePlayButtonUI();
  });

  replayBtn.addEventListener('click', () => {
    state.time = 0;
    state.playing = true;
    updatePlayButtonUI();
  });

  // Spacebar toggles Play/Pause (when not typing in quote input)
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.activeElement !== quoteInput) {
      e.preventDefault();
      state.playing = !state.playing;
      updatePlayButtonUI();
    }
  });

  // Clipboard Paste (Ctrl+V) support!
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imgs = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) imgs.push(f);
      }
    }
    if (imgs.length > 0) handleFiles(imgs);
  });

  timelineSlider.addEventListener('input', (e) => {
    state.time = parseFloat(e.target.value);
    renderFrame(state.time);
    updateTimelineLabels(state.time);
  });

  loopToggle.addEventListener('change', (e) => {
    state.loop = e.target.checked;
  });

  imageUpload.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  });

  resetImageBtn.addEventListener('click', () => {
    if (state.gallery.length > 0) {
      selectGalleryItem(state.gallery[0].id);
    } else if (window.DEFAULT_IMAGE_DATA_URI) {
      addToGalleryAndLoad(window.DEFAULT_IMAGE_DATA_URI, 'Namuna');
    }
  });

  // Drag & Drop (supports multiple files)
  ['dragenter', 'dragover'].forEach(ev => {
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropOverlay.classList.add('visible');
    });
  });

  ['dragleave', 'drop'].forEach(ev => {
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropOverlay.classList.remove('visible');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer?.files?.length) {
      handleFiles(e.dataTransfer.files);
    }
  });

  // Mode toggle
  modeControl.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    modeControl.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = btn.dataset.mode;
    if (state.currentImg) processImage(state.currentImg, false);
  });

  // Fill mode toggle
  fillModeControl.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    fillModeControl.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.fillMode = btn.dataset.fill;
  });

  // Animation style selection
  animStyleControl.addEventListener('click', (e) => {
    const chip = e.target.closest('.anim-chip');
    if (!chip) return;
    animStyleControl.querySelectorAll('.anim-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.animStyle = chip.dataset.anim;
    state.orbit3D.userYaw = 0;
    state.orbit3D.userPitch = 0;
    ensureActiveStyleLayers();
    applyAnimationStyle();
    state.time = 0;
    state.playing = true;
    updatePlayButtonUI();
  });

  // Interactive 3D Drag-to-Rotate on Canvas when in 3D Hologram mode!
  canvas.addEventListener('pointerdown', (e) => {
    if (state.animStyle !== 'holo3d') return;
    state.orbit3D.dragging = true;
    state.orbit3D.lastX = e.clientX;
    state.orbit3D.lastY = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!state.orbit3D.dragging || state.animStyle !== 'holo3d') return;
    const dx = e.clientX - state.orbit3D.lastX;
    const dy = e.clientY - state.orbit3D.lastY;
    state.orbit3D.lastX = e.clientX;
    state.orbit3D.lastY = e.clientY;
    state.orbit3D.userYaw += dx * 0.0085;
    state.orbit3D.userPitch = clamp(state.orbit3D.userPitch + dy * 0.0065, -1.0, 1.0);
  });
  const endOrbitDrag = () => { state.orbit3D.dragging = false; };
  canvas.addEventListener('pointerup', endOrbitDrag);
  canvas.addEventListener('pointercancel', endOrbitDrag);

  // Palette selection
  paletteGrid.addEventListener('click', (e) => {
    const chip = e.target.closest('.palette-chip');
    if (!chip) return;
    paletteGrid.querySelectorAll('.palette-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.paletteKey = chip.dataset.palette;
    rebuildFillLayers();
  });

  // Sliders
  let reprocessTimer = null;
  function scheduleReprocess() {
    clearTimeout(reprocessTimer);
    reprocessTimer = setTimeout(() => {
      if (state.currentImg) processImage(state.currentImg, false);
    }, 180);
  }

  sensitivitySlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    sensitivityVal.textContent = `${val}%`;
    state.sensitivity = val / 100;
    scheduleReprocess();
  });

  cleanSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    cleanVal.textContent = `${val}%`;
    state.cleanliness = val / 100;
    scheduleReprocess();
  });

  glowSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    glowVal.textContent = `${val}%`;
    state.glowIntensity = val / 100;
  });

  lineWidthSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    lineWidthVal.textContent = `${val.toFixed(2)}px`;
    state.lineWidth = val;
  });

  twinklesSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    twinklesVal.textContent = `${val}`;
    state.twinkleCount = val;
    rebuildTwinkles();
  });

  speedSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    speedVal.textContent = `${val.toFixed(1)}x`;
    state.speed = val;
  });

  shimmerToggle.addEventListener('change', (e) => {
    state.showShimmer = e.target.checked;
  });

  bloomToggle.addEventListener('change', (e) => {
    state.useBloom = e.target.checked;
  });

  sparksToggle.addEventListener('change', (e) => {
    state.showSparks = e.target.checked;
    if (!state.showSparks) state.liveSparks = [];
  });

  cinemaZoomToggle.addEventListener('change', (e) => {
    state.cinemaZoom = e.target.checked;
  });

  quoteInput.addEventListener('input', (e) => {
    state.quote = e.target.value;
  });

  // Export HD PNG
  savePngBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `glow-trace-art-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  // Record Video (local download)
  recordVideoBtn.addEventListener('click', () => {
    if (state.recording) stopRecording();
    else startRecording('download');
  });

  // Record & Send Ready MP4 Video to Telegram Bot
  sendTelegramBtn.addEventListener('click', () => {
    if (state.sendingTelegram) return;
    if (state.recording) stopRecording();
    else startRecording('telegram');
  });

  // Payment Modal listeners
  if (openPaywallBtn) openPaywallBtn.addEventListener('click', () => { fetchUserStatus().then(openPayModal); });
  if (closePayModalBtn) closePayModalBtn.addEventListener('click', closePayModal);
  if (payModal) {
    payModal.addEventListener('click', (e) => {
      if (e.target === payModal) closePayModal();
    });
  }
  if (copyCardBtn) {
    copyCardBtn.addEventListener('click', async () => {
      const num = (payCardNumber && payCardNumber.textContent) || '';
      try {
        await navigator.clipboard.writeText(num.replace(/\s+/g, ''));
        copyCardBtn.textContent = '✓ Nusxalandi';
        setTimeout(() => { copyCardBtn.textContent = 'Nusxalash'; }, 1800);
      } catch (_) {}
    });
  }
  if (refreshStatusBtn) {
    refreshStatusBtn.addEventListener('click', async () => {
      refreshStatusBtn.textContent = 'Tekshirilmoqda...';
      await fetchUserStatus();
      refreshStatusBtn.textContent = '🔄 To‘lovni tekshirish';
      if (state.userStatus && state.userStatus.can_upload) {
        closePayModal();
      }
    });
  }

  // ===== Bootstrap =====
  initTelegramIntegration();
  initAmbientDust();
  if (window.DEFAULT_IMAGE_DATA_URI) {
    addToGalleryAndLoad(window.DEFAULT_IMAGE_DATA_URI, 'Namuna');
  }
  requestAnimationFrame(tick);
})();
