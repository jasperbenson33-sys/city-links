'use client';

import type { ClubId, SoundEventPayload, SoundEventType } from '@/types';

export type CurbsideSoundId =
  | SoundEventType
  | 'swing_tick'
  | 'awning_cushion'
  | 'gutter_boost'
  | 'steam_pop'
  | 'fountain_splash'
  | 'cup_drop'
  | 'ui_click';

export interface PlaySoundOptions {
  intensity?: number;
  /** Physical collision speed in m/s for velocity-scaled gain & filter brightness */
  impactSpeed?: number;
  /** Optional per-surface cooldown key (e.g. 'curb:se', 'awning:hotdog') */
  surfaceKey?: string;
  /** 0-based sunk flag order (0..4) for ascending chimes */
  flagIndex?: number;
  /** Optional shot power (0..1) for club strike scaling */
  power?: number;
}

export type SoundArg = number | PlaySoundOptions;

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

// Minimum 45ms per-surface / per-voice cooldown to prevent multi-bounce clipping or spam
const MIN_VOICE_COOLDOWN_MS = 45;
const MAX_CONCURRENT_VOICES = 14;
const lastPlayedAtByKey = new Map<string, number>();
let lastHapticMs = 0;

interface ActiveVoiceEntry {
  id: number;
  stopTime: number;
  steal: () => void;
}

const activeVoices: ActiveVoiceEntry[] = [];
let nextVoiceId = 1;

function removeActiveVoice(id: number): void {
  const idx = activeVoices.findIndex((v) => v.id === id);
  if (idx !== -1) {
    activeVoices.splice(idx, 1);
  }
}

