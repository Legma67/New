'use strict';
// ============================================================
//  Prozedurale 3D-Modelle (Türme, Gegner, Deko, Burg)
// ============================================================
const Models = (() => {
  const matCache = new Map();
  let pbr = true;
  function setPBR(v) { pbr = v; matCache.clear(); }
  function M(color, opt = {}) {
    const key = color + '|' + (opt.e || '') + '|' + (opt.o ?? 1) + '|' + (opt.ei ?? 1) + '|' + (opt.side || 0);
    let m = matCache.get(key);
    if (!m) {
      if (pbr) {
        // Metallisch wirkende Farben (Gold, Silber, Stahl) bekommen etwas Glanz
        const c = new THREE.Color(color), hsl = {}; c.getHSL(hsl);
        const gold = hsl.h > 0.1 && hsl.h < 0.17 && hsl.s > 0.7 && hsl.l > 0.4;
        m = new THREE.MeshStandardMaterial({ color, roughness: gold ? 0.35 : 0.72, metalness: gold ? 0.6 : 0.05, envMapIntensity: gold ? 1 : 0.45 });
      } else m = new THREE.MeshLambertMaterial({ color });
      if (opt.e) { m.emissive = new THREE.Color(opt.e); m.emissiveIntensity = opt.ei ?? 1; }
      if (opt.o !== undefined && opt.o < 1) { m.transparent = true; m.opacity = opt.o; m.depthWrite = false; }
      if (opt.side) m.side = THREE.DoubleSide;
      matCache.set(key, m);
    }
    return m;
  }
  const G = {}; // geometry cache
  function geo(key, fn) { return G[key] || (G[key] = fn()); }
  const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  const cyl = (rt, rb, h, s = 12) => geo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
  const sph = (r, s = 12) => geo(`s${r},${s}`, () => new THREE.SphereGeometry(r, s, Math.max(6, s * 0.75 | 0)));
  const cone = (r, h, s = 10) => geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
  const tor = (r, t, s = 8, ts = 20, arc = Math.PI * 2) => geo(`t${r},${t},${s},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, s, ts, arc));
  const oct = (r) => geo(`o${r}`, () => new THREE.OctahedronGeometry(r, 0));
  const ico = (r, d = 0) => geo(`i${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
  const dod = (r) => geo(`d${r}`, () => new THREE.DodecahedronGeometry(r, 0));

  function mesh(g, m, x = 0, y = 0, z = 0, parent, shadow = true) {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    if (shadow) { o.castShadow = true; o.receiveShadow = true; }
    if (parent) parent.add(o);
    return o;
  }

  // ---------------------------------------------------------
  //  TÜRME
  // ---------------------------------------------------------
  function towerBody(style, g, t) {
    const c1 = t.c1, c2 = t.c2;
    switch (style) {
      case 'stone': {
        mesh(cyl(0.34, 0.4, 0.55, 10), M(c1), 0, 0.42, 0, g);
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * Math.PI * 2;
          mesh(box(0.13, 0.12, 0.13), M(c1), Math.cos(a) * 0.3, 0.75, Math.sin(a) * 0.3, g);
        }
        mesh(box(0.12, 0.18, 0.04), M('#2a2a2a'), 0, 0.42, 0.37, g);
        mesh(cyl(0.41, 0.41, 0.06, 10), M(c2), 0, 0.2, 0, g);
        return 0.72;
      }
      case 'wood': {
        for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]])
          mesh(box(0.08, 0.6, 0.08), M(c2), x, 0.45, z, g);
        mesh(box(0.62, 0.08, 0.62), M(c1), 0, 0.77, 0, g);
        mesh(box(0.56, 0.04, 0.04), M(c2), 0, 0.45, 0.25, g).rotation.z = 0.5;
        mesh(box(0.04, 0.04, 0.56), M(c2), 0.25, 0.45, 0, g).rotation.x = 0.5;
        return 0.8;
      }
      case 'metal': {
        mesh(cyl(0.3, 0.38, 0.5, 8), M(c1), 0, 0.4, 0, g);
        mesh(cyl(0.31, 0.31, 0.06, 8), M(t.c3, { e: t.c3, ei: 0.6 }), 0, 0.5, 0, g);
        mesh(cyl(0.36, 0.36, 0.08, 8), M(c2), 0, 0.66, 0, g);
        return 0.7;
      }
      case 'ice': {
        mesh(cyl(0.22, 0.38, 0.6, 7), M(c1, { e: '#3a90c0', ei: 0.25 }), 0, 0.45, 0, g);
        for (let i = 0; i < 4; i++) {
          const a = i / 4 * Math.PI * 2 + 0.4;
          const sp = mesh(cone(0.08, 0.35, 5), M('#e8fbff', { e: '#88ddff', ei: 0.3 }), Math.cos(a) * 0.3, 0.35, Math.sin(a) * 0.3, g);
          sp.rotation.z = Math.cos(a) * -0.4; sp.rotation.x = Math.sin(a) * 0.4;
        }
        return 0.75;
      }
      case 'arcane': {
        mesh(cyl(0.2, 0.36, 0.6, 6), M(c1), 0, 0.45, 0, g);
        const ring = mesh(tor(0.38, 0.025, 6, 24), M(t.c3, { e: t.c3, ei: 0.9 }), 0, 0.55, 0, g, false);
        ring.rotation.x = Math.PI / 2; ring.userData.spin = 1.2;
        g.userData.spinners.push(ring);
        return 0.75;
      }
      case 'dark': {
        mesh(cyl(0.24, 0.4, 0.6, 5), M(c1), 0, 0.45, 0, g);
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * Math.PI * 2;
          const sp = mesh(cone(0.06, 0.3, 4), M(t.c3, { e: t.c3, ei: 0.5 }), Math.cos(a) * 0.33, 0.6, Math.sin(a) * 0.33, g);
          sp.rotation.z = -Math.cos(a) * 0.5; sp.rotation.x = Math.sin(a) * 0.5;
        }
        return 0.75;
      }
    }
    return 0.6;
  }

  function towerHead(type, h, t, ud) {
    const c1 = t.c1, c2 = t.c2, c3 = t.c3;
    const tip = new THREE.Object3D(); h.add(tip); ud.tip = tip;
    switch (type) {
      case 'cannon': {
        mesh(sph(0.2, 12), M(c2), 0, 0.12, 0, h);
        const b = mesh(cyl(0.07, 0.09, 0.42, 10), M(c2), 0, 0.15, 0.2, h); b.rotation.x = Math.PI / 2;
        mesh(tor(0.085, 0.025, 6, 12), M(c3), 0, 0.15, 0.4, h);
        tip.position.set(0, 0.15, 0.45); ud.recoil = b; break;
      }
      case 'bow': {
        mesh(box(0.14, 0.22, 0.1), M('#3a7bd5'), 0, 0.14, 0, h);
        mesh(sph(0.08), M('#f2c9a0'), 0, 0.32, 0, h);
        mesh(cone(0.09, 0.12, 8), M(c3), 0, 0.42, 0, h);
        const bow = mesh(tor(0.16, 0.015, 5, 14, Math.PI), M(c2), 0, 0.18, 0.12, h); bow.rotation.z = Math.PI / 2;
        tip.position.set(0, 0.2, 0.2); break;
      }
      case 'crossbow': {
        mesh(box(0.16, 0.14, 0.5), M(c2), 0, 0.14, 0.05, h);
        const arms = mesh(tor(0.24, 0.025, 5, 16, Math.PI), M(c1), 0, 0.16, 0.22, h); arms.rotation.x = Math.PI / 2; arms.rotation.z = Math.PI;
        mesh(box(0.48, 0.01, 0.01), M('#eeeeee'), 0, 0.16, 0.2, h, false);
        const bolt = mesh(cyl(0.015, 0.015, 0.42, 4), M(c3), 0, 0.2, 0.15, h, false); bolt.rotation.x = Math.PI / 2;
        mesh(cone(0.03, 0.08, 4), M(c3), 0, 0.2, 0.38, h, false).rotation.x = Math.PI / 2;
        mesh(box(0.08, 0.16, 0.08), M('#3a7bd5'), 0, 0.05, -0.15, h);
        tip.position.set(0, 0.2, 0.42); ud.recoil = arms; break;
      }
      case 'dish': {
        mesh(cyl(0.08, 0.12, 0.15, 8), M(c2), 0, 0.07, 0, h);
        const d = mesh(geo('dish', () => new THREE.SphereGeometry(0.24, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.6)), M(c1, { side: 1 }), 0, 0.22, 0.05, h);
        d.rotation.x = Math.PI / 2 + 0.3;
        mesh(sph(0.06), M(c3, { e: c3, ei: 1 }), 0, 0.26, 0.2, h, false);
        tip.position.set(0, 0.26, 0.24); ud.glow = true; break;
      }
      case 'crystal': {
        const c = mesh(oct(0.2), M(c3, { e: '#6fd6ff', ei: 0.6 }), 0, 0.25, 0, h); c.scale.y = 1.5;
        c.userData.spin = 1.5; h.parent.userData.spinners.push(c);
        tip.position.set(0, 0.25, 0.15); break;
      }
      case 'brazier': {
        mesh(cyl(0.22, 0.12, 0.16, 10), M('#3a3a3a'), 0, 0.08, 0, h);
        const f = mesh(cone(0.16, 0.38, 8), M('#ff9a1a', { e: '#ff6a00', ei: 1, o: 0.9 }), 0, 0.34, 0, h, false);
        const f2 = mesh(cone(0.09, 0.26, 6), M('#fff07a', { e: '#ffd000', ei: 1 }), 0, 0.3, 0, h, false);
        ud.flames = [f, f2]; tip.position.set(0, 0.3, 0.1); break;
      }
      case 'launcher': {
        mesh(box(0.36, 0.24, 0.3), M(c1), 0, 0.15, 0, h);
        for (const [x, y] of [[-0.09, 0.09], [0.09, 0.09], [-0.09, 0.21], [0.09, 0.21]]) {
          const tb = mesh(cyl(0.05, 0.05, 0.3, 8), M(c2), x, y, 0.12, h); tb.rotation.x = Math.PI / 2;
          mesh(cone(0.045, 0.08, 8), M(c3), x, y, 0.3, h).rotation.x = Math.PI / 2;
        }
        tip.position.set(0, 0.15, 0.32); break;
      }
      case 'orb': {
        mesh(cyl(0.05, 0.1, 0.2, 6), M(c2), 0, 0.1, 0, h);
        const o = mesh(sph(0.15, 14), M(c3, { e: c3, ei: 0.9 }), 0, 0.38, 0, h, false);
        o.userData.float = true; ud.orb = o;
        const r = mesh(tor(0.24, 0.018, 5, 24), M('#ffd86b', { e: '#ffb000', ei: 0.5 }), 0, 0.38, 0, h, false);
        r.userData.spin = 2; h.parent.userData.spinners.push(r);
        tip.position.set(0, 0.38, 0.1); break;
      }
      case 'rifle': {
        mesh(box(0.16, 0.16, 0.24), M(c1), 0, 0.1, 0, h);
        const b = mesh(cyl(0.03, 0.035, 0.6, 6), M('#222'), 0, 0.12, 0.38, h); b.rotation.x = Math.PI / 2;
        const s = mesh(cyl(0.035, 0.035, 0.18, 8), M('#111'), 0, 0.22, 0.08, h); s.rotation.x = Math.PI / 2;
        mesh(sph(0.03), M('#ff2020', { e: '#ff0000', ei: 1 }), 0, 0.22, 0.18, h, false);
        tip.position.set(0, 0.12, 0.68); ud.recoil = b; break;
      }
      case 'coil': {
        mesh(cyl(0.06, 0.08, 0.5, 8), M(c2), 0, 0.25, 0, h);
        for (let i = 0; i < 4; i++) {
          const r = mesh(tor(0.16 - i * 0.025, 0.025, 6, 16), M('#c87533'), 0, 0.08 + i * 0.1, 0, h);
          r.rotation.x = Math.PI / 2;
        }
        const top = mesh(sph(0.11), M(c3, { e: c3, ei: 1 }), 0, 0.55, 0, h, false); ud.orb = top;
        tip.position.set(0, 0.55, 0); ud.noAim = true; break;
      }
      case 'mortar': {
        const b = mesh(cyl(0.14, 0.17, 0.3, 10), M(c2), 0, 0.15, 0.05, h); b.rotation.x = -0.6;
        mesh(tor(0.15, 0.03, 6, 12), M(c3), 0, 0.27, 0.13, h).rotation.x = Math.PI / 2 - 0.6;
        tip.position.set(0, 0.28, 0.14); break;
      }
      case 'mortar_big': {
        mesh(box(0.42, 0.12, 0.42), M(c2), 0, 0.06, 0, h);
        const b = mesh(cyl(0.2, 0.24, 0.36, 12), M(c1), 0, 0.22, 0.04, h); b.rotation.x = -0.5;
        mesh(tor(0.21, 0.04, 6, 14), M(c3), 0, 0.37, 0.13, h).rotation.x = Math.PI / 2 - 0.5;
        tip.position.set(0, 0.38, 0.14); break;
      }
      case 'gatling': {
        mesh(box(0.28, 0.2, 0.26), M(c1), 0, 0.12, -0.04, h);
        const spin = new THREE.Group(); spin.position.set(0, 0.14, 0.12); h.add(spin);
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2;
          const b = mesh(cyl(0.025, 0.025, 0.42, 6), M('#222'), Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.18, spin);
          b.rotation.x = Math.PI / 2;
        }
        mesh(cyl(0.09, 0.09, 0.06, 10), M(c3), 0, 0, 0.36, spin).rotation.x = Math.PI / 2;
        ud.gatling = spin; tip.position.set(0, 0.14, 0.52); break;
      }
      case 'nozzle': {
        mesh(cyl(0.18, 0.18, 0.3, 12), M(c1), 0, 0.15, 0, h).rotation.z = Math.PI / 2;
        const n = mesh(cyl(0.04, 0.08, 0.35, 8), M(c2), 0, 0.18, 0.25, h); n.rotation.x = Math.PI / 2;
        mesh(sph(0.07), M(c3), 0, 0.33, -0.05, h);
        tip.position.set(0, 0.18, 0.44); break;
      }
      case 'plasma': {
        const r = mesh(tor(0.18, 0.05, 8, 18), M(c2), 0, 0.22, 0.05, h);
        const core = mesh(sph(0.11, 12), M(c3, { e: c3, ei: 1 }), 0, 0.22, 0.05, h, false); ud.orb = core;
        mesh(cyl(0.05, 0.05, 0.16, 8), M(c1), 0, 0.08, 0, h);
        r.userData.spin = 3; h.parent.userData.spinners.push(r);
        tip.position.set(0, 0.22, 0.2); break;
      }
      case 'crystal_big': {
        for (let i = 0; i < 4; i++) {
          const a = i / 4 * Math.PI * 2;
          const c = mesh(oct(0.1), M(c1, { e: c1, ei: 0.5 }), Math.cos(a) * 0.15, 0.18, Math.sin(a) * 0.15, h); c.scale.y = 2;
        }
        const m = mesh(oct(0.16), M(c3, { e: c1, ei: 0.7 }), 0, 0.36, 0, h); m.scale.y = 2;
        m.userData.spin = 1; h.parent.userData.spinners.push(m);
        tip.position.set(0, 0.4, 0); ud.noAim = true; break;
      }
      case 'prism': {
        const p = mesh(oct(0.18), M('#fffbe0', { e: '#ffe680', ei: 0.9 }), 0, 0.35, 0, h, false); p.scale.set(0.7, 1.8, 0.7);
        p.userData.spin = 0.8; h.parent.userData.spinners.push(p);
        for (let i = 0; i < 3; i++) {
          const a = i / 3 * Math.PI * 2;
          mesh(cyl(0.02, 0.02, 0.3, 4), M(c2), Math.cos(a) * 0.14, 0.15, Math.sin(a) * 0.14, h);
        }
        tip.position.set(0, 0.42, 0); ud.noAim = true; break;
      }
      case 'pad': {
        mesh(cyl(0.3, 0.3, 0.05, 16), M(c2), 0, 0.03, 0, h);
        mesh(tor(0.2, 0.02, 4, 20), M('#ffffff', { e: '#ffffff', ei: 0.4 }), 0, 0.06, 0, h, false).rotation.x = Math.PI / 2;
        mesh(box(0.06, 0.25, 0.06), M(c1), 0.22, 0.15, 0.22, h);
        mesh(sph(0.04), M(c3, { e: c3, ei: 1 }), 0.22, 0.3, 0.22, h, false);
        tip.position.set(0, 0.1, 0); ud.noAim = true; break;
      }
      case 'multibarrel': {
        mesh(box(0.4, 0.26, 0.3), M(c1), 0, 0.14, 0, h);
        for (const [x, y] of [[-0.1, 0.08], [0.1, 0.08], [-0.1, 0.22], [0.1, 0.22]]) {
          const b = mesh(cyl(0.05, 0.06, 0.32, 8), M(c2), x, y, 0.2, h); b.rotation.x = Math.PI / 2;
        }
        tip.position.set(0, 0.15, 0.38); break;
      }
      case 'cross': {
        mesh(box(0.12, 0.42, 0.1), M(c3, { e: c3, ei: 0.5 }), 0, 0.3, 0, h);
        mesh(box(0.36, 0.12, 0.1), M(c3, { e: c3, ei: 0.5 }), 0, 0.33, 0, h);
        const r = mesh(tor(0.28, 0.02, 4, 20), M('#a8ffcf', { e: '#5cff9d', ei: 0.7 }), 0, 0.3, 0, h, false); r.rotation.x = Math.PI / 2;
        r.userData.spin = 1; h.parent.userData.spinners.push(r);
        tip.position.set(0, 0.3, 0); ud.noAim = true; break;
      }
      case 'banner': {
        mesh(cyl(0.025, 0.025, 0.8, 6), M('#5a3a1a'), 0, 0.4, 0, h);
        const f = mesh(geo('flag', () => new THREE.PlaneGeometry(0.36, 0.24, 6, 1)), M(c1, { side: 1 }), 0.19, 0.66, 0, h);
        ud.flag = f; mesh(sph(0.05), M(c3, { e: c3, ei: 0.6 }), 0, 0.82, 0, h);
        tip.position.set(0, 0.6, 0); ud.noAim = true; break;
      }
      case 'ring': {
        mesh(cyl(0.08, 0.1, 0.3, 8), M(c2), 0, 0.15, 0, h);
        const r = mesh(tor(0.26, 0.04, 8, 24), M(c3, { e: c3, ei: 0.9 }), 0, 0.2, 0, h, false); r.rotation.x = Math.PI / 2; ud.ring = r;
        mesh(sph(0.08), M(c3, { e: c3, ei: 1 }), 0, 0.34, 0, h, false);
        tip.position.set(0, 0.2, 0); ud.noAim = true; break;
      }
      case 'snake': {
        const b = mesh(tor(0.16, 0.06, 8, 16, Math.PI * 1.4), M(c1), 0, 0.18, 0, h); b.rotation.y = Math.PI / 2;
        mesh(sph(0.1), M(c1), 0, 0.33, 0.12, h);
        mesh(box(0.12, 0.06, 0.12), M(c1), 0, 0.31, 0.22, h);
        mesh(sph(0.025), M('#ff0'), 0.05, 0.38, 0.17, h, false); mesh(sph(0.025), M('#ff0'), -0.05, 0.38, 0.17, h, false);
        mesh(cone(0.02, 0.08, 4), M('#ff3050'), 0, 0.29, 0.3, h, false).rotation.x = Math.PI / 2;
        tip.position.set(0, 0.32, 0.3); break;
      }
      case 'obelisk': {
        const o = mesh(geo('obel', () => new THREE.ConeGeometry(0.16, 0.7, 4)), M(c1, { e: c3, ei: 0.25 }), 0, 0.35, 0, h); o.rotation.y = Math.PI / 4;
        const r = mesh(ico(0.08), M(c3, { e: c3, ei: 1 }), 0, 0.85, 0, h, false); ud.orb = r;
        tip.position.set(0, 0.85, 0); ud.noAim = true; break;
      }
      case 'void': {
        const core = mesh(sph(0.16, 16), M('#000000'), 0, 0.42, 0, h, false); ud.orb = core;
        const d = mesh(tor(0.26, 0.05, 6, 28), M(c3, { e: c3, ei: 1, o: 0.85 }), 0, 0.42, 0, h, false); d.rotation.x = Math.PI / 2.4;
        d.userData.spin = 3; h.parent.userData.spinners.push(d);
        const d2 = mesh(tor(0.34, 0.015, 4, 28), M('#ffffff', { e: '#d0a0ff', ei: 1 }), 0, 0.42, 0, h, false); d2.rotation.x = Math.PI / 2.2;
        d2.userData.spin = -2; h.parent.userData.spinners.push(d2);
        tip.position.set(0, 0.42, 0); ud.noAim = true; break;
      }
      case 'clock': {
        const face = mesh(cyl(0.25, 0.25, 0.05, 20), M('#fff8e0'), 0, 0.35, 0, h); face.rotation.x = Math.PI / 2;
        mesh(tor(0.25, 0.03, 6, 24), M(c2), 0, 0.35, 0, h);
        const hand = new THREE.Group(); hand.position.set(0, 0.35, 0.04); h.add(hand);
        mesh(box(0.025, 0.18, 0.02), M('#222'), 0, 0.08, 0, hand);
        const hand2 = new THREE.Group(); hand2.position.set(0, 0.35, 0.045); h.add(hand2);
        mesh(box(0.02, 0.12, 0.02), M(c3, { e: c3, ei: 0.8 }), 0, 0.05, 0, hand2);
        ud.hands = [hand, hand2]; mesh(cyl(0.04, 0.06, 0.12, 6), M(c2), 0, 0.06, 0, h);
        tip.position.set(0, 0.35, 0); ud.noAim = true; break;
      }
      case 'coin': {
        const c = mesh(cyl(0.2, 0.2, 0.05, 20), M('#ffd700', { e: '#a07800', ei: 0.4 }), 0, 0.4, 0, h); c.rotation.x = Math.PI / 2;
        c.userData.spinY = 2; ud.coin = c;
        for (let i = 0; i < 5; i++) mesh(cyl(0.12, 0.12, 0.04, 14), M('#ffcc00'), (i % 2) * 0.05 - 0.02, 0.03 + i * 0.045, 0, h);
        tip.position.set(0, 0.4, 0); ud.noAim = true; break;
      }
      case 'dragon': {
        mesh(box(0.3, 0.26, 0.34), M(c1), 0, 0.16, 0, h);
        mesh(box(0.22, 0.12, 0.26), M(c1), 0, 0.18, 0.28, h);
        const jaw = mesh(box(0.2, 0.06, 0.24), M(c2), 0, 0.07, 0.26, h); ud.jaw = jaw;
        for (const x of [-0.1, 0.1]) {
          const hn = mesh(cone(0.04, 0.22, 5), M('#f5e6c8'), x, 0.36, -0.05, h); hn.rotation.x = -0.6;
          mesh(sph(0.035), M(c3, { e: c3, ei: 1 }), x * 0.9, 0.26, 0.2, h, false);
        }
        for (const x of [-1, 1]) {
          const w = mesh(geo('wing', () => new THREE.ConeGeometry(0.25, 0.5, 3)), M(c2, { side: 1 }), x * 0.3, 0.25, -0.1, h);
          w.rotation.z = x * 1.3; w.scale.z = 0.15; (ud.wings = ud.wings || []).push(w);
        }
        tip.position.set(0, 0.14, 0.42); break;
      }
      default: {
        mesh(sph(0.18), M(c3), 0, 0.15, 0, h); tip.position.set(0, 0.15, 0.2);
      }
    }
  }

  function makeTower(def, rarityColor) {
    const g = new THREE.Group();
    g.userData.spinners = [];
    // Sockel
    mesh(cyl(0.46, 0.5, 0.16, 6), M('#8c8577'), 0, 0.08, 0, g);
    const trim = mesh(cyl(0.47, 0.47, 0.04, 6), M(rarityColor, { e: rarityColor, ei: 0.35 }), 0, 0.17, 0, g);
    trim.receiveShadow = false;
    const body = new THREE.Group(); g.add(body);
    body.userData.spinners = g.userData.spinners;
    const top = towerBody(def.body, body, def);
    const head = new THREE.Group(); head.position.y = top; body.add(head);
    const ud = {};
    head.userData.spinners = g.userData.spinners;
    head.parent.userData.spinners = g.userData.spinners;
    towerHead(def.head, head, def, ud);
    const lvl = new THREE.Group(); g.add(lvl);
    Object.assign(g.userData, ud, { head, body, lvlGroup: lvl, topY: top, def });
    return g;
  }

  // Visuelle Upgrade-Stufen
  function applyTowerLevel(g, level) {
    const ud = g.userData, def = ud.def, lv = ud.lvlGroup;
    while (lv.children.length) lv.remove(lv.children[0]);
    const s = 1 + (level - 1) * 0.07;
    ud.body.scale.set(s, s + (level - 1) * 0.05, s);
    const topY = ud.topY * ud.body.scale.y;
    if (level >= 2) {
      const band = mesh(cyl(0.42, 0.42, 0.05, 6), M('#d0d4dc'), 0, 0.26, 0, lv); band.receiveShadow = false;
      for (let i = 0; i < level - 1; i++) mesh(box(0.06, 0.06, 0.02), M('#ffd84a', { e: '#ffaa00', ei: 0.6 }), -0.12 + i * 0.08, 0.3, 0.44, lv, false);
    }
    if (level >= 3) {
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + Math.PI / 6;
        mesh(cone(0.05, 0.2, 5), M('#b8bcc6'), Math.cos(a) * 0.45, 0.28, Math.sin(a) * 0.45, lv);
      }
    }
    if (level >= 4) {
      const r = mesh(tor(0.52, 0.03, 6, 30), M(def.c3, { e: def.c3, ei: 1 }), 0, topY * 0.55, 0, lv, false);
      r.rotation.x = Math.PI / 2; r.userData.spin = 1.4; r.userData.lvSpin = true;
    }
    if (level >= 5) {
      const crown = new THREE.Group(); crown.position.y = topY + 0.62; lv.add(crown);
      mesh(cyl(0.13, 0.13, 0.06, 10), M('#ffd700', { e: '#ffb000', ei: 0.6 }), 0, 0, 0, crown, false);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        mesh(cone(0.035, 0.12, 4), M('#ffd700', { e: '#ffb000', ei: 0.6 }), Math.cos(a) * 0.11, 0.08, Math.sin(a) * 0.11, crown, false);
      }
      mesh(sph(0.04), M('#ff2a6a', { e: '#ff2a6a', ei: 1 }), 0, 0.06, 0, crown, false);
      crown.userData.float = true; ud.crown = crown;
      const aura = mesh(cyl(0.6, 0.6, 0.02, 24), M(def.c3, { e: def.c3, ei: 1, o: 0.35 }), 0, 0.05, 0, lv, false);
      aura.userData.pulse = true; ud.aura = aura;
    } else { ud.crown = null; ud.aura = null; }
  }

  // ---------------------------------------------------------
  //  GEGNER
  // ---------------------------------------------------------
  function eyes(parent, y, z, s, x = 0.07) {
    for (const sx of [-1, 1]) {
      mesh(sph(0.05 * s * 1.6, 8), M('#ffffff'), sx * x * s * 1.6, y, z, parent, false);
      mesh(sph(0.025 * s * 1.6, 6), M('#111111'), sx * x * s * 1.6, y, z + 0.035 * s * 1.6, parent, false);
    }
  }
  function makeEnemy(def) {
    const g = new THREE.Group();
    const s = def.size;
    const col = def.color;
    const glow = def.glow;
    const bm = glow ? M(col, { e: glow, ei: 0.45 }) : M(col);
    const dark = M(new THREE.Color(col).multiplyScalar(0.6).getStyle());
    const body = new THREE.Group(); g.add(body);
    const A = { legs: [], arms: [], wings: [], body, bobH: 0, type: def.shape };
    switch (def.shape) {
      case 'humanoid': case 'skeleton': case 'knight': {
        const sk = def.shape === 'skeleton';
        const torso = mesh(box(0.34 * s, 0.38 * s, 0.22 * s), sk ? M('#f2ead2') : bm, 0, 0.55 * s, 0, body);
        if (sk) for (let i = 0; i < 3; i++) mesh(box(0.36 * s, 0.03 * s, 0.24 * s), M('#bdb49a'), 0, (0.45 + i * 0.1) * s, 0, body, false);
        const head = mesh(sk ? sph(0.16 * s) : box(0.28 * s, 0.26 * s, 0.26 * s), sk ? M('#fff8e6') : bm, 0, 0.88 * s, 0, body);
        if (def.shape === 'knight') {
          mesh(box(0.31 * s, 0.14 * s, 0.29 * s), M('#9aa4b4'), 0, 0.95 * s, 0, body);
          mesh(box(0.22 * s, 0.03 * s, 0.02 * s), M('#ff3040', { e: glow || '#ff3040', ei: 0.8 }), 0, 0.88 * s, 0.14 * s, body, false);
          const sh = mesh(box(0.05 * s, 0.34 * s, 0.28 * s), M('#c9a227'), 0.24 * s, 0.55 * s, 0.05 * s, body);
          sh.rotation.y = 0.2;
        } else if (sk) {
          mesh(sph(0.04 * s, 6), M('#111'), -0.06 * s, 0.9 * s, 0.13 * s, body, false);
          mesh(sph(0.04 * s, 6), M('#111'), 0.06 * s, 0.9 * s, 0.13 * s, body, false);
        } else eyes(body, 0.9 * s, 0.13 * s, s);
        for (const sx of [-1, 1]) {
          const leg = new THREE.Group(); leg.position.set(sx * 0.09 * s, 0.36 * s, 0); body.add(leg);
          mesh(box(0.11 * s, 0.36 * s, 0.12 * s), sk ? M('#e8dfc4') : dark, 0, -0.18 * s, 0, leg);
          A.legs.push(leg);
          const arm = new THREE.Group(); arm.position.set(sx * 0.23 * s, 0.7 * s, 0); body.add(arm);
          mesh(box(0.09 * s, 0.32 * s, 0.1 * s), sk ? M('#e8dfc4') : bm, 0, -0.15 * s, 0, arm);
          A.arms.push(arm);
        }
        A.head = head; A.topY = 1.05 * s; break;
      }
      case 'beast': {
        mesh(geo('beastb', () => new THREE.SphereGeometry(0.5, 12, 8)), bm, 0, 0.32 * s, 0, body).scale.set(0.5 * s, 0.4 * s, 0.75 * s);
        const head = mesh(sph(0.17 * s), bm, 0, 0.42 * s, 0.34 * s, body);
        eyes(body, 0.48 * s, 0.46 * s, s * 0.8);
        mesh(cone(0.05 * s, 0.14 * s, 5), dark, -0.08 * s, 0.6 * s, 0.3 * s, body);
        mesh(cone(0.05 * s, 0.14 * s, 5), dark, 0.08 * s, 0.6 * s, 0.3 * s, body);
        const tail = mesh(cone(0.05 * s, 0.3 * s, 5), dark, 0, 0.38 * s, -0.4 * s, body); tail.rotation.x = -1.9;
        for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
          const leg = new THREE.Group(); leg.position.set(x * 0.13 * s, 0.22 * s, z * 0.2 * s); body.add(leg);
          mesh(box(0.08 * s, 0.22 * s, 0.08 * s), dark, 0, -0.11 * s, 0, leg); A.legs.push(leg);
        }
        A.head = head; A.topY = 0.65 * s; break;
      }
      case 'beetle': {
        const shell = mesh(geo('shell', () => new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), bm, 0, 0.18 * s, 0, body);
        shell.scale.set(0.8 * s, 0.7 * s, 1.0 * s);
        mesh(box(0.02 * s, 0.3 * s, 0.9 * s), dark, 0, 0.3 * s, 0, body, false);
        const head = mesh(sph(0.15 * s), dark, 0, 0.22 * s, 0.48 * s, body);
        const horn = mesh(cone(0.05 * s, 0.25 * s, 5), M('#e0d8c0'), 0, 0.32 * s, 0.6 * s, body); horn.rotation.x = 0.8;
        eyes(body, 0.27 * s, 0.6 * s, s * 0.6);
        for (let i = 0; i < 6; i++) {
          const leg = new THREE.Group(); const x = i < 3 ? -1 : 1; const z = (i % 3 - 1) * 0.28 * s;
          leg.position.set(x * 0.38 * s, 0.15 * s, z); body.add(leg);
          const l = mesh(box(0.2 * s, 0.04 * s, 0.04 * s), M('#222'), x * 0.08 * s, -0.06 * s, 0, leg); l.rotation.z = x * -0.6;
          A.legs.push(leg);
        }
        A.head = head; A.topY = 0.55 * s; break;
      }
      case 'blob': {
        const b = mesh(sph(0.36 * s, 14), M(col, { e: glow || col, ei: glow ? 0.4 : 0.08, o: 0.88 }), 0, 0.3 * s, 0, body);
        b.scale.y = 0.8; A.squish = b;
        eyes(body, 0.38 * s, 0.27 * s, s);
        mesh(tor(0.08 * s, 0.02 * s, 4, 8, Math.PI), M('#222'), 0, 0.26 * s, 0.31 * s, body, false).rotation.z = Math.PI;
        A.topY = 0.65 * s; break;
      }
      case 'ghost': {
        const b = mesh(sph(0.3 * s, 12), M(col, { e: glow || col, ei: 0.3, o: 0.8 }), 0, 0.55 * s, 0, body);
        const t = mesh(cone(0.3 * s, 0.5 * s, 10), M(col, { e: glow || col, ei: 0.3, o: 0.7 }), 0, 0.25 * s, 0, body); t.rotation.x = Math.PI;
        mesh(sph(0.06 * s, 6), M('#111'), -0.1 * s, 0.6 * s, 0.25 * s, body, false);
        mesh(sph(0.06 * s, 6), M('#111'), 0.1 * s, 0.6 * s, 0.25 * s, body, false);
        mesh(sph(0.07 * s, 6), M('#111'), 0, 0.45 * s, 0.27 * s, body, false);
        for (const sx of [-1, 1]) {
          const arm = new THREE.Group(); arm.position.set(sx * 0.28 * s, 0.5 * s, 0); body.add(arm);
          mesh(cone(0.06 * s, 0.25 * s, 5), M(col, { o: 0.75 }), sx * 0.08 * s, 0, 0, arm).rotation.z = sx * -1.6; A.arms.push(arm);
        }
        A.float = 0.25 * s; A.topY = 0.9 * s; break;
      }
      case 'bat': {
        mesh(sph(0.16 * s), bm, 0, 0.3 * s, 0, body);
        eyes(body, 0.34 * s, 0.13 * s, s * 0.7);
        mesh(cone(0.05 * s, 0.14 * s, 4), dark, -0.08 * s, 0.48 * s, 0, body);
        mesh(cone(0.05 * s, 0.14 * s, 4), dark, 0.08 * s, 0.48 * s, 0, body);
        for (const sx of [-1, 1]) {
          const w = new THREE.Group(); w.position.set(sx * 0.12 * s, 0.32 * s, 0); body.add(w);
          const wm = mesh(geo('batw', () => new THREE.ConeGeometry(0.3, 0.6, 3)), M(dark.color.getStyle(), { side: 1 }), sx * 0.25 * s, 0, 0, w);
          wm.rotation.z = sx * Math.PI / 2; wm.scale.set(s, s, 0.1); A.wings.push(w);
        }
        A.float = 0.6; A.topY = 0.6 * s; break;
      }
      case 'robot': {
        mesh(box(0.42 * s, 0.4 * s, 0.3 * s), bm, 0, 0.58 * s, 0, body);
        mesh(box(0.2 * s, 0.12 * s, 0.02 * s), M('#38c6ff', { e: '#38c6ff', ei: 0.9 }), 0, 0.62 * s, 0.16 * s, body, false);
        const head = mesh(box(0.3 * s, 0.22 * s, 0.26 * s), bm, 0, 0.92 * s, 0, body);
        mesh(box(0.24 * s, 0.07 * s, 0.02 * s), M('#ff3040', { e: '#ff3040', ei: 1 }), 0, 0.93 * s, 0.14 * s, body, false);
        mesh(cyl(0.01 * s, 0.01 * s, 0.18 * s, 4), M('#333'), 0, 1.1 * s, 0, body, false);
        mesh(sph(0.03 * s, 6), M('#ff3040', { e: '#ff3040', ei: 1 }), 0, 1.2 * s, 0, body, false);
        for (const sx of [-1, 1]) {
          const leg = new THREE.Group(); leg.position.set(sx * 0.12 * s, 0.38 * s, 0); body.add(leg);
          mesh(box(0.13 * s, 0.38 * s, 0.15 * s), dark, 0, -0.19 * s, 0, leg); A.legs.push(leg);
          const arm = new THREE.Group(); arm.position.set(sx * 0.28 * s, 0.72 * s, 0); body.add(arm);
          mesh(box(0.1 * s, 0.34 * s, 0.12 * s), dark, 0, -0.15 * s, 0, arm);
          mesh(cyl(0.06 * s, 0.06 * s, 0.06 * s, 6), M('#ffcc33'), 0, -0.34 * s, 0, arm); A.arms.push(arm);
        }
        A.head = head; A.topY = 1.25 * s; break;
      }
      case 'golem': {
        mesh(dod(0.3 * s), bm, 0, 0.62 * s, 0, body).scale.set(1.2, 1, 0.9);
        const head = mesh(dod(0.16 * s), bm, 0, 0.98 * s, 0.05 * s, body);
        mesh(sph(0.04 * s, 6), M('#ffcc33', { e: glow || '#ffaa00', ei: 1 }), -0.06 * s, 1.0 * s, 0.18 * s, body, false);
        mesh(sph(0.04 * s, 6), M('#ffcc33', { e: glow || '#ffaa00', ei: 1 }), 0.06 * s, 1.0 * s, 0.18 * s, body, false);
        for (let i = 0; i < 3; i++) mesh(dod(0.08 * s), dark, (i - 1) * 0.15 * s, 0.85 * s, -0.22 * s, body);
        for (const sx of [-1, 1]) {
          const leg = new THREE.Group(); leg.position.set(sx * 0.15 * s, 0.36 * s, 0); body.add(leg);
          mesh(box(0.18 * s, 0.36 * s, 0.2 * s), dark, 0, -0.18 * s, 0, leg); A.legs.push(leg);
          const arm = new THREE.Group(); arm.position.set(sx * 0.42 * s, 0.78 * s, 0); body.add(arm);
          mesh(dod(0.13 * s), bm, 0, -0.18 * s, 0, arm);
          mesh(dod(0.12 * s), dark, 0, -0.42 * s, 0.05 * s, arm); A.arms.push(arm);
        }
        A.head = head; A.topY = 1.2 * s; break;
      }
      case 'crystal': {
        const c = mesh(oct(0.25 * s), M(col, { e: glow || col, ei: 0.35 }), 0, 0.5 * s, 0, body); c.scale.y = 1.6; A.spin = c;
        for (let i = 0; i < 3; i++) {
          const a = i / 3 * Math.PI * 2;
          const sh = mesh(oct(0.09 * s), M(col, { e: col, ei: 0.5 }), Math.cos(a) * 0.3 * s, 0.5 * s, Math.sin(a) * 0.3 * s, body);
          sh.scale.y = 1.5; A.arms.push(sh);
        }
        eyes(body, 0.58 * s, 0.2 * s, s * 0.8);
        A.float = 0.1 * s; A.topY = 0.95 * s; break;
      }
      case 'dragon': {
        mesh(geo('drb', () => new THREE.SphereGeometry(0.5, 12, 8)), bm, 0, 0.45 * s, 0, body).scale.set(0.5 * s, 0.45 * s, 0.85 * s);
        const neck = mesh(cyl(0.08 * s, 0.12 * s, 0.35 * s, 6), bm, 0, 0.65 * s, 0.35 * s, body); neck.rotation.x = 0.7;
        const head = mesh(box(0.22 * s, 0.18 * s, 0.3 * s), bm, 0, 0.82 * s, 0.55 * s, body);
        eyes(body, 0.88 * s, 0.66 * s, s * 0.6, 0.06);
        for (const sx of [-1, 1]) mesh(cone(0.03 * s, 0.15 * s, 4), M('#f5e6c8'), sx * 0.07 * s, 0.97 * s, 0.48 * s, body).rotation.x = -0.6;
        const tail = mesh(cone(0.1 * s, 0.6 * s, 6), bm, 0, 0.4 * s, -0.6 * s, body); tail.rotation.x = -1.8;
        for (const sx of [-1, 1]) {
          const w = new THREE.Group(); w.position.set(sx * 0.18 * s, 0.6 * s, 0); body.add(w);
          const wm = mesh(geo('drw', () => new THREE.ConeGeometry(0.4, 0.8, 3)), M(dark.color.getStyle(), { side: 1 }), sx * 0.35 * s, 0, 0, w);
          wm.rotation.z = sx * Math.PI / 2; wm.scale.set(s, s, 0.12); A.wings.push(w);
        }
        A.head = head; A.float = def.fly ? 0.5 : 0; A.topY = 1.05 * s; break;
      }
    }
    if (def.crown) {
      const cr = new THREE.Group(); cr.position.y = A.topY + 0.02; body.add(cr);
      mesh(cyl(0.12 * s, 0.12 * s, 0.06 * s, 10), M('#ffd700', { e: '#ffaa00', ei: 0.5 }), 0, 0, 0, cr, false);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; mesh(cone(0.03 * s, 0.1 * s, 4), M('#ffd700', { e: '#ffaa00', ei: 0.5 }), Math.cos(a) * 0.1 * s, 0.07 * s, Math.sin(a) * 0.1 * s, cr, false); }
      A.topY += 0.15 * s;
    }
    if (def.boss || def.mini) {
      const aura = mesh(cyl(0.7 * s, 0.7 * s, 0.02, 24), M(def.glow || '#ff3030', { e: def.glow || '#ff3030', ei: 1, o: 0.3 }), 0, 0.03, 0, g, false);
      A.aura = aura;
    }
    // Schild-Blase
    if (def.shield) {
      const sh = mesh(sph(0.6 * s, 14), M('#5ab0ff', { e: '#3a8fff', ei: 0.6, o: 0.25 }), 0, 0.5 * s, 0, g, false);
      A.shieldMesh = sh;
    }
    // Lebensleiste
    const hb = new THREE.Group(); hb.position.y = A.topY + 0.25 + (A.float || 0); g.add(hb);
    const bw = Math.max(0.5, s * 0.9);
    const bg = new THREE.Mesh(geo('hbbg', () => new THREE.PlaneGeometry(1, 0.1)), new THREE.MeshBasicMaterial({ color: 0x222222, depthTest: true }));
    bg.scale.x = bw; hb.add(bg);
    const fgm = new THREE.MeshBasicMaterial({ color: 0x4cd964 });
    const fg = new THREE.Mesh(geo('hbfg', () => { const p = new THREE.PlaneGeometry(1, 0.07); p.translate(0.5, 0, 0); return p; }), fgm);
    fg.position.set(-bw / 2, 0, 0.002); fg.scale.x = bw; hb.add(fg);
    const shm = new THREE.Mesh(geo('hbfg', null), new THREE.MeshBasicMaterial({ color: 0x5ab0ff }));
    shm.position.set(-bw / 2, 0.07, 0.002); shm.scale.set(bw, 0.6, 1); shm.visible = !!def.shield; hb.add(shm);
    A.hb = hb; A.hbFg = fg; A.hbW = bw; A.hbShield = shm;
    hb.visible = false;
    g.userData.A = A;
    return g;
  }

  // ---------------------------------------------------------
  //  DEKO & UMGEBUNG
  // ---------------------------------------------------------
  function makeTree(style, leaf, scale = 1) {
    const g = new THREE.Group();
    const trunk = M('#7a5230');
    switch (style) {
      case 'palm': {
        for (let i = 0; i < 4; i++) { const p = mesh(cyl(0.06, 0.08, 0.3, 6), trunk, Math.sin(i * 0.4) * 0.05 * i, 0.15 + i * 0.28, 0, g); p.rotation.z = 0.1 * i; }
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2;
          const l = mesh(box(0.6, 0.03, 0.16), M(leaf), Math.cos(a) * 0.3 + 0.15, 1.15, Math.sin(a) * 0.3, g);
          l.rotation.y = -a; l.rotation.z = -0.4;
        }
        break;
      }
      case 'snowpine': case 'dark': {
        mesh(cyl(0.06, 0.09, 0.4, 6), trunk, 0, 0.2, 0, g);
        for (let i = 0; i < 3; i++) mesh(cone(0.5 - i * 0.12, 0.6, 7), M(leaf), 0, 0.55 + i * 0.35, 0, g);
        if (style === 'snowpine') for (let i = 0; i < 3; i++) mesh(cone(0.3 - i * 0.08, 0.22, 7), M('#ffffff'), 0, 0.78 + i * 0.35, 0, g);
        break;
      }
      case 'dead': {
        mesh(cyl(0.05, 0.1, 1.0, 5), M('#2a2220'), 0, 0.5, 0, g);
        for (let i = 0; i < 3; i++) { const b = mesh(cyl(0.02, 0.04, 0.5, 4), M('#2a2220'), 0, 0.6 + i * 0.15, 0, g); b.rotation.z = (i - 1) * 0.9 + 0.3; b.rotation.y = i * 2; }
        break;
      }
      case 'jungle': {
        mesh(cyl(0.08, 0.12, 1.2, 6), trunk, 0, 0.6, 0, g);
        mesh(sph(0.55, 8), M(leaf), 0, 1.4, 0, g).scale.y = 0.6;
        mesh(sph(0.35, 8), M('#2f9a3a'), 0.3, 1.2, 0.2, g);
        for (let i = 0; i < 3; i++) mesh(cyl(0.01, 0.01, 0.6, 3), M('#3a6a2a'), (i - 1) * 0.3, 0.9, 0.3, g, false);
        break;
      }
      case 'icecrystal': {
        for (let i = 0; i < 3; i++) { const c = mesh(oct(0.25 - i * 0.05), M(leaf, { e: '#6fd6ff', ei: 0.3, o: 0.9 }), (i - 1) * 0.2, 0.4 + i * 0.1, 0, g); c.scale.y = 2.5; }
        break;
      }
      case 'mushroom': {
        mesh(cyl(0.1, 0.14, 0.7, 8), M('#f5ecd8'), 0, 0.35, 0, g);
        const cap = mesh(geo('mcap', () => new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), M(leaf, { e: leaf, ei: 0.25 }), 0, 0.65, 0, g);
        for (let i = 0; i < 5; i++) { const a = i * 1.3; mesh(sph(0.06, 6), M('#ffffff'), Math.cos(a) * 0.3, 0.85, Math.sin(a) * 0.3, g, false); }
        break;
      }
      default: { // oak
        mesh(cyl(0.07, 0.1, 0.6, 6), trunk, 0, 0.3, 0, g);
        mesh(ico(0.45, 0), M(leaf), 0, 0.85, 0, g);
        mesh(ico(0.32, 0), M(new THREE.Color(leaf).offsetHSL(0, 0, 0.06).getStyle()), 0.2, 1.1, 0.1, g);
      }
    }
    g.scale.setScalar(scale);
    return g;
  }

  function makeDeco(id, biome) {
    const g = new THREE.Group();
    switch (id) {
      case 'tree': g.add(makeTree(biome.tree, biome.leaf, 0.75)); break;
      case 'bush': mesh(ico(0.28, 0), M(biome.leaf), 0, 0.2, 0, g).scale.y = 0.7; mesh(ico(0.2, 0), M(biome.leaf), 0.18, 0.18, 0.1, g); break;
      case 'flowers':
        for (let i = 0; i < 7; i++) {
          const x = (Math.random() - 0.5) * 0.7, z = (Math.random() - 0.5) * 0.7;
          mesh(cyl(0.01, 0.01, 0.18, 3), M('#3a8a2a'), x, 0.09, z, g, false);
          mesh(sph(0.05, 6), M(['#ff5a8a', '#ffd23d', '#ffffff', '#b47aff', '#ff7a3d'][i % 5]), x, 0.19, z, g, false);
        }
        break;
      case 'lantern':
        mesh(cyl(0.03, 0.04, 0.9, 6), M('#2a2a2a'), 0, 0.45, 0, g);
        mesh(box(0.14, 0.18, 0.14), M('#ffe9a0', { e: '#ffcc55', ei: 1 }), 0, 0.95, 0, g, false);
        mesh(cone(0.12, 0.1, 4), M('#2a2a2a'), 0, 1.09, 0, g).rotation.y = Math.PI / 4;
        break;
      case 'fence':
        for (const x of [-0.4, 0, 0.4]) mesh(box(0.06, 0.4, 0.06), M('#a8784a'), x, 0.2, 0, g);
        mesh(box(0.92, 0.05, 0.04), M('#c28a55'), 0, 0.3, 0, g); mesh(box(0.92, 0.05, 0.04), M('#c28a55'), 0, 0.15, 0, g);
        break;
      case 'fountain': case 'crystalfountain': {
        const cr = id === 'crystalfountain';
        mesh(cyl(0.42, 0.45, 0.2, 12), M(cr ? '#8a6ad8' : '#b8b2a6'), 0, 0.1, 0, g);
        mesh(cyl(0.36, 0.36, 0.05, 12), M(cr ? '#ff9af0' : '#5ab8ff', { e: cr ? '#ff5ae0' : '#2a7aff', ei: 0.3 }), 0, 0.19, 0, g, false);
        mesh(cyl(0.06, 0.08, 0.45, 8), M(cr ? '#8a6ad8' : '#b8b2a6'), 0, 0.4, 0, g);
        if (cr) { const c = mesh(oct(0.14), M('#ffffff', { e: '#c08cff', ei: 0.8 }), 0, 0.78, 0, g, false); c.scale.y = 1.6; c.userData.spin = 1; }
        else mesh(sph(0.1, 8), M('#8fd3ff', { e: '#5ab8ff', ei: 0.3, o: 0.8 }), 0, 0.68, 0, g, false);
        break;
      }
      case 'house': {
        mesh(box(0.7, 0.5, 0.6), M('#f2e3c6'), 0, 0.25, 0, g);
        const roof = mesh(geo('roof', () => new THREE.ConeGeometry(0.56, 0.4, 4)), M('#c0503a'), 0, 0.7, 0, g); roof.rotation.y = Math.PI / 4; roof.scale.z = 0.95;
        mesh(box(0.14, 0.26, 0.02), M('#6a3a1a'), 0, 0.13, 0.31, g, false);
        mesh(box(0.14, 0.12, 0.02), M('#9fd8ff', { e: '#ffd27a', ei: 0.3 }), 0.22, 0.32, 0.31, g, false);
        mesh(box(0.1, 0.25, 0.1), M('#8a5a3a'), 0.2, 0.8, -0.1, g);
        break;
      }
      case 'statue': case 'goldstatue': {
        const gold = id === 'goldstatue';
        const m = gold ? M('#ffd700', { e: '#a07800', ei: 0.4 }) : M('#b8b8b0');
        mesh(box(0.4, 0.2, 0.4), M('#8a8478'), 0, 0.1, 0, g);
        mesh(box(0.2, 0.36, 0.14), m, 0, 0.38, 0, g);
        mesh(sph(0.1, 8), m, 0, 0.65, 0, g);
        const sw = mesh(box(0.03, 0.4, 0.03), m, 0.14, 0.55, 0.05, g); sw.rotation.z = -0.3;
        break;
      }
      case 'rock': mesh(dod(0.25), M('#8a8a86'), 0, 0.15, 0, g).scale.set(1, 0.7, 0.9); mesh(dod(0.14), M('#9a9a95'), 0.2, 0.08, 0.1, g); break;
      case 'windmill': {
        mesh(cyl(0.16, 0.28, 1.0, 8), M('#e8dcc0'), 0, 0.5, 0, g);
        mesh(cone(0.22, 0.3, 8), M('#a04030'), 0, 1.15, 0, g);
        const blades = new THREE.Group(); blades.position.set(0, 0.95, 0.24); g.add(blades);
        for (let i = 0; i < 4; i++) { const b = mesh(box(0.08, 0.55, 0.02), M('#f8f4ea'), 0, 0.28, 0, new THREE.Group()); b.parent.rotation.z = i * Math.PI / 2; blades.add(b.parent); }
        blades.userData.spinZ = 1.2; break;
      }
      case 'lighthouse': {
        for (let i = 0; i < 4; i++) mesh(cyl(0.2 - i * 0.02, 0.22 - i * 0.02, 0.3, 10), M(i % 2 ? '#ffffff' : '#d03a3a'), 0, 0.15 + i * 0.3, 0, g);
        mesh(cyl(0.16, 0.16, 0.18, 10), M('#fff6a0', { e: '#ffee55', ei: 1 }), 0, 1.3, 0, g, false);
        mesh(cone(0.2, 0.2, 10), M('#2a2a2a'), 0, 1.48, 0, g);
        break;
      }
      case 'dragonstatue': {
        mesh(box(0.5, 0.16, 0.5), M('#5a5a5a'), 0, 0.08, 0, g);
        const e = makeEnemy({ ...ENEMY_BY_ID.babydragon, color: '#2fbf8f', fly: false, size: 0.7, glow: '#2fffb0' });
        e.userData.A.hb.visible = false; e.remove(e.userData.A.hb); e.position.y = 0.16; g.add(e);
        break;
      }
    }
    return g;
  }

  function makeTrap(def) {
    const g = new THREE.Group();
    mesh(box(0.8, 0.05, 0.8), M('#4a4a4a'), 0, 0.075, 0, g, false).receiveShadow = true;
    const c = def.color;
    switch (def.id) {
      case 'trap_spike': for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) mesh(cone(0.07, 0.22, 4), M(c), x * 0.24, 0.2, z * 0.24, g); break;
      case 'trap_glue': mesh(cyl(0.36, 0.38, 0.04, 16), M(c, { e: '#6a5000', ei: 0.2 }), 0, 0.12, 0, g, false); for (let i = 0; i < 5; i++) mesh(sph(0.06, 6), M('#e0c040'), Math.cos(i) * 0.22, 0.13, Math.sin(i * 2) * 0.22, g, false); break;
      case 'trap_fire': for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28; mesh(cyl(0.05, 0.06, 0.08, 6), M('#2a2a2a'), Math.cos(a) * 0.22, 0.14, Math.sin(a) * 0.22, g, false); } { const f = mesh(cone(0.18, 0.3, 8), M('#ff8a1a', { e: '#ff5a00', ei: 1, o: 0.85 }), 0, 0.25, 0, g, false); g.userData.flame = f; } break;
      case 'trap_bomb': mesh(sph(0.2, 12), M('#2a2a2a'), 0, 0.25, 0, g); mesh(cyl(0.02, 0.02, 0.14, 4), M('#a08060'), 0, 0.48, 0, g, false); { const l = mesh(sph(0.04, 6), M('#ff3020', { e: '#ff2000', ei: 1 }), 0, 0.56, 0, g, false); g.userData.led = l; } break;
      case 'trap_frost': { const cr = mesh(oct(0.16), M(c, { e: '#5ad0ff', ei: 0.6 }), 0, 0.3, 0, g, false); cr.scale.y = 1.6; g.userData.spin = cr; for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28; mesh(cone(0.05, 0.18, 4), M('#e0f8ff'), Math.cos(a) * 0.26, 0.17, Math.sin(a) * 0.26, g, false); } break; }
    }
    return g;
  }

  function makeCastle(skin) {
    const g = new THREE.Group();
    const wall = M(skin.wall), roof = M(skin.roof), dark = M('#4a4038');
    mesh(box(0.9, 0.55, 0.8), wall, 0, 0.28, 0, g);
    for (let i = 0; i < 4; i++) mesh(box(0.14, 0.14, 0.14), wall, -0.35 + i * 0.233, 0.62, 0.36, g);
    mesh(box(0.26, 0.34, 0.04), dark, 0, 0.17, 0.41, g);
    for (const [x, z] of [[-0.45, -0.38], [0.45, -0.38], [-0.45, 0.38], [0.45, 0.38]]) {
      mesh(cyl(0.15, 0.17, 0.9, 10), wall, x, 0.45, z, g);
      mesh(cone(0.2, 0.36, 10), roof, x, 1.08, z, g);
    }
    mesh(cyl(0.2, 0.22, 1.2, 10), wall, 0, 0.6, -0.1, g);
    mesh(cone(0.27, 0.5, 10), roof, 0, 1.45, -0.1, g);
    mesh(cyl(0.01, 0.01, 0.35, 4), M('#333'), 0, 1.85, -0.1, g, false);
    const flag = mesh(geo('cflag', () => new THREE.PlaneGeometry(0.3, 0.18, 5, 1)), M('#ff3b3b', { side: 1 }), 0.15, 1.92, -0.1, g, false);
    g.userData.flag = flag;
    return g;
  }

  function makePortal() {
    const g = new THREE.Group();
    const st = M('#6a6078');
    mesh(box(0.18, 1.0, 0.2), st, -0.42, 0.5, 0, g);
    mesh(box(0.18, 1.0, 0.2), st, 0.42, 0.5, 0, g);
    mesh(box(1.04, 0.18, 0.24), st, 0, 1.05, 0, g);
    mesh(oct(0.1), M('#ff3df0', { e: '#ff3df0', ei: 1 }), 0, 1.25, 0, g, false);
    const disc = mesh(geo('portal', () => new THREE.CircleGeometry(0.38, 24)), M('#a040ff', { e: '#7a20ff', ei: 1, o: 0.85, side: 1 }), 0, 0.5, 0, g, false);
    disc.scale.y = 1.25; g.userData.disc = disc;
    const sw = mesh(tor(0.3, 0.03, 4, 20), M('#ffb3ff', { e: '#ff80ff', ei: 1 }), 0, 0.5, 0.01, g, false);
    sw.scale.y = 1.25; g.userData.swirl = sw;
    return g;
  }


  // ---------------------------------------------------------
  //  SPIELFIGUR (eigener Klötzchen-Look)
  // ---------------------------------------------------------
  let faceTex = null;
  function makeAvatar(shirt = '#e03a3a', pants = '#2f5bd0') {
    if (!faceTex) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#ffd23f'; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#1b1b1b';
      g.beginPath(); g.ellipse(44, 52, 8, 12, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(84, 52, 8, 12, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(46, 48, 3, 0, 7); g.fill(); g.beginPath(); g.arc(86, 48, 3, 0, 7); g.fill();
      g.strokeStyle = '#1b1b1b'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.arc(64, 72, 22, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
      g.fillStyle = 'rgba(255,120,120,.45)'; g.beginPath(); g.arc(30, 76, 9, 0, 7); g.fill(); g.beginPath(); g.arc(98, 76, 9, 0, 7); g.fill();
      faceTex = new THREE.CanvasTexture(c); faceTex.colorSpace = THREE.SRGBColorSpace;
    }
    const g = new THREE.Group();
    const skin = M('#ffd23f'), sh = M(shirt), pa = M(pants);
    const A = { legs: [], arms: [] };
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(sx * 0.14, 1.0, 0); g.add(leg);
      mesh(box(0.27, 1.0, 0.3), pa, 0, -0.5, 0, leg);
      mesh(box(0.29, 0.12, 0.34), M('#3a2a22'), 0, -0.94, 0.02, leg);
      A.legs.push(leg);
      const arm = new THREE.Group(); arm.position.set(sx * 0.42, 1.78, 0); g.add(arm);
      mesh(box(0.26, 0.36, 0.3), sh, 0, -0.16, 0, arm);
      mesh(box(0.24, 0.5, 0.28), skin, 0, -0.58, 0, arm);
      A.arms.push(arm);
    }
    mesh(box(0.58, 0.82, 0.32), sh, 0, 1.41, 0, g);
    mesh(box(0.58, 0.08, 0.33), M('#222'), 0, 1.02, 0, g);
    const faceMat = pbr ? new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.7 }) : new THREE.MeshLambertMaterial({ map: faceTex });
    const head = new THREE.Mesh(box(0.52, 0.52, 0.52), [skin, skin, skin, skin, faceMat, skin]);
    head.position.y = 2.1; head.castShadow = true; g.add(head);
    // Kappe
    mesh(cyl(0.29, 0.29, 0.14, 12), pa, 0, 2.42, 0, g);
    mesh(box(0.42, 0.04, 0.26), pa, 0, 2.37, 0.3, g);
    A.head = head;
    g.userData.A = A;
    return g;
  }

  return { setPBR, makeTrap, makeAvatar, M, mesh, geo, box, cyl, sph, cone, tor, oct, ico, dod, makeTower, applyTowerLevel, makeEnemy, makeTree, makeDeco, makeCastle, makePortal };
})();
