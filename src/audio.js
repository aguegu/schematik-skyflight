// Sound, by Web Audio. The engine and the wind are made here, live, from the
// flight: the engine's note rises as the plane climbs and falls as it dives,
// a propeller's flutter on it; the wind is filtered noise that grows louder
// and brighter as the plane banks and moves. Two recorded sounds from Kenney's
// Starter Kit 3D Platformer (CC0, public/sounds/CREDITS.md): a ring passed,
// pitched up as the combo grows, and a falling sound for a ring missed (and,
// slower, the end of a run). The audio starts on
// the first flight (browsers allow sound only after a click or a key);
// M mutes it, remembered in the browser. Music: Purrple Cat's "Taking a Bath
// And Jumping Into Bed" (CC BY 4.0, credited in the help panel and
// public/sounds/CREDITS.md), looped, softer when not flying, dipped under a
// ring's chime.

const ENGINE_HZ = 72; // its note in level flight
const CLIMB_HZ = 26; // more at full climb, less at full dive
const BANK_HZ = 8; // a little more in a hard bank
const PROP_FLUTTER_HZ = 17; // the propeller's beat on the engine
const ENGINE_GAIN = 0.05;
const WIND_GAIN = 0.015; // level and still
const WIND_BANK_GAIN = 0.06; // more in a 90° bank
const WIND_HZ = 380; // its band in level flight
const WIND_BANK_HZ = 1400; // brighter in a hard bank
const VY_MAX = 12; // the flight model's vertical speed at full climb
const RAMP_S = 0.08; // how quickly the sound follows the plane
const FADE_S = 0.25; // in and out at start, pause and finish
const COMBO_STEP = 0.06; // each ring in a row pitches the chime up
const COMBO_TOP = 1.45;
const STORE = 'skyflight-sound';
const MUSIC_FLYING = 0.22;
const MUSIC_IDLE = 0.1; // the menu, a pause, the results
const MUSIC_DUCK = 0.6; // its share under a ring's chime
const DUCK_S = 0.35;

export class FlightAudio {
  constructor() {
    this.ctx = null; this.buffers = {};
    this.muted = false;
    try { this.muted = localStorage.getItem(STORE) === 'muted'; } catch { /* optional */ }
  }

  // made on the first flight: an AudioContext needs a click or a key first
  async start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = this.ctx = new AudioCtx();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);

    // the engine: a sawtooth and a triangle an octave up, softened, its loudness fluttered by the prop
    this.engine = ctx.createGain(); this.engine.gain.value = 0;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 900;
    this.saw = ctx.createOscillator(); this.saw.type = 'sawtooth'; this.saw.frequency.value = ENGINE_HZ;
    this.tri = ctx.createOscillator(); this.tri.type = 'triangle'; this.tri.frequency.value = ENGINE_HZ * 2;
    const flutter = ctx.createGain(); flutter.gain.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = PROP_FLUTTER_HZ;
    const depth = ctx.createGain(); depth.gain.value = 0.3;
    lfo.connect(depth).connect(flutter.gain);
    this.saw.connect(tone); this.tri.connect(tone);
    tone.connect(flutter).connect(this.engine).connect(this.master);

    // the wind: two seconds of noise, looped, through a band that moves
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.windSource = ctx.createBufferSource(); this.windSource.buffer = noise; this.windSource.loop = true;
    this.windBand = ctx.createBiquadFilter(); this.windBand.type = 'bandpass'; this.windBand.Q.value = 0.8;
    this.windBand.frequency.value = WIND_HZ;
    this.wind = ctx.createGain(); this.wind.gain.value = 0;
    this.windSource.connect(this.windBand).connect(this.wind).connect(this.master);

    for (const node of [this.saw, this.tri, lfo, this.windSource]) node.start();
    this.music = ctx.createGain(); this.music.gain.value = 0;
    this.music.connect(this.master);
    this.flyingMusic = false;
    await Promise.all(['coin', 'fall', 'music'].map(async (name) => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}sounds/${name}.ogg`);
        this.buffers[name] = await ctx.decodeAudioData(await response.arrayBuffer());
      } catch { /* the flight goes on without it */ }
    }));
    if (this.buffers.music) {
      const source = ctx.createBufferSource(); source.buffer = this.buffers.music; source.loop = true;
      source.connect(this.music); source.start();
    }
  }

  // each frame: the engine and the wind from the plane; silent unless flying
  update(game) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const flying = game.status === 'running';
    const climb = Math.max(-1, Math.min(1, game.vy / VY_MAX));
    const bank = Math.min(1, Math.abs(game.roll) / (Math.PI / 2));
    const hz = ENGINE_HZ + climb * CLIMB_HZ + bank * BANK_HZ;
    this.saw.frequency.setTargetAtTime(hz, t, RAMP_S);
    this.tri.frequency.setTargetAtTime(hz * 2, t, RAMP_S);
    this.engine.gain.setTargetAtTime(flying ? ENGINE_GAIN : 0, t, flying ? RAMP_S : FADE_S);
    this.windBand.frequency.setTargetAtTime(WIND_HZ + bank * WIND_BANK_HZ + Math.abs(game.vx) * 20, t, RAMP_S);
    this.wind.gain.setTargetAtTime(flying ? WIND_GAIN + bank * WIND_BANK_GAIN : 0, t, flying ? RAMP_S : FADE_S);
    if (flying !== this.flyingMusic || !this.musicSet) {
      this.music.gain.setTargetAtTime(flying ? MUSIC_FLYING : MUSIC_IDLE, t, FADE_S * 2);
      this.flyingMusic = flying; this.musicSet = true;
    }
  }

  // the music dips under a chime, then comes back
  duck() {
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setTargetAtTime(MUSIC_FLYING * MUSIC_DUCK, t, 0.03);
    this.music.gain.setTargetAtTime(MUSIC_FLYING, t + DUCK_S, 0.15);
  }

  play(name, rate = 1, gain = 0.6) {
    const buffer = this.buffers[name];
    if (!this.ctx || !buffer) return;
    const source = this.ctx.createBufferSource(); source.buffer = buffer; source.playbackRate.value = rate;
    const level = this.ctx.createGain(); level.gain.value = gain;
    source.connect(level).connect(this.master);
    source.start();
  }

  // a ring passed: higher with each in a row, a little higher and louder when perfect
  ring(combo, perfect) {
    const rate = Math.min(COMBO_TOP, 1 + COMBO_STEP * Math.max(0, combo - 1)) + (perfect ? 0.08 : 0);
    this.play('coin', rate, perfect ? 0.7 : 0.5);
    if (this.ctx) this.duck();
  }

  // a ring missed: the falling sound; the run's end: the same, slower and lower
  miss() { this.play('fall', 1.1, 0.45); }
  finish() { this.play('fall', 0.75, 0.6); }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem(STORE, this.muted ? 'muted' : 'on'); } catch { /* optional */ }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    return this.muted;
  }
}
