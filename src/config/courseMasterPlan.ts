import {
  BALL_RADIUS,
  CLUB_SPECS,
  CUP_APRON_RADIUS,
  CUP_DEPTH,
  CUP_RADIUS,
  WORLD_GRAVITY_Y,
} from '../types/clubs';
import {
  ELEVATIONS,
  type AABB3D,
  type AllowedGroundDatum,
  type ArchitecturalWallSpec,
  type AuditCameraStationSpec,
  type CenterlineSegmentSpec,
  type CourseMasterPlan,
  type CoursePropSpec,
  type CourtyardPergolaSpec,
  type CrosswalkLandingPadSpec,
  type GeneratedCityCourse,
  type GroundSurfaceZoneSpec,
  type HoleCupSpec,
  type PerimeterBuildingSpec,
  type PhysicsSurfaceTag,
  type StoneCurbSegmentSpec,
  type StormDrainGrateSpec,
  type StormGutterTrackSpec,
  type StrategicShotRouteSpec,
  type StreetScoutCameraSpec,
  type StringLightSpanSpec,
  type VanLoadingZoneSpec,
  type Vec2Tuple,
  type Vec3Tuple,
  type WalkableRampSpec,
} from '../types/course';
import {
  computeAABBFromBoundsXZ,
  computeAwningBounceVelocity,
  computeCenteredBoxAABB,
  computePitchedAwningNormal,
  computeRotatedAABB,
  distance2D,
  intersectRayAABB2D,
  intersectRayAABB3D,
} from '../lib/geometryHelpers';

// ============================================================================
// MASTER ARCHITECTURAL CAD FLOORPLAN — "HOLE 1: 5TH & MERCER" (PAR 4, 72.0M)
// ============================================================================

export const TEE_POSITION: Vec3Tuple = [0.0, ELEVATIONS.ROAD_ASPHALT_Y, 27.52];

/**
 * Stand golf bag local offset from TEE_POSITION (nudged 0.28m further West to x = -1.42m
 * so default & oblique tee sightlines stay wide open while keeping > 2.1m West curb clearance).
 */
export const TEE_STAND_BAG_OFFSET: Vec3Tuple = [-1.42, 0.0, 0.18];

export const TEE_SET_LOCAL_BOUNDS = {
  min: [-1.84, 0.0, -0.54] as Vec3Tuple,
  max: [0.96, 1.0, 0.54] as Vec3Tuple,
  size: [2.8, 1.0, 1.08] as Vec3Tuple,
} as const;

export const A_POSITION_CROSSWALK: CrosswalkLandingPadSpec = {
  id: 'crosswalk-a-position',
  center: [-1.2, ELEVATIONS.ROAD_ASPHALT_Y, -16.5],
  boundsXZ: {
    minX: -3.55,
    maxX: 3.55,
    minZ: -17.8,
    maxZ: -14.8,
  },
  stripeCount: 7,
  elevationY: ELEVATIONS.ROAD_ASPHALT_Y,
};

export const VAN_LOADING_ZONE: VanLoadingZoneSpec = {
  id: 'curbside-van-loading-zone',
  boundsXZ: {
    minX: 1.0,
    maxX: 3.55,
    minZ: -11.2,
    maxZ: -3.0,
  },
  elevationY: ELEVATIONS.ROAD_ASPHALT_Y,
  stripeAngleDeg: 38,
};

export const HOLE_1_CUP: HoleCupSpec = {
  id: 'cup-hole-1-mercer-courtyard',
  flagColor: 'red',
  position: [24.6, ELEVATIONS.COURTYARD_GREEN_Y, -21.6],
  elevationY: ELEVATIONS.COURTYARD_GREEN_Y,
  cupRadius: CUP_RADIUS,
  cupDepth: CUP_DEPTH,
  apronRadius: 2.75, // >= CUP_APRON_RADIUS (1.5m)
  pinHeight: 2.35,
};

export const FOUNTAIN_QUICK_DROP_POSITION: Vec3Tuple = [
  19.35,
  ELEVATIONS.COURTYARD_GREEN_Y,
  -18.9,
];

export const CENTERLINE_SEGMENTS: CenterlineSegmentSpec[] = [
  {
    id: 'centerline-leg-1-5th-ave',
    kind: 'straight',
    label: '5th Ave Northbound Corridor (Tee to Dogleg Turn)',
    startXZ: [0.0, 27.52],
    endXZ: [0.0, -17.6],
    lengthMeters: 45.12,
  },
  {
    id: 'centerline-dogleg-right-90',
    kind: 'arc_right_90',
    label: '5th & Mercer 90-Degree Dogleg Right Intersection Turn',
    startXZ: [0.0, -17.6],
    endXZ: [4.0, -21.6],
    arcPivotXZ: [4.0, -17.6],
    arcRadius: 4.0,
    startAngleRad: Math.PI,
    endAngleRad: Math.PI * 1.5,
    lengthMeters: Number(((Math.PI * 0.5) * 4.0).toFixed(4)), // 6.2832m
  },
  {
    id: 'centerline-leg-2-mercer-to-cup',
    kind: 'straight',
    label: 'Mercer Approach, Courtyard Stone Ramp & Pocket-Park Green to Cup',
    startXZ: [4.0, -21.6],
    endXZ: [24.6, -21.6],
    lengthMeters: 20.6,
  },
];

export const COMPUTED_CENTERLINE_METERS = Number(
  CENTERLINE_SEGMENTS.reduce((acc, s) => acc + s.lengthMeters, 0).toFixed(2),
); // 72.00m

function makeGroundZone(
  spec: Omit<GroundSurfaceZoneSpec, 'aabb'>,
): GroundSurfaceZoneSpec {
  return {
    ...spec,
    aabb: computeAABBFromBoundsXZ(
      spec.boundsXZ,
      spec.topY - spec.slabThickness,
      spec.topY,
    ),
  };
}

export const GROUND_ZONES: GroundSurfaceZoneSpec[] = [
  // 1. Recessed Brick Subway Entrance Plaza behind Tee (y = +0.15m)
  makeGroundZone({
    id: 'zone-south-subway-plaza',
    label: 'South Recessed Brick Subway Entrance Plaza',
    surfaceTag: 'subway_brick_plaza',
    boundsXZ: { minX: -7.25, maxX: 7.25, minZ: 28.2, maxZ: 38.2 },
    topY: ELEVATIONS.SIDEWALK_Y,
    slabThickness: 0.8,
    friction: 0.62,
    restitution: 0.42,
    rollDamping: 1.35,
  }),

  // 2. 5th Avenue Roadway Asphalt (y = 0.00m)
  makeGroundZone({
    id: 'zone-5th-ave-road-asphalt',
    label: '5th Avenue Asphalt Roadway',
    surfaceTag: 'road_asphalt',
    boundsXZ: { minX: -3.55, maxX: 3.55, minZ: -25.55, maxZ: 28.2 },
    topY: ELEVATIONS.ROAD_ASPHALT_Y,
    slabThickness: 0.65,
    friction: 0.52,
    restitution: 0.48,
    rollDamping: 1.05,
  }),

  // 3. Painted Crosswalk "A-Position" Landing Pad (y = 0.00m)
  makeGroundZone({
    id: 'zone-crosswalk-a-position',
    label: 'Crosswalk A-Position Landing Pad',
    surfaceTag: 'crosswalk_landing',
    boundsXZ: A_POSITION_CROSSWALK.boundsXZ,
    topY: ELEVATIONS.ROAD_ASPHALT_Y,
    slabThickness: 0.02,
    friction: 0.58,
    restitution: 0.44,
    rollDamping: 1.2,
  }),

  // 4. Painted Curbside Delivery Van Loading Zone (y = 0.00m)
  makeGroundZone({
    id: 'zone-van-loading-stripes',
    label: 'Curbside Bodega Delivery Loading Zone',
    surfaceTag: 'loading_zone_asphalt',
    boundsXZ: VAN_LOADING_ZONE.boundsXZ,
    topY: ELEVATIONS.ROAD_ASPHALT_Y,
    slabThickness: 0.02,
    friction: 0.54,
    restitution: 0.48,
    rollDamping: 1.08,
  }),

  // 5. Mercer Street Asphalt Approach (y = 0.00m, connecting 5th Ave to Courtyard Ramp at x = 14.50)
  makeGroundZone({
    id: 'zone-mercer-road-asphalt',
    label: 'Mercer Street Asphalt Approach',
    surfaceTag: 'road_asphalt',
    boundsXZ: { minX: 3.55, maxX: 14.5, minZ: -25.55, maxZ: -18.45 },
    topY: ELEVATIONS.ROAD_ASPHALT_Y,
    slabThickness: 0.65,
    friction: 0.52,
    restitution: 0.48,
    rollDamping: 1.05,
  }),

  // 5b. SE 5th & Mercer Intersection Roadway Spandrel outside r = 2.65m curved storm gutter (y = 0.00m)
  makeGroundZone({
    id: 'zone-se-corner-road-spandrel',
    label: 'SE 5th & Mercer Corner Roadway Asphalt Spandrel',
    surfaceTag: 'loading_zone_asphalt',
    boundsXZ: { minX: 3.55, maxX: 6.2, minZ: -18.45, maxZ: -15.8 },
    arcClip: {
      pivotXZ: [6.2, -15.8],
      radius: 2.65,
      keepSide: 'outside',
      quadrant: 'sw',
    },
    topY: ELEVATIONS.ROAD_ASPHALT_Y,
    slabThickness: 0.65,
    friction: 0.52,
    restitution: 0.48,
    rollDamping: 1.05,
  }),

  // 6. West 5th Ave Sidewalk (y = +0.15m, hosting the Flush Scaffolding Shed)
  makeGroundZone({
    id: 'zone-west-5th-sidewalk',
    label: 'West 5th Ave Limestone Sidewalk',
    surfaceTag: 'sidewalk_paver',
    boundsXZ: { minX: -7.25, maxX: -4.0, minZ: -29.25, maxZ: 28.2 },
    topY: ELEVATIONS.SIDEWALK_Y,
    slabThickness: 0.8,
    friction: 0.5,
    restitution: 0.46,
    rollDamping: 0.98,
  }),

  // 7. East 5th Ave Sidewalk (y = +0.15m, hosting Bodega & Overhanging Street Tree Pit)
  makeGroundZone({
    id: 'zone-east-5th-sidewalk',
    label: 'East 5th Ave Limestone Sidewalk',
    surfaceTag: 'sidewalk_paver',
    boundsXZ: { minX: 4.0, maxX: 7.25, minZ: -14.75, maxZ: 28.2 },
    topY: ELEVATIONS.SIDEWALK_Y,
    slabThickness: 0.8,
    friction: 0.5,
    restitution: 0.46,
    rollDamping: 0.98,
  }),

  // 8. North Mercer Corner & Corridor Sidewalk (y = +0.15m)
  makeGroundZone({
    id: 'zone-north-mercer-sidewalk',
    label: 'North Mercer Corner & Promenade Sidewalk',
    surfaceTag: 'sidewalk_paver',
    boundsXZ: { minX: -4.0, maxX: 14.5, minZ: -29.25, maxZ: -26.0 },
    topY: ELEVATIONS.SIDEWALK_Y,
    slabThickness: 0.8,
    friction: 0.5,
    restitution: 0.46,
    rollDamping: 0.98,
  }),

  // 9. Wide SE Corner Vendor Plaza Sidewalk Apron (y = +0.15m, clipped cleanly at r <= 2.20m inside curved gutter)
  makeGroundZone({
    id: 'zone-se-vendor-corner-apron',
    label: 'SE Corner Hotdog Vendor Plaza Apron',
    surfaceTag: 'sidewalk_paver',
    boundsXZ: { minX: 4.0, maxX: 19.0, minZ: -18.0, maxZ: -14.75 },
    arcClip: {
      pivotXZ: [6.2, -15.8],
      radius: 2.2,
      keepSide: 'inside',
      quadrant: 'sw',
    },
    topY: ELEVATIONS.SIDEWALK_Y,
    slabThickness: 0.8,
    friction: 0.5,
    restitution: 0.46,
    rollDamping: 0.98,
  }),

  // 10. Elevated Pocket-Park Courtyard Stone Terrace (y = +0.60m)
  makeGroundZone({
    id: 'zone-courtyard-stone-terrace',
    label: 'Elevated Pocket-Park Courtyard Limestone Piazza',
    surfaceTag: 'courtyard_paver',
    boundsXZ: { minX: 19.0, maxX: 33.5, minZ: -30.5, maxZ: -13.5 },
    topY: ELEVATIONS.COURTYARD_GREEN_Y,
    slabThickness: 1.25,
    friction: 0.6,
    restitution: 0.4,
    rollDamping: 1.45,
  }),

  // 11. Courtyard AstroTurf Green Fringe Collar (y = +0.60m)
  makeGroundZone({
    id: 'zone-courtyard-green-fringe',
    label: 'Pocket-Park Putting Green Fringe Collar',
    surfaceTag: 'green_fringe_collar',
    boundsXZ: { minX: 21.6, maxX: 30.8, minZ: -26.0, maxZ: -17.4 },
    topY: ELEVATIONS.COURTYARD_GREEN_Y,
    slabThickness: 0.04,
    friction: 0.74,
    restitution: 0.34,
    rollDamping: 2.35,
  }),

  // 12. Sunlit AstroTurf Pocket-Park Putting Green (y = +0.60m)
  makeGroundZone({
    id: 'zone-courtyard-putting-green',
    label: 'Sunlit AstroTurf Pocket-Park Putting Green',
    surfaceTag: 'putting_green_turf',
    boundsXZ: { minX: 22.1, maxX: 30.2, minZ: -25.4, maxZ: -18.0 },
    topY: ELEVATIONS.COURTYARD_GREEN_Y,
    slabThickness: 0.05,
    friction: 0.66,
    restitution: 0.32,
    rollDamping: 1.65,
  }),

  // 13. North Café Terrace Patio Rough (y = +0.60m — damping rough, never unfair OOB)
  makeGroundZone({
    id: 'zone-courtyard-patio-rough-north',
    label: 'North Café Bistro Terrace Patio Rough',
    surfaceTag: 'patio_rough',
    boundsXZ: { minX: 19.2, maxX: 33.3, minZ: -30.4, maxZ: -26.3 },
    topY: ELEVATIONS.COURTYARD_GREEN_Y,
    slabThickness: 0.04,
    friction: 0.92,
    restitution: 0.25,
    rollDamping: 5.4,
  }),

  // 14. South Café Terrace Patio Rough (y = +0.60m — damping rough, never unfair OOB)
  makeGroundZone({
    id: 'zone-courtyard-patio-rough-south',
    label: 'South Café Bistro Terrace Patio Rough',
    surfaceTag: 'patio_rough',
    boundsXZ: { minX: 21.5, maxX: 33.3, minZ: -17.2, maxZ: -13.6 },
    topY: ELEVATIONS.COURTYARD_GREEN_Y,
    slabThickness: 0.04,
    friction: 0.92,
    restitution: 0.25,
    rollDamping: 5.4,
  }),
];

// ============================================================================
// RECESSED STORM-DRAIN GUTTERS (y = -0.02m, width = 0.45m) & GRATES
// ============================================================================

