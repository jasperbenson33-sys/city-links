'use client';

import { create } from 'zustand';
import {
  AUTO_PUTTER_DISTANCE,
  BALL_RADIUS,
  type BallPhase,
  type CameraMode,
  type ClubId,
  type CourseId,
  type CourseMasterPlan,
  type FlagColor,
  type GeneratedCityCourse,
  type GrandEscapadeZoneNumber,
  type PhysicsSurfaceTag,
  type QaTeleportZoneSpec,
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
  buildLegacyCourseAdapter,
  getMasterPlanSurfaceTagAt,
} from '@/config/courseMasterPlan';
import {
  DEFAULT_ACTIVE_COURSE_ID,
  computeForwardCourseYaw,
  computeRemainingCourseDistance,
  getEscapadeZoneAtPosition,
  getMasterPlanByCourseId,
  isSubterraneanSubwayPosition,
  resolveCourseIdFromSearchParams,
  resolveQaTeleportZone,
} from '@/config/grandEscapadeMasterPlan';
import { computeClubLaunchVelocity, resolveHorizontalAim } from '@/lib/aerodynamics';
import { recommendClubForLie } from '@/lib/clubs';
import { soundEngine } from '@/lib/sound';
import {
  FOUNTAIN_DROP_DURATION_SEC,
  OOB_RECOVERY_DURATION_SEC,
} from '@/physics';

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

export interface PendingFountainDropPayload {
  seq: number;
  from: Vec3Tuple;
  to: Vec3Tuple;
  durationSec: number;
}

export interface CurbsideState {
  // Master hole metadata & active Stage 1 / Stage 2 plan
  courseId: CourseId;
  activePlan: CourseMasterPlan;
  holeNumber: 1;
  holeName: string;
  par: number;
  holeDistanceMeters: number;
  course: GeneratedCityCourse;

  // Stage 2 Multi-Zone Telemetry
  activeZoneNumber: GrandEscapadeZoneNumber;
  activeZoneName: string;
  activeZoneElevationLabel: string;
  isSubterranean: boolean;

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
  isCourseFlyoverActive: boolean;
  flyoverProgress: number | null;
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
  hasUsedQaTeleport: boolean;
  lastShot: ShotRecord | null;
  pendingShot: PendingShotPayload | null;
  pendingTeleport: PendingTeleportPayload | null;
  pendingFountainDrop: PendingFountainDropPayload | null;
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
  setCourse: (courseId: CourseId) => void;
  teleportToZone: (
    zoneNumber: GrandEscapadeZoneNumber | number,
    opts?: { silent?: boolean },
  ) => QaTeleportZoneSpec | null;
  selectClub: (club: ClubId, manual?: boolean) => void;
  setSelectedClub: (club: ClubId, manual?: boolean) => void;

  setAimYaw: (yaw: number) => void;
  setAimPower: (power: number) => void;
  setShotPhase: (phase: ShotPhase) => void;
  setAimPreview: (preview: Partial<AimPreviewState>) => void;
  clearAimPreview: () => void;

  setStreetScout: (active: boolean) => void;
  toggleStreetScout: () => void;
  setCourseFlyover: (active: boolean, progress?: number | null) => void;
  toggleCourseFlyover: () => void;
  setFlyoverProgress: (progress: number | null) => void;
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
  teleportBall: (
    pos: Vec3Tuple,
    opts?: { keepStrokes?: boolean; seedStrokes?: number },
  ) => void;
  consumeBallReset: () => void;
  triggerFountainHazard: (dropPos?: Vec3Tuple, splashPos?: Vec3Tuple) => void;
  triggerOobHazard: (oobPos?: Vec3Tuple) => void;
  completeFountainDrop: (seq?: number) => void;
  triggerWaterHazard: () => void;
  sinkHole: () => void;
  sinkFlag: (color?: FlagColor) => void;

  replayHole: () => void;
  resetHole: () => void;
  resetCourse: () => void;
  restartRound: () => void;
}

