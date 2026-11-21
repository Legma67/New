// Türme: Zielerfassung, Angriffe aller Typen, Upgrades, Animationen
import * as THREE from 'three';
import { S } from './state.js';
import { TILE, tileToWorld, MAX_LEVEL } from './config.js';
import { towerStats, upgradeCost } from './data/towers.js';
import { makeTowerModel, applyLevelVisuals, makeDrone, G, mat, basic } from './models.js';
import { fire, hitEnemy, splashAt, removeMinesOf } from './combat.js';
import { damage } from './enemies.js';
import { FX, floatText } from './effects.js';
import { Sound } from './audio.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const SHOOT_SOUND = { arrow: 'shoot_arrow', ball: 'shoot_cannon', water: 'water', ice: 'shoot_ice', goo: 'shoot_cannon', bullet: 'shoot_gun',
  rocket: 'shoot_rocket', orb: 'shoot_magic', fang: 'shoot_arrow', shard: 'shoot_ice', plasma: 'shoot_magic', bomb: 'shoot_cannon', shadow: 'shoot_magic' };

export class Tower {
  constructor(def, x, z, opts = {}) {
    this.def = def; this.tx = x; this.tz = z;
    this.level = opts.level || 0; this.rot = opts.rot || 0;
    this.spent = opts.spent ?? def.cost;
    this.targetMode = opts.target || 'first';
    this.M = makeTowerModel(def, this.level);
    const w = tileToWorld(x, z);
    this.pos = new THREE.Vector3(w.x, 0, w.z);
    this.M.group.position.copy(this.pos);
    this.M.baseWrap.rotation.y = this.rot * Math.PI / 2;
    this.M.head.rotation.y = this.rot * Math.PI / 2;
    S.scene.add(this.M.group);
    this.M.group.traverse((o) => { o.userData.tower = this; });
    this.cd = Math.random() * 0.3; this.disabledT = 0; this.disableKind = null; this.buff = 0;
    this.recoilT = 0; this.buildT = opts.instant ? 1 : 0; this.healT = 0; this.dmgDone = 0;
    this.target = null; this.coneT = 0; this.auraT = 0;
    this.stats = towerStats(def, this.level, 0);
    if (def.type === 'beam') this.makeBeam();
    if (def.type === 'drone') this.makeDrones();
    this.overlay = null;
  }
  get upgradeCost() { return this.level >= MAX_LEVEL ? 0 : upgradeCost(this.def, this.level); }
  get sellValue() { return Math.round(this.spent * 0.7); }
  refreshStats() { this.stats = towerStats(this.def, this.level, this.buff); }
  upgrade() {
    this.level++;
    applyLevelVisuals(this.M, this.def, this.level);
    this.M.group.traverse((o) => { o.userData.tower = this; });
    this.refreshStats();
    if (this.def.type === 'drone') this.makeDrones();
    FX.burst(this.pos.x, 1.5, this.pos.z, ['#fde047', '#ffffff', this.def.c3], 30, 4, 0.3, 0.8, 4);
    FX.ring(this.pos.x, 0.1, this.pos.z, '#fde047', 2.2, 0.6);
    this.buildT = 0.5;
  }
  setRotation(r) { this.rot = r; this.M.baseWrap.rotation.y = r * Math.PI / 2; }
  moveTo(x, z) {
    this.tx = x; this.tz = z; const w = tileToWorld(x, z);
    this.pos.set(w.x, 0, w.z); this.M.group.position.copy(this.pos);
    removeMinesOf(this); this.buildT = 0;
  }
  remove() {
    S.scene.remove(this.M.group);
    if (this.beam) S.scene.remove(this.beam);
    if (this.overlay) S.scene.remove(this.overlay);
    removeMinesOf(this);
  }
  disable(t, kind) {
    if (this.def.type === 'gold' || this.def.type === 'heal') return;
    this.disabledT = Math.max(this.disabledT, t); this.disableKind = kind;
    if (!this.overlay) {
      this.overlay = new THREE.Mesh(G.cyl(0.85, 0.85, 2.4, 8), new THREE.MeshStandardMaterial({ color: '#bfe9ff', transparent: true, opacity: 0.4, emissive: '#3b82f6', emissiveIntensity: 0.4, depthWrite: false }));
      S.scene.add(this.overlay);
    }
    this.overlay.material.color.set(kind === 'freeze' ? '#bfe9ff' : kind === 'curse' ? '#a855f7' : '#d6d3d1');
    this.overlay.material.emissive.set(kind === 'freeze' ? '#3b82f6' : kind === 'curse' ? '#7c3aed' : '#78716c');
    this.overlay.position.set(this.pos.x, 1.2, this.pos.z); this.overlay.visible = true;
  }
  makeBeam() {
    const geo = new THREE.CylinderGeometry(0.06, 0.06, 1, 6, 1, true); geo.translate(0, 0.5, 0); geo.rotateX(Math.PI / 2);
    this.beam = new THREE.Group();
    this.beamCore = new THREE.Mesh(geo, basic('#ffffff', { t: 0.95, add: true }));
    this.beamGlow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: this.def.beamColor, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beamGlow.scale.set(3, 3, 1);
    this.beam.add(this.beamCore, this.beamGlow); this.beam.visible = false;
    S.scene.add(this.beam);
  }
  makeDrones() {
    const root = this.M.droneRoot; if (!root) return;
    while (root.children.length) root.remove(root.children[0]);
    this.drones = [];
    for (let i = 0; i < this.stats.drones; i++) { const d = makeDrone(this.def.c3); root.add(d); this.drones.push({ m: d, cd: Math.random() * 0.5, a: i / this.stats.drones * Math.PI * 2 }); }
  }

