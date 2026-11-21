// Eingabe & Bausystem: Vorschau (grün/rot), Platzieren per Klick/Touch, Straßen ziehen, Drehen, Verschieben, Abriss
import * as THREE from 'three';
import { S } from './state.js';
import { TILE, worldToTile, tileToWorld, inPlot } from './config.js';
import { TOWER_BY_ID, towerStats } from './data/towers.js';
import { ROAD_BY_ID, DECO_BY_ID } from './data/world.js';
import { makeTowerModel, makeDeco, G } from './models.js';
import { checkPlace, applyTool } from './game.js';
import { W } from './world.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';

export const B = { tool: null, rot: 0, hover: null, preview: null, painting: false, lastPaint: null, pointers: new Map(), down: null };

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
const okMat = new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.45, depthWrite: false });
const badMat = new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.45, depthWrite: false });
let tileMark, rangeMark, selRange, canvas;

export function initBuild(cnv) {
  canvas = cnv;
  tileMark = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 0.96, TILE * 0.96), okMat.clone());
  tileMark.rotation.x = -Math.PI / 2; tileMark.position.y = 0.16; tileMark.visible = false; tileMark.renderOrder = 3;
  S.scene.add(tileMark);
  const rg = new THREE.RingGeometry(0.97, 1, 64); rg.rotateX(-Math.PI / 2);
  const disc = new THREE.CircleGeometry(1, 64); disc.rotateX(-Math.PI / 2);
  const mkRange = (col) => { const g = new THREE.Group(); g.add(new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false }))); g.add(new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, depthWrite: false }))); g.position.y = 0.18; g.visible = false; g.renderOrder = 2; S.scene.add(g); return g; };
  rangeMark = mkRange('#ffffff'); selRange = mkRange('#7dd3fc');

  cnv.addEventListener('pointerdown', onDown);
  cnv.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  cnv.addEventListener('pointercancel', (e) => { B.pointers.delete(e.pointerId); B.painting = false; });
  cnv.addEventListener('pointerleave', () => { if (!B.painting) { tileMark.visible = false; if (B.preview) B.preview.visible = false; rangeMark.visible = false; } });
  cnv.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKey);
}

function tileFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, S.camera);
  if (!ray.ray.intersectPlane(plane, hit)) return null;
  const t = worldToTile(hit.x, hit.z);
  return inPlot(t.x, t.z) ? t : null;
}

export function setTool(tool) {
  B.tool = tool; B.rot = tool && tool.rot != null ? tool.rot : B.rot;
  if (B.preview) { S.scene.remove(B.preview); B.preview = null; }
  rangeMark.visible = false; tileMark.visible = false;
  const roadMode = tool && (tool.cat === 'road' || tool.cat === 'bulldoze');
  S.controls.mouseButtons.LEFT = roadMode ? -1 : THREE.MOUSE.ROTATE;
  S.controls.touches.ONE = roadMode ? -1 : THREE.TOUCH.ROTATE;
  if (W.gridLines) W.gridLines.visible = !!tool && S.profile.settings.grid;
  if (!tool) { UI.buildHint(null); UI.refreshBuildBar(); return; }
  let p = null;
  if (tool.cat === 'tower' || tool.cat === 'move') {
    const def = tool.cat === 'move' ? tool.tower.def : TOWER_BY_ID[tool.id];
    p = makeTowerModel(def, tool.cat === 'move' ? tool.tower.level : 0).group;
  } else if (tool.cat === 'deco') {
    p = makeDeco(DECO_BY_ID[tool.id].kind, S.biome).group;
  } else if (tool.cat === 'road') {
    const st = ROAD_BY_ID[tool.id];
    p = new THREE.Group(); p.add(new THREE.Mesh(G.box(st.width, 0.12, st.width), okMat));
    p.children[0].position.y = 0.07;
  }
  if (p) {
    p.traverse((o) => { if (o.isMesh) { o.material = okMat; o.castShadow = false; } });
    p.visible = false; S.scene.add(p); B.preview = p;
  }
  UI.refreshBuildBar();
}

