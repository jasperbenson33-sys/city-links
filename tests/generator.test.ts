import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';

import {
  ALL_TILE_BLUEPRINT_IDS,
  applyEulerXYZToVector,
  buildCoaxialHydrantSpec,
  buildCoaxialUmbrellaSpec,
  buildCoaxialWheelSpec,
  computeDeterministicTrajectory,
  createRandomSeed,
  dotVec3,
  generateCityCourse,
  getCourseSurfaceElevationAt,
  getTileSurfaceElevationAtWorld,
  getTodayDailySeedUTC,
  gridToWorld,
  mulberry32,
  PROP_CATALOG,
  TILE_BLUEPRINTS,
  validateGeneratedCourse,
  worldToGrid,
} from '../src/engine';
import {
  BALL_RADIUS,
  CLUB_ORDER,
  CUP_APRON_RADIUS,
  CUP_ARCHETYPES,
  ELEVATIONS,
  FLAG_COLORS,
  GRID_COLS,
  GRID_ROWS,
  ISLAND_SIZE,
  SIGNATURE_PROP_TYPES,
  TILE_SIZE,
  type PropType,
} from '../src/types';

test('Grid & Seed Helpers: 6x6 48m island centered at (0,0,0) + deterministic PRNG', () => {
  assert.equal(GRID_COLS, 6);
  assert.equal(GRID_ROWS, 6);
  assert.equal(TILE_SIZE, 8);
  assert.equal(ISLAND_SIZE, 48);

  const nw = gridToWorld(0, 0);
  const se = gridToWorld(5, 5);
  assert.equal(nw.x, -20);
  assert.equal(nw.z, -20);
  assert.equal(se.x, 20);
  assert.equal(se.z, 20);

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const world = gridToWorld(c, r);
      const back = worldToGrid(world.x, world.z);
      assert.equal(back.inBounds, true);
      assert.equal(back.col, c);
      assert.equal(back.row, r);
    }
  }

  assert.equal(worldToGrid(-25, 0).inBounds, false);
  assert.equal(worldToGrid(24, 24).col, 5);
  assert.equal(worldToGrid(24, 24).row, 5);

  const utcSeed = getTodayDailySeedUTC(new Date('2026-11-13T02:35:22Z'));
  assert.equal(utcSeed, '2026-11-13');
  assert.match(getTodayDailySeedUTC(), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(createRandomSeed(), /^city-[a-z0-9]{6}$/);

  const rngA = mulberry32(123456789);
  const rngB = mulberry32(123456789);
  for (let i = 0; i < 20; i++) {
    assert.equal(rngA(), rngB());
  }
});

