import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  A_POSITION_CROSSWALK,
  AUDIT_CAMERA_STATIONS,
  auditStation360PerimeterClosure,
  COURSE_MASTER_PLAN,
  getCourseSurfaceElevationAt,
  getMasterPlanGroundElevationAt,
  getMasterPlanSurfaceTagAt,
  getVanRampOrRoofElevationAt,
  HOLE_1_CUP,
  isWalkablePointExplicitlyCovered,
  isWorldPointInWaterHazard,
  OUTER_CITY_GROUND_SKIRT,
  STREET_SCOUT_CAMERA_PRESET,
  TEE_POSITION,
  TEE_SET_LOCAL_BOUNDS,
  TEE_STAND_BAG_OFFSET,
  VAN_LOADING_ZONE,
} from '@/config/courseMasterPlan';
import {
  aabbContainedInBoundsXZ,
  aabbsOverlap3D,
  buildArchedFrameSpec,
  buildCoaxialHydrantSpec,
  buildCoaxialStreetlampSpec,
  buildCoaxialUmbrellaSpec,
  buildCoaxialWheelSpec,
  buildOBB2D,
  buildPitchedAwningSpec,
  computeAwningBounceVelocity,
  computeHorizontalAABBGap,
  computePitchedAwningNormal,
  degToRad,
  distance2D,
  dotVec3,
  intersectRayAABB3D,
  obbsOverlap2D,
} from '@/lib/geometryHelpers';
import { getClubProfile } from '@/lib/clubs';
import { computeDeterministicTrajectory } from '@/engine/trajectory';
import {
  BALL_RADIUS,
  CLUB_SPECS,
  CUP_DEPTH,
  CUP_RADIUS,
  ELEVATIONS,
  WORLD_GRAVITY_Y,
  type AABB3D,
  type Vec2Tuple,
  type Vec3Tuple,
} from '@/types';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ============================================================================
// 1. ZERO FLOATING PROPS, ARCHITECTURAL WALL GROUNDING & ZERO SUBTERRANEAN SINKS
// ============================================================================

test('1. Grounding Audit: 0 floating props, 0 buried architectural walls, and 0 subterranean sinks across all zones', () => {
  const allowedZoneDatums = new Set<number>([
    ELEVATIONS.ROAD_ASPHALT_Y, // 0.00
    ELEVATIONS.SIDEWALK_Y, // 0.15
    ELEVATIONS.COURTYARD_GREEN_Y, // 0.60
  ]);

  assert.ok(COURSE_MASTER_PLAN.props.length >= 20, 'Expected full diegetic prop suite');

  for (const prop of COURSE_MASTER_PLAN.props) {
    assert.ok(
      allowedZoneDatums.has(prop.groundY),
      `Prop ${prop.id} has invalid zone datum groundY=${prop.groundY}`,
    );
    assert.ok(
      Math.abs(prop.position[1] - prop.groundY) < 1e-6,
      `Prop ${prop.id} floats or sinks: position[1]=${prop.position[1]} !== groundY=${prop.groundY}`,
    );
    assert.ok(
      Math.abs(prop.aabb.min[1] - prop.groundY) < 1e-6,
      `Prop ${prop.id} AABB bottom ${prop.aabb.min[1]} !== groundY=${prop.groundY}`,
    );

    const sampledZoneY = getMasterPlanGroundElevationAt(
      prop.position[0],
      prop.position[2],
    );
    assert.ok(
      Math.abs(sampledZoneY - prop.groundY) < 1e-4,
      `Prop ${prop.id} at (${prop.position[0]}, ${prop.position[2]}) has groundY=${prop.groundY} but underlying surface is y=${sampledZoneY}`,
    );
  }

  // R4: Architectural Walls Grounding & Non-Burial Audit
  assert.ok(
    COURSE_MASTER_PLAN.architecturalWalls.length >= 5,
    'Expected subway retaining, planter low wall, and courtyard ramp/step cheek walls',
  );
  for (const wall of COURSE_MASTER_PLAN.architecturalWalls) {
    assert.ok(
      allowedZoneDatums.has(wall.groundY),
      `Wall ${wall.id} has invalid groundY=${wall.groundY}`,
    );
    assert.equal(wall.rotationY, 0, `Wall ${wall.id} must stay axis-aligned (rotationY=0)`);
    assert.ok(
      Math.abs(wall.aabb.min[1] - wall.groundY) < 1e-6,
      `Wall ${wall.id} AABB bottom ${wall.aabb.min[1]} !== groundY=${wall.groundY}`,
    );
    assert.ok(
      Math.abs(wall.aabb.max[1] - wall.topY) < 1e-6,
      `Wall ${wall.id} AABB top ${wall.aabb.max[1]} !== topY=${wall.topY}`,
    );

    // Sample 3x3 grid across wall footprint to verify groundY matches minimum underlying terrain datum (0 burial!)
    const xs = [wall.aabb.min[0] + 0.01, wall.center[0], wall.aabb.max[0] - 0.01];
    const zs = [wall.aabb.min[2] + 0.01, wall.center[2], wall.aabb.max[2] - 0.01];
    let minUnderlyingY = Infinity;
    for (const sx of xs) {
      for (const sz of zs) {
        const gy = getMasterPlanGroundElevationAt(sx, sz);
        if (gy < minUnderlyingY) minUnderlyingY = gy;
      }
    }
    assert.ok(
      Math.abs(wall.groundY - minUnderlyingY) < 5e-3,
      `Wall ${wall.id} is buried or floating: groundY=${wall.groundY} vs minUnderlyingY=${minUnderlyingY.toFixed(3)}`,
    );
  }

  const planterWall = COURSE_MASTER_PLAN.architecturalWalls.find(
    (w) => w.id === 'wall-courtyard-wrought-iron-planter',
  )!;
  assert.equal(
    planterWall.groundY,
    ELEVATIONS.COURTYARD_GREEN_Y,
    'Planter low wall must rest directly on the +0.60m courtyard terrace',
  );
  assert.ok(
    planterWall.topY - planterWall.groundY >= 0.45,
    `Planter low wall visible height (${(planterWall.topY - planterWall.groundY).toFixed(2)}m) must be >= 0.45m`,
  );

  // Verify every primary & skyline building sits flush at groundY = 0.00m with valid Walkabout heights
  for (const bld of COURSE_MASTER_PLAN.perimeterBuildings) {
    assert.equal(bld.groundY, 0, `Primary building ${bld.id} must rest at y=0.00m`);
    assert.equal(bld.aabb.min[1], 0, `Primary building ${bld.id} AABB min[1] must be 0`);
    assert.ok(
      bld.height >= 10 && bld.height <= 16,
      `Primary 3-4 story building ${bld.id} height ${bld.height}m must be in [10m, 16m]`,
    );
  }

  for (const sky of COURSE_MASTER_PLAN.skylineBackdrops) {
    assert.equal(sky.groundY, 0, `Skyline building ${sky.id} must rest at y=0.00m`);
    assert.ok(
      sky.height >= 18 && sky.height <= 28,
      `Skyline building ${sky.id} height ${sky.height}m must seal high angles in [18m, 28m]`,
    );
  }

  // Verify storm-drain grates sit flush in the -0.02m gutter channel
  for (const grate of COURSE_MASTER_PLAN.stormGrates) {
    assert.ok(
      Math.abs(grate.position[1] - ELEVATIONS.GUTTER_CHANNEL_Y) < 1e-6,
      `Storm grate ${grate.id} must sit at channelY=-0.02m`,
    );
  }
});

// ============================================================================
// 2. ZERO SOLID AABB OVERLAPS & EXPLICIT DIEGETIC PLACEMENT INVARIANTS
// ============================================================================

