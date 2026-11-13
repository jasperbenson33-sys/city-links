'use client';

import type { SoundEventPayload, SoundEventType } from '@/types';

export type CurbsideSoundId = SoundEventType | 'swing_tick';

export interface PlaySoundOptions {
  intensity?: number;
  /** 0-based sunk flag order (0..4) for ascending per-flag cup chimes */
  flagIndex?: number;
}

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let isUnlocked = false;
let unlockListenersAttached = false;
let mutedState = false;

// Throttle rapid repetitive triggers so drags and curb/gutter rolls stay musical
let lastSwingTickMs = 0;
let lastCurbClackMs = 0;
let lastGutterBankMs = 0;
let lastPigeonMs = 0;
let lastHapticMs = 0;

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || (window as WebkitWindow).webkitAudioContext || null;
}

function ensureAudioGraph(): {
  ctx: AudioContext;
  out: AudioNode;
  noise: AudioBuffer;
} | null {
  const Ctor = getAudioContextConstructor();
  if (!Ctor) return null;

  if (!audioCtx) {
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }

  if (!compressor || !masterGain) {
    compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-14, audioCtx.currentTime);
    compressor.knee.setValueAtTime(18, audioCtx.currentTime);
    compressor.ratio.setValueAtTime(4, audioCtx.currentTime);
    compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
    compressor.release.setValueAtTime(0.16, audioCtx.currentTime);

    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(mutedState ? 0 : 0.72, audioCtx.currentTime);

    compressor.connect(masterGain);
    masterGain.connect(audioCtx.destination);
  }

  if (!noiseBuffer) {
    const durationSec = 1.6;
    const length = Math.floor(audioCtx.sampleRate * durationSec);
    noiseBuffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    // Warm pink-tinted noise so filtered whooshes feel cozy and never harsh
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      const pink = (b0 + b1 + b2 + white * 0.1848) * 0.22;
      data[i] = clamp(pink, -1, 1);
    }
  }

  return { ctx: audioCtx, out: compressor, noise: noiseBuffer };
}

/**
 * Sets global mute state cleanly without coupling directly to React/Zustand internals.
 */
export function setSoundMuted(muted: boolean): void {
  mutedState = muted;
  if (audioCtx && masterGain) {
    const now = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setTargetAtTime(muted ? 0 : 0.72, now, 0.015);
  }
}

export function isSoundMuted(): boolean {
  return mutedState;
}

/**
 * Unlocks / resumes Web Audio on iOS Safari & Chrome autoplay policies.
 */
export function unlockAudioEngine(): void {
  if (typeof window === 'undefined') return;
  const graph = ensureAudioGraph();
  if (!graph) return;

  const { ctx } = graph;
  if (ctx.state === 'suspended' && typeof document !== 'undefined' && !document.hidden) {
    void ctx.resume().catch(() => {});
  }

  if (!isUnlocked) {
    try {
      const silent = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = silent;
      src.connect(ctx.destination);
      src.start(0);
      isUnlocked = true;
    } catch {
      // Ignore if context is still initializing
    }
  }
}

/**
 * Attaches passive capture-phase window listeners to unlock Web Audio on first interaction
 * and auto-suspend whenever the tab/app is backgrounded (`document.hidden`).
 */
export function initSoundEngine(): () => void {
  if (typeof window === 'undefined' || unlockListenersAttached) {
    return () => {};
  }

  unlockListenersAttached = true;

  const handleFirstGesture = () => {
    unlockAudioEngine();
    if (audioCtx && audioCtx.state === 'running') {
      removeGestureListeners();
    }
  };

  const handleVisibilityChange = () => {
    if (!audioCtx) return;
    if (document.hidden) {
      if (audioCtx.state === 'running') {
        void audioCtx.suspend().catch(() => {});
      }
    } else if (!mutedState && isUnlocked && audioCtx.state === 'suspended') {
      void audioCtx.resume().catch(() => {});
    }
  };

  const removeGestureListeners = () => {
    window.removeEventListener('pointerdown', handleFirstGesture, true);
    window.removeEventListener('touchstart', handleFirstGesture, true);
    window.removeEventListener('keydown', handleFirstGesture, true);
  };

  const removeListeners = () => {
    removeGestureListeners();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    unlockListenersAttached = false;
  };

  window.addEventListener('pointerdown', handleFirstGesture, {
    capture: true,
    passive: true,
  });
  window.addEventListener('touchstart', handleFirstGesture, {
    capture: true,
    passive: true,
  });
  window.addEventListener('keydown', handleFirstGesture, {
    capture: true,
    passive: true,
  });
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return removeListeners;
}

