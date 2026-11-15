import * as THREE from 'three';
import {
  BALL_RADIUS,
  CLUB_SPECS,
  ELEVATIONS,
  type ClubId,
  type CourseMasterPlan,
  type GeneratedCityCourse,
  type GutterTrackSpec,
  type PlacedProp,
  type PlacedTile,
  type TileRampSpec,
  type Vec3Tuple,
  type WalkableRampSpec,
} from '@/types';
import {
  localToWorldPoint,
  worldToLocalPoint,
} from '@/engine/geometryHelpers';
import {
  evaluateCatmullRomSpline3D,
  evaluateCatmullRomTangent3D,
} from '@/lib/geometryHelpers';
import {
  COURSE_MASTER_PLAN,
  COURSE_PROPS,
  HOLE_1_CUP,
  STORM_GUTTERS,
  isWorldPointInWaterHazard,
} from '@/config/courseMasterPlan';
import {
  COPPER_SPIRAL_CHUTE_SPEC,
  computeRemainingCourseDistance,
  getEscapadeGroundElevationAt,
} from '@/config/grandEscapadeMasterPlan';

export interface RampColliderTransform {
  midPosition: Vec3Tuple;
  yawY: number;
  pitchX: number;
  quaternion: [number, number, number, number];
  halfExtents: Vec3Tuple;
}

export interface ArcSegmentCollider {
  center: Vec3Tuple;
  rotationY: number;
  halfExtents: Vec3Tuple;
}

export interface GutterGuideResult {
  inGutter: boolean;
  isCorner90: boolean;
  /** World-space unit tangent vector along the gutter in the ball's travel direction */
  tangentX: number;
  tangentZ: number;
  /** Offset toward gutter trough centerline in world XZ */
  pullX: number;
  pullZ: number;
  troughY: number;
}

/**
 * Generates a subtle procedural dimple bump texture on the client with zero external network assets.
 */