test('Coaxial Wheel Builder: Three.js Torus tire, Cylinder rim/hub, and radial spokes share exact wheel plane & y=0 contact', () => {
  for (const axleAxis of ['x', 'z'] as const) {
    const spec = buildCoaxialWheelSpec({
      outerRadius: 0.3,
      tireTubeRadius: 0.07,
      spokeCount: 8,
      axleAxis,
    });

    assert.equal(spec.groundContactY, 0);
    assert.deepEqual(spec.wheelCenter, [0, 0.3, 0]);

    // Verify coaxial alignment of tire, rim, hub, and axle
    assert.ok(Math.abs(dotVec3(spec.tire.normalAxis, spec.axleDirection) - 1) < 1e-12);
    assert.ok(Math.abs(dotVec3(spec.rim.symmetryAxis, spec.axleDirection) - 1) < 1e-12);
    assert.ok(Math.abs(dotVec3(spec.hub.symmetryAxis, spec.axleDirection) - 1) < 1e-12);
    assert.ok(Math.abs(dotVec3(spec.axle.symmetryAxis, spec.axleDirection) - 1) < 1e-12);

    // Verify against real THREE.TorusGeometry vertex bounding box (no horizontal hula-hoop!)
    const torusGeo = new THREE.TorusGeometry(
      spec.tire.majorRadius,
      spec.tire.tubeRadius,
      32,
      64,
    );
    const tireMat = new THREE.Matrix4().compose(
      new THREE.Vector3(...spec.tire.position),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(...spec.tire.rotation, 'XYZ'),
      ),
      new THREE.Vector3(1, 1, 1),
    );
    torusGeo.applyMatrix4(tireMat);
    torusGeo.computeBoundingBox();
    const bbox = torusGeo.boundingBox!;

    // Lowest vertex of tire sits flush at y = 0, highest at 2 * outerRadius = 0.60
    assert.ok(Math.abs(bbox.min.y - 0) < 1e-3, `Expected tire minY=0, got ${bbox.min.y}`);
    assert.ok(Math.abs(bbox.max.y - 0.6) < 1e-3, `Expected tire maxY=0.6, got ${bbox.max.y}`);

    if (axleAxis === 'x') {
      // Wheel lies in YZ plane: narrow along X (= 2 * tubeRadius), full diameter along Z (= 2 * outerRadius)
      assert.ok(Math.abs((bbox.max.x - bbox.min.x) - 0.14) < 2e-3);
      assert.ok(Math.abs((bbox.max.z - bbox.min.z) - 0.6) < 2e-3);
    } else {
      // Wheel lies in XY plane: full diameter along X (= 0.6), narrow along Z (= 0.14)
      assert.ok(Math.abs((bbox.max.x - bbox.min.x) - 0.6) < 2e-3);
      assert.ok(Math.abs((bbox.max.z - bbox.min.z) - 0.14) < 2e-3);
    }
    torusGeo.dispose();

    // Verify all 8 spokes lie strictly inside the wheel plane (orthogonal to axle)
    assert.equal(spec.spokes.length, 8);
    for (const spoke of spec.spokes) {
      const threeDir = new THREE.Vector3(0, 1, 0).applyEuler(
        new THREE.Euler(...spoke.rotation, 'XYZ'),
      );
      assert.ok(Math.abs(threeDir.x - spoke.directionAxis[0]) < 1e-11);
      assert.ok(Math.abs(threeDir.y - spoke.directionAxis[1]) < 1e-11);
      assert.ok(Math.abs(threeDir.z - spoke.directionAxis[2]) < 1e-11);
      assert.ok(
        Math.abs(dotVec3(spoke.directionAxis, spec.axleDirection)) < 1e-12,
        `Spoke ${spoke.index} is not perpendicular to axle`,
      );
      if (axleAxis === 'x') {
        assert.equal(spoke.position[0], 0);
      } else {
        assert.equal(spoke.position[2], 0);
      }
    }
  }
});

test('Coaxial Umbrella & Hydrant Builders: exact y=0 ground contact, Three.js rib/nozzle alignment, restitution 0.55', () => {
  const umbrella = buildCoaxialUmbrellaSpec();
  assert.equal(umbrella.groundContactY, 0);
  assert.equal(umbrella.baseStand.bottomY, 0);
  assert.equal(umbrella.pole.bottomY, 0);
  assert.equal(umbrella.trampolineCollider.restitution, 0.55);
  assert.equal(umbrella.ribs.length, 8);

  // Verify pole cylinder touches exact y = 0 in Three.js
  const poleGeo = new THREE.CylinderGeometry(
    umbrella.pole.radius,
    umbrella.pole.radius,
    umbrella.pole.length,
    12,
  );
  poleGeo.translate(...umbrella.pole.position);
  poleGeo.computeBoundingBox();
  assert.ok(Math.abs(poleGeo.boundingBox!.min.y) < 1e-6);
  poleGeo.dispose();

  // Verify every rib cylinder connects exact rimPoint -> coaxial apexPoint under Three.js Euler XYZ
  for (const rib of umbrella.ribs) {
    const dir = new THREE.Vector3(0, 1, 0).applyEuler(
      new THREE.Euler(...rib.rotation, 'XYZ'),
    );
    const mid = new THREE.Vector3(...rib.position);
    const topEnd = mid.clone().addScaledVector(dir, rib.length * 0.5);
    const botEnd = mid.clone().addScaledVector(dir, -rib.length * 0.5);

    assert.ok(topEnd.distanceTo(new THREE.Vector3(...rib.apexPoint)) < 1e-9);
    assert.ok(botEnd.distanceTo(new THREE.Vector3(...rib.rimPoint)) < 1e-9);
  }

  // Verify Hydrant coaxiality, 5-sided nut, orthogonal caps, and water-jet arc
  const hydrant = buildCoaxialHydrantSpec();
  assert.equal(hydrant.groundContactY, 0);
  assert.equal(hydrant.baseFlange.bottomY, 0);
  assert.equal(hydrant.pentagonNut.sides, 5);
  assert.equal(hydrant.sideHoseCaps.length, 3);

  for (const cap of hydrant.sideHoseCaps) {
    const axis = applyEulerXYZToVector([0, 1, 0], cap.rotation);
    // Orthogonal to vertical +Y barrel
    assert.ok(Math.abs(dotVec3(axis, [0, 1, 0])) < 1e-12);
  }

  const jetPts = hydrant.waterJet.arcPoints;
  assert.ok(jetPts.length >= 10);
  assert.ok(jetPts[jetPts.length - 1]![2] > jetPts[0]![2] + 4.0);
  assert.equal(jetPts[jetPts.length - 1]![1], 0);
});

