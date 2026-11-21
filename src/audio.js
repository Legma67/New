// Synthetisierte Soundeffekte und prozedurale Musik (Web Audio API)
const last = {};
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

const TRACKS = {
  menu:  { bpm: 92,  chords: [[60, 'M'], [57, 'm'], [53, 'M'], [55, 'M']], arp: 'sine', bass: 'triangle', drums: 0, pad: 0.05, arpVol: 0.06 },
  build: { bpm: 84,  chords: [[53, 'M'], [60, 'M'], [62, 'm'], [58, 'M']], arp: 'triangle', bass: 'sine', drums: 0, pad: 0.05, arpVol: 0.045 },
  wave:  { bpm: 128, chords: [[57, 'm'], [53, 'M'], [60, 'M'], [55, 'M']], arp: 'square', bass: 'sawtooth', drums: 1, pad: 0.03, arpVol: 0.03 },
  boss:  { bpm: 150, chords: [[50, 'm'], [58, 'M'], [55, 'm'], [57, 'M']], arp: 'sawtooth', bass: 'sawtooth', drums: 2, pad: 0.04, arpVol: 0.03 },
};

export const Sound = {
  ctx: null, master: null, sfxGain: null, musicGain: null, noiseBuf: null,
  musicVol: 0.5, sfxVol: 0.7, track: null, step: 0, nextTime: 0, timer: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    const comp = this.ctx.createDynamicsCompressor(); comp.connect(this.master);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(comp);
    this.musicGain = this.ctx.createGain(); this.musicGain.connect(comp);
    this.setVolumes(this.musicVol, this.sfxVol);
    const len = this.ctx.sampleRate * 1;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.timer = setInterval(() => this.schedule(), 25);
    if (this.pending) { const p = this.pending; this.pending = null; this.setTrack(p); }
  },
  setVolumes(m, s) {
    this.musicVol = m; this.sfxVol = s;
    if (this.musicGain) { this.musicGain.gain.value = m * 0.6; this.sfxGain.gain.value = s; }
  },
  tone(freq, dur, type = 'sine', vol = 0.1, slide = 0, delay = 0, dest = null) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxGain); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol = 0.1, freq = 1000, ftype = 'lowpass', slide = 0, delay = 0, dest = null) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfxGain); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },
  play(name) {
    if (!this.ctx || this.sfxVol <= 0) return;
    const now = performance.now();
    const gap = { hit: 45, shoot_laser: 120, shoot_gun: 50, shoot_arrow: 50, death: 40, coin: 60, zap: 60, fire: 150 }[name] ?? 30;
    if (last[name] && now - last[name] < gap) return;
    last[name] = now;
    switch (name) {
      case 'click': this.tone(880, 0.06, 'square', 0.05, 1200); break;
      case 'hover': this.tone(1400, 0.03, 'sine', 0.02); break;
      case 'place': this.noise(0.15, 0.25, 700); this.tone(200, 0.18, 'sine', 0.2, 80); break;
      case 'road': this.noise(0.08, 0.15, 1200, 'bandpass'); this.tone(320, 0.08, 'triangle', 0.06, 200); break;
      case 'sell': this.tone(990, 0.08, 'triangle', 0.1); this.tone(660, 0.12, 'triangle', 0.1, 0, 0.08); break;
      case 'upgrade': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, 'square', 0.05, 0, i * 0.05)); break;
      case 'coin': this.tone(1320, 0.05, 'square', 0.04); this.tone(1760, 0.09, 'square', 0.04, 0, 0.05); break;
      case 'error': this.tone(180, 0.18, 'square', 0.08, 120); break;
      case 'shoot_cannon': this.noise(0.25, 0.3, 500, 'lowpass', 80); this.tone(140, 0.2, 'sine', 0.25, 45); break;
      case 'shoot_arrow': this.noise(0.08, 0.12, 2500, 'highpass'); break;
      case 'shoot_gun': this.noise(0.05, 0.12, 1800, 'bandpass'); break;
      case 'shoot_laser': this.tone(1600, 0.08, 'sawtooth', 0.025, 900); break;
      case 'shoot_magic': this.tone(500, 0.18, 'sine', 0.08, 1400); this.tone(750, 0.18, 'triangle', 0.04, 1800); break;
      case 'shoot_rocket': this.noise(0.45, 0.15, 600, 'bandpass', 2500); break;
      case 'shoot_ice': this.tone(2200, 0.1, 'sine', 0.05, 1200); this.noise(0.1, 0.05, 4000, 'highpass'); break;
      case 'shoot_sniper': this.noise(0.18, 0.3, 3000, 'bandpass', 300); this.tone(900, 0.1, 'square', 0.06, 200); break;
      case 'water': this.noise(0.15, 0.1, 900, 'bandpass', 400); break;
      case 'zap': this.tone(200 + Math.random() * 400, 0.12, 'square', 0.05, 1800); this.noise(0.1, 0.08, 3000, 'highpass'); break;
      case 'fire': this.noise(0.35, 0.12, 900, 'lowpass', 300); break;
      case 'pulse': this.tone(300, 0.3, 'sine', 0.15, 60); this.noise(0.2, 0.08, 800); break;
      case 'hole': this.tone(60, 0.8, 'sawtooth', 0.12, 30); this.tone(120, 0.8, 'sine', 0.1, 400); break;
      case 'hit': this.tone(280, 0.04, 'triangle', 0.04, 180); break;
      case 'death': this.tone(520, 0.14, 'triangle', 0.07, 120); break;
      case 'explosion': this.noise(0.6, 0.45, 600, 'lowpass', 60); this.tone(90, 0.4, 'sine', 0.3, 30); break;
      case 'mine': this.tone(700, 0.05, 'square', 0.04); break;
      case 'wave_start': [220, 277, 330].forEach((f) => this.tone(f, 0.7, 'sawtooth', 0.05)); this.tone(440, 0.5, 'square', 0.04, 0, 0.15); break;
      case 'wave_clear': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.09, 0, i * 0.08)); break;
      case 'boss': this.tone(90, 1.4, 'sawtooth', 0.2, 35); this.noise(1.2, 0.2, 300, 'lowpass', 60); this.tone(45, 1.5, 'square', 0.1, 30, 0.2); break;
      case 'levelup': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'square', 0.06, 0, i * 0.07)); this.tone(2093, 0.6, 'sine', 0.05, 0, 0.4); break;
      case 'lose': this.tone(392, 0.4, 'triangle', 0.12, 0); this.tone(330, 0.4, 'triangle', 0.12, 0, 0.35); this.tone(262, 0.9, 'triangle', 0.12, 200, 0.7); break;
      case 'victory': [523, 523, 523, 659, 784, 659, 784, 1046].forEach((f, i) => this.tone(f, i === 7 ? 0.8 : 0.18, 'square', 0.07, 0, i * 0.15)); break;
      case 'life': this.tone(1200, 0.25, 'sine', 0.1, 1600); break;
      case 'leak': this.tone(160, 0.3, 'square', 0.1, 80); break;
      case 'freeze': this.noise(0.4, 0.15, 5000, 'highpass', 1500); this.tone(1800, 0.4, 'sine', 0.06, 600); break;
      case 'stomp': this.noise(0.5, 0.4, 200, 'lowpass', 40); this.tone(55, 0.5, 'sine', 0.35, 25); break;
      case 'achievement': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.08, 0, i * 0.09)); break;
    }
  },
  // ------- Musik
  setTrack(name) {
    if (!this.ctx) { this.pending = name; return; }
    if (this.track === name) return;
    this.track = name; this.step = 0; this.nextTime = this.ctx.currentTime + 0.05;
  },
  schedule() {
    if (!this.ctx || !this.track || this.musicVol <= 0) return;
    const T = TRACKS[this.track]; if (!T) return;
    const stepDur = 60 / T.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(T, this.step, this.nextTime - this.ctx.currentTime, stepDur);
      this.step++; this.nextTime += stepDur;
    }
  },
  playStep(T, step, delay, sd) {
    const bar = Math.floor(step / 16) % T.chords.length, s = step % 16;
    const [root, q] = T.chords[bar];
    const tones = [root, root + (q === 'm' ? 3 : 4), root + 7, root + 12];
    const mg = this.musicGain;
    if (s === 0 && T.pad) tones.slice(0, 3).forEach((m) => this.tone(midi(m - 12), sd * 16, 'triangle', T.pad, 0, delay, mg));
    if (s % 2 === 0) {
      const pat = [0, 1, 2, 3, 2, 1, 2, 3];
      this.tone(midi(tones[pat[(s / 2) % 8]] + 12), sd * 1.8, T.arp, T.arpVol, 0, delay, mg);
    }
    const bassSteps = T.drums ? [0, 3, 6, 8, 11, 14] : [0, 8];
    if (bassSteps.includes(s)) this.tone(midi(root - 24), sd * (T.drums ? 2 : 6), T.bass, T.drums ? 0.09 : 0.08, 0, delay, mg);
    if (T.drums) {
      const kicks = T.drums === 2 ? [0, 4, 8, 10, 12] : [0, 8];
      if (kicks.includes(s)) this.tone(150, 0.18, 'sine', 0.35, 40, delay, mg);
      if (s === 4 || s === 12) this.noise(0.15, 0.12, 1800, 'bandpass', 0, delay, mg);
      if (s % 2 === 0) this.noise(0.04, 0.04, 7000, 'highpass', 0, delay, mg);
    }
  },
};
