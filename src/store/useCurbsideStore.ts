'use client';

import { create } from 'zustand';
import {
  AUTO_PUTTER_DISTANCE,
  BALL_RADIUS,
  FLAG_COLORS,
  type AimPreviewSnapshot,
  type BallPhase,
  type CameraMode,
  type ClubId,
  type DailyBestRecord,
  type FlagColor,
  type FlagPinSpec,
  type GeneratedCityCourse,
  type PropType,
  type RoundMode,
  type SoundEventPayload,
  type SoundEventType,
  type SunkFlagEntry,
  type TrickToastEvent,
  type TrickToastKind,
  type Vec3Tuple,
} from '@/types';
import {
  computeDeterministicTrajectory,
  createRandomSeed,
  generateCityCourse,
  getCourseSurfaceElevationAt,
  getTodayDailySeedUTC,
  resolveHorizontalAim,
} from '@/engine';

const DAILY_BEST_STORAGE_KEY = 'curbside-links-daily-best-v1';
const MAX_STORED_DAILY_RECORDS = 30;
const DATE_SEED_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ShotCommand {
  seq: number;
  origin: Vec3Tuple;
  clubId: ClubId;
  power: number;
  aimDirection: [number, number];
  aimYaw: number;
  launchVelocity: Vec3Tuple;
}

export interface PendingBallReset {
  seq: number;
  position: Vec3Tuple;
  reason: 'tee' | 'next_tee' | 'hazard' | 'mulligan' | 'restart';
}

export interface PropHitEvent {
  seq: number;
  propId: string;
  propType: PropType;
  timestampMs: number;
}

interface MulliganSnapshot {
  origin: Vec3Tuple;
  aimYaw: number;
  clubId: ClubId;
  totalStrokesBefore: number;
  currentLegStrokesBefore: number;
}

export interface CurbsideStoreState {
  // Course & seed
  seed: string;
  dailySeed: string;
  roundMode: RoundMode;
  course: GeneratedCityCourse;
  courseVersion: number;
  resetCounter: number;
  mulliganCounter: number;

  // 5-flag free-order loop
  sunkFlags: Record<FlagColor, boolean>;
  sunkOrder: SunkFlagEntry[];
  currentLegStrokes: number;
  totalStrokes: number;
  isRoundComplete: boolean;
  activeTargetFlag: FlagColor | null;
  lastSunkFlag: SunkFlagEntry | null;
  lastCupSunkAtMs: number;
  dailyBest: DailyBestRecord | null;

  // Ball, club & aiming
  ballPhase: BallPhase;
  ballPosition: Vec3Tuple;
  lastSafeLie: Vec3Tuple;
  lastSafeAimYaw: number;
  selectedClub: ClubId;
  aimYaw: number;
  aimDirection: [number, number];
  aimPreview: AimPreviewSnapshot;
  hasTakenFirstStroke: boolean;
  lastShot: ShotCommand | null;
  pendingBallReset: PendingBallReset | null;
  canMulligan: boolean;
  mulliganStack: MulliganSnapshot[];

  // Camera & audio & UI
  cameraMode: CameraMode;
  muted: boolean;
  soundEventSeq: number;
  lastSoundEvent: SoundEventPayload | null;
  trickToast: TrickToastEvent | null;

  // Reactive prop hit tracking for @world-artist animations
  propHitCounters: Record<string, number>;
  propHitTimestamps: Record<string, number>;
  lastPropHit: PropHitEvent | null;

  // Actions
  hydrateDailyBest: () => void;
  loadDailyCity: () => void;
  loadRandomCity: () => void;
  loadSeed: (seed: string) => void;
  restartRound: () => void;
  mulligan: () => void;

  setSelectedClub: (clubId: ClubId, manual?: boolean) => void;
  toggleCameraMode: () => void;
  setCameraMode: (mode: CameraMode) => void;
  toggleMuted: () => void;
  setMuted: (muted: boolean) => void;

  setAimYaw: (yaw: number) => void;
  setAimDirection: (dir: [number, number]) => void;
  setAimPreview: (preview: AimPreviewSnapshot) => void;
  clearAimPreview: () => void;

