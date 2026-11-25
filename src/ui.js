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
    closeModal(); Game.quit(); visiting = null; $('.visit-bar')?.remove();
    show('menu'); refreshMenu();
    Game.startDemo(); CamCtl.setAuto(true); Audio2.setMood('menu');
  }
  function startGame(modeId, biomeId, snapshot) {
    closeModal();
    Game.stopDemo(); CamCtl.setAuto(false);
    const b = BIOME_BY_ID[biomeId] || BIOMES[0];
    Save.P.equipped.biome = b.id;
    World.buildEnvironment(b, Save.P.name);
    Game.newRun(modeId, b.id, snapshot);
    show('game'); curTab = 'towers'; renderBuildBar(); hud(true);
    CamCtl.reset();
    if (!snapshot) banner('Baue deine Verteidigung!', 'Straßen bauen · Türme platzieren · Welle starten', '', 2600);
    else banner('Willkommen zurück!', `Welle ${snapshot.wave} · ${MODE_BY_ID[modeId].name}`, '', 2000);
    Save.save();
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
    for (const w of R.waves.values()) { alive += w.alive + w.queued; total += w.total; }
    const winTxt = R.mode.win && !R.continueEndless ? ` / ${R.mode.win}` : '';
    $('#wpWave').textContent = `Welle ${R.wave}${winTxt}`;
    $('#wpMode').textContent = R.mode.icon + ' ' + R.mode.name;
    $('#wpEnemies').textContent = R.phase === 'wave' ? `Gegner: ${alive} / ${total}` : 'Bauphase';
    $('#wpFill').style.width = (R.phase === 'wave' && total ? (1 - alive / total) * 100 : R.phase === 'build' ? 100 : 0) + '%';
    const nxt = R.wave + 1;
    const nb = R.mode.bossRush || nxt % 10 === 0;
    $('#wpNext').textContent = R.phase === 'build' && R.pauseTimer > 0 ? `Nächste: ${nxt}${nb ? ' 👑' : ''} in ${Math.ceil(R.pauseTimer)}s` : `Nächste: ${nxt}${nb ? ' 👑 BOSS' : ''}`;
    const wb = $('#waveBtn');
    const label = R.phase === 'build' ? (R.wave === 0 ? '▶ WELLE STARTEN' : R.pauseTimer > 0 ? '⏩ WELLE ÜBERSPRINGEN' : '▶ NÄCHSTE WELLE') : '⏩ WELLE ÜBERSPRINGEN';
    if (wb.textContent !== label) wb.textContent = label;
    wb.classList.toggle('skip', R.phase !== 'build' || R.pauseTimer > 0);
    wb.disabled = (R.won && R.mode.win && !R.continueEndless) || R.over;
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
    $$('#bbItems .item[data-cost]').forEach(el => { const c = +el.dataset.cost; const pr = el.querySelector('.pr'); if (pr) pr.classList.toggle('no', !R.mode.creative && R.coins < c); });
    if (Game.selected && !$('#towerPanel').classList.contains('hidden')) {
      const key = Game.selected.level + ':' + (R.coins >= Game.upgradeCost(Game.selected)) + ':' + Game.selected.kills;
      if (lastHud.tp !== key) { towerPanel(Game.selected); }
    }
  }

  // ---------------- Baumenü ----------------
  function renderBuildBar() {
    $$('#bbTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === curTab));
    const P = Save.P, R = Game.R, sel = Game.buildSel;
    let h = '';
    const isSel = (k, id) => sel && sel.kind === k && sel.id === id ? ' sel' : '';
    if (curTab === 'towers') {
      const list = TOWERS.slice().sort((a, b) => (P.unlocked.includes(b.id) - P.unlocked.includes(a.id)) || a.cost - b.cost);
      list.forEach((t, i) => {
        const un = P.unlocked.includes(t.id);
        const poor = R && !R.mode.creative && R.coins < t.cost;
        h += `<button class="item${un ? '' : ' locked'}${isSel('tower', t.id)}" data-kind="tower" data-id="${t.id}" ${un ? `data-cost="${t.cost}"` : ''} title="${esc(t.name)}">
          <i class="rar" style="background:${RARITIES[t.rarity].color}"></i>${un ? '' : '<span class="lock">🔒</span>'}
          ${Thumbs.img('tower', t.id)}<div class="nm">${esc(t.name)}</div><div class="pr${poor ? ' no' : ''}">${un ? '🪙' + fmt(t.cost) : (t.shop ? '🔮 Shop' : 'Lv ' + t.level)}</div></button>`;
      });
    } else if (curTab === 'roads') {
      ROADS.forEach(r => {
        h += `<button class="item${isSel('road', r.id)}" data-kind="road" data-id="${r.id}" data-cost="${r.cost}"><div class="ic"><span style="display:inline-block;width:1.4em;height:1.4em;border-radius:6px;background:${r.color};border:3px solid ${r.edge};${r.width < 0.8 ? 'transform:scaleX(.6)' : ''}"></span></div><div class="nm">${esc(r.name)}</div><div class="pr">🪙${r.cost}</div></button>`;
      });
      h += `<div class="item" style="width:9em;text-align:left;font-size:.85em;padding:.4em;opacity:.9">ℹ️ Kurven &amp; Kreuzungen entstehen automatisch, wenn du Felder verbindest. Ziehen zum Malen!</div>`;
    } else if (curTab === 'decos') {
      DECOS.forEach(d => {
        if (d.shop && !P.owned.decos.includes(d.id)) return;
        h += `<button class="item${isSel('deco', d.id)}" data-kind="deco" data-id="${d.id}" data-cost="${d.cost}">${Thumbs.img('deco', d.id)}<div class="nm">${esc(d.name)}</div><div class="pr">🪙${d.cost}</div></button>`;
      });
      h += `<button class="item" data-act="shop"><div class="ic">🛒</div><div class="nm">Mehr im Shop</div><div class="pr">💎</div></button>`;
    } else {
      h += `<button class="item${isSel('erase', 'erase')}" data-kind="erase" data-id="erase"><div class="ic">🧹</div><div class="nm">Abreißen</div><div class="pr">Straße/Deko</div></button>`;
      h += `<button class="item" data-tool="rotate"><div class="ic">🔄</div><div class="nm">Drehen (R)</div><div class="pr">${Game.buildSel ? 'aktiv' : '&nbsp;'}</div></button>`;
      h += `<button class="item" data-tool="cancel"><div class="ic">✋</div><div class="nm">Auswahl aufheben</div><div class="pr">Esc</div></button>`;
      h += `<button class="item" data-tool="grid"><div class="ic">#️⃣</div><div class="nm">Raster</div><div class="pr">${P.settings.showGrid ? 'an' : 'aus'}</div></button>`;
      h += `<button class="item" data-tool="sellall"><div class="ic">💰</div><div class="nm">Alle Türme verkaufen</div><div class="pr">70%</div></button>`;
    }
    $('#bbItems').innerHTML = h;
  }
  function onBuildItem(el) {
    const R = Game.R; if (!R) return;
    if (el.dataset.act) return action(el.dataset.act);
    const tool = el.dataset.tool;
    if (tool === 'rotate') return Game.rotateBuild();
    if (tool === 'cancel') return Game.setBuild(null);
    if (tool === 'grid') { Save.P.settings.showGrid = !Save.P.settings.showGrid; Save.saveSoon(); renderBuildBar(); return; }
    if (tool === 'sellall') {
      if (!Game.towers.length) return toast('Keine Türme vorhanden');
      return confirmBox('Alle Türme für 70% des Wertes verkaufen?', () => { [...Game.towers].forEach(t => Game.sell(t)); });
    }
    const kind = el.dataset.kind, id = el.dataset.id;
    if (!kind) return;
    if (kind === 'tower' && !Save.P.unlocked.includes(id)) {
      const t = TOWER_BY_ID[id];
      toast(t.shop ? `🔒 ${t.name}: im Shop für 🔮 ${t.shop.crystals} Kristalle` : `🔒 ${t.name}: frei ab Level ${t.level} – oder im Shop`, 'bad');
      return;
    }
    Audio2.play('click');
    const s = Game.buildSel;
    if (s && s.kind === kind && s.id === id) Game.setBuild(null);
    else Game.setBuild({ kind, id });
  }
  function buildChanged(sel) {
    renderBuildBar();
    const h = $('#buildHint');
    if (!sel) { h.classList.add('hidden'); return; }
    let name = sel.kind === 'tower' ? TOWER_BY_ID[sel.id].name : sel.kind === 'road' ? ROAD_BY_ID[sel.id].name : sel.kind === 'deco' ? DECO_BY_ID[sel.id].name : sel.kind === 'move' ? 'Turm verschieben' : 'Abreißen';
    const touch = matchMedia('(pointer:coarse)').matches;
    const how = sel.kind === 'road' || sel.kind === 'erase' ? (touch ? 'Tippen oder Finger ziehen' : 'Klicken oder ziehen') : (touch ? 'Tippen zum Platzieren · 2 Finger: Kamera' : 'Klicken zum Platzieren · R: drehen');
    h.innerHTML = `<b>${esc(name)}</b><span>${how}</span>${sel.kind !== 'road' && sel.kind !== 'erase' ? '<button class="btn small" data-tool="rotate">🔄</button>' : ''}<button class="btn small red" data-tool="cancel">✕</button>`;
    h.classList.remove('hidden');
  }

  // ---------------- Turm-Panel ----------------
  function towerPanel(t) {
    const el = $('#towerPanel');
    document.body.classList.toggle('tp-open', !!(t && Game.R));
    if (!t || !Game.R) { el.classList.add('hidden'); return; }
    const R = Game.R;
    const s = Game.towerStats(t), d = t.def;
    const maxed = t.level >= MAX_TOWER_LEVEL;
    const cost = Game.upgradeCost(t);
    let nextS = null;
    if (!maxed) { t.level++; nextS = Game.towerStats(t); t.level--; }
    lastHud.tp = t.level + ':' + (R.coins >= cost) + ':' + t.kills;
    const up = (a, b, f = 1) => nextS && b > a + 0.001 ? ` <span class="up">▲${(+(b * f)).toFixed(f === 1 && b < 10 ? 1 : 0)}</span>` : '';
    const dmgLbl = d.type === 'beam' ? 'Schaden/s' : 'Schaden';
    const rows = [];
    if (d.dmg) rows.push(`<div>${dmgLbl}<br><b>${fmt(s.dmg)}</b>${nextS ? up(s.dmg, nextS.dmg) : ''}</div>`);
    if (s.range) rows.push(`<div>Reichweite<br><b>${s.range.toFixed(1)}</b>${nextS ? up(s.range, nextS.range) : ''}</div>`);
    if (d.rate && d.type !== 'beam') rows.push(`<div>Angriffe/s<br><b>${s.rate.toFixed(2)}</b>${nextS ? up(s.rate, nextS.rate) : ''}</div>`);
    if (s.splash) rows.push(`<div>Explosion<br><b>${s.splash.toFixed(1)}</b></div>`);
    if (s.slow) rows.push(`<div>Verlangsamung<br><b>${Math.round(s.slow * 100)}%</b></div>`);
    if (s.chains) rows.push(`<div>Sprünge<br><b>${s.chains}</b></div>`);
    if (s.targets > 1) rows.push(`<div>Ziele<br><b>${s.targets}</b></div>`);
    if (s.dot || s.burn) rows.push(`<div>${s.dot ? 'Gift' : 'Brand'}/s<br><b>${fmt(s.dot || s.burn)}</b></div>`);
    if (s.income) rows.push(`<div>Einkommen/Welle<br><b>🪙${s.income}</b></div>`);
    if (s.healEvery) rows.push(`<div>Heilung alle<br><b>${s.healEvery.toFixed(0)}s</b></div>`);
    if (s.buffDmg) rows.push(`<div>Verstärkung<br><b>+${Math.round(s.buffDmg * 100)}%</b></div>`);
    rows.push(`<div>Besiegt<br><b>${t.kills}</b></div>`);
    if (t.buffDmg > 1) rows.push(`<div>Verstärkt<br><b>+${Math.round((t.buffDmg - 1) * 100)}%</b></div>`);
    const hasTarget = !['heal', 'buff', 'aura', 'gold', 'mine', 'shock'].includes(d.type);
    el.innerHTML = `<button class="tp-close" data-tp="close">✕</button>
      <div class="tp-head">${Thumbs.img('tower', d.id)}<div><div class="tp-name">${esc(d.name)}</div>
      <div style="font-size:.75em;color:${RARITIES[d.rarity].color};font-weight:900">${RARITIES[d.rarity].name}</div>
      <div class="tp-lv">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= t.level ? 'on' : ''}"></i>`).join('')}</div><div style="font-size:.78em">Stufe ${t.level} / ${MAX_TOWER_LEVEL}</div></div></div>
      <div class="tp-stats">${rows.join('')}</div>
      <div class="tp-spec">✨ ${esc(d.desc)}<br>${t.level >= 5 ? '👑 <b>' + esc(d.lv5) + '</b> (aktiv)' : '🔒 Stufe 5: ' + esc(d.lv5)}</div>
      ${hasTarget ? `<div class="tp-target">${[['first', 'Erster'], ['last', 'Letzter'], ['strong', 'Stärkster'], ['close', 'Nächster']].map(([k, n]) => `<button data-tp="tg" data-v="${k}" class="${t.targeting === k ? 'on' : ''}">${n}</button>`).join('')}</div>` : ''}
      <div class="tp-btns">
        <button class="btn green" data-tp="up" ${maxed || (!R.mode.creative && R.coins < cost) ? 'disabled' : ''}>${maxed ? 'MAX' : 'UPGRADE<br>🪙' + fmt(cost)}</button>
        <button class="btn red" data-tp="sell">SELL<br>🪙${fmt(Game.sellValue(t))}</button>
        <button class="btn small wide gray" data-tp="move">↔ Verschieben</button>
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

  // ---------------- PLAY / Modus-Auswahl ----------------
  function playDialog() {
    const P = Save.P;
    menuMode = menuMode || 'normal';
    let selBiome = P.equipped.biome;
    const render = () => {
      let h = '';
      if (P.run && MODE_BY_ID[P.run.mode]) {
        const m = MODE_BY_ID[P.run.mode];
        h += `<div class="detail" style="align-items:center"><div style="font-size:2.4em">${m.icon}</div><div style="flex:1"><h3>Runde fortsetzen</h3><p>${m.name} · Welle ${P.run.wave} · ${P.run.towers.length} Türme · 🪙${fmt(P.run.coins)}</p></div><button class="btn green" id="pdCont">▶ FORTSETZEN</button></div>`;
      }
      h += `<h4 class="sec">Spielmodus wählen</h4><div class="modes">`;
      for (const m of MODES) {
        const locked = m.unlock && P.level < m.unlock;
        h += `<div class="mode${menuMode === m.id ? ' on' : ''}${locked ? ' locked' : ''}" data-mode="${m.id}"><div class="mi">${m.icon}</div><div class="mn">${m.name}</div><div class="md">${m.desc}</div><div class="sub" style="font-size:.75em">${locked ? '🔒 ab Level ' + m.unlock : 'Rekord: Welle ' + (P.records[m.id] || 0)}</div></div>`;
      }
      h += `</div><h4 class="sec">Landschaft (Biom)</h4><div class="biomes">`;
      for (const b of BIOMES) {
        const own = P.owned.biomes.includes(b.id);
        h += `<div class="biome${selBiome === b.id ? ' on' : ''}${own ? '' : ' locked'}" data-biome="${b.id}" style="background:linear-gradient(${b.sky},${b.ground})">${own ? '' : '🔒 '}${b.name}</div>`;
      }
      h += `</div><div class="row" style="margin-top:1em"><button class="btn big green" id="pdStart">▶ NEUE RUNDE STARTEN</button></div>`;
      if (P.run) h += `<p class="note">⚠️ Eine neue Runde ersetzt die gespeicherte Runde. Dein Grundstück (Straßen &amp; Deko) bleibt erhalten.</p>`;
      $('#modalBody').innerHTML = h;
      $$('.mode').forEach(el => el.onclick = () => { const m = MODE_BY_ID[el.dataset.mode]; if (m.unlock && P.level < m.unlock) return toast(`🔒 Ab Level ${m.unlock}`, 'bad'); menuMode = m.id; Audio2.play('click'); render(); });
      $$('.biome').forEach(el => el.onclick = () => { if (!P.owned.biomes.includes(el.dataset.biome)) { const b = BIOME_BY_ID[el.dataset.biome]; return toast(`🔒 ${b.name}: ab Level ${b.level} oder im Shop`, 'bad'); } selBiome = el.dataset.biome; Audio2.play('click'); render(); });
      $('#pdStart').onclick = () => { Audio2.play('click'); P.run = null; startGame(menuMode, selBiome); };
      const c = $('#pdCont'); if (c) c.onclick = () => { Audio2.play('click'); startGame(P.run.mode, P.run.biome, P.run); };
    };
    openModal('▶ PLAY', '');
    render();
  }

  // ---------------- Inventar / Türme / Sammlung ----------------
  function towerDetail(t) {
    const P = Save.P; const un = P.unlocked.includes(t.id);
    const rows = [1, 2, 3, 4, 5].map(l => {
      const d = t.dmg * LEVEL_DMG[l - 1], r = t.range ? t.range + LEVEL_RANGE[l - 1] : 0, s = t.rate * LEVEL_RATE[l - 1];
      const cost = l === 1 ? t.cost : Math.round(t.cost * UPGRADE_COST[l - 2]);
      return `<tr><td>Stufe ${l}</td><td>${t.dmg ? fmt(d) : '–'}</td><td>${r ? r.toFixed(1) : '–'}</td><td>${t.rate && t.type !== 'beam' ? s.toFixed(2) : '–'}</td><td>🪙${fmt(cost)}</td></tr>`;
    }).join('');
    const tags = [t.air ? '✈️ Trifft Flieger' : '', t.ground ? '🦶 Nur Boden' : '', t.detect ? '👁️ Erkennt Unsichtbare' : '', t.pierce ? '🛡️ Durchschlägt Rüstung' : ''].filter(Boolean).join(' · ');
    return `<div class="detail">${Thumbs.img('tower5', t.id)}<div style="flex:1"><h3>${esc(t.name)} ${rarityBadge(t.rarity)}</h3><p>${esc(t.desc)}</p><p>👑 Stufe 5: ${esc(t.lv5)}</p><p style="opacity:.8">${tags || ''}</p>
      <p>${un ? '✅ Freigeschaltet' : t.shop ? `🔒 Im Shop für 🔮 ${t.shop.crystals}` : `🔒 Ab Spielerlevel ${t.level} (oder im Shop)`}</p>
      <table class="lvt"><tr><th></th><th>Schaden</th><th>Reichw.</th><th>Rate</th><th>Kosten</th></tr>${rows}</table></div></div>`;
  }
  function towersScreen(title = '🏰 TOWERS') {
    const P = Save.P;
    let q = '', rar = 'all', sort = 'cost', own = 'all', det = null;
    openModal(title, '');
    const render = () => {
      let list = TOWERS.filter(t => (!q || t.name.toLowerCase().includes(q)) && (rar === 'all' || t.rarity === rar) && (own === 'all' || (own === 'own') === P.unlocked.includes(t.id)));
      const sorters = { cost: (a, b) => a.cost - b.cost, name: (a, b) => a.name.localeCompare(b.name), rarity: (a, b) => RARITIES[b.rarity].order - RARITIES[a.rarity].order, dmg: (a, b) => b.dmg * b.rate - a.dmg * a.rate, range: (a, b) => b.range - a.range };
      list.sort(sorters[sort]);
      let h = `<div class="filters"><input id="fq" placeholder="🔍 Suchen…" value="${esc(q)}"><select id="fr"><option value="all">Alle Seltenheiten</option>${Object.entries(RARITIES).map(([k, r]) => `<option value="${k}" ${rar === k ? 'selected' : ''}>${r.name}</option>`).join('')}</select>
        <select id="fo"><option value="all">Alle</option><option value="own" ${own === 'own' ? 'selected' : ''}>Freigeschaltet</option><option value="locked" ${own === 'locked' ? 'selected' : ''}>Gesperrt</option></select>
        <select id="fs">${[['cost', 'Kosten'], ['name', 'Name'], ['rarity', 'Seltenheit'], ['dmg', 'Schaden'], ['range', 'Reichweite']].map(([k, n]) => `<option value="${k}" ${sort === k ? 'selected' : ''}>Sortieren: ${n}</option>`).join('')}</select></div>
        <div style="font-size:.85em;margin-bottom:.5em">Freigeschaltet: <b>${P.unlocked.length} / ${TOWERS.length}</b></div>`;
      if (det) h += towerDetail(TOWER_BY_ID[det]);
      h += `<div class="cards">${list.map(t => { const un = P.unlocked.includes(t.id); return `<div class="card${un ? '' : ' locked'}" data-t="${t.id}" style="border-color:${RARITIES[t.rarity].color}">${un ? '' : '<span class="tag">🔒</span>'}${Thumbs.img('tower', t.id)}<div class="nm">${esc(t.name)}</div>${rarityBadge(t.rarity)}<div class="sub">🪙${fmt(t.cost)}</div></div>`; }).join('') || '<p>Keine Türme gefunden.</p>'}</div>`;
      $('#modalBody').innerHTML = h;
      const fq = $('#fq'); fq.oninput = () => { q = fq.value.toLowerCase(); const pos = fq.selectionStart; render(); const n = $('#fq'); n.focus(); n.setSelectionRange(pos, pos); };
      $('#fr').onchange = e => { rar = e.target.value; render(); };
      $('#fo').onchange = e => { own = e.target.value; render(); };
      $('#fs').onchange = e => { sort = e.target.value; render(); };
      $$('.card[data-t]').forEach(c => c.onclick = () => { det = c.dataset.t; Audio2.play('click'); render(); $('#modalBody').scrollTop = 0; });
    };
    render();
  }
  function inventoryScreen() {
    const P = Save.P;
    let tab = 'towers', q = '', rar = 'all';
    openModal('🎒 INVENTORY', '');
    const render = () => {
      const tabs = [['towers', '🏰 Türme'], ['skins', '🛣️ Straßen-Skins'], ['effects', '✨ Effekte'], ['castles', '🏯 Burgen'], ['biomes', '🌍 Biome'], ['decos', '🗿 Spezialgebäude'], ['boosts', '⚡ Boosts']];
      let h = `<div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="filters"><input id="iq" placeholder="🔍 Suchen…" value="${esc(q)}"><select id="ir"><option value="all">Alle Seltenheiten</option>${Object.entries(RARITIES).map(([k, r]) => `<option value="${k}" ${rar === k ? 'selected' : ''}>${r.name}</option>`).join('')}</select></div>`;
      const match = (name, r) => (!q || name.toLowerCase().includes(q)) && (rar === 'all' || r === rar);
      let cards = '';
      if (tab === 'towers') {
        cards = TOWERS.filter(t => P.unlocked.includes(t.id) && match(t.name, t.rarity)).map(t => `<div class="card" style="border-color:${RARITIES[t.rarity].color}">${Thumbs.img('tower', t.id)}<div class="nm">${esc(t.name)}</div>${rarityBadge(t.rarity)}</div>`).join('');
        cards += `<div class="card" data-go="towers"><div class="ic">📚</div><div class="nm">Alle Türme ansehen</div><div class="sub">${P.unlocked.length}/${TOWERS.length}</div></div>`;
      } else if (tab === 'skins' || tab === 'effects' || tab === 'castles') {
        const list = tab === 'skins' ? ROAD_SKINS : tab === 'effects' ? EFFECTS : CASTLES;
        const slot = tab === 'skins' ? 'skin' : tab === 'effects' ? 'effect' : 'castle';
        cards = list.filter(i => P.owned[tab].includes(i.id) && match(i.name, i.rarity)).map(i => {
          const eq = P.equipped[slot] === i.id;
          const pic = tab === 'castles' ? Thumbs.img('castle', i.id) : `<div class="ic"><span style="display:inline-block;width:1.2em;height:1.2em;border-radius:10px;background:${i.tint === 'rainbow' ? 'conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)' : (i.tint || '#9b9a94')}"></span></div>`;
          return `<div class="card${eq ? ' eq' : ''}" style="border-color:${RARITIES[i.rarity].color}">${eq ? '<span class="tag">✅</span>' : ''}${pic}<div class="nm">${esc(i.name)}</div>${rarityBadge(i.rarity)}<button class="btn small ${eq ? 'gray' : 'green'} buy" data-eq="${slot}" data-id="${i.id}" ${eq ? 'disabled' : ''}>${eq ? 'Ausgerüstet' : 'Ausrüsten'}</button></div>`;
        }).join('');
      } else if (tab === 'biomes') {
        cards = BIOMES.filter(b => P.owned.biomes.includes(b.id) && match(b.name, 'common')).map(b => `<div class="card${P.equipped.biome === b.id ? ' eq' : ''}"><div class="ic" style="background:linear-gradient(${b.sky},${b.ground});border-radius:10px">🌍</div><div class="nm">${esc(b.name)}</div><div class="sub">In PLAY auswählbar</div></div>`).join('');
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
      $$('[data-go="towers"]').forEach(b => b.onclick = () => towersScreen());
    };
    render();
  }
  function equip(slot, id) {
    Save.P.equipped[slot] = id; Save.save(); Audio2.play('upgrade');
    if (slot === 'skin') Game.rebuildRoadsVisual();
    if (slot === 'effect') Particles.setTint(EFFECTS.find(e => e.id === id));
    if (slot === 'castle') Game.placeCastle();
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
    const P = Save.P; let tab = 'towers';
    openModal('🛒 SHOP', '');
    const towerPrice = t => t.shop ? { crystals: t.shop.crystals } : { gems: Math.max(40, t.level * 14) };
    const render = () => {
      const tabs = [['towers', '🏰 Neue Türme'], ['decos', '🗿 Besondere Gebäude'], ['skins', '🛣️ Straßen-Skins'], ['biomes', '🌍 Landschaften'], ['effects', '✨ Effekte'], ['castles', '🏯 Burgen'], ['boosts', '⚡ Boosts']];
      let h = `<div class="cur-row" style="margin-bottom:.6em"><div class="res gems"><span>💎</span><b>${fmt(P.gems)}</b></div><div class="res crys"><span>🔮</span><b>${fmt(P.crystals)}</b></div></div>
        <div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
      const price = p => p.crystals ? `🔮 ${p.crystals}` : p.gems ? `💎 ${p.gems}` : 'Gratis';
      const afford = p => (p.crystals ? P.crystals >= p.crystals : P.gems >= (p.gems || 0));
      let items = [];
      if (tab === 'towers') items = TOWERS.filter(t => !P.unlocked.includes(t.id)).map(t => ({ id: t.id, name: t.name, desc: t.desc + (t.shop ? '' : ` (Sonst frei ab Lv ${t.level})`), rarity: t.rarity, price: towerPrice(t), pic: Thumbs.img('tower', t.id) }));
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
      <p class="note">💎 Edelsteine bekommst du durch Levelaufstiege, Bosse, Aufgaben, Erfolge und die Tagesbelohnung. 🔮 Kristalle gibt es für Bosse und besondere Erfolge. Es gibt keine Echtgeld-Käufe.</p>`;
      $('#modalBody').innerHTML = h;
      $$('.tabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; Audio2.play('click'); render(); });
      $$('[data-buy]').forEach(b => b.onclick = () => {
        const cat = b.dataset.buy, id = b.dataset.id;
        const it = items.find(i => i.id === id); const p = it.price;
        if (!afford(p)) { Audio2.play('error'); return toast('Nicht genug ' + (p.crystals ? 'Kristalle 🔮' : 'Edelsteine 💎'), 'bad'); }
        if (p.crystals) P.crystals -= p.crystals; else P.gems -= p.gems || 0;
        if (cat === 'towers') P.unlocked.push(id);
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
      ['Dekorationen', fmt(s.decoBuilt)], ['Upgrades', fmt(s.upgrades)], ['Verdiente Münzen', fmt(s.coinsEarned)], ['Verursachter Schaden', fmt(s.damage)], ['Gespielte Runden', s.gamesPlayed], ['Siege', s.victories],
      ['Verlorene Leben', fmt(s.livesLost)], ['Perfekte Wellen', s.perfectWaves], ['Spielzeit', pt], ['Edelsteine verdient', fmt(s.gemsEarned)], ['Entdeckte Gegner', Object.keys(P.seen).length + ' / ' + ENEMIES.length], ['Freigeschaltete Türme', P.unlocked.length + ' / 30']];
    let h = `<div class="statgrid">${rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}</div><h4 class="sec">🏅 Rekorde</h4><div class="statgrid">${MODES.map(m => `<div><span>${m.icon} ${m.name}</span><b>Welle ${P.records[m.id] || 0}</b></div>`).join('')}</div>`;
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
        ${tg('particles', '✨ Viele Partikeleffekte')}${tg('autoStart', '⏱️ Nächste Welle automatisch starten (25s Pause)')}${tg('damageNumbers', '🔢 Münz-Anzeigen über Gegnern')}${tg('showGrid', '#️⃣ Raster beim Bauen')}
        <h4 class="sec">🎮 Steuerung</h4>
        <p class="note">🖱️ <b>PC:</b> Linksklick bauen/auswählen · Linke Maus ziehen: Kamera verschieben (ohne Bauauswahl) bzw. Straßen malen · Rechte Maus: drehen · Mausrad: Zoom · WASD/Pfeile: bewegen · Q/E: drehen · R: Gebäude drehen · Leertaste: Welle · Esc: abbrechen · U: Upgrade · X: Verkaufen<br>
        📱 <b>Touch:</b> 1 Finger: Kamera verschieben (ohne Auswahl) oder bauen/malen · 2 Finger: zoomen, drehen und verschieben · Knöpfe links: Kamera drehen/zoomen</p>
        <h4 class="sec">⚠️ Daten</h4>
        <div class="row" style="justify-content:flex-start"><button class="btn small gray" id="resetPlot">Grundstück zurücksetzen</button><button class="btn small red" id="resetAll">Gesamten Spielstand löschen</button></div>
        <p class="note">Dein Fortschritt wird automatisch auf diesem Gerät gespeichert (im Browser-Speicher).</p>`;
      $('#modalBody').innerHTML = h;
      $('#setName').onchange = e => { P.name = (e.target.value.trim() || 'Spieler').slice(0, 16); Save.save(); lastHud.lv = null; };
      $('#setMusic').oninput = e => { S.music = +e.target.value; Audio2.setVolumes(S.sfx, S.music); Save.saveSoon(); };
      $('#setSfx').oninput = e => { S.sfx = +e.target.value; Audio2.setVolumes(S.sfx, S.music); Save.saveSoon(); };
      $('#setSfx').onchange = () => Audio2.play('coin');
      $('#setQ').onchange = e => { S.quality = e.target.value; World.setQuality(S.quality); Save.save(); };
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

  // ---------------- Pause / Ergebnis ----------------
  function pauseMenu() {
    const R = Game.R;
    openModal('⏸ Pause', `<div class="row" style="flex-direction:column;align-items:stretch;gap:10px">
      <button class="btn green big" id="pmResume">▶ Weiterspielen</button>
      <button class="btn" id="pmShare">🔗 Grundstück teilen</button>
      <button class="btn" id="pmStats">📊 Statistiken</button>
      <button class="btn red" id="pmMenu">🏠 Zum Hauptmenü (speichert)</button></div>
      <p class="note">Gespeichert wird nach jeder abgeschlossenen Welle. Verlässt du eine laufende Welle, beginnt sie beim Fortsetzen von vorn.</p>`, true);
    $('#pmResume').onclick = () => closeModal();
    $('#pmShare').onclick = () => shareScreen();
    $('#pmStats').onclick = () => statsScreen();
    $('#pmMenu').onclick = () => { Save.save(); goMenu(); };
  }
  function resultScreen(s, won) {
    const t = s.time; const tm = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const h = `<div class="result"><div class="big">${won ? '🏆 SIEG!' : '💀 GAME OVER'}</div><div>${s.mode.icon} ${s.mode.name}</div>
      <div class="statgrid"><div><span>Überstandene Wellen</span><b>${s.waves}</b></div><div><span>Besiegte Gegner</span><b>${fmt(s.kills)}</b></div><div><span>Verdiente Münzen</span><b>${fmt(s.coins)}</b></div><div><span>Besiegte Bosse</span><b>${s.bosses}</b></div><div><span>Spielzeit</span><b>${tm}</b></div><div><span>Persönlicher Rekord</span><b>Welle ${Math.max(s.record, s.waves)}</b></div></div>
      ${won ? '<p>Belohnung: 💎100 🔮10</p>' : ''}
      <div class="row">${won && s.mode.id !== 'boss' ? '<button class="btn green" id="rsCont">♾️ Weiterspielen (Endlos)</button>' : ''}<button class="btn ${won ? '' : 'green'}" id="rsRetry">🔁 Neu starten</button><button class="btn gray" id="rsMenu">🏠 Hauptmenü</button></div></div>`;
    openModal(won ? 'Sieg' : 'Niederlage', h, true);
    $('#modalClose').classList.add('hidden');
    const done = () => $('#modalClose').classList.remove('hidden');
    const c = $('#rsCont'); if (c) c.onclick = () => { done(); Game.continueEndless(); closeModal(); Game.R.paused = false; hud(true); };
    $('#rsRetry').onclick = () => { done(); startGame(s.mode.id, Game.R.biome); };
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
      const tab = e.target.closest('#bbTabs button'); if (tab) { curTab = tab.dataset.tab; Audio2.play('click'); renderBuildBar(); return; }
      const cam = e.target.closest('[data-cam]');
      if (cam) { const c = cam.dataset.cam; if (c === 'rl') CamCtl.rotate(Math.PI / 4); if (c === 'rr') CamCtl.rotate(-Math.PI / 4); if (c === 'zi') CamCtl.zoom(0.8); if (c === 'zo') CamCtl.zoom(1.25); if (c === 'reset') CamCtl.reset(); return; }
      const tp = e.target.closest('[data-tp]');
      if (tp) {
        const t = Game.selected; const k = tp.dataset.tp;
        if (k === 'close') Game.select(null);
        if (!t) return;
        if (k === 'up') Game.upgrade(t);
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
    $('#rotateOk').onclick = () => { $('#rotateHint').classList.add('hidden'); rotateDismissed = true; };
    const checkRot = () => { const portrait = innerHeight > innerWidth * 1.1 && innerWidth < 900; $('#rotateHint').classList.toggle('hidden', !portrait || rotateDismissed); };
    addEventListener('resize', checkRot); checkRot();
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'escape') { if (!$('#modal').classList.contains('hidden')) closeModal(); else if (Game.buildSel) Game.setBuild(null); else if (Game.selected) Game.select(null); else if (screen === 'game') pauseMenu(); }
      if (screen !== 'game' || !$('#modal').classList.contains('hidden')) return;
      if (k === 'r') Game.rotateBuild();
      if (k === ' ') { e.preventDefault(); $('#waveBtn').click(); }
      if (k === 'u' && Game.selected) Game.upgrade(Game.selected);
      if (k === 'x' && Game.selected) Game.sell(Game.selected);
      if (k === 'm' && Game.selected) Game.startMove(Game.selected);
      if (k === 'p') $('#pauseBtn').click();
      if (k === 'f') $('#speedBtn').click();
      if (/^[1-9]$/.test(k)) { const un = TOWERS.filter(t => Save.P.unlocked.includes(t.id)).sort((a, b) => a.cost - b.cost); const t = un[+k - 1]; if (t) { curTab = 'towers'; Game.setBuild({ kind: 'tower', id: t.id }); } }
    });
    // Mausrad im Baumenü horizontal scrollen
    $('#bbItems').addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { $('#bbItems').scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  }
  let rotateDismissed = false;

  // Callbacks aus dem Spiel
  function hookGame() {
    Object.assign(Game.ui, {
      toast, hud: () => {}, towerPanel, buildChanged,
      routeChanged: ok => { if (!ok && screen === 'game') toast('⚠️ Kein Weg vom Spawn zum Ziel!', 'bad'); },
      waveBanner: (w, boss) => banner(boss ? '👑 BOSSWELLE ' + w : 'WELLE ' + w, boss ? 'Ein mächtiger Boss naht!' : '', boss ? 'boss' : '', 1800),
      waveCleared: (w, bonus, income) => toast(`✅ Welle ${w} geschafft! +${bonus}${income ? ' +' + income + ' (Gold)' : ''} 🪙`, 'good'),
      bossAppear: e => { if (e) banner('👑 ' + e.def.name, e.def.kind, 'boss', 2200); },
      newEnemy: def => toast(`📖 Neuer Gegner entdeckt: <b>${esc(def.name)}</b>`, ''),
      gameOver: s => resultScreen(s, false),
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

  return { show, toast, banner, hud, goMenu, startGame, renderBuildBar, bindEvents, hookGame, refreshMenu, closeModal, get screen() { return screen; } };
})();
