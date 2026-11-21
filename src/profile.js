// Spielerprofil: Speichern/Laden, Währungen, XP/Level, Statistiken, Erfolge, Aufgaben
import { S } from './state.js';
import { ACHIEVEMENTS, QUEST_LINES, LEVEL_REWARDS, xpForLevel } from './data/meta.js';
import { TOWERS, TOWER_BY_ID } from './data/towers.js';
import { BIOME_BY_ID } from './data/world.js';
import { Sound } from './audio.js';

const KEY = 'byotd_save_v1';
export const hooks = { toast: () => {}, hud: () => {}, achievement: () => {} };

const STAT_KEYS = ['kills', 'bossKills', 'wavesCleared', 'bestWave', 'coinsEarned', 'towersBuilt', 'upgrades', 'maxLevelTowers',
  'sold', 'roadsBuilt', 'decoBuilt', 'runs', 'victories', 'skips', 'gemsSpent', 'playTime', 'legendaryBuilt', 'mythicBuilt',
  'secretBuilt', 'titanKills', 'hardBest', 'endlessBest', 'bossModeWins', 'biomesPlayed', 'unlockedTowers', 'flawless20',
  'leaks', 'damage', 'shopBuys', 'gamesLost'];

export function defaultProfile() {
  const stats = {}; STAT_KEYS.forEach((k) => (stats[k] = 0));
  return {
    v: 1, name: 'Spieler' + Math.floor(100 + Math.random() * 900), level: 1, xp: 0,
    coins: 1000, gems: 50, crystals: 0,
    unlocked: {}, owned: {}, equipped: { base: 'base_crystal', killfx: 'fx_default' },
    stats, ach: {}, quests: {}, lastDaily: '', dailyStreak: 0,
    best: {}, plots: {}, runs: {}, seen: {}, killsBy: {}, biomes: {},
    settings: { music: 0.45, sfx: 0.7, quality: 'high', shadows: true, grid: true, autoStart: false, dmgNumbers: true },
    created: Date.now(),
  };
}

export function loadProfile() {
  let p = null;
  try { const raw = localStorage.getItem(KEY); if (raw) p = JSON.parse(raw); } catch (e) { p = null; }
  const d = defaultProfile();
  if (!p || typeof p !== 'object') return d;
  // fehlende Felder ergänzen (Vorwärtskompatibilität)
  for (const k of Object.keys(d)) if (p[k] === undefined) p[k] = d[k];
  for (const k of STAT_KEYS) if (p.stats[k] === undefined) p.stats[k] = 0;
  for (const k of Object.keys(d.settings)) if (p.settings[k] === undefined) p.settings[k] = d.settings[k];
  for (const k of Object.keys(d.equipped)) if (p.equipped[k] === undefined) p.equipped[k] = d.equipped[k];
  return p;
}

let saveTimer = null;
export function saveNow() {
  clearTimeout(saveTimer); saveTimer = null;
  try { localStorage.setItem(KEY, JSON.stringify(S.profile)); return true; } catch (e) { return false; }
}
export function scheduleSave() { if (!saveTimer) saveTimer = setTimeout(saveNow, 700); }
export function exportSave() { return btoa(unescape(encodeURIComponent(JSON.stringify(S.profile)))); }
export function importSave(code) {
  const p = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
  if (!p || typeof p !== 'object' || !p.stats) throw new Error('Ungültiger Code');
  localStorage.setItem(KEY, JSON.stringify(p));
}
export function resetSave() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

// ---------------------------------------------------------------- Währungen
const creative = () => S.run && S.run.creative;
export function canAfford(n) { return creative() || S.profile.coins >= n; }
export function spend(n) {
  if (creative()) return true;
  if (S.profile.coins < n) return false;
  S.profile.coins -= n; hooks.hud(); scheduleSave(); return true;
}
export function addCoins(n, earned = true) {
  if (creative() || n <= 0) return;
  n = Math.round(n);
  S.profile.coins += n;
  if (earned) { S.profile.stats.coinsEarned += n; if (S.run) S.run.coinsEarned += n; }
  hooks.hud(); scheduleSave();
}
export function addGems(n) { S.profile.gems += n; hooks.hud(); scheduleSave(); }
export function spendGems(n) {
  if (S.profile.gems < n) return false;
  S.profile.gems -= n; S.profile.stats.gemsSpent += n; hooks.hud(); checkAchievements(); scheduleSave(); return true;
}
export function spendCrystals(n) { if (S.profile.crystals < n) return false; S.profile.crystals -= n; hooks.hud(); scheduleSave(); return true; }
export function grant(r) {
  if (!r) return;
  if (r.coins) { S.profile.coins += r.coins; }
  if (r.gems) S.profile.gems += r.gems;
  if (r.crystals) S.profile.crystals += r.crystals;
  if (r.xp) addXP(r.xp);
  hooks.hud(); scheduleSave();
}
export function rewardText(r) {
  const parts = [];
  if (r.coins) parts.push(`🪙 ${r.coins}`); if (r.gems) parts.push(`💎 ${r.gems}`);
  if (r.crystals) parts.push(`🔮 ${r.crystals}`); if (r.xp) parts.push(`⭐ ${r.xp} XP`);
  return parts.join('  ');
}