test('4-Club Deterministic Trajectory: distinct carry/apex profiles & underpass clearance', () => {
  assert.deepEqual(CLUB_ORDER, ['driver', 'wedge', 'skimmer', 'putter']);
  const origin: [number, number, number] = [0, ELEVATIONS.SIDEWALK_Y + BALL_RADIUS, 0];

  const driver = computeDeterministicTrajectory({
    origin,
    clubId: 'driver',
    power: 1.0,
    aimDirection: [0, -1],
    groundY: ELEVATIONS.SIDEWALK_Y,
  });
  const wedge = computeDeterministicTrajectory({
    origin,
    clubId: 'wedge',
    power: 1.0,
    aimDirection: [0, -1],
    groundY: ELEVATIONS.SIDEWALK_Y,
  });
  const skimmer = computeDeterministicTrajectory({
    origin,
    clubId: 'skimmer',
    power: 1.0,
    aimDirection: [0, -1],
    groundY: ELEVATIONS.SIDEWALK_Y,
  });
  const putter = computeDeterministicTrajectory({
    origin,
    clubId: 'putter',
    power: 1.0,
    aimDirection: [0, -1],
    groundY: ELEVATIONS.SIDEWALK_Y,
  });

  // Wedge lob reaches highest apex; Driver carries farthest; Skimmer stays knee-high (< 0.45m above origin)
  assert.ok(wedge.apexY > driver.apexY, 'Wedge should loft higher than Driver');
  assert.ok(driver.apexY > skimmer.apexY, 'Driver should loft higher than Skimmer');
  assert.ok(skimmer.maxClearanceAboveOrigin < 0.35, 'Skimmer must stay low to thread under carts/scaffolding');
  assert.equal(putter.maxClearanceAboveOrigin, 0);

  const driverDist = Math.hypot(
    driver.estimatedStopPoint[0],
    driver.estimatedStopPoint[2],
  );
  const wedgeDist = Math.hypot(
    wedge.estimatedStopPoint[0],
    wedge.estimatedStopPoint[2],
  );
  assert.ok(driverDist > wedgeDist + 5);

  // Exact deterministic repeatability
  const driverRepeat = computeDeterministicTrajectory({
    origin,
    clubId: 'driver',
    power: 1.0,
    aimDirection: [0, -1],
    groundY: ELEVATIONS.SIDEWALK_Y,
  });
  assert.deepEqual(driver.launchVelocity, driverRepeat.launchVelocity);
  assert.deepEqual(driver.landingPoint, driverRepeat.landingPoint);
});

