import type { AABB3D, OBB2D, Vec2Tuple, Vec3Tuple } from '../types/course';

/**
 * Canonical Local Coordinate Standard enforced across every prop, building, and coaxial builder:
 * - `+Y = Up`      ([0, 1, 0])
 * - `+Z = Forward` ([0, 0, 1])
 * - `+X = Right`   ([1, 0, 0])
 * - `groundContactY = 0`: Local `y = 0` sits flush on the resting ground surface (`groundY`).
 */
export const CANONICAL_LOCAL_FRAME = {
  up: [0, 1, 0] as Vec3Tuple,
  forward: [0, 0, 1] as Vec3Tuple,
  right: [1, 0, 0] as Vec3Tuple,
  groundContactY: 0,
} as const;

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function dotVec3(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function crossVec3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function normalizeVec3(v: Vec3Tuple): Vec3Tuple {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-12) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function distance2D(a: Vec2Tuple | Vec3Tuple, b: Vec2Tuple | Vec3Tuple): number {
  const az = a.length === 3 ? a[2] : a[1];
  const bz = b.length === 3 ? b[2] : b[1];
  return Math.hypot(a[0] - b[0], az - bz);
}

export function distance3D(a: Vec3Tuple, b: Vec3Tuple): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Applies Three.js default intrinsic Euler `'XYZ'` (`M = Mx(rx) * My(ry) * Mz(rz)`)
 * to a 3D vector. Used to compute exact transformed part axes for coaxial verification.
 */
export function applyEulerXYZToVector(
  vec: Vec3Tuple,
  euler: Vec3Tuple,
): Vec3Tuple {
  const [vx, vy, vz] = vec;
  const [rx, ry, rz] = euler;

  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const x1 = vx * cz - vy * sz;
  const y1 = vx * sz + vy * cz;
  const z1 = vz;

  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const x2 = x1 * cy + z1 * sy;
  const y2 = y1;
  const z2 = -x1 * sy + z1 * cy;

  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const x3 = x2;
  const y3 = y2 * cx - z2 * sx;
  const z3 = y2 * sx + z2 * cx;

  return [
    Math.abs(x3) < 1e-12 ? 0 : x3,
    Math.abs(y3) < 1e-12 ? 0 : y3,
    Math.abs(z3) < 1e-12 ? 0 : z3,
  ];
}

/**
 * Transforms a local point `[lx, ly, lz]` into world XZ at `(originX, originZ)` rotated around `+Y` by `rotationY`,
 * keeping `ly` unchanged (backwards-compatible with planar local-to-world helpers).
 */
export function localToWorldPoint(
  originX: number,
  originZ: number,
  rotationY: number,
  localPoint: Vec3Tuple,
): Vec3Tuple {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const wx = originX + localPoint[0] * c + localPoint[2] * s;
  const wz = originZ - localPoint[0] * s + localPoint[2] * c;
  return [wx, localPoint[1], wz];
}

/**
 * Transforms a local point `[lx, ly, lz]` inside a prop at `propPosition = [px, groundY, pz]`
 * rotated around `+Y` by `rotationY` into full 3D world coordinates `[wx, groundY + ly, wz]`.
 */
export function localToWorldPosition(
  propPosition: Vec3Tuple,
  rotationY: number,
  localPoint: Vec3Tuple,
): Vec3Tuple {
  const [wx, ly, wz] = localToWorldPoint(
    propPosition[0],
    propPosition[2],
    rotationY,
    localPoint,
  );
  return [wx, propPosition[1] + ly, wz];
}

/**
 * Rotates a local direction vector `[dx, dy, dz]` by `rotationY` around `+Y`.
 */
export function localDirToWorldDir(
  rotationY: number,
  localDir: Vec3Tuple,
): Vec3Tuple {
  return applyEulerXYZToVector(localDir, [0, rotationY, 0]);
}

/**
 * Transforms a world-space point `(wx, wy, wz)` into local coordinates around `(originX, 0, originZ)`.
 */
export function worldToLocalPoint(
  originX: number,
  originZ: number,
  rotationY: number,
  wx: number,
  wy: number,
  wz: number,
): Vec3Tuple {
  const dx = wx - originX;
  const dz = wz - originZ;
  const c = Math.cos(-rotationY);
  const s = Math.sin(-rotationY);
  return [dx * c + dz * s, wy, -dx * s + dz * c];
}

// ============================================================================
// WORLD-SPACE AABB / OBB & RAY-BOX 2D/3D INTERSECTION MATH
// ============================================================================

/**
 * Computes exact world-space AABB for an entity whose local bounding volume has
 * size `[widthX, heightY, depthZ]` with local `y in [0, heightY]` flush on `position[1] = groundY`.
 */
export function computeRotatedAABB(
  position: Vec3Tuple,
  localSize: Vec3Tuple,
  rotationY = 0,
): AABB3D {
  const hx = localSize[0] * 0.5;
  const hz = localSize[2] * 0.5;
  const ac = Math.abs(Math.cos(rotationY));
  const as = Math.abs(Math.sin(rotationY));
  const worldHx = hx * ac + hz * as;
  const worldHz = hx * as + hz * ac;

  return {
    min: [position[0] - worldHx, position[1], position[2] - worldHz],
    max: [
      position[0] + worldHx,
      position[1] + localSize[1],
      position[2] + worldHz,
    ],
  };
}

/**
 * Computes world-space AABB for an entity centered at `center = [cx, cy, cz]` with full `size = [sx, sy, sz]`.
 */
export function computeCenteredBoxAABB(
  center: Vec3Tuple,
  size: Vec3Tuple,
  rotationY = 0,
): AABB3D {
  const hx = size[0] * 0.5;
  const hy = size[1] * 0.5;
  const hz = size[2] * 0.5;
  const ac = Math.abs(Math.cos(rotationY));
  const as = Math.abs(Math.sin(rotationY));
  const worldHx = hx * ac + hz * as;
  const worldHz = hx * as + hz * ac;

  return {
    min: [center[0] - worldHx, center[1] - hy, center[2] - worldHz],
    max: [center[0] + worldHx, center[1] + hy, center[2] + worldHz],
  };
}

/**
 * Builds an axis-aligned `AABB3D` directly from XZ bounds and `[minY, maxY]`.
 */
export function computeAABBFromBoundsXZ(
  boundsXZ: { minX: number; maxX: number; minZ: number; maxZ: number },
  minY: number,
  maxY: number,
): AABB3D {
  return {
    min: [boundsXZ.minX, minY, boundsXZ.minZ],
    max: [boundsXZ.maxX, maxY, boundsXZ.maxZ],
  };
}

/**
 * Builds a 2D Oriented Bounding Box (`OBB2D`) in world XZ for precise rotated collision & camera checks.
 */
export function buildOBB2D(
  centerXZ: Vec2Tuple,
  sizeXZ: Vec2Tuple,
  rotationY = 0,
): OBB2D {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  return {
    centerXZ: [centerXZ[0], centerXZ[1]],
    halfExtentsXZ: [sizeXZ[0] * 0.5, sizeXZ[1] * 0.5],
    rotationY,
    axisX: [c, -s],
    axisZ: [s, c],
  };
}

/**
 * 2D Separating Axis Theorem (SAT) overlap test for two `OBB2D` volumes in world XZ.
 */
export function obbsOverlap2D(a: OBB2D, b: OBB2D, epsilon = 1e-4): boolean {
  const axes: Vec2Tuple[] = [a.axisX, a.axisZ, b.axisX, b.axisZ];
  const dx = b.centerXZ[0] - a.centerXZ[0];
  const dz = b.centerXZ[1] - a.centerXZ[1];

  for (const [ax, az] of axes) {
    const dist = Math.abs(dx * ax + dz * az);
    const ra =
      a.halfExtentsXZ[0] * Math.abs(a.axisX[0] * ax + a.axisX[1] * az) +
      a.halfExtentsXZ[1] * Math.abs(a.axisZ[0] * ax + a.axisZ[1] * az);
    const rb =
      b.halfExtentsXZ[0] * Math.abs(b.axisX[0] * ax + b.axisX[1] * az) +
      b.halfExtentsXZ[1] * Math.abs(b.axisZ[0] * ax + b.axisZ[1] * az);
    if (dist >= ra + rb - epsilon) {
      return false;
    }
  }
  return true;
}

export function aabbsOverlap3D(a: AABB3D, b: AABB3D, epsilon = 1e-4): boolean {
  return (
    a.min[0] + epsilon < b.max[0] &&
    a.max[0] - epsilon > b.min[0] &&
    a.min[1] + epsilon < b.max[1] &&
    a.max[1] - epsilon > b.min[1] &&
    a.min[2] + epsilon < b.max[2] &&
    a.max[2] - epsilon > b.min[2]
  );
}

/**
 * Returns true if `inner` XZ footprint sits completely inside `outerBoundsXZ` within `epsilon`.
 */
export function aabbContainedInBoundsXZ(
  inner: AABB3D,
  outerBoundsXZ: { minX: number; maxX: number; minZ: number; maxZ: number },
  epsilon = 1e-4,
): boolean {
  return (
    inner.min[0] >= outerBoundsXZ.minX - epsilon &&
    inner.max[0] <= outerBoundsXZ.maxX + epsilon &&
    inner.min[2] >= outerBoundsXZ.minZ - epsilon &&
    inner.max[2] <= outerBoundsXZ.maxZ + epsilon
  );
}

/**
 * Computes minimum horizontal Euclidean separation gap in XZ between two AABBs (`0` if touching or overlapping).
 */
export function computeHorizontalAABBGap(a: AABB3D, b: AABB3D): number {
  const gapX = Math.max(0, a.min[0] - b.max[0], b.min[0] - a.max[0]);
  const gapZ = Math.max(0, a.min[2] - b.max[2], b.min[2] - a.max[2]);
  return Math.hypot(gapX, gapZ);
}

export interface RayHit2D {
  hit: boolean;
  tMin: number;
  tMax: number;
  point: Vec2Tuple | null;
}

/**
 * Slab-method 2D horizontal ray vs AABB XZ intersection (`originXZ + t * dirXZ`, `t >= 0`).
 * Used for 360-degree perimeter raycast closure auditing.
 */
export function intersectRayAABB2D(
  originXZ: Vec2Tuple,
  dirXZ: Vec2Tuple,
  aabb: AABB3D,
  maxDistance = 500,
): RayHit2D {
  const len = Math.hypot(dirXZ[0], dirXZ[1]);
  if (len < 1e-12) {
    return { hit: false, tMin: Infinity, tMax: -Infinity, point: null };
  }
  const dx = dirXZ[0] / len;
  const dz = dirXZ[1] / len;

  let tMin = 0;
  let tMax = maxDistance;

  if (Math.abs(dx) < 1e-12) {
    if (originXZ[0] < aabb.min[0] || originXZ[0] > aabb.max[0]) {
      return { hit: false, tMin: Infinity, tMax: -Infinity, point: null };
    }
  } else {
    const invX = 1 / dx;
    let t1 = (aabb.min[0] - originXZ[0]) * invX;
    let t2 = (aabb.max[0] - originXZ[0]) * invX;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) {
      return { hit: false, tMin: Infinity, tMax: -Infinity, point: null };
    }
  }

  if (Math.abs(dz) < 1e-12) {
    if (originXZ[1] < aabb.min[2] || originXZ[1] > aabb.max[2]) {
      return { hit: false, tMin: Infinity, tMax: -Infinity, point: null };
    }
  } else {
    const invZ = 1 / dz;
    let t1 = (aabb.min[2] - originXZ[1]) * invZ;
    let t2 = (aabb.max[2] - originXZ[1]) * invZ;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) {
      return { hit: false, tMin: Infinity, tMax: -Infinity, point: null };
    }
  }

  return {
    hit: true,
    tMin,
    tMax,
    point: [originXZ[0] + dx * tMin, originXZ[1] + dz * tMin],
  };
}

