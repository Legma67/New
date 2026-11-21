// Wellensystem: Zusammensetzung, Spawnen, Belohnungen, Bosse
import { S } from './state.js';
import { ENEMIES, ENEMY_BY_ID, BOSS_ORDER } from './data/enemies.js';
import { spawnEnemy } from './enemies.js';
import { addCoins, addXP, stat, statMax, checkAchievements, saveNow } from './profile.js';
import { Sound } from './audio.js';
import { FX, floatText } from './effects.js';
import { UI } from './ui.js';

export const hpCurve = (n) => 1 + 0.12 * (n - 1) + 0.0042 * (n - 1) ** 2;

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function bossForWave(n, run) {
  if (run.modeDef.bossOnly) return BOSS_ORDER[(n - 1) % 5];
  if (n % 10 !== 0) return null;
  const idx = n / 10 - 1;
  return BOSS_ORDER[idx < BOSS_ORDER.length ? idx : (idx % 5)];
}

export function composeWave(n, run) {
  const r = rng(n * 7919 + run.biome.length * 31);
  const list = [];
  const bias = run.biomeDef.enemyBias || [];
  if (run.modeDef.bossOnly) {
    const esc = Math.min(30, 4 + n * 3);
    const pool = ENEMIES.filter((e) => e.w <= Math.min(40, n * 5) && e.w < 999);
    for (let i = 0; i < esc; i++) list.push({ id: pool[(r() * pool.length) | 0].id, gap: 0.6 });
    list.push({ id: bossForWave(n, run), gap: 2 });
    return list;
  }
  const pool = ENEMIES.filter((e) => e.w <= n && e.w < 999);
  const weights = pool.map((e) => (e.w > n - 8 ? 3 : 1) * (bias.includes(e.id) ? 3 : 1) * (e.id === 'giant' ? 0.4 : 1));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const pick = () => { let x = r() * wsum; for (let i = 0; i < pool.length; i++) { x -= weights[i]; if (x <= 0) return pool[i]; } return pool[0]; };
  const count = Math.min(90, 5 + Math.floor(n * 1.5));
  const gap = Math.max(0.32, 0.85 - n * 0.009);
  while (list.length < count) {
    const e = pick(); const grp = 2 + ((r() * 4) | 0);
    for (let i = 0; i < grp && list.length < count; i++) list.push({ id: e.id, gap: i === 0 ? gap * 2.2 : gap });
  }
  if (n % 5 === 0 && n % 10 !== 0) list.push({ id: 'miniboss', gap: 1.5 });
  const boss = bossForWave(n, run);
  if (boss) list.push({ id: boss, gap: 2.5 });
  return list;
}

export function wavePreview(n, run) {
  const ids = [...new Set(composeWave(n, run).map((q) => q.id))];
  return ids.slice(0, 8).map((id) => ENEMY_BY_ID[id]);
}

function setMultipliers(run) {
  const n = run.wave, m = run.modeDef;
  if (m.bossOnly) {
    run.hpMul = hpCurve(n * 5) * m.hp * 0.7;
    run.bossMul = 0.25 * (1 + 0.25 * (n - 1)) * m.hp;
  } else {
    run.hpMul = hpCurve(n) * m.hp;
    const b = bossForWave(Math.max(10, Math.floor(n / 10) * 10), run);
    const base = 10 * (BOSS_ORDER.indexOf(b) + 1);
    run.bossMul = m.hp * Math.max(1, hpCurve(n) / hpCurve(base));
  }
  run.spdMul = m.spd * (1 + Math.min(0.45, n * 0.006));
}