function registerActiveVoice(
  ctx: AudioContext,
  stopTime: number,
  sourceNode: AudioScheduledSourceNode,
  cleanup: () => void,
): () => void {
  const now = ctx.currentTime;
  for (let i = activeVoices.length - 1; i >= 0; i -= 1) {
    if (activeVoices[i].stopTime <= now) {
      activeVoices.splice(i, 1);
    }
  }

  while (activeVoices.length >= MAX_CONCURRENT_VOICES) {
    const oldest = activeVoices.shift();
    if (oldest) {
      oldest.steal();
    }
  }

  const id = nextVoiceId++;
  let cleaned = false;
  const finish = () => {
    if (cleaned) return;
    cleaned = true;
    removeActiveVoice(id);
    cleanup();
  };

  activeVoices.push({
    id,
    stopTime,
    steal: () => {
      try {
        sourceNode.stop();
      } catch {
        // Ignore already-stopped nodes
      }
      finish();
    },
  });

  return finish;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function canTriggerVoice(key: string, cooldownMs = MIN_VOICE_COOLDOWN_MS): boolean {
  const effectiveCooldown = Math.max(MIN_VOICE_COOLDOWN_MS, cooldownMs);
  const nowMs =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  const prevMs = lastPlayedAtByKey.get(key);
  if (prevMs !== undefined && nowMs - prevMs < effectiveCooldown) {
    return false;
  }
  lastPlayedAtByKey.set(key, nowMs);
  return true;
}

function resolveVelocityParams(
  intensityOrOpts: SoundArg | undefined,
  impactSpeedArg: number | undefined,
  defaultIntensity: number,
  referenceSpeedMps: number,
  minIntensity = 0.14,
  maxIntensity = 1.2,
): { intensity: number; brightness: number; surfaceKey?: string } {
  let baseIntensity = defaultIntensity;
  let impactSpeed = impactSpeedArg;
  let surfaceKey: string | undefined;

  if (typeof intensityOrOpts === 'number' && Number.isFinite(intensityOrOpts)) {
    baseIntensity = intensityOrOpts;
  } else if (typeof intensityOrOpts === 'object' && intensityOrOpts !== null) {
    if (
      typeof intensityOrOpts.intensity === 'number' &&
      Number.isFinite(intensityOrOpts.intensity)
    ) {
      baseIntensity = intensityOrOpts.intensity;
    }
    if (
      typeof intensityOrOpts.impactSpeed === 'number' &&
      Number.isFinite(intensityOrOpts.impactSpeed)
    ) {
      impactSpeed = intensityOrOpts.impactSpeed;
    }
    if (typeof intensityOrOpts.surfaceKey === 'string' && intensityOrOpts.surfaceKey) {
      surfaceKey = intensityOrOpts.surfaceKey;
    }
  }

  if (typeof impactSpeed === 'number' && Number.isFinite(impactSpeed)) {
    const speedNorm = clamp(Math.abs(impactSpeed) / referenceSpeedMps, 0.08, 1.35);
    const hasExplicitIntensity =
      typeof intensityOrOpts === 'number' ||
      (typeof intensityOrOpts === 'object' &&
        intensityOrOpts !== null &&
        typeof intensityOrOpts.intensity === 'number');
    const speedIntensity = clamp(0.18 + speedNorm * 0.88, minIntensity, maxIntensity);
    const effectiveIntensity = hasExplicitIntensity
      ? clamp(baseIntensity * (0.45 + 0.55 * speedNorm), minIntensity, maxIntensity)
      : speedIntensity;
    const brightness = clamp(0.52 + speedNorm * 0.72, 0.5, 1.4);
    return { intensity: effectiveIntensity, brightness, surfaceKey };
  }

  const effectiveIntensity = clamp(baseIntensity, minIntensity, maxIntensity);
  const brightness = clamp(0.62 + effectiveIntensity * 0.45, 0.55, 1.3);
  return { intensity: effectiveIntensity, brightness, surfaceKey };
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
    masterGain.gain.setValueAtTime(mutedState ? 0 : 0.74, audioCtx.currentTime);

    compressor.connect(masterGain);
    masterGain.connect(audioCtx.destination);
  }

  if (!noiseBuffer) {
    const durationSec = 1.6;
    const length = Math.floor(audioCtx.sampleRate * durationSec);
    noiseBuffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    // Warm pink-tinted noise so filtered whooshes & steam hiss feel organic and never harsh
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

function canPlayNow(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof document !== 'undefined' && document.hidden) return false;
  if (mutedState) return false;
  return true;
}

/**
 * Sets global mute state cleanly without coupling directly to React/Zustand internals.
 */
export function setSoundMuted(muted: boolean): void {
  mutedState = muted;
  if (audioCtx && masterGain) {
    const now = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setTargetAtTime(muted ? 0 : 0.74, now, 0.015);
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
  if (typeof window === 'undefined') {
    return () => {};
  }

  // Pre-allocate AudioContext, compressor/gain graph, and 1.6s pink-noise buffer at mount
  // so the first shot incurs 0ms synchronous audio-graph init stall.
  try {
    ensureAudioGraph();
  } catch {
    // Ignore in restricted environments
  }

  if (unlockListenersAttached) {
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
  },
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
      startTime + clamp(midFreq.atOffset, 0.005, duration - 0.005),
    );
  }
  if (endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(24, endFreq),
      startTime + duration,
    );
  }

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(
    peakGain,
    startTime + Math.min(attack, duration * 0.45),
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  if (lowpassHz) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(lowpassHz, startTime);
    osc.connect(filter);
    filter.connect(gain);
    osc.onended = registerActiveVoice(ctx, startTime + duration + 0.015, osc, () => {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    });
  } else {
    osc.connect(gain);
    osc.onended = registerActiveVoice(ctx, startTime + duration + 0.015, osc, () => {
      osc.disconnect();
      gain.disconnect();
    });
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
  },
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
      startTime + clamp(midFreq.atOffset, 0.008, duration - 0.008),
    );
  }
  if (endFreq !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(40, endFreq),
      startTime + duration,
    );
  }

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(
    peakGain,
    startTime + Math.min(attack, duration * 0.5),
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  src.onended = registerActiveVoice(ctx, startTime + duration + 0.02, src, () => {
    src.disconnect();
    filter.disconnect();
    gain.disconnect();
  });

  src.start(startTime, offset, duration + 0.02);
}