export interface RayHit3D {
  hit: boolean;
  tMin: number;
  tMax: number;
  point: Vec3Tuple | null;
  normal: Vec3Tuple | null;
}

/**
 * Slab-method 3D ray vs `AABB3D` intersection (`origin + t * dir`, `0 <= t <= maxDistance`).
 * Used for 360-degree 3D perimeter closure & camera sightline occlusion checks.
 */
export function intersectRayAABB3D(
  origin: Vec3Tuple,
  dir: Vec3Tuple,
  aabb: AABB3D,
  maxDistance = 500,
): RayHit3D {
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  if (len < 1e-12) {
    return { hit: false, tMin: Infinity, tMax: -Infinity, point: null, normal: null };
  }
  const unit: Vec3Tuple = [dir[0] / len, dir[1] / len, dir[2] / len];

  let tMin = 0;
  let tMax = maxDistance;
  let hitNormal: Vec3Tuple = [0, 1, 0];

  for (let axis = 0; axis < 3; axis++) {
    const o = origin[axis];
    const d = unit[axis];
    const bMin = aabb.min[axis];
    const bMax = aabb.max[axis];

    if (Math.abs(d) < 1e-12) {
      if (o < bMin || o > bMax) {
        return { hit: false, tMin: Infinity, tMax: -Infinity, point: null, normal: null };
      }
    } else {
      const inv = 1 / d;
      let t1 = (bMin - o) * inv;
      let t2 = (bMax - o) * inv;
      let n1: Vec3Tuple = [0, 0, 0];
      n1[axis] = d > 0 ? -1 : 1;
      if (t1 > t2) {
        [t1, t2] = [t2, t1];
      }
      if (t1 > tMin) {
        tMin = t1;
        hitNormal = n1;
      }
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) {
        return { hit: false, tMin: Infinity, tMax: -Infinity, point: null, normal: null };
      }
    }
  }

  return {
    hit: true,
    tMin,
    tMax,
    point: [
      origin[0] + unit[0] * tMin,
      origin[1] + unit[1] * tMin,
      origin[2] + unit[2] * tMin,
    ],
    normal: hitNormal,
  };
}

/**
 * 3D ray vs Y-rotated Oriented Bounding Box (`center`, `halfExtents`, `rotationY`).
 */