test('2. Collision & Diegetic Zoning Audit: 0 solid/skyline AABB overlaps + flush scaffolding, hydrant-grate 0.5m, van loading zone, hotdog step clearance', () => {
  const props = COURSE_MASTER_PLAN.props;

  // 2a. Pairwise solid collider non-overlap across all props
  for (let i = 0; i < props.length; i++) {
    for (let j = i + 1; j < props.length; j++) {
      const a = props[i];
      const b = props[j];
      for (const boxA of a.solidColliders) {
        for (const boxB of b.solidColliders) {
          assert.equal(
            aabbsOverlap3D(boxA, boxB, 1e-4),
            false,
            `Unintended 3D solid AABB overlap between prop "${a.id}" and prop "${b.id}"`,
          );
        }
      }
    }
  }

  // 2b. Zero solid penetration between props and perimeter buildings, architectural walls, or stone curbs
  for (const prop of props) {
    for (const box of prop.solidColliders) {
      for (const bld of COURSE_MASTER_PLAN.perimeterBuildings) {
        assert.equal(
          aabbsOverlap3D(box, bld.aabb, 1e-4),
          false,
          `Prop "${prop.id}" penetrates perimeter building "${bld.id}"`,
        );
      }
      for (const wall of COURSE_MASTER_PLAN.architecturalWalls) {
        assert.equal(
          aabbsOverlap3D(box, wall.aabb, 1e-4),
          false,
          `Prop "${prop.id}" penetrates architectural wall "${wall.id}"`,
        );
      }
      for (const curb of COURSE_MASTER_PLAN.curbs) {
        assert.equal(
          aabbsOverlap3D(box, curb.aabb, 1e-4),
          false,
          `Prop "${prop.id}" penetrates stone curb "${curb.id}"`,
        );
      }
    }
  }

  // 2c. Pairwise 3D AABB non-overlap across ALL primary perimeter buildings AND skyline backdrops (R5)
  const allBuildings = [
    ...COURSE_MASTER_PLAN.perimeterBuildings,
    ...COURSE_MASTER_PLAN.skylineBackdrops,
  ];
  for (let i = 0; i < allBuildings.length; i++) {
    for (let j = i + 1; j < allBuildings.length; j++) {
      assert.equal(
        aabbsOverlap3D(allBuildings[i].aabb, allBuildings[j].aabb, 1e-4),
        false,
        `Buildings "${allBuildings[i].id}" and "${allBuildings[j].id}" interpenetrate instead of meeting flush`,
      );
    }
  }

  // Pairwise non-overlap across architectural retaining/planter walls
  const walls = COURSE_MASTER_PLAN.architecturalWalls;
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      assert.equal(
        aabbsOverlap3D(walls[i].aabb, walls[j].aabb, 1e-4),
        false,
        `Architectural walls "${walls[i].id}" and "${walls[j].id}" overlap`,
      );
    }
  }

  // Pairwise 3D AABB non-overlap across ALL stone curbs (flush corner & ramp joints, 0 overlap)
  const curbs = COURSE_MASTER_PLAN.curbs;
  for (let i = 0; i < curbs.length; i++) {
    for (let j = i + 1; j < curbs.length; j++) {
      assert.equal(
        aabbsOverlap3D(curbs[i].aabb, curbs[j].aabb, 1e-4),
        false,
        `Stone curbs "${curbs[i].id}" and "${curbs[j].id}" interpenetrate instead of meeting flush`,
      );
    }
  }

  // North back-alley zero-gap seam: NW corner & North-1 buildings extend flush to z = -38.5 skyline face
  const nwSkyline = COURSE_MASTER_PLAN.skylineBackdrops.find(
    (b) => b.id === 'skyline-north-west-tower',
  )!;
  for (const northPrimaryId of ['bld-west-5-nw-corner', 'bld-north-1']) {
    const northBld = COURSE_MASTER_PLAN.perimeterBuildings.find(
      (b) => b.id === northPrimaryId,
    )!;
    assert.equal(
      northBld.boundsXZ.minZ,
      nwSkyline.boundsXZ.maxZ,
      `Primary building "${northPrimaryId}" minZ (${northBld.boundsXZ.minZ}) must meet "${nwSkyline.id}" maxZ (${nwSkyline.boundsXZ.maxZ}) with 0.00m seam`,
    );
  }

  // Courtyard west retaining step wall meets ramp-courtyard-main south edge at z = -18.0 with 0.00m gap
  const westStepWall = walls.find((w) => w.id === 'wall-courtyard-west-step')!;
  const mainCourtyardRamp = COURSE_MASTER_PLAN.ramps.find(
    (r) => r.id === 'ramp-courtyard-main',
  )!;
  assert.ok(
    Math.abs(westStepWall.aabb.min[2] - mainCourtyardRamp.boundsXZ.maxZ) < 1e-6,
    `wall-courtyard-west-step minZ (${westStepWall.aabb.min[2]}) must meet ramp-courtyard-main maxZ (${mainCourtyardRamp.boundsXZ.maxZ}) flush`,
  );

  // 2d. Explicit Assertion: Scaffolding Shed touches its host brick brownstone facade FLUSH (gap <= 0.02m)
  const blds = COURSE_MASTER_PLAN.perimeterBuildings;
  const scaffolding = props.find((p) => p.id === 'scaffolding-shed-west');
  assert.ok(scaffolding && scaffolding.scaffoldingMeta, 'Missing scaffolding-shed-west');
  const hostBld = blds.find(
    (b) => b.id === scaffolding.scaffoldingMeta!.hostBuildingId,
  );
  assert.ok(hostBld, 'Missing scaffolding host brick building');
  const wallGap = computeHorizontalAABBGap(scaffolding.aabb, hostBld.aabb);
  assert.ok(
    wallGap <= 0.02,
    `Scaffolding Shed must bolt FLUSH to host brick facade (gap=${wallGap}m > 0.02m)`,
  );
  assert.equal(scaffolding.groundY, 0.15);
  assert.ok(
    scaffolding.scaffoldingMeta.clearHeightMeters >= 2.3,
    `Scaffolding clear height ${scaffolding.scaffoldingMeta.clearHeightMeters}m must be >= 2.30m`,
  );

  // 2e. Explicit Assertion: Fire Hydrant is ~0.5m from its storm-drain grate
  const hydrant = props.find((p) => p.id === 'hydrant-corner-se');
  assert.ok(hydrant && hydrant.hydrantBoostMeta, 'Missing hydrant-corner-se');
  const cornerGrate = COURSE_MASTER_PLAN.stormGrates.find(
    (g) => g.id === hydrant.hydrantBoostMeta!.nearestGrateId,
  );
  assert.ok(cornerGrate, 'Missing corner storm-drain grate');
  const hydrantGrateDist = distance2D(hydrant.position, cornerGrate.position);
  assert.ok(
    Math.abs(hydrantGrateDist - 0.5) <= 0.05,
    `Hydrant must sit ~0.50m from storm-drain grate (actual=${hydrantGrateDist.toFixed(3)}m)`,
  );

  // 2f. Explicit Assertion: Delivery Van + hazard cones sit inside painted curbside loading zone (~30-35m from tee)
  const van = props.find((p) => p.id === 'delivery-van-east');
  assert.ok(van && van.vanRampMeta, 'Missing delivery-van-east');
  assert.equal(van.groundY, 0.0);
  assert.equal(
    aabbContainedInBoundsXZ(van.aabb, VAN_LOADING_ZONE.boundsXZ),
    true,
    'Delivery Box Van + Rear Ramp must sit completely inside painted VAN_LOADING_ZONE stripes',
  );
  const vanDistFromTee = TEE_POSITION[2] - van.position[2];
  assert.ok(
    vanDistFromTee >= 29 && vanDistFromTee <= 36,
    `Delivery Van center should be ~30-35m from Tee (actual=${vanDistFromTee.toFixed(2)}m)`,
  );
  for (const coneId of ['cone-van-south', 'cone-van-north']) {
    const cone = props.find((p) => p.id === coneId);
    assert.ok(cone, `Missing ${coneId}`);
    assert.equal(
      aabbContainedInBoundsXZ(cone.aabb, VAN_LOADING_ZONE.boundsXZ),
      true,
      `${coneId} must sit inside VAN_LOADING_ZONE`,
    );
  }

  // R3: Hotdog Cart carriage sits >= 0.25m clear of the x = 19.0m courtyard terrace step, and full [1.92, 2.58, 2.04] awning AABB clears step & wall
  const hotdogCart = props.find((p) => p.id === 'hotdog-cart-corner')!;
  assert.deepEqual(
    hotdogCart.localSize,
    [1.92, 2.58, 2.04],
    'Hotdog cart localSize [widthX, heightY, depthZ] must enclose 1.88m purlins/awning, 2.56m ridge, and 2.04m depth',
  );
  const carriageStepClearance = 19.0 - hotdogCart.solidColliders[0].max[0];
  assert.ok(
    carriageStepClearance >= 0.25,
    `Hotdog cart ground carriage maxX (${hotdogCart.solidColliders[0].max[0].toFixed(3)}) must keep >= 0.25m clearance from x=19.0m terrace step`,
  );
  assert.ok(
    19.0 - hotdogCart.aabb.max[0] >= 0.15,
    `Hotdog cart full rotated awning AABB maxX (${hotdogCart.aabb.max[0].toFixed(3)}) must clear x=19.0m terrace step & wall-courtyard-west-step`,
  );

  // 2g. Explicit Assertion: Cup geometry (r=0.42m, depth=0.42m) cleanly recesses holed r=0.18m ball clear of center pin, and >= 1.5m apron is obstacle-free
  assert.equal(CUP_RADIUS, 0.42);
  assert.equal(CUP_DEPTH, 0.42);
  assert.equal(HOLE_1_CUP.cupRadius, 0.42);
  assert.equal(HOLE_1_CUP.cupDepth, 0.42);
  const holedBallOffset = 0.205;
  const maxPinRadius = 0.02;
  assert.ok(
    holedBallOffset > BALL_RADIUS + maxPinRadius + 0.004,
    'Holed ball at 0.205m radial offset must clear central flagpole without impalement',
  );
  assert.ok(
    holedBallOffset + BALL_RADIUS <= HOLE_1_CUP.cupRadius - 0.025,
    'Holed ball at 0.205m radial offset must fit inside 0.42m cup liner without wall clipping',
  );
  assert.ok(
    HOLE_1_CUP.cupDepth >= BALL_RADIUS * 2 + 0.04,
    'Cup depth (0.42m) must recess full 0.36m ball diameter cleanly below green rim',
  );
  assert.equal(HOLE_1_CUP.elevationY, 0.6);
  assert.ok(HOLE_1_CUP.apronRadius >= 1.5);
  assert.equal(
    getMasterPlanSurfaceTagAt(HOLE_1_CUP.position[0], HOLE_1_CUP.position[2]),
    'putting_green_turf',
  );
  for (const prop of props) {
    if (!prop.blocksGroundRoll) continue;
    for (const box of prop.solidColliders) {
      const closestX = Math.max(box.min[0], Math.min(HOLE_1_CUP.position[0], box.max[0]));
      const closestZ = Math.max(box.min[2], Math.min(HOLE_1_CUP.position[2], box.max[2]));
      const distToCup = Math.hypot(
        closestX - HOLE_1_CUP.position[0],
        closestZ - HOLE_1_CUP.position[2],
      );
      assert.ok(
        distToCup >= 1.5,
        `Prop ${prop.id} encroaches within 1.5m of the Cup (${distToCup.toFixed(2)}m)`,
      );
    }
  }

  // 2h. Explicit Assertion: Every vintage streetlamp lantern arm extends inward over its street/courtyard corridor
  const streetLamps = props.filter((p) => p.type === 'street_lamp');
  assert.equal(streetLamps.length, 5, 'Expected all 5 vintage coaxial streetlamps');
  for (const lampProp of streetLamps) {
    const armDirXZ: Vec2Tuple = [
      Math.sin(lampProp.rotationY),
      Math.cos(lampProp.rotationY),
    ];
    // 5th Ave lamps (x = ±4.6) aim toward x = 0; Mercer & Courtyard north lamps (z < -25) aim south toward z = -21.6
    const targetCorridorXZ: Vec2Tuple =
      Math.abs(lampProp.position[0]) < 6.0 && lampProp.position[2] > -22.0
        ? [0, lampProp.position[2]]
        : [lampProp.position[0], -21.6];
    const toCorridorLen = distance2D(lampProp.position, targetCorridorXZ);
    const toCorridorDirXZ: Vec2Tuple = [
      (targetCorridorXZ[0] - lampProp.position[0]) / toCorridorLen,
      (targetCorridorXZ[1] - lampProp.position[2]) / toCorridorLen,
    ];
    const alignmentDot =
      armDirXZ[0] * toCorridorDirXZ[0] + armDirXZ[1] * toCorridorDirXZ[1];
    assert.ok(
      alignmentDot > 0.95,
      `Streetlamp "${lampProp.id}" lantern arm must point inward toward corridor (dot=${alignmentDot.toFixed(3)})`,
    );
  }

  // 2i. Pass 2 Micro-Polish: Tee stand-bag offset (-1.42m West) clears tee pad & curbs, and two-tier fountain clears off-axis green sightlines
  assert.ok(
    TEE_STAND_BAG_OFFSET[0] <= -1.4,
    `TEE_STAND_BAG_OFFSET.x (${TEE_STAND_BAG_OFFSET[0]}) must sit >= 1.40m West of tee ball`,
  );
  assert.ok(
    TEE_POSITION[0] + TEE_SET_LOCAL_BOUNDS.min[0] >= -3.55 + 1.5,
    'Tee stand bag must stay >= 1.5m inside 5th Ave asphalt roadway away from West curb',
  );
  assert.ok(
    TEE_POSITION[2] + TEE_SET_LOCAL_BOUNDS.max[2] <= 28.2 - 0.12,
    'Tee mat & stand bag must stay >= 0.12m clear of South tee backstop curb',
  );

  const fountainProp = props.find((p) => p.id === 'fountain-courtyard-front')!;
  assert.equal(
    fountainProp.solidColliders.length,
    2,
    'Fountain must define a 2-tier CAD envelope (low 2.50m x 0.34m basin + narrow 1.12m central spire)',
  );
  assert.ok(
    Math.abs(fountainProp.solidColliders[0].max[1] - (ELEVATIONS.COURTYARD_GREEN_Y + 0.34)) < 1e-6,
    'Fountain Tier 1 basin collider top must match y = +0.94m',
  );
  const offAxisPuttCam: Vec3Tuple = [18.9, ELEVATIONS.COURTYARD_GREEN_Y + 2.08, -20.8];
  const offAxisPuttBall: Vec3Tuple = [23.6, ELEVATIONS.COURTYARD_GREEN_Y + BALL_RADIUS, -20.8];
  const puttRayDist = Math.hypot(
    offAxisPuttBall[0] - offAxisPuttCam[0],
    offAxisPuttBall[1] - offAxisPuttCam[1],
    offAxisPuttBall[2] - offAxisPuttCam[2],
  );
  const puttRayDir: Vec3Tuple = [
    (offAxisPuttBall[0] - offAxisPuttCam[0]) / puttRayDist,
    (offAxisPuttBall[1] - offAxisPuttCam[1]) / puttRayDist,
    (offAxisPuttBall[2] - offAxisPuttCam[2]) / puttRayDist,
  ];
  for (const tierBox of fountainProp.solidColliders) {
    const hit = intersectRayAABB3D(offAxisPuttCam, puttRayDir, tierBox, puttRayDist);
    assert.equal(
      hit.hit,
      false,
      'Putt sightline looking cleanly over outer fountain basin (z=-20.8) must not hit 2-tier fountain envelope',
    );
  }
});

