import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COURSE_MASTER_PLAN,
  auditStation360PerimeterClosure,
  isWorldPointInWaterHazard,
} from '../src/config/courseMasterPlan';
import {
  COPPER_SPIRAL_CHUTE_SPEC,
  DEFAULT_ACTIVE_COURSE_ID,
  ESCAPADE_ARCHITECTURAL_WALLS,
  ESCAPADE_AUDIT_CAMERA_STATIONS,
  ESCAPADE_CENTERLINE_SEGMENTS,
  ESCAPADE_COURSE_PROPS,
  ESCAPADE_GROUND_ZONES,
  ESCAPADE_PERIMETER_BUILDINGS,
  ESCAPADE_SKYLINE_BACKDROPS,
  ESCAPADE_STRATEGIC_ROUTES,
  ESCAPADE_STREET_SCOUT_CAMERA,
  ESCAPADE_STRING_LIGHT_SPANS,
  ESCAPADE_TRATTORIA_PERGOLA,
  FLYOVER_LOOKAT_POINTS,
  FLYOVER_SPLINE_POINTS,
  GRAND_ESCAPADE_CUP,
  GRAND_ESCAPADE_MASTER_PLAN,
  GRAND_ESCAPADE_QA_PROP_SPECS,
  GRAND_ESCAPADE_ZONES,
  QA_TELEPORT_ZONES,
  QA_TELEPORT_ZONE_LIST,
  SUBWAY_STATION_VAULT_SPEC,
  computeForwardCourseYaw,
  computeRemainingCourseDistance,
  getActiveEscapadeZonesForPosition,
  getEscapadeGroundElevationAt,
  getEscapadeSurfaceTagAt,
  getEscapadeZoneAtPosition,
  getMasterPlanByCourseId,
  isSubterraneanSubwayPosition,
  resolveCourseIdFromSearchParams,
  resolveQaTeleportZone,
  sampleCourseCenterlineAtDistance,
} from '../src/config/grandEscapadeMasterPlan';
import { CLUB_SPECS, CUP_DEPTH, CUP_RADIUS } from '../src/types/clubs';
import { GOLDEN_PIN_COLOR_META } from '../src/types/course';
import type { AABB3D, GrandEscapadeZoneNumber, Vec3Tuple } from '../src/types/course';
import {
  aabbsOverlap3D,
  buildCoaxialWaterTowerSpec,
  buildHelicalChuteSplineSpec,
  buildVaultedSubwayArchSpec,
  computeAABBFromBoundsXZ,
  distance2D,
  evaluateCatmullRomSpline3D,
  evaluateCatmullRomTangent3D,
  intersectRayAABB3D,
} from '../src/lib/geometryHelpers';

// ============================================================================
// STAGE 2 CAD AUDIT SUITE: "THE GRAND CROSSTOWN ESCAPADE" (v4.0.0-grand-escapade)
// ============================================================================

test('Stage 2.1 — Continuous 380.0m Par 18 Centerline, Course Registry & Golden Pin Integrity', () => {
  assert.equal(DEFAULT_ACTIVE_COURSE_ID, 'grand-escapade');
  assert.equal(getMasterPlanByCourseId('grand-escapade').holeId, 'grand-crosstown-escapade');
  assert.equal(getMasterPlanByCourseId('classic').holeId, COURSE_MASTER_PLAN.holeId);
  assert.equal(resolveCourseIdFromSearchParams(''), 'grand-escapade');
  assert.equal(resolveCourseIdFromSearchParams('?qaTeleportZone=5'), 'grand-escapade');
  assert.equal(resolveCourseIdFromSearchParams('?course=classic'), 'classic');

  assert.equal(GRAND_ESCAPADE_MASTER_PLAN.courseId, 'grand-escapade');
  assert.equal(GRAND_ESCAPADE_MASTER_PLAN.par, 18);
  assert.equal(GRAND_ESCAPADE_MASTER_PLAN.targetCenterlineMeters, 380);
  assert.equal(GRAND_ESCAPADE_MASTER_PLAN.computedCenterlineMeters, 380);
  assert.equal(GRAND_ESCAPADE_ZONES.length, 7);

  // Verify continuous zero-gap 380.000m centerline from Tee [0, 31] to Golden Pin [34, 119]
  assert.ok(ESCAPADE_CENTERLINE_SEGMENTS.length >= 7);
  let totalMeters = 0;

  assert.deepEqual(ESCAPADE_CENTERLINE_SEGMENTS[0].startXZ, [
    GRAND_ESCAPADE_MASTER_PLAN.teePosition[0],
    GRAND_ESCAPADE_MASTER_PLAN.teePosition[2],
  ]);

  for (let i = 0; i < ESCAPADE_CENTERLINE_SEGMENTS.length; i++) {
    const seg = ESCAPADE_CENTERLINE_SEGMENTS[i];
    const euclid = distance2D(seg.startXZ, seg.endXZ);
    assert.ok(
      Math.abs(euclid - seg.lengthMeters) < 1e-4,
      `Segment "${seg.id}" length mismatch: euclid=${euclid}, spec=${seg.lengthMeters}`,
    );
    totalMeters += euclid;

    if (i > 0) {
      const prev = ESCAPADE_CENTERLINE_SEGMENTS[i - 1];
      const seamGap = distance2D(prev.endXZ, seg.startXZ);
      assert.ok(
        seamGap < 1e-6,
        `Centerline discontinuity between "${prev.id}" and "${seg.id}": gap=${seamGap}`,
      );
    }
  }

  const lastSeg = ESCAPADE_CENTERLINE_SEGMENTS[ESCAPADE_CENTERLINE_SEGMENTS.length - 1];
  assert.deepEqual(lastSeg.endXZ, [
    GRAND_ESCAPADE_CUP.position[0],
    GRAND_ESCAPADE_CUP.position[2],
  ]);
  assert.ok(Math.abs(totalMeters - 380.0) < 1e-3, `Expected 380.0m centerline, got ${totalMeters}`);

  // Single Golden Pin inside Vaulted Subway Station Finale (-7.50m)
  assert.equal(GRAND_ESCAPADE_CUP.isGoldenPin, true);
  assert.equal(GRAND_ESCAPADE_CUP.pinFinish, 'golden');
  assert.equal(GOLDEN_PIN_COLOR_META.hex, '#F59E0B');
  assert.deepEqual(GRAND_ESCAPADE_CUP.position, [34.0, -7.5, 119.0]);
  assert.equal(GRAND_ESCAPADE_CUP.elevationY, -7.5);
  assert.equal(GRAND_ESCAPADE_CUP.cupRadius, CUP_RADIUS);
  assert.equal(GRAND_ESCAPADE_CUP.cupDepth, CUP_DEPTH);
  assert.ok(GRAND_ESCAPADE_CUP.apronRadius >= 2.5);
  assert.equal(getEscapadeSurfaceTagAt(34.0, 119.0), 'putting_green_turf');
  assert.equal(getEscapadeGroundElevationAt(34.0, 119.0), -7.5);

  // Obstacle-free putting apron around the Golden Pin
  const apronBox = computeAABBFromBoundsXZ(
    {
      minX: GRAND_ESCAPADE_CUP.position[0] - GRAND_ESCAPADE_CUP.apronRadius,
      maxX: GRAND_ESCAPADE_CUP.position[0] + GRAND_ESCAPADE_CUP.apronRadius,
      minZ: GRAND_ESCAPADE_CUP.position[2] - GRAND_ESCAPADE_CUP.apronRadius,
      maxZ: GRAND_ESCAPADE_CUP.position[2] + GRAND_ESCAPADE_CUP.apronRadius,
    },
    -7.5,
    -5.0,
  );
  for (const prop of ESCAPADE_COURSE_PROPS) {
    for (const col of prop.solidColliders) {
      assert.equal(
        aabbsOverlap3D(apronBox, col),
        false,
        `Prop "${prop.id}" intrudes into Golden Pin putting apron`,
      );
    }
  }
});