export const STORM_GUTTERS: StormGutterTrackSpec[] = [
  {
    id: 'gutter-west-5th-straight',
    label: 'West 5th Ave Storm-Drain Gutter',
    kind: 'straight',
    width: 0.45,
    channelY: ELEVATIONS.GUTTER_CHANNEL_Y,
    depthBelowRoad: 0.02,
    adjacentCurbTopY: ELEVATIONS.SIDEWALK_Y,
    start: [-3.775, ELEVATIONS.GUTTER_CHANNEL_Y, 28.2],
    end: [-3.775, ELEVATIONS.GUTTER_CHANNEL_Y, -25.775],
    aabb: computeAABBFromBoundsXZ(
      { minX: -4.0, maxX: -3.55, minZ: -26.0, maxZ: 28.2 },
      -0.25,
      ELEVATIONS.GUTTER_CHANNEL_Y,
    ),
  },
  {
    id: 'gutter-east-5th-straight',
    label: 'East 5th Ave Storm-Drain Gutter (Feeds 90° Corner Boost)',
    kind: 'straight',
    width: 0.45,
    channelY: ELEVATIONS.GUTTER_CHANNEL_Y,
    depthBelowRoad: 0.02,
    adjacentCurbTopY: ELEVATIONS.SIDEWALK_Y,
    start: [3.775, ELEVATIONS.GUTTER_CHANNEL_Y, 28.2],
    end: [3.775, ELEVATIONS.GUTTER_CHANNEL_Y, -15.8],
    aabb: computeAABBFromBoundsXZ(
      { minX: 3.55, maxX: 4.0, minZ: -15.8, maxZ: 28.2 },
      -0.25,
      ELEVATIONS.GUTTER_CHANNEL_Y,
    ),
  },
  {
    id: 'gutter-corner-se-90',
    label: 'SE 90-Degree Curved Storm-Drain Gutter Boost Track',
    kind: 'corner_90',
    width: 0.45,
    channelY: ELEVATIONS.GUTTER_CHANNEL_Y,
    depthBelowRoad: 0.02,
    adjacentCurbTopY: ELEVATIONS.SIDEWALK_Y,
    arcPivot: [6.2, ELEVATIONS.GUTTER_CHANNEL_Y, -15.8],
    arcRadius: 2.425,
    // At theta = PI: x = 6.2 - 2.425 = 3.775, z = -15.80 (exact match to East 5th gutter!)
    // At theta = 1.5*PI: x = 6.20, z = -15.80 - 2.425 = -18.225 (exact match to Mercer South gutter!)
    startAngleRad: Math.PI,
    endAngleRad: Math.PI * 1.5,
    waterBoostVelocity: [11.8, 0.0, 0.0],
    aabb: computeAABBFromBoundsXZ(
      { minX: 3.55, maxX: 6.2, minZ: -18.45, maxZ: -15.8 },
      -0.25,
      ELEVATIONS.GUTTER_CHANNEL_Y,
    ),
  },
  {
    id: 'gutter-mercer-south-straight',
    label: 'Mercer South Storm-Drain Gutter (Feeds Flush Courtyard Ramp)',
    kind: 'straight',
    width: 0.45,
    channelY: ELEVATIONS.GUTTER_CHANNEL_Y,
    depthBelowRoad: 0.02,
    adjacentCurbTopY: ELEVATIONS.SIDEWALK_Y,
    start: [6.2, ELEVATIONS.GUTTER_CHANNEL_Y, -18.225],
    end: [14.5, ELEVATIONS.GUTTER_CHANNEL_Y, -18.225],
    waterBoostVelocity: [11.8, 0.0, 0.0],
    aabb: computeAABBFromBoundsXZ(
      { minX: 6.2, maxX: 14.5, minZ: -18.45, maxZ: -18.0 },
      -0.25,
      ELEVATIONS.GUTTER_CHANNEL_Y,
    ),
  },
  {
    id: 'gutter-mercer-north-straight',
    label: 'Mercer North Storm-Drain Gutter',
    kind: 'straight',
    width: 0.45,
    channelY: ELEVATIONS.GUTTER_CHANNEL_Y,
    depthBelowRoad: 0.02,
    adjacentCurbTopY: ELEVATIONS.SIDEWALK_Y,
    start: [-3.775, ELEVATIONS.GUTTER_CHANNEL_Y, -25.775],
    end: [14.5, ELEVATIONS.GUTTER_CHANNEL_Y, -25.775],
    aabb: computeAABBFromBoundsXZ(
      { minX: -4.0, maxX: 14.5, minZ: -26.0, maxZ: -25.55 },
      -0.25,
      ELEVATIONS.GUTTER_CHANNEL_Y,
    ),
  },
];

export const STORM_DRAIN_GRATES: StormDrainGrateSpec[] = [
  {
    id: 'storm-grate-corner-hydrant',
    gutterId: 'gutter-east-5th-straight',
    // Exact 0.50m horizontal distance from hydrant-corner-se at [4.30, 0.15, -15.30]!
    position: [3.8, ELEVATIONS.GUTTER_CHANNEL_Y, -15.3],
    size: [0.4, 0.02, 0.62],
    rotationY: 0,
    aabb: computeCenteredBoxAABB([3.8, -0.02, -15.3], [0.4, 0.02, 0.62], 0),
  },
  {
    id: 'storm-grate-west-mid',
    gutterId: 'gutter-west-5th-straight',
    position: [-3.775, ELEVATIONS.GUTTER_CHANNEL_Y, 14.0],
    size: [0.4, 0.02, 0.62],
    rotationY: 0,
    aabb: computeCenteredBoxAABB([-3.775, -0.02, 14.0], [0.4, 0.02, 0.62], 0),
  },
  {
    id: 'storm-grate-east-south',
    gutterId: 'gutter-east-5th-straight',
    position: [3.775, ELEVATIONS.GUTTER_CHANNEL_Y, 12.0],
    size: [0.4, 0.02, 0.62],
    rotationY: 0,
    aabb: computeCenteredBoxAABB([3.775, -0.02, 12.0], [0.4, 0.02, 0.62], 0),
  },
  {
    id: 'storm-grate-mercer-north',
    gutterId: 'gutter-mercer-north-straight',
    position: [8.5, ELEVATIONS.GUTTER_CHANNEL_Y, -25.775],
    size: [0.62, 0.02, 0.4],
    rotationY: 0,
    aabb: computeCenteredBoxAABB([8.5, -0.02, -25.775], [0.62, 0.02, 0.4], 0),
  },
];

// ============================================================================
// CONTINUOUS 0.15M STONE CURBS & WALKABLE RAMPS
// ============================================================================

function makeCurb(
  id: string,
  label: string,
  kind: StoneCurbSegmentSpec['kind'],
  centerXZ: Vec2Tuple,
  sizeXZ: Vec2Tuple,
  rotationY = 0,
  extra: Partial<StoneCurbSegmentSpec> = {},
): StoneCurbSegmentSpec {
  const bottomY = ELEVATIONS.GUTTER_CHANNEL_Y;
  const topY = ELEVATIONS.SIDEWALK_Y;
  const height = topY - bottomY; // 0.17m total wall face (0.15m above road asphalt)
  const center: Vec3Tuple = [centerXZ[0], (bottomY + topY) * 0.5, centerXZ[1]];
  const size: Vec3Tuple = [sizeXZ[0], height, sizeXZ[1]];
  return {
    id,
    label,
    kind,
    bottomY,
    topY,
    height: ELEVATIONS.CURB_HEIGHT,
    center,
    size,
    rotationY,
    restitution: 0.68,
    friction: 0.32,
    aabb: computeCenteredBoxAABB(center, size, rotationY),
    ...extra,
  };
}

export const STONE_CURBS: StoneCurbSegmentSpec[] = [
  makeCurb(
    'curb-south-tee-backstop',
    'South Subway Plaza Threshold Curb',
    'straight',
    [0.0, 28.325],
    [8.5, 0.25],
  ),
  makeCurb(
    'curb-west-5th-south-seg',
    'West 5th Ave Curb (Tee to South ADA Ramp)',
    'straight',
    [-4.125, 25.6],
    [0.25, 5.2],
  ),
  makeCurb(
    'curb-west-5th-mid-seg',
    'West 5th Ave Curb (Scaffolding Corridor)',
    'straight',
    [-4.125, 3.25],
    [0.25, 33.5],
  ),
  makeCurb(
    'curb-west-5th-north-seg',
    'West 5th Ave Curb (North of Crosswalk Ramp)',
    'straight',
    [-4.125, -21.375],
    [0.25, 9.75],
  ),
  makeCurb(
    'curb-east-5th-main',
    'East 5th Ave Continuous 15cm Stone Curb',
    'straight',
    [4.125, 6.2],
    [0.25, 44.0],
  ),
  makeCurb(
    'curb-corner-se-bevel-45',
    'SE 90-Degree Curved Beveled Stone Corner Curb',
    'curved_90',
    [4.7328, -17.2672],
    [0.25, 0.25],
    Math.PI * 0.25,
    {
      bevelAngleDeg: 45,
      arcPivotXZ: [6.2, -15.8],
      arcRadius: 2.075,
      arcInnerRadius: 1.95,
      arcOuterRadius: 2.2,
      startAngleRad: Math.PI,
      endAngleRad: Math.PI * 1.5,
      aabb: computeAABBFromBoundsXZ(
        { minX: 4.0, maxX: 6.2, minZ: -18.0, maxZ: -15.8 },
        ELEVATIONS.GUTTER_CHANNEL_Y,
        ELEVATIONS.SIDEWALK_Y,
      ),
    },
  ),
  makeCurb(
    'curb-mercer-south-main',
    'Mercer South Continuous 15cm Stone Curb',
    'straight',
    [10.35, -17.875],
    [8.3, 0.25],
  ),
  makeCurb(
    'curb-mercer-north-main',
    'Mercer North Continuous 15cm Stone Curb',
    'straight',
    [5.25, -26.125],
    [18.5, 0.25],
  ),
];

export const WALKABLE_RAMPS: WalkableRampSpec[] = [
  // Primary flush Stone Courtyard Entrance Ramp rising from y=0.00m road/gutters to y=+0.60m Courtyard Green!
  {
    id: 'ramp-courtyard-main',
    label: 'Flush Stone Courtyard Entrance Ramp (0.00m -> +0.60m)',
    surfaceTag: 'courtyard_ramp',
    boundsXZ: { minX: 14.5, maxX: 19.0, minZ: -26.0, maxZ: -18.0 },
    bottomY: ELEVATIONS.ROAD_ASPHALT_Y,
    topY: ELEVATIONS.COURTYARD_GREEN_Y,
    climbDirection: 'east',
    slopeAngleDeg: Number(((Math.atan2(0.6, 4.5) * 180) / Math.PI).toFixed(2)), // 7.59 deg
    slabThickness: 0.35,
    friction: 0.56,
    restitution: 0.38,
    aabb: computeAABBFromBoundsXZ(
      { minX: 14.5, maxX: 19.0, minZ: -26.0, maxZ: -18.0 },
      -0.25,
      ELEVATIONS.COURTYARD_GREEN_Y,
    ),
  },
  // North Mercer Sidewalk to Courtyard Terrace Transition Ramp (+0.15m -> +0.60m)
  {
    id: 'ramp-courtyard-north-sidewalk',
    label: 'North Mercer Sidewalk Courtyard Approach Ramp (+0.15m -> +0.60m)',
    surfaceTag: 'courtyard_ramp',
    boundsXZ: { minX: 14.5, maxX: 19.0, minZ: -29.25, maxZ: -26.0 },
    bottomY: ELEVATIONS.SIDEWALK_Y,
    topY: ELEVATIONS.COURTYARD_GREEN_Y,
    climbDirection: 'east',
    slopeAngleDeg: Number(((Math.atan2(0.45, 4.5) * 180) / Math.PI).toFixed(2)), // 5.71 deg
    slabThickness: 0.35,
    friction: 0.58,
    restitution: 0.38,
    aabb: computeAABBFromBoundsXZ(
      { minX: 14.5, maxX: 19.0, minZ: -29.25, maxZ: -26.0 },
      -0.2,
      ELEVATIONS.COURTYARD_GREEN_Y,
    ),
  },
  // West 5th Ave South ADA Curb Ramp (0.00m -> +0.15m for Left Skimmer Scaffolding Route)
  {
    id: 'ramp-west-sidewalk-entry',
    label: 'West Sidewalk South ADA Curb Ramp (Skimmer Entry to Scaffolding)',
    surfaceTag: 'sidewalk_paver',
    boundsXZ: { minX: -4.65, maxX: -4.0, minZ: 20.0, maxZ: 23.0 },
    bottomY: ELEVATIONS.ROAD_ASPHALT_Y,
    topY: ELEVATIONS.SIDEWALK_Y,
    climbDirection: 'west',
    slopeAngleDeg: Number(((Math.atan2(0.15, 0.65) * 180) / Math.PI).toFixed(2)),
    slabThickness: 0.2,
    friction: 0.5,
    restitution: 0.44,
    aabb: computeAABBFromBoundsXZ(
      { minX: -4.65, maxX: -4.0, minZ: 20.0, maxZ: 23.0 },
      -0.1,
      ELEVATIONS.SIDEWALK_Y,
    ),
  },
  // West 5th Ave North ADA Curb Ramp (+0.15m -> 0.00m exiting Scaffolding onto Crosswalk A-Position)
  {
    id: 'ramp-west-sidewalk-exit',
    label: 'West Sidewalk North ADA Curb Ramp (To Crosswalk A-Position)',
    surfaceTag: 'sidewalk_paver',
    boundsXZ: { minX: -4.65, maxX: -4.0, minZ: -16.5, maxZ: -13.5 },
    bottomY: ELEVATIONS.ROAD_ASPHALT_Y,
    topY: ELEVATIONS.SIDEWALK_Y,
    climbDirection: 'west',
    slopeAngleDeg: Number(((Math.atan2(0.15, 0.65) * 180) / Math.PI).toFixed(2)),
    slabThickness: 0.2,
    friction: 0.5,
    restitution: 0.44,
    aabb: computeAABBFromBoundsXZ(
      { minX: -4.65, maxX: -4.0, minZ: -16.5, maxZ: -13.5 },
      -0.1,
      ELEVATIONS.SIDEWALK_Y,
    ),
  },
];

// ============================================================================
// 100% SEALED 360-DEGREE PERIMETER BUILDINGS (PRIMARY CONTIGUOUS + SKYLINE)
// ============================================================================

function makeBuilding(
  spec: Omit<PerimeterBuildingSpec, 'aabb' | 'groundY'> & { groundY?: number },
): PerimeterBuildingSpec {
  const groundY = spec.groundY ?? 0.0;
  return {
    ...spec,
    groundY,
    aabb: computeAABBFromBoundsXZ(spec.boundsXZ, groundY, groundY + spec.height),
  };
}

/**
 * 16 contiguous, zero-gap (`gap = 0.00m`), corner-locked 3-to-4-story faceted low-poly buildings
 * sealing 100% of the L-shaped street corridor, South Subway Plaza, and East Pocket-Park Courtyard.
 */
