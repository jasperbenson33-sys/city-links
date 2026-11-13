import type {
  ClubId,
  ComputeTrajectoryOptions,
  DeterministicTrajectoryResult,
  PhysicsSurfaceTag,
  Vec3Tuple,
} from '@/types';
import {
  BALL_RADIUS,
  WORLD_GRAVITY_Y,
} from '@/types/clubs';
import {
  ARCHITECTURAL_WALLS,
  COURSE_MASTER_PLAN,
  COURSE_PROPS,
  PERIMETER_BUILDINGS,
  STONE_CURBS,
  getMasterPlanGroundElevationAt,
  getMasterPlanSurfaceTagAt,
} from '@/config/courseMasterPlan';
import {
  computeAwningBounceVelocity,
  intersectRayAABB3D,
} from '@/lib/geometryHelpers';

export interface SimpleAabb3d {
  min: Vec3Tuple;
  max: Vec3Tuple;
}
import {
  CLUB_PROFILES,
  getClubProfile,
  getSurfaceRestitution,
  getSurfaceRollMultiplier,
  type ClubPhysicsProfile,
} from '@/lib/clubs';

export type TrajectoryImpactKind =
  | 'ground'
  | 'awning'
  | 'curb'
  | 'wall'
  | 'tree'
  | 'van';

export interface TrajectoryComputeExtendedOptions extends ComputeTrajectoryOptions {
  /** Whether to reflect descending shots off hotdog-cart-corner's 28 deg awning (default true). */
  simulateAwningBounce?: boolean;
  /** Whether to stop/reflect preview rays at solid curbs/walls/tree canopy/van (default true). */
  simulateObstacles?: boolean;
  /** Default surface tag when no surface lookup is available. */
  surfaceTag?: PhysicsSurfaceTag;
}

