/**
 * Lightweight Web Audio engine.
 * - Synthesizes all SFX procedurally (no asset files needed -> tiny bundle).
 * - Plays a looping synthwave soundtrack (bass + arp + pad + drums).
 * Everything is created lazily after the first user gesture (browser policy).
 */

let ctx = null;
let masterGain = null;
let musicGain = null;
let sfxGain = null;
let started = false;
let musicTimer = null;

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.9;
  masterGain.connect(ctx.destination);

  musicGain = ctx.createGain();
  musicGain.gain.value = 0.32;
  musicGain.connect(masterGain);

  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.6;
  sfxGain.connect(masterGain);
  return ctx;
}

export function initAudio() {
  ensureCtx();
  if (ctx.state === "suspended") ctx.resume();
}

/* ----------------------------- SFX ----------------------------- */

function tone({ freq = 440, type = "sine", dur = 0.15, gain = 0.4, slideTo = null, delay = 0 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(sfxGain);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.3, gain = 0.5, lp = 2000, slideLp = null, delay = 0 }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.setValueAtTime(lp, t0);
  if (slideLp) filt.frequency.exponentialRampToValueAtTime(slideLp, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(sfxGain);
  src.start(t0);
  src.stop(t0 + dur);
}

const sfxThrottle = {};
export function playSfx(name) {
  if (!ctx) return;
  // throttle very rapid same-sound spam (perf)
  const now = performance.now();
  if (sfxThrottle[name] && now - sfxThrottle[name] < 30) return;
  sfxThrottle[name] = now;

  switch (name) {
    case "shot":
      // punchy layered pistol crack
      tone({ freq: 1100, type: "square", dur: 0.05, gain: 0.22, slideTo: 220 });
      tone({ freq: 320, type: "sawtooth", dur: 0.09, gain: 0.18, slideTo: 90 });
      noise({ dur: 0.07, gain: 0.32, lp: 5000, slideLp: 700 });
      break;
    case "footstep":
      noise({ dur: 0.05, gain: 0.08, lp: 1200 });
      tone({ freq: 90, type: "sine", dur: 0.05, gain: 0.06 });
      break;
    case "screech":
      noise({ dur: 0.4, gain: 0.18, lp: 3500, slideLp: 1500 });
      tone({ freq: 700, type: "sawtooth", dur: 0.4, gain: 0.08, slideTo: 500 });
      break;
    case "land":
      noise({ dur: 0.1, gain: 0.18, lp: 900 });
      tone({ freq: 120, type: "sine", dur: 0.1, gain: 0.14, slideTo: 60 });
      break;
    case "metal":
      tone({ freq: 1400, type: "square", dur: 0.04, gain: 0.1, slideTo: 600 });
      noise({ dur: 0.05, gain: 0.12, lp: 6000 });
      break;
    case "reload":
      tone({ freq: 320, type: "square", dur: 0.05, gain: 0.12, slideTo: 200 });
      noise({ dur: 0.06, gain: 0.1, lp: 2500, delay: 0.12 });
      tone({ freq: 480, type: "square", dur: 0.05, gain: 0.12, slideTo: 600, delay: 0.28 });
      break;
    case "pickup":
      tone({ freq: 520, type: "sine", dur: 0.1, gain: 0.2, slideTo: 880 });
      tone({ freq: 880, type: "sine", dur: 0.12, gain: 0.15, slideTo: 1320, delay: 0.08 });
      break;
    case "rocket":
      tone({ freq: 200, type: "sawtooth", dur: 0.5, gain: 0.3, slideTo: 60 });
      noise({ dur: 0.5, gain: 0.4, lp: 1200, slideLp: 200 });
      break;
    case "bow":
      tone({ freq: 600, type: "triangle", dur: 0.18, gain: 0.25, slideTo: 300 });
      break;
    case "empty":
      tone({ freq: 150, type: "square", dur: 0.05, gain: 0.15 });
      break;
    case "explosion":
      // deep thump + body + sizzle tail
      tone({ freq: 70, type: "sine", dur: 0.8, gain: 0.6, slideTo: 22 });
      tone({ freq: 130, type: "sawtooth", dur: 0.5, gain: 0.45, slideTo: 35 });
      noise({ dur: 0.9, gain: 0.7, lp: 2200, slideLp: 90 });
      noise({ dur: 0.5, gain: 0.25, lp: 6000, slideLp: 1500, delay: 0.05 });
      break;
    case "jump":
      tone({ freq: 300, type: "sine", dur: 0.15, gain: 0.2, slideTo: 600 });
      break;
    case "door":
      tone({ freq: 220, type: "square", dur: 0.08, gain: 0.2, slideTo: 110 });
      noise({ dur: 0.12, gain: 0.2, lp: 1500 });
      break;
    case "hijack":
      tone({ freq: 160, type: "sawtooth", dur: 0.25, gain: 0.3, slideTo: 400 });
      break;
    case "nos":
      noise({ dur: 0.4, gain: 0.3, lp: 6000, slideLp: 2000 });
      break;
    case "switch":
      tone({ freq: 500, type: "sine", dur: 0.07, gain: 0.18, slideTo: 800 });
      break;
    default:
      break;
  }
}

/* ------------------- Engine loop (driving) ------------------- */

let engine = null;
export function startEngine() {
  if (!ctx || engine) return;
  const osc = ctx.createOscillator();
  const sub = ctx.createOscillator();
  const g = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  osc.type = "sawtooth";
  sub.type = "square";
  osc.frequency.value = 70;
  sub.frequency.value = 35;
  filt.type = "lowpass";
  filt.frequency.value = 600;
  g.gain.value = 0.0;
  osc.connect(filt);
  sub.connect(filt);
  filt.connect(g);
  g.connect(sfxGain);
  osc.start();
  sub.start();
  engine = { osc, sub, g, filt };
}
export function setEngine(speedKmh, nos) {
  if (!engine || !ctx) return;
  const t = ctx.currentTime;
  const f = 60 + speedKmh * 2.4 + (nos ? 80 : 0);
  engine.osc.frequency.setTargetAtTime(f, t, 0.08);
  engine.sub.frequency.setTargetAtTime(f / 2, t, 0.08);
  engine.filt.frequency.setTargetAtTime(500 + speedKmh * 8, t, 0.1);
  engine.g.gain.setTargetAtTime(0.18 + (nos ? 0.12 : 0), t, 0.1);
}
export function stopEngine() {
  if (!engine || !ctx) return;
  const t = ctx.currentTime;
  engine.g.gain.setTargetAtTime(0.0001, t, 0.1);
  const e = engine;
  engine = null;
  setTimeout(() => {
    try {
      e.osc.stop();
      e.sub.stop();
    } catch (err) {
      /* noop */
    }
  }, 300);
}

/* --------------------- Synthwave music --------------------- */

const SCALE = [0, 3, 5, 7, 10]; // minor pentatonic
const ROOT = 55; // A1
function noteFreq(semi) {
  return ROOT * Math.pow(2, semi / 12);
}

function playMusicStep(step) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const bar = Math.floor(step / 8) % 4;
  // chord roots per bar (i - VI - III - VII vibe)
  const roots = [0, -4, 3, -2];
  const r = roots[bar];

  // Bass on every quarter
  if (step % 2 === 0) {
    const f = noteFreq(r + 12);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = f;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 400;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(filt);
    filt.connect(g);
    g.connect(musicGain);
    o.start(t);
    o.stop(t + 0.25);
  }

  // Arp / lead
  const semi = r + 24 + SCALE[(step * 2) % SCALE.length] + (step % 4 === 0 ? 12 : 0);
  const f = noteFreq(semi);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "square";
  o.frequency.value = f;
  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = 1800;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(filt);
  filt.connect(g);
  g.connect(musicGain);
  o.start(t);
  o.stop(t + 0.2);

  // Pad chord on bar change
  if (step % 8 === 0) {
    [0, 7, 12].forEach((iv) => {
      const po = ctx.createOscillator();
      const pg = ctx.createGain();
      po.type = "triangle";
      po.frequency.value = noteFreq(r + 12 + iv);
      pg.gain.setValueAtTime(0.0001, t);
      pg.gain.exponentialRampToValueAtTime(0.05, t + 0.3);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      po.connect(pg);
      pg.connect(musicGain);
      po.start(t);
      po.stop(t + 1.7);
    });
  }

  // Drums
  if (step % 4 === 0) {
    // kick
    const k = ctx.createOscillator();
    const kg = ctx.createGain();
    k.frequency.setValueAtTime(140, t);
    k.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    kg.gain.setValueAtTime(0.4, t);
    kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    k.connect(kg);
    kg.connect(musicGain);
    k.start(t);
    k.stop(t + 0.18);
  }
  if (step % 4 === 2) {
    // snare/hat noise
    noiseMusic(0.12, 0.12, 3000);
  } else {
    noiseMusic(0.04, 0.04, 7000);
  }
}

function noiseMusic(dur, gain, lp) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = "highpass";
  filt.frequency.value = lp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(musicGain);
  src.start(t);
  src.stop(t + dur);
}

export function startMusic() {
  ensureCtx();
  if (ctx.state === "suspended") ctx.resume();
  if (started) return;
  started = true;
  let step = 0;
  const bpm = 104;
  const interval = (60 / bpm / 2) * 1000; // eighth notes
  musicTimer = setInterval(() => {
    playMusicStep(step);
    step++;
  }, interval);
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  started = false;
}

export function setMusicVolume(v) {
  if (musicGain) musicGain.gain.value = v;
}