export function createBallDimpleTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#dadada';
  ctx.fillRect(0, 0, size, size);

  const rows = 8;
  const cols = 14;
  for (let r = 0; r < rows; r++) {
    const y = ((r + 0.5) / rows) * size;
    const offset = (r % 2) * 0.5;
    for (let c = 0; c < cols; c++) {
      const x = (((c + offset) % cols) / cols) * size;
      const grad = ctx.createRadialGradient(x, y, 0.5, x, y, 4.2);
      grad.addColorStop(0, '#7c7c7c');
      grad.addColorStop(0.75, '#b6b6b6');
      grad.addColorStop(1, '#dadada');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, 4.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Computes exact flush top-face Rapier CuboidCollider transform for a `TileRampSpec`.
 * Guarantees zero vertical step-lip at both `bottomY` and `topY`.
 */
export function computeRampColliderTransform(
  ramp: TileRampSpec,
  thickness = 0.18,
): RampColliderTransform {
  const b = ramp.localBoundsXZ;
  const midX = (b.minX + b.maxX) * 0.5;
  const midZ = (b.minZ + b.maxZ) * 0.5;
  const midY = (ramp.bottomY + ramp.topY) * 0.5;
  const rise = ramp.topY - ramp.bottomY;

  const isNS = ramp.climbDirection === 'north' || ramp.climbDirection === 'south';
  const run = isNS ? b.maxZ - b.minZ : b.maxX - b.minX;
  const width = isNS ? b.maxX - b.minX : b.maxZ - b.minZ;
  const slopeLen = Math.hypot(run, rise);
  const pitchX = Math.atan2(rise, Math.max(1e-4, run));

  let yawY = 0;
  switch (ramp.climbDirection) {
    case 'north':
      yawY = 0;
      break;
    case 'south':
      yawY = Math.PI;
      break;
    case 'east':
      yawY = -Math.PI * 0.5;
      break;
    case 'west':
      yawY = Math.PI * 0.5;
      break;
  }

  const euler = new THREE.Euler(pitchX, yawY, 0, 'YXZ');
  const quat = new THREE.Quaternion().setFromEuler(euler);
  // Shift collider center down by thickness/2 along rotated top normal so its top walkable
  // face passes cleanly through (bottomY .. topY) with zero vertical step-lip at either seam.
  const topNormal = new THREE.Vector3(0, thickness * 0.5, 0).applyQuaternion(quat);

  return {
    midPosition: [
      midX - topNormal.x,
      midY - topNormal.y,
      midZ - topNormal.z,
    ],
    yawY,
    pitchX,
    quaternion: [quat.x, quat.y, quat.z, quat.w],
    halfExtents: [width * 0.5, thickness * 0.5, slopeLen * 0.5],
  };
}

/**
 * Generates smooth segmented wall/curb colliders along a circular XZ arc
 * (`x = pivotX + R*cos(theta)`, `z = pivotZ + R*sin(theta)`).
 */
export function buildArcWallSegments(opts: {
  pivotX: number;
  pivotZ: number;
  radius: number;
  startAngleRad: number;
  endAngleRad: number;
  bottomY: number;
  topY: number;
  wallThickness: number;
  segments?: number;
}): ArcSegmentCollider[] {
  const segs = Math.max(4, opts.segments ?? 10);
  const height = Math.max(0.04, opts.topY - opts.bottomY);
  const midY = (opts.bottomY + opts.topY) * 0.5;
  const result: ArcSegmentCollider[] = [];

  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const a0 = opts.startAngleRad + (opts.endAngleRad - opts.startAngleRad) * t0;
    const a1 = opts.startAngleRad + (opts.endAngleRad - opts.startAngleRad) * t1;
    const x0 = opts.pivotX + opts.radius * Math.cos(a0);
    const z0 = opts.pivotZ + opts.radius * Math.sin(a0);
    const x1 = opts.pivotX + opts.radius * Math.cos(a1);
    const z1 = opts.pivotZ + opts.radius * Math.sin(a1);

    const cx = (x0 + x1) * 0.5;
    const cz = (z0 + z1) * 0.5;
    const segLen = Math.hypot(x1 - x0, z1 - z0) + 0.04;
    // Orient box local +X along chord vector (x1 - x0, z1 - z0)
    const rotY = -Math.atan2(z1 - z0, x1 - x0);

    result.push({
      center: [cx, midY, cz],
      rotationY: rotY,
      halfExtents: [segLen * 0.5, height * 0.5, opts.wallThickness * 0.5],
    });
  }

  return result;
}

/**
 * Computes active phase of a periodic subway steam grate gust, matching
 * `SubwaySteamGrateProp.tsx` phase synchronization.
 */
export function computeSteamGustState(
  elapsedSec: number,
  cycleSeconds = 3.2,
  dutyCycle = 0.55,
): { active: boolean; strength: number } {
  const safeCycle = Math.max(0.5, cycleSeconds);
  const activeSpan = safeCycle * Math.max(0.1, Math.min(1, dutyCycle));
  const phase = ((elapsedSec % safeCycle) + safeCycle) % safeCycle;
  if (phase >= activeSpan) {
    return { active: false, strength: 0 };
  }
  const u = phase / activeSpan;
  return {
    active: true,
    strength: Math.max(0.25, Math.sin(u * Math.PI)),
  };
}

/**
 * Deterministic 3D umbrella canopy dome reflection (`restitution = 0.55`).
 */
export function computeDeterministicUmbrellaBounce(
  ballPos: Vec3Tuple,
  ballVel: Vec3Tuple,
  canopyCenter: Vec3Tuple,
  canopyRadius: number,
  restitution = 0.55,
): Vec3Tuple {
  const rx = ballPos[0] - canopyCenter[0];
  const rz = ballPos[2] - canopyCenter[2];
  const radialDist = Math.hypot(rx, rz);
  const safeRadius = Math.max(0.45, canopyRadius);
  const ratio = Math.min(1, radialDist / safeRadius);

  let rnx = 0;
  let rnz = -1;
  if (radialDist > 0.05) {
    rnx = rx / radialDist;
    rnz = rz / radialDist;
  } else {
    const vh = Math.hypot(ballVel[0], ballVel[2]);
    if (vh > 0.1) {
      rnx = ballVel[0] / vh;
      rnz = ballVel[2] / vh;
    }
  }

  const slopeRad = (24 * Math.PI) / 180 * Math.max(0.16, Math.min(1, ratio * 1.1));
  const sinS = Math.sin(slopeRad);
  const cosS = Math.cos(slopeRad);
  const nx = rnx * sinS;
  const ny = cosS;
  const nz = rnz * sinS;

  const dot = ballVel[0] * nx + ballVel[1] * ny + ballVel[2] * nz;
  const inwardDot = Math.min(-2.4, dot);
  const bounceFactor = 1 + Math.max(0.35, Math.min(0.85, restitution));

  let outVx = ballVel[0] - bounceFactor * inwardDot * nx;
  let outVy = ballVel[1] - bounceFactor * inwardDot * ny;
  let outVz = ballVel[2] - bounceFactor * inwardDot * nz;

  // Guarantee lively trampoline rebound pop without erratic launch speed
  outVy = Math.max(outVy, 6.4);
  const horiz = Math.hypot(outVx, outVz);
  if (horiz < 3.6) {
    const dirX = horiz > 0.15 ? outVx / horiz : rnx;
    const dirZ = horiz > 0.15 ? outVz / horiz : rnz;
    outVx = dirX * 3.6;
    outVz = dirZ * 3.6;
  }

  return [outVx, outVy, outVz];
}

/**
 * Checks if world `(wx, wy, wz)` is currently rolling inside any tile's storm-drain gutter track,
 * returning the local tangent and centering offset for crisp gutter channeling & 90° corner banking.
 */
export function evaluateGutterTrackAtPoint(
  course: Pick<GeneratedCityCourse, 'tiles'>,
  wx: number,
  wy: number,
  wz: number,
  vx: number,
  vz: number,
): GutterGuideResult | null {
  if (wy > ELEVATIONS.SIDEWALK_Y + BALL_RADIUS + 0.06) return null;

  for (const tile of course.tiles) {
    if (tile.gutters.length === 0) continue;
    if (
      Math.abs(wx - tile.worldX) > 4.25 ||
      Math.abs(wz - tile.worldZ) > 4.25
    ) {
      continue;
    }

    const [lx, , lz] = worldToLocalPoint(
      tile.worldX,
      tile.worldZ,
      tile.rotationY,
      wx,
      0,
      wz,
    );

    // Transform velocity direction into tile-local space
    const c = Math.cos(-tile.rotationY);
    const s = Math.sin(-tile.rotationY);
    const lvx = vx * c + vz * s;
    const lvz = -vx * s + vz * c;

    for (const g of tile.gutters) {
      const res = checkSingleGutterLocal(tile, g, lx, lz, lvx, lvz);
      if (res) return res;
    }
  }

  return null;
}

function rotateLocalVecToWorld(
  tileRotationY: number,
  vx: number,
  vz: number,
): [number, number] {
  const c = Math.cos(tileRotationY);
  const s = Math.sin(tileRotationY);
  return [vx * c + vz * s, -vx * s + vz * c];
}

function checkSingleGutterLocal(
  tile: PlacedTile,
  g: GutterTrackSpec,
  lx: number,
  lz: number,
  lvx: number,
  lvz: number,
): GutterGuideResult | null {
  const halfTrack = g.width * 0.62;

  if (g.kind === 'straight' && g.start && g.end) {
    const sx = g.start[0];
    const sz = g.start[2];
    const ex = g.end[0];
    const ez = g.end[2];
    const segDx = ex - sx;
    const segDz = ez - sz;
    const segLenSq = segDx * segDx + segDz * segDz;
    if (segLenSq < 1e-6) return null;

    const projT = ((lx - sx) * segDx + (lz - sz) * segDz) / segLenSq;
    if (projT < -0.05 || projT > 1.05) return null;

    const clampedT = Math.max(0, Math.min(1, projT));
    const cx = sx + segDx * clampedT;
    const cz = sz + segDz * clampedT;
    const dist = Math.hypot(lx - cx, lz - cz);
    if (dist > halfTrack) return null;

    const segLen = Math.sqrt(segLenSq);
    let tx = segDx / segLen;
    let tz = segDz / segLen;
    if (lvx * tx + lvz * tz < 0) {
      tx = -tx;
      tz = -tz;
    }

    const [wtx, wtz] = rotateLocalVecToWorld(tile.rotationY, tx, tz);
    const [wCenterX, , wCenterZ] = localToWorldPoint(
      tile.worldX,
      tile.worldZ,
      tile.rotationY,
      [cx, 0, cz],
    );
    const [wBallX, , wBallZ] = localToWorldPoint(
      tile.worldX,
      tile.worldZ,
      tile.rotationY,
      [lx, 0, lz],
    );

    return {
      inGutter: true,
      isCorner90: false,
      tangentX: wtx,
      tangentZ: wtz,
      pullX: wCenterX - wBallX,
      pullZ: wCenterZ - wBallZ,
      troughY: g.troughY,
    };
  }

  if (
    g.kind === 'corner_90' &&
    g.arcCenter &&
    g.arcRadius !== undefined &&
    g.startAngleRad !== undefined &&
    g.endAngleRad !== undefined
  ) {
    const ax = g.arcCenter[0];
    const az = g.arcCenter[2];
    const dx = lx - ax;
    const dz = lz - az;
    const r = Math.hypot(dx, dz);
    if (Math.abs(r - g.arcRadius) > halfTrack || r < 1e-4) return null;

    // Normalize angle into [startAngleRad, endAngleRad] tolerance window
    let ang = Math.atan2(dz, dx);
    const minA = Math.min(g.startAngleRad, g.endAngleRad);
    const maxA = Math.max(g.startAngleRad, g.endAngleRad);
    while (ang < minA - 0.15) ang += Math.PI * 2;
    while (ang > maxA + 0.15) ang -= Math.PI * 2;
    if (ang < minA - 0.08 || ang > maxA + 0.08) return null;

    // Tangent to circle in direction of increasing angle is (-sin(ang), cos(ang))
    let tx = -Math.sin(ang);
    let tz = Math.cos(ang);
    if (lvx * tx + lvz * tz < 0) {
      tx = -tx;
      tz = -tz;
    }

    const clampedAng = Math.max(minA, Math.min(maxA, ang));
    const cx = ax + g.arcRadius * Math.cos(clampedAng);
    const cz = az + g.arcRadius * Math.sin(clampedAng);

    const [wtx, wtz] = rotateLocalVecToWorld(tile.rotationY, tx, tz);
    const [wCenterX, , wCenterZ] = localToWorldPoint(
      tile.worldX,
      tile.worldZ,
      tile.rotationY,
      [cx, 0, cz],
    );
    const [wBallX, , wBallZ] = localToWorldPoint(
      tile.worldX,
      tile.worldZ,
      tile.rotationY,
      [lx, 0, lz],
    );

    return {
      inGutter: true,
      isCorner90: true,
      tangentX: wtx,
      tangentZ: wtz,
      pullX: wCenterX - wBallX,
      pullZ: wCenterZ - wBallZ,
      troughY: g.troughY,
    };
  }

  return null;
}

/**
 * Checks whether a point `(wx, wy, wz)` is inside an oriented box in prop-local space.
 */
export function isPointInPropLocalBox(
  prop: PlacedProp,
  wx: number,
  wy: number,
  wz: number,
  localCenter: Vec3Tuple,
  halfExtents: Vec3Tuple,
): boolean {
  const [lx, ly, lz] = worldToLocalPoint(
    prop.position[0],
    prop.position[2],
    prop.rotationY,
    wx,
    wy - prop.position[1],
    wz,
  );
  return (
    Math.abs(lx - localCenter[0]) <= halfExtents[0] &&
    Math.abs(ly - localCenter[1]) <= halfExtents[1] &&
    Math.abs(lz - localCenter[2]) <= halfExtents[2]
  );
}

/**
 * Returns deterministic club restitution bounded safely for Rapier BallCollider.
 */
export function getClubRestitution(clubId: ClubId): number {
  return Math.max(0.2, Math.min(0.85, CLUB_SPECS[clubId].restitution));
}

export interface MasterPlanRampTransform {
  position: Vec3Tuple;
  rotationEuler: Vec3Tuple;
  halfExtents: Vec3Tuple;
  friction: number;
  restitution: number;
}

/**
 * Computes a flush Rapier CuboidCollider transform for a WalkableRampSpec so its
 * top surface meets both bottomY and topY with zero catching lip.
 */
export function computeMasterPlanRampTransform(
  ramp: WalkableRampSpec,
): MasterPlanRampTransform {
  const { minX, maxX, minZ, maxZ } = ramp.boundsXZ;
  const xSpan = Math.max(0.2, maxX - minX);
  const zSpan = Math.max(0.2, maxZ - minZ);
  const rise = ramp.topY - ramp.bottomY;
  const alongX =
    ramp.climbDirection === 'east' || ramp.climbDirection === 'west';
  const run = alongX ? xSpan : zSpan;
  const cross = alongX ? zSpan : xSpan;
  const exactSlopeLen = Math.hypot(run, rise);
  // Extend only past the bottom entry so topY meets the upper deck flush at 0.000m (zero raised lip)
  const bottomMargin = 0.08;
  const slopeLen = exactSlopeLen + bottomMargin;
  const thickness = Math.max(0.24, ramp.slabThickness);
  const halfT = thickness * 0.5;
  const theta = Math.atan2(rise, run);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  const midX = (minX + maxX) * 0.5;
  const midY = (ramp.bottomY + ramp.topY) * 0.5;
  const midZ = (minZ + maxZ) * 0.5;
  const halfMargin = bottomMargin * 0.5;

  let centerOffsetX = 0;
  let centerOffsetZ = 0;
  let rotationEuler: Vec3Tuple = [0, 0, 0];

  if (ramp.climbDirection === 'east') {
    centerOffsetX = halfT * sinT - halfMargin * cosT;
    rotationEuler = [0, 0, theta];
  } else if (ramp.climbDirection === 'west') {
    centerOffsetX = -halfT * sinT + halfMargin * cosT;
    rotationEuler = [0, 0, -theta];
  } else if (ramp.climbDirection === 'north') {
    centerOffsetZ = -halfT * sinT + halfMargin * cosT;
    rotationEuler = [theta, 0, 0];
  } else {
    centerOffsetZ = halfT * sinT - halfMargin * cosT;
    rotationEuler = [-theta, 0, 0];
  }

  return {
    position: [
      midX + centerOffsetX,
      midY - halfT * cosT - halfMargin * sinT,
      midZ + centerOffsetZ,
    ],
    rotationEuler,
    halfExtents: alongX
      ? [slopeLen * 0.5, halfT, cross * 0.5]
      : [cross * 0.5, halfT, slopeLen * 0.5],
    friction: ramp.friction,
    restitution: ramp.restitution,
  };
}

export interface MasterPlanGutterEval {
  inGutter: boolean;
  inCornerBoostZone: boolean;
  isCurvedCorner?: boolean;
  gutterId?: string;
  tangentXZ: [number, number];
  pullVelocityXZ: [number, number];
  boostVelocity: Vec3Tuple | null;
}

function normalizeAngleNear(angle: number, ref: number): number {
  let a = angle;
  while (a - ref < -Math.PI) a += Math.PI * 2;
  while (a - ref > Math.PI) a -= Math.PI * 2;
  return a;
}

/**
 * Evaluates ball position relative to storm gutters and hydrant-fed water boost corridors
 * across both Stage 1 ('classic') and Stage 2 ('grand-escapade').
 */
export function evaluateMasterPlanGutterAtPoint(
  wx: number,
  wy: number,
  wz: number,
  vx: number,
  vz: number,
  plan: CourseMasterPlan = COURSE_MASTER_PLAN,
): MasterPlanGutterEval {
  const noHit: MasterPlanGutterEval = {
    inGutter: false,
    inCornerBoostZone: false,
    tangentXZ: [0, 0],
    pullVelocityXZ: [0, 0],
    boostVelocity: null,
  };

  const speed = Math.hypot(vx, vz);

  if (plan.courseId !== 'classic') {
    for (const g of plan.gutters) {
      if (
        g.kind === 'corner_90' &&
        g.arcPivot &&
        g.arcRadius !== undefined &&
        g.startAngleRad !== undefined &&
        g.endAngleRad !== undefined
      ) {
        if (Math.abs(wy - (g.channelY + BALL_RADIUS)) > 0.36) continue;
        const px = g.arcPivot[0];
        const pz = g.arcPivot[2];
        const r = g.arcRadius;
        const dx = wx - px;
        const dz = wz - pz;
        const dist = Math.hypot(dx, dz);
        const halfTrack = Math.max(0.55, g.width * 0.72);
        if (Math.abs(dist - r) > halfTrack || dist < 1e-4) continue;

        const minA = Math.min(g.startAngleRad, g.endAngleRad);
        const maxA = Math.max(g.startAngleRad, g.endAngleRad);
        const midA = (minA + maxA) * 0.5;
        const theta = normalizeAngleNear(Math.atan2(dz, dx), midA);
        if (theta < minA - 0.25 || theta > maxA + 0.25) continue;

        // Tangent along increasing angle or reversed if gutter flow points +X/-Z
        let tx = -Math.sin(theta);
        let tz = Math.cos(theta);
        const sign = g.endAngleRad >= g.startAngleRad ? 1 : -1;
        tx *= sign;
        tz *= sign;
        const forwardTangentSpeed = vx * tx + vz * tz;
        if (forwardTangentSpeed < 0.85) continue;

        const rx = dx / dist;
        const rz = dz / dist;
        const radialErr = r - dist;
        const targetSpeed = Math.min(18.5, Math.max(forwardTangentSpeed + 0.4, speed * 0.55));
        return {
          inGutter: true,
          inCornerBoostZone: true,
          isCurvedCorner: true,
          gutterId: g.id,
          tangentXZ: [tx, tz],
          pullVelocityXZ: [
            tx * targetSpeed + rx * radialErr * 10.5,
            tz * targetSpeed + rz * radialErr * 10.5,
          ],
          boostVelocity: g.waterBoostVelocity ?? [11.2, 0.2, 0],
        };
      }

      if (g.kind === 'straight' && g.start && g.end) {
        const sx = g.start[0];
        const sy = g.start[1];
        const sz = g.start[2];
        const ex = g.end[0];
        const ey = g.end[1];
        const ez = g.end[2];
        const segDx = ex - sx;
        const segDz = ez - sz;
        const segLenSq = segDx * segDx + segDz * segDz;
        if (segLenSq < 1e-5) continue;

        const projT = ((wx - sx) * segDx + (wz - sz) * segDz) / segLenSq;
        if (projT < -0.04 || projT > 1.04) continue;
        const clampedT = Math.max(0, Math.min(1, projT));
        const cx = sx + segDx * clampedT;
        const cy = sy + (ey - sy) * clampedT;
        const cz = sz + segDz * clampedT;

        const isZone2TurnGutter = g.id === 'gutter-z2-belvedere-turn-boost';
        if (Math.abs(wy - (cy + BALL_RADIUS)) > (isZone2TurnGutter ? 0.55 : 0.34)) continue;
        const dist = Math.hypot(wx - cx, wz - cz);
        if (dist > Math.max(isZone2TurnGutter ? 0.72 : 0.42, g.width * (isZone2TurnGutter ? 1.1 : 0.72))) continue;

        const segLen = Math.sqrt(segLenSq);
        const tx = segDx / segLen;
        const tz = segDz / segLen;
        const forwardSpeed = vx * tx + vz * tz;
        const isZone2TurnCapture = isZone2TurnGutter && vz < -1.0;
        if (forwardSpeed < 0.9 && !g.waterBoostVelocity) continue;

        const flowDot = vx * tx + vz * tz;
        const dirSign = g.waterBoostVelocity ? 1 : flowDot >= 0 ? 1 : -1;
        if (g.waterBoostVelocity && forwardSpeed < 0.8 && !isZone2TurnCapture) continue;

        const uTx = tx * dirSign;
        const uTz = tz * dirSign;
        const pullScale = isZone2TurnGutter ? 7.2 : 4.8;
        const targetSpeed = g.waterBoostVelocity
          ? isZone2TurnCapture
            ? Math.min(13.2, Math.max(9.6, speed * 0.72))
            : Math.min(19.0, Math.max(Math.abs(forwardSpeed) + 1.1, 10.5))
          : Math.max(Math.abs(forwardSpeed), speed * 0.72);
        return {
          inGutter: true,
          inCornerBoostZone: Boolean(g.waterBoostVelocity),
          isCurvedCorner: isZone2TurnGutter,
          gutterId: g.id,
          tangentXZ: [uTx, uTz],
          pullVelocityXZ: [
            uTx * targetSpeed + (cx - wx) * pullScale,
            uTz * targetSpeed + (cz - wz) * pullScale,
          ],
          boostVelocity: g.waterBoostVelocity ?? null,
        };
      }
    }
    return noHit;
  }

  if (wy > ELEVATIONS.SIDEWALK_Y + BALL_RADIUS + 0.25) return noHit;

  const hydrant = COURSE_PROPS.find((p) => p.id === 'hydrant-corner-se');
  const cornerGutter = STORM_GUTTERS.find((g) => g.kind === 'corner_90');

  if (cornerGutter?.arcPivot && cornerGutter.arcRadius !== undefined) {
    const px = cornerGutter.arcPivot[0];
    const pz = cornerGutter.arcPivot[2];
    const r = cornerGutter.arcRadius;
    const dx = wx - px;
    const dz = wz - pz;
    const dist = Math.hypot(dx, dz);

    // Corner 90-degree curve: theta in [PI, 1.5*PI] -> West (-X) to North (-Z) relative to pivot, tangent North -> East (+X).
    // Only capture balls actually moving forward along the corner tangent (never pull backward/south-aimed shots).
    if (dist >= r - 0.55 && dist <= r + 0.65 && wx <= px + 0.45 && wz <= pz + 0.45) {
      let theta = Math.atan2(dz, dx);
      if (theta < 0) theta += Math.PI * 2;
      if (theta >= Math.PI - 0.25 && theta <= Math.PI * 1.5 + 0.28) {
        const tx = -Math.sin(theta);
        const tz = Math.cos(theta);
        const forwardTangentSpeed = vx * tx + vz * tz;
        if (forwardTangentSpeed > 1.5) {
          const radialErr = r - dist;
          const rx = dist > 1e-4 ? dx / dist : 0;
          const rz = dist > 1e-4 ? dz / dist : 0;
          // Preserve cornering momentum smoothly when tracking inside the gutter channel
          // without letting high-vaulting mis-hits equalize with clean bank shots.
          const targetSpeed =
            wy <= ELEVATIONS.SIDEWALK_Y + BALL_RADIUS + 0.23
              ? Math.min(18.5, Math.max(forwardTangentSpeed + 0.22, speed * 0.40))
              : forwardTangentSpeed * 0.82;
          const pullScale = 12.0;
          return {
            inGutter: true,
            inCornerBoostZone: true,
            isCurvedCorner: true,
            gutterId: cornerGutter.id,
            tangentXZ: [tx, tz],
            pullVelocityXZ: [
              tx * targetSpeed + rx * radialErr * pullScale,
              tz * targetSpeed + rz * radialErr * pullScale,
            ],
            boostVelocity: hydrant?.hydrantBoostMeta?.gutterExitBoostVector ?? [11.8, 0, 0],
          };
        }
      }
    }
  }

  // Only guide & boost the hydrant-fed SE corner corridor when inside the actual recessed gutter trough
  // and already traveling forward along the stream direction.
  for (const gutter of STORM_GUTTERS) {
    if (gutter.kind !== 'straight' || !gutter.start || !gutter.end) continue;
    const isEastCornerEntry = gutter.id === 'gutter-east-5th-straight';
    const isMercerSouth = gutter.id === 'gutter-mercer-south-straight';
    if (!isEastCornerEntry && !isMercerSouth) continue;

    if (isEastCornerEntry) {
      if (wz > -10.5 || wz < -15.8 || Math.abs(wx - 3.775) > 0.45) {
        continue;
      }
      if (vz >= -1.5 || Math.abs(vx) >= Math.abs(vz) * 0.85) {
        continue;
      }
      const pullX = (3.775 - wx) * 5.0;
      const forwardBoostSpeed = Math.min(18.5, Math.abs(vz) + 0.65);
      return {
        inGutter: true,
        inCornerBoostZone: wz <= -13.5,
        gutterId: gutter.id,
        tangentXZ: [0, -1],
        pullVelocityXZ: [pullX, -forwardBoostSpeed],
        boostVelocity: hydrant?.hydrantBoostMeta?.gutterExitBoostVector ?? [11.8, 0, 0],
      };
    }

    if (isMercerSouth) {
      // Strictly inside the Mercer South recessed gutter band (z in [-18.75, -18.05], x in [5.8, 14.6])
      if (wx < 5.8 || wx > 14.6 || wz < -18.75 || wz > -18.05 || wy > ELEVATIONS.SIDEWALK_Y + BALL_RADIUS + 0.04) {
        continue;
      }
      // Require forward (+X East) velocity along the stream; never hijack south- or west-aimed shots
      if (vx <= 1.8 || Math.abs(vz) >= vx * 0.85) {
        continue;
      }
      const targetZ = -18.38;
      const pullZ = (targetZ - wz) * 4.5;
      // Smooth continuous hydrant stream push proportional to remaining forward speed
      const streamPush = vx < 4.5 ? 0 : Math.min(2.2, (vx - 4.5) * 0.52);
      const additiveTargetVx = vx + streamPush;
      return {
        inGutter: true,
        inCornerBoostZone: true,
        gutterId: gutter.id,
        tangentXZ: [1, 0],
        pullVelocityXZ: [additiveTargetVx, pullZ],
        boostVelocity: hydrant?.hydrantBoostMeta?.gutterExitBoostVector ?? [11.8, 0, 0],
      };
    }
  }

  return noHit;
}

export function computeDistanceToPinMeters(
  pos: Vec3Tuple,
  planOrTarget: CourseMasterPlan | Vec3Tuple = COURSE_MASTER_PLAN,
): number {
  if (Array.isArray(planOrTarget)) {
    return Math.hypot(
      planOrTarget[0] - pos[0],
      planOrTarget[2] - pos[2],
    );
  }
  return computeRemainingCourseDistance(planOrTarget, pos);
}

export function isPointInSteamBay(
  wx: number,
  wy: number,
  wz: number,
  plan: CourseMasterPlan = COURSE_MASTER_PLAN,
): boolean {
  for (const prop of plan.props) {
    if (
      prop.type !== 'subway_steam_grate' &&
      prop.reactive?.kind !== 'steam_updraft'
    ) {
      continue;
    }
    const b = prop.steamLiftMeta?.utilityBayBoundsXZ;
    if (b) {
      if (
        wx >= b.minX - 0.12 &&
        wx <= b.maxX + 0.12 &&
        wz >= b.minZ - 0.12 &&
        wz <= b.maxZ + 0.12 &&
        wy >= prop.groundY - 0.08 &&
        wy <= prop.groundY + 1.35
      ) {
        return true;
      }
    } else if (prop.reactive) {
      const [cx, cy, cz] = prop.reactive.zoneCenter;
      const [hx, hy, hz] = prop.reactive.zoneHalfExtents ?? [1.1, 0.85, 1.1];
      if (
        Math.abs(wx - cx) <= hx + 0.12 &&
        Math.abs(wy - cy) <= hy + 0.5 &&
        Math.abs(wz - cz) <= hz + 0.12
      ) {
        return true;
      }
    }
  }
  return false;
}

export function isPointInFountainBasin(
  wx: number,
  wy: number,
  wz: number,
  plan: CourseMasterPlan = COURSE_MASTER_PLAN,
): boolean {
  if (plan.courseId === 'classic') {
    const fountain = plan.props.find((p) => p.id === 'fountain-courtyard-front');
    const reactive = fountain?.reactive;
    if (!reactive) return false;
    const distXZ = Math.hypot(
      wx - reactive.zoneCenter[0],
      wz - reactive.zoneCenter[2],
    );
    const r = (reactive.zoneRadius ?? 1.15) - 0.05;
    return distXZ <= r && wy <= reactive.zoneCenter[1] + 0.45 && wy >= 0.35;
  }
  return isWorldPointInWaterHazard(plan, wx, wy, wz);
}

/**
 * Duration in seconds (< 0.6s) of the Fountain Hazard parabolic recovery drop arc.
 */
export const FOUNTAIN_DROP_DURATION_SEC = 0.48;
export const OOB_RECOVERY_DURATION_SEC = 0.44;
export const COPPER_CHUTE_RIDE_DURATION_SEC = 1.45;

export function evaluateCopperChuteCapture(
  pos: Vec3Tuple,
  plan: CourseMasterPlan,
): boolean {
  if (plan.courseId !== 'grand-escapade') return false;
  const b = COPPER_SPIRAL_CHUTE_SPEC.entryFunnelBoundsXZ;
  return (
    pos[0] >= b.minX - 0.35 &&
    pos[0] <= b.maxX + 0.35 &&
    pos[2] >= b.minZ - 0.35 &&
    pos[2] <= b.maxZ + 0.35 &&
    pos[1] >= COPPER_SPIRAL_CHUTE_SPEC.entryPosition[1] - 0.9 &&
    pos[1] <= COPPER_SPIRAL_CHUTE_SPEC.entryPosition[1] + 1.35
  );
}

export function sampleCopperChuteRideState(progress01: number): {
  position: Vec3Tuple;
  tangent: Vec3Tuple;
} {
  const u = Math.max(0, Math.min(1, progress01));
  const rawPos = evaluateCatmullRomSpline3D(COPPER_SPIRAL_CHUTE_SPEC.waypoints, u);
  const tangent = evaluateCatmullRomTangent3D(COPPER_SPIRAL_CHUTE_SPEC.waypoints, u);
  return {
    position: [rawPos[0], rawPos[1] + BALL_RADIUS * 0.55, rawPos[2]],
    tangent,
  };
}

export function isPointInReactiveZone(
  pos: Vec3Tuple,
  zoneCenter: Vec3Tuple,
  zoneHalfExtents?: Vec3Tuple,
  zoneRadius?: number,
  pad = 0.12,
): boolean {
  if (zoneRadius !== undefined) {
    const distXZ = Math.hypot(pos[0] - zoneCenter[0], pos[2] - zoneCenter[2]);
    const hy = zoneHalfExtents?.[1] ?? 0.9;
    return distXZ <= zoneRadius + pad && Math.abs(pos[1] - zoneCenter[1]) <= hy + pad;
  }
  const [hx, hy, hz] = zoneHalfExtents ?? [1.0, 0.75, 1.0];
  return (
    Math.abs(pos[0] - zoneCenter[0]) <= hx + pad &&
    Math.abs(pos[1] - zoneCenter[1]) <= hy + pad &&
    Math.abs(pos[2] - zoneCenter[2]) <= hz + pad
  );
}

export function isStage2OutOfBounds(
  pos: Vec3Tuple,
  plan: CourseMasterPlan,
): boolean {
  const wb = plan.worldBoundsXZ;
  if (
    pos[0] < wb.minX - 6 ||
    pos[0] > wb.maxX + 6 ||
    pos[2] < wb.minZ - 6 ||
    pos[2] > wb.maxZ + 6
  ) {
    return true;
  }
  if (plan.courseId === 'classic') {
    return pos[1] < -3.5;
  }
  // Strictly below Zone 7 subway floor (-7.5m) & Golden Pin cup well (-7.92m)
  if (pos[1] < -8.35) {
    return true;
  }
  // Fell into unreachable sub-foundation chasm beneath Zone 2 hillside or Zone 3/4 rooftops
  if (pos[2] < -35 && pos[1] < 0.1) {
    return true;
  }
  if (pos[2] < -77 && pos[0] > 10 && pos[1] < 7.2) {
    return true;
  }
  // Dropped outside ground deck onto abyssal horizon skirt (-8.5m)
  const surfY = getEscapadeGroundElevationAt(pos[0], pos[2]);
  if (surfY <= -8.0 && pos[1] < -7.8) {
    return true;
  }
  return false;
}

export interface RectBoundsXZ {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Partitions an axis-aligned XZ rectangle cleanly around a cutout rectangle so
 * adjacent ground colliders never overlap coplanarly or block recessed openings (e.g. cup well).
 */
export function subtractRect2D(
  outer: RectBoundsXZ,
  hole: RectBoundsXZ,
  minSpan = 1e-4,
): RectBoundsXZ[] {
  const ix0 = Math.max(outer.minX, hole.minX);
  const ix1 = Math.min(outer.maxX, hole.maxX);
  const iz0 = Math.max(outer.minZ, hole.minZ);
  const iz1 = Math.min(outer.maxZ, hole.maxZ);
  if (ix0 >= ix1 || iz0 >= iz1) return [outer];

  const out: RectBoundsXZ[] = [];
  if (ix0 - outer.minX > minSpan) {
    out.push({ minX: outer.minX, maxX: ix0, minZ: outer.minZ, maxZ: outer.maxZ });
  }
  if (outer.maxX - ix1 > minSpan) {
    out.push({ minX: ix1, maxX: outer.maxX, minZ: outer.minZ, maxZ: outer.maxZ });
  }
  if (iz0 - outer.minZ > minSpan) {
    out.push({ minX: ix0, maxX: ix1, minZ: outer.minZ, maxZ: iz0 });
  }
  if (outer.maxZ - iz1 > minSpan) {
    out.push({ minX: ix0, maxX: ix1, minZ: iz1, maxZ: outer.maxZ });
  }
  return out;
}

/**
 * Samples a brisk parabolic recovery arc point from the fountain splash location
 * over the stone rim onto the quick-drop relief spot.
 */
export function sampleFountainDropArcPoint(
  from: Vec3Tuple,
  to: Vec3Tuple,
  progress01: number,
  arcLiftMeters = 0.92,
): Vec3Tuple {
  const u = Math.max(0, Math.min(1, progress01));
  // Gentle cubic-out horizontal ease with crisp ballistic parabola vertically
  const horizT = 1 - Math.pow(1 - u, 1.85);
  const x = from[0] + (to[0] - from[0]) * horizT;
  const z = from[2] + (to[2] - from[2]) * horizT;
  const baseY = from[1] + (to[1] - from[1]) * u;
  const liftY = 4 * arcLiftMeters * u * (1 - u);
  return [x, baseY + liftY, z];
}