// ============================================================================
// 3. CONTINUOUS ROAD, SE CORNER ARC PROFILE, ZONE COVERAGE & +0.60M RAMP
// ============================================================================

test('3. Geometric Connectivity Audit: 72m centerline, 0 ground holes, SE corner arc profile, cheek walls, and flush +0.60m Courtyard Ramp', () => {
  // 3a. Verify 72.0m Par 4 centerline continuity & total length
  const segs = COURSE_MASTER_PLAN.centerlineSegments;
  assert.equal(COURSE_MASTER_PLAN.par, 4);
  assert.ok(
    Math.abs(COURSE_MASTER_PLAN.computedCenterlineMeters - 72.0) <= 0.25,
    `Hole 1 centerline must be ~72.0m (actual=${COURSE_MASTER_PLAN.computedCenterlineMeters}m)`,
  );
  assert.ok(distance2D(segs[0].startXZ, [TEE_POSITION[0], TEE_POSITION[2]]) < 1e-4);
  for (let i = 0; i < segs.length - 1; i++) {
    const seamGap = distance2D(segs[i].endXZ, segs[i + 1].startXZ);
    assert.ok(
      seamGap < 1e-3,
      `Centerline discontinuity between ${segs[i].id} and ${segs[i + 1].id}: ${seamGap}m`,
    );
  }
  assert.ok(
    distance2D(segs[segs.length - 1].endXZ, [
      HOLE_1_CUP.position[0],
      HOLE_1_CUP.position[2],
    ]) < 1e-4,
  );

  // 3b. Verify East 5th Straight Gutter -> 90° Curved Corner Gutter -> Mercer South Gutter -> Courtyard Ramp seamless chain
  const eastGutter = COURSE_MASTER_PLAN.gutters.find(
    (g) => g.id === 'gutter-east-5th-straight',
  )!;
  const cornerGutter = COURSE_MASTER_PLAN.gutters.find(
    (g) => g.id === 'gutter-corner-se-90',
  )!;
  const mercerSouthGutter = COURSE_MASTER_PLAN.gutters.find(
    (g) => g.id === 'gutter-mercer-south-straight',
  )!;

  for (const g of COURSE_MASTER_PLAN.gutters) {
    assert.equal(g.channelY, -0.02, `Gutter ${g.id} must sit at y=-0.02m`);
    assert.ok(Math.abs(g.width - 0.45) < 1e-4, `Gutter ${g.id} width must be 0.45m`);
  }

  const arcStartXZ: [number, number] = [
    cornerGutter.arcPivot![0] +
      cornerGutter.arcRadius! * Math.cos(cornerGutter.startAngleRad!),
    cornerGutter.arcPivot![2] +
      cornerGutter.arcRadius! * Math.sin(cornerGutter.startAngleRad!),
  ];
  const arcEndXZ: [number, number] = [
    cornerGutter.arcPivot![0] +
      cornerGutter.arcRadius! * Math.cos(cornerGutter.endAngleRad!),
    cornerGutter.arcPivot![2] +
      cornerGutter.arcRadius! * Math.sin(cornerGutter.endAngleRad!),
  ];

  assert.ok(
    distance2D([eastGutter.end![0], eastGutter.end![2]], arcStartXZ) < 1e-4,
    'East 5th straight gutter must connect seamlessly (0.00m gap) to 90° corner gutter arc start',
  );
  assert.ok(
    distance2D(arcEndXZ, [
      mercerSouthGutter.start![0],
      mercerSouthGutter.start![2],
    ]) < 1e-4,
    '90° corner gutter arc end must connect seamlessly (0.00m gap) to Mercer South straight gutter',
  );

  // 3c. R2(b,c): Verify curved 90° SE corner curb & 225° radial profile (0 phantom 0.15m lip!)
  for (const curb of COURSE_MASTER_PLAN.curbs) {
    assert.equal(curb.height, 0.15, `Curb ${curb.id} height must be 0.15m (15cm)`);
    assert.equal(curb.topY, 0.15, `Curb ${curb.id} topY must match +0.15m sidewalk`);
  }
  const bevelCurb = COURSE_MASTER_PLAN.curbs.find(
    (c) => c.id === 'curb-corner-se-bevel-45',
  );
  assert.ok(
    bevelCurb &&
      bevelCurb.kind === 'curved_90' &&
      bevelCurb.bevelAngleDeg === 45 &&
      bevelCurb.arcInnerRadius === 1.95 &&
      bevelCurb.arcOuterRadius === 2.2,
    'SE corner curb must be a true curved_90 arc at r = 1.95..2.20m flush with the gutter inner edge',
  );

  // Sweep 225° diagonal out from pivot (6.2, -15.8): apron/curb (0.15) -> gutter (-0.02) -> road (0.00)
  const diagCos = Math.SQRT1_2;
  for (let r = 0.25; r <= 3.5; r = Number((r + 0.05).toFixed(3))) {
    const px = 6.2 - r * diagCos;
    const pz = -15.8 - r * diagCos;
    const y = getMasterPlanGroundElevationAt(px, pz);
    const tag = getMasterPlanSurfaceTagAt(px, pz);
    assert.equal(
      isWalkablePointExplicitlyCovered(px, pz),
      true,
      `SE corner 225° profile uncovered at r=${r}m (${px.toFixed(2)}, ${pz.toFixed(2)})`,
    );
    if (r <= 2.18) {
      assert.equal(y, 0.15, `Expected +0.15m apron/curb at r=${r}m, got ${y}`);
      assert.equal(tag, 'sidewalk_paver');
    } else if (r >= 2.22 && r <= 2.63) {
      assert.equal(y, -0.02, `Expected -0.02m curved gutter at r=${r}m, got ${y}`);
      assert.equal(tag, 'storm_gutter');
    } else if (r >= 2.67) {
      assert.equal(
        y,
        0.0,
        `Phantom sidewalk lip detected outside curved gutter at r=${r}m: y=${y} (expected 0.00m road)`,
      );
      assert.equal(tag, 'road_asphalt');
    }
  }

  // 3d. R2(a) & R5: Dense Walkable Corridor Explicit Zone Coverage Audit (0 fallback ground holes!)
  const isInsideAnyBuilding = (x: number, z: number) =>
    COURSE_MASTER_PLAN.perimeterBuildings.some(
      (b) =>
        x > b.boundsXZ.minX + 1e-4 &&
        x < b.boundsXZ.maxX - 1e-4 &&
        z > b.boundsXZ.minZ + 1e-4 &&
        z < b.boundsXZ.maxZ - 1e-4,
    );

  const corridorBoxes = [
    // Fine 0.05m sweep over the former 2.56 m^2 SE corner intersection region!
    { minX: 3.55, maxX: 6.2, minZ: -18.45, maxZ: -15.8, step: 0.05 },
    // Full 5th Ave corridor & expanded South Subway Plaza (z: -29.2 .. +38.1)
    { minX: -7.2, maxX: 7.2, minZ: -29.2, maxZ: 38.1, step: 0.25 },
    // Full Mercer St dogleg & SE Vendor Apron
    { minX: 4.0, maxX: 19.0, minZ: -29.2, maxZ: -14.8, step: 0.25 },
    // Full Elevated Courtyard Green & Terrace
    { minX: 19.0, maxX: 33.45, minZ: -30.45, maxZ: -13.55, step: 0.25 },
  ];

  const uncoveredHoles: string[] = [];
  for (const box of corridorBoxes) {
    for (let x = box.minX; x <= box.maxX + 1e-6; x = Number((x + box.step).toFixed(3))) {
      for (let z = box.minZ; z <= box.maxZ + 1e-6; z = Number((z + box.step).toFixed(3))) {
        if (isInsideAnyBuilding(x, z)) continue;
        if (!isWalkablePointExplicitlyCovered(x, z)) {
          uncoveredHoles.push(`(${x}, ${z})`);
        }
      }
    }
  }
  assert.equal(
    uncoveredHoles.length,
    0,
    `Detected ${uncoveredHoles.length} uncovered corridor ground holes (first 5: ${uncoveredHoles.slice(0, 5).join(', ')})`,
  );

  // 3e. R3: Verify retaining cheek walls seal ramp-main south/north edges and x=19.0 courtyard terrace step
  for (const requiredWallId of [
    'wall-ramp-south-cheek',
    'wall-ramp-north-cheek',
    'wall-courtyard-west-step',
  ]) {
    assert.ok(
      COURSE_MASTER_PLAN.architecturalWalls.some((w) => w.id === requiredWallId),
      `Missing retaining/cheek wall ${requiredWallId} required to seal slab steps`,
    );
  }

  // 3f. Verify flush Stone Courtyard Entrance Ramp (0.00m road -> +0.60m Courtyard Green with 0 step-lip!)
  const mainRamp = COURSE_MASTER_PLAN.ramps.find(
    (r) => r.id === 'ramp-courtyard-main',
  )!;
  assert.ok(mainRamp, 'Missing main Courtyard Stone Entrance Ramp');
  assert.equal(mainRamp.bottomY, 0.0);
  assert.equal(mainRamp.topY, 0.6);

  const yBeforeRamp = getMasterPlanGroundElevationAt(14.48, -21.6);
  const yRampStart = getMasterPlanGroundElevationAt(14.5, -21.6);
  const yRampMid = getMasterPlanGroundElevationAt(16.75, -21.6);
  const yRampEnd = getMasterPlanGroundElevationAt(19.0, -21.6);
  const yCourtyard = getMasterPlanGroundElevationAt(19.02, -21.6);

  assert.ok(Math.abs(yBeforeRamp - 0.0) < 1e-4);
  assert.ok(Math.abs(yRampStart - 0.0) < 1e-4, 'Zero step-lip at bottom of Courtyard Ramp');
  assert.ok(Math.abs(yRampMid - 0.3) < 1e-3, 'Linear smooth rise at midpoint of Courtyard Ramp');
  assert.ok(Math.abs(yRampEnd - 0.6) < 1e-4, 'Zero step-lip at top of Courtyard Ramp');
  assert.ok(Math.abs(yCourtyard - 0.6) < 1e-4);

  assert.equal(mercerSouthGutter.end![0], mainRamp.boundsXZ.minX);
  assert.ok(
    mercerSouthGutter.end![2] >= mainRamp.boundsXZ.minZ &&
      mercerSouthGutter.end![2] <= mainRamp.boundsXZ.maxZ,
    'Mercer South Storm Gutter must feed directly into the flush Stone Courtyard Entrance Ramp',
  );
});