test('Tile Blueprints Collider Audit: flush lip-free ramp top faces & 100% 8m x 8m XZ floor coverage across all 19 blueprints', () => {
  for (const bpId of ALL_TILE_BLUEPRINT_IDS) {
    const bp = TILE_BLUEPRINTS[bpId];

    // 1. Verify every ramp's rotated top walkable face hits exact (minZ/maxZ, bottomY/topY) within 1e-6 (#G1-1)
    for (const ramp of bp.ramps) {
      const halfThick = ramp.size[1] * 0.5;
      const halfLen = ramp.size[2] * 0.5;
      const mat = new THREE.Matrix4().compose(
        new THREE.Vector3(...ramp.center),
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(...ramp.rotation, 'XYZ'),
        ),
        new THREE.Vector3(1, 1, 1),
      );

      const northTopPt = new THREE.Vector3(0, halfThick, -halfLen).applyMatrix4(
        mat,
      );
      const southTopPt = new THREE.Vector3(0, halfThick, halfLen).applyMatrix4(
        mat,
      );

      assert.ok(
        Math.abs(northTopPt.z - ramp.localBoundsXZ.minZ) < 1e-6,
        `${bpId}/${ramp.id} northZ=${northTopPt.z} != minZ=${ramp.localBoundsXZ.minZ}`,
      );
      assert.ok(
        Math.abs(southTopPt.z - ramp.localBoundsXZ.maxZ) < 1e-6,
        `${bpId}/${ramp.id} southZ=${southTopPt.z} != maxZ=${ramp.localBoundsXZ.maxZ}`,
      );

      const expectedNorthY =
        ramp.climbDirection === 'north' ? ramp.topY : ramp.bottomY;
      const expectedSouthY =
        ramp.climbDirection === 'north' ? ramp.bottomY : ramp.topY;

      assert.ok(
        Math.abs(northTopPt.y - expectedNorthY) < 1e-6,
        `${bpId}/${ramp.id} northTopY=${northTopPt.y} != ${expectedNorthY}`,
      );
      assert.ok(
        Math.abs(southTopPt.y - expectedSouthY) < 1e-6,
        `${bpId}/${ramp.id} southTopY=${southTopPt.y} != ${expectedSouthY}`,
      );
    }

    // 2. Verify 100% 0.05m XZ floor collider coverage across [-4, 4] x [-4, 4] (#G1-2)
    const walkableSlabs = bp.surfaces.filter(
      (s) => !s.isWall && s.kind !== 'curb_wall' && s.kind !== 'terrace_wall',
    );
    for (let iz = 0; iz < 160; iz++) {
      const lz = -3.975 + iz * 0.05;
      for (let ix = 0; ix < 160; ix++) {
        const lx = -3.975 + ix * 0.05;
        let covered = false;
        for (const s of walkableSlabs) {
          const hx = s.size[0] * 0.5 + 1e-6;
          const hz = s.size[2] * 0.5 + 1e-6;
          if (
            Math.abs(lx - s.center[0]) <= hx &&
            Math.abs(lz - s.center[2]) <= hz
          ) {
            covered = true;
            break;
          }
        }
        assert.ok(
          covered,
          `Uncovered XZ floor hole in ${bpId} at (${lx.toFixed(3)}, ${lz.toFixed(3)})`,
        );
      }
    }
  }
});

