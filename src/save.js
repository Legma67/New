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
      v: 1,
      name: 'Spieler' + Math.floor(1000 + Math.random() * 9000),
      level: 1, xp: 0, gems: 50, crystals: 0,
      unlocked: ['archer', 'cannon'],            // freigeschaltete Türme
      owned: { skins: ['skin_default'], effects: ['fx_default'], castles: ['castle_default'], biomes: ['grass'], decos: [] },
      equipped: { skin: 'skin_default', effect: 'fx_default', castle: 'castle_default', biome: 'grass' },
      boosts: { boost_coins: 0, boost_lives: 0, boost_xp: 0 },
      stats: { kills: 0, bossKills: 0, titanKills: 0, wavesTotal: 0, bestWave: 0, towersBuilt: 0, roadsBuilt: 0, decoBuilt: 0, upgrades: 0, maxTowerLevel: 0,
        coinsEarned: 0, gamesPlayed: 0, skips: 0, victories: 0, hardVictories: 0, perfectWaves: 0, legendaryBuilt: 0, damage: 0, purchases: 0,
        playTime: 0, livesLost: 0, sold: 0, gemsEarned: 0, bestStreak: 0 },
      seen: {}, killsBy: {},
      achievements: {},                       // id -> Zeitstempel
      quests: {},                             // id -> 'claimed'
      daily: { date: '', list: [], streak: 0, lastClaim: '' },
      records: {},                            // modus -> beste Welle
      layout: null,                           // {roads:[[x,z,id]], decos:[[x,z,id,rot]]}
      run: null,                              // laufende Runde (Snapshot nach jeder Welle)
      settings: { music: 0.45, sfx: 0.7, quality: (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'medium' : 'high'), particles: true, autoStart: true, showGrid: true, damageNumbers: true },
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
    if (!P.layout) P.layout = { roads: DEFAULT_ROADS.map(([x, z]) => [x, z, 'road_stone']), decos: [[2, 7, 'tree', 0], [3, 12, 'flowers', 0], [10, 1, 'lantern', 0], [16, 12, 'bush', 0], [20, 1, 'house', 1]] };
    refreshDaily();
    return P;
  }
  let saveTimer = null;
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(P)); return true; } catch (e) { return false; }
  }
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }
  function reset() { localStorage.removeItem(SAVE_KEY); P = null; load(); save(); }

  function on(ev, fn) { listeners[ev].push(fn); }
  function emit(ev, ...a) { for (const f of listeners[ev]) f(...a); }

  // ---------- Stats ----------
  function stat(key) {
    if (key === 'playerLevel') return P.level;
    if (key === 'towersUnlocked') return P.unlocked.length;
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
      const newTowers = TOWERS.filter(t => t.level === P.level && !P.unlocked.includes(t.id));
      newTowers.forEach(t => P.unlocked.push(t.id));
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

  return {
    load, save, saveSoon, reset, on, emit, stat, addStat, maxStat, addXP, grant, checkAchievements,
    questProgress, claimQuest, refreshDaily, dailyDef, dailyProgress, claimDaily, dailyRewardAvailable, claimDailyReward,
    get P() { return P; },
  };
})();