function scheduleBrassVendorBell(
  ctx: AudioContext,
  dest: AudioNode,
  startTime: number,
  duration: number,
  gainScale: number,
): void {
  const partials: Array<{
    ratio: number;
    amp: number;
    decayMult: number;
    type: OscillatorType;
  }> = [
    { ratio: 1.0, amp: 0.2, decayMult: 1.0, type: 'sine' },
    { ratio: 2.0, amp: 0.095, decayMult: 0.72, type: 'sine' },
    { ratio: 2.756, amp: 0.06, decayMult: 0.52, type: 'triangle' },
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

function getReadyGraph(): {
  ctx: AudioContext;
  out: AudioNode;
  noise: AudioBuffer;
  t: number;
} | null {
  if (!canPlayNow()) return null;
  const graph = ensureAudioGraph();
  if (!graph) return null;
  if (graph.ctx.state === 'suspended') {
    void graph.ctx.resume().catch(() => {});
  }
  return { ...graph, t: graph.ctx.currentTime + 0.003 };
}

// ============================================================================
// CLUB STRIKE SYNTHESIS
// ============================================================================

function synthDriverStrike(
  ctx: AudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  t: number,
  intensity: number,
): void {
  // Warm hollow titanium-wood thwack + sweeping sunlit sky whoosh
  triggerHaptic(Math.round(12 + intensity * 8));
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: t,
    duration: 0.105,
    startFreq: 265 + intensity * 55,
    endFreq: 72,
    peakGain: 0.44 * intensity,
    attack: 0.0018,
  });
  scheduleTone(ctx, out, {
    type: 'triangle',
    startTime: t,
    duration: 0.038,
    startFreq: 1080 + intensity * 140,
    endFreq: 295,
    peakGain: 0.24 * intensity,
    attack: 0.001,
    lowpassHz: 3200,
  });
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: t,
    duration: 0.052,
    startFreq: 1860,
    endFreq: 1680,
    peakGain: 0.085 * intensity,
    attack: 0.001,
  });
  scheduleFilteredNoise(ctx, out, noise, {
    startTime: t + 0.01,
    duration: 0.26,
    filterType: 'bandpass',
    startFreq: 360,
    midFreq: { freq: 1460, atOffset: 0.085 },
    endFreq: 520,
    q: 1.65,
    peakGain: 0.26 * intensity,
    attack: 0.03,
  });
}

function synthWedgeStrike(
  ctx: AudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  t: number,
  intensity: number,
): void {
  // Crisp lofted groove click + soft spin whisk
  triggerHaptic(Math.round(9 + intensity * 5));
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: t,
    duration: 0.056,
    startFreq: 460 + intensity * 30,
    endFreq: 185,
    peakGain: 0.3 * intensity,
    attack: 0.0015,
  });
  scheduleTone(ctx, out, {
    type: 'triangle',
    startTime: t,
    duration: 0.026,
    startFreq: 2040,
    endFreq: 1290,
    peakGain: 0.21 * intensity,
    attack: 0.001,
    lowpassHz: 4200,
  });
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: t,
    duration: 0.022,
    startFreq: 3560,
    endFreq: 2960,
    peakGain: 0.09 * intensity,
    attack: 0.001,
  });
  scheduleFilteredNoise(ctx, out, noise, {
    startTime: t + 0.006,
    duration: 0.145,
    filterType: 'bandpass',
    startFreq: 1700,
    midFreq: { freq: 3850, atOffset: 0.06 },
    endFreq: 2350,
    q: 2.3,
    peakGain: 0.18 * intensity,
    attack: 0.015,
  });
}

function synthSkimmerStrike(
  ctx: AudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  t: number,
  intensity: number,
): void {
  // Punchy staccato forged-iron snap + low street skim zip
  triggerHaptic(Math.round(11 + intensity * 6));
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: t,
    duration: 0.068,
    startFreq: 365 + intensity * 40,
    endFreq: 126,
    peakGain: 0.35 * intensity,
    attack: 0.0014,
  });
  scheduleTone(ctx, out, {
    type: 'triangle',
    startTime: t,
    duration: 0.032,
    startFreq: 1620,
    endFreq: 910,
    peakGain: 0.24 * intensity,
    attack: 0.001,
    lowpassHz: 3700,
  });
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: t + 0.001,
    duration: 0.048,
    startFreq: 2820,
    endFreq: 2440,
    peakGain: 0.1 * intensity,
    attack: 0.001,
  });
  scheduleFilteredNoise(ctx, out, noise, {
    startTime: t + 0.003,
    duration: 0.092,
    filterType: 'bandpass',
    startFreq: 2300,
    endFreq: 1120,
    q: 1.85,
    peakGain: 0.21 * intensity,
    attack: 0.005,
  });
}

