import * as THREE from 'three';

/**
 * Extrudes a 2D shape (defined in world XZ coordinates via x = worldX, y = -worldZ)
 * vertically from bottomY to topY in canonical +Y Up space.
 */
export function createHorizontalExtrusion(
  shape: THREE.Shape,
  bottomY: number,
  topY: number,
  curveSegments = 20
): THREE.BufferGeometry {
  const depth = Math.max(0.004, topY - bottomY);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments,
  });
  geo.rotateX(-Math.PI * 0.5);
  geo.translate(0, bottomY, 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Helper to create a rounded rectangle Shape in (x, -z) coordinates centered at (cx, -cz).
 */
export function createRoundedRectShape(
  cx: number,
  cz: number,
  width: number,
  depth: number,
  radius: number
): THREE.Shape {
  const hw = width * 0.5;
  const hd = depth * 0.5;
  const r = Math.min(radius, hw * 0.45, hd * 0.45);
  const sy = -cz;
  const shape = new THREE.Shape();

  if (r <= 0.001) {
    shape.moveTo(cx - hw, sy - hd);
    shape.lineTo(cx + hw, sy - hd);
    shape.lineTo(cx + hw, sy + hd);
    shape.lineTo(cx - hw, sy + hd);
    shape.closePath();
    return shape;
  }

  shape.moveTo(cx - hw + r, sy - hd);
  shape.lineTo(cx + hw - r, sy - hd);
  shape.quadraticCurveTo(cx + hw, sy - hd, cx + hw, sy - hd + r);
  shape.lineTo(cx + hw, sy + hd - r);
  shape.quadraticCurveTo(cx + hw, sy + hd, cx + hw - r, sy + hd);
  shape.lineTo(cx - hw + r, sy + hd);
  shape.quadraticCurveTo(cx - hw, sy + hd, cx - hw, sy + hd - r);
  shape.lineTo(cx - hw, sy - hd + r);
  shape.quadraticCurveTo(cx - hw, sy - hd, cx - hw + r, sy - hd);
  shape.closePath();
  return shape;
}

/**
 * Creates a rounded putting-green slab from bottomY to topY with a true cylindrical
 * cutout at (cupLocalX, cupLocalZ) so the recessed cup sits flush with zero z-fighting.
 */
export function createGreenPadWithCupCutout(opts: {
  width: number;
  depth: number;
  cornerRadius?: number;
  centerX?: number;
  centerZ?: number;
  cupLocalX: number;
  cupLocalZ: number;
  cupRadius: number;
  bottomY: number;
  topY: number;
}): THREE.BufferGeometry {
  const shape = createRoundedRectShape(
    opts.centerX ?? 0,
    opts.centerZ ?? 0,
    opts.width,
    opts.depth,
    opts.cornerRadius ?? 0.45
  );

  // Inner hole in shape space (x = worldX, y = -worldZ), clockwise for Three.js hole
  const hole = new THREE.Path();
  hole.absarc(opts.cupLocalX, -opts.cupLocalZ, opts.cupRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  return createHorizontalExtrusion(shape, opts.bottomY, opts.topY, 20);
}

/**
 * Creates a solid tile slab with a rectangular recessed hole (e.g., for sunken courtyard or water basin)
 * from bottomY to topY in canonical local coordinates.
 */
export function createRectFrameExtrusion(opts: {
  outerW: number;
  outerD: number;
  innerW: number;
  innerD: number;
  innerOffsetX?: number;
  innerOffsetZ?: number;
  innerCornerRadius?: number;
  bottomY: number;
  topY: number;
}): THREE.BufferGeometry {
  const outer = createRoundedRectShape(0, 0, opts.outerW, opts.outerD, 0);
  const ix = opts.innerOffsetX ?? 0;
  const iz = opts.innerOffsetZ ?? 0;
  const hw = opts.innerW * 0.5;
  const hd = opts.innerD * 0.5;
  const r = Math.min(opts.innerCornerRadius ?? 0.25, hw * 0.45, hd * 0.45);
  const sy = -iz;

  const hole = new THREE.Path();
  if (r <= 0.001) {
    hole.moveTo(ix - hw, sy - hd);
    hole.lineTo(ix - hw, sy + hd);
    hole.lineTo(ix + hw, sy + hd);
    hole.lineTo(ix + hw, sy - hd);
    hole.closePath();
  } else {
    // Clockwise path for hole
    hole.moveTo(ix - hw + r, sy - hd);
    hole.quadraticCurveTo(ix - hw, sy - hd, ix - hw, sy - hd + r);
    hole.lineTo(ix - hw, sy + hd - r);
    hole.quadraticCurveTo(ix - hw, sy + hd, ix - hw + r, sy + hd);
    hole.lineTo(ix + hw - r, sy + hd);
    hole.quadraticCurveTo(ix + hw, sy + hd, ix + hw, sy + hd - r);
    hole.lineTo(ix + hw, sy - hd + r);
    hole.quadraticCurveTo(ix + hw, sy - hd, ix + hw - r, sy - hd);
    hole.closePath();
  }
  outer.holes.push(hole);
  return createHorizontalExtrusion(outer, opts.bottomY, opts.topY, 16);
}

/**
 * Creates an annular arc sector centered at (pivotX, pivotZ) in world XZ coordinates.
 * Angles are measured in world XZ where 0 = +X, +PI/2 = +Z (clockwise around +Y? Let's define explicitly:
 * worldX = pivotX + r * cos(theta), worldZ = pivotZ + r * sin(theta)).
 */
export function createArcBandExtrusion(opts: {
  pivotX: number;
  pivotZ: number;
  innerR: number;
  outerR: number;
  startTheta: number;
  endTheta: number;
  bottomY: number;
  topY: number;
  segments?: number;
}): THREE.BufferGeometry {
  const segs = opts.segments ?? 24;
  const shape = new THREE.Shape();

  const toShape = (r: number, theta: number): [number, number] => [
    opts.pivotX + r * Math.cos(theta),
    -(opts.pivotZ + r * Math.sin(theta)),
  ];

  // Outer arc start -> end
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const th = opts.startTheta + (opts.endTheta - opts.startTheta) * t;
    const [sx, sy] = toShape(opts.outerR, th);
    if (i === 0) shape.moveTo(sx, sy);
    else shape.lineTo(sx, sy);
  }

  // Inner arc end -> start
  if (opts.innerR <= 0.001) {
    shape.lineTo(opts.pivotX, -opts.pivotZ);
  } else {
    for (let i = segs; i >= 0; i--) {
      const t = i / segs;
      const th = opts.startTheta + (opts.endTheta - opts.startTheta) * t;
      const [sx, sy] = toShape(opts.innerR, th);
      shape.lineTo(sx, sy);
    }
  }
  shape.closePath();

  return createHorizontalExtrusion(shape, opts.bottomY, opts.topY, segs);
}

/**
 * Fills the outer square corner area of an 8m x 8m tile outside an arc of radius `innerR`
 * centered at a tile corner `(pivotX, pivotZ)`, sweeping cleanly around the opposite tile corners.
 */
export function createCornerSquareOutsideArcExtrusion(opts: {
  pivotX: number;
  pivotZ: number;
  innerR: number;
  startTheta: number;
  endTheta: number;
  bottomY: number;
  topY: number;
  segments?: number;
}): THREE.BufferGeometry {
  const segs = opts.segments ?? 24;
  const shape = new THREE.Shape();

  const pStartX = opts.pivotX + opts.innerR * Math.cos(opts.startTheta);
  const pStartZ = opts.pivotZ + opts.innerR * Math.sin(opts.startTheta);
  const pEndX = opts.pivotX + opts.innerR * Math.cos(opts.endTheta);
  const pEndZ = opts.pivotZ + opts.innerR * Math.sin(opts.endTheta);

  const farX = -opts.pivotX;
  const farZ = -opts.pivotZ;

  shape.moveTo(pStartX, -pStartZ);
  // Determine which tile edge pStart lies on: x = pivotX or z = pivotZ
  if (Math.abs(pStartX - opts.pivotX) < 0.08) {
    // pStart lies on x = pivotX edge -> walk around (pivotX, farZ) -> (farX, farZ) -> (farX, pivotZ)
    shape.lineTo(opts.pivotX, -farZ);
    shape.lineTo(farX, -farZ);
    shape.lineTo(farX, -opts.pivotZ);
  } else {
    // pStart lies on z = pivotZ edge -> walk around (farX, pivotZ) -> (farX, farZ) -> (pivotX, farZ)
    shape.lineTo(farX, -opts.pivotZ);
    shape.lineTo(farX, -farZ);
    shape.lineTo(opts.pivotX, -farZ);
  }
  shape.lineTo(pEndX, -pEndZ);

  for (let i = segs; i >= 0; i--) {
    const t = i / segs;
    const th = opts.startTheta + (opts.endTheta - opts.startTheta) * t;
    const ax = opts.pivotX + opts.innerR * Math.cos(th);
    const az = opts.pivotZ + opts.innerR * Math.sin(th);
    shape.lineTo(ax, -az);
  }
  shape.closePath();

  return createHorizontalExtrusion(shape, opts.bottomY, opts.topY, segs);
}

/**
 * Exact transform for a ramp climbing along local Z (from z0, y0 to z1, y1)
 * so its top face aligns cleanly with both endpoint heights.
 */
export function computeZRampTransform(
  z0: number,
  y0: number,
  z1: number,
  y1: number,
  thickness: number
) {
  const dz = z1 - z0;
  const dy = y1 - y0;
  const length = Math.hypot(dz, dy);
  const angleX = -Math.atan2(dy, dz);
  const mz = (z0 + z1) * 0.5;
  const my = (y0 + y1) * 0.5;
  const cy = my - Math.cos(angleX) * (thickness * 0.5);
  const cz = mz - Math.sin(angleX) * (thickness * 0.5);
  return { length, angleX, cy, cz };
}