test('Stage 2.2 — 7-Zone Vertical Topography (0m -> +9.5m -> +12.5m -> +16.5m -> +14m -> 0m -> -7.5m) & Zero Step-Lips', () => {
  // Zone 1 Street (0.0m) -> Zone 2 Two Flat Landing Plazas (+3.1m, +6.3m) & Hillcrest (+9.5m)
  assert.equal(getEscapadeGroundElevationAt(0.0, 31.0), 0.0);
  assert.equal(getEscapadeGroundElevationAt(0.0, -42.0), 3.1);
  assert.equal(getEscapadeGroundElevationAt(0.0, -64.0), 6.3);
  assert.equal(getEscapadeGroundElevationAt(0.0, -84.0), 9.5);

  // Zone 3 Tenement Roofs (+11.0m West -> +12.5m East across Plank Bridge + flanking +11.0m catch-decks)
  assert.equal(getEscapadeGroundElevationAt(20.0, -84.0), 11.0);
  assert.ok(Math.abs(getEscapadeGroundElevationAt(34.5, -84.0) - 11.75) < 1e-3);
  assert.equal(getEscapadeGroundElevationAt(34.5, -88.0), 11.0); // Alley North safety catch-deck
  assert.equal(getEscapadeGroundElevationAt(34.5, -80.0), 11.0); // Alley South safety catch-deck
  assert.equal(getEscapadeGroundElevationAt(48.0, -84.0), 12.5);

  // Zone 4 Viaduct Belvedere (+15.0m) & Overlook Summit Piazza (+16.5m)
  assert.equal(getEscapadeGroundElevationAt(55.0, -58.0), 15.0);
  assert.equal(getEscapadeGroundElevationAt(55.0, -39.0), 16.5);

  // Verify panoramic sightline tier: interior block roof stays below Zone 4's +15.0m Viaduct Belvedere!
  const centralVistaBld = ESCAPADE_PERIMETER_BUILDINGS.find(
    (b) => b.id === 'esc-bld-central-vista-low-roof',
  );
  assert.ok(centralVistaBld, 'Missing central vista roof tier');
  assert.ok(
    centralVistaBld.aabb.max[1] < 14.5,
    `Central block must stay below +15.0m Viaduct deck for panoramic vista across Zones 1-3 (got ${centralVistaBld.aabb.max[1]})`,
  );

  // Zone 5 Conservatory (+16.5m) -> Penthouse Split Deck (+14.0m)
  assert.equal(getEscapadeGroundElevationAt(55.0, -21.0), 16.5);
  assert.equal(getEscapadeGroundElevationAt(55.0, 0.0), 14.0);

  // Zone 6 Chute Arrival Terrace (+2.0m) -> Beaux-Arts Midtown Square (0.0m) -> Sunken Stairwell (-4.5m)
  assert.equal(getEscapadeGroundElevationAt(40.0, 19.0), 2.0);
  assert.equal(getEscapadeGroundElevationAt(34.0, 35.5), 0.0);
  assert.ok(Math.abs(getEscapadeGroundElevationAt(34.0, 62.0) - -2.25) < 1e-3);

  // Zone 7 Vaulted Ceramic-Tile Subway Station Concourse (-7.5m)
  assert.equal(getEscapadeGroundElevationAt(34.0, 79.0), -7.5);
  assert.equal(getEscapadeGroundElevationAt(34.0, 96.5), -7.5);
  assert.equal(getEscapadeGroundElevationAt(34.0, 119.0), -7.5);

  // Outer horizon skirt must sit strictly below the -7.5m subterranean subway floor!
  assert.ok(
    (GRAND_ESCAPADE_MASTER_PLAN.outerGroundSkirt?.topY ?? 0) <= -8.0,
    'outerGroundSkirt must sit below -7.5m subway station concourse so it never slices subterranean rooms',
  );

  // Zero vertical step-lips across every corridor transition ramp seam
  const seamProbes: Array<{ label: string; a: [number, number]; b: [number, number] }> = [
    { label: 'Z1->Z2 Climb A toe', a: [0.0, -23.98], b: [0.0, -24.02] },
    { label: 'Z2 Climb A->Terrace A', a: [0.0, -37.98], b: [0.0, -38.02] },
    { label: 'Z2 Terrace A->Climb B', a: [0.0, -45.98], b: [0.0, -46.02] },
    { label: 'Z2 Climb B->Terrace B', a: [0.0, -59.98], b: [0.0, -60.02] },
    { label: 'Z2 Terrace B->Climb C', a: [0.0, -67.98], b: [0.0, -68.02] },
    { label: 'Z2 Climb C->Belvedere', a: [0.0, -79.98], b: [0.0, -80.02] },
    { label: 'Z2->Z3 Rooftop Scaffold toe', a: [5.98, -85.0], b: [6.02, -85.0] },
    { label: 'Z3 Scaffold->Roof West crest', a: [14.98, -84.0], b: [15.02, -84.0] },
    { label: 'Z3 Roof West->Plank Bridge', a: [31.98, -84.0], b: [32.02, -84.0] },
    { label: 'Z3 Plank Bridge->Roof East', a: [36.98, -84.0], b: [37.02, -84.0] },
    { label: 'Z3->Z4 Viaduct North toe', a: [55.0, -78.02], b: [55.0, -77.98] },
    { label: 'Z4 Viaduct North->Belvedere', a: [55.0, -62.02], b: [55.0, -61.98] },
    { label: 'Z4 Belvedere->Viaduct South', a: [55.0, -54.02], b: [55.0, -53.98] },
    { label: 'Z4 Viaduct South->Summit Piazza', a: [55.0, -44.02], b: [55.0, -43.98] },
    { label: 'Z5 Conservatory->Stepdown', a: [55.0, -13.02], b: [55.0, -12.98] },
    { label: 'Z5 Stepdown->Penthouse Deck', a: [55.0, -4.02], b: [55.0, -3.98] },
    { label: 'Z6 Arrival Terrace->Grand Steps', a: [36.0, 23.98], b: [36.0, 24.02] },
    { label: 'Z6 Grand Steps->Midtown Square', a: [36.0, 31.98], b: [36.0, 32.02] },
    { label: 'Z6 Midtown Square->Upper Stairwell', a: [34.0, 55.98], b: [34.0, 56.02] },
    { label: 'Z6/Z7 Upper->Lower Stairwell', a: [34.0, 67.98], b: [34.0, 68.02] },
    { label: 'Z7 Lower Stairwell->Subway Concourse', a: [34.0, 75.98], b: [34.0, 76.02] },
  ];

  for (const probe of seamProbes) {
    const ya = getEscapadeGroundElevationAt(probe.a[0], probe.a[1]);
    const yb = getEscapadeGroundElevationAt(probe.b[0], probe.b[1]);
    assert.ok(
      Math.abs(ya - yb) <= 0.03,
      `Ramp seam step-lip at "${probe.label}": yA=${ya.toFixed(4)}, yB=${yb.toFixed(4)}`,
    );
  }
});