const BEST_STORAGE_KEY_BY_COURSE: Record<CourseId, string> = {
  classic: 'curbside_links_hole1_personal_best_v2',
  'grand-escapade': 'curbside_links_grand_escapade_personal_best_v1',
};
const MUTE_STORAGE_KEY = 'curbside_links_muted_v2';

function resolvePlanCourseId(plan: CourseMasterPlan): CourseId {
  return plan.courseId ?? 'classic';
}

const LEGACY_COURSE_ADAPTER_CACHE = new Map<CourseId, GeneratedCityCourse>();
function getLegacyCourseAdapter(plan: CourseMasterPlan): GeneratedCityCourse {
  const cid = resolvePlanCourseId(plan);
  const existing = LEGACY_COURSE_ADAPTER_CACHE.get(cid);
  if (existing) return existing;
  const built = buildLegacyCourseAdapter(plan);
  LEGACY_COURSE_ADAPTER_CACHE.set(cid, built);
  return built;
}

function computeDistanceForPlan(pos: Vec3Tuple, plan: CourseMasterPlan): number {
  return computeRemainingCourseDistance(plan, pos);
}

function formatZoneBanner(anchor: QaTeleportZoneSpec): string {
  return anchor.zoneName.startsWith(`Zone ${anchor.zoneNumber}`)
    ? anchor.zoneName
    : `Zone ${anchor.zoneNumber}: ${anchor.zoneName}`;
}