export function intersectRayOBB3D(
  origin: Vec3Tuple,
  dir: Vec3Tuple,
  center: Vec3Tuple,
  halfExtents: Vec3Tuple,
  rotationY: number,
  maxDistance = 500,
): RayHit3D {
  const localOrigin = worldToLocalPoint(
    center[0],
    center[2],
    rotationY,
    origin[0],
    origin[1] - center[1],
    origin[2],
  );
  const localDir = applyEulerXYZToVector(dir, [0, -rotationY, 0]);
  const localBox: AABB3D = {
    min: [-halfExtents[0], -halfExtents[1], -halfExtents[2]],
    max: [halfExtents[0], halfExtents[1], halfExtents[2]],
  };
  const localHit = intersectRayAABB3D(localOrigin, localDir, localBox, maxDistance);
  if (!localHit.hit || !localHit.point || !localHit.normal) {
    return localHit;
  }
  const [wx, ly, wz] = localToWorldPoint(
    center[0],
    center[2],
    rotationY,
    localHit.point,
  );
  return {
    hit: true,
    tMin: localHit.tMin,
    tMax: localHit.tMax,
    point: [wx, center[1] + ly, wz],
    normal: localDirToWorldDir(rotationY, localHit.normal),
  };
}

// ============================================================================
// 1. COAXIAL WHEEL BUILDER (Delivery Van & Spoked Hotdog Cart Wheels)
// ============================================================================

export interface WheelBuilderOptions {
  /** Total outer radius of the tire in meters (tire bottom sits at exact y = 0). Default: 0.28 */
  outerRadius?: number;
  /** Cross-sectional tube radius of the tire torus in meters. Default: 0.065 */
  tireTubeRadius?: number;
  /** Width of the inner metal rim cylinder along the axle. Default: 0.09 */
  rimWidth?: number;
  /** Radius of the central wheel hub cylinder. Default: 0.055 */
  hubRadius?: number;
  /** Width of the central hub cylinder along the axle. Default: 0.12 */
  hubWidth?: number;
  /** Number of radial spokes in the wheel plane. Default: 8 */
  spokeCount?: number;
  /** Radius of each cylindrical spoke. Default: 0.011 */
  spokeRadius?: number;
  /** Radius of the central axle rod. Default: 0.022 */
  axleRadius?: number;
  /** Total length of the axle rod along the axle axis. Default: 0.16 */
  axleLength?: number;
  /**
   * Axle axis in the prop's canonical frame (+Y=Up, +Z=Forward, +X=Right):
   * - `'x'` (default): Axle along +X `[1, 0, 0]`, wheel lies in YZ plane and rolls forward along +Z.
   * - `'z'`: Axle along +Z `[0, 0, 1]`, wheel lies in XY plane and rolls along +X.
   */
  axleAxis?: 'x' | 'z';
  /** Optional spin angle around the axle in radians. Default: 0 */
  spinAngleRad?: number;
}

export interface CoaxialWheelSpokeSpec {
  index: number;
  angleRad: number;
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  radius: number;
  length: number;
  /** Transformed unit direction of the spoke in wheel frame (strictly orthogonal to axleDirection) */
  directionAxis: Vec3Tuple;
}

export interface CoaxialWheelSpec {
  outerRadius: number;
  tireMajorRadius: number;
  tireTubeRadius: number;
  axleAxis: 'x' | 'z';
  wheelPlane: 'YZ' | 'XY';
  /** Unit vector along the shared coaxial rotation axis */
  axleDirection: Vec3Tuple;
  /** Center of the wheel `[0, outerRadius, 0]` so tire bottom touches exact `y = 0` */
  wheelCenter: Vec3Tuple;
  /** Exact lowest Y coordinate of the tire (`0`) */
  groundContactY: number;
  tire: {
    majorRadius: number;
    tubeRadius: number;
    radialSegments: number;
    tubularSegments: number;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
    normalAxis: Vec3Tuple;
  };
  rim: {
    outerRadius: number;
    innerRadius: number;
    width: number;
    radialSegments: number;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
    symmetryAxis: Vec3Tuple;
  };
  hub: {
    radius: number;
    width: number;
    radialSegments: number;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
    symmetryAxis: Vec3Tuple;
  };
  hubcap: {
    radius: number;
    thickness: number;
    outboardPosition: Vec3Tuple;
    inboardPosition: Vec3Tuple;
    rotation: Vec3Tuple;
    symmetryAxis: Vec3Tuple;
  };
  axle: {
    radius: number;
    length: number;
    radialSegments: number;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
    symmetryAxis: Vec3Tuple;
  };
  spokes: CoaxialWheelSpokeSpec[];
}

/**
 * Builds exact coaxial transforms for a multi-part spoked or solid-disc wheel:
 * - Tire (`THREE.TorusGeometry`, native axis `+Z`)
 * - Rim, Hub, Hubcaps, Axle (`THREE.CylinderGeometry`, native axis `+Y`)
 * - Radial Spokes (`THREE.CylinderGeometry`, native axis `+Y`, rotated strictly inside the wheel plane)
 * Guarantees ALL parts share the exact same axle direction, rotation plane, and `y = 0` ground contact.
 */
