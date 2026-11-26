'use strict';
// ============================================================
//  Speichersystem, Profil, Fortschritt, Aufgaben, Erfolge
// ============================================================
const SAVE_KEY = 'byotd_save_v1';
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

const Save = (() => {
  let P = null;
  const listeners = { levelup: [], achievement: [], change: [] };

  function defaults() {
    return {
      v: 2,
      tutorialDone: false,
      towerInv: { crossbow: 1 },               // Türme im Besitz (Anzahl) – nur von Bossen
      trapInv: {},                             // Fallen im Besitz (Anzahl)
      roadPieces: 4,                           // freie Wegstücke
      name: 'Spieler' + Math.floor(1000 + Math.random() * 9000),
      level: 1, xp: 0, gems: 50, crystals: 0,
      unlocked: ['crossbow'],                  // jemals erhaltene Türme (Sammlung)
      owned: { skins: ['skin_default'], effects: ['fx_default'], castles: ['castle_default'], biomes: ['grass'], decos: [] },
      equipped: { skin: 'skin_default', effect: 'fx_default', castle: 'castle_default', biome: 'grass' },
      boosts: { boost_coins: 0, boost_lives: 0, boost_xp: 0 },
      stats: { kills: 0, bossKills: 0, titanKills: 0, wavesTotal: 0, bestWave: 0, towersBuilt: 0, roadsBuilt: 0, decoBuilt: 0, upgrades: 0, maxTowerLevel: 0,
        coinsEarned: 0, gamesPlayed: 0, skips: 0, victories: 0, hardVictories: 0, perfectWaves: 0, legendaryBuilt: 0, damage: 0, purchases: 0,
        playTime: 0, livesLost: 0, trapsBuilt: 0, sold: 0, gemsEarned: 0, bestStreak: 0 },
      seen: {}, killsBy: {},
      achievements: {},                       // id -> Zeitstempel
      quests: {},                             // id -> 'claimed'
      daily: { date: '', list: [], streak: 0, lastClaim: '' },
      records: {},                            // modus -> beste Welle
      pendingPicks: null,                     // Turm-Belohnung nach der letzten Runde
      layout: null,                           // {roads:[[x,z,id]], decos:[[x,z,id,rot]]}
      run: null,                              // laufende Runde (Snapshot nach jeder Welle)
      settings: { music: 0.45, sfx: 0.7, quality: (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'medium' : 'high'), particles: true, autoStart: true, showGrid: true, damageNumbers: true, shirt: '#e03a3a', pants: '#2f5bd0' },
    };
  }
  function merge(base, src) {
    for (const k in src) {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) merge(base[k], src[k]);
      else base[k] = src[k];
    }
    return base;
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      P = raw ? merge(defaults(), JSON.parse(raw)) : defaults();
    } catch (e) { P = defaults(); }
    // Umstieg auf das neue System (Türme nur von Bossen)
    if (P.v < 2) {
      Object.assign(P, { v: 2, tutorialDone: false, towerInv: { crossbow: 1 }, trapInv: {}, roadPieces: 4, unlocked: ['crossbow'], run: null, pendingPicks: null, records: {} });
      P.stats.bestWave = 0;
    }
    if (!P.layout) P.layout = { roads: DEFAULT_ROADS.map(([x, z]) => [x, z, 'road_stone']), decos: [[2, 7, 'tree', 0], [3, 12, 'flowers', 0], [10, 1, 'lantern', 0], [16, 12, 'bush', 0], [20, 1, 'house', 1]] };
    refreshDaily();
    return P;
  }
  let saveTimer = null;
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(P)); return true; } catch (e) { return false; }
  }
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }
  function reset() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} P = null; load(); save(); }

  function on(ev, fn) { listeners[ev].push(fn); }
  function emit(ev, ...a) { for (const f of listeners[ev]) f(...a); }

  // ---------- Stats ----------
  function stat(key) {
    if (key === 'playerLevel') return P.level;
    if (key === 'towersUnlocked') return Object.keys(P.towerInv).filter(k => P.towerInv[k] > 0).length;
    if (key === 'tutorial') return P.tutorialDone ? 1 : 0;
    if (key === 'enemiesSeen') return Object.keys(P.seen).length;
    return P.stats[key] || 0;
  }
  function addStat(key, n = 1) { P.stats[key] = (P.stats[key] || 0) + n; checkAchievements(); }
  function maxStat(key, v) { if (v > (P.stats[key] || 0)) { P.stats[key] = v; checkAchievements(); } }

  // ---------- Erfahrung & Level ----------
  function addXP(n) {
    n = Math.round(n * (1 + 0.1 * (P.boosts.boost_xp || 0)));
    P.xp += n;
    while (P.xp >= xpForLevel(P.level)) {
      P.xp -= xpForLevel(P.level); P.level++;
      const gems = 10 + P.level * 2;
      P.gems += gems; P.stats.gemsEarned += gems;
      const newTowers = [];
      const newBiomes = BIOMES.filter(b => b.level === P.level && !P.owned.biomes.includes(b.id));
      newBiomes.forEach(b => P.owned.biomes.push(b.id));
      emit('levelup', { level: P.level, gems, towers: newTowers, biomes: newBiomes });
      checkAchievements();
    }
  }
  function grant(r) {
    if (!r) return;
    if (r.gems) { P.gems += r.gems; P.stats.gemsEarned += r.gems; }
    if (r.crystals) P.crystals += r.crystals;
    if (r.xp) addXP(r.xp);
  }

  // ---------- Erfolge ----------
  function checkAchievements() {
    if (!P) return;
    for (const a of ACHIEVEMENTS) {
      if (P.achievements[a.id]) continue;
      if (stat(a.stat) >= a.goal) {
        P.achievements[a.id] = Date.now();
        P.gems += a.gems || 0; P.crystals += a.crystals || 0;
        emit('achievement', a);
      }
    }
  }

  // ---------- Aufgaben ----------
  function questProgress(q) { return Math.min(q.goal, stat(q.stat)); }
  function claimQuest(q) {
    if (P.quests[q.id] === 'claimed' || questProgress(q) < q.goal) return false;
    P.quests[q.id] = 'claimed'; grant(q.reward); save(); return true;
  }
  function refreshDaily() {
    const t = todayStr();
    if (P.daily.date !== t) {
      // Tägliche Aufgaben neu auslosen (deterministisch pro Tag)
      let seed = t.split('-').reduce((a, b) => a * 31 + +b, 7);
      const pool = DAILY_POOL.slice(); const list = [];
      for (let i = 0; i < 3; i++) { seed = (seed * 9301 + 49297) % 233280; const idx = seed % pool.length; const q = pool.splice(idx, 1)[0]; list.push({ id: q.id, base: stat(q.stat), claimed: false }); }
      P.daily.date = t; P.daily.list = list;
    }
  }
  function dailyDef(d) { return DAILY_POOL.find(q => q.id === d.id); }
  function dailyProgress(d) { const q = dailyDef(d); return Math.min(q.goal, stat(q.stat) - d.base); }
  function claimDaily(d) {
    const q = dailyDef(d); if (d.claimed || dailyProgress(d) < q.goal) return false;
    d.claimed = true; grant(q.reward); save(); return true;
  }
  // Tagesbelohnung
  function dailyRewardAvailable() { return P.daily.lastClaim !== todayStr(); }
  function claimDailyReward() {
    if (!dailyRewardAvailable()) return null;
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yStr = y.getFullYear() + '-' + (y.getMonth() + 1) + '-' + y.getDate();
    P.daily.streak = P.daily.lastClaim === yStr ? P.daily.streak + 1 : 1;
    P.daily.lastClaim = todayStr();
    const day = ((P.daily.streak - 1) % 7) + 1;
    const r = { gems: 10 + day * 5, crystals: day === 7 ? 5 : (day >= 4 ? 1 : 0), xp: 50 * day };
    grant(r);
    maxStat('bestStreak', P.daily.streak);
    save();
    return { ...r, day, streak: P.daily.streak };
  }

  // ---------- Inventar ----------
  function addTower(id, n = 1) { P.towerInv[id] = (P.towerInv[id] || 0) + n; if (!P.unlocked.includes(id)) P.unlocked.push(id); checkAchievements(); }
  function addTrap(id, n = 1) { P.trapInv[id] = (P.trapInv[id] || 0) + n; }
  // Zufälliger Turm, je höher die Welle desto seltener
  function rollTower(wave, exclude = []) {
    const weight = t => ({ common: 10, uncommon: 9, rare: 3 + wave / 6, epic: 0.5 + wave / 12, legendary: wave / 25, mythic: wave / 45, secret: wave / 60 })[t.rarity];
    const pool = TOWERS.filter(t => !exclude.includes(t.id) && weight(t) > 0);
    let tot = pool.reduce((a, t) => a + weight(t), 0), r = Math.random() * tot;
    for (const t of pool) { r -= weight(t); if (r <= 0) return t.id; }
    return pool[0].id;
  }
  // Boss-Belohnung: Turm, Wegstücke, Falle oder Münzen
  function rollFake(wave) {
    const r = Math.random();
    if (r < 0.7) return { kind: 'tower', id: rollTower(wave) };
    if (r < 0.8) return { kind: 'roads', n: 6 };
    if (r < 0.95) return { kind: 'trap', id: TRAPS[Math.floor(Math.random() * TRAPS.length)].id };
    return { kind: 'coins', n: 500 };
  }
  function rollBossReward(wave, tutorial) {
    if (tutorial) { const ids = ['crossbow', 'cannon', 'archer', 'ice', 'poison', 'crossbow']; return { kind: 'tower', id: ids[Math.floor(Math.random() * ids.length)] }; }
    // Jeder Boss gibt immer eine Waffe – und oft noch einen Bonus obendrauf
    const r = Math.random();
    let bonus = null;
    if (r < 0.3) bonus = { kind: 'roads', n: 4 + Math.floor(wave / 5) };
    else if (r < 0.6) { const pool = wave < 15 ? TRAPS.slice(0, 3) : TRAPS; bonus = { kind: 'trap', id: pool[Math.floor(Math.random() * pool.length)].id }; }
    else if (r < 0.8) bonus = { kind: 'coins', n: 100 + wave * 20 };
    return { kind: 'tower', id: rollTower(wave), bonus };
  }

  // ---------- Turm-Belohnung nach einer Runde ----------
  // Je mehr Wellen überstanden, desto mehr Auswahlen und desto seltenere Türme.
  function makeTowerPicks(waves) {
    const n = waves >= 25 ? 3 : waves >= 10 ? 2 : 1;
    const weight = t => ({ common: 6, uncommon: 10, rare: 4 + waves / 4, epic: 1 + waves / 7, legendary: waves / 14, mythic: waves / 25, secret: waves / 35 })[t.rarity];
    const picks = [];
    const taken = new Set();
    for (let i = 0; i < n; i++) {
      const pool = TOWERS.filter(t => !taken.has(t.id) && weight(t) > 0);
      if (!pool.length) { picks.push({ gems: 25 + waves * 3 }); continue; }
      const opts = [];
      while (opts.length < 3 && pool.length) {
        let tot = pool.reduce((a, t) => a + weight(t), 0), r = Math.random() * tot, k = 0;
        for (; k < pool.length - 1; k++) { r -= weight(pool[k]); if (r <= 0) break; }
        opts.push(pool[k].id); taken.add(pool[k].id); pool.splice(k, 1);
      }
      picks.push({ options: opts });
    }
    // Auswahlmöglichkeiten, die nicht gewählt werden, sind beim nächsten Mal wieder im Topf
    P.pendingPicks = picks;
  }
  function choosePick(i, towerId) {
    const p = P.pendingPicks && P.pendingPicks[i]; if (!p || p.done) return false;
    if (p.gems) { P.gems += p.gems; P.stats.gemsEarned += p.gems; }
    else if (p.options.includes(towerId)) addTower(towerId);
    else return false;
    p.done = towerId || 'gems';
    checkAchievements(); save();
    return true;
  }

  const openPicks = () => !!(P.pendingPicks && P.pendingPicks.some(q => !q.done));
  function tidyPicks() { if (P.pendingPicks && !openPicks()) P.pendingPicks = null; }
  return {
    makeTowerPicks, choosePick, openPicks, tidyPicks, addTower, addTrap, rollTower, rollBossReward, rollFake,
    load, save, saveSoon, reset, on, emit, stat, addStat, maxStat, addXP, grant, checkAchievements,
    questProgress, claimQuest, refreshDaily, dailyDef, dailyProgress, claimDaily, dailyRewardAvailable, claimDailyReward,
    get P() { return P; },
  };
})();