export interface ExtendedTrajectoryResult extends DeterministicTrajectoryResult {
  firstImpactKind: TrajectoryImpactKind;
  firstImpactPoint: Vec3Tuple | null;
  awningBouncePoint: Vec3Tuple | null;
  totalDurationSeconds: number;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function isSamePoint(a: Vec3Tuple, b: Vec3Tuple, eps = 0.04): boolean {
  return (
    Math.abs(a[0] - b[0]) < eps &&
    Math.abs(a[1] - b[1]) < eps &&
    Math.abs(a[2] - b[2]) < eps
  );
}

/**
 * Resolves a unit horizontal XZ aim vector `[dx, dz]` from either `aimDirection` or compass `aimYaw`.
 * Compass `aimYaw` convention: `0` = North (`[0, -1]`), `+PI/2` = East (`[1, 0]`), `PI` = South (`[0, 1]`).
 */
export function resolveHorizontalAim(
  aimDirection?: [number, number] | Vec3Tuple,
  aimYaw = 0,
): [number, number] {
  if (aimDirection) {
    const dx = aimDirection[0];
    const dz = aimDirection[2] !== undefined ? aimDirection[2] : aimDirection[1];
    const len = Math.hypot(dx, dz);
    if (len > 1e-5) {
      return [dx / len, dz / len];
    }
  }
  const yaw = Number.isFinite(aimYaw) ? aimYaw : 0;
  return [Math.sin(yaw), -Math.cos(yaw)];
}

/**
 * Computes deterministic launch speed (m/s) for a club and normalized pull power in [0, 1].
 */
export function computeClubLaunchSpeed(clubId: ClubId, power: number): number {
  const profile = CLUB_PROFILES[clubId];
  const p = clamp01(power);
  if (p <= 0) return 0;
  return profile.minSpeed + (profile.maxSpeed - profile.minSpeed) * p;
}

/**
 * Computes initial linear velocity `[vx, vy, vz]` to apply to the ball RigidBody.
 */
export function computeClubLaunchVelocity(
  clubId: ClubId,
  power: number,
  aimDirection?: [number, number] | Vec3Tuple,
  aimYaw = 0,
): Vec3Tuple {
  const profile = CLUB_PROFILES[clubId];
  const speed = computeClubLaunchSpeed(clubId, power);
  const [dx, dz] = resolveHorizontalAim(aimDirection, aimYaw);
  const angleRad = (profile.launchAngleDeg * Math.PI) / 180;
  const vh = speed * Math.cos(angleRad);
  const vy = speed * Math.sin(angleRad);
  return [dx * vh, vy, dz * vh];
}

export interface StepBallAerodynamicsParams {
  velocity: Vec3Tuple;
  airborne: boolean;
  surfaceTag: PhysicsSurfaceTag;
  profile: ClubPhysicsProfile;
  dt: number;
  gravityY?: number;
  /** Pass false when Rapier already applies WORLD_GRAVITY_Y to the rigid body. */
  applyGravity?: boolean;
}

/**
 * Single source of truth for per-step aerodynamic lift, flight air drag, and surface roll damping.
 * Used by both deterministic trajectory arc generation and live Rapier ball physics.
 */
export function stepBallAerodynamics({
  velocity,
  airborne,
  surfaceTag,
  profile,
  dt,
  gravityY = WORLD_GRAVITY_Y,
  applyGravity = false,
}: StepBallAerodynamicsParams): Vec3Tuple {
  let [vx, vy, vz] = velocity;
  if (dt <= 0) return [vx, vy, vz];

  if (airborne) {
    const horizSpeed = Math.hypot(vx, vz);
    const maxLift = Math.abs(gravityY) * profile.maxLiftFractionOfGravity;
    const liftAccel = Math.min(maxLift, Math.max(0, horizSpeed * profile.liftCoeff));
    if (applyGravity) {
      vy += (gravityY + liftAccel) * dt;
    } else {
      vy += liftAccel * dt;
    }
    const airDecay = Math.exp(-profile.flightDamping * dt);
    vx *= airDecay;
    vy *= airDecay;
    vz *= airDecay;
    return [vx, vy, vz];
  }

  const rollFactor = getSurfaceRollMultiplier(surfaceTag);
  const rollDecay = Math.exp(-profile.rollDamping * rollFactor * dt);
  vx *= rollDecay;
  vz *= rollDecay;
  return [vx, vy, vz];
}

interface AwningColliderCache {
  center: Vec3Tuple;
  axisU: Vec3Tuple;
  axisN: Vec3Tuple;
  axisV: Vec3Tuple;
  halfW: number;
  halfT: number;
  halfD: number;
  restitution: number;
}

let cachedAwning: AwningColliderCache | null = null;

function dot3(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function getHotdogAwningData(): AwningColliderCache | null {
  if (cachedAwning) return cachedAwning;
  const cart = COURSE_PROPS.find((p) => p.id === 'hotdog-cart-corner');
  const meta = cart?.hotdogAwningMeta;
  if (!cart || !meta) return null;
  const rotY = cart.rotationY ?? 0;
  // Local +X axis rotated around world Y by rotationY
  const axisU: Vec3Tuple = [Math.cos(rotY), 0, -Math.sin(rotY)];
  const axisN: Vec3Tuple = meta.worldNormal;
  // Orthonormal slope axis V = normalize(U x N)
  const vx = axisU[1] * axisN[2] - axisU[2] * axisN[1];
  const vy = axisU[2] * axisN[0] - axisU[0] * axisN[2];
  const vz = axisU[0] * axisN[1] - axisU[1] * axisN[0];
  const vLen = Math.hypot(vx, vy, vz) || 1;
  const axisV: Vec3Tuple = [vx / vLen, vy / vLen, vz / vLen];
  cachedAwning = {
    center: meta.awningCenter,
    axisU,
    axisN,
    axisV,
    halfW: meta.awningSize[0] * 0.5 + BALL_RADIUS * 0.5,
    halfT: meta.awningSize[1] * 0.5 + BALL_RADIUS * 0.85,
    halfD: meta.awningSize[2] * 0.5 + BALL_RADIUS * 0.5,
    restitution: meta.restitution,
  };
  return cachedAwning;
}

function intersectSegmentWithAwningObb(
  from: Vec3Tuple,
  to: Vec3Tuple,
  awning: AwningColliderCache,
): Vec3Tuple | null {
  const fRel: Vec3Tuple = [
    from[0] - awning.center[0],
    from[1] - awning.center[1],
    from[2] - awning.center[2],
  ];
  const tRel: Vec3Tuple = [
    to[0] - awning.center[0],
    to[1] - awning.center[1],
    to[2] - awning.center[2],
  ];
  const p0: Vec3Tuple = [
    dot3(fRel, awning.axisU),
    dot3(fRel, awning.axisN),
    dot3(fRel, awning.axisV),
  ];
  const p1: Vec3Tuple = [
    dot3(tRel, awning.axisU),
    dot3(tRel, awning.axisN),
    dot3(tRel, awning.axisV),
  ];
  const dir: Vec3Tuple = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const localBox: SimpleAabb3d = {
    min: [-awning.halfW, -awning.halfT, -awning.halfD],
    max: [awning.halfW, awning.halfT, awning.halfD],
  };
  const segLen = Math.hypot(dir[0], dir[1], dir[2]);
  if (segLen < 1e-6) return null;
  const hit = intersectRayAABB3D(p0, dir, localBox, segLen);
  if (!hit.hit || hit.tMin > segLen) return null;
  const frac = Math.max(0, Math.min(1, hit.tMin / segLen));
  return [
    from[0] + (to[0] - from[0]) * frac,
    from[1] + (to[1] - from[1]) * frac,
    from[2] + (to[2] - from[2]) * frac,
  ];
}

interface SolidObstacleEntry {
  kind: Exclude<TrajectoryImpactKind, 'ground' | 'awning'>;
  aabb: SimpleAabb3d;
}

let cachedObstacles: SolidObstacleEntry[] | null = null;

function getSolidObstacles(): SolidObstacleEntry[] {
  if (cachedObstacles) return cachedObstacles;
  const list: SolidObstacleEntry[] = [];

  for (const b of PERIMETER_BUILDINGS) {
    list.push({
      kind: 'wall',
      aabb: {
        min: [b.aabb.min[0] - BALL_RADIUS, b.aabb.min[1], b.aabb.min[2] - BALL_RADIUS],
        max: [b.aabb.max[0] + BALL_RADIUS, b.aabb.max[1], b.aabb.max[2] + BALL_RADIUS],
      },
    });
  }

  for (const w of ARCHITECTURAL_WALLS) {
    list.push({
      kind: 'wall',
      aabb: {
        min: [
          w.center[0] - w.size[0] * 0.5 - BALL_RADIUS,
          w.center[1] - w.size[1] * 0.5,
          w.center[2] - w.size[2] * 0.5 - BALL_RADIUS,
        ],
        max: [
          w.center[0] + w.size[0] * 0.5 + BALL_RADIUS,
          w.center[1] + w.size[1] * 0.5 + BALL_RADIUS * 0.4,
          w.center[2] + w.size[2] * 0.5 + BALL_RADIUS,
        ],
      },
    });
  }

  const tree = COURSE_PROPS.find((p) => p.id === 'tree-overhang-east')?.treeOverhangMeta;
  if (tree) {
    list.push({ kind: 'tree', aabb: tree.canopyAabb });
    list.push({ kind: 'tree', aabb: tree.trunkAabb });
  }

  for (const curb of STONE_CURBS) {
    if (curb.kind === 'beveled_45' || curb.kind === 'curved_90') continue;
    list.push({
      kind: 'curb',
      aabb: {
        min: [
          curb.center[0] - curb.size[0] * 0.5 - BALL_RADIUS * 0.75,
          curb.center[1] - curb.size[1] * 0.5,
          curb.center[2] - curb.size[2] * 0.5 - BALL_RADIUS * 0.75,
        ],
        max: [
          curb.center[0] + curb.size[0] * 0.5 + BALL_RADIUS * 0.75,
          curb.center[1] + curb.size[1] * 0.5 + BALL_RADIUS * 0.5,
          curb.center[2] + curb.size[2] * 0.5 + BALL_RADIUS * 0.75,
        ],
      },
    });
  }

  cachedObstacles = list;
  return list;
}

function findFirstSolidSegmentHit(
  from: Vec3Tuple,
  to: Vec3Tuple,
): { kind: SolidObstacleEntry['kind']; point: Vec3Tuple; normal: Vec3Tuple } | null {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const segLen = Math.hypot(dx, dy, dz);
  if (segLen < 1e-6) return null;

  const dir: Vec3Tuple = [dx / segLen, dy / segLen, dz / segLen];
  let bestT = segLen + 1e-5;
  let bestHit: {
    kind: SolidObstacleEntry['kind'];
    point: Vec3Tuple;
    normal: Vec3Tuple;
  } | null = null;

  for (const obs of getSolidObstacles()) {
    const hit = intersectRayAABB3D(from, dir, obs.aabb, segLen);
    if (!hit.hit || !hit.point || !hit.normal || hit.tMin <= 0 || hit.tMin > bestT) {
      continue;
    }
    bestT = hit.tMin;
    bestHit = {
      kind: obs.kind,
      point: hit.point,
      normal: hit.normal,
    };
  }
  return bestHit;
}

/**
 * Shared deterministic trajectory integrator used by BOTH:
 * 1. Gameplay 3D Aim Arc & Landing Ring (`AimControlsAndArc.tsx`), matching `GolfBall.tsx`.
 * 2. Unit / layout audit trajectory checks (`tests/layoutAudit.test.ts`).
 */
export function computeDeterministicTrajectory(
  opts: TrajectoryComputeExtendedOptions,
): ExtendedTrajectoryResult {
  const profile = getClubProfile(opts.clubId);
  const power = clamp01(opts.power);
  const horizontalDirection = resolveHorizontalAim(opts.aimDirection, opts.aimYaw);
  const launchVelocity = computeClubLaunchVelocity(
    opts.clubId,
    power,
    horizontalDirection,
  );

  const dt = opts.dt ?? 1 / 60;
  const maxFlightSteps = opts.maxSteps ?? 260;
  const groundSampler =
    opts.sampleGroundY ??
    (opts.groundY !== undefined
      ? () => opts.groundY as number
      : getMasterPlanGroundElevationAt);
  const simulateAwning = opts.simulateAwningBounce ?? true;
  const simulateObstacles = opts.simulateObstacles ?? true;

  const originGroundY = groundSampler(opts.origin[0], opts.origin[2]);
  let px = opts.origin[0];
  let py = Math.max(opts.origin[1], originGroundY + BALL_RADIUS);
  let pz = opts.origin[2];
  let [vx, vy, vz] = launchVelocity;

  const arcPoints: Vec3Tuple[] = [[px, py, pz]];
  let apexY = py;
  let firstLandingPoint: Vec3Tuple | null = null;
  let firstImpactKind: TrajectoryImpactKind = 'ground';
  let firstImpactPoint: Vec3Tuple | null = null;
  let awningBouncePoint: Vec3Tuple | null = null;
  let awningHitOnce = false;
  let flightDurationSeconds = 0;
  let totalDurationSeconds = 0;

  if (power <= 0.001) {
    return {
      clubId: opts.clubId,
      power,
      horizontalDirection,
      launchVelocity,
      arcPoints,
      landingPoint: [px, py, pz],
      estimatedStopPoint: [px, py, pz],
      landingRingRadius: profile.previewLandingRadius,
      apexY,
      maxClearanceAboveOrigin: 0,
      flightDurationSeconds: 0,
      firstImpactKind: 'ground',
      firstImpactPoint: null,
      awningBouncePoint: null,
      totalDurationSeconds: 0,
    };
  }

  const awning = simulateAwning ? getHotdogAwningData() : null;
  let elapsed = 0;
  let settledOnGround = false;
  const maxTotalSteps = Math.max(maxFlightSteps, 480);

  for (let step = 1; step <= maxTotalSteps; step++) {
    const prev: Vec3Tuple = [px, py, pz];
    const groundY = groundSampler(px, pz);
    const surfaceTag: PhysicsSurfaceTag =
      opts.surfaceTag ??
      (opts.sampleGroundY || opts.groundY === undefined
        ? getMasterPlanSurfaceTagAt(px, pz)
        : 'road_asphalt');

    const airborne =
      !settledOnGround && (py > groundY + BALL_RADIUS + 0.02 || vy > 0.2);

    [vx, vy, vz] = stepBallAerodynamics({
      velocity: [vx, vy, vz],
      airborne,
      surfaceTag,
      profile,
      dt,
      gravityY: WORLD_GRAVITY_Y,
      applyGravity: true,
    });

    if (!airborne) {
      py = groundY + BALL_RADIUS;
      vy = 0;
    }

    const nextX = px + vx * dt;
    const nextY = py + vy * dt;
    const nextZ = pz + vz * dt;
    elapsed += dt;

    // 1. Check 28 deg Hotdog Cart awning impact on descending wedge/lob shots
    if (awning && !awningHitOnce && vy < 0) {
      const awningHit = intersectSegmentWithAwningObb(
        prev,
        [nextX, nextY, nextZ],
        awning,
      );
      if (awningHit) {
        awningHitOnce = true;
        awningBouncePoint = awningHit;
        if (!firstImpactPoint) {
          firstImpactKind = 'awning';
          firstImpactPoint = awningHit;
        }
        const bounced = computeAwningBounceVelocity(
          [vx, vy, vz],
          awning.axisN,
          awning.restitution,
        );
        vx = bounced[0];
        vy = bounced[1];
        vz = bounced[2];
        px = awningHit[0] + awning.axisN[0] * 0.05;
        py = awningHit[1] + awning.axisN[1] * 0.05;
        pz = awningHit[2] + awning.axisN[2] * 0.05;
        arcPoints.push([px, py, pz]);
        if (py > apexY) apexY = py;
        continue;
      }
    }

    // 2. Check solid obstacles (walls / perimeter buildings / overhanging canopy / raised curbs)
    if (simulateObstacles && elapsed > 0.04) {
      const solidHit = findFirstSolidSegmentHit(prev, [nextX, nextY, nextZ]);
      if (solidHit) {
        if (!firstImpactPoint) {
          firstImpactKind = solidHit.kind;
          firstImpactPoint = solidHit.point;
        }
        const hitRestitution = solidHit.kind === 'curb' ? 0.65 : 0.35;
        const vn =
          vx * solidHit.normal[0] +
          vy * solidHit.normal[1] +
          vz * solidHit.normal[2];
        if (vn < 0) {
          vx -= (1 + hitRestitution) * vn * solidHit.normal[0];
          vy -= (1 + hitRestitution) * vn * solidHit.normal[1];
          vz -= (1 + hitRestitution) * vn * solidHit.normal[2];
          if (solidHit.kind === 'tree') {
            vx *= 0.45;
            vy *= 0.45;
            vz *= 0.45;
          }
        }
        px = solidHit.point[0] + solidHit.normal[0] * 0.04;
        py = solidHit.point[1] + solidHit.normal[1] * 0.04;
        pz = solidHit.point[2] + solidHit.normal[2] * 0.04;
        arcPoints.push([px, py, pz]);
        continue;
      }
    }

    px = nextX;
    py = nextY;
    pz = nextZ;

    if (py > apexY) apexY = py;

    // 3. Check ground contact / bounce / transition to pure roll
    const nextGroundY = groundSampler(px, pz);
    const nextSurface: PhysicsSurfaceTag =
      opts.surfaceTag ??
      (opts.sampleGroundY || opts.groundY === undefined
        ? getMasterPlanSurfaceTagAt(px, pz)
        : 'road_asphalt');

    if (py <= nextGroundY + BALL_RADIUS) {
      py = nextGroundY + BALL_RADIUS;
      if (firstLandingPoint === null) {
        firstLandingPoint = [px, nextGroundY, pz];
        flightDurationSeconds = elapsed;
        if (!firstImpactPoint) {
          firstImpactKind = 'ground';
          firstImpactPoint = [px, nextGroundY + BALL_RADIUS, pz];
        }
      }
      if (vy < -0.55) {
        const bounceR = getSurfaceRestitution(nextSurface, opts.clubId);
        vy = Math.abs(vy) * bounceR;
        vx *= profile.turfCheckMultiplier;
        vz *= profile.turfCheckMultiplier;
      } else {
        vy = 0;
        settledOnGround = true;
      }
    }

    if (step % 2 === 0 || step === 1) {
      arcPoints.push([px, py, pz]);
    }

    const speedH = Math.hypot(vx, vz);
    totalDurationSeconds = elapsed;

    // For flat putt or settled roll, integrate cleanly to stop
    if (
      (settledOnGround || profile.launchAngleDeg <= 0.1) &&
      speedH <= profile.previewStopSpeed
    ) {
      break;
    }

    if (
      step >= maxFlightSteps &&
      firstLandingPoint !== null &&
      settledOnGround &&
      speedH <= profile.previewStopSpeed
    ) {
      break;
    }

    // Clamp overly deep out-of-world drift
    const bounds = COURSE_MASTER_PLAN.worldBoundsXZ;
    if (
      px < bounds.minX - 2 ||
      px > bounds.maxX + 2 ||
      pz < bounds.minZ - 2 ||
      pz > bounds.maxZ + 2
    ) {
      break;
    }
  }

  const finalPoint: Vec3Tuple = [px, py, pz];
  const lastArc = arcPoints[arcPoints.length - 1];
  if (!lastArc || !isSamePoint(lastArc, finalPoint, 0.02)) {
    arcPoints.push(finalPoint);
  }

  const stopGroundY = groundSampler(px, pz);
  const landingPoint: Vec3Tuple = firstLandingPoint ?? [px, stopGroundY, pz];
  const estimatedStopPoint: Vec3Tuple = [px, stopGroundY, pz];

  return {
    clubId: opts.clubId,
    power,
    horizontalDirection,
    launchVelocity,
    arcPoints,
    landingPoint,
    estimatedStopPoint,
    landingRingRadius: profile.previewLandingRadius,
    apexY,
    maxClearanceAboveOrigin: Math.max(0, apexY - opts.origin[1]),
    flightDurationSeconds:
      flightDurationSeconds > 0 ? flightDurationSeconds : totalDurationSeconds,
    firstImpactKind,
    firstImpactPoint,
    awningBouncePoint,
    totalDurationSeconds,
  };
}
