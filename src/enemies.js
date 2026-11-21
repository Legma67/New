// Gegner: Bewegung entlang des gebauten Wegs, Statuseffekte, Fähigkeiten, Schaden
import * as THREE from 'three';
import { S } from './state.js';
import { TILE, tileToWorld, worldToTile, GOAL } from './config.js';
import { ENEMY_BY_ID } from './data/enemies.js';
import { KILL_FX } from './data/world.js';
import { makeEnemyModel } from './models.js';
import { FX, floatText } from './effects.js';
import { Sound } from './audio.js';
import { addCoins, addXP, stat } from './profile.js';
import { towerHooks } from './hooks.js';

const pools = {};
const _v = new THREE.Vector3();

export function pathToPoints(tiles) {
  return tiles.map((t) => { const w = tileToWorld(t.x, t.z); return new THREE.Vector3(w.x, 0, w.z); });
}

class Enemy {
  constructor(def, hpMul, spdMul, points, startD = 0) {
    this.def = def;
    const pool = pools[def.id] || (pools[def.id] = []);
    this.E = pool.pop() || makeEnemyModel(def);
    this.E.root.visible = true;
    this.E.root.scale.setScalar(1);
    S.scene.add(this.E.root);
    this.maxHp = def.hp * hpMul; this.hp = this.maxHp;
    this.maxShield = def.shield ? this.maxHp * def.shield : 0; this.shield = this.maxShield;
    this.speed = def.spd * spdMul;
    this.alive = true; this.reached = false;
    this.slowF = 0; this.slowT = 0; this.auraSlow = 0;
    this.burnDps = 0; this.burnT = 0; this.poisonDps = 0; this.poisonT = 0;
    this.stunT = 0; this.curseAmt = 0; this.curseT = 0; this.revealT = 0;
    this.cloaked = false; this.cloakT = def.cloak || 0;
    this.jumpT = def.jump || 0; this.hopT = 0;
    this.abilityT = 4 + Math.random() * 2; this.healT = 1;
    this.revived = false; this.flash = 0; this.phase = Math.random() * 10; this.spawnT = 0;
    this.fxT = 0;
    this.setPoints(points, startD);
    this.pos = new THREE.Vector3(); this.updatePos();
    for (const m of this.E.mats) { m.opacity = this.E.ghost ? 0.85 : 1; }
    if (this.E.shieldMesh) this.E.shieldMesh.visible = this.shield > 0;
    if (!S.demo) { S.profile.seen[def.id] = true; }
  }
  setPoints(points, startD = 0) {
    this.points = points; this.cum = [0];
    for (let i = 1; i < points.length; i++) this.cum.push(this.cum[i - 1] + points[i].distanceTo(points[i - 1]));
    this.total = this.cum[this.cum.length - 1];
    this.d = Math.min(startD, this.total); this.seg = 0;
  }
  get remaining() { return this.total - this.d; }
  get flying() { return !!this.def.flying; }
  get invisible() { return (this.def.invisible || this.cloaked) && this.revealT <= 0; }
  pointAt(d, out) {
    let i = this.seg;
    while (i < this.cum.length - 2 && this.cum[i + 1] < d) i++;
    while (i > 0 && this.cum[i] > d) i--;
    this.seg = i;
    const a = this.points[i], b = this.points[Math.min(i + 1, this.points.length - 1)];
    const len = this.cum[i + 1] - this.cum[i] || 1;
    return out.copy(a).lerp(b, Math.max(0, Math.min(1, (d - this.cum[i]) / len)));
  }
  updatePos() {
    const prev = _v.copy(this.pos || new THREE.Vector3());
    this.pointAt(this.d, this.pos);
    const dx = this.pos.x - prev.x, dz = this.pos.z - prev.z;
    if (dx * dx + dz * dz > 1e-6) {
      const yaw = Math.atan2(dx, dz);
      let diff = yaw - this.E.root.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.E.root.rotation.y += diff * 0.25;
    }
    this.E.root.position.set(this.pos.x, this.E.flyH, this.pos.z);
  }
  // Lauf-Position verschieben (Rückstoß)
  push(amount) { if (this.def.boss) amount *= 0.25; this.d = Math.max(0, this.d - amount); }
  worldPos(out) { return out.set(this.pos.x, this.E.flyH + 0.6 * this.def.size, this.pos.z); }