function synthPutterStrike(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  intensity: number,
): void {
  // Warm milled brass / wood mallet tap
  triggerHaptic(Math.round(6 + intensity * 4));
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: t,
    duration: 0.065,
    startFreq: 420 + intensity * 25,
    endFreq: 210,
    peakGain: 0.31 * intensity,
    attack: 0.002,
  });
  scheduleTone(ctx, out, {
    type: 'triangle',
    startTime: t,
    duration: 0.022,
    startFreq: 1160,
    endFreq: 630,
    peakGain: 0.13 * intensity,
    attack: 0.001,
    lowpassHz: 2200,
  });
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: t,
    duration: 0.035,
    startFreq: 2320,
    endFreq: 1980,
    peakGain: 0.042 * intensity,
    attack: 0.001,
  });
}

// ============================================================================
// ENVIRONMENTAL, TRICK-SHOT & CUP VOICES
// ============================================================================

function synthCurbBank(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  intensity: number,
  brightness = 1.0,
): void {
  // Crisp granite stone curb clack — velocity-scaled gain, filter cutoff & micro-haptic
  if (intensity >= 0.24) {
    triggerHaptic(Math.round(clamp(4 + intensity * 6, 4, 12)), 45);
  }
  scheduleTone(ctx, out, {
    type: 'triangle',
    startTime: t,
    duration: 0.036 + intensity * 0.008,
    startFreq: 500 + brightness * 90,
    endFreq: 215 + brightness * 25,
    peakGain: 0.24 * intensity,
    attack: 0.0015,
    lowpassHz: clamp(1350 + brightness * 1150, 950, 3400),
  });
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: t,
    duration: 0.015,
    startFreq: 1220 + brightness * 310,
    endFreq: 590 + brightness * 90,
    peakGain: 0.11 * intensity * clamp(brightness, 0.45, 1.25),
    attack: 0.001,
  });
}

function synthAwningCushion(
  ctx: AudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  t: number,
  intensity: number,
  brightness = 1.0,
): void {
  // Taut canvas drum thump + soft cushioned whoosh + subtle hotdog vendor brass ding
  if (intensity >= 0.25) {
    triggerHaptic([Math.round(10 + intensity * 5), 32, Math.round(7 + intensity * 4)], 48);
  }
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: t,
    duration: 0.165,
    startFreq: 165 + brightness * 16,
    midFreq: { freq: 230 + brightness * 22, atOffset: 0.04 },
    endFreq: 108,
    peakGain: 0.38 * intensity,
    attack: 0.004,
  });
  scheduleTone(ctx, out, {
    type: 'triangle',
    startTime: t,
    duration: 0.11,
    startFreq: 290 + brightness * 30,
    endFreq: 155,
    peakGain: 0.16 * intensity,
    attack: 0.005,
    lowpassHz: clamp(820 + brightness * 420, 680, 1750),
  });
  scheduleFilteredNoise(ctx, out, noise, {
    startTime: t + 0.005,
    duration: 0.19,
    filterType: 'bandpass',
    startFreq: 420 + brightness * 75,
    midFreq: { freq: 760 + brightness * 220, atOffset: 0.07 },
    endFreq: 340,
    q: 1.2,
    peakGain: 0.18 * intensity,
    attack: 0.012,
  });
  scheduleBrassVendorBell(ctx, out, t + 0.065, 0.34, intensity * 0.72 * clamp(brightness, 0.65, 1.2));
}

