import * as THREE from 'three';

export interface RectBoundsXZ {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Applies uniform world-space UV mapping to any XZ-oriented geometry so
 * procedural stone, brick, asphalt, and putting-green textures tile seamlessly
 * across adjoining slabs without material cloning.
 */
export function applyWorldSpaceUVs(
  geometry: THREE.BufferGeometry,
  tileScaleMeters: number,
): THREE.BufferGeometry {
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  if (!pos || !norm) return geometry;

  const uvs = new Float32Array(pos.count * 2);
  const invScale = 1 / Math.max(0.05, tileScaleMeters);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = Math.abs(norm.getY(i));

    if (ny > 0.6) {
      uvs[i * 2] = x * invScale;
      uvs[i * 2 + 1] = z * invScale;
    } else {
      uvs[i * 2] = (x + z) * invScale;
      uvs[i * 2 + 1] = y * invScale;
    }
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geometry;
}

/**
 * Extrudes a 2D shape defined in world `(x, -z)` coordinates into a 3D slab
 * spanning `y in [bottomY, topY]` with upright +Y top face normals and world UVs.
 */
export function buildExtrudedWorldSlab(
  shape: THREE.Shape,
  bottomY: number,
  topY: number,
  uvTileScaleMeters = 2.0,
  curveSegments = 20,
): THREE.BufferGeometry {
  const thickness = Math.max(0.008, topY - bottomY);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments,
  });

  // Shape is authored in (x, y2d = -z). rotateX(-PI/2) maps:
  // X' = X, Y' = +Z_extrude (0..thickness), Z' = -Y2d = +z.
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bottomY, 0);
  geo.computeVertexNormals();
  return applyWorldSpaceUVs(geo, uvTileScaleMeters);
}

/**
 * Helper to create a clockwise circular cutout path in `(x, y2d = -z)` shape space.
 */