  launchShot: (opts: {
    origin: Vec3Tuple;
    clubId: ClubId;
    power: number;
    aimDirection: [number, number];
    launchVelocity?: Vec3Tuple;
  }) => void;
  updateBallPosition: (pos: Vec3Tuple) => void;
  markBallResting: (pos: Vec3Tuple) => void;
  sinkFlag: (color: FlagColor) => void;
  triggerWaterHazard: (reason?: 'water' | 'oob') => void;
  consumeBallReset: (seq: number) => void;

  recordPropHit: (
    propId: string,
    propType: PropType,
    toastKind?: TrickToastKind,
    toastLabel?: string,
  ) => void;
  emitSoundEvent: (
    type: SoundEventType,
    opts?: { intensity?: number; flagIndex?: number },
  ) => void;
  emitTrickToast: (kind: TrickToastKind, label: string) => void;
  clearTrickToast: (seq?: number) => void;
  notifyScorecardCopied: () => void;
}

let shotSeq = 0;
let resetSeq = 0;
let soundSeq = 0;
let toastSeq = 0;
let propHitSeq = 0;

let activeCupTransitionTimer: ReturnType<typeof setTimeout> | null = null;
let activeHazardTimer: ReturnType<typeof setTimeout> | null = null;
let activeToastTimer: ReturnType<typeof setTimeout> | null = null;
let activeChimeTimer: ReturnType<typeof setTimeout> | null = null;
let activeFanfareTimer: ReturnType<typeof setTimeout> | null = null;

function clearRoundTimers(): void {
  if (activeCupTransitionTimer !== null) {
    clearTimeout(activeCupTransitionTimer);
    activeCupTransitionTimer = null;
  }
  if (activeHazardTimer !== null) {
    clearTimeout(activeHazardTimer);
    activeHazardTimer = null;
  }
  if (activeChimeTimer !== null) {
    clearTimeout(activeChimeTimer);
    activeChimeTimer = null;
  }
  if (activeFanfareTimer !== null) {
    clearTimeout(activeFanfareTimer);
    activeFanfareTimer = null;
  }
}

function clearToastTimer(): void {
  if (activeToastTimer !== null) {
    clearTimeout(activeToastTimer);
    activeToastTimer = null;
  }
}

function createEmptySunkFlags(): Record<FlagColor, boolean> {
  return {
    red: false,
    yellow: false,
    blue: false,
    purple: false,
    green: false,
  };
}

function surfaceToBallCenter(pos: Vec3Tuple): Vec3Tuple {
  return [pos[0], pos[1] + BALL_RADIUS, pos[2]];
}

function yawToDir(yaw: number): [number, number] {
  return resolveHorizontalAim(undefined, yaw);
}

function dirToYaw(dir: [number, number]): number {
  const [dx, dz] = resolveHorizontalAim(dir);
  return Math.atan2(dx, -dz);
}

function findNearestUnsunkFlag(
  course: GeneratedCityCourse,
  pos: Vec3Tuple,
  sunkFlags: Record<FlagColor, boolean>,
): FlagPinSpec | null {
  let best: FlagPinSpec | null = null;
  let bestDist = Infinity;
  for (const flag of course.flags) {
    if (sunkFlags[flag.color]) continue;
    const d = Math.hypot(flag.position[0] - pos[0], flag.position[2] - pos[2]);
    if (d < bestDist) {
      bestDist = d;
      best = flag;
    }
  }
  return best;
}

function computeAimYawToFlag(from: Vec3Tuple, flag: FlagPinSpec | null): number {
  if (!flag) return 0;
  return Math.atan2(flag.position[0] - from[0], -(flag.position[2] - from[2]));
}

function shouldAutoSelectPutter(
  course: GeneratedCityCourse,
  ballCenterPos: Vec3Tuple,
  sunkFlags: Record<FlagColor, boolean>,
): boolean {
  const surfaceY = getCourseSurfaceElevationAt(
    course,
    ballCenterPos[0],
    ballCenterPos[2],
  );
  for (const flag of course.flags) {
    if (sunkFlags[flag.color]) continue;
    const distXZ = Math.hypot(
      flag.position[0] - ballCenterPos[0],
      flag.position[2] - ballCenterPos[2],
    );
    const sameTier = Math.abs(surfaceY - flag.elevationY) <= 0.1;
    if (sameTier && distXZ <= AUTO_PUTTER_DISTANCE) {
      return true;
    }
  }
  return false;
}