function synthGutterBoost(
  ctx: AudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  t: number,
  intensity: number,
  brightness = 1.0,
): void {
  // Sparkling rushing water chime along the curved storm-drain gutter
  triggerHaptic([8, 22, Math.round(8 + intensity * 4)], 48);
  scheduleFilteredNoise(ctx, out, noise, {
    startTime: t,
    duration: 0.42,
    filterType: 'bandpass',
    startFreq: 520 + brightness * 65,
    midFreq: { freq: clamp(1650 + brightness * 620, 1200, 2900), atOffset: 0.15 },
    endFreq: 980,
    q: 2.2,
    peakGain: 0.24 * intensity,
    attack: 0.025,
  });

  const sparkleNotes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
  sparkleNotes.forEach((hz, idx) => {
    scheduleTone(ctx, out, {
      type: 'sine',
      startTime: t + 0.02 + idx * 0.044,
      duration: 0.18,
      startFreq: hz,
      endFreq: hz * 1.03,
      peakGain: (0.12 - idx * 0.01) * intensity * clamp(brightness, 0.7, 1.2),
      attack: 0.004,
    });
  });
}

function synthSteamPop(
  ctx: AudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  t: number,
  intensity: number,
  brightness = 1.0,
): void {
  // Warm pressurized subway steam hiss + buoyant pneumatic pop
  triggerHaptic([11, 28, Math.round(13 + intensity * 4)], 48);
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: t,
    duration: 0.11,
    startFreq: 145,
    midFreq: { freq: 390 + brightness * 45, atOffset: 0.045 },
    endFreq: 260,
    peakGain: 0.32 * intensity,
    attack: 0.004,
  });
  scheduleFilteredNoise(ctx, out, noise, {
    startTime: t + 0.01,
    duration: 0.38,
    filterType: 'bandpass',
    startFreq: 420,
    midFreq: { freq: clamp(1280 + brightness * 360, 950, 2200), atOffset: 0.12 },
    endFreq: 680,
    q: 1.5,
    peakGain: 0.26 * intensity,
    attack: 0.03,
  });
  [698.46, 880.0, 1174.66].forEach((hz, idx) => {
    scheduleTone(ctx, out, {
      type: 'sine',
      startTime: t + 0.05 + idx * 0.055,
      duration: 0.22,
      startFreq: hz * 0.99,
      endFreq: hz * 1.01,
      peakGain: 0.095 * intensity,
      attack: 0.02,
    });
  });
}

function synthFountainSplash(
  ctx: AudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  t: number,
  intensity: number,
  brightness = 1.0,
): void {
  // Water splash + gentle penalty two-tone (cozy descending F4 -> D4 marimba interval)
  triggerHaptic([14, 36, 12], 60);
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: t,
    duration: 0.11,
    startFreq: 380,
    midFreq: { freq: 175, atOffset: 0.032 },
    endFreq: 640 + brightness * 75,
    peakGain: 0.28 * intensity,
    attack: 0.005,
  });
  scheduleFilteredNoise(ctx, out, noise, {
    startTime: t + 0.025,
    duration: 0.28,
    filterType: 'bandpass',
    startFreq: clamp(920 + brightness * 240, 720, 1650),
    endFreq: 420,
    q: 1.65,
    peakGain: 0.24 * intensity,
    attack: 0.018,
  });
  // Gentle penalty two-tone
  scheduleTone(ctx, out, {
    type: 'triangle',
    startTime: t + 0.14,
    duration: 0.18,
    startFreq: 349.23,
    peakGain: 0.16 * intensity,
    attack: 0.008,
    lowpassHz: 1800,
  });
  scheduleTone(ctx, out, {
    type: 'triangle',
    startTime: t + 0.27,
    duration: 0.26,
    startFreq: 293.66,
    peakGain: 0.15 * intensity,
    attack: 0.008,
    lowpassHz: 1600,
  });
}

function synthPigeonScatter(
  ctx: AudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  t: number,
  intensity: number,
): void {
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
}

