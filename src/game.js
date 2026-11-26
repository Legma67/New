'use strict';
// ============================================================
//  Spielkern: Grundstück, Bauen, Türme, Gegner, Geschosse, Wellen
// ============================================================
const Game = (() => {
  const V3 = THREE.Vector3;
  let scene;
  let grid = [];               // grid[x][z] = null | {type:'road',road} | {type:'tower',t} | {type:'deco',id,rot,mesh}
  let decoMeshes = new Map();
  let route = null;
  let R = null;                // laufende Runde
  let demo = false, demoTimer = 0;
  const towers = [], enemies = [], projectiles = [], mines = [], holes = [], bolts = [], rings = [], drones = [];
  const traps = new Map();
  const zones = [];            // Giftwolken, Lavapfützen, Tornados     // "x,z" -> {def, x, z, mesh, cd}
  let castle = null;
  let ghost = null, ghostKey = '', rangeRing = null, selRing = null;
  let buildSel = null, buildRot = 0;
  let selected = null;
  let shake = 0;
  let lastHoverTile = null;
  let pending = null;   // gewähltes Feld, wartet auf ✓
  const CONFIRM_KINDS = ['tower', 'move', 'deco'];
  const ui = {}; // Callbacks zur UI

  // ---------------- Hilfen ----------------
  const inPlot = (x, z) => x >= 0 && z >= 0 && x < GW && z < GH;
  const worldToTile = p => p ? { x: Math.floor(p.x + GW / 2), z: Math.floor(p.z + GH / 2) } : null;
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
  const fxTint = () => EFFECTS.find(e => e.id === Save.P.equipped.effect);
  const skin = () => ROAD_SKINS.find(s => s.id === Save.P.equipped.skin);
  function rarityColor(def) { return RARITIES[def.rarity].color; }

  // ---------------- Init / Grundstück ----------------
  function init() {
    scene = World.scene;
    rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    rangeRing.rotation.x = -Math.PI / 2; rangeRing.position.y = 0.06; rangeRing.visible = false; scene.add(rangeRing);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false }));
    disc.rotation.x = 0; rangeRing.add(disc); rangeRing.userData.disc = disc;
    selRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 6), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    selRing.rotation.x = -Math.PI / 2; selRing.position.y = 0.2; selRing.visible = false; scene.add(selRing);
  }

  function loadLayout() {
    grid = Array.from({ length: GW }, () => Array(GH).fill(null));
    for (const m of decoMeshes.values()) scene.remove(m);
    decoMeshes.clear();
    const L = Save.P.layout;
    for (const [x, z, id] of L.roads) if (inPlot(x, z)) grid[x][z] = { type: 'road', road: ROAD_BY_ID[id] ? id : 'road_stone' };
    grid[SPAWN.x][SPAWN.z] = grid[SPAWN.x][SPAWN.z] || { type: 'road', road: 'road_stone' };
    grid[GOAL.x][GOAL.z] = grid[GOAL.x][GOAL.z] || { type: 'road', road: 'road_stone' };
    for (const [x, z, id, rot] of L.decos) if (inPlot(x, z) && !grid[x][z] && DECO_BY_ID[id]) { grid[x][z] = { type: 'deco', id, rot: rot || 0 }; addDecoMesh(x, z); }
    World.rebuildRoads(grid, skin());
    recalcRoute();
  }
  function saveLayout() {
    const roads = [], decos = [];
    for (let x = 0; x < GW; x++) for (let z = 0; z < GH; z++) {
      const c = grid[x][z]; if (!c) continue;
      if (c.type === 'road') roads.push([x, z, c.road]);
      else if (c.type === 'deco') decos.push([x, z, c.id, c.rot]);
    }
    Save.P.layout = { roads, decos }; Save.saveSoon();
  }
  function addDecoMesh(x, z, animate) {
    const c = grid[x][z];
    const m = Models.makeDeco(c.id, World.biome);
    m.position.copy(tileToWorld(x, z)); m.rotation.y = c.rot * Math.PI / 2;
    if (animate) popIn(m);
    scene.add(m); decoMeshes.set(x + ',' + z, m);
  }
  let castleBar = null, castleBarKey = '';
  function updateCastleBar(time) {
    if (!castle || !R || demo) { if (castleBar) castleBar.visible = false; return; }
    if (!castleBar) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 48;
      castleBar = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false }));
      castleBar.userData.c = c; castleBar.scale.set(2.2, 0.42, 1); scene.add(castleBar);
    }
    castleBar.visible = true;
    castleBar.position.set(castle.position.x, 3.6, castle.position.z);
    const f = Math.max(0, Math.min(1, R.lives / R.maxLives)), key = R.lives + '/' + R.maxLives;
    if (key !== castleBarKey) {
      castleBarKey = key;
      const c = castleBar.userData.c, g2 = c.getContext('2d');
      g2.clearRect(0, 0, 256, 48);
      const rr = (x, y, w, h, r) => { g2.beginPath(); if (g2.roundRect) g2.roundRect(x, y, w, h, r); else g2.rect(x, y, w, h); g2.fill(); };
      g2.fillStyle = 'rgba(15,20,40,0.85)'; rr(2, 2, 252, 44, 14);
      g2.fillStyle = f > 0.5 ? '#4cd964' : f > 0.25 ? '#ffcc33' : '#ff3b30'; if (f > 0) rr(8, 8, 240 * f, 32, 10);
      g2.fillStyle = '#fff'; g2.font = 'bold 26px system-ui,sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.fillText('❤ ' + R.lives + ' / ' + R.maxLives, 128, 25);
      castleBar.material.map.needsUpdate = true;
    }
    // Rauch & Feuer, wenn die Burg schwer beschädigt ist
    if (f < 0.5 && Math.random() < 0.25) Particles.emit(castle.position.x + (Math.random() - 0.5), 1.6, castle.position.z + (Math.random() - 0.5), 1, '#555555', { speed: 0.2, up: 1.2, life: 1.6, size: 0.6, gravity: -0.6, tint: false });
    if (f < 0.25 && Math.random() < 0.3) Particles.emit(castle.position.x + (Math.random() - 0.5) * 0.8, 1.2, castle.position.z + (Math.random() - 0.5) * 0.8, 1, '#ff7a00', { speed: 0.2, up: 1, life: 0.6, size: 0.4, gravity: -0.8 });
  }
  function placeCastle() {
    if (castle) scene.remove(castle);
    castle = Models.makeCastle(CASTLES.find(c => c.id === Save.P.equipped.castle) || CASTLES[0]);
    castle.position.copy(World.castlePos); castle.rotation.y = -Math.PI / 2; castle.scale.setScalar(1.25);
    scene.add(castle);
  }
  function recalcRoute() {
    const p = World.findPath(grid);
    route = p ? World.buildRoute(p) : null;
    World.showArrows(route);
    ui.routeChanged && ui.routeChanged(!!route);
    return route;
  }

  const pops = [];
  function popIn(m) { m.scale.setScalar(0.01); pops.push({ m, t: 0, s: m.userData.baseScale || 1 }); }

  // ---------------- Runde starten ----------------
  function newRun(modeId, biomeId, snapshot) {
    clearEntities();
    demo = false;
    const mode = MODE_BY_ID[modeId];
    const P = Save.P;
    R = {
      mode, biome: biomeId, wave: 0, phase: 'build',
      coins: 100 + 100 * (P.boosts.boost_coins || 0),
      lives: mode.lives + (mode.creative ? 0 : 2 * (P.boosts.boost_lives || 0)),
      maxLives: 0, speed: 1, paused: false, over: false, won: false,
      waves: new Map(),           // welle -> {queue, alive, leaked, total}
      spawnQueue: [], spawnTimer: 0, pauseTimer: 0,
      stats: { kills: 0, coins: 0, bosses: 0, time: 0, towers: 0 },
      boss: null, healTimer: 0, tutorial: !P.tutorialDone, hold: false,
    };
    R.maxLives = R.lives;
    if (snapshot) {
      Object.assign(R, { wave: snapshot.wave, coins: snapshot.coins, lives: snapshot.lives, maxLives: snapshot.maxLives || snapshot.lives, stats: snapshot.stats });
    }
    loadLayout(); placeCastle();
    if (snapshot) for (const t of snapshot.towers) { const pl = t.plus || 0; if (!TOWER_BY_ID[t.id] || available('tower', t.id, pl) <= 0 || grid[t.x][t.z]) continue; const tw = spawnTower(TOWER_BY_ID[t.id], t.x, t.z, t.rot, false, pl); tw.targeting = t.targeting || 'first'; tw.kills = t.kills || 0; }
    if (snapshot && snapshot.traps) for (const [id, x, z] of snapshot.traps) if (TRAP_BY_ID[id] && available('trap', id) > 0 && grid[x][z] && grid[x][z].type === 'road') spawnTrap(TRAP_BY_ID[id], x, z, false);
    if (!snapshot) { Save.addStat('gamesPlayed'); }
    R.pauseTimer = 0; // Wellen starten nur, wenn der Spieler auf den Knopf drückt
    World.setBuildOverlay(true);
    Audio2.setMood('build');
    snapshotRun();
    ui.hud && ui.hud();
  }
  function snapshotRun() {
    // Nur in der Bauphase speichern – so wird eine abgebrochene Welle beim Fortsetzen sauber neu gestartet
    if (!R || demo || R.over || R.phase !== 'build') return;
    Save.P.run = {
      mode: R.mode.id, biome: R.biome, wave: R.wave, coins: R.coins, lives: R.lives, maxLives: R.maxLives, stats: R.stats,
      towers: towers.map(t => ({ id: t.def.id, x: t.x, z: t.z, plus: t.plus, rot: t.rot, targeting: t.targeting, kills: t.kills })),
      traps: [...traps.values()].map(t => [t.def.id, t.x, t.z]),
    };
    Save.saveSoon();
  }
  function clearEntities() {
    for (const f of floats) f.el.remove(); floats.length = 0;
    for (const t of towers) removeTowerMesh(t);
    towers.length = 0;
    for (const e of enemies) scene.remove(e.mesh);
    enemies.length = 0;
    for (const p of projectiles) p.mesh.visible = false;
    projectiles.length = 0;
    for (const m of mines) scene.remove(m.mesh); mines.length = 0;
    for (const h of holes) scene.remove(h.mesh); holes.length = 0;
    for (const b of bolts) scene.remove(b.mesh); bolts.length = 0;
    for (const r of rings) scene.remove(r.mesh); rings.length = 0;
    for (const c of pickups) scene.remove(c.mesh); pickups.length = 0;
    for (const t of traps.values()) scene.remove(t.mesh); traps.clear();
    for (const z of zones) scene.remove(z.mesh); zones.length = 0;
    Particles.clear();
    if (grid.length) for (let x = 0; x < GW; x++) for (let z = 0; z < GH; z++) if (grid[x][z] && grid[x][z].type === 'tower') grid[x][z] = null;
    select(null); setBuild(null);
  }

  // ---------------- Demo fürs Hauptmenü ----------------
  function startDemo() {
    R = { mode: MODES[0], biome: Save.P.equipped.biome, wave: 8, phase: 'wave', coins: 0, lives: 999, maxLives: 999, speed: 1, paused: false, waves: new Map(), spawnQueue: [], spawnTimer: 0, stats: { kills: 0, coins: 0, bosses: 0, time: 0 }, healTimer: 0 };
    clearEntities();
    demo = true;
    loadLayout(); placeCastle();
    if (!route) return;
    // Türme entlang der Strecke aufstellen (nur Deko, nicht gespeichert)
    const ids = ['crossbow', 'cannon', 'ice', 'laser', 'fire', 'tesla', 'magic', 'rocket', 'crystal', 'plasma', 'gatling', 'meteor'];
    let k = 0;
    for (let i = 2; i < route.tiles.length - 1 && k < ids.length; i += 3) {
      const [x, z] = route.tiles[i];
      for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = x + dx, nz = z + dz;
        if (inPlot(nx, nz) && !grid[nx][nz]) { spawnTower(TOWER_BY_ID[ids[k]], nx, nz, 0, false, (k * 2) % 10); k++; break; }
      }
    }
    World.setBuildOverlay(false);
  }
  function demoSpawn(dt) {
    demoTimer -= dt;
    if (demoTimer <= 0 && route && enemies.length < 25) {
      demoTimer = 0.9;
      const pool = ENEMIES.filter(e => !e.boss && e.w > 0);
      spawnEnemy(pool[Math.floor(Math.random() * pool.length)], 0, 1.2);
      if (Math.random() < 0.04) spawnEnemy(ENEMY_BY_ID[BOSS_ORDER[Math.floor(Math.random() * 5)]], 0, 0.08);
    }
  }

  // ---------------- Bauen ----------------
  function setBuild(sel) {
    buildSel = sel; pending = null; ui.pendingChanged && ui.pendingChanged(null);
    if (ghost) { scene.remove(ghost); ghost = null; ghostKey = ''; }
    rangeRing.visible = false;
    if (sel) select(null);
    World.setBuildOverlay(!!sel || (R && R.phase === 'build'));
    updateTileOverlay();
    ui.buildChanged && ui.buildChanged(sel);
  }
  // Freie Felder für die aktuelle Bauauswahl hervorheben
  function updateTileOverlay() {
    const sel = buildSel;
    if (!sel || demo || !grid.length) { World.showTiles(null); return; }
    const list = [];
    for (let x = 0; x < GW; x++) for (let z = 0; z < GH; z++) {
      const c = grid[x][z];
      if (sel.kind === 'tower' || sel.kind === 'deco' || sel.kind === 'move') { if (!c) list.push([x, z]); }
      else if (sel.kind === 'trap') { if (c && c.type === 'road' && !traps.has(x + ',' + z) && !((x === SPAWN.x && z === SPAWN.z) || (x === GOAL.x && z === GOAL.z))) list.push([x, z]); }
    }
    World.showTiles(list, sel.kind === 'trap' ? 0xffb347 : 0xffffff);
  }
  function rotateBuild() { buildRot = (buildRot + 1) % 4; if (ghost) ghost.rotation.y = buildRot * Math.PI / 2; Audio2.play('click'); }

  function canPlace(sel, x, z) {
    if (!inPlot(x, z)) return { ok: false, why: 'Außerhalb des Grundstücks' };
    const c = grid[x][z];
    const isFixed = (x === SPAWN.x && z === SPAWN.z) || (x === GOAL.x && z === GOAL.z);
    const creative = R && R.mode.creative;
    if (sel.kind === 'road') {
      if (R && R.phase === 'wave') return { ok: false, why: 'Wege nur in der Pause zwischen den Wellen ändern' };
      if (c && c.type === 'road' && c.road === sel.id) return { ok: false, why: 'Hier ist schon dieser Weg' };
      if (c && c.type !== 'road') return { ok: false, why: 'Feld ist belegt' };
      if (isFixed && c) return { ok: false, why: 'Start/Ziel-Feld' };
      if (!c && Save.P.roadPieces <= 0) return { ok: false, why: 'Keine Wegstücke mehr – kaufe welche oder besiege Bosse' };
      return { ok: true };
    }
    if (sel.kind === 'trap') {
      if (!c || c.type !== 'road') return { ok: false, why: 'Fallen nur auf den Weg legen' };
      if (isFixed) return { ok: false, why: 'Nicht auf Start/Ziel' };
      if (traps.has(x + ',' + z)) return { ok: false, why: 'Hier liegt schon eine Falle' };
      if (available('trap', sel.id) <= 0) return { ok: false, why: 'Keine Falle dieser Art mehr übrig' };
      return { ok: true };
    }
    if (sel.kind === 'erase') {
      if (!c) return { ok: false, why: 'Nichts zum Entfernen' };
      if (c.type === 'tower') return { ok: false, why: 'Türme bitte antippen und AUFHEBEN' };
      if (c.type === 'tower') return { ok: false, why: 'Türme bitte antippen und AUFHEBEN' };
      if (c.type === 'road' && traps.has(x + ',' + z)) return { ok: true };
      if (c.type === 'road') {
        if (isFixed) return { ok: false, why: 'Start- und Zielfeld sind fest' };
        if (R && R.phase === 'wave') return { ok: false, why: 'Wege nur in der Pause zwischen den Wellen ändern' };
        if (!World.findPath(grid, { x, z })) return { ok: false, why: 'Kein Weg mehr zum Ziel – nicht erlaubt!' };
      }
      return { ok: true };
    }
    if (c) return { ok: false, why: c.type === 'road' ? 'Nicht auf die Straße bauen' : 'Feld ist belegt' };
    if (sel.kind === 'tower') {
      if (available('tower', sel.id, sel.plus || 0) <= 0) return { ok: false, why: 'Du hast keinen weiteren Turm dieser Art' };
      return { ok: true };
    }
    if (sel.kind === 'deco') {
      const d = DECO_BY_ID[sel.id];
      if (!creative && R.coins < d.cost) return { ok: false, why: 'Nicht genug Münzen' };
      return { ok: true };
    }
    if (sel.kind === 'move') return { ok: true };
    return { ok: false };
  }

  function makeGhost(sel) {
    let g;
    if (sel.kind === 'tower' || sel.kind === 'move') {
      const def = sel.kind === 'move' ? sel.tower.def : TOWER_BY_ID[sel.id];
      g = Models.makeTower(def, rarityColor(def));
    } else if (sel.kind === 'deco') g = Models.makeDeco(sel.id, World.biome);
    else if (sel.kind === 'trap') g = Models.makeTrap(TRAP_BY_ID[sel.id]);
    else {
      g = new THREE.Group();
      Models.mesh(Models.box(0.98, 0.08, 0.98), Models.M('#ffffff'), 0, 0.05, 0, g, false);
      if (sel.kind === 'erase') { const x1 = Models.mesh(Models.box(0.9, 0.1, 0.12), Models.M('#ff3030'), 0, 0.12, 0, g, false); x1.rotation.y = Math.PI / 4; const x2 = x1.clone(); x2.rotation.y = -Math.PI / 4; g.add(x2); }
    }
    g.traverse(o => {
      if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: 0x55ff77, transparent: true, opacity: 0.55, depthWrite: false }); o.castShadow = false; }
    });
    g.rotation.y = buildRot * Math.PI / 2;
    return g;
  }
  function hover(p) {
    if (!buildSel) { lastHoverTile = null; return; }
    if (pending) return;   // Vorschau bleibt auf dem gewählten Feld, bis ✓ oder ✕
    const t = worldToTile(p);
    if (!t || !inPlot(t.x, t.z)) { if (ghost) ghost.visible = false; rangeRing.visible = false; return; }
    lastHoverTile = t;
    const key = buildSel.kind + (buildSel.id || '');
    if (!ghost || ghostKey !== key) { if (ghost) scene.remove(ghost); ghost = makeGhost(buildSel); ghostKey = key; scene.add(ghost); }
    ghost.visible = true;
    ghost.position.copy(tileToWorld(t.x, t.z));
    const ok = canPlace(buildSel, t.x, t.z).ok;
    ghost.traverse(o => { if (o.isMesh) o.material.color.set(ok ? 0x55ff77 : 0xff4040); });
    const def = buildSel.kind === 'tower' ? TOWER_BY_ID[buildSel.id] : buildSel.kind === 'move' ? buildSel.tower.def : null;
    if (def && def.range > 0) showRange(ghost.position, buildSel.kind === 'move' ? towerStats(buildSel.tower).range : def.range, ok ? 0x55ff77 : 0xff4040);
    else rangeRing.visible = false;
  }
  function showRange(pos, r, color) {
    rangeRing.visible = true; rangeRing.position.set(pos.x, 0.06, pos.z); rangeRing.scale.setScalar(r);
    rangeRing.material.color.set(color); rangeRing.userData.disc.material.color.set(color);
  }

  let paintLast = null, painted = 0;
  function paintStart(p) { paintLast = null; painted = 0; paint(p); }
  function paint(p) {
    if (!buildSel || (buildSel.kind !== 'road' && buildSel.kind !== 'erase' && buildSel.kind !== 'trap')) return;
    const t = worldToTile(p); if (!t) return;
    const k = t.x + ',' + t.z; if (k === paintLast) return; paintLast = k;
    if (tryPlace(t.x, t.z, true)) painted++;
  }
  function paintEnd(p, wasTap) {
    if (!buildSel) return;
    if (buildSel.kind === 'road' || buildSel.kind === 'erase' || buildSel.kind === 'trap') { if (painted === 0 && wasTap) { const t = worldToTile(p); if (t) tryPlace(t.x, t.z, false); } }
    else if (wasTap) { const t = worldToTile(p); if (t) choose(t.x, t.z); }
    paintLast = null;
  }
  function tap(p) {
    if (buildSel) { const t = worldToTile(p); if (t) { if (CONFIRM_KINDS.includes(buildSel.kind)) choose(t.x, t.z); else tryPlace(t.x, t.z, false); } return; }
    const t = worldToTile(p);
    if (t && inPlot(t.x, t.z) && grid[t.x][t.z] && grid[t.x][t.z].type === 'tower') { select(grid[t.x][t.z].t); Audio2.play('click'); }
    else select(null);
  }

  // Feld wählen – gesetzt wird erst mit ✓
  function choose(x, z) {
    if (!buildSel) return false;
    const chk = canPlace(buildSel, x, z);
    if (!chk.ok) { if (chk.why) { ui.toast && ui.toast(chk.why, 'bad'); Audio2.play('error'); } return false; }
    pending = null; hover(tileToWorld(x, z)); pending = { x, z };
    Audio2.play('click'); ui.pendingChanged && ui.pendingChanged(pending);
    return true;
  }
  function confirmPlace() {
    if (!pending || !buildSel) return false;
    const { x, z } = pending; pending = null;
    const ok = tryPlace(x, z, false);
    ui.pendingChanged && ui.pendingChanged(pending);
    return ok;
  }
  function cancelPending() { if (!pending) return; pending = null; if (ghost) ghost.visible = false; rangeRing.visible = false; ui.pendingChanged && ui.pendingChanged(null); }

  function tryPlace(x, z, silent) {
    const sel = buildSel; if (!sel || demo) return false;
    const chk = canPlace(sel, x, z);
    if (!chk.ok) { if (!silent && chk.why) { ui.toast && ui.toast(chk.why, 'bad'); Audio2.play('error'); } return false; }
    const creative = R.mode.creative;
    const pos = tileToWorld(x, z);
    if (sel.kind === 'road') {
      const old = grid[x][z];
      if (!old) Save.P.roadPieces--;           // neues Feld kostet ein Wegstück, Umfärben ist gratis
      grid[x][z] = { type: 'road', road: sel.id };
      World.rebuildRoads(grid, skin());
      Save.addStat('roadsBuilt'); Audio2.play('road');
      Particles.emit(pos.x, 0.1, pos.z, 8, '#d9c9a0', { speed: 1.2, up: 1, life: 0.4, size: 0.18 });
      recalcRoute(); saveLayout();
    } else if (sel.kind === 'erase') {
      const c = grid[x][z];
      if (c.type === 'road' && traps.has(x + ',' + z)) { removeTrap(x, z); }
      else if (c.type === 'road') { Save.P.roadPieces++; grid[x][z] = null; World.rebuildRoads(grid, skin()); recalcRoute(); }
      else if (c.type === 'deco') { if (!creative) R.coins += Math.floor(DECO_BY_ID[c.id].cost * 0.5); const m = decoMeshes.get(x + ',' + z); scene.remove(m); decoMeshes.delete(x + ',' + z); grid[x][z] = null; }
      Audio2.play('sell'); saveLayout();
      Particles.emit(pos.x, 0.2, pos.z, 12, '#bbbbbb', { speed: 1.5, life: 0.5 });
    } else if (sel.kind === 'tower') {
      const def = TOWER_BY_ID[sel.id];
      spawnTower(def, x, z, buildRot, true, sel.plus || 0);
      ui.tutorialEvent && ui.tutorialEvent('placed', def.id);
      if (available('tower', def.id, sel.plus || 0) <= 0) setBuild(null);
      Save.addStat('towersBuilt'); R.stats.towers = (R.stats.towers || 0) + 1;
      if (RARITIES[def.rarity].order >= 4) Save.addStat('legendaryBuilt');
      Audio2.play('place');
      snapshotRun();
    } else if (sel.kind === 'trap') {
      spawnTrap(TRAP_BY_ID[sel.id], x, z, true);
      Save.addStat('trapsBuilt'); Audio2.play('place'); snapshotRun();
      if (available('trap', sel.id) <= 0) setBuild(null);
    } else if (sel.kind === 'deco') {
      const d = DECO_BY_ID[sel.id];
      if (!creative) R.coins -= d.cost;
      grid[x][z] = { type: 'deco', id: d.id, rot: buildRot };
      addDecoMesh(x, z, true);
      Save.addStat('decoBuilt'); Audio2.play('place'); saveLayout();
      Particles.emit(pos.x, 0.2, pos.z, 14, '#ffffff', { speed: 1.5, life: 0.5 });
    } else if (sel.kind === 'move') {
      const t = sel.tower;
      grid[t.x][t.z] = null; t.x = x; t.z = z; grid[x][z] = { type: 'tower', t };
      t.mesh.position.copy(pos); popIn(t.mesh);
      Particles.emit(pos.x, 0.2, pos.z, 16, '#ffe14d', { speed: 1.6, life: 0.5 });
      Audio2.play('place'); setBuild(null); select(t); snapshotRun();
    }
    updateTileOverlay();
    ui.hud && ui.hud();
    return true;
  }

  // Bestes freies Feld für einen Turm (meiste Wegfelder in Reichweite) – fürs Tutorial
  function bestSpot(range) {
    if (!route) return null;
    let best = null, bv = -1;
    for (let x = 0; x < GW; x++) for (let z = 0; z < GH; z++) {
      if (grid[x][z]) continue;
      const v = route.tiles.filter(([a, b]) => (a - x) ** 2 + (b - z) ** 2 <= range * range).length;
      if (v > bv) { bv = v; best = { x, z }; }
    }
    return best;
  }

  // ---------------- Inventar / Fallen ----------------
  function available(kind, id, pl = 0) {
    if (kind === 'tower') { return Save.inv(id, pl) - towers.filter(t => t.def.id === id && t.plus === pl).length; }
    if (kind === 'trap') { let n = 0; for (const t of traps.values()) if (t.def.id === id) n++; return (Save.P.trapInv[id] || 0) - n; }
    return 0;
  }
  function fuse(id, plus) {
    if (Save.inv(id, plus) < 3 || plus >= MAX_PLUS) return null;
    let removed = 0;
    if (R && !demo) {
      const placed = towers.filter(t => t.def.id === id && t.plus === plus);
      const free = Save.inv(id, plus) - placed.length;
      for (let i = 0; i < Math.max(0, 3 - free); i++) { sell(placed[i], true); removed++; }
    }
    if (!Save.fuseTower(id, plus)) return null;
    Audio2.play('upgrade'); Audio2.play('achievement');
    snapshotRun();
    return { removed };
  }
  function buyRoadPieces(n) {
    const cost = ROAD_PIECE_PRICE * n;
    if (R.coins < cost) { ui.toast && ui.toast('Nicht genug Münzen', 'bad'); Audio2.play('error'); return false; }
    R.coins -= cost; Save.P.roadPieces += n; Save.saveSoon(); Audio2.play('coin');
    ui.toast && ui.toast(`🛣️ +${n} Wegstück${n > 1 ? 'e' : ''}`, 'good');
    return true;
  }
  function spawnTrap(def, x, z, animate) {
    const m = Models.makeTrap(def); m.position.copy(tileToWorld(x, z)); scene.add(m);
    if (animate) { popIn(m); Particles.emit(m.position.x, 0.2, m.position.z, 16, def.color, { speed: 1.5, life: 0.5 }); }
    traps.set(x + ',' + z, { def, x, z, mesh: m, cd: 0, tick: 0 });
  }
  function removeTrap(x, z) { const t = traps.get(x + ',' + z); if (!t) return; scene.remove(t.mesh); traps.delete(x + ',' + z); snapshotRun(); }
  function updateTraps(dt, time) {
    if (!traps.size) return;
    const scale = Math.max(0.5, hpScale(Math.max(1, R.wave)) * R.mode.hp * 0.9);
    for (const tr of traps.values()) {
      const d = tr.def;
      tr.cd = Math.max(0, tr.cd - dt); tr.tick -= dt;
      if (tr.mesh.userData.spin) tr.mesh.userData.spin.rotation.y += dt * 2;
      if (tr.mesh.userData.flame) tr.mesh.userData.flame.scale.y = 1 + Math.sin(time * 15 + tr.x) * 0.25;
      if (tr.mesh.userData.led) tr.mesh.userData.led.visible = tr.cd <= 0 && Math.sin(time * 8) > 0;
      const on = [];
      for (const e of enemies) if (e.alive && !e.fly && Math.abs(e.pos.x - tr.mesh.position.x) < 0.5 && Math.abs(e.pos.z - tr.mesh.position.z) < 0.5) on.push(e);
      if (!on.length) continue;
      if (d.id === 'trap_spike' && tr.tick <= 0) { tr.tick = d.every; for (const e of on) damage(e, d.dmg * scale, 'phys', null); Particles.emit(tr.mesh.position.x, 0.2, tr.mesh.position.z, 4, '#dddddd', { speed: 1, life: 0.3 }); }
      if (d.id === 'trap_glue') for (const e of on) applySlow(e, d.slow, 0.3);
      if (d.id === 'trap_fire') for (const e of on) if (!(e.def.immune && e.def.immune.includes('fire'))) { e.burnDps = Math.max(e.burnT > 0 ? e.burnDps : 0, d.burn * scale); e.burnT = 2.5; }
      if (d.id === 'trap_bomb' && tr.cd <= 0) {
        tr.cd = d.rearm; const p = tr.mesh.position;
        for (const e of enemies) if (e.alive && !e.fly && dist2(e.pos, p) < d.splash * d.splash) damage(e, d.dmg * scale, 'explosive', null);
        Particles.emit(p.x, 0.3, p.z, 30, '#ff8a3a', { speed: 3, up: 2.5, life: 0.5 }); ring(p, d.splash, '#ff8a3a', 0.35); Audio2.play('explosion');
      }
      if (d.id === 'trap_frost' && tr.cd <= 0) { tr.cd = d.rearm; for (const e of on) applyStun(e, d.stun); ring(tr.mesh.position, 0.8, '#bfefff', 0.4); Particles.emit(tr.mesh.position.x, 0.3, tr.mesh.position.z, 20, '#dff8ff', { speed: 2, life: 0.5 }); Audio2.play('shoot_ice'); }
    }
  }

  // ---------------- Türme ----------------
  const plusTex = {};
  function plusLabel(n) {
    if (!plusTex[n]) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 64;
      const g = c.getContext('2d');
      g.font = 'bold 50px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 9; g.strokeStyle = '#1b1b2e'; g.strokeText('+' + n, 64, 34);
      g.fillStyle = PLUS_COLORS[n] || '#fff'; g.fillText('+' + n, 64, 34);
      plusTex[n] = new THREE.CanvasTexture(c); plusTex[n].colorSpace = THREE.SRGBColorSpace;
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: plusTex[n], depthWrite: false }));
    sp.scale.set(1.1, 0.55, 1);
    return sp;
  }
  function spawnTower(def, x, z, rot, animate, plus = 0) {
    const mesh = Models.makeTower(def, rarityColor(def));
    mesh.position.copy(tileToWorld(x, z)); mesh.rotation.y = 0;
    mesh.userData.head.rotation.y = rot * Math.PI / 2;
    Models.applyTowerLevel(mesh, plusVisual(plus));
    if (plus > 0) { const lb = plusLabel(plus); lb.position.y = mesh.userData.topY * mesh.userData.body.scale.y + (plus >= 7 ? 1.05 : 0.8); mesh.add(lb); }
    scene.add(mesh);
    if (animate) { popIn(mesh); Particles.emit(mesh.position.x, 0.3, mesh.position.z, 24, RARITIES[def.rarity].glow, { speed: 2, up: 2, life: 0.7 }); }
    const t = { def, x, z, rot, plus, level: plusVisual(plus), invested: 0, mesh, cd: Math.random() * 0.3, targeting: 'first', kills: 0, dmgDealt: 0, stun: 0,
      buffDmg: 1, buffRate: 1, buffRange: 0, beam: null, beam2: null, drones: [], timer: 0 };
    if (def.type === 'drone') for (let i = 0; i < def.drones + (t.level >= 5 ? 2 : 0); i++) addDrone(t, i);
    grid[x][z] = { type: 'tower', t };
    towers.push(t);
    return t;
  }
  function addDrone(t, i) {
    if (t.def.id === 'phoenix') {
      const b = new THREE.Group();
      Models.mesh(Models.sph(0.12, 10), Models.M('#ff8a1a', { e: '#ff5a00', ei: 1 }), 0, 0, 0, b, false).scale.set(0.8, 0.8, 1.4);
      Models.mesh(Models.sph(0.08, 8), Models.M('#ffd000', { e: '#ffb000', ei: 1 }), 0, 0.05, 0.15, b, false);
      Models.mesh(Models.cone(0.03, 0.08, 4), Models.M('#ffe14d'), 0, 0.05, 0.25, b, false).rotation.x = Math.PI / 2;
      const tail = Models.mesh(Models.cone(0.08, 0.3, 5), Models.M('#ff3b1a', { e: '#ff2a00', ei: 1 }), 0, 0, -0.22, b, false); tail.rotation.x = -Math.PI / 2;
      const wings = [];
      for (const sx of [-1, 1]) { const w = new THREE.Group(); b.add(w); const wm = Models.mesh(Models.geo('phw', () => new THREE.ConeGeometry(0.2, 0.45, 3)), Models.M('#ffb000', { e: '#ff6a00', ei: 0.9, side: 1 }), sx * 0.22, 0, 0, w, false); wm.rotation.z = sx * Math.PI / 2; wm.scale.z = 0.12; wings.push(w); }
      b.position.copy(t.mesh.position).add(new V3(0, 1.5, 0));
      scene.add(b);
      t.drones.push({ mesh: b, phase: i * Math.PI, cd: 0, target: null, bird: wings });
      return;
    }
    const d = new THREE.Group();
    Models.mesh(Models.box(0.16, 0.06, 0.16), Models.M('#d0d6de'), 0, 0, 0, d, false);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) Models.mesh(Models.cyl(0.07, 0.07, 0.01, 8), Models.M('#38c6ff', { e: '#38c6ff', ei: 0.6, o: 0.7 }), x * 0.11, 0.04, z * 0.11, d, false);
    Models.mesh(Models.sph(0.03), Models.M('#ff3040', { e: '#ff3040', ei: 1 }), 0, -0.03, 0.08, d, false);
    d.position.copy(t.mesh.position).add(new V3(0, 1.3, 0));
    scene.add(d);
    t.drones.push({ mesh: d, phase: i * Math.PI, cd: 0, target: null });
  }
  function removeTowerMesh(t) {
    scene.remove(t.mesh);
    if (t.beam) scene.remove(t.beam); if (t.beam2) scene.remove(t.beam2);
    if (t.beams) t.beams.forEach(b => scene.remove(b));
    for (const d of t.drones) scene.remove(d.mesh);
  }
  function towerStats(t) {
    const d = t.def, l = t.level - 1;
    const pl = t.plus || 0, pm = plusDmg(pl);
    const s = {
      dmg: d.dmg * pm * t.buffDmg,
      range: d.range > 0 ? d.range + plusRange(pl) + t.buffRange : 0,
      rate: d.rate * plusRate(pl) * t.buffRate,
      speed: (d.speed || 10) * (1 + 0.08 * l),
      splash: (d.splash || 0) * (1 + 0.08 * l) * (t.level >= 5 && d.id === 'cannon' ? 1.5 : 1),
      slow: d.slow ? Math.min(0.8, d.slow * (1 + 0.1 * l)) : 0,
      chains: d.chains ? d.chains + Math.floor(l / 2) + (t.level >= 5 && (d.id === 'tesla' || d.id === 'ninja') ? 3 : 0) : 0,
      targets: (d.targets || 1) + (t.level >= 5 && ['crystal', 'multi', 'mirror', 'cosmic'].includes(d.id) ? 2 : 0) + (t.level >= 5 && d.id === 'archer' ? 2 : 0) + (t.level >= 5 && d.id === 'beehive' ? 3 : 0) + (t.level >= 5 && d.id === 'crossbow' ? 1 : 0),
      dot: (d.dot || 0) * pm * (t.level >= 5 && d.id === 'snake' ? 2 : 1),
      burn: (d.burn || 0) * pm * (t.level >= 5 && d.id === 'fire' ? 2 : 1),
      stun: (d.stun || 0) + (t.level >= 5 && d.id === 'shock' ? 0.6 : 0),
    };
    if (d.type === 'heal') s.healEvery = d.healEvery * Math.max(0.3, 1 - 0.08 * pl);
    if (d.type === 'gold') s.income = Math.round(d.income * pm);
    if (d.type === 'buff') { s.buffDmg = d.buffDmg * (1 + 0.5 * pl); s.buffRate = d.buffRate * (1 + 0.3 * pl); }
    if (d.type === 'aura') s.slow = Math.min(0.7, d.slow * (1 + 0.12 * l));
    return s;
  }
  function upgradeCost(t) { return t.level >= MAX_TOWER_LEVEL ? 0 : Math.round(t.def.cost * UPGRADE_COST[t.level - 1]); }
  function sellValue(t) { return 0; }
  function upgrade(t) {
    if (!t || t.level >= MAX_TOWER_LEVEL) return false;
    const c = upgradeCost(t);
    if (!R.mode.creative && R.coins < c) { ui.toast && ui.toast('Nicht genug Münzen', 'bad'); Audio2.play('error'); return false; }
    if (!R.mode.creative) R.coins -= c;
    t.invested += c; t.level++;
    Models.applyTowerLevel(t.mesh, t.level);
    popIn(t.mesh);
    if (t.def.type === 'drone' && t.level === 5) { addDrone(t, 2); addDrone(t, 3); }
    Particles.emit(t.mesh.position.x, 0.6, t.mesh.position.z, 40, '#ffe14d', { speed: 2.5, up: 3, life: 0.9, size: 0.3 });
    Audio2.play('upgrade');
    Save.addStat('upgrades'); Save.maxStat('maxTowerLevel', t.level);
    snapshotRun();
    ui.hud && ui.hud(); ui.towerPanel && ui.towerPanel(t);
    return true;
  }
  function sell(t, quiet) {
    if (!t) return;
    const v = sellValue(t);
    removeTowerMesh(t);
    towers.splice(towers.indexOf(t), 1);
    grid[t.x][t.z] = null;
    Particles.emit(t.mesh.position.x, 0.4, t.mesh.position.z, 20, '#ffd700', { speed: 2, up: 2, life: 0.6 });
    Audio2.play('sell'); Save.addStat('sold');
    if (!quiet) floatText(t.mesh.position, '↩ ins Inventar', '#ffd84a');
    if (selected === t) select(null); snapshotRun(); ui.hud && ui.hud();
  }
  function select(t) {
    selected = t;
    if (t) {
      selRing.visible = true; selRing.position.set(t.mesh.position.x, 0.2, t.mesh.position.z);
      const s = towerStats(t);
      if (s.range > 0) showRange(t.mesh.position, s.range, 0xffffff); else rangeRing.visible = false;
    } else { selRing.visible = false; if (!buildSel) rangeRing.visible = false; }
    ui.towerPanel && ui.towerPanel(t);
  }
  function startMove(t) { setBuild({ kind: 'move', tower: t, id: 'move' }); ui.toast && ui.toast('Tippe auf ein freies Feld, um den Turm zu verschieben'); }

  // ---------------- Gegner ----------------
  function hpScale(w) { return (1 + 0.07 * (w - 1)) * Math.pow(1.022, w - 1) * (w > 30 ? Math.pow(1.045, w - 30) : 1); }
  const BOSS_EVERY = 5;
  function isBossWave(w) { return w % BOSS_EVERY === 0; }
  function bossFor(w) { return w === BOSS_EVERY ? 'boss_tut' : BOSS_ORDER[(w / BOSS_EVERY - 2) % BOSS_ORDER.length]; }
  function bossHp(w) { return w === BOSS_EVERY ? 420 : 950 * Math.pow(1.42, (w - 10) / 5) * (w > 30 ? Math.pow(1.045, w - 30) : 1); }
  function spawnEnemy(def, wave, hpMul = 1, d0 = 0, waveTag = null) {
    if (!route) return null;
    const mesh = Models.makeEnemy(def);
    scene.add(mesh);
    const scale = demo ? 1 : hpScale(Math.max(1, wave)) * R.mode.hp * hpMul;
    const hp = Math.round(def.hp * scale);
    const e = {
      def, mesh, A: mesh.userData.A, hp, maxHp: hp, shield: def.shield ? def.shield * scale : 0, maxShield: def.shield ? def.shield * scale : 0,
      d: d0, speed: def.speed * (demo ? 1 : Math.min(1.45, 1 + wave * 0.005) * R.mode.speed), slowT: 0, slowF: 0, burnT: 0, burnDps: 0, poisonT: 0, poisonDps: 0,
      curseT: 0, curseF: 0, stunT: 0, alive: true, fly: !!def.fly, invis: !!def.invis, vanishT: 0, revealed: false, jumpT: 2 + Math.random() * 2, jumpAnim: 0,
      healT: 1, abilT: [4, 5, 6, 7], raged: false, reward: Math.round(def.reward * (1 + wave * 0.025)), wave: waveTag, pos: new V3(), dir: new V3(), anim: Math.random() * 10,
      hitFlash: 0,
    };
    World.routePos(route, e.d, e.pos, e.dir);
    mesh.position.copy(e.pos);
    enemies.push(e);
    if (!demo) {
      if (!Save.P.seen[def.id]) { Save.P.seen[def.id] = 1; Save.checkAchievements(); ui.newEnemy && ui.newEnemy(def); }
      if (def.boss) { R.boss = e; Audio2.play('boss'); Audio2.setMood('boss'); ui.bossAppear && ui.bossAppear(e); shake = 0.6; }
    }
    return e;
  }

  // Schaden mit Rüstung, Resistenzen, Immunitäten, Schild, Fluch
  function damage(e, amount, dt, tower, opt = {}) {
    if (!e.alive || amount <= 0) return 0;
    const def = e.def;
    if (def.immune && def.immune.includes(dt) && !(opt.ignoreImmune)) amount *= 0.1;
    if (def.resist && def.resist[dt]) amount *= 1 - def.resist[dt];
    if (def.armor && !opt.pierce) amount *= 1 - def.armor * (dt === 'explosive' ? 0.6 : 1) * (e.shredT > 0 ? 1 - e.shredF : 1);
    if (e.curseT > 0) amount *= 1 + e.curseF;
    if (e.shredT > 0) amount *= 1 + 0.3 * e.shredF;
    if (e.shield > 0) { const ab = Math.min(e.shield, amount); e.shield -= ab; amount -= ab; if (e.shield <= 0 && e.A.shieldMesh) e.A.shieldMesh.visible = false; }
    e.hp -= amount; e.hitFlash = 0.08;
    if (tower) tower.dmgDealt += amount;
    if (!demo) Save.P.stats.damage += amount;
    if (e.hp <= 0) kill(e, tower);
    return amount;
  }
  function applySlow(e, f, t) {
    if (e.def.immune && (e.def.immune.includes('slow') || e.def.immune.includes('ice'))) return;
    if (e.def.boss) f *= 0.5;
    e.slowF = Math.max(e.slowF * (e.slowT > 0 ? 1 : 0), f); e.slowT = Math.max(e.slowT, t);
  }
  function applyStun(e, t) {
    if (e.def.boss) t *= 0.25; else if (e.def.mini) t *= 0.5;
    e.stunT = Math.max(e.stunT, t);
  }
  function kill(e, tower) {
    if (!e.alive) return;
    e.alive = false;
    const p = e.mesh.position;
    const col = e.def.color;
    Particles.emit(p.x, 0.5 + (e.fly ? 0.6 : 0), p.z, e.def.boss ? 120 : 18, col, { speed: e.def.boss ? 5 : 2.5, up: 2.5, life: e.def.boss ? 1.4 : 0.7, size: e.def.boss ? 0.5 : 0.28 });
    if (demo) { removeEnemy(e); return; }
    Audio2.play(e.def.boss ? 'explosion' : 'death');
    let reward = e.reward;
    // Goldturm-Bonus
    for (const t of towers) if (t.def.type === 'gold' && dist2(t.mesh.position, p) <= towerStats(t).range ** 2) reward += t.def.killBonus * t.level;
    const prog = !R.mode.creative; // Kreativmodus zählt nicht für Fortschritt
    R.coins += reward; R.stats.coins += reward; R.stats.kills++;
    if (prog) { Save.addStat('kills'); Save.P.stats.coinsEarned += reward; Save.P.killsBy[e.def.id] = (Save.P.killsBy[e.def.id] || 0) + 1; Save.addXP(Math.max(1, Math.round(e.reward * 0.4))); }
    if (tower) tower.kills++;
    Particles.emit(p.x, 0.8, p.z, 6, '#ffd84a', { speed: 1, up: 3, life: 0.6, size: 0.2, tint: false });
    floatText(p, '+' + reward, '#ffd84a');
    Audio2.play('coin');
    // Bonusmünze, die die Spielfigur einsammeln kann
    if (Math.random() < (e.def.boss ? 1 : e.def.mini ? 0.6 : 0.08)) for (let k = 0; k < (e.def.boss ? 6 : 1); k++) spawnPickup(p, Math.round(reward * (e.def.boss ? 0.3 : 1.5) + 5));
    if (e.def.boss || e.def.mini) {
      if (e.def.boss) {
        R.stats.bosses++; shake = 0.8;
        Save.addStat('bossKills'); if (e.def.id === 'boss_titan') Save.addStat('titanKills');
        const g = { gems: 10 + Math.round(R.wave / 2), crystals: Math.max(1, Math.floor(R.wave / 10)) }; Save.grant(g);
        giveBossReward(e);
      }
      ring(p, 3, e.def.glow || '#ffcc33', 0.8);
      if (R.boss === e) { R.boss = null; Audio2.setMood('wave'); ui.bossAppear && ui.bossAppear(null); }
    }
    // Fluchgeist: verflucht Türme beim Tod
    if (e.def.curser) {
      for (const t of towers) if (dist2(t.mesh.position, p) < 1.8 * 1.8) { t.stun = Math.max(t.stun, 2); Particles.emit(t.mesh.position.x, 0.8, t.mesh.position.z, 10, '#c04dff', { speed: 1, life: 0.8 }); }
    }
    // Abspaltung
    if (e.def.split) {
      const child = ENEMY_BY_ID[e.def.splitInto];
      for (let i = 0; i < e.def.split; i++) {
        const c = spawnEnemy(child, R.wave, 1, Math.max(0, e.d - 0.15 * i), e.wave);
        if (c && e.wave && R.waves.get(e.wave)) { R.waves.get(e.wave).alive++; R.waves.get(e.wave).total++; }
      }
    }
    removeEnemy(e);
  }
  // Belohnung für einen Boss: Turm, Wegstücke, Falle oder Münzen
  function giveBossReward(e) {
    const rw = Save.rollBossReward(R.wave, R.tutorial);
    const apply = it => {
      if (!it) return;
      if (it.kind === 'tower') Save.addTower(it.id, it.n || 1);
      else if (it.kind === 'roads') Save.P.roadPieces += it.n;
      else if (it.kind === 'trap') Save.addTrap(it.id);
      else if (it.kind === 'coins') { R.coins += it.n; R.stats.coins += it.n; }
    };
    apply(rw); apply(rw.bonus);
    Save.save();
    ui.bossReward && ui.bossReward(rw, e.def);
  }
  function removeEnemy(e) {
    scene.remove(e.mesh);
    e.mesh.traverse(o => { if (o.isMesh && (o.userData.ownMat || o.material.isMeshBasicMaterial) && o.material.dispose) o.material.dispose(); });
    const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1);
    if (!demo && e.wave && R.waves.has(e.wave)) {
      const w = R.waves.get(e.wave); w.alive--;
      checkWaveDone(e.wave);
    }
  }
  function leak(e) {
    if (demo) { removeEnemy(e); e.alive = false; return; }
    const dmg = e.def.boss ? 10 : e.def.mini ? 5 : 1;
    if (!R.mode.creative) { R.lives -= dmg; Save.addStat('livesLost', dmg); }
    const w = R.waves.get(e.wave); if (w) w.leaked += dmg;
    Audio2.play('lifeLost'); shake = 0.3;
    Particles.emit(World.castlePos.x, 1, World.castlePos.z, 20, '#ff3030', { speed: 2, up: 2, life: 0.6 });
    ui.toast && e.def.boss && ui.toast(`${e.def.name} hat die Burg erreicht! -${dmg} Leben`, 'bad');
    if (R.boss === e) { R.boss = null; ui.bossAppear && ui.bossAppear(null); }
    if (e.def.boss && R.tutorial) giveBossReward(e);   // im Tutorial gibt es die Belohnung trotzdem
    e.alive = false;
    removeEnemy(e);
    if (R.lives <= 0 && !R.over) gameOver();
  }

  // ---------------- Wellen ----------------
  function makeWave(w) {
    const list = [];
    const biome = BIOME_BY_ID[R.biome] || BIOMES[0];
    // Die ersten Wellen sind so gebaut, dass eine einzelne Armbrust sie schafft
    const early = { 1: ['grunt', 'grunt', 'grunt'], 2: ['grunt', 'grunt', 'grunt', 'grunt'], 3: ['grunt', 'runner', 'grunt', 'runner', 'grunt'], 4: ['grunt', 'grunt', 'runner', 'slug', 'grunt', 'runner'] };
    if (early[w]) { early[w].forEach(id => list.push({ id, hp: 1, delay: 1.6 })); return list; }
    if (isBossWave(w)) {
      const b = bossFor(w);
      const esc = w === BOSS_EVERY ? 2 : Math.min(14, 2 + Math.floor(w / 4));
      for (let i = 0; i < esc; i++) list.push({ id: w === BOSS_EVERY ? 'grunt' : pickEnemy(w, biome), hp: 1, delay: 1.0 });
      list.push({ id: b, hp: bossHp(w) / (ENEMY_BY_ID[b].hp * hpScale(w)), delay: 2.5 });
      return list;
    }
    const count = Math.min(45, 4 + Math.floor(w * 0.8));
    const interval = Math.max(0.35, 1.3 - w * 0.02);
    for (let i = 0; i < count; i++) list.push({ id: pickEnemy(w, biome), hp: 1, delay: Math.random() < 0.15 ? 0.25 : interval });
    if (w >= 40 && w % 7 === 0) list.push({ id: 'colossus', hp: 0.6, delay: 1.5 });
    return list;
  }
  function pickEnemy(w, biome) {
    const pool = ENEMIES.filter(e => !e.boss && e.w > 0 && e.min <= w && e.id !== 'miniboss' && e.id !== 'colossus');
    let tot = 0;
    const ws = pool.map(e => { const age = w - e.min; const wt = e.w * (biome.bias[e.id] || 1) * (age < 6 ? 1.6 : age > 25 ? 0.5 : 1); tot += wt; return wt; });
    let r = Math.random() * tot;
    for (let i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) return pool[i].id; }
    return pool[0].id;
  }
  function startWave(early) {
    if (!R || R.over || demo) return;
    if (!route) { ui.toast && ui.toast('Kein gültiger Weg vom Spawn zum Ziel!', 'bad'); Audio2.play('error'); return; }
    if (R.hold) { ui.toast && ui.toast('Folge zuerst dem Tutorial 🙂', 'bad'); return; }
    if (R.tutorial && R.phase === 'wave') { ui.toast && ui.toast('Im Tutorial erst die aktuelle Welle schaffen 🙂', 'bad'); return; }
    R.skipCd = Math.max(0, ((R.skipUntil || 0) - performance.now()) / 1000);
    // Sperre gilt nur fürs Überspringen (Welle läuft noch)
    if (early !== 'auto' && R.phase === 'wave' && R.skipCd > 0) { ui.toast && ui.toast(`⏳ Noch ${Math.ceil(R.skipCd)} Sekunden warten`, 'bad'); Audio2.play('error'); return; }
    if (R.phase === 'wave' && R.spawnQueue.length > 20) { ui.toast && ui.toast('Warte, bis mehr Gegner der aktuellen Welle erschienen sind', 'bad'); return; }
    const w = ++R.wave;
    const list = makeWave(w);
    const info = { total: list.length, alive: list.length, leaked: 0, queued: list.length, num: w };
    R.waves.set(w, info);
    for (const s of list) R.spawnQueue.push({ ...s, wave: w });
    if (R.phase === 'build' && R.pauseTimer > 0 && w > 1) {
      const bonus = Math.round((15 + w * 3) * Math.min(1, R.pauseTimer / 20));
      if (bonus > 0) { R.coins += bonus; R.stats.coins += bonus; Save.P.stats.coinsEarned += bonus; ui.toast && ui.toast(`⏩ Pause übersprungen: +${bonus} Münzen`, 'good'); }
      Save.addStat('skips');
    } else if (early === true) {
      const bonus = 20 + w * 4; R.coins += bonus; R.stats.coins += bonus; Save.P.stats.coinsEarned += bonus;
      ui.toast && ui.toast(`⏩ Welle früher gerufen: +${bonus} Münzen`, 'good'); Save.addStat('skips');
    }
    R.phase = 'wave'; R.pauseTimer = 0;
    R.skipUntil = performance.now() + 4000; R.skipCd = 4;   // erst nach 4 Sekunden wieder überspringen
    if (R.spawnTimer <= 0) R.spawnTimer = 0.5;
    setBuildOverlayForPhase();
    if (buildSel && buildSel.kind === 'road' && !R.mode.creative) setBuild(null);
    Audio2.play('waveStart');
    if (!R.boss) Audio2.setMood('wave');
    ui.waveBanner && ui.waveBanner(w, list.some(s => ENEMY_BY_ID[s.id].boss));
    ui.tutorialEvent && ui.tutorialEvent('waveStart', w);
    ui.hud && ui.hud();
  }
  function setBuildOverlayForPhase() { World.setBuildOverlay(!!buildSel || R.phase === 'build'); }
  function checkWaveDone(w) {
    const info = R.waves.get(w);
    if (!info || info.alive > 0 || info.queued > 0) return;
    R.waves.delete(w);
    // Welle geschafft
    const bonus = 40 + w * 8;
    R.coins += bonus; R.stats.coins += bonus; Save.P.stats.coinsEarned += bonus;
    let income = 0;
    for (const t of towers) if (t.def.type === 'gold') income += towerStats(t).income;
    if (income) { R.coins += income; R.stats.coins += income; Save.P.stats.coinsEarned += income; }
    if (!R.mode.creative) {
      Save.addStat('wavesTotal'); Save.maxStat('bestWave', w);
      if (w >= 10 && info.leaked === 0) Save.addStat('perfectWaves');
      Save.addXP(20 + w * 5);
      const rec = Save.P.records[R.mode.id] || 0; if (w > rec) Save.P.records[R.mode.id] = w;
    }
    Audio2.play('waveClear');
    ui.waveCleared && ui.waveCleared(w, bonus, income);
    if (R.waves.size === 0 && R.spawnQueue.length === 0) {
      R.phase = 'build'; R.pauseTimer = Save.P.settings.autoStart && !R.tutorial ? 25 : 0;
      Audio2.setMood('build'); setBuildOverlayForPhase();
    }
    snapshotRun();
    ui.tutorialEvent && ui.tutorialEvent('waveCleared', w);
    ui.hud && ui.hud();
  }
  function continueEndless() { R.continueEndless = true; R.won = true; snapshotRun(); Audio2.setMood('build'); }
  function gameOver() {
    R.over = true; R.paused = false;
    Audio2.play('gameover'); Audio2.setMood('menu');
    const rec = Save.P.records[R.mode.id] || 0;
    const s = summary(); s.record = Math.max(rec, R.wave - 1);
    Save.P.run = null;
    Save.makeTowerPicks(s.waves); // neue Türme zur Auswahl
    Save.save();
    ui.gameOver && ui.gameOver(s);
  }
  function summary() {
    return { mode: R.mode, waves: R.over ? Math.max(0, R.wave - 1) : R.wave, kills: R.stats.kills, coins: R.stats.coins, bosses: R.stats.bosses, time: R.stats.time, record: Save.P.records[R.mode.id] || 0 };
  }

  // ---------------- Geschosse (Pool) ----------------
  const projPool = [];
  function projMesh(kind, color) {
    let p = projPool.find(m => !m.visible && m.userData.kind === kind);
    if (!p) {
      let g;
      switch (kind) {
        case 'bolt': g = new THREE.Group(); Models.mesh(Models.cyl(0.025, 0.025, 0.6, 5), Models.M('#8a6a3a'), 0, 0, 0, g, false).rotation.x = Math.PI / 2; Models.mesh(Models.cone(0.06, 0.16, 4), Models.M('#cfd6e0'), 0, 0, 0.36, g, false).rotation.x = Math.PI / 2; break;
        case 'rock': g = new THREE.Group(); Models.mesh(Models.dod(0.13), Models.M('#8d8f99'), 0, 0, 0, g, false); break;
        case 'snow': g = new THREE.Group(); Models.mesh(Models.sph(0.1, 8), Models.M('#ffffff'), 0, 0, 0, g, false); break;
        case 'bee': g = new THREE.Group(); Models.mesh(Models.sph(0.04, 6), Models.M('#ffd000'), 0, 0, 0, g, false); Models.mesh(Models.sph(0.025, 5), Models.M('#222'), 0, 0, -0.04, g, false); break;
        case 'arrow': g = new THREE.Group(); Models.mesh(Models.cyl(0.015, 0.015, 0.35, 4), Models.M('#8a5a2a'), 0, 0, 0, g, false).rotation.x = Math.PI / 2; Models.mesh(Models.cone(0.04, 0.1, 4), Models.M('#cccccc'), 0, 0, 0.2, g, false).rotation.x = Math.PI / 2; break;
        case 'rocket': g = new THREE.Group(); Models.mesh(Models.cyl(0.05, 0.05, 0.3, 6), Models.M('#dddddd'), 0, 0, 0, g, false).rotation.x = Math.PI / 2; Models.mesh(Models.cone(0.05, 0.12, 6), Models.M('#ff3b2b'), 0, 0, 0.21, g, false).rotation.x = Math.PI / 2; break;
        case 'meteor': g = new THREE.Group(); Models.mesh(Models.dod(0.35), Models.M('#5a2a1a', { e: '#ff5a00', ei: 0.8 }), 0, 0, 0, g, false); break;
        case 'bullet': g = new THREE.Group(); Models.mesh(Models.sph(0.04, 6), Models.M('#ffd24a', { e: '#ffaa00', ei: 1 }), 0, 0, 0, g, false); break;
        default: g = new THREE.Group(); g.userData.ball = Models.mesh(Models.sph(0.1, 10), new THREE.MeshBasicMaterial({ color }), 0, 0, 0, g, false);
          g.userData.gl = new THREE.Sprite(Models.glow('#ffffff', 0.55, 0.85).material.clone()); g.userData.gl.scale.setScalar(0.55); g.add(g.userData.gl);
      }
      g.userData.kind = kind; scene.add(g); projPool.push(g); p = g;
    }
    if (p.userData.ball) p.userData.ball.material.color.set(color);
    if (p.userData.gl) p.userData.gl.material.color.set(color);
    p.visible = true;
    return p;
  }
  function fire(t, target, s, opt = {}) {
    const d = t.def;
    const from = new V3(); t.mesh.userData.tip.getWorldPosition(from);
    let kind = 'ball', color = d.c3, size = 1;
    if (d.id === 'archer' || d.id === 'crossbow') kind = 'arrow';
    else if (d.id === 'catapult') kind = 'rock';
    else if (d.id === 'snowman') kind = 'snow';
    else if (d.id === 'beehive') kind = 'bee';
    else if (d.id === 'rocket') kind = 'rocket';
    else if (d.id === 'gatling') kind = 'bullet';
    else if (d.id === 'cannon' || d.id === 'multi' || d.id === 'bomb') { color = '#222222'; size = d.id === 'bomb' ? 2 : 1.3; }
    else if (opt.meteor) kind = 'meteor';
    const mesh = projMesh(kind, color);
    mesh.scale.setScalar(size * (1 + (t.level - 1) * 0.08));
    if (opt.meteor) { from.set(target.pos.x + 3, 12, target.pos.z - 2); }
    mesh.position.copy(from);
    if (!opt.meteor && !demo) Particles.emit(from.x, from.y, from.z, 3, d.dt === 'fire' ? '#ffb000' : d.dt === 'ice' ? '#dff8ff' : '#fff3c0', { speed: 0.9, up: 0.4, life: 0.12, size: 0.32, gravity: 0, tint: false });
    projectiles.push({ mesh, tower: t, target, tp: target.pos.clone(), pos: from.clone(), start: from.clone(), speed: opt.meteor ? 11 : s.speed, dmg: opt.dmg ?? s.dmg, splash: s.splash, homing: true, lob: d.lob || d.id === 'mortar', t: 0, kind, color: d.c3, meteor: opt.meteor, dt: d.dt });
  }
  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (p.pierceDir) {
        p.pos.addScaledVector(p.pierceDir, p.speed * dt); p.mesh.position.copy(p.pos); p.mesh.lookAt(p.pos.clone().add(p.pierceDir));
        for (const e of enemies) if (e.alive && !p.hit.has(e) && (!e.invis || e.revealed)) {
          const ey = e.pos.y + 0.4 + (e.fly ? 0.8 : 0);
          if ((e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2 < 0.5 * 0.5 && Math.abs(ey - p.pos.y) < 1.2) {
            p.hit.add(e); damage(e, p.dmg, p.dt, p.tower, { pierce: true });
            Particles.emit(e.pos.x, ey, e.pos.z, 6, '#dddddd', { speed: 1.5, life: 0.3, size: 0.18 }); Audio2.play('hit');
          }
        }
        if (p.pos.distanceTo(p.start) > p.maxDist || p.pos.y < 0) { p.mesh.visible = false; projectiles.splice(i, 1); }
        continue;
      }
      if (p.target && p.target.alive) p.tp.set(p.target.pos.x, p.target.pos.y + 0.35 + (p.target.fly ? 0.8 : 0), p.target.pos.z);
      const to = p.tp.clone().sub(p.pos);
      const dist = to.length();
      const step = p.speed * dt;
      if (p.lob) {
        p.t += dt * p.speed / Math.max(1, p.start.distanceTo(p.tp));
        const tt = Math.min(1, p.t);
        p.pos.lerpVectors(p.start, p.tp, tt); p.pos.y += Math.sin(tt * Math.PI) * 2;
        p.mesh.position.copy(p.pos);
        if (tt >= 1) { impact(p); projectiles.splice(i, 1); }
        continue;
      }
      if (dist <= step + 0.05) { p.pos.copy(p.tp); impact(p); projectiles.splice(i, 1); continue; }
      to.multiplyScalar(1 / dist);
      p.pos.addScaledVector(to, step);
      p.mesh.position.copy(p.pos);
      p.mesh.lookAt(p.tp);
      if (p.kind === 'rocket' || p.kind === 'meteor') Particles.emit(p.pos.x, p.pos.y, p.pos.z, 1, p.kind === 'meteor' ? '#ff7a00' : '#cccccc', { speed: 0.2, up: 0.2, life: 0.4, size: p.kind === 'meteor' ? 0.6 : 0.2, gravity: -0.5 });
      else if (p.kind === 'ball' && Math.random() < 0.5) Particles.emit(p.pos.x, p.pos.y, p.pos.z, 1, p.color, { speed: 0.1, up: 0.1, life: 0.25, size: 0.18, gravity: 0 });
    }
  }
  function impact(p) {
    p.mesh.visible = false;
    const t = p.tower, d = t.def, s = towerStats(t);
    const pos = p.pos;
    const hitList = [];
    if (p.splash > 0) {
      for (const e of enemies) if (e.alive && dist2(e.pos, pos) <= p.splash * p.splash && (!d.ground || !e.fly) && (!e.invis || e.revealed)) hitList.push(e);
      const col = d.dt === 'poison' ? '#9dff3d' : d.dt === 'energy' ? d.c3 : d.dt === 'fire' ? '#ff7a00' : '#ffb347';
      Particles.emit(pos.x, Math.max(0.2, pos.y), pos.z, p.meteor ? 70 : 26, col, { speed: p.splash * 3, up: 2, life: 0.6, size: 0.32 });
      if (d.dt === 'explosive' || p.meteor) { Particles.emit(pos.x, 0.3, pos.z, 12, '#555555', { speed: 1, up: 1.2, life: 1.0, size: 0.5, gravity: -0.5, tint: false }); Audio2.play('explosion'); }
      ring(pos, p.splash, col, 0.35);
      if (p.meteor) shake = Math.max(shake, 0.25);
    } else if (p.target && p.target.alive) hitList.push(p.target);
    for (const e of hitList) {
      let dmg = p.dmg;
      damage(e, dmg, p.dt, t, { pierce: d.pierce });
      if (d.slow) { applySlow(e, s.slow, d.slowDur); if (t.level >= 5 && d.id === 'ice' && Math.random() < 0.2) applyStun(e, 0.8); }
      if (d.dot) { e.poisonDps = Math.max(e.poisonDps * (e.poisonT > 0 ? 1 : 0), s.dot); e.poisonT = d.dotDur; e.poisonSrc = t; }
      if (d.burn && p.meteor) { e.burnDps = Math.max(e.burnDps, s.burn); e.burnT = d.burnDur; e.burnSrc = t; }
      if (d.curse) { e.curseF = d.curse + (t.level >= 5 ? 0.25 : 0); e.curseT = d.curseDur; }
      if (d.shred) { e.shredT = d.shredDur; e.shredF = t.level >= 5 ? 1 : d.shred; }
      if (d.id === 'snowman' && t.level >= 5 && Math.random() < 0.15) applyStun(e, 0.7);
      if (d.id === 'gatling' && t.level >= 5) { e.burnDps = Math.max(e.burnDps, 8 * LEVEL_DMG[4]); e.burnT = 2; }
    }
    if (!p.splash && p.target) Particles.emit(pos.x, pos.y, pos.z, 6, p.color, { speed: 1.2, up: 1, life: 0.3, size: 0.18 });
    if (d.id === 'magic' && t.level >= 5) { for (const e of enemies) if (e.alive && e !== p.target && dist2(e.pos, pos) < 1) damage(e, p.dmg * 0.5, 'magic', t); ring(pos, 1, '#e07bff', 0.3); }
    if (d.id === 'bomb' && t.level >= 5) setTimeout(() => { if (!R || R.over) return; for (const e of enemies) if (e.alive && !e.fly && dist2(e.pos, pos) < p.splash * p.splash) damage(e, p.dmg * 0.5, 'explosive', t); ring(pos, p.splash, '#ff9a1f', 0.4); Particles.emit(pos.x, 0.3, pos.z, 20, '#ff9a1f', { speed: 3, life: 0.5 }); }, 400);
    if (d.id === 'plasma' && t.level >= 5) for (const e of hitList) { e.burnDps = Math.max(e.burnDps, p.dmg * 0.15); e.burnT = 2; }
    if (hitList.length) Audio2.play('hit');
  }
  function ring(pos, r, color, life) {
    const m = new THREE.Mesh(Models.geo('ringfx', () => new THREE.RingGeometry(0.8, 1, 32)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.1, pos.z); scene.add(m);
    rings.push({ mesh: m, t: 0, life, r });
  }
  function bolt(a, b, color, life = 0.15, width = 1) {
    const pts = [a.clone()];
    const segs = 6;
    for (let i = 1; i < segs; i++) { const p = a.clone().lerp(b, i / segs); p.x += (Math.random() - 0.5) * 0.25; p.y += (Math.random() - 0.5) * 0.25; p.z += (Math.random() - 0.5) * 0.25; pts.push(p); }
    pts.push(b.clone());
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 }));
    scene.add(m); bolts.push({ mesh: m, t: 0, life });
  }
  function tracer(a, b, color, life = 0.08) {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const m = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true }));
    scene.add(m); bolts.push({ mesh: m, t: 0, life });
  }
  function beamMesh(color, w) {
    const g = Models.geo('beam', () => { const c = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); c.translate(0, 0.5, 0); c.rotateX(Math.PI / 2); return c; });
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.userData.w = w; scene.add(m); return m;
  }
  function setBeam(m, a, b, t) {
    m.visible = true; m.position.copy(a);
    const len = a.distanceTo(b); m.lookAt(b);
    const w = m.userData.w * (0.8 + 0.3 * Math.sin(t * 40));
    m.scale.set(w, w, len);
  }

  // ---------------- Zielsuche ----------------
  const _tmp = new V3();
  function canTarget(t, e) {
    if (!e.alive) return false;
    if (t.def.ground && e.fly) return false;
    if ((e.invis || e.vanishT > 0) && !e.revealed) return false;
    return true;
  }
  function findTargets(t, range, n = 1, exclude) {
    const r2 = range * range, tp = t.mesh.position;
    const c = [];
    for (const e of enemies) if (canTarget(t, e) && dist2(e.pos, tp) <= r2 && (!exclude || !exclude.includes(e))) c.push(e);
    if (!c.length) return c;
    const mode = t.targeting;
    if (mode === 'first') c.sort((a, b) => b.d - a.d);
    else if (mode === 'last') c.sort((a, b) => a.d - b.d);
    else if (mode === 'strong') c.sort((a, b) => b.hp + b.shield - a.hp - a.shield);
    else c.sort((a, b) => dist2(a.pos, tp) - dist2(b.pos, tp));
    return c.slice(0, n);
  }
  function aimHead(t, target, dt) {
    if (t.mesh.userData.noAim) return;
    const tp = t.mesh.position;
    const ang = Math.atan2(target.pos.x - tp.x, target.pos.z - tp.z);
    const h = t.mesh.userData.head;
    let da = ang - h.rotation.y; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    h.rotation.y += da * Math.min(1, dt * 12);
  }

  // ---------------- Turm-Logik ----------------
  function updateTower(t, dt, time) {
    const d = t.def;
    const ud = t.mesh.userData;
    // Animationen
    for (const sp of ud.spinners) sp.rotation.z += (sp.userData.spin || 0) * dt;
    if (ud.lvlGroup) for (const c of ud.lvlGroup.children) if (c.userData.lvSpin) c.rotation.z += dt * 1.4;
    if (ud.crown) ud.crown.position.y = ud.topY * ud.body.scale.y + 0.62 + Math.sin(time * 2) * 0.05, ud.crown.rotation.y += dt;
    if (ud.aura) ud.aura.material.opacity = 0.2 + 0.15 * Math.sin(time * 3);
    if (ud.flames) { const s = 1 + Math.sin(time * 20 + t.z) * 0.15; ud.flames[0].scale.set(s, 1 + Math.sin(time * 15) * 0.2, s); }
    if (ud.flag) ud.flag.rotation.y = Math.sin(time * 3) * 0.3;
    if (ud.coin) ud.coin.rotation.z += dt * 2;
    if (ud.hands) { ud.hands[0].rotation.z -= dt * 0.5; ud.hands[1].rotation.z -= dt * 3; }
    if (ud.wings) ud.wings.forEach((w, i) => w.rotation.z = (i ? -1 : 1) * (1.3 + Math.sin(time * 4) * 0.2));
    if (ud.bees) ud.bees.rotation.y += dt * 4;
    if (ud.fan) ud.fan.rotation.y += dt * 9;
    if (ud.rays) ud.rays.rotation.z += dt * 0.8;
    if (ud.shuri) ud.shuri.rotation.y += dt * 6;
    if (ud.starM) ud.starM.rotation.y += dt * 1.5;
    if (ud.hammer) ud.hammer.rotation.x += (0 - ud.hammer.rotation.x) * Math.min(1, dt * 4);
    if (ud.orb && ud.orbBase === undefined) ud.orbBase = ud.orb.position.y;
    if (ud.orb) ud.orb.position.y = ud.orbBase + Math.sin(time * 3 + t.x) * 0.03;
    if (t.stun > 0) { t.stun -= dt; if (Math.random() < 0.1) Particles.emit(t.mesh.position.x, 1, t.mesh.position.z, 1, '#9fd8ff', { speed: 0.3, up: 0.5, life: 0.5 }); if (t.beam) t.beam.visible = false; return; }
    if (!R || (R.phase !== 'wave' && !demo && enemies.length === 0)) {
      if (t.beam) t.beam.visible = false; if (t.beam2) t.beam2.visible = false; if (t.beams) t.beams.forEach(b => b.visible = false);
      // Leerlauf: Turm schaut sich langsam um
      if (!ud.noAim) ud.head.rotation.y += Math.sin(time * 0.6 + t.x * 1.7) * dt * 0.5;
      return;
    }
    const s = towerStats(t);
    t.cd -= dt;
    switch (d.type) {
      case 'bullet': case 'splash': case 'slow': case 'poison': case 'multi': {
        const n = d.type === 'multi' ? s.targets : (d.id === 'archer' || d.id === 'crossbow' ? s.targets : 1);
        const ts = findTargets(t, s.range, n);
        if (ts.length) aimHead(t, ts[0], dt);
        if (t.cd <= 0 && ts.length) {
          t.cd = 1 / s.rate;
          for (const e of ts) fire(t, e, s);
          if ((d.id === 'rocket' || d.id === 'catapult') && t.level >= 5) setTimeout(() => { if (ts[0].alive && towers.includes(t)) fire(t, ts[0], s); }, 180);
          playShot(d);
          if (ud.recoil) ud.recoil.scale.set(1, 0.7, 1);
          const tip = new V3(); ud.tip.getWorldPosition(tip);
          if (d.id === 'cannon' || d.id === 'multi' || d.id === 'bomb' || d.id === 'mortar') Particles.emit(tip.x, tip.y, tip.z, 5, '#dddddd', { speed: 0.6, up: 0.6, life: 0.5, size: 0.25, gravity: -0.3, tint: false });
        }
        if (ud.recoil) ud.recoil.scale.y += (1 - ud.recoil.scale.y) * Math.min(1, dt * 8);
        if (ud.gatling && ts.length) ud.gatling.rotation.z += dt * 25;
        break;
      }
      case 'sniper': {
        if (t.beamT > 0) { t.beamT -= dt; if (t.beamT <= 0 && t.beam) t.beam.visible = false; else if (t.beam) t.beam.scale.x = t.beam.scale.y = 0.12 * t.beamT * 4; }
        const ts = findTargets(t, s.range, 1);
        if (ts.length) aimHead(t, ts[0], dt);
        if (t.cd <= 0 && ts.length) {
          t.cd = 1 / s.rate;
          const e = ts[0]; const tip = new V3(); ud.tip.getWorldPosition(tip);
          const crit = t.level >= 5 && Math.random() < 0.15;
          damage(e, s.dmg * (crit ? 4 : 1), d.dt, t, { pierce: true });
          if (s.splash) {
            const r = s.splash * (d.id === 'sun' && t.level >= 5 ? 1.8 : 1);
            for (const o of enemies) if (o !== e && canTarget(t, o) && dist2(o.pos, e.pos) <= r * r) damage(o, s.dmg * 0.5, d.dt, t, { pierce: true });
            ring(e.pos, r, d.c3, 0.4); Particles.emit(e.pos.x, 0.5, e.pos.z, 40, '#ffd54a', { speed: r * 3, up: 2, life: 0.6, size: 0.35 });
            if (!t.beam) t.beam = beamMesh('#fff2a8', 0.12);
            setBeam(t.beam, tip, e.pos.clone().setY(e.pos.y + 0.4), time); t.beamT = 0.25;
          }
          else tracer(tip, e.pos.clone().setY(e.pos.y + 0.4 + (e.fly ? 0.8 : 0)), crit ? '#ff3040' : '#ffffff', 0.12);
          Particles.emit(e.pos.x, 0.5, e.pos.z, 8, crit ? '#ff3040' : '#ffffff', { speed: 1.5, life: 0.3 });
          if (crit) floatText(e.pos, 'KRIT!', '#ff3040');
          playShot(d);
        }
        break;
      }
      case 'beam': {
        if (d.targets) {   // Spiegel- & Kosmosturm: mehrere eigene Strahlen
          const ts = findTargets(t, s.range, s.targets);
          t.beams = t.beams || [];
          const tip = new V3(); ud.tip.getWorldPosition(tip);
          for (let i = 0; i < Math.max(ts.length, t.beams.length); i++) {
            const e = ts[i];
            if (!e) { if (t.beams[i]) t.beams[i].visible = false; continue; }
            if (!t.beams[i]) t.beams[i] = beamMesh(d.c3, d.id === 'cosmic' ? 0.07 : 0.04);
            const ep = e.pos.clone().setY(e.pos.y + 0.4 + (e.fly ? 0.8 : 0));
            setBeam(t.beams[i], tip, ep, time + i);
            damage(e, s.dmg * dt, d.dt, t, { pierce: d.pierce });
            if (Math.random() < 0.3) Particles.emit(ep.x, ep.y, ep.z, 1, d.c3, { speed: 1, up: 0.8, life: 0.3, size: 0.2 });
          }
          if (ts.length && t.cd <= 0) { t.cd = 0.6; playShot(d); }
          break;
        }
        const n = d.id === 'laser' && t.level >= 5 ? 2 : 1;
        const ts = findTargets(t, s.range, n);
        if (ts.length) {
          aimHead(t, ts[0], dt);
          const tip = new V3(); ud.tip.getWorldPosition(tip);
          if (!t.beam) t.beam = beamMesh(d.c3, 0.05 + 0.01 * t.level);
          const ep = ts[0].pos.clone().setY(ts[0].pos.y + 0.4 + (ts[0].fly ? 0.8 : 0));
          setBeam(t.beam, tip, ep, time);
          damage(ts[0], s.dmg * dt, d.dt, t, { pierce: d.dt === 'magic' });
          if (s.slow) applySlow(ts[0], s.slow, d.slowDur);
          if (d.id === 'light' && t.level >= 5) applySlow(ts[0], 0.3, 0.3);
          if (d.id === 'icelaser' && t.level >= 5 && Math.random() < dt * 0.4) applyStun(ts[0], 0.7);
          if (Math.random() < 0.5) Particles.emit(ep.x, ep.y, ep.z, 1, d.c3, { speed: 1, up: 0.8, life: 0.3, size: 0.2 });
          if (ts[1]) { if (!t.beam2) t.beam2 = beamMesh(d.c3, 0.04); setBeam(t.beam2, ep, ts[1].pos.clone().setY(0.4), time); damage(ts[1], s.dmg * dt * 0.6, d.dt, t); }
          else if (t.beam2) t.beam2.visible = false;
          if (t.cd <= 0) { t.cd = 0.5; playShot(d); }
        } else { if (t.beam) t.beam.visible = false; if (t.beam2) t.beam2.visible = false; }
        break;
      }
      case 'flame': {
        const ts = findTargets(t, s.range, 1);
        if (ts.length) {
          aimHead(t, ts[0], dt);
          const tip = new V3(); ud.tip.getWorldPosition(tip);
          const e0 = ts[0];
          const dir = e0.pos.clone().sub(tip).setY(0).normalize();
          for (let i = 0; i < (Particles.count < 1800 ? 3 : 1); i++) Particles.emit(tip.x, tip.y, tip.z, 1, Math.random() < 0.5 ? '#ff7a00' : '#ffd000', { speed: 0.3, up: 0.3, life: 0.45, size: d.id === 'dragon' ? 0.5 : 0.35, gravity: -1, dir: dir.clone().multiplyScalar(s.range * 1.6) });
          if (ud.jaw) ud.jaw.rotation.x = 0.4;
          if (t.cd <= 0) {
            t.cd = 1 / s.rate;
            const r2 = s.splash * s.splash;
            for (const e of enemies) if (canTarget(t, e) && dist2(e.pos, e0.pos) <= r2 && dist2(e.pos, t.mesh.position) <= (s.range + 0.5) ** 2) {
              const ign = d.id === 'dragon' && t.level >= 5;
              damage(e, s.dmg, 'fire', t, { ignoreImmune: ign });
              if (!(e.def.immune && e.def.immune.includes('fire')) || ign) { e.burnDps = Math.max(e.burnT > 0 ? e.burnDps : 0, s.burn); e.burnT = d.burnDur; e.burnSrc = t; }
            }
            playShot(d);
          }
        } else if (ud.jaw) ud.jaw.rotation.x = 0;
        break;
      }
      case 'chain': {
        if (t.cd <= 0) {
          const ts = findTargets(t, s.range, 1);
          if (ts.length) {
            t.cd = 1 / s.rate;
            const tip = new V3(); ud.tip.getWorldPosition(tip);
            let prev = tip, cur = ts[0], dmg = s.dmg; const hit = [];
            const col = d.dt === 'poison' ? '#c6ff3d' : d.c3;
            if (ud.shuri) ud.shuri.rotation.y += 3;
            for (let i = 0; i < s.chains && cur; i++) {
              const cp = cur.pos.clone().setY(cur.pos.y + 0.4 + (cur.fly ? 0.8 : 0));
              bolt(prev, cp, col, 0.18);
              damage(cur, dmg, d.dt, t);
              if (s.dot) { cur.poisonDps = Math.max(cur.poisonT > 0 ? cur.poisonDps : 0, s.dot); cur.poisonT = d.dotDur; cur.poisonSrc = t; }
              Particles.emit(cp.x, cp.y, cp.z, 5, col, { speed: 1.5, life: 0.25, size: 0.18 });
              hit.push(cur); prev = cp; dmg *= 0.85;
              let best = null, bd = 1.8 * 1.8;
              for (const e of enemies) if (canTarget(t, e) && !hit.includes(e)) { const dd = dist2(e.pos, cur.pos); if (dd < bd) { bd = dd; best = e; } }
              cur = best;
            }
            playShot(d);
          }
        }
        break;
      }
      case 'mine': {
        if (t.cd <= 0 && route && mines.filter(m => m.tower === t).length < 5 + t.level) {
          // zufälliger Straßenpunkt in Reichweite
          const cands = [];
          for (let dd = 0; dd < route.len; dd += 0.5) { World.routePos(route, dd, _tmp); if (dist2(_tmp, t.mesh.position) <= s.range * s.range) cands.push(dd); }
          if (cands.length) {
            t.cd = 1 / s.rate;
            const dd = cands[Math.floor(Math.random() * cands.length)];
            const p = new V3(); World.routePos(route, dd, p);
            p.x += (Math.random() - 0.5) * 0.4; p.z += (Math.random() - 0.5) * 0.4;
            const m = new THREE.Group();
            Models.mesh(Models.cyl(0.12, 0.14, 0.06, 10), Models.M('#3a3a3a'), 0, 0.04, 0, m, false);
            const led = Models.mesh(Models.sph(0.035), Models.M('#ff2020', { e: '#ff0000', ei: 1 }), 0, 0.09, 0, m, false);
            m.position.copy(t.mesh.position); scene.add(m);
            mines.push({ mesh: m, led, tower: t, pos: p, from: t.mesh.position.clone(), fly: 0, dmg: s.dmg, splash: s.splash, cluster: t.level >= 5 });
            playShot(d);
          }
        }
        break;
      }
      case 'push': {
        const ts = findTargets(t, s.range, 1);
        if (ts.length) {
          const e = ts[0]; aimHead(t, e, dt);
          const tip = new V3(); ud.tip.getWorldPosition(tip);
          const dir = e.pos.clone().sub(tip).normalize();
          if (d.id === 'water') Particles.emit(tip.x, tip.y, tip.z, 2, '#a8e6ff', { speed: 0.2, up: 0.2, life: 0.35, size: 0.25, gravity: 2, dir: dir.multiplyScalar(6) });
          if (t.cd <= 0) {
            t.cd = 1 / s.rate;
            if (!e.fly || d.hitsFly) {
              damage(e, s.dmg, 'phys', t);
              if (d.id === 'harpoon') { const tip2 = new V3(); ud.tip.getWorldPosition(tip2); tracer(tip2, e.pos.clone().setY(e.pos.y + 0.4 + (e.fly ? 0.8 : 0)), '#dddddd', 0.25); }
              const push = d.push * (t.level >= 5 ? 1.8 : 1) * (1 + 0.1 * (t.level - 1)) * (e.def.boss ? 0.15 : e.def.mini ? 0.4 : 1);
              e.d = Math.max(0, e.d - push);
              applySlow(e, d.slow, d.slowDur);
            }
            playShot(d);
          }
        }
        break;
      }
      case 'drone': {
        t.drones.forEach((dr, i) => {
          dr.phase += dt * 2;
          if (!dr.target || !canTarget(t, dr.target) || dist2(dr.target.pos, t.mesh.position) > s.range * s.range) {
            const ts = findTargets(t, s.range, t.drones.length);
            dr.target = ts[i % Math.max(1, ts.length)] || null;
          }
          const goal = dr.target ? dr.target.pos.clone().add(new V3(Math.cos(dr.phase) * 0.8, 1.4, Math.sin(dr.phase) * 0.8)) : t.mesh.position.clone().add(new V3(Math.cos(dr.phase + i * 2) * 0.6, 1.3 + Math.sin(time * 3 + i) * 0.1, Math.sin(dr.phase + i * 2) * 0.6));
          dr.mesh.position.lerp(goal, Math.min(1, dt * 3));
          if (dr.bird) { // Phönix: in Flugrichtung drehen, Flügel schlagen, Feuerspur
            dr.mesh.lookAt(goal); dr.bird.forEach((w, k) => w.rotation.z = (k ? -1 : 1) * (0.3 + Math.sin(time * 12) * 0.6));
            if (Math.random() < 0.6) Particles.emit(dr.mesh.position.x, dr.mesh.position.y, dr.mesh.position.z, 1, Math.random() < 0.5 ? '#ff7a00' : '#ffd000', { speed: 0.2, up: 0.2, life: 0.5, size: 0.3, gravity: -0.5 });
          } else dr.mesh.rotation.y += dt * 4;
          dr.cd -= dt;
          if (dr.target && dr.cd <= 0 && dr.mesh.position.distanceTo(dr.target.pos) < 2.4) {
            dr.cd = 1 / s.rate;
            damage(dr.target, s.dmg, d.dt, t);
            if (s.burn) { const e = dr.target; if (!(e.def.immune && e.def.immune.includes('fire'))) { e.burnDps = Math.max(e.burnT > 0 ? e.burnDps : 0, s.burn); e.burnT = d.burnDur; e.burnSrc = t; } }
            tracer(dr.mesh.position.clone(), dr.target.pos.clone().setY(dr.target.pos.y + 0.4 + (dr.target.fly ? 0.8 : 0)), d.id === 'phoenix' ? '#ffb000' : '#38c6ff', 0.06);
            if (Math.random() < 0.3) playShot(d);
          }
        });
        break;
      }
      case 'pierce': {   // Balliste: Bolzen durchschlägt alle Gegner in einer Linie
        const ts = findTargets(t, s.range, 1);
        if (ts.length) aimHead(t, ts[0], dt);
        if (t.cd <= 0 && ts.length) {
          t.cd = 1 / s.rate;
          const from = new V3(); ud.tip.getWorldPosition(from);
          const to = ts[0].pos.clone().setY(ts[0].pos.y + 0.4 + (ts[0].fly ? 0.8 : 0));
          const dir = to.sub(from).normalize();
          const mesh = projMesh('bolt', d.c3); mesh.scale.setScalar(1.3); mesh.position.copy(from);
          projectiles.push({ mesh, tower: t, pierceDir: dir, pos: from.clone(), start: from.clone(), maxDist: s.range * (t.level >= 5 ? 2.6 : 1.4), hit: new Set(), speed: s.speed, dmg: s.dmg, dt: d.dt, kind: 'bolt', color: d.c3 });
          if (ud.recoil) ud.recoil.scale.set(1, 0.7, 1);
          playShot(d);
        }
        if (ud.recoil) ud.recoil.scale.y += (1 - ud.recoil.scale.y) * Math.min(1, dt * 8);
        break;
      }
      case 'zone': {   // Pilz-/Lavaturm: Gift- oder Lavafläche auf dem Weg
        const ts = findTargets(t, s.range, 1);
        if (t.cd <= 0 && ts.length && zones.filter(z => z.tower === t).length < 3) {
          t.cd = 1 / s.rate;
          const big = t.level >= 5 ? 1.5 : 1;
          spawnZone(d.zone, ts[0].pos.clone().setY(0), d.zoneR * big * (1 + 0.04 * t.plus), d.zoneDur, t, d.zone === 'lava' ? s.burn : s.dot);
          if (ud.puff) { ud.puff.scale.set(1.25, 0.8, 1.25); }
          playShot(d);
        }
        if (ud.puff) ud.puff.scale.lerp(new V3(1, 1, 1), Math.min(1, dt * 5));
        break;
      }
      case 'storm': {   // Gewitterwolke: Blitze von oben
        if (ud.cloud) { ud.cloud.position.y = 0.55 + Math.sin(time * 2) * 0.04; ud.cloud.rotation.y += dt * 0.5; }
        const ts = findTargets(t, s.range, 8);
        if (t.cd <= 0 && ts.length) {
          t.cd = 1 / s.rate;
          const n = (d.strikes || 1) + (t.level >= 5 ? 2 : 0);
          for (let i = 0; i < n; i++) {
            const e = ts[Math.floor(Math.random() * ts.length)];
            const top = e.pos.clone().add(new V3((Math.random() - 0.5) * 0.6, 7, (Math.random() - 0.5) * 0.6));
            bolt(top, e.pos.clone().setY(e.pos.y + 0.4), '#fff35a', 0.22);
            bolt(top, e.pos.clone().setY(e.pos.y + 0.4), '#ffffff', 0.15);
            damage(e, s.dmg, d.dt, t); applyStun(e, s.stun);
            Particles.emit(e.pos.x, 0.4, e.pos.z, 12, '#fff35a', { speed: 2.5, up: 2, life: 0.35, size: 0.22 });
          }
          shake = Math.max(shake, 0.06); playShot(d);
        }
        break;
      }
      case 'tornado': {  // Wirbelsturm läuft den Weg zurück und reißt Gegner mit
        const ts = findTargets(t, s.range, 1);
        if (t.cd <= 0 && ts.length && route) {
          t.cd = 1 / s.rate;
          const n = t.level >= 5 ? 2 : 1;
          for (let i = 0; i < n; i++) spawnZone('tornado', ts[0].pos.clone(), 0.65, d.tornadoDur, t, s.dmg, ts[0].d + i * 0.8);
          playShot(d);
        }
        break;
      }
      case 'shock': {
        const ts = findTargets(t, s.range, 1);
        if (t.cd <= 0 && ts.length) {
          t.cd = 1 / s.rate;
          const stomp = () => {
            for (const e of enemies) if (canTarget(t, e) && dist2(e.pos, t.mesh.position) <= s.range * s.range) { damage(e, s.dmg, d.dt, t); applyStun(e, s.stun); if (d.slow) applySlow(e, d.slow, d.slowDur); }
            ring(t.mesh.position, s.range, d.c3, 0.4);
            if (d.id === 'quake') { shake = Math.max(shake, 0.12); Particles.emit(t.mesh.position.x, 0.15, t.mesh.position.z, 30, '#a08060', { speed: s.range * 2.5, up: 0.8, life: 0.5, size: 0.3, tint: false }); if (ud.hammer) ud.hammer.rotation.x = 0.9; }
          };
          stomp();
          if (d.id === 'quake' && t.level >= 5) setTimeout(() => { if (R && !R.over && towers.includes(t)) stomp(); }, 450);
          Particles.emit(t.mesh.position.x, 0.4, t.mesh.position.z, 24, d.c3, { speed: s.range * 3, up: 0.3, life: 0.35, size: 0.2, gravity: 0 });
          playShot(d);
        }
        if (ud.ring) ud.ring.rotation.z += dt * 3;
        break;
      }
      case 'aura': {
        const r2 = s.range * s.range;
        for (const e of enemies) if (e.alive && dist2(e.pos, t.mesh.position) <= r2) applySlow(e, s.slow, 0.15);
        if (Math.random() < dt * 6) { const a = Math.random() * 6.28, rr = Math.random() * s.range; Particles.emit(t.mesh.position.x + Math.cos(a) * rr, 0.2, t.mesh.position.z + Math.sin(a) * rr, 1, d.c3, { speed: 0.1, up: 0.6, life: 0.8, size: 0.2, gravity: 0 }); }
        if (t.level >= 5) { t.timer += dt; if (t.timer > 8) { t.timer = 0; for (const e of enemies) if (e.alive && dist2(e.pos, t.mesh.position) <= r2) applyStun(e, 1); ring(t.mesh.position, s.range, d.c3, 0.6); } }
        break;
      }
      case 'heal': {
        if (!demo && R.phase === 'wave' && !R.mode.creative) {
          t.timer += dt;
          if (t.timer >= s.healEvery) {
            t.timer = 0;
            const add = t.level >= 5 ? 2 : 1;
            if (R.lives < R.maxLives) {
              R.lives = Math.min(R.maxLives, R.lives + add);
              Particles.emit(World.castlePos.x, 1.2, World.castlePos.z, 20, '#5cff9d', { speed: 1.5, up: 2, life: 0.8 });
              floatText(World.castlePos, '+' + add + ' ❤', '#5cff9d');
            }
            Particles.emit(t.mesh.position.x, 1, t.mesh.position.z, 16, '#5cff9d', { speed: 1, up: 2, life: 0.8 });
            ui.hud && ui.hud();
          }
        }
        break;
      }
      case 'meteor': {
        const ts = findTargets(t, s.range, 1);
        if (t.cd <= 0 && ts.length) {
          t.cd = 1 / s.rate;
          fire(t, ts[0], s, { meteor: true });
          if (t.level >= 5) { const more = findTargets(t, s.range, 3); more.slice(1).forEach(e => fire(t, e, s, { meteor: true })); }
          Particles.emit(t.mesh.position.x, 1.5, t.mesh.position.z, 15, '#ff5a00', { speed: 0.5, up: 4, life: 0.6, gravity: -2 });
          playShot(d);
        }
        break;
      }
      case 'blackhole': {
        const ts = findTargets(t, s.range, 1);
        if (t.cd <= 0 && ts.length) {
          t.cd = 1 / s.rate;
          const m = new THREE.Group();
          Models.mesh(Models.sph(0.3, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }), 0, 0.6, 0, m, false);
          const sw = Models.mesh(Models.tor(0.5, 0.06, 6, 24), new THREE.MeshBasicMaterial({ color: 0xb44dff, transparent: true, opacity: 0.8 }), 0, 0.6, 0, m, false); sw.rotation.x = Math.PI / 2.3;
          m.position.copy(ts[0].pos); scene.add(m);
          holes.push({ mesh: m, sw, pos: ts[0].pos.clone(), t: 0, dur: d.holeDur * (t.level >= 5 ? 2 : 1), tower: t, dmg: s.dmg, r: 1.3 + 0.1 * t.level });
          playShot(d);
        }
        break;
      }
    }
  }
  function playShot(d) {
    const map = { cannon: 'shoot_cannon', archer: 'shoot_arrow', laser: 'shoot_laser', ice: 'shoot_ice', fire: 'shoot_fire', rocket: 'shoot_rocket', magic: 'shoot_magic', sniper: 'shoot_sniper',
      poison: 'shoot_cannon', tesla: 'shoot_zap', mortar: 'shoot_cannon', gatling: 'shoot_gun', water: 'shoot_water', plasma: 'shoot_magic', crystal: 'shoot_magic', shadow: 'shoot_magic',
      light: 'shoot_laser', drone: 'shoot_gun', bomb: 'shoot_cannon', multi: 'shoot_cannon', shock: 'shoot_shock', snake: 'shoot_zap', icelaser: 'shoot_ice', meteor: 'shoot_rocket', blackhole: 'shoot_shock', dragon: 'shoot_fire',
      crossbow: 'shoot_arrow', catapult: 'shoot_cannon', snowman: 'shoot_ice', ballista: 'shoot_sniper', acid: 'shoot_magic', beehive: 'shoot_gun', ninja: 'shoot_arrow',
      harpoon: 'shoot_sniper', mushroom: 'shoot_water', quake: 'stomp', storm: 'shoot_zap', tornado: 'shoot_water', mirror: 'shoot_laser', lava: 'shoot_fire',
      mech: 'shoot_gun', sun: 'shoot_sniper', phoenix: 'shoot_fire', cosmic: 'shoot_magic' };
    if (!demo) Audio2.play(map[d.id] || 'shoot_arrow');
  }

  // ---------------- Gegner-Logik ----------------
  function updateEnemies(dt, time) {
    // Sichtbarkeit unsichtbarer Gegner
    for (const e of enemies) {
      if (!e.invis && e.vanishT <= 0) { e.revealed = true; continue; }
      e.revealed = false;
      if (e.def.flicker && Math.sin(time * 2 + e.anim) > 0.3) { e.revealed = true; continue; }
      for (const t of towers) {
        const det = t.def.detect || t.def.reveal || t.level >= 4;
        const r = (towerStats(t).range || 2) * (det ? 1 : 0.4);
        if (dist2(t.mesh.position, e.pos) <= r * r) { e.revealed = true; break; }
      }
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i]; if (!e.alive) continue;
      const def = e.def;
      // Status-Effekte
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowF = 0; }
      if (e.curseT > 0) e.curseT -= dt;
      if (e.shredT > 0) { e.shredT -= dt; if (Math.random() < 0.06) Particles.emit(e.pos.x, 0.5 + e.pos.y, e.pos.z, 1, '#c6ff3d', { speed: 0.3, up: 0.4, life: 0.5, size: 0.15 }); }
      if (e.burnT > 0) { e.burnT -= dt; damage(e, e.burnDps * dt, 'fire', e.burnSrc && towers.includes(e.burnSrc) ? e.burnSrc : null); if (Math.random() < 0.3) Particles.emit(e.pos.x, 0.5, e.pos.z, 1, '#ff7a00', { speed: 0.3, up: 1.5, life: 0.4, size: 0.2, gravity: -1 }); if (!e.alive) continue; }
      if (e.poisonT > 0) { e.poisonT -= dt; damage(e, e.poisonDps * dt, 'poison', e.poisonSrc && towers.includes(e.poisonSrc) ? e.poisonSrc : null); if (Math.random() < 0.2) Particles.emit(e.pos.x, 0.5, e.pos.z, 1, '#9dff3d', { speed: 0.3, up: 0.8, life: 0.5, size: 0.2, gravity: -0.5 }); if (!e.alive) continue; }
      if (def.regen) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * def.regen * dt);
      if (def.healer) {
        e.healT -= dt;
        if (e.healT <= 0) {
          e.healT = 1.2;
          for (const o of enemies) if (o !== e && o.alive && dist2(o.pos, e.pos) < 2.2) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.05); Particles.emit(o.pos.x, 0.9, o.pos.z, 3, '#5cff9d', { speed: 0.5, up: 1, life: 0.5, size: 0.2 }); }
        }
      }
      if (def.boss) bossAbilities(e, dt);
      // Bewegung
      let spd = e.speed * (1 - e.slowF);
      if (e.stunT > 0) { e.stunT -= dt; spd = 0; }
      if (def.jump) {
        e.jumpT -= dt;
        if (e.jumpT <= 0 && e.stunT <= 0) { e.jumpT = 2.8 + Math.random(); e.jumpAnim = 0.5; e.d += 1.4; }
      }
      e.d += spd * dt;
      if (route && e.d >= route.len) { leak(e); continue; }
      if (route) World.routePos(route, e.d, e.pos, e.dir);
      // Visuals
      const m = e.mesh; const A = e.A;
      e.anim += dt * spd * 6;
      let y = 0;
      if (e.fly) y = 0.9 + Math.sin(time * 3 + e.anim) * 0.1;
      else if (A.float) y = A.float + Math.sin(time * 2 + e.anim) * 0.06;
      if (e.jumpAnim > 0) { e.jumpAnim -= dt; y += Math.sin((0.5 - e.jumpAnim) / 0.5 * Math.PI) * 0.9; }
      e.pos.y = y;
      m.position.set(e.pos.x, y, e.pos.z);
      if (A.blob) { A.blob.position.y = -y + 0.04; A.blob.material.opacity = 0.28 - Math.min(0.15, y * 0.05); }
      const yaw = Math.atan2(e.dir.x, e.dir.z);
      m.rotation.y = yaw;
      const sw = Math.sin(e.anim);
      A.legs.forEach((l, k) => l.rotation.x = sw * 0.6 * (k % 2 ? 1 : -1));
      A.arms.forEach((a, k) => { if (A.type === 'crystal') { a.position.y = 0.5 * def.size + Math.sin(time * 3 + k) * 0.05; } else a.rotation.x = sw * 0.5 * (k % 2 ? -1 : 1); });
      A.wings.forEach((w, k) => w.rotation.z = Math.sin(time * 12 + e.anim) * 0.6 * (k ? 1 : -1));
      if (A.squish) { const q = 1 + Math.sin(time * 8 + e.anim) * 0.12; A.squish.scale.set(1 / Math.sqrt(q), 0.8 * q, 1 / Math.sqrt(q)); }
      if (A.spin) A.spin.rotation.y += dt * 2;
      if (A.aura) A.aura.material.opacity = 0.2 + 0.15 * Math.sin(time * 4);
      if (A.shieldMesh) { A.shieldMesh.visible = e.shield > 0; A.shieldMesh.rotation.y += dt; }
      // Unsichtbarkeit / Treffer-Effekt
      const hidden = (e.invis || e.vanishT > 0);
      const op = hidden ? (e.revealed ? 0.55 : 0.18) : 1;
      if (m.userData.op !== op) { m.userData.op = op; setOpacity(m, op); }
      if (e.hitFlash > 0) { e.hitFlash -= dt; A.body.scale.setScalar(1.08); } else A.body.scale.setScalar(1);
      if (e.stunT > 0 && Math.random() < 0.15) Particles.emit(e.pos.x, A.topY + y + 0.1, e.pos.z, 1, '#fff35a', { speed: 0.5, up: 0.3, life: 0.4, size: 0.15, gravity: 0 });
      if (e.slowF > 0.05 && Math.random() < 0.08) Particles.emit(e.pos.x, 0.4 + y, e.pos.z, 1, '#bfefff', { speed: 0.3, up: 0.3, life: 0.5, size: 0.15 });
      // Lebensleiste
      const hurt = e.hp < e.maxHp || e.shield < e.maxShield || def.boss;
      A.hb.visible = hurt && (!hidden || e.revealed);
      if (A.hb.visible) {
        A.hb.quaternion.copy(World.camera.quaternion);
        const f = Math.max(0, e.hp / e.maxHp);
        A.hbFg.scale.x = A.hbW * f;
        A.hbFg.material.color.setHSL(f * 0.33, 0.85, 0.5);
        if (e.maxShield) { A.hbShield.visible = e.shield > 0; A.hbShield.scale.x = A.hbW * (e.shield / e.maxShield); }
      }
    }
  }
  function setOpacity(m, op) {
    m.traverse(o => {
      if (o.isMesh && o.material && !o.material.isMeshBasicMaterial) {
        if (!o.userData.ownMat) { o.material = o.material.clone(); o.userData.ownMat = true; o.userData.baseOp = o.material.opacity; }
        o.material.transparent = op < 1 || o.userData.baseOp < 1;
        o.material.opacity = Math.min(o.userData.baseOp, op);
        o.material.depthWrite = op >= 1;
      }
    });
  }
  function bossAbilities(e, dt) {
    const ab = e.def.abilities || [];
    if (e.vanishT > 0) e.vanishT -= dt;
    ab.forEach((a, i) => {
      e.abilT[i] -= dt;
      if (a === 'rage') { if (!e.raged && e.hp < e.maxHp * 0.5) { e.raged = true; e.speed *= 1.6; ui.toast && ui.toast(`😡 ${e.def.name} wird wütend!`, 'bad'); Particles.emit(e.pos.x, 1, e.pos.z, 60, '#ff2020', { speed: 3, up: 3, life: 0.8 }); Audio2.play('boss'); } return; }
      if (e.abilT[i] > 0) return;
      switch (a) {
        case 'stomp':
          e.abilT[i] = 8;
          for (const t of towers) if (dist2(t.mesh.position, e.pos) < 2.2 * 2.2) t.stun = Math.max(t.stun, 1.5);
          ring(e.pos, 2.2, '#c8a060', 0.6); shake = 0.4; Audio2.play('stomp');
          Particles.emit(e.pos.x, 0.2, e.pos.z, 40, '#a08060', { speed: 4, up: 1, life: 0.7, size: 0.35, tint: false });
          break;
        case 'freeze':
          e.abilT[i] = 8;
          for (const t of towers) if (dist2(t.mesh.position, e.pos) < 3 * 3) t.stun = Math.max(t.stun, 2.5);
          ring(e.pos, 3, '#bfefff', 0.8); Audio2.play('shoot_ice');
          Particles.emit(e.pos.x, 0.5, e.pos.z, 50, '#dff8ff', { speed: 4, up: 1.5, life: 0.9, size: 0.3 });
          break;
        case 'summon': {
          e.abilT[i] = 9;
          const sd = ENEMY_BY_ID[e.def.summon];
          for (let k = 0; k < 2; k++) { const c = spawnEnemy(sd, R.wave, 0.5, Math.max(0, e.d - 0.3 - k * 0.25), e.wave); if (c && e.wave && R.waves.get(e.wave)) { R.waves.get(e.wave).alive++; R.waves.get(e.wave).total++; } }
          Particles.emit(e.pos.x, 0.6, e.pos.z, 30, e.def.glow || '#ff4040', { speed: 2, up: 2, life: 0.6 });
          break;
        }
        case 'shieldregen':
          e.abilT[i] = 9;
          if (e.maxShield) { e.shield = Math.min(e.maxShield, e.shield + e.maxShield * 0.35); if (e.A.shieldMesh) e.A.shieldMesh.visible = true; }
          else { e.maxShield = e.maxHp * 0.1; e.shield = e.maxShield; }
          ring(e.pos, 1.5, '#5ab0ff', 0.5);
          break;
        case 'vanish':
          e.abilT[i] = 8; e.vanishT = 3;
          Particles.emit(e.pos.x, 1, e.pos.z, 40, '#6a3aa0', { speed: 2, up: 1, life: 0.8 });
          break;
      }
    });
  }

  // ---------------- Zonen (Gift, Lava, Tornado) ----------------
  function spawnZone(kind, pos, r, dur, tower, dps, routeD) {
    const m = new THREE.Group();
    if (kind === 'tornado') {
      for (let i = 0; i < 5; i++) { const ring = Models.mesh(Models.tor(0.18 + i * 0.09, 0.035, 5, 18), new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.55 - i * 0.06, depthWrite: false }), 0, 0.15 + i * 0.28, 0, m, false); ring.rotation.x = Math.PI / 2; }
    } else {
      const col = kind === 'lava' ? 0xff5a00 : 0x8dff3d;
      const disc = Models.mesh(Models.geo('zoneDisc', () => new THREE.CircleGeometry(1, 28)), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: kind === 'lava' ? 0.75 : 0.35, depthWrite: false }), 0, 0.06, 0, m, false);
      disc.rotation.x = -Math.PI / 2; disc.scale.setScalar(r); m.userData.disc = disc;
      if (kind === 'lava') { const rim = Models.mesh(Models.tor(1, 0.06, 5, 28), Models.M('#2a1a14'), 0, 0.06, 0, m, false); rim.rotation.x = Math.PI / 2; rim.scale.set(r, r, 1); }
    }
    m.position.copy(pos); m.position.y = 0;
    scene.add(m);
    zones.push({ kind, mesh: m, r, t: 0, dur, tower, dps, d: routeD });
  }
  function updateZones(dt, time) {
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i]; z.t += dt;
      const fade = Math.min(1, z.t * 4, (z.dur - z.t) * 3);
      if (z.kind === 'tornado') {
        z.d = Math.max(0, z.d - 2.2 * dt);   // läuft den Weg rückwärts
        World.routePos(route, z.d, z.mesh.position);
        z.mesh.rotation.y += dt * 9; z.mesh.scale.setScalar(Math.max(0.01, fade));
        for (const e of enemies) if (e.alive && dist2(e.pos, z.mesh.position) < z.r * z.r) {
          damage(e, z.dps * dt * 2, 'phys', z.tower);
          if (!e.def.boss) e.d = Math.max(0, Math.min(e.d, z.d + 0.1)); else e.d -= 0.3 * dt;   // mitreißen
        }
        if (Math.random() < 0.5) Particles.emit(z.mesh.position.x, 0.2, z.mesh.position.z, 1, '#e8f6ff', { speed: 1.5, up: 2, life: 0.5, size: 0.25, gravity: -1, tint: false });
      } else {
        if (z.mesh.userData.disc) z.mesh.userData.disc.material.opacity = (z.kind === 'lava' ? 0.75 : 0.35) * fade;
        for (const e of enemies) if (e.alive && !e.fly && dist2(e.pos, z.mesh.position) < z.r * z.r) {
          if (z.kind === 'lava') { if (!(e.def.immune && e.def.immune.includes('fire'))) { e.burnDps = Math.max(e.burnT > 0 ? e.burnDps : 0, z.dps); e.burnT = 1.5; e.burnSrc = z.tower; } }
          else if (!(e.def.immune && e.def.immune.includes('poison'))) { e.poisonDps = Math.max(e.poisonT > 0 ? e.poisonDps : 0, z.dps); e.poisonT = 1.5; e.poisonSrc = z.tower; }
        }
        if (Math.random() < (z.kind === 'lava' ? 0.4 : 0.6)) { const a = Math.random() * 6.28, rr = Math.random() * z.r; Particles.emit(z.mesh.position.x + Math.cos(a) * rr, 0.15, z.mesh.position.z + Math.sin(a) * rr, 1, z.kind === 'lava' ? '#ff8a1a' : '#9dff3d', { speed: 0.2, up: 0.8, life: 0.9, size: 0.3, gravity: -0.4 }); }
      }
      if (z.t >= z.dur) { scene.remove(z.mesh); z.mesh.traverse(o => { if (o.material && o.material.isMeshBasicMaterial) o.material.dispose(); }); zones.splice(i, 1); }
    }
  }

  function updateMines(dt) {
    for (let i = mines.length - 1; i >= 0; i--) {
      const m = mines[i];
      if (m.fly < 1) { m.fly = Math.min(1, m.fly + dt * 2); m.mesh.position.lerpVectors(m.from, m.pos, m.fly); m.mesh.position.y += Math.sin(m.fly * Math.PI) * 1.5; continue; }
      m.led.visible = Math.sin(performance.now() / 150) > 0;
      let trig = false;
      for (const e of enemies) if (e.alive && !e.fly && dist2(e.pos, m.pos) < 0.45 * 0.45) { trig = true; break; }
      if (trig) {
        for (const e of enemies) if (e.alive && !e.fly && dist2(e.pos, m.pos) < m.splash * m.splash) damage(e, m.dmg, 'explosive', m.tower);
        Particles.emit(m.pos.x, 0.2, m.pos.z, 30, '#ff8a3a', { speed: 3, up: 2.5, life: 0.5, size: 0.3 });
        ring(m.pos, m.splash, '#ff8a3a', 0.3); Audio2.play('explosion');
        if (m.cluster) for (let k = 0; k < 3; k++) { const q = m.pos.clone().add(new V3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2)); for (const e of enemies) if (e.alive && !e.fly && dist2(e.pos, q) < 0.5) damage(e, m.dmg * 0.4, 'explosive', m.tower); Particles.emit(q.x, 0.2, q.z, 10, '#ffb347', { speed: 2, life: 0.4 }); }
        scene.remove(m.mesh); mines.splice(i, 1);
      }
    }
  }
  function updateHoles(dt, time) {
    for (let i = holes.length - 1; i >= 0; i--) {
      const h = holes[i]; h.t += dt;
      const k = Math.min(1, h.t * 4, (h.dur - h.t) * 4);
      h.mesh.scale.setScalar(Math.max(0.01, k * (1 + 0.1 * Math.sin(time * 10))));
      h.sw.rotation.z += dt * 8;
      for (const e of enemies) if (e.alive && dist2(e.pos, h.pos) < h.r * h.r) {
        damage(e, h.dmg * dt, 'magic', h.tower, { pierce: true });
        e.d = Math.max(0, e.d - h.tower.def.pull * dt * (e.def.boss ? 0.25 : 1));
      }
      if (Math.random() < 0.6) { const a = Math.random() * 6.28; Particles.emit(h.pos.x + Math.cos(a) * h.r, 0.6, h.pos.z + Math.sin(a) * h.r, 1, '#b44dff', { speed: 0, up: 0, life: 0.5, size: 0.25, gravity: 0, dir: new V3(-Math.cos(a) * h.r * 2, 0, -Math.sin(a) * h.r * 2) }); }
      if (h.t >= h.dur) { scene.remove(h.mesh); holes.splice(i, 1); }
    }
  }
  function updateFx(dt) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.t += dt; const k = r.t / r.life;
      r.mesh.scale.setScalar(Math.max(0.01, r.r * (0.3 + 0.7 * k))); r.mesh.material.opacity = 0.8 * (1 - k);
      if (k >= 1) { scene.remove(r.mesh); r.mesh.material.dispose(); rings.splice(i, 1); }
    }
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]; b.t += dt; b.mesh.material.opacity = 1 - b.t / b.life;
      if (b.t >= b.life) { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); bolts.splice(i, 1); }
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.t += dt;
      const k = Math.min(1, p.t / 0.35);
      const s = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.25 - (1 - k) * 0.9 : 1;
      p.m.scale.setScalar(Math.max(0.01, s * p.s));
      if (k >= 1) { p.m.scale.setScalar(p.s); pops.splice(i, 1); }
    }
  }

  // ---------------- Floating Text ----------------
  const floats = [];
  function floatText(pos, text, color) {
    if (!Save.P.settings.damageNumbers || demo) return;
    if (floats.length > 25) return;
    const el = document.createElement('div'); el.className = 'float-text'; el.textContent = text; el.style.color = color;
    document.getElementById('floats').appendChild(el);
    floats.push({ el, pos: pos.clone().setY(1.2), t: 0 });
  }
  const _pv = new V3();
  function updateFloats(dt) {
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]; f.t += dt; f.pos.y += dt * 0.8;
      _pv.copy(f.pos).project(World.camera);
      f.el.style.transform = `translate(${(_pv.x * 0.5 + 0.5) * View.w}px, ${(-_pv.y * 0.5 + 0.5) * View.h}px) translate(-50%,-50%)`;
      f.el.style.opacity = String(1 - f.t);
      if (f.t >= 1) { f.el.remove(); floats.splice(i, 1); }
    }
  }

  // ---------------- Haupt-Update ----------------
  function update(rawDt, time) {
    if (!R) return;
    const castleFlag = castle && castle.userData.flag; if (castleFlag) castleFlag.rotation.y = Math.sin(time * 3) * 0.3;
    updateCastleBar(time);
    if (R.paused || R.over) { updateFloats(rawDt); return; }
    const dt = Math.min(rawDt, 0.05) * (demo ? 1 : R.speed);
    const steps = R.speed > 1 ? R.speed : 1;
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) step(sdt, time);
    if (!demo) R.stats.time += rawDt * R.speed, Save.P.stats.playTime += rawDt;
    R.skipCd = Math.max(0, ((R.skipUntil || 0) - performance.now()) / 1000);   // echte Sekunden
    updateFloats(rawDt);
    if (shake > 0) { shake -= rawDt; const k = shake * 0.15; World.camera.position.x += (Math.random() - 0.5) * k; World.camera.position.y += (Math.random() - 0.5) * k; }
  }
  function step(dt, time) {
    if (demo) demoSpawn(dt);
    else {
      // Spawnen
      if (R.spawnQueue.length) {
        R.spawnTimer -= dt;
        if (R.spawnTimer <= 0) {
          const s = R.spawnQueue.shift();
          const def = ENEMY_BY_ID[s.id];
          spawnEnemy(def, s.wave, s.hp, 0, s.wave);
          const info = R.waves.get(s.wave); if (info) info.queued--;
          Particles.emit(World.portalPos.x, 0.6, World.portalPos.z, 10, '#c060ff', { speed: 1.5, up: 1, life: 0.5 });
          R.spawnTimer = R.spawnQueue.length ? R.spawnQueue[0].delay : 0;
          if (info) checkWaveDone(s.wave);
        }
      } else if (R.phase === 'build' && R.pauseTimer > 0 && !R.hold) {
        R.pauseTimer -= dt;
        if (R.pauseTimer <= 0) { R.pauseTimer = 0; startWave('auto'); }
      }
    }
    // Buffs berechnen
    for (const t of towers) { t.buffDmg = 1; t.buffRate = 1; t.buffRange = 0; }
    for (const b of towers) if (b.def.type === 'buff') {
      const s = towerStats(b);
      for (const t of towers) if (t !== b && t.def.type !== 'buff' && dist2(t.mesh.position, b.mesh.position) <= s.range * s.range) {
        const k = b.def.id === 'totem' && b.level >= 5 ? 2 : 1;
        t.buffDmg += s.buffDmg * k; t.buffRate += s.buffRate * k; if (b.def.buffRangeAdd) t.buffRange += b.def.buffRangeAdd * k; else if (b.level >= 5) t.buffRange += 0.5;
      }
    }
    updateEnemies(dt, time);
    for (const t of towers) updateTower(t, dt, time);
    updateProjectiles(dt);
    updateMines(dt);
    if (!demo) updateTraps(dt, time);
    if (route) updateZones(dt, time);
    updateHoles(dt, time);
    updateFx(dt);
    if (!demo) updatePickups(dt, time);
  }

  // ---------------- Spielfigur: Hindernisse & Münzen zum Einsammeln ----------------
  const DECO_R = { tree: 0.3, house: 0.5, fountain: 0.45, crystalfountain: 0.45, statue: 0.3, goldstatue: 0.3, windmill: 0.35, lighthouse: 0.3, dragonstatue: 0.4, rock: 0.3, lantern: 0.1 };
  function obstacles() {
    const o = [];
    for (const t of towers) o.push({ x: t.mesh.position.x, z: t.mesh.position.z, r: 0.42, h: 1.3 });
    for (const [k, m] of decoMeshes) { const c = grid[+k.split(',')[0]][+k.split(',')[1]]; const r = c && DECO_R[c.id]; if (r) o.push({ x: m.position.x, z: m.position.z, r, h: 1.5 }); }
    if (castle) o.push({ x: castle.position.x, z: castle.position.z, r: 1.2, h: 3 });
    if (World.portalPos) { o.push({ x: World.portalPos.x, z: World.portalPos.z - 0.42, r: 0.15, h: 1.2 }); o.push({ x: World.portalPos.x, z: World.portalPos.z + 0.42, r: 0.15, h: 1.2 }); }
    return o;
  }
  const pickups = [];
  function spawnPickup(p, value) {
    const m = new THREE.Group();
    Models.mesh(Models.cyl(0.22, 0.22, 0.06, 18), Models.M('#ffd700', { e: '#c08a00', ei: 0.6 }), 0, 0, 0, m, false).rotation.x = Math.PI / 2;
    Models.mesh(Models.cyl(0.13, 0.13, 0.07, 14), Models.M('#ffef7a', { e: '#ffd000', ei: 0.6 }), 0, 0, 0, m, false).rotation.x = Math.PI / 2;
    m.add(Models.glow('#ffd700', 0.9, 0.6));
    m.position.set(p.x + (Math.random() - 0.5) * 0.4, 0.5, p.z + (Math.random() - 0.5) * 0.4);
    scene.add(m);
    pickups.push({ mesh: m, value, t: 0 });
  }
  function updatePickups(dt, time) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const c = pickups[i]; c.t += dt;
      c.mesh.rotation.y += dt * 4; c.mesh.position.y = 0.5 + Math.sin(time * 4 + i) * 0.1;
      if (c.t > 18) c.mesh.visible = Math.sin(c.t * 20) > 0;
      const pp = Player.pos;
      if (Player.active && Math.hypot(pp.x - c.mesh.position.x, pp.z - c.mesh.position.z) < 0.85 && pp.y < 1.6) {
        R.coins += c.value; R.stats.coins += c.value; if (!R.mode.creative) Save.P.stats.coinsEarned += c.value;
        Particles.emit(c.mesh.position.x, 0.6, c.mesh.position.z, 18, '#ffd700', { speed: 2, up: 2.5, life: 0.6, tint: false });
        floatText(c.mesh.position, '+' + c.value + ' 🪙', '#ffe14d'); Audio2.play('coin'); Audio2.play('sell');
        scene.remove(c.mesh); pickups.splice(i, 1); continue;
      }
      if (c.t > 22) { scene.remove(c.mesh); pickups.splice(i, 1); }
    }
  }

  // ---------------- Teilen / Import ----------------
  function exportLayout() {
    const data = { v: 1, n: Save.P.name, r: Save.P.layout.roads, d: Save.P.layout.decos, t: demo ? [] : towers.map(t => [t.def.id, t.x, t.z, t.plus]) };
    return 'BYOTD:' + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  }
  function parseLayout(code) {
    try {
      const raw = code.trim().replace(/^BYOTD:/, '');
      const d = JSON.parse(decodeURIComponent(escape(atob(raw))));
      if (!Array.isArray(d.r)) return null;
      const roads = d.r.filter(r => Array.isArray(r) && inPlot(r[0], r[1]) && ROAD_BY_ID[r[2]]);
      const decos = (d.d || []).filter(r => Array.isArray(r) && inPlot(r[0], r[1]) && DECO_BY_ID[r[2]]);
      return { name: String(d.n || 'Unbekannt').slice(0, 24), roads, decos, towers: (d.t || []).filter(t => TOWER_BY_ID[t[0]]) };
    } catch (e) { return null; }
  }

  return {
    fuse, bestSpot, choose, confirmPlace, cancelPending, get pending() { return pending; }, obstacles, available, buyRoadPieces, isBossWave, removeTrap, init, newRun, startDemo, update, setBuild, rotateBuild, hover, tap, paintStart, paint, paintEnd, upgrade, sell, select, startMove, startWave, towerStats, upgradeCost, sellValue,
    continueEndless, exportLayout, parseLayout, loadLayout, recalcRoute, placeCastle, snapshotRun, ui,
    get R() { return R; }, get traps() { return traps; }, get _grid() { return grid; }, get _floats() { return floats.length; }, get demo() { return demo; }, get selected() { return selected; }, get buildSel() { return buildSel; }, get route() { return route; },
    get enemies() { return enemies; }, get towers() { return towers; },
    stopDemo() { if (demo) { clearEntities(); demo = false; R = null; } },
    quit() { if (R && !demo && !R.over) snapshotRun(); clearEntities(); R = null; },
    rebuildRoadsVisual() { World.rebuildRoads(grid, skin()); },
    reloadLayoutKeepTowers() {
      const keep = towers.slice();
      loadLayout();
      for (const t of keep) {
        if (grid[t.x][t.z]) { sell(t); continue; }
        grid[t.x][t.z] = { type: 'tower', t };
      }
    },
  };
})();
