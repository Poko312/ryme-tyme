/**
 * Synthesises the 8 placeholder beats in public/placeholder-beats/ (32 bars each, 4/4,
 * first downbeat at 0 s). They exist only so the app can be tested before real,
 * licensed beats are uploaded. Requires ffmpeg.
 *
 * Run: npx tsx scripts/generate-placeholder-beats.ts
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLACEHOLDER_BEATS } from "./generate-seed";

const SR = 44100;
const BARS = 32;
const STEPS = 16; // 16th notes per bar

// ---------------------------------------------------------------------------
// Tiny synth toolkit
// ---------------------------------------------------------------------------

let seed = 1;
function noise(): number {
  // deterministic so re-running produces identical files
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return (seed / 0xffffffff) * 2 - 1;
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class Track {
  readonly buf: Float32Array;
  constructor(readonly seconds: number) {
    this.buf = new Float32Array(Math.ceil(seconds * SR));
  }

  /** Render `fn(t)` for `dur` seconds starting at `at`, mixed in at `gain`. */
  add(at: number, dur: number, gain: number, fn: (t: number, i: number) => number) {
    const start = Math.round(at * SR);
    const len = Math.round(dur * SR);
    for (let i = 0; i < len; i++) {
      const j = start + i;
      if (j < 0 || j >= this.buf.length) continue;
      this.buf[j] += gain * fn(i / SR, i);
    }
  }
}

function kick(tr: Track, at: number, gain = 1, punch = 1) {
  let phase = 0;
  tr.add(at, 0.45, gain, (t) => {
    const f = 45 + 90 * punch * Math.exp(-t * 30);
    phase += (2 * Math.PI * f) / SR;
    const click = t < 0.004 ? noise() * 0.4 : 0;
    return (Math.sin(phase) + click) * Math.exp(-t * 7);
  });
}

function snare(tr: Track, at: number, gain = 1, tone = 185) {
  let last = 0;
  tr.add(at, 0.25, gain, (t) => {
    const n = noise();
    const hp = n - last; // crude high-pass
    last = n;
    return (hp * 0.6 * Math.exp(-t * 16)) + Math.sin(2 * Math.PI * tone * t) * 0.5 * Math.exp(-t * 25);
  });
}

function clap(tr: Track, at: number, gain = 1) {
  let last = 0;
  tr.add(at, 0.2, gain, (t) => {
    const n = noise();
    const hp = n - last;
    last = n;
    const bursts = t < 0.03 ? (Math.floor(t / 0.01) % 2 === 0 ? 1 : 0.3) : 1;
    return hp * bursts * Math.exp(-t * 18);
  });
}

function hat(tr: Track, at: number, gain = 1, open = false) {
  let last = 0;
  tr.add(at, open ? 0.3 : 0.06, gain, (t) => {
    const n = noise();
    const hp = n - last;
    last = n;
    return hp * Math.exp(-t * (open ? 12 : 70));
  });
}

function cymbal(tr: Track, at: number, gain = 1) {
  let last = 0;
  tr.add(at, 1.6, gain, (t) => {
    const n = noise();
    const hp = n - last;
    last = n;
    return hp * Math.exp(-t * 2.5);
  });
}

function bass808(tr: Track, at: number, dur: number, note: number, gain = 1) {
  const f = midi(note);
  tr.add(at, dur, gain, (t) => {
    const env = Math.min(1, t * 200) * Math.exp(-t * 1.6);
    return Math.tanh(Math.sin(2 * Math.PI * f * t) * 1.8) * env;
  });
}

function bassNote(tr: Track, at: number, dur: number, note: number, gain = 1) {
  const f = midi(note);
  tr.add(at, dur, gain, (t) => {
    const env = Math.min(1, t * 150) * Math.min(1, (dur - t) * 30);
    return (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * env;
  });
}

function pad(tr: Track, at: number, dur: number, notes: number[], gain = 1) {
  tr.add(at, dur, gain / notes.length, (t) => {
    const env = Math.min(1, t * 4) * Math.min(1, (dur - t) * 4);
    let s = 0;
    for (const n of notes) {
      const f = midi(n);
      s += Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 1.003 * t);
    }
    return s * env * 0.6;
  });
}

function stab(tr: Track, at: number, notes: number[], gain = 1) {
  tr.add(at, 0.35, gain / notes.length, (t) => {
    let s = 0;
    for (const n of notes) {
      const ph = (midi(n) * t) % 1;
      s += 2 * ph - 1; // saw
    }
    return s * Math.exp(-t * 9);
  });
}