// ---------------------------------------------------------------- XP & Level
export function addXP(n) {
  if (creative() || S.demo) return;
  const p = S.profile; p.xp += Math.round(n);
  let up = false;
  while (p.xp >= xpForLevel(p.level)) {
    p.xp -= xpForLevel(p.level); p.level++; up = true;
    const r = LEVEL_REWARDS(p.level);
    p.coins += r.coins; p.gems += r.gems; p.crystals += r.crystals;
    const newly = TOWERS.filter((t) => t.unlock === p.level).map((t) => t.name);
    const biomes = Object.values(BIOME_BY_ID).filter((b) => b.unlock === p.level).map((b) => b.name);
    hooks.toast(`⬆️ Level ${p.level}!`, `${rewardText(r)}${newly.length ? '<br>Neu: ' + newly.join(', ') : ''}${biomes.length ? '<br>Biom: ' + biomes.join(', ') : ''}`, 'level');
    Sound.play('levelup');
  }
  if (up) { p.stats.unlockedTowers = TOWERS.filter((t) => towerUnlocked(t.id)).length; checkAchievements(); }
  hooks.hud(); scheduleSave();
}

export function towerUnlocked(id) {
  const t = TOWER_BY_ID[id];
  return !!t && (S.profile.level >= t.unlock || !!S.profile.unlocked[id] || (S.run && S.run.creative));
}
export function biomeUnlocked(id) { const b = BIOME_BY_ID[id]; return !!b && (S.profile.level >= b.unlock || !!S.profile.owned['biome_' + id]); }

// ---------------------------------------------------------------- Statistiken & Erfolge
export function stat(key, add = 1) {
  if (S.demo || creative()) return;
  S.profile.stats[key] = (S.profile.stats[key] || 0) + add;
}
export function statMax(key, v) {
  if (S.demo || creative()) return;
  if ((S.profile.stats[key] || 0) < v) S.profile.stats[key] = v;
}
export function checkAchievements() {
  if (S.demo || creative()) return;
  const p = S.profile;
  p.stats.level = p.level;
  for (const a of ACHIEVEMENTS) {
    if (p.ach[a.id]) continue;
    const [k, v] = a.cond;
    if ((p.stats[k] || 0) >= v) {
      p.ach[a.id] = Date.now(); p.gems += a.gems;
      hooks.achievement(a); Sound.play('achievement');
    }
  }
  scheduleSave();
}
export function achProgress(a) { const [k, v] = a.cond; return Math.min(1, (S.profile.stats[k] || 0) / v); }

// ---------------------------------------------------------------- Aufgaben
export function questInfo(line) {
  const tier = S.profile.quests[line.id] || 0;
  const target = Math.round(line.base * Math.pow(line.mult, tier));
  const cur = S.profile.stats[line.stat] || 0;
  const mul = 1 + tier * 0.5;
  const reward = {};
  for (const k of Object.keys(line.reward)) reward[k] = Math.round(line.reward[k] * mul);
  return { tier, target, cur: Math.min(cur, target), done: cur >= target, reward, text: line.text.replace('{n}', target.toLocaleString('de-DE')) };
}
export function claimQuest(id) {
  const line = QUEST_LINES.find((q) => q.id === id); if (!line) return false;
  const q = questInfo(line); if (!q.done) return false;
  S.profile.quests[id] = q.tier + 1; grant(q.reward); Sound.play('coin');
  hooks.toast('📜 Aufgabe erledigt!', `${line.name}: ${rewardText(q.reward)}`, 'quest');
  saveNow(); return true;
}
export function questsReady() { return QUEST_LINES.filter((l) => questInfo(l).done).length; }

const today = () => new Date().toISOString().slice(0, 10);
export function dailyAvailable() { return S.profile.lastDaily !== today(); }
export function dailyReward() {
  const streak = Math.min(7, (S.profile.dailyStreak || 0) + 1);
  return { coins: 300 + streak * 100, gems: 10 + streak * 5, crystals: streak === 7 ? 1 : 0 };
}
export function claimDaily() {
  if (!dailyAvailable()) return false;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  S.profile.dailyStreak = S.profile.lastDaily === yesterday ? Math.min(7, S.profile.dailyStreak + 1) : 1;
  const r = { coins: 300 + S.profile.dailyStreak * 100, gems: 10 + S.profile.dailyStreak * 5, crystals: S.profile.dailyStreak === 7 ? 1 : 0 };
  S.profile.lastDaily = today(); grant(r); Sound.play('levelup');
  hooks.toast('🎁 Tagesbelohnung!', `Tag ${S.profile.dailyStreak}: ${rewardText(r)}`, 'level');
  saveNow(); return true;
}
