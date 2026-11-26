import * as THREE from 'three';

export class Bunny3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
    this.camera.position.set(0, 0.45, 5.4);

    // Cinematic Pixar-style 4-point lighting
    this.scene.add(new THREE.HemisphereLight(0xf3e8ff, 0x1e1b4b, 1.15));

    const key = new THREE.DirectionalLight(0xfff7ed, 1.55);
    key.position.set(2.8, 4.5, 4.2);
    this.scene.add(key);

    this.rimLight = new THREE.DirectionalLight(0xa855f7, 1.15);
    this.rimLight.position.set(-3.4, 2.8, -2.5);
    this.scene.add(this.rimLight);

    this.auraLight = new THREE.PointLight(0x38bdf8, 0.9, 12);
    this.auraLight.position.set(0, -0.6, 2.4);
    this.scene.add(this.auraLight);

    this.root = new THREE.Group();
    this.root.position.y = -0.22;
    this.scene.add(this.root);

    this._buildAuraRings();
    this._buildBunny();
    this._buildSparkles();
    this._buildThinkOrbits();
    this._buildLearnBurst();

    // Animation & interactive state
    this.lookX = 0;
    this.lookY = 0;
    this.targetLookX = 0;
    this.targetLookY = 0;
    this.aiState = 'idle'; // 'idle' | 'listening' | 'thinking' | 'speaking'
    this.mood = 'happy';   // 'happy' | 'curious' | 'excited' | 'laughing' | 'shy' | 'wise'
    this.voiceLevel = 0;
    this.smoothVoice = 0;
    this.micLevel = 0;
    this.smoothMic = 0;

    this.blinkTimer = 2.4;
    this.blinking = 0;
    this.hopTime = 0;
    this.blushBoost = 0;
    this.learnBurstTime = 0;
    this.wiggleTime = 0;

    this._curAuraColor = new THREE.Color(0x8b5cf6);
    this._targetAuraColor = new THREE.Color(0x8b5cf6);
  }

  _buildAuraRings() {
    // Glowing Gemini-Live-style voice halo rings behind & below bunny
    const ringGeo1 = new THREE.TorusGeometry(1.42, 0.022, 16, 80);
    this.haloMat1 = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
    });
    this.haloRing1 = new THREE.Mesh(ringGeo1, this.haloMat1);
    this.haloRing1.position.set(0, 0.42, -0.85);
    this.root.add(this.haloRing1);

    const ringGeo2 = new THREE.TorusGeometry(1.72, 0.014, 14, 96);
    this.haloMat2 = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
    });
    this.haloRing2 = new THREE.Mesh(ringGeo2, this.haloMat2);
    this.haloRing2.position.set(0, 0.42, -1.05);
    this.root.add(this.haloRing2);

    // Floating holographic pedestal disc
    this.pedestalMat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.pedestal = new THREE.Mesh(new THREE.RingGeometry(0.45, 1.38, 64), this.pedestalMat);
    this.pedestal.rotation.x = -Math.PI / 2;
    this.pedestal.position.y = -0.82;
    this.root.add(this.pedestal);
  }

  _buildBunny() {
    const fur = new THREE.MeshStandardMaterial({ color: 0xfbf9ff, roughness: 0.62, metalness: 0.04 });
    const furSoft = new THREE.MeshStandardMaterial({ color: 0xeee8ff, roughness: 0.7, metalness: 0.02 });
    const bellyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.01 });
    const innerEar = new THREE.MeshStandardMaterial({ color: 0xff9ec4, roughness: 0.52, metalness: 0.03 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xff5f96, roughness: 0.35, metalness: 0.08 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x110d20, roughness: 0.06, metalness: 0.35 });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.blushMat = new THREE.MeshBasicMaterial({ color: 0xff6ea8, transparent: true, opacity: 0.36 });
    const mouthCavityMat = new THREE.MeshStandardMaterial({ color: 0x5c1836, roughness: 0.6 });
    const tongueMat = new THREE.MeshStandardMaterial({ color: 0xff7aa8, roughness: 0.4 });
    const toothMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 });
    const browMat = new THREE.MeshStandardMaterial({ color: 0xd8d0ee, roughness: 0.65 });

    // ---- Body ----
    this.body = new THREE.Group();
    this.root.add(this.body);

    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.68, 36, 30), fur);
    torso.scale.set(0.96, 1.08, 0.9);
    torso.position.y = -0.14;
    this.body.add(torso);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.47, 26, 22), bellyMat);
    belly.scale.set(0.88, 1.0, 0.44);
    belly.position.set(0, -0.18, 0.44);
    this.body.add(belly);

    // Glowing AI Crystal Pendant on chest (changes color with AI state!)
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.37, 0.035, 12, 36),
      new THREE.MeshStandardMaterial({ color: 0x6d28d9, roughness: 0.35, metalness: 0.45 })
    );
    collar.rotation.x = Math.PI / 2 + 0.18;
    collar.position.set(0, 0.27, 0.06);
    this.body.add(collar);

    this.gemMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.9,
      roughness: 0.15,
      metalness: 0.3,
    });
    this.chestGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), this.gemMat);
    this.chestGem.position.set(0, 0.17, 0.48);
    this.chestGem.scale.set(0.95, 1.15, 0.7);
    this.body.add(this.chestGem);

    // Fluffy tail
    this.tail = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 16), fur);
    this.tail.position.set(0, -0.45, -0.62);
    this.body.add(this.tail);

    // Feet with pink paw pads
    for (const x of [-0.33, 0.33]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.23, 20, 18), fur);
      foot.scale.set(0.96, 0.62, 1.42);
      foot.position.set(x, -0.72, 0.27);
      this.body.add(foot);
      for (let i = 0; i < 3; i++) {
        const toe = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), furSoft);
        toe.position.set(x + (i - 1) * 0.085, -0.78, 0.52);
        this.body.add(toe);
      }
    }

    // Arms / Paws
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.62, 0.02, 0.02);
    this.body.add(this.leftArm);
    const lArmMesh = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 16), fur);
    lArmMesh.scale.set(0.82, 1.24, 0.82);
    this.leftArm.add(lArmMesh);
    const lPaw = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), fur);
    lPaw.position.set(-0.04, -0.25, 0.28);
    this.leftArm.add(lPaw);

    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.62, 0.02, 0.02);
    this.body.add(this.rightArm);
    const rArmMesh = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 16), fur);
    rArmMesh.scale.set(0.82, 1.24, 0.82);
    this.rightArm.add(rArmMesh);
    const rPaw = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), fur);
    rPaw.position.set(0.04, -0.25, 0.28);
    this.rightArm.add(rPaw);

    // ---- Head ----
    this.head = new THREE.Group();
    this.head.position.set(0, 0.69, 0.06);
    this.body.add(this.head);

    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.58, 36, 30), fur);
    cranium.scale.set(1.07, 0.96, 0.97);
    this.head.add(cranium);

    // Cute forehead fur tuft!
    for (const [tx, ty, rz, sc] of [
      [-0.06, 0.55, 0.3, 0.11],
      [0.03, 0.58, -0.1, 0.13],
      [0.11, 0.53, -0.45, 0.09],
    ]) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(sc * 0.7, sc * 2.2, 12), fur);
      tuft.position.set(tx, ty, 0.18);
      tuft.rotation.z = rz;
      tuft.rotation.x = 0.25;
      this.head.add(tuft);
    }

    // Soft puffy cheeks + rosy blush
    for (const x of [-0.29, 0.29]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.23, 20, 18), fur);
      cheek.position.set(x, -0.14, 0.39);
      this.head.add(cheek);

      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.125, 22), this.blushMat);
      blush.position.set(x * 1.18, -0.11, 0.565);
      blush.rotation.y = x < 0 ? -0.36 : 0.36;
      this.head.add(blush);
    }

    // Cute heart-shaped nose
    this.nose = new THREE.Mesh(new THREE.SphereGeometry(0.072, 18, 16), noseMat);
    this.nose.scale.set(1.26, 0.86, 0.84);
    this.nose.position.set(0, -0.025, 0.575);
    this.head.add(this.nose);

    // Delicate whiskers
    for (const side of [-1, 1]) {
      for (const dy of [-0.025, 0.02]) {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(side * 0.09, dy - 0.02, 0.54),
          new THREE.Vector3(side * 0.45, dy + side * 0.012, 0.42),
        ]);
        const line = new THREE.Line(
          geo,
          new THREE.LineBasicMaterial({ color: 0xdad4f2, transparent: true, opacity: 0.55 })
        );
        this.head.add(line);
      }
    }

    // ---- Real-Time Audio-Reactive Mouth ----
    this.mouthGroup = new THREE.Group();
    this.mouthGroup.position.set(0, -0.165, 0.535);
    this.head.add(this.mouthGroup);

    this.mouthCavity = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 14), mouthCavityMat);
    this.mouthCavity.scale.set(1.15, 0.25, 0.55);
    this.mouthGroup.add(this.mouthCavity);

    this.tongue = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), tongueMat);
    this.tongue.scale.set(1.0, 0.45, 0.6);
    this.tongue.position.set(0, -0.032, 0.024);
    this.mouthGroup.add(this.tongue);

    // Cute tiny bunny front tooth
    this.tooth = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.036, 0.024), toothMat);
    this.tooth.position.set(0, 0.028, 0.042);
    this.mouthGroup.add(this.tooth);

    // ---- Big Expressive Pixar Eyes + Eyebrows ----
    this.eyeGroups = [];
    this.irisMats = [];
    this.brows = [];
    for (const side of [-1, 1]) {
      const eg = new THREE.Group();
      eg.position.set(side * 0.22, 0.095, 0.478);

      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.112, 24, 20), eyeMat);
      ball.scale.set(0.96, 1.15, 0.78);

      const irisMat = new THREE.MeshBasicMaterial({ color: 0x6d28d9 });
      this.irisMats.push(irisMat);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.072, 16, 14), irisMat);
      iris.scale.set(0.95, 1.08, 0.52);
      iris.position.set(0, -0.008, 0.048);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.044, 14, 12), eyeMat);
      pupil.scale.set(0.95, 1.05, 0.5);
      pupil.position.set(0, -0.005, 0.068);

      const glint1 = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 10), glintMat);
      glint1.position.set(0.032, 0.046, 0.088);

      const glint2 = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), glintMat);
      glint2.position.set(-0.028, -0.032, 0.086);

      eg.add(ball, iris, pupil, glint1, glint2);
      this.head.add(eg);
      this.eyeGroups.push(eg);

      // Expressive eyebrow
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.11, 6, 10), browMat);
      brow.rotation.z = Math.PI / 2 - side * 0.12;
      brow.position.set(side * 0.22, 0.255, 0.49);
      this.head.add(brow);
      this.brows.push(brow);
    }

    // ---- Long Expressive Cartoon Ears ----
    this.ears = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.25, 0.47, -0.02);

      const outer = new THREE.Mesh(new THREE.SphereGeometry(0.168, 22, 20), fur);
      outer.scale.set(0.84, 2.86, 0.56);
      outer.position.y = 0.46;

      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.112, 18, 16), innerEar);
      inner.scale.set(0.76, 2.38, 0.34);
      inner.position.set(0, 0.45, 0.048);

      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), innerEar);
      tip.scale.set(0.9, 0.72, 0.55);
      tip.position.set(0, 0.9, 0.022);

      pivot.add(outer, inner, tip);
      this.head.add(pivot);
      this.ears.push(pivot);
    }
  }

  _buildSparkles() {
    const N = 64;
    const pos = new Float32Array(N * 3);
    this._sparkLife = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 5.2;
      pos[i * 3 + 1] = Math.random() * 3.4 - 1.1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 3.0;
      this._sparkLife[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    this._sparkPos = pos;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparkMat = new THREE.PointsMaterial({
      color: 0xd8b4fe,
      size: 0.056,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
    });
    this.sparkles = new THREE.Points(geo, this.sparkMat);
    this.scene.add(this.sparkles);
  }

  _buildThinkOrbits() {
    const N = 18;
    const pos = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._orbitPos = geo.attributes.position;
    this.thinkOrbitMat = new THREE.PointsMaterial({
      color: 0xfbbf24,
      size: 0.085,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    this.thinkOrbit = new THREE.Points(geo, this.thinkOrbitMat);
    this.thinkOrbit.position.set(0, 0.85, 0);
    this.root.add(this.thinkOrbit);
  }

  _buildLearnBurst() {
    this._learnStars = [];
    const starMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), starMat.clone());
      m.visible = false;
      this.root.add(m);
      this._learnStars.push({
        mesh: m,
        angle: (i / 12) * Math.PI * 2,
        life: 0,
        radius: 1.6,
        yOffset: (Math.random() - 0.5) * 1.2,
      });
    }
  }

  // ---- Public API ----
  setLook(nx, ny) {
    this.targetLookX = Math.max(-1, Math.min(1, nx));
    this.targetLookY = Math.max(-1, Math.min(1, ny));
  }

  setState(state) {
    this.aiState = state || 'idle';
    if (state === 'listening') {
      this._targetAuraColor.setHex(0x38bdf8); // Bright Gemini Cyan
    } else if (state === 'thinking') {
      this._targetAuraColor.setHex(0xf59e0b); // Warm Golden Neural Glow
    } else if (state === 'speaking') {
      this._targetAuraColor.setHex(0xec4899); // Lively Rose-Violet
    } else {
      this._targetAuraColor.setHex(0x8b5cf6); // Dreamy Cosmic Violet
    }
  }

  setMood(mood) {
    this.mood = mood || 'happy';
    if (mood === 'excited' || mood === 'laughing') {
      this.hopTime = 0.65;
      this.blushBoost = 0.65;
    } else if (mood === 'shy') {
      this.blushBoost = 1.0;
    } else if (mood === 'wise') {
      this.blushBoost = 0.25;
    }
  }

  setVoiceLevel(lvl) {
    this.voiceLevel = Math.max(0, Math.min(1, lvl || 0));
  }

  setMicLevel(lvl) {
    this.micLevel = Math.max(0, Math.min(1, lvl || 0));
  }

  triggerHop() {
    this.hopTime = 0.6;
    this.blushBoost = 0.7;
  }

  triggerWiggle() {
    this.wiggleTime = 0.55;
    this.blushBoost = 0.5;
  }

  triggerLearnBurst() {
    this.learnBurstTime = 1.6;
    this.hopTime = 0.75;
    this.blushBoost = 0.85;
    for (let i = 0; i < this._learnStars.length; i++) {
      const s = this._learnStars[i];
      s.life = 1.4;
      s.radius = 1.7 + Math.random() * 0.4;
      s.angle = (i / this._learnStars.length) * Math.PI * 2;
      s.mesh.visible = true;
    }
  }

  // ---- Main 60 FPS Render Loop ----
  update(dt, t) {
    this._resizeIfNeeded();

    // Smooth reactive audio levels
    this.smoothVoice += (this.voiceLevel - this.smoothVoice) * Math.min(1, dt * 26);
    this.smoothMic += (this.micLevel - this.smoothMic) * Math.min(1, dt * 18);

    // Smooth aura color transition
    this._curAuraColor.lerp(this._targetAuraColor, Math.min(1, dt * 5));
    this.haloMat1.color.copy(this._curAuraColor);
    this.pedestalMat.color.copy(this._curAuraColor);
    this.auraLight.color.copy(this._curAuraColor);
    this.gemMat.color.copy(this._curAuraColor);
    this.gemMat.emissive.copy(this._curAuraColor);

    const isListening = this.aiState === 'listening';
    const isThinking = this.aiState === 'thinking';
    const isSpeaking = this.aiState === 'speaking';

    const reactiveEnergy = isSpeaking ? this.smoothVoice : (isListening ? this.smoothMic : 0);

    // ---- Aura Rings (Gemini Live pulse!) ----
    const ringScale1 = 1.0 + reactiveEnergy * 0.24 + Math.sin(t * 2.4) * 0.025;
    const ringScale2 = 1.0 + reactiveEnergy * 0.36 + Math.cos(t * 1.9) * 0.03;
    this.haloRing1.scale.setScalar(ringScale1);
    this.haloRing2.scale.setScalar(ringScale2);
    this.haloRing1.rotation.z = t * (isThinking ? 1.1 : 0.25);
    this.haloRing2.rotation.z = -t * (isThinking ? 0.8 : 0.18);
    this.haloRing1.rotation.x = Math.sin(t * 0.9) * 0.16;
    this.haloRing2.rotation.y = Math.cos(t * 0.7) * 0.22;
    this.haloMat1.opacity = 0.28 + reactiveEnergy * 0.55 + (isThinking ? 0.22 : 0);
    this.haloMat2.opacity = 0.15 + reactiveEnergy * 0.42;
    this.auraLight.intensity = 0.85 + reactiveEnergy * 1.45;
    this.chestGem.rotation.y = t * (isThinking ? 3.2 : 1.0);
    this.gemMat.emissiveIntensity = 0.75 + reactiveEnergy * 1.6 + (this.learnBurstTime > 0 ? 1.5 : 0);

    // ---- Smooth Eye/Head Look ----
    const autoLookX = isSpeaking ? Math.sin(t * 1.7) * 0.15 : 0;
    const autoLookY = isThinking ? -0.35 : 0;
    this.lookX += ((this.targetLookX + autoLookX) - this.lookX) * Math.min(1, dt * 7);
    this.lookY += ((this.targetLookY + autoLookY) - this.lookY) * Math.min(1, dt * 7);

    // ---- Hop / Body Breathing / Lean-in ----
    let hopY = 0;
    if (this.hopTime > 0) {
      this.hopTime = Math.max(0, this.hopTime - dt);
      hopY = Math.abs(Math.sin(this.hopTime * Math.PI * 3.5)) * 0.26;
    }
    const leanZ = isListening ? 0.16 : 0;
    const speakBob = isSpeaking ? this.smoothVoice * 0.065 : 0;
    this.body.position.y = Math.sin(t * 2.2) * 0.028 + hopY + speakBob;
    this.body.position.z += (leanZ - this.body.position.z) * Math.min(1, dt * 5);

    if (this.wiggleTime > 0) {
      this.wiggleTime = Math.max(0, this.wiggleTime - dt);
      this.body.rotation.y = Math.sin(t * 20) * 0.18 * (this.wiggleTime / 0.55);
    } else {
      this.body.rotation.y += (Math.sin(t * 0.6) * 0.04 - this.body.rotation.y) * Math.min(1, dt * 4);
    }

    // ---- Head Expression ----
    const tiltTarget = isListening
      ? 0.14
      : (isThinking ? -0.18 : (this.mood === 'curious' ? 0.2 : 0));
    this.head.rotation.y = this.lookX * 0.32 + Math.sin(t * 0.85) * 0.035;
    this.head.rotation.x = -this.lookY * 0.2 + (this.mood === 'shy' ? 0.14 : 0) - (isSpeaking ? this.smoothVoice * 0.08 : 0);
    this.head.rotation.z += ((tiltTarget + Math.sin(t * 1.4) * 0.025) - this.head.rotation.z) * Math.min(1, dt * 6);

    // ---- Expressive Ears ----
    const earPerk = isListening ? -0.06 : (this.mood === 'shy' ? 0.34 : (isThinking ? 0.16 : 0.08));
    const earBounce = isSpeaking ? this.smoothVoice * 0.24 : (isListening ? this.smoothMic * 0.16 : 0);
    this.ears[0].rotation.z = 0.12 + earPerk - earBounce + Math.sin(t * 2.4) * 0.055;
    this.ears[1].rotation.z = -0.12 - earPerk + earBounce + Math.cos(t * 2.2) * 0.055;
    this.ears[0].rotation.x = isListening ? 0.14 : (this.mood === 'excited' ? -0.14 : 0.02);
    this.ears[1].rotation.x = this.ears[0].rotation.x;

    // ---- Eyebrows ----
    const browLift = isListening || this.mood === 'curious' || this.mood === 'excited'
      ? 0.035
      : (isSpeaking ? this.smoothVoice * 0.025 : 0);
    this.brows[0].position.y = 0.255 + browLift;
    this.brows[1].position.y = 0.255 + browLift;

    // ---- Blinking ----
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinking = 0.13;
      this.blinkTimer = 2.0 + Math.random() * 3.4;
    }
    const eyeScaleY = this.blinking > 0 ? 0.08 : (this.mood === 'laughing' ? 0.72 : 1.0);
    if (this.blinking > 0) this.blinking = Math.max(0, this.blinking - dt);
    for (const eg of this.eyeGroups) {
      eg.scale.y += (eyeScaleY - eg.scale.y) * Math.min(1, dt * 28);
    }

    // ---- Real-Time Audio Lip-Sync Mouth ----
    const mouthOpen = isSpeaking
      ? Math.max(0.26, Math.min(1.38, 0.24 + this.smoothVoice * 1.45 + Math.abs(Math.sin(t * 17)) * this.smoothVoice * 0.35))
      : 0.20;
    const mouthWide = isSpeaking ? 1.05 + this.smoothVoice * 0.3 : (this.mood === 'happy' || this.mood === 'laughing' ? 1.25 : 1.0);
    this.mouthCavity.scale.y += (mouthOpen - this.mouthCavity.scale.y) * Math.min(1, dt * 30);
    this.mouthCavity.scale.x += (mouthWide - this.mouthCavity.scale.x) * Math.min(1, dt * 16);
    this.tongue.visible = this.mouthCavity.scale.y > 0.45;
    this.tooth.position.y = 0.022 + this.mouthCavity.scale.y * 0.015;

    // ---- Nose & Tail ----
    this.nose.position.y = -0.025 + Math.sin(t * 11) * 0.004;
    this.tail.rotation.z = Math.sin(t * (isSpeaking || isListening ? 10 : 4)) * 0.16;

    // ---- Arms / Paws ----
    if (isThinking) {
      // Cute paw up near chin while thinking!
      this.rightArm.rotation.z += (-0.95 - this.rightArm.rotation.z) * Math.min(1, dt * 7);
      this.rightArm.rotation.x += (-0.45 - this.rightArm.rotation.x) * Math.min(1, dt * 7);
      this.leftArm.rotation.z += (0.08 - this.leftArm.rotation.z) * Math.min(1, dt * 7);
      this.leftArm.rotation.x += (0 - this.leftArm.rotation.x) * Math.min(1, dt * 7);
    } else if (isSpeaking) {
      const g = Math.sin(t * 6.5) * (0.12 + this.smoothVoice * 0.35);
      this.leftArm.rotation.z += (g - this.leftArm.rotation.z) * Math.min(1, dt * 12);
      this.rightArm.rotation.z += (-g - this.rightArm.rotation.z) * Math.min(1, dt * 12);
      this.leftArm.rotation.x += (-0.12 - this.leftArm.rotation.x) * Math.min(1, dt * 8);
      this.rightArm.rotation.x += (-0.12 - this.rightArm.rotation.x) * Math.min(1, dt * 8);
    } else {
      this.leftArm.rotation.z += (0.05 - this.leftArm.rotation.z) * Math.min(1, dt * 6);
      this.rightArm.rotation.z += (-0.05 - this.rightArm.rotation.z) * Math.min(1, dt * 6);
      this.leftArm.rotation.x += (0 - this.leftArm.rotation.x) * Math.min(1, dt * 6);
      this.rightArm.rotation.x += (0 - this.rightArm.rotation.x) * Math.min(1, dt * 6);
    }

    // ---- Blush ----
    if (this.blushBoost > 0) this.blushBoost = Math.max(0, this.blushBoost - dt * 0.25);
    this.blushMat.opacity = 0.3 + this.blushBoost * 0.45 + (isSpeaking ? this.smoothVoice * 0.2 : 0);

    // ---- Thinking Neural Orbit ----
    const targetOrbitOp = isThinking ? 0.9 : 0;
    this.thinkOrbitMat.opacity += (targetOrbitOp - this.thinkOrbitMat.opacity) * Math.min(1, dt * 6);
    if (this.thinkOrbitMat.opacity > 0.01) {
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2 + t * 2.8;
        this._orbitPos.array[i * 3] = Math.cos(a) * 0.92;
        this._orbitPos.array[i * 3 + 1] = Math.sin(a * 2 + t) * 0.22;
        this._orbitPos.array[i * 3 + 2] = Math.sin(a) * 0.72;
      }
      this._orbitPos.needsUpdate = true;
    }

    // ---- Learning Knowledge Absorption Burst ----
    if (this.learnBurstTime > 0) {
      this.learnBurstTime = Math.max(0, this.learnBurstTime - dt);
    }
    for (const s of this._learnStars) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        continue;
      }
      const prog = 1 - s.life / 1.4;
      const r = s.radius * (1 - prog * 0.85);
      const a = s.angle + prog * Math.PI * 3;
      s.mesh.position.set(Math.cos(a) * r, 0.25 + s.yOffset * (1 - prog), Math.sin(a) * r * 0.65);
      s.mesh.rotation.y += dt * 5;
      s.mesh.material.opacity = Math.sin(prog * Math.PI) * 0.95;
      s.mesh.scale.setScalar(0.6 + Math.sin(prog * Math.PI) * 0.7);
    }

    // ---- Ambient Cosmic Sparkles ----
    this.sparkles.rotation.y = t * 0.05;
    for (let i = 0; i < this._sparkLife.length; i++) {
      this._sparkLife[i] -= dt * 0.14;
      if (this._sparkLife[i] < 0) {
        this._sparkLife[i] = 0.8 + Math.random() * 0.6;
        this._sparkPos[i * 3] = (Math.random() - 0.5) * 5.2;
        this._sparkPos[i * 3 + 1] = Math.random() * 3.4 - 1.1;
        this._sparkPos[i * 3 + 2] = (Math.random() - 0.5) * 2.8;
      }
    }
    this.sparkles.geometry.attributes.position.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }

  _resizeIfNeeded() {
    const w = this.canvas.clientWidth || window.innerWidth || 360;
    const h = this.canvas.clientHeight || window.innerHeight || 480;
    if (this._w === w && this._h === h) return;
    this._w = w;
    this._h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Automatically frame the bunny generously on both narrow mobile screens and wide desktops
    const aspect = w / h;
    this.camera.position.z = aspect < 0.75 ? 6.2 : (aspect < 1.0 ? 5.6 : 5.0);
    this.camera.position.y = aspect < 0.75 ? 0.25 : 0.42;
    this.camera.updateProjectionMatrix();
  }
}
