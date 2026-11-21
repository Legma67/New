// Grundstücke, Bauaktionen, Rundenverwaltung, Hauptmenü-Demo
import * as THREE from 'three';
import { S } from './state.js';
import { N, TILE, SPAWN, GOAL, MODES, MAX_LEVEL, tileToWorld } from './config.js';
import { Grid } from './grid.js';
import { TOWER_BY_ID } from './data/towers.js';
import { ROAD_BY_ID, DECO_BY_ID, BIOME_BY_ID } from './data/world.js';
import { ENEMIES } from './data/enemies.js';
import { Tower, recomputeBuffs } from './towers.js';
import { makeDeco } from './models.js';
import { pathToPoints, repathEnemies, clearEnemies, spawnEnemy } from './enemies.js';
import { clearProjectiles } from './combat.js';
import { W, buildWorld, renderRoadTile, renderRoadAround, clearRoadMeshes, updateArrows, updateSigns, updateBoard } from './world.js';
import { spend, canAfford, addCoins, stat, statMax, checkAchievements, scheduleSave, saveNow, towerUnlocked } from './profile.js';
import { FX } from './effects.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';

// Standard-Route: Schlangenlinie vom Portal zum Kern
export function defaultRoads(style = 'r_stone') {
  const cells = [];
  const line = (x0, z0, x1, z1) => {
    const dx = Math.sign(x1 - x0), dz = Math.sign(z1 - z0);
    let x = x0, z = z0; cells.push([x, z, style]);
    while (x !== x1 || z !== z1) { x += dx; z += dz; cells.push([x, z, style]); }
  };
  line(1, 11, 6, 11); line(6, 11, 6, 5); line(6, 5, 14, 5); line(14, 5, 14, 15); line(14, 15, 20, 15); line(20, 15, 20, 10);
  const seen = new Set();
  return cells.filter(([x, z]) => { const k = x + ',' + z; if (seen.has(k)) return false; seen.add(k); return true; });
}
function demoPlot() {
  return {
    roads: defaultRoads('r_stone'),
    towers: [
      { id: 'archer', x: 4, z: 9, l: 2 }, { id: 'cannon', x: 8, z: 7, l: 3 }, { id: 'ice', x: 12, z: 7, l: 2 },
      { id: 'laser', x: 16, z: 13, l: 4 }, { id: 'rocket', x: 12, z: 12, l: 3 }, { id: 'fire', x: 15, z: 17, l: 2 },
      { id: 'magic', x: 9, z: 3, l: 5 }, { id: 'lightning', x: 18, z: 12, l: 3 }, { id: 'crystal', x: 4, z: 13, l: 4 },
      { id: 'dragon', x: 16, z: 3, l: 5 }, { id: 'gold', x: 10, z: 8, l: 1 },
    ],
    decos: [['d_tree', 2, 3, 0], ['d_tree', 3, 18, 0], ['d_house', 9, 17, 0], ['d_fountain', 11, 10, 0], ['d_lantern', 7, 12, 0], ['d_lantern', 13, 4, 0], ['d_flowers', 5, 6, 0], ['d_flowers', 17, 7, 0], ['d_statue', 18, 19, 0], ['d_bush', 1, 7, 0], ['d_windmill', 2, 16, 0]],
  };
}

export function serializePlot() {
  const roads = [], towers = [], decos = [];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const c = S.grid.get(x, z);
    if (c.type === 'road') roads.push([x, z, c.style]);
    if (c.type === 'deco') decos.push([c.ref.id, x, z, c.ref.rot]);
  }
  for (const t of S.towers) towers.push({ id: t.def.id, x: t.tx, z: t.tz, l: t.level, r: t.rot, s: t.spent, t: t.targetMode });
  return { roads, towers, decos };
}
export function savePlot() { if (S.demo) return; S.profile.plots[S.plotKey] = serializePlot(); scheduleSave(); }