function resolveZoneTelemetry(
  pos: Vec3Tuple,
  plan: CourseMasterPlan,
): {
  activeZoneNumber: GrandEscapadeZoneNumber;
  activeZoneName: string;
  activeZoneElevationLabel: string;
  isSubterranean: boolean;
} {
  if (plan.courseId === 'classic') {
    return {
      activeZoneNumber: 1,
      activeZoneName: '5th & Mercer Street',
      activeZoneElevationLabel: '0.0m Street Level',
      isSubterranean: false,
    };
  }
  const zoneSpec = getEscapadeZoneAtPosition(pos);
  const sub = isSubterraneanSubwayPosition(pos);
  const loY = zoneSpec.elevationRangeY[0];
  const hiY = zoneSpec.elevationRangeY[1];
  const fmt = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}m`;
  return {
    activeZoneNumber: zoneSpec.zoneNumber,
    activeZoneName: zoneSpec.name,
    activeZoneElevationLabel:
      Math.abs(hiY - loY) < 0.2 ? fmt(loY) : `${fmt(loY)}..${fmt(hiY)}`,
    isSubterranean: sub,
  };
}

function resolveRecommendedClubForPlan(
  pos: Vec3Tuple,
  surface: PhysicsSurfaceTag,
  plan: CourseMasterPlan,
): ClubId {
  const rec = recommendClubForLie(pos, surface);
  if (plan.courseId === 'grand-escapade' && isSubterraneanSubwayPosition(pos)) {
    const dist = computeDistanceForPlan(pos, plan);
    if (surface === 'putting_green_turf' || dist <= AUTO_PUTTER_DISTANCE) {
      return 'putter';
    }
    if (rec === 'driver' || rec === 'wedge') {
      return 'skimmer';
    }
  }
  return rec;
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

function readStoredBest(courseId: CourseId): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(BEST_STORAGE_KEY_BY_COURSE[courseId]);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 1 ? Math.round(parsed) : null;
  } catch {
    return null;
  }
}

function writeStoredBest(courseId: CourseId, val: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      BEST_STORAGE_KEY_BY_COURSE[courseId],
      String(Math.round(val)),
    );
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
let bannerAutoClearTimer: number | null = null;

function clearBannerTimer(): void {
  if (bannerAutoClearTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(bannerAutoClearTimer);
    bannerAutoClearTimer = null;
  }
}

function scheduleBannerClear(delayMs = 2300): void {
  clearBannerTimer();
  if (typeof window !== 'undefined') {
    bannerAutoClearTimer = window.setTimeout(() => {
      bannerAutoClearTimer = null;
      useCurbsideStore.setState({ lastEventBanner: null });
    }, delayMs);
  }
}

function createInitialHoleSlice(
  plan: CourseMasterPlan,
  teleportAnchor?: QaTeleportZoneSpec | null,
) {
  const startBallPos: Vec3Tuple = teleportAnchor
    ? [
        teleportAnchor.position[0],
        teleportAnchor.position[1] + BALL_RADIUS,
        teleportAnchor.position[2],
      ]
    : [
        plan.teePosition[0],
        plan.teePosition[1] + BALL_RADIUS,
        plan.teePosition[2],
      ];
  const startYaw = teleportAnchor ? teleportAnchor.aimYaw : plan.initialAimYaw;
  const startDir = resolveHorizontalAim(undefined, startYaw);
  const startClub: ClubId = teleportAnchor
    ? teleportAnchor.recommendedClub
    : 'driver';
  const zoneMeta = resolveZoneTelemetry(startBallPos, plan);
  return {
    strokes: 0,
    totalStrokes: 0,
    penaltyStrokes: 0,
    selectedClub: startClub,
    manualClubOverride: false,
    shotPhase: 'aiming' as ShotPhase,
    ballPhase: 'resting' as BallPhase,
    aimYaw: startYaw,
    aimDirection: startDir,
    aimPower: 0,
    aimPreview: {
      isAiming: false,
      power: 0,
      clubId: startClub,
      aimDirection: startDir,
    },
    ballPosition: [...startBallPos] as Vec3Tuple,
    lastSafeBallPosition: [...startBallPos] as Vec3Tuple,
    lastSafeLie: [...startBallPos] as Vec3Tuple,
    distanceToPinMeters: computeDistanceForPlan(startBallPos, plan),
    currentSurfaceTag: getMasterPlanSurfaceTagAt(
      startBallPos[0],
      startBallPos[2],
      plan,
    ),
    ...zoneMeta,
    isStreetScoutActive: false,
    isCourseFlyoverActive: false,
    flyoverProgress: null,
    cameraMode: 'follow' as CameraMode,
    cameraAuditStationId: null,
    isHoleComplete: false,
    isRoundComplete: false,
    lastEventBanner: null,
    trickToast: null,
    propHitTimestamps: {},
    forceSteamActive: null,
    hasTakenFirstStroke: false,
    hasUsedQaTeleport: Boolean(teleportAnchor),
    lastShot: null,
    pendingShot: null,
    pendingFountainDrop: null,
    pendingBallReset: false,
    sunkFlags: {},
    sunkOrder: [] as FlagColor[],
  };
}

const INITIAL_SEARCH =
  typeof window !== 'undefined' ? window.location.search : '';
const INITIAL_COURSE_ID: CourseId =
  typeof window !== 'undefined'
    ? resolveCourseIdFromSearchParams(INITIAL_SEARCH)
    : DEFAULT_ACTIVE_COURSE_ID;
const INITIAL_PLAN = getMasterPlanByCourseId(INITIAL_COURSE_ID);
const INITIAL_QA_TELEPORT_ZONE =
  INITIAL_COURSE_ID === 'grand-escapade' && INITIAL_SEARCH
    ? resolveQaTeleportZone(
        new URLSearchParams(INITIAL_SEARCH).get('qaTeleportZone'),
      )
    : null;

export const useCurbsideStore = create<CurbsideState>((set, get) => ({
  courseId: INITIAL_COURSE_ID,
  activePlan: INITIAL_PLAN,
  holeNumber: 1,
  holeName: INITIAL_PLAN.holeName,
  par: INITIAL_PLAN.par,
  holeDistanceMeters: INITIAL_PLAN.targetCenterlineMeters,
  course: getLegacyCourseAdapter(INITIAL_PLAN),

  personalBest: null,
  dailyBest: null,
  isMuted: false,
  muted: false,
  soundEventSeq: 0,
  lastSoundEvent: null,
  pendingTeleport: null,
  roundMode: 'hole1',

  ...createInitialHoleSlice(INITIAL_PLAN, INITIAL_QA_TELEPORT_ZONE),

  hydratePersonalBest: () => {
    const plan = get().activePlan;
    const cid = resolvePlanCourseId(plan);
    const best = readStoredBest(cid);
    const muted = readStoredMute();
    soundEngine.setMuted(muted);
    set({
      personalBest: best,
      dailyBest:
        best !== null
          ? { bestStrokes: best, dateKey: cid }
          : null,
      isMuted: muted,
      muted,
    });
  },

  hydrateDailyBest: () => {
    get().hydratePersonalBest();
  },

  setCourse: (nextCourseId) => {
    clearBannerTimer();
    const plan = getMasterPlanByCourseId(nextCourseId);
    const cid = resolvePlanCourseId(plan);
    const best = readStoredBest(cid);
    teleportSeqCounter += 1;
    const nextSeq = teleportSeqCounter;
    const teeBallPos: Vec3Tuple = [
      plan.teePosition[0],
      plan.teePosition[1] + BALL_RADIUS,
      plan.teePosition[2],
    ];
    set({
      courseId: cid,
      activePlan: plan,
      holeName: plan.holeName,
      par: plan.par,
      holeDistanceMeters: plan.targetCenterlineMeters,
      course: getLegacyCourseAdapter(plan),
      personalBest: best,
      dailyBest:
        best !== null
          ? { bestStrokes: best, dateKey: cid }
          : null,
      ...createInitialHoleSlice(plan),
      pendingTeleport: { seq: nextSeq, position: teeBallPos },
      pendingBallReset: true,
    });
  },

  teleportToZone: (zoneNumber, opts) => {
    const anchor = resolveQaTeleportZone(zoneNumber);
    if (!anchor) return null;
    clearBannerTimer();
    const state = get();
    const plan = getMasterPlanByCourseId('grand-escapade');
    const cid = resolvePlanCourseId(plan);
    const needCourseSwitch = state.courseId !== 'grand-escapade';
    const ballPos: Vec3Tuple = [
      anchor.position[0],
      anchor.position[1] + BALL_RADIUS,
      anchor.position[2],
    ];
    teleportSeqCounter += 1;
    const nextSeq = teleportSeqCounter;
    const zoneMeta = resolveZoneTelemetry(ballPos, plan);
    const aimDir = resolveHorizontalAim(undefined, anchor.aimYaw);
    const best = needCourseSwitch
      ? readStoredBest('grand-escapade')
      : state.personalBest;

    set({
      ...(needCourseSwitch
        ? {
            courseId: cid,
            activePlan: plan,
            holeName: plan.holeName,
            par: plan.par,
            holeDistanceMeters: plan.targetCenterlineMeters,
            course: getLegacyCourseAdapter(plan),
            personalBest: best,
            dailyBest:
              best !== null
                ? { bestStrokes: best, dateKey: cid }
                : null,
          }
        : {}),
      ballPosition: ballPos,
      lastSafeBallPosition: [...ballPos],
      lastSafeLie: [...ballPos],
      distanceToPinMeters: computeDistanceForPlan(ballPos, plan),
      currentSurfaceTag: getMasterPlanSurfaceTagAt(ballPos[0], ballPos[2], plan),
      ...zoneMeta,
      shotPhase: 'aiming',
      ballPhase: 'resting',
      aimPower: 0,
      aimYaw: anchor.aimYaw,
      aimDirection: aimDir,
      selectedClub: anchor.recommendedClub,
      manualClubOverride: false,
      isStreetScoutActive: false,
      isCourseFlyoverActive: false,
      flyoverProgress: null,
      cameraMode: 'follow',
      cameraAuditStationId: null,
      isHoleComplete: false,
      isRoundComplete: false,
      pendingShot: null,
      pendingFountainDrop: null,
      pendingTeleport: { seq: nextSeq, position: [...ballPos] },
      pendingBallReset: true,
      hasUsedQaTeleport: true,
      lastEventBanner: opts?.silent ? null : formatZoneBanner(anchor),
      aimPreview: {
        isAiming: false,
        power: 0,
        clubId: anchor.recommendedClub,
        aimDirection: aimDir,
      },
    });
    if (!opts?.silent) {
      scheduleBannerClear(2300);
    }
    return anchor;
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
      isCourseFlyoverActive: false,
      flyoverProgress: null,
      cameraMode: active ? 'street_scout' : 'follow',
      cameraAuditStationId: active ? null : get().cameraAuditStationId,
    });
  },

  toggleStreetScout: () => {
    const next = !get().isStreetScoutActive;
    soundEngine.playUiClick(0.75);
    get().setStreetScout(next);
  },

  setCourseFlyover: (active, progress = null) => {
    set({
      isCourseFlyoverActive: active,
      flyoverProgress: active ? progress : null,
      isStreetScoutActive: false,
      cameraMode: active ? 'street_scout' : 'follow',
      cameraAuditStationId: active ? null : get().cameraAuditStationId,
    });
  },

  toggleCourseFlyover: () => {
    const next = !get().isCourseFlyoverActive;
    soundEngine.playUiClick(0.8);
    get().setCourseFlyover(next, null);
  },

  setFlyoverProgress: (progress) => {
    set({
      flyoverProgress:
        progress === null ? null : Math.max(0, Math.min(1, progress)),
    });
  },

  toggleCameraMode: () => {
    get().toggleStreetScout();
  },

  setCameraAuditStation: (id) => {
    set({
      cameraAuditStationId: id,
      isStreetScoutActive: false,
      isCourseFlyoverActive: false,
      flyoverProgress: null,
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
    const now =
      typeof performance !== 'undefined'
        ? performance.now() * 0.001
        : Date.now() * 0.001;
    set((state) => {
      const nextTimestamps: Record<string, number> = {
        ...state.propHitTimestamps,
        [id]: now,
      };
      if (id === 'hotdog-cart-corner') {
        nextTimestamps['hotdog-cart-se-corner'] = now;
        nextTimestamps['hotdog_cart_umbrella'] = now;
      } else if (id === 'hydrant-corner-se') {
        nextTimestamps['fire-hydrant-east-corner'] = now;
        nextTimestamps['fire_hydrant_jet'] = now;
      } else if (id === 'delivery-van-east') {
        nextTimestamps['delivery_box_van'] = now;
      } else if (id === 'fountain-courtyard-front') {
        nextTimestamps['fountain_water_hazard'] = now;
      }
      if (!banner) {
        return { propHitTimestamps: nextTimestamps };
      }
      trickToastCounter += 1;
      scheduleBannerClear(2300);
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
      clearBannerTimer();
      set({ lastEventBanner: null });
      return;
    }
    trickToastCounter += 1;
    scheduleBannerClear(2300);
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
    const plan = get().activePlan;
    const resolvedSurface =
      surface ?? getMasterPlanSurfaceTagAt(pos[0], pos[2], plan);
    const zoneMeta = resolveZoneTelemetry(pos, plan);
    set({
      ballPosition: pos,
      distanceToPinMeters: computeDistanceForPlan(pos, plan),
      currentSurfaceTag: resolvedSurface,
      ...zoneMeta,
    });
  },

  launchShot: (opts) => {
    const state = get();
    if (
      state.isHoleComplete ||
      state.shotPhase === 'ball_in_flight' ||
      state.shotPhase === 'settling' ||
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
    clearBannerTimer();

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
      isCourseFlyoverActive: false,
      flyoverProgress: null,
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
    const plan = get().activePlan;
    const surface = getMasterPlanSurfaceTagAt(pos[0], pos[2], plan);
    const dist = computeDistanceForPlan(pos, plan);
    const recommended = resolveRecommendedClubForPlan(pos, surface, plan);
    const zoneMeta = resolveZoneTelemetry(pos, plan);
    const nextAimYaw =
      plan.courseId === 'grand-escapade'
        ? computeForwardCourseYaw(plan, pos, 18.0)
        : Math.atan2(
            plan.cup.position[0] - pos[0],
            -(plan.cup.position[2] - pos[2]),
          );
    const shouldAutoClub = opts?.autoSelectClub !== false;

    set((state) => {
      const nextClub = shouldAutoClub ? recommended : state.selectedClub;
      const movedDistXZ = Math.hypot(
        pos[0] - state.lastSafeBallPosition[0],
        pos[2] - state.lastSafeBallPosition[2],
      );
      // Preserve player's street aim on short chips unless advancing along fairway or inside putter circle
      const shouldAutoAlignCup =
        state.hasTakenFirstStroke &&
        (plan.courseId === 'grand-escapade' ? dist > 0.35 : dist < 35) &&
        (movedDistXZ >= 0.65 || dist < AUTO_PUTTER_DISTANCE);
      const yawToUse = shouldAutoAlignCup ? nextAimYaw : state.aimYaw;
      const aimDir = resolveHorizontalAim(undefined, yawToUse);
      return {
        ballPosition: [...pos],
        lastSafeBallPosition: [...pos],
        lastSafeLie: [...pos],
        distanceToPinMeters: dist,
        currentSurfaceTag: surface,
        ...zoneMeta,
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

  teleportBall: (pos, opts) => {
    const plan = get().activePlan;
    const surface = getMasterPlanSurfaceTagAt(pos[0], pos[2], plan);
    const dist = computeDistanceForPlan(pos, plan);
    const zoneMeta = resolveZoneTelemetry(pos, plan);
    teleportSeqCounter += 1;
    const nextSeq = teleportSeqCounter;
    const recommended = resolveRecommendedClubForPlan(pos, surface, plan);
    set((state) => ({
      ...(opts?.seedStrokes !== undefined
        ? {
            strokes: Math.max(0, Math.round(opts.seedStrokes)),
            totalStrokes: Math.max(0, Math.round(opts.seedStrokes)),
          }
        : {}),
      ballPosition: [...pos],
      lastSafeBallPosition: [...pos],
      lastSafeLie: [...pos],
      distanceToPinMeters: dist,
      currentSurfaceTag: surface,
      ...zoneMeta,
      shotPhase: 'aiming',
      ballPhase: 'resting',
      aimPower: 0,
      selectedClub: recommended,
      hasUsedQaTeleport: true,
      isHoleComplete: false,
      isRoundComplete: false,
      pendingTeleport: { seq: nextSeq, position: [...pos] },
      pendingFountainDrop: null,
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

  triggerFountainHazard: (dropPos, splashPos) => {
    const state = get();
    if (state.isHoleComplete || state.shotPhase === 'fountain_drop') return;
    const plan = state.activePlan;
    const fromPos: Vec3Tuple = splashPos
      ? [...splashPos]
      : [...state.ballPosition];
    const safeDrop: Vec3Tuple = dropPos
      ? [...dropPos]
      : plan.courseId === 'classic'
        ? [
            FOUNTAIN_QUICK_DROP_POSITION[0],
            FOUNTAIN_QUICK_DROP_POSITION[1] + BALL_RADIUS,
            FOUNTAIN_QUICK_DROP_POSITION[2],
          ]
        : [...state.lastSafeBallPosition];
    const nextStrokes = state.strokes + 1;
    const nextPenalties = state.penaltyStrokes + 1;
    teleportSeqCounter += 1;
    const nextSeq = teleportSeqCounter;
    const dropSurface = getMasterPlanSurfaceTagAt(safeDrop[0], safeDrop[2], plan);
    const dropClub = resolveRecommendedClubForPlan(safeDrop, dropSurface, plan);
    const zoneMeta = resolveZoneTelemetry(safeDrop, plan);
    const yawToCup =
      plan.courseId === 'classic'
        ? Math.atan2(
            plan.cup.position[0] - safeDrop[0],
            -(plan.cup.position[2] - safeDrop[2]),
          )
        : state.aimYaw;
    const dirToCup = resolveHorizontalAim(undefined, yawToCup);

    soundEngine.playFountainSplash(0.95);
    trickToastCounter += 1;
    scheduleBannerClear(2300);
    const hitNow =
      typeof performance !== 'undefined'
        ? performance.now() * 0.001
        : Date.now() * 0.001;

    set({
      strokes: nextStrokes,
      totalStrokes: nextStrokes,
      penaltyStrokes: nextPenalties,
      shotPhase: 'fountain_drop',
      ballPhase: 'hazard_drop',
      ballPosition: fromPos,
      lastSafeBallPosition: safeDrop,
      lastSafeLie: safeDrop,
      distanceToPinMeters: computeDistanceForPlan(safeDrop, plan),
      currentSurfaceTag: dropSurface,
      ...zoneMeta,
      selectedClub: plan.courseId === 'classic' ? 'putter' : dropClub,
      aimYaw: yawToCup,
      aimDirection: dirToCup,
      aimPower: 0,
      propHitTimestamps: {
        ...state.propHitTimestamps,
        'fountain-courtyard-front': hitNow,
        'esc-z6-midtown-fountain': hitNow,
        fountain_water_hazard: hitNow,
      },
      lastEventBanner: 'Fountain Hazard +1',
      trickToast: {
        seq: trickToastCounter,
        kind: 'water_penalty',
        label: 'Fountain Hazard +1',
      },
      pendingFountainDrop: {
        seq: nextSeq,
        from: fromPos,
        to: safeDrop,
        durationSec: FOUNTAIN_DROP_DURATION_SEC,
      },
      pendingBallReset: true,
      aimPreview: {
        isAiming: false,
        power: 0,
        clubId: plan.courseId === 'classic' ? 'putter' : dropClub,
        aimDirection: dirToCup,
      },
    });
  },

  triggerOobHazard: (oobPos) => {
    const state = get();
    if (state.isHoleComplete || state.shotPhase === 'fountain_drop') return;
    const plan = state.activePlan;
    const fromPos: Vec3Tuple = oobPos ? [...oobPos] : [...state.ballPosition];
    const safeDrop: Vec3Tuple = [...state.lastSafeBallPosition];
    const nextStrokes = state.strokes + 1;
    const nextPenalties = state.penaltyStrokes + 1;
    teleportSeqCounter += 1;
    const nextSeq = teleportSeqCounter;
    const dropSurface = getMasterPlanSurfaceTagAt(safeDrop[0], safeDrop[2], plan);
    const dropClub = resolveRecommendedClubForPlan(safeDrop, dropSurface, plan);
    const zoneMeta = resolveZoneTelemetry(safeDrop, plan);

    soundEngine.playCurbBank({ impactSpeed: 3.2, surfaceKey: 'oob-reset' });
    trickToastCounter += 1;
    scheduleBannerClear(2300);

    set({
      strokes: nextStrokes,
      totalStrokes: nextStrokes,
      penaltyStrokes: nextPenalties,
      shotPhase: 'fountain_drop',
      ballPhase: 'hazard_drop',
      ballPosition: fromPos,
      lastSafeBallPosition: safeDrop,
      lastSafeLie: safeDrop,
      distanceToPinMeters: computeDistanceForPlan(safeDrop, plan),
      currentSurfaceTag: dropSurface,
      ...zoneMeta,
      selectedClub: dropClub,
      aimPower: 0,
      lastEventBanner: 'Out of Bounds +1',
      trickToast: {
        seq: trickToastCounter,
        kind: 'water_penalty',
        label: 'Out of Bounds +1',
      },
      pendingFountainDrop: {
        seq: nextSeq,
        from: fromPos,
        to: safeDrop,
        durationSec: OOB_RECOVERY_DURATION_SEC,
      },
      pendingBallReset: true,
      aimPreview: {
        ...state.aimPreview,
        isAiming: false,
        power: 0,
        clubId: dropClub,
      },
    });
  },

  completeFountainDrop: (seq) => {
    const state = get();
    if (state.shotPhase !== 'fountain_drop') return;
    const plan = state.activePlan;
    const drop = state.pendingFountainDrop;
    if (seq !== undefined && drop && drop.seq !== seq) return;
    const targetPos: Vec3Tuple = drop
      ? [...drop.to]
      : plan.courseId === 'classic'
        ? [
            FOUNTAIN_QUICK_DROP_POSITION[0],
            FOUNTAIN_QUICK_DROP_POSITION[1] + BALL_RADIUS,
            FOUNTAIN_QUICK_DROP_POSITION[2],
          ]
        : [...state.lastSafeBallPosition];
    const zoneMeta = resolveZoneTelemetry(targetPos, plan);
    set({
      shotPhase: 'aiming',
      ballPhase: 'resting',
      ballPosition: targetPos,
      lastSafeBallPosition: targetPos,
      lastSafeLie: targetPos,
      distanceToPinMeters: computeDistanceForPlan(targetPos, plan),
      currentSurfaceTag: getMasterPlanSurfaceTagAt(targetPos[0], targetPos[2], plan),
      ...zoneMeta,
      pendingFountainDrop: null,
      pendingBallReset: false,
    });
  },

  triggerWaterHazard: () => {
    get().triggerFountainHazard();
  },

  sinkHole: () => {
    const state = get();
    if (state.isHoleComplete) return;
    const plan = state.activePlan;
    const cid = resolvePlanCourseId(plan);
    const total = Math.max(1, state.strokes);
    const prevBest = state.personalBest;
    const nextBest = prevBest === null ? total : Math.min(prevBest, total);
    if (nextBest !== prevBest) {
      writeStoredBest(cid, nextBest);
    }

    soundEngine.playCupDrop({
      intensity: 1.0,
      isGoldenPin: Boolean(plan.cup.isGoldenPin),
    });
    const relToPar = total - plan.par;
    const qaTeleportAceGuarded = total === 1 && state.hasUsedQaTeleport && plan.par > 3;
    const banner =
      total === 1 && !qaTeleportAceGuarded
        ? 'Hole-in-One!'
        : qaTeleportAceGuarded
          ? plan.cup.isGoldenPin
            ? 'Golden Pin Holed!'
            : 'Holed Out!'
          : relToPar <= -3
            ? 'Albatross!'
            : relToPar === -2
              ? 'Eagle!'
              : relToPar === -1
                ? 'Birdie!'
                : relToPar === 0
                  ? 'Par!'
                  : plan.cup.isGoldenPin
                    ? 'Golden Pin Holed!'
                    : 'Holed Out!';
    clearBannerTimer();
    trickToastCounter += 1;
    const cuppedPos: Vec3Tuple = [
      plan.cup.position[0],
      plan.cup.position[1] - 0.08,
      plan.cup.position[2],
    ];
    const zoneMeta = resolveZoneTelemetry(plan.cup.position, plan);

    set({
      strokes: total,
      totalStrokes: total,
      shotPhase: 'holed_out',
      ballPhase: 'cupped',
      ballPosition: cuppedPos,
      lastSafeBallPosition: [...cuppedPos],
      lastSafeLie: [...cuppedPos],
      isHoleComplete: true,
      isRoundComplete: true,
      isStreetScoutActive: false,
      isCourseFlyoverActive: false,
      flyoverProgress: null,
      personalBest: nextBest,
      dailyBest: { bestStrokes: nextBest, dateKey: cid },
      distanceToPinMeters: 0,
      currentSurfaceTag: 'putting_green_turf',
      ...zoneMeta,
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
    clearBannerTimer();
    soundEngine.playUiClick(0.9);
    const plan = get().activePlan;
    const teeBallPos: Vec3Tuple = [
      plan.teePosition[0],
      plan.teePosition[1] + BALL_RADIUS,
      plan.teePosition[2],
    ];
    teleportSeqCounter += 1;
    const nextSeq = teleportSeqCounter;
    set({
      ...createInitialHoleSlice(plan),
      pendingTeleport: { seq: nextSeq, position: teeBallPos },
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