function createIdleAimPreview(
  clubId: ClubId,
  ballCenterPos: Vec3Tuple,
  aimDirection: [number, number],
): AimPreviewSnapshot {
  return {
    isAiming: false,
    clubId,
    power: 0,
    aimDirection,
    launchVelocity: [0, 0, 0],
    arcPoints: [ballCenterPos],
    landingPoint: [ballCenterPos[0], ballCenterPos[1] - BALL_RADIUS, ballCenterPos[2]],
    landingRingRadius: 0.25,
  };
}

function isValidSunkEntry(raw: unknown): raw is SunkFlagEntry {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  return (
    typeof obj.color === 'string' &&
    (FLAG_COLORS as readonly string[]).includes(obj.color) &&
    typeof obj.strokes === 'number' &&
    Number.isSafeInteger(obj.strokes) &&
    obj.strokes >= 1 &&
    obj.strokes <= 999 &&
    typeof obj.orderIndex === 'number' &&
    Number.isSafeInteger(obj.orderIndex) &&
    obj.orderIndex >= 0 &&
    obj.orderIndex <= 4
  );
}

function isValidDailyBestRecord(
  raw: unknown,
  expectedSeed?: string,
): raw is DailyBestRecord {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.dateSeed !== 'string' || !DATE_SEED_RE.test(obj.dateSeed)) {
    return false;
  }
  if (expectedSeed && obj.dateSeed !== expectedSeed) return false;
  if (
    typeof obj.bestStrokes !== 'number' ||
    !Number.isSafeInteger(obj.bestStrokes) ||
    obj.bestStrokes < 1 ||
    obj.bestStrokes > 999
  ) {
    return false;
  }
  if (!Array.isArray(obj.sunkOrder) || obj.sunkOrder.length !== 5) {
    return false;
  }
  const seenColors = new Set<string>();
  for (const item of obj.sunkOrder) {
    if (!isValidSunkEntry(item)) return false;
    if (seenColors.has(item.color)) return false;
    seenColors.add(item.color);
  }
  return seenColors.size === 5;
}

function readDailyBestMap(): Record<string, DailyBestRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(DAILY_BEST_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      window.localStorage.removeItem(DAILY_BEST_STORAGE_KEY);
      return {};
    }
    const clean: Record<string, DailyBestRecord> = {};
    let hadInvalid = false;
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (DATE_SEED_RE.test(key) && isValidDailyBestRecord(val, key)) {
        clean[key] = {
          dateSeed: val.dateSeed,
          bestStrokes: val.bestStrokes,
          sunkOrder: val.sunkOrder.map((e) => ({
            color: e.color,
            strokes: e.strokes,
            orderIndex: e.orderIndex,
          })),
        };
      } else {
        hadInvalid = true;
      }
    }
    if (hadInvalid) {
      window.localStorage.setItem(DAILY_BEST_STORAGE_KEY, JSON.stringify(clean));
    }
    return clean;
  } catch {
    try {
      window.localStorage.removeItem(DAILY_BEST_STORAGE_KEY);
    } catch {
      // Ignore storage access failures
    }
    return {};
  }
}

function loadDailyBestForSeed(dateSeed: string): DailyBestRecord | null {
  if (!DATE_SEED_RE.test(dateSeed)) return null;
  const map = readDailyBestMap();
  return map[dateSeed] ?? null;
}

function persistDailyBestForSeed(record: DailyBestRecord): DailyBestRecord | null {
  if (!isValidDailyBestRecord(record)) return null;
  if (typeof window === 'undefined') return record;
  try {
    const map = readDailyBestMap();
    const existing = map[record.dateSeed];
    const bestToSave =
      existing && existing.bestStrokes <= record.bestStrokes ? existing : record;
    map[record.dateSeed] = bestToSave;

    const sortedKeys = Object.keys(map).sort().slice(-MAX_STORED_DAILY_RECORDS);
    const trimmed: Record<string, DailyBestRecord> = {};
    for (const k of sortedKeys) {
      trimmed[k] = map[k]!;
    }
    window.localStorage.setItem(DAILY_BEST_STORAGE_KEY, JSON.stringify(trimmed));
    return bestToSave;
  } catch {
    return record;
  }
}

