// Spielwelt: Himmel, Licht, Landschaft, Grundstück, Straßen-Optik, Pfeile, Umgebungseffekte
import * as THREE from 'three';
import { S } from './state.js';
import { N, TILE, SPAWN, GOAL, tileToWorld } from './config.js';
import { BIOME_BY_ID, ROAD_BY_ID } from './data/world.js';
import { G, mat, basic, makeTree, makeDeco, makeBase, makePortal, makeSign, mergeStatic } from './models.js';
import { FX } from './effects.js';

const PLOT = N * TILE; // 44
const HALFP = PLOT / 2;
export const W = { env: null, sky: null, hemi: null, sun: null, water: null, waterBase: null, roadsGroup: null, arrows: [], gridLines: null,
  base: null, portal: null, sign: null, board: null, animated: [], biome: null, ambientT: 0, hover: null };

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function initLights(scene) {
  W.hemi = new THREE.HemisphereLight('#bfe3ff', '#6b8f4a', 1.0); scene.add(W.hemi);
  W.sun = new THREE.DirectionalLight('#fff4dc', 2.2);
  W.sun.position.set(-30, 50, 25); W.sun.castShadow = true;
  W.sun.shadow.mapSize.set(2048, 2048);
  const c = W.sun.shadow.camera; c.left = -34; c.right = 34; c.top = 34; c.bottom = -34; c.near = 1; c.far = 140;
  W.sun.shadow.bias = -0.0005; W.sun.shadow.normalBias = 0.03;
  scene.add(W.sun); scene.add(W.sun.target);
  W.amb = new THREE.AmbientLight('#ffffff', 0.25); scene.add(W.amb);
  const skyGeo = new THREE.SphereGeometry(420, 24, 16);
  W.skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.15,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0); }',
  });
  W.sky = new THREE.Mesh(skyGeo, W.skyMat); scene.add(W.sky);
}

