// Treffer- und Effektlogik, Geschosse (Pooling), Minen
import * as THREE from 'three';
import { S } from './state.js';
import { TILE } from './config.js';
import { damage } from './enemies.js';
import { FX } from './effects.js';
import { Sound } from './audio.js';
import { G, mat, basic } from './models.js';

const immune = (e, t) => e.def.immune && e.def.immune.includes(t);

export function hitEnemy(e, t, s, mul = 1) {
  const def = t.def;
  damage(e, s.dmg * mul, def.dmgType || 'phys', { armorPierce: def.armorPierce, tower: t });
  if (!e.alive) return;
  if (s.slow && !immune(e, 'ice')) { e.slowF = Math.max(e.slowF, s.slow[0]); e.slowT = Math.max(e.slowT, s.slow[1]); }
  if (s.burn && !immune(e, 'fire')) { e.burnDps = e.burnT > 0 ? Math.max(e.burnDps, s.burn[0]) : s.burn[0]; e.burnT = s.burn[1]; }
  if (s.poison && !immune(e, 'poison')) { e.poisonDps = e.poisonT > 0 ? Math.max(e.poisonDps, s.poison[0]) : s.poison[0]; e.poisonT = s.poison[1]; }
  if (s.stun) e.stunT = Math.max(e.stunT, s.stun);
  if (s.knock) e.push(s.knock * TILE);
  if (s.curse) { e.curseAmt = Math.max(e.curseT > 0 ? e.curseAmt : 0, s.curse[0]); e.curseT = s.curse[1]; }
}

export function splashAt(pos, radius, t, s, skip = null) {
  const r2 = (radius * TILE) ** 2;
  for (const e of S.enemies) {
    if (!e.alive || e === skip) continue;
    if (t.def.groundOnly && e.flying) continue;
    const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
    if (dx * dx + dz * dz <= r2) hitEnemy(e, t, s);
  }
}

// ---------------------------------------------------------------- Geschoss-Modelle
function projMesh(kind, color) {
  const g = new THREE.Group();
  const m = (geo, mt, x = 0, y = 0, z = 0, rx = 0) => { const o = new THREE.Mesh(geo, mt); o.position.set(x, y, z); o.rotation.x = rx; g.add(o); return o; };
  switch (kind) {
    case 'arrow': m(G.cyl(0.025, 0.025, 0.6, 4), mat('#8b5a2b'), 0, 0, 0, Math.PI / 2); m(G.cone(0.05, 0.14, 5), mat('#cbd5e1', { m: 0.7 }), 0, 0, 0.35, Math.PI / 2); m(G.box(0.1, 0.01, 0.1), mat('#ffffff'), 0, 0, -0.28); break;
    case 'ball': m(G.sph(0.17, 10, 8), mat('#27272a', { m: 0.6, r: 0.3 })); break;
    case 'water': m(G.sph(0.2, 10, 8), mat('#60a5fa', { e: 0.4, t: 0.75 })); break;
    case 'ice': m(G.oct(0.17), mat('#bfe9ff', { e: 1 })); break;
    case 'goo': m(G.sph(0.2, 10, 8), mat('#a3e635', { e: 0.8 })); break;
    case 'bullet': m(G.box(0.06, 0.06, 0.35), basic('#fde047')); break;
    case 'rocket': m(G.cyl(0.07, 0.07, 0.4, 8), mat('#f8fafc'), 0, 0, 0, Math.PI / 2); m(G.cone(0.07, 0.16, 8), mat('#ef4444'), 0, 0, 0.27, Math.PI / 2); break;
    case 'orb': m(G.sph(0.2, 12, 8), basic(color || '#c084fc')); m(G.sph(0.32, 12, 8), basic(color || '#c084fc', { t: 0.35, add: true })); break;
    case 'fang': m(G.cone(0.08, 0.3, 5), mat('#a3e635', { e: 0.6 }), 0, 0, 0, Math.PI / 2); break;
    case 'shard': m(G.oct(0.15), mat('#f9a8d4', { e: 1.2 })); break;
    case 'plasma': m(G.sph(0.24, 12, 8), basic('#f0abfc')); m(G.sph(0.4, 12, 8), basic('#d946ef', { t: 0.4, add: true })); break;
    case 'bomb': m(G.sph(0.32, 12, 10), mat('#18181b', { m: 0.5, r: 0.3 })); m(G.cyl(0.03, 0.03, 0.2, 4), mat('#a16207'), 0, 0.35, 0); break;
    case 'shadow': m(G.sph(0.26, 12, 8), basic('#1e1b4b')); m(G.sph(0.38, 12, 8), basic('#a855f7', { t: 0.45, add: true })); break;
    case 'mine': m(G.cyl(0.22, 0.25, 0.1, 10), mat('#3f3f46', { m: 0.5 })); m(G.sph(0.06, 6, 4), mat('#ef4444', { e: 2 }), 0, 0.07, 0); break;
    case 'meteor': m(G.dode(0.6), mat('#7c2d12', { e: 1.2, ec: '#f97316', flat: true })); break;
    default: m(G.sph(0.15), basic('#ffffff'));
  }
  return g;
}
const pool = {};
function getMesh(kind, color) {
  const k = kind + (color || '');
  const p = pool[k] || (pool[k] = []);
  const m = p.pop() || projMesh(kind, color);
  m.userData.key = k; m.visible = true; S.scene.add(m); return m;
}
function freeMesh(m) { m.visible = false; S.scene.remove(m); pool[m.userData.key].push(m); }