function synthCupRattleOnly(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  intensity: number,
): void {
  // Authentic plastic/metal cup drop + rim clatter
  triggerHaptic([14, 30, 10]);
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: t,
    duration: 0.075,
    startFreq: 205,
    midFreq: { freq: 510, atOffset: 0.024 },
    endFreq: 285,
    peakGain: 0.36 * intensity,
    attack: 0.003,
  });
  scheduleTone(ctx, out, {
    type: 'triangle',
    startTime: t + 0.048,
    duration: 0.045,
    startFreq: 390,
    endFreq: 195,
    peakGain: 0.24 * intensity,
    attack: 0.002,
    lowpassHz: 2200,
  });
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: t + 0.084,
    duration: 0.042,
    startFreq: 1240,
    endFreq: 860,
    peakGain: 0.14 * intensity,
    attack: 0.0015,
  });
}

function synthCupDropAndVictory(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  intensity: number,
): void {
  // Authentic plastic/metal cup rattle + sunlit major-9th victory arpeggio (Cmaj9: C5-E5-G5-B5-D6-E6)
  triggerHaptic([16, 40, 14, 40, 22]);
  synthCupRattleOnly(ctx, out, t, intensity);

  const arpStart = t + 0.15;
  const maj9Notes = [523.25, 659.25, 783.99, 987.77, 1174.66, 1318.51];
  maj9Notes.forEach((hz, idx) => {
    const noteTime = arpStart + idx * 0.068;
    const isTop = idx === maj9Notes.length - 1;
    const dur = isTop ? 1.05 : 0.42;

    scheduleTone(ctx, out, {
      type: 'triangle',
      startTime: noteTime,
      duration: dur,
      startFreq: hz,
      peakGain: (isTop ? 0.24 : 0.17) * intensity,
      attack: 0.004,
      lowpassHz: 4600,
    });
    scheduleTone(ctx, out, {
      type: 'sine',
      startTime: noteTime,
      duration: dur * 0.85,
      startFreq: hz * 2,
      peakGain: (isTop ? 0.085 : 0.045) * intensity,
      attack: 0.003,
    });
  });

  // Warm sunlit C4 + G4 + D5 harmonic bed bloom on crown note
  const bloomStart = arpStart + 4 * 0.068;
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: bloomStart,
    duration: 1.1,
    startFreq: 261.63,
    peakGain: 0.15 * intensity,
    attack: 0.03,
  });
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: bloomStart,
    duration: 1.0,
    startFreq: 392.0,
    peakGain: 0.11 * intensity,
    attack: 0.03,
  });
}

function synthUiClick(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  intensity: number,
): void {
  // Soft tactile wood-block tick
  triggerHaptic(5);
  scheduleTone(ctx, out, {
    type: 'sine',
    startTime: t,
    duration: 0.042,
    startFreq: 810,
    endFreq: 690,
    peakGain: 0.16 * intensity,
    attack: 0.0015,
  });
  scheduleTone(ctx, out, {
    type: 'triangle',
    startTime: t,
    duration: 0.016,
    startFreq: 1920,
    endFreq: 1320,
    peakGain: 0.055 * intensity,
    attack: 0.001,
    lowpassHz: 2600,
  });
}

// ============================================================================
// PUBLIC NAMED VOICE HELPERS
// ============================================================================

export function playClubStrike(clubId: ClubId, power = 0.75): void {
  if (!canTriggerVoice(`strike:${clubId}`, MIN_VOICE_COOLDOWN_MS)) return;
  const ready = getReadyGraph();
  if (!ready) return;
  const intensity = clamp(0.35 + power * 0.75, 0.25, 1.15);
  switch (clubId) {
    case 'driver':
      synthDriverStrike(ready.ctx, ready.out, ready.noise, ready.t, intensity);
      break;
    case 'wedge':
      synthWedgeStrike(ready.ctx, ready.out, ready.noise, ready.t, intensity);
      break;
    case 'skimmer':
      synthSkimmerStrike(ready.ctx, ready.out, ready.noise, ready.t, intensity);
      break;
    case 'putter':
      synthPutterStrike(ready.ctx, ready.out, ready.t, intensity);
      break;
  }
}

