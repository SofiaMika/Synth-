import { AudioEngine } from './audio-engine.js';
import { DEFAULTS, KEYBOARD_NOTES, PRESETS } from './config.js';

function noteKey(event) {
  if (event.code.startsWith('Key')) return event.code.slice(3).toLowerCase();
  if (event.code.startsWith('Digit')) return event.code.slice(5);
  return event.key.toLowerCase();
}

class SynthApp {
  constructor() {
    this.audio = new AudioEngine();
    this.controls = [...document.querySelectorAll('input[type="range"], select')];
    this.noteButtons = [...document.querySelectorAll('.note')];
    this.activeSources = new Map();
    this.status = document.getElementById('status');
    this.bindEvents();
    this.controls.forEach((control) => this.updateControl(control));
  }

  bindEvents() {
    document.addEventListener('pointerdown', () => this.audio.start(), { once: true });

    for (const button of this.noteButtons) {
      button.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.pressNote(button, `pointer:${event.pointerId}`);
      });
      const release = (event) => this.releaseNote(button, `pointer:${event.pointerId}`);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    }

    document.addEventListener('keydown', (event) => {
      const target = event.target;
      if (event.altKey || event.ctrlKey || event.metaKey ||
          (target instanceof Element && target.isContentEditable)) return;
      const key = noteKey(event);
      const binding = KEYBOARD_NOTES[key];
      if (!binding) return;
      event.preventDefault();
      const button = this.getNoteButton(...binding);
      if (button) this.pressNote(button, `key:${key}`);
    });
    document.addEventListener('keyup', (event) => {
      const key = noteKey(event);
      const binding = KEYBOARD_NOTES[key];
      if (!binding) return;
      const button = this.getNoteButton(...binding);
      if (button) this.releaseNote(button, `key:${key}`);
    });

    for (const control of this.controls) {
      control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'input', () => {
        this.updateControl(control);
        this.clearPreset();
      });
    }
    this.bindKnobs();
    for (const button of document.querySelectorAll('[data-preset]')) {
      button.addEventListener('click', () => this.applyPreset(button.dataset.preset));
    }
    document.getElementById('octave-up').addEventListener('click', () => this.changeOctave(1));
    document.getElementById('octave-down').addEventListener('click', () => this.changeOctave(-1));
    document.getElementById('mute-all').addEventListener('click', () => this.muteAll());
    document.getElementById('reset').addEventListener('click', () => this.reset());
    window.addEventListener('blur', () => this.releaseAllNotes());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAllNotes();
    });
  }

  bindKnobs() {
    for (const knob of document.querySelectorAll('.knob')) {
      const input = knob.querySelector('input');
      let drag = null;
      const pointerAngle = (event) => {
        const rect = knob.getBoundingClientRect();
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        if (Math.hypot(x, y) < rect.width * 0.15) return null;
        return Math.atan2(y, x) * 180 / Math.PI;
      };

      knob.addEventListener('pointerdown', (event) => {
        if (drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
        event.preventDefault();
        input.focus({ preventScroll: true });
        drag = {
          id: event.pointerId,
          angle: pointerAngle(event),
          x: event.clientX,
          y: event.clientY,
          value: Number(input.value),
        };
        knob.classList.add('is-dragging');
        knob.setPointerCapture(event.pointerId);
      });

      knob.addEventListener('pointermove', (event) => {
        if (!drag || drag.id !== event.pointerId) return;
        const angle = pointerAngle(event);
        const min = Number(input.min);
        const max = Number(input.max);
        let change = ((event.clientX - drag.x) - (event.clientY - drag.y)) * (max - min) / 180;
        if (angle !== null && drag.angle !== null) {
          let difference = angle - drag.angle;
          if (difference > 180) difference -= 360;
          if (difference < -180) difference += 360;
          if (Math.abs(difference) >= 0.5 && Math.abs(difference) <= 120) {
            change = difference * (max - min) / 270;
          }
        }
        drag.value = Math.max(min, Math.min(max, drag.value + change));
        const nextValue = String(Math.round(drag.value));
        if (input.value !== nextValue) {
          input.value = nextValue;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        drag.angle = angle;
        drag.x = event.clientX;
        drag.y = event.clientY;
      });

      const finishDrag = (event) => {
        if (drag?.id !== event.pointerId) return;
        drag = null;
        knob.classList.remove('is-dragging');
      };
      knob.addEventListener('pointerup', finishDrag);
      knob.addEventListener('pointercancel', finishDrag);
      knob.addEventListener('lostpointercapture', finishDrag);
    }
  }

  getNoteButton(synth, note) {
    return this.noteButtons.find((button) => button.dataset.synth === synth && button.dataset.note === note);
  }

  pressNote(button, source) {
    const { synth, note } = button.dataset;
    const key = `${synth}:${note}`;
    const sources = this.activeSources.get(key) || new Set();
    if (sources.has(source)) return;
    if (sources.size === 0) this.audio.playNote(synth, note);
    sources.add(source);
    this.activeSources.set(key, sources);
    button.classList.add('active');
    button.setAttribute('aria-pressed', 'true');
    this.status.textContent = `${this.activeSources.size} нот звучит`;
  }

  releaseNote(button, source) {
    const { synth, note } = button.dataset;
    const key = `${synth}:${note}`;
    const sources = this.activeSources.get(key);
    if (!sources) return;
    sources.delete(source);
    if (sources.size > 0) return;
    this.activeSources.delete(key);
    this.audio.stopNote(synth, note);
    button.classList.remove('active');
    button.setAttribute('aria-pressed', 'false');
    this.status.textContent = this.activeSources.size ? `${this.activeSources.size} нот звучит` : 'Синтезатор готов';
  }

  releaseAllNotes() {
    this.activeSources.clear();
    this.audio.stopAllNotes();
    for (const button of this.noteButtons) {
      button.classList.remove('active');
      button.setAttribute('aria-pressed', 'false');
    }
  }

  updateControl(control) {
    const value = Number(control.value);
    if (control.type === 'range') {
      const percent = (value - Number(control.min)) / (Number(control.max) - Number(control.min)) * 100;
      control.style.setProperty('--percent', `${percent}%`);
      control.title = `${value}${control.id.includes('detune') ? ' ct' : control.id.includes('pan') ? '' : '%'}`;
      const knob = control.closest('.knob');
      if (knob) knob.style.setProperty('--angle', `${-135 + percent * 2.7}deg`);
    }
    this.audio.setControl(control.id, control.value);
  }

  setControl(id, value) {
    const control = document.getElementById(id);
    control.value = value;
    this.updateControl(control);
  }

  clearPreset() {
    for (const button of document.querySelectorAll('[data-preset]')) button.setAttribute('aria-pressed', 'false');
  }

  applyPreset(name) {
    for (const [id, value] of Object.entries(PRESETS[name])) this.setControl(id, value);
    this.clearPreset();
    document.querySelector(`[data-preset="${name}"]`).setAttribute('aria-pressed', 'true');
    this.status.textContent = `Пресет ${name} включён`;
  }

  changeOctave(direction) {
    const octave = this.audio.shiftOctave(direction);
    document.getElementById('octave-value').textContent = octave > 0 ? `+${octave}` : octave;
    this.status.textContent = `Октава ${octave}`;
  }

  muteAll() {
    this.releaseAllNotes();
    this.setControl('master-volume', 0);
    this.audio.mute();
    this.status.textContent = 'Звук выключен';
  }

  reset() {
    this.releaseAllNotes();
    for (const [id, value] of Object.entries(DEFAULTS)) this.setControl(id, value);
    this.audio.shiftOctave(-this.audio.octave);
    document.getElementById('octave-value').textContent = '0';
    this.clearPreset();
    this.status.textContent = 'Настройки сброшены';
  }
}

new SynthApp();