export function startNextWave(skip = false) {
  const run = S.run; if (!run || run.over) return;
  if (!S.path) { UI.toast('⚠️ Kein Weg!', 'Verbinde das Portal mit deinem Kristallkern durch Straßen.', 'warn'); Sound.play('error'); return; }
  if (skip && run.active) {
    stat('skips');
    const bonus = Math.round((20 + run.wave * 5) * run.rewardMul);
    if (bonus > 0) { addCoins(bonus); UI.toast('⏩ Welle übersprungen', `Bonus: +${bonus} 🪙`, 'info'); }
  }
  run.wave++; run.pending++;
  setMultipliers(run);
  const q = composeWave(run.wave, run);
  run.queue.push(...q);
  run.waveTotal = (run.active ? run.waveTotal : 0) + q.length;
  run.active = true; run.autoT = -1;
  if (run.spawnT <= 0) run.spawnT = 0.4;
  Sound.play('wave_start');
  if (!q.some((x) => ENEMY_BY_ID[x.id].boss)) Sound.setTrack('wave');
  const boss = q.find((x) => ENEMY_BY_ID[x.id].boss);
  UI.waveBanner(run.wave, boss ? ENEMY_BY_ID[boss.id] : null);
  const ids = new Set(q.map((x) => x.id));
  const hasInv = [...ids].some((id) => ENEMY_BY_ID[id].invisible || ENEMY_BY_ID[id].cloak);
  if (hasInv && !S.towers.some((t) => t.def.detect)) UI.toast('👻 Unsichtbare Gegner!', 'Nur Lichtturm, Laser, Scharfschütze, Magie- und Eislaser können sie sehen. Der Lichtturm enthüllt sie für alle Türme.', 'warn', 6000);
  const hasFly = [...ids].some((id) => ENEMY_BY_ID[id].flying);
  if (hasFly && S.towers.length && S.towers.every((t) => t.def.groundOnly || !t.def.dmg)) UI.toast('🪽 Fliegende Gegner!', 'Minen-, Bomben- und Meteoritentürme treffen keine Flieger.', 'warn', 5000);
  checkAchievements();
}

export function updateWaves(dt) {
  const run = S.run; if (!run || run.over) return;
  if (run.active) {
    if (run.queue.length) {
      run.spawnT -= dt;
      if (run.spawnT <= 0) {
        const item = run.queue.shift();
        spawnEnemy(item.id);
        run.spawnT = run.queue.length ? run.queue[0].gap : 0;
      }
    } else if (S.enemies.length === 0) {
      waveComplete();
    }
  } else if (run.autoT > 0) {
    run.autoT -= dt;
    if (run.autoT <= 0) startNextWave(false);
  }
  if (run.lives <= 0 && !run.creative) gameOver();
}

function waveComplete() {
  const run = S.run;
  run.active = false;
  const n = run.wave;
  let bonus = 0;
  if (!run.creative) {
    bonus = Math.round((60 + n * 15) * run.rewardMul * run.pending);
    let gold = 0;
    for (const t of S.towers) if (t.def.type === 'gold') {
      gold += t.stats.income;
      floatText(t.pos.clone().setY(2.6), `+${t.stats.income} 🪙`, '#ffd23f', true);
      FX.burst(t.pos.x, 2, t.pos.z, ['#ffd23f', '#fff7cc'], 16, 3, 0.3, 0.8, 5);
    }
    addCoins(bonus + gold);
    addXP(25 + n * 8);
    stat('wavesCleared', run.pending);
    statMax('bestWave', n);
    const key = run.mode;
    S.profile.best[key] = Math.max(S.profile.best[key] || 0, n);
    if (run.mode === 'hard') statMax('hardBest', n);
    if (run.mode === 'endless') statMax('endlessBest', n);
    if (n >= 20 && !run.lostLife) statMax('flawless20', 1);
    if (n % 5 === 0) { S.profile.gems += 5; UI.toast('💎 Meilenstein!', `Welle ${n} geschafft: +5 Edelsteine`, 'info'); }
    S.profile.runs[S.plotKey] = { mode: run.mode, wave: n, lives: run.lives };
    checkAchievements();
    saveNow();
  }
  run.pending = 0;
  Sound.play('wave_clear'); Sound.setTrack('build');
  UI.toast(`✅ Welle ${n} geschafft!`, bonus ? `Bonus: +${bonus} 🪙` : 'Gut gemacht!', 'good');
  const m = run.modeDef;
  if (m.winWave && n >= m.winWave && !run.won) { run.won = true; victory(); return; }
  if (S.profile.settings.autoStart) run.autoT = 8;
}

function gameOver() {
  const run = S.run; if (run.over) return;
  run.over = true; run.active = false; run.queue = [];
  stat('gamesLost');
  delete S.profile.runs[S.plotKey];
  saveNow();
  Sound.play('lose'); Sound.setTrack('menu');
  UI.showEnd(false);
}

function victory() {
  const run = S.run;
  stat('victories');
  if (run.mode === 'boss') stat('bossModeWins');
  const r = { gems: 100 + run.wave * 2, crystals: 3, coins: 2000 };
  S.profile.gems += r.gems; S.profile.crystals += r.crystals; S.profile.coins += r.coins;
  run.victoryReward = r;
  checkAchievements(); saveNow();
  Sound.play('victory');
  UI.showEnd(true);
}