function buildInitialRoundFields(
  course: GeneratedCityCourse,
  seed: string,
  dailySeed: string,
  roundMode: RoundMode,
) {
  const sunkFlags = createEmptySunkFlags();
  const startBallPos = surfaceToBallCenter(course.startTeePosition);
  const nearest = findNearestUnsunkFlag(course, startBallPos, sunkFlags);
  const aimYaw = nearest
    ? computeAimYawToFlag(startBallPos, nearest)
    : course.initialAimYaw;
  const aimDirection = yawToDir(aimYaw);
  const selectedClub: ClubId = shouldAutoSelectPutter(course, startBallPos, sunkFlags)
    ? 'putter'
    : 'driver';

  return {
    seed,
    dailySeed,
    roundMode,
    course,
    sunkFlags,
    sunkOrder: [] as SunkFlagEntry[],
    currentLegStrokes: 0,
    totalStrokes: 0,
    isRoundComplete: false,
    activeTargetFlag: nearest?.color ?? null,
    lastSunkFlag: null as SunkFlagEntry | null,
    lastCupSunkAtMs: 0,
    ballPhase: 'resting' as BallPhase,
    ballPosition: startBallPos,
    lastSafeLie: [...startBallPos] as Vec3Tuple,
    lastSafeAimYaw: aimYaw,
    selectedClub,
    aimYaw,
    aimDirection,
    aimPreview: createIdleAimPreview(selectedClub, startBallPos, aimDirection),
    lastShot: null as ShotCommand | null,
    canMulligan: false,
    mulliganStack: [] as MulliganSnapshot[],
  };
}

const BOOT_DAILY_SEED = getTodayDailySeedUTC();
const BOOT_COURSE = generateCityCourse(BOOT_DAILY_SEED);
const BOOT_FIELDS = buildInitialRoundFields(
  BOOT_COURSE,
  BOOT_DAILY_SEED,
  BOOT_DAILY_SEED,
  'daily',
);