test('Stage 2.3 — Grounded Props, Zero Pairwise 3D Solid Overlaps & Open Vintage Subway Car Walkthrough', () => {
  assert.ok(ESCAPADE_COURSE_PROPS.length >= 20);

  // 1. Every prop must rest flush on its groundY datum with zero floating colliders
  for (const prop of ESCAPADE_COURSE_PROPS) {
    assert.equal(
      prop.position[1],
      prop.groundY,
      `Prop "${prop.id}" position[1] (${prop.position[1]}) must equal groundY (${prop.groundY})`,
    );
    assert.ok(
      Math.abs(prop.aabb.min[1] - prop.groundY) < 1e-4,
      `Prop "${prop.id}" aabb.min[1] (${prop.aabb.min[1]}) must equal groundY (${prop.groundY})`,
    );
    for (const col of prop.solidColliders) {
      assert.ok(
        col.min[1] >= prop.groundY - 1e-4,
        `Prop "${prop.id}" collider extends below groundY`,
      );
    }
  }

  // 2. Pairwise 3D solid collider non-overlap across ALL props, buildings, backdrops & walls
  const namedVolumes: Array<{ label: string; group: string; aabb: typeof ESCAPADE_COURSE_PROPS[number]['aabb'] }> = [];

  for (const prop of ESCAPADE_COURSE_PROPS) {
    prop.solidColliders.forEach((col, idx) => {
      namedVolumes.push({
        label: `prop:${prop.id}#${idx}`,
        group: `prop:${prop.id}`,
        aabb: col,
      });
    });
  }
  for (const bld of ESCAPADE_PERIMETER_BUILDINGS) {
    namedVolumes.push({ label: `bld:${bld.id}`, group: `bld:${bld.id}`, aabb: bld.aabb });
  }
  for (const sky of ESCAPADE_SKYLINE_BACKDROPS) {
    namedVolumes.push({ label: `sky:${sky.id}`, group: `sky:${sky.id}`, aabb: sky.aabb });
  }
  for (const wall of GRAND_ESCAPADE_MASTER_PLAN.architecturalWalls) {
    namedVolumes.push({ label: `wall:${wall.id}`, group: `wall:${wall.id}`, aabb: wall.aabb });
  }

  for (let i = 0; i < namedVolumes.length; i++) {
    for (let j = i + 1; j < namedVolumes.length; j++) {
      const a = namedVolumes[i];
      const b = namedVolumes[j];
      if (a.group === b.group) continue;
      // Allow intentional structural touch between Zone 7 vault ceiling slab & portal header wall if any
      assert.equal(
        aabbsOverlap3D(a.aabb, b.aabb, 1e-3),
        false,
        `3D solid overlap detected between "${a.label}" and "${b.label}"`,
      );
    }
  }

  // 3. Verify Zone 6 Midtown Fountain registers as an active water hazard
  assert.equal(
    isWorldPointInWaterHazard(GRAND_ESCAPADE_MASTER_PLAN, 34.0, 0.2, 44.0),
    true,
    'Zone 6 Midtown Fountain must register in isWorldPointInWaterHazard',
  );

  // 4. Verify Zone 7 Vintage Subway Car has open center walkthrough putting lane (x = 34.0) + wide flanking platforms!
  const subwayCar = ESCAPADE_COURSE_PROPS.find((p) => p.id === 'esc-z7-vintage-subway-car')!;
  assert.ok(subwayCar, 'Missing Zone 7 Vintage Subway Car');
  for (let z = 89.0; z <= 104.0; z += 0.5) {
    const ballBox = {
      min: [33.75, -7.5, z - 0.25] as [number, number, number],
      max: [34.25, -6.8, z + 0.25] as [number, number, number],
    };
    for (const col of subwayCar.solidColliders) {
      assert.equal(
        aabbsOverlap3D(ballBox, col),
        false,
        `Vintage Subway Car blocks center walkthrough putting lane at z=${z}`,
      );
    }
  }
});