export const PERIMETER_BUILDINGS: PerimeterBuildingSpec[] = [
  // --- SOUTH SUBWAY PLAZA BACKSTOP (z: +38.20 .. +45.00, x: -15.50 .. +15.50) ---
  makeBuilding({
    id: 'bld-south-1',
    name: 'Mercer Transit Exchange',
    ring: 'primary_facade',
    corridorSector: 'south_subway_backstop',
    boundsXZ: { minX: -15.5, maxX: 0.0, minZ: 38.2, maxZ: 45.0 },
    height: 14.2,
    stories: 4,
    palette: 'cream_limestone',
    trimPalette: 'sage_trim',
    roofStyle: 'cornice_parapet',
    frontFace: 'north',
    shopfrontBayCount: 3,
    windowColumns: 5,
    hasShutters: true,
    shutterHex: '#2F6F5E',
    julietBalconyCount: 2,
    hasFireEscape: false,
    shopfrontAwningHex: '#1E5B45',
  }),
  makeBuilding({
    id: 'bld-south-2',
    name: '5th Ave Clockhouse Brownstone',
    ring: 'primary_facade',
    corridorSector: 'south_subway_backstop',
    boundsXZ: { minX: 0.0, maxX: 15.5, minZ: 38.2, maxZ: 45.0 },
    height: 15.0,
    stories: 4,
    palette: 'warm_brick',
    trimPalette: 'cream_limestone',
    roofStyle: 'cornice_parapet',
    frontFace: 'north',
    shopfrontBayCount: 3,
    windowColumns: 5,
    hasShutters: true,
    shutterHex: '#3A5A40',
    julietBalconyCount: 3,
    hasFireEscape: true,
    shopfrontAwningHex: '#F04438',
  }),

  // --- WEST SIDE OF 5TH AVENUE (x: -15.50 .. -7.25, z: -37.50 .. +38.20) ---
  makeBuilding({
    id: 'bld-west-1a',
    name: 'Subway Corner Espresso & News',
    ring: 'primary_facade',
    corridorSector: 'west_5th_ave',
    boundsXZ: { minX: -15.5, maxX: -7.25, minZ: 26.0, maxZ: 38.2 },
    height: 11.4,
    stories: 3,
    palette: 'ochre',
    trimPalette: 'cream_limestone',
    roofStyle: 'hipped_terracotta_tile',
    frontFace: 'east',
    shopfrontBayCount: 2,
    windowColumns: 3,
    hasShutters: true,
    shutterHex: '#2D6A4F',
    julietBalconyCount: 2,
    hasFireEscape: false,
    shopfrontAwningHex: '#2DD4BF',
  }),
  makeBuilding({
    id: 'bld-west-1b',
    name: 'Libreria San Marco',
    ring: 'primary_facade',
    corridorSector: 'west_5th_ave',
    boundsXZ: { minX: -15.5, maxX: -7.25, minZ: 16.0, maxZ: 26.0 },
    height: 12.6,
    stories: 3,
    palette: 'cream_limestone',
    trimPalette: 'terracotta',
    roofStyle: 'hipped_terracotta_tile',
    frontFace: 'east',
    shopfrontBayCount: 2,
    windowColumns: 3,
    hasShutters: true,
    shutterHex: '#40916C',
    julietBalconyCount: 2,
    hasFireEscape: false,
    shopfrontAwningHex: '#FACC15',
  }),
  makeBuilding({
    id: 'bld-west-2-scaffolding-host',
    name: 'Mercer Masonry Brownstone',
    ring: 'primary_facade',
    corridorSector: 'west_5th_ave',
    // East facade at exact x = -7.25m, hosting flush Scaffolding Shed [-7.25..-4.65, z: 4.50..13.50]!
    boundsXZ: { minX: -15.5, maxX: -7.25, minZ: 2.0, maxZ: 16.0 },
    height: 14.8,
    stories: 4,
    palette: 'warm_brick',
    trimPalette: 'cream_limestone',
    roofStyle: 'cornice_parapet',
    frontFace: 'east',
    shopfrontBayCount: 3,
    windowColumns: 4,
    hasShutters: false,
    shutterHex: '#334155',
    julietBalconyCount: 2,
    hasFireEscape: true,
    isScaffoldingHost: true,
  }),
  makeBuilding({
    id: 'bld-west-3',
    name: 'Pasticceria Terracotta',
    ring: 'primary_facade',
    corridorSector: 'west_5th_ave',
    boundsXZ: { minX: -15.5, maxX: -7.25, minZ: -10.0, maxZ: 2.0 },
    height: 11.8,
    stories: 3,
    palette: 'terracotta',
    trimPalette: 'cream_limestone',
    roofStyle: 'hipped_terracotta_tile',
    frontFace: 'east',
    shopfrontBayCount: 2,
    windowColumns: 4,
    hasShutters: true,
    shutterHex: '#2D6A4F',
    julietBalconyCount: 3,
    hasFireEscape: false,
    shopfrontAwningHex: '#F04438',
  }),
  makeBuilding({
    id: 'bld-west-4',
    name: 'Trattoria del Sole',
    ring: 'primary_facade',
    corridorSector: 'west_5th_ave',
    boundsXZ: { minX: -15.5, maxX: -7.25, minZ: -22.0, maxZ: -10.0 },
    height: 15.4,
    stories: 4,
    palette: 'ochre',
    trimPalette: 'sage_trim',
    roofStyle: 'mansard_slate',
    frontFace: 'east',
    shopfrontBayCount: 3,
    windowColumns: 4,
    hasShutters: true,
    shutterHex: '#1E5B45',
    julietBalconyCount: 4,
    hasFireEscape: true,
    shopfrontAwningHex: '#2DD4BF',
  }),
  makeBuilding({
    id: 'bld-west-5-nw-corner',
    name: 'Palazzo Angolo NW',
    ring: 'primary_facade',
    corridorSector: 'west_5th_ave',
    boundsXZ: { minX: -15.5, maxX: -7.25, minZ: -38.5, maxZ: -22.0 },
    height: 14.0,
    stories: 4,
    palette: 'terracotta',
    trimPalette: 'cream_limestone',
    roofStyle: 'hipped_terracotta_tile',
    frontFace: 'east',
    shopfrontBayCount: 3,
    windowColumns: 4,
    hasShutters: true,
    shutterHex: '#2D6A4F',
    julietBalconyCount: 3,
    hasFireEscape: false,
    shopfrontAwningHex: '#FACC15',
  }),

  // --- NORTH SIDE OF MERCER BEND & COURTYARD (z: -38.50 .. -29.25/-30.50) ---
  makeBuilding({
    id: 'bld-north-1',
    name: 'Caffè Veneziano',
    ring: 'primary_facade',
    corridorSector: 'north_mercer_bend',
    boundsXZ: { minX: -7.25, maxX: 5.5, minZ: -38.5, maxZ: -29.25 },
    height: 12.2,
    stories: 3,
    palette: 'cream_limestone',
    trimPalette: 'terracotta',
    roofStyle: 'hipped_terracotta_tile',
    frontFace: 'south',
    shopfrontBayCount: 3,
    windowColumns: 4,
    hasShutters: true,
    shutterHex: '#2D6A4F',
    julietBalconyCount: 3,
    hasFireEscape: false,
    shopfrontAwningHex: '#F04438',
  }),
  makeBuilding({
    id: 'bld-north-2',
    name: 'Mercer Gelateria & Fiori',
    ring: 'primary_facade',
    corridorSector: 'north_mercer_bend',
    boundsXZ: { minX: 5.5, maxX: 19.0, minZ: -38.5, maxZ: -29.25 },
    height: 14.6,
    stories: 4,
    palette: 'terracotta',
    trimPalette: 'cream_limestone',
    roofStyle: 'hipped_terracotta_tile',
    frontFace: 'south',
    shopfrontBayCount: 3,
    windowColumns: 4,
    hasShutters: true,
    shutterHex: '#3A5A40',
    julietBalconyCount: 4,
    hasFireEscape: true,
    shopfrontAwningHex: '#2DD4BF',
  }),
  makeBuilding({
    id: 'bld-north-3-courtyard',
    name: 'Piazza Pergola Townhouse',
    ring: 'primary_facade',
    corridorSector: 'north_courtyard',
    // Overlaps bld-north-2 cleanly across z: [-38.50, -30.50] at x = 19.00 -> 0.00m seam!
    boundsXZ: { minX: 19.0, maxX: 26.5, minZ: -38.5, maxZ: -30.5 },
    height: 11.6,
    stories: 3,
    palette: 'ochre',
    trimPalette: 'sage_trim',
    roofStyle: 'hipped_terracotta_tile',
    frontFace: 'south',
    shopfrontBayCount: 2,
    windowColumns: 3,
    hasShutters: true,
    shutterHex: '#2D6A4F',
    julietBalconyCount: 2,
    hasFireEscape: false,
    shopfrontAwningHex: '#FACC15',
  }),
  makeBuilding({
    id: 'bld-north-4-courtyard',
    name: 'Villa Verde Courtyard Residence',
    ring: 'primary_facade',
    corridorSector: 'north_courtyard',
    boundsXZ: { minX: 26.5, maxX: 41.5, minZ: -38.5, maxZ: -30.5 },
    height: 15.2,
    stories: 4,
    palette: 'warm_brick',
    trimPalette: 'cream_limestone',
    roofStyle: 'cornice_parapet',
    frontFace: 'south',
    shopfrontBayCount: 3,
    windowColumns: 5,
    hasShutters: true,
    shutterHex: '#1E5B45',
    julietBalconyCount: 4,
    hasFireEscape: false,
    shopfrontAwningHex: '#F04438',
  }),

  // --- EAST POCKET-PARK COURTYARD BACKSTOP (x: +33.50 .. +41.50, z: -30.50 .. -13.50) ---
  makeBuilding({
    id: 'bld-east-courtyard-1',
    name: 'Campanile Courtyard Lofts',
    ring: 'primary_facade',
    corridorSector: 'east_courtyard_backstop',
    boundsXZ: { minX: 33.5, maxX: 41.5, minZ: -30.5, maxZ: -21.6 },
    height: 15.8,
    stories: 4,
    palette: 'terracotta',
    trimPalette: 'cream_limestone',
    roofStyle: 'hipped_terracotta_tile',
    frontFace: 'west',
    shopfrontBayCount: 2,
    windowColumns: 3,
    hasShutters: true,
    shutterHex: '#2D6A4F',
    julietBalconyCount: 3,
    hasFireEscape: false,
    shopfrontAwningHex: '#2DD4BF',
  }),
  makeBuilding({
    id: 'bld-east-courtyard-2',
    name: 'Loggia del Giardino',
    ring: 'primary_facade',
    corridorSector: 'east_courtyard_backstop',
    boundsXZ: { minX: 33.5, maxX: 41.5, minZ: -21.6, maxZ: -13.5 },
    height: 12.8,
    stories: 3,
    palette: 'cream_limestone',
    trimPalette: 'terracotta',
    roofStyle: 'hipped_terracotta_tile',
    frontFace: 'west',
    shopfrontBayCount: 2,
    windowColumns: 3,
    hasShutters: true,
    shutterHex: '#3A5A40',
    julietBalconyCount: 2,
    hasFireEscape: false,
    shopfrontAwningHex: '#F04438',
  }),

  // --- SOUTH COURTYARD & SE MERCER CORNER BLOCK (x: +7.25 .. +41.50) ---
  makeBuilding({
    id: 'bld-south-courtyard-1',
    name: 'Bistro Terrazza South',
    ring: 'primary_facade',
    corridorSector: 'south_courtyard',
    boundsXZ: { minX: 19.0, maxX: 41.5, minZ: -13.5, maxZ: -5.5 },
    height: 13.4,
    stories: 3,
    palette: 'ochre',
    trimPalette: 'cream_limestone',
    roofStyle: 'hipped_terracotta_tile',
    frontFace: 'north',
    shopfrontBayCount: 4,
    windowColumns: 6,
    hasShutters: true,
    shutterHex: '#2D6A4F',
    julietBalconyCount: 4,
    hasFireEscape: false,
    shopfrontAwningHex: '#2DD4BF',
  }),
  makeBuilding({
    id: 'bld-se-corner-bodega',
    name: '5th & Mercer Corner Bodega & Bakery',
    ring: 'primary_facade',
    corridorSector: 'south_mercer_se_corner',
    // Dual-frontage corner block framing BOTH the Van Loading Zone (West face x=7.25) & Hotdog Vendor Apron (North face z=-14.75)!
    boundsXZ: { minX: 7.25, maxX: 19.0, minZ: -14.75, maxZ: 0.0 },
    height: 11.2,
    stories: 3,
    palette: 'terracotta',
    trimPalette: 'sage_trim',
    roofStyle: 'cornice_parapet',
    frontFace: 'west',
    shopfrontBayCount: 3,
    windowColumns: 4,
    hasShutters: true,
    shutterHex: '#1E5B45',
    julietBalconyCount: 3,
    hasFireEscape: true,
    shopfrontAwningHex: '#F04438',
  }),

  // --- EAST SIDE OF 5TH AVENUE (x: +7.25 .. +15.50, z: 0.00 .. +36.50) ---
  makeBuilding({
    id: 'bld-east-2',
    name: 'Mercer Row Apothecary',
    ring: 'primary_facade',
    corridorSector: 'east_5th_ave',
    boundsXZ: { minX: 7.25, maxX: 15.5, minZ: 0.0, maxZ: 18.0 },
    height: 14.4,
    stories: 4,
    palette: 'cream_limestone',
    trimPalette: 'warm_brick',
    roofStyle: 'mansard_slate',
    frontFace: 'west',
    shopfrontBayCount: 3,
    windowColumns: 5,
    hasShutters: true,
    shutterHex: '#2D6A4F',
    julietBalconyCount: 4,
    hasFireEscape: true,
    shopfrontAwningHex: '#1E3A8A',
  }),
  makeBuilding({
    id: 'bld-east-1',
    name: 'Stazione Sud Brownstone',
    ring: 'primary_facade',
    corridorSector: 'east_5th_ave',
    boundsXZ: { minX: 7.25, maxX: 15.5, minZ: 18.0, maxZ: 38.2 },
    height: 12.8,
    stories: 3,
    palette: 'warm_brick',
    trimPalette: 'cream_limestone',
    roofStyle: 'cornice_parapet',
    frontFace: 'west',
    shopfrontBayCount: 3,
    windowColumns: 5,
    hasShutters: true,
    shutterHex: '#3A5A40',
    julietBalconyCount: 3,
    hasFireEscape: false,
    shopfrontAwningHex: '#FACC15',
  }),
];

/**
 * Second ring of contiguous, zero-gap, zero-overlap background city skyline silhouettes (19.5m - 26.5m,
 * including a Venice Campanile Belltower) sealing all corners, alleys, and elevated camera pitches across 360°.
 */
export const SKYLINE_BACKDROPS: PerimeterBuildingSpec[] = [
  makeBuilding({
    id: 'skyline-north-campanile',
    name: 'San Mercer Belltower Campanile',
    ring: 'skyline_backdrop',
    corridorSector: 'north_courtyard',
    boundsXZ: { minX: 12.0, maxX: 19.5, minZ: -48.0, maxZ: -38.5 },
    height: 26.5,
    stories: 6,
    palette: 'terracotta',
    trimPalette: 'cream_limestone',
    roofStyle: 'campanile_spire',
    frontFace: 'south',
    shopfrontBayCount: 0,
    windowColumns: 2,
    hasShutters: false,
    shutterHex: '#334155',
    julietBalconyCount: 0,
    hasFireEscape: false,
  }),
  makeBuilding({
    id: 'skyline-north-west-tower',
    name: 'North-West Venetian Rooftops',
    ring: 'skyline_backdrop',
    corridorSector: 'north_mercer_bend',
    boundsXZ: { minX: -26.0, maxX: 12.0, minZ: -48.0, maxZ: -38.5 },
    height: 21.5,
    stories: 5,
    palette: 'ochre',
    trimPalette: 'terracotta',
    roofStyle: 'hipped_terracotta_tile',
    frontFace: 'south',
    shopfrontBayCount: 0,
    windowColumns: 6,
    hasShutters: false,
    shutterHex: '#334155',
    julietBalconyCount: 0,
    hasFireEscape: false,
  }),
  makeBuilding({
    id: 'skyline-north-east-tower',
    name: 'North-East Courtyard Skyline Block',
    ring: 'skyline_backdrop',
    corridorSector: 'north_courtyard',
    boundsXZ: { minX: 19.5, maxX: 52.0, minZ: -48.0, maxZ: -38.5 },
    height: 22.0,
    stories: 5,
    palette: 'cream_limestone',
    trimPalette: 'terracotta',
    roofStyle: 'hipped_terracotta_tile',
    frontFace: 'south',
    shopfrontBayCount: 0,
    windowColumns: 6,
    hasShutters: false,
    shutterHex: '#334155',
    julietBalconyCount: 0,
    hasFireEscape: false,
  }),
  makeBuilding({
    id: 'skyline-east-courtyard-tower',
    name: 'East Piazza Backdrop Tower',
    ring: 'skyline_backdrop',
    corridorSector: 'east_courtyard_backstop',
    boundsXZ: { minX: 41.5, maxX: 52.0, minZ: -38.5, maxZ: 0.0 },
    height: 23.0,
    stories: 6,
    palette: 'warm_brick',
    trimPalette: 'cream_limestone',
    roofStyle: 'cornice_parapet',
    frontFace: 'west',
    shopfrontBayCount: 0,
    windowColumns: 5,
    hasShutters: false,
    shutterHex: '#334155',
    julietBalconyCount: 0,
    hasFireEscape: false,
  }),
  makeBuilding({
    id: 'skyline-se-courtyard-infill',
    name: 'South-East Courtyard Rear Midrise',
    ring: 'skyline_backdrop',
    corridorSector: 'south_courtyard',
    // Flush east of bld-se-corner-bodega (maxX=19.0) & south of bld-south-courtyard-1 (maxZ=-5.5) -> zero overlap!
    boundsXZ: { minX: 19.0, maxX: 41.5, minZ: -5.5, maxZ: 0.0 },
    height: 19.8,
    stories: 5,
    palette: 'terracotta',
    trimPalette: 'cream_limestone',
    roofStyle: 'cornice_parapet',
    frontFace: 'north',
    shopfrontBayCount: 0,
    windowColumns: 5,
    hasShutters: false,
    shutterHex: '#334155',
    julietBalconyCount: 0,
    hasFireEscape: false,
  }),
  makeBuilding({
    id: 'skyline-west-corridor-midrise',
    name: 'West 5th Ave Midrise Backdrop',
    ring: 'skyline_backdrop',
    corridorSector: 'west_5th_ave',
    // Flush at x = -15.5 from z = -38.5 to +45.0, sealing NW & SW corners cleanly!
    boundsXZ: { minX: -26.0, maxX: -15.5, minZ: -38.5, maxZ: 45.0 },
    height: 21.5,
    stories: 5,
    palette: 'warm_brick',
    trimPalette: 'cream_limestone',
    roofStyle: 'cornice_parapet',
    frontFace: 'east',
    shopfrontBayCount: 0,
    windowColumns: 8,
    hasShutters: false,
    shutterHex: '#334155',
    julietBalconyCount: 0,
    hasFireEscape: false,
  }),
  makeBuilding({
    id: 'skyline-south-backstop-tower',
    name: 'South Station Skyline Tower',
    ring: 'skyline_backdrop',
    corridorSector: 'south_subway_backstop',
    boundsXZ: { minX: -26.0, maxX: 52.0, minZ: 45.0, maxZ: 55.0 },
    height: 22.5,
    stories: 6,
    palette: 'cream_limestone',
    trimPalette: 'warm_brick',
    roofStyle: 'mansard_slate',
    frontFace: 'north',
    shopfrontBayCount: 0,
    windowColumns: 7,
    hasShutters: false,
    shutterHex: '#334155',
    julietBalconyCount: 0,
    hasFireEscape: false,
  }),
  makeBuilding({
    id: 'skyline-se-inner-block',
    name: 'Mercer Inner-Block Midrise',
    ring: 'skyline_backdrop',
    corridorSector: 'east_5th_ave',
    // Starts at exact x = 15.5, z = 0.0 (zero 0.5m alley, zero overlap with bld-se-corner-bodega)!
    boundsXZ: { minX: 15.5, maxX: 52.0, minZ: 0.0, maxZ: 45.0 },
    height: 20.5,
    stories: 5,
    palette: 'ochre',
    trimPalette: 'warm_brick',
    roofStyle: 'cornice_parapet',
    frontFace: 'west',
    shopfrontBayCount: 0,
    windowColumns: 6,
    hasShutters: false,
    shutterHex: '#334155',
    julietBalconyCount: 0,
    hasFireEscape: false,
  }),
];

