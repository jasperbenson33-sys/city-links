import type { ClubId, PhysicsSurfaceTag, Vec3Tuple } from '@/types';
import {
  A_POSITION_CROSSWALK,
  COURSE_MASTER_PLAN,
  HOLE_1_CUP,
} from '@/config/courseMasterPlan';

export interface ClubPhysicsProfile {
  readonly id: ClubId;
  readonly displayName: string;
  readonly shortLabel: string;
  readonly badge: string;
  readonly minSpeed: number;
  readonly maxSpeed: number;
  readonly launchAngleDeg: number;
  readonly liftCoeff: number;
  readonly maxLiftFractionOfGravity: number;
  readonly flightDamping: number;
  readonly rollDamping: number;
  readonly restitution: number;
  readonly turfCheckMultiplier: number;
  readonly previewStopSpeed: number;
  readonly previewLandingRadius: number;
  readonly accentHex: string;
}

export const CLUB_PROFILES: Record<ClubId, ClubPhysicsProfile> = {
  driver: {
    id: 'driver',
    displayName: 'Sky Driver',
    shortLabel: 'Driver',
    badge: 'Carry',
    minSpeed: 11.5,
    maxSpeed: 33.1,
    launchAngleDeg: 19.0,
    liftCoeff: 0.14,
    maxLiftFractionOfGravity: 0.42,
    flightDamping: 0.055,
    rollDamping: 1.74,
    restitution: 0.24,
    turfCheckMultiplier: 0.88,
    previewStopSpeed: 0.08,
    previewLandingRadius: 1.15,
    accentHex: '#FF5A5F',
  },
  wedge: {
    id: 'wedge',
    displayName: 'Cloud Lobber Wedge',
    shortLabel: 'Wedge',
    badge: 'Lob',
    minSpeed: 5.5,
    maxSpeed: 22.8,
    launchAngleDeg: 50.0,
    liftCoeff: 0.025,
    maxLiftFractionOfGravity: 0.28,
    flightDamping: 0.025,
    rollDamping: 1.95,
    restitution: 0.2,
    turfCheckMultiplier: 0.45,
    previewStopSpeed: 0.08,
    previewLandingRadius: 0.72,
    accentHex: '#2563EB',
  },
  skimmer: {
    id: 'skimmer',
    displayName: 'Curb Skimmer Punch',
    shortLabel: 'Skimmer',
    badge: 'Low Punch',
    minSpeed: 7.5,
    maxSpeed: 30.6,
    launchAngleDeg: 7.5,
    liftCoeff: 0.04,
    maxLiftFractionOfGravity: 0.24,
    flightDamping: 0.03,
    rollDamping: 0.9,
    restitution: 0.26,
    turfCheckMultiplier: 0.9,
    previewStopSpeed: 0.08,
    previewLandingRadius: 0.9,
    accentHex: '#F59E0B',
  },
  putter: {
    id: 'putter',
    displayName: 'Sidewalk Putter',
    shortLabel: 'Putter',
    badge: 'Roll',
    minSpeed: 1.6,
    maxSpeed: 16.5,
    launchAngleDeg: 0.0,
    liftCoeff: 0.0,
    maxLiftFractionOfGravity: 0.0,
    flightDamping: 0.02,
    rollDamping: 0.92,
    restitution: 0.12,
    turfCheckMultiplier: 1.0,
    previewStopSpeed: 0.06,
    previewLandingRadius: 0.45,
    accentHex: '#10B981',
  },
};

export const SURFACE_ROLL_MULTIPLIERS: Record<PhysicsSurfaceTag, number> = {
  road_asphalt: 1.0,
  storm_gutter: 0.55,
  stone_curb: 1.15,
  sidewalk_paver: 0.96,
  subway_brick_plaza: 0.98,
  crosswalk_landing: 1.0,
  loading_zone_asphalt: 1.0,
  courtyard_ramp: 1.02,
  courtyard_paver: 1.02,
  putting_green_turf: 1.0,
  green_fringe_collar: 1.28,
  patio_rough: 3.1,
  fountain_hazard: 4.5,
  awning_cushion: 1.4,
  umbrella_bounce: 1.2,
  van_ramp_metal: 0.85,
  van_roof_deck: 0.82,
  masonry_wall: 1.15,
};