function plotTexture(b) {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const x = c.getContext('2d'); const s = 1024 / N; const r = rng(42);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { x.fillStyle = (i + j) % 2 ? b.ground : b.ground2; x.fillRect(i * s, j * s, s + 1, s + 1); }
  for (let k = 0; k < 2600; k++) {
    x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    x.fillRect(r() * 1024, r() * 1024, 2 + r() * 3, 4 + r() * 6);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function groundTexture(b) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d'); const r = rng(7);
  x.fillStyle = b.ground2; x.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 3000; k++) { x.fillStyle = r() < 0.5 ? b.ground : 'rgba(0,0,0,0.07)'; x.beginPath(); x.arc(r() * 512, r() * 512, 1 + r() * 4, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, 30); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildWorld(biomeId) {
  const b = BIOME_BY_ID[biomeId] || BIOME_BY_ID.grass;
  W.biome = b; S.biome = b;
  if (W.env) { S.scene.remove(W.env); W.env.traverse((o) => { if (o.material && o.material.map) o.material.map.dispose(); }); }
  W.animated = [];
  const env = new THREE.Group(); W.env = env; S.scene.add(env);
  // Licht & Himmel
  W.skyMat.uniforms.top.value.set(b.sky); W.skyMat.uniforms.bottom.value.set(b.sky2);
  S.scene.fog = new THREE.Fog(b.fog, 90, 330);
  W.hemi.color.set(b.sky); W.hemi.groundColor.set(b.ground2); W.hemi.intensity = 0.85 * b.sun + 0.2;
  W.sun.intensity = 2.3 * b.sun; W.sun.color.set(b.id === 'volcano' ? '#ffb08a' : b.id === 'darkforest' ? '#a9b8ff' : '#fff4dc');
  // Boden
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ map: groundTexture(b), roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.62; ground.receiveShadow = true; env.add(ground);
  // Grundstück (erhöhte Plattform)
  const plotTop = new THREE.MeshStandardMaterial({ map: plotTexture(b), roughness: 0.9 });
  const side = mat(b.side, { flat: true });
  const plot = new THREE.Mesh(new THREE.BoxGeometry(PLOT, 0.6, PLOT), [side, side, plotTop, side, side, side]);
  plot.position.y = -0.3; plot.receiveShadow = true; env.add(plot);
  plot.userData.isPlot = true; W.plotMesh = plot;
  const curb = mat('#b8b2a7', { flat: true });
  for (const [x, z, w, d] of [[0, -HALFP - 0.3, PLOT + 1.2, 0.6], [0, HALFP + 0.3, PLOT + 1.2, 0.6], [-HALFP - 0.3, 0, 0.6, PLOT], [HALFP + 0.3, 0, 0.6, PLOT]]) {
    const m = new THREE.Mesh(G.box(w, 0.9, d), curb); m.position.set(x, -0.2, z); m.castShadow = m.receiveShadow = true; env.add(m);
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const p = new THREE.Mesh(G.cyl(0.45, 0.5, 1.6, 8), curb); p.position.set(x * (HALFP + 0.3), 0.3, z * (HALFP + 0.3)); p.castShadow = true; env.add(p);
    const l = new THREE.Mesh(G.sph(0.25, 10, 8), mat('#fff1b8', { e: 1.2 })); l.position.set(p.position.x, 1.3, p.position.z); env.add(l);
  }
  // Rasterlinien (Baumodus)
  const pts = [];
  for (let i = 0; i <= N; i++) { const v = -HALFP + i * TILE; pts.push(-HALFP, 0.025, v, HALFP, 0.025, v, v, 0.025, -HALFP, v, 0.025, HALFP); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  W.gridLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18 }));
  W.gridLines.visible = false; env.add(W.gridLines);
  // Portal & Kern
  const sp = tileToWorld(SPAWN.x, SPAWN.z), gp = tileToWorld(GOAL.x, GOAL.z);
  W.portal = makePortal(); W.portal.group.position.set(sp.x - 0.6, 0, sp.z); env.add(W.portal.group); W.animated.push(W.portal);
  setBaseSkin(S.profile.equipped.base);
  // Schilder
  W.sign = makeSign(S.profile.name, 'Grundstück'); W.sign.position.set(-8, 0, HALFP + 1.6); env.add(W.sign);
  W.board = makeSign('Welle 0', '❤ 20'); W.board.position.set(8, 0, HALFP + 1.6); env.add(W.board);
  // Wasser / Lava
  const wg = new THREE.CircleGeometry(9, 40); wg.rotateX(-Math.PI / 2);
  const wm = new THREE.MeshStandardMaterial({ color: b.water, roughness: 0.15, metalness: 0.1, transparent: !b.lava, opacity: b.lava ? 1 : 0.85, emissive: b.lava ? b.water : '#000', emissiveIntensity: b.lava ? 0.9 : 0 });
  W.water = new THREE.Mesh(wg, wm); W.water.position.set(36, -0.5, -32); env.add(W.water);
  W.waterBase = Float32Array.from(wg.attributes.position.array);
  const rim = new THREE.Mesh(G.tor(9, 0.6, 6, 40), mat(b.rocks, { flat: true })); rim.rotation.x = Math.PI / 2; rim.position.set(36, -0.5, -32); env.add(rim);
  // Berge
  const r = rng(b.id.length * 97);
  const mtn = new THREE.Group(); env.add(mtn);
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2 + r() * 0.2, d = 150 + r() * 60, h = 25 + r() * 45, rad = 18 + r() * 22;
    const m = new THREE.Mesh(G.cone(rad, h, 7), mat(b.mountain, { flat: true }));
    m.position.set(Math.cos(a) * d, h / 2 - 1, Math.sin(a) * d); mtn.add(m);
    if (b.snowcap) { const c = new THREE.Mesh(G.cone(rad * 0.32, h * 0.32, 7), mat('#ffffff', { flat: true })); c.position.set(m.position.x, h - h * 0.16 - 1, m.position.z); mtn.add(c); }
    if (b.lava && i % 5 === 0) { const c = new THREE.Mesh(G.cyl(rad * 0.12, rad * 0.2, 2, 7), mat('#ff5a00', { e: 2 })); c.position.set(m.position.x, h - 1, m.position.z); mtn.add(c); }
  }
  mergeStatic(mtn, { cast: false, receive: false });
  // Nachbargrundstücke (frei)
  for (const sx of [-1, 1]) {
    const nb = new THREE.Mesh(new THREE.BoxGeometry(PLOT, 0.5, PLOT), [side, side, mat(b.ground2), side, side, side]);
    nb.position.set(sx * (PLOT + 14), -0.36, 0); nb.receiveShadow = true; env.add(nb);
    const s = makeSign('Freies', 'Grundstück'); s.position.set(sx * (PLOT + 14), -0.1, HALFP - 2); env.add(s);
  }
  // Landschaft
  const scen = new THREE.Group(); env.add(scen);
  const scenFar = new THREE.Group(); env.add(scenFar);
  const avoid = (x, z) => (Math.abs(x) < HALFP + 4 && Math.abs(z) < HALFP + 5) || (Math.abs(Math.abs(x) - (PLOT + 14)) < HALFP + 2 && Math.abs(z) < HALFP + 2) || Math.hypot(x - 36, z + 32) < 11;
  let placed = 0;
  for (let i = 0; i < 900 && placed < 170; i++) {
    const x = (r() - 0.5) * 220, z = (r() - 0.5) * 220;
    if (avoid(x, z) || Math.hypot(x, z) > 120) continue;
    const kind = b.trees[(r() * b.trees.length) | 0];
    const t = makeTree(kind, b); t.position.set(x, -0.6, z); t.rotation.y = r() * 6; t.scale.setScalar(0.9 + r() * 0.9);
    (Math.hypot(x, z) < 50 ? scen : scenFar).add(t); placed++;
  }
  // Häuschen, Zäune, Laternen, Blumen am Wegesrand
  const extras = [['house', 8], ['lantern', 10], ['fence', 14], ['flowers', 22], ['rock', 12], ['windmill', 2], ['tent', 3]];
  for (const [kind, n] of extras) {
    let k = 0;
    for (let i = 0; i < 300 && k < n; i++) {
      const x = (r() - 0.5) * 150, z = (r() - 0.5) * 150;
      if (avoid(x, z) || Math.hypot(x, z) > 75) continue;
      const d = makeDeco(kind, b); d.group.position.set(x, -0.6, z); d.group.rotation.y = r() * 6;
      if (d.spinners.length) { W.animated.push(d); env.add(d.group); } else scen.add(d.group);
      k++;
    }
  }
  // Dekorativer Weg zum Schild
  for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(G.cyl(0.6, 0.6, 0.08, 7), mat('#cfc8bb', { flat: true })); s.position.set(-24 + i * 6, -0.56, HALFP + 6); s.receiveShadow = true; scen.add(s); }
  mergeStatic(scen, { cast: true, receive: true }); mergeStatic(scenFar, { cast: false, receive: false });
  if (!W.roadsGroup) { W.roadsGroup = new THREE.Group(); S.scene.add(W.roadsGroup); }
  FX.ambient = b.ambient;
}