function triggerHaptic(pattern: number | number[], minGapMs = 18): void {
  if (mutedState) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return;
  }
  const now = performance.now();
  if (now - lastHapticMs < minGapMs) return;
  lastHapticMs = now;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Ignore unsupported / restricted vibration environments
  }
}

function scheduleTone(
  ctx: AudioContext,
  dest: AudioNode,
  opts: {
    type: OscillatorType;
    startTime: number;
    duration: number;
    startFreq: number;
    midFreq?: { freq: number; atOffset: number };
    endFreq?: number;
    peakGain: number;
    attack?: number;
    lowpassHz?: number;
  }
): void {
  const {
    type,
    startTime,
    duration,
    startFreq,
    midFreq,
    endFreq,
    peakGain,
    attack = 0.004,
    lowpassHz,
  } = opts;

  if (peakGain <= 0.0002) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;

  osc.frequency.setValueAtTime(Math.max(24, startFreq), startTime);
  if (midFreq) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(24, midFreq.freq),
      startTime + clamp(midFreq.atOffset, 0.005, duration - 0.005)
    );
  }
  if (endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(24, endFreq),
      startTime + duration
    );
  }

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(
    peakGain,
    startTime + Math.min(attack, duration * 0.45)
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  if (lowpassHz) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(lowpassHz, startTime);
    osc.connect(filter);
    filter.connect(gain);
    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  } else {
    osc.connect(gain);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  gain.connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.015);
}

function scheduleFilteredNoise(
  ctx: AudioContext,
  dest: AudioNode,
  noise: AudioBuffer,
  opts: {
    startTime: number;
    duration: number;
    filterType: BiquadFilterType;
    startFreq: number;
    midFreq?: { freq: number; atOffset: number };
    endFreq?: number;
    q?: number;
    peakGain: number;
    attack?: number;
  }
): void {
  const {
    startTime,
    duration,
    filterType,
    startFreq,
    midFreq,
    endFreq,
    q = 1.4,
    peakGain,
    attack = 0.015,
  } = opts;

  if (peakGain <= 0.0002) return;

  const src = ctx.createBufferSource();
  src.buffer = noise;
  const maxOffset = Math.max(0, noise.duration - duration - 0.05);
  const offset = maxOffset > 0 ? Math.random() * maxOffset : 0;

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.Q.setValueAtTime(q, startTime);
  filter.frequency.setValueAtTime(Math.max(40, startFreq), startTime);

  if (midFreq) {
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(40, midFreq.freq),
      startTime + clamp(midFreq.atOffset, 0.008, duration - 0.008)
    );
  }
  if (endFreq !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(40, endFreq),
      startTime + duration
    );
  }

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(
    peakGain,
    startTime + Math.min(attack, duration * 0.5)
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  src.onended = () => {
    src.disconnect();
    filter.disconnect();
    gain.disconnect();
  };

  src.start(startTime, offset, duration + 0.02);
}

function scheduleBrassVendorBell(
  ctx: AudioContext,
  dest: AudioNode,
  startTime: number,
  duration: number,
  gainScale: number
): void {
  const partials: Array<{
    ratio: number;
    amp: number;
    decayMult: number;
    type: OscillatorType;
  }> = [
    { ratio: 1.0, amp: 0.24, decayMult: 1.0, type: 'sine' },
    { ratio: 2.0, amp: 0.11, decayMult: 0.72, type: 'sine' },
    { ratio: 2.756, amp: 0.075, decayMult: 0.52, type: 'triangle' },
    { ratio: 4.08, amp: 0.045, decayMult: 0.34, type: 'sine' },
  ];

  for (const p of partials) {
    scheduleTone(ctx, dest, {
      type: p.type,
      startTime,
      duration: duration * p.decayMult,
      startFreq: 1760 * p.ratio,
      peakGain: p.amp * gainScale,
      attack: 0.002,
    });
  }
}