test('Stage 2.4 — Deterministic ?qaTeleportZone=1..7 Flat 0%-Grade Anchors & 100% 360° Multi-Pitch Enclosure', () => {
  assert.equal(QA_TELEPORT_ZONE_LIST.length, 7);
  assert.equal(resolveQaTeleportZone(0), null);
  assert.equal(resolveQaTeleportZone(8), null);
  assert.equal(resolveQaTeleportZone('invalid'), null);

  const zoneNumbers: GrandEscapadeZoneNumber[] = [1, 2, 3, 4, 5, 6, 7];
  for (const zNum of zoneNumbers) {
    const anchor = resolveQaTeleportZone(String(zNum));
    assert.ok(anchor, `Missing QA teleport anchor for zone ${zNum}`);
    assert.equal(anchor.zoneNumber, zNum);
    assert.equal(anchor.isSubterranean, zNum === 7);

    // 1. Verify exact 0% grade around every teleport anchor so teleported balls never roll away!
    const [ax, ay, az] = anchor.position;
    for (const [dx, dz] of [
      [0, 0],
      [-0.35, 0],
      [0.35, 0],
      [0, -0.35],
      [0, 0.35],
    ]) {
      const sampledY = getEscapadeGroundElevationAt(ax + dx, az + dz);
      assert.ok(
        Math.abs(sampledY - ay) < 1e-4,
        `Teleport Zone ${zNum} is not on a flat 0%-grade pad at offset (${dx}, ${dz}): got ${sampledY}, expected ${ay}`,
      );
    }

    // 2. Verify active zone & subterranean detection helpers
    assert.equal(isSubterraneanSubwayPosition([ax, ay + 0.21, az]), zNum === 7);
    const detectedZone = getEscapadeZoneAtPosition([ax, ay + 0.21, az]);
    assert.equal(detectedZone.zoneNumber, zNum);
    const activeNeighbors = getActiveEscapadeZonesForPosition([ax, ay + 0.21, az]);
    assert.ok(
      activeNeighbors.includes(zNum),
      `Active chunk neighborhood for Zone ${zNum} must include itself`,
    );
  }

  // 3. 360-Degree Horizon/Ground Closure + Open Golden-Hour Sky Verification across ALL 7 Stations!
  assert.equal(ESCAPADE_AUDIT_CAMERA_STATIONS.length, 7);
  for (const station of ESCAPADE_AUDIT_CAMERA_STATIONS) {
    const pitchSet = station.isSubterranean
      ? [-12, -6, 0, 5, 9, 28, 45] // Prove 100% 360° subterranean walls + overhead vaulted ceiling slab closure!
      : [-12, -6, 0, 3]; // Prove 100% 360° horizon & downward urban closure across Outdoor Zones 1–6!

    const result = auditStation360PerimeterClosure(
      station.id,
      station.position,
      GRAND_ESCAPADE_MASTER_PLAN,
      260,
      { azimuthStepDeg: 0.5, pitchAnglesDeg: pitchSet },
    );

    assert.equal(
      result.escapedRays.length,
      0,
      `Station "${station.id}" leaked ${result.escapedRays.length} horizon/vault rays (first: ${JSON.stringify(result.escapedRays[0])})`,
    );
    assert.equal(result.hitCount, 720 * pitchSet.length);

    if (station.isSubterranean) {
      // At +14° in Zone 7, only the intentional North stairwell daylight throat (azimuth within ±12° of North 0°) may glimpse sky!
      const throatCheck = auditStation360PerimeterClosure(
        `${station.id}_throat_14`,
        station.position,
        GRAND_ESCAPADE_MASTER_PLAN,
        260,
        { azimuthStepDeg: 0.5, pitchAnglesDeg: [14] },
      );
      const nonStairLeaks = throatCheck.escapedRays.filter(
        (r) => r.azimuthDeg > 12 && r.azimuthDeg < 348,
      );
      assert.equal(
        nonStairLeaks.length,
        0,
        `Subterranean vault leaked outside stairwell throat at +14°: ${JSON.stringify(nonStairLeaks[0])}`,
      );
    }

    // Outdoor stations (Zones 1–6) MUST also reveal open golden-hour sky at +24° upward pitch along the camera view!
    if (!station.isSubterranean) {
      const skyCheck = auditStation360PerimeterClosure(
        `${station.id}_sky`,
        station.position,
        GRAND_ESCAPADE_MASTER_PLAN,
        260,
        { azimuthStepDeg: 1.0, pitchAnglesDeg: [24] },
      );
      const minSkyRays = station.groundY >= 10 ? 120 : 24;
      assert.ok(
        skyCheck.escapedRays.length >= minSkyRays,
        `Outdoor station "${station.id}" must see open golden-hour sky at +24° pitch (only ${skyCheck.escapedRays.length}/360 sky rays open, needed >=${minSkyRays})`,
      );
    }
  }

  // Also verify Panoramic Viaduct Scout Camera has 100% 360-degree horizon closure + open sky above
  const scoutClosure = auditStation360PerimeterClosure(
    ESCAPADE_STREET_SCOUT_CAMERA.id,
    ESCAPADE_STREET_SCOUT_CAMERA.position,
    GRAND_ESCAPADE_MASTER_PLAN,
    260,
    { azimuthStepDeg: 0.5, pitchAnglesDeg: [-20, -12, -6, 0, 3] },
  );
  assert.equal(
    scoutClosure.escapedRays.length,
    0,
    `Viaduct Scout Camera leaked horizon rays: ${JSON.stringify(scoutClosure.escapedRays.slice(0, 5))}`,
  );
});