export function setBaseSkin(skin) {
  if (W.base) W.env.remove(W.base.group);
  W.animated = W.animated.filter((a) => a !== W.base);
  W.base = makeBase(skin);
  const gp = tileToWorld(GOAL.x, GOAL.z);
  W.base.group.position.set(gp.x, 0, gp.z); W.env.add(W.base.group); W.animated.push(W.base);
}

export function updateSigns(name, sub) { W.sign.userData.update(name, sub); }
export function updateBoard(a, b) { W.board.userData.update(a, b); }

// ---------------------------------------------------------------- Straßen-Optik
export function renderRoadTile(x, z) {
  const key = z * N + x;
  const old = S.roads.get(key);
  if (old) { W.roadsGroup.remove(old); S.roads.delete(key); }
  const cell = S.grid.get(x, z); if (!cell) return;
  if (!(cell.type === 'road' || cell.type === 'spawn' || cell.type === 'goal')) return;
  const st = ROAD_BY_ID[cell.style] || ROAD_BY_ID.r_stone;
  const g = new THREE.Group();
  const w = st.width, wt = Math.min(TILE, w + 0.22);
  const top = mat(st.color, { flat: true, r: 0.85, e: st.glow ? st.glow * 0.4 : 0 });
  const edge = mat(st.edge, { flat: true, e: st.glow || 0 });
  const c = S.grid.connections(x, z);
  const addBox = (gw, gh, gd, m, px, py, pz) => { const o = new THREE.Mesh(G.box(gw, gh, gd), m); o.position.set(px, py, pz); o.receiveShadow = true; g.add(o); return o; };
  addBox(wt, 0.08, wt, edge, 0, 0.04, 0);
  addBox(w, 0.1, w, top, 0, 0.06, 0);
  const arms = [['e', 1, 0], ['w', -1, 0], ['s', 0, 1], ['n', 0, -1]];
  const h = TILE / 2;
  for (const [k, dx, dz] of arms) {
    if (!c[k]) continue;
    const len = h - w / 2 + 0.01, off = w / 2 + len / 2;
    if (dx) { addBox(len, 0.08, wt, edge, dx * off, 0.04, 0); addBox(len, 0.1, w, top, dx * off, 0.06, 0); }
    else { addBox(wt, 0.08, len, edge, 0, 0.04, dz * off); addBox(w, 0.1, len, top, 0, 0.06, dz * off); }
    if (st.pattern === 'lines') { const l = dx ? addBox(len * 0.6, 0.02, 0.08, basic('#f8f3d0'), dx * off, 0.115, 0) : addBox(0.08, 0.02, len * 0.6, basic('#f8f3d0'), 0, 0.115, dz * off); }
    if (st.pattern === 'neon') { if (dx) { addBox(len, 0.03, 0.06, edge, dx * off, 0.12, w / 2 - 0.05); addBox(len, 0.03, 0.06, edge, dx * off, 0.12, -w / 2 + 0.05); } else { addBox(0.06, 0.03, len, edge, w / 2 - 0.05, 0.12, dz * off); addBox(0.06, 0.03, len, edge, -w / 2 + 0.05, 0.12, dz * off); } }
  }
  const r = rng(key * 13 + 1);
  if (st.pattern === 'cobble') for (let i = 0; i < 6; i++) addBox(0.18 + r() * 0.15, 0.02, 0.18 + r() * 0.15, edge, (r() - 0.5) * (w - 0.3), 0.115, (r() - 0.5) * (w - 0.3));
  if (st.pattern === 'dots') for (let i = 0; i < 5; i++) addBox(0.12, 0.05, 0.12, mat('#5d8f3a'), (r() - 0.5) * (w - 0.2), 0.12, (r() - 0.5) * (w - 0.2));
  if (st.pattern === 'rainbow') ['#ef4444', '#f59e0b', '#fde047', '#22c55e', '#3b82f6', '#a855f7'].forEach((col, i) => addBox(w * 0.9, 0.02, w / 7, mat(col, { e: 0.25 }), 0, 0.115, -w * 0.43 + i * w / 6.5));
  mergeStatic(g, { cast: false, receive: true });
  const wp = tileToWorld(x, z); g.position.set(wp.x, 0, wp.z);
  W.roadsGroup.add(g); S.roads.set(key, g);
}
export function renderRoadAround(x, z) { renderRoadTile(x, z); renderRoadTile(x + 1, z); renderRoadTile(x - 1, z); renderRoadTile(x, z + 1); renderRoadTile(x, z - 1); }
export function clearRoadMeshes() { for (const g of S.roads.values()) W.roadsGroup.remove(g); S.roads.clear(); }

