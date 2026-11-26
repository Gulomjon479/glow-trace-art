import * as THREE from 'three';

/**
 * Quyon Og'a / Bilimdon Quyon — Full-body animated cartoon hare
 * Inspired by classic storybook cartoon hare: warm ginger-brown fur, long expressive ears,
 * sky-blue eyes, red bandana neckerchief, golden-yellow shirt, berry vest, adventure trousers,
 * big expressive feet, autonomous walking/hopping around a sunny forest glade, webcam eye/body tracking,
 * real-time audio lip-sync, and rich Marusya-style emotions (happy, excited, wise, laughing, sad, offended, surprised, shy).
 */
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
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
    // Pulled back slightly so the whole lively bunny stands clearly in his forest glade!
    this.camera.position.set(0, 1.05, 7.6);
    this.camera.lookAt(0, 0.65, 0);

    // Warm storybook sunlight + forest bounce lighting
    this.hemiLight = new THREE.HemisphereLight(0xc7ecff, 0x2d5a27, 1.2);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff5d6, 1.65);
    this.sunLight.position.set(4.5, 7.5, 5.5);
    this.scene.add(this.sunLight);

    this.rimLight = new THREE.DirectionalLight(0x60a5fa, 0.85);
    this.rimLight.position.set(-4.5, 4.0, -3.5);
    this.scene.add(this.rimLight);

    this.magicLight = new THREE.PointLight(0x38bdf8, 0.95, 14);
    this.magicLight.position.set(0, 1.2, 2.2);
    this.scene.add(this.magicLight);

    this._buildForestWorld();

    // Character root moves & turns freely across the clearing!
    this.charRoot = new THREE.Group();
    this.charRoot.position.set(0, 0, 0);
    this.scene.add(this.charRoot);

    this._buildHareCharacter();
    this._buildMagicFireflies();
    this._buildEmotionProps();

    // ---- Autonomous locomotion & interactive state ----
    this.posX = 0;
    this.posZ = 0;
    this.targetX = 0;
    this.targetZ = 0;
    this.facingYaw = 0;
    this.targetYaw = 0;
    this.walkPhase = 0;
    this.roamTimer = 2.6;

    this.lookX = 0;
    this.lookY = 0;
    this.targetLookX = 0;
    this.targetLookY = 0;
    this.camUserX = null; // From real webcam face tracking!
    this.camUserY = null;

    this.aiState = 'idle'; // 'idle' | 'listening' | 'thinking' | 'speaking'
    this.mood = 'happy';   // 'happy'|'excited'|'wise'|'curious'|'laughing'|'sad'|'offended'|'surprised'|'shy'
    this.voiceLevel = 0;
    this.smoothVoice = 0;
    this.micLevel = 0;
    this.smoothMic = 0;

    this.blinkTimer = 2.2;
    this.blinking = 0;
    this.hopTime = 0;
    this.waveTime = 0;
    this.learnBurstTime = 0;
    this.blushBoost = 0;
    this.footTapPhase = 0;

    this._curRingColor = new THREE.Color(0x38bdf8);
    this._targetRingColor = new THREE.Color(0x38bdf8);
  }

  _buildForestWorld() {
    this.world = new THREE.Group();
    this.scene.add(this.world);

    // Sunny grassy clearing hill
    const meadow = new THREE.Mesh(
      new THREE.CylinderGeometry(5.6, 6.8, 0.7, 48),
      new THREE.MeshStandardMaterial({ color: 0x3b8c3b, roughness: 0.92 })
    );
    meadow.position.set(0, -0.35, -0.2);
    this.world.add(meadow);

    // Warm sunlit dirt path ring in center
    const pathDisc = new THREE.Mesh(
      new THREE.CircleGeometry(2.45, 42),
      new THREE.MeshStandardMaterial({ color: 0x6ea848, roughness: 0.95 })
    );
    pathDisc.rotation.x = -Math.PI / 2;
    pathDisc.position.set(0, 0.008, 0.1);
    this.world.add(pathDisc);

    // Voice-reactive magic ground ring around the clearing
    this.groundRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.groundRing = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.72, 64), this.groundRingMat);
    this.groundRing.rotation.x = -Math.PI / 2;
    this.groundRing.position.set(0, 0.02, 0);
    this.world.add(this.groundRing);

    // Soft character shadow blob on grass (follows charRoot X/Z)
    this.shadowBlob = new THREE.Mesh(
      new THREE.CircleGeometry(0.68, 28),
      new THREE.MeshBasicMaterial({ color: 0x0f2b12, transparent: true, opacity: 0.34 })
    );
    this.shadowBlob.rotation.x = -Math.PI / 2;
    this.shadowBlob.position.set(0, 0.016, 0);
    this.world.add(this.shadowBlob);

    // Stylized storybook trees & bushes framing the glade!
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6e4427, roughness: 0.9 });
    const leafMat1 = new THREE.MeshStandardMaterial({ color: 0x1f7a3a, roughness: 0.8 });
    const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x2da147, roughness: 0.78 });
    const bushMat  = new THREE.MeshStandardMaterial({ color: 0x268c3e, roughness: 0.85 });

    const treeSpecs = [
      [-4.1, -2.8, 1.25],
      [-2.8, -3.9, 1.05],
      [3.9, -2.9, 1.3],
      [2.6, -4.1, 1.0],
      [0.2, -4.8, 1.15],
    ];
    for (const [tx, tz, sc] of treeSpecs) {
      const tree = new THREE.Group();
      tree.position.set(tx, 0, tz);
      tree.scale.setScalar(sc);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 10), trunkMat);
      trunk.position.y = 1.0;
      tree.add(trunk);
      const c1 = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 14), leafMat1);
      c1.position.set(0, 2.35, 0);
      const c2 = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 12), leafMat2);
      c2.position.set(-0.55, 1.95, 0.25);
      const c3 = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 12), leafMat2);
      c3.position.set(0.55, 2.0, 0.15);
      tree.add(c1, c2, c3);
      this.world.add(tree);
    }

    // Little colorful meadow flowers & bushes
    const flowerColors = [0xfef08a, 0xf9a8d4, 0x93c5fd, 0xfdba74];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = 2.6 + (i % 3) * 0.75;
      const fx = Math.cos(a) * r;
      const fz = Math.sin(a) * r * 0.75 - 0.6;
      if (fz > 1.4 && Math.abs(fx) < 1.8) continue;
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 8, 8),
        new THREE.MeshStandardMaterial({ color: flowerColors[i % flowerColors.length], roughness: 0.5 })
      );
      flower.position.set(fx, 0.06, fz);
      this.world.add(flower);
    }

    for (const [bx, bz, s] of [[-2.9, -1.3, 0.7], [3.0, -1.5, 0.75], [-1.9, -2.5, 0.65], [1.9, -2.7, 0.7]]) {
      const bush = new THREE.Mesh(new THREE.SphereGeometry(s, 14, 12), bushMat);
      bush.scale.set(1.3, 0.72, 1.0);
      bush.position.set(bx, s * 0.32, bz);
      this.world.add(bush);
    }
  }

  _buildHareCharacter() {
    // Authentic warm ginger/cinnamon cartoon hare palette matching the uploaded poster!
    const furMain   = new THREE.MeshStandardMaterial({ color: 0xd6713a, roughness: 0.64, metalness: 0.03 });
    const furDark   = new THREE.MeshStandardMaterial({ color: 0xb55524, roughness: 0.68, metalness: 0.02 });
    const furCream  = new THREE.MeshStandardMaterial({ color: 0xfde2bc, roughness: 0.72, metalness: 0.02 });
    const innerEar  = new THREE.MeshStandardMaterial({ color: 0xffcfa0, roughness: 0.6 });
    const shirtMat  = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.6 });  // Yellow sleeves
    const vestMat   = new THREE.MeshStandardMaterial({ color: 0xc2255c, roughness: 0.55 }); // Berry-red vest
    const bandanaMat= new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.5 });  // Red neckerchief
    const pantsMat  = new THREE.MeshStandardMaterial({ color: 0x7c5836, roughness: 0.78 }); // Adventure trousers
    const noseMat   = new THREE.MeshStandardMaterial({ color: 0x5c2314, roughness: 0.32 });
    const whiteMat  = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12 });
    const irisMat   = new THREE.MeshBasicMaterial({ color: 0x2563eb }); // Bright sky-blue cartoon eyes!
    const pupilMat  = new THREE.MeshStandardMaterial({ color: 0x0b0f1e, roughness: 0.08 });
    const glintMat  = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mouthMat  = new THREE.MeshStandardMaterial({ color: 0x4a0e1f, roughness: 0.6 });
    const tongueMat = new THREE.MeshStandardMaterial({ color: 0xff6b8b, roughness: 0.4 });
    this.blushMat   = new THREE.MeshBasicMaterial({ color: 0xff6b81, transparent: true, opacity: 0.25 });

    // Whole articulated body
    this.body = new THREE.Group();
    this.charRoot.add(this.body);

    // ---- Legs & Big Expressive Cartoon Hare Feet ----
    this.legs = [];
    for (const side of [-1, 1]) {
      const legPivot = new THREE.Group();
      legPivot.position.set(side * 0.2, 0.56, 0);

      // Thigh / trousers leg
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.145, 0.24, 10, 14), pantsMat);
      thigh.position.set(0, -0.18, 0.02);
      legPivot.add(thigh);

      // Lower ankle fur
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.16, 8, 12), furMain);
      shin.position.set(0, -0.38, -0.02);
      legPivot.add(shin);

      // Big classic cartoon hare foot!
      const foot = new THREE.Group();
      foot.position.set(0, -0.49, 0.14);
      const footMain = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 14), furMain);
      footMain.scale.set(0.88, 0.52, 2.05);
      foot.add(footMain);
      const footSole = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 12), furCream);
      footSole.scale.set(0.75, 0.28, 1.75);
      footSole.position.set(0, -0.04, 0.02);
      foot.add(footSole);
      legPivot.add(foot);

      this.body.add(legPivot);
      this.legs.push({ pivot: legPivot, foot });
    }

    // ---- Torso (Adventure Trousers + Berry Vest + Yellow Shirt!) ----
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.set(0, 0.56, 0);
    this.body.add(this.torsoGroup);

    // Hips / trousers
    const hips = new THREE.Mesh(new THREE.SphereGeometry(0.35, 22, 18), pantsMat);
    hips.scale.set(1.05, 0.85, 0.92);
    hips.position.y = 0.08;
    this.torsoGroup.add(hips);

    // Fluffy tail peeking out back
    this.tail = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 14), furCream);
    this.tail.position.set(0, 0.08, -0.38);
    this.torsoGroup.add(this.tail);

    // Berry vest torso
    const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.62, 24), vestMat);
    vest.position.y = 0.45;
    this.torsoGroup.add(vest);

    // Yellow shirt V-front inset
    const shirtFront = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 16), shirtMat);
    shirtFront.scale.set(0.65, 1.15, 0.48);
    shirtFront.position.set(0, 0.50, 0.22);
    this.torsoGroup.add(shirtFront);

    // Subtle glowing AI badge button on vest
    this.gemMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.8,
      roughness: 0.2,
    });
    const vestBtn = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), this.gemMat);
    vestBtn.position.set(0.14, 0.56, 0.28);
    this.torsoGroup.add(vestBtn);
    this.chestGem = vestBtn;

    // Red Bandana Neckerchief + two lively knotted tails (right from the poster!)
    const bandana = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.075, 12, 28), bandanaMat);
    bandana.rotation.x = Math.PI / 2 + 0.14;
    bandana.position.set(0, 0.77, 0.02);
    this.torsoGroup.add(bandana);

    this.bandanaTail1 = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.28, 10), bandanaMat);
    this.bandanaTail1.position.set(-0.18, 0.68, 0.16);
    this.bandanaTail1.rotation.z = 0.75;
    this.bandanaTail1.rotation.x = 0.35;
    this.torsoGroup.add(this.bandanaTail1);

    this.bandanaTail2 = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 10), bandanaMat);
    this.bandanaTail2.position.set(-0.24, 0.74, 0.06);
    this.bandanaTail2.rotation.z = 1.1;
    this.torsoGroup.add(this.bandanaTail2);

    // ---- Articulated Cartoon Arms (Yellow Sleeves + Ginger Paws/Fists) ----
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.33, 0.69, 0.02);

      // Yellow rolled-up shirt sleeve
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.24, 10, 14), shirtMat);
      sleeve.position.set(side * 0.05, -0.15, 0.02);
      sleeve.rotation.z = side * 0.22;
      shoulder.add(sleeve);

      // Elbow pivot
      const elbow = new THREE.Group();
      elbow.position.set(side * 0.09, -0.31, 0.03);
      const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.078, 0.2, 10, 12), furMain);
      forearm.position.set(0, -0.12, 0.08);
      forearm.rotation.x = -0.35;
      elbow.add(forearm);

      // Expressive cartoon fist / paw
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 14), furMain);
      hand.scale.set(1.0, 0.92, 1.12);
      hand.position.set(0, -0.24, 0.16);
      elbow.add(hand);

      shoulder.add(elbow);
      this.torsoGroup.add(shoulder);
      this.arms.push({ shoulder, elbow });
    }

    // ---- Expressive Cartoon Hare Head ----
    this.head = new THREE.Group();
    this.head.position.set(0, 0.88, 0.05);
    this.torsoGroup.add(this.head);

    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.18, 16), furMain);
    neck.position.y = -0.02;
    this.head.add(neck);

    // Cranium (sleeker clever hare shape)
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.38, 30, 26), furMain);
    cranium.scale.set(0.95, 1.05, 0.98);
    cranium.position.y = 0.28;
    this.head.add(cranium);

    // Cheek fur tufts (classic cartoon hare!)
    for (const side of [-1, 1]) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 10), furMain);
      tuft.position.set(side * 0.34, 0.16, 0.1);
      tuft.rotation.z = -side * 1.25;
      this.head.add(tuft);
    }

    // Forehead playful hair tuft (just like the poster!)
    for (const [tx, ty, rz, sc] of [
      [-0.07, 0.66, 0.32, 0.11],
      [0.02, 0.70, -0.08, 0.13],
      [0.11, 0.65, -0.45, 0.10],
    ]) {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(sc, 12, 10), furMain);
      hair.scale.set(0.8, 1.45, 0.85);
      hair.position.set(tx, ty, 0.12);
      hair.rotation.z = rz;
      this.head.add(hair);
    }

    // Sculpted Warm Cream Hare Muzzle / Snout + Smiling Cheeks
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 20), furCream);
    muzzle.scale.set(1.08, 0.78, 1.18);
    muzzle.position.set(0, 0.18, 0.30);
    this.head.add(muzzle);

    // Nose bridge (warm ginger slope like in the poster!)
    const bridge = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 16), furMain);
    bridge.scale.set(0.88, 0.75, 1.35);
    bridge.position.set(0, 0.27, 0.31);
    this.head.add(bridge);

    // Blush circles
    for (const side of [-1, 1]) {
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.085, 18), this.blushMat);
      blush.position.set(side * 0.24, 0.17, 0.38);
      blush.rotation.y = side * 0.45;
      this.head.add(blush);
    }

    // Cute twitching dark cartoon hare nose
    this.nose = new THREE.Mesh(new THREE.SphereGeometry(0.068, 16, 14), noseMat);
    this.nose.scale.set(1.25, 0.82, 0.92);
    this.nose.position.set(0, 0.26, 0.51);
    this.head.add(this.nose);

    // Long classic cartoon whiskers!
    const whiskerMat = new THREE.LineBasicMaterial({ color: 0x2c1608, transparent: true, opacity: 0.72 });
    for (const side of [-1, 1]) {
      for (const dy of [-0.025, 0.015, 0.05]) {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(side * 0.14, 0.20 + dy, 0.44),
          new THREE.Vector3(side * 0.56, 0.22 + dy * 1.4, 0.34),
        ]);
        this.head.add(new THREE.Line(geo, whiskerMat));
      }
    }

    // ---- Expressive Lip-Sync Mouth + Classic Buck Teeth ----
    this.mouthGroup = new THREE.Group();
    this.mouthGroup.position.set(0, 0.085, 0.435);
    this.head.add(this.mouthGroup);

    this.mouthCavity = new THREE.Mesh(new THREE.SphereGeometry(0.115, 18, 14), mouthMat);
    this.mouthCavity.scale.set(1.18, 0.28, 0.6);
    this.mouthGroup.add(this.mouthCavity);

    this.tongue = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), tongueMat);
    this.tongue.scale.set(1.05, 0.45, 0.65);
    this.tongue.position.set(0, -0.042, 0.03);
    this.mouthGroup.add(this.tongue);

    // Classic cute rabbit front buck teeth!
    this.teeth = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.055, 0.03), whiteMat);
    this.teeth.position.set(0, 0.032, 0.055);
    this.mouthGroup.add(this.teeth);

    // ---- Big Bright Sky-Blue Cartoon Eyes + Animated Eyelids & Eyebrows ----
    this.eyeGroups = [];
    this.eyeBalls = [];
    this.eyelids = [];
    this.brows = [];
    for (const side of [-1, 1]) {
      const eg = new THREE.Group();
      eg.position.set(side * 0.145, 0.39, 0.31);

      // Big oval cartoon sclera
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.112, 22, 18), whiteMat);
      sclera.scale.set(0.84, 1.24, 0.72);
      eg.add(sclera);

      // Moving iris + pupil group
      const gaze = new THREE.Group();
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.062, 16, 14), irisMat);
      iris.scale.set(0.88, 1.15, 0.45);
      iris.position.set(0, -0.005, 0.062);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 12), pupilMat);
      pupil.scale.set(0.88, 1.12, 0.45);
      pupil.position.set(0, -0.004, 0.078);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 10), glintMat);
      glint.position.set(0.022, 0.032, 0.092);
      gaze.add(iris, pupil, glint);
      eg.add(gaze);

      // Upper eyelid cap for blinks, sad/offended half-lids, happy squints
      const lid = new THREE.Mesh(
        new THREE.SphereGeometry(0.118, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
        furMain
      );
      lid.scale.set(0.87, 1.26, 0.76);
      lid.rotation.x = -0.85; // open by default
      eg.add(lid);

      this.head.add(eg);
      this.eyeGroups.push(eg);
      this.eyeBalls.push(gaze);
      this.eyelids.push(lid);

      // Expressive dark-cinnamon eyebrows (convey happy, curious, sad, offended!)
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.11, 6, 10), furDark);
      brow.rotation.z = Math.PI / 2 - side * 0.08;
      brow.position.set(side * 0.155, 0.555, 0.34);
      this.head.add(brow);
      this.brows.push(brow);
    }

    // ---- Iconic Long Swept-Back Cartoon Hare Ears! ----
    this.ears = [];
    for (const side of [-1, 1]) {
      const earPivot = new THREE.Group();
      earPivot.position.set(side * 0.16, 0.60, -0.02);

      const outer = new THREE.Mesh(new THREE.SphereGeometry(0.145, 20, 18), furMain);
      outer.scale.set(0.75, 3.35, 0.42);
      outer.position.y = 0.48;

      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.10, 16, 14), innerEar);
      inner.scale.set(0.66, 2.78, 0.35);
      inner.position.set(0, 0.46, 0.044);

      earPivot.add(outer, inner);
      this.head.add(earPivot);
      this.ears.push(earPivot);
    }
  }

  _buildMagicFireflies() {
    const N = 56;
    const pos = new Float32Array(N * 3);
    this._flyLife = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 7.5;
      pos[i * 3 + 1] = 0.25 + Math.random() * 3.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4.5;
      this._flyLife[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    this._flyPos = pos;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.fireflies = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0x7dd3fc,
        size: 0.085,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
      })
    );
    this.scene.add(this.fireflies);
  }

  _buildEmotionProps() {
    // Golden thinking orbit stars + emerald knowledge absorption stars
    const N = 16;
    const pos = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._orbitPos = geo.attributes.position;
    this.thinkMat = new THREE.PointsMaterial({
      color: 0xfbbf24,
      size: 0.11,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    this.thinkOrbit = new THREE.Points(geo, this.thinkMat);
    this.thinkOrbit.position.set(0, 2.05, 0);
    this.charRoot.add(this.thinkOrbit);

    this._learnStars = [];
    const sMat = new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), sMat.clone());
      m.visible = false;
      this.charRoot.add(m);
      this._learnStars.push({ mesh: m, angle: (i / 12) * Math.PI * 2, life: 0, r: 1.8 });
    }
  }

  // ---- Public API ----
  setLook(nx, ny) {
    this.targetLookX = Math.max(-1, Math.min(1, nx));
    this.targetLookY = Math.max(-1, Math.min(1, ny));
  }

  setCameraPerson(nx, ny) {
    // nx, ny in [-1..1] from real webcam face detection (null if no face seen)
    this.camUserX = nx;
    this.camUserY = ny;
    if (nx !== null) {
      this.targetLookX = Math.max(-1, Math.min(1, nx));
      this.targetLookY = Math.max(-1, Math.min(1, ny));
    }
  }

  setState(state) {
    this.aiState = state || 'idle';
    if (state === 'listening') {
      this._targetRingColor.setHex(0x38bdf8);
      // Step slightly closer & face user eagerly!
      this.targetZ = 0.35;
      this.targetX = this.camUserX !== null ? this.camUserX * 0.55 : 0;
    } else if (state === 'thinking') {
      this._targetRingColor.setHex(0xfbbf24);
      // Wise bunny paces slightly to the side while thinking!
      this.targetX = this.posX >= 0 ? -0.75 : 0.75;
      this.targetZ = -0.15;
    } else if (state === 'speaking') {
      this._targetRingColor.setHex(0xf472b6);
      this.targetZ = 0.2;
    } else {
      this._targetRingColor.setHex(0x4ade80);
    }
  }

  setMood(mood) {
    this.mood = mood || 'happy';
    if (mood === 'excited' || mood === 'surprised') {
      this.hopTime = 0.65;
      this.blushBoost = 0.5;
    } else if (mood === 'laughing') {
      this.hopTime = 0.5;
      this.blushBoost = 0.75;
    } else if (mood === 'shy') {
      this.blushBoost = 1.0;
    } else if (mood === 'offended' || mood === 'sad') {
      // Steps slightly further back and sulks!
      this.targetZ = -0.35;
      this.targetX = this.posX >= 0 ? 0.55 : -0.55;
    }
  }

  setVoiceLevel(lvl) { this.voiceLevel = Math.max(0, Math.min(1, lvl || 0)); }
  setMicLevel(lvl) { this.micLevel = Math.max(0, Math.min(1, lvl || 0)); }
  triggerHop() { this.hopTime = 0.65; }
  triggerWave() { this.waveTime = 2.0; }
  triggerLearnBurst() {
    this.learnBurstTime = 1.6;
    this.hopTime = 0.7;
    for (let i = 0; i < this._learnStars.length; i++) {
      const s = this._learnStars[i];
      s.life = 1.4;
      s.r = 1.85;
      s.mesh.visible = true;
    }
  }

  update(dt, t) {
    this._resizeIfNeeded();

    this.smoothVoice += (this.voiceLevel - this.smoothVoice) * Math.min(1, dt * 26);
    this.smoothMic += (this.micLevel - this.smoothMic) * Math.min(1, dt * 18);
    this._curRingColor.lerp(this._targetRingColor, Math.min(1, dt * 5));
    this.groundRingMat.color.copy(this._curRingColor);
    this.magicLight.color.copy(this._curRingColor);
    this.gemMat.color.copy(this._curRingColor);
    this.gemMat.emissive.copy(this._curRingColor);

    const isListening = this.aiState === 'listening';
    const isThinking  = this.aiState === 'thinking';
    const isSpeaking  = this.aiState === 'speaking';
    const isSad       = this.mood === 'sad';
    const isOffended  = this.mood === 'offended';
    const isExcited   = this.mood === 'excited';
    const isLaughing  = this.mood === 'laughing';
    const isWise      = this.mood === 'wise';

    // ---- Autonomous Lively Roaming (NEVER frozen in one spot!) ----
    this.roamTimer -= dt;
    if (this.roamTimer <= 0) {
      if (isSpeaking && !isSad && !isOffended) {
        // Gentle expressive storyteller pacing while talking!
        this.targetX = (Math.random() - 0.5) * 1.35;
        this.targetZ = (Math.random() - 0.5) * 0.45 + 0.15;
        this.roamTimer = 2.6 + Math.random() * 2.2;
      } else if (this.aiState === 'idle' && !isOffended) {
        // Playful roaming around the sunny glade (or following webcam person!)
        if (this.camUserX !== null && Math.random() < 0.65) {
          this.targetX = this.camUserX * 0.95;
          this.targetZ = (Math.random() - 0.5) * 0.4;
        } else {
          this.targetX = (Math.random() - 0.5) * 2.1;
          this.targetZ = (Math.random() - 0.5) * 0.7;
        }
        this.roamTimer = 3.2 + Math.random() * 2.8;
      } else if (isThinking) {
        this.targetX = -this.targetX || 0.75;
        this.roamTimer = 2.2;
      } else {
        this.roamTimer = 2.5;
      }
    }

    // Move smoothly toward target spot with real walking/hopping stride!
    const dx = this.targetX - this.posX;
    const dz = this.targetZ - this.posZ;
    const dist = Math.hypot(dx, dz);
    const speed = isOffended || isSad ? 0.65 : (isExcited ? 1.7 : 1.15);
    let moving = 0;

    if (dist > 0.06) {
      const step = Math.min(dist, speed * dt);
      this.posX += (dx / dist) * step;
      this.posZ += (dz / dist) * step;
      moving = Math.min(1, dist * 2.2);
      this.walkPhase += dt * (isExcited ? 12 : 9.2);
      // Turn slightly toward walking direction, still keeping visible to viewer
      const walkYaw = Math.atan2(dx, Math.max(0.45, dz + 1.1));
      this.targetYaw = Math.max(-0.65, Math.min(0.65, walkYaw));
    } else {
      // Turn to face the user (or sulk sideways if offended!)
      if (isOffended) {
        this.targetYaw = this.posX >= 0 ? 0.68 : -0.68;
      } else {
        this.targetYaw = (this.camUserX !== null ? this.camUserX * 0.35 : this.targetLookX * 0.22) - this.posX * 0.14;
      }
    }

    this.facingYaw += (this.targetYaw - this.facingYaw) * Math.min(1, dt * 6);
    this.charRoot.position.x = this.posX;
    this.charRoot.position.z = this.posZ;
    this.charRoot.rotation.y = this.facingYaw;
    this.shadowBlob.position.x = this.posX;
    this.shadowBlob.position.z = this.posZ;

    // ---- Hop / Stride Bounce ----
    let hopY = 0;
    if (this.hopTime > 0) {
      this.hopTime = Math.max(0, this.hopTime - dt);
      hopY = Math.abs(Math.sin(this.hopTime * Math.PI * 3)) * 0.42;
    }
    const strideBounce = moving * Math.abs(Math.sin(this.walkPhase)) * 0.14;
    const laughBounce = isLaughing ? Math.abs(Math.sin(t * 14)) * 0.08 : 0;
    const breath = Math.sin(t * 2.4) * 0.022;
    this.body.position.y = hopY + strideBounce + laughBounce + breath;
    this.shadowBlob.scale.setScalar(Math.max(0.55, 1.0 - (hopY + strideBounce) * 0.7));

    // ---- Legs & Impatient Foot Tap when Offended ----
    const legSwing = moving * Math.sin(this.walkPhase) * 0.58;
    this.legs[0].pivot.rotation.x = legSwing;
    this.legs[1].pivot.rotation.x = -legSwing;
    if (isOffended && moving < 0.1) {
      this.footTapPhase += dt * 11;
      this.legs[1].foot.rotation.x = -Math.abs(Math.sin(this.footTapPhase)) * 0.32;
    } else {
      this.legs[0].foot.rotation.x = -legSwing * 0.35;
      this.legs[1].foot.rotation.x = legSwing * 0.35;
    }

    // ---- Torso Lean & Storytelling Posture ----
    const torsoForward = isSad ? 0.14 : (isListening ? 0.1 : (moving * 0.12));
    this.torsoGroup.rotation.x += (torsoForward - this.torsoGroup.rotation.x) * Math.min(1, dt * 6);
    this.torsoGroup.rotation.z = moving * Math.cos(this.walkPhase) * 0.07 + (isSpeaking ? Math.sin(t * 3.2) * 0.04 : 0);

    // Bandana fluttering in breeze/motion
    this.bandanaTail1.rotation.z = 0.75 + Math.sin(t * 5 + moving * 3) * 0.12;
    this.bandanaTail2.rotation.z = 1.1 + Math.cos(t * 4.5) * 0.12;
    this.tail.rotation.y = Math.sin(t * (isExcited || isSpeaking ? 11 : 4)) * 0.25;

    // ---- Smooth Eye & Head Tracking ----
    const wantLookX = isOffended ? (this.facingYaw > 0 ? -0.65 : 0.65) : this.targetLookX;
    const wantLookY = isThinking ? -0.35 : (isSad ? 0.32 : this.targetLookY);
    this.lookX += (wantLookX - this.lookX) * Math.min(1, dt * 7);
    this.lookY += (wantLookY - this.lookY) * Math.min(1, dt * 7);

    const headTilt = isListening ? 0.15 : (this.mood === 'curious' ? 0.22 : (isSad ? -0.14 : (isWise ? Math.sin(t * 1.5) * 0.08 : 0)));
    this.head.rotation.y = this.lookX * 0.38;
    this.head.rotation.x = -this.lookY * 0.22 + (isSad ? 0.2 : 0) - (isSpeaking ? this.smoothVoice * 0.07 : 0);
    this.head.rotation.z += ((headTilt + Math.sin(t * 1.3) * 0.025) - this.head.rotation.z) * Math.min(1, dt * 6);

    for (const gaze of this.eyeBalls) {
      gaze.position.x = this.lookX * 0.032;
      gaze.position.y = -this.lookY * 0.026;
    }

    // ---- Iconic Long Expressive Hare Ears ----
    // Swept back playfully like the poster, perked when listening, DROOPED when sad/offended!
    const earBack = isSad ? -0.55 : (isOffended ? -0.75 : (isListening ? 0.18 : -0.24 - moving * 0.22));
    const earSplay = isSad ? 0.68 : (isOffended ? 0.55 : (isListening ? 0.10 : 0.26));
    const earVoiceBounce = isSpeaking ? this.smoothVoice * 0.22 : (isListening ? this.smoothMic * 0.14 : 0);

    this.ears[0].rotation.z += ((earSplay - earVoiceBounce + Math.sin(t * 2.5) * 0.05) - this.ears[0].rotation.z) * Math.min(1, dt * 8);
    this.ears[1].rotation.z += ((-earSplay + earVoiceBounce + Math.cos(t * 2.3) * 0.05) - this.ears[1].rotation.z) * Math.min(1, dt * 8);
    this.ears[0].rotation.x += (earBack - this.ears[0].rotation.x) * Math.min(1, dt * 7);
    this.ears[1].rotation.x += (earBack - this.ears[1].rotation.x) * Math.min(1, dt * 7);

    // ---- Eyebrows & Eyelids (Real Marusya Expressions!) ----
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinking = 0.13;
      this.blinkTimer = 2.0 + Math.random() * 3.2;
    }
    if (this.blinking > 0) this.blinking = Math.max(0, this.blinking - dt);

    const lidClosed = this.blinking > 0 ? 0.15 : (isLaughing ? -0.25 : (isOffended ? -0.42 : (isSad ? -0.48 : -0.88)));
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      this.eyelids[i].rotation.x += (lidClosed - this.eyelids[i].rotation.x) * Math.min(1, dt * 24);
      // Brow angle conveys emotion instantly!
      let browAngle = -side * 0.06;
      let browY = 0.555;
      if (isOffended) { browAngle = side * 0.28; browY = 0.535; } // furrowed angry/pouting!
      else if (isSad) { browAngle = -side * 0.28; browY = 0.545; } // sad puppy brows!
      else if (isExcited || this.mood === 'surprised' || isListening) { browAngle = -side * 0.12; browY = 0.585; }
      this.brows[i].rotation.z += ((Math.PI / 2 + browAngle) - this.brows[i].rotation.z) * Math.min(1, dt * 10);
      this.brows[i].position.y += (browY - this.brows[i].position.y) * Math.min(1, dt * 10);
    }

    // ---- Real-Time Audio Lip-Sync Mouth ----
    const mouthOpen = isSpeaking
      ? Math.max(0.28, Math.min(1.45, 0.26 + this.smoothVoice * 1.5 + Math.abs(Math.sin(t * 17)) * this.smoothVoice * 0.35))
      : (isLaughing ? 1.05 : (this.mood === 'surprised' ? 0.85 : (isSad || isOffended ? 0.16 : 0.24)));
    const mouthWide = isSad || isOffended ? 0.82 : (isSpeaking ? 1.05 + this.smoothVoice * 0.25 : 1.18);
    this.mouthCavity.scale.y += (mouthOpen - this.mouthCavity.scale.y) * Math.min(1, dt * 30);
    this.mouthCavity.scale.x += (mouthWide - this.mouthCavity.scale.x) * Math.min(1, dt * 15);
    this.tongue.visible = this.mouthCavity.scale.y > 0.45;
    this.teeth.visible = !isSad && !isOffended;

    // Nose twitch
    this.nose.position.y = 0.26 + Math.sin(t * 11) * 0.005;

    // ---- Expressive Articulated Arms ----
    const L = this.arms[0], R = this.arms[1];
    if (this.waveTime > 0) {
      this.waveTime = Math.max(0, this.waveTime - dt);
      R.shoulder.rotation.z = 2.35 + Math.sin(t * 12) * 0.32;
      R.shoulder.rotation.x = -0.35;
      R.elbow.rotation.z = 0.25;
      L.shoulder.rotation.z = -0.25;
      L.shoulder.rotation.x = 0;
    } else if (isOffended) {
      // Arms crossed across chest (classic offended sulk!)
      L.shoulder.rotation.z += (-0.42 - L.shoulder.rotation.z) * Math.min(1, dt * 8);
      L.shoulder.rotation.x += (-0.85 - L.shoulder.rotation.x) * Math.min(1, dt * 8);
      L.elbow.rotation.z += (0.85 - L.elbow.rotation.z) * Math.min(1, dt * 8);
      R.shoulder.rotation.z += (0.42 - R.shoulder.rotation.z) * Math.min(1, dt * 8);
      R.shoulder.rotation.x += (-0.85 - R.shoulder.rotation.x) * Math.min(1, dt * 8);
      R.elbow.rotation.z += (-0.85 - R.elbow.rotation.z) * Math.min(1, dt * 8);
    } else if (isThinking) {
      // Right paw stroking chin thoughtfully!
      R.shoulder.rotation.z += (-0.45 - R.shoulder.rotation.z) * Math.min(1, dt * 7);
      R.shoulder.rotation.x += (-1.15 - R.shoulder.rotation.x) * Math.min(1, dt * 7);
      R.elbow.rotation.z += (-0.55 - R.elbow.rotation.z) * Math.min(1, dt * 7);
      L.shoulder.rotation.z += (0.28 - L.shoulder.rotation.z) * Math.min(1, dt * 7);
      L.shoulder.rotation.x += (-0.15 - L.shoulder.rotation.x) * Math.min(1, dt * 7);
      L.elbow.rotation.z += (0.2 - L.elbow.rotation.z) * Math.min(1, dt * 7);
    } else if (isExcited) {
      // Classic poster victory fist pump!
      R.shoulder.rotation.z += ((2.45 + Math.sin(t * 10) * 0.2) - R.shoulder.rotation.z) * Math.min(1, dt * 10);
      R.shoulder.rotation.x += (-0.35 - R.shoulder.rotation.x) * Math.min(1, dt * 10);
      R.elbow.rotation.z += (0.22 - R.elbow.rotation.z) * Math.min(1, dt * 10);
      L.shoulder.rotation.z += (-0.55 - L.shoulder.rotation.z) * Math.min(1, dt * 8);
      L.shoulder.rotation.x += (-0.65 - L.shoulder.rotation.x) * Math.min(1, dt * 8);
      L.elbow.rotation.z += (-0.35 - L.elbow.rotation.z) * Math.min(1, dt * 8);
    } else if (isSpeaking) {
      // Expressive wise storyteller hand gestures synced with speech energy!
      const g1 = Math.sin(t * 5.2) * (0.25 + this.smoothVoice * 0.45);
      const g2 = Math.cos(t * 4.4) * (0.22 + this.smoothVoice * 0.38);
      L.shoulder.rotation.z += ((0.45 + g1) - L.shoulder.rotation.z) * Math.min(1, dt * 10);
      L.shoulder.rotation.x += ((-0.55 - this.smoothVoice * 0.35) - L.shoulder.rotation.x) * Math.min(1, dt * 10);
      L.elbow.rotation.z += (0.3 - L.elbow.rotation.z) * Math.min(1, dt * 10);
      R.shoulder.rotation.z += ((-0.45 - g2) - R.shoulder.rotation.z) * Math.min(1, dt * 10);
      R.shoulder.rotation.x += ((-0.55 - this.smoothVoice * 0.35) - R.shoulder.rotation.x) * Math.min(1, dt * 10);
      R.elbow.rotation.z += (-0.3 - R.elbow.rotation.z) * Math.min(1, dt * 10);
    } else {
      // Natural arm swing when walking / relaxed posture when standing
      const swing = moving * Math.sin(this.walkPhase) * 0.55;
      L.shoulder.rotation.z += ((isSad ? 0.12 : 0.26) - L.shoulder.rotation.z) * Math.min(1, dt * 7);
      L.shoulder.rotation.x += (-swing - L.shoulder.rotation.x) * Math.min(1, dt * 9);
      L.elbow.rotation.z += (0.12 - L.elbow.rotation.z) * Math.min(1, dt * 7);
      R.shoulder.rotation.z += ((isSad ? -0.12 : -0.26) - R.shoulder.rotation.z) * Math.min(1, dt * 7);
      R.shoulder.rotation.x += (swing - R.shoulder.rotation.x) * Math.min(1, dt * 9);
      R.elbow.rotation.z += (-0.12 - R.elbow.rotation.z) * Math.min(1, dt * 7);
    }

    // ---- Blush, Ground Ring Pulse, Fireflies & Knowledge Stars ----
    if (this.blushBoost > 0) this.blushBoost = Math.max(0, this.blushBoost - dt * 0.25);
    this.blushMat.opacity = 0.22 + this.blushBoost * 0.48;

    const energy = isSpeaking ? this.smoothVoice : (isListening ? this.smoothMic : 0);
    this.groundRing.scale.setScalar(1.0 + energy * 0.2 + Math.sin(t * 2) * 0.03);
    this.groundRingMat.opacity = 0.22 + energy * 0.55;
    this.chestGem.rotation.y = t * 2.0;

    // Thinking stars orbit
    const targetThinkOp = isThinking ? 0.92 : 0;
    this.thinkMat.opacity += (targetThinkOp - this.thinkMat.opacity) * Math.min(1, dt * 6);
    if (this.thinkMat.opacity > 0.01) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + t * 2.8;
        this._orbitPos.array[i * 3] = Math.cos(a) * 0.85;
        this._orbitPos.array[i * 3 + 1] = Math.sin(a * 2 + t) * 0.2;
        this._orbitPos.array[i * 3 + 2] = Math.sin(a) * 0.65;
      }
      this._orbitPos.needsUpdate = true;
    }

    // Learn celebration stars
    if (this.learnBurstTime > 0) this.learnBurstTime = Math.max(0, this.learnBurstTime - dt);
    for (const s of this._learnStars) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      const prog = 1 - s.life / 1.4;
      const r = s.r * (1 - prog * 0.85);
      const a = s.angle + prog * Math.PI * 3;
      s.mesh.position.set(Math.cos(a) * r, 1.2 + Math.sin(prog * Math.PI) * 0.6, Math.sin(a) * r * 0.7);
      s.mesh.material.opacity = Math.sin(prog * Math.PI) * 0.95;
    }

    // Magical forest fireflies
    this.fireflies.rotation.y = t * 0.04;
    for (let i = 0; i < this._flyLife.length; i++) {
      this._flyLife[i] -= dt * 0.12;
      this._flyPos[i * 3 + 1] += Math.sin(t * 2 + i) * dt * 0.18;
      if (this._flyLife[i] < 0) {
        this._flyLife[i] = 0.8 + Math.random() * 0.6;
        this._flyPos[i * 3] = (Math.random() - 0.5) * 7.5;
        this._flyPos[i * 3 + 1] = 0.25 + Math.random() * 3.0;
        this._flyPos[i * 3 + 2] = (Math.random() - 0.5) * 4.0;
      }
    }
    this.fireflies.geometry.attributes.position.needsUpdate = true;

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
    const aspect = w / h;
    // Frame the full-body roaming bunny cleanly a bit further back!
    this.camera.position.z = aspect < 0.75 ? 9.4 : (aspect < 1.0 ? 8.4 : 7.5);
    this.camera.position.y = aspect < 0.75 ? 1.1 : 1.25;
    this.camera.lookAt(0, 0.82, 0);
    this.camera.updateProjectionMatrix();
  }
}
