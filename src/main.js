'use strict';
// ============================================================
//  Start & Render-Schleife
// ============================================================
(function boot() {
  const setLoad = (p, t) => { document.getElementById('loadfill').style.width = p + '%'; if (t) document.getElementById('loadtxt').textContent = t; };
  View.layout();
  setLoad(10, 'Lade Spielstand …');
  const P = Save.load();
  Audio2.setVolumes(P.settings.sfx, P.settings.music);
  setLoad(30, 'Baue 3D-Welt …');
  requestAnimationFrame(() => {
    try {
      World.init(document.getElementById('c'), P.settings.quality);
      Particles.enabled = P.settings.particles;
      Particles.setTint(EFFECTS.find(e => e.id === P.equipped.effect));
      World.buildEnvironment(BIOME_BY_ID[P.equipped.biome] || BIOMES[0], P.name);
      setLoad(60, 'Platziere Türme …');
      CamCtl.init(document.getElementById('c'), World.camera);
      Game.init();
      UI.hookGame(); UI.bindEvents();
      CamCtl.handlers.toolActive = () => !!Game.buildSel && UI.screen === 'game';
      CamCtl.handlers.hover = p => Game.hover(p);
      CamCtl.handlers.paintStart = p => Game.paintStart(p);
      CamCtl.handlers.paint = p => Game.paint(p);
      CamCtl.handlers.paintEnd = (p, tap) => Game.paintEnd(p, tap);
      CamCtl.handlers.paintCancel = () => {};
      CamCtl.handlers.tap = p => { if (UI.screen === 'game') Game.tap(p); };
      Player.setObstacles(() => Game.obstacles());
      Thumbs.warm(TOWERS.filter(t => P.unlocked.includes(t.id)).map(t => ['tower', t.id]));
      setLoad(90, 'Fast fertig …');
      UI.goMenu();
      if (!P.tutorialDone) UI.startGame('endless', P.equipped.biome);   // allererster Start: sofort ins Tutorial
      setLoad(100);
      setTimeout(() => document.getElementById('loading').classList.add('hidden'), 250);
    } catch (e) {
      console.error(e);
      setLoad(100, '❌ Fehler beim Start: ' + e.message + ' – WebGL wird benötigt.');
    }
  });

  // Audio darf erst nach einer Nutzer-Interaktion starten
  const unlock = () => { Audio2.init(); };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  View.onChange(() => World.renderer && World.resize());
  const persist = () => { if (Game.R && !Game.demo) Game.snapshotRun(); Save.save(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { persist(); if (Game.R && !Game.demo && !Game.R.over) Game.R.paused = true; } });
  window.addEventListener('pagehide', persist);
  setInterval(() => { if (Save.P) Save.save(); }, 15000);

  let last = performance.now(), hudT = 0, fpsT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!World.renderer) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const t = now / 1000;
    const R = Game.R;
    if (UI.screen === 'game' && R && !R.paused && !R.over) Player.update(dt, CamCtl.keys, CamCtl.yaw);
    CamCtl.update(dt);
    Game.update(dt, t);
    World.update(dt, t);
    UI.Tut.tick(t);
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.1; UI.hud(); }
    World.renderer.render(World.scene, World.camera);
  }
  requestAnimationFrame(frame);
})();
