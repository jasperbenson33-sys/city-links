'use client';

import { create } from 'zustand';
import {
  BALL_RADIUS,
  type BallPhase,
  type CameraMode,
  type ClubId,
  type FlagColor,
  type GeneratedCityCourse,
  type PhysicsSurfaceTag,
  type RoundMode,
  type SoundEventPayload,
  type SoundEventType,
  type TrickToastKind,
  type Vec3Tuple,
} from '@/types';

export interface AimPreviewState {
  isAiming: boolean;
  power: number;
  clubId: ClubId;
  aimDirection: [number, number];
}

export interface ShotRecord {
  clubId: ClubId;
  power: number;
  aimDirection: [number, number];
  launchSpeed: number;
  timestamp: number;
}

export interface TrickToastState {
  seq: number;
  kind: TrickToastKind;
  label: string;
}
import {
  COURSE_MASTER_PLAN,
  FOUNTAIN_QUICK_DROP_POSITION,
  HOLE_1_CUP,
  TEE_POSITION,
  buildLegacyCourseAdapter,
  getMasterPlanSurfaceTagAt,
} from '@/config/courseMasterPlan';
import { computeClubLaunchVelocity, resolveHorizontalAim } from '@/lib/aerodynamics';
import { recommendClubForLie } from '@/lib/clubs';
import { soundEngine } from '@/lib/sound';

export type ShotPhase =
  | 'aiming'
  | 'pulling'
  | 'ball_in_flight'
  | 'settling'
  | 'fountain_drop'
  | 'holed_out';

export interface PendingShotPayload {
  seq: number;
  clubId: ClubId;
  power: number;
  aimYaw: number;
  launchVelocity: Vec3Tuple;
  forceSteamActive: boolean | null;
}

export interface PendingTeleportPayload {
  seq: number;
  position: Vec3Tuple;
}

export interface CurbsideState {
  // Master hole metadata
  holeNumber: 1;
  holeName: string;
  par: 4;
  holeDistanceMeters: number;
  course: GeneratedCityCourse;

  // Player & hole state
  strokes: number;
  totalStrokes: number;
  penaltyStrokes: number;
  personalBest: number | null;
  dailyBest: { bestStrokes: number; dateKey: string } | null;
  selectedClub: ClubId;
  manualClubOverride: boolean;

  shotPhase: ShotPhase;
  ballPhase: BallPhase;
  aimYaw: number;
  aimDirection: [number, number];
  aimPower: number;
  aimPreview: AimPreviewState;

  ballPosition: Vec3Tuple;
  lastSafeBallPosition: Vec3Tuple;
  lastSafeLie: Vec3Tuple;
  distanceToPinMeters: number;
  currentSurfaceTag: PhysicsSurfaceTag;

  // Camera & audit state
  isStreetScoutActive: boolean;
  cameraMode: CameraMode;
  cameraAuditStationId: string | null;

  // Audio, FX, banners & props
  isMuted: boolean;
  muted: boolean;
  isHoleComplete: boolean;
  isRoundComplete: boolean;
  lastEventBanner: string | null;
  trickToast: TrickToastState | null;
  propHitTimestamps: Record<string, number>;
  forceSteamActive: boolean | null;

  // Shot & sync telemetry
  hasTakenFirstStroke: boolean;
  lastShot: ShotRecord | null;
  pendingShot: PendingShotPayload | null;
  pendingTeleport: PendingTeleportPayload | null;
  pendingBallReset: boolean;
  soundEventSeq: number;
  lastSoundEvent: SoundEventPayload | null;

  // Legacy harmless fields
  roundMode: RoundMode;
  sunkFlags: Partial<Record<FlagColor, boolean>>;
  sunkOrder: FlagColor[];

  // Actions
  hydratePersonalBest: () => void;
  hydrateDailyBest: () => void;
  selectClub: (club: ClubId, manual?: boolean) => void;
  setSelectedClub: (club: ClubId, manual?: boolean) => void;