/**
 * Plays an ascending per-flag toybox marimba/celesta chime (flagIndex 0..4).
 */
function playFlagChime(ctx: AudioContext, out: AudioNode, flagIndex = 0): void {
  const t = ctx.currentTime + 0.003;
  const order = clamp(Math.round(flagIndex), 0, 4);
  // Ascending C-major pentatonic pitch steps for flags 1..5: C, D, E, G, A
  const transposeFactors = [1.0, 1.12246, 1.25992, 1.49831, 1.68179];
  const factor = transposeFactors[order] ?? 1.0;

  triggerHaptic([16, 40, 12]);

  const baseNotes = [523.25, 659.25, 783.99];
  baseNotes.forEach((hz, idx) => {
    const noteStart = t + idx * 0.068;
    const isTop = idx === baseNotes.length - 1;
    scheduleTone(ctx, out, {
      type: 'sine',
      startTime: noteStart,
      duration: isTop ? 0.58 : 0.28,
      startFreq: hz * factor,
      peakGain: isTop ? 0.25 : 0.19,
      attack: 0.003,
    });
    scheduleTone(ctx, out, {
      type: 'triangle',
      startTime: noteStart,
      duration: isTop ? 0.3 : 0.16,
      startFreq: hz * factor * 2,
      peakGain: 0.055,
      attack: 0.002,
      lowpassHz: 4600,
    });
  });
}

/**
 * Plays the celebratory 5th-flag completion fanfare cascade.
 */
function playRoundFanfare(ctx: AudioContext, out: AudioNode): void {
  const t = ctx.currentTime + 0.003;
  triggerHaptic([20, 45, 16, 45, 24]);

  const fanfareNotes = [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.51];
  fanfareNotes.forEach((hz, idx) => {
    const noteStart = t + idx * 0.072;
    const isCrown = idx === fanfareNotes.length - 1;
    const dur = isCrown ? 0.98 : 0.38;

    scheduleTone(ctx, out, {
      type: 'triangle',
      startTime: noteStart,
      duration: dur,
      startFreq: hz,
      peakGain: isCrown ? 0.24 : 0.17,
      attack: 0.004,
      lowpassHz: 4400,
    });
    scheduleTone(ctx, out, {
      type: 'sine',
      startTime: noteStart,
      duration: dur * 0.85,
      startFreq: hz * 2,
      peakGain: isCrown ? 0.09 : 0.05,
      attack: 0.003,
    });
  });

  // Warm sunlit C4 + G4 foundation bloom on final chord
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: t + 5 * 0.072,
    duration: 1.05,
    startFreq: 261.63,
    peakGain: 0.16,
    attack: 0.025,
  });
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: t + 5 * 0.072,
    duration: 0.96,
    startFreq: 392.0,
    peakGain: 0.12,
    attack: 0.025,
  });
}

/**
 * Synthesizes warm, tactile toybox sound effects & gentle micro-haptics.
 */
