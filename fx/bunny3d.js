import * as THREE from 'three';

export class Bunny3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    this.camera.position.set(0, 0.55, 5.2);

    // Warm studio lighting
    this.scene.add(new THREE.AmbientLight(0xdbeafe, 0.9));
    const key = new THREE.DirectionalLight(0xfff5e8, 1.35);
    key.position.set(2.5, 4, 4);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0xa78bfa, 0.9);
    rim.position.set(-3, 2.5, -2.5);
    this.scene.add(rim);

    const bounce = new THREE.PointLight(0xffb4d8, 0.65, 10);
    bounce.position.set(0, -1.2, 2.2);
    this.scene.add(bounce);

    this.root = new THREE.Group();
    this.root.position.y = -0.35;
    this.scene.add(this.root);

    this._buildBunny();
    this._buildSparkles();

    this.lookX = 0;
    this.lookY = 0;
    this.targetLookX = 0;
    this.targetLookY = 0;
    this.mood = 'happy';
    this.speaking = false;
    this.speakEnergy = 0;
    this.hopTime = 0;
    this.blinkTimer = 2.5;
    this.blinking = 0;
    this.blushBoost = 0;
    this.carrotTime = 0;
  }

  _buildBunny() {
    const furMat = new THREE.MeshStandardMaterial({ color: 0xf8f6ff, roughness: 0.72, metalness: 0.03 });
    const innerEarMat = new THREE.MeshStandardMaterial({ color: 0xffa8c8, roughness: 0.6 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xff6b9d, roughness: 0.45 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x161224, roughness: 0.12, metalness: 0.3 });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.blushMat = new THREE.MeshBasicMaterial({ color: 0xff7aa8, transparent: true, opacity: 0.35 });
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0x9b3b64, roughness: 0.5 });

    // Soft ground glow disc
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 36),
      new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.18 })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.78;
    this.root.add(disc);

    // Body
    this.body = new THREE.Group();
    this.root.add(this.body);

    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.68, 32, 28), furMat);
    torso.scale.set(0.95, 1.08, 0.88);
    torso.position.y = -0.15;
    this.body.add(torso);

    const belly = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 24, 20),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })
    );
    belly.scale.set(0.9, 1.02, 0.45);
    belly.position.set(0, -0.18, 0.42);
    this.body.add(belly);

    // Fluffy tail
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), furMat);
    tail.position.set(0, -0.45, -0.58);
    this.body.add(tail);

    // Feet
    [-0.32, 0.32].forEach((x) => {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 16), furMat);
      foot.scale.set(0.95, 0.62, 1.35);
      foot.position.set(x, -0.72, 0.25);
      this.body.add(foot);
    });

    // Paws
    this.leftPaw = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 16), furMat);
    this.leftPaw.scale.set(0.85, 1.15, 0.85);
    this.leftPaw.position.set(-0.56, -0.08, 0.36);
    this.body.add(this.leftPaw);

    this.rightPaw = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 16), furMat);
    this.rightPaw.scale.set(0.85, 1.15, 0.85);
    this.rightPaw.position.set(0.56, -0.08, 0.36);
    this.body.add(this.rightPaw);

    // Carrot (hidden unless fed)
    this.carrot = new THREE.Group();
    const cBody = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.45, 14),
      new THREE.MeshStandardMaterial({ color: 0xff7b1c, roughness: 0.5 })
    );
    cBody.rotation.z = Math.PI / 2.2;
    const cLeaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.18, 10),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.6 })
    );
    cLeaf.position.set(0.24, 0.05, 0);
    cLeaf.rotation.z = -Math.PI / 2;
    this.carrot.add(cBody, cLeaf);
    this.carrot.position.set(0, -0.08, 0.68);
    this.carrot.visible = false;
    this.body.add(this.carrot);

    // Head group
    this.head = new THREE.Group();
    this.head.position.set(0, 0.66, 0.06);
    this.body.add(this.head);

    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.56, 32, 28), furMat);
    cranium.scale.set(1.06, 0.94, 0.96);
    this.head.add(cranium);

    // Chubby cheeks
    [-0.28, 0.28].forEach((x) => {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 16), furMat);
      cheek.position.set(x, -0.14, 0.38);
      this.head.add(cheek);

      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16), this.blushMat);
      blush.position.set(x * 1.18, -0.11, 0.54);
      blush.rotation.y = x < 0 ? -0.35 : 0.35;
      this.head.add(blush);
    });

    // Nose
    this.nose = new THREE.Mesh(new THREE.SphereGeometry(0.068, 16, 14), noseMat);
    this.nose.scale.set(1.25, 0.85, 0.85);
    this.nose.position.set(0, -0.03, 0.55);
    this.head.add(this.nose);

    // Mouth (animates when speaking)
    this.mouth = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), mouthMat);
    this.mouth.scale.set(1.1, 0.3, 0.6);
    this.mouth.position.set(0, -0.15, 0.52);
    this.head.add(this.mouth);

    // Eyes
    this.eyes = [];
    [-0.21, 0.21].forEach((x) => {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(x, 0.08, 0.46);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.095, 20, 18), eyeMat);
      ball.scale.set(0.95, 1.12, 0.8);
      const glint1 = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 10), glintMat);
      glint1.position.set(0.028, 0.035, 0.07);
      const glint2 = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), glintMat);
      glint2.position.set(-0.025, -0.025, 0.072);
      eyeGroup.add(ball, glint1, glint2);
      this.head.add(eyeGroup);
      this.eyes.push(eyeGroup);
    });

    // Ears
    const buildEar = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.24, 0.45, -0.02);
      const outer = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 18), furMat);
      outer.scale.set(0.82, 2.75, 0.55);
      outer.position.y = 0.42;
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 14), innerEarMat);
      inner.scale.set(0.75, 2.3, 0.35);
      inner.position.set(0, 0.40, 0.045);
      pivot.add(outer, inner);
      this.head.add(pivot);
      return pivot;
    };
    this.earL = buildEar(-1);
    this.earR = buildEar(1);
  }

  _buildSparkles() {
    const N = 36;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 4.2;
      pos[i * 3 + 1] = Math.random() * 2.8 - 0.8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2.4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparkles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xd8b4fe, size: 0.055, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending })
    );
    this.scene.add(this.sparkles);
  }

  setLook(nx, ny) {
    this.targetLookX = Math.max(-1, Math.min(1, nx));
    this.targetLookY = Math.max(-1, Math.min(1, ny));
  }

  setMood(mood) {
    this.mood = mood || 'happy';
    if (mood === 'excited' || mood === 'laughing') this.hopTime = 0.7;
    if (mood === 'shy') this.blushBoost = 1.0;
  }

  triggerHop() {
    this.hopTime = 0.65;
    this.blushBoost = 1.0;
  }

  triggerCarrot() {
    this.carrotTime = 3.2;
    this.hopTime = 0.55;
  }

  resize() {
    const w = this.canvas.clientWidth || 320;
    const h = this.canvas.clientHeight || 320;
    if (this._w === w && this._h === h) return;
    this._w = w;
    this._h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt, t) {
    this.resize();

    // Smooth look
    this.lookX += (this.targetLookX - this.lookX) * Math.min(1, dt * 7);
    this.lookY += (this.targetLookY - this.lookY) * Math.min(1, dt * 7);

    // Breathing & hopping
    let hopY = 0;
    if (this.hopTime > 0) {
      this.hopTime = Math.max(0, this.hopTime - dt);
      hopY = Math.abs(Math.sin(this.hopTime * Math.PI * 3.1)) * 0.24;
    }
    this.body.position.y = Math.sin(t * 2.2) * 0.025 + hopY;

    // Head orientation
    const curiosityTilt = this.mood === 'curious' ? 0.22 : (this.mood === 'thinking' ? -0.15 : 0);
    this.head.rotation.y = this.lookX * 0.34 + Math.sin(t * 0.9) * 0.04;
    this.head.rotation.x = -this.lookY * 0.22 + (this.mood === 'shy' ? 0.12 : 0);
    this.head.rotation.z = curiosityTilt + Math.sin(t * 1.4) * 0.03;

    // Ears animation
    const earDroop = this.mood === 'shy' ? 0.32 : (this.mood === 'thinking' ? 0.16 : 0.05);
    this.earL.rotation.z = 0.14 + earDroop + Math.sin(t * 2.6) * 0.06;
    this.earR.rotation.z = -0.14 - earDroop + Math.cos(t * 2.4) * 0.06;
    this.earL.rotation.x = this.mood === 'excited' ? -0.15 : 0.05;
    this.earR.rotation.x = this.mood === 'excited' ? -0.15 : 0.05;

    // Nose twitch
    this.nose.position.y = -0.03 + Math.sin(t * 11) * 0.005;

    // Blinking
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinking = 0.16;
      this.blinkTimer = 2.2 + Math.random() * 3.2;
    }
    let eyeScaleY = 1;
    if (this.blinking > 0) {
      this.blinking = Math.max(0, this.blinking - dt);
      eyeScaleY = 0.12;
    }
    for (const e of this.eyes) {
      e.scale.y += (eyeScaleY - e.scale.y) * Math.min(1, dt * 26);
    }

    // Mouth / speaking
    const wantSpeak = this.speaking ? (0.45 + Math.abs(Math.sin(t * 18)) * 0.75) : 0.22;
    this.speakEnergy += (wantSpeak - this.speakEnergy) * Math.min(1, dt * 20);
    this.mouth.scale.y = this.speakEnergy;

    // Paws & carrot
    if (this.carrotTime > 0) {
      this.carrotTime = Math.max(0, this.carrotTime - dt);
      this.carrot.visible = true;
      this.carrot.rotation.y = Math.sin(t * 5) * 0.15;
      this.leftPaw.position.set(-0.26, -0.06, 0.56);
      this.rightPaw.position.set(0.26, -0.06, 0.56);
    } else {
      this.carrot.visible = false;
      const wave = (this.mood === 'excited' || this.speaking) ? Math.sin(t * 6) * 0.07 : 0;
      this.leftPaw.position.set(-0.54, -0.08 + wave, 0.38);
      this.rightPaw.position.set(0.54, -0.08 - wave, 0.38);
    }

    // Blush
    if (this.blushBoost > 0) this.blushBoost = Math.max(0, this.blushBoost - dt * 0.35);
    this.blushMat.opacity = 0.32 + this.blushBoost * 0.45;

    // Sparkles
    this.sparkles.rotation.y = t * 0.08;
    this.renderer.render(this.scene, this.camera);
  }
}
