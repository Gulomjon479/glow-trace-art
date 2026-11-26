import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec2 vUv;

  #define PI 3.14159265359

  mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
  }

  float ring(float d, float r, float w) {
    return smoothstep(w, 0.0, abs(d - r));
  }

  float polygon(vec2 p, int N, float r) {
    float a = atan(p.x, p.y) + PI;
    float b = 2.0 * PI / float(N);
    float d = cos(floor(0.5 + a / b) * b - a) * length(p);
    return smoothstep(0.012, 0.0, abs(d - r));
  }

  void main() {
    vec2 uv = (vUv - 0.5) * 2.0;
    float d = length(uv);
    if (d > 1.0) discard;

    float angle = atan(uv.y, uv.x);

    // Outer double rings
    float r1 = ring(d, 0.92, 0.014);
    float r2 = ring(d, 0.84, 0.008);
    float r3 = ring(d, 0.58, 0.010);
    float r4 = ring(d, 0.30, 0.008);

    // Rotating rune ticks between r1 and r2
    float runeAngle = angle + uTime * 0.45;
    float ticks = step(0.5, sin(runeAngle * 24.0)) * smoothstep(0.84, 0.85, d) * smoothstep(0.92, 0.91, d);
    float subTicks = step(0.65, sin((angle - uTime * 0.6) * 36.0)) * smoothstep(0.58, 0.59, d) * smoothstep(0.64, 0.63, d);

    // Rotating sacred geometry polygons (two counter-rotating triangles = hexagram)
    vec2 p1 = rot(uTime * 0.35) * uv;
    vec2 p2 = rot(-uTime * 0.35 + PI / 3.0) * uv;
    float hex1 = polygon(p1, 3, 0.42);
    float hex2 = polygon(p2, 3, 0.42);

    // Rotating inner square / octagon
    vec2 p3 = rot(-uTime * 0.55) * uv;
    float oct = polygon(p3, 6, 0.72) * 0.65;

    // Soft radial aura
    float aura = exp(-d * 3.2) * 0.35 + smoothstep(0.98, 0.88, d) * smoothstep(0.78, 0.90, d) * 0.25;

    float pattern = r1 + r2 + r3 + r4 + ticks * 0.65 + subTicks * 0.5 + (hex1 + hex2) * 0.85 + oct;
    float pulse = 0.82 + 0.18 * sin(uTime * 3.2 - d * 6.0);

    vec3 col = mix(uColorA, uColorB, smoothstep(0.25, 0.92, d) * 0.7 + 0.3 * sin(angle * 3.0 + uTime));
    vec3 finalCol = col * (pattern * 1.45 + aura) * pulse;

    float alpha = clamp((pattern + aura * 0.8) * uOpacity, 0.0, 1.0);
    gl_FragColor = vec4(finalCol, alpha);
  }
`;

export class MagicCircle {
  constructor() {
    this.uniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uColorA: { value: new THREE.Color('#22ff88') },
      uColorB: { value: new THREE.Color('#ffe047') },
    };

    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.targetOpacity = 0;
    this.targetScale = 8;
    this.currentScale = 8;
  }

  setColors(colorA, colorB) {
    this.uniforms.uColorA.value.set(colorA);
    this.uniforms.uColorB.value.set(colorB);
  }

  update(time, dt, mode, targetPos) {
    this.uniforms.uTime.value = time;

    if (mode === 'expand') {
      this.targetOpacity = 0.95;
      this.targetScale = 15.5;
      this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, -Math.PI / 2.6, dt * 4);
      this.mesh.position.lerp(new THREE.Vector3(targetPos.x, targetPos.y - 1.5, targetPos.z - 1.0), dt * 4);
    } else if (mode === 'vortex') {
      this.targetOpacity = 0.9;
      this.targetScale = 12.0;
      this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, -Math.PI / 2.2, dt * 4);
      this.mesh.position.lerp(new THREE.Vector3(targetPos.x, targetPos.y - 4.2, targetPos.z), dt * 4);
    } else if (mode === 'giant') {
      this.targetOpacity = 0.8;
      this.targetScale = 10.5;
      this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, 0, dt * 4);
      this.mesh.position.lerp(new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z - 2.2), dt * 4);
    } else if (mode === 'sphere') {
      this.targetOpacity = 0.28;
      this.targetScale = 9.5;
      this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, 0, dt * 4);
      this.mesh.position.lerp(new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z - 0.5), dt * 4);
    } else {
      this.targetOpacity = 0.0;
    }

    this.uniforms.uOpacity.value = THREE.MathUtils.lerp(
      this.uniforms.uOpacity.value,
      this.targetOpacity,
      Math.min(1, dt * 4.5)
    );

    this.currentScale = THREE.MathUtils.lerp(this.currentScale, this.targetScale, Math.min(1, dt * 4));
    this.mesh.scale.set(this.currentScale, this.currentScale, 1);
    this.mesh.visible = this.uniforms.uOpacity.value > 0.01;
  }
}
