'use strict';
// ============================================================
//  Spielfigur: laufen & springen wie in Roblox (WASD / Joystick)
// ============================================================
const Player = (() => {
  const V3 = THREE.Vector3;
  const SCALE = 0.55, SPEED = 5.2, JUMP = 8.5, GRAV = 26;
  let mesh = null, tag = null, scene = null;
  const pos = new V3(), vel = new V3();
  let yaw = 0, onGround = true, walkT = 0, active = false, jumpQueued = false;
  const joy = { x: 0, y: 0 };          // vom Touch-Joystick (-1..1)
  let obstacles = () => [];

  function spawn(sc, name, shirt, pants) {
    remove();
    scene = sc;
    mesh = Models.makeAvatar(shirt, pants);
    mesh.scale.setScalar(SCALE);
    tag = World.textSprite(name, 'rgba(0,0,0,0.45)', '#fff', 384, 96);
    tag.scale.set(4 / SCALE * 0.42, 1 / SCALE * 0.42, 1); tag.position.y = 3.15;
    mesh.add(tag);
    pos.set(-1.5, 0, GH / 2 + 1.6); vel.set(0, 0, 0); yaw = Math.PI;
    mesh.position.copy(pos);
    scene.add(mesh);
    active = true;
  }
  function remove() { if (mesh && scene) scene.remove(mesh); mesh = null; active = false; }
  function setObstacles(fn) { obstacles = fn; }
  function jump() { jumpQueued = true; }

  function update(dt, keys, camYaw) {
    if (!active || !mesh) return;
    // Eingabe: vorwärts/rechts relativ zur Kamera
    let fwd = 0, right = 0;
    if (keys.has('w') || keys.has('arrowup')) fwd += 1;
    if (keys.has('s') || keys.has('arrowdown')) fwd -= 1;
    if (keys.has('d') || keys.has('arrowright')) right += 1;
    if (keys.has('a') || keys.has('arrowleft')) right -= 1;
    fwd += -joy.y; right += joy.x;
    const len = Math.hypot(fwd, right);
    if (len > 1) { fwd /= len; right /= len; }
    const run = keys.has('shift') ? 1.35 : 1;
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);   // Blickrichtung der Kamera
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    const mx = (fx * fwd + rx * right) * SPEED * run, mz = (fz * fwd + rz * right) * SPEED * run;
    const moving = Math.hypot(mx, mz) > 0.1;
    // weich beschleunigen
    const k = Math.min(1, dt * (onGround ? 14 : 5));
    vel.x += (mx - vel.x) * k; vel.z += (mz - vel.z) * k;
    if ((jumpQueued || keys.has(' ')) && onGround) { vel.y = JUMP; onGround = false; Audio2.play('click'); }
    jumpQueued = false;
    vel.y -= GRAV * dt;
    pos.addScaledVector(vel, dt);
    if (pos.y <= 0) { pos.y = 0; vel.y = 0; onGround = true; }
    // Kollision mit Türmen, Deko, Burg (Kreise)
    for (const o of obstacles().concat(World.envObstacles)) {
      if (pos.y > (o.h || 1.2)) continue;
      const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz), r = o.r + 0.25;
      if (d < r && d > 0.0001) { pos.x = o.x + dx / d * r; pos.z = o.z + dz / d * r; }
    }
    pos.x = THREE.MathUtils.clamp(pos.x, -30, 30); pos.z = THREE.MathUtils.clamp(pos.z, -30, 30);
    // Drehen in Laufrichtung
    if (moving) {
      const target = Math.atan2(mx, mz);
      let d = target - yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      yaw += d * Math.min(1, dt * 14);
    }
    // Animation
    const sp = Math.hypot(vel.x, vel.z);
    walkT += dt * sp * 2.2;
    const A = mesh.userData.A;
    const sw = onGround ? Math.sin(walkT) * Math.min(1, sp / SPEED) * 0.9 : 0;
    A.legs[0].rotation.x = sw; A.legs[1].rotation.x = -sw;
    if (onGround) { A.arms[0].rotation.x = -sw; A.arms[1].rotation.x = sw; A.arms[0].rotation.z = A.arms[1].rotation.z = 0; }
    else { A.arms[0].rotation.x = A.arms[1].rotation.x = -2.6; A.legs[0].rotation.x = 0.4; A.legs[1].rotation.x = -0.2; }
    mesh.position.copy(pos);
    mesh.position.y += onGround && sp > 0.5 ? Math.abs(Math.sin(walkT)) * 0.04 : 0;
    mesh.rotation.y = yaw;
    if (onGround && sp > 3 && Math.random() < dt * 8) Particles.emit(pos.x, 0.05, pos.z, 1, '#cfc3a0', { speed: 0.3, up: 0.4, life: 0.4, size: 0.18, tint: false });
  }
  return { spawn, remove, update, jump, setObstacles, joy, get pos() { return pos; }, get active() { return active; } };
})();