export function buildCoaxialWheelSpec(
  opts: WheelBuilderOptions = {},
): CoaxialWheelSpec {
  const outerRadius = opts.outerRadius ?? 0.28;
  const tireTubeRadius = Math.min(
    opts.tireTubeRadius ?? 0.065,
    outerRadius * 0.42,
  );
  const tireMajorRadius = outerRadius - tireTubeRadius;
  const rimOuterRadius = tireMajorRadius - tireTubeRadius * 0.35;
  const rimInnerRadius = Math.max(0.04, rimOuterRadius - 0.024);
  const rimWidth = opts.rimWidth ?? tireTubeRadius * 1.45;
  const hubRadius = Math.min(opts.hubRadius ?? 0.055, rimInnerRadius * 0.72);
  const hubWidth = opts.hubWidth ?? rimWidth * 1.28;
  const spokeCount = Math.max(3, Math.round(opts.spokeCount ?? 8));
  const spokeRadius = opts.spokeRadius ?? 0.011;
  const axleRadius = opts.axleRadius ?? 0.022;
  const axleLength = opts.axleLength ?? hubWidth * 1.3;
  const axleAxis = opts.axleAxis ?? 'x';
  const spinAngleRad = opts.spinAngleRad ?? 0;

  const wheelCenter: Vec3Tuple = [0, outerRadius, 0];
  const axleDirection: Vec3Tuple = axleAxis === 'x' ? [1, 0, 0] : [0, 0, 1];
  const wheelPlane = axleAxis === 'x' ? 'YZ' : 'XY';

  // TorusGeometry has native hole axis +Z = [0, 0, 1]
  const tireRotation: Vec3Tuple =
    axleAxis === 'x' ? [0, Math.PI * 0.5, 0] : [0, 0, 0];
  const tireNormalAxis = applyEulerXYZToVector([0, 0, 1], tireRotation);

  // CylinderGeometry has native symmetry axis +Y = [0, 1, 0]
  const cylinderAlongAxleRotation: Vec3Tuple =
    axleAxis === 'x' ? [0, 0, -Math.PI * 0.5] : [Math.PI * 0.5, 0, 0];
  const cylinderSymmetryAxis = applyEulerXYZToVector(
    [0, 1, 0],
    cylinderAlongAxleRotation,
  );

  const hubcapThickness = 0.018;
  const hubcapOffset = hubWidth * 0.5 + hubcapThickness * 0.5 - 0.003;
  const outboardPosition: Vec3Tuple =
    axleAxis === 'x'
      ? [hubcapOffset, outerRadius, 0]
      : [0, outerRadius, hubcapOffset];
  const inboardPosition: Vec3Tuple =
    axleAxis === 'x'
      ? [-hubcapOffset, outerRadius, 0]
      : [0, outerRadius, -hubcapOffset];

  const spokeStartR = hubRadius * 0.85;
  const spokeEndR = rimInnerRadius + 0.008;
  const spokeLength = Math.max(0.02, spokeEndR - spokeStartR);
  const spokeMidR = (spokeStartR + spokeEndR) * 0.5;

  const spokes: CoaxialWheelSpokeSpec[] = [];
  for (let i = 0; i < spokeCount; i++) {
    const angleRad = spinAngleRad + (i / spokeCount) * Math.PI * 2;
    let spokeRotation: Vec3Tuple;
    let spokePosition: Vec3Tuple;

    if (axleAxis === 'x') {
      spokeRotation = [angleRad, 0, 0];
      spokePosition = [
        0,
        outerRadius + spokeMidR * Math.cos(angleRad),
        spokeMidR * Math.sin(angleRad),
      ];
    } else {
      spokeRotation = [0, 0, angleRad];
      spokePosition = [
        -spokeMidR * Math.sin(angleRad),
        outerRadius + spokeMidR * Math.cos(angleRad),
        0,
      ];
    }

    const directionAxis = applyEulerXYZToVector([0, 1, 0], spokeRotation);
    spokes.push({
      index: i,
      angleRad,
      position: spokePosition,
      rotation: spokeRotation,
      radius: spokeRadius,
      length: spokeLength,
      directionAxis,
    });
  }

  const groundContactY = wheelCenter[1] - (tireMajorRadius + tireTubeRadius);

  return {
    outerRadius,
    tireMajorRadius,
    tireTubeRadius,
    axleAxis,
    wheelPlane,
    axleDirection,
    wheelCenter,
    groundContactY: Math.abs(groundContactY) < 1e-12 ? 0 : groundContactY,
    tire: {
      majorRadius: tireMajorRadius,
      tubeRadius: tireTubeRadius,
      radialSegments: 16,
      tubularSegments: 32,
      position: [...wheelCenter] as Vec3Tuple,
      rotation: tireRotation,
      normalAxis: tireNormalAxis,
    },
    rim: {
      outerRadius: rimOuterRadius,
      innerRadius: rimInnerRadius,
      width: rimWidth,
      radialSegments: 24,
      position: [...wheelCenter] as Vec3Tuple,
      rotation: [...cylinderAlongAxleRotation] as Vec3Tuple,
      symmetryAxis: cylinderSymmetryAxis,
    },
    hub: {
      radius: hubRadius,
      width: hubWidth,
      radialSegments: 18,
      position: [...wheelCenter] as Vec3Tuple,
      rotation: [...cylinderAlongAxleRotation] as Vec3Tuple,
      symmetryAxis: cylinderSymmetryAxis,
    },
    hubcap: {
      radius: Math.min(rimInnerRadius * 0.88, hubRadius * 1.45),
      thickness: hubcapThickness,
      outboardPosition,
      inboardPosition,
      rotation: [...cylinderAlongAxleRotation] as Vec3Tuple,
      symmetryAxis: cylinderSymmetryAxis,
    },
    axle: {
      radius: axleRadius,
      length: axleLength,
      radialSegments: 14,
      position: [...wheelCenter] as Vec3Tuple,
      rotation: [...cylinderAlongAxleRotation] as Vec3Tuple,
      symmetryAxis: cylinderSymmetryAxis,
    },
    spokes,
  };
}

// ============================================================================
// 2. COAXIAL UMBRELLA & PITCHED STRIPED AWNING BUILDERS
// ============================================================================

export interface UmbrellaBuilderOptions {
  /** Height from y=0 pole base to canopy lower rim. Default: 1.92 */
  canopyBaseY?: number;
  /** Vertical rise of the canopy cone/dome from rim to apex. Default: 0.48 */
  canopyHeight?: number;
  /** Outer radius of the canopy in XZ. Default: 1.35 */
  canopyRadius?: number;
  /** Number of radial canopy ribs & awning segments. Default: 8 */
  ribCount?: number;
  /** Pole cylinder radius. Default: 0.032 */
  poleRadius?: number;
  /** Base stand flange radius at y=0. Default: 0.24 */
  baseStandRadius?: number;
  /** Base stand flange thickness above y=0. Default: 0.05 */
  baseStandHeight?: number;
  /** Bouncy canopy collider restitution. Default: 0.55 */
  restitution?: number;
}

export interface CoaxialUmbrellaRibSpec {
  index: number;
  azimuthRad: number;
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  radius: number;
  length: number;
  rimPoint: Vec3Tuple;
  apexPoint: Vec3Tuple;
  directionAxis: Vec3Tuple;
}

export interface CoaxialUmbrellaSpec {
  symmetryAxis: Vec3Tuple;
  groundContactY: number;
  totalHeight: number;
  baseStand: {
    radius: number;
    height: number;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
    bottomY: number;
  };
  pole: {
    radius: number;
    length: number;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
    bottomY: number;
    topY: number;
  };
  runnerHub: {
    radius: number;
    height: number;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
  };
  canopy: {
    radius: number;
    height: number;
    segments: number;
    baseY: number;
    apexY: number;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
  };
  ribs: CoaxialUmbrellaRibSpec[];
  stretchers: CoaxialUmbrellaRibSpec[];
  finial: {
    radius: number;
    height: number;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
  };
  trampolineCollider: {
    center: Vec3Tuple;
    radius: number;
    height: number;
    restitution: number;
    friction: number;
  };
}

/**
 * Builds a 100% coaxial cafe/vendor umbrella around the vertical `+Y` axis `(x=0, z=0)`
 * with exact `y = 0` base stand contact.
 */