export function playCurbBank(
  intensityOrOpts: SoundArg = 0.85,
  impactSpeed?: number,
): void {
  const { intensity, brightness, surfaceKey } = resolveVelocityParams(
    intensityOrOpts,
    impactSpeed,
    0.85,
    11.0,
    0.15,
    1.2,
  );
  const voiceKey = surfaceKey ? `curb:${surfaceKey}` : 'curb_bank';
  if (!canTriggerVoice(voiceKey, 45)) return;
  const ready = getReadyGraph();
  if (!ready) return;
  synthCurbBank(ready.ctx, ready.out, ready.t, intensity, brightness);
}

export function playAwningCushion(
  intensityOrOpts: SoundArg = 0.95,
  impactSpeed?: number,
): void {
  const { intensity, brightness, surfaceKey } = resolveVelocityParams(
    intensityOrOpts,
    impactSpeed,
    0.95,
    12.0,
    0.2,
    1.2,
  );
  const voiceKey = surfaceKey ? `awning:${surfaceKey}` : 'awning_cushion';
  if (!canTriggerVoice(voiceKey, 90)) return;
  const ready = getReadyGraph();
  if (!ready) return;
  synthAwningCushion(ready.ctx, ready.out, ready.noise, ready.t, intensity, brightness);
}

export function playGutterBoost(
  intensityOrOpts: SoundArg = 0.9,
  impactSpeed?: number,
): void {
  const { intensity, brightness, surfaceKey } = resolveVelocityParams(
    intensityOrOpts,
    impactSpeed,
    0.9,
    12.0,
    0.2,
    1.2,
  );
  const voiceKey = surfaceKey ? `gutter:${surfaceKey}` : 'gutter_boost';
  if (!canTriggerVoice(voiceKey, 130)) return;
  const ready = getReadyGraph();
  if (!ready) return;
  synthGutterBoost(ready.ctx, ready.out, ready.noise, ready.t, intensity, brightness);
}

export function playSteamPop(
  intensityOrOpts: SoundArg = 0.95,
  impactSpeed?: number,
): void {
  const { intensity, brightness, surfaceKey } = resolveVelocityParams(
    intensityOrOpts,
    impactSpeed,
    0.95,
    11.0,
    0.2,
    1.2,
  );
  const voiceKey = surfaceKey ? `steam:${surfaceKey}` : 'steam_pop';
  if (!canTriggerVoice(voiceKey, 140)) return;
  const ready = getReadyGraph();
  if (!ready) return;
  synthSteamPop(ready.ctx, ready.out, ready.noise, ready.t, intensity, brightness);
}

export function playFountainSplash(
  intensityOrOpts: SoundArg = 0.95,
  impactSpeed?: number,
): void {
  const { intensity, brightness, surfaceKey } = resolveVelocityParams(
    intensityOrOpts,
    impactSpeed,
    0.95,
    10.0,
    0.2,
    1.2,
  );
  const voiceKey = surfaceKey ? `fountain:${surfaceKey}` : 'fountain_splash';
  if (!canTriggerVoice(voiceKey, 120)) return;
  const ready = getReadyGraph();
  if (!ready) return;
  synthFountainSplash(ready.ctx, ready.out, ready.noise, ready.t, intensity, brightness);
}

export function playPigeonScatter(
  intensityOrOpts: SoundArg = 0.85,
  impactSpeed?: number,
): void {
  const { intensity, surfaceKey } = resolveVelocityParams(
    intensityOrOpts,
    impactSpeed,
    0.85,
    8.0,
    0.2,
    1.2,
  );
  const voiceKey = surfaceKey ? `pigeon:${surfaceKey}` : 'pigeon_scatter';
  if (!canTriggerVoice(voiceKey, 160)) return;
  const ready = getReadyGraph();
  if (!ready) return;
  synthPigeonScatter(ready.ctx, ready.out, ready.noise, ready.t, intensity);
}

export function playCupDrop(
  intensityOrOpts: SoundArg = 1.0,
  impactSpeed?: number,
): void {
  const { intensity, surfaceKey } = resolveVelocityParams(
    intensityOrOpts,
    impactSpeed,
    1.0,
    4.0,
    0.3,
    1.2,
  );
  const voiceKey = surfaceKey ? `cup:${surfaceKey}` : 'cup_drop';
  if (!canTriggerVoice(voiceKey, 350)) return;
  const ready = getReadyGraph();
  if (!ready) return;
  synthCupDropAndVictory(ready.ctx, ready.out, ready.t, intensity);
}

