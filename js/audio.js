// ════════════════════════════════════════════
//  AudioManager — Web Audio API synthesis
//  No external files required.
// ════════════════════════════════════════════

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambientNodes = [];
    this.enabled = true;
    this.ambientRunning = false;
  }

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
    } catch(e) {
      this.enabled = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ─── Ambient jungle loop ───────────────────
  startAmbient() {
    if (!this.enabled || this.ambientRunning) return;
    this.ambientRunning = true;
    this._scheduleAmbientLayer();
    this._scheduleCrickets();
    this._scheduleWind();
  }

  stopAmbient() {
    this.ambientRunning = false;
    this.ambientNodes.forEach(n => { try { n.stop(); } catch(_){} });
    this.ambientNodes = [];
  }

  _scheduleAmbientLayer() {
    if (!this.ambientRunning || !this.enabled) return;
    // Low rumble / distant thunder feel
    const buf = this._makeNoise(4.0, 'brown');
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;

    const g = this.ctx.createGain();
    g.gain.value = 0.07;

    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start();
    this.ambientNodes.push(src);
  }

  _scheduleCrickets() {
    if (!this.ambientRunning || !this.enabled) return;
    const chirpInterval = () => {
      if (!this.ambientRunning) return;
      const count = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        setTimeout(() => this._chirp(880 + Math.random()*440), i * (60 + Math.random()*80));
      }
      setTimeout(chirpInterval, 300 + Math.random() * 600);
    };
    chirpInterval();
  }

  _chirp(freq) {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    g.gain.setValueAtTime(0, this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.018, this.ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
    osc.connect(g); g.connect(this.master);
    osc.start(); osc.stop(this.ctx.currentTime + 0.1);
  }

  _scheduleWind() {
    if (!this.ambientRunning || !this.enabled) return;
    const buf = this._makeNoise(3.0, 'white');
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.3;

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain);

    const g = this.ctx.createGain();
    g.gain.value = 0.04;
    lfoGain.connect(g.gain);

    src.connect(filter); filter.connect(g); g.connect(this.master);
    lfo.start(); src.start();
    this.ambientNodes.push(src, lfo);
  }

  // ─── Weapon sounds ────────────────────────
  playShoot(type = 'm16') {
    if (!this.enabled || !this.ctx) return;
    if (type === 'm16') this._shootM16();
    else if (type === 'pistol') this._shootPistol();
    else if (type === 'grenade') this._explosion(1.0);
    else if (type === 'knife') this._knife();
  }

  _shootM16() {
    const t = this.ctx.currentTime;
    // Transient crack
    const buf = this._makeNoise(0.08, 'white');
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t);

    // Low boom
    const osc = this.ctx.createOscillator();
    const g2 = this.ctx.createGain();
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    g2.gain.setValueAtTime(0.5, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g2); g2.connect(this.master);
    osc.start(t); osc.stop(t + 0.15);
  }

  _shootPistol() {
    const t = this.ctx.currentTime;
    const buf = this._makeNoise(0.1, 'white');
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 0.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t);
    const osc = this.ctx.createOscillator();
    const g2 = this.ctx.createGain();
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.08);
    g2.gain.setValueAtTime(0.35, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(g2); g2.connect(this.master);
    osc.start(t); osc.stop(t + 0.12);
  }

  _explosion(volume = 1) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const buf = this._makeNoise(0.8, 'brown');
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(volume * 1.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t);
  }

  _knife() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.05);
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.08);
  }

  playReload() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const click = (offset, freq) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'square';
      g.gain.setValueAtTime(0.06, t + offset);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.04);
      osc.connect(g); g.connect(this.master);
      osc.start(t + offset); osc.stop(t + offset + 0.05);
    };
    click(0, 300); click(0.15, 250); click(0.3, 350);
  }

  playFootstep() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const buf = this._makeNoise(0.06, 'brown');
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12 + Math.random() * 0.04, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t);
  }

  playHurt() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.15);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.22);
  }

  playPickup() {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 0.08, 0.16].forEach((offset, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 600 + i * 200;
      g.gain.setValueAtTime(0.1, t + offset);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.1);
      osc.connect(g); g.connect(this.master);
      osc.start(t + offset); osc.stop(t + offset + 0.12);
    });
  }

  playExplosion() { this._explosion(1.0); }

  playLZ() {
    if (!this.enabled || !this.ctx) return;
    // Helicopter blades — rising whup sound
    const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80 + i * 2, t + i * 0.15);
      osc.frequency.linearRampToValueAtTime(120 + i * 2, t + i * 0.15 + 0.1);
      g.gain.setValueAtTime(0.06, t + i * 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.2);
      osc.connect(g); g.connect(this.master);
      osc.start(t + i * 0.15); osc.stop(t + i * 0.15 + 0.3);
    }
  }

  // ─── Helper ───────────────────────────────
  _makeNoise(duration, type = 'white') {
    const rate = this.ctx.sampleRate;
    const frames = Math.ceil(rate * duration);
    const buf = this.ctx.createBuffer(1, frames, rate);
    const data = buf.getChannelData(0);
    if (type === 'white') {
      for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    } else {
      // Brown noise (integrate white)
      let last = 0;
      for (let i = 0; i < frames; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        data[i] = last * 14;
      }
    }
    return buf;
  }
}
