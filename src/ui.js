'use strict';
// ============================================================
//  Benutzeroberfläche: HUD, Baumenü, Menüs, Shop, Inventar …
// ============================================================
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = n => { n = Math.floor(n); return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k' : n.toLocaleString('de-DE'); };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------- Vorschaubilder (echte 3D-Modelle) ----------------
const Thumbs = (() => {
  let r = null, scene, cam;
  const cache = new Map(), queue = [], waiting = new Map();
  function setup() {
    const c = document.createElement('canvas'); c.width = c.height = 160;
    r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(160, 160, false); r.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 1.8); d.position.set(2, 4, 3); scene.add(d);
    cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  }
  function render(kind, id) {
    if (!r) setup();
    let obj, h = 1.3;
    if (kind === 'tower') { const def = TOWER_BY_ID[id]; obj = Models.makeTower(def, RARITIES[def.rarity].color); Models.applyTowerLevel(obj, 3); h = 1.5; }
    else if (kind === 'tower5') { const def = TOWER_BY_ID[id]; obj = Models.makeTower(def, RARITIES[def.rarity].color); Models.applyTowerLevel(obj, 5); h = 1.9; }
    else if (kind === 'enemy') { const def = ENEMY_BY_ID[id]; obj = Models.makeEnemy(def); obj.remove(obj.userData.A.hb); h = obj.userData.A.topY + (obj.userData.A.float || 0) + 0.2; obj.position.y = obj.userData.A.float || 0; if (def.fly) obj.position.y = 0.4; }
    else if (kind === 'deco') { obj = Models.makeDeco(id, BIOMES[0]); h = 1.2; }
    else if (kind === 'castle') { obj = Models.makeCastle(CASTLES.find(c => c.id === id)); h = 2; }
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj); const size = box.getSize(new THREE.Vector3()); const ctr = box.getCenter(new THREE.Vector3());
    const dist = Math.max(size.x, size.y, size.z) * 2.1 + 0.4;
    cam.position.set(ctr.x + dist * 0.62, ctr.y + dist * 0.42, ctr.z + dist * 0.68); cam.lookAt(ctr);
    r.render(scene, cam);
    const url = r.domElement.toDataURL('image/png');
    scene.remove(obj);
    return url;
  }
  function get(kind, id) { return cache.get(kind + ':' + id); }
  // Liefert sofort ein Bild-Tag; das Bild wird asynchron nachgeladen
  function img(kind, id, cls = '') {
    const key = kind + ':' + id;
    const u = cache.get(key);
    if (u) return `<img class="${cls}" src="${u}" alt="">`;
    if (!waiting.has(key)) { waiting.set(key, true); queue.push([kind, id]); pump(); }
    return `<img class="${cls}" data-thumb="${key}" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="">`;
  }
  let pumping = false;
  function pump() {
    if (pumping) return; pumping = true;
    const work = () => {
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < 12) {
        const [kind, id] = queue.shift(); const key = kind + ':' + id;
        try { cache.set(key, render(kind, id)); } catch (e) { cache.set(key, ''); }
        $$(`img[data-thumb="${key}"]`).forEach(el => { el.src = cache.get(key); el.removeAttribute('data-thumb'); });
      }
      if (queue.length) requestAnimationFrame(work); else pumping = false;
    };
    requestAnimationFrame(work);
  }
  function warm(list) { list.forEach(([k, i]) => { const key = k + ':' + i; if (!cache.has(key) && !waiting.has(key)) { waiting.set(key, true); queue.push([k, i]); } }); pump(); }
  return { img, get, warm };
})();