test('Stage 2.5 — Helical Copper Chute Spline, Flyover Spline, Coaxial Builders & Multi-Zone Reachability', () => {
  // 1. Spiraling Copper Roof-Gutter Chute (+14.0m -> +2.0m) spline invariants
  assert.equal(COPPER_SPIRAL_CHUTE_SPEC.waypoints.length, 25);
  assert.equal(COPPER_SPIRAL_CHUTE_SPEC.segments.length, 24);
  assert.equal(COPPER_SPIRAL_CHUTE_SPEC.entryPosition[1], 14.0);
  assert.equal(COPPER_SPIRAL_CHUTE_SPEC.exitSpoutPosition[1], 2.0);

  for (let i = 0; i < COPPER_SPIRAL_CHUTE_SPEC.waypoints.length - 1; i++) {
    const curr = COPPER_SPIRAL_CHUTE_SPEC.waypoints[i];
    const next = COPPER_SPIRAL_CHUTE_SPEC.waypoints[i + 1];
    assert.ok(
      next[1] < curr[1],
      `Copper chute waypoint ${i}->${i + 1} must strictly descend (${curr[1]} -> ${next[1]})`,
    );
    const seg = COPPER_SPIRAL_CHUTE_SPEC.segments[i];
    assert.ok(seg.length > 0.4 && seg.length < 2.5);
    assert.ok(seg.pitchRad > 0, 'Downward helical chute segment must have positive downward pitchRad');
  }

  // Custom builder sanity check
  const customChute = buildHelicalChuteSplineSpec({ sampleCount: 16, turns: 1.0 });
  assert.equal(customChute.waypoints.length, 16);
  assert.equal(customChute.segments.length, 15);
  assert.ok(customChute.totalArcLengthMeters > 18);

  // 2. Continuous Flyover Camera Spline (Tee -> All 7 Zones -> Golden Pin)
  assert.equal(FLYOVER_SPLINE_POINTS.length, FLYOVER_LOOKAT_POINTS.length);
  const startCam = evaluateCatmullRomSpline3D(FLYOVER_SPLINE_POINTS, 0);
  const endCam = evaluateCatmullRomSpline3D(FLYOVER_SPLINE_POINTS, 1);
  assert.deepEqual(startCam, FLYOVER_SPLINE_POINTS[0]);
  assert.deepEqual(endCam, FLYOVER_SPLINE_POINTS[FLYOVER_SPLINE_POINTS.length - 1]);
  assert.ok(endCam[1] < -4.5, 'Flyover spline finale must descend inside the -7.5m Subway Vault');

  for (let s = 0; s <= 100; s++) {
    const t = s / 100;
    const pos = evaluateCatmullRomSpline3D(FLYOVER_SPLINE_POINTS, t);
    const tan = evaluateCatmullRomTangent3D(FLYOVER_SPLINE_POINTS, t);
    assert.ok(pos.every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(tan[0], tan[1], tan[2]) - 1.0) < 1e-4);
  }

  // 3. Coaxial Water Tower & Vaulted Subway Arch CAD Builders
  const waterTower = buildCoaxialWaterTowerSpec();
  assert.equal(waterTower.groundContactY, 0);
  assert.ok(
    waterTower.totalHeight <= 5.65,
    `Water tower totalHeight (${waterTower.totalHeight}m) must fit strictly inside 5.70m /qa-gallery wireframe`,
  );
  assert.equal(waterTower.trestleLegs.length, 4);
  for (const leg of waterTower.trestleLegs) {
    assert.equal(leg.bottomY, 0);
    assert.ok(Math.abs(leg.position[1] - leg.size[1] * 0.5) < 1e-6);
  }
  assert.equal(waterTower.barrel.center[0], 0);
  assert.equal(waterTower.barrel.center[2], 0);
  assert.equal(waterTower.conicalRoof.center[0], 0);
  assert.equal(waterTower.finial.center[0], 0);
  for (const hoop of waterTower.steelHoops) {
    assert.equal(hoop.center[0], 0);
    assert.equal(hoop.center[2], 0);
    assert.ok(hoop.radius > waterTower.barrel.radius);
  }

  const vaultArch = buildVaultedSubwayArchSpec();
  assert.equal(vaultArch.groundContactY, 0);
  assert.equal(vaultArch.leftPilaster.bottomY, 0);
  assert.equal(vaultArch.rightPilaster.bottomY, 0);
  assert.ok(vaultArch.crownClearHeight >= 6.5);
  assert.equal(vaultArch.archSegments.filter((s) => s.isCrownKeystone).length, 1);

  // 4. Subway Station Light Shafts & QA Gallery Prop Specs (11 hero props including Open-Throat Subway Headhouse!)
  assert.equal(SUBWAY_STATION_VAULT_SPEC.lightShafts.length, 4);
  assert.equal(GRAND_ESCAPADE_QA_PROP_SPECS.length, 11);
  for (const qaSpec of GRAND_ESCAPADE_QA_PROP_SPECS) {
    assert.equal(qaSpec.localBoundsMin[1], 0.0, `QA prop "${qaSpec.id}" must be grounded at local y = 0`);
    const spanX = qaSpec.localBoundsMax[0] - qaSpec.localBoundsMin[0];
    const spanY = qaSpec.localBoundsMax[1] - qaSpec.localBoundsMin[1];
    const spanZ = qaSpec.localBoundsMax[2] - qaSpec.localBoundsMin[2];
    assert.ok(Math.abs(spanX - qaSpec.localSize[0]) < 1e-4);
    assert.ok(Math.abs(spanY - qaSpec.localSize[1]) < 1e-4);
    assert.ok(Math.abs(spanZ - qaSpec.localSize[2]) < 1e-4);
  }

  // 5. Multi-Zone Strategic Route Reachability across all 7 zones within Par 18
  assert.equal(ESCAPADE_STRATEGIC_ROUTES.length, 7);
  const maxThreeStrokeZoneBudget =
    (CLUB_SPECS.driver.nominalCarryMeters + CLUB_SPECS.driver.nominalRollMeters) * 2.2;
  for (let z = 1; z <= 7; z++) {
    const route = ESCAPADE_STRATEGIC_ROUTES.find((r) => r.zoneNumber === z);
    assert.ok(route, `Missing strategic route for Zone ${z}`);
    const legDist = distance2D(route.origin, route.targetPoint);
    assert.ok(
      legDist <= maxThreeStrokeZoneBudget,
      `Zone ${z} strategic route distance (${legDist.toFixed(1)}m) exceeds multi-shot zone budget`,
    );
  }
});

