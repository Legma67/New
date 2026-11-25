'use strict';
// ============================================================
//  Sound & Musik – komplett synthetisiert mit WebAudio
// ============================================================
const Audio2 = (() => {
  let ctx = null, master, sfxGain, musicGain, noiseBuf;
  let sfxVol = 0.7, musicVol = 0.45;
  let mood = 'menu', step = 0, nextTime = 0, timer = null;
  const lastPlay = {};

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = sfxVol; sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = musicVol * 0.5; musicGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    nextTime = ctx.currentTime + 0.1;
    timer = setInterval(schedule, 50);
  }

  function setVolumes(s, m) {
    sfxVol = s; musicVol = m;
    if (sfxGain) sfxGain.gain.value = s;
    if (musicGain) musicGain.gain.value = m * 0.5;
  }

  function tone(freq, dur, type = 'sine', vol = 0.3, slide = 0, when = 0, dest = sfxGain) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.3, filterFreq = 1200, type = 'lowpass', when = 0, dest = sfxGain, sweep = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(filterFreq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, filterFreq * sweep), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  // Throttle, damit viele gleichzeitige Schüsse nicht übersteuern
  function ok(name, gap) {
    const now = performance.now();
    if (lastPlay[name] && now - lastPlay[name] < gap) return false;
    lastPlay[name] = now; return true;
  }

  const SFX = {
    click() { tone(880, 0.06, 'square', 0.12); tone(1320, 0.05, 'square', 0.08, 0, 0.03); },
    place() { tone(220, 0.15, 'triangle', 0.35, 0.5); noise(0.12, 0.2, 800); tone(440, 0.1, 'sine', 0.15, 1, 0.06); },
    road() { noise(0.08, 0.18, 1800, 'bandpass'); tone(330, 0.06, 'triangle', 0.1); },
    sell() { tone(660, 0.08, 'square', 0.12); tone(990, 0.12, 'square', 0.12, 1, 0.07); },
    error() { tone(200, 0.15, 'sawtooth', 0.15); tone(150, 0.2, 'sawtooth', 0.15, 1, 0.1); },
    upgrade() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'triangle', 0.2, 1, i * 0.06)); },
    coin() { if (!ok('coin', 60)) return; tone(1500, 0.06, 'square', 0.06); tone(2000, 0.1, 'square', 0.06, 1, 0.04); },
    hit() { if (!ok('hit', 45)) return; noise(0.05, 0.08, 2500, 'highpass'); },
    death() { if (!ok('death', 50)) return; tone(400, 0.18, 'square', 0.1, 0.3); noise(0.12, 0.1, 1200); },
    explosion() { if (!ok('expl', 70)) return; noise(0.5, 0.45, 900, 'lowpass', 0, sfxGain, 0.15); tone(90, 0.4, 'sine', 0.4, 0.4); },
    shoot_cannon() { if (!ok('sc', 90)) return; noise(0.18, 0.25, 600, 'lowpass', 0, sfxGain, 0.3); tone(110, 0.15, 'sine', 0.25, 0.5); },
    shoot_arrow() { if (!ok('sa', 70)) return; noise(0.08, 0.1, 3000, 'bandpass', 0, sfxGain, 0.4); },
    shoot_laser() { if (!ok('sl', 160)) return; tone(1200, 0.12, 'sawtooth', 0.05, 0.6); },
    shoot_magic() { if (!ok('sm', 90)) return; tone(900, 0.2, 'sine', 0.12, 1.8); tone(1350, 0.15, 'sine', 0.08, 1.5, 0.03); },
    shoot_ice() { if (!ok('si', 90)) return; tone(1800, 0.12, 'triangle', 0.08, 0.7); noise(0.1, 0.06, 5000, 'highpass'); },
    shoot_fire() { if (!ok('sf', 120)) return; noise(0.25, 0.12, 700, 'bandpass'); },
    shoot_zap() { if (!ok('sz', 90)) return; tone(220, 0.12, 'sawtooth', 0.12, 4); noise(0.08, 0.1, 4000, 'highpass'); },
    shoot_gun() { if (!ok('sg', 55)) return; noise(0.04, 0.12, 2200, 'bandpass'); },
    shoot_rocket() { if (!ok('sr', 120)) return; noise(0.35, 0.15, 1500, 'bandpass', 0, sfxGain, 0.3); },
    shoot_water() { if (!ok('sw', 150)) return; noise(0.2, 0.1, 1200, 'bandpass', 0, sfxGain, 1.5); },
    shoot_sniper() { if (!ok('ss', 100)) return; noise(0.12, 0.3, 3000, 'lowpass', 0, sfxGain, 0.2); tone(180, 0.2, 'square', 0.1, 0.4); },
    shoot_shock() { if (!ok('sk', 120)) return; tone(80, 0.3, 'sawtooth', 0.15, 3); },
    waveStart() { [392, 392, 523].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.12, 1, i * 0.18)); tone(196, 0.8, 'triangle', 0.2, 1, 0.36); },
    waveClear() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.18, 'triangle', 0.18, 1, i * 0.08)); },
    boss() { tone(70, 1.4, 'sawtooth', 0.3, 0.6); tone(105, 1.4, 'sawtooth', 0.2, 0.6, 0.05); noise(1.2, 0.2, 400, 'lowpass', 0, sfxGain, 0.3); },
    levelup() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, 'square', 0.12, 1, i * 0.07)); },
    lifeLost() { if (!ok('ll', 150)) return; tone(300, 0.3, 'sawtooth', 0.15, 0.5); },
    gameover() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, 'triangle', 0.2, 1, i * 0.3)); },
    victory() { [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'square', 0.13, 1, i * 0.13)); },
    achievement() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.2, 'sine', 0.18, 1, i * 0.09)); },
    stomp() { tone(50, 0.6, 'sine', 0.5, 0.5); noise(0.4, 0.3, 300); },
  };
  function play(name) { if (!ctx || sfxVol <= 0) return; const f = SFX[name]; if (f) f(); }

  // ---------------- Musik-Sequenzer ----------------
  const N = n => 440 * Math.pow(2, (n - 69) / 12);
  const SONGS = {
    menu:    { bpm: 96,  chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], lead: [72, 74, 76, 79, 76, 74, 72, 67], drums: false, pad: 'triangle' },
    build:   { bpm: 84,  chords: [[62, 66, 69], [59, 62, 66], [55, 59, 62], [57, 61, 64]], lead: [74, 0, 78, 76, 0, 74, 71, 0], drums: false, pad: 'sine' },
    wave:    { bpm: 132, chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], lead: [69, 72, 76, 72, 74, 72, 69, 67], drums: true, pad: 'sawtooth' },
    boss:    { bpm: 150, chords: [[52, 55, 59], [53, 56, 60], [50, 53, 57], [51, 55, 58]], lead: [64, 67, 70, 67, 65, 64, 62, 63], drums: true, heavy: true, pad: 'sawtooth' },
    victory: { bpm: 120, chords: [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]], lead: [72, 76, 79, 84, 79, 76, 79, 84], drums: true, pad: 'square' },
  };
  function setMood(m) { if (mood !== m) { mood = m; step = 0; } }
  function schedule() {
    if (!ctx || musicVol <= 0.001) { if (ctx) nextTime = ctx.currentTime + 0.1; return; }
    const song = SONGS[mood] || SONGS.menu;
    const stepDur = 60 / song.bpm / 2; // Achtel
    while (nextTime < ctx.currentTime + 0.2) {
      const when = nextTime - ctx.currentTime;
      const bar = Math.floor(step / 8) % song.chords.length;
      const chord = song.chords[bar];
      const s8 = step % 8;
      if (s8 === 0) chord.forEach(n => tone(N(n), stepDur * 7.5, song.pad, 0.035, 0, when, musicGain));
      if (s8 % 2 === 0) tone(N(chord[0] - 12), stepDur * 1.6, 'triangle', 0.09, 0, when, musicGain);
      const ln = song.lead[step % song.lead.length];
      if (ln && (step % 16 < 8 || mood !== 'build')) tone(N(ln), stepDur * 0.9, 'square', 0.025, 0, when, musicGain);
      if (song.drums) {
        if (s8 % 4 === 0) { tone(110, 0.12, 'sine', 0.22, 0.4, when, musicGain); }
        if (s8 % 4 === 2) noise(0.08, 0.08, 3000, 'highpass', when, musicGain);
        if (song.heavy && s8 % 2 === 1) noise(0.03, 0.05, 6000, 'highpass', when, musicGain);
      } else if (s8 === 4) {
        noise(0.05, 0.02, 6000, 'highpass', when, musicGain);
      }
      nextTime += stepDur; step++;
    }
  }
  return { init, play, setMood, setVolumes, get ready() { return !!ctx; } };
})();