export const OUTER_CITY_GROUND_SKIRT = {
  boundsXZ: { minX: -178.0, maxX: 202.0, minZ: -190.0, maxZ: 190.0 },
  topY: -0.35,
} as const;

// ============================================================================
// ARCHITECTURAL RETAINING WALLS, PLANTER LOW WALL, PERGOLA & STRING LIGHTS
// ============================================================================

export const ARCHITECTURAL_WALLS: ArchitecturalWallSpec[] = [
  // 1. Stone Retaining Wall framing the back of the Recessed Brick Subway Entrance Plaza
  {
    id: 'wall-subway-retaining-south',
    label: 'South Subway Plaza Stone Retaining Wall',
    kind: 'stone_retaining_wall',
    groundY: ELEVATIONS.SIDEWALK_Y,
    topY: 1.35,
    center: [0.0, 0.75, 37.9],
    size: [14.5, 1.2, 0.5],
    rotationY: 0,
    surfaceTag: 'masonry_wall',
    restitution: 0.5,
    aabb: computeCenteredBoxAABB([0.0, 0.75, 37.9], [14.5, 1.2, 0.5], 0),
  },
  // 2. Wrought-Iron & Limestone Planter Low Wall on +0.60m Courtyard Terrace (Awning Lob Target)
  // Grounded flush at +0.60m (0.52m visible height, topY = +1.12m so Hotdog Awning bounce sails cleanly over onto Green)
  {
    id: 'wall-courtyard-wrought-iron-planter',
    label: 'Courtyard Wrought-Iron Planter Low Wall (Awning Lob Target)',
    kind: 'wrought_iron_planter_wall',
    groundY: ELEVATIONS.COURTYARD_GREEN_Y,
    topY: 1.12,
    center: [21.775, (ELEVATIONS.COURTYARD_GREEN_Y + 1.12) * 0.5, -17.8],
    size: [5.45, 0.52, 0.3],
    rotationY: 0,
    surfaceTag: 'masonry_wall',
    restitution: 0.42,
    aabb: computeCenteredBoxAABB([21.775, 0.86, -17.8], [5.45, 0.52, 0.3], 0),
  },
  // 3. South Courtyard Ramp Cheek Retaining Wall (seals z = -18.0 step between 0.00..0.60m ramp & +0.15m vendor apron)
  {
    id: 'wall-ramp-south-cheek',
    label: 'Courtyard Entrance Ramp South Stone Cheek Wall',
    kind: 'stone_retaining_wall',
    groundY: ELEVATIONS.ROAD_ASPHALT_Y,
    topY: 0.65,
    center: [16.67, 0.325, -17.94],
    size: [4.34, 0.65, 0.16],
    rotationY: 0,
    surfaceTag: 'masonry_wall',
    restitution: 0.48,
    aabb: computeCenteredBoxAABB([16.67, 0.325, -17.94], [4.34, 0.65, 0.16], 0),
  },
  // 4. North Courtyard Ramp Cheek Retaining Wall (seals z = -26.0 wedge face between main ramp & north sidewalk ramp)
  {
    id: 'wall-ramp-north-cheek',
    label: 'Courtyard Entrance Ramp North Stone Cheek Wall',
    kind: 'stone_retaining_wall',
    groundY: ELEVATIONS.ROAD_ASPHALT_Y,
    topY: 0.64,
    center: [16.75, 0.32, -26.06],
    size: [4.5, 0.64, 0.16],
    rotationY: 0,
    surfaceTag: 'masonry_wall',
    restitution: 0.48,
    aabb: computeCenteredBoxAABB([16.75, 0.32, -26.06], [4.5, 0.64, 0.16], 0),
  },
  // 5. West Courtyard Terrace Retaining Step Wall (seals x = 19.0 cliff between +0.15m vendor apron & +0.60m courtyard slab)
  {
    id: 'wall-courtyard-west-step',
    label: 'Courtyard Terrace West Limestone Retaining Step',
    kind: 'courtyard_boundary_wall',
    groundY: ELEVATIONS.SIDEWALK_Y,
    topY: 0.65,
    center: [18.92, 0.4, -16.375],
    size: [0.16, 0.5, 3.25],
    rotationY: 0,
    surfaceTag: 'masonry_wall',
    restitution: 0.46,
    aabb: computeCenteredBoxAABB([18.92, 0.4, -16.375], [0.16, 0.5, 3.25], 0),
  },
];

export const COURTYARD_PERGOLA: CourtyardPergolaSpec = {
  id: 'pergola-courtyard-north-terrace',
  groundY: ELEVATIONS.COURTYARD_GREEN_Y,
  boundsXZ: { minX: 20.0, maxX: 32.0, minZ: -30.2, maxZ: -26.6 },
  beamClearHeight: 3.35,
  rafterCount: 9,
  postPositions: [
    [20.2, ELEVATIONS.COURTYARD_GREEN_Y, -30.1],
    [26.0, ELEVATIONS.COURTYARD_GREEN_Y, -30.1],
    [31.8, ELEVATIONS.COURTYARD_GREEN_Y, -30.1],
    [20.2, ELEVATIONS.COURTYARD_GREEN_Y, -26.7],
    [26.0, ELEVATIONS.COURTYARD_GREEN_Y, -26.7],
    [31.8, ELEVATIONS.COURTYARD_GREEN_Y, -26.7],
  ],
};

export const STRING_LIGHT_SPANS: StringLightSpanSpec[] = [
  {
    id: 'lights-5th-south',
    label: '5th Ave South Cafe String Lights',
    startAnchor: [-7.25, 5.2, 20.0],
    endAnchor: [7.25, 5.2, 18.0],
    sagMeters: 0.55,
    bulbCount: 12,
  },
  {
    id: 'lights-5th-mid',
    label: '5th Ave Mid-Block String Lights',
    startAnchor: [-7.25, 5.4, 2.0],
    endAnchor: [7.25, 5.4, 4.0],
    sagMeters: 0.55,
    bulbCount: 12,
  },
  {
    id: 'lights-5th-crosswalk',
    label: 'Crosswalk A-Position Overhead String Lights',
    startAnchor: [-7.25, 5.5, -15.5],
    endAnchor: [7.25, 5.5, -14.8],
    sagMeters: 0.5,
    bulbCount: 12,
  },
  {
    id: 'lights-mercer-approach',
    label: 'Mercer St Dogleg String Lights',
    startAnchor: [11.5, 5.4, -29.25],
    endAnchor: [11.5, 5.4, -14.75],
    sagMeters: 0.52,
    bulbCount: 12,
  },
  {
    id: 'lights-courtyard-west',
    label: 'Courtyard Entrance Piazza String Lights',
    startAnchor: [21.5, 5.8, -30.5],
    endAnchor: [21.5, 5.8, -13.5],
    sagMeters: 0.65,
    bulbCount: 14,
  },
  {
    id: 'lights-courtyard-cup',
    label: 'Pocket-Park Green Cup Overhead String Lights',
    startAnchor: [26.5, 5.8, -30.5],
    endAnchor: [26.5, 5.8, -13.5],
    sagMeters: 0.65,
    bulbCount: 14,
  },
];

// ============================================================================
// DIEGETIC PROP ZONING & MULTI-ROUTE STRATEGIC SHOT MATRIX
// ============================================================================

const HOTDOG_CART_YAW = -2.654; // -152.06 deg: keeps cart 0.303m clear of x=19.0 terrace step & funnels 28° bounce <=2m of Cup!
const HOTDOG_AWNING_NORMAL_INFO = computePitchedAwningNormal(28, HOTDOG_CART_YAW);
const HOTDOG_AWNING_CENTER: Vec3Tuple = [17.5, ELEVATIONS.SIDEWALK_Y + 2.15, -16.35];
const HOTDOG_DIST_FROM_A = distance2D(A_POSITION_CROSSWALK.center, HOTDOG_AWNING_CENTER);
const HOTDOG_FLIGHT_T = Math.sqrt(
  (BALL_RADIUS + HOTDOG_DIST_FROM_A * Math.tan((50 * Math.PI) / 180) - HOTDOG_AWNING_CENTER[1]) /
    (-0.5 * WORLD_GRAVITY_Y),
);
const HOTDOG_DESIGN_V_IN: Vec3Tuple = [
  Number(((HOTDOG_AWNING_CENTER[0] - A_POSITION_CROSSWALK.center[0]) / HOTDOG_FLIGHT_T).toFixed(3)),
  Number(
    (
      (HOTDOG_DIST_FROM_A / HOTDOG_FLIGHT_T) * Math.tan((50 * Math.PI) / 180) +
      WORLD_GRAVITY_Y * HOTDOG_FLIGHT_T
    ).toFixed(3),
  ),
  Number(((HOTDOG_AWNING_CENTER[2] - A_POSITION_CROSSWALK.center[2]) / HOTDOG_FLIGHT_T).toFixed(3)),
];
const HOTDOG_DESIGN_V_OUT = computeAwningBounceVelocity(
  HOTDOG_DESIGN_V_IN,
  HOTDOG_AWNING_NORMAL_INFO.worldNormal,
  0.28,
);

function computeHotdogPredictedLandingAndStop(): {
  landingXZ: Vec2Tuple;
  stopXZ: Vec2Tuple;
} {
  const greenContactY = ELEVATIONS.COURTYARD_GREEN_Y + BALL_RADIUS;
  const disc =
    HOTDOG_DESIGN_V_OUT[1] * HOTDOG_DESIGN_V_OUT[1] -
    4 * (-0.5 * WORLD_GRAVITY_Y) * (greenContactY - HOTDOG_AWNING_CENTER[1]);
  const tGreenLand =
    (HOTDOG_DESIGN_V_OUT[1] + Math.sqrt(Math.max(0, disc))) / -WORLD_GRAVITY_Y;
  const rawLandX = HOTDOG_AWNING_CENTER[0] + HOTDOG_DESIGN_V_OUT[0] * tGreenLand;
  const rawLandZ = HOTDOG_AWNING_CENTER[2] + HOTDOG_DESIGN_V_OUT[2] * tGreenLand;

  const greenZone = GROUND_ZONES.find(
    (z) => z.id === 'zone-courtyard-putting-green',
  );
  const dt = 1 / 60;
  let x = rawLandX;
  let z = rawLandZ;
  let vx = HOTDOG_DESIGN_V_OUT[0] * CLUB_SPECS.wedge.turfCheckMultiplier;
  let vz = HOTDOG_DESIGN_V_OUT[2] * CLUB_SPECS.wedge.turfCheckMultiplier;
  const effectiveDamping =
    CLUB_SPECS.wedge.rollDamping + (greenZone?.rollDamping ?? 1.65);

  for (let step = 0; step < 360; step++) {
    if (Math.hypot(vx, vz) < 0.08) break;
    x += vx * dt;
    z += vz * dt;
    const decay = Math.exp(-effectiveDamping * dt);
    vx *= decay;
    vz *= decay;
  }

  return {
    landingXZ: [Number(rawLandX.toFixed(2)), Number(rawLandZ.toFixed(2))],
    stopXZ: [Number(x.toFixed(2)), Number(z.toFixed(2))],
  };
}

const HOTDOG_CART_LOCAL_SIZE: Vec3Tuple = [1.92, 2.58, 2.04];
const HOTDOG_CART_FULL_AABB = computeRotatedAABB(
  [17.5, ELEVATIONS.SIDEWALK_Y, -16.35],
  HOTDOG_CART_LOCAL_SIZE,
  HOTDOG_CART_YAW,
);
const HOTDOG_CART_CARRIAGE_AABB = computeRotatedAABB(
  [17.5, ELEVATIONS.SIDEWALK_Y, -16.35],
  [1.65, 1.35, 1.88],
  HOTDOG_CART_YAW,
);
const HOTDOG_PREDICTED_TRAJECTORY = computeHotdogPredictedLandingAndStop();