export function buildCoaxialUmbrellaSpec(
  opts: UmbrellaBuilderOptions = {},
): CoaxialUmbrellaSpec {
  const canopyBaseY = opts.canopyBaseY ?? 1.92;
  const canopyHeight = opts.canopyHeight ?? 0.48;
  const canopyRadius = opts.canopyRadius ?? 1.35;
  const ribCount = Math.max(4, Math.round(opts.ribCount ?? 8));
  const poleRadius = opts.poleRadius ?? 0.032;
  const baseStandRadius = opts.baseStandRadius ?? 0.24;
  const baseStandHeight = opts.baseStandHeight ?? 0.05;
  const restitution = opts.restitution ?? 0.55;

  const canopyApexY = canopyBaseY + canopyHeight;
  const finialHeight = 0.09;
  const finialRadius = poleRadius * 1.35;
  const totalHeight = canopyApexY + finialHeight;

  const runnerHubY = canopyBaseY - 0.22;
  const runnerHubHeight = 0.08;
  const runnerHubRadius = poleRadius * 1.85;

  const ribApexY = canopyApexY - 0.015;
  const ribRise = ribApexY - canopyBaseY;
  const ribLength = Math.hypot(canopyRadius, ribRise);
  const ribTiltRad = Math.atan2(canopyRadius, ribRise);
  const ribRadius = 0.012;

  const ribs: CoaxialUmbrellaRibSpec[] = [];
  const stretchers: CoaxialUmbrellaRibSpec[] = [];

  for (let i = 0; i < ribCount; i++) {
    const azimuthRad = (i / ribCount) * Math.PI * 2;
    const cosA = Math.cos(azimuthRad);
    const sinA = Math.sin(azimuthRad);

    const rimPoint: Vec3Tuple = [
      cosA * canopyRadius,
      canopyBaseY,
      -sinA * canopyRadius,
    ];
    const apexPoint: Vec3Tuple = [0, ribApexY, 0];
    const midPoint: Vec3Tuple = [
      (rimPoint[0] + apexPoint[0]) * 0.5,
      (rimPoint[1] + apexPoint[1]) * 0.5,
      (rimPoint[2] + apexPoint[2]) * 0.5,
    ];

    const rotation: Vec3Tuple = [0, azimuthRad, ribTiltRad];
    const directionAxis = applyEulerXYZToVector([0, 1, 0], rotation);

    ribs.push({
      index: i,
      azimuthRad,
      position: midPoint,
      rotation,
      radius: ribRadius,
      length: ribLength,
      rimPoint,
      apexPoint,
      directionAxis,
    });

    const attachT = 0.55;
    const attachR = canopyRadius * attachT;
    const attachY = ribApexY - ribRise * attachT;
    const hubPoint: Vec3Tuple = [0, runnerHubY, 0];
    const ribAttachPoint: Vec3Tuple = [cosA * attachR, attachY, -sinA * attachR];
    const sRise = attachY - runnerHubY;
    const sLen = Math.hypot(attachR, sRise);
    const sTilt = -Math.atan2(attachR, sRise);
    const sRot: Vec3Tuple = [0, azimuthRad, sTilt];
    stretchers.push({
      index: i,
      azimuthRad,
      position: [
        (hubPoint[0] + ribAttachPoint[0]) * 0.5,
        (hubPoint[1] + ribAttachPoint[1]) * 0.5,
        (hubPoint[2] + ribAttachPoint[2]) * 0.5,
      ],
      rotation: sRot,
      radius: ribRadius * 0.85,
      length: sLen,
      rimPoint: ribAttachPoint,
      apexPoint: hubPoint,
      directionAxis: applyEulerXYZToVector([0, 1, 0], sRot),
    });
  }

  return {
    symmetryAxis: [0, 1, 0],
    groundContactY: 0,
    totalHeight,
    baseStand: {
      radius: baseStandRadius,
      height: baseStandHeight,
      position: [0, baseStandHeight * 0.5, 0],
      rotation: [0, 0, 0],
      bottomY: 0,
    },
    pole: {
      radius: poleRadius,
      length: canopyApexY,
      position: [0, canopyApexY * 0.5, 0],
      rotation: [0, 0, 0],
      bottomY: 0,
      topY: canopyApexY,
    },
    runnerHub: {
      radius: runnerHubRadius,
      height: runnerHubHeight,
      position: [0, runnerHubY, 0],
      rotation: [0, 0, 0],
    },
    canopy: {
      radius: canopyRadius,
      height: canopyHeight,
      segments: ribCount,
      baseY: canopyBaseY,
      apexY: canopyApexY,
      position: [0, canopyBaseY + canopyHeight * 0.5, 0],
      rotation: [0, 0, 0],
    },
    ribs,
    stretchers,
    finial: {
      radius: finialRadius,
      height: finialHeight,
      position: [0, canopyApexY + finialHeight * 0.5, 0],
      rotation: [0, 0, 0],
    },
    trampolineCollider: {
      center: [0, canopyBaseY + canopyHeight * 0.45, 0],
      radius: canopyRadius * 1.02,
      height: canopyHeight * 0.92,
      restitution,
      friction: 0.25,
    },
  };
}

/**
 * Computes exact unit surface normal for a striped awning pitched downward by `pitchDeg` (default `28°`)
 * toward local `+Z` Forward, rotated around `+Y` by `rotationY` radians.
 * - Local normal: `[0, cos(pitch), sin(pitch)]`
 * - World normal: `[sin(rotationY)*sin(pitch), cos(pitch), cos(rotationY)*sin(pitch)]`
 */
export function computePitchedAwningNormal(
  pitchDeg = 28,
  rotationY = 0,
): {
  pitchRad: number;
  localNormal: Vec3Tuple;
  worldNormal: Vec3Tuple;
} {
  const pitchRad = degToRad(pitchDeg);
  const localNormal: Vec3Tuple = [0, Math.cos(pitchRad), Math.sin(pitchRad)];
  const worldNormal = normalizeVec3(
    applyEulerXYZToVector(localNormal, [0, rotationY, 0]),
  );
  return { pitchRad, localNormal, worldNormal };
}

/**
 * Computes exact 3D cushioned inelastic reflection velocity off a pitched canvas awning:
 * `v_out = v_in - (1 + restitution) * (v_in . n) * n`.
 */
export function computeAwningBounceVelocity(
  incomingVelocity: Vec3Tuple,
  worldNormal: Vec3Tuple,
  restitution = 0.28,
): Vec3Tuple {
  const n = normalizeVec3(worldNormal);
  const vn = dotVec3(incomingVelocity, n);
  if (vn >= 0) {
    return [...incomingVelocity] as Vec3Tuple;
  }
  const impulse = -(1 + Math.max(0, Math.min(1, restitution))) * vn;
  return [
    incomingVelocity[0] + impulse * n[0],
    incomingVelocity[1] + impulse * n[1],
    incomingVelocity[2] + impulse * n[2],
  ];
}

export interface PitchedAwningBuilderOptions {
  /** Total awning width along local X. Default: 2.10 */
  width?: number;
  /** Sloped canvas depth along pitched roof plane. Default: 1.65 */
  slopedDepth?: number;
  /** Center height of the pitched awning above local y = 0. Default: 2.15 */
  centerY?: number;
  /** Downward pitch angle toward local +Z Forward in degrees. Default: 28 */
  pitchDeg?: number;
  /** Number of alternating red/white (or color/cream) canvas stripes. Default: 7 */
  stripeCount?: number;
  /** Support pole ground/counter mount Y (0 when floor-mounted). Default: 0 */
  mountBottomY?: number;
  /** Cushioned canvas restitution. Default: 0.28 */
  restitution?: number;
  /** World Y-axis rotation in radians for pre-computing worldNormal. Default: 0 */
  rotationY?: number;
}

export interface CoaxialPitchedAwningSpec {
  width: number;
  slopedDepth: number;
  pitchDeg: number;
  pitchRad: number;
  restitution: number;
  localNormal: Vec3Tuple;
  worldNormal: Vec3Tuple;
  canvasRotation: Vec3Tuple;
  center: Vec3Tuple;
  stripePanels: Array<{
    index: number;
    isAlternateStripe: boolean;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
    size: Vec3Tuple;
  }>;
  frontValance: {
    position: Vec3Tuple;
    rotation: Vec3Tuple;
    size: Vec3Tuple;
  };
  supportPosts: Array<{
    side: 'left' | 'right';
    position: Vec3Tuple;
    radius: number;
    height: number;
    bottomY: number;
  }>;
  collider: {
    localCenter: Vec3Tuple;
    localRotation: Vec3Tuple;
    halfExtents: Vec3Tuple;
    restitution: number;
  };
}

/**
 * Builds a complete coplanar/coaxial striped canvas awning (such as the 28-degree Hotdog Vendor Cart awning
 * or Venice shopfront awnings) with exact surface normal, alternating stripe panels, front valance, and support posts.
 */
