import {
  GRID_COLS,
  GRID_ROWS,
  ISLAND_HALF_SIZE,
  TILE_SIZE,
  type AABB3D,
  type CardinalSockets,
  type TileRotationSteps,
  type Vec3Tuple,
} from '../types/course';

export {
  createRandomSeed,
  createSeededRng,
  getTodayDailySeedUTC,
  hashSeedString,
  mulberry32,
  type SeededRng,
} from './seed';

export interface WorldGridPoint {
  x: number;
  y: number;
  z: number;
  tuple: Vec3Tuple;
}

export interface GridCellLookup {
  col: number;
  row: number;
  rawCol: number;
  rawRow: number;
  inBounds: boolean;
}

/**
 * Converts grid cell (col in 0..5 West->East, row in 0..5 North->South)
 * into world-space tile center coordinates on the 48m x 48m island centered at (0, 0, 0).
 */
export function gridToWorld(col: number, row: number, y = 0): WorldGridPoint {
  const x = (col - (GRID_COLS - 1) * 0.5) * TILE_SIZE;
  const z = (row - (GRID_ROWS - 1) * 0.5) * TILE_SIZE;
  return { x, y, z, tuple: [x, y, z] };
}

/**
 * Converts world-space (x, z) into 6x6 tile grid indices.
 */
export function worldToGrid(x: number, z: number): GridCellLookup {
  const inBounds =
    x >= -ISLAND_HALF_SIZE &&
    x <= ISLAND_HALF_SIZE &&
    z >= -ISLAND_HALF_SIZE &&
    z <= ISLAND_HALF_SIZE;
  const rawCol =
    x === ISLAND_HALF_SIZE
      ? GRID_COLS - 1
      : Math.floor((x + ISLAND_HALF_SIZE) / TILE_SIZE);
  const rawRow =
    z === ISLAND_HALF_SIZE
      ? GRID_ROWS - 1
      : Math.floor((z + ISLAND_HALF_SIZE) / TILE_SIZE);
  const col = Math.max(0, Math.min(GRID_COLS - 1, rawCol));
  const row = Math.max(0, Math.min(GRID_ROWS - 1, rawRow));
  return { col, row, rawCol, rawRow, inBounds };
}

/**
 * Converts clockwise quarter-turn steps (viewed from +Y looking down) into
 * Three.js Y-axis Euler rotation in radians: `rotationY = -steps * (PI / 2)`.
 */
export function tileStepsToRotationY(steps: TileRotationSteps): number {
  if (steps === 0) return 0;
  return -steps * (Math.PI * 0.5);
}

/**
 * Rotates `[north, east, south, west]` sockets clockwise by `steps` quarter-turns.
 * Guaranteed consistent with Three.js `<group rotation={[0, tileStepsToRotationY(steps), 0]}>`.
 */
export function rotateSocketsCW(
  baseSockets: CardinalSockets,
  steps: TileRotationSteps,
): CardinalSockets {
  const s = ((steps % 4) + 4) % 4;
  if (s === 0) return [...baseSockets] as CardinalSockets;
  if (s === 1) {
    return [baseSockets[3], baseSockets[0], baseSockets[1], baseSockets[2]];
  }
  if (s === 2) {
    return [baseSockets[2], baseSockets[3], baseSockets[0], baseSockets[1]];
  }
  return [baseSockets[1], baseSockets[2], baseSockets[3], baseSockets[0]];
}

/**
 * Transforms a tile-local point `[lx, ly, lz]` into world space for a tile centered at `(tileWorldX, 0, tileWorldZ)`
 * rotated around +Y by `rotationY` radians.
 */
export function localToWorldPoint(
  tileWorldX: number,
  tileWorldZ: number,
  rotationY: number,
  localPoint: Vec3Tuple,
): Vec3Tuple {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const wx = tileWorldX + localPoint[0] * c + localPoint[2] * s;
  const wz = tileWorldZ - localPoint[0] * s + localPoint[2] * c;
  return [wx, localPoint[1], wz];
}

/**
 * Transforms a world-space point `(wx, wy, wz)` into tile-local coordinates.
 */
