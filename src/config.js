export const NOTE_FREQUENCIES = {
  C: 261.63, D: 293.66, E: 329.63, F: 349.23,
  G: 392.00, A: 440.00, B: 493.88,
};

export const KEYBOARD_NOTES = {
  q: ['surface', 'C'], w: ['surface', 'D'], e: ['surface', 'E'],
  r: ['surface', 'F'], t: ['surface', 'G'], y: ['surface', 'A'], u: ['surface', 'B'],
  1: ['deep', 'C'], 2: ['deep', 'D'], 3: ['deep', 'E'], 4: ['deep', 'F'],
  5: ['deep', 'G'], 6: ['deep', 'A'], 7: ['deep', 'B'],
};

export const DEFAULTS = {
  'surface-volume': 60, 'surface-detune': 0, 'surface-pan': 0, 'surface-wave': 'sine',
  'deep-volume': 75, 'deep-detune': 0, 'deep-pan': 0, 'deep-wave': 'sine',
  filter: 65, delay: 75, distortion: 45, gain: 75, drums: 0, 'master-volume': 75,
};

export const PRESETS = {
  space: { 'surface-wave': 'sine', 'deep-wave': 'sine', filter: 40, delay: 85, distortion: 10, gain: 40 },
  '8bit': { 'surface-wave': 'square', 'deep-wave': 'sine', filter: 80, delay: 10, distortion: 0, gain: 30 },
  drive: { 'surface-wave': 'sawtooth', 'deep-wave': 'sawtooth', filter: 100, delay: 20, distortion: 90, gain: 80 },
};