// Richtungspfeile entlang der Route
const arrowGeo = (() => { const s = new THREE.Shape(); s.moveTo(0, 0.35); s.lineTo(0.32, -0.15); s.lineTo(0.12, -0.15); s.lineTo(0.12, -0.35); s.lineTo(-0.12, -0.35); s.lineTo(-0.12, -0.15); s.lineTo(-0.32, -0.15); s.closePath(); const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); return g; })();
export function updateArrows(path) {
  for (const a of W.arrows) a.visible = false;
  if (!path) return;
  for (let i = 0; i < path.length - 1; i++) {
    let a = W.arrows[i];
    if (!a) { a = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: '#ffe36e', transparent: true, opacity: 0.6, depthWrite: false })); W.arrows.push(a); S.scene.add(a); }
    const p = tileToWorld(path[i].x, path[i].z), q = tileToWorld(path[i + 1].x, path[i + 1].z);
    a.position.set(p.x, 0.14, p.z); a.rotation.set(0, Math.atan2(q.x - p.x, q.z - p.z) + Math.PI, 0);
    a.userData.i = i; a.visible = true;
  }
}

// ---------------------------------------------------------------- pro Frame
export function updateWorld(dt, t) {
  for (const a of W.animated) for (const sp of a.spinners) sp.o.rotation[sp.axis] += sp.speed * dt;
  if (W.base && W.base.glow) W.base.glow.position.y = 1.5 + Math.sin(t * 2) * 0.12;
  for (const a of W.arrows) if (a.visible) a.material.opacity = 0.35 + 0.55 * Math.max(0, Math.sin(t * 4 - a.userData.i * 0.5));
  // Wasser
  if (W.water) {
    const pos = W.water.geometry.attributes.position, base = W.waterBase;
    for (let i = 0; i < pos.count; i++) { const x = base[i * 3], z = base[i * 3 + 2]; pos.array[i * 3 + 1] = Math.sin(x * 0.8 + t * 2) * 0.08 + Math.cos(z * 0.7 + t * 1.6) * 0.08; }
    pos.needsUpdate = true;
    if (W.biome.lava && Math.random() < dt * 4) FX.glow.emit(36 + (Math.random() - 0.5) * 12, 0, -32 + (Math.random() - 0.5) * 12, 0, 2 + Math.random() * 2, 0, '#ff7a1a', 0.5, 1.2, 2);
  }
  // Portal-Partikel
  if (W.portal && Math.random() < dt * 20) {
    const p = W.portal.group.position;
    FX.glow.emit(p.x, 0.4 + Math.random() * 1.6, p.z + (Math.random() - 0.5) * 1.6, 1 + Math.random(), 0.3, (Math.random() - 0.5) * 0.5, Math.random() < 0.5 ? '#a855f7' : '#f0abfc', 0.25, 0.8);
  }
  // Umgebungspartikel je Biom
  W.ambientT -= dt;
  if (W.ambientT <= 0) {
    W.ambientT = 0.05 / FX.quality;
    const c = S.controls ? S.controls.target : new THREE.Vector3();
    const x = c.x + (Math.random() - 0.5) * 60, z = c.z + (Math.random() - 0.5) * 60;
    switch (FX.ambient) {
      case 'snow': FX.smoke.emit(x, 18, z, (Math.random() - 0.5) * 0.6, -2, (Math.random() - 0.5) * 0.6, '#ffffff', 0.25, 8, 0); break;
      case 'embers': FX.glow.emit(x, 0.5, z, (Math.random() - 0.5), 1.5 + Math.random(), (Math.random() - 0.5), Math.random() < 0.5 ? '#ff7a1a' : '#ffd23f', 0.18, 4, -0.1); break;
      case 'fireflies': FX.glow.emit(x, 0.5 + Math.random() * 3, z, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, '#d9f99d', 0.22, 4, 0); break;
      case 'sparkles': FX.glow.emit(x, 0.5 + Math.random() * 5, z, 0, 0.3, 0, Math.random() < 0.5 ? '#f0abfc' : '#a5f3fc', 0.25, 2.5, 0); break;
      case 'dust': FX.smoke.emit(x, 0.5 + Math.random() * 2, z, 2 + Math.random(), 0, 0.5, '#f5deb3', 0.5, 3, 0, 1); break;
      default: if (Math.random() < 0.4) FX.smoke.emit(x, 12, z, 1 + Math.random(), -1.2, (Math.random() - 0.5), Math.random() < 0.5 ? '#7cb342' : '#f59e0b', 0.22, 9, 0);
    }
  }
}