export const useCurbsideStore = create<CurbsideStoreState>((set, get) => ({
  ...BOOT_FIELDS,
  courseVersion: 1,
  resetCounter: 0,
  mulliganCounter: 0,
  dailyBest: null,
  hasTakenFirstStroke: false,
  pendingBallReset: null,
  cameraMode: 'overview',
  muted: false,
  soundEventSeq: 0,
  lastSoundEvent: null,
  trickToast: null,
  propHitCounters: {},
  propHitTimestamps: {},
  lastPropHit: null,

  hydrateDailyBest: () => {
    const today = getTodayDailySeedUTC();
    const record = loadDailyBestForSeed(today);
    set({
      dailySeed: today,
      dailyBest: record,
    });
  },

  loadDailyCity: () => {
    clearRoundTimers();
    clearToastTimer();
    const today = getTodayDailySeedUTC();
    const nextCourse = generateCityCourse(today);
    const fields = buildInitialRoundFields(nextCourse, today, today, 'daily');
    const dailyBest = loadDailyBestForSeed(today);
    const startBallPos = fields.ballPosition;

    set((state) => ({
      ...fields,
      dailyBest,
      courseVersion: state.courseVersion + 1,
      resetCounter: state.resetCounter + 1,
      trickToast: null,
      propHitCounters: {},
      propHitTimestamps: {},
      lastPropHit: null,
      pendingBallReset: {
        seq: ++resetSeq,
        position: startBallPos,
        reason: 'tee',
      },
    }));
    get().emitSoundEvent('ui_tap', { intensity: 0.7 });
  },

  loadRandomCity: () => {
    clearRoundTimers();
    clearToastTimer();
    const today = getTodayDailySeedUTC();
    const randomSeed = createRandomSeed();
    const nextCourse = generateCityCourse(randomSeed);
    const fields = buildInitialRoundFields(nextCourse, randomSeed, today, 'random');
    const startBallPos = fields.ballPosition;

    set((state) => ({
      ...fields,
      courseVersion: state.courseVersion + 1,
      resetCounter: state.resetCounter + 1,
      trickToast: null,
      propHitCounters: {},
      propHitTimestamps: {},
      lastPropHit: null,
      pendingBallReset: {
        seq: ++resetSeq,
        position: startBallPos,
        reason: 'tee',
      },
    }));
    get().emitSoundEvent('ui_tap', { intensity: 0.75 });
  },

  loadSeed: (rawSeed: string) => {
    clearRoundTimers();
    clearToastTimer();
    const normalized = rawSeed.trim() || getTodayDailySeedUTC();
    const today = getTodayDailySeedUTC();
    const mode: RoundMode = normalized === today ? 'daily' : 'random';
    const nextCourse = generateCityCourse(normalized);
    const fields = buildInitialRoundFields(nextCourse, normalized, today, mode);

    set((state) => ({
      ...fields,
      dailyBest: mode === 'daily' ? loadDailyBestForSeed(today) : state.dailyBest,
      courseVersion: state.courseVersion + 1,
      resetCounter: state.resetCounter + 1,
      trickToast: null,
      propHitCounters: {},
      propHitTimestamps: {},
      lastPropHit: null,
      pendingBallReset: {
        seq: ++resetSeq,
        position: fields.ballPosition,
        reason: 'tee',
      },
    }));
  },

  restartRound: () => {
    clearRoundTimers();
    clearToastTimer();
    const state = get();
    const fields = buildInitialRoundFields(
      state.course,
      state.seed,
      state.dailySeed,
      state.roundMode,
    );

    set((s) => ({
      ...fields,
      resetCounter: s.resetCounter + 1,
      trickToast: null,
      pendingBallReset: {
        seq: ++resetSeq,
        position: fields.ballPosition,
        reason: 'restart',
      },
    }));
    get().emitSoundEvent('ui_tap', { intensity: 0.7 });
  },

  mulligan: () => {
    const state = get();
    if (state.isRoundComplete || state.ballPhase === 'cupped') return;
    if (state.mulliganStack.length === 0) return;

    clearRoundTimers();
    const prev = state.mulliganStack[state.mulliganStack.length - 1]!;
    const nextStack = state.mulliganStack.slice(0, -1);
    const nextDir = yawToDir(prev.aimYaw);

    set((s) => ({
      ballPhase: 'resting',
      ballPosition: [...prev.origin] as Vec3Tuple,
      lastSafeLie: [...prev.origin] as Vec3Tuple,
      lastSafeAimYaw: prev.aimYaw,
      aimYaw: prev.aimYaw,
      aimDirection: nextDir,
      selectedClub: prev.clubId,
      totalStrokes: prev.totalStrokesBefore,
      currentLegStrokes: prev.currentLegStrokesBefore,
      mulliganStack: nextStack,
      canMulligan: nextStack.length > 0,
      aimPreview: createIdleAimPreview(prev.clubId, prev.origin, nextDir),
      mulliganCounter: s.mulliganCounter + 1,
      pendingBallReset: {
        seq: ++resetSeq,
        position: [...prev.origin] as Vec3Tuple,
        reason: 'mulligan',
      },
    }));
    get().emitSoundEvent('club_switch', { intensity: 0.85 });
  },

  setSelectedClub: (clubId, manual = true) => {
    const state = get();
    if (state.selectedClub === clubId) return;

    const preview = state.aimPreview.isAiming
      ? (() => {
          const traj = computeDeterministicTrajectory({
            origin: state.ballPosition,
            clubId,
            power: state.aimPreview.power,
            aimDirection: state.aimPreview.aimDirection,
            sampleGroundY: (x, z) => getCourseSurfaceElevationAt(state.course, x, z),
          });
          return {
            isAiming: true,
            clubId,
            power: traj.power,
            aimDirection: traj.horizontalDirection,
            launchVelocity: traj.launchVelocity,
            arcPoints: traj.arcPoints,
            landingPoint: traj.landingPoint,
            landingRingRadius: traj.landingRingRadius,
          } satisfies AimPreviewSnapshot;
        })()
      : createIdleAimPreview(clubId, state.ballPosition, state.aimDirection);

    set({
      selectedClub: clubId,
      aimPreview: preview,
    });
    if (manual) {
      get().emitSoundEvent('club_switch', { intensity: 0.8 });
    }
  },

  toggleCameraMode: () => {
    set((state) => ({
      cameraMode: state.cameraMode === 'overview' ? 'focus' : 'overview',
    }));
    get().emitSoundEvent('ui_tap', { intensity: 0.6 });
  },

  setCameraMode: (mode) => {
    if (get().cameraMode === mode) return;
    set({ cameraMode: mode });
  },

  toggleMuted: () => {
    set((state) => ({ muted: !state.muted }));
  },

  setMuted: (muted) => {
    set({ muted });
  },

  setAimYaw: (yaw) => {
    const dir = yawToDir(yaw);
    set({ aimYaw: yaw, aimDirection: dir });
  },

  setAimDirection: (dir) => {
    const normalized = resolveHorizontalAim(dir);
    const yaw = dirToYaw(normalized);
    set({ aimYaw: yaw, aimDirection: normalized });
  },

  setAimPreview: (preview) => {
    const state = get();
    const nextPhase: BallPhase =
      state.ballPhase === 'inflight' ||
      state.ballPhase === 'hazard_drop' ||
      state.ballPhase === 'cupped'
        ? state.ballPhase
        : preview.isAiming
          ? 'aiming'
          : 'resting';
    const nextYaw = dirToYaw(preview.aimDirection);
    set({
      aimPreview: preview,
      aimDirection: resolveHorizontalAim(preview.aimDirection),
      aimYaw: nextYaw,
      ballPhase: nextPhase,
    });
  },

  clearAimPreview: () => {
    const state = get();
    const nextPhase: BallPhase =
      state.ballPhase === 'aiming' ? 'resting' : state.ballPhase;
    set({
      ballPhase: nextPhase,
      aimPreview: createIdleAimPreview(
        state.selectedClub,
        state.ballPosition,
        state.aimDirection,
      ),
    });
  },

  launchShot: ({ origin, clubId, power, aimDirection, launchVelocity }) => {
    const state = get();
    if (
      state.ballPhase === 'inflight' ||
      state.ballPhase === 'hazard_drop' ||
      state.ballPhase === 'cupped' ||
      state.isRoundComplete
    ) {
      return;
    }

    const dir = resolveHorizontalAim(aimDirection);
    const yaw = dirToYaw(dir);
    const computedVel =
      launchVelocity ??
      computeDeterministicTrajectory({
        origin,
        clubId,
        power,
        aimDirection: dir,
      }).launchVelocity;

    const snapshot: MulliganSnapshot = {
      origin: [...origin] as Vec3Tuple,
      aimYaw: yaw,
      clubId,
      totalStrokesBefore: state.totalStrokes,
      currentLegStrokesBefore: state.currentLegStrokes,
    };

    const nextStack = [...state.mulliganStack, snapshot];
    const shot: ShotCommand = {
      seq: ++shotSeq,
      origin: [...origin] as Vec3Tuple,
      clubId,
      power,
      aimDirection: dir,
      aimYaw: yaw,
      launchVelocity: computedVel,
    };

    set({
      ballPhase: 'inflight',
      hasTakenFirstStroke: true,
      lastSafeLie: [...origin] as Vec3Tuple,
      lastSafeAimYaw: yaw,
      aimYaw: yaw,
      aimDirection: dir,
      totalStrokes: state.totalStrokes + 1,
      currentLegStrokes: state.currentLegStrokes + 1,
      lastShot: shot,
      mulliganStack: nextStack,
      canMulligan: true,
      aimPreview: createIdleAimPreview(clubId, origin, dir),
    });

    const soundMap: Record<ClubId, SoundEventType> = {
      driver: 'hit_driver',
      wedge: 'hit_wedge',
      skimmer: 'hit_skimmer',
      putter: 'hit_putter',
    };
    get().emitSoundEvent(soundMap[clubId], {
      intensity: Math.max(0.35, Math.min(1, power)),
    });
  },

  updateBallPosition: (pos) => {
    set({ ballPosition: pos });
  },

  markBallResting: (pos) => {
    const state = get();
    if (
      state.ballPhase === 'cupped' ||
      state.ballPhase === 'hazard_drop' ||
      state.isRoundComplete
    ) {
      return;
    }

    const nearest = findNearestUnsunkFlag(state.course, pos, state.sunkFlags);
    const nextYaw = nearest ? computeAimYawToFlag(pos, nearest) : state.aimYaw;
    const nextDir = yawToDir(nextYaw);
    const autoPutter = shouldAutoSelectPutter(state.course, pos, state.sunkFlags);
    const nextClub: ClubId = autoPutter ? 'putter' : state.selectedClub;

    set({
      ballPhase: 'resting',
      ballPosition: [...pos] as Vec3Tuple,
      lastSafeLie: [...pos] as Vec3Tuple,
      lastSafeAimYaw: nextYaw,
      aimYaw: nextYaw,
      aimDirection: nextDir,
      selectedClub: nextClub,
      activeTargetFlag: nearest?.color ?? null,
      aimPreview: createIdleAimPreview(nextClub, pos, nextDir),
    });
  },

  sinkFlag: (color) => {
    const state = get();
    if (state.sunkFlags[color] || state.isRoundComplete) return;

    const flag = state.course.flags.find((f) => f.color === color);
    if (!flag) return;

    clearRoundTimers();

    const legStrokes = Math.max(1, state.currentLegStrokes);
    const orderIndex = state.sunkOrder.length;
    const nextSunkFlags: Record<FlagColor, boolean> = {
      ...state.sunkFlags,
      [color]: true,
    };
    const entry: SunkFlagEntry = {
      color,
      strokes: legStrokes,
      orderIndex,
    };
    const nextSunkOrder = [...state.sunkOrder, entry];
    const allDone = nextSunkOrder.length >= FLAG_COLORS.length;
    const cupBallPos: Vec3Tuple = [
      flag.position[0],
      flag.position[1] - 0.06,
      flag.position[2],
    ];

    let nextDailyBest = state.dailyBest;
    if (allDone && state.roundMode === 'daily') {
      const candidate: DailyBestRecord = {
        dateSeed: state.seed,
        bestStrokes: state.totalStrokes,
        sunkOrder: nextSunkOrder,
      };
      nextDailyBest = persistDailyBestForSeed(candidate) ?? candidate;
    }

    set({
      sunkFlags: nextSunkFlags,
      sunkOrder: nextSunkOrder,
      currentLegStrokes: 0,
      isRoundComplete: allDone,
      lastSunkFlag: entry,
      lastCupSunkAtMs: Date.now(),
      ballPhase: 'cupped',
      ballPosition: cupBallPos,
      activeTargetFlag: allDone ? null : state.activeTargetFlag,
      dailyBest: nextDailyBest,
      mulliganStack: [],
      canMulligan: false,
      aimPreview: createIdleAimPreview(
        state.selectedClub,
        cupBallPos,
        state.aimDirection,
      ),
    });

    get().emitSoundEvent('cup_rattle', { intensity: 1.0, flagIndex: orderIndex });

    const expectedVersion = state.courseVersion;
    const expectedReset = state.resetCounter;

    activeChimeTimer = setTimeout(() => {
      activeChimeTimer = null;
      const latest = get();
      if (
        latest.courseVersion !== expectedVersion ||
        latest.resetCounter !== expectedReset
      ) {
        return;
      }
      latest.emitSoundEvent('flag_chime', {
        intensity: 1.0,
        flagIndex: orderIndex,
      });
    }, 110);

    if (allDone) {
      activeFanfareTimer = setTimeout(() => {
        activeFanfareTimer = null;
        const latest = get();
        if (
          latest.courseVersion !== expectedVersion ||
          latest.resetCounter !== expectedReset ||
          !latest.isRoundComplete
        ) {
          return;
        }
        latest.emitSoundEvent('round_fanfare', {
          intensity: 1.0,
          flagIndex: orderIndex,
        });
      }, 360);
      return;
    }

    // Advance cleanly onto the sunk cup's flat apron (`nextTeePosition`) ready for any remaining flag!
    activeCupTransitionTimer = setTimeout(() => {
      activeCupTransitionTimer = null;
      const latest = get();
      if (
        latest.courseVersion !== expectedVersion ||
        latest.resetCounter !== expectedReset ||
        latest.isRoundComplete ||
        latest.ballPhase !== 'cupped'
      ) {
        return;
      }
      const nextBallPos = surfaceToBallCenter(flag.nextTeePosition);
      const nearest = findNearestUnsunkFlag(
        latest.course,
        nextBallPos,
        latest.sunkFlags,
      );
      const nextYaw = nearest
        ? computeAimYawToFlag(nextBallPos, nearest)
        : latest.aimYaw;
      const nextDir = yawToDir(nextYaw);
      const nextClub: ClubId = shouldAutoSelectPutter(
        latest.course,
        nextBallPos,
        latest.sunkFlags,
      )
        ? 'putter'
        : 'driver';

      set({
        ballPhase: 'resting',
        ballPosition: nextBallPos,
        lastSafeLie: [...nextBallPos] as Vec3Tuple,
        lastSafeAimYaw: nextYaw,
        aimYaw: nextYaw,
        aimDirection: nextDir,
        selectedClub: nextClub,
        activeTargetFlag: nearest?.color ?? null,
        aimPreview: createIdleAimPreview(nextClub, nextBallPos, nextDir),
        pendingBallReset: {
          seq: ++resetSeq,
          position: nextBallPos,
          reason: 'next_tee',
        },
      });
    }, 620);
  },

  triggerWaterHazard: (reason = 'water') => {
    const state = get();
    if (
      state.ballPhase === 'hazard_drop' ||
      state.ballPhase === 'cupped' ||
      state.isRoundComplete
    ) {
      return;
    }

    if (activeHazardTimer !== null) {
      clearTimeout(activeHazardTimer);
      activeHazardTimer = null;
    }

    const safeOrigin = [...state.lastSafeLie] as Vec3Tuple;
    const safeYaw = state.lastSafeAimYaw;
    const expectedVersion = state.courseVersion;
    const expectedReset = state.resetCounter;

    set({
      ballPhase: 'hazard_drop',
      totalStrokes: state.totalStrokes + 1,
      currentLegStrokes: state.currentLegStrokes + 1,
    });

    get().emitSoundEvent('water_plop', { intensity: 1.0 });
    get().emitTrickToast(
      'water_penalty',
      reason === 'water' ? 'Water +1' : 'Out of Bounds +1',
    );

    activeHazardTimer = setTimeout(() => {
      activeHazardTimer = null;
      const latest = get();
      if (
        latest.courseVersion !== expectedVersion ||
        latest.resetCounter !== expectedReset ||
        latest.ballPhase !== 'hazard_drop' ||
        latest.isRoundComplete
      ) {
        return;
      }

      const nextDir = yawToDir(safeYaw);
      const autoPutter = shouldAutoSelectPutter(
        latest.course,
        safeOrigin,
        latest.sunkFlags,
      );
      const nextClub: ClubId = autoPutter ? 'putter' : latest.selectedClub;

      set({
        ballPhase: 'resting',
        ballPosition: safeOrigin,
        aimYaw: safeYaw,
        aimDirection: nextDir,
        selectedClub: nextClub,
        aimPreview: createIdleAimPreview(nextClub, safeOrigin, nextDir),
        pendingBallReset: {
          seq: ++resetSeq,
          position: safeOrigin,
          reason: 'hazard',
        },
      });
    }, 400);
  },

  consumeBallReset: (seq) => {
    set((state) =>
      state.pendingBallReset?.seq === seq ? { pendingBallReset: null } : {},
    );
  },

  recordPropHit: (propId, propType, toastKind, toastLabel) => {
    const nowMs = Date.now();
    const seq = ++propHitSeq;
    set((state) => ({
      propHitCounters: {
        ...state.propHitCounters,
        [propId]: (state.propHitCounters[propId] ?? 0) + 1,
        [propType]: (state.propHitCounters[propType] ?? 0) + 1,
      },
      propHitTimestamps: {
        ...state.propHitTimestamps,
        [propId]: nowMs,
        [propType]: nowMs,
      },
      lastPropHit: {
        seq,
        propId,
        propType,
        timestampMs: nowMs,
      },
    }));

    if (toastKind && toastLabel) {
      get().emitTrickToast(toastKind, toastLabel);
    }
  },

  emitSoundEvent: (type, opts) => {
    const nextSeq = ++soundSeq;
    set({
      soundEventSeq: nextSeq,
      lastSoundEvent: {
        seq: nextSeq,
        type,
        intensity: opts?.intensity ?? 1.0,
        flagIndex: opts?.flagIndex,
      },
    });
  },

  emitTrickToast: (kind, label) => {
    clearToastTimer();
    const seq = ++toastSeq;
    set({
      trickToast: {
        seq,
        kind,
        label,
      },
    });
    activeToastTimer = setTimeout(() => {
      activeToastTimer = null;
      set((state) => (state.trickToast?.seq === seq ? { trickToast: null } : {}));
    }, 1350);
  },

  clearTrickToast: (seq) => {
    if (seq === undefined) {
      clearToastTimer();
      set({ trickToast: null });
      return;
    }
    set((state) => (state.trickToast?.seq === seq ? { trickToast: null } : {}));
  },

  notifyScorecardCopied: () => {
    get().emitTrickToast('scorecard_copied', 'Copied Scorecard!');
    get().emitSoundEvent('ui_tap', { intensity: 0.85 });
  },
}));