  update(dt) {
    const def = this.def;
    this.spawnT += dt;
    // Statuseffekte
    if (this.burnT > 0) { this.burnT -= dt; damage(this, this.burnDps * dt, 'fire', { dot: true }); this.fxT -= dt; if (this.fxT <= 0) { FX.trail(this.pos.x, this.E.flyH + 0.8 * def.size, this.pos.z, '#ff7a1a', 0.35, 0.5); this.fxT = 0.12; } }
    if (this.poisonT > 0) { this.poisonT -= dt; damage(this, this.poisonDps * dt, 'poison', { dot: true }); if (Math.random() < dt * 6) FX.trail(this.pos.x, this.E.flyH + 0.8 * def.size, this.pos.z, '#a3e635', 0.3, 0.6); }
    if (!this.alive) return;
    if (this.slowT > 0) this.slowT -= dt; else this.slowF = 0;
    if (this.curseT > 0) this.curseT -= dt;
    if (this.revealT > 0) this.revealT -= dt;
    if (this.flash > 0) this.flash -= dt;
    // Fähigkeiten
    if (def.cloak) { this.cloakT -= dt; if (this.cloakT <= 0) { this.cloaked = !this.cloaked; this.cloakT = def.cloak; } }
    if (def.heal) { this.healT -= dt; if (this.healT <= 0) { this.healT = 1; for (const o of S.enemies) if (o.alive && o !== this && o.pos.distanceToSquared(this.pos) < (2 * TILE) ** 2) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * def.heal); } FX.ring(this.pos.x, 0.1, this.pos.z, '#22c55e', 2 * TILE, 0.6); } }
    if (def.ability) this.bossAbility(dt);
    // Bewegung
    let slow = Math.max(this.slowF, this.auraSlow);
    if (def.immune && def.immune.includes('ice')) slow = 0;
    if (def.boss) slow *= 0.5;
    this.auraSlowShown = this.auraSlow > 0 && !(def.immune && def.immune.includes('ice'));
    this.auraSlow = 0;
    if (this.stunT > 0) { this.stunT -= dt; if (def.boss) this.stunT = Math.min(this.stunT, 0.15); }
    else {
      this.d += this.speed * TILE * (1 - slow) * dt;
      if (def.jump) { this.jumpT -= dt; if (this.jumpT <= 0) { this.jumpT = def.jump; this.d += 1.5 * TILE; this.hopT = 0.4; FX.smokePuff(this.pos.x, 0.2, this.pos.z, '#d6d3d1', 4, 0.4); } }
    }
    if (this.d >= this.total) { this.reachGoal(); return; }
    this.updatePos();
    this.animate(dt, slow);
  }
  bossAbility(dt) {
    const def = this.def;
    this.abilityT -= dt;
    if (def.ability === 'regen') { this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.008 * dt); }
    if (this.abilityT > 0) return;
    const nearTowers = (r) => S.towers.filter((t) => t.pos.distanceTo(this.pos) < r * TILE);
    switch (def.ability) {
      case 'stomp': case 'titan': {
        this.abilityT = def.ability === 'titan' ? 6 : 7;
        for (const t of nearTowers(3)) t.disable(1.8, 'stun');
        FX.ring(this.pos.x, 0.1, this.pos.z, '#d6d3d1', 6 * TILE / 2, 0.7);
        FX.smokePuff(this.pos.x, 0.2, this.pos.z, '#a8a29e', 14, 1.2);
        S.shake = 0.8; Sound.play('stomp');
        if (def.ability === 'titan') this.summon(def.summon, 2);
        break;
      }
      case 'freeze': {
        this.abilityT = 6;
        const ts = nearTowers(6);
        for (let i = 0; i < 2 && ts.length; i++) { const t = ts.splice((Math.random() * ts.length) | 0, 1)[0]; t.disable(3, 'freeze'); FX.burst(t.pos.x, 1.5, t.pos.z, ['#bfe9ff', '#ffffff'], 18, 3); }
        Sound.play('freeze');
        break;
      }
      case 'summon': { this.abilityT = 6; this.summon(def.summon, 3); break; }
      default: this.abilityT = 999;
    }
  }
  summon(id, n) {
    const d = ENEMY_BY_ID[id]; if (!d) return;
    for (let i = 0; i < n; i++) spawnEnemy(id, { points: this.points, d: Math.max(0, this.d - (i + 1) * 0.8), hpMul: S.run ? S.run.hpMul : 1 });
    FX.burst(this.pos.x, 1, this.pos.z, ['#a855f7', '#1e1b4b'], 20, 3);
  }
  animate(dt, slow) {
    const E = this.E; const sp = (this.stunT > 0 ? 0 : 1) * (1 - slow * 0.6);
    this.phase += dt * 9 * sp * Math.min(2, this.speed);
    const s = Math.sin(this.phase);
    for (let i = 0; i < E.legs.length; i++) {
      if (E.spider) E.legs[i].rotation.x = Math.sin(this.phase + i) * 0.4;
      else E.legs[i].rotation.x = (i % 2 ? s : -s) * 0.6;
    }
    if (!E.zombie) for (let i = 0; i < E.arms.length; i++) E.arms[i].rotation.x = (i % 2 ? -s : s) * 0.5;
    for (let i = 0; i < E.wings.length; i++) E.wings[i].rotation.z = (i % 2 ? 1 : -1) * Math.sin(this.phase * 1.6) * 0.6;
    let y = Math.abs(s) * E.bob * this.def.size;
    if (E.squash) E.squash.scale.set(1 + s * 0.08, 0.85 - s * 0.08, 1 + s * 0.08);
    if (this.hopT > 0) { this.hopT -= dt; y += Math.sin((this.hopT / 0.4) * Math.PI) * 1.2; }
    if (E.flyH) y += Math.sin(this.phase * 0.4) * 0.15;
    E.body.position.y = y;
    // Spawn-Animation
    const k = Math.min(1, this.spawnT / 0.35);
    E.root.scale.setScalar(0.3 + 0.7 * k);
    // Optik der Effekte
    const inv = this.invisible, partial = (this.def.invisible || this.cloaked);
    const op = inv ? 0.18 : partial ? 0.55 : (E.ghost ? 0.85 : 1);
    const m = E.mats[0];
    m.opacity = op; E.mats[1].opacity = op;
    if (this.flash > 0) m.emissive.setRGB(1, 1, 1), m.emissiveIntensity = 0.7;
    else if (this.slowF > 0 || this.auraSlowShown) m.emissive.set('#3fa9ff'), m.emissiveIntensity = 0.35;
    else if (this.burnT > 0) m.emissive.set('#ff5a1f'), m.emissiveIntensity = 0.35;
    else if (this.poisonT > 0) m.emissive.set('#84cc16'), m.emissiveIntensity = 0.3;
    else if (this.curseT > 0) m.emissive.set('#a855f7'), m.emissiveIntensity = 0.4;
    else if (this.def.glow) m.emissive.set(this.def.c1), m.emissiveIntensity = 0.5;
    else m.emissiveIntensity = 0;
    // Lebensleiste
    const f = Math.max(0, this.hp / this.maxHp);
    E.hbFg.scale.x = 0.94 * f;
    E.hbFg.material.color.setHSL(0.33 * f, 0.85, 0.5);
    E.hb.visible = !inv && (f < 1 || this.def.boss || this.def.miniboss || this.shield > 0);
    if (E.shieldMesh) { E.shieldMesh.visible = this.shield > 0 && !inv; }
  }
  reachGoal() {
    this.alive = false; this.reached = true;
    this.release();
    if (S.demo || !S.run) return;
    const cost = this.def.lives || 1;
    S.run.lives = Math.max(0, S.run.lives - cost);
    S.run.lostLife = true;
    S.run.leaks[this.def.id] = (S.run.leaks[this.def.id] || 0) + 1;
    stat('leaks');
    const g = tileToWorld(GOAL.x, GOAL.z);
    FX.burst(g.x, 1.5, g.z, ['#ef4444', '#ffffff'], 18, 4);
    floatText(new THREE.Vector3(g.x, 2.5, g.z), `-${cost} ❤`, '#ff4d4d', true);
    S.shake = 0.4; Sound.play('leak');
  }
  release() {
    this.E.root.visible = false;
    S.scene.remove(this.E.root);
    (pools[this.def.id] || (pools[this.def.id] = [])).push(this.E);
  }
}

