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
  getMasterPlanGroundElevationAt,
  getMasterPlanSurfaceTagAt,
  HOLE_1_CUP,
  STREET_SCOUT_CAMERA_PRESET,
  TEE_POSITION,
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
import { computeDeterministicTrajectory } from '@/engine/trajectory';
import { BALL_RADIUS, ELEVATIONS, WORLD_GRAVITY_Y, type Vec3Tuple } from '@/types';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ============================================================================
// 1. ZERO FLOATING PROPS & ZERO SUBTERRANEAN SINKS
// ============================================================================

test('1. Grounding Audit: 0 floating props and 0 subterranean sinks across all zones', () => {
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

test('2. Collision & Diegetic Zoning Audit: 0 solid AABB overlaps + flush scaffolding, hydrant-grate 0.5m, van loading zone', () => {
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

  // 2c. Pairwise primary perimeter buildings have 0 unintended 3D interpenetrations (strictly flush seams)
  const blds = COURSE_MASTER_PLAN.perimeterBuildings;
  for (let i = 0; i < blds.length; i++) {
    for (let j = i + 1; j < blds.length; j++) {
      assert.equal(
        aabbsOverlap3D(blds[i].aabb, blds[j].aabb, 1e-4),
        false,
        `Primary buildings "${blds[i].id}" and "${blds[j].id}" overlap instead of meeting flush`,
      );
    }
  }

  // 2d. Explicit Assertion: Scaffolding Shed touches its host brick brownstone facade FLUSH (gap <= 0.02m)
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

  // 2f. Explicit Assertion: Delivery Van + hazard cones sit inside painted curbside loading zone (~30-34m from tee)
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

  // 2g. Explicit Assertion: Cup apron (>= 1.5m) is 100% obstacle-free on the +0.60m Putting Green
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
});

// ============================================================================
// 3. CONTINUOUS ROAD, GUTTER, 15CM CURB, SIDEWALK, RAMP & +0.60M GREEN (~72M)
// ============================================================================

test('3. Geometric Connectivity Audit: 72m centerline, seamless storm gutters, 15cm curbs, and flush +0.60m Courtyard Ramp', () => {
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

  // 3c. Verify continuous 15cm stone curbs & 45-degree beveled corner curb
  for (const curb of COURSE_MASTER_PLAN.curbs) {
    assert.equal(curb.height, 0.15, `Curb ${curb.id} height must be 0.15m (15cm)`);
    assert.equal(curb.topY, 0.15, `Curb ${curb.id} topY must match +0.15m sidewalk`);
  }
  const bevelCurb = COURSE_MASTER_PLAN.curbs.find(
    (c) => c.id === 'curb-corner-se-bevel-45',
  );
  assert.ok(bevelCurb && bevelCurb.bevelAngleDeg === 45, 'Missing 45° beveled corner curb');

  // 3d. Verify flush Stone Courtyard Entrance Ramp (0.00m road -> +0.60m Courtyard Green with 0 step-lip!)
  const mainRamp = COURSE_MASTER_PLAN.ramps.find(
    (r) => r.id === 'ramp-courtyard-main',
  )!;
  assert.ok(mainRamp, 'Missing main Courtyard Stone Entrance Ramp');
  assert.equal(mainRamp.bottomY, 0.0);
  assert.equal(mainRamp.topY, 0.6);

  // Sample continuity across road -> ramp bottom -> ramp midpoint -> ramp top -> courtyard green
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

  // Verify Mercer South Gutter feeds flush into the South lane of the Courtyard Ramp
  assert.equal(mercerSouthGutter.end![0], mainRamp.boundsXZ.minX);
  assert.ok(
    mercerSouthGutter.end![2] >= mainRamp.boundsXZ.minZ &&
      mercerSouthGutter.end![2] <= mainRamp.boundsXZ.maxZ,
    'Mercer South Storm Gutter must feed directly into the flush Stone Courtyard Entrance Ramp',
  );
});

// ============================================================================
// 4. 360-DEGREE PERIMETER RAYCAST CLOSURE FROM ALL 5 AUDIT STATIONS
// ============================================================================

test('4. 360-Degree Perimeter Raycast Closure: 0 escaping rays across all 5 player stations + Street Scout', () => {
  assert.equal(
    AUDIT_CAMERA_STATIONS.length,
    5,
    'Expected all 5 Gate-3 player audit stations',
  );

  for (const station of AUDIT_CAMERA_STATIONS) {
    const result = auditStation360PerimeterClosure(
      station.id,
      station.position,
      COURSE_MASTER_PLAN,
      110,
    );
    assert.equal(
      result.escapedAnglesDeg.length,
      0,
      `Station "${station.id}" leaked ${result.escapedAnglesDeg.length} rays to void at angles: ${result.escapedAnglesDeg.join(', ')}`,
    );
    assert.equal(result.hitCount, 360);
  }

  // Also verify Street Scout elevated canyon peek stays inside corridor and has 100% 360° closure!
  assert.ok(
    STREET_SCOUT_CAMERA_PRESET.position[1] <= STREET_SCOUT_CAMERA_PRESET.maxAllowedHeightY,
    'Street Scout camera must stay below building cornices (no high isometric slab view)',
  );
  const scoutClosure = auditStation360PerimeterClosure(
    STREET_SCOUT_CAMERA_PRESET.id,
    STREET_SCOUT_CAMERA_PRESET.position,
    COURSE_MASTER_PLAN,
    110,
  );
  assert.equal(
    scoutClosure.escapedAnglesDeg.length,
    0,
    `Street Scout camera leaked rays at angles: ${scoutClosure.escapedAnglesDeg.join(', ')}`,
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

  // Verify OBB2D SAT math
  const obbA = buildOBB2D([0, 0], [2, 4], 0.35);
  const obbB = buildOBB2D([5, 0], [2, 4], -0.2);
  assert.equal(obbsOverlap2D(obbA, obbB), false);
});

test('5b. Strategic Shot Matrix Audit: 28° Hotdog Awning bounce -> Cup <= 2m, Scaffolding tunnel, Van ramp, Steam hop & Overhanging Tree', () => {
  // 1. Hotdog Cart 28° Striped Awning Bank Shot from A-Position Crosswalk -> within 2.0m of Cup!
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

  // Check clearance over the Wrought-Iron Planter Low Wall (z = -17.80, topY = 1.02m)
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

  // Compute exact landing & soft check rollout on +0.60m Courtyard Green
  const greenContactY = ELEVATIONS.COURTYARD_GREEN_Y + BALL_RADIUS;
  const disc =
    vOut[1] * vOut[1] - 4 * (-0.5 * WORLD_GRAVITY_Y) * (greenContactY - awningHit[1]);
  const tGreenLand = (vOut[1] + Math.sqrt(disc)) / -WORLD_GRAVITY_Y;
  const landXZ: [number, number] = [
    awningHit[0] + vOut[0] * tGreenLand,
    awningHit[2] + vOut[2] * tGreenLand,
  ];
  const vhOut = Math.hypot(vOut[0], vOut[2]);
  const stopXZ: [number, number] = [
    landXZ[0] + (vOut[0] / vhOut) * 1.1,
    landXZ[1] + (vOut[2] / vhOut) * 1.1,
  ];
  const distFromCupLanding = distance2D(landXZ, HOLE_1_CUP.position);
  const distFromCupStop = distance2D(stopXZ, HOLE_1_CUP.position);

  assert.ok(
    distFromCupLanding <= 2.0 && distFromCupStop <= 2.0,
    `28° Hotdog Awning bank shot must funnel onto +0.60m green within 2.0m of Cup (land=${distFromCupLanding.toFixed(2)}m, stop=${distFromCupStop.toFixed(2)}m)`,
  );

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
  // Cast horizontal knee-high ray straight down the West sidewalk under the scaffolding
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

  // 3. Delivery Van Lowered Rear Ramp Flush Entry & Launch Angle
  const van = COURSE_MASTER_PLAN.props.find((p) => p.id === 'delivery-van-east')!;
  assert.equal(van.vanRampMeta!.rampBottomY, 0.0);
  assert.ok(
    van.vanRampMeta!.rampLaunchAngleDeg >= 15 &&
      van.vanRampMeta!.rampLaunchAngleDeg <= 30,
    `Van rear ramp launch angle (${van.vanRampMeta!.rampLaunchAngleDeg}°) must be playable in [15°, 30°]`,
  );

  // 4. Overhanging Street Tree blocks lazy right aerial blasts while keeping Left-Center Crosswalk A-Position wide open
  const overhangTree = COURSE_MASTER_PLAN.props.find(
    (p) => p.id === 'tree-overhang-east',
  )!;
  const canopyBox = overhangTree.treeOverhangMeta!.canopyAabb;
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
  const vxApproach = 9.2 + impulse[0]; // 10.0 m/s eastward
  const vyPop = impulse[1]; // 9.8 m/s upward
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