function clearPlot() {
  for (const t of S.towers) t.remove();
  for (const d of S.decos) W.env.remove(d.M.group);
  S.towers = []; S.decos = [];
  clearEnemies(); clearProjectiles(); clearRoadMeshes();
  S.selected = null;
}

export function loadPlot(data) {
  clearPlot();
  S.grid = new Grid();
  const g = S.grid;
  g.get(SPAWN.x, SPAWN.z).style = 'r_stone'; g.get(GOAL.x, GOAL.z).style = 'r_stone';
  for (const [x, z, st] of data.roads || []) { const c = g.get(x, z); if (c && c.type === 'empty') { c.type = 'road'; c.style = ROAD_BY_ID[st] ? st : 'r_stone'; } }
  for (const o of data.towers || []) {
    const def = TOWER_BY_ID[o.id]; const c = g.get(o.x, o.z);
    if (!def || !c || c.type !== 'empty') continue;
    const t = new Tower(def, o.x, o.z, { level: Math.min(MAX_LEVEL, o.l || 0), rot: o.r || 0, spent: o.s, target: o.t, instant: true });
    c.type = 'tower'; c.ref = t; S.towers.push(t);
  }
  for (const [id, x, z, r] of data.decos || []) addDecoAt(id, x, z, r || 0, true);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) renderRoadTile(x, z);
  recomputeBuffs();
  recomputePath();
}

function addDecoAt(id, x, z, rot, instant = false) {
  const def = DECO_BY_ID[id]; const c = S.grid.get(x, z);
  if (!def || !c || c.type !== 'empty') return null;
  const M = makeDeco(def.kind, S.biome);
  const w = tileToWorld(x, z);
  M.group.position.set(w.x, 0, w.z); M.group.rotation.y = rot * Math.PI / 2;
  if (!instant) M.group.scale.setScalar(0.01);
  W.env.add(M.group);
  const ref = { id, rot, M, x, z, buildT: instant ? 1 : 0 };
  c.type = 'deco'; c.ref = ref; S.decos.push(ref);
  return ref;
}

export function recomputePath() {
  S.path = S.grid.findPath();
  S.pathPoints = S.path ? pathToPoints(S.path) : [];
  updateArrows(S.path);
}

// ---------------------------------------------------------------- Bauaktionen
const fail = (msg) => ({ ok: false, msg });

export function checkPlace(tool, x, z) {
  const c = S.grid.get(x, z);
  if (!c) return fail('Außerhalb des Grundstücks');
  if (tool.cat === 'bulldoze') {
    if (c.type === 'road') {
      if (S.path && !S.grid.findPath(SPAWN, { x, z })) return fail('Der Weg zum Kern muss bestehen bleiben!');
      return { ok: true };
    }
    if (c.type === 'deco' || c.type === 'tower') return { ok: true };
    return fail('Hier gibt es nichts abzureißen');
  }
  if (tool.cat === 'move') { if (c.type !== 'empty') return fail('Feld ist belegt'); return { ok: true }; }
  if (c.type !== 'empty') return fail(c.type === 'spawn' ? 'Das ist das Portal' : c.type === 'goal' ? 'Das ist dein Kern' : 'Feld ist belegt');
  let cost = 0;
  if (tool.cat === 'road') cost = ROAD_BY_ID[tool.id].cost;
  if (tool.cat === 'tower') { if (!towerUnlocked(tool.id)) return fail('Turm noch gesperrt'); cost = TOWER_BY_ID[tool.id].cost; }
  if (tool.cat === 'deco') cost = DECO_BY_ID[tool.id].cost;
  if (!canAfford(cost)) return fail('Nicht genug Münzen');
  // Türme/Deko auf einem Gegner? egal (Gegner laufen auf Straßen)
  return { ok: true, cost };
}

