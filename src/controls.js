'use strict';
// ============================================================
//  Kamera-Steuerung (Maus, Touch, Tastatur) + Bodenpicking
// ============================================================
const CamCtl = (() => {
  const target = new THREE.Vector3(0, 0, 0);
  let yaw = 0, pitch = 0.95, dist = 22;
  let tYaw = yaw, tPitch = pitch, tDist = dist; const tTarget = target.clone();
  let el, cam, auto = false, autoT = 0;
  let mode = 'free';                 // 'follow' = Kamera folgt der Spielfigur (wie Roblox), 'free' = Übersicht
  let follow = null;                 // () => Vector3
  const pointers = new Map();
  let dragMode = null, last = null, pinch = null, moved = 0, downPos = null;
  const handlers = { tap: null, hover: null, paint: null, paintEnd: null, toolActive: () => false };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const keys = new Set();

  function init(canvas, camera) {
    el = canvas; cam = camera;
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.12 : 0.89); }, { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; keys.add(e.key.toLowerCase()); });
    window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => keys.clear());
  }
  function zoom(f) { tDist = THREE.MathUtils.clamp(tDist * f, mode === 'follow' ? 3.5 : 6, 42); }
  function rotate(a) { tYaw += a; }
  function reset() {
    if (mode === 'follow') { tPitch = 0.5; tDist = 9; }
    else { tYaw = 0; tPitch = 0.95; tDist = View.w < 900 ? 20 : 22; tTarget.set(0, 0, 0.6); }
  }
  function setMode(m, followFn) { mode = m; if (followFn) follow = followFn; reset(); }
  function setAuto(v) { auto = v; if (!v) reset(); }

  function groundAt(cx, cy) {
    ndc.set(cx / View.w * 2 - 1, -(cy / View.h) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
  }

  function pan(dx, dy) {
    const s = tDist * 0.0016;
    const sy = Math.sin(tYaw), cy = Math.cos(tYaw);
    // rechts = (cos, 0, -sin), Blickrichtung = -(sin, 0, cos)
    tTarget.x += (-dx * cy - dy * sy) * s;
    tTarget.z += (dx * sy - dy * cy) * s;
    clampTarget();
  }
  function clampTarget() { tTarget.x = THREE.MathUtils.clamp(tTarget.x, -GW / 2 - 4, GW / 2 + 4); tTarget.z = THREE.MathUtils.clamp(tTarget.z, -GH / 2 - 4, GH / 2 + 4); }

  // Ereignis mit Spielkoordinaten (bei gedrehter Ansicht umgerechnet)
  const L = e => { const p = View.toLocal(e.clientX, e.clientY); return { pointerId: e.pointerId, pointerType: e.pointerType, button: e.button, target: e.target, clientX: p.x, clientY: p.y }; };
  function onDown(ev) {
    const e = L(ev);
    if (auto) return;
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType, button: e.button });
    moved = 0; downPos = { x: e.clientX, y: e.clientY, button: e.button };
    if (pointers.size === 1) {
      const tool = handlers.toolActive();
      const freeDrag = mode === 'follow' ? 'rotate' : 'pan';
      if (e.pointerType === 'mouse') dragMode = e.button === 2 || e.button === 1 ? 'rotate' : (tool ? 'paint' : freeDrag);
      else dragMode = tool ? 'paint' : freeDrag;
      last = { x: e.clientX, y: e.clientY };
      if (dragMode === 'paint') { const p = groundAt(e.clientX, e.clientY); handlers.hover && handlers.hover(p); handlers.paintStart && handlers.paintStart(p, e.pointerType); }
    } else if (pointers.size === 2) {
      if (dragMode === 'paint') handlers.paintCancel && handlers.paintCancel();
      dragMode = 'pinch';
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    }
  }
  function onMove(ev) {
    const e = L(ev);
    if (auto) return;
    const p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse' && e.target === el && handlers.hover) handlers.hover(groundAt(e.clientX, e.clientY));
      return;
    }
    p.x = e.clientX; p.y = e.clientY;
    if (downPos) moved = Math.max(moved, Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y));
    if (dragMode === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      if (pinch.d > 0) zoom(pinch.d / d);
      let da = ang - pinch.ang; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
      tYaw -= da;
      if (mode !== 'follow') pan(cx - pinch.cx, cy - pinch.cy);
      pinch = { d, ang, cx, cy };
      return;
    }
    if (!last) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y; last = { x: e.clientX, y: e.clientY };
    if (dragMode === 'rotate') { tYaw -= dx * 0.008; tPitch = THREE.MathUtils.clamp(tPitch + dy * 0.006, mode === 'follow' ? 0.12 : 0.35, 1.45); }
    else if (dragMode === 'pan') pan(dx, dy);
    else if (dragMode === 'paint') { const g = groundAt(e.clientX, e.clientY); handlers.hover && handlers.hover(g); handlers.paint && handlers.paint(g); }
  }
  function onUp(ev) {
    const e = L(ev);
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      const wasTap = moved < 10 && dragMode !== 'pinch' && !(downPos && downPos.button === 2);
      if (dragMode === 'paint') handlers.paintEnd && handlers.paintEnd(groundAt(e.clientX, e.clientY), wasTap);
      else if (wasTap && handlers.tap) handlers.tap(groundAt(e.clientX, e.clientY), e.pointerType);
      dragMode = null; last = null; pinch = null;
    } else if (pointers.size === 1) {
      const r = [...pointers.values()][0]; last = { x: r.x, y: r.y }; dragMode = mode === 'follow' ? 'rotate' : 'pan';
    }
  }

  function update(dt) {
    if (auto) {
      autoT += dt * 0.08;
      tYaw = autoT; tPitch = 0.78 + Math.sin(autoT * 1.7) * 0.12; tDist = 21 + Math.sin(autoT * 1.3) * 3; tTarget.set(0, 0, 0);
    } else {
      const k = 6 * dt;
      // WASD steuert die Spielfigur (siehe Player); hier nur Kamera drehen & zoomen
      if (mode === 'follow' && follow) { const f = follow(); tTarget.set(f.x, f.y + 0.9, f.z); }
      if (keys.has('q')) tYaw += 1.6 * dt;
      if (keys.has('e')) tYaw -= 1.6 * dt;
      if (keys.has('+') || keys.has('=')) zoom(1 - dt);
      if (keys.has('-')) zoom(1 + dt);
    }
    const s = Math.min(1, 8 * dt);
    yaw += (tYaw - yaw) * s; pitch += (tPitch - pitch) * s; dist += (tDist - dist) * s;
    if (mode === 'follow' && !auto) target.lerp(tTarget, Math.min(1, 14 * dt)); else target.lerp(tTarget, s);
    const y = Math.max(0.6, target.y + Math.sin(pitch) * dist);
    cam.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, y, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    cam.lookAt(target);
  }
  return { init, update, zoom, rotate, reset, setAuto, setMode, groundAt, handlers, get yaw() { return yaw; }, get mode() { return mode; }, keys };
})();