export const COURSE_PROPS: CoursePropSpec[] = [
  // --------------------------------------------------------------------------
  // 1. SIDEWALK SCAFFOLDING SHED (Left/West Sidewalk y=0.15m, 0.00m wall gap, 2.35m clear height)
  // --------------------------------------------------------------------------
  {
    id: 'scaffolding-shed-west',
    name: 'Flush Masonry Sidewalk Scaffolding Shed',
    type: 'scaffolding_tunnel',
    zone: 'sidewalk',
    position: [-5.95, ELEVATIONS.SIDEWALK_Y, 9.0],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: 0,
    localSize: [2.6, 2.85, 9.0],
    aabb: computeRotatedAABB([-5.95, ELEVATIONS.SIDEWALK_Y, 9.0], [2.6, 2.85, 9.0], 0),
    solidColliders: [
      // West stanchion line (flush against x = -7.25m masonry facade)
      { min: [-7.25, 0.15, 4.5], max: [-7.03, 3.0, 13.5] },
      // East curbside stanchion line
      { min: [-4.87, 0.15, 4.5], max: [-4.65, 3.0, 13.5] },
      // Overhead timber deck (clear underside at y = 0.15 + 2.35 = 2.50m!)
      { min: [-7.25, 2.5, 4.5], max: [-4.65, 3.0, 13.5] },
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: false,
    reactive: {
      kind: 'scaffolding_underpass',
      zoneCenter: [-5.95, 1.325, 9.0],
      zoneHalfExtents: [1.08, 1.175, 4.5],
      underpassClearHeight: 2.35,
      underpassClearWidth: 2.16,
    },
    scaffoldingMeta: {
      hostBuildingId: 'bld-west-2-scaffolding-host',
      hostFacadeX: -7.25,
      wallGapMeters: 0.0,
      clearHeightMeters: 2.35,
      clearWidthMeters: 2.16,
      tunnelLengthMeters: 9.0,
    },
  },

  // --------------------------------------------------------------------------
  // 2. PARALLEL-PARKED DELIVERY BOX VAN + LOWERED REAR RAMP + HAZARD CONES (y=0.00m)
  // --------------------------------------------------------------------------
  {
    id: 'delivery-van-east',
    name: 'Bodega Parallel-Parked Delivery Box Van & Rear Ramp',
    type: 'delivery_box_van',
    zone: 'road',
    // Centered at z = -6.90 (~34.4m from Tee; rear ramp toe at z = -3.40 = 30.9m from Tee!)
    position: [2.28, ELEVATIONS.ROAD_ASPHALT_Y, -6.9],
    groundY: ELEVATIONS.ROAD_ASPHALT_Y,
    rotationY: Math.PI, // Cab facing North (-Z) toward corner, lowered ramp facing South (+Z) toward Tee!
    localSize: [2.04, 2.26, 7.0],
    aabb: computeRotatedAABB([2.28, ELEVATIONS.ROAD_ASPHALT_Y, -6.9], [2.04, 2.26, 7.0], Math.PI),
    // Split solidColliders leaving z: [-3.4 -> -6.0] rear ramp completely open,
    // z: [-6.0 -> -7.8] center roof-access kicker channel open above y = 1.08m,
    // z: [-7.8 -> -8.92] flat cargo roof launch deck open at y = 2.24m,
    // and z: [-8.92 -> -10.4] forward cab roof accurately stepped down to y = 1.82m!
    solidColliders: [
      // Left cargo side wall along roof-access kicker (x: 1.26..1.44, z: -7.8..-6.0)
      { min: [1.26, 0.0, -7.8], max: [1.44, 2.24, -6.0] },
      // Right cargo side wall along roof-access kicker (x: 3.12..3.30, z: -7.8..-6.0)
      { min: [3.12, 0.0, -7.8], max: [3.3, 2.24, -6.0] },
      // Lower cargo chassis underfloor recessed beneath ramp/kicker bevel (zero vertical lip snag!)
      { min: [1.44, 0.0, -7.8], max: [3.12, 0.96, -6.2] },
      // Recessed shoulder under kicker crest (z: -7.98..-7.80) so ball crests smoothly onto y = 2.24m roof
      { min: [1.26, 0.0, -7.98], max: [3.3, 2.08, -7.8] },
      // Forward cargo box body supporting flat roof launch deck (y: 0.0..2.24, z: -8.92..-7.98)
      { min: [1.26, 0.0, -8.92], max: [3.3, 2.24, -7.98] },
      // Stepped-down forward cab body matching visual cab roof height (y: 0.0..1.82, z: -10.4..-8.92)
      { min: [1.26, 0.0, -10.4], max: [3.3, 1.82, -8.92] },
    ],
    surfaceTag: 'van_roof_deck',
    blocksGroundRoll: false,
    reactive: {
      kind: 'van_ramp_and_roof_launch',
      // Launch deck strictly over cargo roof z: [-8.92 .. -7.80] (<= -7.3m, completely clear of tree canopy at z >= -5.95!)
      zoneCenter: [2.28, 2.24, -8.36],
      zoneHalfExtents: [0.95, 0.22, 0.56],
      restitution: 0.62,
      boostVelocity: [-0.8, 5.6, -13.4],
    },
    vanRampMeta: {
      loadingZoneId: VAN_LOADING_ZONE.id,
      rampBottomZ: -3.4,
      rampTopZ: -6.0,
      rampBottomY: ELEVATIONS.ROAD_ASPHALT_Y,
      rampTopY: 1.08,
      rampWidth: 1.68,
      rampLaunchAngleDeg: Number(((Math.atan2(1.08, 2.6) * 180) / Math.PI).toFixed(2)), // 22.56 deg
      roofDeckTopY: 2.24,
      roofRestitution: 0.62,
      slopedRampSpec: {
        id: 'van-rear-loading-ramp',
        label: 'Delivery Van Lowered Rear Loading Ramp (0.00m -> 1.08m)',
        surfaceTag: 'van_roof_deck',
        boundsXZ: { minX: 1.44, maxX: 3.12, minZ: -6.0, maxZ: -3.4 },
        bottomY: ELEVATIONS.ROAD_ASPHALT_Y,
        topY: 1.08,
        climbDirection: 'north',
        slopeAngleDeg: Number(((Math.atan2(1.08, 2.6) * 180) / Math.PI).toFixed(2)),
        slabThickness: 0.08,
        friction: 0.42,
        restitution: 0.48,
        aabb: computeAABBFromBoundsXZ({ minX: 1.44, maxX: 3.12, minZ: -6.0, maxZ: -3.4 }, 0.0, 1.08),
      },
      roofAccessKickerSpec: {
        id: 'van-roof-access-kicker',
        label: 'Delivery Van Interior Roof-Access Kicker (1.08m -> 2.24m)',
        surfaceTag: 'van_roof_deck',
        boundsXZ: { minX: 1.44, maxX: 3.12, minZ: -7.8, maxZ: -6.0 },
        bottomY: 1.08,
        topY: 2.24,
        climbDirection: 'north',
        slopeAngleDeg: Number(((Math.atan2(1.16, 1.8) * 180) / Math.PI).toFixed(2)),
        slabThickness: 0.08,
        friction: 0.4,
        restitution: 0.52,
        aabb: computeAABBFromBoundsXZ({ minX: 1.44, maxX: 3.12, minZ: -7.8, maxZ: -6.0 }, 1.08, 2.24),
      },
      roofLaunchDeckBoundsXZ: { minX: 1.36, maxX: 3.2, minZ: -8.92, maxZ: -7.8 },
    },
  },
  {
    id: 'cone-van-south',
    name: 'Loading Zone Rear Hazard Cone',
    type: 'hazard_cone',
    zone: 'road',
    position: [1.15, ELEVATIONS.ROAD_ASPHALT_Y, -3.16],
    groundY: ELEVATIONS.ROAD_ASPHALT_Y,
    rotationY: 0,
    localSize: [0.26, 0.68, 0.26],
    aabb: computeRotatedAABB([1.15, 0.0, -3.16], [0.26, 0.68, 0.26], 0),
    solidColliders: [computeRotatedAABB([1.15, 0.0, -3.16], [0.26, 0.68, 0.26], 0)],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'cone-van-north',
    name: 'Loading Zone Front Hazard Cone',
    type: 'hazard_cone',
    zone: 'road',
    position: [1.15, ELEVATIONS.ROAD_ASPHALT_Y, -10.82],
    groundY: ELEVATIONS.ROAD_ASPHALT_Y,
    rotationY: 0,
    localSize: [0.26, 0.68, 0.26],
    aabb: computeRotatedAABB([1.15, 0.0, -10.82], [0.26, 0.68, 0.26], 0),
    solidColliders: [computeRotatedAABB([1.15, 0.0, -10.82], [0.26, 0.68, 0.26], 0)],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },

  // --------------------------------------------------------------------------
  // 3. OVERHANGING STREET-TREE CANOPY (~32m out on right at z=-4.50, y=0.15m pit)
  // --------------------------------------------------------------------------
  {
    id: 'tree-overhang-east',
    name: 'Overhanging Sidewalk Canopy Tree (Blocks Lazy Right Aerials)',
    type: 'overhanging_street_tree',
    zone: 'sidewalk',
    position: [5.5, ELEVATIONS.SIDEWALK_Y, -4.5], // 27.52 - (-4.50) = 32.02m from Tee!
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: 0,
    localSize: [1.2, 5.45, 1.2],
    aabb: {
      min: [1.1, ELEVATIONS.SIDEWALK_Y, -5.95],
      max: [6.95, 5.6, -1.9],
    },
    solidColliders: [
      // Sidewalk tree pit & trunk (strictly on East sidewalk [4.90..6.10])
      { min: [4.9, ELEVATIONS.SIDEWALK_Y, -5.1], max: [6.1, 2.65, -3.9] },
      // Elevated overhanging foliage canopy (minZ = -5.95 >= -6.0, leaving 1.40m open sky north of van roof launch!)
      { min: [1.1, 2.65, -5.95], max: [6.95, 5.6, -1.9] },
    ],
    surfaceTag: 'patio_rough',
    blocksGroundRoll: true,
    treeOverhangMeta: {
      pitCenter: [5.5, ELEVATIONS.SIDEWALK_Y, -4.5],
      trunkAabb: { min: [4.9, ELEVATIONS.SIDEWALK_Y, -5.1], max: [6.1, 2.65, -3.9] },
      canopyAabb: { min: [1.1, 2.65, -5.95], max: [6.95, 5.6, -1.9] },
      blocksRightAerialXRange: [1.1, 6.95],
      leavesLeftCrosswalkOpenXRange: [-3.55, 0.85],
    },
  },

  // --------------------------------------------------------------------------
  // 4. HOTDOG VENDOR CART (28-deg Striped Awning, restitution 0.28) + CORNER ENSEMBLE
  // --------------------------------------------------------------------------
  {
    id: 'hotdog-cart-corner',
    name: 'Corner Plaza Hotdog Vendor Cart (28° Striped Awning Bank)',
    type: 'hotdog_cart_umbrella',
    zone: 'sidewalk',
    position: [17.5, ELEVATIONS.SIDEWALK_Y, -16.35],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: HOTDOG_CART_YAW,
    localSize: HOTDOG_CART_LOCAL_SIZE,
    aabb: HOTDOG_CART_FULL_AABB,
    solidColliders: [
      HOTDOG_CART_CARRIAGE_AABB,
      {
        min: [
          HOTDOG_CART_FULL_AABB.min[0],
          ELEVATIONS.SIDEWALK_Y + 1.7,
          HOTDOG_CART_FULL_AABB.min[2],
        ],
        max: [
          HOTDOG_CART_FULL_AABB.max[0],
          HOTDOG_CART_FULL_AABB.max[1],
          HOTDOG_CART_FULL_AABB.max[2],
        ],
      },
    ],
    surfaceTag: 'awning_cushion',
    blocksGroundRoll: true,
    reactive: {
      kind: 'awning_cushion_bank',
      zoneCenter: HOTDOG_AWNING_CENTER,
      zoneHalfExtents: [0.94, 0.35, 0.95],
      restitution: 0.28,
      underpassClearHeight: 0.56,
      underpassClearWidth: 1.05,
    },
    hotdogAwningMeta: {
      pitchDeg: 28,
      restitution: 0.28,
      awningCenter: HOTDOG_AWNING_CENTER,
      awningSize: [1.88, 0.06, 1.65],
      worldNormal: HOTDOG_AWNING_NORMAL_INFO.worldNormal,
      designIncomingVelocity: HOTDOG_DESIGN_V_IN,
      designReflectedVelocity: HOTDOG_DESIGN_V_OUT,
      predictedGreenLandingXZ: HOTDOG_PREDICTED_TRAJECTORY.landingXZ,
      predictedStopXZ: HOTDOG_PREDICTED_TRAJECTORY.stopXZ,
    },
  },
  {
    id: 'menu-board-corner',
    name: 'Hotdog Vendor Chalkboard Menu A-Frame',
    type: 'menu_a_frame_board',
    zone: 'sidewalk',
    position: [15.65, ELEVATIONS.SIDEWALK_Y, -16.5],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: -2.45,
    localSize: [0.65, 1.05, 0.55],
    aabb: computeRotatedAABB([15.65, ELEVATIONS.SIDEWALK_Y, -16.5], [0.65, 1.05, 0.55], -2.45),
    solidColliders: [
      computeRotatedAABB([15.65, ELEVATIONS.SIDEWALK_Y, -16.5], [0.65, 1.05, 0.55], -2.45),
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'subway-bench-corner',
    name: 'Corner Plaza Wooden Subway Bench',
    type: 'subway_bench',
    zone: 'sidewalk',
    position: [13.4, ELEVATIONS.SIDEWALK_Y, -15.45],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: Math.PI,
    localSize: [1.85, 0.88, 0.68],
    aabb: computeRotatedAABB([13.4, ELEVATIONS.SIDEWALK_Y, -15.45], [1.85, 0.88, 0.68], Math.PI),
    solidColliders: [
      computeRotatedAABB([13.4, ELEVATIONS.SIDEWALK_Y, -15.45], [1.85, 0.88, 0.68], Math.PI),
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'trash-bin-corner',
    name: 'Corner Plaza Cast-Iron Trash Receptacle',
    type: 'trash_receptacle',
    zone: 'sidewalk',
    position: [11.4, ELEVATIONS.SIDEWALK_Y, -15.45],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: 0,
    localSize: [0.58, 0.96, 0.58],
    aabb: computeRotatedAABB([11.4, ELEVATIONS.SIDEWALK_Y, -15.45], [0.58, 0.96, 0.58], 0),
    solidColliders: [
      computeRotatedAABB([11.4, ELEVATIONS.SIDEWALK_Y, -15.45], [0.58, 0.96, 0.58], 0),
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },

  // --------------------------------------------------------------------------
  // 5. SPEWING FIRE HYDRANT (Exact 0.50m from Storm-Drain Grate, Arcing into Curved Gutter)
  // --------------------------------------------------------------------------
  {
    id: 'hydrant-corner-se',
    name: 'Spewing Corner Fire Hydrant (Curved Gutter Water Boost)',
    type: 'fire_hydrant_jet',
    zone: 'sidewalk',
    position: [4.3, ELEVATIONS.SIDEWALK_Y, -15.3],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: -Math.PI * 0.72, // Aims stream NW into curved storm-drain gutter entry [3.80, -0.02, -15.80]
    localSize: [0.46, 0.92, 0.46],
    aabb: computeRotatedAABB([4.3, ELEVATIONS.SIDEWALK_Y, -15.3], [0.46, 0.92, 0.46], 0),
    solidColliders: [
      computeRotatedAABB([4.3, ELEVATIONS.SIDEWALK_Y, -15.3], [0.46, 0.92, 0.46], 0),
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
    reactive: {
      kind: 'hydrant_water_jet',
      zoneCenter: [4.0, 0.25, -16.2],
      zoneRadius: 1.35,
      boostVelocity: [11.8, 0.0, 0.0],
    },
    hydrantBoostMeta: {
      nearestGrateId: 'storm-grate-corner-hydrant',
      gratePosition: [3.8, ELEVATIONS.GUTTER_CHANNEL_Y, -15.3],
      distanceToGrateMeters: 0.5,
      curvedGutterId: 'gutter-corner-se-90',
      streamImpactPoint: [3.8, ELEVATIONS.GUTTER_CHANNEL_Y, -15.8],
      gutterExitBoostVector: [11.8, 0.0, 0.0],
    },
  },

  // --------------------------------------------------------------------------
  // 6. PUFFING SUBWAY STEAM GRATE (Flush at y=0.00m Utility Bay, Pops Over Fountain!)
  // --------------------------------------------------------------------------
  {
    id: 'steam-grate-corner',
    name: 'Rhythmic Subway Steam Grate (Pops Ball Over Fountain Hazard)',
    type: 'subway_steam_grate',
    zone: 'road',
    position: [12.8, ELEVATIONS.ROAD_ASPHALT_Y, -21.6],
    groundY: ELEVATIONS.ROAD_ASPHALT_Y,
    rotationY: 0,
    localSize: [1.75, 0.04, 1.75],
    aabb: computeRotatedAABB([12.8, ELEVATIONS.ROAD_ASPHALT_Y, -21.6], [1.75, 0.04, 1.75], 0),
    solidColliders: [], // Flush steel grate — zero ground blocking
    surfaceTag: 'road_asphalt',
    blocksGroundRoll: false,
    reactive: {
      kind: 'steam_updraft',
      zoneCenter: [12.8, 0.85, -21.6],
      zoneHalfExtents: [0.9, 0.85, 0.9],
      boostVelocity: [1.0, 10.6, 0.0],
      cycleSeconds: 3.2,
      dutyCycle: 0.5,
    },
    steamLiftMeta: {
      utilityBayBoundsXZ: { minX: 11.8, maxX: 13.8, minZ: -22.6, maxZ: -20.6 },
      cycleSeconds: 3.2,
      activeSeconds: 1.6,
      upwardImpulseVelocity: [1.0, 10.6, 0.0],
      clearsFountainId: 'fountain-courtyard-front',
      targetFrontFringePoint: [23.2, ELEVATIONS.COURTYARD_GREEN_Y, -21.6],
    },
  },

  // --------------------------------------------------------------------------
  // 7. DECORATIVE STONE FOUNTAIN HAZARD (Front-Center of +0.60m Courtyard Green)
  // --------------------------------------------------------------------------
  {
    id: 'fountain-courtyard-front',
    name: 'Courtyard Tiered Limestone Fountain Hazard (+1 Stroke Quick-Drop)',
    type: 'fountain_water_hazard',
    zone: 'courtyard_green',
    position: [20.55, ELEVATIONS.COURTYARD_GREEN_Y, -21.6],
    groundY: ELEVATIONS.COURTYARD_GREEN_Y,
    rotationY: 0,
    localSize: [2.5, 1.42, 2.5],
    aabb: computeRotatedAABB([20.55, ELEVATIONS.COURTYARD_GREEN_Y, -21.6], [2.5, 1.42, 2.5], 0),
    // Two-tier CAD collision & occlusion envelope: low 2.50m x 0.34m octagonal basin rim + narrow 1.12m central spire
    solidColliders: [
      computeRotatedAABB([20.55, ELEVATIONS.COURTYARD_GREEN_Y, -21.6], [2.5, 0.34, 2.5], 0),
      {
        min: [20.55 - 0.56, ELEVATIONS.COURTYARD_GREEN_Y + 0.34, -21.6 - 0.56],
        max: [20.55 + 0.56, ELEVATIONS.COURTYARD_GREEN_Y + 1.42, -21.6 + 0.56],
      },
    ],
    surfaceTag: 'fountain_hazard',
    blocksGroundRoll: true,
    reactive: {
      kind: 'water_hazard',
      zoneCenter: [20.55, ELEVATIONS.FOUNTAIN_WATER_Y, -21.6],
      zoneRadius: 1.15,
      quickDropPosition: FOUNTAIN_QUICK_DROP_POSITION,
      penaltyStrokes: 1,
    },
  },

  // --------------------------------------------------------------------------
  // 8. PATIO ROUGH: CAFÉ BISTRO UMBRELLA SETS & DENSE PLANTER HEDGES (+0.60m)
  // --------------------------------------------------------------------------
  {
    id: 'bistro-courtyard-north-1',
    name: 'North Terrace Café Bistro Set West',
    type: 'bistro_umbrella_set',
    zone: 'courtyard_patio',
    position: [21.6, ELEVATIONS.COURTYARD_GREEN_Y, -28.2],
    groundY: ELEVATIONS.COURTYARD_GREEN_Y,
    rotationY: 0.2,
    localSize: [2.1, 2.32, 2.1],
    aabb: computeRotatedAABB([21.6, ELEVATIONS.COURTYARD_GREEN_Y, -28.2], [2.1, 2.32, 2.1], 0.2),
    solidColliders: [
      computeRotatedAABB([21.6, ELEVATIONS.COURTYARD_GREEN_Y, -28.2], [1.4, 2.32, 1.4], 0),
    ],
    surfaceTag: 'umbrella_bounce',
    blocksGroundRoll: true,
    reactive: {
      kind: 'umbrella_trampoline',
      zoneCenter: [21.6, ELEVATIONS.COURTYARD_GREEN_Y + 2.05, -28.2],
      zoneRadius: 1.14,
      restitution: 0.55,
    },
  },
  {
    id: 'bistro-courtyard-north-2',
    name: 'North Terrace Café Bistro Set Center',
    type: 'bistro_umbrella_set',
    zone: 'courtyard_patio',
    position: [25.4, ELEVATIONS.COURTYARD_GREEN_Y, -28.2],
    groundY: ELEVATIONS.COURTYARD_GREEN_Y,
    rotationY: -0.15,
    localSize: [2.1, 2.32, 2.1],
    aabb: computeRotatedAABB([25.4, ELEVATIONS.COURTYARD_GREEN_Y, -28.2], [2.1, 2.32, 2.1], -0.15),
    solidColliders: [
      computeRotatedAABB([25.4, ELEVATIONS.COURTYARD_GREEN_Y, -28.2], [1.4, 2.32, 1.4], 0),
    ],
    surfaceTag: 'umbrella_bounce',
    blocksGroundRoll: true,
    reactive: {
      kind: 'umbrella_trampoline',
      zoneCenter: [25.4, ELEVATIONS.COURTYARD_GREEN_Y + 2.05, -28.2],
      zoneRadius: 1.14,
      restitution: 0.55,
    },
  },
  {
    id: 'bistro-courtyard-north-3',
    name: 'North Terrace Café Bistro Set East',
    type: 'bistro_umbrella_set',
    zone: 'courtyard_patio',
    position: [29.2, ELEVATIONS.COURTYARD_GREEN_Y, -28.2],
    groundY: ELEVATIONS.COURTYARD_GREEN_Y,
    rotationY: 0.35,
    localSize: [2.1, 2.32, 2.1],
    aabb: computeRotatedAABB([29.2, ELEVATIONS.COURTYARD_GREEN_Y, -28.2], [2.1, 2.32, 2.1], 0.35),
    solidColliders: [
      computeRotatedAABB([29.2, ELEVATIONS.COURTYARD_GREEN_Y, -28.2], [1.4, 2.32, 1.4], 0),
    ],
    surfaceTag: 'umbrella_bounce',
    blocksGroundRoll: true,
    reactive: {
      kind: 'umbrella_trampoline',
      zoneCenter: [29.2, ELEVATIONS.COURTYARD_GREEN_Y + 2.05, -28.2],
      zoneRadius: 1.14,
      restitution: 0.55,
    },
  },
  {
    id: 'bistro-courtyard-south-1',
    name: 'South Terrace Café Bistro Set West',
    type: 'bistro_umbrella_set',
    zone: 'courtyard_patio',
    position: [24.0, ELEVATIONS.COURTYARD_GREEN_Y, -15.3],
    groundY: ELEVATIONS.COURTYARD_GREEN_Y,
    rotationY: -0.25,
    localSize: [2.1, 2.32, 2.1],
    aabb: computeRotatedAABB([24.0, ELEVATIONS.COURTYARD_GREEN_Y, -15.3], [2.1, 2.32, 2.1], -0.25),
    solidColliders: [
      computeRotatedAABB([24.0, ELEVATIONS.COURTYARD_GREEN_Y, -15.3], [1.4, 2.32, 1.4], 0),
    ],
    surfaceTag: 'umbrella_bounce',
    blocksGroundRoll: true,
    reactive: {
      kind: 'umbrella_trampoline',
      zoneCenter: [24.0, ELEVATIONS.COURTYARD_GREEN_Y + 2.05, -15.3],
      zoneRadius: 1.14,
      restitution: 0.55,
    },
  },
  {
    id: 'bistro-courtyard-south-2',
    name: 'South Terrace Café Bistro Set East',
    type: 'bistro_umbrella_set',
    zone: 'courtyard_patio',
    position: [28.4, ELEVATIONS.COURTYARD_GREEN_Y, -15.3],
    groundY: ELEVATIONS.COURTYARD_GREEN_Y,
    rotationY: 0.18,
    localSize: [2.1, 2.32, 2.1],
    aabb: computeRotatedAABB([28.4, ELEVATIONS.COURTYARD_GREEN_Y, -15.3], [2.1, 2.32, 2.1], 0.18),
    solidColliders: [
      computeRotatedAABB([28.4, ELEVATIONS.COURTYARD_GREEN_Y, -15.3], [1.4, 2.32, 1.4], 0),
    ],
    surfaceTag: 'umbrella_bounce',
    blocksGroundRoll: true,
    reactive: {
      kind: 'umbrella_trampoline',
      zoneCenter: [28.4, ELEVATIONS.COURTYARD_GREEN_Y + 2.05, -15.3],
      zoneRadius: 1.14,
      restitution: 0.55,
    },
  },
  // Dense Planter Hedges cushioning the East/Back Courtyard Fringe (Patio Rough damping, zero OOB)
  {
    id: 'hedge-courtyard-east-north',
    name: 'East Courtyard Boxwood Planter Hedge North',
    type: 'planter_hedge_rough',
    zone: 'courtyard_patio',
    position: [32.1, ELEVATIONS.COURTYARD_GREEN_Y, -24.8],
    groundY: ELEVATIONS.COURTYARD_GREEN_Y,
    rotationY: 0,
    localSize: [1.1, 0.92, 2.7],
    aabb: computeRotatedAABB([32.1, ELEVATIONS.COURTYARD_GREEN_Y, -24.8], [1.1, 0.92, 2.7], 0),
    solidColliders: [
      computeRotatedAABB([32.1, ELEVATIONS.COURTYARD_GREEN_Y, -24.8], [1.1, 0.92, 2.7], 0),
    ],
    surfaceTag: 'patio_rough',
    blocksGroundRoll: true,
    reactive: {
      kind: 'patio_rough_damping',
      zoneCenter: [32.1, ELEVATIONS.COURTYARD_GREEN_Y + 0.46, -24.8],
      zoneHalfExtents: [0.65, 0.5, 1.45],
      restitution: 0.22,
    },
  },
  {
    id: 'hedge-courtyard-east-center',
    name: 'East Courtyard Boxwood Planter Hedge Center',
    type: 'planter_hedge_rough',
    zone: 'courtyard_patio',
    position: [32.1, ELEVATIONS.COURTYARD_GREEN_Y, -21.6],
    groundY: ELEVATIONS.COURTYARD_GREEN_Y,
    rotationY: 0,
    localSize: [1.1, 0.92, 2.7],
    aabb: computeRotatedAABB([32.1, ELEVATIONS.COURTYARD_GREEN_Y, -21.6], [1.1, 0.92, 2.7], 0),
    solidColliders: [
      computeRotatedAABB([32.1, ELEVATIONS.COURTYARD_GREEN_Y, -21.6], [1.1, 0.92, 2.7], 0),
    ],
    surfaceTag: 'patio_rough',
    blocksGroundRoll: true,
    reactive: {
      kind: 'patio_rough_damping',
      zoneCenter: [32.1, ELEVATIONS.COURTYARD_GREEN_Y + 0.46, -21.6],
      zoneHalfExtents: [0.65, 0.5, 1.45],
      restitution: 0.22,
    },
  },
  {
    id: 'hedge-courtyard-east-south',
    name: 'East Courtyard Boxwood Planter Hedge South',
    type: 'planter_hedge_rough',
    zone: 'courtyard_patio',
    position: [32.1, ELEVATIONS.COURTYARD_GREEN_Y, -18.4],
    groundY: ELEVATIONS.COURTYARD_GREEN_Y,
    rotationY: 0,
    localSize: [1.1, 0.92, 2.7],
    aabb: computeRotatedAABB([32.1, ELEVATIONS.COURTYARD_GREEN_Y, -18.4], [1.1, 0.92, 2.7], 0),
    solidColliders: [
      computeRotatedAABB([32.1, ELEVATIONS.COURTYARD_GREEN_Y, -18.4], [1.1, 0.92, 2.7], 0),
    ],
    surfaceTag: 'patio_rough',
    blocksGroundRoll: true,
    reactive: {
      kind: 'patio_rough_damping',
      zoneCenter: [32.1, ELEVATIONS.COURTYARD_GREEN_Y + 0.46, -18.4],
      zoneHalfExtents: [0.65, 0.5, 1.45],
      restitution: 0.22,
    },
  },

  // --------------------------------------------------------------------------
  // 9. SOUTH SUBWAY ENTRANCE PLAZA BACKSTOP PROPS (Behind Tee, y = +0.15m)
  // --------------------------------------------------------------------------
  {
    id: 'subway-portal-south',
    name: '5th Ave Brick & Wrought-Iron Subway Entrance Portal',
    type: 'subway_entrance_portal',
    zone: 'subway_plaza',
    // Placed at z = +35.80 (AABB z: 34.10..37.50), cleanly south of Default Tee Camera (z = 32.72)!
    position: [0.0, ELEVATIONS.SIDEWALK_Y, 35.8],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: Math.PI, // Facing North (-Z) toward Tee
    localSize: [4.2, 3.1, 3.4],
    aabb: computeRotatedAABB([0.0, ELEVATIONS.SIDEWALK_Y, 35.8], [4.2, 3.1, 3.4], Math.PI),
    solidColliders: [
      computeRotatedAABB([0.0, ELEVATIONS.SIDEWALK_Y, 35.8], [4.2, 3.1, 3.4], Math.PI),
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'bollard-subway-1',
    name: 'Subway Plaza Wrought-Iron Bollard West-Outer',
    type: 'brass_bollard',
    zone: 'subway_plaza',
    position: [-3.1, ELEVATIONS.SIDEWALK_Y, 28.95],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: 0,
    localSize: [0.34, 0.88, 0.34],
    aabb: computeRotatedAABB([-3.1, ELEVATIONS.SIDEWALK_Y, 28.95], [0.34, 0.88, 0.34], 0),
    solidColliders: [
      computeRotatedAABB([-3.1, ELEVATIONS.SIDEWALK_Y, 28.95], [0.34, 0.88, 0.34], 0),
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'bollard-subway-2',
    name: 'Subway Plaza Wrought-Iron Bollard West-Inner',
    type: 'brass_bollard',
    zone: 'subway_plaza',
    position: [-1.55, ELEVATIONS.SIDEWALK_Y, 28.95],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: 0,
    localSize: [0.34, 0.88, 0.34],
    aabb: computeRotatedAABB([-1.55, ELEVATIONS.SIDEWALK_Y, 28.95], [0.34, 0.88, 0.34], 0),
    solidColliders: [
      computeRotatedAABB([-1.55, ELEVATIONS.SIDEWALK_Y, 28.95], [0.34, 0.88, 0.34], 0),
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'bollard-subway-3',
    name: 'Subway Plaza Wrought-Iron Bollard East-Inner',
    type: 'brass_bollard',
    zone: 'subway_plaza',
    position: [1.55, ELEVATIONS.SIDEWALK_Y, 28.95],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: 0,
    localSize: [0.34, 0.88, 0.34],
    aabb: computeRotatedAABB([1.55, ELEVATIONS.SIDEWALK_Y, 28.95], [0.34, 0.88, 0.34], 0),
    solidColliders: [
      computeRotatedAABB([1.55, ELEVATIONS.SIDEWALK_Y, 28.95], [0.34, 0.88, 0.34], 0),
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'bollard-subway-4',
    name: 'Subway Plaza Wrought-Iron Bollard East-Outer',
    type: 'brass_bollard',
    zone: 'subway_plaza',
    position: [3.1, ELEVATIONS.SIDEWALK_Y, 28.95],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: 0,
    localSize: [0.34, 0.88, 0.34],
    aabb: computeRotatedAABB([3.1, ELEVATIONS.SIDEWALK_Y, 28.95], [0.34, 0.88, 0.34], 0),
    solidColliders: [
      computeRotatedAABB([3.1, ELEVATIONS.SIDEWALK_Y, 28.95], [0.34, 0.88, 0.34], 0),
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'tree-subway-plaza-west',
    name: 'Subway Plaza West Pit Street Tree',
    type: 'street_tree',
    zone: 'subway_plaza',
    position: [-5.3, ELEVATIONS.SIDEWALK_Y, 33.4],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: 0,
    localSize: [1.2, 2.85, 1.2],
    aabb: computeRotatedAABB([-5.3, ELEVATIONS.SIDEWALK_Y, 33.4], [1.2, 2.85, 1.2], 0),
    solidColliders: [
      computeRotatedAABB([-5.3, ELEVATIONS.SIDEWALK_Y, 33.4], [1.0, 2.85, 1.0], 0),
    ],
    surfaceTag: 'patio_rough',
    blocksGroundRoll: true,
  },
  {
    id: 'tree-subway-plaza-east',
    name: 'Subway Plaza East Pit Street Tree',
    type: 'street_tree',
    zone: 'subway_plaza',
    position: [5.3, ELEVATIONS.SIDEWALK_Y, 33.4],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: 0,
    localSize: [1.2, 2.85, 1.2],
    aabb: computeRotatedAABB([5.3, ELEVATIONS.SIDEWALK_Y, 33.4], [1.2, 2.85, 1.2], 0),
    solidColliders: [
      computeRotatedAABB([5.3, ELEVATIONS.SIDEWALK_Y, 33.4], [1.0, 2.85, 1.0], 0),
    ],
    surfaceTag: 'patio_rough',
    blocksGroundRoll: true,
  },

  // --------------------------------------------------------------------------
  // 10. VINTAGE COAXIAL STREETLAMPS, NORTH PLAZA TREES & PIGEON FLOCK
  // --------------------------------------------------------------------------
  {
    id: 'lamp-west-south',
    name: '5th Ave West Vintage Streetlamp South',
    type: 'street_lamp',
    zone: 'sidewalk',
    position: [-4.6, ELEVATIONS.SIDEWALK_Y, 24.2],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: Math.PI * 0.5,
    localSize: [0.45, 3.3, 0.45],
    aabb: computeRotatedAABB([-4.6, ELEVATIONS.SIDEWALK_Y, 24.2], [0.45, 3.3, 0.45], 0),
    solidColliders: [
      computeRotatedAABB([-4.6, ELEVATIONS.SIDEWALK_Y, 24.2], [0.42, 3.3, 0.42], 0),
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'lamp-east-south',
    name: '5th Ave East Vintage Streetlamp South',
    type: 'street_lamp',
    zone: 'sidewalk',
    position: [4.6, ELEVATIONS.SIDEWALK_Y, 17.5],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: -Math.PI * 0.5,
    localSize: [0.45, 3.3, 0.45],
    aabb: computeRotatedAABB([4.6, ELEVATIONS.SIDEWALK_Y, 17.5], [0.45, 3.3, 0.45], 0),
    solidColliders: [
      computeRotatedAABB([4.6, ELEVATIONS.SIDEWALK_Y, 17.5], [0.42, 3.3, 0.42], 0),
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'lamp-west-north',
    name: '5th Ave Crosswalk Vintage Streetlamp',
    type: 'street_lamp',
    zone: 'sidewalk',
    position: [-4.6, ELEVATIONS.SIDEWALK_Y, -18.2],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: Math.PI * 0.5,
    localSize: [0.45, 3.3, 0.45],
    aabb: computeRotatedAABB([-4.6, ELEVATIONS.SIDEWALK_Y, -18.2], [0.45, 3.3, 0.45], 0),
    solidColliders: [
      computeRotatedAABB([-4.6, ELEVATIONS.SIDEWALK_Y, -18.2], [0.42, 3.3, 0.42], 0),
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'lamp-mercer-north',
    name: 'Mercer Promenade Vintage Streetlamp',
    type: 'street_lamp',
    zone: 'sidewalk',
    position: [9.2, ELEVATIONS.SIDEWALK_Y, -26.65],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: 0,
    localSize: [0.45, 3.3, 0.45],
    aabb: computeRotatedAABB([9.2, ELEVATIONS.SIDEWALK_Y, -26.65], [0.45, 3.3, 0.45], 0),
    solidColliders: [
      computeRotatedAABB([9.2, ELEVATIONS.SIDEWALK_Y, -26.65], [0.42, 3.3, 0.42], 0),
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'lamp-courtyard-entry-north',
    name: 'Courtyard Entrance North Lantern Post',
    type: 'street_lamp',
    zone: 'courtyard_green',
    position: [19.45, ELEVATIONS.COURTYARD_GREEN_Y, -25.8],
    groundY: ELEVATIONS.COURTYARD_GREEN_Y,
    rotationY: 0,
    localSize: [0.45, 3.3, 0.45],
    aabb: computeRotatedAABB([19.45, ELEVATIONS.COURTYARD_GREEN_Y, -25.8], [0.45, 3.3, 0.45], 0),
    solidColliders: [
      computeRotatedAABB([19.45, ELEVATIONS.COURTYARD_GREEN_Y, -25.8], [0.42, 3.3, 0.42], 0),
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'tree-north-corner-plaza',
    name: 'Caffè Veneziano Corner Pit Tree',
    type: 'street_tree',
    zone: 'sidewalk',
    position: [2.2, ELEVATIONS.SIDEWALK_Y, -27.6],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: 0.4,
    localSize: [1.2, 2.9, 1.2],
    aabb: computeRotatedAABB([2.2, ELEVATIONS.SIDEWALK_Y, -27.6], [1.2, 2.9, 1.2], 0),
    solidColliders: [
      computeRotatedAABB([2.2, ELEVATIONS.SIDEWALK_Y, -27.6], [1.0, 2.9, 1.0], 0),
    ],
    surfaceTag: 'patio_rough',
    blocksGroundRoll: true,
  },
  {
    id: 'pigeons-corner-plaza',
    name: 'Mercer Corner Sidewalk Pigeon Flock',
    type: 'pigeon_flock',
    zone: 'sidewalk',
    position: [-5.6, ELEVATIONS.SIDEWALK_Y, -27.2],
    groundY: ELEVATIONS.SIDEWALK_Y,
    rotationY: 0.6,
    localSize: [1.4, 0.4, 1.4],
    aabb: computeRotatedAABB([-5.6, ELEVATIONS.SIDEWALK_Y, -27.2], [1.4, 0.4, 1.4], 0),
    solidColliders: [], // Reactive scatter sensor only
    surfaceTag: 'sidewalk_paver',
    blocksGroundRoll: false,
    reactive: {
      kind: 'pigeon_scatter',
      zoneCenter: [-5.6, ELEVATIONS.SIDEWALK_Y + 0.25, -27.2],
      zoneRadius: 1.2,
    },
  },
];

// ============================================================================
// MULTI-ROUTE STRATEGIC SHOT MATRIX
// ============================================================================

export const STRATEGIC_SHOT_ROUTES: StrategicShotRouteSpec[] = [
  {
    id: 'route-1a-left-center-driver-crosswalk',
    name: 'Controlled Left-Center Drive to Crosswalk A-Position',
    strokeNumber: 1,
    recommendedClub: 'driver',
    origin: TEE_POSITION,
    targetPoint: A_POSITION_CROSSWALK.center,
    summary:
      'Shapes a sunlit carry down the open left-center 5th Ave lane past the overhanging right street tree onto the painted Crosswalk A-Position.',
    keyPropIds: ['tree-overhang-east'],
  },
  {
    id: 'route-1b-left-sidewalk-scaffolding-skimmer',
    name: 'Left Sidewalk Scaffolding Tunnel Skimmer Punch',
    strokeNumber: 1,
    recommendedClub: 'skimmer',
    origin: TEE_POSITION,
    targetPoint: A_POSITION_CROSSWALK.center,
    summary:
      'Climbs the West ADA curb ramp onto the +0.15m sidewalk, threads cleanly underneath the 2.35m-clear flush Scaffolding Shed, and exits onto the A-Position Crosswalk.',
    keyPropIds: ['scaffolding-shed-west'],
  },
  {
    id: 'route-1c-right-van-ramp-rooftop-launch',
    name: 'Delivery Van Rear Ramp & Rooftop Launch',
    strokeNumber: 1,
    recommendedClub: 'skimmer',
    origin: TEE_POSITION,
    targetPoint: [3.2, ELEVATIONS.ROAD_ASPHALT_Y, -20.5],
    summary:
      'Threads between the loading-zone hazard cones, rides flush up the lowered 22.56° Delivery Van rear ramp, and launches off the van roof toward the 5th & Mercer corner.',
    keyPropIds: ['delivery-van-east', 'cone-van-south', 'cone-van-north'],
  },
  {
    id: 'route-2a-hotdog-awning-cushion-lob',
    name: 'Cloud Lobber Wedge off 28° Hotdog Cart Striped Awning',
    strokeNumber: 2,
    recommendedClub: 'wedge',
    origin: A_POSITION_CROSSWALK.center,
    targetPoint: HOLE_1_CUP.position,
    summary:
      'Lobs from the A-Position Crosswalk onto the 28°-pitched red-and-white Hotdog Cart awning (restitution 0.28), cushioning softly over the wrought-iron planter low wall within 2m of the Cup.',
    keyPropIds: ['hotdog-cart-corner'],
  },
  {
    id: 'route-2b-hydrant-storm-gutter-corner-boost',
    name: 'Fire Hydrant & 90° Curved Storm-Drain Gutter Boost',
    strokeNumber: 2,
    recommendedClub: 'skimmer',
    origin: A_POSITION_CROSSWALK.center,
    targetPoint: HOLE_1_CUP.position,
    summary:
      'Skims into the corner Fire Hydrant water stream & 90° curved storm-drain gutter, banking around the 45° beveled stone curb and riding straight up the flush Stone Courtyard Ramp onto the +0.60m green.',
    keyPropIds: ['hydrant-corner-se'],
  },
  {
    id: 'route-2c-subway-steam-grate-fountain-hop',
    name: 'Subway Steam Grate Pop Over Courtyard Fountain',
    strokeNumber: 2,
    recommendedClub: 'skimmer',
    origin: [2.5, ELEVATIONS.ROAD_ASPHALT_Y, -21.6],
    targetPoint: [22.9, ELEVATIONS.COURTYARD_GREEN_Y, -21.6],
    summary:
      'Times the rhythmic upward Subway Steam Grate puff in the Mercer utility bay to pop a low ground shot cleanly over the front Decorative Stone Fountain Hazard onto the front green fringe.',
    keyPropIds: ['steam-grate-corner', 'fountain-courtyard-front'],
  },
];

// ============================================================================
// GATE-3 PLAYER AUDIT STATIONS & STREET SCOUT PEEK CAMERA FRAMING
// ============================================================================

export const AUDIT_CAMERA_STATIONS: AuditCameraStationSpec[] = [
  {
    id: 'tee_forward',
    label: 'Station 1: Tee Looking North Down 5th Ave',
    groundY: ELEVATIONS.ROAD_ASPHALT_Y,
    position: [0.0, 1.65, 27.52],
    lookAt: [0.0, 1.35, -16.5],
    fovDeg: 50,
    expectedLandmarks: [
      'scaffolding-shed-west',
      'delivery-van-east',
      'tree-overhang-east',
      'crosswalk-a-position',
    ],
  },
  {
    id: 'tee_backward_180',
    label: 'Station 2: Tee Looking 180° Backward at Subway Entrance Plaza',
    groundY: ELEVATIONS.ROAD_ASPHALT_Y,
    position: [0.0, 1.65, 27.52],
    lookAt: [0.0, 2.05, 36.2],
    fovDeg: 54,
    expectedLandmarks: [
      'bollard-subway-2',
      'bollard-subway-3',
      'subway-portal-south',
      'bld-south-1',
      'bld-south-2',
    ],
  },
  {
    id: 'mid_street',
    label: 'Station 3: Mid-Street Between Scaffolding Shed & Delivery Van',
    groundY: ELEVATIONS.ROAD_ASPHALT_Y,
    position: [-0.8, 1.65, 3.5],
    lookAt: [1.5, 1.35, -17.5],
    fovDeg: 50,
    expectedLandmarks: [
      'scaffolding-shed-west',
      'delivery-van-east',
      'tree-overhang-east',
      'bld-se-corner-bodega',
    ],
  },
  {
    id: 'corner_dogleg',
    label: 'Station 4: Corner Dogleg A-Position Looking East Into Courtyard',
    groundY: ELEVATIONS.ROAD_ASPHALT_Y,
    position: [-1.2, 1.65, -16.5],
    lookAt: [21.5, 1.35, -21.6],
    fovDeg: 50,
    expectedLandmarks: [
      'hydrant-corner-se',
      'hotdog-cart-corner',
      'steam-grate-corner',
      'ramp-courtyard-main',
      'fountain-courtyard-front',
      'cup-hole-1-mercer-courtyard',
    ],
  },
  {
    id: 'courtyard_green_out',
    label: 'Station 5: Elevated +0.60m Courtyard Green Looking Out Toward Mercer St',
    groundY: ELEVATIONS.COURTYARD_GREEN_Y,
    // Offset South to z = -19.8 so the cup flagpole sits gracefully off-center instead of bisecting the frame!
    position: [29.2, ELEVATIONS.COURTYARD_GREEN_Y + 1.65, -19.8],
    lookAt: [2.0, 1.3, -24.2],
    fovDeg: 54,
    expectedLandmarks: [
      'cup-hole-1-mercer-courtyard',
      'fountain-courtyard-front',
      'bistro-courtyard-north-2',
      'ramp-courtyard-main',
      'bld-west-4',
    ],
  },
];

export const STREET_SCOUT_CAMERA_PRESET: StreetScoutCameraSpec = {
  id: 'street_scout_peek',
  label: 'Street Scout Elevated Corner Canyon Vantage (Unobstructed Green Sightline)',
  // Elevated above the 5th & Mercer dogleg intersection below 10.5m cornices with 100% clear sightline to HOLE_1_CUP!
  position: [7.8, 9.6, -24.8],
  lookAt: [23.4, 1.35, -21.4],
  fovDeg: 52,
  maxAllowedHeightY: 10.5,
};

export const COURSE_MASTER_PLAN: CourseMasterPlan = {
  courseId: 'classic',
  holeNumber: 1,
  holeId: 'hole-1-5th-and-mercer',
  holeName: 'Hole 1: 5th & Mercer',
  subtitle: 'Par 4 • 72m Dogleg Right • Street Corridor to Pocket-Park Courtyard',
  par: 4,
  targetCenterlineMeters: 72,
  computedCenterlineMeters: COMPUTED_CENTERLINE_METERS,
  worldBoundsXZ: {
    minX: -26.0,
    maxX: 52.0,
    minZ: -48.0,
    maxZ: 55.0,
  },
  teePosition: TEE_POSITION,
  teeElevationY: ELEVATIONS.ROAD_ASPHALT_Y,
  initialAimYaw: 0, // North (-Z) straight down 5th Ave
  aPositionCrosswalk: A_POSITION_CROSSWALK,
  vanLoadingZone: VAN_LOADING_ZONE,
  cup: HOLE_1_CUP,
  fountainDropZone: FOUNTAIN_QUICK_DROP_POSITION,
  centerlineSegments: CENTERLINE_SEGMENTS,
  groundZones: GROUND_ZONES,
  gutters: STORM_GUTTERS,
  stormGrates: STORM_DRAIN_GRATES,
  curbs: STONE_CURBS,
  ramps: WALKABLE_RAMPS,
  perimeterBuildings: PERIMETER_BUILDINGS,
  skylineBackdrops: SKYLINE_BACKDROPS,
  outerGroundSkirt: OUTER_CITY_GROUND_SKIRT,
  architecturalWalls: ARCHITECTURAL_WALLS,
  courtyardPergola: COURTYARD_PERGOLA,
  stringLightSpans: STRING_LIGHT_SPANS,
  props: COURSE_PROPS,
  strategicRoutes: STRATEGIC_SHOT_ROUTES,
  auditStations: AUDIT_CAMERA_STATIONS,
  streetScoutCamera: STREET_SCOUT_CAMERA_PRESET,
};

// ============================================================================
// ANALYTICAL ELEVATION, SURFACE & RAYCAST CLOSURE HELPERS
// ============================================================================

/**
 * Tests whether `(x, z)` lies inside `zone`, honoring any circular corner `arcClip`.
 */
export function isPointInGroundZone(x: number, z: number, zone: GroundSurfaceZoneSpec): boolean {
  const b = zone.boundsXZ;
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) {
    return false;
  }
  const clip = zone.arcClip;
  if (!clip) {
    return true;
  }
  const [px, pz] = clip.pivotXZ;
  const inQuadrant =
    (clip.quadrant === 'sw' && x <= px && z <= pz) ||
    (clip.quadrant === 'se' && x >= px && z <= pz) ||
    (clip.quadrant === 'nw' && x <= px && z >= pz) ||
    (clip.quadrant === 'ne' && x >= px && z >= pz);
  if (!inQuadrant) {
    return true;
  }
  const r = Math.hypot(x - px, z - pz);
  return clip.keepSide === 'inside' ? r <= clip.radius + 1e-6 : r >= clip.radius - 1e-6;
}

function isPointOnCurb(x: number, z: number, curb: StoneCurbSegmentSpec): boolean {
  if (
    (curb.kind === 'curved_90' || curb.kind === 'beveled_45') &&
    curb.arcPivotXZ &&
    curb.arcInnerRadius !== undefined &&
    curb.arcOuterRadius !== undefined
  ) {
    const dx = x - curb.arcPivotXZ[0];
    const dz = z - curb.arcPivotXZ[1];
    if (dx <= 1e-5 && dz <= 1e-5) {
      const r = Math.hypot(dx, dz);
      return r >= curb.arcInnerRadius - 1e-5 && r <= curb.arcOuterRadius + 1e-5;
    }
    return false;
  }
  if (curb.kind === 'straight') {
    return (
      x >= curb.aabb.min[0] - 1e-6 &&
      x <= curb.aabb.max[0] + 1e-6 &&
      z >= curb.aabb.min[2] - 1e-6 &&
      z <= curb.aabb.max[2] + 1e-6
    );
  }
  return false;
}

function isPointInGutter(x: number, z: number, gutter: StormGutterTrackSpec): boolean {
  const halfW = gutter.width * 0.5;
  if (gutter.kind === 'straight' && gutter.start && gutter.end) {
    const minX = Math.min(gutter.start[0], gutter.end[0]) - halfW;
    const maxX = Math.max(gutter.start[0], gutter.end[0]) + halfW;
    const minZ = Math.min(gutter.start[2], gutter.end[2]) - halfW;
    const maxZ = Math.max(gutter.start[2], gutter.end[2]) + halfW;
    return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
  }
  if (
    gutter.kind === 'corner_90' &&
    gutter.arcPivot &&
    gutter.arcRadius !== undefined &&
    gutter.startAngleRad !== undefined &&
    gutter.endAngleRad !== undefined
  ) {
    const dx = x - gutter.arcPivot[0];
    const dz = z - gutter.arcPivot[2];
    const r = Math.hypot(dx, dz);
    if (Math.abs(r - gutter.arcRadius) <= halfW + 1e-6) {
      let ang = Math.atan2(dz, dx);
      if (ang < 0) ang += Math.PI * 2;
      return ang >= gutter.startAngleRad - 1e-4 && ang <= gutter.endAngleRad + 1e-4;
    }
  }
  return false;
}

/**
 * Returns `true` iff `(x, z)` is explicitly covered by a walkable ramp, storm gutter,
 * stone curb, or `GroundSurfaceZoneSpec` (without relying on any fallback datum).
 */
export function isWalkablePointExplicitlyCovered(
  x: number,
  z: number,
  plan: CourseMasterPlan = COURSE_MASTER_PLAN,
): boolean {
  for (const ramp of plan.ramps) {
    const b = ramp.boundsXZ;
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return true;
  }
  for (const gutter of plan.gutters) {
    if (isPointInGutter(x, z, gutter)) return true;
  }
  for (const curb of plan.curbs) {
    if (isPointOnCurb(x, z, curb)) return true;
  }
  for (const zone of plan.groundZones) {
    if (isPointInGroundZone(x, z, zone)) return true;
  }
  return false;
}

/**
 * Evaluates the Delivery Box Van's continuous ramp -> roof-access kicker -> flat roof launch deck
 * surface elevation at `(x, z)` (`null` when outside the van ramp/roof corridor).
 */
export function getVanRampOrRoofElevationAt(
  x: number,
  z: number,
  plan: CourseMasterPlan = COURSE_MASTER_PLAN,
): number | null {
  for (const van of plan.props) {
    if (van.type !== 'delivery_box_van' || !van.vanRampMeta) continue;
    const meta = van.vanRampMeta;

    for (const ramp of [meta.slopedRampSpec, meta.roofAccessKickerSpec]) {
      if (!ramp) continue;
      const b = ramp.boundsXZ;
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
        const t =
          ramp.climbDirection === 'north'
            ? (b.maxZ - z) / Math.max(1e-6, b.maxZ - b.minZ)
            : (z - b.minZ) / Math.max(1e-6, b.maxZ - b.minZ);
        const clamped = Math.max(0, Math.min(1, t));
        return ramp.bottomY + (ramp.topY - ramp.bottomY) * clamped;
      }
    }

    const deck = meta.roofLaunchDeckBoundsXZ;
    if (
      deck &&
      x >= deck.minX &&
      x <= deck.maxX &&
      z >= deck.minZ &&
      z <= deck.maxZ
    ) {
      return meta.roofDeckTopY;
    }
  }

  return null;
}

/**
 * Evaluates exact walkable/playable ground elevation `y` at world `(x, z)` across
 * roads (`0.00m`), recessed storm gutters (`-0.02m`), sloped ramps (`0.00 -> 0.15` & `0.00 -> 0.60`),
 * sidewalks & subway plaza (`+0.15m`), and the elevated Pocket-Park Courtyard Green (`+0.60m`).
 */
export function getMasterPlanGroundElevationAt(
  x: number,
  z: number,
  plan: CourseMasterPlan = COURSE_MASTER_PLAN,
): number {
  // 1. Check sloped walkable ramps first (smooth linear interpolation along climbDirection)
  for (const ramp of plan.ramps) {
    const b = ramp.boundsXZ;
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
      let t = 0;
      if (ramp.climbDirection === 'east') {
        t = (x - b.minX) / Math.max(1e-6, b.maxX - b.minX);
      } else if (ramp.climbDirection === 'west') {
        t = (b.maxX - x) / Math.max(1e-6, b.maxX - b.minX);
      } else if (ramp.climbDirection === 'south') {
        t = (z - b.minZ) / Math.max(1e-6, b.maxZ - b.minZ);
      } else {
        t = (b.maxZ - z) / Math.max(1e-6, b.maxZ - b.minZ);
      }
      const clamped = Math.max(0, Math.min(1, t));
      return ramp.bottomY + (ramp.topY - ramp.bottomY) * clamped;
    }
  }

  // 2. Check recessed storm-drain gutters (-0.02m)
  for (const gutter of plan.gutters) {
    if (isPointInGutter(x, z, gutter)) {
      return gutter.channelY;
    }
  }

  // 3. Check continuous 15cm stone curbs (including curved 90-degree SE corner curb)
  for (const curb of plan.curbs) {
    if (isPointOnCurb(x, z, curb)) {
      return curb.topY;
    }
  }

  // 4. Check flat & arc-clipped ground zones (highest matching topY wins for overlays)
  let bestY: number | null = null;
  for (const zone of plan.groundZones) {
    if (isPointInGroundZone(x, z, zone)) {
      if (bestY === null || zone.topY > bestY) {
        bestY = zone.topY;
      }
    }
  }

  return bestY ?? ELEVATIONS.ROAD_ASPHALT_Y;
}

/**
 * Returns the dominant `PhysicsSurfaceTag` at world `(x, z)` (overlay tags like putting_green_turf,
 * patio_rough, crosswalk_landing, and courtyard_ramp take precedence over base slabs).
 */
export function getMasterPlanSurfaceTagAt(
  x: number,
  z: number,
  plan: CourseMasterPlan = COURSE_MASTER_PLAN,
): PhysicsSurfaceTag {
  for (const ramp of plan.ramps) {
    const b = ramp.boundsXZ;
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
      return ramp.surfaceTag;
    }
  }

  for (const gutter of plan.gutters) {
    if (isPointInGutter(x, z, gutter)) {
      return 'storm_gutter';
    }
  }

  for (const curb of plan.curbs) {
    if (isPointOnCurb(x, z, curb)) {
      return 'sidewalk_paver';
    }
  }

  // Iterate reverse so specialized overlays (green, fringe, patio_rough, crosswalk, loading zone) win over base slabs
  for (let i = plan.groundZones.length - 1; i >= 0; i--) {
    const zone = plan.groundZones[i];
    if (isPointInGroundZone(x, z, zone)) {
      if (zone.id === 'zone-se-corner-road-spandrel') {
        return 'road_asphalt';
      }
      return zone.surfaceTag;
    }
  }

  return 'road_asphalt';
}

export interface StationRaycastAuditOptions {
  azimuthStepDeg?: number;
  pitchAnglesDeg?: number[];
}

export interface StationRaycastAuditResult {
  stationId: string;
  totalRays: number;
  hitCount: number;
  escapedAnglesDeg: number[];
  escapedRays: Array<{ azimuthDeg: number; pitchDeg: number }>;
  maxHitDistanceMeters: number;
}

/**
 * Casts 360° 3D rays across configurable azimuth steps (`default = 1°`) and orbit pitch angles
 * (`default = [0°]`) from `origin` and checks that 100% of rays intersect enclosing architecture,
 * skyline towers, corridor slabs, or the outer city ground skirt within `maxBoundsDistance`.
 */
export function auditStation360PerimeterClosure(
  stationId: string,
  origin: Vec3Tuple,
  plan: CourseMasterPlan = COURSE_MASTER_PLAN,
  maxBoundsDistance = 120,
  options: StationRaycastAuditOptions = {},
): StationRaycastAuditResult {
  const azimuthStepDeg = options.azimuthStepDeg ?? 1;
  const pitchAnglesDeg = options.pitchAnglesDeg ?? [0];
  const verticalEnclosures: Array<{ aabb: AABB3D }> = [
    ...plan.perimeterBuildings,
    ...plan.skylineBackdrops,
    ...plan.architecturalWalls.filter(
      (w) =>
        w.kind === 'subway_ceramic_vault_wall' ||
        w.kind === 'subway_vault_ceiling_slab',
    ),
  ];
  const downwardSlabs: AABB3D[] = [
    ...plan.groundZones.map((z) => z.aabb),
    ...plan.ramps.map((r) => r.aabb),
  ];
  if (plan.outerGroundSkirt) {
    downwardSlabs.push(
      computeAABBFromBoundsXZ(
        plan.outerGroundSkirt.boundsXZ,
        plan.outerGroundSkirt.topY - 2.0,
        plan.outerGroundSkirt.topY,
      ),
    );
  }

  const escapedAnglesDeg: number[] = [];
  const escapedRays: Array<{ azimuthDeg: number; pitchDeg: number }> = [];
  let totalRays = 0;
  let hitCount = 0;
  let maxHitDist = 0;

  for (const pitchDeg of pitchAnglesDeg) {
    const pitchRad = (pitchDeg * Math.PI) / 180;
    const cosPitch = Math.cos(pitchRad);
    const sinPitch = Math.sin(pitchRad);

    for (let deg = 0; deg < 360 - 1e-9; deg += azimuthStepDeg) {
      totalRays++;
      const azRad = (deg * Math.PI) / 180;
      const dir3D: Vec3Tuple = [
        Math.sin(azRad) * cosPitch,
        sinPitch,
        -Math.cos(azRad) * cosPitch,
      ];
      let nearestT = Infinity;

      for (const bld of verticalEnclosures) {
        const hit3D = intersectRayAABB3D(origin, dir3D, bld.aabb, maxBoundsDistance);
        if (hit3D.hit && hit3D.tMin < nearestT) {
          nearestT = hit3D.tMin;
        } else if (pitchDeg === 0) {
          const hit2D = intersectRayAABB2D(
            [origin[0], origin[2]],
            [dir3D[0], dir3D[2]],
            bld.aabb,
            maxBoundsDistance,
          );
          if (
            hit2D.hit &&
            origin[1] >= bld.aabb.min[1] &&
            origin[1] <= bld.aabb.max[1] &&
            hit2D.tMin < nearestT
          ) {
            nearestT = hit2D.tMin;
          }
        }
      }

      if (pitchDeg < 0) {
        for (const slab of downwardSlabs) {
          const hitSlab = intersectRayAABB3D(origin, dir3D, slab, maxBoundsDistance);
          if (hitSlab.hit && hitSlab.tMin < nearestT) {
            nearestT = hitSlab.tMin;
          }
        }
      }

      if (Number.isFinite(nearestT) && nearestT <= maxBoundsDistance) {
        hitCount++;
        if (nearestT > maxHitDist) maxHitDist = nearestT;
      } else {
        escapedAnglesDeg.push(Number(deg.toFixed(2)));
        escapedRays.push({ azimuthDeg: Number(deg.toFixed(2)), pitchDeg });
      }
    }
  }

  return {
    stationId,
    totalRays,
    hitCount,
    escapedAnglesDeg,
    escapedRays,
    maxHitDistanceMeters: Number(maxHitDist.toFixed(3)),
  };
}

function resolveMasterPlan(courseOrPlan: unknown): CourseMasterPlan {
  if (
    courseOrPlan &&
    typeof courseOrPlan === 'object' &&
    'groundZones' in courseOrPlan &&
    'ramps' in courseOrPlan &&
    'props' in courseOrPlan
  ) {
    return courseOrPlan as CourseMasterPlan;
  }
  return COURSE_MASTER_PLAN;
}

/**
 * Drop-in surface elevation helper compatible with trajectory & ball physics controllers.
 */
export function getCourseSurfaceElevationAt(
  courseOrPlan: unknown,
  x: number,
  z: number,
): number {
  return getMasterPlanGroundElevationAt(x, z, resolveMasterPlan(courseOrPlan));
}

/**
 * Checks whether `(x, y, z)` lies inside the front-center Decorative Stone Fountain Hazard water pool.
 */
export function isWorldPointInWaterHazard(
  courseOrPlan: unknown,
  x: number,
  y: number,
  z: number,
): boolean {
  const plan = resolveMasterPlan(courseOrPlan);
  for (const fountain of plan.props) {
    if (
      (fountain.id === 'fountain-courtyard-front' ||
        fountain.type === 'fountain_water_hazard') &&
      fountain.reactive?.zoneRadius
    ) {
      const dist = Math.hypot(
        x - fountain.reactive.zoneCenter[0],
        z - fountain.reactive.zoneCenter[2],
      );
      if (
        dist <= fountain.reactive.zoneRadius &&
        y >= fountain.groundY &&
        y <= fountain.groundY + 0.55
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Builds a compatibility `GeneratedCityCourse` wrapper around `COURSE_MASTER_PLAN`
 * so legacy store/physics consumers can read `startTeePosition`, `props`, `flags`, and `tiles` gutters cleanly.
 */
export function buildLegacyCourseAdapter(
  plan: CourseMasterPlan = COURSE_MASTER_PLAN,
): GeneratedCityCourse {
  return {
    seed: plan.holeId,
    tiles: [
      {
        id: 'master-world-gutters',
        worldX: 0,
        worldZ: 0,
        rotationY: 0,
        gutters: plan.gutters.map((g) => ({
          id: g.id,
          kind: g.kind,
          width: g.width,
          depth: g.depthBelowRoad,
          troughY: g.channelY,
          curbHeight: ELEVATIONS.CURB_HEIGHT,
          start: g.start,
          end: g.end,
          arcCenter: g.arcPivot,
          arcRadius: g.arcRadius,
          startAngleRad: g.startAngleRad,
          endAngleRad: g.endAngleRad,
        })),
      },
    ],
    props: plan.props,
    startTeePosition: [
      plan.teePosition[0],
      plan.teePosition[1] + BALL_RADIUS,
      plan.teePosition[2],
    ],
    initialAimYaw: plan.initialAimYaw,
    flags: [
      {
        color: plan.cup.flagColor,
        index: 0,
        position: plan.cup.position,
        elevationY: plan.cup.elevationY,
        apronRadius: plan.cup.apronRadius,
        cupRadius: plan.cup.cupRadius,
        nextTeePosition: plan.teePosition,
      },
    ],
  };
}