// ============================================================================
// 4. 360-DEGREE MULTI-PITCH & SUB-DEGREE PERIMETER RAYCAST CLOSURE
// ============================================================================

test('4. 360-Degree Perimeter Raycast Closure: 0 escaping rays across 0.5° sub-degree & [-12°, -6°, 0°, +5°, +9°, +14°] orbit pitches', () => {
  assert.equal(
    AUDIT_CAMERA_STATIONS.length,
    5,
    'Expected all 5 Gate-3 player audit stations',
  );
  assert.ok(OUTER_CITY_GROUND_SKIRT.boundsXZ.minX <= -150);

  for (const station of AUDIT_CAMERA_STATIONS) {
    // Standard 1° horizontal check
    const horizResult = auditStation360PerimeterClosure(
      station.id,
      station.position,
      COURSE_MASTER_PLAN,
      110,
    );
    assert.equal(
      horizResult.escapedAnglesDeg.length,
      0,
      `Station "${station.id}" leaked horizontal rays at angles: ${horizResult.escapedAnglesDeg.join(', ')}`,
    );
    assert.equal(horizResult.hitCount, 360);

    // R5: High-density 0.5° azimuth x [-12°, -6°, 0°, +5°, +9°, +14°] multi-pitch orbit audit (4,320 rays/station)
    const multiPitchResult = auditStation360PerimeterClosure(
      station.id,
      station.position,
      COURSE_MASTER_PLAN,
      145,
      { azimuthStepDeg: 0.5, pitchAnglesDeg: [-12, -6, 0, 5, 9, 14] },
    );
    assert.equal(
      multiPitchResult.escapedRays.length,
      0,
      `Station "${station.id}" leaked ${multiPitchResult.escapedRays.length} multi-pitch rays (first: ${JSON.stringify(multiPitchResult.escapedRays[0])})`,
    );
    assert.equal(multiPitchResult.hitCount, 4320);
  }

  // Also verify Street Scout elevated canyon peek stays inside corridor and has 100% multi-pitch closure!
  assert.ok(
    STREET_SCOUT_CAMERA_PRESET.position[1] <= STREET_SCOUT_CAMERA_PRESET.maxAllowedHeightY,
    'Street Scout camera must stay below building cornices (no high isometric slab view)',
  );
  const scoutMultiPitch = auditStation360PerimeterClosure(
    STREET_SCOUT_CAMERA_PRESET.id,
    STREET_SCOUT_CAMERA_PRESET.position,
    COURSE_MASTER_PLAN,
    145,
    { azimuthStepDeg: 0.5, pitchAnglesDeg: [-20, -12, -6, 0, 5, 9] },
  );
  assert.equal(
    scoutMultiPitch.escapedRays.length,
    0,
    `Street Scout camera leaked multi-pitch rays: ${JSON.stringify(scoutMultiPitch.escapedRays.slice(0, 5))}`,
  );
  assert.equal(scoutMultiPitch.hitCount, 4320);

  // T9: Default Tee Camera (~z = 32.72) must sit strictly North of subway-portal-south (no spawn inside portal!)
  const subwayPortal = COURSE_MASTER_PLAN.props.find(
    (p) => p.id === 'subway-portal-south',
  )!;
  const defaultTeeCamZ = TEE_POSITION[2] + 5.2; // 32.72
  assert.ok(
    subwayPortal.aabb.min[2] >= defaultTeeCamZ + 1.25,
    `subway-portal-south minZ (${subwayPortal.aabb.min[2]}) must sit >= 1.25m south of default tee camera z=${defaultTeeCamZ}`,
  );

  // T10: STREET_SCOUT_CAMERA_PRESET must have a 100% unobstructed 3D sightline to HOLE_1_CUP & lookAt!
  const scoutOrigin = STREET_SCOUT_CAMERA_PRESET.position;
  for (const [label, target] of [
    ['HOLE_1_CUP', HOLE_1_CUP.position],
    ['lookAt', STREET_SCOUT_CAMERA_PRESET.lookAt],
  ] as const) {
    const dx = target[0] - scoutOrigin[0];
    const dy = target[1] - scoutOrigin[1];
    const dz = target[2] - scoutOrigin[2];
    const dist = Math.hypot(dx, dy, dz);
    const dir: Vec3Tuple = [dx / dist, dy / dist, dz / dist];

    for (const bld of [
      ...COURSE_MASTER_PLAN.perimeterBuildings,
      ...COURSE_MASTER_PLAN.skylineBackdrops,
    ]) {
      const hit = intersectRayAABB3D(scoutOrigin, dir, bld.aabb, dist - 0.05);
      assert.equal(
        hit.hit,
        false,
        `Street Scout sightline to ${label} is blocked by building "${bld.id}" at t=${hit.tMin.toFixed(2)}m`,
      );
    }
    for (const wall of COURSE_MASTER_PLAN.architecturalWalls) {
      const hit = intersectRayAABB3D(scoutOrigin, dir, wall.aabb, dist - 0.05);
      assert.equal(
        hit.hit,
        false,
        `Street Scout sightline to ${label} is blocked by wall "${wall.id}" at t=${hit.tMin.toFixed(2)}m`,
      );
    }
    for (const prop of COURSE_MASTER_PLAN.props) {
      for (const box of prop.solidColliders) {
        const hit = intersectRayAABB3D(scoutOrigin, dir, box, dist - 0.05);
        assert.equal(
          hit.hit,
          false,
          `Street Scout sightline to ${label} is blocked by prop "${prop.id}" at t=${hit.tMin.toFixed(2)}m`,
        );
      }
    }
  }

  // T12: courtyard_green_out station must be offset from flagpole axis so flagpole sits off-center (never bisecting frame!)
  const greenOutStation = AUDIT_CAMERA_STATIONS.find(
    (s) => s.id === 'courtyard_green_out',
  )!;
  assert.ok(
    Math.abs(greenOutStation.position[2] - HOLE_1_CUP.position[2]) >= 1.5,
    `courtyard_green_out z (${greenOutStation.position[2]}) must be offset >= 1.5m from cup z (${HOLE_1_CUP.position[2]})`,
  );
  const gDx = greenOutStation.lookAt[0] - greenOutStation.position[0];
  const gDz = greenOutStation.lookAt[2] - greenOutStation.position[2];
  const gLen = Math.hypot(gDx, gDz);
  const cupRelX = HOLE_1_CUP.position[0] - greenOutStation.position[0];
  const cupRelZ = HOLE_1_CUP.position[2] - greenOutStation.position[2];
  const perpDistToFlagpole = Math.abs(cupRelX * (-gDz / gLen) + cupRelZ * (gDx / gLen));
  assert.ok(
    perpDistToFlagpole >= 0.75,
    `courtyard_green_out sightline passes too close to flagpole (${perpDistToFlagpole.toFixed(2)}m < 0.75m)`,
  );
});

