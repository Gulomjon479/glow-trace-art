import * as THREE from 'three';

export class Bunny3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    this.camera.position.set(0, 0.55, 5.2);

    this.scene.add(new THREE.AmbientLight(0xdbeafe, 1.0));
    const key = new THREE.DirectionalLight(0xfff5e8, 1.4);
    key.position.set(2.5, 4, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xa78bfa, 0.9);
    rim.position.set(-3, 2.5, -2.5);
    this.scene.add(rim);
    this.bouncePt = new THREE.PointLight(0xffb4d8, 0.65, 10);
    this.bouncePt.position.set(0, -1.2, 2.2);
    this.scene.add(this.bouncePt);

    this.root = new THREE.Group();
    this.root.position.y = -0.35;
    this.scene.add(this.root);

    this._buildBunny();
    this._buildSparkles();
    this._buildHearts();
    this._buildDanceParticles();

    this.lookX = 0; this.lookY = 0;
    this.targetLookX = 0; this.targetLookY = 0;
    this.mood = 'happy';
    this.speaking = false; this.speakEnergy = 0;
    this.hopTime = 0; this.hopCount = 0;
    this.blinkTimer = 2.5; this.blinking = 0;
    this.blushBoost = 0; this.carrotTime = 0;
    this.danceTime = 0; this.dancePhase = 0;
    this.tailWiggle = 0;
    this.shakeTime = 0;
    this.sleepTime = 0; this.sleeping = false;
    this.heartBurst = 0;
    this.waveTime = 0;
  }

  _buildBunny() {
    const fur = new THREE.MeshStandardMaterial({ color: 0xf8f6ff, roughness: 0.72, metalness: 0.03 });
    const furDark = new THREE.MeshStandardMaterial({ color: 0xe8e4f8, roughness: 0.75, metalness: 0.02 });
    const innerEar = new THREE.MeshStandardMaterial({ color: 0xffa8c8, roughness: 0.6 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xff6b9d, roughness: 0.45 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x161224, roughness: 0.12, metalness: 0.3 });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.blushMat = new THREE.MeshBasicMaterial({ color: 0xff7aa8, transparent: true, opacity: 0.35 });
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0x9b3b64, roughness: 0.5 });

    // Glow ground disc
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.3, 40),
      new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.78;
    this.root.add(disc);

    // ---- Body ----
    this.body = new THREE.Group();
    this.root.add(this.body);

    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.68, 32, 28), fur);
    torso.scale.set(0.95, 1.08, 0.88);
    torso.position.y = -0.15;
    this.body.add(torso);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.46, 24, 20),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 }));
    belly.scale.set(0.9, 1.0, 0.44);
    belly.position.set(0, -0.18, 0.43);
    this.body.add(belly);

    // Fluffy tail (animated separately)
    this.tail = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 16), fur);
    this.tail.position.set(0, -0.46, -0.6);
    this.body.add(this.tail);

    // Feet
    for (const x of [-0.32, 0.32]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 16), fur);
      foot.scale.set(0.95, 0.62, 1.38);
      foot.position.set(x, -0.72, 0.26);
      this.body.add(foot);
      // Toe bumps
      for (let i = 0; i < 3; i++) {
        const toe = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), furDark);
        toe.position.set(x + (i - 1) * 0.085, -0.78, 0.5);
        this.body.add(toe);
      }
    }

    // Arms/paws
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.62, 0.0, 0.0);
    this.body.add(this.leftArm);
    const lArmMesh = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 14), fur);
    lArmMesh.scale.set(0.8, 1.2, 0.8);
    this.leftArm.add(lArmMesh);
    this.leftPaw = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), fur);
    this.leftPaw.position.set(-0.04, -0.26, 0.28);
    this.leftArm.add(this.leftPaw);

    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.62, 0.0, 0.0);
    this.body.add(this.rightArm);
    const rArmMesh = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 14), fur);
    rArmMesh.scale.set(0.8, 1.2, 0.8);
    this.rightArm.add(rArmMesh);
    this.rightPaw = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), fur);
    this.rightPaw.position.set(0.04, -0.26, 0.28);
    this.rightArm.add(this.rightPaw);

    // Carrot prop
    this.carrot = new THREE.Group();
    const cBody = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.44, 12),
      new THREE.MeshStandardMaterial({ color: 0xff7b1c, roughness: 0.5 }));
    cBody.rotation.z = Math.PI / 2.2;
    const cLeaf1 = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.17, 8),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.6 }));
    cLeaf1.position.set(0.23, 0.07, 0); cLeaf1.rotation.z = -1.3;
    const cLeaf2 = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.14, 7),
      new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.6 }));
    cLeaf2.position.set(0.21, -0.04, 0.05); cLeaf2.rotation.z = -1.0; cLeaf2.rotation.y = 0.4;
    this.carrot.add(cBody, cLeaf1, cLeaf2);
    this.carrot.position.set(0.08, -0.05, 0.6);
    this.carrot.visible = false;
    this.body.add(this.carrot);

    // Sleep zzz dot (shown when sleeping)
    this.sleepBubble = new THREE.Group();
    const zMat = new THREE.MeshBasicMaterial({ color: 0xc4b5fd, transparent: true, opacity: 0.0 });
    this.zMesh = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), zMat);
    this.sleepBubble.add(this.zMesh);
    this.sleepBubble.position.set(0.5, 0.65, 0);
    this.root.add(this.sleepBubble);
    this.zMat = zMat;

    // ---- Head ----
    this.head = new THREE.Group();
    this.head.position.set(0, 0.66, 0.06);
    this.body.add(this.head);

    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.56, 32, 28), fur);
    cranium.scale.set(1.06, 0.95, 0.96);
    this.head.add(cranium);

    // Cheeks
    for (const x of [-0.28, 0.28]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 16), fur);
      cheek.position.set(x, -0.14, 0.38); this.head.add(cheek);
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.115, 20), this.blushMat);
      blush.position.set(x * 1.19, -0.11, 0.55);
      blush.rotation.y = x < 0 ? -0.35 : 0.35;
      this.head.add(blush);
    }

    // Nose
    this.nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 14), noseMat);
    this.nose.scale.set(1.25, 0.84, 0.84);
    this.nose.position.set(0, -0.03, 0.555);
    this.head.add(this.nose);

    // Whiskers (lines)
    for (const side of [-1, 1]) {
      for (const dy of [-0.02, 0.025]) {
        const pts = [
          new THREE.Vector3(side * 0.08, dy, 0.52),
          new THREE.Vector3(side * 0.42, dy + side * 0.015, 0.4),
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xd0cce8, transparent: true, opacity: 0.55 }));
        this.head.add(line);
      }
    }

    // Mouth (animates when speaking)
    this.mouth = new THREE.Mesh(new THREE.SphereGeometry(0.078, 14, 12), mouthMat);
    this.mouth.scale.set(1.1, 0.28, 0.6);
    this.mouth.position.set(0, -0.158, 0.52);
    this.head.add(this.mouth);

    // Eyes
    this.eyes = [];
    this.eyeGroups = [];
    for (const x of [-0.21, 0.21]) {
      const eg = new THREE.Group();
      eg.position.set(x, 0.085, 0.464);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.096, 20, 18), eyeMat);
      ball.scale.set(0.95, 1.12, 0.78);
      const glint1 = new THREE.Mesh(new THREE.SphereGeometry(0.029, 10, 10), glintMat);
      glint1.position.set(0.028, 0.038, 0.072);
      const glint2 = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), glintMat);
      glint2.position.set(-0.026, -0.026, 0.072);
      // Iris color dot
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0x4c1d95 }));
      iris.scale.z = 0.5;
      iris.position.z = 0.04;
      eg.add(ball, iris, glint1, glint2);
      this.head.add(eg);
      this.eyes.push(ball);
      this.eyeGroups.push(eg);
    }

    // Ears
    this.ears = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.24, 0.45, -0.02);
      const outer = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 18), fur);
      outer.scale.set(0.82, 2.76, 0.56); outer.position.y = 0.43;
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.108, 16, 14), innerEar);
      inner.scale.set(0.76, 2.32, 0.34); inner.position.set(0, 0.42, 0.045);
      // Ear tip
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), innerEar);
      tip.scale.set(0.9, 0.7, 0.55); tip.position.set(0, 0.85, 0.02);
      pivot.add(outer, inner, tip);
      this.head.add(pivot);
      this.ears.push(pivot);
    }
  }

  _buildSparkles() {
    const N = 44;
    const pos = new Float32Array(N * 3);
    this._sparkV = new Float32Array(N * 3);
    this._sparkLife = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i*3] = (Math.random()-0.5)*4.5;
      pos[i*3+1] = Math.random()*3.0-0.9;
      pos[i*3+2] = (Math.random()-0.5)*2.6;
      this._sparkLife[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    this._sparkPos = pos;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparkles = new THREE.Points(geo,
      new THREE.PointsMaterial({ color: 0xd8b4fe, size: 0.052, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending }));
    this.scene.add(this.sparkles);
  }

  _buildHearts() {
    this._hearts = [];
    const hMat = new THREE.MeshBasicMaterial({ color: 0xff5fa0, transparent: true, opacity: 0.0 });
    for (let i = 0; i < 6; i++) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), hMat.clone());
      h.position.set((Math.random()-0.5)*1.4, 0.8+i*0.4, (Math.random()-0.5)*0.6);
      h.visible = false;
      this.root.add(h);
      this._hearts.push({ mesh: h, vy: 0.5+Math.random()*0.4, life: 0, active: false });
    }
  }

  _buildDanceParticles() {
    const N = 24;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = (i/N)*Math.PI*2;
      pos[i*3] = Math.cos(a)*1.1;
      pos[i*3+1] = -0.4;
      pos[i*3+2] = Math.sin(a)*0.7;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._dancePts = geo.attributes.position;
    this.danceRing = new THREE.Points(geo,
      new THREE.PointsMaterial({ color: 0xfbbf24, size: 0.07, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending }));
    this.root.add(this.danceRing);
  }

  // ---- Public API ----
  setLook(nx, ny) {
    this.targetLookX = Math.max(-1, Math.min(1, nx));
    this.targetLookY = Math.max(-1, Math.min(1, ny));
  }

  setMood(mood) {
    this.mood = mood || 'happy';
    if (mood === 'excited') { this.hopTime = 0.7; this.blushBoost = 0.5; }
    if (mood === 'laughing') { this.hopTime = 0.55; this.danceTime = 1.4; }
    if (mood === 'shy') this.blushBoost = 1.0;
    if (mood === 'happy') this.heartBurst = 0.5;
    this.sleeping = false;
  }

  triggerHop(count = 1) {
    this.hopTime = 0.6 + count * 0.15;
    this.hopCount = count;
    this.blushBoost = 0.7;
    this.heartBurst = 0.6;
    this.sleeping = false;
  }

  triggerCarrot() {
    this.carrotTime = 3.5;
    this.hopTime = 0.6;
    this.blushBoost = 1.0;
    this.sleeping = false;
  }

  triggerDance() {
    this.danceTime = 3.2;
    this.hopTime = 0.5;
    this.blushBoost = 0.5;
    this.sleeping = false;
  }

  triggerSleep() {
    this.sleeping = true;
    this.sleepTime = 0;
    this.mood = 'shy';
  }

  triggerWave() {
    this.waveTime = 2.0;
    this.sleeping = false;
  }

  triggerShake() {
    this.shakeTime = 0.55;
    this.sleeping = false;
  }

  burstHearts() {
    for (const h of this._hearts) {
      h.active = true;
      h.life = 1.0 + Math.random() * 0.5;
      h.mesh.position.set((Math.random()-0.5)*1.2, 0.5+Math.random()*0.5, (Math.random()-0.5)*0.5);
      h.mesh.visible = true;
      h.vy = 0.6 + Math.random() * 0.5;
    }
  }

  // ---- Main update ----
  update(dt, t) {
    this._resizeIfNeeded();

    // Smooth look (but stop looking while sleeping)
    if (!this.sleeping) {
      this.lookX += (this.targetLookX - this.lookX) * Math.min(1, dt * 7.5);
      this.lookY += (this.targetLookY - this.lookY) * Math.min(1, dt * 7.5);
    }

    // ---- Sleeping ----
    if (this.sleeping) {
      this.sleepTime += dt;
      this.body.position.y = Math.sin(t * 1.4) * 0.012 - 0.08;
      this.head.rotation.x = 0.28;
      this.head.rotation.y = Math.sin(t * 0.4) * 0.04;
      this.head.rotation.z = 0.12;
      this.ears[0].rotation.z = 0.35; this.ears[1].rotation.z = -0.35;
      for (const e of this.eyeGroups) e.scale.y = 0.08;
      this.zMat.opacity = Math.min(0.75, this.sleepTime * 0.5) * (0.7 + Math.sin(t * 2.2) * 0.3);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.zMat.opacity = Math.max(0, this.zMat.opacity - dt * 2.5);

    // ---- Hop / dance ----
    let hopY = 0;
    if (this.hopTime > 0) {
      this.hopTime = Math.max(0, this.hopTime - dt);
      hopY = Math.abs(Math.sin(this.hopTime * Math.PI * (this.hopCount > 1 ? 5 : 3))) * 0.28;
    }

    let danceX = 0, danceZ = 0;
    if (this.danceTime > 0) {
      this.danceTime = Math.max(0, this.danceTime - dt);
      this.dancePhase += dt * 8;
      danceX = Math.sin(this.dancePhase) * 0.14;
      this.root.rotation.y = Math.sin(this.dancePhase * 0.5) * 0.35;
      this.danceRing.material.opacity = Math.min(0.65, this.danceTime * 0.4);
      // Animate dance ring
      for (let i = 0; i < 24; i++) {
        const a = (i/24)*Math.PI*2 + this.dancePhase;
        this._dancePts.array[i*3] = Math.cos(a)*1.1;
        this._dancePts.array[i*3+1] = -0.4 + Math.abs(Math.sin(this.dancePhase*2 + i)) * 0.35;
        this._dancePts.array[i*3+2] = Math.sin(a)*0.7;
      }
      this._dancePts.needsUpdate = true;
    } else {
      this.root.rotation.y += (-this.root.rotation.y) * Math.min(1, dt * 4);
      this.danceRing.material.opacity = Math.max(0, this.danceRing.material.opacity - dt * 2);
    }

    // Breathing base
    this.body.position.set(danceX, Math.sin(t * 2.2) * 0.025 + hopY, danceZ);

    // ---- Head ----
    const curiosityTilt = this.mood === 'curious' ? 0.26 : (this.mood === 'thinking' ? -0.18 : 0);
    const shyDroop = this.mood === 'shy' ? 0.18 : 0;
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      this.head.rotation.y = Math.sin(t * 28) * 0.22;
    } else {
      this.head.rotation.y = this.lookX * 0.35 + Math.sin(t * 0.9) * 0.04;
    }
    this.head.rotation.x = -this.lookY * 0.22 + shyDroop;
    this.head.rotation.z = curiosityTilt + Math.sin(t * 1.4) * 0.03;

    // ---- Ears ----
    const earDroop = (this.mood === 'shy' || this.sleeping) ? 0.36 : (this.mood === 'thinking' ? 0.18 : 0.06);
    const earExcite = (this.mood === 'excited') ? -0.18 : 0.04;
    this.ears[0].rotation.z = 0.14 + earDroop + Math.sin(t * 2.6) * 0.065;
    this.ears[1].rotation.z = -0.14 - earDroop + Math.cos(t * 2.4) * 0.065;
    this.ears[0].rotation.x = earExcite;
    this.ears[1].rotation.x = earExcite;

    // ---- Tail wiggle ----
    this.tailWiggle = (this.mood === 'excited' || this.mood === 'happy') ? 1 : 0.3;
    this.tail.rotation.z = Math.sin(t * 9 * this.tailWiggle) * 0.18 * this.tailWiggle;
    this.tail.rotation.x = Math.cos(t * 7) * 0.08;

    // ---- Nose twitch ----
    this.nose.position.y = -0.03 + Math.sin(t * 11.5) * 0.0045;
    this.nose.scale.x = 1.25 + Math.sin(t * 11.5) * 0.045;

    // ---- Blink ----
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinking = 0.14;
      this.blinkTimer = 1.8 + Math.random() * 3.4;
    }
    const eyeTargetScaleY = this.blinking > 0 ? 0.1 : 1;
    if (this.blinking > 0) this.blinking = Math.max(0, this.blinking - dt);
    for (const eg of this.eyeGroups) {
      eg.scale.y += (eyeTargetScaleY - eg.scale.y) * Math.min(1, dt * 28);
    }

    // ---- Mouth (speaking) ----
    const wantSpeak = this.speaking ? (0.42 + Math.abs(Math.sin(t * 19)) * 0.78) : 0.22;
    this.speakEnergy += (wantSpeak - this.speakEnergy) * Math.min(1, dt * 22);
    this.mouth.scale.y = this.speakEnergy;

    // ---- Arms / paws ----
    if (this.waveTime > 0) {
      this.waveTime = Math.max(0, this.waveTime - dt);
      this.rightArm.rotation.z = -Math.PI * 0.55 + Math.sin(t * 9) * 0.4;
      this.leftArm.rotation.z = 0;
    } else if (this.carrotTime > 0) {
      this.carrotTime = Math.max(0, this.carrotTime - dt);
      this.carrot.visible = true;
      this.carrot.rotation.y = Math.sin(t * 5) * 0.14;
      this.leftArm.rotation.z = -0.45;
      this.rightArm.rotation.z = 0.45;
    } else {
      this.carrot.visible = false;
      const swing = (this.danceTime > 0) ? Math.sin(t * 8) * 0.35 : 0;
      const speakSwing = this.speaking ? Math.sin(t * 6) * 0.07 : 0;
      this.leftArm.rotation.z = swing + speakSwing;
      this.rightArm.rotation.z = -swing - speakSwing;
    }

    // ---- Blush ----
    if (this.blushBoost > 0) this.blushBoost = Math.max(0, this.blushBoost - dt * 0.3);
    this.blushMat.opacity = 0.3 + this.blushBoost * 0.5;

    // ---- Sparkles ambient ----
    this.sparkles.rotation.y = t * 0.07;
    for (let i = 0; i < this._sparkLife.length; i++) {
      this._sparkLife[i] -= dt * 0.18;
      if (this._sparkLife[i] < 0) {
        this._sparkLife[i] = 0.8 + Math.random() * 0.5;
        this._sparkPos[i*3]   = (Math.random()-0.5)*4.2;
        this._sparkPos[i*3+1] = Math.random()*2.9-0.9;
        this._sparkPos[i*3+2] = (Math.random()-0.5)*2.4;
      }
    }
    this.sparkles.geometry.attributes.position.needsUpdate = true;

    // ---- Heart particles ----
    if (this.heartBurst > 0) {
      this.heartBurst -= dt;
      if (this.heartBurst <= 0) this.burstHearts();
    }
    for (const h of this._hearts) {
      if (!h.active) continue;
      h.life -= dt;
      if (h.life <= 0) { h.mesh.visible = false; h.active = false; continue; }
      h.mesh.position.y += h.vy * dt;
      h.mesh.position.x += Math.sin(h.life * 4) * dt * 0.08;
      h.mesh.material.opacity = Math.min(0.9, h.life * 1.5);
      h.mesh.scale.setScalar(0.6 + Math.sin(h.life * 6) * 0.2);
    }

    // ---- Bounce light pulse (excited) ----
    this.bouncePt.intensity = 0.65 + (this.mood === 'excited' ? Math.abs(Math.sin(t * 5)) * 0.45 : 0);

    this.renderer.render(this.scene, this.camera);
  }

  _resizeIfNeeded() {
    const w = this.canvas.clientWidth || 320;
    const h = this.canvas.clientHeight || 320;
    if (this._w === w && this._h === h) return;
    this._w = w; this._h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