export function applyTool(tool, x, z, rot = 0) {
  const chk = checkPlace(tool, x, z);
  if (!chk.ok) return chk;
  const c = S.grid.get(x, z);
  const w = tileToWorld(x, z);
  switch (tool.cat) {
    case 'road': {
      spend(chk.cost);
      c.type = 'road'; c.style = tool.id;
      renderRoadAround(x, z);
      recomputePath(); repathEnemies();
      stat('roadsBuilt'); Sound.play('road');
      FX.smokePuff(w.x, 0.2, w.z, '#d6d3d1', 3, 0.4);
      break;
    }
    case 'tower': {
      spend(chk.cost);
      const def = TOWER_BY_ID[tool.id];
      const t = new Tower(def, x, z, { rot, spent: S.run && S.run.creative ? 0 : def.cost });
      c.type = 'tower'; c.ref = t; S.towers.push(t);
      recomputeBuffs();
      stat('towersBuilt');
      if (def.rarity === 'Legendary') stat('legendaryBuilt');
      if (def.rarity === 'Mythic') stat('mythicBuilt');
      if (def.rarity === 'Secret') stat('secretBuilt');
      Sound.play('place'); FX.smokePuff(w.x, 0.2, w.z, '#e7e5e4', 8, 0.7); FX.ring(w.x, 0.1, w.z, '#ffffff', 1.8, 0.4);
      checkAchievements();
      break;
    }
    case 'deco': {
      spend(chk.cost);
      addDecoAt(tool.id, x, z, rot);
      stat('decoBuilt'); Sound.play('place'); FX.smokePuff(w.x, 0.2, w.z, '#e7e5e4', 5, 0.5);
      checkAchievements();
      break;
    }
    case 'bulldoze': {
      if (c.type === 'road') {
        const refund = Math.round((ROAD_BY_ID[c.style]?.cost || 10) * 0.5);
        c.type = 'empty'; c.style = null; renderRoadAround(x, z);
        recomputePath(); repathEnemies(); addCoins(refund, false);
        Sound.play('sell'); FX.smokePuff(w.x, 0.2, w.z, '#a8a29e', 4, 0.5);
      } else if (c.type === 'deco') {
        const ref = c.ref; W.env.remove(ref.M.group); S.decos = S.decos.filter((d) => d !== ref);
        addCoins(Math.round(DECO_BY_ID[ref.id].cost * 0.5), false);
        c.type = 'empty'; c.ref = null; Sound.play('sell'); FX.smokePuff(w.x, 0.2, w.z, '#a8a29e', 5, 0.5);
      } else if (c.type === 'tower') { sellTower(c.ref); }
      break;
    }
    case 'move': {
      const t = tool.tower; const old = S.grid.get(t.tx, t.tz);
      old.type = 'empty'; old.ref = null;
      t.moveTo(x, z); t.setRotation(rot); c.type = 'tower'; c.ref = t;
      recomputeBuffs(); Sound.play('place'); FX.smokePuff(w.x, 0.2, w.z, '#e7e5e4', 6, 0.6);
      break;
    }
  }
  savePlot();
  return { ok: true };
}

export function sellTower(t) {
  const c = S.grid.get(t.tx, t.tz);
  const v = S.run && S.run.creative ? 0 : t.sellValue;
  addCoins(v, false);
  t.remove(); S.towers = S.towers.filter((q) => q !== t);
  c.type = 'empty'; c.ref = null;
  recomputeBuffs(); stat('sold'); checkAchievements();
  FX.burst(t.pos.x, 1, t.pos.z, ['#ffd23f', '#fff7cc'], 16, 3, 0.25, 0.6, 5);
  Sound.play('sell');
  if (S.selected === t) S.selected = null;
  savePlot();
  return v;
}

export function upgradeTower(t) {
  if (t.level >= MAX_LEVEL) return fail('Maximale Stufe erreicht');
  const cost = t.upgradeCost;
  if (!canAfford(cost)) { Sound.play('error'); return fail('Nicht genug Münzen'); }
  spend(cost);
  if (!(S.run && S.run.creative)) t.spent += cost;
  t.upgrade(); recomputeBuffs();
  stat('upgrades'); if (t.level >= MAX_LEVEL) stat('maxLevelTowers');
  Sound.play('upgrade'); checkAchievements(); savePlot();
  return { ok: true };
}