// ============================================================================
// 5. COAXIAL HELPER INVARIANTS & MULTI-ROUTE STRATEGIC SHOT GEOMETRY
// ============================================================================

test('5a. Coaxial Multi-Part Builder Invariants: Wheels, Umbrellas, 28° Awnings, Hydrants, Streetlamps & Arches', () => {
  // 1. Coaxial Wheel Builder (both X and Z axles)
  for (const axis of ['x', 'z'] as const) {
    const wheel = buildCoaxialWheelSpec({
      outerRadius: 0.34,
      tireTubeRadius: 0.068,
      spokeCount: 8,
      axleAxis: axis,
    });
    assert.equal(wheel.groundContactY, 0, 'Wheel tire bottom must sit flush at y=0');
    assert.deepEqual(wheel.tire.normalAxis, wheel.axleDirection);
    assert.deepEqual(wheel.rim.symmetryAxis, wheel.axleDirection);
    assert.deepEqual(wheel.hub.symmetryAxis, wheel.axleDirection);
    assert.deepEqual(wheel.hubcap.symmetryAxis, wheel.axleDirection);
    assert.deepEqual(wheel.axle.symmetryAxis, wheel.axleDirection);
    const hubcapAxialCoord =
      axis === 'x'
        ? Math.abs(wheel.hubcap.outboardPosition[0])
        : Math.abs(wheel.hubcap.outboardPosition[2]);
    const hubcapInnerFace = hubcapAxialCoord - wheel.hubcap.thickness * 0.5;
    assert.ok(
      hubcapInnerFace < wheel.hub.width * 0.5 - 0.002,
      'Hubcap inner face must seat >= 2mm inside hub cylinder endcap (zero coplanar z-fighting)',
    );
    for (const spoke of wheel.spokes) {
      assert.ok(
        Math.abs(dotVec3(spoke.directionAxis, wheel.axleDirection)) < 1e-9,
        `Spoke ${spoke.index} is not strictly inside the wheel plane (perpendicular wheel bug!)`,
      );
    }
  }

  // 2. Coaxial Umbrella Builder
  const umbrella = buildCoaxialUmbrellaSpec({ ribCount: 8, restitution: 0.55 });
  assert.equal(umbrella.groundContactY, 0);
  assert.equal(umbrella.baseStand.bottomY, 0);
  assert.equal(umbrella.pole.bottomY, 0);
  assert.equal(umbrella.ribs.length, 8);
  assert.equal(umbrella.trampolineCollider.restitution, 0.55);

  // 3. Pitched 28-Degree Striped Awning Builder
  const awning = buildPitchedAwningSpec({
    pitchDeg: 28,
    restitution: 0.28,
    stripeCount: 7,
  });
  assert.equal(awning.pitchDeg, 28);
  assert.equal(awning.restitution, 0.28);
  assert.equal(awning.stripePanels.length, 7);
  assert.ok(
    Math.abs(awning.localNormal[1] - Math.cos(degToRad(28))) < 1e-9 &&
      Math.abs(awning.localNormal[2] - Math.sin(degToRad(28))) < 1e-9,
    '28-degree awning local normal must equal [0, cos(28°), sin(28°)]',
  );

  // 4. Coaxial Fire Hydrant, Vintage Streetlamp & Arched Window/Door Frame Builders
  const hydrant = buildCoaxialHydrantSpec();
  assert.equal(hydrant.groundContactY, 0);
  assert.equal(hydrant.pentagonNut.sides, 5);
  for (const nozzle of hydrant.sideHoseCaps) {
    assert.ok(
      Math.abs(dotVec3(nozzle.outwardAxis, hydrant.symmetryAxis)) < 1e-9,
      `Hydrant nozzle ${nozzle.side} must project orthogonally to +Y barrel`,
    );
  }

  const lamp = buildCoaxialStreetlampSpec();
  assert.equal(lamp.groundContactY, 0);
  assert.equal(lamp.basePlinth.bottomY, 0);
  assert.equal(lamp.lanternAssembly.globePosition[2], lamp.lanternAssembly.capPosition[2]);

  const arch = buildArchedFrameSpec({ archSegments: 9, includeShutters: true });
  assert.equal(arch.groundContactY, 0);
  assert.equal(arch.sill.bottomY, 0);
  assert.equal(arch.archRingSegments.length, 9);
  assert.equal(arch.shutters.length, 2);
  const midRadius = (arch.archInnerRadius + arch.archOuterRadius) * 0.5;
  for (const seg of arch.archRingSegments) {
    const radialDist = Math.hypot(
      seg.position[0] - arch.archCenter[0],
      seg.position[1] - arch.archCenter[1],
    );
    assert.ok(
      Math.abs(radialDist - midRadius) < 1e-6,
      `Arch segment ${seg.index} must be coaxial around archCenter`,
    );
  }
  const frontZ = (p: Vec3Tuple, s: Vec3Tuple) => p[2] + s[2] * 0.5;
  const rightJambFrontZ = frontZ(arch.rightJamb.position, arch.rightJamb.size);
  const leftJambFrontZ = frontZ(arch.leftJamb.position, arch.leftJamb.size);
  const firstSegFrontZ = frontZ(
    arch.archRingSegments[0].position,
    arch.archRingSegments[0].size,
  );
  const lastSeg = arch.archRingSegments[arch.archRingSegments.length - 1];
  const lastSegFrontZ = frontZ(lastSeg.position, lastSeg.size);
  assert.ok(
    Math.abs(firstSegFrontZ - rightJambFrontZ) >= 0.004 &&
      Math.abs(lastSegFrontZ - leftJambFrontZ) >= 0.004,
    'Springline voussoirs and jambs must have rusticated Z-relief (>= 4mm front-plane separation, 0 z-fighting)',
  );
  for (let i = 0; i < arch.archRingSegments.length - 1; i++) {
    const zA = frontZ(
      arch.archRingSegments[i].position,
      arch.archRingSegments[i].size,
    );
    const zB = frontZ(
      arch.archRingSegments[i + 1].position,
      arch.archRingSegments[i + 1].size,
    );
    assert.ok(
      Math.abs(zA - zB) >= 0.004,
      `Adjacent arch voussoirs ${i} and ${i + 1} share coplanar front Z (${zA.toFixed(4)} vs ${zB.toFixed(4)})`,
    );
  }

  // Verify OBB2D SAT math
  const obbA = buildOBB2D([0, 0], [2, 4], 0.35);
  const obbB = buildOBB2D([5, 0], [2, 4], -0.2);
  assert.equal(obbsOverlap2D(obbA, obbB), false);
});

