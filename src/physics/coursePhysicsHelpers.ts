import * as THREE from 'three';
import {
  BALL_RADIUS,
  CLUB_SPECS,
  ELEVATIONS,
  type ClubId,
  type GeneratedCityCourse,
  type GutterTrackSpec,
  type PlacedProp,
  type PlacedTile,
  type TileRampSpec,
  type Vec3Tuple,
} from '@/types';
import {
  localToWorldPoint,
  worldToLocalPoint,
} from '@/engine/geometryHelpers';

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
