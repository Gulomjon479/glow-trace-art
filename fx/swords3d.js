import * as THREE from 'three';
import { SwordSwarm, THEMES } from './swords.js';
import { MagicCircle } from './magicCircle.js';

export { THEMES };

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export class SwordScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 150);
    this.camera.position.set(0, 0, 18);

    this.swarm = new SwordSwarm();
    this.scene.add(this.swarm.group);

    this.magic = new MagicCircle();
    this.scene.add(this.magic.mesh);

    // Soft glow halo around each blade (cheap fake bloom)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.swarm.positions, 3));
    this.glowColors = new Float32Array(this.swarm.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(this.glowColors, 3));
    this.glow = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.95,
        map: makeGlowTexture(),
        vertexColors: true,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.glow.frustumCulled = false;
    this.scene.add(this.glow);

    this.center = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.scale = 1;
    this.mode = 'sphere';
    this.setTheme('emerald');
  }

  setTheme(name) {
    const theme = THEMES[name] || THEMES.emerald;
    this.swarm.setTheme(name);
    this.magic.setColors(theme.primary, theme.secondary);
    const src = this.swarm.mesh.instanceColor.array;
    this.glowColors.set(src);
    this.glow.geometry.attributes.color.needsUpdate = true;
  }

  resize(w, h) {
    if (this._w === w && this._h === h) return;
    this._w = w;
    this._h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  screenToWorld(sx, sy, w, h, out) {
    const visH = 2 * 18 * Math.tan(THREE.MathUtils.degToRad(26));
    out.set((sx / w - 0.5) * visH * (w / h), -(sy / h - 0.5) * visH, 0);
    return out;
  }

  update(dt, t, info) {
    const { w, h } = info;
    this.resize(w, h);
    if (info.has) {
      this.screenToWorld(info.x, info.y, w, h, this.desired);
      this.scale += (info.scale - this.scale) * Math.min(1, dt * 6);
    } else {
      this.desired.lerp(new THREE.Vector3(0, 0, 0), Math.min(1, dt * 1.2));
      this.scale += (0.85 - this.scale) * Math.min(1, dt * 2);
    }
    if (info.mode) this.mode = info.mode;
    this.center.lerp(this.desired, Math.min(1, dt * 9));

    this.swarm.update(t, dt, this.mode, this.center, this.scale);
    this.magic.update(t, dt, this.mode, this.center);
    this.glow.geometry.attributes.position.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }
}