export function damage(e, amt, type, src = {}) {
  if (!e.alive || amt <= 0) return 0;
  const d = e.def;
  if (d.immune && d.immune.includes(type)) { if (!src.dot && Math.random() < 0.2) floatText(e.worldPos(_v).clone(), 'IMMUN', '#cbd5e1'); return 0; }
  if (d.resist && d.resist[type]) amt *= 1 - d.resist[type];
  if (d.armor && (type === 'phys' || type === 'energy') && !src.armorPierce) amt *= 1 - d.armor;
  if (e.curseT > 0) amt *= 1 + e.curseAmt;
  if (e.shield > 0) {
    const a = Math.min(e.shield, amt); e.shield -= a; amt -= a;
    if (e.shield <= 0) { FX.burst(e.pos.x, 1, e.pos.z, '#60a5fa', 14, 3); }
  }
  e.hp -= amt;
  if (!src.dot) e.flash = 0.06;
  if (!S.demo) S.profile.stats.damage += amt;
  if (src.tower) src.tower.dmgDone += amt;
  if (S.profile.settings.dmgNumbers && !src.dot && amt >= 1 && Math.random() < 0.35) floatText(e.worldPos(_v).clone(), String(Math.round(amt)), '#ffffff');
  if (e.hp <= 0) kill(e, src);
  return amt;
}

