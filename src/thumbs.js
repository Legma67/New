// Rendert 3D-Modelle als kleine Vorschaubilder für Menüs
import * as THREE from 'three';
import { TOWERS } from './data/towers.js';
import { ENEMIES } from './data/enemies.js';
import { DECOS, ROADS, BIOMES, BASE_SKINS } from './data/world.js';
import { makeTowerModel, makeEnemyModel, makeDeco, makeBase } from './models.js';

export const THUMBS = {};
let r, scene, cam;

function setup() {
  r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(128, 128); r.setPixelRatio(1); r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#667788', 1.4));
  const d = new THREE.DirectionalLight('#ffffff', 2.2); d.position.set(3, 6, 5); scene.add(d);
  cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
}
function shot(obj, h = 2.2, dist = 5.2) {
  scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const m = Math.max(size.x, size.y, size.z) || h;
  const dd = m * 1.9 + 0.5;
  cam.position.set(c.x + dd * 0.62, c.y + dd * 0.42, c.z + dd * 0.78); cam.lookAt(c);
  r.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  scene.remove(obj);
  return url;
}
function swatch(st) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = st.edge; x.fillRect(10, 30, 108, 68); x.fillStyle = st.color; x.fillRect(16, 36, 96, 56);
  if (st.pattern === 'lines') { x.fillStyle = '#f8f3d0'; for (let i = 0; i < 3; i++) x.fillRect(22 + i * 34, 61, 20, 6); }
  if (st.pattern === 'cobble') { x.fillStyle = st.edge; for (let i = 0; i < 8; i++) x.fillRect(22 + (i % 4) * 22, 44 + Math.floor(i / 4) * 22, 14, 12); }
  if (st.pattern === 'neon') { x.fillStyle = st.edge; x.fillRect(16, 40, 96, 5); x.fillRect(16, 83, 96, 5); }
  if (st.pattern === 'rainbow') ['#ef4444', '#f59e0b', '#fde047', '#22c55e', '#3b82f6', '#a855f7'].forEach((col, i) => { x.fillStyle = col; x.fillRect(16, 36 + i * 9.3, 96, 9.3); });
  if (st.pattern === 'dots') { x.fillStyle = '#5d8f3a'; for (let i = 0; i < 6; i++) x.fillRect(24 + i * 15, 50 + (i % 2) * 18, 8, 8); }
  return c.toDataURL();
}
function biomeCard(b) {
  const c = document.createElement('canvas'); c.width = 160; c.height = 100; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 100); g.addColorStop(0, b.sky); g.addColorStop(1, b.sky2); x.fillStyle = g; x.fillRect(0, 0, 160, 100);
  x.fillStyle = b.mountain; x.beginPath(); x.moveTo(0, 70); x.lineTo(40, 25); x.lineTo(80, 70); x.lineTo(115, 32); x.lineTo(160, 70); x.lineTo(160, 100); x.lineTo(0, 100); x.fill();
  if (b.snowcap) { x.fillStyle = '#fff'; x.beginPath(); x.moveTo(33, 33); x.lineTo(40, 25); x.lineTo(47, 33); x.fill(); x.beginPath(); x.moveTo(108, 40); x.lineTo(115, 32); x.lineTo(122, 40); x.fill(); }
  x.fillStyle = b.ground; x.fillRect(0, 72, 160, 28);
  x.fillStyle = b.water; x.beginPath(); x.ellipse(118, 86, 24, 6, 0, 0, 7); x.fill();
  return c.toDataURL();
}

export function generateThumbs(onProgress) {
  setup();
  const jobs = [];
  for (const t of TOWERS) jobs.push(() => (THUMBS['t_' + t.id] = shot(makeTowerModel(t, 0).group)));
  for (const t of TOWERS) jobs.push(() => (THUMBS['t5_' + t.id] = shot(makeTowerModel(t, 5).group)));
  for (const e of ENEMIES) jobs.push(() => { const E = makeEnemyModel(e); E.root.remove(E.hb); E.root.rotation.y = 0.3; THUMBS['e_' + e.id] = shot(E.root); });
  for (const d of DECOS) jobs.push(() => (THUMBS[d.id] = shot(makeDeco(d.kind, { trees: ['oak'], rocks: '#9aa0a6' }).group)));
  for (const b of BASE_SKINS) jobs.push(() => (THUMBS[b.id] = shot(makeBase(b.id).group)));
  for (const s of ROADS) jobs.push(() => (THUMBS[s.id] = swatch(s)));
  for (const b of BIOMES) jobs.push(() => (THUMBS['biome_' + b.id] = biomeCard(b)));
  return new Promise((resolve) => {
    let i = 0;
    const step = () => {
      const t0 = performance.now();
      while (i < jobs.length && performance.now() - t0 < 30) { try { jobs[i](); } catch (e) { console.warn(e); } i++; }
      onProgress && onProgress(i / jobs.length);
      if (i < jobs.length) setTimeout(step, 0);
      else { r.dispose(); r.forceContextLoss(); resolve(); }
    };
    step();
  });
}
