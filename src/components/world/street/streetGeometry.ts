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
 * Builds a rectangular slab with a rectangular window cut out of it (e.g. the fringe collar
 * with the putting-green footprint removed) so the two layers never share a plan area and
 * their tops can never z-fight.
 */
export function buildRectSlabWithRectHoleGeometry(
  bounds: RectBoundsXZ,
  hole: RectBoundsXZ,
  bottomY: number,
  topY: number,
  uvTileScaleMeters: number,
): THREE.BufferGeometry {
  const { minX, maxX, minZ, maxZ } = bounds;
  const shape = new THREE.Shape();
  shape.moveTo(minX, -maxZ);
  shape.lineTo(maxX, -maxZ);
  shape.lineTo(maxX, -minZ);
  shape.lineTo(minX, -minZ);
  shape.closePath();

  const inside =
    hole.minX > minX && hole.maxX < maxX && hole.minZ > minZ && hole.maxZ < maxZ;
  if (inside) {
    const path = new THREE.Path();
    // CW in (x, -z) for hole winding
    path.moveTo(hole.minX, -hole.maxZ);
    path.lineTo(hole.minX, -hole.minZ);
    path.lineTo(hole.maxX, -hole.minZ);
    path.lineTo(hole.maxX, -hole.maxZ);
    path.closePath();
    shape.holes.push(path);
  }

  return buildExtrudedWorldSlab(shape, bottomY, topY, uvTileScaleMeters, 4);
}

/**
 * Builds a rectangular slab with any number of polygonal windows (vertices in world `[x, z]`)
 * carved through it. Used to remove the terrace under the turf / fringe / border / patio
 * layers so no two horizontal faces ever share plan area at the same height.
 */