  setAimYaw: (yaw: number) => void;
  setAimPower: (power: number) => void;
  setShotPhase: (phase: ShotPhase) => void;
  setAimPreview: (preview: Partial<AimPreviewState>) => void;
  clearAimPreview: () => void;

  setStreetScout: (active: boolean) => void;
  toggleStreetScout: () => void;
  toggleCameraMode: () => void;
  setCameraAuditStation: (id: string | null) => void;

  toggleMute: () => void;
  toggleMuted: () => void;

  setForceSteamActive: (val: boolean | null) => void;
  recordPropHit: (id: string, banner?: string) => void;
  setEventBanner: (banner: string | null, kind?: TrickToastKind) => void;
  showTrickToast: (kind: TrickToastKind, label: string) => void;
  emitSoundEvent: (
    type: SoundEventType,
    intensity?: number,
    flagIndex?: number,
  ) => void;

  updateBallTelemetry: (pos: Vec3Tuple, surface?: PhysicsSurfaceTag) => void;
  launchShot: (opts?: {
    clubId?: ClubId;
    power?: number;
    aimYaw?: number;
    forceSteamActive?: boolean | null;
  }) => PendingShotPayload | null;
  markBallResting: (pos: Vec3Tuple, opts?: { autoSelectClub?: boolean }) => void;
  teleportBall: (pos: Vec3Tuple, opts?: { keepStrokes?: boolean }) => void;
  consumeBallReset: () => void;
  triggerFountainHazard: (dropPos?: Vec3Tuple) => void;
  triggerWaterHazard: () => void;
  sinkHole: () => void;
  sinkFlag: (color?: FlagColor) => void;

  replayHole: () => void;
  resetHole: () => void;
  resetCourse: () => void;
  restartRound: () => void;
}

const BEST_STORAGE_KEY = 'curbside_links_hole1_personal_best_v2';
const MUTE_STORAGE_KEY = 'curbside_links_muted_v2';

const INITIAL_BALL_POS: Vec3Tuple = [
  TEE_POSITION[0],
  TEE_POSITION[1] + BALL_RADIUS,
  TEE_POSITION[2],
];

const INITIAL_DIST_TO_PIN = Math.hypot(
  HOLE_1_CUP.position[0] - INITIAL_BALL_POS[0],
  HOLE_1_CUP.position[2] - INITIAL_BALL_POS[2],
);

const LEGACY_COURSE_ADAPTER = buildLegacyCourseAdapter(COURSE_MASTER_PLAN);

function computeDistance(pos: Vec3Tuple): number {
  return Math.hypot(
    HOLE_1_CUP.position[0] - pos[0],
    HOLE_1_CUP.position[2] - pos[2],
  );
}

function mapShotPhaseToBallPhase(shotPhase: ShotPhase): BallPhase {
  switch (shotPhase) {
    case 'pulling':
      return 'aiming';
    case 'ball_in_flight':
    case 'settling':
      return 'inflight';
    case 'fountain_drop':
      return 'hazard_drop';
    case 'holed_out':
      return 'cupped';
    case 'aiming':
    default:
      return 'resting';
  }
}

function readStoredBest(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(BEST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 1 ? Math.round(parsed) : null;
  } catch {
    return null;
  }
}

function writeStoredBest(val: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BEST_STORAGE_KEY, String(Math.round(val)));
  } catch {
    // Ignore private-mode storage errors
  }
}

function readStoredMute(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStoredMute(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Ignore storage errors
  }
}

let trickToastCounter = 0;
let shotSeqCounter = 0;
let teleportSeqCounter = 0;