test('Stage 2.6 — Pass 2 Adversarial Audit: 240-Sample Flyover Clearance, Monotonic Course Distance, Forward Yaw, Open Sky Driver & Anchored Lights', () => {
  // 1. 240-Sample Flyover Spline Zero-Collision Clearance (Buildings, Walls, Ceiling Lintel, Ground & IRT Train Roof)
  const obstacleBoxes: Array<{ label: string; aabb: AABB3D }> = [];
  for (const bld of ESCAPADE_PERIMETER_BUILDINGS) {
    obstacleBoxes.push({ label: `bld:${bld.id}`, aabb: bld.aabb });
  }
  for (const sky of ESCAPADE_SKYLINE_BACKDROPS) {
    obstacleBoxes.push({ label: `sky:${sky.id}`, aabb: sky.aabb });
  }
  for (const wall of ESCAPADE_ARCHITECTURAL_WALLS) {
    obstacleBoxes.push({ label: `wall:${wall.id}`, aabb: wall.aabb });
  }
  for (const prop of ESCAPADE_COURSE_PROPS) {
    prop.solidColliders.forEach((col, idx) => {
      obstacleBoxes.push({ label: `prop:${prop.id}#${idx}`, aabb: col });
    });
  }

  const camRadius = 0.24;
  for (let i = 0; i <= 240; i++) {
    const t = i / 240;
    const [cx, cy, cz] = evaluateCatmullRomSpline3D(FLYOVER_SPLINE_POINTS, t);
    const groundY = getEscapadeGroundElevationAt(cx, cz);
    assert.ok(
      cy >= groundY + 0.55,
      `Flyover camera clips ground at t=${t.toFixed(3)} ([${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)}], groundY=${groundY.toFixed(2)})`,
    );

    if (cz >= 68.0) {
      assert.ok(
        cy <= SUBWAY_STATION_VAULT_SPEC.vaultCrownY - 0.65,
        `Flyover camera clips Subway Vault ceiling at t=${t.toFixed(3)} (y=${cy.toFixed(2)})`,
      );
    }

    const camBox: AABB3D = {
      min: [cx - camRadius, cy - camRadius, cz - camRadius],
      max: [cx + camRadius, cy + camRadius, cz + camRadius],
    };
    for (const obs of obstacleBoxes) {
      assert.equal(
        aabbsOverlap3D(camBox, obs.aabb),
        false,
        `Flyover camera at t=${t.toFixed(3)} ([${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)}]) collides with "${obs.label}"`,
      );
    }
  }

  // 2. Monotonic Centerline Arc-Length Distance (380.0m -> 0.0m) & Classic Hole 1 (102.0m -> 0.0m)
  assert.equal(computeRemainingCourseDistance(GRAND_ESCAPADE_MASTER_PLAN, [0, 0, 31]), 380);
  assert.equal(computeRemainingCourseDistance(GRAND_ESCAPADE_MASTER_PLAN, [34, -7.5, 119]), 0);

  let prevDist = Infinity;
  for (let s = 0; s <= 380; s += 5) {
    const [sx, sz] = sampleCourseCenterlineAtDistance(GRAND_ESCAPADE_MASTER_PLAN, s);
    const sy = getEscapadeGroundElevationAt(sx, sz);
    const rem = computeRemainingCourseDistance(GRAND_ESCAPADE_MASTER_PLAN, [sx, sy, sz]);
    assert.ok(
      rem < prevDist,
      `Centerline distance must strictly decrease at s=${s}m: got ${rem}m after ${prevDist}m`,
    );
    prevDist = rem;
  }

  let prevStationDist = Infinity;
  for (const tp of QA_TELEPORT_ZONE_LIST) {
    const rem = computeRemainingCourseDistance(GRAND_ESCAPADE_MASTER_PLAN, tp.position);
    assert.ok(
      rem < prevStationDist,
      `Teleport Zone ${tp.zoneNumber} remaining distance (${rem}m) must be strictly less than previous zone (${prevStationDist}m)`,
    );
    prevStationDist = rem;
  }

  // Classic Hole 1 monotonicity check (72.0m -> 0.0m)
  assert.ok(
    Math.abs(
      computeRemainingCourseDistance(COURSE_MASTER_PLAN, COURSE_MASTER_PLAN.teePosition) -
        COURSE_MASTER_PLAN.computedCenterlineMeters,
    ) < 0.05,
  );
  assert.equal(computeRemainingCourseDistance(COURSE_MASTER_PLAN, COURSE_MASTER_PLAN.cup.position), 0);

  // 3. Forward Course Yaw & Zone 5 Teleport Aim Sign Verification (Zero backwards horseshoe whip!)
  const z5 = QA_TELEPORT_ZONES[5];
  const z5AimVec = [Math.sin(z5.aimYaw), -Math.cos(z5.aimYaw)];
  assert.ok(
    z5AimVec[0] < -0.25 && z5AimVec[1] > 0.85,
    `Zone 5 teleport aimYaw (${z5.aimYaw}) must aim SSW (-X, +Z) into Copper Chute & Sky Driver deck, got [${z5AimVec[0].toFixed(3)}, ${z5AimVec[1].toFixed(3)}]`,
  );

  // Zones 1 & 2 forward yaw must face North (-Z, cos > 0.9), NOT South toward z=+119!
  for (const pos of [
    [0, 0, 31] as Vec3Tuple,
    [0, 0, 0] as Vec3Tuple,
    [0, 3.1, -42] as Vec3Tuple,
    [0, 6.3, -64] as Vec3Tuple,
  ]) {
    const yaw = computeForwardCourseYaw(GRAND_ESCAPADE_MASTER_PLAN, pos);
    const fwdZ = -Math.cos(yaw);
    assert.ok(fwdZ < -0.9, `Forward yaw at ${JSON.stringify(pos)} must point North (-Z), got fwdZ=${fwdZ}`);
  }
  // Zone 3 forward yaw must face East (+X, sin > 0.9)!
  const z3Yaw = computeForwardCourseYaw(GRAND_ESCAPADE_MASTER_PLAN, [18.5, 11.0, -84.0]);
  assert.ok(Math.sin(z3Yaw) > 0.9, `Zone 3 forward yaw must point East (+X), got yaw=${z3Yaw}`);

  // 4. Zone 4 Waist-High Belvedere Balustrade & Clear Panoramic Sightline
  const belvedereWall = ESCAPADE_ARCHITECTURAL_WALLS.find(
    (w) => w.id === 'wall-z4-viaduct-west-balustrade',
  )!;
  assert.ok(belvedereWall.topY <= 15.9, `Belvedere balustrade must be waist-high (<=15.9m), got ${belvedereWall.topY}`);

  const scoutOrigin = ESCAPADE_STREET_SCOUT_CAMERA.position;
  const scoutTarget = ESCAPADE_STREET_SCOUT_CAMERA.lookAt;
  const scoutDir: Vec3Tuple = [
    scoutTarget[0] - scoutOrigin[0],
    scoutTarget[1] - scoutOrigin[1],
    scoutTarget[2] - scoutOrigin[2],
  ];
  const scoutDist = Math.hypot(scoutDir[0], scoutDir[1], scoutDir[2]);
  for (const obs of obstacleBoxes) {
    const hit = intersectRayAABB3D(scoutOrigin, scoutDir, obs.aabb, scoutDist * 0.92);
    assert.equal(
      hit.hit,
      false,
      `Panoramic Scout Camera sightline is blocked by "${obs.label}" at t=${hit.tMin.toFixed(2)}m`,
    );
  }

  // 5. Zone 5 -> Zone 6 Unobstructed Sky Driver Plunge & Copper Chute Spout Landing
  const arrivalTerrace = ESCAPADE_GROUND_ZONES.find(
    (gz) => gz.id === 'zone-z6-chute-arrival-terrace',
  )!;
  const [spoutX, spoutY, spoutZ] = COPPER_SPIRAL_CHUTE_SPEC.exitSpoutPosition;
  assert.equal(spoutY, 2.0);
  assert.ok(
    spoutX >= arrivalTerrace.boundsXZ.minX + 0.5 &&
      spoutX <= arrivalTerrace.boundsXZ.maxX - 0.5 &&
      spoutZ >= arrivalTerrace.boundsXZ.minZ + 0.5 &&
      spoutZ <= arrivalTerrace.boundsXZ.maxZ - 0.5,
    `Copper chute exit spout [${spoutX}, ${spoutY}, ${spoutZ}] must land inside Zone 6 Arrival Terrace ${JSON.stringify(arrivalTerrace.boundsXZ)}`,
  );
  assert.equal(
    getEscapadeZoneAtPosition([spoutX, spoutY + 0.21, spoutZ]).zoneNumber,
    6,
    'Copper chute exit spout landing must resolve to Zone 6',
  );

  const skyDriverCorridor: AABB3D = {
    min: [49.0, 3.0, 11.5],
    max: [61.0, 22.0, 23.5],
  };
  for (const bld of ESCAPADE_PERIMETER_BUILDINGS) {
    assert.equal(
      aabbsOverlap3D(skyDriverCorridor, bld.aabb),
      false,
      `Building "${bld.id}" blocks Zone 5 -> Zone 6 Sky Driver aerial plunge corridor`,
    );
  }

  // 6. Unclamped Copper Chute QA Bounds, Open-Throat Subway Headhouse, Pitched Skylight & Wall-Anchored String Lights
  const chuteQa = GRAND_ESCAPADE_QA_PROP_SPECS.find((q) => q.id === 'qa-prop-copper-spiral-chute')!;
  const chuteProp = ESCAPADE_COURSE_PROPS.find((p) => p.id === 'esc-z5-copper-spiral-chute')!;
  for (const wp of COPPER_SPIRAL_CHUTE_SPEC.waypoints) {
    const localX = wp[0] - chuteProp.position[0];
    const localZ = wp[2] - chuteProp.position[2];
    const outerReach = 0.65; // half channel width + rim
    assert.ok(
      Math.abs(localX) + outerReach <= chuteQa.localBoundsMax[0] &&
        Math.abs(localZ) + outerReach <= chuteQa.localBoundsMax[2],
      `Chute waypoint [${wp[0]}, ${wp[2]}] + rim exceeds /qa-gallery bounds ±${chuteQa.localBoundsMax[0]}m`,
    );
  }

  const headhouse = ESCAPADE_COURSE_PROPS.find((p) => p.id === 'esc-z6-subway-headhouse-portal')!;
  assert.equal(headhouse.escapadePropType, 'grand_subway_headhouse');
  // Center entry ball lane at x=34.0, y=0..2.8m, z=55.0..59.0 must be 100% open!
  const headhouseEntryBallLane: AABB3D = {
    min: [30.2, 0.0, 55.0],
    max: [37.8, 2.8, 59.0],
  };
  for (const col of headhouse.solidColliders) {
    assert.equal(
      aabbsOverlap3D(headhouseEntryBallLane, col),
      false,
      'Zone 6 Subway Headhouse collider blocks open entry throat',
    );
  }

  const skylight = ESCAPADE_COURSE_PROPS.find((p) => p.id === 'esc-z3-angled-skylight-bank')!;
  assert.ok(skylight.pitchedBankMeta, 'Skylight must define pitchedBankMeta for true inclined reflection');
  assert.ok(skylight.pitchedBankMeta.worldNormal[1] > 0.75);
  assert.ok(skylight.pitchedBankMeta.worldNormal[2] < -0.35, 'Skylight pitched glass must face North toward rooftop fairway');

  const steamGrate = ESCAPADE_COURSE_PROPS.find((p) => p.id === 'esc-z2-terrace-b-steam-grate')!;
  assert.ok(steamGrate.steamLiftMeta, 'Zone 2 steam grate must define steamLiftMeta');

  // Verify EVERY string light endpoint is flush-anchored within <= 0.08m of a building facade or pergola structure!
  const anchorHosts: AABB3D[] = [
    ...ESCAPADE_PERIMETER_BUILDINGS.map((b) => b.aabb),
    computeAABBFromBoundsXZ(
      ESCAPADE_TRATTORIA_PERGOLA.boundsXZ,
      ESCAPADE_TRATTORIA_PERGOLA.groundY,
      ESCAPADE_TRATTORIA_PERGOLA.groundY + ESCAPADE_TRATTORIA_PERGOLA.beamClearHeight + 0.25,
    ),
    ...ESCAPADE_COURSE_PROPS.filter((p) => p.escapadePropType === 'greenhouse_pergola').map((p) => p.aabb),
  ];
  for (const span of ESCAPADE_STRING_LIGHT_SPANS) {
    for (const [endName, pt] of [
      ['startAnchor', span.startAnchor],
      ['endAnchor', span.endAnchor],
    ] as const) {
      const probe: AABB3D = {
        min: [pt[0] - 0.08, pt[1] - 0.08, pt[2] - 0.08],
        max: [pt[0] + 0.08, pt[1] + 0.08, pt[2] + 0.08],
      };
      const anchored = anchorHosts.some((host) => aabbsOverlap3D(probe, host, -1e-4));
      assert.equal(
        anchored,
        true,
        `String light "${span.id}" ${endName} ${JSON.stringify(pt)} floats in mid-air (must touch building/pergola within 0.08m)`,
      );
    }
  }
});

