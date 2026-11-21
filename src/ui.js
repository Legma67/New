// Benutzeroberfläche: HUD, Baumenü, Turm-Panel, Menüs, Shop, Inventar, Aufgaben, Erfolge, Einstellungen
import * as THREE from 'three';
import { S } from './state.js';
import { MODES, RARITY, MAX_LEVEL, TILE, fmt } from './config.js';
import { TOWERS, TOWER_BY_ID, towerStats, upgradeCost, LEVEL_NAMES } from './data/towers.js';
import { ENEMIES, ENEMY_BY_ID } from './data/enemies.js';
import { ROADS, DECOS, BIOMES, BIOME_BY_ID, KILL_FX, BASE_SKINS, ROAD_BY_ID, DECO_BY_ID } from './data/world.js';
import { ACHIEVEMENTS, QUEST_LINES, xpForLevel } from './data/meta.js';
import { THUMBS } from './thumbs.js';
import { hooks, towerUnlocked, biomeUnlocked, spendGems, spendCrystals, questInfo, claimQuest, questsReady, dailyAvailable, dailyReward, claimDaily,
  achProgress, rewardText, saveNow, exportSave, importSave, resetSave, stat, checkAchievements, addCoins } from './profile.js';
import { Sound } from './audio.js';
import { startRun, enterMenu, upgradeTower, sellTower, plotKeyFor, updateBoardInfo, savePlot } from './game.js';
import { startNextWave, wavePreview } from './waves.js';
import { B, setTool, select, rotate } from './build.js';
import { setBaseSkin, updateSigns } from './world.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rc = (r) => RARITY[r]?.color || '#fff';
const pct = (v) => Math.round(v * 100) + '%';
const img = (key, cls = '') => `<img ${cls ? `class="${cls}"` : ''} src="${THUMBS[key] || ''}" alt="" draggable="false">`;
const DMG_TYPES = { phys: 'Physisch', fire: 'Feuer', ice: 'Eis', poison: 'Gift', magic: 'Magie', energy: 'Energie' };

