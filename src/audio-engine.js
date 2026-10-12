import { DEFAULTS, NOTE_FREQUENCIES } from './config.js';
export class AudioEngine {
  constructor() {
    this.context = null;
    this.settings = { ...DEFAULTS };
    this.channels = {};
    this.notes = new Map();
    this.octave = 0;
    this.drumTimer = null;
    this.drumStep = 0;
  }

  start() {
    if (!this.context) {
      this.context = new AudioContext();
      this.createGraph();
      for (const [id, value] of Object.entries(this.settings)) this.setControl(id, value);
    }
    if (this.context.state === 'suspended') this.context.resume().catch(console.error);
  }

  createGraph() {
    const audio = this.context;
    this.master = audio.createGain();
    this.master.connect(audio.destination);

    this.filter = audio.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.distortion = audio.createWaveShaper();
    this.distortion.oversample = '2x';
    this.clean = audio.createGain();
    this.distorted = audio.createGain();
    this.effectsOut = audio.createGain();
    this.inputGain = audio.createGain();
    this.delay = audio.createDelay(1);
    this.delay.delayTime.value = 0.28;
    this.feedback = audio.createGain();
    this.delayWet = audio.createGain();

    this.filter.connect(this.clean).connect(this.effectsOut);
    this.filter.connect(this.distortion).connect(this.distorted).connect(this.effectsOut);
    this.effectsOut.connect(this.inputGain);
    this.inputGain.connect(this.master);
    this.inputGain.connect(this.delay);
    this.delay.connect(this.delayWet).connect(this.master);
    this.delay.connect(this.feedback).connect(this.delay);

    for (const name of ['surface', 'deep']) {
      const volume = audio.createGain();
      const pan = audio.createStereoPanner();
      volume.connect(pan).connect(this.filter);
      this.channels[name] = { volume, pan };
    }
  }

  playNote(name, note) {
    this.start();
    const key = `${name}:${note}`;
    if (this.notes.has(key)) return;

    const audio = this.context;
    const oscillator = audio.createOscillator();
    const envelope = audio.createGain();
    oscillator.type = this.settings[`${name}-wave`];
    oscillator.frequency.value = NOTE_FREQUENCIES[note] * 2 ** this.octave;
    oscillator.detune.value = Number(this.settings[`${name}-detune`]);
    envelope.gain.setValueAtTime(0, audio.currentTime);
    envelope.gain.linearRampToValueAtTime(0.16, audio.currentTime + 0.02);
    oscillator.connect(envelope).connect(this.channels[name].volume);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start();
    this.notes.set(key, { oscillator, envelope, name, note });
  }

  stopNote(name, note) {
    const key = `${name}:${note}`;
    const voice = this.notes.get(key);
    if (!voice) return;
    this.notes.delete(key);
    const now = this.context.currentTime;
    voice.envelope.gain.cancelScheduledValues(now);
    voice.envelope.gain.setTargetAtTime(0, now, 0.035);
    voice.oscillator.stop(now + 0.18);
  }

  stopAllNotes() {
    for (const { name, note } of [...this.notes.values()]) this.stopNote(name, note);
  }

  setControl(id, rawValue) {
    this.settings[id] = rawValue;
    if (!this.context) return;

    const value = Number(rawValue);
    const now = this.context.currentTime;
    if (id.startsWith('surface-') || id.startsWith('deep-')) {
      const [name, setting] = id.split('-');
      const channel = this.channels[name];
      if (setting === 'volume') channel.volume.gain.setTargetAtTime(value / 100, now, 0.01);
      if (setting === 'pan') channel.pan.pan.setTargetAtTime(value / 100, now, 0.01);
      for (const voice of this.notes.values()) {
        if (voice.name !== name) continue;
        if (setting === 'wave') voice.oscillator.type = rawValue;
        if (setting === 'detune') voice.oscillator.detune.value = value;
      }
      return;
    }

    switch (id) {
      case 'filter':
        this.filter.frequency.setTargetAtTime(180 * (12000 / 180) ** (value / 100), now, 0.02);
        break;
      case 'delay':
        this.delayWet.gain.setTargetAtTime(value / 100 * 0.55, now, 0.02);
        this.feedback.gain.setTargetAtTime(value / 100 * 0.48, now, 0.02);
        break;
      case 'distortion':
        this.distortion.curve = this.makeDistortionCurve(value);
        this.clean.gain.setTargetAtTime(1 - value / 100 * 0.75, now, 0.02);
        this.distorted.gain.setTargetAtTime(value / 100 * 0.7, now, 0.02);
        break;
      case 'gain':
        this.inputGain.gain.setTargetAtTime(value / 100, now, 0.02);
        break;
      case 'drums':
        this.updateDrums();
        break;
      case 'master-volume':
        this.master.gain.setTargetAtTime(value / 100, now, 0.01);
        break;
    }
  }

  makeDistortionCurve(amount) {
    const curve = new Float32Array(1024);
    const strength = 1 + amount * 0.4;
    for (let i = 0; i < curve.length; i++) {
      const x = i * 2 / (curve.length - 1) - 1;
      curve[i] = Math.tanh(strength * x) / Math.tanh(strength);
    }
    return curve;
  }

  shiftOctave(direction) {
    this.octave = Math.max(-2, Math.min(2, this.octave + direction));
    if (this.context) {
      for (const voice of this.notes.values()) {
        voice.oscillator.frequency.setTargetAtTime(
          NOTE_FREQUENCIES[voice.note] * 2 ** this.octave,
          this.context.currentTime, 0.02,
        );
      }
    }
    return this.octave;
  }

  mute() {
    if (this.context) this.master.gain.setValueAtTime(0, this.context.currentTime);
    this.stopAllNotes();
  }

  updateDrums() {
    clearInterval(this.drumTimer);
    this.drumTimer = null;
    const speed = Number(this.settings.drums);
    if (!this.context || speed === 0) return;
    const beat = () => {
      if (this.context.state !== 'running') return;
      if (this.drumStep % 2 === 0) this.playKick();
      this.playHat();
      this.drumStep++;
    };
    beat();
    this.drumTimer = setInterval(beat, 1000 - speed * 8);
  }

  playKick() {
    const audio = this.context;
    const now = audio.currentTime;
    const oscillator = audio.createOscillator();
    const level = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(140, now);
    oscillator.frequency.exponentialRampToValueAtTime(45, now + 0.15);
    level.gain.setValueAtTime(0.28, now);
    level.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    oscillator.connect(level).connect(this.inputGain);
    oscillator.onended = () => { oscillator.disconnect(); level.disconnect(); };
    oscillator.start(now);
    oscillator.stop(now + 0.2);
  }

  playHat() {
    const audio = this.context;
    const now = audio.currentTime;
    const length = Math.floor(audio.sampleRate * 0.045);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
    const noise = audio.createBufferSource();
    const highpass = audio.createBiquadFilter();
    const level = audio.createGain();
    noise.buffer = buffer;
    highpass.type = 'highpass';
    highpass.frequency.value = 5000;
    level.gain.setValueAtTime(0.055, now);
    level.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    noise.connect(highpass).connect(level).connect(this.inputGain);
    noise.onended = () => { noise.disconnect(); highpass.disconnect(); level.disconnect(); };
    noise.start(now);
  }
}