export function addCircularCutoutToShape(
  shape: THREE.Shape,
  centerX: number,
  centerZ: number,
  radius: number,
): void {
  const hole = new THREE.Path();
  // CW in (x, -z) plane for hole winding
  hole.absarc(centerX, -centerZ, radius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
}

/**
 * Builds a rectangular slab with an optional circular cup hole cutout.
 */
export function buildRectSlabGeometry(
  bounds: RectBoundsXZ,
  bottomY: number,
  topY: number,
  uvTileScaleMeters: number,
  cutoutCircle?: { x: number; z: number; radius: number } | null,
): THREE.BufferGeometry {
  const { minX, maxX, minZ, maxZ } = bounds;
  const shape = new THREE.Shape();
  // CCW in (x, -z)
  shape.moveTo(minX, -maxZ);
  shape.lineTo(maxX, -maxZ);
  shape.lineTo(maxX, -minZ);
  shape.lineTo(minX, -minZ);
  shape.closePath();

  if (
    cutoutCircle &&
    cutoutCircle.x - cutoutCircle.radius > minX &&
    cutoutCircle.x + cutoutCircle.radius < maxX &&
    cutoutCircle.z - cutoutCircle.radius > minZ &&
    cutoutCircle.z + cutoutCircle.radius < maxZ
  ) {
    addCircularCutoutToShape(
      shape,
      cutoutCircle.x,
      cutoutCircle.z,
      cutoutCircle.radius,
    );
  }

  return buildExtrudedWorldSlab(shape, bottomY, topY, uvTileScaleMeters, 24);
}

/**
 * Builds `zone-west-5th-sidewalk` with rectangular notches carved out for the two
 * West Sidewalk ADA ramp aprons so zero coplanar overlapping surfaces occur.
 */
export function buildNotchedWestSidewalkGeometry(
  bounds: RectBoundsXZ,
  cutouts: RectBoundsXZ[],
  bottomY: number,
  topY: number,
  uvTileScaleMeters = 2.0,
): THREE.BufferGeometry {
  const { minX, maxX, minZ, maxZ } = bounds;
  const sorted = [...cutouts].sort((a, b) => b.maxZ - a.maxZ); // North-to-South or South-to-North? Wait: in +Z (south) to -Z (north), trace outer east wall maxX from maxZ -> minZ!

  const southToNorth = [...sorted].sort((a, b) => b.maxZ - a.maxZ);

  const shape = new THREE.Shape();
  // CCW trace in (x, -z):
  // SW corner -> SE corner -> step along east edge (maxX) from maxZ -> minZ -> NW -> close SW
  shape.moveTo(minX, -maxZ);
  shape.lineTo(maxX, -maxZ);

  for (const cut of southToNorth) {
    if (cut.maxX < maxX - 0.05 || cut.minX <= minX) continue;
    // Climb up east face to cutout south edge
    shape.lineTo(maxX, -cut.maxZ);
    shape.lineTo(cut.minX, -cut.maxZ);
    shape.lineTo(cut.minX, -cut.minZ);
    shape.lineTo(maxX, -cut.minZ);
  }

  shape.lineTo(maxX, -minZ);
  shape.lineTo(minX, -minZ);
  shape.closePath();

  return buildExtrudedWorldSlab(shape, bottomY, topY, uvTileScaleMeters, 12);
}

/**
 * Builds the SE Vendor Corner Plaza Sidewalk Apron clipped cleanly by the concave
 * quarter-circle gutter inner radius (`r = innerRadius`, pivot `[pivotX, pivotZ]`),
 * eliminating any phantom lip or sidewalk-over-gutter intrusion.
 */
export function buildClippedSeApronGeometry(
  bounds: RectBoundsXZ,
  pivotX: number,
  pivotZ: number,
  innerRadius: number,
  bottomY: number,
  topY: number,
  uvTileScaleMeters = 2.0,
): THREE.BufferGeometry {
  const { minX, maxX, minZ, maxZ } = bounds;
  const shape = new THREE.Shape();

  // Trace CCW in (x, -z):
  // Start SW (minX, -maxZ) -> SE (maxX, -maxZ) -> NE (maxX, -minZ)
  shape.moveTo(minX, -maxZ);
  shape.lineTo(maxX, -maxZ);
  shape.lineTo(maxX, -minZ);

  // Move west along north edge (-minZ) to arc tangent (pivotX, -minZ)
  shape.lineTo(pivotX, -minZ);

  // Quarter-circle arc centered at (pivotX, pivotZ) with world theta in [1.5*PI -> PI]:
  // x(t) = pivotX + r * cos(t), z(t) = pivotZ + r * sin(t) => y2d = -z(t)
  const arcSteps = 18;
  for (let i = 1; i <= arcSteps; i++) {
    const t = Math.PI * 1.5 - (i / arcSteps) * (Math.PI * 0.5);
    const ax = pivotX + innerRadius * Math.cos(t);
    const az = pivotZ + innerRadius * Math.sin(t);
    shape.lineTo(ax, -az);
  }

  // Close south down minX wall back to SW (minX, -maxZ)
  shape.closePath();

  return buildExtrudedWorldSlab(shape, bottomY, topY, uvTileScaleMeters, 18);
}

/**
 * Builds the flush asphalt road spandrel outside the SE corner curved gutter
 * (`r >= outerRadius`, bounded on West by `roadWestX = 3.55` and North by `roadNorthZ = -18.45`),
 * completely sealing the SE corner intersection gap with zero overlap.
 */
export function buildSeRoadSpandrelGeometry(
  pivotX: number,
  pivotZ: number,
  outerRadius: number,
  roadWestX: number,
  roadNorthZ: number,
  bottomY: number,
  topY: number,
  uvTileScaleMeters = 3.5,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();

  // Outer corner vertices in (x, -z) CCW:
  // (roadWestX, -pivotZ) -> arc from theta=PI to 1.5*PI (pivotX, -roadNorthZ) -> (roadWestX, -roadNorthZ) -> close!
  // Let's trace CCW in (x, -z):
  // NW corner: (roadWestX, -roadNorthZ)
  // SW corner: (roadWestX, -pivotZ)  [matches theta = PI, r = outerRadius]
  // Arc from theta = PI -> 1.5*PI to NE tangent (pivotX, -roadNorthZ)
  // Return west along -roadNorthZ back to NW corner (roadWestX, -roadNorthZ)
  shape.moveTo(roadWestX, -roadNorthZ);
  shape.lineTo(roadWestX, -pivotZ);

  const arcSteps = 18;
  for (let i = 1; i <= arcSteps; i++) {
    const t = Math.PI + (i / arcSteps) * (Math.PI * 0.5);
    const ax = pivotX + outerRadius * Math.cos(t);
    const az = pivotZ + outerRadius * Math.sin(t);
    shape.lineTo(ax, -az);
  }

  shape.closePath();
  return buildExtrudedWorldSlab(shape, bottomY, topY, uvTileScaleMeters, 18);
}

/**
 * Builds a curved radial annular arc prism spanning `[rInner, rOuter]`, `theta in [startRad, endRad]`
 * around `(pivotX, pivotZ)`, extruded vertically from `bottomY` to `topY`.
 * Used for both `gutter-corner-se-90` floor/lips and the matching curved SE corner curb.
 */
export function buildRadialArcSlabGeometry(
  pivotX: number,
  pivotZ: number,
  rInner: number,
  rOuter: number,
  startRad: number,
  endRad: number,
  bottomY: number,
  topY: number,
  uvTileScaleMeters = 1.8,
  segments = 20,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();

  // Outer arc from startRad -> endRad
  for (let i = 0; i <= segments; i++) {
    const t = startRad + (i / segments) * (endRad - startRad);
    const x = pivotX + rOuter * Math.cos(t);
    const z = pivotZ + rOuter * Math.sin(t);
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  }

  // Inner arc back from endRad -> startRad
  for (let i = segments; i >= 0; i--) {
    const t = startRad + (i / segments) * (endRad - startRad);
    const x = pivotX + rInner * Math.cos(t);
    const z = pivotZ + rInner * Math.sin(t);
    shape.lineTo(x, -z);
  }

  shape.closePath();
  return buildExtrudedWorldSlab(shape, bottomY, topY, uvTileScaleMeters, segments);
}

/**
 * Builds a watertight sloped ramp solid spanning `boundsXZ` and rising smoothly
 * along `climbDirection` (`'east' | 'west' | 'north' | 'south'`) from `bottomY` to `topY`,
 * seated on a solid `skirtBottomY` foundation so there are zero exposed hollow undersides.
 */
export function buildSolidRampGeometry(
  bounds: RectBoundsXZ,
  bottomY: number,
  topY: number,
  climbDirection: 'east' | 'west' | 'north' | 'south',
  skirtBottomY = -0.3,
  uvTileScaleMeters = 2.0,
): THREE.BufferGeometry {
  const { minX, maxX, minZ, maxZ } = bounds;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;

  // Build prism in vertical cross-section via ExtrudeGeometry along perpendicular axis
  if (climbDirection === 'east' || climbDirection === 'west') {
    const startH = climbDirection === 'east' ? bottomY : topY;
    const endH = climbDirection === 'east' ? topY : bottomY;

    // Cross-section in XY: X = world x, Y = world y
    const profile = new THREE.Shape();
    profile.moveTo(minX, skirtBottomY);
    profile.lineTo(maxX, skirtBottomY);
    profile.lineTo(maxX, endH);
    profile.lineTo(minX, startH);
    profile.closePath();

    // Extrudes along +Z from 0..spanZ; translate Z by minZ so it covers minZ..maxZ!
    const geo = new THREE.ExtrudeGeometry(profile, {
      depth: spanZ,
      bevelEnabled: false,
    });
    geo.translate(0, 0, minZ);
    geo.computeVertexNormals();
    return applyWorldSpaceUVs(geo, uvTileScaleMeters);
  }

  // North (-Z) or South (+Z) climb: draw profile in XY and rotateY(-PI/2)
  //Wait: check rotateY(-PI/2): X' = -Z_extrude, Y' = Y, Z' = X_profile!
  // Let's keep it exact and simple using rotateY(+PI/2):
  // Under rotateY(+PI/2): X' = +Z_extrude, Y' = Y, Z' = -X_profile!
  // So if X_profile = -z (covering -maxZ .. -minZ), then Z' = +z (minZ .. maxZ), and Z_extrude (0..spanX) maps to X' = minX..maxX via translate!
  const startH = climbDirection === 'south' ? bottomY : topY; // at minZ
  const endH = climbDirection === 'south' ? topY : bottomY; // at maxZ

  const profile = new THREE.Shape();
  profile.moveTo(-maxZ, skirtBottomY);
  profile.lineTo(-minZ, skirtBottomY);
  profile.lineTo(-minZ, startH);
  profile.lineTo(-maxZ, endH);
  profile.closePath();

  const geo = new THREE.ExtrudeGeometry(profile, {
    depth: spanX,
    bevelEnabled: false,
  });
  geo.rotateY(Math.PI / 2);
  geo.translate(minX, 0, 0);
  geo.computeVertexNormals();
  return applyWorldSpaceUVs(geo, uvTileScaleMeters);
}

/**
 * Builds a smooth beveled flat ribbon along an arc centerline `(pivotX, pivotZ)` for
 * wet water sheen shimmer inside `gutter-corner-se-90`.
 */
export function buildRadialWaterRibbonGeometry(
  pivotX: number,
  pivotZ: number,
  rInner: number,
  rOuter: number,
  startRad: number,
  endRad: number,
  yElevation: number,
  segments = 24,
): THREE.BufferGeometry {
  return buildRadialArcSlabGeometry(
    pivotX,
    pivotZ,
    rInner,
    rOuter,
    startRad,
    endRad,
    yElevation - 0.002,
    yElevation + 0.004,
    1.0,
    segments,
  );
}