function createInitialHoleSlice() {
  return {
    strokes: 0,
    totalStrokes: 0,
    penaltyStrokes: 0,
    selectedClub: 'driver' as ClubId,
    manualClubOverride: false,
    shotPhase: 'aiming' as ShotPhase,
    ballPhase: 'resting' as BallPhase,
    aimYaw: COURSE_MASTER_PLAN.initialAimYaw,
    aimDirection: resolveHorizontalAim(
      undefined,
      COURSE_MASTER_PLAN.initialAimYaw,
    ),
    aimPower: 0,
    aimPreview: {
      isAiming: false,
      power: 0,
      clubId: 'driver' as ClubId,
      aimDirection: resolveHorizontalAim(
        undefined,
        COURSE_MASTER_PLAN.initialAimYaw,
      ),
    },
    ballPosition: [...INITIAL_BALL_POS] as Vec3Tuple,
    lastSafeBallPosition: [...INITIAL_BALL_POS] as Vec3Tuple,
    lastSafeLie: [...INITIAL_BALL_POS] as Vec3Tuple,
    distanceToPinMeters: INITIAL_DIST_TO_PIN,
    currentSurfaceTag: getMasterPlanSurfaceTagAt(
      INITIAL_BALL_POS[0],
      INITIAL_BALL_POS[2],
    ),
    isStreetScoutActive: false,
    cameraMode: 'follow' as CameraMode,
    cameraAuditStationId: null,
    isHoleComplete: false,
    isRoundComplete: false,
    lastEventBanner: null,
    trickToast: null,
    propHitTimestamps: {},
    forceSteamActive: null,
    hasTakenFirstStroke: false,
    lastShot: null,
    pendingShot: null,
    pendingBallReset: false,
    sunkFlags: {},
    sunkOrder: [] as FlagColor[],
  };
}

