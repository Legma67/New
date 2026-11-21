// Partikel, Ringe, Strahlen-Segmente und schwebende Texte (alle mit Pooling)
import * as THREE from 'three';
import { S } from './state.js';

const VS = `
attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
varying vec3 vColor; varying float vAlpha;
uniform float uScale;
void main(){
  vColor = aColor; vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
varying vec3 vColor; varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.15, d));
}`;

class ParticleSystem {
  constructor(max, additive) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max); this.grow = new Float32Array(max); this.baseSize = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 400 } },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.active = 0;
  }
  emit(x, y, z, vx, vy, vz, color, size, life, grav = 0, grow = 0) {
    const i = this.i; this.i = (this.i + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    _c.set(color);
    this.col[i * 3] = _c.r; this.col[i * 3 + 1] = _c.g; this.col[i * 3 + 2] = _c.b;
    this.size[i] = size; this.baseSize[i] = size; this.alpha[i] = 1;
    this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav; this.grow[i] = grow;
  }
  update(dt) {
    const p = this.pos, v = this.vel;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; } continue; }
      this.life[i] -= dt;
      v[i * 3 + 1] -= this.grav[i] * dt;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < 0.02 && this.grav[i] > 0) { p[i * 3 + 1] = 0.02; v[i * 3 + 1] *= -0.3; v[i * 3] *= 0.7; v[i * 3 + 2] *= 0.7; }
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, k * 1.6);
      this.size[i] = this.baseSize[i] * (1 + this.grow[i] * (1 - k));
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }
}
const _c = new THREE.Color();
const _v = new THREE.Vector3();