export const SURFACE_BOUNCE_RESTITUTION: Record<PhysicsSurfaceTag, number> = {
  road_asphalt: 0.24,
  storm_gutter: 0.28,
  stone_curb: 0.66,
  sidewalk_paver: 0.34,
  subway_brick_plaza: 0.32,
  crosswalk_landing: 0.24,
  loading_zone_asphalt: 0.24,
  courtyard_ramp: 0.28,
  courtyard_paver: 0.32,
  putting_green_turf: 0.16,
  green_fringe_collar: 0.2,
  patio_rough: 0.14,
  fountain_hazard: 0.05,
  awning_cushion: 0.28,
  umbrella_bounce: 0.68,
  van_ramp_metal: 0.28,
  van_roof_deck: 0.62,
  masonry_wall: 0.58,
};

export function getClubProfile(clubId: ClubId): ClubPhysicsProfile {
  return CLUB_PROFILES[clubId];
}

export function getSurfaceRollMultiplier(surface: PhysicsSurfaceTag): number {
  return SURFACE_ROLL_MULTIPLIERS[surface] ?? 1.0;
}

export function getSurfaceRestitution(
  surface: PhysicsSurfaceTag,
  clubId?: ClubId,
): number {
  const surfaceR = SURFACE_BOUNCE_RESTITUTION[surface] ?? 0.24;
  if (!clubId) return surfaceR;
  const clubR = CLUB_PROFILES[clubId].restitution;
  if (surface === 'awning_cushion') return 0.28;
  if (surface === 'stone_curb' || surface === 'umbrella_bounce') {
    return Math.max(surfaceR, clubR);
  }
  return (surfaceR + clubR) * 0.5;
}

export function isBallUnderOverheadObstacle(pos: Vec3Tuple): boolean {
  const [x, , z] = pos;
  // Under scaffolding-shed-west roof deck (x: -7.25..-4.65, z: 4.5..13.5)
  if (x >= -7.5 && x <= -4.4 && z >= 4.2 && z <= 13.8) {
    return true;
  }
  // Under tree-overhang-east canopy (x: 1.1..6.95, z: -7.1..-1.9)
  if (x >= 1.0 && x <= 7.1 && z >= -7.3 && z <= -1.7) {
    return true;
  }
  return false;
}

export function isNearCornerGutterRoute(pos: Vec3Tuple): boolean {
  const [x, , z] = pos;
  // SE corner curve + Mercer south storm gutter corridor leading into courtyard ramp
  if (x >= 2.8 && x <= 14.5 && z >= -20.5 && z <= -14.2) {
    return true;
  }
  // In front of delivery-van-east rear loading ramp (x: 0.8..3.8, z: 2.0..-3.4)
  if (x >= 0.8 && x <= 3.8 && z >= -3.6 && z <= 4.0) {
    return true;
  }
  return false;
}

export function isInCrosswalkZone(pos: Vec3Tuple): boolean {
  const [x, , z] = pos;
  const b = A_POSITION_CROSSWALK.boundsXZ;
  return x >= b.minX - 0.5 && x <= b.maxX + 0.5 && z >= b.minZ - 0.6 && z <= b.maxZ + 0.6;
}

export function recommendClubForLie(
  ballPosition: Vec3Tuple,
  surfaceTag: PhysicsSurfaceTag,
): ClubId {
  const distToPin = Math.hypot(
    HOLE_1_CUP.position[0] - ballPosition[0],
    HOLE_1_CUP.position[2] - ballPosition[2],
  );

  // Close approach / putting green -> Sidewalk Putter
  if (
    surfaceTag === 'putting_green_turf' ||
    surfaceTag === 'green_fringe_collar' ||
    distToPin <= 7.0
  ) {
    return 'putter';
  }

  // Blocked overhead (scaffolding / tree canopy) or near SE corner gutter -> Curb Skimmer
  if (
    isBallUnderOverheadObstacle(ballPosition) ||
    surfaceTag === 'storm_gutter' ||
    isNearCornerGutterRoute(ballPosition)
  ) {
    return 'skimmer';
  }

  // Signature Position A crosswalk, patio rough, or courtyard approach -> Cloud Lobber Wedge
  if (
    isInCrosswalkZone(ballPosition) ||
    surfaceTag === 'crosswalk_landing' ||
    surfaceTag === 'patio_rough' ||
    surfaceTag === 'courtyard_paver' ||
    surfaceTag === 'courtyard_ramp' ||
    ballPosition[2] <= -12.0 ||
    ballPosition[0] >= COURSE_MASTER_PLAN.teePosition[0] + 4.5
  ) {
    return 'wedge';
  }

  return 'driver';
}