  canSee(e) {
    if (!e.alive) return false;
    if (this.def.groundOnly && e.flying) return false;
    if (e.invisible && !this.def.detect) return false;
    return true;
  }
  inRange(e, range) {
    const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
    const r = range * TILE + 0.3 * e.def.size;
    return dx * dx + dz * dz <= r * r;
  }
  findTargets(n = 1, range = this.stats.range) {
    const list = [];
    for (const e of S.enemies) if (this.canSee(e) && this.inRange(e, range)) list.push(e);
    if (!list.length) return list;
    const m = this.targetMode;
    if (m === 'first') list.sort((a, b) => a.remaining - b.remaining);
    else if (m === 'last') list.sort((a, b) => b.remaining - a.remaining);
    else if (m === 'strong') list.sort((a, b) => b.hp - a.hp);
    else if (m === 'close') list.sort((a, b) => a.pos.distanceToSquared(this.pos) - b.pos.distanceToSquared(this.pos));
    return list.slice(0, n);
  }
  aimAt(e, dt, speed = 10) {
    const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
    const yaw = Math.atan2(dx, dz);
    let diff = yaw - this.M.head.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.M.head.rotation.y += diff * Math.min(1, dt * speed);
    return Math.abs(diff) < 0.5;
  }
  muzzlePos(i = 0, out = _a) { const m = this.M.muzzles[i % Math.max(1, this.M.muzzles.length)]; if (!m) return out.copy(this.pos).setY(1.5); return m.getWorldPosition(out); }