export function buildPitchedAwningSpec(
  opts: PitchedAwningBuilderOptions = {},
): CoaxialPitchedAwningSpec {
  const width = opts.width ?? 2.1;
  const slopedDepth = opts.slopedDepth ?? 1.65;
  const centerY = opts.centerY ?? 2.15;
  const pitchDeg = opts.pitchDeg ?? 28;
  const stripeCount = Math.max(3, Math.round(opts.stripeCount ?? 7));
  const mountBottomY = opts.mountBottomY ?? 0;
  const restitution = opts.restitution ?? 0.28;
  const rotationY = opts.rotationY ?? 0;

  const { pitchRad, localNormal, worldNormal } = computePitchedAwningNormal(
    pitchDeg,
    rotationY,
  );
  // Rx(+pitchRad) tilts a horizontal XZ slab (+Y normal [0, 1, 0]) forward so its normal becomes [0, cos(p), sin(p)]!
  // Let's verify: applyEulerXYZToVector([0, 1, 0], [pitchRad, 0, 0]):
  // y3 = cos(pitchRad), z3 = sin(pitchRad)! Exact match!
  const canvasRotation: Vec3Tuple = [pitchRad, 0, 0];
  const canvasThickness = 0.045;
  const stripeWidth = width / stripeCount;

  const stripePanels = Array.from({ length: stripeCount }, (_, idx) => {
    const xOffset = -width * 0.5 + stripeWidth * (idx + 0.5);
    return {
      index: idx,
      isAlternateStripe: idx % 2 === 1,
      position: [xOffset, centerY, 0] as Vec3Tuple,
      rotation: [...canvasRotation] as Vec3Tuple,
      size: [stripeWidth + 0.004, canvasThickness, slopedDepth] as Vec3Tuple,
    };
  });

  const frontEdgeZ = (slopedDepth * 0.5) * Math.cos(pitchRad);
  const frontEdgeY = centerY - (slopedDepth * 0.5) * Math.sin(pitchRad);
  const valanceHeight = 0.14;

  const postX = width * 0.5 - 0.12;
  const postTopY = centerY;
  const postHeight = Math.max(0.2, postTopY - mountBottomY);

  return {
    width,
    slopedDepth,
    pitchDeg,
    pitchRad,
    restitution,
    localNormal,
    worldNormal,
    canvasRotation,
    center: [0, centerY, 0],
    stripePanels,
    frontValance: {
      position: [0, frontEdgeY - valanceHeight * 0.45, frontEdgeZ],
      rotation: [0, 0, 0],
      size: [width, valanceHeight, 0.035],
    },
    supportPosts: [
      {
        side: 'left',
        position: [-postX, mountBottomY + postHeight * 0.5, 0],
        radius: 0.026,
        height: postHeight,
        bottomY: mountBottomY,
      },
      {
        side: 'right',
        position: [postX, mountBottomY + postHeight * 0.5, 0],
        radius: 0.026,
        height: postHeight,
        bottomY: mountBottomY,
      },
    ],
    collider: {
      localCenter: [0, centerY, 0],
      localRotation: [...canvasRotation] as Vec3Tuple,
      halfExtents: [width * 0.5, 0.05, slopedDepth * 0.5],
      restitution,
    },
  };
}

// ============================================================================
// 3. COAXIAL FIRE HYDRANT BUILDER
// ============================================================================

export interface HydrantBuilderOptions {
  flangeRadius?: number;
  flangeHeight?: number;
  barrelRadius?: number;
  barrelHeight?: number;
  jetPitchDeg?: number;
  jetRangeMeters?: number;
  jetSpeed?: number;
}

export interface CoaxialHydrantNozzleSpec {
  side: 'left' | 'right' | 'front_pumper';
  radius: number;
  length: number;
  capRadius: number;
  capThickness: number;
  position: Vec3Tuple;
  capPosition: Vec3Tuple;
  rotation: Vec3Tuple;
  outwardAxis: Vec3Tuple;
}

export interface CoaxialHydrantSpec {
  symmetryAxis: Vec3Tuple;
  groundContactY: number;
  totalHeight: number;
  baseFlange: {
    radius: number;
    height: number;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
    bottomY: number;
  };
  barrel: {
    radius: number;
    height: number;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
    bottomY: number;
    topY: number;
  };
  collarRing: {
    radius: number;
    height: number;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
  };
  bonnet: {
    radius: number;
    height: number;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
  };
  pentagonNut: {
    radius: number;
    height: number;
    sides: 5;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
  };
  sideHoseCaps: CoaxialHydrantNozzleSpec[];
  waterJet: {
    emitterOrigin: Vec3Tuple;
    emitterDirection: Vec3Tuple;
    boostVelocityLocal: Vec3Tuple;
    rangeMeters: number;
    arcPoints: Vec3Tuple[];
  };
}

/**
 * Builds a coaxial cast-iron city fire hydrant around `+Y` with exact `y = 0` base flange,
 * barrel, collar ring, domed bonnet, 5-sided operating nut, orthogonal nozzles, and `+Z` water-jet arc.
 */