export const UI = {
  tab: 'tower', modalOpen: false, pausedByModal: false, hudT: 0, lastWave: -1, camYaw: 0, sel: { mode: 'normal', biome: 'grass' },
  invTab: 'towers', shopTab: 'towers', invQuery: '', invFilter: 'all', invSort: 'rarity',

  init() {
    hooks.toast = (t, b, k) => this.toast(t, b, k);
    hooks.hud = () => { this.hudDirty = true; };
    hooks.achievement = (a) => this.toast(`🏆 Erfolg: ${a.name}`, `${a.desc} · +${a.gems} 💎`, 'ach', 4000);
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]'); if (!el) return;
      const fn = ACT[el.dataset.act]; if (!fn) return;
      Sound.init(); Sound.play('click'); fn(el.dataset, el, e);
    });
    document.addEventListener('input', (e) => { const el = e.target.closest('[data-inp]'); if (el && INP[el.dataset.inp]) INP[el.dataset.inp](el); });
    document.addEventListener('change', (e) => { const el = e.target.closest('[data-chg]'); if (el && CHG[el.dataset.chg]) CHG[el.dataset.chg](el); });
    $('modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') this.closeModal(); });
    this.buildHUD();
  },

  // ------------------------------------------------------------ Menü
  enterMenu() {
    $('hud').classList.add('hidden'); $('menu').classList.remove('hidden');
    this.closeModal(); this.showTowerPanel(null);
    setTool(null);
    this.renderMenu();
  },
  renderMenu() {
    const p = S.profile;
    const qs = questsReady();
    $('menu').innerHTML = `
      <div class="mtop">
        <div class="panel pcard"><div class="lvl">${p.level}</div><div><div class="pname">${esc(p.name)}</div>
          <div class="xpbar"><i style="width:${pct(p.xp / xpForLevel(p.level))}"></i></div></div></div>
        <div class="cur"><div class="pill coins">🪙 ${fmt(p.coins)}</div><div class="pill gems">💎 ${fmt(p.gems)}</div><div class="pill cry">🔮 ${fmt(p.crystals)}</div></div>
      </div>
      <div class="mcenter">
        <div class="logo"><span>BUILD YOUR OWN</span><b>TOWER DEFENSE</b></div>
        <div class="mbtns">
          <button class="btn green play" data-act="openPlay">▶ PLAY</button>
          <button class="btn" data-act="openInventory">🎒 INVENTORY</button>
          <button class="btn purple" data-act="openTowers">🗼 TOWERS</button>
          <button class="btn gold" data-act="openShop">🛒 SHOP</button>
          <button class="btn" data-act="openQuests">📜 QUESTS${qs || dailyAvailable() ? `<span class="badge">${qs + (dailyAvailable() ? 1 : 0)}</span>` : ''}</button>
          <button class="btn gray" data-act="openSettings">⚙️ SETTINGS</button>
          <button class="btn purple" data-act="openCollection">📖 COLLECTION</button>
          <button class="btn gold" data-act="openAchievements">🏆 ACHIEVEMENTS</button>
          <button class="btn gray" data-act="openStats">📊 STATISTIKEN</button>
        </div>
        ${dailyAvailable() ? `<button class="btn gold daily" data-act="daily">🎁 Tagesbelohnung abholen</button>` : ''}
      </div>
      <div class="mfoot">Rekord: Welle ${p.stats.bestWave} · ${Object.keys(p.ach).length}/${ACHIEVEMENTS.length} Erfolge · Fortschritt wird automatisch gespeichert</div>`;
  },

  // ------------------------------------------------------------ HUD
  enterGame() {
    $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
    this.closeModal(); this.showTowerPanel(null);
    this.lastWave = -1; this.tab = 'tower';
    this.refreshBuildBar(); this.updateHUD(true);
    this.camReset();
  },
  buildHUD() {
    $('tl').innerHTML = `<div class="lvl" id="hLvl">1</div><div><div class="pname" id="hName"></div><div class="xpbar"><i id="hXp"></i></div></div>`;
    $('tr').innerHTML = `<div class="pill coins" id="hCoins">🪙 0</div><div class="pill gems" id="hGems">💎 0</div><div class="pill cry" id="hCry">🔮 0</div><button class="btn gold small shopbtn" data-act="openShop">🛒 Shop</button>`;
    $('wave').innerHTML = `
      <div class="wrow"><div class="wtitle" id="wTitle">Welle 0</div><div class="lives" id="wLives">❤ 20</div></div>
      <div class="wprog"><i id="wProg"></i></div>
      <div class="wrow"><div id="wEnemies" style="font-size:13px;color:var(--mut)"></div><div class="wnext" id="wNext"></div></div>
      <div class="wbtns"><button class="btn green" id="wBtn" data-act="wave">▶ Welle starten</button>
        <button class="btn small gray" id="wSpeed" data-act="speed">⏩ x1</button><button class="btn small gray" id="wAuto" data-act="auto">🔁 Auto</button></div>`;
    $('side').innerHTML = `
      <button class="ibtn" data-act="pause" title="Pause / Menü">⏸</button>
      <button class="ibtn" data-act="openSettings" title="Einstellungen">⚙️</button>
      <button class="ibtn" data-act="openInventory" title="Inventar">🎒</button>
      <button class="ibtn" data-act="openQuests" title="Aufgaben" id="sQuest">📜</button>
      <button class="ibtn" data-act="openStats" title="Statistiken">📊</button>
      <button class="ibtn" data-act="openAchievements" title="Erfolge">🏆</button>`;
    $('cam').innerHTML = `
      <button class="ibtn" data-act="camRot" data-d="-1" title="Kamera links drehen (Q)">⟲</button>
      <button class="ibtn" data-act="camRot" data-d="1" title="Kamera rechts drehen (E)">⟳</button>
      <button class="ibtn" data-act="camZoom" data-d="0.8" title="Hineinzoomen">＋</button>
      <button class="ibtn" data-act="camZoom" data-d="1.25" title="Herauszoomen">－</button>
      <button class="ibtn" data-act="camReset" title="Ansicht zurücksetzen">⌂</button>`;
  },
  updateHUD(force) {
    const p = S.profile, run = S.run; if (!run) return;
    $('hLvl').textContent = p.level; $('hName').textContent = p.name;
    $('hXp').style.width = pct(p.xp / xpForLevel(p.level));
    $('hCoins').textContent = run.creative ? '🪙 ∞' : '🪙 ' + fmt(p.coins);
    $('hGems').textContent = '💎 ' + fmt(p.gems); $('hCry').textContent = '🔮 ' + fmt(p.crystals);
    const m = run.modeDef;
    $('wTitle').innerHTML = `Welle ${run.wave}${m.winWave ? ' / ' + m.winWave : ''}<small>${m.name}</small>`;
    $('wLives').textContent = run.creative ? '❤ ∞' : `❤ ${run.lives}`;
    const left = run.queue.length + S.enemies.length;
    $('wProg').style.width = run.active && run.waveTotal ? pct(Math.max(0, 1 - left / Math.max(left, run.waveTotal))) : run.wave ? '100%' : '0%';
    $('wEnemies').textContent = run.active ? `👾 ${left} übrig · ${run.waveTotal} gesamt` : run.autoT > 0 ? `Nächste Welle in ${Math.ceil(run.autoT)}s` : 'Bauphase – bereite dich vor!';
    const btn = $('wBtn');
    btn.textContent = run.active ? `⏩ Welle überspringen` : `▶ Welle ${run.wave + 1} starten`;
    btn.className = 'btn ' + (run.active ? 'gold' : 'green');
    $('wSpeed').textContent = `⏩ x${S.speed}`;
    $('wAuto').className = 'btn small ' + (p.settings.autoStart ? 'green' : 'gray');
    if (run.wave !== this.lastWave) {
      this.lastWave = run.wave;
      const nx = wavePreview(run.wave + 1, run);
      $('wNext').innerHTML = 'Nächste: ' + nx.map((d) => `<img src="${THUMBS['e_' + d.id] || ''}" title="${esc(d.name)}">`).join('');
      updateBoardInfo();
    }
    // Boss-Leiste
    const boss = S.enemies.find((e) => e.alive && (e.def.boss || e.def.miniboss));
    const bb = $('bossbar');
    if (boss) { bb.classList.remove('hidden'); bb.innerHTML = `<div class="bn">${boss.def.boss ? '💀 BOSS' : '⚠️ MINI-BOSS'}: ${esc(boss.def.name)} – ${fmt(boss.hp)} / ${fmt(boss.maxHp)}</div><div class="bb"><i style="width:${pct(boss.hp / boss.maxHp)}"></i></div>`; }
    else bb.classList.add('hidden');
    const qs = questsReady() + (dailyAvailable() ? 1 : 0);
    $('sQuest').innerHTML = '📜' + (qs ? `<span class="badge">${qs}</span>` : '');
    // Baumenü Bezahlbarkeit
    document.querySelectorAll('.bitem[data-cost]').forEach((el) => el.classList.toggle('poor', !run.creative && p.coins < +el.dataset.cost));
    // Turm-Panel
    if (S.selected) {
      const up = $('tpUp'); const t = S.selected;
      if (up && t.level < MAX_LEVEL) up.classList.toggle('dis', !run.creative && p.coins < t.upgradeCost);
      const dd = $('tpDmg'); if (dd) dd.textContent = fmt(t.dmgDone);
    }
  },
  update(dt) {
    if (this.camYaw) { const step = Math.sign(this.camYaw) * Math.min(Math.abs(this.camYaw), dt * 4); this.camYaw -= step; this.rotateCam(step); }
    if (S.state !== 'play') return;
    this.hudT -= dt;
    if (this.hudT <= 0 || this.hudDirty) { this.hudT = 0.12; this.hudDirty = false; this.updateHUD(); }
  },

  // ------------------------------------------------------------ Baumenü
  buildItems(tab) {
    const p = S.profile;
    if (tab === 'road') return ROADS.filter((r) => !r.shop || p.owned['road_' + r.id]).map((r) => ({ cat: 'road', id: r.id, name: r.name, cost: r.cost, img: r.id }));
    if (tab === 'tower') return TOWERS.map((t) => ({ cat: 'tower', id: t.id, name: t.name, cost: t.cost, img: 't_' + t.id, rarity: t.rarity, locked: !towerUnlocked(t.id), unlock: t.unlock }));
    const cat = tab === 'deco' ? 'deco' : 'build';
    return DECOS.filter((d) => d.cat === cat && (!d.shop || p.owned['deco_' + d.id])).map((d) => ({ cat: 'deco', id: d.id, name: d.name, cost: d.cost, img: d.id }));
  },
  refreshBuildBar() {
    if (S.state !== 'play') return;
    const tool = B.tool;
    const tabs = [['road', '🛤️ Straßen'], ['tower', '🗼 Türme'], ['deco', '🌳 Deko'], ['build', '🏠 Gebäude']];
    const items = this.buildItems(this.tab);
    $('buildbar').innerHTML = `
      <div class="btabs">${tabs.map(([k, n]) => `<button class="tab ${this.tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${n}</button>`).join('')}
        <div class="tools">
          <button class="tool" data-act="rotate" title="Drehen (R)">🔄</button>
          <button class="tool ${tool && tool.cat === 'bulldoze' ? 'on' : ''}" data-act="bulldoze" title="Abreißen (B)">🧹 Abriss</button>
          ${tool ? `<button class="tool on" data-act="cancelTool">✖</button>` : ''}
        </div></div>
      <div class="bitems panel">${items.map((it, i) => {
        const on = tool && tool.cat === it.cat && tool.id === it.id;
        return `<button class="bitem ${on ? 'on' : ''} ${it.locked ? 'locked' : ''}" style="--rc:${it.rarity ? rc(it.rarity) : 'rgba(255,255,255,.15)'}" data-act="pick" data-cat="${it.cat}" data-id="${it.id}" ${it.locked ? '' : `data-cost="${it.cost}"`} title="${esc(it.name)}">
          ${i < 9 ? `<span class="key">${i + 1}</span>` : ''}${img(it.img)}<div class="bn">${esc(it.name)}</div><div class="bc">🪙 ${fmt(it.cost)}</div>
          ${it.locked ? `<div class="lk">🔒 Lvl ${it.unlock < 99 ? it.unlock : '?'}</div>` : ''}</button>`;
      }).join('')}</div>`;
    this.updateHUD();
  },
  buildHint(msg) { const h = $('hint'); if (msg && B.tool) { h.textContent = msg; h.classList.remove('hidden'); } else h.classList.add('hidden'); },
  quickSelect(i) { const it = this.buildItems(this.tab)[i]; if (it) ACT.pick({ cat: it.cat, id: it.id }); },

  // ------------------------------------------------------------ Turm-Panel
  showTowerPanel(t) {
    const el = $('towerpanel');
    if (!t) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    const def = t.def, s = t.stats, lvl = t.level;
    const next = lvl < MAX_LEVEL ? towerStats(def, lvl + 1, t.buff) : null;
    const rows = statRows(def, s, next);
    const attacks = !['gold', 'heal', 'support'].includes(def.type) && !(def.type === 'aura' && !def.dmg);
    const creative = S.run && S.run.creative;
    el.innerHTML = `
      <button class="xbtn tpx" data-act="deselect">✕</button>
      <div class="tph">${img('t' + (lvl >= 3 ? '5' : '') + '_' + def.id)}<div><h3>${esc(def.name)}</h3>
        <span class="rar" style="background:${rc(def.rarity)}">${def.rarity}</span>
        <div class="stars">${'★'.repeat(lvl)}${'☆'.repeat(MAX_LEVEL - lvl)} <small style="color:#fff">Stufe ${LEVEL_NAMES[lvl]}</small></div></div></div>
      <div class="stats">${rows.map(([k, v, n]) => `<span>${k}</span><b>${v}${n && n !== v ? `<em>→ ${n}</em>` : ''}</b>`).join('')}
        <span>Schaden verursacht</span><b id="tpDmg">${fmt(t.dmgDone)}</b>
        ${t.buff ? `<span>Verstärkung</span><b style="color:var(--gem)">+${pct(t.buff)}</b>` : ''}</div>
      <div class="spec">✨ <b>${esc(def.special)}</b> – ${esc(def.desc)}</div>
      ${attacks && def.type !== 'mine' && def.type !== 'meteor' ? `<div class="tmodes">${[['first', 'Erster'], ['last', 'Letzter'], ['strong', 'Stärkster'], ['close', 'Nächster']].map(([k, n]) => `<button class="${t.targetMode === k ? 'on' : ''}" data-act="tmode" data-m="${k}">${n}</button>`).join('')}</div>` : ''}
      <div class="tpbtns">
        ${lvl < MAX_LEVEL ? `<button class="btn green" id="tpUp" data-act="upgrade">⬆ UPGRADE<br><small>🪙 ${creative ? 'Gratis' : fmt(t.upgradeCost)}</small></button>` : `<button class="btn gold dis">⭐ MAX</button>`}
        <button class="btn red" data-act="sell">💰 SELL<br><small>🪙 ${creative ? 0 : fmt(t.sellValue)}</small></button>
      </div>
      <div class="tpsub"><button class="btn small gray" data-act="move">✥ Verschieben</button><button class="btn small gray" data-act="rotTower">🔄 Drehen</button></div>`;
    el.classList.remove('hidden');
    this.updateHUD();
  },
  doUpgrade() {
    const t = S.selected; if (!t) return;
    const r = upgradeTower(t);
    if (!r.ok) this.toast('🚫 ' + r.msg, '', 'warn', 1500);
    select(t);
  },
  doSell() { const t = S.selected; if (!t) return; const v = sellTower(t); this.toast('💰 Verkauft', `+${v} 🪙`, 'good', 1500); select(null); },

  // ------------------------------------------------------------ Wellen & Steuerung
  waveButton() { if (!S.run || S.run.over) return; Sound.init(); startNextWave(S.run.active); this.updateHUD(); },
  cycleSpeed() { S.speed = S.speed >= 3 ? 1 : S.speed + 1; this.updateHUD(); },
  waveBanner(n, boss) {
    $('banner').innerHTML = boss ? `<div class="bt" style="color:#ff6b6b">BOSS!<small>${esc(boss.name)}</small></div>` : `<div class="bt">WELLE ${n}</div>`;
  },
  togglePause() { if (this.modalOpen) this.closeModal(); else ACT.pause(); },
  camRotate(d) { this.camYaw += d * Math.PI / 4; },
  rotateCam(a) {
    const c = S.camera, t = S.controls.target;
    const off = c.position.clone().sub(t); off.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    c.position.copy(t).add(off);
  },
  camZoom(f) {
    const c = S.camera, t = S.controls.target;
    const off = c.position.clone().sub(t); const len = THREE.MathUtils.clamp(off.length() * f, S.controls.minDistance, S.controls.maxDistance);
    off.setLength(len); c.position.copy(t).add(off);
  },
  camPan(k) {
    const c = S.camera, fwd = new THREE.Vector3(); c.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    const d = new THREE.Vector3();
    if (k === 'w' || k === 'arrowup') d.copy(fwd); if (k === 's' || k === 'arrowdown') d.copy(fwd).negate();
    if (k === 'a' || k === 'arrowleft') d.copy(right).negate(); if (k === 'd' || k === 'arrowright') d.copy(right);
    d.multiplyScalar(2.5); S.controls.target.add(d); c.position.add(d);
  },
  camReset() {
    const portrait = window.innerHeight > window.innerWidth;
    S.controls.target.set(0, 0, portrait ? 4 : 2);
    S.camera.position.set(0, portrait ? 74 : 34, portrait ? 44 : 38);
  },

  // ------------------------------------------------------------ Toasts
  toast(title, body = '', kind = 'info', dur = 2800) {
    const el = document.createElement('div'); el.className = 'toast ' + kind;
    el.innerHTML = `<b>${title}</b>${body ? `<span>${body}</span>` : ''}`;
    const box = $('toasts'); box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, dur);
  },

  // ------------------------------------------------------------ Modal
  openModal(title, html) {
    $('mtitle').innerHTML = title; $('mbody').innerHTML = html;
    if (!this.modalOpen && S.state === 'play' && !S.paused) { this.pausedByModal = true; S.paused = true; }
    this.modalOpen = true; $('modal').classList.remove('hidden');
  },
  setBody(html) { const b = $('mbody'); const st = b.scrollTop; b.innerHTML = html; b.scrollTop = st; },
  closeModal() {
    $('modal').classList.add('hidden'); this.modalOpen = false;
    if (this.pausedByModal) { S.paused = false; this.pausedByModal = false; }
    if (S.state === 'menu') this.renderMenu(); else { this.refreshBuildBar(); }
  },

  // ------------------------------------------------------------ Rundenende
  showEnd(win) {
    const run = S.run; const p = S.profile;
    const secs = Math.round((performance.now() - run.startTime) / 1000);
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const best = p.best[run.mode] || run.wave;
    const r = run.victoryReward;
    this.openModal(win ? '🏆 SIEG!' : '💀 GAME OVER', `
      <p class="big" style="color:${win ? 'var(--gold)' : '#ff6b6b'}">${win ? 'Verteidigung gehalten!' : 'Dein Kern wurde zerstört!'}</p>
      ${win && r ? `<p class="center">Belohnung: ${rewardText(r)}</p>` : ''}
      <div class="endstats">
        <div><b>${win ? run.wave : Math.max(0, run.wave - 1)}</b><span>Überstandene Wellen</span></div>
        <div><b>${fmt(run.kills)}</b><span>Besiegte Gegner</span></div>
        <div><b>${fmt(run.coinsEarned)}</b><span>Verdiente Münzen</span></div>
        <div><b>${run.bosses}</b><span>Besiegte Bosse</span></div>
        <div><b>${time}</b><span>Spielzeit</span></div>
        <div><b>${best}</b><span>Persönlicher Rekord (${run.modeDef.name})</span></div>
      </div>
      ${!win && Object.keys(run.leaks).length ? `<p class="center">Durchgebrochen: ${Object.entries(run.leaks).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, n]) => `${esc(ENEMY_BY_ID[id].name)} ×${n}`).join(', ')}${Object.keys(run.leaks).some((id) => ENEMY_BY_ID[id].invisible || ENEMY_BY_ID[id].cloak) ? '<br>💡 Tipp: Ein Lichtturm enthüllt unsichtbare Gegner!' : ''}</p>` : ''}
      <p class="center" style="color:var(--mut)">Deine gebaute Verteidigung bleibt gespeichert – verbessere sie und versuche es erneut!</p>
      <div class="row" style="justify-content:center">
        ${win ? `<button class="btn green" data-act="continueWin">▶ Weiterspielen</button>` : ''}
        <button class="btn ${win ? '' : 'green'}" data-act="restart">🔁 Erneut starten</button>
        <button class="btn gray" data-act="toMenu">🏠 Hauptmenü</button>
      </div>`);
    this.pausedByModal = false;
  },
};

// ------------------------------------------------------------ Turmwerte
function statRows(def, s, n) {
  const f = (v, d = 0) => (v == null ? null : Number(v).toFixed(d));
  const rows = [];
  switch (def.type) {
    case 'gold': rows.push(['Münzen/Welle', fmt(s.income), n && fmt(n.income)]); break;
    case 'heal': rows.push(['Heilung', `1 ❤ / ${f(s.healEvery)}s`, n && `${f(n.healEvery)}s`]); break;
    case 'support': rows.push(['Schadensbonus', '+' + pct(s.buffAmt), n && '+' + pct(n.buffAmt)], ['Reichweite', f(s.range, 1), n && f(n.range, 1)]); break;
    default: {
      if (def.dmg) rows.push([def.type === 'beam' || def.type === 'cone' ? 'Schaden/s' : 'Schaden', fmt(s.dmg), n && fmt(n.dmg)]);
      rows.push(['Reichweite', f(s.range, 1), n && f(n.range, 1)]);
      if (def.rate && def.type !== 'beam' && def.type !== 'cone') rows.push(['Angriffe/s', f(s.rate, 2), n && f(n.rate, 2)]);
      if (s.splash) rows.push(['Explosionsradius', f(s.splash, 1), n && f(n.splash, 1)]);
      if (s.chain) rows.push(['Kettensprünge', s.chain, n && n.chain]);
      if (def.targets) rows.push(['Ziele', s.targets, n && n.targets]);
      if (s.pierce) rows.push(['Durchschlag', s.pierce, n && n.pierce]);
      if (s.drones) rows.push(['Drohnen', s.drones, n && n.drones]);
      if (s.slow) rows.push(['Verlangsamung', pct(s.slow[0]), n && pct(n.slow[0])]);
      if (s.auraSlow) rows.push(['Zeitfeld', pct(s.auraSlow), n && pct(n.auraSlow)]);
      if (s.burn) rows.push(['Brand/s', fmt(s.burn[0]), n && fmt(n.burn[0])]);
      if (s.poison) rows.push(['Gift/s', fmt(s.poison[0]), n && fmt(n.poison[0])]);
      if (s.stun) rows.push(['Betäubung', f(s.stun, 1) + 's', n && f(n.stun, 1) + 's']);
      if (s.maxMines) rows.push(['Max. Minen', s.maxMines, n && n.maxMines]);
      if (s.curse) rows.push(['Fluch', '+' + pct(s.curse[0]), n && '+' + pct(n.curse[0])]);
      if (def.dmgType) rows.push(['Schadensart', DMG_TYPES[def.dmgType] || def.dmgType, null]);
    }
  }
  return rows;
}

// ------------------------------------------------------------ Shop
function shopItems() {
  const p = S.profile, items = [];
  for (const t of TOWERS) if (t.gems || t.crystals) items.push({ cat: 'towers', key: 'tower_' + t.id, name: t.name, desc: t.unlock < 99 ? `Sonst ab Level ${t.unlock}` : 'Nur im Shop erhältlich', rarity: t.rarity, img: 't_' + t.id, price: t.crystals || t.gems, cur: t.crystals ? 'crystals' : 'gems', owned: () => towerUnlocked(t.id), give: () => (p.unlocked[t.id] = true) });
  for (const r of ROADS) if (r.shop) items.push({ cat: 'roads', key: 'road_' + r.id, name: r.name, desc: r.desc, rarity: 'Rare', img: r.id, price: 40 + r.cost * 2, cur: 'gems' });
  for (const d of DECOS) if (d.shop) items.push({ cat: 'deco', key: 'deco_' + d.id, name: d.name, desc: 'Neues Bauobjekt', rarity: d.cost > 200 ? 'Epic' : 'Uncommon', img: d.id, price: 30 + Math.round(d.cost / 5), cur: 'gems' });
  for (const b of BIOMES) if (b.gems) items.push({ cat: 'biomes', key: 'biome_' + b.id, name: b.name, desc: `Sonst ab Level ${b.unlock}`, rarity: 'Epic', img: 'biome_' + b.id, wide: true, price: b.gems, cur: 'gems', owned: () => biomeUnlocked(b.id) });
  for (const f of KILL_FX) if (f.shop) items.push({ cat: 'effects', key: f.id, name: 'Effekt: ' + f.name, desc: 'Farben beim Besiegen von Gegnern', rarity: 'Rare', emoji: { fx_confetti: '🎉', fx_stars: '⭐', fx_hearts: '💖', fx_void: '🌀' }[f.id], price: 60, cur: 'gems', equip: 'killfx' });
  for (const b of BASE_SKINS) if (b.shop) items.push({ cat: 'bases', key: b.id, name: b.name, desc: b.desc + ' (Kern-Skin)', rarity: 'Legendary', img: b.id, price: b.id === 'base_temple' ? 180 : 120, cur: 'gems', equip: 'base' });
  items.push({ cat: 'offers', key: 'coins1', name: '2.500 Münzen', desc: 'Münzpaket', rarity: 'Common', emoji: '🪙', price: 50, cur: 'gems', repeat: true, give: () => (p.coins += 2500) });
  items.push({ cat: 'offers', key: 'coins2', name: '10.000 Münzen', desc: 'Großes Münzpaket', rarity: 'Rare', emoji: '💰', price: 170, cur: 'gems', repeat: true, give: () => (p.coins += 10000) });
  items.push({ cat: 'offers', key: 'cry1', name: '1 Seltener Kristall', desc: 'Für geheime Türme', rarity: 'Epic', emoji: '🔮', price: 120, cur: 'gems', repeat: true, give: () => (p.crystals += 1) });
  return items;
}
const isOwned = (it) => (it.owned ? it.owned() : !!S.profile.owned[it.key]);
function itemCard(it, action = 'buy') {
  const p = S.profile; const owned = !it.repeat && isOwned(it);
  const cur = it.cur === 'crystals' ? '🔮' : '💎';
  const afford = (it.cur === 'crystals' ? p.crystals : p.gems) >= it.price;
  let btn;
  if (owned && it.equip) { const on = p.equipped[it.equip] === it.key; btn = `<button class="btn small ${on ? 'green' : ''}" data-act="equip" data-k="${it.key}" data-e="${it.equip}">${on ? '✔ Ausgerüstet' : 'Ausrüsten'}</button>`; }
  else if (owned) btn = `<div class="own">✔ Im Besitz</div>`;
  else btn = `<button class="btn small ${afford ? 'gold' : 'dis'}" data-act="${action}" data-k="${it.key}">${cur} ${fmt(it.price)}</button>`;
  return `<div class="card" style="--rc:${rc(it.rarity)}">${it.emoji ? `<div style="font-size:60px;height:96px;display:grid;place-items:center">${it.emoji}</div>` : img(it.img, it.wide ? 'wide' : '')}
    <h4>${esc(it.name)}</h4><span class="rar" style="background:${rc(it.rarity)}">${it.rarity}</span><p>${esc(it.desc)}</p>${btn}</div>`;
}

// ------------------------------------------------------------ Modals (Inhalt)
const R = {
  play() {
    const sel = UI.sel; const p = S.profile;
    const key = plotKeyFor(sel.mode, sel.biome);
    const saved = p.runs[key];
    const canCont = saved && saved.mode === sel.mode;
    return `<div class="stitle">Spielmodus</div>
      <div class="modes">${Object.values(MODES).map((m) => `<div class="mode ${sel.mode === m.id ? 'sel' : ''}" style="${p.level < m.minLevel ? 'opacity:.5' : ''}" data-act="selMode" data-m="${m.id}"><h4>${p.level < m.minLevel ? '🔒 ' : ''}${{ normal: '⚔️', endless: '♾️', boss: '🐲', hard: '😤', creative: '🎨' }[m.id]} ${m.name}</h4><p>${m.desc}</p><p style="margin-top:4px;color:var(--gold)">${p.level < m.minLevel ? `Ab Spielerlevel ${m.minLevel}` : `Rekord: Welle ${p.best[m.id] || 0}`}</p></div>`).join('')}</div>
      <div class="stitle">Biom / Grundstück</div>
      <div class="grid">${BIOMES.map((b) => { const un = biomeUnlocked(b.id); return `<div class="card click ${un ? '' : 'locked'} ${sel.biome === b.id ? 'sel' : ''}" data-act="selBiome" data-b="${b.id}">${img('biome_' + b.id, 'wide')}<h4>${b.name}</h4><p>${un ? (p.plots[(sel.mode === 'creative' ? 'creative_' : '') + b.id] ? 'Eigene Anlage vorhanden' : 'Neues Grundstück') : `🔒 Level ${b.unlock} oder Shop`}</p></div>`; }).join('')}</div>
      <div class="row" style="justify-content:center;margin-top:16px">
        ${canCont ? `<button class="btn gold" data-act="startRun" data-c="1">⏯ Fortsetzen (Welle ${saved.wave})</button>` : ''}
        <button class="btn green" style="font-size:22px;padding:14px 30px" data-act="startRun">▶ ${canCont ? 'Neue Runde' : 'Spielen'}</button>
      </div>`;
  },
  towers(sel) {
    const p = S.profile;
    if (sel) {
      const t = TOWER_BY_ID[sel]; const un = towerUnlocked(t.id);
      const lv = [0, 1, 2, 3, 4, 5].map((l) => ({ l, s: towerStats(t, l) }));
      return `<button class="btn small gray" data-act="openTowers">← Zurück</button>
        <div class="detail" style="margin-top:10px"><div class="imgs">${img('t_' + t.id)}${img('t5_' + t.id)}<small style="color:var(--mut)">Stufe I · Stufe MAX</small></div>
        <div><h2 style="margin:0">${esc(t.name)}</h2><span class="rar" style="background:${rc(t.rarity)}">${t.rarity}</span>
          <p>${esc(t.desc)}</p><p>✨ Spezial: <b>${esc(t.special)}</b> · Kosten: <b style="color:var(--gold)">🪙 ${fmt(t.cost)}</b>${t.dmgType ? ` · Schadensart: <b>${DMG_TYPES[t.dmgType]}</b>` : ''}${t.detect ? ' · 👁 Erkennt Unsichtbare' : ''}${t.groundOnly ? ' · Nur Bodenziele' : ''}</p>
          ${un ? `<div class="own">✔ Freigeschaltet</div>` : `<p>🔒 ${t.unlock < 99 ? `Wird mit Level ${t.unlock} automatisch freigeschaltet (du bist Level ${p.level}).` : 'Nur im Shop erhältlich.'}</p>
            ${t.gems || t.crystals ? `<button class="btn gold" data-act="buy" data-k="tower_${t.id}" data-back="tower:${t.id}">Jetzt freischalten: ${t.crystals ? '🔮 ' + t.crystals : '💎 ' + t.gems}</button>` : ''}`}
          <table class="lv"><tr><th>Stufe</th>${t.dmg ? '<th>Schaden</th>' : ''}${t.range ? '<th>Reichweite</th>' : ''}${t.rate ? '<th>Rate</th>' : ''}${t.income ? '<th>Münzen</th>' : ''}<th>Upgrade</th></tr>
          ${lv.map(({ l, s }) => `<tr><td>${LEVEL_NAMES[l]}</td>${t.dmg ? `<td>${fmt(s.dmg)}</td>` : ''}${t.range ? `<td>${s.range.toFixed(1)}</td>` : ''}${t.rate ? `<td>${s.rate.toFixed(2)}</td>` : ''}${t.income ? `<td>${s.income}</td>` : ''}<td>${l < MAX_LEVEL ? '🪙 ' + fmt(upgradeCost(t, l)) : '–'}</td></tr>`).join('')}</table>
        </div></div>`;
    }
    return `<p style="margin-top:0;color:var(--mut)">${TOWERS.filter((t) => towerUnlocked(t.id)).length} / ${TOWERS.length} Türme freigeschaltet. Tippe auf einen Turm für Details.</p>
      <div class="grid">${TOWERS.map((t) => { const un = towerUnlocked(t.id); return `<div class="card click ${un ? '' : 'locked'}" style="--rc:${rc(t.rarity)}" data-act="towerDetail" data-id="${t.id}">${img('t_' + t.id)}<h4>${esc(t.name)}</h4><span class="rar" style="background:${rc(t.rarity)}">${t.rarity}</span><p>${un ? '🪙 ' + fmt(t.cost) : t.unlock < 99 ? '🔒 Level ' + t.unlock : '🔒 Shop'}</p></div>`; }).join('')}</div>`;
  },
  inventory() {
    const p = S.profile;
    const q = UI.invQuery.toLowerCase(), f = UI.invFilter, so = UI.invSort;
    let list = [];
    for (const t of TOWERS) list.push({ type: 'tower', id: t.id, name: t.name, rarity: t.rarity, cost: t.cost, lvl: t.unlock, img: 't_' + t.id, owned: towerUnlocked(t.id), sub: t.special });
    for (const r of ROADS) list.push({ type: 'road', id: r.id, name: r.name, rarity: r.shop ? 'Rare' : 'Common', cost: r.cost, lvl: 0, img: r.id, owned: !r.shop || !!p.owned['road_' + r.id], sub: 'Straße' });
    for (const d of DECOS) list.push({ type: 'deco', id: d.id, name: d.name, rarity: d.shop ? 'Epic' : 'Common', cost: d.cost, lvl: 0, img: d.id, owned: !d.shop || !!p.owned['deco_' + d.id], sub: d.cat === 'build' ? 'Gebäude' : 'Dekoration' });
    for (const b of BASE_SKINS) list.push({ type: 'skin', id: b.id, name: b.name, rarity: b.shop ? 'Legendary' : 'Common', cost: 0, lvl: 0, img: b.id, owned: !b.shop || !!p.owned[b.id], sub: 'Kern-Skin', equip: 'base' });
    for (const k of KILL_FX) list.push({ type: 'fx', id: k.id, name: 'Effekt: ' + k.name, rarity: k.shop ? 'Rare' : 'Common', cost: 0, lvl: 0, emoji: '✨', owned: !k.shop || !!p.owned[k.id], sub: 'Besiegt-Effekt', equip: 'killfx' });
    for (const b of BIOMES) list.push({ type: 'biome', id: b.id, name: b.name, rarity: 'Epic', cost: 0, lvl: b.unlock, img: 'biome_' + b.id, wide: true, owned: biomeUnlocked(b.id), sub: 'Biom' });
    const tabTypes = { towers: ['tower'], items: ['road', 'deco', 'skin', 'fx', 'biome'] }[UI.invTab];
    list = list.filter((i) => tabTypes.includes(i.type));
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q));
    if (f === 'owned') list = list.filter((i) => i.owned); else if (f === 'locked') list = list.filter((i) => !i.owned); else if (RARITY[f]) list = list.filter((i) => i.rarity === f);
    const cmp = { rarity: (a, b) => RARITY[b.rarity].order - RARITY[a.rarity].order, cost: (a, b) => a.cost - b.cost, name: (a, b) => a.name.localeCompare(b.name), level: (a, b) => a.lvl - b.lvl }[so];
    list.sort(cmp);
    return `<div class="mtabs"><button class="tab ${UI.invTab === 'towers' ? 'on' : ''}" data-act="invTab" data-t="towers">🗼 Türme</button><button class="tab ${UI.invTab === 'items' ? 'on' : ''}" data-act="invTab" data-t="items">📦 Gegenstände</button></div>
      <div class="row" style="margin-bottom:12px">
        <input class="search" placeholder="🔍 Suchen…" value="${esc(UI.invQuery)}" data-inp="invSearch" style="flex:1;min-width:140px">
        <select class="search" data-chg="invFilter">${[['all', 'Alle'], ['owned', 'Freigeschaltet'], ['locked', 'Gesperrt'], ...Object.keys(RARITY).map((r) => [r, r])].map(([k, n]) => `<option value="${k}" ${f === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <select class="search" data-chg="invSort">${[['rarity', 'Seltenheit'], ['cost', 'Preis'], ['name', 'Name'], ['level', 'Level']].map(([k, n]) => `<option value="${k}" ${so === k ? 'selected' : ''}>Sortieren: ${n}</option>`).join('')}</select>
      </div>
      <div class="grid" id="invGrid">${list.map((i) => {
        const eq = i.equip && i.owned ? (p.equipped[i.equip] === i.id ? `<div class="own">✔ Ausgerüstet</div>` : `<button class="btn small" data-act="equip" data-k="${i.id}" data-e="${i.equip}">Ausrüsten</button>`) : '';
        return `<div class="card ${i.owned ? '' : 'locked'} ${i.type === 'tower' ? 'click' : ''}" style="--rc:${rc(i.rarity)}" ${i.type === 'tower' ? `data-act="towerDetail" data-id="${i.id}"` : ''}>
          ${i.emoji ? `<div style="font-size:56px;height:96px;display:grid;place-items:center">${i.emoji}</div>` : img(i.img, i.wide ? 'wide' : '')}<h4>${esc(i.name)}</h4><span class="rar" style="background:${rc(i.rarity)}">${i.rarity}</span><p>${esc(i.sub)}${i.owned ? '' : ' · 🔒'}</p>${eq}</div>`;
      }).join('') || '<p>Keine Treffer.</p>'}</div>`;
  },
  shop() {
    const tabs = [['towers', '🗼 Türme'], ['roads', '🛤️ Straßen'], ['deco', '🌳 Deko'], ['biomes', '🗺️ Landschaften'], ['effects', '✨ Effekte'], ['bases', '🏰 Kerne'], ['offers', '💰 Angebote']];
    const items = shopItems().filter((i) => i.cat === UI.shopTab);
    const p = S.profile;
    return `<div class="row" style="justify-content:space-between;margin-bottom:10px"><div class="mtabs" style="margin:0">${tabs.map(([k, n]) => `<button class="tab ${UI.shopTab === k ? 'on' : ''}" data-act="shopTab" data-t="${k}">${n}</button>`).join('')}</div>
      <div class="cur"><div class="pill gems">💎 ${fmt(p.gems)}</div><div class="pill cry">🔮 ${fmt(p.crystals)}</div></div></div>
      <p style="margin-top:0;color:var(--mut);font-size:13px">Edelsteine verdienst du durch Wellen-Meilensteine, Bosse, Levelaufstiege, Aufgaben, Erfolge und Tagesbelohnungen. Alles ist kostenlos erspielbar – kein Echtgeld.</p>
      <div class="grid">${items.map((i) => itemCard(i)).join('')}</div>`;
  },
  quests() {
    const p = S.profile; const dr = dailyReward();
    return `<div class="qrow ${dailyAvailable() ? 'done' : ''}"><div class="qi">🎁</div><div class="qm"><h4>Tagesbelohnung</h4><p>Jeden Tag abholen! Serie: ${p.dailyStreak || 0} Tag(e). Heute: ${rewardText(dr)}</p></div>
        ${dailyAvailable() ? `<button class="btn gold" data-act="daily">Abholen</button>` : `<div class="own">✔ Morgen wieder</div>`}</div>
      ${QUEST_LINES.map((l) => { const q = questInfo(l); return `<div class="qrow ${q.done ? 'done' : ''}"><div class="qi">📜</div><div class="qm"><h4>${l.name} <small style="color:var(--mut)">Stufe ${q.tier + 1}</small></h4><p>${q.text} · Belohnung: ${rewardText(q.reward)}</p><div class="qbar"><i style="width:${pct(q.cur / q.target)}"></i></div><small>${fmt(q.cur)} / ${fmt(q.target)}</small></div>
        ${q.done ? `<button class="btn green" data-act="claim" data-id="${l.id}">Abholen</button>` : `<span style="color:var(--mut);font-size:13px">${pct(q.cur / q.target)}</span>`}</div>`; }).join('')}`;
  },
  achievements() {
    const p = S.profile;
    return `<p style="margin-top:0">${Object.keys(p.ach).length} / ${ACHIEVEMENTS.length} Erfolge freigeschaltet</p>
      ${ACHIEVEMENTS.map((a) => { const done = !!p.ach[a.id]; const pr = achProgress(a); return `<div class="qrow ${done ? 'done' : 'locked'}"><div class="qi">${done ? a.icon : '🔒'}</div><div class="qm"><h4>${a.name}</h4><p>${a.desc} · +${a.gems} 💎</p>${done ? `<small style="color:var(--ok)">✔ Freigeschaltet am ${new Date(p.ach[a.id]).toLocaleDateString('de-DE')}</small>` : `<div class="qbar"><i style="width:${pct(pr)}"></i></div>`}</div></div>`; }).join('')}`;
  },
  collection(sel) {
    const p = S.profile;
    if (sel) {
      const e = ENEMY_BY_ID[sel];
      const ab = [];
      if (e.armor) ab.push(`🛡 Rüstung ${pct(e.armor)}`); if (e.shield) ab.push('🔵 Energieschild'); if (e.flying) ab.push('🪽 Fliegt');
      if (e.invisible) ab.push('👻 Unsichtbar'); if (e.cloak) ab.push('🌫 Tarnung'); if (e.heal) ab.push('💚 Heilt andere'); if (e.split) ab.push(`🧩 Teilt sich (${e.split[1]}x ${ENEMY_BY_ID[e.split[0]].name})`);
      if (e.revive) ab.push('🧟 Steht wieder auf'); if (e.jump) ab.push('🦘 Springt'); if (e.immune) ab.push('🚫 Immun: ' + e.immune.map((i) => DMG_TYPES[i]).join(', '));
      if (e.resist) ab.push('🔰 Resistent: ' + Object.keys(e.resist).map((i) => DMG_TYPES[i]).join(', ')); if (e.curseTowers) ab.push('☠ Lähmt Türme beim Tod'); if (e.boss) ab.push('👑 Boss');
      if (e.ability) ab.push({ stomp: '💥 Stampfen lähmt Türme', regen: '❤️ Regeneration', freeze: '❄ Friert Türme ein', summon: '🌀 Beschwört Diener', titan: '💥 Stampfen + Beschwörung' }[e.ability]);
      return `<button class="btn small gray" data-act="openCollection">← Zurück</button>
        <div class="detail" style="margin-top:10px"><div class="imgs">${img('e_' + e.id)}</div><div><h2 style="margin:0">${esc(e.name)}</h2><p>${esc(e.desc)}</p>
        <div class="stats" style="max-width:360px"><span>Lebenspunkte (Basis)</span><b>${fmt(e.hp)}</b><span>Geschwindigkeit</span><b>${e.spd} Felder/s</b><span>Belohnung</span><b>🪙 ${e.reward}</b>
        <span>Erste Welle</span><b>${e.w < 999 ? e.w : e.boss ? 'Boss' : 'Spezial'}</b><span>Kosten bei Durchbruch</span><b>❤ ${e.lives || 1}</b><span>Von dir besiegt</span><b>${fmt(p.killsBy[e.id] || 0)}</b></div>
        <p>${ab.join('<br>') || 'Keine besonderen Fähigkeiten.'}</p></div></div>`;
    }
    const seen = ENEMIES.filter((e) => p.seen[e.id]).length;
    return `<p style="margin-top:0">${seen} / ${ENEMIES.length} Gegner entdeckt. Gegner werden freigeschaltet, sobald sie dir begegnen.</p>
      <div class="grid">${ENEMIES.map((e) => { const s = !!p.seen[e.id]; return `<div class="card ${s ? 'click' : 'locked'}" ${s ? `data-act="enemyDetail" data-id="${e.id}"` : ''} style="--rc:${e.boss ? '#ff3d6e' : e.miniboss ? '#ffb400' : 'rgba(255,255,255,.12)'}">${img('e_' + e.id)}<h4>${s ? esc(e.name) : '???'}</h4><p>${s ? `❤ ${fmt(e.hp)} · 🪙 ${e.reward}` : 'Noch nicht entdeckt'}</p></div>`; }).join('')}</div>`;
  },
  stats() {
    const s = S.profile.stats;
    const L = [['kills', '👾 Besiegte Gegner'], ['bossKills', '💀 Besiegte Bosse'], ['wavesCleared', '🌊 Überstandene Wellen'], ['bestWave', '🏅 Beste Welle'], ['coinsEarned', '🪙 Verdiente Münzen'], ['damage', '💥 Verursachter Schaden'],
      ['towersBuilt', '🗼 Gebaute Türme'], ['upgrades', '⬆ Upgrades'], ['maxLevelTowers', '⭐ Türme auf MAX'], ['sold', '💰 Verkaufte Türme'], ['roadsBuilt', '🛤️ Gebaute Straßen'], ['decoBuilt', '🌳 Dekorationen'],
      ['runs', '🔁 Gespielte Runden'], ['victories', '🏆 Siege'], ['gamesLost', '☠ Niederlagen'], ['leaks', '💔 Durchgebrochene Gegner'], ['skips', '⏩ Übersprungene Pausen'], ['gemsSpent', '💎 Ausgegebene Edelsteine']];
    const pt = Math.round(s.playTime / 60);
    return `<div class="stats" style="font-size:16px;gap:8px 20px">${L.map(([k, n]) => `<span>${n}</span><b>${fmt(s[k] || 0)}</b>`).join('')}<span>⏱ Spielzeit</span><b>${Math.floor(pt / 60)}h ${pt % 60}m</b>
      ${Object.values(MODES).map((m) => `<span>Rekord ${m.name}</span><b>Welle ${S.profile.best[m.id] || 0}</b>`).join('')}</div>`;
  },
  settings() {
    const st = S.profile.settings;
    const tg = (k, label) => `<div class="field"><label>${label}</label><button class="toggle ${st[k] ? 'on' : ''}" data-act="toggle" data-k="${k}"></button></div>`;
    return `<div class="field"><label>Spielername</label><input type="text" maxlength="16" value="${esc(S.profile.name)}" data-chg="name"></div>
      <div class="field"><label>🎵 Musik</label><input type="range" min="0" max="1" step="0.05" value="${st.music}" data-inp="music"></div>
      <div class="field"><label>🔊 Soundeffekte</label><input type="range" min="0" max="1" step="0.05" value="${st.sfx}" data-inp="sfx"></div>
      <div class="field"><label>🖥 Grafikqualität</label><select data-chg="quality">${[['high', 'Hoch'], ['medium', 'Mittel'], ['low', 'Niedrig (Handy)']].map(([k, n]) => `<option value="${k}" ${st.quality === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      ${tg('shadows', '🌗 Schatten')}${tg('grid', '#️⃣ Raster beim Bauen anzeigen')}${tg('autoStart', '🔁 Wellen automatisch starten')}${tg('dmgNumbers', '💥 Schadenszahlen anzeigen')}
      <div class="field"><label>💾 Spielstand</label><div class="row"><button class="btn small" data-act="exportSave">Exportieren</button><button class="btn small" data-act="importSave">Importieren</button><button class="btn small red" data-act="resetSave">Zurücksetzen</button></div></div>
      <div id="exportBox"></div>
      <p style="color:var(--mut);font-size:13px">Steuerung PC: Linke Maus = Kamera drehen / bauen, Rechte Maus = verschieben, Mausrad = Zoom, WASD = bewegen, Q/E = drehen, R = Gebäude drehen, B = Abriss, Leertaste = Welle, F = Tempo, U = Upgrade, Entf = Verkaufen, 1–9 = Schnellwahl, Esc = Abbrechen/Pause.<br>
      Handy: 1 Finger = Kamera drehen (im Straßen-/Abriss-Modus: ziehen zum Bauen), 2 Finger = zoomen & verschieben, Tippen = platzieren/auswählen.</p>`;
  },
  pause() {
    return `<div class="row" style="flex-direction:column;align-items:stretch;gap:12px;max-width:360px;margin:0 auto">
      <button class="btn green" data-act="resume">▶ Fortsetzen</button>
      <button class="btn" data-act="openSettings">⚙️ Einstellungen</button>
      <button class="btn gold" data-act="restart">🔁 Runde neu starten</button>
      <button class="btn gray" data-act="toMenu">🏠 Hauptmenü (Anlage bleibt gespeichert)</button></div>`;
  },
};

// ------------------------------------------------------------ Aktionen
const ACT = {
  closeModal: () => UI.closeModal(),
  openPlay: () => { if (!biomeUnlocked(UI.sel.biome)) UI.sel.biome = 'grass'; UI.openModal('▶ Spiel starten', R.play()); },
  selMode: (d) => { if (S.profile.level < MODES[d.m].minLevel) { UI.toast('🔒 Gesperrt', `${MODES[d.m].name} ab Spielerlevel ${MODES[d.m].minLevel}`, 'warn'); return; } UI.sel.mode = d.m; UI.setBody(R.play()); },
  selBiome: (d) => { if (!biomeUnlocked(d.b)) { UI.toast('🔒 Gesperrt', `Ab Level ${BIOME_BY_ID[d.b].unlock} oder im Shop`, 'warn'); return; } UI.sel.biome = d.b; UI.setBody(R.play()); },
  startRun: (d) => { UI.closeModal(); startRun(UI.sel.mode, UI.sel.biome, d.c === '1'); },
  openInventory: () => UI.openModal('🎒 Inventar', R.inventory()),
  invTab: (d) => { UI.invTab = d.t; UI.setBody(R.inventory()); },
  openTowers: () => UI.openModal('🗼 Türme', R.towers()),
  towerDetail: (d) => UI.openModal('🗼 Turmdetails', R.towers(d.id)),
  openShop: () => UI.openModal('🛒 Shop', R.shop()),
  shopTab: (d) => { UI.shopTab = d.t; UI.setBody(R.shop()); },
  buy: (d) => {
    const it = shopItems().find((i) => i.key === d.k); if (!it) return;
    if (!it.repeat && isOwned(it)) return;
    const ok = it.cur === 'crystals' ? spendCrystals(it.price) : spendGems(it.price);
    if (!ok) { Sound.play('error'); UI.toast('🚫 Zu wenig ' + (it.cur === 'crystals' ? 'Kristalle' : 'Edelsteine'), '', 'warn'); return; }
    if (it.give) it.give(); else S.profile.owned[it.key] = true;
    if (it.equip) S.profile.equipped[it.equip] = it.key, it.equip === 'base' && S.state === 'play' && setBaseSkin(it.key);
    stat('shopBuys');
    S.profile.stats.unlockedTowers = TOWERS.filter((t) => towerUnlocked(t.id)).length;
    checkAchievements(); saveNow(); Sound.play('upgrade');
    UI.toast('🛍️ Gekauft!', esc(it.name), 'good');
    if (d.back) UI.setBody(R.towers(d.back.split(':')[1])); else UI.setBody(R.shop());
    UI.refreshBuildBar();
  },
  equip: (d) => {
    S.profile.equipped[d.e] = d.k; saveNow();
    if (d.e === 'base' && S.state === 'play') setBaseSkin(d.k);
    UI.toast('✔ Ausgerüstet', '', 'good', 1200);
    const t = $('mtitle').textContent;
    UI.setBody(t.includes('Shop') ? R.shop() : R.inventory());
  },
  openQuests: () => UI.openModal('📜 Aufgaben', R.quests()),
  claim: (d) => { claimQuest(d.id); UI.setBody(R.quests()); },
  daily: () => { claimDaily(); if (UI.modalOpen) UI.setBody(R.quests()); else UI.renderMenu(); },
  openAchievements: () => UI.openModal('🏆 Erfolge', R.achievements()),
  openCollection: () => UI.openModal('📖 Gegner-Sammlung', R.collection()),
  enemyDetail: (d) => UI.openModal('📖 Gegner', R.collection(d.id)),
  openStats: () => UI.openModal('📊 Statistiken', R.stats()),
  openSettings: () => UI.openModal('⚙️ Einstellungen', R.settings()),
  toggle: (d) => { const st = S.profile.settings; st[d.k] = !st[d.k]; applySettings(); saveNow(); UI.setBody(R.settings()); },
  exportSave: () => { $('exportBox').innerHTML = `<p>Kopiere diesen Code, um deinen Spielstand zu sichern:</p><textarea style="width:100%;height:90px;background:#0006;color:#fff;border-radius:10px;border:2px solid var(--line);padding:6px" readonly>${exportSave()}</textarea>`; },
  importSave: () => { const c = prompt('Spielstand-Code einfügen:'); if (!c) return; try { importSave(c); location.reload(); } catch (e) { UI.toast('🚫 Ungültiger Code', '', 'warn'); } },
  resetSave: () => { if (confirm('Wirklich ALLES löschen? Dein gesamter Fortschritt geht verloren!')) { resetSave(); window.__noSave = true; location.reload(); } },
  pause: () => UI.openModal('⏸ Pause', R.pause()),
  resume: () => UI.closeModal(),
  restart: () => { const r = S.run; UI.closeModal(); startRun(r.mode, r.biome, false); },
  toMenu: () => { UI.closeModal(); enterMenu(); },
  continueWin: () => { UI.closeModal(); },
  // Spiel
  wave: () => UI.waveButton(),
  speed: () => UI.cycleSpeed(),
  auto: () => { const st = S.profile.settings; st.autoStart = !st.autoStart; if (st.autoStart && S.run && !S.run.active) S.run.autoT = 5; saveNow(); UI.updateHUD(); },
  tab: (d) => { UI.tab = d.t; UI.refreshBuildBar(); },
  pick: (d) => {
    if (d.cat === 'tower' && !towerUnlocked(d.id)) { UI.openModal('🗼 Turmdetails', R.towers(d.id)); return; }
    if (B.tool && B.tool.cat === d.cat && B.tool.id === d.id) { setTool(null); return; }
    select(null); setTool({ cat: d.cat, id: d.id });
  },
  bulldoze: () => { if (B.tool && B.tool.cat === 'bulldoze') setTool(null); else { select(null); setTool({ cat: 'bulldoze' }); } },
  cancelTool: () => setTool(null),
  rotate: () => rotate(),
  deselect: () => select(null),
  upgrade: () => UI.doUpgrade(),
  sell: () => UI.doSell(),
  move: () => { const t = S.selected; if (!t) return; UI.showTowerPanel(null); setTool({ cat: 'move', tower: t, rot: t.rot }); UI.toast('✥ Verschieben', 'Tippe auf ein freies Feld.', 'info', 1800); },
  rotTower: () => { const t = S.selected; if (t) { t.setRotation((t.rot + 1) % 4); savePlot(); } },
  tmode: (d) => { const t = S.selected; if (!t) return; t.targetMode = d.m; savePlot(); UI.showTowerPanel(t); },
  camRot: (d) => UI.camRotate(+d.d),
  camZoom: (d) => UI.camZoom(+d.d),
  camReset: () => UI.camReset(),
};
const INP = {
  music: (el) => { S.profile.settings.music = +el.value; applySettings(); saveNow(); },
  sfx: (el) => { S.profile.settings.sfx = +el.value; applySettings(); saveNow(); },
  invSearch: (el) => { UI.invQuery = el.value; const pos = el.selectionStart; UI.setBody(R.inventory()); const n = document.querySelector('[data-inp=invSearch]'); n.focus(); n.setSelectionRange(pos, pos); },
};
const CHG = {
  name: (el) => { const v = el.value.trim().slice(0, 16); if (v) { S.profile.name = v; saveNow(); updateSigns(v, `Rekord: Welle ${S.profile.stats.bestWave}`); UI.toast('✔ Name gespeichert', esc(v), 'good', 1400); } },
  quality: (el) => { S.profile.settings.quality = el.value; applySettings(); saveNow(); },
  invFilter: (el) => { UI.invFilter = el.value; UI.setBody(R.inventory()); },
  invSort: (el) => { UI.invSort = el.value; UI.setBody(R.inventory()); },
};

export function applySettings() {
  const st = S.profile.settings;
  Sound.setVolumes(st.music, st.sfx);
  if (S.applyQuality) S.applyQuality();
  if (B.tool) setTool(B.tool);
}