function simulateGreenRollout(
  landXZ: Vec2Tuple,
  landingVelXZ: Vec2Tuple,
  clubRollDamping: number,
): Vec2Tuple {
  const greenZone = COURSE_MASTER_PLAN.groundZones.find(
    (z) => z.id === 'zone-courtyard-putting-green',
  )!;
  const dt = 1 / 60;
  // Cushioned 50° Wedge awning-check spin attenuates initial horizontal turf skid upon touch-down
  let x = landXZ[0];
  let z = landXZ[1];
  let vx = landingVelXZ[0] * 0.45;
  let vz = landingVelXZ[1] * 0.45;
  const effectiveDamping = clubRollDamping + greenZone.rollDamping;

  for (let step = 0; step < 360; step++) {
    const speed = Math.hypot(vx, vz);
    if (speed < 0.08) break;
    x += vx * dt;
    z += vz * dt;
    const decay = Math.exp(-effectiveDamping * dt);
    vx *= decay;
    vz *= decay;
  }
  return [x, z];
}

test('5b. Strategic Shot Matrix Audit: 28° Hotdog Awning damped rollout <= 2m, Scaffolding tunnel, Open Van Ramp -> Roof Launch, Steam hop & Overhanging Tree', () => {
  // 1. Hotdog Cart 28° Striped Awning Bank Shot from A-Position Crosswalk + Real Damped Rollout Sim (R5)
  const cart = COURSE_MASTER_PLAN.props.find((p) => p.id === 'hotdog-cart-corner')!;
  const meta = cart.hotdogAwningMeta!;
  assert.equal(meta.pitchDeg, 28);
  assert.equal(meta.restitution, 0.28);

  const normalCheck = computePitchedAwningNormal(28, cart.rotationY);
  assert.ok(
    Math.hypot(
      normalCheck.worldNormal[0] - meta.worldNormal[0],
      normalCheck.worldNormal[1] - meta.worldNormal[1],
      normalCheck.worldNormal[2] - meta.worldNormal[2],
    ) < 1e-5,
  );

  // Simulate ballistic Wedge flight from A-Position Crosswalk to Awning Center, then 3D cushioned bounce (e=0.28)
  const aPos = A_POSITION_CROSSWALK.center;
  const awningHit = meta.awningCenter;
  const distToAwning = distance2D(aPos, awningHit);
  const tan50 = Math.tan(degToRad(50));
  const flightTimeToAwning = Math.sqrt(
    (BALL_RADIUS + distToAwning * tan50 - awningHit[1]) / (-0.5 * WORLD_GRAVITY_Y),
  );
  const vIn: Vec3Tuple = [
    (awningHit[0] - aPos[0]) / flightTimeToAwning,
    (distToAwning / flightTimeToAwning) * tan50 + WORLD_GRAVITY_Y * flightTimeToAwning,
    (awningHit[2] - aPos[2]) / flightTimeToAwning,
  ];
  const vOut = computeAwningBounceVelocity(vIn, meta.worldNormal, meta.restitution);
  assert.ok(vOut[1] > 0, 'Cushioned 28° awning bounce must loft softly upward');

  // Check clearance over the Wrought-Iron Planter Low Wall (grounded at +0.60m, topY = +1.12m)
  const planterWall = COURSE_MASTER_PLAN.architecturalWalls.find(
    (w) => w.id === 'wall-courtyard-wrought-iron-planter',
  )!;
  const tAtWall = (planterWall.center[2] - awningHit[2]) / vOut[2];
  const yAtWall =
    awningHit[1] + vOut[1] * tAtWall + 0.5 * WORLD_GRAVITY_Y * tAtWall * tAtWall;
  assert.ok(
    yAtWall > planterWall.topY + BALL_RADIUS + 0.25,
    `Awning bounce must sail cleanly over wrought-iron planter wall (y=${yAtWall.toFixed(2)}m vs wall=${planterWall.topY}m)`,
  );

  // Compute exact landing & dt=1/60 damped semi-implicit Euler rollout on +0.60m Courtyard Green
  const greenContactY = ELEVATIONS.COURTYARD_GREEN_Y + BALL_RADIUS;
  const disc =
    vOut[1] * vOut[1] - 4 * (-0.5 * WORLD_GRAVITY_Y) * (greenContactY - awningHit[1]);
  const tGreenLand = (vOut[1] + Math.sqrt(disc)) / -WORLD_GRAVITY_Y;
  const landXZ: Vec2Tuple = [
    awningHit[0] + vOut[0] * tGreenLand,
    awningHit[2] + vOut[2] * tGreenLand,
  ];
  const distFromCupLanding = distance2D(landXZ, HOLE_1_CUP.position);
  assert.ok(
    distFromCupLanding <= 2.0,
    `Awning bank landing must touch down within 2.0m of Cup (land=${distFromCupLanding.toFixed(2)}m)`,
  );
  assert.ok(
    distance2D(landXZ, meta.predictedGreenLandingXZ) <= 0.03,
    `hotdogAwningMeta.predictedGreenLandingXZ (${meta.predictedGreenLandingXZ}) must match analytical landing (${landXZ.map((n) => n.toFixed(2))})`,
  );

  const canonicalWedgeStopXZ = simulateGreenRollout(
    landXZ,
    [vOut[0], vOut[2]],
    CLUB_SPECS.wedge.rollDamping,
  );
  assert.ok(
    distance2D(canonicalWedgeStopXZ, meta.predictedStopXZ) <= 0.03,
    `hotdogAwningMeta.predictedStopXZ (${meta.predictedStopXZ}) must match analytical stop (${canonicalWedgeStopXZ.map((n) => n.toFixed(2))})`,
  );

  for (const damping of [CLUB_SPECS.wedge.rollDamping, getClubProfile('wedge').rollDamping]) {
    const stopXZ = simulateGreenRollout(landXZ, [vOut[0], vOut[2]], damping);
    const distFromCupStop = distance2D(stopXZ, HOLE_1_CUP.position);
    assert.equal(
      getMasterPlanSurfaceTagAt(stopXZ[0], stopXZ[1]),
      'putting_green_turf',
      'Awning rollout must finish on the AstroTurf putting green',
    );
    assert.ok(
      distFromCupStop <= 2.0,
      `Simulated dt=1/60 damped rollout (damping=${damping}) must stop within 2.0m of Cup (stop=${distFromCupStop.toFixed(2)}m)`,
    );
  }

  // 2. Unobstructed Under-Scaffolding Sidewalk Tunnel Clearance for Curb Skimmer
  const skimmerShot = computeDeterministicTrajectory({
    origin: [-5.95, ELEVATIONS.SIDEWALK_Y + BALL_RADIUS, 16.0],
    clubId: 'skimmer',
    power: 0.72,
    aimDirection: [0, -1],
    groundY: ELEVATIONS.SIDEWALK_Y,
  });
  const scaffolding = COURSE_MASTER_PLAN.props.find(
    (p) => p.id === 'scaffolding-shed-west',
  )!;
  assert.ok(
    skimmerShot.apexY <
      ELEVATIONS.SIDEWALK_Y + scaffolding.scaffoldingMeta!.clearHeightMeters - 0.5,
    'Curb Skimmer apex must stay well below 2.35m Scaffolding Shed deck',
  );
  for (const prop of COURSE_MASTER_PLAN.props) {
    for (const box of prop.solidColliders) {
      const hit = intersectRayAABB3D(
        [-5.95, ELEVATIONS.SIDEWALK_Y + 0.35, 16.0],
        [0, 0, -1],
        box,
        30,
      );
      assert.equal(
        hit.hit,
        false,
        `Under-scaffolding sidewalk lane obstructed by ${prop.id}`,
      );
    }
  }

  // 3. R1: Delivery Van Open Rear Ramp -> Roof-Access Kicker -> Unobstructed Roof Launch Traversal
  const van = COURSE_MASTER_PLAN.props.find((p) => p.id === 'delivery-van-east')!;
  const overhangTree = COURSE_MASTER_PLAN.props.find(
    (p) => p.id === 'tree-overhang-east',
  )!;
  const canopyBox = overhangTree.treeOverhangMeta!.canopyAabb;

  assert.equal(van.vanRampMeta!.rampBottomY, 0.0);
  assert.ok(van.vanRampMeta!.slopedRampSpec, 'Missing van slopedRampSpec');
  assert.ok(van.vanRampMeta!.roofAccessKickerSpec, 'Missing van roofAccessKickerSpec');
  assert.ok(
    van.vanRampMeta!.rampLaunchAngleDeg >= 15 &&
      van.vanRampMeta!.rampLaunchAngleDeg <= 30,
    `Van rear ramp launch angle (${van.vanRampMeta!.rampLaunchAngleDeg}°) must be playable in [15°, 30°]`,
  );

  // Verify launch zone sits strictly north of z = -7.3m AND canopy minZ >= -6.0m (zero overhead trap!)
  const launchMaxZ = van.reactive!.zoneCenter[2] + van.reactive!.zoneHalfExtents![2];
  assert.ok(
    launchMaxZ <= -7.3,
    `Van roof launch zone south edge (${launchMaxZ}) must be <= -7.3m`,
  );
  assert.ok(
    canopyBox.min[2] >= -6.0,
    `Overhanging tree canopy minZ (${canopyBox.min[2]}) must be >= -6.0m for clean van roof launch headroom`,
  );

  // Trace continuous ball traversal from road (z = -3.4) up ramp -> kicker -> cargo roof launch deck (z = -8.9)
  let prevRampY = 0;
  for (let z = -3.4; z >= -8.9 - 1e-6; z = Number((z - 0.1).toFixed(2))) {
    const surfaceY = getVanRampOrRoofElevationAt(2.28, z);
    assert.notEqual(surfaceY, null, `Missing van ramp/roof surface at z=${z}`);
    assert.ok(
      surfaceY! >= prevRampY - 1e-5 && surfaceY! - prevRampY <= 0.08,
      `Discontinuous van climb step at z=${z}: prevY=${prevRampY.toFixed(3)} -> y=${surfaceY!.toFixed(3)}`,
    );
    prevRampY = surfaceY!;

    const ballSweepBox: AABB3D = {
      min: [2.28 - 0.16, surfaceY! + 0.02, z - 0.16],
      max: [2.28 + 0.16, surfaceY! + BALL_RADIUS * 2, z + 0.16],
    };
    for (const solid of van.solidColliders) {
      assert.equal(
        aabbsOverlap3D(ballSweepBox, solid, 1e-4),
        false,
        `Ball climbing van ramp/kicker/roof at z=${z} (y=${surfaceY!.toFixed(2)}) is blocked by van solidCollider ${JSON.stringify(solid)}`,
      );
    }
    for (const solid of overhangTree.solidColliders) {
      assert.equal(
        aabbsOverlap3D(ballSweepBox, solid, 1e-4),
        false,
        `Ball on van ramp/roof at z=${z} hits tree collider`,
      );
    }
  }
  assert.ok(Math.abs(prevRampY - van.vanRampMeta!.roofDeckTopY) < 1e-4);

  // Verify forward cab roof north of z = -8.92 steps down accurately to visual cab roof (y = 1.82m, 0 invisible 42cm floating box!)
  assert.equal(
    getVanRampOrRoofElevationAt(2.28, -9.5),
    null,
    'Cargo 2.24m roof launch deck must terminate at cab seam z = -8.92',
  );
  const cabColliders = van.solidColliders.filter((c) => c.min[2] < -8.93);
  assert.equal(cabColliders.length, 1, 'Expected dedicated stepped-down cab collider north of z = -8.92');
  assert.ok(
    Math.abs(cabColliders[0].max[1] - 1.82) < 1e-4,
    `Van cab collider maxY (${cabColliders[0].max[1]}) must match 1.82m visual cab roof`,
  );

  // Verify course-plan elevation & water-hazard helpers honor passed CourseMasterPlan instances
  assert.equal(
    getCourseSurfaceElevationAt(COURSE_MASTER_PLAN, HOLE_1_CUP.position[0], HOLE_1_CUP.position[2]),
    ELEVATIONS.COURTYARD_GREEN_Y,
  );
  const frontFountain = COURSE_MASTER_PLAN.props.find(
    (p) => p.id === 'fountain-courtyard-front',
  )!;
  assert.equal(
    isWorldPointInWaterHazard(
      COURSE_MASTER_PLAN,
      frontFountain.position[0],
      ELEVATIONS.FOUNTAIN_WATER_Y,
      frontFountain.position[2],
    ),
    true,
  );

  // Cast launch ray along van boostVelocity from roof launch zone to confirm 100% clear sky headroom
  const launchDir = normalizeDir(van.reactive!.boostVelocity!);
  const roofLaunchRay = intersectRayAABB3D(
    [2.28, van.vanRampMeta!.roofDeckTopY + BALL_RADIUS, -7.8],
    launchDir,
    canopyBox,
    30,
  );
  assert.equal(
    roofLaunchRay.hit,
    false,
    'Van roof launch trajectory must have 100% unobstructed sky headroom clear of tree canopy',
  );

  // 4. Overhanging Street Tree blocks lazy right aerial blasts while keeping Left-Center Crosswalk A-Position wide open
  const lazyRightAerialRay = intersectRayAABB3D(
    [TEE_POSITION[0], 3.8, TEE_POSITION[2]],
    normalizeDir([3.2 - TEE_POSITION[0], 0, -16.5 - TEE_POSITION[2]]),
    canopyBox,
    45,
  );
  assert.equal(
    lazyRightAerialRay.hit,
    true,
    'Overhanging street-tree canopy must intercept lazy right-lane aerial blasts',
  );
  const controlledLeftAerialRay = intersectRayAABB3D(
    [TEE_POSITION[0], 3.8, TEE_POSITION[2]],
    normalizeDir([
      A_POSITION_CROSSWALK.center[0] - TEE_POSITION[0],
      0,
      A_POSITION_CROSSWALK.center[2] - TEE_POSITION[2],
    ]),
    canopyBox,
    45,
  );
  assert.equal(
    controlledLeftAerialRay.hit,
    false,
    'Controlled left-center drive to Crosswalk A-Position must be 100% unobstructed by tree canopy',
  );

  // 5. Subway Steam Grate upward impulse pops ball cleanly over Fountain Hazard onto Front Green Fringe
  const steamGrate = COURSE_MASTER_PLAN.props.find(
    (p) => p.id === 'steam-grate-corner',
  )!;
  const fountain = COURSE_MASTER_PLAN.props.find(
    (p) => p.id === 'fountain-courtyard-front',
  )!;
  const impulse = steamGrate.steamLiftMeta!.upwardImpulseVelocity;
  const vxApproach = 9.2 + impulse[0];
  const vyPop = impulse[1];
  const tAtFountain = (fountain.position[0] - steamGrate.position[0]) / vxApproach;
  const ballYAtFountain =
    BALL_RADIUS +
    vyPop * tAtFountain +
    0.5 * WORLD_GRAVITY_Y * tAtFountain * tAtFountain;
  assert.ok(
    ballYAtFountain > fountain.aabb.max[1] + BALL_RADIUS + 0.25,
    `Steam Grate pop must clear Fountain finial cleanly (ballY=${ballYAtFountain.toFixed(2)}m vs fountainTop=${fountain.aabb.max[1]}m)`,
  );
});

function normalizeDir(v: Vec3Tuple): Vec3Tuple {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

// ============================================================================
// 6. ZERO LEFTOVER PROCEDURAL SEED / 6x6 ISLAND GENERATOR FILES
// ============================================================================

test('6. Cleanup Audit: zero leftover procedural seed/6x6 island generator files', () => {
  const bannedPaths = [
    'src/engine/courseGenerator.ts',
    'src/engine/seed.ts',
    'src/engine/tileBlueprints.ts',
    'src/engine/courseValidator.ts',
    'src/engine/propCatalog.ts',
    'tests/generator.test.ts',
    'src/components/world/BeveledCutawayPlinth.tsx',
    'src/components/world/tiles/ModularTileMesh.tsx',
    'src/components/world/tiles/tileGeometry.ts',
  ];

  for (const rel of bannedPaths) {
    const abs = path.join(repoRoot, rel);
    assert.equal(
      fs.existsSync(abs),
      false,
      `Obsolete procedural generator file must be removed: ${rel}`,
    );
  }
});