// ---------------------------------------------------------------- Runden
export function plotKeyFor(mode, biome) { return (mode === 'creative' ? 'creative_' : '') + biome; }

export function startRun(modeId, biomeId, cont = false) {
  const modeDef = MODES[modeId];
  S.demo = false; S.state = 'play'; S.speed = 1; S.paused = false;
  if (!W.biome || W.biome.id !== biomeId) buildWorld(biomeId);
  S.plotKey = plotKeyFor(modeId, biomeId);
  const data = S.profile.plots[S.plotKey] || { roads: defaultRoads(), towers: [], decos: [] };
  loadPlot(data);
  savePlot();
  const saved = cont ? S.profile.runs[S.plotKey] : null;
  S.run = {
    mode: modeId, modeDef, biome: biomeId, biomeDef: BIOME_BY_ID[biomeId], creative: !!modeDef.creative,
    wave: saved ? saved.wave : 0, lives: saved ? saved.lives : modeDef.lives, maxLives: modeDef.lives,
    active: false, queue: [], spawnT: 0, pending: 0, waveTotal: 0, autoT: -1,
    kills: 0, coinsEarned: 0, bosses: 0, leaks: {}, startTime: performance.now(), over: false, won: false, lostLife: false,
    hpMul: 1, spdMul: 1, bossMul: 1, rewardMul: modeDef.reward,
  };
  if (!cont) delete S.profile.runs[S.plotKey];
  if (!modeDef.creative) {
    stat('runs');
    S.profile.biomes[biomeId] = true; statMax('biomesPlayed', Object.keys(S.profile.biomes).length);
  }
  checkAchievements(); saveNow();
  S.controls.enabled = true; S.controls.autoRotate = false;
  UI.enterGame();
  Sound.setTrack('build');
  updateSigns(S.profile.name, `Rekord: Welle ${S.profile.stats.bestWave}`);
}

export function enterMenu() {
  S.state = 'menu'; S.run = null; S.demo = true; S.paused = false; S.speed = 1;
  if (!W.biome || W.biome.id !== 'grass') buildWorld('grass');
  const own = S.profile.plots.grass;
  S.plotKey = 'grass';
  loadPlot(own && own.towers.length >= 4 ? own : demoPlot());
  S.controls.enabled = false; S.controls.autoRotate = true; S.controls.autoRotateSpeed = 0.5;
  S.controls.target.set(0, 0, 0);
  S.camera.position.set(0, 30, 42);
  S.demoT = 1;
  Sound.setTrack('menu');
  UI.enterMenu();
}

// Hintergrund-Simulation im Hauptmenü
const demoPool = ENEMIES.filter((e) => e.w <= 20 && e.w < 999).map((e) => e.id);
export function updateDemo(dt) {
  S.demoT -= dt;
  if (S.demoT <= 0 && S.enemies.length < 14 && S.path) {
    S.demoT = 0.9 + Math.random() * 0.8;
    spawnEnemy(demoPool[(Math.random() * demoPool.length) | 0], { hpMul: 2.5 });
  }
}

export function updateDecos(dt) {
  for (const d of S.decos) {
    if (d.buildT < 1) { d.buildT = Math.min(1, d.buildT + dt * 3); const k = d.buildT; d.M.group.scale.setScalar(Math.max(0.01, 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2))); }
    for (const sp of d.M.spinners) sp.o.rotation[sp.axis] += sp.speed * dt;
    if (d.M.fountain && Math.random() < dt * 12) { const p = d.M.group.position; FX.glow.emit(p.x, 1.6, p.z, (Math.random() - 0.5) * 1.2, 2.5, (Math.random() - 0.5) * 1.2, '#bfe9ff', 0.2, 0.8, 6); }
  }
}

export function updateBoardInfo() {
  if (!S.run) return;
  updateBoard(`Welle ${S.run.wave}`, S.run.creative ? 'Kreativ' : `❤ ${S.run.lives}`);
}