const _d = new THREE.Vector3(), _p = new THREE.Vector3();

// opts: {kind, from, target, tower, stats, mode:'homing'|'lob'|'straight'|'fall'|'mine', dest}
export function fire(opts) {
  const p = {
    ...opts, mesh: getMesh(opts.kind, opts.color), pos: opts.from.clone(), t: 0, alive: true,
    last: opts.target ? opts.target.worldPos(new THREE.Vector3()) : (opts.dest ? opts.dest.clone() : opts.from.clone()),
    hit: new Set(), pierceLeft: opts.stats.pierce || 0, trailT: 0,
  };
  p.speed = (opts.stats.speed || 14) * TILE * 0.5;
  if (p.mode === 'lob' || p.mode === 'mine') {
    p.start = p.pos.clone(); p.dest = p.dest ? p.dest.clone() : p.last.clone(); p.dest.y = 0.1;
    const dist = p.start.distanceTo(p.dest); p.dur = Math.max(0.5, dist / p.speed * 1.6); p.h = 2 + dist * 0.3;
  }
  if (p.mode === 'fall') { p.dest = (opts.dest || p.last).clone(); p.dest.y = 0; p.start = p.dest.clone().add(_d.set(4, 18, 3)); p.pos.copy(p.start); p.dur = 0.9; }
  if (p.mode === 'straight') { p.dir = p.last.clone().sub(p.pos).normalize(); p.maxDist = opts.stats.range * TILE * 1.3; p.travel = 0; }
  p.mesh.position.copy(p.pos);
  S.projectiles.push(p);
  return p;
}

function impact(p, at, target) {
  const s = p.stats, t = p.tower;
  if (s.splash) {
    splashAt(at, s.splash, t, s, null);
    const col = { goo: '#a3e635', plasma: '#f0abfc', meteor: '#f97316', bomb: '#ff8a1a', ball: '#ffb347', rocket: '#ff7a1a', mine: '#ff8a1a' }[p.kind] || '#ffb347';
    if (p.kind === 'goo') { FX.burst(at.x, 0.3, at.z, ['#a3e635', '#4d7c0f'], 16, 3, 0.35, 0.8, 5); FX.ring(at.x, 0.08, at.z, '#a3e635', s.splash * TILE, 0.5); Sound.play('hit'); }
    else { FX.explosion(at.x, 0, at.z, Math.min(3, s.splash * 1.1), col); Sound.play('explosion'); }
  } else if (target && target.alive) {
    hitEnemy(target, t, s);
    const col = { ice: '#bfe9ff', water: '#60a5fa', orb: '#c084fc', shard: '#f9a8d4', fang: '#a3e635', shadow: '#a855f7', bullet: '#fde047' }[p.kind] || '#ffffff';
    FX.burst(at.x, at.y, at.z, col, p.kind === 'bullet' ? 3 : 7, 2, 0.2, 0.35, 3);
    Sound.play('hit');
  }
}

