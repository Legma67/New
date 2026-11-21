// Prozedurale 3D-Modelle für Türme, Gegner, Dekoration und Spielwelt.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

// Statische Teilmeshes einer Gruppe pro Material zusammenführen (weniger Draw-Calls)
export function mergeStatic(group, { cast = true, receive = true } = {}) {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const byMat = new Map(); const remove = [];
  group.traverse((o) => {
    if (!o.isMesh || o === group || o.userData.keep) return;
    if (Array.isArray(o.material) || o.material.transparent) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(m);
    const arr = byMat.get(o.material) || []; arr.push(g); byMat.set(o.material, arr); remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const [material, geos] of byMat) {
    const merged = mergeGeometries(geos, false); geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material); mesh.castShadow = cast; mesh.receiveShadow = receive; mesh.userData.merged = true;
    group.add(mesh);
  }
  return group;
}

const geoCache = new Map();
const matCache = new Map();
function geo(key, fn) { let g = geoCache.get(key); if (!g) { g = fn(); geoCache.set(key, g); } return g; }

export const G = {
  box: (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (rt, rb, h, s = 12) => geo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s)),
  sph: (r, ws = 14, hs = 10) => geo(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)),
  cone: (r, h, s = 10) => geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s)),
  tor: (r, t, rs = 8, ts = 20, arc = Math.PI * 2) => geo(`t${r},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc)),
  oct: (r) => geo(`o${r}`, () => new THREE.OctahedronGeometry(r)),
  ico: (r, d = 0) => geo(`i${r},${d}`, () => new THREE.IcosahedronGeometry(r, d)),
  dode: (r) => geo(`d${r}`, () => new THREE.DodecahedronGeometry(r)),
};

export function mat(color, o = {}) {
  const key = color + '|' + (o.m || 0) + '|' + (o.r ?? 0.7) + '|' + (o.e || 0) + '|' + (o.t || 1) + '|' + (o.flat ? 1 : 0);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, metalness: o.m || 0, roughness: o.r ?? 0.7, flatShading: !!o.flat,
      emissive: o.e ? new THREE.Color(o.ec || color) : new THREE.Color(0), emissiveIntensity: o.e || 0,
      transparent: (o.t ?? 1) < 1, opacity: o.t ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}
export const basic = (color, o = {}) => {
  const key = 'B' + color + (o.t ?? 1) + (o.add ? 'a' : '');
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: (o.t ?? 1) < 1 || !!o.add, opacity: o.t ?? 1, depthWrite: !(o.add || (o.t ?? 1) < 1), blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending });
    matCache.set(key, m);
  }
  return m;
};

function add(parent, geometry, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, shadow = true) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = shadow; m.receiveShadow = true;
  parent.add(m); return m;
}
const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; };

// ---------------------------------------------------------------- Türme
function buildBase(def, g) {
  const { c1, c2, c3 } = def;
  add(g, G.cyl(0.92, 0.98, 0.14, 8), mat(c2, { flat: true }), 0, 0.07, 0);
  switch (def.base) {
    case 'stone': {
      add(g, G.cyl(0.6, 0.72, 1.0, 10), mat(c1, { flat: true }), 0, 0.64, 0);
      add(g, G.cyl(0.7, 0.7, 0.14, 10), mat(c2, { flat: true }), 0, 1.16, 0);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(g, G.box(0.2, 0.2, 0.2), mat(c1, { flat: true }), Math.cos(a) * 0.6, 1.3, Math.sin(a) * 0.6, 0, -a, 0); }
      add(g, G.box(0.22, 0.32, 0.05), mat('#2b2118'), 0, 0.42, 0.7);
      return 1.25;
    }
    case 'metal': {
      add(g, G.cyl(0.58, 0.72, 0.9, 6), mat(c1, { m: 0.6, r: 0.35, flat: true }), 0, 0.59, 0);
      add(g, G.cyl(0.74, 0.74, 0.08, 6), mat(c3, { e: 0.6 }), 0, 0.5, 0);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; add(g, G.sph(0.06, 6, 4), mat('#d1d5db', { m: 0.8, r: 0.3 }), Math.cos(a) * 0.6, 0.92, Math.sin(a) * 0.6); }
      add(g, G.cyl(0.62, 0.6, 0.1, 6), mat(c2, { m: 0.5, r: 0.4 }), 0, 1.07, 0);
      return 1.1;
    }
    case 'wood': {
      add(g, G.box(0.9, 0.85, 0.9), mat(c1, { flat: true }), 0, 0.56, 0);
      for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) add(g, G.box(0.16, 1.1, 0.16), mat(c2), x, 0.62, z);
      add(g, G.box(1.15, 0.1, 1.15), mat(c2), 0, 1.06, 0);
      add(g, G.box(0.95, 0.06, 0.06), mat(c2), 0, 0.6, 0.47);
      add(g, G.box(0.06, 0.06, 0.95), mat(c2), 0.47, 0.6, 0);
      return 1.1;
    }
    case 'crystal': {
      add(g, G.cyl(0.5, 0.7, 0.9, 8), mat(c2, { flat: true, r: 0.3 }), 0, 0.59, 0);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; add(g, G.oct(0.22), mat(c1, { e: 0.35, r: 0.15, flat: true, t: 0.9 }), Math.cos(a) * 0.68, 0.45, Math.sin(a) * 0.68, 0.3, a, 0.2); }
      add(g, G.cyl(0.58, 0.52, 0.12, 8), mat(c1, { r: 0.2, e: 0.2 }), 0, 1.06, 0);
      return 1.1;
    }
    case 'dark': {
      add(g, G.cyl(0.52, 0.76, 1.05, 5), mat(c1, { flat: true, r: 0.4 }), 0, 0.66, 0);
      add(g, G.tor(0.62, 0.05, 6, 24), mat(c3, { e: 1 }), 0, 0.4, 0, Math.PI / 2);
      add(g, G.tor(0.54, 0.04, 6, 24), mat(c3, { e: 1 }), 0, 0.95, 0, Math.PI / 2);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; add(g, G.cone(0.09, 0.4, 5), mat(c2), Math.cos(a) * 0.7, 0.3, Math.sin(a) * 0.7, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); }
      return 1.2;
    }
    case 'gold': {
      add(g, G.cyl(0.62, 0.72, 0.4, 12), mat(c1, { m: 0.85, r: 0.25 }), 0, 0.34, 0);
      add(g, G.cyl(0.48, 0.58, 0.55, 12), mat(c2, { m: 0.6, r: 0.35 }), 0, 0.8, 0);
      add(g, G.tor(0.5, 0.06, 6, 20), mat(c1, { m: 0.9, r: 0.2 }), 0, 1.08, 0, Math.PI / 2);
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.78; add(g, G.oct(0.1), mat('#ef4444', { e: 0.5, r: 0.2 }), Math.cos(a) * 0.56, 0.8, Math.sin(a) * 0.56); }
      return 1.12;
    }
    case 'nature': default: {
      add(g, G.cyl(0.58, 0.72, 0.95, 9), mat('#7a5230', { flat: true }), 0, 0.62, 0);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(g, G.ico(0.25, 0), mat(c1, { flat: true }), Math.cos(a) * 0.6, 0.3 + (i % 2) * 0.5, Math.sin(a) * 0.6); }
      add(g, G.cyl(0.66, 0.6, 0.12, 9), mat(c2, { flat: true }), 0, 1.12, 0);
      return 1.18;
    }
  }
}

function buildHead(def, head, M) {
  const { c1, c2, c3 } = def;
  const muzzle = (x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); head.add(o); M.muzzles.push(o); return o; };
  const spin = (o, axis, speed) => M.spinners.push({ o, axis, speed });
  switch (def.head) {
    case 'bow': {
      add(head, G.cyl(0.42, 0.48, 0.2, 8), mat(c2), 0, 0.1, 0);
      const b = grp(head, 0, 0.42, 0);
      add(b, G.box(0.18, 0.18, 0.9), mat(c1), 0, 0, 0.1);
      add(b, G.tor(0.45, 0.04, 5, 14, Math.PI), mat(c2), 0, 0, 0.35, 0, 0, 0);
      add(b, G.cyl(0.015, 0.015, 0.9, 4), mat('#ffffff'), 0, 0, 0.35, 0, 0, Math.PI / 2, false);
      add(b, G.cyl(0.025, 0.025, 0.8, 5), mat(c3), 0, 0.12, 0.25, Math.PI / 2);
      add(b, G.cone(0.05, 0.14, 5), mat('#cbd5e1', { m: 0.7 }), 0, 0.12, 0.7, Math.PI / 2);
      muzzle(0, 0.55, 0.7); M.recoil = b; break;
    }
    case 'cannon': {
      add(head, G.sph(0.45, 14, 10), mat(c2, { m: 0.4, r: 0.4 }), 0, 0.3, 0);
      const b = grp(head, 0, 0.35, 0);
      add(b, G.cyl(0.16, 0.2, 0.9, 12), mat(c2, { m: 0.5, r: 0.35 }), 0, 0, 0.45, Math.PI / 2);
      add(b, G.tor(0.18, 0.05, 6, 14), mat(c3, { m: 0.6, r: 0.3 }), 0, 0, 0.88);
      muzzle(0, 0.35, 0.95); M.recoil = b; break;
    }
    case 'nozzle': {
      add(head, G.cyl(0.4, 0.4, 0.55, 12), mat(c1, { m: 0.3, r: 0.4 }), 0, 0.3, 0);
      add(head, G.sph(0.4, 12, 8), mat(c1, { m: 0.3, r: 0.4 }), 0, 0.58, 0);
      const b = grp(head, 0, 0.5, 0.2);
      add(b, G.cyl(0.09, 0.14, 0.7, 10), mat('#cbd5e1', { m: 0.7, r: 0.3 }), 0, 0, 0.3, Math.PI / 2);
      add(head, G.cyl(0.42, 0.42, 0.06, 12), mat(c3, { e: 0.3 }), 0, 0.2, 0);
      muzzle(0, 0.5, 0.75); M.recoil = b; break;
    }
    case 'ice': {
      add(head, G.cyl(0.3, 0.4, 0.25, 8), mat(c2), 0, 0.12, 0);
      const c = add(head, G.oct(0.42), mat(c1, { e: 0.6, ec: '#7dd3fc', r: 0.1, flat: true, t: 0.92 }), 0, 0.75, 0);
      c.scale.set(0.8, 1.3, 0.8); spin(c, 'y', 1.2);
      add(head, G.tor(0.45, 0.03, 6, 24), mat(c3, { e: 0.8 }), 0, 0.75, 0, Math.PI / 2);
      muzzle(0, 0.75, 0.3); break;
    }
    case 'brazier': {
      add(head, G.cyl(0.55, 0.35, 0.35, 10), mat(c2, { m: 0.5, r: 0.4 }), 0, 0.18, 0);
      const fl = grp(head, 0, 0.35, 0);
      add(fl, G.cone(0.38, 0.8, 8), mat(c3, { e: 1.2, t: 0.9 }), 0, 0.35, 0, 0, 0, 0, false);
      add(fl, G.cone(0.22, 0.6, 7), mat('#ffe066', { e: 1.5 }), 0, 0.32, 0, 0, 0, 0, false);
      M.flames.push(fl); muzzle(0, 0.6, 0); break;
    }
    case 'gatling': {
      add(head, G.box(0.7, 0.4, 0.6), mat(c2, { m: 0.5, r: 0.4 }), 0, 0.25, 0);
      add(head, G.box(0.3, 0.25, 0.35), mat('#4d5e1e'), 0.45, 0.25, -0.1);
      const b = grp(head, 0, 0.3, 0.35);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(b, G.cyl(0.04, 0.04, 0.75, 6), mat('#9ca3af', { m: 0.8, r: 0.3 }), Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.35, Math.PI / 2); }
      add(b, G.cyl(0.16, 0.16, 0.08, 10), mat(c3, { m: 0.6 }), 0, 0, 0.65, Math.PI / 2);
      M.gatling = b; muzzle(0, 0.3, 1.1); M.recoil = b; break;
    }
    case 'tank': {
      add(head, G.sph(0.42, 12, 10), mat(c3, { e: 0.3, r: 0.3, t: 0.92 }), 0, 0.45, 0);
      add(head, G.tor(0.43, 0.05, 6, 18), mat(c2), 0, 0.45, 0, Math.PI / 2);
      const b = grp(head, 0, 0.45, 0.3);
      add(b, G.cyl(0.12, 0.15, 0.55, 10), mat(c2), 0, 0, 0.2, Math.PI / 2);
      add(head, G.cyl(0.05, 0.05, 0.3, 5), mat(c2), 0.2, 0.85, 0);
      muzzle(0, 0.45, 0.6); M.recoil = b; break;
    }
    case 'lamp': {
      add(head, G.cyl(0.32, 0.38, 0.8, 8), mat(c1), 0, 0.4, 0);
      for (let i = 0; i < 3; i++) add(head, G.cyl(0.39, 0.39, 0.1, 8), mat('#ef4444'), 0, 0.15 + i * 0.28, 0);
      add(head, G.cyl(0.3, 0.3, 0.45, 8), mat('#fffbe0', { e: 0.9, ec: c3, t: 0.85 }), 0, 1.02, 0);
      const bulb = add(head, G.sph(0.18), basic(c3), 0, 1.02, 0, 0, 0, 0, false);
      add(head, G.cone(0.38, 0.35, 8), mat('#ef4444'), 0, 1.42, 0);
      M.glow = bulb; muzzle(0, 1.02, 0); break;
    }
    case 'laser': {
      add(head, G.cyl(0.35, 0.42, 0.35, 10), mat(c1, { m: 0.6, r: 0.3 }), 0, 0.18, 0);
      const b = grp(head, 0, 0.5, 0);
      add(b, G.box(0.42, 0.34, 0.6), mat(c2, { m: 0.6, r: 0.3 }), 0, 0, 0);
      add(b, G.cyl(0.07, 0.09, 0.8, 8), mat('#d1d5db', { m: 0.8, r: 0.2 }), 0, 0, 0.6, Math.PI / 2);
      add(b, G.sph(0.09, 8, 6), mat(c3, { e: 2 }), 0, 0, 1.0);
      add(b, G.box(0.46, 0.06, 0.5), mat(c3, { e: 1 }), 0, 0.12, 0);
      muzzle(0, 0.5, 1.05); break;
    }
    case 'sniper': {
      add(head, G.cyl(0.3, 0.35, 0.25, 8), mat(c2), 0, 0.12, 0);
      const b = grp(head, 0, 0.42, 0);
      add(b, G.box(0.25, 0.25, 0.6), mat(c1), 0, 0, 0);
      add(b, G.cyl(0.04, 0.05, 1.3, 6), mat('#1f2937', { m: 0.6, r: 0.4 }), 0, 0, 0.9, Math.PI / 2);
      add(b, G.cyl(0.07, 0.07, 0.45, 8), mat('#111827', { m: 0.6 }), 0, 0.2, 0.1, Math.PI / 2);
      add(b, G.sph(0.05, 6, 4), mat('#60a5fa', { e: 1.5 }), 0, 0.2, 0.34);
      muzzle(0, 0.42, 1.6); M.recoil = b; break;
    }
    case 'tesla': {
      for (let i = 0; i < 4; i++) add(head, G.tor(0.32 - i * 0.05, 0.06, 6, 16), mat(c3, { m: 0.8, r: 0.25, ec: c3, e: 0.2 }), 0, 0.15 + i * 0.22, 0, Math.PI / 2);
      add(head, G.cyl(0.08, 0.12, 0.9, 8), mat(c2, { m: 0.5 }), 0, 0.45, 0);
      const orb = add(head, G.sph(0.24), mat('#fef08a', { e: 1.8 }), 0, 1.15, 0);
      M.glow = orb; muzzle(0, 1.15, 0); break;
    }
    case 'rockets': {
      add(head, G.cyl(0.3, 0.38, 0.3, 8), mat(c2, { m: 0.5 }), 0, 0.15, 0);
      const b = grp(head, 0, 0.55, 0);
      b.rotation.x = -0.35;
      add(b, G.box(0.75, 0.5, 0.7), mat(c1, { m: 0.5, r: 0.45 }), 0, 0, 0);
      for (const [x, y] of [[-0.18, 0.12], [0.18, 0.12], [-0.18, -0.12], [0.18, -0.12]]) {
        add(b, G.cyl(0.08, 0.08, 0.5, 8), mat('#f8fafc'), x, y, 0.3, Math.PI / 2);
        add(b, G.cone(0.08, 0.16, 8), mat(c3), x, y, 0.62, Math.PI / 2);
      }
      muzzle(0, 0.7, 0.6); M.recoil = b; break;
    }
    case 'dome': {
      add(head, G.sph(0.5, 14, 8), mat(c2, { m: 0.5, r: 0.35 }), 0, 0.05, 0);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(head, G.cone(0.06, 0.4, 5), mat(c3, { e: 0.8 }), Math.cos(a) * 0.38, 0.4, Math.sin(a) * 0.38, Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); }
      const orb = add(head, G.sph(0.2), mat(c3, { e: 1.5 }), 0, 0.6, 0); M.glow = orb;
      muzzle(0, 0.6, 0); break;
    }
    case 'mortar': {
      add(head, G.cyl(0.4, 0.45, 0.2, 8), mat(c2), 0, 0.1, 0);
      const b = grp(head, 0, 0.35, 0); b.rotation.x = -0.8;
      add(b, G.cyl(0.22, 0.18, 0.55, 10), mat(c1, { m: 0.4 }), 0, 0.25, 0);
      add(head, G.sph(0.12, 8, 6), mat(c3), 0.35, 0.3, -0.25);
      add(head, G.sph(0.12, 8, 6), mat(c3), -0.35, 0.3, -0.25);
      muzzle(0, 0.75, 0.3); M.recoil = b; break;
    }
    case 'mortarBig': {
      add(head, G.cyl(0.5, 0.55, 0.25, 10), mat(c2), 0, 0.12, 0);
      const b = grp(head, 0, 0.35, 0); b.rotation.x = -0.6;
      add(b, G.cyl(0.32, 0.26, 0.75, 12), mat(c1, { m: 0.5, r: 0.4 }), 0, 0.35, 0);
      add(b, G.tor(0.32, 0.06, 6, 14), mat(c3), 0, 0.72, 0, Math.PI / 2);
      add(head, G.sph(0.2, 10, 8), mat('#111'), 0.45, 0.35, -0.3);
      muzzle(0, 0.9, 0.45); M.recoil = b; break;
    }
    case 'snake': {
      add(head, G.tor(0.36, 0.13, 8, 18), mat(c1, { flat: true }), 0, 0.15, 0, Math.PI / 2);
      add(head, G.tor(0.26, 0.11, 8, 16), mat(c1, { flat: true }), 0, 0.35, 0, Math.PI / 2);
      const b = grp(head, 0, 0.65, 0.05);
      add(b, G.cyl(0.1, 0.12, 0.45, 8), mat(c1), 0, 0, 0);
      const hd = add(b, G.sph(0.2, 10, 8), mat(c1), 0, 0.25, 0.12); hd.scale.set(1, 0.8, 1.4);
      add(b, G.sph(0.05, 6, 4), mat(c3, { e: 1.5 }), 0.1, 0.33, 0.3);
      add(b, G.sph(0.05, 6, 4), mat(c3, { e: 1.5 }), -0.1, 0.33, 0.3);
      add(b, G.cone(0.025, 0.12, 4), mat('#ffffff'), 0.06, 0.15, 0.38, Math.PI);
      add(b, G.cone(0.025, 0.12, 4), mat('#ffffff'), -0.06, 0.15, 0.38, Math.PI);
      muzzle(0, 0.9, 0.4); M.recoil = b; break;
    }
    case 'triple': {
      add(head, G.cyl(0.5, 0.55, 0.4, 10), mat(c2, { m: 0.4 }), 0, 0.2, 0);
      const b = grp(head, 0, 0.45, 0);
      for (let i = 0; i < 3; i++) {
        const a = (i - 1) * 0.5;
        add(b, G.cyl(0.11, 0.13, 0.7, 8), mat(c1, { m: 0.5, r: 0.4 }), Math.sin(a) * 0.3, 0, 0.35 + Math.cos(a) * 0.05, Math.PI / 2, a, 0);
      }
      add(b, G.sph(0.3, 10, 8), mat(c3, { m: 0.4 }), 0, 0, 0);
      muzzle(-0.25, 0.45, 0.8); muzzle(0, 0.45, 0.85); muzzle(0.25, 0.45, 0.8); M.recoil = b; break;
    }
    case 'coin': {
      add(head, G.box(0.7, 0.4, 0.5), mat('#8b5a2b'), 0, 0.2, 0);
      add(head, G.box(0.72, 0.1, 0.52), mat(c1, { m: 0.8, r: 0.3 }), 0, 0.4, 0);
      for (let i = 0; i < 4; i++) add(head, G.cyl(0.12, 0.12, 0.04, 12), mat(c1, { m: 0.9, r: 0.2 }), (i - 1.5) * 0.15, 0.47 + (i % 2) * 0.04, 0);
      const c = add(head, G.cyl(0.34, 0.34, 0.07, 20), mat(c1, { m: 0.9, r: 0.2, e: 0.25 }), 0, 1.0, 0, Math.PI / 2);
      add(c, G.cyl(0.22, 0.22, 0.08, 20), mat(c3, { m: 0.9, r: 0.2 }), 0, 0, 0);
      spin(c, 'z', 2); M.glow = c; muzzle(0, 1, 0); break;
    }
    case 'orb': {
      add(head, G.cyl(0.18, 0.3, 0.6, 6), mat(c2), 0, 0.3, 0);
      const o = add(head, G.sph(0.3, 14, 10), mat(c3, { e: 1.5 }), 0, 0.95, 0);
      const r1 = add(head, G.tor(0.48, 0.035, 6, 28), mat('#fbbf24', { m: 0.8, r: 0.2 }), 0, 0.95, 0);
      const r2 = add(head, G.tor(0.42, 0.035, 6, 28), mat('#fbbf24', { m: 0.8, r: 0.2 }), 0, 0.95, 0, Math.PI / 2);
      spin(r1, 'x', 1.5); spin(r2, 'y', 2.0); M.glow = o; muzzle(0, 0.95, 0); break;
    }
    case 'cross': {
      add(head, G.box(0.25, 0.9, 0.25), mat(c3, { e: 0.6 }), 0, 0.6, 0);
      add(head, G.box(0.75, 0.25, 0.25), mat(c3, { e: 0.6 }), 0, 0.7, 0);
      const h = add(head, G.sph(0.18, 10, 8), mat('#ff4d8d', { e: 1 }), 0, 1.3, 0); M.glow = h;
      add(head, G.tor(0.4, 0.03, 6, 24), mat('#86efac', { e: 1 }), 0, 0.15, 0, Math.PI / 2);
      muzzle(0, 1.3, 0); break;
    }
    case 'antenna': {
      add(head, G.cyl(0.1, 0.18, 1.1, 8), mat(c2, { m: 0.6 }), 0, 0.55, 0);
      const d = add(head, G.sph(0.42, 14, 8, ), mat('#e2e8f0', { m: 0.5, r: 0.3 }), 0, 0.85, 0.05); d.scale.set(1, 0.35, 1); d.rotation.x = -0.6;
      for (let i = 0; i < 3; i++) { const r = add(head, G.tor(0.22 + i * 0.12, 0.025, 6, 24), mat(c3, { e: 1.2 }), 0, 1.3 + i * 0.05, 0, Math.PI / 2); spin(r, 'z', 1 + i); }
      const o = add(head, G.sph(0.1), mat(c3, { e: 2 }), 0, 1.35, 0); M.glow = o;
      muzzle(0, 1.35, 0); break;
    }
    case 'crystals': {
      const g2 = grp(head, 0, 0.5, 0);
      add(g2, G.oct(0.35), mat(c1, { e: 0.6, r: 0.1, flat: true, t: 0.9 }), 0, 0.2, 0).scale.set(0.7, 1.6, 0.7);
      add(g2, G.oct(0.2), mat(c3, { e: 0.6, r: 0.1, flat: true }), 0.35, 0, 0, 0, 0, 0.4).scale.set(0.7, 1.5, 0.7);
      add(g2, G.oct(0.2), mat(c3, { e: 0.6, r: 0.1, flat: true }), -0.3, 0, 0.2, 0, 0, -0.4).scale.set(0.7, 1.5, 0.7);
      add(g2, G.oct(0.18), mat(c1, { e: 0.6, r: 0.1, flat: true }), 0, 0, -0.32, -0.4, 0, 0).scale.set(0.7, 1.5, 0.7);
      spin(g2, 'y', 0.8); muzzle(0, 0.9, 0); break;
    }
    case 'pad': {
      add(head, G.cyl(0.6, 0.6, 0.1, 12), mat(c2, { m: 0.5 }), 0, 0.05, 0);
      add(head, G.tor(0.5, 0.03, 6, 24), mat(c3, { e: 1.2 }), 0, 0.11, 0, Math.PI / 2);
      add(head, G.cyl(0.08, 0.08, 0.6, 6), mat(c1), 0, 0.4, 0);
      add(head, G.sph(0.08), mat(c3, { e: 2 }), 0, 0.75, 0);
      M.droneRoot = grp(head, 0, 1.1, 0); M.droneRoot.userData.noYaw = true;
      break;
    }
    case 'clock': {
      add(head, G.cyl(0.08, 0.12, 0.6, 6), mat(c2, { m: 0.7 }), 0, 0.3, 0);
      const face = grp(head, 0, 1.0, 0);
      add(face, G.cyl(0.5, 0.5, 0.1, 24), mat(c1, { m: 0.8, r: 0.25 }), 0, 0, 0, Math.PI / 2);
      add(face, G.cyl(0.42, 0.42, 0.11, 24), mat('#fffdf2'), 0, 0, 0, Math.PI / 2);
      const hand1 = grp(face, 0, 0, 0.07); add(hand1, G.box(0.04, 0.34, 0.02), mat('#1f2937'), 0, 0.15, 0);
      const hand2 = grp(face, 0, 0, 0.08); add(hand2, G.box(0.05, 0.24, 0.02), mat('#b91c1c'), 0, 0.1, 0);
      spin(hand1, 'z', -3); spin(hand2, 'z', -0.5);
      add(head, G.tor(0.62, 0.03, 6, 30), mat(c3, { e: 1 }), 0, 1.0, 0);
      M.glow = face; muzzle(0, 1, 0); break;
    }
    case 'plasma': {
      add(head, G.cyl(0.38, 0.45, 0.35, 8), mat(c2, { m: 0.5 }), 0, 0.18, 0);
      const b = grp(head, 0, 0.55, 0);
      add(b, G.cyl(0.26, 0.3, 0.55, 10), mat(c1, { m: 0.5, r: 0.35 }), 0, 0, 0.1, Math.PI / 2);
      for (let i = 0; i < 3; i++) add(b, G.tor(0.22, 0.04, 6, 16), mat(c3, { e: 1.5 }), 0, 0, 0.3 + i * 0.15);
      add(b, G.sph(0.14), mat(c3, { e: 2.2 }), 0, 0, 0.75);
      muzzle(0, 0.55, 0.85); M.recoil = b; break;
    }
    case 'icelaser': {
      add(head, G.cyl(0.32, 0.4, 0.3, 8), mat(c2), 0, 0.15, 0);
      const b = grp(head, 0, 0.55, 0);
      add(b, G.oct(0.3), mat(c1, { e: 0.5, r: 0.1, flat: true, t: 0.9 }), 0, 0, 0).scale.set(0.8, 0.8, 1.4);
      add(b, G.cyl(0.06, 0.1, 0.8, 8), mat('#e0f2fe', { m: 0.7, r: 0.2 }), 0, 0, 0.6, Math.PI / 2);
      add(b, G.oct(0.12), mat(c3, { e: 2 }), 0, 0, 1.0);
      muzzle(0, 0.55, 1.05); break;
    }
    case 'spiky': {
      add(head, G.ico(0.45, 0), mat(c1, { flat: true, r: 0.5 }), 0, 0.45, 0);
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; add(head, G.cone(0.08, 0.35, 5), mat(c3, { e: 0.8 }), Math.cos(a) * 0.4, 0.5 + (i % 2) * 0.15, Math.sin(a) * 0.4, Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2); }
      const b = grp(head, 0, 0.45, 0.3);
      add(b, G.cyl(0.13, 0.18, 0.55, 8), mat(c2), 0, 0, 0.2, Math.PI / 2);
      add(b, G.tor(0.14, 0.04, 6, 12), mat(c3, { e: 1.5 }), 0, 0, 0.48);
      muzzle(0, 0.45, 0.85); M.recoil = b; break;
    }
    case 'observatory': {
      add(head, G.cyl(0.55, 0.55, 0.3, 12), mat(c1), 0, 0.15, 0);
      const d = add(head, G.sph(0.55, 14, 8, ), mat('#d6d3d1', { m: 0.4 }), 0, 0.3, 0); d.scale.y = 0.75;
      const b = grp(head, 0, 0.55, 0); b.rotation.x = -0.7;
      add(b, G.cyl(0.1, 0.14, 0.8, 8), mat(c2, { m: 0.6 }), 0, 0.35, 0);
      const rock = add(head, G.dode(0.22), mat(c3, { e: 1.2, flat: true }), 0, 1.5, 0);
      spin(rock, 'y', 1.5); M.glow = rock; muzzle(0, 1.5, 0); break;
    }
    case 'hole': {
      add(head, G.cyl(0.12, 0.3, 0.6, 6), mat(c1), 0, 0.3, 0);
      const h = add(head, G.sph(0.32, 16, 12), basic('#000000'), 0, 1.0, 0);
      const d = add(head, G.tor(0.55, 0.12, 6, 32), mat(c3, { e: 1.4, t: 0.85 }), 0, 1.0, 0, Math.PI / 2 - 0.3);
      const d2 = add(head, G.tor(0.75, 0.04, 6, 32), mat('#f0abfc', { e: 1.5 }), 0, 1.0, 0, Math.PI / 2 + 0.2);
      spin(d, 'z', 2.5); spin(d2, 'z', -1.5); M.glow = h; muzzle(0, 1.0, 0); break;
    }
    case 'dragon': {
      const b = grp(head, 0, 0.55, 0);
      add(b, G.box(0.5, 0.45, 0.75), mat(c1, { flat: true }), 0, 0, 0.1);
      add(b, G.box(0.44, 0.15, 0.55), mat(c1, { flat: true }), 0, -0.25, 0.4);
      add(b, G.box(0.46, 0.16, 0.6), mat(c2, { flat: true }), 0, -0.05, 0.55);
      add(b, G.cone(0.08, 0.45, 5), mat(c3, { m: 0.6 }), 0.18, 0.35, -0.15, -0.6);
      add(b, G.cone(0.08, 0.45, 5), mat(c3, { m: 0.6 }), -0.18, 0.35, -0.15, -0.6);
      add(b, G.sph(0.07, 6, 4), mat('#fde047', { e: 2 }), 0.2, 0.12, 0.42);
      add(b, G.sph(0.07, 6, 4), mat('#fde047', { e: 2 }), -0.2, 0.12, 0.42);
      for (let i = 0; i < 4; i++) add(b, G.cone(0.05, 0.25, 4), mat(c3), 0, 0.28 - i * 0.02, -0.1 - i * 0.18, -1.2);
      const wl = add(head, G.box(0.9, 0.04, 0.5), mat(c2, { flat: true }), 0.6, 0.6, -0.2, 0, 0, 0.5);
      const wr = add(head, G.box(0.9, 0.04, 0.5), mat(c2, { flat: true }), -0.6, 0.6, -0.2, 0, 0, -0.5);
      M.wings = [wl, wr]; muzzle(0, 0.5, 0.95); M.recoil = b; break;
    }
    default: {
      add(head, G.sph(0.4), mat(c1), 0, 0.4, 0); muzzle(0, 0.4, 0.4);
    }
  }
}

// Stufen-Optik: je höher, desto prunkvoller
export function applyLevelVisuals(M, def, lvl) {
  if (M.levelGroup) { M.group.remove(M.levelGroup); }
  const L = new THREE.Group(); M.levelGroup = L; M.group.add(L);
  const gold = mat('#fbbf24', { m: 0.85, r: 0.25 });
  if (lvl >= 1) add(L, G.tor(0.8, 0.05, 6, 24), gold, 0, 0.16, 0, Math.PI / 2);
  if (lvl >= 2) for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + 0.78;
    add(L, G.cyl(0.03, 0.03, 0.7, 4), mat('#57534e'), Math.cos(a) * 0.85, 0.5, Math.sin(a) * 0.85);
    add(L, G.box(0.02, 0.18, 0.26), mat(def.c3, { e: 0.3 }), Math.cos(a) * 0.85, 0.75, Math.sin(a) * 0.85 + 0.13, 0, 0, 0);
  }
  if (lvl >= 3) add(L, G.tor(0.84, 0.06, 6, 24), mat(def.c3, { e: 0.9 }), 0, 0.3, 0, Math.PI / 2);
  M.orbiters = [];
  if (lvl >= 4) {
    const og = grp(L, 0, M.baseH + 0.4, 0);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; add(og, G.oct(0.09), mat(def.c3, { e: 1.5 }), Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95, 0, 0, 0, false); }
    M.orbiters.push(og);
  }
  if (lvl >= 5) {
    const cr = grp(L, 0, 0, 0);
    add(cr, G.cyl(0.95, 0.95, 0.02, 24), mat(def.c3, { e: 1.2, t: 0.35 }), 0, 0.02, 0, 0, 0, 0, false);
    add(cr, G.tor(0.98, 0.04, 6, 30), mat(def.c3, { e: 2 }), 0, 0.03, 0, Math.PI / 2, 0, 0, false);
    M.aura = cr;
  }
  const s = 1 + lvl * 0.045;
  M.headWrap.scale.setScalar(s);
  M.baseWrap.scale.set(1 + lvl * 0.02, 1 + lvl * 0.06, 1 + lvl * 0.02);
  M.headWrap.position.y = M.baseH * (1 + lvl * 0.06);
}

export function makeTowerModel(def, lvl = 0) {
  const group = new THREE.Group();
  const M = { group, muzzles: [], spinners: [], flames: [], recoil: null, glow: null, wings: null, droneRoot: null, gatling: null, orbiters: [], aura: null };
  M.baseWrap = grp(group);
  M.baseH = buildBase(def, M.baseWrap);
  mergeStatic(M.baseWrap);
  M.headWrap = grp(group, 0, M.baseH, 0);
  M.head = grp(M.headWrap);
  buildHead(def, M.head, M);
  applyLevelVisuals(M, def, lvl);
  return M;
}

export function makeDrone(color) {
  const d = new THREE.Group();
  add(d, G.box(0.28, 0.1, 0.28), mat('#1f2937', { m: 0.6 }), 0, 0, 0);
  add(d, G.sph(0.07, 8, 6), mat(color, { e: 2 }), 0, -0.05, 0.12);
  const rotors = [];
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
    rotors.push(add(d, G.cyl(0.11, 0.11, 0.015, 10), mat('#cbd5e1', { t: 0.6 }), x, 0.07, z, 0, 0, 0, false));
  }
  d.userData.rotors = rotors;
  return d;
}

// ---------------------------------------------------------------- Gegner
export function makeEnemyModel(def) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const s = def.size * 1.3;
  body.scale.setScalar(s);
  const bodyMat = new THREE.MeshStandardMaterial({ color: def.c1, roughness: 0.6, flatShading: true, emissive: new THREE.Color(def.glow ? def.c1 : '#000'), emissiveIntensity: def.glow ? 0.5 : 0, transparent: true, opacity: 1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: def.c2, roughness: 0.7, flatShading: true, transparent: true, opacity: 1 });
  const E = { root, body, legs: [], arms: [], wings: [], mats: [bodyMat, darkMat], bob: 0.06, shape: def.shape, flyH: def.flying ? 1.4 : 0 };
  const eye = mat('#ffffff', { r: 0.3 }), pupil = mat('#111111', { r: 0.3 });
  const eyes = (p, y, z, sep, r = 0.07) => {
    add(p, G.sph(r, 8, 6), eye, sep, y, z, 0, 0, 0, false); add(p, G.sph(r * 0.55, 6, 4), pupil, sep, y, z + r * 0.6, 0, 0, 0, false);
    add(p, G.sph(r, 8, 6), eye, -sep, y, z, 0, 0, 0, false); add(p, G.sph(r * 0.55, 6, 4), pupil, -sep, y, z + r * 0.6, 0, 0, 0, false);
  };
  switch (def.shape) {
    case 'humanoid': case 'knight': case 'skeleton': {
      const thin = def.shape === 'skeleton';
      const lm = thin ? bodyMat : darkMat;
      for (const x of [-0.15, 0.15]) { const l = grp(body, x, 0.45, 0); add(l, G.box(thin ? 0.09 : 0.18, 0.45, thin ? 0.09 : 0.2), lm, 0, -0.22, 0); E.legs.push(l); }
      const torso = add(body, G.box(thin ? 0.32 : 0.5, 0.5, thin ? 0.2 : 0.32), bodyMat, 0, 0.7, 0);
      if (thin) for (let i = 0; i < 3; i++) add(body, G.box(0.4, 0.04, 0.24), darkMat, 0, 0.6 + i * 0.12, 0);
      for (const x of [-0.33, 0.33]) { const a = grp(body, x * (thin ? 0.8 : 1), 0.9, 0); add(a, G.box(thin ? 0.08 : 0.14, 0.45, thin ? 0.08 : 0.16), bodyMat, 0, -0.2, 0); E.arms.push(a); }
      const head = add(body, thin ? G.sph(0.2, 8, 6) : G.box(0.38, 0.36, 0.36), bodyMat, 0, 1.15, 0);
      eyes(body, 1.18, 0.18, 0.09, thin ? 0.06 : 0.07);
      if (thin) { head.material = bodyMat; add(body, G.box(0.2, 0.05, 0.05), darkMat, 0, 1.03, 0.16); }
      if (def.shape === 'knight') {
        add(body, G.box(0.42, 0.16, 0.42), darkMat, 0, 1.33, 0);
        add(body, G.box(0.56, 0.3, 0.38), darkMat, 0, 0.82, 0);
        add(body, G.cone(0.08, 0.3, 6), mat('#ef4444'), 0, 1.5, 0);
        if (def.shield || def.armor) add(body, G.box(0.06, 0.5, 0.42), mat('#d1d5db', { m: 0.7, r: 0.3 }), -0.42, 0.75, 0.1);
      }
      if (def.horns) { add(body, G.cone(0.06, 0.25, 5), mat('#fef3c7'), 0.16, 1.4, 0, 0, 0, -0.4); add(body, G.cone(0.06, 0.25, 5), mat('#fef3c7'), -0.16, 1.4, 0, 0, 0, 0.4); }
      if (def.hat) { add(body, G.cone(0.25, 0.5, 8), darkMat, 0, 1.55, 0); add(body, G.cyl(0.32, 0.32, 0.04, 12), darkMat, 0, 1.33, 0); }
      if (def.cape) add(body, G.box(0.5, 0.7, 0.04), darkMat, 0, 0.7, -0.2, 0.15);
      if (def.heal) add(body, G.box(0.1, 0.3, 0.05), mat('#22c55e', { e: 0.8 }), 0, 0.72, 0.17), add(body, G.box(0.3, 0.1, 0.05), mat('#22c55e', { e: 0.8 }), 0, 0.72, 0.17);
      if (def.id === 'zombie') { E.arms.forEach((a) => (a.rotation.x = -1.4)); E.zombie = true; }
      break;
    }
    case 'blob': {
      const b = add(body, G.sph(0.45, 14, 10), bodyMat, 0, 0.42, 0); b.scale.set(1, 0.85, 1);
      E.squash = b; eyes(body, 0.55, 0.36, 0.14, 0.09);
      add(body, G.box(0.18, 0.04, 0.04), darkMat, 0, 0.4, 0.43);
      if (def.id === 'slowpoke') add(body, G.cone(0.2, 0.3, 6), darkMat, 0, 0.85, -0.1);
      E.bob = 0.12; break;
    }
    case 'golem': {
      for (const x of [-0.25, 0.25]) { const l = grp(body, x, 0.5, 0); add(l, G.box(0.3, 0.5, 0.32), darkMat, 0, -0.25, 0); E.legs.push(l); }
      add(body, G.dode(0.48), bodyMat, 0, 0.9, 0);
      for (const x of [-0.55, 0.55]) { const a = grp(body, x, 1.05, 0); add(a, G.dode(0.2), bodyMat, 0, -0.15, 0); add(a, G.dode(0.22), darkMat, 0, -0.5, 0); E.arms.push(a); }
      add(body, G.box(0.36, 0.3, 0.32), bodyMat, 0, 1.4, 0.05);
      add(body, G.box(0.08, 0.06, 0.04), mat('#ffd23f', { e: 2 }), 0.09, 1.43, 0.22);
      add(body, G.box(0.08, 0.06, 0.04), mat('#ffd23f', { e: 2 }), -0.09, 1.43, 0.22);
      E.bob = 0.04; break;
    }
    case 'robot': {
      for (const x of [-0.16, 0.16]) { const l = grp(body, x, 0.45, 0); add(l, G.box(0.14, 0.45, 0.14), darkMat, 0, -0.22, 0); E.legs.push(l); }
      add(body, G.box(0.55, 0.5, 0.4), bodyMat, 0, 0.72, 0);
      add(body, G.box(0.3, 0.2, 0.05), mat('#22d3ee', { e: 1.5 }), 0, 0.75, 0.21);
      for (const x of [-0.36, 0.36]) { const a = grp(body, x, 0.92, 0); add(a, G.box(0.12, 0.45, 0.12), darkMat, 0, -0.2, 0); E.arms.push(a); }
      add(body, G.box(0.36, 0.3, 0.32), bodyMat, 0, 1.15, 0);
      add(body, G.box(0.26, 0.07, 0.04), mat('#ef4444', { e: 2 }), 0, 1.17, 0.17);
      add(body, G.cyl(0.015, 0.015, 0.3, 4), darkMat, 0.1, 1.45, 0);
      add(body, G.sph(0.04, 6, 4), mat('#ef4444', { e: 2 }), 0.1, 1.6, 0);
      E.bob = 0.03; break;
    }
    case 'spider': {
      add(body, G.sph(0.32, 10, 8), bodyMat, 0, 0.4, -0.15).scale.set(1, 0.8, 1.2);
      add(body, G.sph(0.2, 10, 8), bodyMat, 0, 0.38, 0.25);
      add(body, G.sph(0.05, 6, 4), mat(def.c2, { e: 2 }), 0.07, 0.45, 0.42);
      add(body, G.sph(0.05, 6, 4), mat(def.c2, { e: 2 }), -0.07, 0.45, 0.42);
      for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) {
        const l = grp(body, sd * 0.2, 0.4, 0.2 - i * 0.14); l.rotation.z = sd * 0.7;
        add(l, G.box(0.04, 0.04, 0.5), darkMat, sd * 0.22, 0, 0, 0, sd * (0.4 + i * 0.2), 0); E.legs.push(l);
      }
      E.spider = true; break;
    }
    case 'flyer': {
      add(body, G.sph(0.3, 12, 8), bodyMat, 0, 0, 0);
      eyes(body, 0.08, 0.25, 0.1, 0.07);
      for (const sd of [-1, 1]) { const w = grp(body, sd * 0.25, 0.05, 0); add(w, G.box(0.6, 0.03, 0.35), darkMat, sd * 0.3, 0, 0); E.wings.push(w); }
      add(body, G.cone(0.05, 0.15, 4), mat('#fef3c7'), 0, -0.05, 0.3, Math.PI / 2);
      break;
    }
    case 'ghost': {
      const b = add(body, G.sph(0.38, 14, 10), bodyMat, 0, 0.7, 0);
      add(body, G.cone(0.38, 0.6, 14), bodyMat, 0, 0.3, 0, Math.PI);
      eyes(body, 0.78, 0.32, 0.12, 0.08);
      add(body, G.sph(0.08, 8, 6), pupil, 0, 0.6, 0.33).scale.set(1, 1.3, 0.5);
      for (const x of [-0.4, 0.4]) { const a = grp(body, x, 0.7, 0); add(a, G.cone(0.1, 0.4, 6), bodyMat, 0, -0.1, 0.1, 0.8); E.arms.push(a); }
      bodyMat.opacity = 0.85; darkMat.opacity = 0.85; E.ghost = true; E.flyH = def.flying ? 1.2 : 0.25; E.bob = 0.1;
      break;
    }
    case 'dragon': {
      add(body, G.sph(0.4, 12, 8), bodyMat, 0, 0, 0).scale.set(0.9, 0.8, 1.3);
      add(body, G.cyl(0.13, 0.18, 0.45, 8), bodyMat, 0, 0.25, 0.4, -0.8);
      add(body, G.box(0.3, 0.25, 0.4), bodyMat, 0, 0.45, 0.65);
      add(body, G.box(0.26, 0.1, 0.25), darkMat, 0, 0.35, 0.85);
      add(body, G.sph(0.05, 6, 4), mat('#fde047', { e: 2 }), 0.1, 0.52, 0.8);
      add(body, G.sph(0.05, 6, 4), mat('#fde047', { e: 2 }), -0.1, 0.52, 0.8);
      add(body, G.cone(0.05, 0.2, 4), mat('#fef3c7'), 0.1, 0.65, 0.55, -0.5);
      add(body, G.cone(0.05, 0.2, 4), mat('#fef3c7'), -0.1, 0.65, 0.55, -0.5);
      add(body, G.cone(0.12, 0.7, 6), bodyMat, 0, -0.05, -0.75, -Math.PI / 2);
      for (const sd of [-1, 1]) { const w = grp(body, sd * 0.25, 0.2, 0); add(w, G.box(0.9, 0.03, 0.55), darkMat, sd * 0.45, 0, -0.05); E.wings.push(w); }
      if (!def.flying) E.flyH = 0.5;
      break;
    }
  }
  if (def.crown) {
    const cr = grp(body, 0, def.shape === 'blob' ? 0.85 : 1.6, 0);
    add(cr, G.cyl(0.2, 0.2, 0.12, 8, ), mat('#fbbf24', { m: 0.9, r: 0.2, e: 0.2 }), 0, 0, 0);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; add(cr, G.cone(0.05, 0.14, 4), mat('#fbbf24', { m: 0.9, r: 0.2 }), Math.cos(a) * 0.17, 0.12, Math.sin(a) * 0.17); }
  }
  if (def.boss || def.miniboss) {
    add(root, G.tor(0.55 * s, 0.04, 6, 24), basic(def.boss ? '#ff3d3d' : '#ffb400', { t: 0.7 }), 0, 0.05, 0, Math.PI / 2, 0, 0, false);
  }
  // Schild-Blase
  if (def.shield) {
    const sh = new THREE.Mesh(G.sph(0.75, 16, 12), new THREE.MeshStandardMaterial({ color: '#60a5fa', emissive: '#3b82f6', emissiveIntensity: 0.6, transparent: true, opacity: 0.25, depthWrite: false }));
    sh.position.y = 0.7 * s; sh.scale.setScalar(s); root.add(sh); E.shieldMesh = sh;
  }
  // Lebensleiste
  const hb = new THREE.Group();
  const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#1a1a1a', depthTest: true }));
  bg.scale.set(1.0, 0.13, 1); bg.center.set(0.5, 0.5);
  const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#4ade80' }));
  fg.center.set(0, 0.5); fg.scale.set(0.94, 0.09, 1); fg.position.set(-0.47, 0, 0.001);
  hb.add(bg); hb.add(fg);
  const top = (def.shape === 'blob' ? 1.0 : def.shape === 'flyer' ? 0.6 : 1.7) * s + 0.25;
  hb.position.y = top + E.flyH; hb.scale.setScalar(Math.max(0.8, Math.min(1.8, s)));
  root.add(hb);
  E.hb = hb; E.hbFg = fg;
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return E;
}

// ---------------------------------------------------------------- Dekoration
export function makeTree(kind, biome) {
  const g = new THREE.Group();
  const trunk = mat('#7a5230', { flat: true });
  switch (kind) {
    case 'pine': case 'snowpine': case 'darkpine': {
      const c = kind === 'darkpine' ? '#1f3a2a' : '#2f7d45';
      add(g, G.cyl(0.12, 0.16, 0.6, 6), trunk, 0, 0.3, 0);
      for (let i = 0; i < 3; i++) {
        add(g, G.cone(0.85 - i * 0.22, 0.9, 7), mat(c, { flat: true }), 0, 0.8 + i * 0.5, 0);
        if (kind === 'snowpine') add(g, G.cone(0.5 - i * 0.13, 0.35, 7), mat('#ffffff', { flat: true }), 0, 1.05 + i * 0.5, 0);
      }
      break;
    }
    case 'palm': {
      for (let i = 0; i < 5; i++) add(g, G.cyl(0.11 - i * 0.01, 0.13 - i * 0.01, 0.45, 6), mat('#9c6b3c', { flat: true }), Math.sin(i * 0.4) * 0.1 * i, 0.22 + i * 0.42, 0, 0, 0, -0.08 * i);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(g, G.box(1.1, 0.04, 0.3), mat('#3fa34d', { flat: true }), Math.cos(a) * 0.5 + 0.35, 2.2, Math.sin(a) * 0.5, 0, -a, -0.35); }
      add(g, G.sph(0.12, 6, 4), mat('#6b4423'), 0.35, 2.1, 0.1);
      break;
    }
    case 'cactus': {
      const c = mat('#3f9b4a', { flat: true });
      add(g, G.cyl(0.22, 0.25, 1.6, 8), c, 0, 0.8, 0);
      add(g, G.sph(0.22, 8, 6), c, 0, 1.6, 0);
      add(g, G.cyl(0.12, 0.12, 0.5, 6), c, 0.35, 0.8, 0, 0, 0, Math.PI / 2);
      add(g, G.cyl(0.12, 0.12, 0.5, 6), c, 0.55, 1.05, 0);
      add(g, G.cyl(0.11, 0.11, 0.4, 6), c, -0.32, 1.1, 0, 0, 0, Math.PI / 2);
      add(g, G.cyl(0.11, 0.11, 0.4, 6), c, -0.48, 1.3, 0);
      add(g, G.sph(0.08, 6, 4), mat('#ff6bb5'), 0, 1.82, 0);
      break;
    }
    case 'deadtree': {
      const t = mat('#3b2a20', { flat: true });
      add(g, G.cyl(0.1, 0.18, 1.6, 6), t, 0, 0.8, 0);
      add(g, G.cyl(0.05, 0.08, 0.8, 5), t, 0.3, 1.4, 0, 0, 0, -0.8);
      add(g, G.cyl(0.05, 0.07, 0.7, 5), t, -0.25, 1.2, 0.1, 0, 0, 0.9);
      add(g, G.cyl(0.04, 0.06, 0.5, 5), t, 0.05, 1.8, -0.2, 0.6, 0, 0);
      break;
    }
    case 'jungle': {
      add(g, G.cyl(0.15, 0.22, 1.8, 7), trunk, 0, 0.9, 0);
      add(g, G.ico(0.8, 0), mat('#2f8d3a', { flat: true }), 0, 2.1, 0).scale.set(1.2, 0.7, 1.2);
      add(g, G.ico(0.6, 0), mat('#3fae4a', { flat: true }), 0.4, 2.5, 0.2).scale.set(1, 0.7, 1);
      add(g, G.ico(0.5, 0), mat('#267a31', { flat: true }), -0.5, 1.8, -0.2);
      add(g, G.cyl(0.02, 0.02, 1.2, 3), mat('#4d7c0f'), 0.6, 1.4, 0.3);
      break;
    }
    case 'icecrystal': case 'crystaltree': {
      const c = kind === 'icecrystal' ? '#bfe9ff' : '#f0abfc';
      if (kind === 'crystaltree') add(g, G.cyl(0.1, 0.16, 1.0, 6), mat('#6b21a8'), 0, 0.5, 0);
      const y0 = kind === 'crystaltree' ? 1.3 : 0.6;
      add(g, G.oct(0.4), mat(c, { e: 0.5, r: 0.1, flat: true, t: 0.9 }), 0, y0, 0).scale.set(0.7, 1.7, 0.7);
      add(g, G.oct(0.25), mat(c, { e: 0.5, r: 0.1, flat: true, t: 0.9 }), 0.35, y0 - 0.25, 0.1, 0, 0, -0.5).scale.set(0.7, 1.6, 0.7);
      add(g, G.oct(0.22), mat(c, { e: 0.5, r: 0.1, flat: true, t: 0.9 }), -0.3, y0 - 0.3, -0.1, 0, 0, 0.5).scale.set(0.7, 1.6, 0.7);
      break;
    }
    case 'mushroom': {
      add(g, G.cyl(0.18, 0.25, 1.0, 8), mat('#f5f0e1'), 0, 0.5, 0);
      add(g, G.sph(0.75, 14, 8, ), mat('#e11d48', { flat: true }), 0, 1.0, 0).scale.set(1, 0.55, 1);
      for (let i = 0; i < 6; i++) { const a = i * 1.1; add(g, G.sph(0.1, 6, 4), mat('#ffffff'), Math.cos(a) * 0.45, 1.25, Math.sin(a) * 0.45); }
      break;
    }
    case 'bush': case 'deadbush': {
      const c = kind === 'deadbush' ? '#a3864a' : '#3e9b45';
      add(g, G.ico(0.45, 0), mat(c, { flat: true }), 0, 0.35, 0);
      add(g, G.ico(0.32, 0), mat(c, { flat: true }), 0.35, 0.28, 0.1);
      add(g, G.ico(0.3, 0), mat(c, { flat: true }), -0.3, 0.25, -0.1);
      if (kind === 'bush') for (let i = 0; i < 3; i++) add(g, G.sph(0.06, 5, 4), mat('#ef4444'), Math.cos(i * 2) * 0.35, 0.5, Math.sin(i * 2) * 0.35);
      break;
    }
    case 'rock': case 'lavarock': {
      add(g, G.dode(0.45), mat(biome?.rocks || '#9aa0a6', { flat: true }), 0, 0.3, 0).scale.set(1.2, 0.8, 1);
      add(g, G.dode(0.25), mat(biome?.rocks || '#9aa0a6', { flat: true }), 0.45, 0.15, 0.2);
      if (kind === 'lavarock') add(g, G.dode(0.18), mat('#ff5a00', { e: 1.5 }), 0.1, 0.55, 0.1);
      break;
    }
    case 'oak': default: {
      add(g, G.cyl(0.14, 0.2, 1.0, 7), trunk, 0, 0.5, 0);
      add(g, G.ico(0.75, 0), mat('#3f9b3f', { flat: true }), 0, 1.45, 0);
      add(g, G.ico(0.5, 0), mat('#4cb34c', { flat: true }), 0.4, 1.7, 0.2);
      add(g, G.ico(0.45, 0), mat('#358a35', { flat: true }), -0.35, 1.3, -0.25);
    }
  }
  return g;
}

export function makeDeco(kind, biome) {
  const g = new THREE.Group();
  const M = { group: g, spinners: [], fountain: null };
  switch (kind) {
    case 'tree': g.add(makeTree(biome?.trees?.[0] || 'oak', biome)); break;
    case 'bush': g.add(makeTree('bush', biome)); break;
    case 'rock': g.add(makeTree('rock', biome)); break;
    case 'crystaltree': g.add(makeTree('crystaltree', biome)); break;
    case 'mushroom': g.add(makeTree('mushroom', biome)); break;
    case 'flowers': {
      const cols = ['#ff4d8d', '#ffd23f', '#a78bfa', '#ffffff', '#ff7a1a'];
      for (let i = 0; i < 9; i++) {
        const x = (Math.random() - 0.5) * 1.4, z = (Math.random() - 0.5) * 1.4;
        add(g, G.cyl(0.02, 0.02, 0.3, 3), mat('#3f8f3a'), x, 0.15, z, 0, 0, 0, false);
        add(g, G.sph(0.09, 6, 4), mat(cols[i % cols.length]), x, 0.32, z, 0, 0, 0, false);
      }
      break;
    }
    case 'lantern': {
      add(g, G.cyl(0.05, 0.08, 1.6, 6), mat('#222831', { m: 0.6 }), 0, 0.8, 0);
      add(g, G.box(0.28, 0.32, 0.28), mat('#fff1b8', { e: 1.4, ec: '#ffcc55' }), 0, 1.7, 0);
      add(g, G.cone(0.24, 0.2, 4), mat('#222831', { m: 0.6 }), 0, 1.96, 0, 0, Math.PI / 4);
      M.light = true; break;
    }
    case 'fence': {
      const w = mat('#b07d4b', { flat: true });
      for (const x of [-0.85, 0, 0.85]) add(g, G.box(0.12, 0.7, 0.12), w, x, 0.35, 0);
      add(g, G.box(1.9, 0.1, 0.06), w, 0, 0.5, 0); add(g, G.box(1.9, 0.1, 0.06), w, 0, 0.25, 0);
      break;
    }
    case 'fountain': {
      add(g, G.cyl(0.9, 0.95, 0.35, 16), mat('#c9c3b6', { flat: true }), 0, 0.18, 0);
      add(g, G.cyl(0.78, 0.78, 0.05, 16), mat('#4fb3e8', { e: 0.2, r: 0.1 }), 0, 0.34, 0);
      add(g, G.cyl(0.12, 0.16, 0.8, 8), mat('#c9c3b6'), 0, 0.7, 0);
      add(g, G.cyl(0.4, 0.3, 0.12, 12), mat('#c9c3b6'), 0, 1.1, 0);
      const w = add(g, G.cone(0.3, 0.5, 10), mat('#9be1ff', { e: 0.4, t: 0.6 }), 0, 1.35, 0, 0, 0, 0, false);
      M.fountain = w; break;
    }
    case 'house': {
      const cols = ['#f5d0a9', '#ffe4e6', '#dbeafe', '#fef9c3'];
      add(g, G.box(1.4, 0.9, 1.2), mat(cols[Math.floor(Math.random() * cols.length)], { flat: true }), 0, 0.45, 0);
      const r = add(g, G.cone(1.15, 0.8, 4), mat('#c2410c', { flat: true }), 0, 1.3, 0, 0, Math.PI / 4); r.scale.set(1, 1, 0.9);
      add(g, G.box(0.3, 0.5, 0.05), mat('#7c4a1e'), 0, 0.25, 0.61);
      add(g, G.box(0.25, 0.25, 0.05), mat('#bfe3ff', { e: 0.3 }), 0.42, 0.55, 0.61);
      add(g, G.box(0.25, 0.25, 0.05), mat('#bfe3ff', { e: 0.3 }), -0.42, 0.55, 0.61);
      add(g, G.box(0.2, 0.5, 0.2), mat('#7f1d1d'), 0.4, 1.5, -0.2);
      break;
    }
    case 'statue': case 'goldstatue': {
      const c = kind === 'goldstatue' ? mat('#fbbf24', { m: 0.9, r: 0.25 }) : mat('#d6d3d1', { flat: true });
      add(g, G.box(0.9, 0.5, 0.9), mat('#a8a29e', { flat: true }), 0, 0.25, 0);
      add(g, G.box(0.35, 0.6, 0.25), c, 0, 0.85, 0);
      add(g, G.sph(0.18, 10, 8), c, 0, 1.32, 0);
      add(g, G.box(0.1, 0.7, 0.1), c, 0.25, 1.1, 0, 0, 0, -0.3);
      add(g, G.cone(0.06, 0.6, 4), c, 0.42, 1.6, 0);
      break;
    }
    case 'dragonstatue': {
      add(g, G.box(1.0, 0.4, 1.0), mat('#57534e', { flat: true }), 0, 0.2, 0);
      const s = makeEnemyModel({ shape: 'dragon', size: 1.0, c1: '#9ca3af', c2: '#57534e' });
      s.root.remove(s.hb); s.root.position.y = 0.85; g.add(s.root);
      break;
    }
    case 'windmill': {
      add(g, G.cyl(0.4, 0.6, 1.8, 8), mat('#f5f0e1', { flat: true }), 0, 0.9, 0);
      add(g, G.cone(0.55, 0.6, 8), mat('#b91c1c', { flat: true }), 0, 2.1, 0);
      const bl = grp(g, 0, 1.7, 0.55);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; add(bl, G.box(0.18, 1.2, 0.04), mat('#d6c7a1'), Math.sin(a) * 0.6, Math.cos(a) * 0.6, 0, 0, 0, -a); }
      add(bl, G.sph(0.1, 8, 6), mat('#7c4a1e'), 0, 0, 0.03);
      M.spinners.push({ o: bl, axis: 'z', speed: 1.2 });
      break;
    }
    case 'tent': {
      const t = add(g, G.cone(0.9, 1.1, 4), mat('#f59e0b', { flat: true }), 0, 0.55, 0, 0, Math.PI / 4);
      add(g, G.box(0.3, 0.6, 0.05), mat('#7c2d12'), 0, 0.3, 0.55);
      add(g, G.cyl(0.03, 0.03, 0.4, 4), mat('#57534e'), 0, 1.2, 0);
      break;
    }
    case 'banner': {
      add(g, G.cyl(0.04, 0.05, 2.2, 6), mat('#57534e', { m: 0.6 }), 0, 1.1, 0);
      add(g, G.box(0.7, 1.0, 0.03), mat('#7c3aed'), 0.37, 1.6, 0);
      add(g, G.oct(0.12), mat('#fbbf24', { m: 0.9 }), 0.37, 1.6, 0.03);
      add(g, G.sph(0.08), mat('#fbbf24', { m: 0.9 }), 0, 2.25, 0);
      break;
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  if (!M.spinners.length && !M.fountain) mergeStatic(g);
  return M;
}

// ---------------------------------------------------------------- Kern & Portal
export function makeBase(skin) {
  const g = new THREE.Group();
  const M = { group: g, spinners: [], glow: null };
  if (skin === 'base_castle') {
    const st = mat('#a8a29e', { flat: true });
    add(g, G.box(1.6, 1.2, 1.6), st, 0, 0.6, 0);
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { add(g, G.cyl(0.3, 0.35, 1.8, 8), st, x, 0.9, z); add(g, G.cone(0.38, 0.6, 8), mat('#1d4ed8', { flat: true }), x, 2.1, z); }
    add(g, G.box(0.5, 0.7, 0.05), mat('#4b2e14'), 0, 0.35, 0.81);
    const c = add(g, G.oct(0.35), mat('#60a5fa', { e: 1.2 }), 0, 1.7, 0); M.glow = c; M.spinners.push({ o: c, axis: 'y', speed: 1.5 });
  } else if (skin === 'base_temple') {
    const gd = mat('#fbbf24', { m: 0.85, r: 0.25 });
    add(g, G.box(1.9, 0.25, 1.9), gd, 0, 0.12, 0); add(g, G.box(1.5, 0.25, 1.5), gd, 0, 0.37, 0);
    for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) add(g, G.cyl(0.1, 0.1, 1.2, 8), mat('#fff7d6'), x, 1.1, z);
    add(g, G.cone(1.1, 0.6, 4), gd, 0, 2.0, 0, 0, Math.PI / 4);
    const c = add(g, G.sph(0.3), mat('#fde047', { e: 1.5 }), 0, 1.1, 0); M.glow = c;
  } else {
    add(g, G.cyl(0.95, 1.05, 0.3, 8), mat('#4b5563', { flat: true }), 0, 0.15, 0);
    add(g, G.cyl(0.7, 0.8, 0.3, 8), mat('#6b7280', { flat: true }), 0, 0.45, 0);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; add(g, G.box(0.15, 1.2, 0.15), mat('#9ca3af', { m: 0.5 }), Math.cos(a) * 0.75, 0.9, Math.sin(a) * 0.75); }
    const c = add(g, G.oct(0.5), mat('#38bdf8', { e: 1.0, r: 0.1, flat: true, t: 0.95 }), 0, 1.5, 0); c.scale.set(0.8, 1.3, 0.8);
    M.glow = c; M.spinners.push({ o: c, axis: 'y', speed: 1 });
    const r = add(g, G.tor(0.9, 0.04, 6, 32), mat('#7dd3fc', { e: 1.5 }), 0, 1.5, 0, Math.PI / 2); M.spinners.push({ o: r, axis: 'x', speed: 0.7 });
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return M;
}

export function makePortal() {
  const g = new THREE.Group();
  const M = { group: g, spinners: [] };
  const st = mat('#57534e', { flat: true });
  add(g, G.cyl(1.0, 1.05, 0.2, 10), st, 0, 0.1, 0);
  add(g, G.box(0.3, 2.2, 0.4), st, 0, 1.1, -0.9);
  add(g, G.box(0.3, 2.2, 0.4), st, 0, 1.1, 0.9);
  add(g, G.box(0.35, 0.35, 2.2), st, 0, 2.3, 0);
  const sw = add(g, G.cyl(0.85, 0.85, 0.05, 24), mat('#7c3aed', { e: 1.3, t: 0.85 }), 0, 1.15, 0, 0, 0, Math.PI / 2, false);
  sw.scale.set(1, 1, 1.25);
  const r = add(g, G.tor(0.6, 0.06, 6, 24), mat('#f0abfc', { e: 2 }), 0, 1.15, 0, 0, Math.PI / 2, 0, false);
  M.spinners.push({ o: r, axis: 'z', speed: 3 });
  add(g, G.sph(0.12), mat('#ef4444', { e: 2 }), 0, 2.55, 0);
  return M;
}

// Schild mit Text (Canvas-Textur)
export function makeSign(text, sub = '') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const ctx = c.getContext('2d');
  const draw = (t, s) => {
    ctx.clearRect(0, 0, 512, 192);
    ctx.fillStyle = '#5b3a1e'; ctx.fillRect(0, 0, 512, 192);
    ctx.fillStyle = '#8b5a2b'; ctx.fillRect(10, 10, 492, 172);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 62px Fredoka, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t.slice(0, 16), 256, s ? 75 : 96);
    if (s) { ctx.font = 'bold 36px Fredoka, Arial'; ctx.fillStyle = '#fde68a'; ctx.fillText(s, 256, 145); }
  };
  draw(text, sub);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  add(g, G.box(0.15, 1.6, 0.15), mat('#5b3a1e'), -1.1, 0.8, 0);
  add(g, G.box(0.15, 1.6, 0.15), mat('#5b3a1e'), 1.1, 0.8, 0);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.975), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  board.position.set(0, 1.4, 0.09); g.add(board);
  const back = new THREE.Mesh(G.box(2.6, 0.975, 0.12), mat('#5b3a1e')); back.position.set(0, 1.4, 0); back.castShadow = true; g.add(back);
  g.userData.update = (t, s) => { draw(t, s); tex.needsUpdate = true; };
  return g;
}