const UI = (() => {
  let curTab = 'towers';
  let screen = 'loading';
  let lastHud = {};
  let menuMode = null; // ausgewählter Modus im PLAY-Dialog
  let visiting = null;

  // ---------------- Toasts ----------------
  function toast(msg, kind = '') {
    const el = document.createElement('div'); el.className = 'toast ' + kind; el.innerHTML = msg;
    const box = $('#toasts'); box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, 2600);
  }
  function banner(t1, t2, cls = '', dur = 2000) {
    const b = $('#banner'); b.className = cls; b.innerHTML = `<div class="t1">${t1}</div>${t2 ? `<div class="t2">${t2}</div>` : ''}`;
    clearTimeout(banner._t); banner._t = setTimeout(() => b.classList.add('hidden'), dur);
  }

  // ---------------- Screens ----------------
  function show(s) {
    screen = s;
    $('#loading').classList.toggle('hidden', s !== 'loading');
    $('#mainmenu').classList.toggle('hidden', s !== 'menu');
    $('#hud').classList.toggle('hidden', s !== 'game');
  }
  function playerChip(el) {
    const P = Save.P; const need = xpForLevel(P.level);
    el.innerHTML = `<div class="av">${P.level}</div><div><div class="nm">${esc(P.name)}</div><div class="lv">Level ${P.level} · ${fmt(P.xp)} / ${fmt(need)} XP</div><div class="xpbar"><i style="width:${Math.min(100, P.xp / need * 100)}%"></i></div></div>`;
  }
  function refreshMenu() {
    playerChip($('#mmPlayer'));
    const P = Save.P;
    $('#mmCur').innerHTML = `<div class="res gems"><span>💎</span><b>${fmt(P.gems)}</b></div><div class="res crys"><span>🔮</span><b>${fmt(P.crystals)}</b></div>`;
    const db = $('#dailyBtn'); const av = Save.dailyRewardAvailable();
    db.classList.toggle('done', !av); db.textContent = av ? '🎁 Tagesbelohnung abholen!' : '✅ Belohnung abgeholt';
  }
  function goMenu() {
    closeModal(); Tut.stop(); Game.quit(); visiting = null; $('.visit-bar')?.remove();
    Player.remove(); CamCtl.setMode('free');
    show('menu'); refreshMenu();
    Game.startDemo(); CamCtl.setAuto(true); Audio2.setMood('menu');
    if (Save.openPicks()) setTimeout(picksScreen, 400); else Save.tidyPicks();
  }
  function startGame(modeId, biomeId, snapshot) {
    closeModal(); Save.tidyPicks();
    Game.stopDemo(); CamCtl.setAuto(false);
    const b = BIOME_BY_ID[biomeId] || BIOMES[0];
    Save.P.equipped.biome = b.id;
    World.buildEnvironment(b, Save.P.name);
    Game.newRun(modeId, b.id, snapshot);
    show('game'); curTab = 'towers'; renderBuildBar(); hud(true);
    Player.spawn(World.scene, Save.P.name, Save.P.settings.shirt, Save.P.settings.pants);
    setCamMode('follow');
    setBuildOpen(!isTouch());
    Tut.stop();
    if (Game.R.tutorial) { setBuildOpen(false); Tut.start(); }
    if (Game.R.tutorial) banner('TUTORIAL', 'Lerne, wie man spielt', '', 2000);
    else if (!snapshot) banner('Welle 1 kommt gleich!', 'Jede 5. Welle kommt ein Boss 👑', '', 2800);
    else banner('Willkommen zurück!', `Weiter bei Welle ${snapshot.wave + 1}`, '', 2000);
    Save.save();
  }

  // ---------------- Spielfigur / Kamera / Baumenü ----------------
  const isTouch = () => matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
  function setCamMode(m) {
    CamCtl.setMode(m, () => Player.pos);
    const b = $('#camMode'); if (b) b.textContent = m === 'follow' ? '👁 Übersicht' : '🧍 Figur';
  }
  function setBuildOpen(open) {
    document.body.classList.toggle('build-open', open);
    if (!open) Game.setBuild(null);
    Player.joy.x = Player.joy.y = 0;
  }
  function bindJoystick() {
    const joy = $('#joy'), knob = $('#joyKnob'); let id = null;
    const move = e => {
      const r = joy.getBoundingClientRect();
      const c = View.toLocal(r.left + r.width / 2, r.top + r.height / 2), p = View.toLocal(e.clientX, e.clientY);
      const max = joy.offsetWidth / 2 - 10;
      let dx = p.x - c.x, dy = p.y - c.y; const d = Math.hypot(dx, dy);
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      Player.joy.x = dx / max; Player.joy.y = dy / max;
    };
    const end = e => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; Player.joy.x = Player.joy.y = 0; };
    joy.addEventListener('pointerdown', e => { id = e.pointerId; joy.setPointerCapture(e.pointerId); Audio2.init(); move(e); e.preventDefault(); });
    joy.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
    const jb = $('#jumpBtn');
    jb.addEventListener('pointerdown', e => { e.preventDefault(); Player.jump(); });
  }

  // ---------------- HUD ----------------
  function bump(el, key, v) { if (lastHud[key] !== undefined && lastHud[key] !== v) { el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump'); } lastHud[key] = v; }
  function hud(force) {
    const R = Game.R; if (!R || screen !== 'game') return;
    const P = Save.P;
    const lives = R.mode.creative ? '∞' : R.lives, coins = R.mode.creative ? '∞' : fmt(R.coins);
    if (force || lastHud.c !== coins) { $('#resCoins').textContent = coins; bump($('#resCoins'), 'c', coins); }
    if (force || lastHud.l !== lives) { $('#resLives').textContent = lives; bump($('#resLives'), 'l', lives); }
    if (force || lastHud.g !== P.gems) { $('#resGems').textContent = fmt(P.gems); lastHud.g = P.gems; }
    const lvKey = P.level + ':' + P.xp + ':' + P.name;
    if (force || lastHud.lv !== lvKey) { playerChip($('#hudPlayer')); lastHud.lv = lvKey; }
    // Wellen-Anzeige
    let alive = 0, total = 0;
    for (const w of R.waves.values()) { alive += w.alive; total += w.total; }
    $('#wpWave').textContent = `Welle ${R.wave}`;
    const toBoss = 5 - (R.wave % 5);
    $('#wpMode').textContent = R.boss ? '👑 BOSS!' : (R.phase === 'wave' && Game.isBossWave(R.wave)) ? '👑 Bosswelle' : `👑 Boss in ${toBoss} Welle${toBoss > 1 ? 'n' : ''}`;
    $('#wpEnemies').textContent = R.phase === 'wave' ? `Gegner: ${alive} / ${total}` : 'Bauphase';
    $('#wpFill').style.width = (R.phase === 'wave' && total ? (1 - alive / total) * 100 : R.phase === 'build' ? 100 : 0) + '%';
    const nxt = R.wave + 1;
    const nb = Game.isBossWave(nxt);
    $('#wpNext').textContent = R.phase === 'build' && R.pauseTimer > 0 ? `Nächste: ${nxt}${nb ? ' 👑' : ''} in ${Math.ceil(R.pauseTimer)}s` : `Nächste: ${nxt}${nb ? ' 👑 BOSS' : ''}`;
    const wb = $('#waveBtn');
    let label = R.phase === 'build' ? (R.wave === 0 ? '▶ WELLE STARTEN' : R.pauseTimer > 0 ? '⏩ WELLE ÜBERSPRINGEN' : '▶ NÄCHSTE WELLE') : '⏩ WELLE ÜBERSPRINGEN';
    if (R.skipCd > 0) label = `⏳ Warten … ${Math.ceil(R.skipCd)}`;
    if (wb.textContent !== label) wb.textContent = label;
    wb.classList.toggle('skip', R.phase !== 'build' || R.pauseTimer > 0);
    wb.disabled = R.over || R.hold || R.skipCd > 0;
    wb.classList.toggle('hidden', !!R.tutorial && (R.hold || R.wave === 0));
    $('#speedBtn').textContent = R.speed + 'x';
    $('#pauseBtn').textContent = R.paused ? '▶' : '❚❚';
    // Boss
    const bb = $('#bossBar');
    if (R.boss && R.boss.alive) {
      bb.classList.remove('hidden');
      $('#bbName').textContent = `👑 ${R.boss.def.name} – ${fmt(Math.max(0, R.boss.hp))} / ${fmt(R.boss.maxHp)}`;
      $('#bbFill').style.width = Math.max(0, R.boss.hp / R.boss.maxHp * 100) + '%';
      $('#bbShield').style.width = (R.boss.maxShield ? R.boss.shield / R.boss.maxShield * 100 : 0) + '%';
    } else bb.classList.add('hidden');
    // Quest-Hinweis
    const ready = QUESTS.some(q => P.quests[q.id] !== 'claimed' && Save.questProgress(q) >= q.goal) || P.daily.list.some(d => !d.claimed && Save.dailyProgress(d) >= Save.dailyDef(d).goal);
    $('#questDot').classList.toggle('hidden', !ready);
    // Baumenü-Preise aktualisieren
    $$('#bbItems .item[data-cost]').forEach(el => { const c = +el.dataset.cost; const pr = el.querySelector('.pr'); if (pr) pr.classList.toggle('no', R.coins < c); });
    const rp = $('#roadCount'); if (rp && rp.textContent !== String(P.roadPieces)) rp.textContent = P.roadPieces;
    if (Game.selected && !$('#towerPanel').classList.contains('hidden')) {
      const key = Game.selected.plus + ':' + Game.selected.kills;
      if (lastHud.tp !== key) { towerPanel(Game.selected); }
    }
  }

  // ---------------- Baumenü ----------------
  function renderBuildBar() {
    const P = Save.P, R = Game.R, sel = Game.buildSel;
    const tut = R && R.tutorial;
    $$('#bbTabs button[data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === curTab); b.classList.toggle('hidden', tut && b.dataset.tab !== 'towers'); });
    let h = '';
    const isSel = (k, id) => sel && sel.kind === k && sel.id === id ? ' sel' : '';
    if (curTab === 'towers') {
      const list = TOWERS.filter(t => Save.invTotal(t.id) > 0).sort((a, b) => RARITIES[a.rarity].order - RARITIES[b.rarity].order || a.cost - b.cost);
      list.forEach(t => {
        for (let pl = MAX_PLUS; pl >= 0; pl--) {
          const tot = Save.inv(t.id, pl); if (!tot) continue;
          const av = Game.available('tower', t.id, pl);
          const on = sel && sel.kind === 'tower' && sel.id === t.id && (sel.plus || 0) === pl ? ' sel' : '';
          h += `<button class="item${av > 0 ? '' : ' locked'}${on}" data-kind="tower" data-id="${t.id}" data-plus="${pl}" title="${esc(t.name)}">
            <i class="rar" style="background:${RARITIES[t.rarity].color}"></i>${pl ? `<span class="pl" style="color:${PLUS_COLORS[pl]}">+${pl}</span>` : ''}
            ${Thumbs.img('tower', t.id)}<div class="nm">${esc(t.name)}</div><div class="pr">${av} / ${tot} frei</div></button>`;
        }
      });
      if (!tut) h += `<div class="item info">🎁 Neue Türme gibt es von <b>Bossen</b>. ⚗️ 3 gleiche Türme kannst du im <b>Inventar</b> zu einem stärkeren +1 fusen!</div>`;
    } else if (curTab === 'traps') {
      const list = TRAPS.filter(t => (P.trapInv[t.id] || 0) > 0);
      list.forEach(t => {
        const av = Game.available('trap', t.id);
        h += `<button class="item${av > 0 ? '' : ' locked'}${isSel('trap', t.id)}" data-kind="trap" data-id="${t.id}" title="${esc(t.desc)}"><i class="rar" style="background:${RARITIES[t.rarity].color}"></i><div class="ic">${t.icon}</div><div class="nm">${esc(t.name)}</div><div class="pr">${av} / ${P.trapInv[t.id]} frei</div></button>`;
      });
      h += `<div class="item info">${list.length ? '🪤 Fallen legst du auf den Weg. Mit 🧹 Abreißen nimmst du sie wieder auf.' : '🪤 Noch keine Fallen. Bosse lassen manchmal Fallen fallen!'}</div>`;
    } else if (curTab === 'roads') {
      h += `<div class="item info big">🛣️ Wegstücke: <b id="roadCount">${P.roadPieces}</b><br><small>Jedes neue Wegfeld braucht 1 Stück. Abreißen gibt es zurück.</small></div>`;
      h += `<button class="item" data-tool="buyroad1" data-cost="${ROAD_PIECE_PRICE}"><div class="ic">➕</div><div class="nm">1 Wegstück kaufen</div><div class="pr">🪙${ROAD_PIECE_PRICE}</div></button>`;
      h += `<button class="item" data-tool="buyroad5" data-cost="${ROAD_PIECE_PRICE * 5}"><div class="ic">📦</div><div class="nm">5 Wegstücke kaufen</div><div class="pr">🪙${ROAD_PIECE_PRICE * 5}</div></button>`;
      ROADS.forEach(r => {
        h += `<button class="item${isSel('road', r.id)}" data-kind="road" data-id="${r.id}"><div class="ic"><span style="display:inline-block;width:1.4em;height:1.4em;border-radius:6px;background:${r.color};border:3px solid ${r.edge};${r.width < 0.8 ? 'transform:scaleX(.6)' : ''}"></span></div><div class="nm">${esc(r.name)}</div><div class="pr">1 Stück</div></button>`;
      });
      h += `<button class="item${isSel('erase', 'erase')}" data-kind="erase" data-id="erase"><div class="ic">🧹</div><div class="nm">Weg abreißen</div><div class="pr">+1 Stück</div></button>`;
      h += `<div class="item info">ℹ️ Wege nur in der Pause zwischen den Wellen ändern. Kurven &amp; Kreuzungen entstehen automatisch. Es muss immer ein Weg zur Burg führen.</div>`;
    } else if (curTab === 'decos') {
      DECOS.forEach(d => {
        if (d.shop && !P.owned.decos.includes(d.id)) return;
        h += `<button class="item${isSel('deco', d.id)}" data-kind="deco" data-id="${d.id}" data-cost="${d.cost}">${Thumbs.img('deco', d.id)}<div class="nm">${esc(d.name)}</div><div class="pr">🪙${d.cost}</div></button>`;
      });
      h += `<button class="item" data-act="shop"><div class="ic">🛒</div><div class="nm">Mehr im Shop</div><div class="pr">💎</div></button>`;
    } else {
      h += `<button class="item${isSel('erase', 'erase')}" data-kind="erase" data-id="erase"><div class="ic">🧹</div><div class="nm">Abreißen</div><div class="pr">Weg/Falle/Deko</div></button>`;
      h += `<button class="item" data-tool="rotate"><div class="ic">🔄</div><div class="nm">Drehen (R)</div><div class="pr">${Game.buildSel ? 'aktiv' : '&nbsp;'}</div></button>`;
      h += `<button class="item" data-tool="cancel"><div class="ic">✋</div><div class="nm">Auswahl aufheben</div><div class="pr">Esc</div></button>`;
      h += `<button class="item" data-tool="grid"><div class="ic">#️⃣</div><div class="nm">Raster</div><div class="pr">${P.settings.showGrid ? 'an' : 'aus'}</div></button>`;
      h += `<button class="item" data-tool="sellall"><div class="ic">↩️</div><div class="nm">Alle Türme aufheben</div><div class="pr">ins Inventar</div></button>`;
    }
    $('#bbItems').innerHTML = h;
  }
  function onBuildItem(el) {
    const R = Game.R; if (!R) return;
    if (el.dataset.act) return action(el.dataset.act);
    const tool = el.dataset.tool;
    if (tool === 'rotate') return Game.rotateBuild();
    if (tool === 'cancel') return Game.setBuild(null);
    if (tool === 'buyroad1' || tool === 'buyroad5') { if (Game.buyRoadPieces(tool === 'buyroad1' ? 1 : 5)) renderBuildBar(); return; }
    if (tool === 'grid') { Save.P.settings.showGrid = !Save.P.settings.showGrid; Save.saveSoon(); renderBuildBar(); return; }
    if (tool === 'sellall') {
      if (!Game.towers.length) return toast('Keine Türme vorhanden');
      return confirmBox('Alle Türme aufheben? Sie kommen zurück ins Inventar (Upgrades gehen verloren, 70% der Upgrade-Münzen gibt es zurück).', () => { [...Game.towers].forEach(t => Game.sell(t)); });
    }
    const kind = el.dataset.kind, id = el.dataset.id;
    if (!kind) return;
    const plus = +(el.dataset.plus || 0);
    if ((kind === 'tower' || kind === 'trap') && Game.available(kind, id, plus) <= 0) { toast('Schon alle platziert – tippe einen Turm an und hebe ihn auf, um ihn umzustellen', 'bad'); return; }
    Audio2.play('click');
    const s = Game.buildSel;
    if (s && s.kind === kind && s.id === id && (s.plus || 0) === plus) Game.setBuild(null);
    else Game.setBuild({ kind, id, plus });
  }
  function buildChanged(sel) {
    renderBuildBar();
    const h = $('#buildHint');
    if (!sel) { h.classList.add('hidden'); return; }
    let name = sel.kind === 'tower' ? TOWER_BY_ID[sel.id].name + (sel.plus ? ' +' + sel.plus : '') : sel.kind === 'trap' ? TRAP_BY_ID[sel.id].name : sel.kind === 'road' ? ROAD_BY_ID[sel.id].name : sel.kind === 'deco' ? DECO_BY_ID[sel.id].name : sel.kind === 'move' ? 'Turm verschieben' : 'Abreißen';
    const touch = matchMedia('(pointer:coarse)').matches;
    const how = sel.kind === 'road' || sel.kind === 'erase' || sel.kind === 'trap' ? (touch ? 'Tippen oder Finger ziehen' : 'Klicken oder ziehen') : (touch ? 'Aufs Feld tippen zum Platzieren' : 'Klicken zum Platzieren · R: drehen');
    h.innerHTML = `<b>${esc(name)}</b><span>${how}</span>${sel.kind !== 'road' && sel.kind !== 'erase' ? '<button class="btn small" data-tool="rotate">🔄</button>' : ''}<button class="btn small red" data-tool="cancel">✕</button>`;
    h.classList.remove('hidden');
  }

  // ---------------- Turm-Panel ----------------
  // Werte eines Turms bei Fusionsstufe pl (für Panel & Inventar)
  function statRows(def, pl, cmp) {
    const fake = { def, plus: pl, level: plusVisual(pl), buffDmg: 1, buffRate: 1, buffRange: 0 };
    const s = Game.towerStats(fake);
    let n = null; if (cmp && pl < MAX_PLUS) n = Game.towerStats({ ...fake, plus: pl + 1, level: plusVisual(pl + 1) });
    const up = (a, b, dec = 0) => n && b > a + 1e-6 ? ` <span class="up">▲${dec ? b.toFixed(dec) : fmt(b)}</span>` : '';
    const rows = [];
    if (def.dmg) rows.push(`<div>💥 Schaden${def.type === 'beam' ? '/s' : ''}<br><b>${fmt(s.dmg)}</b>${n ? up(s.dmg, n.dmg) : ''}</div>`);
    if (s.range) rows.push(`<div>🎯 Reichweite<br><b>${s.range.toFixed(1)}</b>${n ? up(s.range, n.range, 1) : ''}</div>`);
    if (def.rate && def.type !== 'beam') rows.push(`<div>⚡ Tempo<br><b>${s.rate.toFixed(2)}/s</b>${n ? up(s.rate, n.rate, 2) : ''}</div>`);
    if (s.splash) rows.push(`<div>💣 Explosion<br><b>${s.splash.toFixed(1)}</b></div>`);
    if (s.slow) rows.push(`<div>🧊 Verlangsamt<br><b>${Math.round(s.slow * 100)}%</b></div>`);
    if (s.chains) rows.push(`<div>⛓️ Sprünge<br><b>${s.chains}</b></div>`);
    if (s.targets > 1) rows.push(`<div>🎯 Ziele<br><b>${s.targets}</b></div>`);
    if (s.dot || s.burn) rows.push(`<div>${s.dot ? '☠️ Gift' : '🔥 Brand'}/s<br><b>${fmt(s.dot || s.burn)}</b></div>`);
    if (s.income) rows.push(`<div>🪙 Pro Welle<br><b>${fmt(s.income)}</b>${n ? up(s.income, n.income) : ''}</div>`);
    if (s.healEvery) rows.push(`<div>❤️ Heilt alle<br><b>${s.healEvery.toFixed(0)}s</b></div>`);
    if (s.buffDmg) rows.push(`<div>📯 Verstärkung<br><b>+${Math.round(s.buffDmg * 100)}%</b></div>`);
    return rows.join('');
  }
  const plusTag = pl => pl > 0 ? `<span class="plus" style="color:${PLUS_COLORS[pl]}">+${pl}</span>` : '';
  function towerPanel(t) {
    const el = $('#towerPanel');
    document.body.classList.toggle('tp-open', !!(t && Game.R));
    if (!t || !Game.R) { el.classList.add('hidden'); return; }
    const R = Game.R, d = t.def, pl = t.plus || 0;
    lastHud.tp = pl + ':' + t.kills;
    const hasTarget = !['heal', 'buff', 'aura', 'gold', 'mine', 'shock'].includes(d.type);
    const own = Save.inv(d.id, pl);
    el.innerHTML = `<button class="tp-close" data-tp="close">✕</button>
      <div class="tp-head">${Thumbs.img('tower', d.id)}<div><div class="tp-name">${esc(d.name)} ${plusTag(pl)}</div>
      <div style="font-size:.75em;color:${RARITIES[d.rarity].color};font-weight:900">${RARITIES[d.rarity].name}</div>
      <div style="font-size:.78em">Besiegt: <b>${t.kills}</b>${t.buffDmg > 1 ? ` · Verstärkt +${Math.round((t.buffDmg - 1) * 100)}%` : ''}</div></div></div>
      <div class="tp-stats">${statRows(d, pl, false)}</div>
      <div class="tp-spec">✨ ${esc(d.desc)}<br>${t.level >= 5 ? '👑 <b>' + esc(d.lv5) + '</b> (aktiv)' : '🔒 Ab +7: ' + esc(d.lv5)}</div>
      ${hasTarget ? `<div class="tp-target">${[['first', 'Erster'], ['last', 'Letzter'], ['strong', 'Stärkster'], ['close', 'Nächster']].map(([k, n]) => `<button data-tp="tg" data-v="${k}" class="${t.targeting === k ? 'on' : ''}">${n}</button>`).join('')}</div>` : ''}
      <div class="tp-btns">
        ${R.tutorial ? '' : `<button class="btn purple wide" data-tp="fuse">⚗️ FUSE ${own >= 3 && pl < MAX_PLUS ? '– jetzt möglich!' : `(${own}/3 gleiche)`}</button>`}
        <button class="btn red" data-tp="sell">↩ AUFHEBEN</button>
        ${R.tutorial ? '' : '<button class="btn gray" data-tp="move">↔ Verschieben</button>'}
      </div>`;
    el.classList.remove('hidden');
  }

  // ---------------- Modal-Helfer ----------------
  function openModal(title, html, compact) {
    $('#modalTitle').innerHTML = title; $('#modalBody').innerHTML = html;
    $('.modal-box').classList.toggle('compact', !!compact);
    $('#modal').classList.remove('hidden');
    $('#modalBody').scrollTop = 0;
    if (Game.R && !Game.demo && screen === 'game') { Game.R._wasPaused = Game.R.paused; Game.R.paused = true; }
  }
  function closeModal() {
    if ($('#modal').classList.contains('hidden')) return;
    $('#modal').classList.add('hidden');
    if (Game.R && !Game.demo && screen === 'game' && !Game.R.over) Game.R.paused = !!Game.R._wasPaused;
    modalState = null;
    if (screen === 'menu') refreshMenu();
    if (screen === 'game') { renderBuildBar(); hud(true); }
  }
  function confirmBox(text, yes) {
    const prev = modalState;
    openModal('Bestätigen', `<p style="font-size:1.05em">${text}</p><div class="row"><button class="btn green" id="cfYes">Ja</button><button class="btn gray" id="cfNo">Abbrechen</button></div>`, true);
    $('#cfYes').onclick = () => { closeModal(); yes(); };
    $('#cfNo').onclick = () => closeModal();
  }
  let modalState = null;
  const rarityBadge = r => `<span class="rb" style="background:${RARITIES[r].color}">${RARITIES[r].name}</span>`;

  // ---------------- PLAY: direkt los (immer Endlos) ----------------
  function playDialog() {
    const P = Save.P;
    if (!P.tutorialDone) return startGame('endless', P.equipped.biome);
    if (P.run) return startGame('endless', P.run.biome, P.run);
    startGame('endless', P.equipped.biome);
  }

  // ---------------- Inventar / Türme / Sammlung ----------------
  function towerDetail(t) {
    const P = Save.P; const own = Save.invTotal(t.id);
    const rows = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(pl => {
      const d = t.dmg * plusDmg(pl), r = t.range ? t.range + plusRange(pl) : 0, s = t.rate * plusRate(pl);
      return `<tr><td>+${pl}</td><td>${t.dmg ? fmt(d) : '–'}</td><td>${r ? r.toFixed(1) : '–'}</td><td>${t.rate && t.type !== 'beam' ? s.toFixed(2) : '–'}</td><td>${Save.inv(t.id, pl) || '–'}</td></tr>`;
    }).join('');
    const tags = [t.air ? '✈️ Trifft Flieger' : '', t.ground ? '🦶 Nur Boden' : '', t.detect ? '👁️ Erkennt Unsichtbare' : '', t.pierce ? '🛡️ Durchschlägt Rüstung' : ''].filter(Boolean).join(' · ');
    return `<div class="detail">${Thumbs.img('tower5', t.id)}<div style="flex:1"><h3>${esc(t.name)} ${rarityBadge(t.rarity)}</h3><p>${esc(t.desc)}</p><p>👑 Ab +7: ${esc(t.lv5)}</p><p style="opacity:.8">${tags || ''}</p>
      <p>${own ? `✅ Im Besitz: ${own}x` : '🔒 Noch nicht erhalten – Bosse geben dir neue Türme!'}</p>
      <table class="lvt"><tr><th></th><th>Schaden</th><th>Reichw.</th><th>Rate</th><th>Besitz</th></tr>${rows}</table></div></div>`;
  }
  function towersScreen(title = '🏰 TOWERS') {
    const P = Save.P;
    let q = '', rar = 'all', sort = 'cost', own = 'all', det = null;
    openModal(title, '');
    const render = () => {
      let list = TOWERS.filter(t => (!q || t.name.toLowerCase().includes(q)) && (rar === 'all' || t.rarity === rar) && (own === 'all' || (own === 'own') === !!Save.invTotal(t.id)));
      const sorters = { cost: (a, b) => a.cost - b.cost, name: (a, b) => a.name.localeCompare(b.name), rarity: (a, b) => RARITIES[b.rarity].order - RARITIES[a.rarity].order, dmg: (a, b) => b.dmg * b.rate - a.dmg * a.rate, range: (a, b) => b.range - a.range };
      list.sort(sorters[sort]);
      let h = `<div class="filters"><input id="fq" placeholder="🔍 Suchen…" value="${esc(q)}"><select id="fr"><option value="all">Alle Seltenheiten</option>${Object.entries(RARITIES).map(([k, r]) => `<option value="${k}" ${rar === k ? 'selected' : ''}>${r.name}</option>`).join('')}</select>
        <select id="fo"><option value="all">Alle</option><option value="own" ${own === 'own' ? 'selected' : ''}>Im Besitz</option><option value="locked" ${own === 'locked' ? 'selected' : ''}>Noch nicht erhalten</option></select>
        <select id="fs">${[['cost', 'Kosten'], ['name', 'Name'], ['rarity', 'Seltenheit'], ['dmg', 'Schaden'], ['range', 'Reichweite']].map(([k, n]) => `<option value="${k}" ${sort === k ? 'selected' : ''}>Sortieren: ${n}</option>`).join('')}</select></div>
        <div style="font-size:.85em;margin-bottom:.5em">Im Besitz: <b>${Save.stat('towersUnlocked')} / ${TOWERS.length}</b> verschiedene Türme · Neue Türme gibt es von Bossen.</div>`;
      if (det) h += towerDetail(TOWER_BY_ID[det]);
      h += `<div class="cards">${list.map(t => { const n = Save.invTotal(t.id); return `<div class="card${n ? '' : ' locked'}" data-t="${t.id}" style="border-color:${RARITIES[t.rarity].color}"><span class="tag">${n ? n + 'x' : '🔒'}</span>${Thumbs.img('tower', t.id)}<div class="nm">${esc(t.name)}</div>${rarityBadge(t.rarity)}</div>`; }).join('') || '<p>Keine Türme gefunden.</p>'}</div>`;
      $('#modalBody').innerHTML = h;
      const fq = $('#fq'); fq.oninput = () => { q = fq.value.toLowerCase(); const pos = fq.selectionStart; render(); const n = $('#fq'); n.focus(); n.setSelectionRange(pos, pos); };
      $('#fr').onchange = e => { rar = e.target.value; render(); };
      $('#fo').onchange = e => { own = e.target.value; render(); };
      $('#fs').onchange = e => { sort = e.target.value; render(); };
      $$('.card[data-t]').forEach(c => c.onclick = () => { det = c.dataset.t; Audio2.play('click'); render(); $('#modalBody').scrollTop = 0; });
    };
    render();
  }
  // Detailansicht mit FUSE-Knopf
  function fuseDetail(id, pl) {
    const t = TOWER_BY_ID[id], n = Save.inv(id, pl), can = n >= 3 && pl < MAX_PLUS;
    const placed = Game.R && !Game.demo ? Game.towers.filter(x => x.def.id === id && x.plus === pl).length : 0;
    return `<div class="detail fuse-box">${Thumbs.img('tower', id)}<div style="flex:1"><h3>${esc(t.name)} ${plusTag(pl)} ${rarityBadge(t.rarity)}</h3>
      <p>Du hast <b>${n}x</b> ${esc(t.name)} ${pl ? '+' + pl : ''}${placed ? ` (${placed} davon stehen auf dem Feld)` : ''}.</p>
      <div class="tp-stats">${statRows(t, pl, can)}</div>
      ${pl >= MAX_PLUS ? '<p>💠 Höchste Stufe erreicht!</p>' : `<p>⚗️ <b>Fuse:</b> 3x ${esc(t.name)}${pl ? ' +' + pl : ''} ➜ 1x ${esc(t.name)} <b style="color:${PLUS_COLORS[pl + 1]}">+${pl + 1}</b> (grüne Werte)${placed && can ? '<br><small>Türme auf dem Feld werden dafür automatisch aufgehoben.</small>' : ''}</p>`}
      <div class="row" style="justify-content:flex-start">${pl < MAX_PLUS ? `<button class="btn purple big" id="fuseBtn" ${can ? '' : 'disabled'}>⚗️ FUSE${can ? '' : ` (${n}/3)`}</button>` : ''}<button class="btn gray" id="fuseNo">Nicht fusen</button></div></div></div>`;
  }
  function inventoryScreen(focus) {
    const P = Save.P;
    let tab = 'towers', q = '', rar = 'all';
    let det = focus || null;
    openModal('🎒 INVENTORY', '');
    const render = () => {
      const tabs = [['towers', '🏰 Türme'], ['traps', '🪤 Fallen & Wege'], ['skins', '🛣️ Straßen-Skins'], ['effects', '✨ Effekte'], ['castles', '🏯 Burgen'], ['biomes', '🌍 Biome'], ['decos', '🗿 Spezialgebäude'], ['boosts', '⚡ Boosts']];
      let h = `<div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="filters"><input id="iq" placeholder="🔍 Suchen…" value="${esc(q)}"><select id="ir"><option value="all">Alle Seltenheiten</option>${Object.entries(RARITIES).map(([k, r]) => `<option value="${k}" ${rar === k ? 'selected' : ''}>${r.name}</option>`).join('')}</select></div>`;
      const match = (name, r) => (!q || name.toLowerCase().includes(q)) && (rar === 'all' || r === rar);
      let cards = '';
      if (tab === 'towers') {
        if (det) h += fuseDetail(det.id, det.plus);
        cards = '';
        TOWERS.filter(t => Save.invTotal(t.id) && match(t.name, t.rarity)).forEach(t => {
          for (let pl = MAX_PLUS; pl >= 0; pl--) {
            const n = Save.inv(t.id, pl); if (!n) continue;
            const can = n >= 3 && pl < MAX_PLUS;
            const on = det && det.id === t.id && det.plus === pl;
            cards += `<div class="card${on ? ' eq' : ''}${can ? ' canfuse' : ''}" data-inv="${t.id}" data-plus="${pl}" style="border-color:${RARITIES[t.rarity].color}"><span class="tag">${n}x</span>${pl ? `<span class="pl" style="color:${PLUS_COLORS[pl]}">+${pl}</span>` : ''}${Thumbs.img('tower', t.id)}<div class="nm">${esc(t.name)}</div>${rarityBadge(t.rarity)}${can ? '<div class="sub fuse-ok">⚗️ Fuse möglich!</div>' : `<div class="sub">${n}/3 zum Fusen</div>`}</div>`;
          }
        });
        cards += `<div class="card" data-go="towers"><div class="ic">📚</div><div class="nm">Alle Türme ansehen</div><div class="sub">${Save.stat('towersUnlocked')}/${TOWERS.length}</div></div>`;
      } else if (tab === 'traps') {
        cards = `<div class="card"><div class="ic">🛣️</div><div class="nm">Wegstücke</div><div class="sub">${P.roadPieces} Stück</div></div>`;
        cards += TRAPS.filter(t => P.trapInv[t.id] && match(t.name, t.rarity)).map(t => `<div class="card" style="border-color:${RARITIES[t.rarity].color}"><span class="tag">${P.trapInv[t.id]}x</span><div class="ic">${t.icon}</div><div class="nm">${esc(t.name)}</div>${rarityBadge(t.rarity)}<div class="sub">${esc(t.desc)}</div></div>`).join('');
      } else if (tab === 'skins' || tab === 'effects' || tab === 'castles') {
        const list = tab === 'skins' ? ROAD_SKINS : tab === 'effects' ? EFFECTS : CASTLES;
        const slot = tab === 'skins' ? 'skin' : tab === 'effects' ? 'effect' : 'castle';
        cards = list.filter(i => P.owned[tab].includes(i.id) && match(i.name, i.rarity)).map(i => {
          const eq = P.equipped[slot] === i.id;
          const pic = tab === 'castles' ? Thumbs.img('castle', i.id) : `<div class="ic"><span style="display:inline-block;width:1.2em;height:1.2em;border-radius:10px;background:${i.tint === 'rainbow' ? 'conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)' : (i.tint || '#9b9a94')}"></span></div>`;
          return `<div class="card${eq ? ' eq' : ''}" style="border-color:${RARITIES[i.rarity].color}">${eq ? '<span class="tag">✅</span>' : ''}${pic}<div class="nm">${esc(i.name)}</div>${rarityBadge(i.rarity)}<button class="btn small ${eq ? 'gray' : 'green'} buy" data-eq="${slot}" data-id="${i.id}" ${eq ? 'disabled' : ''}>${eq ? 'Ausgerüstet' : 'Ausrüsten'}</button></div>`;
        }).join('');
      } else if (tab === 'biomes') {
        cards = BIOMES.filter(b => P.owned.biomes.includes(b.id) && match(b.name, 'common')).map(b => { const eq = P.equipped.biome === b.id; return `<div class="card${eq ? ' eq' : ''}"><div class="ic" style="background:linear-gradient(${b.sky},${b.ground});border-radius:10px">🌍</div><div class="nm">${esc(b.name)}</div><button class="btn small ${eq ? 'gray' : 'green'} buy" data-eq="biome" data-id="${b.id}" ${eq ? 'disabled' : ''}>${eq ? 'Ausgewählt' : 'Auswählen'}</button><div class="sub">gilt ab der nächsten Runde</div></div>`; }).join('');
      } else if (tab === 'decos') {
        cards = DECOS.filter(d => d.shop && P.owned.decos.includes(d.id) && match(d.name, 'rare')).map(d => `<div class="card">${Thumbs.img('deco', d.id)}<div class="nm">${esc(d.name)}</div><div class="sub">Im Baumenü unter Deko</div></div>`).join('');
      } else if (tab === 'boosts') {
        cards = BOOSTS.filter(b => P.boosts[b.id] && match(b.name, b.rarity)).map(b => `<div class="card" style="border-color:${RARITIES[b.rarity].color}"><div class="ic">⚡</div><div class="nm">${esc(b.name)}</div><div class="sub">${P.boosts[b.id]} / ${b.max}</div></div>`).join('');
      }
      h += `<div class="cards">${cards || '<p style="opacity:.8">Noch nichts hier – schau im 🛒 Shop vorbei!</p>'}</div>`;
      $('#modalBody').innerHTML = h;
      $$('.tabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; Audio2.play('click'); render(); });
      const iq = $('#iq'); iq.oninput = () => { q = iq.value.toLowerCase(); const p = iq.selectionStart; render(); const n = $('#iq'); n.focus(); n.setSelectionRange(p, p); };
      $('#ir').onchange = e => { rar = e.target.value; render(); };
      $$('[data-eq]').forEach(b => b.onclick = () => { equip(b.dataset.eq, b.dataset.id); render(); });
      $$('[data-inv]').forEach(c => c.onclick = () => { det = { id: c.dataset.inv, plus: +c.dataset.plus }; Audio2.play('click'); render(); $('#modalBody').scrollTop = 0; });
      const fb = $('#fuseBtn');
      if (fb) fb.onclick = () => {
        const r = Game.fuse(det.id, det.plus);
        if (!r) return;
        toast(`⚗️ Fusion! ${esc(TOWER_BY_ID[det.id].name)} <b>+${det.plus + 1}</b>${r.removed ? ` (${r.removed} vom Feld aufgehoben)` : ''}`, 'gold');
        Particles.emit(Player.pos.x, 2, Player.pos.z, 60, PLUS_COLORS[det.plus + 1], { speed: 4, up: 5, life: 1.2, size: 0.3, tint: false });
        det = Save.inv(det.id, det.plus) >= 3 ? det : { id: det.id, plus: det.plus + 1 };
        render(); $('#modalBody').scrollTop = 0;
      };
      const fn = $('#fuseNo'); if (fn) fn.onclick = () => { det = null; render(); };
      $$('[data-go="towers"]').forEach(b => b.onclick = () => towersScreen());
    };
    render();
  }
  function equip(slot, id) {
    Save.P.equipped[slot] = id; Save.save(); Audio2.play('upgrade');
    if (slot === 'skin') Game.rebuildRoadsVisual();
    if (slot === 'effect') Particles.setTint(EFFECTS.find(e => e.id === id));
    if (slot === 'castle') Game.placeCastle();
    if (slot === 'biome' && screen === 'menu') { World.buildEnvironment(BIOME_BY_ID[id], Save.P.name); Game.startDemo(); }
    toast('✅ Ausgerüstet', 'good');
  }
  function collectionScreen() {
    const P = Save.P; let det = null;
    openModal('📖 COLLECTION – Bestiarium', '');
    const render = () => {
      const seen = Object.keys(P.seen).length;
      let h = `<div style="font-size:.85em;margin-bottom:.5em">Entdeckte Gegner: <b>${seen} / ${ENEMIES.length}</b> · Besiege Gegner, um mehr über sie zu erfahren.</div>`;
      if (det) {
        const e = ENEMY_BY_ID[det];
        const traits = [e.fly && '✈️ Fliegt', e.invis && '👻 Unsichtbar', e.armor && `🛡️ Rüstung ${Math.round(e.armor * 100)}%`, e.shield && '🔵 Schild', e.healer && '💚 Heilt andere', e.jump && '🦘 Springt', e.split && `💥 Teilt sich in ${e.split}`, e.regen && '♻️ Regeneriert', e.immune && `🚫 Immun: ${e.immune.join(', ')}`, e.resist && `🧪 Resistent: ${Object.keys(e.resist).join(', ')}`, e.curser && '☠️ Verflucht Türme', e.boss && '👑 Boss', e.abilities && `⚡ Fähigkeiten: ${e.abilities.join(', ')}`].filter(Boolean);
        h += `<div class="detail">${Thumbs.img('enemy', e.id)}<div><h3>${esc(e.name)}</h3><p>${esc(e.kind)}</p><p>❤️ Basis-Leben ${fmt(e.hp)} · 👟 Tempo ${e.speed} · 🪙 ${e.reward}</p><p>${traits.join(' · ') || 'Keine Besonderheiten'}</p><p>Besiegt: <b>${P.killsBy[e.id] || 0}</b></p></div></div>`;
      }
      h += `<div class="cards">${ENEMIES.map(e => { const s = P.seen[e.id]; return `<div class="card${s ? '' : ' locked'}" data-e="${e.id}" ${e.boss ? 'style="border-color:#ff4d6a"' : ''}>${s ? Thumbs.img('enemy', e.id) : '<div class="ic">❓</div>'}<div class="nm">${s ? esc(e.name) : '???'}</div><div class="sub">${s ? esc(e.kind) : 'Unentdeckt'}</div></div>`; }).join('')}</div>`;
      $('#modalBody').innerHTML = h;
      $$('.card[data-e]').forEach(c => c.onclick = () => { if (!P.seen[c.dataset.e]) return toast('❓ Noch nicht entdeckt'); det = c.dataset.e; render(); $('#modalBody').scrollTop = 0; });
    };
    render();
  }

  // ---------------- Shop ----------------
  function shopScreen() {
    const P = Save.P; let tab = 'roads';
    openModal('🛒 SHOP', '');
    const towerPrice = t => t.shop ? { crystals: t.shop.crystals } : { gems: Math.max(40, t.level * 14) };
    const render = () => {
      const tabs = [['roads', '🛣️ Wegstücke'], ['decos', '🗿 Besondere Gebäude'], ['skins', '🛣️ Straßen-Skins'], ['biomes', '🌍 Landschaften'], ['effects', '✨ Effekte'], ['castles', '🏯 Burgen'], ['boosts', '⚡ Boosts']];
      let h = `<div class="cur-row" style="margin-bottom:.6em"><div class="res gems"><span>💎</span><b>${fmt(P.gems)}</b></div><div class="res crys"><span>🔮</span><b>${fmt(P.crystals)}</b></div></div>
        <div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
      const price = p => p.crystals ? `🔮 ${p.crystals}` : p.gems ? `💎 ${p.gems}` : 'Gratis';
      const afford = p => (p.crystals ? P.crystals >= p.crystals : P.gems >= (p.gems || 0));
      let items = [];
      if (tab === 'roads') items = [{ id: 'roads10', name: '10 Wegstücke', desc: `Du hast ${P.roadPieces}. Damit kannst du den Weg der Gegner verlängern und umbauen.`, rarity: 'uncommon', price: { gems: 40 }, pic: '<div class="ic">🛣️</div>' }, { id: 'roads30', name: '30 Wegstücke', desc: 'Großes Paket für ein langes Labyrinth.', rarity: 'rare', price: { gems: 100 }, pic: '<div class="ic">🏗️</div>' }];
      if (tab === 'decos') items = DECOS.filter(d => d.shop).map(d => ({ id: d.id, name: d.name, desc: 'Dekoratives Spezialgebäude für dein Grundstück.', rarity: 'rare', price: { gems: d.cost }, owned: P.owned.decos.includes(d.id), pic: Thumbs.img('deco', d.id) }));
      if (tab === 'skins') items = ROAD_SKINS.map(s => ({ id: s.id, name: s.name, desc: s.desc, rarity: s.rarity, price: s.crystals ? { crystals: s.crystals } : { gems: s.gems }, owned: P.owned.skins.includes(s.id), sw: s.tint }));
      if (tab === 'effects') items = EFFECTS.map(s => ({ id: s.id, name: s.name, desc: s.desc, rarity: s.rarity, price: s.crystals ? { crystals: s.crystals } : { gems: s.gems }, owned: P.owned.effects.includes(s.id), sw: s.tint }));
      if (tab === 'castles') items = CASTLES.map(s => ({ id: s.id, name: s.name, desc: s.desc, rarity: s.rarity, price: { gems: s.gems }, owned: P.owned.castles.includes(s.id), pic: Thumbs.img('castle', s.id) }));
      if (tab === 'biomes') items = BIOMES.map(b => ({ id: b.id, name: b.name, desc: `Eigene Farben, Bäume und passende Gegner. Frei ab Level ${b.level}.`, rarity: b.gems >= 200 ? 'epic' : b.gems >= 100 ? 'rare' : 'uncommon', price: { gems: b.gems }, owned: P.owned.biomes.includes(b.id), bg: `linear-gradient(${b.sky},${b.ground})` }));
      if (tab === 'boosts') items = BOOSTS.map(b => ({ id: b.id, name: b.name, desc: b.desc + ` (${P.boosts[b.id] || 0}/${b.max})`, rarity: b.rarity, price: { gems: b.gems * (1 + (P.boosts[b.id] || 0)) }, owned: (P.boosts[b.id] || 0) >= b.max }));
      h += `<div class="cards">${items.map(i => {
        const pic = i.pic || (i.bg ? `<div class="ic" style="background:${i.bg};border-radius:10px">🌍</div>` : i.sw !== undefined ? `<div class="ic"><span style="display:inline-block;width:1.2em;height:1.2em;border-radius:10px;background:${i.sw === 'rainbow' ? 'conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)' : (i.sw || '#9b9a94')}"></span></div>` : '<div class="ic">⚡</div>');
        return `<div class="card" style="border-color:${RARITIES[i.rarity].color}" title="${esc(i.desc)}">${pic}<div class="nm">${esc(i.name)}</div>${rarityBadge(i.rarity)}<div class="sub" style="min-height:2.6em">${esc(i.desc)}</div>
          <button class="btn small ${i.owned ? 'gray' : afford(i.price) ? 'gold' : 'gray'} buy" data-buy="${tab}" data-id="${i.id}" ${i.owned ? 'disabled' : ''}>${i.owned ? '✅ Besitzt du' : price(i.price)}</button></div>`;
      }).join('') || '<p>🎉 Alles freigeschaltet!</p>'}</div>
      <p class="note">🏰 Türme kann man nicht kaufen – die gibt es nur von Bossen! 💎 Edelsteine bekommst du durch Levelaufstiege, Bosse, Aufgaben, Erfolge und die Tagesbelohnung. Es gibt keine Echtgeld-Käufe.</p>`;
      $('#modalBody').innerHTML = h;
      $$('.tabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; Audio2.play('click'); render(); });
      $$('[data-buy]').forEach(b => b.onclick = () => {
        const cat = b.dataset.buy, id = b.dataset.id;
        const it = items.find(i => i.id === id); const p = it.price;
        if (!afford(p)) { Audio2.play('error'); return toast('Nicht genug ' + (p.crystals ? 'Kristalle 🔮' : 'Edelsteine 💎'), 'bad'); }
        if (p.crystals) P.crystals -= p.crystals; else P.gems -= p.gems || 0;
        if (cat === 'roads') P.roadPieces += id === 'roads10' ? 10 : 30;
        else if (cat === 'decos') P.owned.decos.push(id);
        else if (cat === 'boosts') P.boosts[id] = (P.boosts[id] || 0) + 1;
        else P.owned[cat].push(id);
        Save.addStat('purchases'); Save.save();
        Audio2.play('upgrade'); toast(`🛒 ${it.name} gekauft!`, 'gold');
        if (cat === 'skins') equip('skin', id); if (cat === 'effects') equip('effect', id); if (cat === 'castles') equip('castle', id);
        render();
      });
    };
    render();
  }

  // ---------------- Aufgaben ----------------
  function questsScreen() {
    const P = Save.P; Save.refreshDaily();
    openModal('📜 QUESTS', '');
    const rw = r => [r.gems && `💎${r.gems}`, r.crystals && `🔮${r.crystals}`, r.xp && `⭐${r.xp} XP`].filter(Boolean).join(' ');
    const render = () => {
      let h = `<h4 class="sec">📅 Tägliche Aufgaben</h4><div class="qlist">`;
      for (const d of P.daily.list) {
        const q = Save.dailyDef(d); const pr = Save.dailyProgress(d); const ready = pr >= q.goal && !d.claimed;
        h += `<div class="quest${d.claimed ? ' done' : ready ? ' ready' : ''}"><div class="qi">${d.claimed ? '✅' : ready ? '🎁' : '📅'}</div><div class="qb"><div class="qn">${esc(q.name)}</div><div class="qd">${esc(q.desc.replace('{g}', fmt(q.goal)))} · <b>${d.claimed ? 'Erledigt' : ready ? 'Abholbereit' : 'Aktiv'}</b></div><div class="pbar"><i style="width:${pr / q.goal * 100}%"></i></div><div class="qd">${fmt(pr)} / ${fmt(q.goal)}</div></div>
          <div><div class="qr">${rw(q.reward)}</div>${ready ? `<button class="btn small gold" data-daily="${d.id}">Abholen</button>` : ''}</div></div>`;
      }
      h += `</div><h4 class="sec">🗺️ Aufgaben</h4><div class="qlist">`;
      const sorted = QUESTS.slice().sort((a, b) => (P.quests[a.id] === 'claimed') - (P.quests[b.id] === 'claimed'));
      for (const q of sorted) {
        const pr = Save.questProgress(q), claimed = P.quests[q.id] === 'claimed', ready = pr >= q.goal && !claimed;
        h += `<div class="quest${claimed ? ' done' : ready ? ' ready' : ''}"><div class="qi">${claimed ? '✅' : ready ? '🎁' : '📜'}</div><div class="qb"><div class="qn">${esc(q.name)}</div><div class="qd">${esc(q.desc)} · <b>${claimed ? 'Erledigt' : ready ? 'Abholbereit' : 'Aktiv'}</b></div><div class="pbar"><i style="width:${pr / q.goal * 100}%"></i></div><div class="qd">${fmt(pr)} / ${fmt(q.goal)}</div></div>
          <div><div class="qr">${rw(q.reward)}</div>${ready ? `<button class="btn small gold" data-q="${q.id}">Abholen</button>` : ''}</div></div>`;
      }
      h += '</div>';
      $('#modalBody').innerHTML = h;
      $$('[data-q]').forEach(b => b.onclick = () => { if (Save.claimQuest(QUESTS.find(q => q.id === b.dataset.q))) { Audio2.play('achievement'); toast('🎁 Belohnung erhalten!', 'gold'); render(); } });
      $$('[data-daily]').forEach(b => b.onclick = () => { if (Save.claimDaily(P.daily.list.find(d => d.id === b.dataset.daily))) { Audio2.play('achievement'); toast('🎁 Belohnung erhalten!', 'gold'); render(); } });
    };
    render();
  }
  function achievementsScreen() {
    const P = Save.P;
    const done = ACHIEVEMENTS.filter(a => P.achievements[a.id]).length;
    let h = `<div style="font-size:.9em;margin-bottom:.6em">Erreicht: <b>${done} / ${ACHIEVEMENTS.length}</b></div><div class="qlist">`;
    for (const a of ACHIEVEMENTS) {
      const got = P.achievements[a.id]; const pr = Math.min(a.goal, Save.stat(a.stat));
      h += `<div class="quest${got ? ' ready' : ''}" style="${got ? '' : 'opacity:.75'}"><div class="qi">${got ? a.icon : '🔒'}</div><div class="qb"><div class="qn">${esc(a.name)}</div><div class="qd">${esc(a.desc)}${got ? ' · ✅ ' + new Date(got).toLocaleDateString('de-DE') : ''}</div>${got ? '' : `<div class="pbar"><i style="width:${pr / a.goal * 100}%"></i></div><div class="qd">${fmt(pr)} / ${fmt(a.goal)}</div>`}</div><div class="qr">💎${a.gems}${a.crystals ? ' 🔮' + a.crystals : ''}</div></div>`;
    }
    openModal('🏆 ACHIEVEMENTS', h + '</div>');
  }
  function statsScreen() {
    const P = Save.P, s = P.stats;
    const t = s.playTime; const pt = `${Math.floor(t / 3600)}h ${Math.floor(t / 60) % 60}m`;
    const rows = [['Besiegte Gegner', fmt(s.kills)], ['Besiegte Bosse', fmt(s.bossKills)], ['Überstandene Wellen', fmt(s.wavesTotal)], ['Beste Welle', s.bestWave], ['Gebaute Türme', fmt(s.towersBuilt)], ['Gebaute Straßen', fmt(s.roadsBuilt)],
      ['Dekorationen', fmt(s.decoBuilt)], ['Fusionen', fmt(s.fusions || 0)], ['Höchste Fusion', '+' + (s.maxPlus || 0)], ['Verdiente Münzen', fmt(s.coinsEarned)], ['Verursachter Schaden', fmt(s.damage)], ['Gespielte Runden', s.gamesPlayed], ['Siege', s.victories],
      ['Verlorene Leben', fmt(s.livesLost)], ['Perfekte Wellen', s.perfectWaves], ['Spielzeit', pt], ['Edelsteine verdient', fmt(s.gemsEarned)], ['Entdeckte Gegner', Object.keys(P.seen).length + ' / ' + ENEMIES.length], ['Verschiedene Türme', Save.stat('towersUnlocked') + ' / ' + TOWERS.length], ['Türme insgesamt', Object.keys(P.towerInv).reduce((a, k) => a + Save.invTotal(k), 0)], ['Wegstücke', P.roadPieces]];
    let h = `<div class="statgrid">${rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}</div><h4 class="sec">🏅 Rekord</h4><div class="statgrid"><div><span>♾️ Beste Welle</span><b>Welle ${P.records.endless || 0}</b></div></div>`;
    const R = Game.R;
    if (R && !Game.demo) h += `<h4 class="sec">⚔️ Aktuelle Runde</h4><div class="statgrid"><div><span>Welle</span><b>${R.wave}</b></div><div><span>Besiegt</span><b>${R.stats.kills}</b></div><div><span>Münzen verdient</span><b>${fmt(R.stats.coins)}</b></div><div><span>Bosse</span><b>${R.stats.bosses}</b></div><div><span>Türme</span><b>${Game.towers.length}</b></div></div>`;
    openModal('📊 Statistiken', h);
  }

  // ---------------- Einstellungen ----------------
  function settingsScreen() {
    const P = Save.P, S = P.settings;
    const render = () => {
      const tg = (k, label) => `<div class="set-row"><span>${label}</span><button class="toggle${S[k] ? ' on' : ''}" data-tg="${k}"></button></div>`;
      let h = `<div class="set-row"><span>👤 Spielername</span><input type="text" id="setName" maxlength="16" value="${esc(P.name)}"></div>
        <div class="set-row"><span>🎵 Musik</span><input type="range" id="setMusic" min="0" max="1" step="0.05" value="${S.music}"></div>
        <div class="set-row"><span>🔊 Soundeffekte</span><input type="range" id="setSfx" min="0" max="1" step="0.05" value="${S.sfx}"></div>
        <div class="set-row"><span>🖥️ Grafikqualität</span><select id="setQ"><option value="low" ${S.quality === 'low' ? 'selected' : ''}>Niedrig (schnell, ohne Schatten)</option><option value="medium" ${S.quality === 'medium' ? 'selected' : ''}>Mittel</option><option value="high" ${S.quality === 'high' ? 'selected' : ''}>Hoch</option></select></div>
        <div class="set-row"><span>👕 Shirt-Farbe</span><div class="swatches">${['#e03a3a', '#2f8fe0', '#2fae4a', '#9b4dff', '#ff8a1a', '#222222', '#ff5ab4'].map(c => `<button data-shirt="${c}" class="${S.shirt === c ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div></div>
        <div class="set-row"><span>👖 Hosen- & Kappenfarbe</span><div class="swatches">${['#2f5bd0', '#3a3a3a', '#6b4423', '#2f8f4a', '#d4af37', '#c0392b', '#ffffff'].map(c => `<button data-pants="${c}" class="${S.pants === c ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div></div>
        ${tg('particles', '✨ Viele Partikeleffekte')}${tg('autoStart', '⏱️ Wellen kommen automatisch (30s vor Welle 1, danach 25s Pause)')}${tg('damageNumbers', '🔢 Münz-Anzeigen über Gegnern')}${tg('showGrid', '#️⃣ Raster beim Bauen')}
        <h4 class="sec">🎮 Steuerung</h4>
        <p class="note">🖱️ <b>PC:</b> WASD/Pfeile: laufen · Shift: rennen · Leertaste: springen · Maus ziehen: Kamera drehen · Mausrad: Zoom · B: Baumenü · Linksklick: bauen/auswählen · R: Gebäude drehen · Enter: Welle starten · C: Übersicht/Figur · Esc: abbrechen · U: Upgrade · X: Verkaufen<br>
        📱 <b>Touch:</b> Joystick links: laufen · ⤒: springen · 1 Finger auf der Welt: Kamera drehen · 2 Finger: zoomen · 🔨 BAUEN: Baumenü öffnen, dann aufs Feld tippen</p>
        <h4 class="sec">⚠️ Daten</h4>
        <div class="row" style="justify-content:flex-start"><button class="btn small gray" id="resetPlot">Grundstück zurücksetzen</button><button class="btn small red" id="resetAll">Gesamten Spielstand löschen</button></div>
        <p class="note">Dein Fortschritt wird automatisch auf diesem Gerät gespeichert (im Browser-Speicher).</p>`;
      $('#modalBody').innerHTML = h;
      $('#setName').onchange = e => { P.name = (e.target.value.trim() || 'Spieler').slice(0, 16); Save.save(); lastHud.lv = null; };
      $('#setMusic').oninput = e => { S.music = +e.target.value; Audio2.setVolumes(S.sfx, S.music); Save.saveSoon(); };
      $('#setSfx').oninput = e => { S.sfx = +e.target.value; Audio2.setVolumes(S.sfx, S.music); Save.saveSoon(); };
      $('#setSfx').onchange = () => Audio2.play('coin');
      $('#setQ').onchange = e => { S.quality = e.target.value; World.setQuality(S.quality); Save.save(); };
      $$('[data-shirt],[data-pants]').forEach(b => b.onclick = () => {
        if (b.dataset.shirt) S.shirt = b.dataset.shirt; else S.pants = b.dataset.pants;
        Save.save(); Audio2.play('click');
        if (screen === 'game' && Player.active) { const p = Player.pos.clone(); Player.spawn(World.scene, P.name, S.shirt, S.pants); Player.pos.copy(p); }
        render();
      });
      $$('[data-tg]').forEach(b => b.onclick = () => { S[b.dataset.tg] = !S[b.dataset.tg]; Particles.enabled = S.particles; Save.save(); render(); });
      $('#resetPlot').onclick = () => confirmBox('Grundstück auf den Standardweg zurücksetzen? Alle Straßen und Deko werden ersetzt.', () => {
        if (Game.R && !Game.demo && Game.R.phase === 'wave') return toast('Nur zwischen den Wellen möglich', 'bad');
        P.layout = null; Save.save(); Save.load();
        if (Game.R && !Game.demo) { Game.reloadLayoutKeepTowers(); toast('Grundstück zurückgesetzt – Türme auf Straßenfeldern wurden verkauft', 'good'); }
        else Game.startDemo();
        Save.save();
      });
      $('#resetAll').onclick = () => confirmBox('Wirklich ALLES löschen? Level, Edelsteine, Türme, Erfolge – alles weg. Das kann nicht rückgängig gemacht werden!', () => { Save.reset(); location.reload(); });
    };
    openModal('⚙️ SETTINGS', ''); render();
  }

  // ---------------- Teilen / Besuchen ----------------
  function shareScreen() {
    const code = Game.exportLayout();
    const h = `<p>Teile dein Grundstück mit Freunden: Kopiere den Code und schicke ihn weiter. Mit einem Code kannst du fremde Grundstücke besuchen und ansehen.</p>
      <h4 class="sec">📤 Mein Grundstücks-Code</h4><textarea class="code" id="myCode" readonly>${esc(code)}</textarea>
      <div class="row" style="justify-content:flex-start"><button class="btn small" id="copyCode">📋 Kopieren</button></div>
      <h4 class="sec">📥 Grundstück besuchen</h4><textarea class="code" id="otherCode" placeholder="Code hier einfügen (BYOTD:…)"></textarea>
      <div class="row" style="justify-content:flex-start"><button class="btn small green" id="visitCode">👀 Besuchen</button></div>
      <p class="note">ℹ️ Echter Online-Multiplayer braucht einen Server, den dieses Browserspiel nicht hat. Deshalb funktioniert das Teilen über Codes. Die Nachbar-Grundstücke in deiner Welt gehören Beispiel-Spielern.</p>`;
    openModal('🔗 Grundstück teilen & besuchen', h, true);
    $('#copyCode').onclick = () => { const t = $('#myCode'); t.select(); try { navigator.clipboard.writeText(t.value).then(() => toast('📋 Kopiert!', 'good'), () => { document.execCommand('copy'); toast('📋 Kopiert!', 'good'); }); } catch (e) { document.execCommand('copy'); toast('📋 Kopiert!', 'good'); } };
    $('#visitCode').onclick = () => {
      const L = Game.parseLayout($('#otherCode').value);
      if (!L) return toast('❌ Ungültiger Code', 'bad');
      visit(L);
    };
  }
  function visit(L) {
    if (screen === 'game') return toast('Besuchen geht nur aus dem Hauptmenü', 'bad');
    closeModal();
    visiting = L;
    const own = Save.P.layout;
    Save.P.layout = { roads: L.roads, decos: L.decos };
    Game.stopDemo();
    Game.startDemo();
    Save.P.layout = own;
    $('#mainmenu').classList.add('hidden');
    const bar = document.createElement('div'); bar.className = 'visit-bar';
    bar.innerHTML = `👀 Du besuchst <b>${esc(L.name)}</b> <button class="btn small green" id="vAdopt">Übernehmen</button><button class="btn small red" id="vBack">Zurück</button>`;
    document.body.appendChild(bar);
    $('#vBack').onclick = () => { bar.remove(); visiting = null; goMenu(); };
    $('#vAdopt').onclick = () => confirmBox(`Das Grundstück von ${esc(L.name)} als dein eigenes übernehmen? Dein aktuelles Straßennetz wird ersetzt.`, () => { Save.P.layout = { roads: L.roads, decos: L.decos }; Save.P.run = null; Save.save(); bar.remove(); visiting = null; toast('✅ Grundstück übernommen', 'good'); goMenu(); });
  }

  // ---------------- Tutorial (Pflicht, nicht überspringbar) ----------------
  const Tut = (() => {
    let step = null, marker = null, moveStart = null, pollT = null;
    const box = () => $('#tut');
    function say(html, btn, onBtn) {
      const b = box();
      b.innerHTML = `<div class="tut-face">🧙</div><div class="tut-text">${html}</div>${btn ? `<button class="btn green" id="tutBtn">${btn}</button>` : ''}`;
      b.classList.remove('hidden'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      if (btn) $('#tutBtn').onclick = () => { Audio2.play('click'); onBtn(); };
    }
    function hide() { box().classList.add('hidden'); }
    function hl(sel) { $$('.tut-hl').forEach(e => e.classList.remove('tut-hl')); if (sel) $$(sel).forEach(e => e.classList.add('tut-hl')); }
    function showMarker(on, at) {
      if (marker) { World.scene.remove(marker); marker = null; }
      if (!on) return;
      const sp = at || Game.bestSpot(TOWER_BY_ID.crossbow.range); if (!sp) return;
      marker = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.48, 32), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; marker.add(ring);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
      arrow.rotation.x = Math.PI; arrow.position.y = 1.2; marker.add(arrow);
      marker.position.copy(tileToWorld(sp.x, sp.z)); marker.userData.arrow = arrow;
      World.scene.add(marker);
    }
    function tick(t) { if (marker) { marker.userData.arrow.position.y = 1.1 + Math.sin(t * 5) * 0.15; marker.rotation.y = t; } }
    function go(s) {
      step = s; const R = Game.R; const touch = isTouch();
      clearInterval(pollT);
      if (s === 'welcome') {
        R.hold = true; hl(null);
        say('<b>Willkommen!</b> Aus dem lila Portal kommen Monster. Sie laufen den Weg entlang zu deiner Burg. <b>Halte sie auf!</b>', 'Weiter ▶', () => go('move'));
      } else if (s === 'move') {
        moveStart = Player.pos.clone();
        say(touch ? 'Lauf mit dem <b>Joystick</b> unten links ein bisschen herum. Mit <b>⤒</b> springst du.' : 'Lauf mit <b>W A S D</b> herum. Mit der <b>Leertaste</b> springst du, mit der Maus drehst du die Kamera.');
        hl(touch ? '#joy' : null);
        pollT = setInterval(() => { if (Player.pos.distanceTo(moveStart) > 2.5) go('place'); }, 200);
      } else if (s === 'place') {
        say(`Du hast genau <b>eine Armbrust</b>. ${touch ? 'Tippe auf <b>🔨 BAUEN</b>, wähle die Armbrust und tippe' : 'Wähle unten die Armbrust und klicke'} auf das <b>leuchtende Feld</b> neben dem Weg.`);
        hl(document.body.classList.contains('build-open') ? '#bbItems .item[data-id=crossbow]' : '#buildToggle');
        showMarker(true);
        pollT = setInterval(() => { if (step === 'place') hl(document.body.classList.contains('build-open') ? '#bbItems .item[data-id=crossbow]' : '#buildToggle'); }, 400);
      } else if (s === 'wave1') {
        showMarker(false); hl(null); setBuildOpen(false);
        say('Super! Deine Armbrust schießt <b>ganz von allein</b>. Gleich kommt Welle 1 …');
        R.hold = false; setTimeout(() => { if (step === 'wave1' && Game.R && Game.R.phase === 'build') Game.startWave(false); }, 2500);
      } else if (s === 'fighting') {
        say('Pass auf die Gegner auf! 💪 Wenn du 3 gleiche Türme hast, kannst du sie später <b>fusen</b> – dann werden sie viel stärker.');
        setTimeout(() => { if (step === 'fighting') hide(); }, 4500);
      } else if (s === 'bosswarn') {
        R.hold = true; R.pauseTimer = 0;
        say('⚠️ <b>Achtung!</b> Jede <b>5. Welle</b> kommt ein <b>BOSS</b>. Besiege ihn – dann bekommst du eine <b>neue Waffe</b>!', 'Los geht\'s! ▶', () => { R.hold = false; hide(); step = 'boss'; Game.startWave(false); });
      } else if (s === 'place2') {
        R.hold = true; R.pauseTimer = 0; showMarker(true);
        say(`Deine neue Waffe ist da! 🎁 ${touch ? 'Tippe auf <b>🔨 BAUEN</b>, wähle sie aus' : 'Wähle sie unten aus'} und stelle sie neben den Weg.`);
        pollT = setInterval(() => { hl(document.body.classList.contains('build-open') ? '#bbItems .item:not(.locked)' : '#buildToggle'); }, 400);
      } else if (s === 'done') {
        hl(null); showMarker(false); setBuildOpen(!touch);
        say('<b>Perfekt – Tutorial geschafft!</b> 🎓<br>Ab jetzt kommen die Wellen <b>automatisch</b>. Jede 5. Welle kommt ein Boss. Bosse geben dir <b>Türme, Wege und Fallen</b>.<br>⚗️ Hast du <b>3 gleiche Türme</b>, kannst du sie im <b>Inventar</b> zu einem starken <b>+1</b> fusen!', 'Spielen! ▶', () => {
          Save.P.tutorialDone = true; R.tutorial = false; R.hold = false; R.pauseTimer = 15;
          Save.checkAchievements(); Save.save(); hide(); step = null;
          document.body.classList.remove('tutorial'); renderBuildBar(); Game.snapshotRun();
        });
      }
    }
    function event(name, data) {
      const R = Game.R; if (!R || !R.tutorial) return;
      if (name === 'placed' && step === 'place') go('wave1');
      else if (name === 'placed' && step === 'place2') { clearInterval(pollT); go('done'); }
      else if (name === 'waveStart' && step === 'wave1') go('fighting');
      else if (name === 'waveCleared' && data === 4) go('bosswarn');
      else if (name === 'rewardClosed') go('place2');
    }
    function start() { document.body.classList.add('tutorial'); go('welcome'); }
    function stop() { clearInterval(pollT); showMarker(false); hide(); hl(null); step = null; document.body.classList.remove('tutorial'); }
    return { start, stop, event, tick, get step() { return step; } };
  })();

  // ---------------- Boss-Truhe (Belohnung mit Glücksrad-Streifen) ----------------
  function rewardCard(rw) {
    if (rw.kind === 'tower') { const t = TOWER_BY_ID[rw.id]; return { html: Thumbs.img('tower', rw.id), name: (rw.n > 1 ? rw.n + 'x ' : '') + t.name, color: RARITIES[t.rarity].color, sub: RARITIES[t.rarity].name }; }
    if (rw.kind === 'trap') { const t = TRAP_BY_ID[rw.id]; return { html: `<div class="ic">${t.icon}</div>`, name: t.name, color: RARITIES[t.rarity].color, sub: 'Falle' }; }
    if (rw.kind === 'roads') return { html: '<div class="ic">🛣️</div>', name: `${rw.n} Wegstücke`, color: '#9b9a94', sub: 'Wege' };
    return { html: '<div class="ic">💰</div>', name: `${rw.n} Münzen`, color: '#ffd700', sub: 'Münzen' };
  }
  function bossReward(rw, bossDef) {
    const R = Game.R;
    const fake = () => Save.rollFake(R.wave + 10);
    const strip = []; for (let i = 0; i < 36; i++) strip.push(i === 30 ? rw : fake());
    const cards = strip.map(r => { const c = rewardCard(r); return `<div class="rl-card" style="border-color:${c.color}">${c.html}<div class="nm">${esc(c.name)}</div></div>`; }).join('');
    openModal('🎁 Boss-Truhe', `<div class="result"><div class="big">👑 ${esc(bossDef.name)} besiegt!</div><p>Mal sehen, was in der Truhe ist …</p>
      <div class="roulette"><div class="rl-line"></div><div class="rl-strip" id="rlStrip">${cards}</div></div>
      <div id="rlWin" class="rl-win hidden"></div></div>`, true);
    $('#modalClose').classList.add('hidden');
    const stripEl = $('#rlStrip');
    requestAnimationFrame(() => {
      const card = stripEl.children[30]; const wrap = stripEl.parentElement;
      const target = card.offsetLeft + card.offsetWidth / 2 - wrap.clientWidth / 2 + (Math.random() - 0.5) * card.offsetWidth * 0.5;
      stripEl.style.transition = 'transform 4.2s cubic-bezier(.08,.75,.12,1)';
      stripEl.style.transform = `translateX(${-target}px)`;
      let last = 0; const t0 = performance.now();
      const tickSnd = () => { const t = performance.now() - t0; if (t > 4200) return; const pos = -new DOMMatrix(getComputedStyle(stripEl).transform).m41; const idx = Math.floor(pos / card.offsetWidth); if (idx !== last) { last = idx; Audio2.play('click'); } requestAnimationFrame(tickSnd); };
      tickSnd();
    });
    setTimeout(() => {
      const c = rewardCard(rw);
      stripEl.children[30].classList.add('won');
      Audio2.play('achievement');
      const isPlaceable = rw.kind === 'tower' || rw.kind === 'trap';
      const w = $('#rlWin');
      w.innerHTML = `<h3>Du bekommst: <span style="color:${c.color}">${esc(c.name)}</span>!</h3><p>${rw.kind === 'tower' ? esc(TOWER_BY_ID[rw.id].desc) : rw.kind === 'trap' ? esc(TRAP_BY_ID[rw.id].desc) : rw.kind === 'roads' ? 'Damit kannst du den Weg der Gegner umbauen (Baumenü → Straßen).' : 'Für Upgrades und Wegstücke.'}</p>
        ${rw.bonus ? `<p class="bonus">🎁 Bonus: <b>${esc(rewardCard(rw.bonus).name)}</b>${rw.bonus.kind === 'trap' ? ' (Falle)' : ''}</p>` : ''}
        <div class="row">${isPlaceable ? '<button class="btn green big" id="rlPlace">📍 Jetzt platzieren</button>' : ''}${R.tutorial ? '' : '<button class="btn" id="rlOk">Einsammeln</button>'}</div>`;
      w.classList.remove('hidden');
      for (let i = 0; i < 3; i++) setTimeout(() => Particles.emit(Player.pos.x, 2, Player.pos.z, 50, c.color, { speed: 4, up: 5, life: 1.2, size: 0.3, tint: false }), i * 200);
      const finish = place => {
        $('#modalClose').classList.remove('hidden'); closeModal();
        if (R.tutorial) { Tut.event('rewardClosed'); }
        if (place && isPlaceable) { curTab = rw.kind === 'tower' ? 'towers' : 'traps'; setBuildOpen(true); Game.setBuild({ kind: rw.kind, id: rw.id }); }
        renderBuildBar();
      };
      const p = $('#rlPlace'); if (p) p.onclick = () => finish(true);
      const o = $('#rlOk'); if (o) o.onclick = () => finish(false);
      if (!isPlaceable && R.tutorial) setTimeout(() => finish(false), 1500);
    }, 4400);
  }

  // ---------------- Neue Türme nach der Runde ----------------
  function picksHtml() {
    const P = Save.P, picks = P.pendingPicks;
    if (!picks || !picks.length) return '';
    const open = picks.filter(p => !p.done).length;
    let h = `<div class="picks"><h3>🎁 Neue Türme! ${open ? `Wähle ${open === 1 ? 'einen Turm' : open + ' Türme'} aus:` : 'Alle gewählt ✅'}</h3>`;
    picks.forEach((p, i) => {
      if (p.gems) { h += `<div class="pick-row${p.done ? ' done' : ''}"><div class="card${p.done ? ' chosen' : ''}" data-pick="${i}" data-id=""><div class="ic">💎</div><div class="nm">Alle Türme frei! +${p.gems} Edelsteine</div></div></div>`; return; }
      h += `<div class="pick-row${p.done ? ' done' : ''}">${p.options.map(id => { const t = TOWER_BY_ID[id]; return `<div class="card${p.done === id ? ' chosen' : ''}" data-pick="${i}" data-id="${id}" style="border-color:${RARITIES[t.rarity].color}">${Thumbs.img('tower', id)}<div class="nm">${esc(t.name)}</div>${rarityBadge(t.rarity)}<div class="sub">${esc(t.desc)}</div></div>`; }).join('')}</div>`;
    });
    return h + '</div>';
  }
  function bindPicks(rerender) {
    $$('[data-pick]').forEach(c => c.onclick = () => {
      const i = +c.dataset.pick, id = c.dataset.id;
      if (Save.choosePick(i, id || null)) {
        Audio2.play('achievement');
        if (id) toast(`🏰 Neuer Turm: <b>${esc(TOWER_BY_ID[id].name)}</b>`, 'gold');
        rerender();
      }
    });
  }
  function picksScreen() {
    if (!Save.openPicks() || screen !== 'menu') return;
    const render = () => {
      $('#modalBody').innerHTML = picksHtml() + `<div class="row"><button class="btn green big" id="pkPlay">▶ Neue Runde (Welle 1)</button><button class="btn gray" id="pkClose">Später</button></div>`;
      bindPicks(render);
      $('#pkPlay').onclick = () => { closeModal(); playDialog(); };
      $('#pkClose').onclick = () => closeModal();
    };
    openModal('🎁 Belohnung', '', true); render();
  }

  // ---------------- Pause / Ergebnis ----------------
  function pauseMenu() {
    const R = Game.R;
    openModal('⏸ Pause', `<div class="row" style="flex-direction:column;align-items:stretch;gap:10px">
      <button class="btn green big" id="pmResume">▶ Weiterspielen</button>
      <button class="btn" id="pmShare">🔗 Grundstück teilen</button>
      <button class="btn" id="pmStats">📊 Statistiken</button>
      ${R && R.tutorial ? '' : '<button class="btn red" id="pmMenu">🏠 Zum Hauptmenü (speichert)</button>'}</div>
      <p class="note">Gespeichert wird nach jeder abgeschlossenen Welle. Verlässt du eine laufende Welle, beginnt sie beim Fortsetzen von vorn.</p>`, true);
    $('#pmResume').onclick = () => closeModal();
    $('#pmShare').onclick = () => shareScreen();
    $('#pmStats').onclick = () => statsScreen();
    const pm = $('#pmMenu'); if (pm) pm.onclick = () => { Save.save(); goMenu(); };
  }
  function resultScreen(s, won) {
    const t = s.time; const tm = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const h = `<div class="result"><div class="big">${won ? '🏆 SIEG!' : '💀 GAME OVER'}</div><div>Du hast Welle ${s.waves + 1} erreicht</div>
      <div class="statgrid"><div><span>Überstandene Wellen</span><b>${s.waves}</b></div><div><span>Besiegte Gegner</span><b>${fmt(s.kills)}</b></div><div><span>Verdiente Münzen</span><b>${fmt(s.coins)}</b></div><div><span>Besiegte Bosse</span><b>${s.bosses}</b></div><div><span>Spielzeit</span><b>${tm}</b></div><div><span>Persönlicher Rekord</span><b>Welle ${Math.max(s.record, s.waves)}</b></div></div>
      ${won ? '<p>Belohnung: 💎100 🔮10</p>' : '<p>Deine Burg ist gefallen – aber du bekommst neue Türme für die nächste Runde!</p>'}
      <div id="rsPicks"></div>
      <div class="row"><button class="btn ${won ? '' : 'green'}" id="rsRetry">🔁 Neue Runde (Welle 1)</button><button class="btn gray" id="rsMenu">🏠 Hauptmenü</button></div></div>`;
    openModal(won ? 'Sieg' : 'Niederlage', h, true);
    $('#modalClose').classList.add('hidden');
    const renderPicks = () => { $('#rsPicks').innerHTML = picksHtml(); bindPicks(renderPicks); };
    renderPicks();
    const done = () => $('#modalClose').classList.remove('hidden');
    $('#rsRetry').onclick = () => { done(); Save.P.run = null; startGame(s.mode.id, Game.R.biome); };
    $('#rsMenu').onclick = () => { done(); goMenu(); };
    if (won) for (let i = 0; i < 6; i++) setTimeout(() => Particles.emit((Math.random() - 0.5) * 16, 2, (Math.random() - 0.5) * 10, 60, '#ffffff', { speed: 5, up: 6, life: 1.6, size: 0.35, tint: false }), i * 250);
  }

  // ---------------- Aktionen ----------------
  function action(a) {
    Audio2.init(); Audio2.play('click');
    switch (a) {
      case 'play': return playDialog();
      case 'inventory': return inventoryScreen();
      case 'towers': return towersScreen();
      case 'shop': return shopScreen();
      case 'quests': return questsScreen();
      case 'settings': return settingsScreen();
      case 'collection': return collectionScreen();
      case 'achievements': return achievementsScreen();
      case 'stats': return statsScreen();
      case 'share': return shareScreen();
      case 'pause': return pauseMenu();
    }
  }

  function bindEvents() {
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (b) { action(b.dataset.act); return; }
      const it = e.target.closest('#bbItems .item'); if (it) { onBuildItem(it); return; }
      const tool = e.target.closest('[data-tool]'); if (tool) { onBuildItem(tool); return; }
      if (e.target.closest('[data-bbclose]')) { Audio2.play('click'); setBuildOpen(false); return; }
      if (e.target.closest('#buildToggle')) { Audio2.init(); Audio2.play('click'); setBuildOpen(true); return; }
      const tab = e.target.closest('#bbTabs button'); if (tab) { curTab = tab.dataset.tab; Audio2.play('click'); renderBuildBar(); return; }
      const cam = e.target.closest('[data-cam]');
      if (cam) { const c = cam.dataset.cam; if (c === 'rl') CamCtl.rotate(Math.PI / 4); if (c === 'rr') CamCtl.rotate(-Math.PI / 4); if (c === 'zi') CamCtl.zoom(0.8); if (c === 'zo') CamCtl.zoom(1.25); if (c === 'reset') { if (screen === 'game') { setCamMode(CamCtl.mode === 'follow' ? 'free' : 'follow'); Audio2.play('click'); } else CamCtl.reset(); } return; }
      const tp = e.target.closest('[data-tp]');
      if (tp) {
        const t = Game.selected; const k = tp.dataset.tp;
        if (k === 'close') Game.select(null);
        if (!t) return;
        if (k === 'fuse') { const tt = t; Game.select(null); inventoryScreen({ id: tt.def.id, plus: tt.plus || 0 }); }
        if (k === 'sell') Game.sell(t);
        if (k === 'move') Game.startMove(t);
        if (k === 'tg') { t.targeting = tp.dataset.v; Audio2.play('click'); towerPanel(t); Game.snapshotRun(); }
      }
    });
    $('#modalClose').onclick = () => { Audio2.play('click'); closeModal(); };
    $('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal' && !$('#modalClose').classList.contains('hidden')) closeModal(); });
    $('#waveBtn').onclick = () => { Audio2.init(); const R = Game.R; if (!R) return; Game.startWave(R.phase === 'wave'); };
    $('#speedBtn').onclick = () => { const R = Game.R; if (!R) return; R.speed = R.speed >= 3 ? 1 : R.speed + 1; Audio2.play('click'); hud(true); };
    $('#pauseBtn').onclick = () => { const R = Game.R; if (!R) return; R.paused = !R.paused; Audio2.play('click'); hud(true); if (R.paused) banner('PAUSE', 'Tippe ▶ zum Fortsetzen', '', 1200); };
    $('#dailyBtn').onclick = () => {
      Audio2.init();
      const r = Save.claimDailyReward();
      if (!r) return toast('Heute schon abgeholt – komm morgen wieder!', 'bad');
      Audio2.play('achievement');
      openModal('🎁 Tagesbelohnung', `<div class="result"><div class="big">Tag ${r.day}</div><p>Serie: ${r.streak} Tag(e) in Folge 🔥</p><div class="statgrid"><div><span>Edelsteine</span><b>💎 ${r.gems}</b></div>${r.crystals ? `<div><span>Kristalle</span><b>🔮 ${r.crystals}</b></div>` : ''}<div><span>Erfahrung</span><b>⭐ ${r.xp}</b></div></div><p class="note">Komm jeden Tag wieder – an Tag 7 gibt es die größte Belohnung!</p><button class="btn green" id="dOk">Super!</button></div>`, true);
      $('#dOk').onclick = () => closeModal();
      refreshMenu();
    };
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'escape') { if (!$('#modal').classList.contains('hidden')) closeModal(); else if (Game.buildSel) Game.setBuild(null); else if (Game.selected) Game.select(null); else if (screen === 'game') pauseMenu(); }
      if (screen !== 'game' || !$('#modal').classList.contains('hidden')) return;
      if (k === 'r') Game.rotateBuild();
      if (k === ' ') e.preventDefault(); // Springen (Player)
      if (k === 'enter') { e.preventDefault(); $('#waveBtn').click(); }
      if (k === 'b') setBuildOpen(!document.body.classList.contains('build-open'));
      if (k === 'c') setCamMode(CamCtl.mode === 'follow' ? 'free' : 'follow');
      if (k === 'x' && Game.selected) Game.sell(Game.selected);
      if (k === 'm' && Game.selected) Game.startMove(Game.selected);
      if (k === 'p') $('#pauseBtn').click();
      if (k === 'f') $('#speedBtn').click();
      if (/^[1-9]$/.test(k)) { const un = TOWERS.filter(t => Save.P.unlocked.includes(t.id)).sort((a, b) => a.cost - b.cost); const t = un[+k - 1]; if (t) { curTab = 'towers'; setBuildOpen(true); Game.setBuild({ kind: 'tower', id: t.id }); } }
    });
    bindJoystick();
    document.body.classList.toggle('touch', isTouch());
    // Mausrad im Baumenü horizontal scrollen
    $('#bbItems').addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { $('#bbItems').scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  }

  // Callbacks aus dem Spiel
  function hookGame() {
    Object.assign(Game.ui, {
      toast, hud: () => {}, towerPanel, buildChanged,
      routeChanged: ok => { if (!ok && screen === 'game') toast('⚠️ Kein Weg vom Spawn zum Ziel!', 'bad'); },
      waveBanner: (w, boss) => banner(boss ? '👑 BOSSWELLE ' + w : 'WELLE ' + w, boss ? 'Ein mächtiger Boss naht!' : '', boss ? 'boss' : '', 1800),
      waveCleared: (w, bonus, income) => toast(`✅ Welle ${w} geschafft! +${bonus}${income ? ' +' + income + ' (Gold)' : ''} 🪙`, 'good'),
      bossAppear: e => { if (e) banner('👑 ' + e.def.name, 'Besiege ihn für eine Belohnung!', 'boss', 2200); },
      newEnemy: def => toast(`📖 Neuer Gegner entdeckt: <b>${esc(def.name)}</b>`, ''),
      gameOver: s => { Tut.stop(); resultScreen(s, false); },
      tutorialEvent: (n, d) => Tut.event(n, d),
      bossReward: (rw, def) => bossReward(rw, def),
      victory: s => resultScreen(s, true),
    });
    Save.on('levelup', info => {
      Audio2.play('levelup');
      banner('LEVEL ' + info.level + '!', `+💎${info.gems}${info.towers.length ? ' · Neu: ' + info.towers.map(t => t.name).join(', ') : ''}${info.biomes.length ? ' · Biom: ' + info.biomes.map(b => b.name).join(', ') : ''}`, '', 2800);
      if (World.camera) Particles.emit(World.castlePos ? 0 : 0, 3, 0, 80, '#ffe14d', { speed: 6, up: 5, life: 1.4, size: 0.35, tint: false });
      if (screen === 'game') renderBuildBar();
    });
    Save.on('achievement', a => { Audio2.play('achievement'); toast(`🏆 Erfolg: <b>${esc(a.name)}</b> +💎${a.gems}${a.crystals ? ' 🔮' + a.crystals : ''}`, 'gold'); });
  }

  return { Tut, show, toast, banner, hud, goMenu, startGame, renderBuildBar, bindEvents, hookGame, refreshMenu, closeModal, get screen() { return screen; } };
})();