export function updateProjectiles(dt) {
  for (const p of S.projectiles) {
    if (!p.alive) continue;
    p.t += dt;
    if (p.mode === 'lob' || p.mode === 'mine' || p.mode === 'fall') {
      const k = Math.min(1, p.t / p.dur);
      if (p.mode === 'fall') p.pos.copy(p.start).lerp(p.dest, k * k);
      else { p.pos.copy(p.start).lerp(p.dest, k); p.pos.y = p.start.y * (1 - k) + Math.sin(k * Math.PI) * p.h; }
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.x += dt * 5; p.mesh.rotation.z += dt * 3;
      if (p.kind === 'meteor') { FX.trail(p.pos.x, p.pos.y, p.pos.z, '#f97316', 0.9, 0.5); FX.trail(p.pos.x, p.pos.y, p.pos.z, '#57534e', 0.7, 0.8, false); }
      if (p.kind === 'bomb' && Math.random() < 0.5) FX.trail(p.pos.x, p.pos.y + 0.4, p.pos.z, '#fde047', 0.15, 0.2);
      if (k >= 1) {
        p.alive = false; freeMesh(p.mesh);
        if (p.mode === 'mine') placeMine(p);
        else impact(p, p.dest, null);
      }
      continue;
    }
    if (p.mode === 'straight') {
      const step = p.speed * dt; p.pos.addScaledVector(p.dir, step); p.travel += step;
      p.mesh.position.copy(p.pos);
      FX.trail(p.pos.x, p.pos.y, p.pos.z, '#e879f9', 0.4, 0.25);
      for (const e of S.enemies) {
        if (!e.alive || p.hit.has(e)) continue;
        const wp = e.worldPos(_p);
        if (wp.distanceToSquared(p.pos) < (0.55 * TILE * Math.max(0.8, e.def.size)) ** 2) {
          p.hit.add(e); impact(p, wp.clone(), e); p.pierceLeft--;
          if (p.pierceLeft < 0) { p.alive = false; break; }
        }
      }
      if (p.travel > p.maxDist) p.alive = false;
      if (!p.alive) freeMesh(p.mesh);
      continue;
    }
    // zielsuchend
    if (p.target && p.target.alive) p.target.worldPos(p.last);
    _d.copy(p.last).sub(p.pos);
    const dist = _d.length(), step = p.speed * dt;
    if (dist <= step + 0.15) {
      p.alive = false; freeMesh(p.mesh);
      impact(p, p.last.clone(), p.target && p.target.alive ? p.target : null);
      continue;
    }
    p.pos.addScaledVector(_d.normalize(), step);
    p.mesh.position.copy(p.pos);
    p.mesh.lookAt(p.last);
    p.trailT -= dt;
    if (p.trailT <= 0) {
      p.trailT = 0.03;
      if (p.kind === 'rocket') { FX.trail(p.pos.x, p.pos.y, p.pos.z, '#ffb347', 0.3, 0.2); FX.trail(p.pos.x, p.pos.y, p.pos.z, '#9ca3af', 0.35, 0.6, false); }
      else if (p.kind === 'orb' || p.kind === 'shadow') FX.trail(p.pos.x, p.pos.y, p.pos.z, p.kind === 'orb' ? '#c084fc' : '#7c3aed', 0.35, 0.3);
      else if (p.kind === 'ice') FX.trail(p.pos.x, p.pos.y, p.pos.z, '#bfe9ff', 0.2, 0.3);
      else if (p.kind === 'water') FX.trail(p.pos.x, p.pos.y, p.pos.z, '#93c5fd', 0.25, 0.25);
      else if (p.kind === 'goo') FX.trail(p.pos.x, p.pos.y, p.pos.z, '#a3e635', 0.2, 0.3);
    }
  }
  S.projectiles = S.projectiles.filter((p) => p.alive);
  updateMines(dt);
}

function placeMine(p) {
  const m = getMesh('mine');
  m.position.set(p.dest.x, 0.08, p.dest.z);
  S.mines.push({ mesh: m, pos: m.position, tower: p.tower, stats: p.stats, arm: 0.3, alive: true, blink: 0 });
}
function updateMines(dt) {
  for (const mi of S.mines) {
    if (!mi.alive) continue;
    if (mi.arm > 0) { mi.arm -= dt; continue; }
    mi.blink += dt; mi.mesh.children[1].visible = Math.sin(mi.blink * 8) > 0;
    for (const e of S.enemies) {
      if (!e.alive || e.flying) continue;
      const dx = e.pos.x - mi.pos.x, dz = e.pos.z - mi.pos.z;
      if (dx * dx + dz * dz < (0.6 * TILE) ** 2) {
        mi.alive = false; freeMesh(mi.mesh);
        splashAt(mi.pos, mi.stats.splash, mi.tower, mi.stats);
        FX.explosion(mi.pos.x, 0, mi.pos.z, 1.6, '#ff8a1a'); Sound.play('explosion');
        break;
      }
    }
  }
  S.mines = S.mines.filter((m) => m.alive);
}
export function clearProjectiles() {
  for (const p of S.projectiles) if (p.alive) freeMesh(p.mesh);
  for (const m of S.mines) if (m.alive) freeMesh(m.mesh);
  S.projectiles = []; S.mines = [];
}
export function removeMinesOf(tower) {
  for (const m of S.mines) if (m.tower === tower && m.alive) { m.alive = false; freeMesh(m.mesh); }
  S.mines = S.mines.filter((m) => m.alive);
}