test('Stage 2.7 — Pass 3 Adversarial Audit: Zone 7 Pilaster Non-Coplanarity, Zone 5 Open-Air Copper Chute & Flyover Frustum', () => {
  // 1. Zone 7 Guastavino Vault Pilasters: ZERO coplanarity with x=22.00 / x=46.00 walls & ±0.04m wall trims
  const vault = SUBWAY_STATION_VAULT_SPEC;
  const clearSpanW = vault.boundsXZ.maxX - vault.boundsXZ.minX; // 24.0m
  const centerX = (vault.boundsXZ.minX + vault.boundsXZ.maxX) * 0.5; // 34.0m
  const archSpec = buildVaultedSubwayArchSpec({
    clearSpanWidth: clearSpanW,
    springlineHeight: vault.vaultSpringlineY - vault.platformFloorY,
    archRiseHeight: vault.vaultCrownY - vault.vaultSpringlineY,
  });

  const leftMinX = centerX + archSpec.leftPilaster.position[0] - archSpec.leftPilaster.size[0] * 0.5;
  const leftMaxX = centerX + archSpec.leftPilaster.position[0] + archSpec.leftPilaster.size[0] * 0.5;
  const rightMinX = centerX + archSpec.rightPilaster.position[0] - archSpec.rightPilaster.size[0] * 0.5;
  const rightMaxX = centerX + archSpec.rightPilaster.position[0] + archSpec.rightPilaster.size[0] * 0.5;

  // Must sit strictly inside [22.045 .. 45.955] (clearing 22.00 wall + 0.04m wall pilasters) AND protrude >= 0.24m into concourse!
  assert.ok(
    leftMinX >= vault.boundsXZ.minX + 0.045 && leftMaxX >= vault.boundsXZ.minX + 0.24,
    `Zone 7 West vault pilaster [${leftMinX.toFixed(3)}, ${leftMaxX.toFixed(3)}] is coplanar/too close to West wall (${vault.boundsXZ.minX})`,
  );
  assert.ok(
    rightMaxX <= vault.boundsXZ.maxX - 0.045 && rightMinX <= vault.boundsXZ.maxX - 0.24,
    `Zone 7 East vault pilaster [${rightMinX.toFixed(3)}, ${rightMaxX.toFixed(3)}] is coplanar/too close to East wall (${vault.boundsXZ.maxX})`,
  );

  // Every arch rib Z must clear backlit station mosaic signs (z = 88.0 ± 2.25, 108.0 ± 2.25) and wall sconces
  for (const rz of vault.archRibZs) {
    for (const signZ of [88.0, 108.0]) {
      assert.ok(
        Math.abs(rz - signZ) >= 3.2,
        `Vault arch rib at z=${rz} overlaps backlit station sign at z=${signZ}±2.25`,
      );
    }
    for (const sp of vault.sconcePositions) {
      if (sp[2] < vault.boundsXZ.maxZ - 1.0) {
        assert.ok(
          Math.abs(rz - sp[2]) >= 1.5,
          `Vault arch rib at z=${rz} collides with wall sconce at z=${sp[2]}`,
        );
      }
    }
  }

  // 2. Zone 5 Open-Air Copper Spiral Chute Mouth: ZERO elevated slab burial or rim poke-through
  assert.deepEqual(COPPER_SPIRAL_CHUTE_SPEC.helixPivotXZ, [52.0, 10.5]);
  assert.deepEqual(COPPER_SPIRAL_CHUTE_SPEC.entryPosition, [52.0, 14.0, 8.0]);
  assert.equal(
    ESCAPADE_GROUND_ZONES.some((gz) => gz.id === 'zone-z5-chute-funnel-apron'),
    false,
    'zone-z5-chute-funnel-apron must be removed so Copper Spiral Chute coils sit in pure open air',
  );
  assert.equal(
    ESCAPADE_ARCHITECTURAL_WALLS.some((w) => w.id === 'wall-z5-chute-guide-back'),
    false,
    'wall-z5-chute-guide-back must be removed so Copper Spiral Chute mouth opens freely at z=8.0',
  );

  const openAirChuteCylinderBox: AABB3D = {
    min: [48.6, 2.5, 8.05],
    max: [55.4, 15.0, 13.8],
  };
  for (const gz of ESCAPADE_GROUND_ZONES) {
    const gzBox = computeAABBFromBoundsXZ(gz.boundsXZ, gz.topY - gz.slabThickness, gz.topY);
    assert.equal(
      aabbsOverlap3D(openAirChuteCylinderBox, gzBox),
      false,
      `Ground slab "${gz.id}" buries/slices open-air Copper Spiral Chute coils`,
    );
  }
  for (const ramp of GRAND_ESCAPADE_MASTER_PLAN.ramps) {
    assert.equal(
      aabbsOverlap3D(openAirChuteCylinderBox, ramp.aabb),
      false,
      `Ramp "${ramp.id}" encroaches into open-air Copper Spiral Chute coils`,
    );
  }
  for (const wall of ESCAPADE_ARCHITECTURAL_WALLS) {
    assert.equal(
      aabbsOverlap3D(openAirChuteCylinderBox, wall.aabb),
      false,
      `Wall "${wall.id}" intersects open-air Copper Spiral Chute coils`,
    );
  }

  // Copper chute central support mast at [52.0, 2.0, 10.5] must stand squarely on Zone 6 +2.0m Arrival Terrace
  assert.equal(getEscapadeGroundElevationAt(52.0, 10.5), 2.0);
  assert.equal(getEscapadeZoneAtPosition([52.0, 2.2, 10.5]).zoneNumber, 6);

  // 3. Flyover Spline Visual Cylinder Clearance & Burst Frame Sightline Audit (00:04 Viaduct & F07 Zone 5->6)
  for (let i = 0; i <= 240; i++) {
    const t = i / 240;
    const [cx, cy, cz] = evaluateCatmullRomSpline3D(FLYOVER_SPLINE_POINTS, t);
    if (cy <= 14.8 && cy >= 1.8) {
      const distToChuteAxis = Math.hypot(
        cx - COPPER_SPIRAL_CHUTE_SPEC.helixPivotXZ[0],
        cz - COPPER_SPIRAL_CHUTE_SPEC.helixPivotXZ[1],
      );
      assert.ok(
        distToChuteAxis >= 3.45,
        `Flyover spline at t=${t.toFixed(3)} ([${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)}]) passes inside Copper Spiral Chute visual cylinder (r=${distToChuteAxis.toFixed(2)}m < 3.45m)`,
      );
    }
  }

  // At t = 0.40 (00:04 in flyover_scout.webm), StoneViaductArch piers must NOT block sightline or sit inside ±43° 16:9 frustum!
  const viaductArch = ESCAPADE_COURSE_PROPS.find((p) => p.id === 'esc-z4-viaduct-triumphal-arch')!;
  const posAt04 = evaluateCatmullRomSpline3D(FLYOVER_SPLINE_POINTS, 0.4);
  const lookAt04 = evaluateCatmullRomSpline3D(FLYOVER_LOOKAT_POINTS, 0.4);
  const dir04: Vec3Tuple = [
    lookAt04[0] - posAt04[0],
    lookAt04[1] - posAt04[1],
    lookAt04[2] - posAt04[2],
  ];
  for (const col of viaductArch.solidColliders) {
    const hit = intersectRayAABB3D(posAt04, dir04, col, 40);
    assert.equal(hit.hit, false, 'Flyover sightline at t=0.40 hits Stone Viaduct Arch pier');
  }
  const fLenXZ = Math.hypot(dir04[0], dir04[2]);
  const toWestPierXZ = [51.2 - posAt04[0], -56.8 - posAt04[2]];
  const pLenXZ = Math.hypot(toWestPierXZ[0], toWestPierXZ[1]);
  const cosAngleToPier = (dir04[0] * toWestPierXZ[0] + dir04[2] * toWestPierXZ[1]) / (fLenXZ * pLenXZ);
  assert.ok(
    cosAngleToPier < Math.cos((46 * Math.PI) / 180),
    `Viaduct West pier is still inside horizontal 16:9 frustum at t=0.40 (cos=${cosAngleToPier.toFixed(3)})`,
  );

  // At F07 (t = 6/11 ≈ 0.5455 in burst_flyover_scout.png), camera must be in open air past z=8.0 with gentle -12°..-28° pitch!
  const tF07 = 6 / 11;
  const posF07 = evaluateCatmullRomSpline3D(FLYOVER_SPLINE_POINTS, tF07);
  const lookF07 = evaluateCatmullRomSpline3D(FLYOVER_LOOKAT_POINTS, tF07);
  assert.ok(
    posF07[2] > 8.05,
    `Flyover F07 (${JSON.stringify(posF07)}) must be South of z=8.0 Penthouse roof edge so floor tiles never fill frame`,
  );
  const groundAtF07 = getEscapadeGroundElevationAt(posF07[0], posF07[2]);
  assert.equal(groundAtF07, 2.0);
  const dxF07 = lookF07[0] - posF07[0];
  const dyF07 = lookF07[1] - posF07[1];
  const dzF07 = lookF07[2] - posF07[2];
  const pitchDegF07 = (Math.atan2(dyF07, Math.hypot(dxF07, dzF07)) * 180) / Math.PI;
  assert.ok(
    pitchDegF07 >= -28.0 && pitchDegF07 <= -12.0,
    `Flyover F07 pitch (${pitchDegF07.toFixed(1)}°) must be a sweeping aerial overlook in [-28°, -12°], not staring into floor tiles`,
  );
});