  update(dt) {
    const M = this.M, def = this.def, s = this.stats;
    // Bau-Animation
    if (this.buildT < 1) {
      this.buildT = Math.min(1, this.buildT + dt * 2.5);
      const k = this.buildT, e = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
      M.group.scale.setScalar(Math.max(0.01, e));
    }
    // Animationen
    for (const sp of M.spinners) sp.o.rotation[sp.axis] += sp.speed * dt;
    for (const o of M.orbiters) o.rotation.y += dt * 1.5;
    if (M.flames.length) for (const f of M.flames) { f.scale.set(1 + Math.sin(S.time * 17) * 0.08, 1 + Math.sin(S.time * 13) * 0.18, 1 + Math.cos(S.time * 15) * 0.08); }
    if (M.glow) { const k = 1 + Math.sin(S.time * 4 + this.tx) * 0.08; M.glow.scale.setScalar(k); }
    if (M.aura) M.aura.rotation.y += dt;
    if (M.wings) { const a = Math.sin(S.time * 3) * 0.2; M.wings[0].rotation.z = 0.5 + a; M.wings[1].rotation.z = -0.5 - a; }
    if (M.recoil) { this.recoilT = Math.max(0, this.recoilT - dt * 6); M.recoil.position.z = (M.recoil.userData.z0 ?? (M.recoil.userData.z0 = M.recoil.position.z)) - this.recoilT * 0.18; }
    if (M.droneRoot && M.droneRoot.parent) { M.droneRoot.rotation.y = -M.head.rotation.y; }
    if (this.disabledT > 0) {
      this.disabledT -= dt;
      if (this.disabledT <= 0 && this.overlay) this.overlay.visible = false;
      if (this.beam) this.beam.visible = false;
      return;
    }
    if (S.state === 'play' && S.run && S.run.over) { if (this.beam) this.beam.visible = false; return; }
    this.cd -= dt;
    switch (def.type) {
      case 'proj': case 'missile': case 'lob': this.updateShooter(dt); break;
      case 'multi': this.updateMulti(dt); break;
      case 'hitscan': this.updateHitscan(dt); break;
      case 'beam': this.updateBeam(dt); break;
      case 'chain': this.updateChain(dt); break;
      case 'pulse': this.updatePulse(dt); break;
      case 'cone': this.updateCone(dt); break;
      case 'mine': this.updateMine(dt); break;
      case 'meteor': this.updateMeteor(dt); break;
      case 'aura': this.updateAura(dt); break;
      case 'drone': this.updateDrones(dt); break;
      case 'heal': this.updateHeal(dt); break;
      default: break;
    }
  }
  updateShooter(dt) {
    const t = this.findTargets(1)[0]; if (!t) return;
    const aimed = this.aimAt(t, dt);
    if (this.cd > 0 || !aimed) return;
    this.cd = 1 / this.stats.rate;
    const mode = this.def.type === 'lob' ? 'lob' : this.stats.pierce ? 'straight' : 'homing';
    const from = this.muzzlePos(0).clone();
    const dest = mode === 'lob' ? this.lead(t, 0.9) : null;
    fire({ kind: this.def.proj, from, target: t, tower: this, stats: this.stats, mode, dest });
    this.recoilT = 1;
    FX.burst(from.x, from.y, from.z, this.def.proj === 'water' ? '#93c5fd' : '#ffd8a8', 4, 1.5, 0.18, 0.2, 0);
    if (this.def.proj === 'ball' || this.def.proj === 'bomb') FX.smokePuff(from.x, from.y, from.z, '#d1d5db', 2, 0.4);
    Sound.play(SHOOT_SOUND[this.def.proj] || 'shoot_arrow');
  }
  lead(t, time) { const p = t.worldPos(new THREE.Vector3()); const fwd = t.pointAt(Math.min(t.total, t.d + t.speed * TILE * time * (t.stunT > 0 ? 0 : 1 - t.slowF)), new THREE.Vector3()); p.x = fwd.x; p.z = fwd.z; p.y = 0; return p; }
  updateMulti(dt) {
    const ts = this.findTargets(this.stats.targets); if (!ts.length) return;
    this.aimAt(ts[0], dt);
    if (this.cd > 0) return;
    this.cd = 1 / this.stats.rate;
    ts.forEach((t, i) => fire({ kind: this.def.proj, from: this.muzzlePos(i).clone(), target: t, tower: this, stats: this.stats, mode: 'homing', color: this.def.c3 }));
    this.recoilT = 1; Sound.play(SHOOT_SOUND[this.def.proj]);
  }
  updateHitscan(dt) {
    const t = this.findTargets(1)[0]; if (!t) return;
    const aimed = this.aimAt(t, dt, 6);
    if (this.cd > 0 || !aimed) return;
    this.cd = 1 / this.stats.rate;
    const from = this.muzzlePos(0).clone(), to = t.worldPos(new THREE.Vector3());
    FX.seg(from, to, '#fff7cc', 0.05, 0.12);
    FX.burst(from.x, from.y, from.z, '#fde68a', 6, 2, 0.2, 0.2, 0);
    FX.burst(to.x, to.y, to.z, '#ffffff', 8, 3, 0.2, 0.3, 3);
    hitEnemy(t, this, this.stats);
    this.recoilT = 1; Sound.play('shoot_sniper');
  }
  updateBeam(dt) {
    const t = this.findTargets(1)[0];
    if (!t) { this.beam.visible = false; return; }
    this.aimAt(t, dt, 14);
    const from = this.muzzlePos(0, _b), to = t.worldPos(_c);
    this.beam.visible = true; this.beam.position.copy(from); this.beam.lookAt(to);
    const len = from.distanceTo(to);
    const lv = 1 + this.level * 0.15;
    this.beamCore.scale.set(lv, lv, len); this.beamGlow.scale.set(3 * lv, 3 * lv, len);
    this.beamGlow.material.opacity = 0.45 + Math.sin(S.time * 30) * 0.15;
    const s = this.stats;
    hitEnemy(t, this, { ...s, dmg: s.dmg * dt, knock: 0 }, 1);
    if (Math.random() < dt * 25) FX.burst(to.x, to.y, to.z, this.def.beamColor, 2, 2, 0.2, 0.25, 2);
    if (this.cd <= 0) { this.cd = 0.25; Sound.play('shoot_laser'); }
  }
  updateChain(dt) {
    const t = this.findTargets(1)[0]; if (!t || this.cd > 0) return;
    this.cd = 1 / this.stats.rate;
    const hit = [t]; let cur = t;
    for (let i = 1; i < this.stats.chain; i++) {
      let best = null, bd = (2.2 * TILE) ** 2;
      for (const e of S.enemies) { if (!e.alive || hit.includes(e) || (e.invisible && !this.def.detect)) continue; const d = e.pos.distanceToSquared(cur.pos); if (d < bd) { bd = d; best = e; } }
      if (!best) break; hit.push(best); cur = best;
    }
    let prev = this.muzzlePos(0).clone();
    hit.forEach((e, i) => { const p = e.worldPos(new THREE.Vector3()); FX.lightning(prev, p); FX.burst(p.x, p.y, p.z, '#fde047', 5, 2, 0.2, 0.3, 2); hitEnemy(e, this, this.stats, Math.pow(0.85, i)); prev = p; });
    Sound.play('zap');
  }
  updatePulse(dt) {
    if (this.cd > 0) return;
    const ts = this.findTargets(99); if (!ts.length) return;
    this.cd = 1 / this.stats.rate;
    const fx = this.def.fx, r = this.stats.range * TILE;
    for (const e of ts) hitEnemy(e, this, this.stats);
    if (fx === 'fire') {
      FX.ring(this.pos.x, 0.15, this.pos.z, '#ff7a1a', r, 0.5);
      for (let i = 0; i < 26 * FX.quality; i++) { const a = Math.random() * Math.PI * 2, s = r * (1.2 + Math.random()); FX.glow.emit(this.pos.x, 0.5, this.pos.z, Math.cos(a) * s, 0.8 + Math.random(), Math.sin(a) * s, Math.random() < 0.5 ? '#ff7a1a' : '#ffd23f', 0.45, 0.5); }
      Sound.play('fire');
    } else if (fx === 'shock') {
      FX.ring(this.pos.x, 0.2, this.pos.z, '#7dd3fc', r, 0.4); FX.ring(this.pos.x, 0.6, this.pos.z, '#e0f2fe', r * 0.8, 0.3);
      const from = this.muzzlePos(0).clone();
      for (const e of ts.slice(0, 5)) FX.lightning(from, e.worldPos(new THREE.Vector3()), '#7dd3fc');
      Sound.play('zap');
    } else if (fx === 'hole') {
      FX.ring(this.pos.x, 0.2, this.pos.z, '#7c3aed', r, 0.8, r, 0.9);
      for (let i = 0; i < 40 * FX.quality; i++) { const a = Math.random() * Math.PI * 2; const x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r; FX.glow.emit(x, 0.6, z, -Math.cos(a) * r * 1.6, 0.6, -Math.sin(a) * r * 1.6, Math.random() < 0.5 ? '#7c3aed' : '#f0abfc', 0.35, 0.6); }
      Sound.play('hole');
    } else { FX.ring(this.pos.x, 0.2, this.pos.z, this.def.c3, r, 0.4); Sound.play('pulse'); }
  }
  updateCone(dt) {
    const t = this.findTargets(1)[0]; if (!t) return;
    this.aimAt(t, dt, 8);
    this.coneT -= dt;
    const from = this.muzzlePos(0, _b);
    const yaw = this.M.head.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (let i = 0; i < 3 * FX.quality; i++) {
      const spr = (Math.random() - 0.5) * 0.7, sp = this.stats.range * TILE * 1.5 * (0.6 + Math.random() * 0.4);
      const dx = Math.sin(yaw + spr), dz = Math.cos(yaw + spr);
      FX.glow.emit(from.x, from.y, from.z, dx * sp, (Math.random() - 0.3) * 1.5, dz * sp, Math.random() < 0.4 ? '#ffd23f' : Math.random() < 0.5 ? '#ff7a1a' : '#ef4444', 0.5 + Math.random() * 0.4, 0.55);
    }
    if (this.coneT > 0) return;
    this.coneT = 0.2;
    const r = this.stats.range * TILE;
    for (const e of S.enemies) {
      if (!this.canSee(e)) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > r || d < 0.01) continue;
      if ((dx * fx + dz * fz) / d < Math.cos(0.45)) continue;
      hitEnemy(e, this, { ...this.stats, dmg: this.stats.dmg * 0.2 });
    }
    Sound.play('fire');
  }
  updateMine(dt) {
    if (this.cd > 0) return;
    const mine = S.mines.filter((m) => m.tower === this).length;
    if (mine >= this.stats.maxMines) return;
    const r2 = (this.stats.range * TILE) ** 2;
    const pts = [];
    for (let i = 0; i < S.pathPoints.length - 1; i++) {
      for (let k = 0; k < 2; k++) {
        const p = S.pathPoints[i].clone().lerp(S.pathPoints[i + 1], k * 0.5);
        if (p.distanceToSquared(this.pos) <= r2) pts.push(p);
      }
    }
    if (!pts.length) return;
    this.cd = 1 / this.stats.rate;
    const dest = pts[(Math.random() * pts.length) | 0].clone();
    dest.x += (Math.random() - 0.5) * 0.8; dest.z += (Math.random() - 0.5) * 0.8;
    const fwd = _a.copy(dest).sub(this.pos); this.M.head.rotation.y = Math.atan2(fwd.x, fwd.z);
    fire({ kind: 'mine', from: this.muzzlePos(0).clone(), dest, tower: this, stats: { ...this.stats, speed: 10 }, mode: 'mine' });
    this.recoilT = 1; Sound.play('mine');
  }
  updateMeteor(dt) {
    if (this.cd > 0) return;
    const prev = this.targetMode; this.targetMode = 'strong';
    const t = this.findTargets(1)[0]; this.targetMode = prev;
    if (!t) return;
    this.cd = 1 / this.stats.rate;
    const from = this.muzzlePos(0).clone();
    FX.burst(from.x, from.y, from.z, ['#f97316', '#fde047'], 14, 3, 0.3, 0.5, -2);
    fire({ kind: 'meteor', from, target: t, tower: this, stats: this.stats, mode: 'fall', dest: this.lead(t, 0.9) });
    Sound.play('shoot_rocket');
  }
  updateAura(dt) {
    const s = this.stats, r = s.range;
    const inR = [];
    for (const e of S.enemies) if (e.alive && this.inRange(e, r)) inR.push(e);
    if (this.def.reveal) for (const e of inR) { e.revealT = 0.25; }
    if (s.auraSlow) for (const e of inR) e.auraSlow = Math.max(e.auraSlow, s.auraSlow);
    this.auraT -= dt;
    if (this.auraT <= 0) {
      this.auraT = 1.2;
      FX.ring(this.pos.x, 0.12, this.pos.z, this.def.reveal ? '#fde047' : '#a5f3fc', r * TILE, 1.1, r * TILE * 0.2, 0.4);
      if (s.dmg > 0) for (const e of inR) if (!(this.def.groundOnly && e.flying)) damage(e, s.dmg, this.def.dmgType, { tower: this });
    }
  }
  updateDrones(dt) {
    if (!this.drones) return;
    const ts = this.findTargets(this.drones.length);
    this.drones.forEach((d, i) => {
      d.a += dt * 1.6;
      const rad = 1.1 + this.level * 0.05;
      d.m.position.set(Math.cos(d.a) * rad, Math.sin(S.time * 3 + i) * 0.15, Math.sin(d.a) * rad);
      for (const r of d.m.userData.rotors) r.rotation.y += dt * 40;
      d.cd -= dt;
      const t = ts[i % Math.max(1, ts.length)];
      if (!t) return;
      const wp = d.m.getWorldPosition(new THREE.Vector3());
      d.m.lookAt(t.worldPos(_c));
      if (d.cd <= 0) { d.cd = 1 / this.stats.rate; fire({ kind: 'bullet', from: wp, target: t, tower: this, stats: this.stats, mode: 'homing' }); Sound.play('shoot_gun'); }
    });
  }
  updateHeal(dt) {
    const run = S.run;
    if (!run || S.demo || !run.active) return;
    this.healT += dt;
    if (this.healT >= this.stats.healEvery) {
      this.healT = 0;
      if (run.lives < run.maxLives) {
        run.lives++;
        floatText(this.pos.clone().setY(2.5), '+1 ❤', '#4ade80', true);
        FX.burst(this.pos.x, 1.8, this.pos.z, ['#4ade80', '#ffffff', '#ff4d8d'], 20, 2.5, 0.3, 0.9, -1);
        Sound.play('life');
      }
    }
  }
}

// Verstärkungsturm-Boni neu berechnen
export function recomputeBuffs() {
  const amps = S.towers.filter((t) => t.def.type === 'support');
  for (const t of S.towers) {
    let b = 0;
    if (t.def.type !== 'support') for (const a of amps) {
      const r = a.stats.range * TILE + 0.1;
      if (a.pos.distanceToSquared(t.pos) <= r * r) b += a.stats.buffAmt;
    }
    t.buff = Math.min(0.8, b); t.refreshStats();
  }
}
