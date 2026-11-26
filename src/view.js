'use strict';
// ============================================================
//  Immer Querformat: hält man das Gerät hochkant, wird das
//  ganze Spiel um 90° gedreht – ohne Hinweis-Meldung.
// ============================================================
const View = (() => {
  let w = innerWidth, h = innerHeight, portrait = false;
  const listeners = [];
  function layout() {
    const W = window.innerWidth, H = window.innerHeight;
    portrait = H > W;
    w = portrait ? H : W; h = portrait ? W : H;   // logische (Querformat-)Größe
    const root = document.getElementById('root');
    if (root) { root.style.width = w + 'px'; root.style.height = h + 'px'; }
    document.body.classList.toggle('portrait', portrait);
    listeners.forEach(f => f());
  }
  // Bildschirmkoordinaten -> Spielkoordinaten (berücksichtigt die Drehung)
  function toLocal(cx, cy) { return portrait ? { x: cy, y: window.innerWidth - cx } : { x: cx, y: cy }; }
  // Auf Android: Vollbild + Querformat sperren (wo der Browser es erlaubt)
  let tried = false;
  function tryLock() {
    if (tried || !matchMedia('(pointer:coarse)').matches) return; tried = true;
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    try {
      const p = req && req.call(el, { navigationUI: 'hide' });
      if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    } catch (e) {}
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 150));
  window.addEventListener('pointerdown', tryLock, { once: false, passive: true });
  return { layout, toLocal, onChange: f => listeners.push(f), get w() { return w; }, get h() { return h; }, get portrait() { return portrait; } };
})();