export function worldToLocalPoint(
  tileWorldX: number,
  tileWorldZ: number,
  rotationY: number,
  wx: number,
  wy: number,
  wz: number,
): Vec3Tuple {
  const dx = wx - tileWorldX;
  const dz = wz - tileWorldZ;
  const c = Math.cos(-rotationY);
  const s = Math.sin(-rotationY);
  return [dx * c + dz * s, wy, -dx * s + dz * c];
}

/**
 * Computes exact world-space AABB for an entity whose local bounding volume has
 * horizontal size `[widthX, heightY, depthZ]` and sits with local `y in [0, heightY]`
 * at `position = [wx, groundY, wz]` rotated by `rotationY`.
 */
export function computeRotatedAABB(
  position: Vec3Tuple,
  localSize: Vec3Tuple,
  rotationY: number,
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

export function dotVec3(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// ============================================================================
// 1. COAXIAL WHEEL BUILDER
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
  /** Transformed unit direction of the spoke in wheel frame (always orthogonal to axleDirection) */
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
    /** For THREE.TorusGeometry(majorRadius, tubeRadius, radialSegments, tubularSegments) */
    majorRadius: number;
    tubeRadius: number;
    radialSegments: number;
    tubularSegments: number;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
    /** Transformed torus normal axis (matches axleDirection) */
    normalAxis: Vec3Tuple;
  };
  rim: {
    /** For THREE.CylinderGeometry(outerRadius, outerRadius, width, radialSegments) */
    outerRadius: number;
    innerRadius: number;
    width: number;
    radialSegments: number;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
    /** Transformed cylinder symmetry axis (matches axleDirection) */
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
 * Builds exact coaxial transforms for a multi-part spoked wheel:
 * - Tire (`THREE.TorusGeometry`, native axis `+Z`)
 * - Rim, Hub, Axle (`THREE.CylinderGeometry`, native axis `+Y`)
 * - Radial Spokes (`THREE.CylinderGeometry`, native axis `+Y`, rotated strictly inside the wheel plane)
 * Guarantees ALL parts share the exact same center `[0, outerRadius, 0]`, rotation plane, and `y = 0` ground contact.
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

  // Radial spokes span from inside hub to inside rim strictly within the wheel plane
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
      // Wheel in YZ plane: Rx(angleRad) maps native +Y [0, 1, 0] -> [0, cos(angleRad), sin(angleRad)]
      spokeRotation = [angleRad, 0, 0];
      spokePosition = [
        0,
        outerRadius + spokeMidR * Math.cos(angleRad),
        spokeMidR * Math.sin(angleRad),
      ];
    } else {
      // Wheel in XY plane: Rz(angleRad) maps native +Y [0, 1, 0] -> [-sin(angleRad), cos(angleRad), 0]
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
// 2. COAXIAL UMBRELLA BUILDER
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
  /** Rib cylinder midpoint in local frame */
  position: Vec3Tuple;
  /** Exact Three.js XYZ Euler rotation aligning native +Y cylinder from rim to coaxial apex */
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
    /** For THREE.ConeGeometry(radius, height, segments, 1, openEnded) */
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
 * Builds a 100% coaxial cafe/hotdog umbrella around the vertical `+Y` axis `(x=0, z=0)`
 * with exact `y = 0` pole/stand ground contact and `restitution: 0.55` trampoline collider.
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

    // Exact intrinsic XYZ Euler: R = Mx(0) * My(azimuthRad) * Mz(ribTiltRad)
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

    // Stretcher strut from coaxial runner hub [0, runnerHubY, 0] to 55% outward along rib
    const attachT = 0.55;
    const attachR = canopyRadius * attachT;
    const attachY = ribApexY - ribRise * attachT;
    const hubPoint: Vec3Tuple = [0, runnerHubY, 0];
    const ribAttachPoint: Vec3Tuple = [cosA * attachR, attachY, -sinA * attachR];
    const sRise = attachY - runnerHubY;
    const sLen = Math.hypot(attachR, sRise);
    // Vector from ribAttachPoint to hubPoint points inward & down; from hubPoint to ribAttachPoint points outward & up:
    // Use rotation [0, azimuthRad, -atan2(attachR, sRise)] so +Y cylinder points from hubPoint -> ribAttachPoint!
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

// ============================================================================
// 3. COAXIAL FIRE HYDRANT BUILDER
// ============================================================================

export interface HydrantBuilderOptions {
  /** Base flange radius at y = 0. Default: 0.22 */
  flangeRadius?: number;
  /** Base flange height above y = 0. Default: 0.07 */
  flangeHeight?: number;
  /** Main vertical barrel radius. Default: 0.155 */
  barrelRadius?: number;
  /** Main vertical barrel height. Default: 0.48 */
  barrelHeight?: number;
  /** Water-jet launch pitch angle in degrees above +Z forward. Default: 14 */
  jetPitchDeg?: number;
  /** Water-jet stream horizontal reach in meters. Default: 4.8 */
  jetRangeMeters?: number;
  /** Water-jet surf boost speed in m/s. Default: 13.5 */
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
  /** Outward nozzle unit axis (orthogonal to +Y barrel axis) */
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
    /** Exact 5 sides for THREE.CylinderGeometry(r, r, h, 5) */
    sides: 5;
    position: Vec3Tuple;
    rotation: Vec3Tuple;
  };
  sideHoseCaps: CoaxialHydrantNozzleSpec[];
  waterJet: {
    /** Local origin right at the front (+Z) pumper nozzle mouth */
    emitterOrigin: Vec3Tuple;
    /** Normalized launch vector pitching up from +Z forward */
    emitterDirection: Vec3Tuple;
    /** Local surf boost velocity vector [0, vy, vz] */
    boostVelocityLocal: Vec3Tuple;
    rangeMeters: number;
    /** Pre-sampled arcing stream centerline points in local frame (ending at y = 0) */
    arcPoints: Vec3Tuple[];
  };
}

/**
 * Builds a coaxial cast-iron city fire hydrant around `+Y` with exact `y = 0` base flange,
 * barrel, collar, domed bonnet, 5-sided top operating nut, orthogonal side/front hose caps,
 * and arcing `+Z` water-jet emitter specification.
 */
export function buildCoaxialHydrantSpec(
  opts: HydrantBuilderOptions = {},
): CoaxialHydrantSpec {
  const flangeRadius = opts.flangeRadius ?? 0.22;
  const flangeHeight = opts.flangeHeight ?? 0.07;
  const barrelRadius = opts.barrelRadius ?? 0.155;
  const barrelHeight = opts.barrelHeight ?? 0.48;
  const jetPitchDeg = opts.jetPitchDeg ?? 14;
  const jetRangeMeters = opts.jetRangeMeters ?? 4.8;
  const jetSpeed = opts.jetSpeed ?? 13.5;

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

  // Orthogonal side hose nozzles (-X left, +X right) and front pumper nozzle (+Z forward)
  const sideY = barrelBottomY + barrelHeight * 0.64;
  const sideLen = 0.085;
  const sideRadius = 0.052;
  const sideCapThick = 0.028;

  const pumperY = barrelBottomY + barrelHeight * 0.54;
  const pumperLen = 0.1;
  const pumperRadius = 0.072;
  const pumperCapThick = 0.032;

  const leftRot: Vec3Tuple = [0, 0, Math.PI * 0.5]; // maps +Y -> [-1, 0, 0]
  const rightRot: Vec3Tuple = [0, 0, -Math.PI * 0.5]; // maps +Y -> [+1, 0, 0]
  const frontRot: Vec3Tuple = [Math.PI * 0.5, 0, 0]; // maps +Y -> [0, 0, +1]

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

  const pitchRad = (jetPitchDeg * Math.PI) / 180;
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
    Math.max(2.4, jetSpeed * emitterDirection[1]),
    jetSpeed * emitterDirection[2],
  ];

  // Sample clean parabolic water-jet stream from emitterOrigin out to jetRangeMeters landing at y = 0
  const sampleCount = 16;
  const arcPoints: Vec3Tuple[] = [];
  const startZ = emitterOrigin[2];
  const peakRise = Math.tan(pitchRad) * (jetRangeMeters * 0.35);
  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount;
    const z = startZ + t * jetRangeMeters;
    const y =
      emitterOrigin[1] * (1 - t) + 4 * peakRise * t * (1 - t);
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