export const useCurbsideStore = create<CurbsideState>((set, get) => ({
  holeNumber: 1,
  holeName: '5th & Mercer',
  par: 4,
  holeDistanceMeters: COURSE_MASTER_PLAN.targetCenterlineMeters,
  course: LEGACY_COURSE_ADAPTER,

  personalBest: null,
  dailyBest: null,
  isMuted: false,
  muted: false,
  soundEventSeq: 0,
  lastSoundEvent: null,
  pendingTeleport: null,
  roundMode: 'hole1',

  ...createInitialHoleSlice(),

  hydratePersonalBest: () => {
    const best = readStoredBest();
    const muted = readStoredMute();
    soundEngine.setMuted(muted);
    set({
      personalBest: best,
      dailyBest:
        best !== null ? { bestStrokes: best, dateKey: 'hole-1' } : null,
      isMuted: muted,
      muted,
    });
  },

  hydrateDailyBest: () => {
    get().hydratePersonalBest();
  },

  selectClub: (club, manual = true) => {
    const current = get().selectedClub;
    if (current !== club) {
      soundEngine.playUiClick(0.8);
    }
    set((state) => ({
      selectedClub: club,
      manualClubOverride: manual,
      aimPreview: { ...state.aimPreview, clubId: club },
    }));
  },

  setSelectedClub: (club, manual = true) => {
    get().selectClub(club, manual);
  },

  setAimYaw: (yaw) => {
    const cleanYaw = Number.isFinite(yaw) ? yaw : 0;
    const dir = resolveHorizontalAim(undefined, cleanYaw);
    set((state) => ({
      aimYaw: cleanYaw,
      aimDirection: dir,
      aimPreview: { ...state.aimPreview, aimDirection: dir },
    }));
  },

  setAimPower: (power) => {
    const p = Math.max(0, Math.min(1, Number.isFinite(power) ? power : 0));
    set((state) => {
      const nextPhase: ShotPhase =
        p > 0.02 && state.shotPhase === 'aiming'
          ? 'pulling'
          : p <= 0.02 && state.shotPhase === 'pulling'
            ? 'aiming'
            : state.shotPhase;
      return {
        aimPower: p,
        shotPhase: nextPhase,
        ballPhase: mapShotPhaseToBallPhase(nextPhase),
        aimPreview: {
          ...state.aimPreview,
          isAiming: p > 0.02,
          power: p,
          clubId: state.selectedClub,
        },
      };
    });
  },

  setShotPhase: (phase) => {
    set({
      shotPhase: phase,
      ballPhase: mapShotPhaseToBallPhase(phase),
    });
  },

  setAimPreview: (preview) => {
    set((state) => {
      const power = preview.power ?? state.aimPower;
      const aimDirection = preview.aimDirection ?? state.aimDirection;
      const aimYaw = preview.aimDirection
        ? Math.atan2(aimDirection[0], -aimDirection[1])
        : state.aimYaw;
      return {
        aimPower: power,
        aimDirection,
        aimYaw,
        aimPreview: { ...state.aimPreview, ...preview },
      };
    });
  },

  clearAimPreview: () => {
    set((state) => ({
      aimPower: 0,
      aimPreview: {
        isAiming: false,
        power: 0,
        clubId: state.selectedClub,
        aimDirection: state.aimDirection,
      },
    }));
  },

  setStreetScout: (active) => {
    set({
      isStreetScoutActive: active,
      cameraMode: active ? 'street_scout' : 'follow',
      cameraAuditStationId: active ? null : get().cameraAuditStationId,
    });
  },

  toggleStreetScout: () => {
    const next = !get().isStreetScoutActive;
    soundEngine.playUiClick(0.75);
    get().setStreetScout(next);
  },

  toggleCameraMode: () => {
    get().toggleStreetScout();
  },

  setCameraAuditStation: (id) => {
    set({
      cameraAuditStationId: id,
      isStreetScoutActive: false,
      cameraMode: 'follow',
    });
  },

  toggleMute: () => {
    const next = !get().isMuted;
    soundEngine.setMuted(next);
    writeStoredMute(next);
    set({ isMuted: next, muted: next });
  },

  toggleMuted: () => {
    get().toggleMute();
  },

  setForceSteamActive: (val) => {
    set({ forceSteamActive: val });
  },

  recordPropHit: (id, banner) => {
    const now = Date.now();
    set((state) => {
      const nextTimestamps = { ...state.propHitTimestamps, [id]: now };
      if (!banner) {
        return { propHitTimestamps: nextTimestamps };
      }
      trickToastCounter += 1;
      return {
        propHitTimestamps: nextTimestamps,
        lastEventBanner: banner,
        trickToast: {
          seq: trickToastCounter,
          kind: 'awning_bank',
          label: banner,
        },
      };
    });
  },

  setEventBanner: (banner, kind = 'awning_bank') => {
    if (!banner) {
      set({ lastEventBanner: null });
      return;
    }
    trickToastCounter += 1;
    set({
      lastEventBanner: banner,
      trickToast: {
        seq: trickToastCounter,
        kind,
        label: banner,
      },
    });
  },

  showTrickToast: (kind, label) => {
    get().setEventBanner(label, kind);
  },

  emitSoundEvent: (type, intensity = 0.85, flagIndex) => {
    const nextSeq = get().soundEventSeq + 1;
    const payload: SoundEventPayload = {
      seq: nextSeq,
      type,
      intensity,
      flagIndex,
    };
    soundEngine.playPayload(payload);
    set({
      soundEventSeq: nextSeq,
      lastSoundEvent: payload,
    });
  },

  updateBallTelemetry: (pos, surface) => {
    const resolvedSurface =
      surface ?? getMasterPlanSurfaceTagAt(pos[0], pos[2]);
    set({
      ballPosition: pos,
      distanceToPinMeters: computeDistance(pos),
      currentSurfaceTag: resolvedSurface,
    });
  },

  launchShot: (opts) => {
    const state = get();
    if (
      state.isHoleComplete ||
      state.shotPhase === 'ball_in_flight' ||
      state.shotPhase === 'fountain_drop'
    ) {
      return null;
    }

    const clubId = opts?.clubId ?? state.selectedClub;
    const rawPower = opts?.power ?? state.aimPower;
    const power = Math.max(0, Math.min(1, rawPower));
    if (power < 0.04) {
      set({
        aimPower: 0,
        shotPhase: 'aiming',
        ballPhase: 'resting',
        aimPreview: {
          ...state.aimPreview,
          isAiming: false,
          power: 0,
        },
      });
      return null;
    }

    const aimYaw = opts?.aimYaw ?? state.aimYaw;
    const aimDir = resolveHorizontalAim(undefined, aimYaw);
    const launchVelocity = computeClubLaunchVelocity(clubId, power, aimDir);
    shotSeqCounter += 1;
    const nextSeq = shotSeqCounter;
    const nextStrokes = state.strokes + 1;

    const payload: PendingShotPayload = {
      seq: nextSeq,
      clubId,
      power,
      aimYaw,
      launchVelocity,
      forceSteamActive:
        opts?.forceSteamActive !== undefined
          ? opts.forceSteamActive
          : state.forceSteamActive,
    };

    soundEngine.playClubStrike(clubId, power);

    set({
      strokes: nextStrokes,
      totalStrokes: nextStrokes,
      selectedClub: clubId,
      shotPhase: 'ball_in_flight',
      ballPhase: 'inflight',
      aimYaw,
      aimDirection: aimDir,
      aimPower: 0,
      hasTakenFirstStroke: true,
      isStreetScoutActive: false,
      cameraMode: 'follow',
      cameraAuditStationId: null,
      lastEventBanner: null,
      lastSafeBallPosition: [...state.ballPosition],
      lastSafeLie: [...state.ballPosition],
      forceSteamActive:
        opts?.forceSteamActive !== undefined
          ? opts.forceSteamActive
          : state.forceSteamActive,
      aimPreview: {
        isAiming: false,
        power: 0,
        clubId,
        aimDirection: aimDir,
      },
      lastShot: {
        clubId,
        power,
        aimDirection: aimDir,
        launchSpeed: Math.hypot(...launchVelocity),
        timestamp: Date.now(),
      },
      pendingShot: payload,
    });

    return payload;
  },

  markBallResting: (pos, opts) => {
    const surface = getMasterPlanSurfaceTagAt(pos[0], pos[2]);
    const dist = computeDistance(pos);
    const recommended = recommendClubForLie(pos, surface);
    const nextAimYaw = Math.atan2(
      HOLE_1_CUP.position[0] - pos[0],
      -(HOLE_1_CUP.position[2] - pos[2]),
    );
    const shouldAutoClub = opts?.autoSelectClub !== false;

    set((state) => {
      const nextClub = shouldAutoClub ? recommended : state.selectedClub;
      // Preserve player's street aim unless they moved meaningfully onto green/courtyard
      const yawToUse =
        state.hasTakenFirstStroke && dist < 35 ? nextAimYaw : state.aimYaw;
      const aimDir = resolveHorizontalAim(undefined, yawToUse);
      return {
        ballPosition: [...pos],
        lastSafeBallPosition: [...pos],
        lastSafeLie: [...pos],
        distanceToPinMeters: dist,
        currentSurfaceTag: surface,
        shotPhase: 'aiming',
        ballPhase: 'resting',
        selectedClub: nextClub,
        manualClubOverride: !shouldAutoClub,
        aimYaw: yawToUse,
        aimDirection: aimDir,
        aimPower: 0,
        aimPreview: {
          isAiming: false,
          power: 0,
          clubId: nextClub,
          aimDirection: aimDir,
        },
      };
    });
  },

  teleportBall: (pos) => {
    const surface = getMasterPlanSurfaceTagAt(pos[0], pos[2]);
    const dist = computeDistance(pos);
    teleportSeqCounter += 1;
    const nextSeq = teleportSeqCounter;
    const recommended = recommendClubForLie(pos, surface);
    set((state) => ({
      ballPosition: [...pos],
      lastSafeBallPosition: [...pos],
      lastSafeLie: [...pos],
      distanceToPinMeters: dist,
      currentSurfaceTag: surface,
      shotPhase: 'aiming',
      ballPhase: 'resting',
      aimPower: 0,
      selectedClub: recommended,
      isHoleComplete: false,
      isRoundComplete: false,
      pendingTeleport: { seq: nextSeq, position: [...pos] },
      pendingBallReset: true,
      aimPreview: {
        ...state.aimPreview,
        isAiming: false,
        power: 0,
        clubId: recommended,
      },
    }));
  },

  consumeBallReset: () => {
    set({ pendingBallReset: false });
  },

  triggerFountainHazard: (dropPos) => {
    const state = get();
    if (state.isHoleComplete || state.shotPhase === 'fountain_drop') return;
    const safeDrop: Vec3Tuple = dropPos
      ? [...dropPos]
      : [
          FOUNTAIN_QUICK_DROP_POSITION[0],
          FOUNTAIN_QUICK_DROP_POSITION[1] + BALL_RADIUS,
          FOUNTAIN_QUICK_DROP_POSITION[2],
        ];
    const nextStrokes = state.strokes + 1;
    const nextPenalties = state.penaltyStrokes + 1;
    teleportSeqCounter += 1;
    const nextSeq = teleportSeqCounter;
    const yawToCup = Math.atan2(
      HOLE_1_CUP.position[0] - safeDrop[0],
      -(HOLE_1_CUP.position[2] - safeDrop[2]),
    );
    const dirToCup = resolveHorizontalAim(undefined, yawToCup);

    soundEngine.playFountainSplash(0.95);
    trickToastCounter += 1;

    set({
      strokes: nextStrokes,
      totalStrokes: nextStrokes,
      penaltyStrokes: nextPenalties,
      shotPhase: 'aiming',
      ballPhase: 'resting',
      ballPosition: safeDrop,
      lastSafeBallPosition: safeDrop,
      lastSafeLie: safeDrop,
      distanceToPinMeters: computeDistance(safeDrop),
      currentSurfaceTag: 'courtyard_paver',
      selectedClub: 'putter',
      aimYaw: yawToCup,
      aimDirection: dirToCup,
      aimPower: 0,
      lastEventBanner: 'Fountain Hazard +1',
      trickToast: {
        seq: trickToastCounter,
        kind: 'water_penalty',
        label: 'Fountain Hazard +1',
      },
      pendingTeleport: { seq: nextSeq, position: safeDrop },
      pendingBallReset: true,
      aimPreview: {
        isAiming: false,
        power: 0,
        clubId: 'putter',
        aimDirection: dirToCup,
      },
    });
  },

  triggerWaterHazard: () => {
    get().triggerFountainHazard();
  },

  sinkHole: () => {
    const state = get();
    if (state.isHoleComplete) return;
    const total = Math.max(1, state.strokes);
    const prevBest = state.personalBest;
    const nextBest = prevBest === null ? total : Math.min(prevBest, total);
    if (nextBest !== prevBest) {
      writeStoredBest(nextBest);
    }

    soundEngine.playCupDrop(1.0);
    const banner =
      total === 1
        ? 'Hole-in-One!'
        : total <= 2
          ? 'Eagle!'
          : total === 3
            ? 'Birdie!'
            : total === 4
              ? 'Par!'
              : 'Holed Out!';
    trickToastCounter += 1;

    set({
      strokes: total,
      totalStrokes: total,
      shotPhase: 'holed_out',
      ballPhase: 'cupped',
      isHoleComplete: true,
      isRoundComplete: true,
      personalBest: nextBest,
      dailyBest: { bestStrokes: nextBest, dateKey: 'hole-1' },
      distanceToPinMeters: 0,
      currentSurfaceTag: 'putting_green_turf',
      lastEventBanner: banner,
      trickToast: {
        seq: trickToastCounter,
        kind: 'scorecard_copied',
        label: banner,
      },
      sunkFlags: { yellow: true },
      sunkOrder: ['yellow'],
    });
  },

  sinkFlag: () => {
    get().sinkHole();
  },

  replayHole: () => {
    soundEngine.playUiClick(0.9);
    teleportSeqCounter += 1;
    const nextSeq = teleportSeqCounter;
    set({
      ...createInitialHoleSlice(),
      pendingTeleport: { seq: nextSeq, position: [...INITIAL_BALL_POS] },
      pendingBallReset: true,
    });
  },

  resetHole: () => {
    get().replayHole();
  },

  resetCourse: () => {
    get().replayHole();
  },

  restartRound: () => {
    get().replayHole();
  },
}));