function updatePreview(t) {
  B.hover = t;
  if (!B.tool || !t) { tileMark.visible = false; if (B.preview) B.preview.visible = false; rangeMark.visible = false; return; }
  const w = tileToWorld(t.x, t.z);
  const chk = checkPlace(B.tool, t.x, t.z);
  const m = chk.ok ? okMat : badMat;
  tileMark.visible = true; tileMark.position.set(w.x, 0.16, w.z);
  tileMark.material.color.set(chk.ok ? '#4ade80' : '#ef4444');
  if (B.preview) {
    B.preview.visible = true; B.preview.position.set(w.x, 0, w.z);
    B.preview.rotation.y = (B.tool.cat === 'road' ? 0 : B.rot) * Math.PI / 2;
    B.preview.traverse((o) => { if (o.isMesh) o.material = m; });
  }
  const def = B.tool.cat === 'tower' ? TOWER_BY_ID[B.tool.id] : B.tool.cat === 'move' ? B.tool.tower.def : null;
  if (def && def.range) {
    const r = towerStats(def, B.tool.cat === 'move' ? B.tool.tower.level : 0).range * TILE;
    rangeMark.visible = true; rangeMark.position.set(w.x, 0.18, w.z); rangeMark.scale.set(r, 1, r);
    rangeMark.children.forEach((c) => c.material.color.set(chk.ok ? '#ffffff' : '#ef4444'));
  } else rangeMark.visible = false;
  UI.buildHint(chk.ok ? null : chk.msg);
}

function doPlace(t) {
  if (!t || !B.tool) return;
  const res = applyTool(B.tool, t.x, t.z, B.rot);
  if (res.ok && B.touch) { UI.buildHint(null); tileMark.visible = false; if (B.preview) B.preview.visible = false; rangeMark.visible = false; if (B.tool.cat === 'move') { const tw = B.tool.tower; setTool(null); select(tw); } return; }
  if (!res.ok) { Sound.play('error'); UI.toast('🚫 ' + res.msg, '', 'warn', 1600); }
  else if (B.tool.cat === 'move') { const tw = B.tool.tower; setTool(null); select(tw); }
  updatePreview(t);
}

function onDown(e) {
  if (S.state !== 'play') return;
  B.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  B.touch = e.pointerType !== 'mouse';
  if (B.pointers.size > 1) { B.painting = false; B.down = null; return; }
  if (e.button !== undefined && e.button !== 0) return;
  B.down = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (B.tool && (B.tool.cat === 'road' || B.tool.cat === 'bulldoze')) {
    B.painting = true;
    const t = tileFromEvent(e);
    if (t) { B.lastPaint = t.x + ',' + t.z; doPlace(t); }
  }
}
function onMove(e) {
  if (S.state !== 'play') return;
  if (B.pointers.has(e.pointerId)) B.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const t = tileFromEvent(e);
  updatePreview(t);
  if (B.painting && t && B.pointers.size <= 1) {
    const k = t.x + ',' + t.z;
    if (k !== B.lastPaint) { B.lastPaint = k; doPlace(t); }
  }
}
function onUp(e) {
  const was = B.pointers.has(e.pointerId);
  B.pointers.delete(e.pointerId);
  if (S.state !== 'play' || !was) return;
  const wasPainting = B.painting; B.painting = false; B.lastPaint = null;
  const d = B.down; B.down = null;
  if (!d || wasPainting || e.target !== canvas) return;
  const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
  if (moved > 10 || performance.now() - d.t > 600) return;
  const t = tileFromEvent(e);
  if (B.tool) { updatePreview(t); doPlace(t); return; }
  // Auswahl
  if (!t) { select(null); return; }
  const c = S.grid.get(t.x, t.z);
  if (c && c.type === 'tower') select(c.ref); else select(null);
}

export function select(t) {
  S.selected = t;
  if (t && t.def.range) {
    const r = t.stats.range * TILE;
    selRange.visible = true; selRange.position.set(t.pos.x, 0.19, t.pos.z); selRange.scale.set(r, 1, r);
  } else selRange.visible = false;
  if (t) Sound.play('click');
  UI.showTowerPanel(t);
}
export function refreshSelection() { if (S.selected) select(S.selected); }

export function rotate() { B.rot = (B.rot + 1) % 4; Sound.play('click'); if (B.hover) updatePreview(B.hover); else if (S.selected && !B.tool) { S.selected.setRotation((S.selected.rot + 1) % 4); } }

function onKey(e) {
  if (S.state !== 'play' || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'r') rotate();
  else if (k === 'escape') { if (B.tool) setTool(null); else if (S.selected) select(null); else UI.togglePause(); }
  else if (k === 'b') setTool({ cat: 'bulldoze' });
  else if (k === ' ') { e.preventDefault(); UI.waveButton(); }
  else if (k === 'u' && S.selected) UI.doUpgrade();
  else if ((k === 'delete' || k === 'backspace') && S.selected) UI.doSell();
  else if (k === 'f') UI.cycleSpeed();
  else if (k === 'q' || k === 'e') UI.camRotate(k === 'q' ? -1 : 1);
  else if (k === 'w' || k === 'a' || k === 's' || k === 'd' || k.startsWith('arrow')) UI.camPan(k);
  else if (k >= '1' && k <= '9') UI.quickSelect(+k - 1);
}