export function playUiClick(intensityOrOpts: SoundArg = 0.8): void {
  const { intensity } = resolveVelocityParams(intensityOrOpts, undefined, 0.8, 1.0, 0.15, 1.2);
  if (!canTriggerVoice('ui_click', 45)) return;
  const ready = getReadyGraph();
  if (!ready) return;
  synthUiClick(ready.ctx, ready.out, ready.t, intensity);
}

export function playSwingTick(power = 0.5): void {
  if (!canTriggerVoice('swing_tick', 45)) return;
  const ready = getReadyGraph();
  if (!ready) return;
  triggerHaptic(5, 45);
  const norm = clamp(power, 0, 1);
  const baseHz = 370 + norm * 340;
  scheduleTone(ready.ctx, ready.out, {
    type: 'triangle',
    startTime: ready.t,
    duration: 0.036,
    startFreq: baseHz * 1.08,
    endFreq: baseHz * 0.92,
    peakGain: 0.1 + norm * 0.08,
    attack: 0.002,
    lowpassHz: 2400,
  });
}

// ============================================================================
// BACKWARD-COMPATIBLE UNIFIED DISPATCHER
// ============================================================================

/**
 * Synthesizes warm, tactile toybox sound effects & gentle micro-haptics.
 */
export function playToySound(
  sound: CurbsideSoundId,
  rawIntensityOrOpts: SoundArg = 1.0,
): void {
  if (!canPlayNow()) return;

  const opts: PlaySoundOptions =
    typeof rawIntensityOrOpts === 'number'
      ? { intensity: rawIntensityOrOpts }
      : rawIntensityOrOpts;
  const rawIntensity = opts.intensity ?? 1.0;
  const intensity = clamp(rawIntensity, 0.12, 1.25);

  switch (sound) {
    case 'swing_tick':
      playSwingTick(opts.power ?? rawIntensity);
      break;
    case 'hit_driver':
      playClubStrike('driver', opts.power ?? clamp((intensity - 0.25) / 0.75, 0.1, 1));
      break;
    case 'hit_wedge':
      playClubStrike('wedge', opts.power ?? clamp((intensity - 0.25) / 0.75, 0.1, 1));
      break;
    case 'hit_skimmer':
      playClubStrike('skimmer', opts.power ?? clamp((intensity - 0.25) / 0.75, 0.1, 1));
      break;
    case 'hit_putter':
      playClubStrike('putter', opts.power ?? clamp((intensity - 0.25) / 0.75, 0.1, 1));
      break;
    case 'curb_clack':
      playCurbBank(opts);
      break;
    case 'awning_cushion':
    case 'umbrella_boing':
      playAwningCushion(opts);
      break;
    case 'gutter_bank':
    case 'gutter_boost':
    case 'hydrant_whoosh':
      playGutterBoost(opts);
      break;
    case 'steam_hiss':
    case 'steam_pop':
      playSteamPop(opts);
      break;
    case 'pigeon_flutter':
      playPigeonScatter(opts);
      break;
    case 'water_plop':
    case 'fountain_splash':
      playFountainSplash(opts);
      break;
    case 'cup_rattle': {
      if (!canTriggerVoice(opts.surfaceKey ? `cup_rattle:${opts.surfaceKey}` : 'cup_rattle', 45)) {
        break;
      }
      const ready = getReadyGraph();
      if (ready) synthCupRattleOnly(ready.ctx, ready.out, ready.t, intensity);
      break;
    }
    case 'cup_drop':
    case 'flag_chime':
    case 'round_fanfare':
      playCupDrop(opts);
      break;
    case 'club_switch':
    case 'ui_tap':
    case 'ui_click':
      playUiClick(opts);
      break;
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
  playClubStrike,
  playCurbBank,
  playAwningCushion,
  playGutterBoost,
  playSteamPop,
  playFountainSplash,
  playPigeonScatter,
  playCupDrop,
  playUiClick,
  playSwingTick,
};
