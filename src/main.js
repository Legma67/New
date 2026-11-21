// Einstiegspunkt: Renderer, Kamera, Spielschleife
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { S } from './state.js';
import { N, TILE } from './config.js';
import { loadProfile, saveNow, checkAchievements } from './profile.js';
import { FX, initFloaters, updateFloaters } from './effects.js';
import { Sound } from './audio.js';
import { initLights, updateWorld, W } from './world.js';
import { generateThumbs } from './thumbs.js';
import { UI, applySettings } from './ui.js';
import { initBuild } from './build.js';
import { enterMenu, updateDemo, updateDecos } from './game.js';
import { updateEnemies } from './enemies.js';
import { updateProjectiles } from './combat.js';
import { updateWaves } from './waves.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
S.renderer = renderer;

const scene = new THREE.Scene(); S.scene = scene;
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 900); S.camera = camera;
camera.position.set(0, 34, 38);
const controls = new OrbitControls(camera, canvas); S.controls = controls;
controls.enableDamping = true; controls.dampingFactor = 0.12;
controls.minDistance = 10; controls.maxDistance = 90;
controls.maxPolarAngle = 1.35; controls.minPolarAngle = 0.12;
controls.screenSpacePanning = false; controls.panSpeed = 1.2; controls.rotateSpeed = 0.7; controls.zoomSpeed = 1.1;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

S.profile = loadProfile();
window.__S = S; // Debug-Zugriff (Konsole)

S.applyQuality = () => {
  const q = S.profile.settings.quality;
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(q === 'high' ? Math.min(2, dpr) : q === 'medium' ? Math.min(1.5, dpr) : 1);
  FX.quality = q === 'high' ? 1 : q === 'medium' ? 0.7 : 0.4;
  const sh = S.profile.settings.shadows && q !== 'low';
  renderer.shadowMap.enabled = sh;
  if (W.sun) { W.sun.castShadow = sh; const m = q === 'high' ? 2048 : 1024; if (W.sun.shadow.mapSize.x !== m) { W.sun.shadow.mapSize.set(m, m); if (W.sun.shadow.map) { W.sun.shadow.map.dispose(); W.sun.shadow.map = null; } } }
  scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => (m.needsUpdate = true)); } });
  resize();
};

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 62 : 50;
  camera.updateProjectionMatrix();
  FX.resize(h * renderer.getPixelRatio());
}
window.addEventListener('resize', resize);

// Audio erst nach erster Interaktion
const unlock = () => { Sound.init(); };
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

// Speichern beim Verlassen
document.addEventListener('visibilitychange', () => { if (document.hidden && !window.__noSave) saveNow(); });
window.addEventListener('beforeunload', () => { if (!window.__noSave) saveNow(); });

async function boot() {
  const bar = document.querySelector('#loading .lbar i');
  const txt = document.getElementById('loadtxt');
  initLights(scene);
  FX.init(scene);
  initFloaters();
  txt.textContent = 'Erzeuge Türme, Gegner & Gebäude …';
  await generateThumbs((k) => (bar.style.width = Math.round(k * 90) + '%'));
  txt.textContent = 'Baue die Welt …';
  await new Promise((r) => setTimeout(r, 20));
  UI.init();
  initBuild(canvas);
  applySettings();
  enterMenu();
  checkAchievements();
  bar.style.width = '100%';
  resize();
  const ld = document.getElementById('loading');
  ld.style.opacity = '0'; setTimeout(() => ld.remove(), 550);
  requestAnimationFrame(loop);
}

const clock = new THREE.Clock();
const HALFP = N * TILE / 2;
let saveT = 0;
function loop() {
  requestAnimationFrame(loop);
  let dt = Math.min(0.05, clock.getDelta());
  S.time += dt;
  const sim = S.state === 'menu' || !S.paused;
  if (sim) {
    const steps = S.state === 'play' ? S.speed : 1;
    for (let i = 0; i < steps; i++) step(dt);
    if (S.state === 'play') { S.profile.stats.playTime += dt; saveT += dt; if (saveT > 30) { saveT = 0; saveNow(); } }
  }
  // Kamera
  const t = controls.target;
  t.x = THREE.MathUtils.clamp(t.x, -HALFP - 6, HALFP + 6); t.z = THREE.MathUtils.clamp(t.z, -HALFP - 6, HALFP + 6); t.y = 0;
  controls.update();
  if (camera.position.y < 2) camera.position.y = 2;
  if (S.shake > 0) {
    const s = S.shake * 0.35;
    camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s;
    S.shake = Math.max(0, S.shake - dt * 2);
  }
  W.sun.position.set(t.x - 30, 50, t.z + 25); W.sun.target.position.copy(t);
  updateWorld(dt, S.time);
  FX.update(dt);
  updateFloaters(dt, camera);
  UI.update(dt);
  renderer.render(scene, camera);
}

function step(dt) {
  if (S.state === 'menu') updateDemo(dt);
  else updateWaves(dt);
  for (const tw of S.towers) tw.update(dt);
  updateEnemies(dt);
  updateProjectiles(dt);
  updateDecos(dt);
}

boot().catch((e) => {
  console.error(e);
  const t = document.getElementById('loadtxt'); if (t) t.textContent = 'Fehler beim Laden: ' + e.message;
});