export function buildRectSlabWithPolygonHolesGeometry(
  bounds: RectBoundsXZ,
  holes: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  bottomY: number,
  topY: number,
  uvTileScaleMeters: number,
): THREE.BufferGeometry {
  const { minX, maxX, minZ, maxZ } = bounds;
  const shape = new THREE.Shape();
  shape.moveTo(minX, -maxZ);
  shape.lineTo(maxX, -maxZ);
  shape.lineTo(maxX, -minZ);
  shape.lineTo(minX, -minZ);
  shape.closePath();

  for (const poly of holes) {
    if (poly.length < 3) continue;
    const path = new THREE.Path();
    poly.forEach(([x, z], i) => {
      if (i === 0) path.moveTo(x, -z);
      else path.lineTo(x, -z);
    });
    path.closePath();
    shape.holes.push(path);
  }

  return buildExtrudedWorldSlab(shape, bottomY, topY, uvTileScaleMeters, 4);
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
  const southToNorth = [...cutouts].sort((a, b) => b.maxZ - a.maxZ);

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
  const arcSteps = 48;
  for (let i = 1; i <= arcSteps; i++) {
    const t = Math.PI * 1.5 - (i / arcSteps) * (Math.PI * 0.5);
    const ax = pivotX + innerRadius * Math.cos(t);
    const az = pivotZ + innerRadius * Math.sin(t);
    shape.lineTo(ax, -az);
  }

  // Close south down minX wall back to SW (minX, -maxZ)
  shape.closePath();

  return buildExtrudedWorldSlab(shape, bottomY, topY, uvTileScaleMeters, 48);
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

  const arcSteps = 48;
  for (let i = 1; i <= arcSteps; i++) {
    const t = Math.PI + (i / arcSteps) * (Math.PI * 0.5);
    const ax = pivotX + outerRadius * Math.cos(t);
    const az = pivotZ + outerRadius * Math.sin(t);
    shape.lineTo(ax, -az);
  }

  shape.closePath();
  return buildExtrudedWorldSlab(shape, bottomY, topY, uvTileScaleMeters, 48);
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
  segments = 48,
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
 * Builds an inclined deck slab of uniform vertical thickness `slabThickness` below the top ramp
 * plane (`bottomY -> topY` along `climbDirection`), used for elevated Zone 3-7 bridges, scaffolds,
 * and subway stairwells so ramps never punch solid prism wedges into lower architectural zones.
 */
export function buildInclinedDeckSlabGeometry(
  bounds: RectBoundsXZ,
  bottomY: number,
  topY: number,
  climbDirection: 'east' | 'west' | 'north' | 'south',
  slabThickness = 0.45,
  uvTileScaleMeters = 2.0,
): THREE.BufferGeometry {
  const { minX, maxX, minZ, maxZ } = bounds;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;

  if (climbDirection === 'east' || climbDirection === 'west') {
    const startH = climbDirection === 'east' ? bottomY : topY;
    const endH = climbDirection === 'east' ? topY : bottomY;

    const profile = new THREE.Shape();
    profile.moveTo(minX, startH - slabThickness);
    profile.lineTo(maxX, endH - slabThickness);
    profile.lineTo(maxX, endH);
    profile.lineTo(minX, startH);
    profile.closePath();

    const geo = new THREE.ExtrudeGeometry(profile, {
      depth: spanZ,
      bevelEnabled: false,
    });
    geo.translate(0, 0, minZ);
    geo.computeVertexNormals();
    return applyWorldSpaceUVs(geo, uvTileScaleMeters);
  }

  const startH = climbDirection === 'south' ? bottomY : topY;
  const endH = climbDirection === 'south' ? topY : bottomY;

  const profile = new THREE.Shape();
  profile.moveTo(-maxZ, endH - slabThickness);
  profile.lineTo(-minZ, startH - slabThickness);
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
 * Builds a single top-face-only (+Y normal) flat ribbon along an arc centerline `(pivotX, pivotZ)`
 * with zero bottom face or internal caps so semi-transparent water never double-blends.
 */
export function buildRadialWaterRibbonGeometry(
  pivotX: number,
  pivotZ: number,
  rInner: number,
  rOuter: number,
  startRad: number,
  endRad: number,
  yElevation: number,
  segments = 48,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (let i = 0; i < segments; i++) {
    const t0 = startRad + (i / segments) * (endRad - startRad);
    const t1 = startRad + ((i + 1) / segments) * (endRad - startRad);
    const c0 = Math.cos(t0);
    const s0 = Math.sin(t0);
    const c1 = Math.cos(t1);
    const s1 = Math.sin(t1);

    const a: [number, number, number] = [pivotX + rOuter * c0, yElevation, pivotZ + rOuter * s0];
    const b: [number, number, number] = [pivotX + rInner * c0, yElevation, pivotZ + rInner * s0];
    const c: [number, number, number] = [pivotX + rInner * c1, yElevation, pivotZ + rInner * s1];
    const d: [number, number, number] = [pivotX + rOuter * c1, yElevation, pivotZ + rOuter * s1];

    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let k = 0; k < 6; k++) normals.push(0, 1, 0);
    uvs.push(a[0], a[2], b[0], b[2], c[0], c[2], a[0], a[2], c[0], c[2], d[0], d[2]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Builds one continuous, single-sheet (+Y top-face only, zero internal caps) hydrant water ribbon
 * starting north of the corner drain grate, sweeping smoothly around the 90-deg SE gutter arc,
 * and stopping cleanly short of the Courtyard Stone Ramp toe (`eastEndX <= 14.15m`).
 */
export function buildContinuousHydrantWaterSheetGeometry({
  pivotX,
  pivotZ,
  centerRadius,
  ribbonWidth = 0.28,
  startRad = Math.PI,
  endRad = Math.PI * 1.5,
  southStartZ,
  eastEndX,
  yElevation,
  arcSegments = 48,
}: {
  pivotX: number;
  pivotZ: number;
  centerRadius: number;
  ribbonWidth?: number;
  startRad?: number;
  endRad?: number;
  southStartZ: number;
  eastEndX: number;
  yElevation: number;
  arcSegments?: number;
}): THREE.BufferGeometry {
  const halfW = ribbonWidth * 0.5;
  const spine: Array<{ cx: number; cz: number; rx: number; rz: number }> = [];

  const arcStartX = pivotX + centerRadius * Math.cos(startRad);
  const arcStartZ = pivotZ + centerRadius * Math.sin(startRad);
  if (southStartZ > arcStartZ + 0.01) {
    spine.push({ cx: arcStartX, cz: southStartZ, rx: 1, rz: 0 });
  }

  for (let i = 0; i <= arcSegments; i++) {
    const t = startRad + (i / arcSegments) * (endRad - startRad);
    const c = Math.cos(t);
    const s = Math.sin(t);
    spine.push({
      cx: pivotX + centerRadius * c,
      cz: pivotZ + centerRadius * s,
      rx: -c,
      rz: -s,
    });
  }

  const arcEndX = pivotX + centerRadius * Math.cos(endRad);
  const arcEndZ = pivotZ + centerRadius * Math.sin(endRad);
  if (eastEndX > arcEndX + 0.01) {
    spine.push({ cx: eastEndX, cz: arcEndZ, rx: 0, rz: 1 });
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (let i = 0; i < spine.length - 1; i++) {
    const p0 = spine[i];
    const p1 = spine[i + 1];

    const a: [number, number, number] = [p0.cx - p0.rx * halfW, yElevation, p0.cz - p0.rz * halfW];
    const b: [number, number, number] = [p0.cx + p0.rx * halfW, yElevation, p0.cz + p0.rz * halfW];
    const c: [number, number, number] = [p1.cx + p1.rx * halfW, yElevation, p1.cz + p1.rz * halfW];
    const d: [number, number, number] = [p1.cx - p1.rx * halfW, yElevation, p1.cz - p1.rz * halfW];

    // Winding (a, b, c) and (a, c, d) yields upward +Y normal: (b-a) x (d-a) = (+R) x (+T) = +Y.
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let k = 0; k < 6; k++) normals.push(0, 1, 0);
    uvs.push(a[0], a[2], b[0], b[2], c[0], c[2], a[0], a[2], c[0], c[2], d[0], d[2]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}