export function buildCoaxialHydrantSpec(
  opts: HydrantBuilderOptions = {},
): CoaxialHydrantSpec {
  const flangeRadius = opts.flangeRadius ?? 0.22;
  const flangeHeight = opts.flangeHeight ?? 0.07;
  const barrelRadius = opts.barrelRadius ?? 0.155;
  const barrelHeight = opts.barrelHeight ?? 0.48;
  const jetPitchDeg = opts.jetPitchDeg ?? 14;
  const jetRangeMeters = opts.jetRangeMeters ?? 1.8;
  const jetSpeed = opts.jetSpeed ?? 12.5;

  const barrelBottomY = flangeHeight;
  const barrelTopY = barrelBottomY + barrelHeight;

  const collarHeight = 0.05;
  const collarRadius = barrelRadius * 1.2;
  const collarTopY = barrelTopY + collarHeight;

  const bonnetHeight = 0.14;
  const bonnetRadius = barrelRadius * 0.96;
  const bonnetTopY = collarTopY + bonnetHeight;

  const nutHeight = 0.065;
  const nutRadius = 0.045;
  const totalHeight = bonnetTopY + nutHeight;

  const sideY = barrelBottomY + barrelHeight * 0.64;
  const sideLen = 0.085;
  const sideRadius = 0.052;
  const sideCapThick = 0.028;

  const pumperY = barrelBottomY + barrelHeight * 0.54;
  const pumperLen = 0.1;
  const pumperRadius = 0.072;
  const pumperCapThick = 0.032;

  const leftRot: Vec3Tuple = [0, 0, Math.PI * 0.5];
  const rightRot: Vec3Tuple = [0, 0, -Math.PI * 0.5];
  const frontRot: Vec3Tuple = [Math.PI * 0.5, 0, 0];

  const sideHoseCaps: CoaxialHydrantNozzleSpec[] = [
    {
      side: 'left',
      radius: sideRadius,
      length: sideLen,
      capRadius: sideRadius * 1.18,
      capThickness: sideCapThick,
      position: [-(barrelRadius + sideLen * 0.5 - 0.01), sideY, 0],
      capPosition: [
        -(barrelRadius + sideLen + sideCapThick * 0.5 - 0.01),
        sideY,
        0,
      ],
      rotation: leftRot,
      outwardAxis: applyEulerXYZToVector([0, 1, 0], leftRot),
    },
    {
      side: 'right',
      radius: sideRadius,
      length: sideLen,
      capRadius: sideRadius * 1.18,
      capThickness: sideCapThick,
      position: [barrelRadius + sideLen * 0.5 - 0.01, sideY, 0],
      capPosition: [
        barrelRadius + sideLen + sideCapThick * 0.5 - 0.01,
        sideY,
        0,
      ],
      rotation: rightRot,
      outwardAxis: applyEulerXYZToVector([0, 1, 0], rightRot),
    },
    {
      side: 'front_pumper',
      radius: pumperRadius,
      length: pumperLen,
      capRadius: pumperRadius * 1.16,
      capThickness: pumperCapThick,
      position: [0, pumperY, barrelRadius + pumperLen * 0.5 - 0.01],
      capPosition: [
        0,
        pumperY,
        barrelRadius + pumperLen + pumperCapThick * 0.5 - 0.01,
      ],
      rotation: frontRot,
      outwardAxis: applyEulerXYZToVector([0, 1, 0], frontRot),
    },
  ];

  const pitchRad = degToRad(jetPitchDeg);
  const emitterDirection: Vec3Tuple = [
    0,
    Math.sin(pitchRad),
    Math.cos(pitchRad),
  ];
  const emitterOrigin: Vec3Tuple = [
    0,
    pumperY,
    barrelRadius + pumperLen + pumperCapThick,
  ];
  const boostVelocityLocal: Vec3Tuple = [
    0,
    Math.max(2.0, jetSpeed * emitterDirection[1]),
    jetSpeed * emitterDirection[2],
  ];

  const sampleCount = 16;
  const arcPoints: Vec3Tuple[] = [];
  const startZ = emitterOrigin[2];
  const peakRise = Math.tan(pitchRad) * (jetRangeMeters * 0.35);
  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount;
    const z = startZ + t * jetRangeMeters;
    const y = emitterOrigin[1] * (1 - t) + 4 * peakRise * t * (1 - t);
    arcPoints.push([0, Math.max(0, y), z]);
  }

  return {
    symmetryAxis: [0, 1, 0],
    groundContactY: 0,
    totalHeight,
    baseFlange: {
      radius: flangeRadius,
      height: flangeHeight,
      position: [0, flangeHeight * 0.5, 0],
      rotation: [0, 0, 0],
      bottomY: 0,
    },
    barrel: {
      radius: barrelRadius,
      height: barrelHeight,
      position: [0, barrelBottomY + barrelHeight * 0.5, 0],
      rotation: [0, 0, 0],
      bottomY: barrelBottomY,
      topY: barrelTopY,
    },
    collarRing: {
      radius: collarRadius,
      height: collarHeight,
      position: [0, barrelTopY + collarHeight * 0.5, 0],
      rotation: [0, 0, 0],
    },
    bonnet: {
      radius: bonnetRadius,
      height: bonnetHeight,
      position: [0, collarTopY + bonnetHeight * 0.5, 0],
      rotation: [0, 0, 0],
    },
    pentagonNut: {
      radius: nutRadius,
      height: nutHeight,
      sides: 5,
      position: [0, bonnetTopY + nutHeight * 0.5, 0],
      rotation: [0, 0, 0],
    },
    sideHoseCaps,
    waterJet: {
      emitterOrigin,
      emitterDirection,
      boostVelocityLocal,
      rangeMeters: jetRangeMeters,
      arcPoints,
    },
  };
}

// ============================================================================
// 4. COAXIAL VINTAGE STREETLAMP BUILDER
// ============================================================================

export interface StreetlampBuilderOptions {
  /** Total post height up to bracket arm. Default: 3.15 */
  postHeight?: number;
  /** Fluted cast-iron base plinth height at y = 0. Default: 0.42 */
  basePlinthHeight?: number;
  /** Base plinth bottom radius at y = 0. Default: 0.21 */
  basePlinthRadius?: number;
  /** Cantilever lantern arm reach along local +Z Forward. Default: 0.62 */
  armReachZ?: number;
  /** Warm lantern globe radius. Default: 0.17 */
  globeRadius?: number;
}

export interface CoaxialStreetlampSpec {
  symmetryAxis: Vec3Tuple;
  groundContactY: number;
  totalHeight: number;
  basePlinth: {
    topRadius: number;
    bottomRadius: number;
    height: number;
    position: Vec3Tuple;
    bottomY: number;
  };
  collarRings: Array<{
    radius: number;
    height: number;
    position: Vec3Tuple;
  }>;
  post: {
    topRadius: number;
    bottomRadius: number;
    height: number;
    position: Vec3Tuple;
  };
  bracketArm: {
    radius: number;
    length: number;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
    axisDirection: Vec3Tuple;
  };
  lanternAssembly: {
    axisXZ: Vec2Tuple;
    collarPosition: Vec3Tuple;
    globePosition: Vec3Tuple;
    globeRadius: number;
    capPosition: Vec3Tuple;
    capRadius: number;
    capHeight: number;
    finialPosition: Vec3Tuple;
  };
}

/**
 * Builds a coaxial cast-iron Venice/brownstone vintage streetlamp seated flush at `y = 0`,
 * with coaxial base plinth, post, decorative collar rings, `+Z` forward bracket arm, and coaxial lantern head.
 */
export function buildCoaxialStreetlampSpec(
  opts: StreetlampBuilderOptions = {},
): CoaxialStreetlampSpec {
  const postHeight = opts.postHeight ?? 3.15;
  const basePlinthHeight = opts.basePlinthHeight ?? 0.42;
  const basePlinthRadius = opts.basePlinthRadius ?? 0.21;
  const armReachZ = opts.armReachZ ?? 0.62;
  const globeRadius = opts.globeRadius ?? 0.17;

  const shaftHeight = Math.max(1.2, postHeight - basePlinthHeight);
  const armY = postHeight - 0.08;
  const armRotation: Vec3Tuple = [Math.PI * 0.5, 0, 0]; // aligns +Y cylinder along +Z Forward
  const lanternZ = armReachZ;
  const collarY = armY - 0.06;
  const globeY = collarY - globeRadius * 0.92;
  const capY = armY + 0.05;
  const capHeight = 0.1;

  return {
    symmetryAxis: [0, 1, 0],
    groundContactY: 0,
    totalHeight: postHeight + 0.16,
    basePlinth: {
      topRadius: basePlinthRadius * 0.62,
      bottomRadius: basePlinthRadius,
      height: basePlinthHeight,
      position: [0, basePlinthHeight * 0.5, 0],
      bottomY: 0,
    },
    collarRings: [
      {
        radius: basePlinthRadius * 0.72,
        height: 0.055,
        position: [0, basePlinthHeight + 0.025, 0],
      },
      {
        radius: 0.095,
        height: 0.05,
        position: [0, postHeight * 0.58, 0],
      },
      {
        radius: 0.088,
        height: 0.06,
        position: [0, postHeight, 0],
      },
    ],
    post: {
      topRadius: 0.052,
      bottomRadius: 0.088,
      height: shaftHeight,
      position: [0, basePlinthHeight + shaftHeight * 0.5, 0],
    },
    bracketArm: {
      radius: 0.034,
      length: armReachZ,
      position: [0, armY, armReachZ * 0.5],
      rotation: armRotation,
      axisDirection: applyEulerXYZToVector([0, 1, 0], armRotation),
    },
    lanternAssembly: {
      axisXZ: [0, lanternZ],
      collarPosition: [0, collarY, lanternZ],
      globePosition: [0, globeY, lanternZ],
      globeRadius,
      capPosition: [0, capY, lanternZ],
      capRadius: globeRadius * 1.18,
      capHeight,
      finialPosition: [0, capY + capHeight * 0.75, lanternZ],
    },
  };
}