function kill(e, src) {
  const d = e.def;
  if (d.revive && !e.revived) {
    e.revived = true; e.hp = e.maxHp * d.revive; e.burnT = 0; e.poisonT = 0;
    FX.burst(e.pos.x, 0.8, e.pos.z, ['#7fa86a', '#3f5f3a'], 14, 2, 0.3, 0.6, 4, false);
    floatText(e.worldPos(_v).clone(), 'Wiederbelebt!', '#a3e635');
    return;
  }
  e.alive = false;
  const p = e.worldPos(new THREE.Vector3());
  const kfx = KILL_FX.find((k) => k.id === S.profile.equipped.killfx);
  const cols = kfx && kfx.colors ? kfx.colors : [d.c1, d.c2, '#ffffff'];
  FX.burst(p.x, p.y, p.z, cols, d.boss ? 60 : 12, d.boss ? 7 : 3, d.boss ? 0.6 : 0.28, 0.7, 6);
  if (d.boss || d.miniboss) { FX.explosion(p.x, 0, p.z, d.boss ? 3 : 1.8, d.c1); }
  Sound.play(d.boss ? 'explosion' : 'death');
  if (d.split) {
    const [cid, n] = d.split;
    for (let i = 0; i < n; i++) spawnEnemy(cid, { points: e.points, d: Math.max(0, e.d - i * 0.5), hpMul: S.run ? S.run.hpMul : 1 });
  }
  if (d.curseTowers) {
    for (const t of S.towers) if (t.pos.distanceTo(e.pos) < 2 * TILE) t.disable(d.curseTowers, 'curse');
    FX.ring(e.pos.x, 0.1, e.pos.z, '#a855f7', 2 * TILE, 0.6);
  }
  e.release();
  if (S.demo || !S.run) return;
  const run = S.run;
  if (run.creative) { run.kills++; return; }
  const reward = d.reward * (1.2 + run.wave * 0.035) * run.rewardMul;
  if (reward > 0) {
    addCoins(reward);
    floatText(p.clone().setY(p.y + 0.6), `+${Math.round(reward)} 🪙`, '#ffd23f', !!d.boss);
    if (d.boss || Math.random() < 0.2) Sound.play('coin');
  }
  run.kills++;
  stat('kills');
  S.profile.killsBy[d.id] = (S.profile.killsBy[d.id] || 0) + 1;
  addXP(2 + d.reward / 5);
  if (d.boss) {
    run.bosses++; stat('bossKills');
    if (d.id === 'b_titan') stat('titanKills');
    if (!run.creative) { S.profile.gems += 25; S.profile.crystals += 1; floatText(p.clone().setY(p.y + 1.6), '+25 💎 +1 🔮', '#7dd3fc', true); }
    addXP(150);
  }
  towerHooks.onKill && towerHooks.onKill(e);
}

export function spawnEnemy(id, opts = {}) {
  const def = ENEMY_BY_ID[id]; if (!def) return null;
  const run = S.run;
  let hpMul = opts.hpMul ?? (run ? run.hpMul : 1);
  if (def.boss && run) hpMul = run.bossMul;
  const spdMul = run ? run.spdMul : 1;
  const points = opts.points || S.pathPoints;
  if (!points || points.length < 2) return null;
  const e = new Enemy(def, hpMul, spdMul, points, opts.d || 0);
  S.enemies.push(e);
  if (def.boss && !S.demo) { Sound.play('boss'); Sound.setTrack('boss'); S.shake = 0.6; }
  return e;
}

export function updateEnemies(dt) {
  for (const e of S.enemies) if (e.alive) e.update(dt);
  S.enemies = S.enemies.filter((e) => e.alive);
}

// Neue Route für alle Gegner nach Straßenänderung
export function repathEnemies() {
  for (const e of S.enemies) {
    if (!e.alive) continue;
    const t = worldToTile(e.pos.x, e.pos.z);
    const path = S.grid.findPath(t);
    if (path && path.length) {
      const pts = pathToPoints(path);
      pts[0] = new THREE.Vector3(e.pos.x, 0, e.pos.z);
      e.setPoints(pts, 0);
    }
  }
}

export function clearEnemies() {
  for (const e of S.enemies) if (e.alive) { e.alive = false; e.release(); }
  S.enemies = [];
}