export const FX = {
  glow: null, smoke: null, rings: [], segs: [], group: null, quality: 1,
  init(scene) {
    this.group = new THREE.Group(); scene.add(this.group);
    this.glow = new ParticleSystem(1600, true);
    this.smoke = new ParticleSystem(900, false);
    this.group.add(this.glow.points, this.smoke.points);
    const ringGeo = new THREE.RingGeometry(0.85, 1, 48); ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.visible = false; this.group.add(m); this.rings.push({ m, t: 0, dur: 1, r0: 0, r1: 1 });
    }
    const segGeo = new THREE.BoxGeometry(1, 1, 1); segGeo.translate(0, 0, 0.5);
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(segGeo, new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.visible = false; this.group.add(m); this.segs.push({ m, t: 0, dur: 0.1 });
    }
  },
  resize(h) { const s = h * 0.9; this.glow.mat.uniforms.uScale.value = s; this.smoke.mat.uniforms.uScale.value = s; },
  update(dt) {
    this.glow.update(dt); this.smoke.update(dt);
    for (const r of this.rings) {
      if (!r.m.visible) continue;
      r.t += dt; const k = r.t / r.dur;
      if (k >= 1) { r.m.visible = false; continue; }
      const rr = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 2));
      r.m.scale.set(rr, 1, rr); r.m.material.opacity = (1 - k) * r.a;
    }
    for (const s of this.segs) {
      if (!s.m.visible) continue;
      s.t += dt; const k = s.t / s.dur;
      if (k >= 1) { s.m.visible = false; continue; }
      s.m.material.opacity = 1 - k;
    }
  },
  ring(x, y, z, color, r1 = 2, dur = 0.5, r0 = 0.2, a = 0.9) {
    const r = this.rings.find((q) => !q.m.visible) || this.rings[0];
    r.m.visible = true; r.t = 0; r.dur = dur; r.r0 = r0; r.r1 = r1; r.a = a;
    r.m.position.set(x, y, z); r.m.material.color.set(color); r.m.scale.set(r0, 1, r0);
  },
  seg(a, b, color, width = 0.06, dur = 0.12) {
    const s = this.segs.find((q) => !q.m.visible) || this.segs[(Math.random() * this.segs.length) | 0];
    s.m.visible = true; s.t = 0; s.dur = dur;
    s.m.position.copy(a); s.m.lookAt(b);
    s.m.scale.set(width, width, a.distanceTo(b));
    s.m.material.color.set(color);
  },
  lightning(a, b, color = '#fde047') {
    const steps = 5; let prev = a.clone();
    for (let i = 1; i <= steps; i++) {
      const p = a.clone().lerp(b, i / steps);
      if (i < steps) p.add(_v.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5));
      this.seg(prev, p, color, 0.07, 0.15); this.seg(prev, p, '#ffffff', 0.025, 0.15);
      prev = p;
    }
  },
  burst(x, y, z, color, n = 10, speed = 3, size = 0.25, life = 0.6, grav = 6, additive = true) {
    n = Math.ceil(n * this.quality);
    const ps = additive ? this.glow : this.smoke;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = speed * (0.4 + Math.random() * 0.6);
      const r = Math.sqrt(1 - u * u);
      ps.emit(x, y, z, Math.cos(a) * r * s, Math.abs(u) * s + speed * 0.3, Math.sin(a) * r * s,
        Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), grav);
    }
  },
  smokePuff(x, y, z, color = '#9ca3af', n = 6, size = 0.6) {
    n = Math.ceil(n * this.quality);
    for (let i = 0; i < n; i++) this.smoke.emit(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 0.8, 0.8 + Math.random(), (Math.random() - 0.5) * 0.8, color, size, 0.9 + Math.random() * 0.5, -0.3, 1.5);
  },
  explosion(x, y, z, radius = 1.5, color = '#ff8a1a') {
    this.burst(x, y + 0.3, z, [color, '#ffd23f', '#fff3b0'], 22, 4 * radius, 0.45, 0.6, 5);
    this.smokePuff(x, y + 0.3, z, '#6b7280', 8, 0.9 * radius);
    this.ring(x, 0.08, z, color, radius * 2.2, 0.45);
    S.shake = Math.min(0.6, S.shake + 0.08 * radius);
  },
  trail(x, y, z, color, size = 0.2, life = 0.3, additive = true) {
    (additive ? this.glow : this.smoke).emit(x, y, z, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3 + (additive ? 0 : 0.5), (Math.random() - 0.5) * 0.3, color, size, life, 0, additive ? 0 : 1.2);
  },
};

// Schwebende Texte (DOM-Pool)
const floaters = [];
let floatLayer = null;
export function initFloaters() {
  floatLayer = document.getElementById('floaters');
  for (let i = 0; i < 40; i++) {
    const el = document.createElement('div'); el.className = 'floater'; floatLayer.appendChild(el);
    floaters.push({ el, t: 0, dur: 1, pos: new THREE.Vector3(), on: false });
  }
}
export function floatText(pos, text, color = '#ffd23f', big = false) {
  if (!floatLayer) return;
  const f = floaters.find((q) => !q.on) || floaters[(Math.random() * floaters.length) | 0];
  f.on = true; f.t = 0; f.dur = big ? 1.6 : 1.0; f.pos.copy(pos);
  f.el.textContent = text; f.el.style.color = color; f.el.style.fontSize = big ? '28px' : '17px'; f.el.style.display = 'block';
}
export function updateFloaters(dt, camera) {
  const w = window.innerWidth, h = window.innerHeight;
  for (const f of floaters) {
    if (!f.on) continue;
    f.t += dt;
    if (f.t >= f.dur) { f.on = false; f.el.style.display = 'none'; continue; }
    _v.copy(f.pos); _v.y += f.t * 1.5; _v.project(camera);
    if (_v.z > 1) { f.el.style.display = 'none'; continue; }
    f.el.style.display = 'block';
    f.el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * w}px, ${(-_v.y * 0.5 + 0.5) * h}px) translate(-50%,-50%)`;
    f.el.style.opacity = String(1 - Math.pow(f.t / f.dur, 3));
  }
}