test('200-Seed Stress Suite + Daily UTC Seed: 0 socket mismatches, 0 overlaps, 0 floating props, >=10m flags, <=3 stroke solvability', () => {
  assert.ok(
    ALL_TILE_BLUEPRINT_IDS.length >= 12,
    `Expected >= 12 modular blueprints, got ${ALL_TILE_BLUEPRINT_IDS.length}`,
  );
  assert.equal(Object.keys(TILE_BLUEPRINTS).length, ALL_TILE_BLUEPRINT_IDS.length);
  assert.ok(Object.keys(PROP_CATALOG).length >= 12);

  const seedsToTest: string[] = [
    getTodayDailySeedUTC(),
    '2026-11-13',
    'coffee-golf-benchmark',
  ];
  for (let i = 0; i < 200; i++) {
    seedsToTest.push(`curbside-seed-${String(i).padStart(3, '0')}`);
  }

  // Determinism check on Today's Daily Seed
  const dailyA = generateCityCourse(seedsToTest[0]!);
  const dailyB = generateCityCourse(seedsToTest[0]!);
  assert.deepEqual(
    dailyA.tiles.map((t) => [t.blueprintId, t.rotationSteps]),
    dailyB.tiles.map((t) => [t.blueprintId, t.rotationSteps]),
  );
  assert.deepEqual(dailyA.flags, dailyB.flags);
  assert.deepEqual(dailyA.props, dailyB.props);

  const observedPropTypes = new Set<PropType>();
  const observedArchetypes = new Set<string>();
  const observedBlueprints = new Set<string>();
  const observedSockets = new Set<string>();
  let totalGenMs = 0;

  const suiteStart = performance.now();
  for (const seed of seedsToTest) {
    const t0 = performance.now();
    const course = generateCityCourse(seed);
    const elapsed = performance.now() - t0;
    totalGenMs += elapsed;

    // Fast generation budget check (< 50ms even with cold JIT on seed 0; average << 5ms)
    assert.ok(
      elapsed < 60,
      `Seed "${seed}" took ${elapsed.toFixed(2)}ms`,
    );

    const report = validateGeneratedCourse(course);
    assert.equal(
      report.valid,
      true,
      `Seed "${seed}" failed validation: ${report.errors.join('; ')}`,
    );
    assert.equal(report.socketMismatches, 0);
    assert.equal(report.curbChannelDiscontinuities, 0);
    assert.equal(report.unreachableTier2Greens, 0);
    assert.equal(report.aabbOverlaps, 0);
    assert.equal(report.floatingProps, 0);
    assert.ok(
      report.minFlagSpacingMeters >= 10.0,
      `Seed "${seed}" minFlagSpacing=${report.minFlagSpacingMeters}`,
    );
    assert.equal(report.apronViolations, 0);
    assert.ok(
      report.maxPairwiseStrokes >= 1 && report.maxPairwiseStrokes <= 3,
      `Seed "${seed}" maxPairwiseStrokes=${report.maxPairwiseStrokes}`,
    );

    // Explicit double-check of all 5 flags, 5 colors, 5 archetypes, and 25 reachability legs
    assert.equal(course.flags.length, 5);
    assert.equal(course.reachability.length, 25);
    for (const color of FLAG_COLORS) {
      assert.ok(course.flags.some((f) => f.color === color));
    }
    for (const arch of CUP_ARCHETYPES) {
      assert.ok(course.flags.some((f) => f.archetype === arch));
      observedArchetypes.add(arch);
    }

    for (const flag of course.flags) {
      assert.ok(flag.apronRadius >= CUP_APRON_RADIUS);
      const cupHostY = getCourseSurfaceElevationAt(
        course,
        flag.position[0],
        flag.position[2],
      );
      assert.ok(Math.abs(flag.position[1] - cupHostY) <= 1e-4);
    }

    for (const tile of course.tiles) {
      observedBlueprints.add(tile.blueprintId);
      for (const s of tile.sockets) observedSockets.add(s);

      // Assert water hazard zones are wide cohesive reflection pools / basins (never thin slits)
      for (const wz of tile.waterZones) {
        if (wz.shape === 'box' && wz.size) {
          assert.ok(
            wz.size[0] >= 4.5 && wz.size[2] >= 4.5,
            `Slit water zone detected in ${tile.blueprintId}: ${wz.size[0]}x${wz.size[2]}`,
          );
        } else if (wz.shape === 'cylinder') {
          assert.ok((wz.radius ?? 0) >= 1.5);
        }
      }
    }

    // Explicitly assert 100% single-component road & curb-gutter connectivity (0 orphaned asphalt patches)
    const asphaltTiles = course.tiles.filter(
      (t) =>
        t.category === 'road' ||
        t.category === 'gutter' ||
        t.surfaces.some((s) => s.kind === 'asphalt'),
    );
    assert.ok(asphaltTiles.length >= 6);
    const roadMap = new Map(asphaltTiles.map((t) => [`${t.col},${t.row}`, t]));
    const visited = new Set<string>([`${asphaltTiles[0]!.col},${asphaltTiles[0]!.row}`]);
    const bfs = [asphaltTiles[0]!];
    const dirs: Array<[number, number, 0 | 1 | 2 | 3, 0 | 1 | 2 | 3]> = [
      [0, -1, 0, 2],
      [1, 0, 1, 3],
      [0, 1, 2, 0],
      [-1, 0, 3, 1],
    ];
    while (bfs.length > 0) {
      const cur = bfs.shift()!;
      for (const [dc, dr, sIdx, oppIdx] of dirs) {
        const nk = `${cur.col + dc},${cur.row + dr}`;
        if (visited.has(nk)) continue;
        const nb = roadMap.get(nk);
        if (!nb) continue;
        const s = cur.sockets[sIdx];
        if ((s === 'asphalt_road' || s === 'curb_gutter') && nb.sockets[oppIdx] === s) {
          visited.add(nk);
          bfs.push(nb);
        }
      }
    }
    assert.equal(
      visited.size,
      asphaltTiles.length,
      `Seed "${seed}" has stranded asphalt tiles (${visited.size}/${asphaltTiles.length} connected)`,
    );

    // Verify continuous cross-tile boundary elevation profile across EVERY seed (#G1-3)
    {
      const sampleOffsets = [-3.6, -3.0, -2.5, -2.14, -1.5, -1.14, 0, 1.14, 1.5, 2.14, 2.5, 3.0, 3.6];
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const tA = course.tiles[r * GRID_COLS + c]!;
          if (c + 1 < GRID_COLS) {
            const tE = course.tiles[r * GRID_COLS + (c + 1)]!;
            const seamX = tA.worldX + 4;
            for (const offZ of sampleOffsets) {
              const wz = tA.worldZ + offZ;
              const yA = getTileSurfaceElevationAtWorld(tA, seamX - 1e-3, wz);
              const yE = getTileSurfaceElevationAtWorld(tE, seamX + 1e-3, wz);
              assert.ok(
                Math.abs(yA - yE) < 2e-3,
                `East-West seam cliff (${tA.blueprintId} -> ${tE.blueprintId}) at zOff=${offZ}: ${yA} vs ${yE}`,
              );
            }
          }
          if (r + 1 < GRID_ROWS) {
            const tS = course.tiles[(r + 1) * GRID_COLS + c]!;
            const seamZ = tA.worldZ + 4;
            for (const offX of sampleOffsets) {
              const wx = tA.worldX + offX;
              const yA = getTileSurfaceElevationAtWorld(tA, wx, seamZ - 1e-3);
              const yS = getTileSurfaceElevationAtWorld(tS, wx, seamZ + 1e-3);
              assert.ok(
                Math.abs(yA - yS) < 2e-3,
                `North-South seam cliff (${tA.blueprintId} -> ${tS.blueprintId}) at xOff=${offX}: ${yA} vs ${yS}`,
              );
            }
          }
        }
      }
    }

    for (const prop of course.props) {
      observedPropTypes.add(prop.type);
      const hostY = getCourseSurfaceElevationAt(
        course,
        prop.position[0],
        prop.position[2],
      );
      assert.ok(
        Math.abs(prop.position[1] - hostY) <= 1e-4,
        `Prop ${prop.id} floating: ${prop.position[1]} vs ${hostY}`,
      );
    }
  }

  const totalSuiteMs = performance.now() - suiteStart;
  const avgMs = totalGenMs / seedsToTest.length;
  assert.ok(
    avgMs < 20,
    `Expected average generation < 20ms, got ${avgMs.toFixed(2)}ms`,
  );
  assert.ok(
    totalSuiteMs < 5000,
    `Expected 203-seed suite < 5000ms, got ${totalSuiteMs.toFixed(1)}ms`,
  );

  // Confirm every signature reactive prop, all 19 blueprints, and all 7 edge socket types appear across the 203 seeds
  for (const sigProp of SIGNATURE_PROP_TYPES) {
    assert.ok(
      observedPropTypes.has(sigProp),
      `Signature prop ${sigProp} was never placed across 203 seeds`,
    );
  }
  assert.equal(observedArchetypes.size, 5);
  assert.equal(
    observedBlueprints.size,
    ALL_TILE_BLUEPRINT_IDS.length,
    `Expected all ${ALL_TILE_BLUEPRINT_IDS.length} blueprints used, got ${observedBlueprints.size}`,
  );
  assert.equal(observedSockets.size, 7, 'Expected all 7 EdgeSocket types used');
});