export function playToySound(
  sound: CurbsideSoundId,
  rawIntensityOrOpts: number | PlaySoundOptions = 1.0
): void {
  if (typeof window === 'undefined') return;
  if (typeof document !== 'undefined' && document.hidden) return;
  if (mutedState) return;

  const opts: PlaySoundOptions =
    typeof rawIntensityOrOpts === 'number'
      ? { intensity: rawIntensityOrOpts }
      : rawIntensityOrOpts;
  const rawIntensity = opts.intensity ?? 1.0;
  const intensity = clamp(rawIntensity, 0.12, 1.25);
  const nowMs = performance.now();

  if (sound === 'swing_tick') {
    if (nowMs - lastSwingTickMs < 24) return;
    lastSwingTickMs = nowMs;
  } else if (sound === 'curb_clack') {
    if (nowMs - lastCurbClackMs < 32) return;
    lastCurbClackMs = nowMs;
  } else if (sound === 'gutter_bank') {
    if (nowMs - lastGutterBankMs < 120) return;
    lastGutterBankMs = nowMs;
  } else if (sound === 'pigeon_flutter') {
    if (nowMs - lastPigeonMs < 140) return;
    lastPigeonMs = nowMs;
  }

  const graph = ensureAudioGraph();
  if (!graph) return;

  const { ctx, out, noise } = graph;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const t = ctx.currentTime + 0.003;

  switch (sound) {
    case 'swing_tick': {
      triggerHaptic(5, 36);
      const norm = clamp(rawIntensity, 0, 1);
      const baseHz = 370 + norm * 340;
      scheduleTone(ctx, out, {
        type: 'triangle',
        startTime: t,
        duration: 0.038,
        startFreq: baseHz * 1.08,
        endFreq: baseHz * 0.92,
        peakGain: 0.11 + norm * 0.09,
        attack: 0.002,
        lowpassHz: 2400,
      });
      scheduleTone(ctx, out, {
        type: 'sine',
        startTime: t,
        duration: 0.016,
        startFreq: baseHz * 3.92,
        peakGain: 0.035 + norm * 0.03,
        attack: 0.001,
      });
      break;
    }

    case 'hit_driver': {
      // Deep punchy titanium-wood pop + warm airy sky-whoosh
      triggerHaptic(18);
      scheduleTone(ctx, out, {
        type: 'sine',
        startTime: t,
        duration: 0.095,
        startFreq: 275 + intensity * 45,
        endFreq: 74,
        peakGain: 0.42 * intensity,
        attack: 0.002,
      });
      scheduleTone(ctx, out, {
        type: 'triangle',
        startTime: t,
        duration: 0.036,
        startFreq: 1120,
        endFreq: 310,
        peakGain: 0.24 * intensity,
        attack: 0.001,
        lowpassHz: 3200,
      });
      scheduleTone(ctx, out, {
        type: 'sine',
        startTime: t,
        duration: 0.048,
        startFreq: 1920,
        endFreq: 1760,
        peakGain: 0.08 * intensity,
        attack: 0.001,
      });
      scheduleFilteredNoise(ctx, out, noise, {
        startTime: t + 0.012,
        duration: 0.27,
        filterType: 'bandpass',
        startFreq: 340,
        midFreq: { freq: 1480, atOffset: 0.085 },
        endFreq: 520,
        q: 1.7,
        peakGain: 0.28 * intensity,
        attack: 0.035,
      });
      break;
    }

    case 'hit_wedge': {
      // Crisp lofted wedge nip + soft spin whisk
      triggerHaptic(11);
      scheduleTone(ctx, out, {
        type: 'sine',
        startTime: t,
        duration: 0.054,
        startFreq: 445,
        endFreq: 185,
        peakGain: 0.3 * intensity,
        attack: 0.0015,
      });
      scheduleTone(ctx, out, {
        type: 'triangle',
        startTime: t,
        duration: 0.028,
        startFreq: 1960,
        endFreq: 1280,
        peakGain: 0.2 * intensity,
        attack: 0.001,
        lowpassHz: 4000,
      });
      scheduleTone(ctx, out, {
        type: 'sine',
        startTime: t,
        duration: 0.024,
        startFreq: 3480,
        endFreq: 2960,
        peakGain: 0.085 * intensity,
        attack: 0.001,
      });
      scheduleFilteredNoise(ctx, out, noise, {
        startTime: t + 0.008,
        duration: 0.155,
        filterType: 'bandpass',
        startFreq: 1650,
        midFreq: { freq: 3900, atOffset: 0.065 },
        endFreq: 2400,
        q: 2.3,
        peakGain: 0.18 * intensity,
        attack: 0.018,
      });
      scheduleTone(ctx, out, {
        type: 'sine',
        startTime: t + 0.015,
        duration: 0.125,
        startFreq: 1560,
        endFreq: 2120,
        peakGain: 0.048 * intensity,
        attack: 0.015,
      });
      break;
    }

    case 'hit_skimmer': {
      // Crisp forged-iron low-punch tap + street skim zip
      triggerHaptic(14);
      scheduleTone(ctx, out, {
        type: 'sine',
        startTime: t,
        duration: 0.068,
        startFreq: 355 + intensity * 35,
        endFreq: 128,
        peakGain: 0.34 * intensity,
        attack: 0.0015,
      });
      scheduleTone(ctx, out, {
        type: 'triangle',
        startTime: t,
        duration: 0.036,
        startFreq: 1520,
        endFreq: 890,
        peakGain: 0.23 * intensity,
        attack: 0.001,
        lowpassHz: 3600,
      });
      scheduleTone(ctx, out, {
        type: 'sine',
        startTime: t + 0.001,
        duration: 0.052,
        startFreq: 2780,
        endFreq: 2440,
        peakGain: 0.1 * intensity,
        attack: 0.001,
      });
      scheduleFilteredNoise(ctx, out, noise, {
        startTime: t + 0.003,
        duration: 0.095,
        filterType: 'bandpass',
        startFreq: 2250,
        endFreq: 1120,
        q: 1.85,
        peakGain: 0.21 * intensity,
        attack: 0.006,
      });
      break;
    }

    case 'hit_putter': {
      // Clean, warm wooden mallet tap
      triggerHaptic(9);
      scheduleTone(ctx, out, {
        type: 'sine',
        startTime: t,
        duration: 0.062,
        startFreq: 430,
        endFreq: 215,
        peakGain: 0.3 * intensity,
        attack: 0.002,
      });
      scheduleTone(ctx, out, {
        type: 'triangle',
        startTime: t,
        duration: 0.024,
        startFreq: 1140,
        endFreq: 640,
        peakGain: 0.14 * intensity,
        attack: 0.001,
        lowpassHz: 2100,
      });
      break;
    }

    case 'curb_clack': {
      // Crisp concrete curb / edge clack
      triggerHaptic(7, 32);
      scheduleTone(ctx, out, {
        type: 'triangle',
        startTime: t,
        duration: 0.04,
        startFreq: 540,
        endFreq: 235,
        peakGain: 0.22 * intensity,
        attack: 0.002,
        lowpassHz: 2200,
      });
      scheduleTone(ctx, out, {
        type: 'sine',
        startTime: t,
        duration: 0.016,
        startFreq: 1380,
        endFreq: 620,
        peakGain: 0.09 * intensity,
        attack: 0.001,
      });
      break;
    }

    case 'gutter_bank': {
      // Resonant storm-drain gutter ceramic bank hum
      triggerHaptic([8, 20, 8]);
      const chordHz = [261.63, 392.0, 587.33, 659.25];
      chordHz.forEach((hz, idx) => {
        scheduleTone(ctx, out, {
          type: idx % 2 === 0 ? 'sine' : 'triangle',
          startTime: t + idx * 0.022,
          duration: 0.4,
          startFreq: hz * 0.992,
          midFreq: { freq: hz * 1.008, atOffset: 0.18 },
          endFreq: hz,
          peakGain: (0.11 - idx * 0.015) * intensity,
          attack: 0.045,
          lowpassHz: 1800,
        });
      });
      scheduleFilteredNoise(ctx, out, noise, {
        startTime: t,
        duration: 0.34,
        filterType: 'bandpass',
        startFreq: 620,
        endFreq: 860,
        q: 4.5,
        peakGain: 0.14 * intensity,
        attack: 0.04,
      });
      break;
    }

    case 'umbrella_boing': {
      // Trampoline boing + brass vendor bell ding-ding!
      triggerHaptic([16, 45, 10, 55, 10]);

      const boingDur = 0.38;
      const oscSine = ctx.createOscillator();
      const oscTri = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      oscSine.type = 'sine';
      oscTri.type = 'triangle';
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1650, t);
      filter.Q.setValueAtTime(3.2, t);

      for (const osc of [oscSine, oscTri]) {
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(440, t + 0.085);
        osc.frequency.exponentialRampToValueAtTime(290, t + 0.21);
        osc.frequency.exponentialRampToValueAtTime(332, t + 0.29);
        osc.frequency.exponentialRampToValueAtTime(290, t + boingDur);
      }

      const triMix = ctx.createGain();
      triMix.gain.setValueAtTime(0.42, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.36 * intensity, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + boingDur);

      oscSine.connect(filter);
      oscTri.connect(triMix);
      triMix.connect(filter);
      filter.connect(gain);
      gain.connect(out);

      oscSine.onended = () => {
        oscSine.disconnect();
        oscTri.disconnect();
        triMix.disconnect();
        filter.disconnect();
        gain.disconnect();
      };

      oscSine.start(t);
      oscTri.start(t);
      oscSine.stop(t + boingDur + 0.02);
      oscTri.stop(t + boingDur + 0.02);

      scheduleBrassVendorBell(ctx, out, t + 0.09, 0.36, intensity * 0.92);
      scheduleBrassVendorBell(ctx, out, t + 0.21, 0.54, intensity * 1.05);
      break;
    }

    case 'hydrant_whoosh': {
      // Fizzy fire hydrant water whoosh + ascending bubble blips
      triggerHaptic([10, 25, 12]);
      scheduleFilteredNoise(ctx, out, noise, {
        startTime: t,
        duration: 0.4,
        filterType: 'bandpass',
        startFreq: 520,
        midFreq: { freq: 2250, atOffset: 0.14 },
        endFreq: 1080,
        q: 2.1,
        peakGain: 0.27 * intensity,
        attack: 0.03,
      });

      const bubbleStarts = [520, 650, 790, 960, 1140];
      bubbleStarts.forEach((hz, idx) => {
        scheduleTone(ctx, out, {
          type: 'sine',
          startTime: t + 0.025 + idx * 0.048,
          duration: 0.068,
          startFreq: hz,
          endFreq: hz * 1.62,
          peakGain: 0.13 * intensity,
          attack: 0.004,
        });
      });
      break;
    }

    case 'steam_hiss': {
      // Subway steam hiss + airy flute updraft chime
      triggerHaptic([12, 30, 16]);
      scheduleFilteredNoise(ctx, out, noise, {
        startTime: t,
        duration: 0.075,
        filterType: 'lowpass',
        startFreq: 520,
        endFreq: 320,
        q: 1.2,
        peakGain: 0.25 * intensity,
        attack: 0.008,
      });
      scheduleFilteredNoise(ctx, out, noise, {
        startTime: t + 0.065,
        duration: 0.38,
        filterType: 'bandpass',
        startFreq: 380,
        midFreq: { freq: 1380, atOffset: 0.14 },
        endFreq: 620,
        q: 1.6,
        peakGain: 0.26 * intensity,
        attack: 0.045,
      });
      const fluteNotes = [698.46, 880.0, 1046.5];
      fluteNotes.forEach((hz, idx) => {
        scheduleTone(ctx, out, {
          type: 'sine',
          startTime: t + 0.06 + idx * 0.065,
          duration: 0.26,
          startFreq: hz * 0.985,
          endFreq: hz * 1.01,
          peakGain: 0.11 * intensity,
          attack: 0.028,
        });
      });
      break;
    }

    case 'pigeon_flutter': {
      // Soft warbling pigeon coo + wing-flutter rustle
      triggerHaptic([8, 25, 8], 120);
      const syllables = [
        { offset: 0.0, dur: 0.09, startHz: 470, endHz: 530, gain: 0.18 },
        { offset: 0.11, dur: 0.19, startHz: 545, endHz: 405, gain: 0.2 },
      ];
      for (const syl of syllables) {
        const sTime = t + syl.offset;
        const carrier = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lfoDepth = ctx.createGain();
        const env = ctx.createGain();

        carrier.type = 'sine';
        carrier.frequency.setValueAtTime(syl.startHz, sTime);
        carrier.frequency.exponentialRampToValueAtTime(syl.endHz, sTime + syl.dur);

        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(19, sTime);
        lfoDepth.gain.setValueAtTime(40, sTime);

        env.gain.setValueAtTime(0.0001, sTime);
        env.gain.linearRampToValueAtTime(syl.gain * intensity, sTime + 0.018);
        env.gain.exponentialRampToValueAtTime(0.0001, sTime + syl.dur);

        lfo.connect(lfoDepth);
        lfoDepth.connect(carrier.frequency);
        carrier.connect(env);
        env.connect(out);

        carrier.onended = () => {
          lfo.disconnect();
          lfoDepth.disconnect();
          carrier.disconnect();
          env.disconnect();
        };

        lfo.start(sTime);
        carrier.start(sTime);
        lfo.stop(sTime + syl.dur + 0.02);
        carrier.stop(sTime + syl.dur + 0.02);
      }
      [0.015, 0.06, 0.105].forEach((offset) => {
        scheduleFilteredNoise(ctx, out, noise, {
          startTime: t + offset,
          duration: 0.032,
          filterType: 'bandpass',
          startFreq: 1650,
          endFreq: 1150,
          q: 2.0,
          peakGain: 0.14 * intensity,
          attack: 0.004,
        });
      });
      break;
    }

    case 'water_plop': {
      // Cartoon bubbly water plop + splash droplets
      triggerHaptic([14, 35, 10]);
      scheduleTone(ctx, out, {
        type: 'sine',
        startTime: t,
        duration: 0.115,
        startFreq: 390,
        midFreq: { freq: 185, atOffset: 0.035 },
        endFreq: 710,
        peakGain: 0.3 * intensity,
        attack: 0.005,
      });
      scheduleFilteredNoise(ctx, out, noise, {
        startTime: t + 0.03,
        duration: 0.28,
        filterType: 'bandpass',
        startFreq: 1050,
        endFreq: 440,
        q: 1.7,
        peakGain: 0.24 * intensity,
        attack: 0.02,
      });
      [620, 820, 560, 940].forEach((hz, idx) => {
        scheduleTone(ctx, out, {
          type: 'sine',
          startTime: t + 0.075 + idx * 0.045,
          duration: 0.058,
          startFreq: hz,
          endFreq: hz * 1.55,
          peakGain: 0.12 * intensity,
          attack: 0.003,
        });
      });
      break;
    }

    case 'cup_rattle': {
      // Hollow cup plop + tactile cup-liner rattle
      triggerHaptic([14, 30, 10]);
      scheduleTone(ctx, out, {
        type: 'sine',
        startTime: t,
        duration: 0.082,
        startFreq: 195,
        midFreq: { freq: 485, atOffset: 0.026 },
        endFreq: 275,
        peakGain: 0.36 * intensity,
        attack: 0.003,
      });
      scheduleTone(ctx, out, {
        type: 'triangle',
        startTime: t + 0.052,
        duration: 0.048,
        startFreq: 370,
        endFreq: 185,
        peakGain: 0.24 * intensity,
        attack: 0.002,
        lowpassHz: 2000,
      });
      scheduleTone(ctx, out, {
        type: 'sine',
        startTime: t + 0.088,
        duration: 0.04,
        startFreq: 450,
        endFreq: 260,
        peakGain: 0.16 * intensity,
        attack: 0.002,
      });
      break;
    }

    case 'flag_chime': {
      playFlagChime(ctx, out, opts.flagIndex ?? 0);
      break;
    }

    case 'round_fanfare': {
      playRoundFanfare(ctx, out);
      break;
    }

    case 'club_switch': {
      triggerHaptic(6);
      scheduleTone(ctx, out, {
        type: 'sine',
        startTime: t,
        duration: 0.068,
        startFreq: 659.25,
        endFreq: 666,
        peakGain: 0.16 * intensity,
        attack: 0.002,
      });
      scheduleTone(ctx, out, {
        type: 'sine',
        startTime: t + 0.036,
        duration: 0.095,
        startFreq: 880.0,
        endFreq: 888,
        peakGain: 0.18 * intensity,
        attack: 0.002,
      });
      break;
    }

    case 'ui_tap': {
      triggerHaptic(6);
      scheduleTone(ctx, out, {
        type: 'sine',
        startTime: t,
        duration: 0.055,
        startFreq: 740,
        endFreq: 820,
        peakGain: 0.15 * intensity,
        attack: 0.002,
      });
      scheduleTone(ctx, out, {
        type: 'triangle',
        startTime: t,
        duration: 0.018,
        startFreq: 2220,
        peakGain: 0.04 * intensity,
        attack: 0.001,
      });
      break;
    }

    default: {
      const _exhaustive: never = sound;
      void _exhaustive;
    }
  }
}

export function playSoundPayload(payload: SoundEventPayload): void {
  playToySound(payload.type, {
    intensity: payload.intensity ?? 1.0,
    flagIndex: payload.flagIndex,
  });
}

export const soundEngine = {
  init: initSoundEngine,
  unlock: unlockAudioEngine,
  setMuted: setSoundMuted,
  isMuted: isSoundMuted,
  play: playToySound,
  playPayload: playSoundPayload,
};