// ============================================================================
// 5. COAXIAL ARCHED WINDOW & SHOPFRONT DOOR FRAME BUILDER
// ============================================================================

export interface ArchedFrameBuilderOptions {
  /** Clear opening width along local X. Default: 1.30 */
  openingWidth?: number;
  /** Vertical jamb height before semicircular arch springline. Default: 1.55 */
  jambHeight?: number;
  /** Stone/trim molding thickness in facade plane. Default: 0.14 */
  frameWidth?: number;
  /** Relief depth projecting along local +Z from facade plane. Default: 0.12 */
  frameDepth?: number;
  /** Sill thickness seated flush at local y = 0. Default: 0.10 */
  sillHeight?: number;
  /** Number of coaxial voussoir segments forming the semicircular arch. Default: 9 */
  archSegments?: number;
  /** Include hinged side shutters (for Venice upper-story windows). Default: true */
  includeShutters?: boolean;
}

export interface ArchedFrameSegmentSpec {
  index: number;
  angleRad: number;
  isKeystone: boolean;
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  size: Vec3Tuple;
  /** Radial outward vector in XY plane from archCenter */
  radialDirection: Vec3Tuple;
}

export interface CoaxialArchedFrameSpec {
  groundContactY: number;
  totalWidth: number;
  totalHeight: number;
  archCenter: Vec3Tuple;
  archInnerRadius: number;
  archOuterRadius: number;
  sill: {
    position: Vec3Tuple;
    size: Vec3Tuple;
    bottomY: number;
  };
  leftJamb: {
    position: Vec3Tuple;
    size: Vec3Tuple;
  };
  rightJamb: {
    position: Vec3Tuple;
    size: Vec3Tuple;
  };
  archRingSegments: CoaxialArchList;
  recessedGlass: {
    position: Vec3Tuple;
    size: Vec3Tuple;
  };
  shutters: Array<{
    side: 'left' | 'right';
    position: Vec3Tuple;
    rotation: Vec3Tuple;
    size: Vec3Tuple;
  }>;
}

type CoaxialArchList = ArchedFrameSegmentSpec[];

/**
 * Builds a coaxial Venetian / brownstone arched window or shopfront door frame in the local XY plane
 * (`+Z` outward relief, `y = 0` flush sill bottom). Every arch voussoir segment lies strictly coaxial around `archCenter`.
 */
export function buildArchedFrameSpec(
  opts: ArchedFrameBuilderOptions = {},
): CoaxialArchedFrameSpec {
  const openingWidth = opts.openingWidth ?? 1.3;
  const jambHeight = opts.jambHeight ?? 1.55;
  const frameWidth = opts.frameWidth ?? 0.14;
  const frameDepth = opts.frameDepth ?? 0.12;
  const sillHeight = opts.sillHeight ?? 0.1;
  const segCount = Math.max(5, Math.round(opts.archSegments ?? 9));
  const includeShutters = opts.includeShutters ?? true;

  const archInnerRadius = openingWidth * 0.5;
  const archOuterRadius = archInnerRadius + frameWidth;
  const archMidRadius = (archInnerRadius + archOuterRadius) * 0.5;
  const springlineY = sillHeight + jambHeight;
  const archCenter: Vec3Tuple = [0, springlineY, frameDepth * 0.5];

  const jambCenterX = archInnerRadius + frameWidth * 0.5;
  const jambPosY = sillHeight + jambHeight * 0.5;

  const archRingSegments: ArchedFrameSegmentSpec[] = [];
  const dTheta = Math.PI / segCount;
  const chordLen = 2 * archMidRadius * Math.sin(dTheta * 0.5) + 0.015;
  const midIdx = Math.floor(segCount * 0.5);

  for (let i = 0; i < segCount; i++) {
    // Angle from 0 (+X right springline) through PI/2 (+Y crown keystone) to PI (-X left springline)
    const theta = (i + 0.5) * dTheta;
    const isKeystone = i === midIdx;
    const rScale = isKeystone ? 1.18 : 1.0;
    const depthScale = isKeystone ? 1.16 : i % 2 === 0 ? 1.0 : 1.06;
    const cx = Math.cos(theta) * archMidRadius;
    const cy = springlineY + Math.sin(theta) * archMidRadius;
    // Rotate box around +Z so its local +Y points radially outward at angle (theta - PI/2)
    const rotZ = theta - Math.PI * 0.5;
    const rotation: Vec3Tuple = [0, 0, rotZ];
    const radialDirection = applyEulerXYZToVector([0, 1, 0], rotation);

    archRingSegments.push({
      index: i,
      angleRad: theta,
      isKeystone,
      position: [cx, cy, frameDepth * depthScale * 0.5],
      rotation,
      size: [chordLen, frameWidth * rScale, frameDepth * depthScale],
      radialDirection,
    });
  }

  const shutterW = openingWidth * 0.44;
  const shutterH = jambHeight * 0.96;
  const shutters = includeShutters
    ? ([
        {
          side: 'left' as const,
          position: [
            -(archOuterRadius + shutterW * 0.48),
            jambPosY,
            frameDepth * 0.65,
          ] as Vec3Tuple,
          rotation: [0, 0.16, 0] as Vec3Tuple,
          size: [shutterW, shutterH, 0.04] as Vec3Tuple,
        },
        {
          side: 'right' as const,
          position: [
            archOuterRadius + shutterW * 0.48,
            jambPosY,
            frameDepth * 0.65,
          ] as Vec3Tuple,
          rotation: [0, -0.16, 0] as Vec3Tuple,
          size: [shutterW, shutterH, 0.04] as Vec3Tuple,
        },
      ])
    : [];

  return {
    groundContactY: 0,
    totalWidth: archOuterRadius * 2 + (includeShutters ? shutterW * 2 : 0.16),
    totalHeight: springlineY + archOuterRadius * 1.08,
    archCenter,
    archInnerRadius,
    archOuterRadius,
    sill: {
      position: [0, sillHeight * 0.5, frameDepth * 0.6],
      size: [archOuterRadius * 2 + 0.18, sillHeight, frameDepth * 1.35],
      bottomY: 0,
    },
    leftJamb: {
      position: [-jambCenterX, jambPosY, frameDepth * 0.47],
      size: [frameWidth, jambHeight, frameDepth * 0.94],
    },
    rightJamb: {
      position: [jambCenterX, jambPosY, frameDepth * 0.47],
      size: [frameWidth, jambHeight, frameDepth * 0.94],
    },
    archRingSegments,
    recessedGlass: {
      position: [0, sillHeight + (jambHeight + archInnerRadius) * 0.5, -0.02],
      size: [openingWidth, jambHeight + archInnerRadius, 0.04],
    },
    shutters,
  };
}