function lead(tr: Track, at: number, dur: number, note: number, gain = 1) {
  // G-funk style sine whine with vibrato
  const f = midi(note);
  tr.add(at, dur, gain, (t) => {
    const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 5.5 * t);
    const env = Math.min(1, t * 10) * Math.min(1, (dur - t) * 10);
    return Math.sin(2 * Math.PI * f * vib * t) * env;
  });
}

function crackle(tr: Track, gain = 1) {
  tr.add(0, tr.seconds, gain, () => (Math.abs(noise()) > 0.9993 ? noise() : noise() * 0.02));
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

type Style = (tr: Track, bpm: number) => void;

const hits = (steps: number[], fn: (step: number) => void) => steps.forEach(fn);

/** Calls fn for every bar with the bar's start time and the time of a 16th step. */
function eachBar(bpm: number, fn: (bar: number, start: number, step: (s: number, swing?: number) => number) => void) {
  const barSec = (60 / bpm) * 4;
  const sixteenth = barSec / STEPS;
  for (let bar = 0; bar < BARS; bar++) {
    const start = bar * barSec;
    fn(bar, start, (s, swing = 0) => start + s * sixteenth + (s % 2 === 1 ? swing * sixteenth : 0));
  }
}

const CHORDS_MINOR = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
const ROOTS_MINOR = [45, 41, 36, 43];
const CHORDS_JAZZ = [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [45, 48, 52, 55]]; // Dm7 G7 Cmaj7 Am7
const ROOTS_JAZZ = [38, 43, 36, 33];

function phraseCymbal(tr: Track, bar: number, start: number, gain = 0.25) {
  // a crash at the top of every 4-bar phrase makes the default word rhythm audible
  if (bar % 4 === 0) cymbal(tr, start, gain);
}

const boomBap: Style = (tr, bpm) =>
  eachBar(bpm, (bar, start, at) => {
    const barSec = (60 / bpm) * 4;
    phraseCymbal(tr, bar, start);
    hits([0, 7, 10], (s) => kick(tr, at(s), 0.95));
    if (bar % 2 === 1) kick(tr, at(14), 0.6);
    hits([4, 12], (s) => snare(tr, at(s), 0.8));
    for (let s = 0; s < 16; s += 2) hat(tr, at(s, 0.33), s % 4 === 0 ? 0.35 : 0.22);
    bassNote(tr, start, barSec * 0.45, ROOTS_MINOR[bar % 4], 0.45);
    bassNote(tr, at(10), barSec * 0.3, ROOTS_MINOR[bar % 4] + 7, 0.35);
    pad(tr, start, barSec, CHORDS_MINOR[bar % 4], 0.12);
  });

const loFi: Style = (tr, bpm) => {
  crackle(tr, 0.6);
  eachBar(bpm, (bar, start, at) => {
    const barSec = (60 / bpm) * 4;
    phraseCymbal(tr, bar, start, 0.12);
    hits([0, 9], (s) => kick(tr, at(s, 0.4), 0.8, 0.7));
    hits([4, 12], (s) => snare(tr, at(s, 0.4), 0.55, 220));
    for (let s = 0; s < 16; s += 2) hat(tr, at(s, 0.4), 0.15);
    bassNote(tr, start, barSec * 0.9, ROOTS_JAZZ[bar % 4], 0.4);
    pad(tr, start, barSec, CHORDS_JAZZ[bar % 4], 0.22);
  });
};

const trap: Style = (tr, bpm) =>
  eachBar(bpm, (bar, start, at) => {
    const barSec = (60 / bpm) * 4;
    phraseCymbal(tr, bar, start, 0.2);
    hits([0, 7], (s) => kick(tr, at(s), 0.9));
    clap(tr, at(8), 0.7);
    bass808(tr, start, barSec * 0.45, ROOTS_MINOR[bar % 4] - 12, 0.7);
    bass808(tr, at(7), barSec * 0.4, ROOTS_MINOR[bar % 4] - 9, 0.55);
    for (let s = 0; s < 16; s += 2) hat(tr, at(s), 0.25);
    if (bar % 2 === 1) {
      // hi-hat roll into the next bar
      const roll = barSec / 32;
      for (let k = 0; k < 8; k++) hat(tr, at(12) + k * roll, 0.12 + k * 0.02);
    } else {
      for (let s = 1; s < 16; s += 4) hat(tr, at(s), 0.15);
    }
    pad(tr, start, barSec, CHORDS_MINOR[bar % 4].map((n) => n + 12), 0.07);
  });

const drill: Style = (tr, bpm) =>
  eachBar(bpm, (bar, start, at) => {
    const barSec = (60 / bpm) * 4;
    phraseCymbal(tr, bar, start, 0.18);
    hits([0, 10], (s) => kick(tr, at(s), 0.85));
    snare(tr, at(8), 0.75, 200);
    if (bar % 2 === 1) snare(tr, at(14), 0.5, 200);
    hits([0, 3, 6, 8, 11, 14], (s) => hat(tr, at(s), 0.22));
    bass808(tr, start, barSec * 0.35, ROOTS_MINOR[bar % 4] - 12, 0.7);
    bass808(tr, at(10), barSec * 0.3, ROOTS_MINOR[bar % 4] - 14, 0.6);
    pad(tr, start, barSec, [69, 72, 76].map((n) => n - (bar % 4 === 3 ? 2 : 0)), 0.06);
  });

const anthem: Style = (tr, bpm) =>
  eachBar(bpm, (bar, start, at) => {
    const barSec = (60 / bpm) * 4;
    phraseCymbal(tr, bar, start, 0.3);
    hits([0, 8, 10], (s) => kick(tr, at(s), 1));
    hits([4, 12], (s) => {
      snare(tr, at(s), 0.7);
      clap(tr, at(s), 0.5);
    });
    for (let s = 0; s < 16; s += 2) hat(tr, at(s), 0.25);
    hat(tr, at(14), 0.2, true);
    stab(tr, start, CHORDS_MINOR[bar % 4].map((n) => n + 12), 0.3);
    stab(tr, at(6), CHORDS_MINOR[bar % 4].map((n) => n + 12), 0.2);
    bassNote(tr, start, barSec * 0.7, ROOTS_MINOR[bar % 4], 0.45);
  });

const rnb: Style = (tr, bpm) =>
  eachBar(bpm, (bar, start, at) => {
    const barSec = (60 / bpm) * 4;
    phraseCymbal(tr, bar, start, 0.12);
    hits([0, 7, 10], (s) => kick(tr, at(s, 0.2), 0.75, 0.8));
    hits([4, 12], (s) => snare(tr, at(s, 0.2), 0.45, 260));
    for (let s = 0; s < 16; s++) hat(tr, at(s, 0.2), s % 2 === 0 ? 0.14 : 0.07);
    pad(tr, start, barSec, CHORDS_JAZZ[bar % 4].map((n) => n + 12), 0.25);
    bassNote(tr, start, barSec * 0.6, ROOTS_JAZZ[bar % 4], 0.45);
  });

const gFunk: Style = (tr, bpm) => {
  const melody = [76, 74, 72, 74];
  eachBar(bpm, (bar, start, at) => {
    const barSec = (60 / bpm) * 4;
    phraseCymbal(tr, bar, start, 0.2);
    hits([0, 6, 10], (s) => kick(tr, at(s, 0.25), 0.9));
    hits([4, 12], (s) => clap(tr, at(s, 0.25), 0.6));
    for (let s = 0; s < 16; s++) hat(tr, at(s, 0.25), s % 2 === 0 ? 0.2 : 0.1);
    const root = ROOTS_MINOR[bar % 4];
    hits([0, 3, 6, 10, 13], (s) => bassNote(tr, at(s, 0.25), barSec / 10, root + (s === 13 ? 12 : 0), 0.5));
    lead(tr, start, barSec * 0.9, melody[bar % 4], 0.12);
    pad(tr, start, barSec, CHORDS_MINOR[bar % 4], 0.1);
  });
};

const STYLES: Record<string, Style> = {
  "boom bap": boomBap,
  "lo-fi": loFi,
  trap,
  drill,
  "hip-hop": anthem,
  "r&b": rnb,
  "g-funk": gFunk,
};

// ---------------------------------------------------------------------------
// Render + encode
// ---------------------------------------------------------------------------

function toWav(samples: Float32Array): Buffer {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const scale = peak > 0 ? 0.89 / peak : 1;
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.tanh(s * scale * 1.1) * 32767 * 0.9), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const outDir = fileURLToPath(new URL("../public/placeholder-beats/", import.meta.url));
mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(path.join(tmpdir(), "beats-"));

try {
  for (const beat of PLACEHOLDER_BEATS) {
    const style = STYLES[beat.genre];
    if (!style) throw new Error(`No style for genre ${beat.genre}`);
    seed = 1;
    const seconds = (BARS * 4 * 60) / beat.bpm;
    const track = new Track(seconds);
    style(track, beat.bpm);

    const wav = path.join(tmp, `${beat.file}.wav`);
    writeFileSync(wav, toWav(track.buf));
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "96k", path.join(outDir, beat.file)]);
    console.log(`✓ ${beat.file} (${beat.bpm} BPM, ${seconds.toFixed(2)} s)`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
