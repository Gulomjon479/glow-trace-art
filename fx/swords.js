import * as THREE from 'three';

const SWORD_COUNT = (window.innerWidth < 760 || /Android|iPhone|iPad/i.test(navigator.userAgent)) ? 1100 : 1800;

export const THEMES = {
  emerald: {
    primary: '#1aff7c',
    secondary: '#ffe44d',
    highlight: '#eafff0',
    glow: '#22ff88',
  },
  cyber: {
    primary: '#00e5ff',
    secondary: '#8b5cf6',
    highlight: '#e0f7ff',
    glow: '#00d9ff',
  },
  phoenix: {
    primary: '#ff4522',
    secondary: '#ffd036',
    highlight: '#fff3d6',
    glow: '#ff5e2b',
  },
  cosmos: {
    primary: '#e040fb',
    secondary: '#38bdf8',
    highlight: '#f8e7ff',
    glow: '#c040ff',
  },
};

function createSwordGeometry() {
  // Sleek, sharp elongated flying-sword blade pointing along +Z
  const positions = new Float32Array([
    // Tip (+Z) to mid-blade (4 triangular faces)
     0.0,   0.0,    0.58,   -0.032,  0.0,   0.06,    0.0,  0.018,  0.06,
     0.0,   0.0,    0.58,    0.0,   0.018,  0.06,    0.032, 0.0,   0.06,
     0.0,   0.0,    0.58,    0.032,  0.0,   0.06,    0.0, -0.018,  0.06,
     0.0,   0.0,    0.58,    0.0,  -0.018,  0.06,   -0.032, 0.0,   0.06,

    // Mid-blade to tail (-Z) (4 triangular faces)
     0.0,   0.0,   -0.52,    0.0,   0.018,  0.06,   -0.032, 0.0,   0.06,
     0.0,   0.0,   -0.52,    0.032,  0.0,   0.06,    0.0,  0.018,  0.06,
     0.0,   0.0,   -0.52,    0.0,  -0.018,  0.06,    0.032, 0.0,   0.06,
     0.0,   0.0,   -0.52,   -0.032,  0.0,   0.06,    0.0, -0.018,  0.06,

    // Subtle crossguard flare near tail
    -0.075, 0.0,   -0.22,    0.075,  0.0,  -0.22,    0.0,  0.0,   -0.14,
    -0.075, 0.0,   -0.22,    0.0,    0.0,  -0.14,    0.0,  0.0,   -0.28,
     0.075, 0.0,   -0.22,    0.0,    0.0,  -0.28,    0.0,  0.0,   -0.14,
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export class SwordSwarm {
  constructor() {
    this.count = SWORD_COUNT;
    this.group = new THREE.Group();

    const geometry = createSwordGeometry();
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, this.count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.mesh);

    // Subtle inner energy aura sphere (visible mainly in sphere mode)
    const auraGeo = new THREE.SphereGeometry(4.25, 32, 32);
    const auraMat = new THREE.ShaderMaterial({
      uniforms: {
        uColorA: { value: new THREE.Color(THEMES.emerald.primary) },
        uColorB: { value: new THREE.Color(THEMES.emerald.secondary) },
        uOpacity: { value: 0.45 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform float uOpacity;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.8);
          vec3 col = mix(uColorA, uColorB, fresnel * 0.7);
          gl_FragColor = vec4(col * 1.4, fresnel * uOpacity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.auraSphere = new THREE.Mesh(auraGeo, auraMat);
    this.group.add(this.auraSphere);

    // Per-sword state arrays
    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    this.seeds = new Float32Array(this.count * 4);
    this.colorMix = new Float32Array(this.count);

    // Trail history for stream mode
    this.trailLength = 70;
    this.trail = [];
    for (let i = 0; i < this.trailLength; i++) {
      this.trail.push(new THREE.Vector3(0, 0, 0));
    }

    // Reusable math objects
    this._dummyPos = new THREE.Vector3();
    this._targetPos = new THREE.Vector3();
    this._vel = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._scale = new THREE.Vector3();
    this._mat = new THREE.Matrix4();
    this._zAxis = new THREE.Vector3(0, 0, 1);

    this.initSwords();
    this.setTheme('emerald');
  }

  initSwords() {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < this.count; i++) {
      const t = i / this.count;
      const y = 1 - 2 * t;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i;

      const r = 4.3;
      this.positions[i * 3] = Math.cos(theta) * radiusAtY * r;
      this.positions[i * 3 + 1] = y * r;
      this.positions[i * 3 + 2] = Math.sin(theta) * radiusAtY * r;

      this.velocities[i * 3] = 0;
      this.velocities[i * 3 + 1] = 0;
      this.velocities[i * 3 + 2] = 0;

      // Seeds: [u, v, speedFactor, phase]
      this.seeds[i * 4] = Math.random();
      this.seeds[i * 4 + 1] = Math.random();
      this.seeds[i * 4 + 2] = 0.75 + Math.random() * 0.6;
      this.seeds[i * 4 + 3] = Math.random() * Math.PI * 2;

      // Color ratio (creates the rich green + gold interwoven look)
      this.colorMix[i] = Math.random();
    }
  }

  setTheme(themeName) {
    const theme = THEMES[themeName] || THEMES.emerald;
    const cPrimary = new THREE.Color(theme.primary);
    const cSecondary = new THREE.Color(theme.secondary);
    const cHighlight = new THREE.Color(theme.highlight);
    const temp = new THREE.Color();

    for (let i = 0; i < this.count; i++) {
      const mixVal = this.colorMix[i];
      if (mixVal < 0.52) {
        temp.copy(cPrimary).lerp(cSecondary, mixVal * 0.45);
      } else if (mixVal < 0.90) {
        temp.copy(cSecondary).lerp(cPrimary, (mixVal - 0.52) * 0.5);
      } else {
        temp.copy(cHighlight);
      }
      this.mesh.setColorAt(i, temp);
    }
    this.mesh.instanceColor.needsUpdate = true;

    this.auraSphere.material.uniforms.uColorA.value.set(theme.primary);
    this.auraSphere.material.uniforms.uColorB.value.set(theme.secondary);
  }

  update(time, dt, mode, targetCenter, handScale = 1.0) {
    const clampedDt = Math.min(dt, 0.05);

    // Update trail for stream mode
    for (let i = this.trailLength - 1; i > 0; i--) {
      this.trail[i].copy(this.trail[i - 1]);
    }
    this.trail[0].copy(targetCenter);

    // Update inner aura sphere
    const wantAura = mode === 'sphere' ? 0.52 : 0.0;
    this.auraSphere.material.uniforms.uOpacity.value = THREE.MathUtils.lerp(
      this.auraSphere.material.uniforms.uOpacity.value,
      wantAura,
      clampedDt * 4
    );
    this.auraSphere.position.lerp(targetCenter, clampedDt * 6);
    const sphereRadius = 4.35 * handScale;
    const auraScale = sphereRadius / 4.25;
    this.auraSphere.scale.setScalar(auraScale);
    this.auraSphere.visible = this.auraSphere.material.uniforms.uOpacity.value > 0.01;

    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const cx = targetCenter.x;
    const cy = targetCenter.y;
    const cz = targetCenter.z;

    for (let i = 0; i < this.count; i++) {
      const idx = i * 3;
      const sIdx = i * 4;

      const s0 = this.seeds[sIdx];
      const s1 = this.seeds[sIdx + 1];
      const spd = this.seeds[sIdx + 2];
      const phase = this.seeds[sIdx + 3];

      let tx = 0, ty = 0, tz = 0;
      let spring = 5.5;
      let damping = 0.86;
      let bladeLen = 1.0;

      if (mode === 'sphere') {
        // Woven tangential glowing sphere (like the reference image!)
        const t = (i + 0.5) / this.count;
        const baseLat = Math.acos(1 - 2 * t) - Math.PI / 2;
        const bandDir = (Math.floor(t * 14) % 2 === 0) ? 1 : -1;
        const spin = time * (0.95 + 0.35 * spd) * bandDir;
        const lon = goldenAngle * i + spin + Math.sin(time * 1.4 + baseLat * 4.0) * 0.25;
        const lat = baseLat + Math.sin(time * 1.6 + phase) * 0.055;

        const r = sphereRadius + Math.sin(phase + time * 2.5) * 0.14;
        const cosLat = Math.cos(lat);

        // Slight global tilt for dramatic 3D depth
        const lx = r * cosLat * Math.cos(lon);
        const ly = r * Math.sin(lat);
        const lz = r * cosLat * Math.sin(lon);

        const tilt = time * 0.22;
        const ct = Math.cos(tilt);
        const st = Math.sin(tilt);

        tx = cx + lx * ct - lz * st;
        ty = cy + ly;
        tz = cz + lx * st + lz * ct;

        spring = 7.2;
        damping = 0.84;
        bladeLen = 1.15;
      } else if (mode === 'expand') {
        // Massive swirling cosmic lotus / galaxy ring
        const ringLayer = i % 3;
        const baseR = (4.8 + ringLayer * 2.4 + s0 * 2.2) * handScale;
        const angle = (i / this.count) * Math.PI * 2 * 7 + time * (0.65 - ringLayer * 0.12) * spd;
        const wave = Math.sin(angle * 3.0 - time * 2.2 + phase) * (0.7 + ringLayer * 0.35);

        const lx = Math.cos(angle) * baseR;
        const ly = wave + (s1 - 0.5) * 1.4;
        const lz = Math.sin(angle) * baseR;

        // Tilt plane slightly toward camera so it looks dramatic
        const tiltX = 0.45;
        tx = cx + lx;
        ty = cy + ly * Math.cos(tiltX) - lz * Math.sin(tiltX);
        tz = cz + ly * Math.sin(tiltX) + lz * Math.cos(tiltX);

        spring = 4.2;
        damping = 0.88;
        bladeLen = 1.25;
      } else if (mode === 'stream') {
        // Serpentine flying sword river following fingertip/cursor
        const frac = i / this.count;
        const trailPosIndex = Math.min(this.trailLength - 1, Math.floor(frac * (this.trailLength - 1)));
        const anchor = this.trail[trailPosIndex];

        const helixAngle = frac * 26.0 - time * 6.5 + phase;
        const spread = (0.35 + frac * 1.55) * handScale;

        tx = anchor.x + Math.cos(helixAngle) * spread;
        ty = anchor.y + Math.sin(helixAngle) * spread + Math.sin(time * 3.0 + frac * 8.0) * 0.4;
        tz = anchor.z + Math.sin(helixAngle * 0.7) * spread * 0.8;

        spring = 8.0;
        damping = 0.82;
        bladeLen = 1.3;
      } else if (mode === 'vortex') {
        // Double-helix rising energy tornado
        const hNorm = (i / this.count);
        const yPos = (hNorm - 0.5) * 11.5 * handScale;
        const coneR = (1.1 + Math.pow(hNorm, 1.35) * 4.8) * handScale;
        const helixBranch = (i % 2 === 0) ? 0 : Math.PI;
        const angle = hNorm * 16.0 - time * 3.8 * spd + helixBranch + (s0 - 0.5) * 0.6;

        tx = cx + Math.cos(angle) * coneR;
        ty = cy + yPos;
        tz = cz + Math.sin(angle) * coneR;

        spring = 6.2;
        damping = 0.85;
        bladeLen = 1.15;
      } else if (mode === 'giant') {
        // Assemble all swords into ONE colossal hovering celestial sword!
        const frac = i / this.count;
        let lx = 0, ly = 0, lz = 0;

        if (frac < 0.76) {
          // Main giant blade (from y = -1.6 to y = +6.4)
          const b = frac / 0.76;
          ly = -1.6 + b * 8.0;
          const taper = b > 0.78 ? Math.max(0.04, (1.0 - b) / 0.22) : (1.0 - b * 0.15);
          const halfW = 0.95 * taper;
          lx = (s0 - 0.5) * 2.0 * halfW;
          lz = (s1 - 0.5) * 0.35 * taper;
        } else if (frac < 0.89) {
          // Crossguard
          const g = (frac - 0.76) / 0.13;
          lx = (g - 0.5) * 4.2;
          ly = -1.75 + Math.cos((g - 0.5) * Math.PI) * 0.45 + (s0 - 0.5) * 0.25;
          lz = (s1 - 0.5) * 0.45;
        } else {
          // Hilt & Pommel
          const h = (frac - 0.89) / 0.11;
          ly = -1.9 - h * 2.4;
          const hiltR = h > 0.85 ? 0.38 : 0.22;
          const a = phase + time * 2.0;
          lx = Math.cos(a) * hiltR;
          lz = Math.sin(a) * hiltR;
        }

        // Gentle floating & dramatic tilt
        const hover = Math.sin(time * 2.2) * 0.25;
        const rotZ = -0.22 + Math.sin(time * 1.1) * 0.06;
        const rotY = Math.sin(time * 0.9) * 0.35;

        const scaleG = 0.92 * handScale;
        lx *= scaleG;
        ly = (ly - 0.6) * scaleG;
        lz *= scaleG;

        // Rotate Y then Z
        const x1 = lx * Math.cos(rotY) - lz * Math.sin(rotY);
        const z1 = lx * Math.sin(rotY) + lz * Math.cos(rotY);
        const x2 = x1 * Math.cos(rotZ) - ly * Math.sin(rotZ);
        const y2 = x1 * Math.sin(rotZ) + ly * Math.cos(rotZ);

        tx = cx + x2;
        ty = cy + y2 + hover;
        tz = cz + z1;

        spring = 7.5;
        damping = 0.82;
        bladeLen = 0.95;
      }

      // Spring-damper physics for silky-smooth morphing
      const px = this.positions[idx];
      const py = this.positions[idx + 1];
      const pz = this.positions[idx + 2];

      let vx = (this.velocities[idx] + (tx - px) * spring * clampedDt) * damping;
      let vy = (this.velocities[idx + 1] + (ty - py) * spring * clampedDt) * damping;
      let vz = (this.velocities[idx + 2] + (tz - pz) * spring * clampedDt) * damping;

      // In sphere mode, add tangential drift so blades stay aligned along the swirl
      const nx = px + vx * clampedDt * 4.5;
      const ny = py + vy * clampedDt * 4.5;
      const nz = pz + vz * clampedDt * 4.5;

      this.positions[idx] = nx;
      this.positions[idx + 1] = ny;
      this.positions[idx + 2] = nz;
      this.velocities[idx] = vx;
      this.velocities[idx + 1] = vy;
      this.velocities[idx + 2] = vz;

      // Orient each sword along its velocity direction (or upward in giant mode when settled)
      this._dir.set(vx, vy, vz);
      const speedSq = this._dir.lengthSq();
      if (mode === 'giant' && speedSq < 0.08) {
        this._dir.set(0.22, 1.0, 0).normalize();
      } else if (speedSq > 0.0001) {
        this._dir.normalize();
      } else {
        this._dir.set(0, 1, 0);
      }

      this._quat.setFromUnitVectors(this._zAxis, this._dir);
      const stretch = bladeLen * (0.85 + Math.min(0.65, Math.sqrt(speedSq) * 0.14));
      this._scale.set(1.0, 1.0, stretch);
      this._dummyPos.set(nx, ny, nz);

      this._mat.compose(this._dummyPos, this._quat, this._scale);
      this.mesh.setMatrixAt(i, this._mat);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
