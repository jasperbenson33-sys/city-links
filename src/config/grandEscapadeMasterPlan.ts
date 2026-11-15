import type {
  AABB3D,
  ArchitecturalWallSpec,
  AuditCameraStationSpec,
  BuildingPaletteId,
  BuildingRoofStyle,
  CardinalDirection,
  CenterlineSegmentSpec,
  CopperSpiralChuteSpec,
  CourseId,
  CourseMasterPlan,
  CoursePropSpec,
  CourtyardPergolaSpec,
  CrosswalkLandingPadSpec,
  EscapadeMaterialVariant,
  GrandEscapadeMasterPlan,
  GrandEscapadeQaPropSpec,
  GrandEscapadeZoneNumber,
  GrandEscapadeZoneSpec,
  GroundSurfaceZoneSpec,
  HoleCupSpec,
  PerimeterBuildingSpec,
  PhysicsSurfaceTag,
  QaTeleportZoneSpec,
  StoneCurbSegmentSpec,
  StormDrainGrateSpec,
  StormGutterTrackSpec,
  StrategicShotRouteSpec,
  StreetScoutCameraSpec,
  StringLightSpanSpec,
  SubwayVaultEnclosureSpec,
  VanLoadingZoneSpec,
  Vec2Tuple,
  Vec3Tuple,
  WalkableRampSpec,
} from '../types/course';
import { ELEVATIONS } from '../types/course';
import { CUP_DEPTH, CUP_RADIUS } from '../types/clubs';
import {
  buildHelicalChuteSplineSpec,
  computeAABBFromBoundsXZ,
  computePitchedAwningNormal,
  computeRotatedAABB,
  distance2D,
} from '../lib/geometryHelpers';
import {
  COURSE_MASTER_PLAN,
  getMasterPlanGroundElevationAt,
  getMasterPlanSurfaceTagAt,
} from './courseMasterPlan';

// ============================================================================
// STAGE 2 MASTER CAD BLUEPRINT: "THE GRAND CROSSTOWN ESCAPADE"
// Par 18 • 380.0m Continuous 7-Zone Vertical Urban Golf Journey
// y = 0.0m Street -> +9.5m Brownstone Hill -> +12.5m Tenement Roofs ->
// +16.5m Viaduct Overlook -> +14.0m Conservatory & Copper Chute ->
// +2.0m..0.0m Grand Transit Plaza -> -7.5m Vaulted Ceramic-Tile Subway Finale
// ============================================================================

export const DEFAULT_ACTIVE_COURSE_ID: CourseId = 'grand-escapade';

export const ESCAPADE_TEE_POSITION: Vec3Tuple = [0.0, 0.0, 31.0];
export const ESCAPADE_INITIAL_AIM_YAW = 0; // Facing North (-Z) along Mercer Bodega Row

export const GRAND_ESCAPADE_CUP: HoleCupSpec = {
  id: 'cup-grand-escapade-golden-pin',
  flagColor: 'yellow',
  isGoldenPin: true,
  pinFinish: 'golden',
  position: [34.0, -7.5, 119.0],
  elevationY: -7.5,
  cupRadius: CUP_RADIUS, // 0.42m regulation 2x-ball radius
  cupDepth: CUP_DEPTH,   // 0.42m recessed cylindrical cup well
  apronRadius: 2.8,
  pinHeight: 2.35,
};

export const ESCAPADE_A_POSITION_CROSSWALK: CrosswalkLandingPadSpec = {
  id: 'escapade-z1-crosswalk-pad',
  center: [0.0, 0.0, -19.5],
  boundsXZ: { minX: -4.0, maxX: 4.0, minZ: -22.0, maxZ: -17.0 },
  stripeCount: 6,
  elevationY: 0.0,
};

export const ESCAPADE_VAN_LOADING_ZONE: VanLoadingZoneSpec = {
  id: 'escapade-z1-van-loading-zone',
  boundsXZ: { minX: 1.2, maxX: 3.7, minZ: -9.8, maxZ: -0.5 },
  elevationY: 0.0,
  stripeAngleDeg: 35,
};

// ============================================================================
// 1. CONTINUOUS 380.000m 7-ZONE PLAYABLE CENTERLINE (0.000m SEAM GAPS)
// ============================================================================

export const ESCAPADE_CENTERLINE_SEGMENTS: CenterlineSegmentSpec[] = [
  {
    id: 'seg-z1-mercer-avenue',
    kind: 'straight',
    label: 'Zone 1: Mercer Corner & Bodega Row (0.0m Street Corridor)',
    startXZ: [0, 31],
    endXZ: [0, -24],
    lengthMeters: 55.0,
  },
  {
    id: 'seg-z2-cobblestone-climb',
    kind: 'straight',
    label: 'Zone 2: Cobblestone Brownstone Climb (0.0m -> +9.5m Terraced Hill)',
    startXZ: [0, -24],
    endXZ: [0, -84],
    lengthMeters: 60.0,
  },
  {
    id: 'seg-z3-tenement-rooftops',
    kind: 'straight',
    label: 'Zone 3: Tenement Rooftop Gardens & Water Towers (+9.5m -> +12.5m)',
    startXZ: [0, -84],
    endXZ: [55, -84],
    lengthMeters: 55.0,
  },
  {
    id: 'seg-z4-viaduct-overlook',
    kind: 'straight',
    label: 'Zone 4: Viaduct Overpass & Overlook Terrace (+12.5m -> +16.5m Summit)',
    startXZ: [55, -84],
    endXZ: [55, -29],
    lengthMeters: 55.0,
  },
  {
    id: 'seg-z5a-conservatory-approach',
    kind: 'straight',
    label: 'Zone 5A: Clocktower Conservatory & Penthouse Split Deck (+16.5m -> +14.0m)',
    startXZ: [55, -29],
    endXZ: [55, 1],
    lengthMeters: 30.0,
  },
  {
    id: 'seg-z5b-copper-chute-plunge',
    kind: 'straight',
    label: 'Zone 5B: Copper Downspout Chute & Sky Driver Plunge (+14.0m -> +2.0m)',
    startXZ: [55, 1],
    endXZ: [46, 13],
    lengthMeters: 15.0, // hypot(-9, 12) === 15.000m
  },
  {
    id: 'seg-z6a-plaza-terrace-descent',
    kind: 'straight',
    label: 'Zone 6A: Chute Arrival Terrace & Beaux-Arts Steps (+2.0m -> 0.0m)',
    startXZ: [46, 13],
    endXZ: [34, 29],
    lengthMeters: 20.0, // hypot(-12, 16) === 20.000m
  },
  {
    id: 'seg-z6b-midtown-square-to-headhouse',
    kind: 'straight',
    label: 'Zone 6B: Grand Transit Square to Sunken Subway Stairwell (0.0m -> -4.5m)',
    startXZ: [34, 29],
    endXZ: [34, 64],
    lengthMeters: 35.0,
  },
  {
    id: 'seg-z7-subway-vault-finale',
    kind: 'straight',
    label: 'Zone 7: Vaulted Ceramic-Tile Subway Concourse to Golden Pin (-4.5m -> -7.5m)',
    startXZ: [34, 64],
    endXZ: [34, 119],
    lengthMeters: 55.0,
  },
];

export const ESCAPADE_COMPUTED_CENTERLINE_METERS = Number(
  ESCAPADE_CENTERLINE_SEGMENTS.reduce((sum, seg) => sum + seg.lengthMeters, 0).toFixed(3),
);

// ============================================================================
// 2. 7 ARCHITECTURAL ZONES & DETERMINISTIC QA TELEPORT ANCHORS (1..7)
// ============================================================================

export const GRAND_ESCAPADE_ZONES: GrandEscapadeZoneSpec[] = [
  {
    zoneNumber: 1,
    id: 'zone-1-mercer-bodega-row',
    name: 'Zone 1: Mercer Corner & Bodega Row',
    subtitle: 'y = 0.0m • Sunlit Street Fairway, Flush Scaffolding Shed & Delivery Van Ramp',
    elevationRangeY: [0.0, 0.15],
    targetLengthMeters: 55.0,
    chunkBoundsXZ: { minX: -18.0, maxX: 18.0, minZ: -25.0, maxZ: 42.0 },
    activeChunkNeighbors: [1, 2, 6],
    isSubterranean: false,
    ambientProfile: 'sunlit_street',
  },
  {
    zoneNumber: 2,
    id: 'zone-2-cobblestone-brownstone-climb',
    name: 'Zone 2: Cobblestone Brownstone Climb',
    subtitle: 'y = 0.0m -> +9.5m • Two Flat Landing Plazas & Uphill Hydrant Water-Main Boost',
    elevationRangeY: [0.0, 9.5],
    targetLengthMeters: 60.0,
    chunkBoundsXZ: { minX: -18.0, maxX: 16.0, minZ: -90.0, maxZ: -24.0 },
    activeChunkNeighbors: [1, 2, 3],
    isSubterranean: false,
    ambientProfile: 'hillside_breeze',
  },
  {
    zoneNumber: 3,
    id: 'zone-3-tenement-rooftops',
    name: 'Zone 3: Tenement Rooftop Gardens & Water Towers',
    subtitle: 'y = +9.5m -> +12.5m • Cedar Water Towers, 32° Skylight Bank, HVAC Fan & Plank Bridge',
    elevationRangeY: [9.5, 12.5],
    targetLengthMeters: 55.0,
    chunkBoundsXZ: { minX: 5.0, maxX: 62.0, minZ: -92.0, maxZ: -76.0 },
    activeChunkNeighbors: [2, 3, 4],
    isSubterranean: false,
    ambientProfile: 'rooftop_sky',
  },
  {
    zoneNumber: 4,
    id: 'zone-4-viaduct-overlook-terrace',
    name: 'Zone 4: Viaduct Overpass & Overlook Terrace',
    subtitle: 'y = +12.5m -> +16.5m • Arched Stone Viaduct Vista Across Zones 1–3 & Trattoria Summit',
    elevationRangeY: [12.5, 16.5],
    targetLengthMeters: 55.0,
    chunkBoundsXZ: { minX: 48.0, maxX: 63.0, minZ: -79.0, maxZ: -28.0 },
    activeChunkNeighbors: [3, 4, 5],
    isSubterranean: false,
    ambientProfile: 'panoramic_overlook',
  },
  {
    zoneNumber: 5,
    id: 'zone-5-conservatory-copper-plunge',
    name: 'Zone 5: Clocktower Conservatory & Copper Downspout Plunge',
    subtitle: 'y = +16.5m -> +14.0m -> +2.0m • Bronze Bell Tower, Helical Copper Chute & Sky Driver Tee',
    elevationRangeY: [2.0, 16.5],
    targetLengthMeters: 45.0,
    chunkBoundsXZ: { minX: 43.0, maxX: 63.0, minZ: -29.0, maxZ: 16.0 },
    activeChunkNeighbors: [4, 5, 6],
    isSubterranean: false,
    ambientProfile: 'panoramic_overlook',
  },
  {
    zoneNumber: 6,
    id: 'zone-6-grand-transit-plaza',
    name: 'Zone 6: Grand Transit Plaza & Sunken Stairwell',
    subtitle: 'y = +2.0m -> 0.0m -> -4.5m • Beaux-Arts Fountain Square & Emerald Cast-Iron Headhouse',
    elevationRangeY: [-4.5, 2.0],
    targetLengthMeters: 55.0,
    chunkBoundsXZ: { minX: 23.0, maxX: 62.0, minZ: 7.8, maxZ: 68.5 },
    activeChunkNeighbors: [1, 5, 6, 7],
    isSubterranean: false,
    ambientProfile: 'sunlit_street',
  },
  {
    zoneNumber: 7,
    id: 'zone-7-subway-station-finale',
    name: 'Zone 7: Vaulted Ceramic-Tile Subway Station Finale',
    subtitle: 'y = -4.5m -> -7.5m • Sunlit Sidewalk Grates, Open Vintage Subway Car & Golden Pin',
    elevationRangeY: [-7.5, -4.5],
    targetLengthMeters: 55.0,
    chunkBoundsXZ: { minX: 20.5, maxX: 47.5, minZ: 66.0, maxZ: 126.0 },
    activeChunkNeighbors: [6, 7],
    isSubterranean: true,
    ambientProfile: 'subway_vault',
  },
];

export const QA_TELEPORT_ZONES: Record<GrandEscapadeZoneNumber, QaTeleportZoneSpec> = {
  1: {
    zoneNumber: 1,
    zoneId: 'zone-1-mercer-bodega-row',
    zoneName: 'Zone 1: Mercer Corner & Bodega Row',
    elevationLabel: '0.0m Street Tee',
    position: [0.0, 0.0, 31.0],
    aimYaw: 0, // North (-Z)
    lookAt: [0.0, 1.2, -16.0],
    recommendedClub: 'driver',
    isSubterranean: false,
  },
  2: {
    zoneNumber: 2,
    zoneId: 'zone-2-cobblestone-brownstone-climb',
    zoneName: 'Zone 2: Cobblestone Brownstone Climb',
    elevationLabel: '+3.1m Terrace Plaza A',
    position: [0.0, 3.1, -42.0],
    aimYaw: 0, // North (-Z) up the terraced brownstone climb
    lookAt: [0.0, 7.8, -72.0],
    recommendedClub: 'driver',
    isSubterranean: false,
  },
  3: {
    zoneNumber: 3,
    zoneId: 'zone-3-tenement-rooftops',
    zoneName: 'Zone 3: Tenement Rooftop Gardens & Water Towers',
    elevationLabel: '+11.0m Tenement Roof West',
    position: [18.5, 11.0, -84.0],
    aimYaw: Math.PI * 0.5, // East (+X) across rooftop water towers & plank bridge
    lookAt: [42.0, 12.8, -84.0],
    recommendedClub: 'skimmer',
    isSubterranean: false,
  },
  4: {
    zoneNumber: 4,
    zoneId: 'zone-4-viaduct-overlook-terrace',
    zoneName: 'Zone 4: Viaduct Overpass & Overlook Terrace',
    elevationLabel: '+16.5m Overlook Summit Piazza',
    position: [55.0, 16.5, -39.0],
    aimYaw: Math.PI, // South (+Z) toward Conservatory & Bell Tower
    lookAt: [55.0, 16.2, -16.0],
    recommendedClub: 'skimmer',
    isSubterranean: false,
  },
  5: {
    zoneNumber: 5,
    zoneId: 'zone-5-conservatory-copper-plunge',
    zoneName: 'Zone 5: Clocktower Conservatory & Copper Downspout Plunge',
    elevationLabel: '+14.0m Penthouse Split Deck',
    position: [55.0, 14.0, 0.0],
    // Forward aim is (sin(yaw), -cos(yaw)); -2.783 aims SSW (-0.351, +0.936) directly into open-air [52.0, 14.0, 8.0] Copper Chute mouth & Sky Driver cliff!
    aimYaw: -2.783,
    lookAt: [52.0, 11.8, 8.8],
    recommendedClub: 'driver',
    isSubterranean: false,
  },
  6: {
    zoneNumber: 6,
    zoneId: 'zone-6-grand-transit-plaza',
    zoneName: 'Zone 6: Grand Transit Plaza & Sunken Stairwell',
    elevationLabel: '0.0m Beaux-Arts Midtown Square',
    position: [34.0, 0.0, 35.5],
    aimYaw: Math.PI, // South (+Z) toward Cast-Iron Subway Headhouse
    lookAt: [34.0, 0.4, 58.0],
    recommendedClub: 'skimmer',
    isSubterranean: false,
  },
  7: {
    zoneNumber: 7,
    zoneId: 'zone-7-subway-station-finale',
    zoneName: 'Zone 7: Vaulted Ceramic-Tile Subway Station Finale',
    elevationLabel: '-7.5m Ceramic Subway Concourse',
    position: [34.0, -7.5, 79.0],
    aimYaw: Math.PI, // South (+Z) through open Vintage Subway Car to Golden Pin
    lookAt: [34.0, -6.8, 119.0],
    recommendedClub: 'putter',
    isSubterranean: true,
  },
};

export const QA_TELEPORT_ZONE_LIST: QaTeleportZoneSpec[] = [
  QA_TELEPORT_ZONES[1],
  QA_TELEPORT_ZONES[2],
  QA_TELEPORT_ZONES[3],
  QA_TELEPORT_ZONES[4],
  QA_TELEPORT_ZONES[5],
  QA_TELEPORT_ZONES[6],
  QA_TELEPORT_ZONES[7],
];

// ============================================================================
// 3. SPIRALING COPPER ROOF-GUTTER CHUTE (+14.0m -> +2.0m) & SUBWAY VAULT SPECS
// ============================================================================

const HELICAL_CHUTE_BUILD = buildHelicalChuteSplineSpec({
  helixPivotXZ: [52.0, 10.5],
  helixRadiusMeters: 2.5,
  entryY: 14.0,
  exitY: 2.0,
  startAngleRad: -Math.PI * 0.5, // Starts at [52.0, 14.0, 8.0] in pure open air flush at South cliff edge of Penthouse Deck!
  turns: 1.42,                   // Exits at [53.4454, 2.0, 13.1289] inside Zone 6 Arrival Terrace aiming WSW!
  clockwise: true,
  sampleCount: 25,
  maxBankRollDeg: 18,
});

export const COPPER_SPIRAL_CHUTE_SPEC: CopperSpiralChuteSpec = {
  id: 'copper-spiral-chute-zone-5',
  entryFunnelBoundsXZ: { minX: 50.4, maxX: 53.6, minZ: 6.6, maxZ: 9.6 },
  entryPosition: HELICAL_CHUTE_BUILD.waypoints[0],
  exitSpoutPosition: HELICAL_CHUTE_BUILD.waypoints[HELICAL_CHUTE_BUILD.waypoints.length - 1],
  exitLaunchVelocity: [-7.4, 0.25, 5.8],
  helixPivotXZ: [52.0, 10.5],
  helixRadiusMeters: 2.5,
  channelWidthMeters: 1.15,
  wallHeightMeters: 0.52,
  turns: 1.42,
  restitution: 0.32,
  friction: 0.16,
  waypoints: HELICAL_CHUTE_BUILD.waypoints,
  segments: HELICAL_CHUTE_BUILD.segments,
};

export const SUBWAY_STATION_VAULT_SPEC: SubwayVaultEnclosureSpec = {
  id: 'subway-vault-crosstown-terminal',
  stationSignTitle: 'MERCER - CROSSTOWN TERMINAL',
  stationSubtitle: 'EXPRESS TO GOLDEN PIN • TRACK 1',
  boundsXZ: { minX: 22.0, maxX: 46.0, minZ: 68.0, maxZ: 124.0 },
  platformFloorY: -7.5,
  vaultSpringlineY: -3.9,
  vaultCrownY: -0.6,
  archRibZs: [74.0, 82.0, 91.5, 98.5, 104.5, 113.5, 121.5],
  sconcePositions: [
    [22.35, -4.4, 78.0],
    [45.65, -4.4, 78.0],
    [22.35, -4.4, 95.0],
    [45.65, -4.4, 95.0],
    [22.35, -4.4, 101.5],
    [45.65, -4.4, 101.5],
    [22.35, -4.4, 117.5],
    [45.65, -4.4, 117.5],
    [28.0, -4.4, 123.65],
    [40.0, -4.4, 123.65],
  ],
  lightShafts: [
    {
      id: 'light-shaft-mezzanine-north',
      label: 'North Mezzanine Sidewalk Glass-Block Grate Shaft',
      ceilingCenter: [34.0, -0.6, 80.5],
      floorTarget: [34.0, -7.5, 80.5],
      grateSizeXZ: [4.2, 2.4],
      beamRadiusMeters: 3.4,
    },
    {
      id: 'light-shaft-platform-west',
      label: 'West Platform Sunlit Cast-Iron Sidewalk Grate',
      ceilingCenter: [28.2, -0.6, 97.0],
      floorTarget: [28.2, -7.5, 97.0],
      grateSizeXZ: [2.8, 4.6],
      beamRadiusMeters: 3.1,
    },
    {
      id: 'light-shaft-platform-east',
      label: 'East Platform Sunlit Cast-Iron Sidewalk Grate',
      ceilingCenter: [39.8, -0.6, 97.0],
      floorTarget: [39.8, -7.5, 97.0],
      grateSizeXZ: [2.8, 4.6],
      beamRadiusMeters: 3.1,
    },
    {
      id: 'light-shaft-golden-pin-green',
      label: 'Golden Pin Courtyard Ocular Sidewalk Skylight Shaft',
      ceilingCenter: [34.0, -0.6, 117.5],
      floorTarget: [34.0, -7.5, 118.5],
      grateSizeXZ: [5.2, 4.2],
      beamRadiusMeters: 4.4,
    },
  ],
};

// ============================================================================
// 4. CONTINUOUS FLYOVER CAMERA SPLINE (TEE -> ALL 7 ZONES -> GOLDEN PIN)
// ============================================================================

export const FLYOVER_SPLINE_POINTS: Vec3Tuple[] = [
  [0.0, 3.0, 32.5],     // 0: Zone 1 Tee launch down Mercer Bodega Row
  [-0.6, 3.4, -10.0],   // 1: Zone 1 sweeping cleanly between Scaffolding Shed & Delivery Van
  [0.0, 6.6, -42.0],    // 2: Zone 2 climbing over Terrace Plaza A & Burst Hydrant Jet
  [1.5, 13.0, -82.5],   // 3: Zone 2->3 cresting Hillcrest Belvedere onto Tenement Roofs
  [20.0, 14.2, -84.0],  // 4: Zone 3 Tenement Roof West between Cedar Water Tower & Skylight
  [45.5, 16.8, -82.5],  // 5: Zone 3 gliding cleanly above Rooftop Pergola toward open Stone Viaduct Arch
  [54.8, 18.0, -45.0],  // 6: Zone 4 emerged South of Viaduct Arch onto Summit Piazza overlooking Zones 1-3!
  [54.4, 18.3, -20.0],  // 7: Zone 5 center aisle of Glass Botanical Conservatory framing Bell Tower & Chute
  [46.8, 13.8, 11.8],   // 8: Zone 5->6 open air West of Copper Chute over +2.0m Arrival Terrace!
  [41.5, 6.8, 22.5],    // 9: Zone 6 gliding cleanly West of x=46.05 facade toward Midtown Fountain & Headhouse
  [34.0, 2.4, 50.5],    // 10: Zone 6 Midtown Square South of Fountain, aligned with 9.6m Headhouse
  [34.0, 1.3, 58.0],    // 11: Zone 6->7 diving beneath Open-Throat Subway Headhouse fascia
  [34.0, -2.9, 67.2],   // 12: Zone 6->7 clearing z=67.6 portal lintel (-0.58m) with >2.3m headroom
  [29.6, -5.1, 82.0],   // 13: Zone 7 vaulted concourse entering sunlit West ceramic platform
  [29.4, -5.2, 98.0],   // 14: Zone 7 flanking Vintage IRT Subway Car (x=32.45) & sunlit grates
  [34.0, -5.5, 112.5],  // 15: Zone 7 Finale framing Recessed AstroTurf Green & Golden Pin
];

export const FLYOVER_LOOKAT_POINTS: Vec3Tuple[] = [
  [0.0, 1.2, 4.0],
  [0.0, 2.2, -30.0],
  [0.0, 8.2, -68.0],
  [18.5, 11.5, -84.0],
  [42.0, 13.5, -83.5],
  [55.0, 16.2, -58.0],  // Frames the Romanesque Stone Viaduct Arch cleanly ahead!
  [20.0, 11.5, -48.0],  // Unobstructed West panoramic vista across Zones 1-3 (11.8m South of arch piers!)
  [52.5, 12.8, 9.5],    // Frames Penthouse Deck, Bell Tower & Open-Air Copper Spiral Chute Mouth!
  [42.0, 4.5, 29.0],    // Gentle -22° aerial overlook framing Arrival Terrace, Midtown Fountain & Headhouse!
  [34.0, 1.0, 45.5],    // Frames Midtown Roundabout Fountain & Emerald Cast-Iron Subway Headhouse!
  [34.0, -1.8, 63.0],
  [34.0, -4.5, 71.0],
  [34.0, -6.4, 82.0],
  [33.5, -6.3, 98.0],
  [34.0, -6.8, 116.0],
  [34.0, -7.2, 119.0],
];

// ============================================================================
// 5. GROUND SURFACE ZONES & WALKABLE RAMPS (SEAMLESS 7-ZONE TOPOGRAPHY)
// ============================================================================

function makeGroundZone(
  id: string,
  label: string,
  surfaceTag: PhysicsSurfaceTag,
  boundsXZ: { minX: number; maxX: number; minZ: number; maxZ: number },
  topY: number,
  slabThickness: number,
  friction: number,
  restitution: number,
  rollDamping: number,
  zoneNumber: GrandEscapadeZoneNumber,
  escapadeMaterialVariant?: EscapadeMaterialVariant,
): GroundSurfaceZoneSpec {
  return {
    id,
    label,
    surfaceTag,
    boundsXZ,
    topY,
    slabThickness,
    friction,
    restitution,
    rollDamping,
    zoneNumber,
    escapadeMaterialVariant,
    aabb: computeAABBFromBoundsXZ(boundsXZ, topY - slabThickness, topY),
  };
}

function makeWalkableRamp(
  id: string,
  label: string,
  surfaceTag: PhysicsSurfaceTag,
  boundsXZ: { minX: number; maxX: number; minZ: number; maxZ: number },
  bottomY: number,
  topY: number,
  climbDirection: CardinalDirection,
  slabThickness: number,
  friction: number,
  restitution: number,
  zoneNumber: GrandEscapadeZoneNumber,
  escapadeMaterialVariant?: EscapadeMaterialVariant,
): WalkableRampSpec {
  const run =
    climbDirection === 'north' || climbDirection === 'south'
      ? boundsXZ.maxZ - boundsXZ.minZ
      : boundsXZ.maxX - boundsXZ.minX;
  const rise = Math.abs(topY - bottomY);
  return {
    id,
    label,
    surfaceTag,
    boundsXZ,
    bottomY,
    topY,
    climbDirection,
    slopeAngleDeg: Number(((Math.atan2(rise, Math.max(1e-6, run)) * 180) / Math.PI).toFixed(2)),
    slabThickness,
    friction,
    restitution,
    zoneNumber,
    escapadeMaterialVariant,
    aabb: computeAABBFromBoundsXZ(boundsXZ, bottomY - slabThickness, topY),
  };
}

export const ESCAPADE_GROUND_ZONES: GroundSurfaceZoneSpec[] = [
  // --- ZONE 1: Mercer Corner & Bodega Row (y = 0.0m, sidewalks +0.15m) ---
  makeGroundZone(
    'zone-z1-south-tee-plaza',
    'Zone 1 South Subway Backstop Brick Apron',
    'subway_brick_plaza',
    { minX: -7.2, maxX: 7.2, minZ: 34.0, maxZ: 39.2 },
    0.15,
    0.65,
    0.52,
    0.34,
    0.92,
    1,
  ),
  makeGroundZone(
    'zone-z1-mercer-road-asphalt',
    'Zone 1 Mercer Avenue Asphalt Fairway',
    'road_asphalt',
    { minX: -4.2, maxX: 4.2, minZ: -24.0, maxZ: 32.8 },
    0.0,
    0.6,
    0.44,
    0.42,
    0.68,
    1,
  ),
  makeGroundZone(
    'zone-z1-sidewalk-west',
    'Zone 1 West Bodega & Scaffolding Limestone Sidewalk',
    'sidewalk_paver',
    { minX: -7.2, maxX: -4.35, minZ: -24.0, maxZ: 34.0 },
    0.15,
    0.65,
    0.5,
    0.38,
    0.85,
    1,
  ),
  makeGroundZone(
    'zone-z1-sidewalk-east',
    'Zone 1 East Market Limestone Sidewalk',
    'sidewalk_paver',
    { minX: 4.35, maxX: 7.2, minZ: -24.0, maxZ: 34.0 },
    0.15,
    0.65,
    0.5,
    0.38,
    0.85,
    1,
  ),
  makeGroundZone(
    'zone-z1-crosswalk-landing',
    'Zone 1 North Mercer Crosswalk Pad',
    'crosswalk_landing',
    ESCAPADE_A_POSITION_CROSSWALK.boundsXZ,
    0.0,
    0.1,
    0.48,
    0.4,
    0.76,
    1,
  ),

  // --- ZONE 2: Cobblestone Brownstone Climb (Two Flat 0%-Grade Landing Plazas + Hillcrest) ---
  makeGroundZone(
    'zone-z2-terrace-plaza-a',
    'Zone 2 Flat Cobblestone Landing Plaza A (+3.10m)',
    'courtyard_paver',
    { minX: -6.5, maxX: 6.5, minZ: -46.0, maxZ: -38.0 },
    3.1,
    3.5,
    0.52,
    0.34,
    1.05,
    2,
    'cobblestone_hill',
  ),
  makeGroundZone(
    'zone-z2-terrace-plaza-b',
    'Zone 2 Flat Cobblestone Landing Plaza B (+6.30m)',
    'courtyard_paver',
    { minX: -6.5, maxX: 6.5, minZ: -68.0, maxZ: -60.0 },
    6.3,
    6.7,
    0.52,
    0.34,
    1.05,
    2,
    'cobblestone_hill',
  ),
  makeGroundZone(
    'zone-z2-hillcrest-belvedere',
    'Zone 2 Hillcrest Cobblestone Belvedere (+9.50m)',
    'courtyard_paver',
    { minX: -6.5, maxX: 6.0, minZ: -89.5, maxZ: -80.0 },
    9.5,
    9.8,
    0.5,
    0.36,
    0.98,
    2,
    'cobblestone_hill',
  ),

  // --- ZONE 3: Tenement Rooftop Gardens & Water Towers (+9.5m -> +11.0m -> +12.5m) ---
  makeGroundZone(
    'zone-z3-parapet-shortcut-apron',
    'Zone 3 North Wedge Parapet Shortcut Apron (+9.50m)',
    'courtyard_paver',
    { minX: 6.0, maxX: 15.0, minZ: -90.0, maxZ: -87.5 },
    9.5,
    9.8,
    0.5,
    0.36,
    0.95,
    3,
    'tenement_rooftop_deck',
  ),
  makeGroundZone(
    'zone-z3-scaffold-south-apron',
    'Zone 3 South Rooftop Apron (+9.50m)',
    'courtyard_paver',
    { minX: 6.0, maxX: 15.0, minZ: -80.5, maxZ: -78.0 },
    9.5,
    9.8,
    0.5,
    0.36,
    0.95,
    3,
    'tenement_rooftop_deck',
  ),
  makeGroundZone(
    'zone-z3-tenement-roof-west',
    'Zone 3 Tenement Roof West Garden & Water Tower Deck (+11.00m)',
    'courtyard_paver',
    { minX: 15.0, maxX: 32.0, minZ: -90.0, maxZ: -78.0 },
    11.0,
    11.2,
    0.48,
    0.38,
    0.9,
    3,
    'tenement_rooftop_deck',
  ),
  makeGroundZone(
    'zone-z3-alley-safety-north',
    'Zone 3 Alley North Iron Safety Catch-Deck (+11.00m)',
    'van_ramp_metal',
    { minX: 32.0, maxX: 37.0, minZ: -90.0, maxZ: -86.2 },
    11.0,
    1.2,
    0.52,
    0.35,
    1.0,
    3,
    'timber_bridge_plank',
  ),
  makeGroundZone(
    'zone-z3-alley-safety-south',
    'Zone 3 Alley South Iron Safety Catch-Deck (+11.00m)',
    'van_ramp_metal',
    { minX: 32.0, maxX: 37.0, minZ: -81.8, maxZ: -78.0 },
    11.0,
    1.2,
    0.52,
    0.35,
    1.0,
    3,
    'timber_bridge_plank',
  ),
  makeGroundZone(
    'zone-z3-tenement-roof-east',
    'Zone 3 Tenement Roof East Pergola & Water Tower Deck (+12.50m)',
    'courtyard_paver',
    { minX: 37.0, maxX: 60.5, minZ: -90.0, maxZ: -78.0 },
    12.5,
    12.7,
    0.48,
    0.38,
    0.9,
    3,
    'tenement_rooftop_deck',
  ),

  // --- ZONE 4: Viaduct Overpass & Overlook Terrace (+12.5m -> +15.0m -> +16.5m) ---
  makeGroundZone(
    'zone-z4-viaduct-belvedere',
    'Zone 4 Arched Stone Viaduct Panoramic Belvedere (+15.00m)',
    'courtyard_paver',
    { minX: 49.5, maxX: 60.5, minZ: -62.0, maxZ: -54.0 },
    15.0,
    3.6,
    0.46,
    0.4,
    0.84,
    4,
    'viaduct_limestone',
  ),
  makeGroundZone(
    'zone-z4-overlook-trattoria-piazza',
    'Zone 4 Overlook Trattoria Summit Piazza (+16.50m)',
    'courtyard_paver',
    { minX: 49.0, maxX: 61.5, minZ: -44.0, maxZ: -29.0 },
    16.5,
    16.7,
    0.48,
    0.38,
    0.88,
    4,
    'viaduct_limestone',
  ),

  // --- ZONE 5: Clocktower Conservatory & Copper Downspout Plunge (+16.5m -> +14.0m) ---
  makeGroundZone(
    'zone-z5-conservatory-terrace',
    'Zone 5 Glass Conservatory Promenade (+16.50m)',
    'courtyard_paver',
    { minX: 49.0, maxX: 61.5, minZ: -29.0, maxZ: -13.0 },
    16.5,
    16.7,
    0.46,
    0.4,
    0.85,
    5,
    'viaduct_limestone',
  ),
  makeGroundZone(
    'zone-z5-penthouse-split-deck',
    'Zone 5 Clocktower Penthouse Split Deck & Sky Driver Tee (+14.00m)',
    'courtyard_paver',
    { minX: 44.0, maxX: 60.5, minZ: -4.0, maxZ: 8.0 },
    14.0,
    14.2,
    0.48,
    0.38,
    0.9,
    5,
    'tenement_rooftop_deck',
  ),
  // --- ZONE 6: Grand Transit Plaza & Sunken Stairwell (+2.0m -> 0.0m -> -4.5m) ---
  // Note: Zone 5's Copper Spiral Chute (+14.0m -> +2.0m) steps straight off the z = 8.0 Penthouse cliff
  // in pure open air with ZERO floor slab above it, landing on this extended +2.0m Arrival Terrace!
  makeGroundZone(
    'zone-z6-chute-arrival-terrace',
    'Zone 6 Copper Spout & Sky Driver Arrival Terrace (+2.00m)',
    'courtyard_paver',
    { minX: 28.0, maxX: 61.5, minZ: 7.8, maxZ: 24.0 },
    2.0,
    2.6,
    0.5,
    0.36,
    0.95,
    6,
    'beaux_arts_granite',
  ),
  makeGroundZone(
    'zone-z6-midtown-transit-square',
    'Zone 6 Beaux-Arts Midtown Fountain & Kiosk Square (0.00m)',
    'sidewalk_paver',
    { minX: 24.0, maxX: 46.0, minZ: 32.0, maxZ: 56.0 },
    0.0,
    1.2,
    0.48,
    0.38,
    0.86,
    6,
    'beaux_arts_granite',
  ),
  makeGroundZone(
    'zone-z6-headhouse-apron-west',
    'Zone 6 Subway Headhouse West Granite Promenade (0.00m)',
    'sidewalk_paver',
    { minX: 24.0, maxX: 28.9, minZ: 56.0, maxZ: 68.0 },
    0.0,
    1.2,
    0.5,
    0.36,
    0.9,
    6,
    'beaux_arts_granite',
  ),
  makeGroundZone(
    'zone-z6-headhouse-apron-east',
    'Zone 6 Subway Headhouse East Granite Promenade (0.00m)',
    'sidewalk_paver',
    { minX: 39.1, maxX: 46.0, minZ: 56.0, maxZ: 68.0 },
    0.0,
    1.2,
    0.5,
    0.36,
    0.9,
    6,
    'beaux_arts_granite',
  ),

  // --- ZONE 7: Vaulted Ceramic-Tile Subway Station Finale (-7.50m) ---
  makeGroundZone(
    'zone-z7-mezzanine-flank-west',
    'Zone 7 North Ceramic Alcove West (-7.50m)',
    'courtyard_paver',
    { minX: 22.0, maxX: 28.9, minZ: 68.0, maxZ: 76.0 },
    -7.5,
    1.0,
    0.44,
    0.4,
    0.78,
    7,
    'subway_ceramic_tile',
  ),
  makeGroundZone(
    'zone-z7-mezzanine-flank-east',
    'Zone 7 North Ceramic Alcove East (-7.50m)',
    'courtyard_paver',
    { minX: 39.1, maxX: 46.0, minZ: 68.0, maxZ: 76.0 },
    -7.5,
    1.0,
    0.44,
    0.4,
    0.78,
    7,
    'subway_ceramic_tile',
  ),
  makeGroundZone(
    'zone-z7-subway-ceramic-concourse',
    'Zone 7 Vaulted Cream-and-Emerald Ceramic-Tile Concourse (-7.50m)',
    'courtyard_paver',
    { minX: 22.0, maxX: 46.0, minZ: 76.0, maxZ: 124.0 },
    -7.5,
    1.0,
    0.42,
    0.42,
    0.74,
    7,
    'subway_ceramic_tile',
  ),
  makeGroundZone(
    'zone-z7-subway-car-wood-aisle',
    'Zone 7 Parked Vintage Subway Car Rattan-Floor Walkthrough Aisle (-7.50m)',
    'courtyard_paver',
    { minX: 32.85, maxX: 35.15, minZ: 89.7, maxZ: 103.3 },
    -7.5,
    0.5,
    0.4,
    0.42,
    0.7,
    7,
    'subway_car_floor',
  ),
  makeGroundZone(
    'zone-z7-station-green-fringe',
    'Zone 7 Station-Master Putting Green Collar Fringe (-7.50m)',
    'green_fringe_collar',
    { minX: 27.5, maxX: 40.5, minZ: 111.5, maxZ: 122.8 },
    -7.5,
    0.4,
    0.66,
    0.26,
    2.1,
    7,
  ),
  makeGroundZone(
    'zone-z7-station-putting-green',
    'Zone 7 Recessed Station-Master AstroTurf Courtyard Green (-7.50m)',
    'putting_green_turf',
    { minX: 28.5, maxX: 39.5, minZ: 112.5, maxZ: 122.0 },
    -7.5,
    0.35,
    0.58,
    0.22,
    1.65,
    7,
  ),
];

export const ESCAPADE_WALKABLE_RAMPS: WalkableRampSpec[] = [
  // Zone 1 South subway brick apron curb ramp (z: 32.8 -> 34.0, y: 0.00 -> 0.15)
  makeWalkableRamp(
    'ramp-z1-south-plaza-apron',
    'Zone 1 South Subway Apron Ramp (0.00m -> +0.15m)',
    'sidewalk_paver',
    { minX: -4.2, maxX: 4.2, minZ: 32.8, maxZ: 34.0 },
    0.0,
    0.15,
    'south',
    0.5,
    0.5,
    0.36,
    1,
  ),
  // Zone 1 West & East ADA sidewalk curb cuts near scaffolding & bodega
  makeWalkableRamp(
    'ramp-z1-west-sidewalk-entry',
    'Zone 1 West Scaffolding Curb Ramp (0.00m -> +0.15m)',
    'sidewalk_paver',
    { minX: -4.35, maxX: -3.75, minZ: 19.0, maxZ: 22.5 },
    0.0,
    0.15,
    'west',
    0.4,
    0.5,
    0.36,
    1,
  ),
  makeWalkableRamp(
    'ramp-z1-west-sidewalk-exit',
    'Zone 1 West Scaffolding North Exit Ramp (0.00m -> +0.15m)',
    'sidewalk_paver',
    { minX: -4.35, maxX: -3.75, minZ: 1.5, maxZ: 5.0 },
    0.0,
    0.15,
    'west',
    0.4,
    0.5,
    0.36,
    1,
  ),

  // Zone 2: 3-flight Cobblestone Climb separated by TWO flat 8m landing plazas!
  makeWalkableRamp(
    'ramp-z2-climb-a',
    'Zone 2 Lower Cobblestone Brownstone Climb (0.00m -> +3.10m)',
    'courtyard_ramp',
    { minX: -6.5, maxX: 6.5, minZ: -38.0, maxZ: -24.0 },
    0.0,
    3.1,
    'north',
    1.2,
    0.52,
    0.35,
    2,
    'cobblestone_hill',
  ),
  makeWalkableRamp(
    'ramp-z2-climb-b',
    'Zone 2 Middle Cobblestone Brownstone Climb (+3.10m -> +6.30m)',
    'courtyard_ramp',
    { minX: -6.5, maxX: 6.5, minZ: -60.0, maxZ: -46.0 },
    3.1,
    6.3,
    'north',
    2.0,
    0.52,
    0.35,
    2,
    'cobblestone_hill',
  ),
  makeWalkableRamp(
    'ramp-z2-climb-c',
    'Zone 2 Upper Cobblestone Brownstone Climb (+6.30m -> +9.50m)',
    'courtyard_ramp',
    { minX: -6.5, maxX: 6.5, minZ: -80.0, maxZ: -68.0 },
    6.3,
    9.5,
    'north',
    2.5,
    0.52,
    0.35,
    2,
    'cobblestone_hill',
  ),

  // Zone 3: Rooftop Scaffold Ramp (+9.5m -> +11.0m) & Alley Timber Plank Bridge (+11.0m -> +12.5m)
  makeWalkableRamp(
    'ramp-z3-rooftop-scaffold',
    'Zone 3 Timber & Steel Rooftop Access Ramp (+9.50m -> +11.00m)',
    'courtyard_ramp',
    { minX: 6.0, maxX: 15.0, minZ: -87.5, maxZ: -80.5 },
    9.5,
    11.0,
    'east',
    1.5,
    0.5,
    0.38,
    3,
    'timber_bridge_plank',
  ),
  makeWalkableRamp(
    'ramp-z3-alley-plank-bridge',
    'Zone 3 Twin Timber Plank Alley Bridge (+11.00m -> +12.50m)',
    'courtyard_ramp',
    { minX: 32.0, maxX: 37.0, minZ: -86.2, maxZ: -81.8 },
    11.0,
    12.5,
    'east',
    0.45,
    0.48,
    0.38,
    3,
    'timber_bridge_plank',
  ),

  // Zone 4: Multi-Arch Stone Viaduct Ramps (+12.5m -> +15.0m -> +16.5m)
  makeWalkableRamp(
    'ramp-z4-viaduct-north',
    'Zone 4 North Stone Viaduct Approach (+12.50m -> +15.00m)',
    'courtyard_ramp',
    { minX: 50.0, maxX: 60.0, minZ: -78.0, maxZ: -62.0 },
    12.5,
    15.0,
    'south',
    2.4,
    0.48,
    0.38,
    4,
    'viaduct_limestone',
  ),
  makeWalkableRamp(
    'ramp-z4-viaduct-south',
    'Zone 4 South Viaduct Summit Ascent (+15.00m -> +16.50m)',
    'courtyard_ramp',
    { minX: 50.0, maxX: 60.0, minZ: -54.0, maxZ: -44.0 },
    15.0,
    16.5,
    'south',
    2.8,
    0.48,
    0.38,
    4,
    'viaduct_limestone',
  ),

  // Zone 5: Conservatory Step-Down (+16.5m -> +14.0m) & Penthouse Terraced Cascade (+14.0m -> +2.0m)
  makeWalkableRamp(
    'ramp-z5-penthouse-stepdown',
    'Zone 5 Conservatory-to-Penthouse Terrace Ramp (+16.50m -> +14.00m)',
    'courtyard_ramp',
    { minX: 49.0, maxX: 60.5, minZ: -13.0, maxZ: -4.0 },
    14.0,
    16.5,
    'north', // High end (+16.5m) is at z = -13.0 (North), low end (+14.0m) at z = -4.0 (South)
    2.2,
    0.5,
    0.36,
    5,
    'viaduct_limestone',
  ),
  makeWalkableRamp(
    'ramp-z5-terraced-cascade',
    'Zone 5 Penthouse Limestone Terraced Cascade (+14.00m -> +2.00m)',
    'courtyard_ramp',
    { minX: 44.0, maxX: 48.4, minZ: 8.0, maxZ: 11.4 },
    2.0,
    14.0,
    'north', // High end (+14.0m) at z = 8.0, low end (+2.0m) flush with Arrival Terrace at z = 11.4!
    2.0,
    0.52,
    0.32,
    5,
    'viaduct_limestone',
  ),

  // Zone 6: Beaux-Arts Grand Plaza Steps (+2.0m -> 0.0m) & Upper Sunken Subway Stairwell (0.0m -> -4.5m)
  makeWalkableRamp(
    'ramp-z6-plaza-grand-steps',
    'Zone 6 Beaux-Arts Granite Grand Steps (+2.00m -> 0.00m)',
    'courtyard_ramp',
    { minX: 27.0, maxX: 45.0, minZ: 24.0, maxZ: 32.0 },
    0.0,
    2.0,
    'north', // High end (+2.0m) at z = 24.0, low end (0.0m) at z = 32.0
    1.6,
    0.5,
    0.36,
    6,
    'beaux_arts_granite',
  ),
  makeWalkableRamp(
    'ramp-z6-subway-upper-stairwell',
    'Zone 6 Sunken Subway Headhouse Upper Stairwell & Brass Slide (0.00m -> -4.50m)',
    'courtyard_ramp',
    { minX: 29.5, maxX: 38.5, minZ: 56.0, maxZ: 68.0 },
    -4.5,
    0.0,
    'north', // High end (0.0m) at z = 56.0, low end (-4.5m) at z = 68.0
    1.4,
    0.46,
    0.35,
    6,
    'subway_ceramic_tile',
  ),

  // Zone 7: Lower Subway Mezzanine Stairwell (-4.5m -> -7.5m)
  makeWalkableRamp(
    'ramp-z7-subway-lower-stairwell',
    'Zone 7 Sunken Subway Concourse Lower Stairwell (-4.50m -> -7.50m)',
    'courtyard_ramp',
    { minX: 29.5, maxX: 38.5, minZ: 68.0, maxZ: 76.0 },
    -7.5,
    -4.5,
    'north', // High end (-4.5m) at z = 68.0, low end (-7.5m) at z = 76.0
    1.2,
    0.46,
    0.35,
    7,
    'subway_ceramic_tile',
  ),
];

// ============================================================================
// 6. GUTTERS, STORM GRATES & STONE CURBS
// ============================================================================

export const ESCAPADE_GUTTERS: StormGutterTrackSpec[] = [
  {
    id: 'gutter-z1-west-mercer',
    label: 'Zone 1 West Mercer Storm Gutter',
    kind: 'straight',
    width: 0.45,
    channelY: ELEVATIONS.GUTTER_CHANNEL_Y,
    depthBelowRoad: 0.02,
    adjacentCurbTopY: ELEVATIONS.SIDEWALK_Y,
    start: [-3.975, -0.02, 18.5],
    end: [-3.975, -0.02, 5.5],
    aabb: computeAABBFromBoundsXZ({ minX: -4.2, maxX: -3.75, minZ: 5.5, maxZ: 18.5 }, -0.08, -0.02),
  },
  {
    id: 'gutter-z1-east-hydrant-channel',
    label: 'Zone 1 East Bodega Hydrant Speed-Boost Gutter',
    kind: 'straight',
    width: 0.45,
    channelY: ELEVATIONS.GUTTER_CHANNEL_Y,
    depthBelowRoad: 0.02,
    adjacentCurbTopY: ELEVATIONS.SIDEWALK_Y,
    start: [3.975, -0.02, 16.0],
    end: [3.975, -0.02, -23.5],
    waterBoostVelocity: [0.0, 0.35, -10.8],
    aabb: computeAABBFromBoundsXZ({ minX: 3.75, maxX: 4.2, minZ: -23.5, maxZ: 16.0 }, -0.08, -0.02),
  },
  {
    id: 'gutter-z2-belvedere-turn-boost',
    label: 'Zone 2 Hillcrest Belvedere Water-Main Turn Gutter (+9.48m)',
    kind: 'straight',
    width: 0.65,
    channelY: 9.48,
    depthBelowRoad: 0.02,
    adjacentCurbTopY: 9.65,
    start: [-5.6, 9.48, -85.2],
    end: [5.8, 9.48, -85.2],
    waterBoostVelocity: [11.8, 0.35, 0.0],
    aabb: computeAABBFromBoundsXZ({ minX: -5.6, maxX: 5.8, minZ: -85.525, maxZ: -84.875 }, 9.35, 9.48),
  },
];

export const ESCAPADE_STORM_GRATES: StormDrainGrateSpec[] = [
  {
    id: 'grate-z1-east-hydrant',
    gutterId: 'gutter-z1-east-hydrant-channel',
    position: [3.975, -0.02, -16.8],
    size: [0.42, 0.03, 0.78],
    rotationY: 0,
    aabb: computeRotatedAABB([3.975, -0.02, -16.8], [0.42, 0.03, 0.78], 0),
  },
  {
    id: 'grate-z1-west-mid',
    gutterId: 'gutter-z1-west-mercer',
    position: [-3.975, -0.02, 11.5],
    size: [0.42, 0.03, 0.78],
    rotationY: 0,
    aabb: computeRotatedAABB([-3.975, -0.02, 11.5], [0.42, 0.03, 0.78], 0),
  },
];

export const ESCAPADE_STONE_CURBS: StoneCurbSegmentSpec[] = [
  {
    id: 'curb-z1-west-south',
    label: 'Zone 1 West Granite Curb South',
    kind: 'straight',
    bottomY: 0.0,
    topY: 0.15,
    height: 0.15,
    center: [-4.275, 0.075, 27.65],
    size: [0.15, 0.15, 10.3],
    rotationY: 0,
    restitution: 0.56,
    friction: 0.42,
    aabb: computeAABBFromBoundsXZ({ minX: -4.35, maxX: -4.2, minZ: 22.5, maxZ: 32.8 }, 0.0, 0.15),
  },
  {
    id: 'curb-z1-west-mid',
    label: 'Zone 1 West Granite Curb Mid',
    kind: 'straight',
    bottomY: 0.0,
    topY: 0.15,
    height: 0.15,
    center: [-4.275, 0.075, 12.0],
    size: [0.15, 0.15, 14.0],
    rotationY: 0,
    restitution: 0.56,
    friction: 0.42,
    aabb: computeAABBFromBoundsXZ({ minX: -4.35, maxX: -4.2, minZ: 5.0, maxZ: 19.0 }, 0.0, 0.15),
  },
  {
    id: 'curb-z1-east-main',
    label: 'Zone 1 East Granite Curb',
    kind: 'straight',
    bottomY: 0.0,
    topY: 0.15,
    height: 0.15,
    center: [4.275, 0.075, 4.4],
    size: [0.15, 0.15, 56.8],
    rotationY: 0,
    restitution: 0.56,
    friction: 0.42,
    aabb: computeAABBFromBoundsXZ({ minX: 4.2, maxX: 4.35, minZ: -24.0, maxZ: 32.8 }, 0.0, 0.15),
  },
];

// ============================================================================
// 7. ARCHITECTURAL WALLS, ROOFTOP PARAPETS, BALUSTRADES & SUBWAY VAULT SHELL
// ============================================================================

function makeWallFromBounds(
  id: string,
  label: string,
  kind: ArchitecturalWallSpec['kind'],
  boundsXZ: { minX: number; maxX: number; minZ: number; maxZ: number },
  groundY: number,
  topY: number,
  restitution: number,
  zoneNumber: GrandEscapadeZoneNumber,
): ArchitecturalWallSpec {
  const widthX = Number((boundsXZ.maxX - boundsXZ.minX).toFixed(4));
  const heightY = Number((topY - groundY).toFixed(4));
  const depthZ = Number((boundsXZ.maxZ - boundsXZ.minZ).toFixed(4));
  const cx = Number(((boundsXZ.minX + boundsXZ.maxX) * 0.5).toFixed(4));
  const cy = Number(((groundY + topY) * 0.5).toFixed(4));
  const cz = Number(((boundsXZ.minZ + boundsXZ.maxZ) * 0.5).toFixed(4));
  return {
    id,
    label,
    kind,
    groundY,
    topY,
    center: [cx, cy, cz],
    size: [widthX, heightY, depthZ],
    rotationY: 0,
    surfaceTag: 'masonry_wall',
    restitution,
    zoneNumber,
    aabb: computeAABBFromBoundsXZ(boundsXZ, groundY, topY),
  };
}

export const ESCAPADE_ARCHITECTURAL_WALLS: ArchitecturalWallSpec[] = [
  // Zone 2 Cobblestone Climb Stepped East Brownstone Retaining Cheek Walls (3 terraced steps matching hill rise!)
  makeWallFromBounds(
    'wall-z2-retaining-east-lower',
    'Zone 2 Lower Hill Stepped Brownstone Retaining Wall (+0.0m -> +4.05m)',
    'stone_retaining_wall',
    { minX: 6.52, maxX: 7.18, minZ: -46.0, maxZ: -24.1 },
    0.0,
    4.05,
    0.54,
    2,
  ),
  makeWallFromBounds(
    'wall-z2-retaining-east-mid',
    'Zone 2 Mid Hill Stepped Brownstone Retaining Wall (+3.0m -> +7.25m)',
    'stone_retaining_wall',
    { minX: 6.52, maxX: 7.18, minZ: -68.0, maxZ: -46.02 },
    3.0,
    7.25,
    0.54,
    2,
  ),
  makeWallFromBounds(
    'wall-z2-retaining-east-upper',
    'Zone 2 Upper Belvedere Stepped Retaining Wall (+6.2m -> +10.35m)',
    'stone_retaining_wall',
    { minX: 6.52, maxX: 7.18, minZ: -77.8, maxZ: -68.02 },
    6.2,
    10.35,
    0.54,
    2,
  ),

  // Zone 3 Low Wedge Shortcut Brick Parapet (+9.50m -> +9.95m = 0.45m high!)
  makeWallFromBounds(
    'wall-z3-wedge-shortcut-parapet',
    'Zone 3 Tenement West Low Brick Parapet Shortcut Lip',
    'rooftop_brick_parapet',
    { minX: 14.65, maxX: 14.98, minZ: -89.8, maxZ: -87.6 },
    9.5,
    9.95,
    0.5,
    3,
  ),
  // Zone 3 South Rooftop Brick Guardrail Parapets
  makeWallFromBounds(
    'wall-z3-roof-west-south-parapet',
    'Zone 3 Tenement Roof West South Brick Parapet',
    'rooftop_brick_parapet',
    { minX: 15.1, maxX: 31.9, minZ: -77.98, maxZ: -77.55 },
    11.0,
    11.85,
    0.54,
    3,
  ),
  makeWallFromBounds(
    'wall-z3-roof-east-south-parapet',
    'Zone 3 Tenement Roof East South Brick Parapet',
    'rooftop_brick_parapet',
    { minX: 37.1, maxX: 49.4, minZ: -77.98, maxZ: -77.55 },
    12.5,
    13.35,
    0.54,
    3,
  ),

  // Zone 4 Scenic Viaduct West Limestone Balustrade (true 0.85m waist-high belvedere parapet overlooking Zones 1-3!)
  makeWallFromBounds(
    'wall-z4-viaduct-west-balustrade-north',
    'Zone 4 Viaduct North Ramp West Limestone Guardrail',
    'viaduct_limestone_balustrade',
    { minX: 48.95, maxX: 49.45, minZ: -77.5, maxZ: -62.02 },
    12.5,
    15.85,
    0.58,
    4,
  ),
  makeWallFromBounds(
    'wall-z4-viaduct-west-balustrade',
    'Zone 4 Scenic Belvedere Waist-High Panoramic Limestone Balustrade',
    'viaduct_limestone_balustrade',
    { minX: 48.95, maxX: 49.45, minZ: -62.0, maxZ: -54.0 },
    15.0,
    15.85,
    0.58,
    4,
  ),
  makeWallFromBounds(
    'wall-z4-viaduct-west-balustrade-south',
    'Zone 4 Summit Ramp West Limestone Guardrail',
    'viaduct_limestone_balustrade',
    { minX: 48.95, maxX: 49.45, minZ: -53.98, maxZ: -44.02 },
    15.0,
    17.35,
    0.58,
    4,
  ),
  makeWallFromBounds(
    'wall-z4-piazza-west-balustrade',
    'Zone 4 Overlook Piazza West Limestone Balustrade',
    'viaduct_limestone_balustrade',
    { minX: 48.5, maxX: 48.98, minZ: -44.0, maxZ: -13.2 },
    14.0,
    17.35,
    0.58,
    4,
  ),

  // Zone 5 Penthouse North-West Guardrail & Low Copper-Chute Funnel Guide Curbs (leaving East Sky Driver cliff wide open!)
  makeWallFromBounds(
    'wall-z5-penthouse-west-guard',
    'Zone 5 Penthouse North-West Limestone Guardrail',
    'viaduct_limestone_balustrade',
    { minX: 43.5, maxX: 43.98, minZ: -4.0, maxZ: 1.8 },
    14.0,
    14.85,
    0.56,
    5,
  ),
  makeWallFromBounds(
    'wall-z5-chute-guide-west',
    'Zone 5 Copper Chute Deck West Funnel Cheek',
    'viaduct_limestone_balustrade',
    { minX: 50.32, maxX: 50.62, minZ: 6.6, maxZ: 7.96 },
    14.0,
    14.18,
    0.52,
    5,
  ),
  makeWallFromBounds(
    'wall-z5-chute-guide-east',
    'Zone 5 Copper Chute Deck East Funnel Cheek',
    'viaduct_limestone_balustrade',
    { minX: 53.38, maxX: 53.68, minZ: 6.6, maxZ: 7.96 },
    14.0,
    14.18,
    0.52,
    5,
  ),

  // Zone 6 Arrival Terrace East Balustrade & Sunken Subway Stairwell Cheek Parapets
  makeWallFromBounds(
    'wall-z6-arrival-east-balustrade',
    'Zone 6 Chute Arrival Terrace East Beaux-Arts Balustrade',
    'viaduct_limestone_balustrade',
    { minX: 61.52, maxX: 62.1, minZ: 14.05, maxZ: 24.0 },
    0.0,
    2.85,
    0.56,
    6,
  ),
  makeWallFromBounds(
    'wall-z6-stair-cheek-west',
    'Zone 6 Subway Stairwell West Granite Cheek Parapet',
    'subway_stair_parapet',
    { minX: 28.88, maxX: 29.18, minZ: 56.0, maxZ: 68.0 },
    -8.5,
    1.1,
    0.52,
    6,
  ),
  makeWallFromBounds(
    'wall-z6-stair-cheek-east',
    'Zone 6 Subway Stairwell East Granite Cheek Parapet',
    'subway_stair_parapet',
    { minX: 38.82, maxX: 39.12, minZ: 56.0, maxZ: 68.0 },
    -8.5,
    1.1,
    0.52,
    6,
  ),
  makeWallFromBounds(
    'wall-z7-lower-stair-cheek-west',
    'Zone 7 Lower Mezzanine Stairwell West Ceramic Cheek Wall',
    'subway_stair_parapet',
    { minX: 28.88, maxX: 29.18, minZ: 68.02, maxZ: 75.95 },
    -8.5,
    -1.0,
    0.52,
    7,
  ),
  makeWallFromBounds(
    'wall-z7-lower-stair-cheek-east',
    'Zone 7 Lower Mezzanine Stairwell East Ceramic Cheek Wall',
    'subway_stair_parapet',
    { minX: 38.82, maxX: 39.12, minZ: 68.02, maxZ: 75.95 },
    -8.5,
    -1.0,
    0.52,
    7,
  ),
  makeWallFromBounds(
    'wall-z6-stair-underbulkhead',
    'Zone 6 Subterranean Stairwell North Foundation Bulkhead',
    'subway_ceramic_vault_wall',
    { minX: 29.5, maxX: 38.5, minZ: 54.8, maxZ: 55.58 },
    -8.5,
    -0.05,
    0.5,
    6,
  ),
  makeWallFromBounds(
    'wall-z6-headhouse-canopy-roof',
    'Zone 6 Ornamental Cast-Iron & Emerald Glass Headhouse Canopy',
    'subway_vault_ceiling_slab',
    { minX: 28.88, maxX: 39.12, minZ: 61.5, maxZ: 68.0 },
    2.45,
    3.35,
    0.4,
    6,
  ),

  // Zone 7 Complete Subterranean Ceramic-Tile Vault Shell (100% 360° Subterranean Enclosure!)
  makeWallFromBounds(
    'wall-z7-vault-west',
    'Zone 7 West Cream-and-Emerald Glazed Ceramic Vault Wall',
    'subway_ceramic_vault_wall',
    { minX: 20.5, maxX: 22.0, minZ: 68.0, maxZ: 126.0 },
    -8.5,
    0.45,
    0.56,
    7,
  ),
  makeWallFromBounds(
    'wall-z7-vault-east',
    'Zone 7 East Cream-and-Emerald Glazed Ceramic Vault Wall',
    'subway_ceramic_vault_wall',
    { minX: 46.0, maxX: 47.5, minZ: 68.0, maxZ: 126.0 },
    -8.5,
    0.45,
    0.56,
    7,
  ),
  makeWallFromBounds(
    'wall-z7-vault-south-terminal',
    'Zone 7 South Station-Master Mosaic End Backstop Wall',
    'subway_ceramic_vault_wall',
    { minX: 22.0, maxX: 46.0, minZ: 124.0, maxZ: 126.0 },
    -8.5,
    0.45,
    0.54,
    7,
  ),
  makeWallFromBounds(
    'wall-z7-vault-north-west-wing',
    'Zone 7 North Mezzanine West Ceramic Headwall',
    'subway_ceramic_vault_wall',
    { minX: 20.5, maxX: 28.85, minZ: 67.2, maxZ: 68.0 },
    -8.5,
    -0.05,
    0.54,
    7,
  ),
  makeWallFromBounds(
    'wall-z7-vault-north-east-wing',
    'Zone 7 North Mezzanine East Ceramic Headwall',
    'subway_ceramic_vault_wall',
    { minX: 39.15, maxX: 47.5, minZ: 67.2, maxZ: 68.0 },
    -8.5,
    -0.05,
    0.54,
    7,
  ),
  makeWallFromBounds(
    'wall-z7-vault-north-portal-lintel',
    'Zone 7 Stairwell Throat Ceramic Portal Header Wall',
    'subway_ceramic_vault_wall',
    { minX: 29.5, maxX: 38.5, minZ: 67.6, maxZ: 68.0 },
    -0.58,
    0.45,
    0.5,
    7,
  ),
  makeWallFromBounds(
    'wall-z7-vault-ceiling-slab',
    'Zone 7 Barrel-Vaulted Guastavino Ceramic Ceiling & Sidewalk Light-Shaft Deck',
    'subway_vault_ceiling_slab',
    { minX: 22.0, maxX: 46.0, minZ: 68.0, maxZ: 124.0 },
    -0.58,
    0.2,
    0.38,
    7,
  ),
];

// ============================================================================
// 8. FULL 360° URBAN PERIMETER BUILDINGS & NYC SKYLINE BACKDROP RING
// ============================================================================

interface BuildingInit {
  id: string;
  name: string;
  ring: 'primary_facade' | 'skyline_backdrop';
  corridorSector: PerimeterBuildingSpec['corridorSector'];
  groundY: number;
  boundsXZ: { minX: number; maxX: number; minZ: number; maxZ: number };
  height: number;
  stories: number;
  palette: BuildingPaletteId;
  trimPalette: BuildingPaletteId;
  roofStyle: BuildingRoofStyle;
  frontFace: CardinalDirection;
  shopfrontBayCount?: number;
  windowColumns?: number;
  hasShutters?: boolean;
  shutterHex?: string;
  julietBalconyCount?: number;
  hasFireEscape?: boolean;
  shopfrontAwningHex?: string;
  isScaffoldingHost?: boolean;
  zoneNumber?: GrandEscapadeZoneNumber;
}

function makeBuilding(init: BuildingInit): PerimeterBuildingSpec {
  return {
    id: init.id,
    name: init.name,
    ring: init.ring,
    corridorSector: init.corridorSector,
    groundY: init.groundY,
    boundsXZ: init.boundsXZ,
    height: init.height,
    stories: init.stories,
    palette: init.palette,
    trimPalette: init.trimPalette,
    roofStyle: init.roofStyle,
    frontFace: init.frontFace,
    shopfrontBayCount: init.shopfrontBayCount ?? 3,
    windowColumns: init.windowColumns ?? 4,
    hasShutters: init.hasShutters ?? true,
    shutterHex: init.shutterHex ?? '#2F5241',
    julietBalconyCount: init.julietBalconyCount ?? 2,
    hasFireEscape: init.hasFireEscape ?? false,
    shopfrontAwningHex: init.shopfrontAwningHex,
    isScaffoldingHost: init.isScaffoldingHost,
    zoneNumber: init.zoneNumber,
    aabb: computeAABBFromBoundsXZ(init.boundsXZ, init.groundY, init.groundY + init.height),
  };
}

export const ESCAPADE_PERIMETER_BUILDINGS: PerimeterBuildingSpec[] = [
  // --- Zone 1 South Backstop & West Bodega/Scaffolding Row ---
  makeBuilding({
    id: 'esc-bld-z1-south-backstop',
    name: 'Mercer South Beaux-Arts Exchange',
    ring: 'primary_facade',
    corridorSector: 'south_subway_backstop',
    groundY: 0.0,
    boundsXZ: { minX: -17.5, maxX: 11.8, minZ: 39.25, maxZ: 52.0 },
    height: 24.5,
    stories: 6,
    palette: 'cream_limestone',
    trimPalette: 'sage_trim',
    roofStyle: 'mansard_slate',
    frontFace: 'north',
    shopfrontAwningHex: '#235347',
    zoneNumber: 1,
  }),
  makeBuilding({
    id: 'esc-bld-z1-west-1',
    name: 'Corner Espresso & Vinyl House',
    ring: 'primary_facade',
    corridorSector: 'west_5th_ave',
    groundY: 0.0,
    boundsXZ: { minX: -17.5, maxX: -7.25, minZ: 21.0, maxZ: 39.2 },
    height: 15.2,
    stories: 4,
    palette: 'terracotta',
    trimPalette: 'cream_limestone',
    roofStyle: 'cornice_parapet',
    frontFace: 'east',
    shopfrontAwningHex: '#B84A39',
    zoneNumber: 1,
  }),
  makeBuilding({
    id: 'esc-bld-z1-west-2-scaffolding-host',
    name: 'Mercer Hardware & Scaffolding Loft',
    ring: 'primary_facade',
    corridorSector: 'west_5th_ave',
    groundY: 0.0,
    boundsXZ: { minX: -17.5, maxX: -7.25, minZ: 2.0, maxZ: 20.95 },
    height: 16.8,
    stories: 4,
    palette: 'warm_brick',
    trimPalette: 'cream_limestone',
    roofStyle: 'cornice_parapet',
    frontFace: 'east',
    hasFireEscape: true,
    isScaffoldingHost: true,
    zoneNumber: 1,
  }),
  makeBuilding({
    id: 'esc-bld-z1-west-3',
    name: 'Ochre Bookshop & Jazz Parlor',
    ring: 'primary_facade',
    corridorSector: 'west_5th_ave',
    groundY: 0.0,
    boundsXZ: { minX: -17.5, maxX: -7.25, minZ: -24.0, maxZ: 1.95 },
    height: 16.0,
    stories: 4,
    palette: 'ochre',
    trimPalette: 'sage_trim',
    roofStyle: 'hipped_terracotta_tile',
    frontFace: 'east',
    shopfrontAwningHex: '#2E5E4E',
    zoneNumber: 1,
  }),

  // --- Zone 2 West Stepped Brownstones along Cobblestone Hill ---
  makeBuilding({
    id: 'esc-bld-z2-west-brownstone-1',
    name: 'Lower Mercer Terraced Brownstones',
    ring: 'primary_facade',
    corridorSector: 'west_5th_ave',
    groundY: 0.0,
    boundsXZ: { minX: -17.5, maxX: -6.55, minZ: -54.0, maxZ: -24.05 },
    height: 21.5,
    stories: 5,
    palette: 'warm_brick',
    trimPalette: 'cream_limestone',
    roofStyle: 'cornice_parapet',
    frontFace: 'east',
    hasFireEscape: true,
    zoneNumber: 2,
  }),
  makeBuilding({
    id: 'esc-bld-z2-west-brownstone-2',
    name: 'Hillcrest Belvedere Mansard Row',
    ring: 'primary_facade',
    corridorSector: 'west_5th_ave',
    groundY: 0.0,
    boundsXZ: { minX: -17.5, maxX: -6.55, minZ: -90.0, maxZ: -54.05 },
    height: 23.5,
    stories: 6,
    palette: 'terracotta',
    trimPalette: 'cream_limestone',
    roofStyle: 'mansard_slate',
    frontFace: 'east',
    julietBalconyCount: 4,
    zoneNumber: 2,
  }),

  // --- Zone 3 North Crosstown Perimeter Block (Stepped for Open Golden-Hour Rooftop Sky!) ---
  makeBuilding({
    id: 'esc-bld-z3-north-west',
    name: 'Crosstown Clockwork Lofts West',
    ring: 'primary_facade',
    corridorSector: 'north_mercer_bend',
    groundY: 0.0,
    boundsXZ: { minX: -17.5, maxX: 25.0, minZ: -102.0, maxZ: -90.05 },
    height: 22.5,
    stories: 5,
    palette: 'warm_brick',
    trimPalette: 'sage_trim',
    roofStyle: 'cornice_parapet',
    frontFace: 'south',
    hasFireEscape: true,
    zoneNumber: 3,
  }),
  makeBuilding({
    id: 'esc-bld-z3-north-east',
    name: 'Crosstown Conservatory Towers North',
    ring: 'primary_facade',
    corridorSector: 'north_courtyard',
    groundY: 0.0,
    boundsXZ: { minX: 25.05, maxX: 74.5, minZ: -102.0, maxZ: -90.05 },
    height: 24.5,
    stories: 6,
    palette: 'cream_limestone',
    trimPalette: 'terracotta',
    roofStyle: 'campanile_spire',
    frontFace: 'south',
    zoneNumber: 3,
  }),

  // --- Central City Block Spine (Stepped at 13.6m across z = -77.5..-4.0 so Zone 4 enjoys a true panoramic vista across Zones 1-3!) ---
  makeBuilding({
    id: 'esc-bld-central-bodega-east',
    name: 'Bodega & Delicatessen Corner Block',
    ring: 'primary_facade',
    corridorSector: 'east_5th_ave',
    groundY: 0.0,
    boundsXZ: { minX: 7.25, maxX: 23.8, minZ: -24.0, maxZ: 39.2 },
    height: 16.5,
    stories: 4,
    palette: 'terracotta',
    trimPalette: 'cream_limestone',
    roofStyle: 'cornice_parapet',
    frontFace: 'west',
    shopfrontAwningHex: '#C85A32',
    zoneNumber: 1,
  }),
  makeBuilding({
    id: 'esc-bld-central-vista-low-roof',
    name: 'Mid-Block Artisan Courtyard Studios (Low Rooftop Vista Tier)',
    ring: 'primary_facade',
    corridorSector: 'south_mercer_se_corner',
    groundY: 0.0,
    boundsXZ: { minX: 7.25, maxX: 48.4, minZ: -77.5, maxZ: -24.05 },
    height: 13.6, // 1.4m below Zone 4's +15.0m Viaduct Belvedere so players see clear across to Zones 1-3!
    stories: 4,
    palette: 'ochre',
    trimPalette: 'sage_trim',
    roofStyle: 'hipped_terracotta_tile',
    frontFace: 'west',
    zoneNumber: 4,
  }),
  makeBuilding({
    id: 'esc-bld-central-vista-south-courtyard',
    name: 'Mercer Botanical Courtyard Low Atelier',
    ring: 'primary_facade',
    corridorSector: 'south_mercer_se_corner',
    groundY: 0.0,
    boundsXZ: { minX: 23.85, maxX: 43.4, minZ: -24.0, maxZ: -4.0 },
    height: 13.6, // Keeps the entire central courtyard below +14.0m for panoramic Zone 4/5 sightlines!
    stories: 4,
    palette: 'warm_brick',
    trimPalette: 'cream_limestone',
    roofStyle: 'cornice_parapet',
    frontFace: 'east',
    zoneNumber: 4,
  }),
  makeBuilding({
    id: 'esc-bld-central-conservatory-west-wing',
    name: 'Midtown West Beaux-Arts Arcade',
    ring: 'primary_facade',
    corridorSector: 'south_mercer_se_corner',
    groundY: 0.0,
    boundsXZ: { minX: 23.85, maxX: 43.4, minZ: -3.95, maxZ: 7.75 },
    height: 21.5,
    stories: 5,
    palette: 'cream_limestone',
    trimPalette: 'sage_trim',
    roofStyle: 'mansard_slate',
    frontFace: 'south',
    zoneNumber: 5,
  }),
  makeBuilding({
    id: 'esc-bld-z6-midtown-west-arcade',
    name: 'Grand Transit Square West Colonnade',
    ring: 'primary_facade',
    corridorSector: 'east_5th_ave',
    groundY: 0.0,
    boundsXZ: { minX: 11.85, maxX: 23.95, minZ: 39.25, maxZ: 68.0 },
    height: 18.5,
    stories: 4,
    palette: 'cream_limestone',
    trimPalette: 'terracotta',
    roofStyle: 'mansard_slate',
    frontFace: 'east',
    shopfrontAwningHex: '#1F4E43',
    zoneNumber: 6,
  }),

  // --- Zone 4, 5 & 6 East Perimeter Facades (Recessed at x >= 62.5 in Zone 6 North for Open Sky Driver Plunge!) ---
  makeBuilding({
    id: 'esc-bld-z4-east-viaduct-palazzo',
    name: 'Viaduct Belvedere Trattoria Palazzo',
    ring: 'primary_facade',
    corridorSector: 'east_courtyard_backstop',
    groundY: 0.0,
    boundsXZ: { minX: 61.6, maxX: 74.5, minZ: -90.0, maxZ: -29.0 },
    height: 25.5,
    stories: 6,
    palette: 'terracotta',
    trimPalette: 'cream_limestone',
    roofStyle: 'hipped_terracotta_tile',
    frontFace: 'west',
    shopfrontAwningHex: '#A63A2B',
    julietBalconyCount: 4,
    zoneNumber: 4,
  }),
  makeBuilding({
    id: 'esc-bld-z5-east-clocktower-hall',
    name: 'Royal Botanical & Clocktower Conservatory Hall',
    ring: 'primary_facade',
    corridorSector: 'east_courtyard_backstop',
    groundY: 0.0,
    boundsXZ: { minX: 61.6, maxX: 74.5, minZ: -28.95, maxZ: 14.0 },
    height: 27.5,
    stories: 7,
    palette: 'cream_limestone',
    trimPalette: 'sage_trim',
    roofStyle: 'campanile_spire',
    frontFace: 'west',
    zoneNumber: 5,
  }),
  makeBuilding({
    id: 'esc-bld-z6-east-transit-exchange-north',
    name: 'Grand Transit Exchange East Wing',
    ring: 'primary_facade',
    corridorSector: 'east_courtyard_backstop',
    groundY: 0.0,
    boundsXZ: { minX: 62.5, maxX: 74.5, minZ: 14.05, maxZ: 24.5 },
    height: 25.0,
    stories: 6,
    palette: 'ochre',
    trimPalette: 'cream_limestone',
    roofStyle: 'cornice_parapet',
    frontFace: 'west',
    zoneNumber: 6,
  }),
  makeBuilding({
    id: 'esc-bld-z6-east-transit-exchange-south',
    name: 'Midtown Press & Telegraph Building',
    ring: 'primary_facade',
    corridorSector: 'east_courtyard_backstop',
    groundY: 0.0,
    boundsXZ: { minX: 46.05, maxX: 74.5, minZ: 24.55, maxZ: 68.0 },
    height: 19.5,
    stories: 5,
    palette: 'warm_brick',
    trimPalette: 'cream_limestone',
    roofStyle: 'mansard_slate',
    frontFace: 'west',
    shopfrontAwningHex: '#284B63',
    zoneNumber: 6,
  }),
  makeBuilding({
    id: 'esc-bld-z6-south-headhouse-overbuild',
    name: 'Crosstown Terminal Beaux-Arts Surface Pavilion',
    ring: 'primary_facade',
    corridorSector: 'south_courtyard',
    // Grounded at y = +0.50m strictly above Zone 7's subterranean vault walls (topY = +0.45m) -> zero 3D overlap, low 3-story Grand Central profile!
    groundY: 0.5,
    boundsXZ: { minX: 11.85, maxX: 74.5, minZ: 68.05, maxZ: 126.5 },
    height: 11.5,
    stories: 3,
    palette: 'cream_limestone',
    trimPalette: 'sage_trim',
    roofStyle: 'cornice_parapet',
    frontFace: 'north',
    zoneNumber: 6,
  }),
];

// Stepped NYC outer skyline ring (topY = +31.0m..+35.0m: 100% 360° horizon closure with open golden-hour sky above!)
export const ESCAPADE_SKYLINE_BACKDROPS: PerimeterBuildingSpec[] = [
  // North Skyline Wall (z: -116..-103, x: -36..90)
  makeBuilding({
    id: 'esc-sky-north-1',
    name: 'Hudson Skyline Tower NW',
    ring: 'skyline_backdrop',
    corridorSector: 'north_mercer_bend',
    groundY: -8.5,
    boundsXZ: { minX: -36.0, maxX: 6.0, minZ: -116.0, maxZ: -103.0 },
    height: 39.5,
    stories: 10,
    palette: 'cream_limestone',
    trimPalette: 'sage_trim',
    roofStyle: 'cornice_parapet',
    frontFace: 'south',
  }),
  makeBuilding({
    id: 'esc-sky-north-2',
    name: 'Crosstown Spire Center North',
    ring: 'skyline_backdrop',
    corridorSector: 'north_courtyard',
    groundY: -8.5,
    boundsXZ: { minX: 6.0, maxX: 48.0, minZ: -116.0, maxZ: -103.0 },
    height: 43.0,
    stories: 11,
    palette: 'warm_brick',
    trimPalette: 'cream_limestone',
    roofStyle: 'campanile_spire',
    frontFace: 'south',
  }),
  makeBuilding({
    id: 'esc-sky-north-3',
    name: 'East River Crown Tower NE',
    ring: 'skyline_backdrop',
    corridorSector: 'north_courtyard',
    groundY: -8.5,
    boundsXZ: { minX: 48.0, maxX: 90.0, minZ: -116.0, maxZ: -103.0 },
    height: 40.5,
    stories: 10,
    palette: 'ochre',
    trimPalette: 'cream_limestone',
    roofStyle: 'mansard_slate',
    frontFace: 'south',
  }),

  // South Skyline Wall (z: 128..142, x: -36..90)
  makeBuilding({
    id: 'esc-sky-south-1',
    name: 'Lower Manhattan Deco Tower SW',
    ring: 'skyline_backdrop',
    corridorSector: 'south_subway_backstop',
    groundY: -8.5,
    boundsXZ: { minX: -36.0, maxX: 6.0, minZ: 128.0, maxZ: 142.0 },
    height: 40.5,
    stories: 10,
    palette: 'warm_brick',
    trimPalette: 'cream_limestone',
    roofStyle: 'cornice_parapet',
    frontFace: 'north',
  }),
  makeBuilding({
    id: 'esc-sky-south-2',
    name: 'Terminal Grand Campanile South',
    ring: 'skyline_backdrop',
    corridorSector: 'south_courtyard',
    groundY: -8.5,
    boundsXZ: { minX: 6.0, maxX: 48.0, minZ: 128.0, maxZ: 142.0 },
    height: 42.0,
    stories: 11,
    palette: 'cream_limestone',
    trimPalette: 'terracotta',
    roofStyle: 'campanile_spire',
    frontFace: 'north',
  }),
  makeBuilding({
    id: 'esc-sky-south-3',
    name: 'Battery Park Limestone Tower SE',
    ring: 'skyline_backdrop',
    corridorSector: 'south_courtyard',
    groundY: -8.5,
    boundsXZ: { minX: 48.0, maxX: 90.0, minZ: 128.0, maxZ: 142.0 },
    height: 40.0,
    stories: 10,
    palette: 'terracotta',
    trimPalette: 'cream_limestone',
    roofStyle: 'mansard_slate',
    frontFace: 'north',
  }),

  // West Skyline Wall (x: -36..-20, z: -103..128)
  makeBuilding({
    id: 'esc-sky-west-1',
    name: 'SoHo West Cast-Iron Highrise N',
    ring: 'skyline_backdrop',
    corridorSector: 'west_5th_ave',
    groundY: -8.5,
    boundsXZ: { minX: -36.0, maxX: -20.0, minZ: -103.0, maxZ: -26.0 },
    height: 39.5,
    stories: 10,
    palette: 'terracotta',
    trimPalette: 'cream_limestone',
    roofStyle: 'cornice_parapet',
    frontFace: 'east',
  }),
  makeBuilding({
    id: 'esc-sky-west-2',
    name: 'Mercer West Metropolis Tower Mid',
    ring: 'skyline_backdrop',
    corridorSector: 'west_5th_ave',
    groundY: -8.5,
    boundsXZ: { minX: -36.0, maxX: -20.0, minZ: -26.0, maxZ: 51.0 },
    height: 42.5,
    stories: 11,
    palette: 'ochre',
    trimPalette: 'sage_trim',
    roofStyle: 'mansard_slate',
    frontFace: 'east',
  }),
  makeBuilding({
    id: 'esc-sky-west-3',
    name: 'Tribeca West Skyline Block S',
    ring: 'skyline_backdrop',
    corridorSector: 'west_5th_ave',
    groundY: -8.5,
    boundsXZ: { minX: -36.0, maxX: -20.0, minZ: 51.0, maxZ: 128.0 },
    height: 40.0,
    stories: 10,
    palette: 'warm_brick',
    trimPalette: 'cream_limestone',
    roofStyle: 'cornice_parapet',
    frontFace: 'east',
  }),

  // East Skyline Wall (x: 76..90, z: -103..128)
  makeBuilding({
    id: 'esc-sky-east-1',
    name: 'Gramercy East Tower N',
    ring: 'skyline_backdrop',
    corridorSector: 'east_courtyard_backstop',
    groundY: -8.5,
    boundsXZ: { minX: 76.0, maxX: 90.0, minZ: -103.0, maxZ: -26.0 },
    height: 39.5,
    stories: 10,
    palette: 'cream_limestone',
    trimPalette: 'sage_trim',
    roofStyle: 'campanile_spire',
    frontFace: 'west',
  }),
  makeBuilding({
    id: 'esc-sky-east-2',
    name: 'Conservatory East Citadel Mid',
    ring: 'skyline_backdrop',
    corridorSector: 'east_courtyard_backstop',
    groundY: -8.5,
    boundsXZ: { minX: 76.0, maxX: 90.0, minZ: -26.0, maxZ: 51.0 },
    height: 43.5,
    stories: 11,
    palette: 'terracotta',
    trimPalette: 'cream_limestone',
    roofStyle: 'mansard_slate',
    frontFace: 'west',
  }),
  makeBuilding({
    id: 'esc-sky-east-3',
    name: 'Midtown East Beaux-Arts Tower S',
    ring: 'skyline_backdrop',
    corridorSector: 'east_courtyard_backstop',
    groundY: -8.5,
    boundsXZ: { minX: 76.0, maxX: 90.0, minZ: 51.0, maxZ: 128.0 },
    height: 40.5,
    stories: 10,
    palette: 'ochre',
    trimPalette: 'cream_limestone',
    roofStyle: 'cornice_parapet',
    frontFace: 'west',
  }),
];

// ============================================================================
// 9. HERO PROPS ACROSS ALL 7 ZONES (GROUNDED, COAXIAL, ZERO SOLID OVERLAPS)
// ============================================================================

const ESC_Z1_HOTDOG_YAW = 0.42;
const ESC_Z1_HOTDOG_AWNING = computePitchedAwningNormal(28, ESC_Z1_HOTDOG_YAW);
const ESC_Z3_SKYLIGHT_PITCH_DEG = 29.8; // Exact 0.52 rad match to AngledSkylightBankProp sash!
const ESC_Z3_SKYLIGHT_YAW = 2.92; // Pitched wired-glass normal faces NNE toward rooftop fairway & plank bridge!
const ESC_Z3_SKYLIGHT_NORMAL = computePitchedAwningNormal(
  ESC_Z3_SKYLIGHT_PITCH_DEG,
  ESC_Z3_SKYLIGHT_YAW,
);

export const ESCAPADE_COURSE_PROPS: CoursePropSpec[] = [
  // --------------------------------------------------------------------------
  // ZONE 1: Mercer Corner & Bodega Row (y = 0.0m / +0.15m)
  // --------------------------------------------------------------------------
  {
    id: 'esc-z1-scaffolding-shed',
    name: 'Zone 1 Flush West Sidewalk Scaffolding Shed',
    type: 'scaffolding_tunnel',
    escapadePropType: 'scaffolding_tunnel',
    zoneNumber: 1,
    zone: 'sidewalk',
    position: [-5.9, 0.15, 12.0],
    groundY: 0.15,
    rotationY: 0,
    localSize: [2.6, 2.85, 9.0],
    aabb: computeRotatedAABB([-5.9, 0.15, 12.0], [2.6, 2.85, 9.0], 0),
    solidColliders: [
      { min: [-7.2, 0.15, 7.5], max: [-6.98, 3.0, 16.5] },
      { min: [-4.82, 0.15, 7.5], max: [-4.6, 3.0, 16.5] },
      { min: [-7.2, 2.5, 7.5], max: [-4.6, 3.0, 16.5] },
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: false,
    reactive: {
      kind: 'scaffolding_underpass',
      zoneCenter: [-5.9, 1.325, 12.0],
      zoneHalfExtents: [1.08, 1.175, 4.5],
      underpassClearHeight: 2.35,
      underpassClearWidth: 2.16,
    },
    scaffoldingMeta: {
      hostBuildingId: 'esc-bld-z1-west-2-scaffolding-host',
      hostFacadeX: -7.25,
      wallGapMeters: 0.05,
      clearHeightMeters: 2.35,
      clearWidthMeters: 2.16,
      tunnelLengthMeters: 9.0,
    },
  },
  {
    id: 'esc-z1-delivery-van',
    name: 'Zone 1 Bodega Delivery Box Van & Rear Launch Ramp',
    type: 'delivery_box_van',
    escapadePropType: 'delivery_box_van',
    zoneNumber: 1,
    zone: 'road',
    position: [2.35, 0.0, -5.0],
    groundY: 0.0,
    rotationY: Math.PI,
    localSize: [2.04, 2.26, 7.0],
    aabb: computeRotatedAABB([2.35, 0.0, -5.0], [2.04, 2.26, 7.0], Math.PI),
    solidColliders: [
      { min: [1.33, 0.0, -5.9], max: [1.51, 2.24, -4.1] },
      { min: [3.19, 0.0, -5.9], max: [3.37, 2.24, -4.1] },
      { min: [1.51, 0.0, -5.9], max: [3.19, 0.96, -4.3] },
      { min: [1.33, 0.0, -7.02], max: [3.37, 2.24, -5.9] },
      { min: [1.33, 0.0, -8.5], max: [3.37, 1.82, -7.02] },
    ],
    surfaceTag: 'van_roof_deck',
    blocksGroundRoll: false,
    reactive: {
      kind: 'van_ramp_and_roof_launch',
      zoneCenter: [2.35, 2.24, -6.46],
      zoneHalfExtents: [0.95, 0.22, 0.56],
      restitution: 0.62,
      boostVelocity: [-0.9, 5.4, -14.2],
    },
    vanRampMeta: {
      loadingZoneId: ESCAPADE_VAN_LOADING_ZONE.id,
      rampBottomZ: -1.5,
      rampTopZ: -4.1,
      rampBottomY: 0.0,
      rampTopY: 1.08,
      rampWidth: 1.68,
      rampLaunchAngleDeg: 22.56,
      roofDeckTopY: 2.24,
      roofRestitution: 0.62,
      slopedRampSpec: makeWalkableRamp(
        'esc-z1-van-rear-ramp',
        'Zone 1 Delivery Van Rear Ramp',
        'van_roof_deck',
        { minX: 1.51, maxX: 3.19, minZ: -4.1, maxZ: -1.5 },
        0.0,
        1.08,
        'north',
        0.08,
        0.42,
        0.48,
        1,
      ),
      roofAccessKickerSpec: makeWalkableRamp(
        'esc-z1-van-roof-kicker',
        'Zone 1 Delivery Van Roof Kicker',
        'van_roof_deck',
        { minX: 1.51, maxX: 3.19, minZ: -5.9, maxZ: -4.1 },
        1.08,
        2.24,
        'north',
        0.08,
        0.4,
        0.52,
        1,
      ),
      roofLaunchDeckBoundsXZ: { minX: 1.43, maxX: 3.27, minZ: -7.02, maxZ: -5.9 },
    },
  },
  {
    id: 'esc-z1-hydrant-east',
    name: 'Zone 1 Spewing Corner Fire Hydrant',
    type: 'fire_hydrant_jet',
    escapadePropType: 'fire_hydrant_jet',
    zoneNumber: 1,
    zone: 'sidewalk',
    position: [4.85, 0.15, -15.5],
    groundY: 0.15,
    rotationY: -Math.PI * 0.5,
    localSize: [0.58, 0.92, 0.58],
    aabb: computeRotatedAABB([4.85, 0.15, -15.5], [0.58, 0.92, 0.58], -Math.PI * 0.5),
    solidColliders: [
      computeRotatedAABB([4.85, 0.15, -15.5], [0.54, 0.9, 0.54], 0),
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
    reactive: {
      kind: 'hydrant_water_jet',
      zoneCenter: [3.975, 0.35, -16.8],
      zoneHalfExtents: [0.45, 0.45, 2.2],
      boostVelocity: [0.0, 1.4, -12.8],
    },
  },
  {
    id: 'esc-z1-hotdog-cart',
    name: 'Zone 1 Mercer Corner Hotdog Stand & 28° Striped Awning',
    type: 'hotdog_cart_umbrella',
    escapadePropType: 'hotdog_cart_umbrella',
    zoneNumber: 1,
    zone: 'sidewalk',
    position: [-5.75, 0.15, -20.0],
    groundY: 0.15,
    rotationY: ESC_Z1_HOTDOG_YAW,
    localSize: [1.92, 2.58, 2.04],
    aabb: computeRotatedAABB([-5.75, 0.15, -20.0], [1.92, 2.58, 2.04], ESC_Z1_HOTDOG_YAW),
    solidColliders: [
      computeRotatedAABB([-5.75, 0.15, -20.0], [1.65, 1.35, 1.88], ESC_Z1_HOTDOG_YAW),
    ],
    surfaceTag: 'awning_cushion',
    blocksGroundRoll: true,
    reactive: {
      kind: 'awning_cushion_bank',
      zoneCenter: [-5.75, 2.3, -20.0],
      zoneHalfExtents: [1.05, 0.42, 1.05],
      restitution: 0.58,
    },
    hotdogAwningMeta: {
      pitchDeg: 28,
      restitution: 0.58,
      awningCenter: [-5.75, 2.3, -20.0],
      awningSize: [1.88, 0.06, 1.65],
      worldNormal: ESC_Z1_HOTDOG_AWNING.worldNormal,
      designIncomingVelocity: [-2.4, -5.2, -11.5],
      designReflectedVelocity: [2.8, 4.8, -9.4],
      predictedGreenLandingXZ: [0.0, -40.5],
      predictedStopXZ: [0.0, -42.0],
    },
  },

  // --------------------------------------------------------------------------
  // ZONE 2: Cobblestone Brownstone Climb (+3.1m & +6.3m Terraces -> +9.5m)
  // --------------------------------------------------------------------------
  {
    id: 'esc-z2-hillside-hydrant-boost',
    name: 'Zone 2 Burst Hillside Water-Main Hydrant (Uphill Surge Channel)',
    type: 'fire_hydrant_jet',
    escapadePropType: 'fire_hydrant_jet',
    zoneNumber: 2,
    zone: 'courtyard_patio',
    position: [-5.4, 3.1, -39.5],
    groundY: 3.1,
    rotationY: 0,
    localSize: [0.62, 0.96, 0.62],
    aabb: computeRotatedAABB([-5.4, 3.1, -39.5], [0.62, 0.96, 0.62], 0),
    solidColliders: [
      computeRotatedAABB([-5.4, 3.1, -39.5], [0.56, 0.94, 0.56], 0),
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
    reactive: {
      kind: 'hydrant_water_jet',
      zoneCenter: [-4.2, 3.6, -42.5],
      zoneHalfExtents: [0.75, 0.65, 3.2],
      boostVelocity: [0.4, 3.6, -15.4],
    },
  },
  {
    id: 'esc-z2-terrace-b-steam-grate',
    name: 'Zone 2 Terrace B Subway-Tunnel Uphill Steam Vent',
    type: 'subway_steam_grate',
    escapadePropType: 'subway_steam_grate',
    zoneNumber: 2,
    zone: 'courtyard_patio',
    position: [2.8, 6.3, -64.0],
    groundY: 6.3,
    rotationY: 0,
    localSize: [1.5, 0.08, 1.5],
    aabb: computeRotatedAABB([2.8, 6.3, -64.0], [1.5, 0.08, 1.5], 0),
    solidColliders: [],
    surfaceTag: 'van_ramp_metal',
    blocksGroundRoll: false,
    reactive: {
      kind: 'steam_updraft',
      zoneCenter: [2.8, 7.2, -64.0],
      zoneHalfExtents: [0.85, 1.1, 0.85],
      boostVelocity: [-0.8, 6.4, -12.6],
      cycleSeconds: 4.0,
      dutyCycle: 0.65,
    },
    steamLiftMeta: {
      cycleSeconds: 4.0,
      activeSeconds: 2.6,
      utilityBayBoundsXZ: { minX: 1.95, maxX: 3.65, minZ: -64.85, maxZ: -63.15 },
      upwardImpulseVelocity: [-0.8, 6.4, -12.6],
      clearsFountainId: 'none',
      targetFrontFringePoint: [0.0, 9.5, -82.0],
    },
  },
  {
    id: 'esc-z2-belvedere-lamp',
    name: 'Zone 2 Hillcrest Cast-Iron Gas Lamp',
    type: 'street_lamp',
    escapadePropType: 'street_lamp',
    zoneNumber: 2,
    zone: 'courtyard_patio',
    position: [-5.5, 9.5, -87.8],
    groundY: 9.5,
    rotationY: 0,
    localSize: [0.55, 4.1, 0.55],
    aabb: computeRotatedAABB([-5.5, 9.5, -87.8], [0.55, 4.1, 0.55], 0),
    solidColliders: [
      computeRotatedAABB([-5.5, 9.5, -87.8], [0.38, 4.1, 0.38], 0),
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },

  // --------------------------------------------------------------------------
  // ZONE 3: Tenement Rooftop Gardens & Water Towers (+11.0m -> +12.5m)
  // --------------------------------------------------------------------------
  {
    id: 'esc-z3-water-tower-west',
    name: 'Zone 3 Iconic NYC Cedar Rooftop Water Tower West',
    type: 'scaffolding_tunnel',
    escapadePropType: 'rooftop_water_tower',
    zoneNumber: 3,
    zone: 'courtyard_patio',
    position: [22.5, 11.0, -88.0],
    groundY: 11.0,
    rotationY: 0,
    localSize: [2.7, 5.7, 2.7],
    aabb: computeRotatedAABB([22.5, 11.0, -88.0], [2.7, 5.7, 2.7], 0),
    solidColliders: [
      { min: [21.35, 11.0, -89.15], max: [23.65, 16.56, -86.85] },
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'esc-z3-angled-skylight-bank',
    name: 'Zone 3 30° Angled Wired-Glass Rooftop Skylight Bank',
    type: 'hotdog_cart_umbrella',
    escapadePropType: 'angled_skylight_bank',
    zoneNumber: 3,
    zone: 'courtyard_patio',
    position: [25.5, 11.0, -79.8],
    groundY: 11.0,
    rotationY: ESC_Z3_SKYLIGHT_YAW,
    localSize: [3.2, 1.45, 1.9],
    aabb: computeRotatedAABB([25.5, 11.0, -79.8], [3.2, 1.45, 1.9], ESC_Z3_SKYLIGHT_YAW),
    // Low recessed 0.20m bronze curb plinth so rolling balls contact the overhanging 29.8° pitched glass collider first!
    solidColliders: [
      computeRotatedAABB([25.5, 11.0, -79.8], [2.85, 0.2, 1.15], ESC_Z3_SKYLIGHT_YAW),
    ],
    surfaceTag: 'awning_cushion',
    blocksGroundRoll: true,
    reactive: {
      kind: 'skylight_angled_bank',
      zoneCenter: [25.5, 11.72, -79.8],
      zoneHalfExtents: [1.6, 0.75, 1.0],
      restitution: 0.72,
      boostVelocity: [9.6, 2.2, -3.4],
    },
    pitchedBankMeta: {
      pitchDeg: ESC_Z3_SKYLIGHT_PITCH_DEG,
      restitution: 0.72,
      friction: 0.06,
      sashCenter: [25.5, 11.72, -79.8],
      sashSize: [3.08, 0.14, 1.62],
      worldNormal: ESC_Z3_SKYLIGHT_NORMAL.worldNormal,
      boostVelocity: [9.6, 2.2, -3.4],
    },
  },
  {
    id: 'esc-z3-hvac-updraft-fan',
    name: 'Zone 3 Rooftop HVAC Exhaust Fan Aerial Alley-Skip Pad',
    type: 'subway_steam_grate',
    escapadePropType: 'hvac_updraft_fan',
    zoneNumber: 3,
    zone: 'courtyard_patio',
    position: [30.2, 11.0, -88.0],
    groundY: 11.0,
    rotationY: 0,
    localSize: [2.1, 0.35, 2.1],
    aabb: computeRotatedAABB([30.2, 11.0, -88.0], [2.1, 0.35, 2.1], 0),
    solidColliders: [],
    surfaceTag: 'van_ramp_metal',
    blocksGroundRoll: false,
    reactive: {
      kind: 'hvac_updraft_boost',
      zoneCenter: [30.2, 12.1, -88.0],
      zoneHalfExtents: [1.1, 1.2, 1.1],
      boostVelocity: [11.8, 5.8, 1.6],
    },
  },
  {
    id: 'esc-z3-greenhouse-pergola',
    name: 'Zone 3 Rooftop Botanical Café Greenhouse Pergola',
    type: 'scaffolding_tunnel',
    escapadePropType: 'greenhouse_pergola',
    zoneNumber: 3,
    zone: 'courtyard_patio',
    position: [43.5, 12.5, -84.0],
    groundY: 12.5,
    rotationY: Math.PI * 0.5,
    localSize: [3.6, 3.1, 5.4],
    aabb: computeRotatedAABB([43.5, 12.5, -84.0], [3.6, 3.1, 5.4], Math.PI * 0.5),
    solidColliders: [
      { min: [40.8, 12.5, -85.8], max: [46.2, 15.6, -85.5] },
      { min: [40.8, 12.5, -82.5], max: [46.2, 15.6, -82.2] },
      { min: [40.8, 15.1, -85.8], max: [46.2, 15.6, -82.2] },
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: false,
    reactive: {
      kind: 'scaffolding_underpass',
      zoneCenter: [43.5, 13.8, -84.0],
      zoneHalfExtents: [2.7, 1.3, 1.45],
      underpassClearHeight: 2.6,
      underpassClearWidth: 2.9,
    },
  },
  {
    id: 'esc-z3-water-tower-east',
    name: 'Zone 3 East Tenement Cedar Water Tower',
    type: 'scaffolding_tunnel',
    escapadePropType: 'rooftop_water_tower',
    zoneNumber: 3,
    zone: 'courtyard_patio',
    position: [50.5, 12.5, -88.2],
    groundY: 12.5,
    rotationY: 0.4,
    localSize: [2.7, 5.7, 2.7],
    aabb: computeRotatedAABB([50.5, 12.5, -88.2], [2.7, 5.7, 2.7], 0),
    solidColliders: [
      { min: [49.35, 12.5, -89.35], max: [51.65, 18.06, -87.05] },
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },

  // --------------------------------------------------------------------------
  // ZONE 4: Viaduct Overpass & Overlook Terrace (+15.0m -> +16.5m Summit)
  // --------------------------------------------------------------------------
  {
    id: 'esc-z4-viaduct-triumphal-arch',
    name: 'Zone 4 Romanesque Limestone Viaduct Portal Arch',
    type: 'scaffolding_tunnel',
    escapadePropType: 'stone_viaduct_arch',
    zoneNumber: 4,
    zone: 'courtyard_patio',
    position: [55.0, 15.0, -58.0],
    groundY: 15.0,
    rotationY: 0,
    localSize: [8.8, 5.2, 2.4],
    aabb: computeRotatedAABB([55.0, 15.0, -58.0], [8.8, 5.2, 2.4], 0),
    solidColliders: [
      { min: [50.6, 15.0, -59.2], max: [51.8, 20.2, -56.8] },
      { min: [58.2, 15.0, -59.2], max: [59.4, 20.2, -56.8] },
      { min: [50.6, 18.8, -59.2], max: [59.4, 20.2, -56.8] },
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: false,
  },
  {
    id: 'esc-z4-trattoria-bistro-north',
    name: 'Zone 4 Overlook Trattoria Bistro Umbrella Table',
    type: 'bistro_umbrella_set',
    escapadePropType: 'bistro_umbrella_set',
    zoneNumber: 4,
    zone: 'courtyard_patio',
    position: [59.4, 16.5, -40.5],
    groundY: 16.5,
    rotationY: 0.3,
    localSize: [2.2, 2.55, 2.2],
    aabb: computeRotatedAABB([59.4, 16.5, -40.5], [2.2, 2.55, 2.2], 0),
    solidColliders: [
      { min: [58.5, 16.5, -41.4], max: [60.3, 19.05, -39.6] },
    ],
    surfaceTag: 'umbrella_bounce',
    blocksGroundRoll: true,
    reactive: {
      kind: 'umbrella_trampoline',
      zoneCenter: [59.4, 18.7, -40.5],
      zoneRadius: 1.15,
      restitution: 0.82,
    },
  },
  {
    id: 'esc-z4-curved-balustrade-bank',
    name: 'Zone 4 Sculpted Limestone Curved Balustrade Bank Wall',
    type: 'curved_gutter_corner',
    escapadePropType: 'curved_balustrade_bank',
    zoneNumber: 4,
    zone: 'courtyard_patio',
    position: [59.6, 16.5, -32.2],
    groundY: 16.5,
    rotationY: -Math.PI * 0.25,
    localSize: [2.6, 1.15, 0.75],
    aabb: computeRotatedAABB([59.6, 16.5, -32.2], [2.6, 1.15, 0.75], -Math.PI * 0.25),
    solidColliders: [
      computeRotatedAABB([59.6, 16.5, -32.2], [2.4, 1.15, 0.65], -Math.PI * 0.25),
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
    reactive: {
      kind: 'gutter_corner_bank',
      zoneCenter: [59.6, 17.0, -32.2],
      zoneRadius: 1.4,
      restitution: 0.66,
    },
  },

  // --------------------------------------------------------------------------
  // ZONE 5: Clocktower Conservatory, Bell Tower & Spiraling Copper Chute
  // --------------------------------------------------------------------------
  {
    id: 'esc-z5-glass-conservatory',
    name: 'Zone 5 Victorian Wrought-Iron & Glass Botanical Conservatory',
    type: 'scaffolding_tunnel',
    escapadePropType: 'glass_conservatory',
    zoneNumber: 5,
    zone: 'courtyard_patio',
    position: [55.0, 16.5, -21.0],
    groundY: 16.5,
    rotationY: 0,
    localSize: [7.6, 4.6, 9.0],
    aabb: computeRotatedAABB([55.0, 16.5, -21.0], [7.6, 4.6, 9.0], 0),
    solidColliders: [
      { min: [51.2, 16.5, -25.5], max: [51.65, 21.1, -16.5] },
      { min: [58.35, 16.5, -25.5], max: [58.8, 21.1, -16.5] },
      { min: [51.2, 20.1, -25.5], max: [58.8, 21.1, -16.5] },
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: false,
    reactive: {
      kind: 'scaffolding_underpass',
      zoneCenter: [55.0, 18.3, -21.0],
      zoneHalfExtents: [3.35, 1.8, 4.5],
      underpassClearHeight: 3.6,
      underpassClearWidth: 6.7,
    },
  },
  {
    id: 'esc-z5-rooftop-bell-tower',
    name: 'Zone 5 Penthouse Bronze Campanile Bell Tower (Chimes on Impact!)',
    type: 'subway_entrance_portal',
    escapadePropType: 'rooftop_bell_tower',
    zoneNumber: 5,
    zone: 'courtyard_patio',
    position: [58.2, 14.0, 3.2],
    groundY: 14.0,
    rotationY: -0.45,
    localSize: [2.8, 6.4, 2.8],
    aabb: computeRotatedAABB([58.2, 14.0, 3.2], [2.8, 6.4, 2.8], 0),
    solidColliders: [
      { min: [56.9, 14.0, 1.9], max: [59.5, 20.4, 4.5] },
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
    reactive: {
      kind: 'bell_tower_chime',
      zoneCenter: [58.2, 16.2, 3.2],
      zoneRadius: 1.9,
      restitution: 0.72,
      boostVelocity: [-5.8, 1.4, 5.6],
    },
  },
  {
    id: 'esc-z5-copper-spiral-chute',
    name: 'Zone 5 Spiraling Patinated Copper Roof-Gutter Chute (+14.0m -> +2.0m)',
    type: 'curved_gutter_corner',
    escapadePropType: 'copper_spiral_chute',
    zoneNumber: 5,
    zone: 'gutter',
    position: [52.0, 2.0, 10.5],
    groundY: 2.0,
    rotationY: 0,
    localSize: [7.8, 12.8, 7.8],
    aabb: computeRotatedAABB([52.0, 2.0, 10.5], [7.8, 12.8, 7.8], 0),
    // Hollow open-entry helical chute: physics follows COPPER_SPIRAL_CHUTE_SPEC spline!
    solidColliders: [],
    surfaceTag: 'van_ramp_metal',
    blocksGroundRoll: false,
    reactive: {
      kind: 'copper_chute_funnel',
      zoneCenter: COPPER_SPIRAL_CHUTE_SPEC.entryPosition,
      zoneHalfExtents: [1.8, 0.9, 1.6],
      boostVelocity: COPPER_SPIRAL_CHUTE_SPEC.exitLaunchVelocity,
    },
  },

  // --------------------------------------------------------------------------
  // ZONE 6: Grand Transit Plaza & Sunken Subway Headhouse (+2.0m -> 0.0m -> -4.5m)
  // --------------------------------------------------------------------------
  {
    id: 'esc-z6-midtown-fountain',
    name: 'Zone 6 Beaux-Arts Roundabout Stone Fountain',
    type: 'fountain_water_hazard',
    escapadePropType: 'fountain_water_hazard',
    zoneNumber: 6,
    zone: 'subway_plaza',
    position: [34.0, 0.0, 44.0],
    groundY: 0.0,
    rotationY: 0,
    localSize: [4.2, 1.75, 4.2],
    aabb: computeRotatedAABB([34.0, 0.0, 44.0], [4.2, 1.75, 4.2], 0),
    solidColliders: [
      { min: [32.1, 0.0, 42.1], max: [35.9, 0.34, 45.9] },
      { min: [33.55, 0.34, 43.55], max: [34.45, 1.75, 44.45] },
    ],
    surfaceTag: 'fountain_hazard',
    blocksGroundRoll: true,
    reactive: {
      kind: 'water_hazard',
      zoneCenter: [34.0, 0.2, 44.0],
      zoneRadius: 1.85,
      quickDropPosition: [34.0, 0.0, 39.8],
      penaltyStrokes: 1,
    },
  },
  {
    id: 'esc-z6-newspaper-kiosk-west',
    name: 'Zone 6 Vintage Green-Copper Midtown Newspaper Kiosk',
    type: 'hotdog_cart_umbrella',
    escapadePropType: 'newspaper_kiosk',
    zoneNumber: 6,
    zone: 'subway_plaza',
    position: [26.8, 0.0, 41.5],
    groundY: 0.0,
    rotationY: Math.PI * 0.5,
    localSize: [2.4, 2.95, 1.9],
    aabb: computeRotatedAABB([26.8, 0.0, 41.5], [2.4, 2.95, 1.9], Math.PI * 0.5),
    solidColliders: [
      { min: [25.85, 0.0, 40.3], max: [27.75, 2.95, 42.7] },
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'esc-z6-plaza-pigeons',
    name: 'Zone 6 Transit Square Scattering Pigeon Flock',
    type: 'pigeon_flock',
    escapadePropType: 'pigeon_flock',
    zoneNumber: 6,
    zone: 'subway_plaza',
    position: [38.8, 0.0, 38.5],
    groundY: 0.0,
    rotationY: -0.6,
    localSize: [2.2, 0.45, 2.2],
    aabb: computeRotatedAABB([38.8, 0.0, 38.5], [2.2, 0.45, 2.2], 0),
    solidColliders: [],
    surfaceTag: 'sidewalk_paver',
    blocksGroundRoll: false,
    reactive: {
      kind: 'pigeon_scatter',
      zoneCenter: [38.8, 0.25, 38.5],
      zoneRadius: 2.6,
    },
  },
  {
    id: 'esc-z6-subway-headhouse-portal',
    name: 'Zone 6 Ornamental Open-Throat Cast-Iron & Emerald-Glass Subway Headhouse',
    type: 'scaffolding_tunnel',
    escapadePropType: 'grand_subway_headhouse',
    zoneNumber: 6,
    zone: 'subway_plaza',
    position: [34.0, 0.0, 56.8],
    groundY: 0.0,
    rotationY: 0,
    localSize: [9.6, 3.85, 2.4],
    aabb: computeRotatedAABB([34.0, 0.0, 56.8], [9.6, 3.85, 2.4], 0),
    // True 9.6m Beaux-Arts open-throat transit kiosk: West & East cast-iron piers + overhead illuminated fascia lintel (8.84m clear entry, zero rear wall!)
    solidColliders: [
      { min: [29.22, 0.0, 55.6], max: [29.58, 3.85, 58.0] },
      { min: [38.42, 0.0, 55.6], max: [38.78, 3.85, 58.0] },
      { min: [29.22, 3.38, 55.6], max: [38.78, 3.85, 58.0] },
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: false,
    reactive: {
      kind: 'stairwell_brass_slide',
      zoneCenter: [34.0, -2.25, 62.0],
      zoneHalfExtents: [0.45, 0.85, 6.0],
      boostVelocity: [0.0, -4.6, 12.4],
    },
  },

  // --------------------------------------------------------------------------
  // ZONE 7: Vaulted Ceramic-Tile Subway Station Finale (-7.50m -> Golden Pin)
  // --------------------------------------------------------------------------
  {
    id: 'esc-z7-brass-turnstile-west',
    name: 'Zone 7 Mezzanine Open Brass Turnstile Bank West',
    type: 'brass_bollard',
    escapadePropType: 'brass_turnstile_gate',
    zoneNumber: 7,
    zone: 'courtyard_patio',
    position: [29.8, -7.5, 82.2],
    groundY: -7.5,
    rotationY: 0,
    localSize: [3.2, 1.05, 0.9],
    aabb: computeRotatedAABB([29.8, -7.5, 82.2], [3.2, 1.05, 0.9], 0),
    // Divided stainless/brass turnstile housings leaving center & gates passable!
    solidColliders: [
      { min: [28.2, -7.5, 81.8], max: [28.55, -6.45, 82.6] },
      { min: [31.05, -7.5, 81.8], max: [31.4, -6.45, 82.6] },
    ],
    surfaceTag: 'van_ramp_metal',
    blocksGroundRoll: false,
  },
  {
    id: 'esc-z7-brass-turnstile-east',
    name: 'Zone 7 Mezzanine Open Brass Turnstile Bank East',
    type: 'brass_bollard',
    escapadePropType: 'brass_turnstile_gate',
    zoneNumber: 7,
    zone: 'courtyard_patio',
    position: [38.2, -7.5, 82.2],
    groundY: -7.5,
    rotationY: 0,
    localSize: [3.2, 1.05, 0.9],
    aabb: computeRotatedAABB([38.2, -7.5, 82.2], [3.2, 1.05, 0.9], 0),
    solidColliders: [
      { min: [36.6, -7.5, 81.8], max: [36.95, -6.45, 82.6] },
      { min: [39.45, -7.5, 81.8], max: [39.8, -6.45, 82.6] },
    ],
    surfaceTag: 'van_ramp_metal',
    blocksGroundRoll: false,
  },
  {
    id: 'esc-z7-vintage-subway-car',
    name: 'Zone 7 Parked Vintage IRT Subway Train Car (Open Doors Walkthrough Tunnel!)',
    type: 'scaffolding_tunnel',
    escapadePropType: 'vintage_subway_car',
    zoneNumber: 7,
    zone: 'courtyard_patio',
    position: [34.0, -7.5, 96.5],
    groundY: -7.5,
    rotationY: 0,
    localSize: [3.1, 3.35, 13.6],
    aabb: computeRotatedAABB([34.0, -7.5, 96.5], [3.1, 3.35, 13.6], 0),
    // Open end vestibule doors (x: 32.85..35.15) AND open center sliding side doors (z: 95.3..97.7)!
    solidColliders: [
      { min: [32.45, -7.5, 89.7], max: [32.85, -4.35, 95.3] },
      { min: [32.45, -7.5, 97.7], max: [32.85, -4.35, 103.3] },
      { min: [35.15, -7.5, 89.7], max: [35.55, -4.35, 95.3] },
      { min: [35.15, -7.5, 97.7], max: [35.55, -4.35, 103.3] },
      { min: [32.45, -4.75, 89.7], max: [35.55, -4.15, 103.3] },
    ],
    surfaceTag: 'van_ramp_metal',
    blocksGroundRoll: false,
    reactive: {
      kind: 'subway_car_tunnel',
      zoneCenter: [34.0, -6.1, 96.5],
      zoneHalfExtents: [1.15, 1.35, 6.8],
      boostVelocity: [0.0, 0.0, 2.8],
      underpassClearHeight: 2.75,
      underpassClearWidth: 2.3,
    },
  },
  {
    id: 'esc-z7-mosaic-pillar-west-1',
    name: 'Zone 7 Mosaic Tile Station Column NW',
    type: 'brass_bollard',
    escapadePropType: 'subway_mosaic_pillar',
    zoneNumber: 7,
    zone: 'courtyard_patio',
    position: [26.2, -7.5, 90.5],
    groundY: -7.5,
    rotationY: 0,
    localSize: [0.78, 3.9, 0.78],
    aabb: computeRotatedAABB([26.2, -7.5, 90.5], [0.78, 3.9, 0.78], 0),
    solidColliders: [
      { min: [25.81, -7.5, 90.11], max: [26.59, -3.6, 90.89] },
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'esc-z7-mosaic-pillar-east-1',
    name: 'Zone 7 Mosaic Tile Station Column NE',
    type: 'brass_bollard',
    escapadePropType: 'subway_mosaic_pillar',
    zoneNumber: 7,
    zone: 'courtyard_patio',
    position: [41.8, -7.5, 90.5],
    groundY: -7.5,
    rotationY: 0,
    localSize: [0.78, 3.9, 0.78],
    aabb: computeRotatedAABB([41.8, -7.5, 90.5], [0.78, 3.9, 0.78], 0),
    solidColliders: [
      { min: [41.41, -7.5, 90.11], max: [42.19, -3.6, 90.89] },
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'esc-z7-mosaic-pillar-west-2',
    name: 'Zone 7 Mosaic Tile Station Column SW',
    type: 'brass_bollard',
    escapadePropType: 'subway_mosaic_pillar',
    zoneNumber: 7,
    zone: 'courtyard_patio',
    position: [26.2, -7.5, 103.5],
    groundY: -7.5,
    rotationY: 0,
    localSize: [0.78, 3.9, 0.78],
    aabb: computeRotatedAABB([26.2, -7.5, 103.5], [0.78, 3.9, 0.78], 0),
    solidColliders: [
      { min: [25.81, -7.5, 103.11], max: [26.59, -3.6, 103.89] },
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'esc-z7-mosaic-pillar-east-2',
    name: 'Zone 7 Mosaic Tile Station Column SE',
    type: 'brass_bollard',
    escapadePropType: 'subway_mosaic_pillar',
    zoneNumber: 7,
    zone: 'courtyard_patio',
    position: [41.8, -7.5, 103.5],
    groundY: -7.5,
    rotationY: 0,
    localSize: [0.78, 3.9, 0.78],
    aabb: computeRotatedAABB([41.8, -7.5, 103.5], [0.78, 3.9, 0.78], 0),
    solidColliders: [
      { min: [41.41, -7.5, 103.11], max: [42.19, -3.6, 103.89] },
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'esc-z7-station-oak-bench-west',
    name: 'Zone 7 Vintage Oak Waiting Bench West',
    type: 'subway_bench',
    escapadePropType: 'subway_bench',
    zoneNumber: 7,
    zone: 'courtyard_patio',
    position: [24.2, -7.5, 116.5],
    groundY: -7.5,
    rotationY: Math.PI * 0.5,
    localSize: [2.1, 0.88, 0.72],
    aabb: computeRotatedAABB([24.2, -7.5, 116.5], [2.1, 0.88, 0.72], Math.PI * 0.5),
    solidColliders: [
      { min: [23.84, -7.5, 115.45], max: [24.56, -6.62, 117.55] },
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
  {
    id: 'esc-z7-station-oak-bench-east',
    name: 'Zone 7 Vintage Oak Waiting Bench East',
    type: 'subway_bench',
    escapadePropType: 'subway_bench',
    zoneNumber: 7,
    zone: 'courtyard_patio',
    position: [43.8, -7.5, 116.5],
    groundY: -7.5,
    rotationY: -Math.PI * 0.5,
    localSize: [2.1, 0.88, 0.72],
    aabb: computeRotatedAABB([43.8, -7.5, 116.5], [2.1, 0.88, 0.72], -Math.PI * 0.5),
    solidColliders: [
      { min: [43.44, -7.5, 115.45], max: [44.16, -6.62, 117.55] },
    ],
    surfaceTag: 'masonry_wall',
    blocksGroundRoll: true,
  },
];

// ============================================================================
// 10. DECORATIVE PERGOLA, STRING LIGHTS, ROUTES, AUDIT STATIONS & QA GALLERY
// ============================================================================

export const ESCAPADE_TRATTORIA_PERGOLA: CourtyardPergolaSpec = {
  id: 'pergola-z4-overlook-trattoria',
  groundY: 16.5,
  boundsXZ: { minX: 57.5, maxX: 61.3, minZ: -43.5, maxZ: -35.5 },
  beamClearHeight: 3.1,
  rafterCount: 9,
  postPositions: [
    [57.6, 16.5, -43.4],
    [61.2, 16.5, -43.4],
    [57.6, 16.5, -35.6],
    [61.2, 16.5, -35.6],
  ],
};

export const ESCAPADE_STRING_LIGHT_SPANS: StringLightSpanSpec[] = [
  {
    id: 'esc-lights-z1-bodega',
    label: 'Zone 1 Mercer Bodega Festoon Lights',
    // Flush-anchored into Mercer Hardware East facade (-7.25) and Bodega Corner West facade (+7.25)
    startAnchor: [-7.24, 5.4, 8.0],
    endAnchor: [7.24, 5.4, 4.0],
    sagMeters: 0.55,
    bulbCount: 14,
  },
  {
    id: 'esc-lights-z3-rooftop-garden',
    label: 'Zone 3 Tenement Rooftop West Festoon Lights',
    // Flush-anchored into Clockwork Lofts South facade (-90.05) and Greenhouse Pergola North beam (-85.8)
    startAnchor: [20.0, 15.6, -90.04],
    endAnchor: [43.5, 15.35, -85.78],
    sagMeters: 0.65,
    bulbCount: 18,
  },
  {
    id: 'esc-lights-z3-rooftop-east',
    label: 'Zone 3 Botanical Pergola to Conservatory Towers Festoon Lights',
    // Flush-anchored into Greenhouse Pergola East beam (+46.2) and Conservatory Towers South facade (-90.05)
    startAnchor: [46.18, 15.35, -84.0],
    endAnchor: [54.0, 16.2, -90.04],
    sagMeters: 0.5,
    bulbCount: 12,
  },
  {
    id: 'esc-lights-z4-trattoria-summit',
    label: 'Zone 4 Overlook Trattoria Piazza Warm Bistro Lights',
    // Flush-anchored into Trattoria Pergola NW post cap ([57.6, 19.55, -43.4]) and Viaduct Palazzo West facade (+61.6)
    startAnchor: [57.6, 19.55, -43.4],
    endAnchor: [61.59, 20.2, -31.5],
    sagMeters: 0.55,
    bulbCount: 14,
  },
  {
    id: 'esc-lights-z6-midtown-plaza',
    label: 'Zone 6 Beaux-Arts Transit Plaza Festoons',
    // Flush-anchored into West Colonnade East facade (+23.95) and Telegraph Building West facade (+46.05)
    startAnchor: [23.96, 6.2, 41.0],
    endAnchor: [46.04, 6.2, 49.0],
    sagMeters: 0.8,
    bulbCount: 20,
  },
];

export const ESCAPADE_STRATEGIC_ROUTES: StrategicShotRouteSpec[] = [
  {
    id: 'esc-route-z1-van-or-street',
    name: 'Zone 1: Bodega Fairway Drive or Delivery Van Roof Boost',
    strokeNumber: 1,
    recommendedClub: 'driver',
    origin: [0.0, 0.0, 31.0],
    targetPoint: [0.0, 0.0, -21.0],
    summary: 'Drive straight down Mercer Ave or launch off the Bodega Delivery Van ramp toward the Cobblestone Climb.',
    keyPropIds: ['esc-z1-scaffolding-shed', 'esc-z1-delivery-van', 'esc-z1-hydrant-east'],
    zoneNumber: 1,
  },
  {
    id: 'esc-route-z2-terraced-climb',
    name: 'Zone 2: Terraced Cobblestone Climb & Burst Hydrant Surge',
    strokeNumber: 3,
    recommendedClub: 'driver',
    origin: [0.0, 0.0, -22.0],
    targetPoint: [0.0, 9.5, -83.5],
    summary: 'Pause safely on Flat Landing Plazas A (+3.1m) & B (+6.3m), or ride the left Burst Hydrant uphill surge to +9.5m.',
    keyPropIds: ['esc-z2-hillside-hydrant-boost', 'esc-z2-terrace-b-steam-grate'],
    zoneNumber: 2,
  },
  {
    id: 'esc-route-z3-rooftop-crossing',
    name: 'Zone 3: Tenement Water Towers, 30° Skylight Bank & Plank Bridge',
    strokeNumber: 6,
    recommendedClub: 'skimmer',
    origin: [18.5, 11.0, -84.0],
    targetPoint: [52.0, 12.5, -84.0],
    summary: 'Thread the Twin Timber Plank Bridge across the alley, bank off the angled skylight, or hit the HVAC Updraft Fan.',
    keyPropIds: ['esc-z3-water-tower-west', 'esc-z3-angled-skylight-bank', 'esc-z3-hvac-updraft-fan', 'esc-z3-greenhouse-pergola'],
    zoneNumber: 3,
  },
  {
    id: 'esc-route-z4-viaduct-summit',
    name: 'Zone 4: Scenic Stone Viaduct Ascent to +16.5m Trattoria Piazza',
    strokeNumber: 9,
    recommendedClub: 'driver',
    origin: [55.0, 12.5, -78.0],
    targetPoint: [55.0, 16.5, -36.0],
    summary: 'Climb the Romanesque Viaduct past the waist-high panoramic belvedere overlooking Zones 1–3 onto the +16.5m summit piazza.',
    keyPropIds: ['esc-z4-viaduct-triumphal-arch', 'esc-z4-curved-balustrade-bank'],
    zoneNumber: 4,
  },
  {
    id: 'esc-route-z5-copper-chute-or-sky-driver',
    name: 'Zone 5: Spiraling Copper Roof-Gutter Chute OR Sky Driver Plunge',
    strokeNumber: 12,
    recommendedClub: 'driver',
    origin: [55.0, 14.0, 0.0],
    targetPoint: [46.0, 2.0, 18.5],
    summary: 'Drop into the 1.42-turn Helical Copper Downspout (+14m -> +2m) or blast an unobstructed Sky Driver shot onto Grand Transit Plaza.',
    keyPropIds: ['esc-z5-glass-conservatory', 'esc-z5-rooftop-bell-tower', 'esc-z5-copper-spiral-chute'],
    zoneNumber: 5,
  },
  {
    id: 'esc-route-z6-headhouse-descent',
    name: 'Zone 6: Beaux-Arts Fountain Square into Cast-Iron Subway Stairwell',
    strokeNumber: 14,
    recommendedClub: 'skimmer',
    origin: [34.0, 0.0, 35.5],
    targetPoint: [34.0, -7.5, 78.0],
    summary: 'Skirt the Roundabout Fountain & Newspaper Kiosk, then funnel through the Open-Throat Cast-Iron Subway Headhouse.',
    keyPropIds: ['esc-z6-midtown-fountain', 'esc-z6-newspaper-kiosk-west', 'esc-z6-subway-headhouse-portal'],
    zoneNumber: 6,
  },
  {
    id: 'esc-route-z7-subway-golden-pin',
    name: 'Zone 7: Open Vintage Subway Car Walkthrough to the Golden Pin',
    strokeNumber: 16,
    recommendedClub: 'putter',
    origin: [34.0, -7.5, 79.0],
    targetPoint: [34.0, -7.5, 119.0],
    summary: 'Putt straight through the open Vintage IRT Subway Car doors (or flank along mosaic-pillared tile platforms) into the Golden Pin!',
    keyPropIds: ['esc-z7-brass-turnstile-west', 'esc-z7-vintage-subway-car'],
    zoneNumber: 7,
  },
];

export const ESCAPADE_AUDIT_CAMERA_STATIONS: AuditCameraStationSpec[] = QA_TELEPORT_ZONE_LIST.map(
  (tp) => ({
    id: `escapade_zone_${tp.zoneNumber}`,
    label: `Station Z${tp.zoneNumber}: ${tp.zoneName} (${tp.elevationLabel})`,
    groundY: tp.position[1],
    position: [tp.position[0], Number((tp.position[1] + 1.65).toFixed(3)), tp.position[2]],
    lookAt: tp.lookAt,
    fovDeg: tp.isSubterranean ? 54 : 50,
    expectedLandmarks: ESCAPADE_STRATEGIC_ROUTES.find((r) => r.zoneNumber === tp.zoneNumber)?.keyPropIds ?? [],
    zoneNumber: tp.zoneNumber,
    isSubterranean: tp.isSubterranean,
  }),
);

export const ESCAPADE_STREET_SCOUT_CAMERA: StreetScoutCameraSpec = {
  id: 'street_scout_peek',
  label: 'Grand Escapade Viaduct Belvedere Panoramic City Overlook',
  // Clear of viaduct arch piers (z = -59.2..-56.8) and 1.55m above the 0.85m belvedere balustrade (topY = 15.85m)!
  position: [50.4, 17.4, -60.5],
  lookAt: [18.0, 13.8, -82.0],
  fovDeg: 54,
  maxAllowedHeightY: 22.0,
};

export const GRAND_ESCAPADE_QA_PROP_SPECS: GrandEscapadeQaPropSpec[] = [
  {
    id: 'qa-prop-rooftop-water-tower',
    title: 'NYC Cedar Rooftop Water Tower',
    escapadePropType: 'rooftop_water_tower',
    fallbackPropType: 'scaffolding_tunnel',
    zoneNumber: 3,
    category: 'street-architecture',
    description: 'Coaxial cedar-stave rooftop tank with 4 galvanized tension hoops, conical cap, and grounded steel trestle legs (5.56m total height).',
    localSize: [2.7, 5.7, 2.7],
    localBoundsMin: [-1.35, 0.0, -1.35],
    localBoundsMax: [1.35, 5.7, 1.35],
  },
  {
    id: 'qa-prop-angled-skylight-bank',
    title: '30° Wired-Glass Rooftop Skylight Bank',
    escapadePropType: 'angled_skylight_bank',
    fallbackPropType: 'hotdog_cart_umbrella',
    zoneNumber: 3,
    category: 'dynamic-hazard',
    description: 'Pitched 29.8-degree bronze-mullioned rooftop skylight deflecting bank shots cleanly toward the alley plank bridge.',
    localSize: [3.2, 1.45, 1.9],
    localBoundsMin: [-1.6, 0.0, -0.95],
    localBoundsMax: [1.6, 1.45, 0.95],
  },
  {
    id: 'qa-prop-hvac-updraft-fan',
    title: 'Rooftop HVAC Updraft Boost Unit',
    escapadePropType: 'hvac_updraft_fan',
    fallbackPropType: 'subway_steam_grate',
    zoneNumber: 3,
    category: 'dynamic-hazard',
    description: 'Louvred galvanized rooftop blower unit creating a vertical/forward updraft column to skip across the tenement alley.',
    localSize: [2.1, 0.35, 2.1],
    localBoundsMin: [-1.05, 0.0, -1.05],
    localBoundsMax: [1.05, 0.35, 1.05],
  },
  {
    id: 'qa-prop-stone-viaduct-arch',
    title: 'Romanesque Stone Viaduct Portal Arch',
    escapadePropType: 'stone_viaduct_arch',
    fallbackPropType: 'scaffolding_tunnel',
    zoneNumber: 4,
    category: 'street-architecture',
    description: 'Rusticated limestone voussoir arch spanning the +15.0m panoramic viaduct belvedere.',
    localSize: [8.8, 5.2, 2.4],
    localBoundsMin: [-4.4, 0.0, -1.2],
    localBoundsMax: [4.4, 5.2, 1.2],
  },
  {
    id: 'qa-prop-rooftop-bell-tower',
    title: 'Penthouse Bronze Campanile Bell Tower',
    escapadePropType: 'rooftop_bell_tower',
    fallbackPropType: 'subway_entrance_portal',
    zoneNumber: 5,
    category: 'hero-obstacle',
    description: 'Limestone belfry housing a swinging cast-bronze bell that rings resonantly on ball impact.',
    localSize: [2.8, 6.4, 2.8],
    localBoundsMin: [-1.4, 0.0, -1.4],
    localBoundsMax: [1.4, 6.4, 1.4],
  },
  {
    id: 'qa-prop-copper-spiral-chute',
    title: 'Spiraling Patinated Copper Roof-Gutter Chute',
    escapadePropType: 'copper_spiral_chute',
    fallbackPropType: 'curved_gutter_corner',
    zoneNumber: 5,
    category: 'hero-obstacle',
    description: 'Unclamped 1.42-turn helical copper downspout plunging 12 vertical meters (+14.0m -> +2.0m) onto Zone 6 Arrival Terrace.',
    localSize: [7.8, 12.8, 7.8],
    localBoundsMin: [-3.9, 0.0, -3.9],
    localBoundsMax: [3.9, 12.8, 3.9],
  },
  {
    id: 'qa-prop-newspaper-kiosk',
    title: 'Beaux-Arts Green-Copper Newspaper Kiosk',
    escapadePropType: 'newspaper_kiosk',
    fallbackPropType: 'hotdog_cart_umbrella',
    zoneNumber: 6,
    category: 'courtyard-furniture',
    description: 'Midtown transit plaza newsstand with verdigris copper mansard cap, warm interior lamp glow, and periodical racks.',
    localSize: [2.4, 2.95, 1.9],
    localBoundsMin: [-1.2, 0.0, -0.95],
    localBoundsMax: [1.2, 2.95, 0.95],
  },
  {
    id: 'qa-prop-grand-subway-headhouse',
    title: 'Open-Throat Beaux-Arts Cast-Iron Subway Headhouse',
    escapadePropType: 'grand_subway_headhouse',
    fallbackPropType: 'scaffolding_tunnel',
    zoneNumber: 6,
    category: 'street-architecture',
    description: '9.6m-wide emerald cast-iron & frosted-glass transit kiosk with open 8.84m entry throat, illuminated SUBWAY lintel, and globe lamps.',
    localSize: [9.6, 3.85, 2.4],
    localBoundsMin: [-4.8, 0.0, -1.2],
    localBoundsMax: [4.8, 3.85, 1.2],
  },
  {
    id: 'qa-prop-brass-turnstile-gate',
    title: 'Subway Mezzanine Open Brass Turnstile Bank',
    escapadePropType: 'brass_turnstile_gate',
    fallbackPropType: 'brass_bollard',
    zoneNumber: 7,
    category: 'courtyard-furniture',
    description: 'Polished brass & brushed-steel transit fare gates framing the entrance to the -7.5m ceramic-tile concourse.',
    localSize: [3.2, 1.05, 0.9],
    localBoundsMin: [-1.6, 0.0, -0.45],
    localBoundsMax: [1.6, 1.05, 0.45],
  },
  {
    id: 'qa-prop-vintage-subway-car',
    title: 'Parked Vintage IRT Subway Car (Open Walkthrough Doors)',
    escapadePropType: 'vintage_subway_car',
    fallbackPropType: 'scaffolding_tunnel',
    zoneNumber: 7,
    category: 'hero-obstacle',
    description: 'Classic deep-olive & cream NYC subway coach with warm clerestory interior lighting and open end/side doors for through-putts.',
    localSize: [3.1, 3.35, 13.6],
    localBoundsMin: [-1.55, 0.0, -6.8],
    localBoundsMax: [1.55, 3.35, 6.8],
  },
  {
    id: 'qa-prop-subway-mosaic-pillar',
    title: 'Glazed Ceramic & Mosaic Station Column',
    escapadePropType: 'subway_mosaic_pillar',
    fallbackPropType: 'brass_bollard',
    zoneNumber: 7,
    category: 'street-architecture',
    description: 'Octagonal cream-and-emerald ceramic-tiled concourse column with mosaic station frieze.',
    localSize: [0.78, 3.9, 0.78],
    localBoundsMin: [-0.39, 0.0, -0.39],
    localBoundsMax: [0.39, 3.9, 0.39],
  },
];

// ============================================================================
// 11. EXPORTED GRAND ESCAPADE MASTER PLAN & COURSE REGISTRY HELPERS
// ============================================================================

export const GRAND_ESCAPADE_MASTER_PLAN: GrandEscapadeMasterPlan = {
  courseId: 'grand-escapade',
  holeNumber: 1,
  holeId: 'grand-crosstown-escapade',
  holeName: 'The Grand Crosstown Escapade',
  subtitle: 'Par 18 • 380m Continuous 7-Zone Rooftop-to-Subway Urban Golf Odyssey',
  par: 18,
  targetCenterlineMeters: 380,
  computedCenterlineMeters: ESCAPADE_COMPUTED_CENTERLINE_METERS,
  worldBoundsXZ: {
    minX: -36.0,
    maxX: 90.0,
    minZ: -116.0,
    maxZ: 142.0,
  },
  teePosition: ESCAPADE_TEE_POSITION,
  teeElevationY: 0.0,
  initialAimYaw: ESCAPADE_INITIAL_AIM_YAW,
  aPositionCrosswalk: ESCAPADE_A_POSITION_CROSSWALK,
  vanLoadingZone: ESCAPADE_VAN_LOADING_ZONE,
  cup: GRAND_ESCAPADE_CUP,
  fountainDropZone: [34.0, 0.0, 39.8],
  centerlineSegments: ESCAPADE_CENTERLINE_SEGMENTS,
  groundZones: ESCAPADE_GROUND_ZONES,
  gutters: ESCAPADE_GUTTERS,
  stormGrates: ESCAPADE_STORM_GRATES,
  curbs: ESCAPADE_STONE_CURBS,
  ramps: ESCAPADE_WALKABLE_RAMPS,
  perimeterBuildings: ESCAPADE_PERIMETER_BUILDINGS,
  skylineBackdrops: ESCAPADE_SKYLINE_BACKDROPS,
  architecturalWalls: ESCAPADE_ARCHITECTURAL_WALLS,
  courtyardPergola: ESCAPADE_TRATTORIA_PERGOLA,
  stringLightSpans: ESCAPADE_STRING_LIGHT_SPANS,
  props: ESCAPADE_COURSE_PROPS,
  strategicRoutes: ESCAPADE_STRATEGIC_ROUTES,
  auditStations: ESCAPADE_AUDIT_CAMERA_STATIONS,
  streetScoutCamera: ESCAPADE_STREET_SCOUT_CAMERA,
  // Seated at y = -8.50m strictly below Zone 7's -7.50m subterranean subway floor so it never slices underground rooms!
  outerGroundSkirt: {
    boundsXZ: { minX: -240, maxX: 280, minZ: -320, maxZ: 340 },
    topY: -8.5,
  },
  zones: GRAND_ESCAPADE_ZONES,
  qaTeleportZones: QA_TELEPORT_ZONES,
  qaTeleportZoneList: QA_TELEPORT_ZONE_LIST,
  flyoverSplinePoints: FLYOVER_SPLINE_POINTS,
  flyoverLookAtPoints: FLYOVER_LOOKAT_POINTS,
  copperChuteSpec: COPPER_SPIRAL_CHUTE_SPEC,
  subwayStationVault: SUBWAY_STATION_VAULT_SPEC,
  qaGalleryPropSpecs: GRAND_ESCAPADE_QA_PROP_SPECS,
};

/**
 * Returns the canonical `CourseMasterPlan` for `'grand-escapade'` (default Stage 2 flagship)
 * or `'classic'` (immutable Stage 1 Hole 1: 5th & Mercer).
 */
export function getMasterPlanByCourseId(
  courseId: CourseId = DEFAULT_ACTIVE_COURSE_ID,
): CourseMasterPlan {
  return courseId === 'classic' ? COURSE_MASTER_PLAN : GRAND_ESCAPADE_MASTER_PLAN;
}

/**
 * Resolves `CourseId` from URL query parameters (`?course=classic` vs default `'grand-escapade'`).
 * If `?qaTeleportZone=1..7` is present without an explicit `?course=classic`, resolves `'grand-escapade'`.
 */
export function resolveCourseIdFromSearchParams(
  search?: string | URLSearchParams | null,
): CourseId {
  if (!search) return DEFAULT_ACTIVE_COURSE_ID;
  const params =
    typeof search === 'string' ? new URLSearchParams(search) : search;
  const raw = params.get('course')?.trim().toLowerCase();
  if (raw === 'classic' || raw === 'hole1' || raw === 'mercer') {
    return 'classic';
  }
  return 'grand-escapade';
}

/**
 * Resolves a deterministic `?qaTeleportZone=1..7` anchor (`null` if unset or out of range).
 */
export function resolveQaTeleportZone(
  zoneParam: number | string | null | undefined,
): QaTeleportZoneSpec | null {
  if (zoneParam === null || zoneParam === undefined || zoneParam === '') {
    return null;
  }
  const parsed =
    typeof zoneParam === 'number' ? zoneParam : Number.parseInt(String(zoneParam), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 7) {
    return null;
  }
  return QA_TELEPORT_ZONES[parsed as GrandEscapadeZoneNumber] ?? null;
}

/**
 * Returns true when world position `[x, y, z]` is inside the subterranean Subway Station Finale
 * (`z >= 62.0` and `y < -0.5m`), enabling subterranean vault camera ceiling clamp & warm station lighting.
 */
export function isSubterraneanSubwayPosition(pos: Vec3Tuple): boolean {
  return pos[2] >= 62.0 && pos[1] < -0.5 && pos[0] >= 20.0 && pos[0] <= 48.0;
}

/**
 * Identifies which of the 7 Grand Escapade zones contains (or is closest to) world position `pos`.
 */
export function getEscapadeZoneAtPosition(pos: Vec3Tuple): GrandEscapadeZoneSpec {
  const [x, y, z] = pos;
  if (isSubterraneanSubwayPosition(pos) || z >= 68.0) {
    return GRAND_ESCAPADE_ZONES[6]; // Zone 7
  }
  // In the Zone 5 (+14m roof) / Zone 6 (+2m arrival terrace) XZ overlap (z = 7.8..16.0), separate by elevation!
  if (z >= 7.8 && z <= 24.0 && x >= 23.0 && x <= 62.0 && y <= 3.5) {
    return GRAND_ESCAPADE_ZONES[5]; // Zone 6
  }
  for (const zone of GRAND_ESCAPADE_ZONES) {
    const b = zone.chunkBoundsXZ;
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
      if (zone.zoneNumber === 7 && y >= -0.5) continue;
      return zone;
    }
  }
  // Nearest zone center fallback
  let best = GRAND_ESCAPADE_ZONES[0];
  let bestDist = Infinity;
  for (const zone of GRAND_ESCAPADE_ZONES) {
    const cx = (zone.chunkBoundsXZ.minX + zone.chunkBoundsXZ.maxX) * 0.5;
    const cz = (zone.chunkBoundsXZ.minZ + zone.chunkBoundsXZ.maxZ) * 0.5;
    const d = distance2D([x, z], [cx, cz]);
    if (d < bestDist) {
      bestDist = d;
      best = zone;
    }
  }
  return best;
}

/**
 * Returns the active chunk neighborhood (`zoneNumber[]`) that should be mounted/simulated
 * when the ball or camera is at `pos`, keeping render/physics load well above 60 FPS!
 */
export function getActiveEscapadeZonesForPosition(
  pos: Vec3Tuple,
): GrandEscapadeZoneNumber[] {
  return getEscapadeZoneAtPosition(pos).activeChunkNeighbors;
}

export function getEscapadeGroundElevationAt(x: number, z: number): number {
  return getMasterPlanGroundElevationAt(x, z, GRAND_ESCAPADE_MASTER_PLAN);
}

export function getEscapadeSurfaceTagAt(x: number, z: number): PhysicsSurfaceTag {
  return getMasterPlanSurfaceTagAt(x, z, GRAND_ESCAPADE_MASTER_PLAN);
}

// ============================================================================
// 12. MONOTONIC CENTERLINE ARC-LENGTH DISTANCE & FORWARD TANGENT YAW HELPERS
// ============================================================================

export interface CourseCenterlineProjection {
  /** Index of closest segment in `plan.centerlineSegments` */
  segmentIndex: number;
  /** Local parameter `t` in `[0, 1]` along the closest segment */
  segmentT: number;
  /** Projected 2D point `[x, z]` on the centerline */
  closestXZ: Vec2Tuple;
  /** Unit forward 2D tangent `[tx, tz]` at `closestXZ` */
  tangentXZ: Vec2Tuple;
  /** Distance `[0 .. totalLengthMeters]` traveled from Tee along the centerline */
  traveledMeters: number;
  /** Remaining centerline arc-length `[totalLengthMeters .. 0]` from `closestXZ` to the Cup */
  remainingArcMeters: number;
  /** Total centerline length of the course (`380.0m` Grand Escapade, `102.0m` Classic) */
  totalLengthMeters: number;
  /** Perpendicular 2D distance from `pos` to `closestXZ` */
  lateralOffsetMeters: number;
}

function projectOntoSingleSegment(
  seg: CenterlineSegmentSpec,
  px: number,
  pz: number,
): { closestXZ: Vec2Tuple; tangentXZ: Vec2Tuple; t: number; distSq: number } {
  if (
    seg.kind === 'arc_right_90' &&
    seg.arcPivotXZ &&
    seg.arcRadius !== undefined &&
    seg.startAngleRad !== undefined &&
    seg.endAngleRad !== undefined
  ) {
    const [cx, cz] = seg.arcPivotXZ;
    const r = seg.arcRadius;
    const rawAngle = Math.atan2(pz - cz, px - cx);
    const a0 = seg.startAngleRad;
    const a1 = seg.endAngleRad;
    const minA = Math.min(a0, a1);
    const maxA = Math.max(a0, a1);
    // Normalize angle near [minA, maxA]
    let bestAngle = rawAngle;
    while (bestAngle < minA - Math.PI) bestAngle += Math.PI * 2;
    while (bestAngle > maxA + Math.PI) bestAngle -= Math.PI * 2;
    const clampedAngle = Math.max(minA, Math.min(maxA, bestAngle));
    const span = a1 - a0;
    const t = Math.abs(span) > 1e-9 ? (clampedAngle - a0) / span : 0;
    const qx = cx + Math.cos(clampedAngle) * r;
    const qz = cz + Math.sin(clampedAngle) * r;
    const dirSign = span >= 0 ? 1 : -1;
    const tx = -Math.sin(clampedAngle) * dirSign;
    const tz = Math.cos(clampedAngle) * dirSign;
    const dx = px - qx;
    const dz = pz - qz;
    return {
      closestXZ: [qx, qz],
      tangentXZ: [tx, tz],
      t: Math.max(0, Math.min(1, t)),
      distSq: dx * dx + dz * dz,
    };
  }

  const [sx, sz] = seg.startXZ;
  const [ex, ez] = seg.endXZ;
  const vx = ex - sx;
  const vz = ez - sz;
  const lenSq = vx * vx + vz * vz;
  const len = Math.sqrt(lenSq);
  const t =
    lenSq > 1e-9
      ? Math.max(0, Math.min(1, ((px - sx) * vx + (pz - sz) * vz) / lenSq))
      : 0;
  const qx = sx + vx * t;
  const qz = sz + vz * t;
  const tx = len > 1e-9 ? vx / len : 0;
  const tz = len > 1e-9 ? vz / len : -1;
  const dx = px - qx;
  const dz = pz - qz;
  return {
    closestXZ: [qx, qz],
    tangentXZ: [tx, tz],
    t,
    distSq: dx * dx + dz * dz,
  };
}

/**
 * Samples the exact 2D `[x, z]` world coordinate along `plan.centerlineSegments`
 * at cumulative arc-length `distanceFromTeeMeters` (`[0 .. totalLengthMeters]`).
 */
export function sampleCourseCenterlineAtDistance(
  plan: CourseMasterPlan,
  distanceFromTeeMeters: number,
): Vec2Tuple {
  const segs = plan.centerlineSegments;
  if (segs.length === 0) {
    return [plan.cup.position[0], plan.cup.position[2]];
  }
  const clampedS = Math.max(0, distanceFromTeeMeters);
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const nextAcc = acc + seg.lengthMeters;
    if (clampedS <= nextAcc || i === segs.length - 1) {
      const localT =
        seg.lengthMeters > 1e-9
          ? Math.max(0, Math.min(1, (clampedS - acc) / seg.lengthMeters))
          : 1;
      if (
        seg.kind === 'arc_right_90' &&
        seg.arcPivotXZ &&
        seg.arcRadius !== undefined &&
        seg.startAngleRad !== undefined &&
        seg.endAngleRad !== undefined
      ) {
        const angle =
          seg.startAngleRad + (seg.endAngleRad - seg.startAngleRad) * localT;
        return [
          seg.arcPivotXZ[0] + Math.cos(angle) * seg.arcRadius,
          seg.arcPivotXZ[1] + Math.sin(angle) * seg.arcRadius,
        ];
      }
      return [
        seg.startXZ[0] + (seg.endXZ[0] - seg.startXZ[0]) * localT,
        seg.startXZ[1] + (seg.endXZ[1] - seg.startXZ[1]) * localT,
      ];
    }
    acc = nextAcc;
  }
  const last = segs[segs.length - 1];
  return [last.endXZ[0], last.endXZ[1]];
}

/**
 * Projects any 3D ball/camera position `pos` onto `plan.centerlineSegments`,
 * returning traveled arc-length, remaining centerline distance to the pin, and local forward tangent.
 */
export function projectPointOntoCourseCenterline(
  plan: CourseMasterPlan,
  pos: Vec3Tuple,
): CourseCenterlineProjection {
  const segs = plan.centerlineSegments;
  const totalLengthMeters = segs.reduce((sum, seg) => sum + seg.lengthMeters, 0);
  if (segs.length === 0) {
    const dCup = Math.hypot(
      pos[0] - plan.cup.position[0],
      pos[2] - plan.cup.position[2],
    );
    return {
      segmentIndex: 0,
      segmentT: 0,
      closestXZ: [plan.cup.position[0], plan.cup.position[2]],
      tangentXZ: [0, -1],
      traveledMeters: 0,
      remainingArcMeters: dCup,
      totalLengthMeters: dCup,
      lateralOffsetMeters: dCup,
    };
  }

  let bestIdx = 0;
  let bestT = 0;
  let bestClosest: Vec2Tuple = [segs[0].startXZ[0], segs[0].startXZ[1]];
  let bestTangent: Vec2Tuple = [0, -1];
  let bestTraveled = 0;
  let bestDistSq = Infinity;
  let acc = 0;

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const proj = projectOntoSingleSegment(seg, pos[0], pos[2]);
    if (proj.distSq < bestDistSq) {
      bestDistSq = proj.distSq;
      bestIdx = i;
      bestT = proj.t;
      bestClosest = proj.closestXZ;
      bestTangent = proj.tangentXZ;
      bestTraveled = acc + proj.t * seg.lengthMeters;
    }
    acc += seg.lengthMeters;
  }

  const remainingArcMeters = Math.max(0, totalLengthMeters - bestTraveled);
  return {
    segmentIndex: bestIdx,
    segmentT: bestT,
    closestXZ: bestClosest,
    tangentXZ: bestTangent,
    traveledMeters: bestTraveled,
    remainingArcMeters,
    totalLengthMeters,
    lateralOffsetMeters: Math.sqrt(bestDistSq),
  };
}

/**
 * Computes true remaining course distance to the Pin (`380.0m -> 0.0m` on Grand Escapade,
 * `102.0m -> 0.0m` on Classic Hole 1) along `plan.centerlineSegments`, blending smoothly
 * to exact 2D Euclidean cup distance inside the final 35m approach/green!
 */
export function computeRemainingCourseDistance(
  plan: CourseMasterPlan,
  pos: Vec3Tuple,
): number {
  const directCupDist = Math.hypot(
    pos[0] - plan.cup.position[0],
    pos[2] - plan.cup.position[2],
  );
  if (directCupDist <= plan.cup.cupRadius * 0.25) {
    return 0;
  }

  const proj = projectPointOntoCourseCenterline(plan, pos);
  const blendWindowMeters = 35.0;
  if (proj.remainingArcMeters >= blendWindowMeters) {
    return Number(proj.remainingArcMeters.toFixed(2));
  }

  const u = Math.max(0, Math.min(1, 1 - proj.remainingArcMeters / blendWindowMeters));
  const smoothAlpha = u * u * (3 - 2 * u);
  const blended =
    (1 - smoothAlpha) * proj.remainingArcMeters + smoothAlpha * directCupDist;
  return Number(blended.toFixed(2));
}

/**
 * Computes smooth forward-along-course aim/camera yaw (`0` = North `-Z`, `+PI/2` = East `+X`,
 * `±PI` = South `+Z`, `-PI/2` = West `-X`, matching `[Math.sin(yaw), -Math.cos(yaw)]`)
 * using a centerline lookahead target so multi-turn horseshoe courses NEVER whip backwards toward the pin!
 */
export function computeForwardCourseYaw(
  plan: CourseMasterPlan,
  pos: Vec3Tuple,
  lookaheadMeters = 18.0,
): number {
  const cupDX = plan.cup.position[0] - pos[0];
  const cupDZ = plan.cup.position[2] - pos[2];
  const directCupDist = Math.hypot(cupDX, cupDZ);
  const directPinYaw =
    directCupDist > 1e-4 ? Math.atan2(cupDX, -cupDZ) : plan.initialAimYaw;

  const proj = projectPointOntoCourseCenterline(plan, pos);
  if (proj.remainingArcMeters <= 16.0 || directCupDist <= 14.0) {
    return directPinYaw;
  }

  const stepAhead = Math.max(6.0, lookaheadMeters);
  const targetS = Math.min(proj.totalLengthMeters, proj.traveledMeters + stepAhead);
  const aheadXZ =
    targetS >= proj.totalLengthMeters - 0.05
      ? ([plan.cup.position[0], plan.cup.position[2]] as Vec2Tuple)
      : sampleCourseCenterlineAtDistance(plan, targetS);

  let dx = aheadXZ[0] - pos[0];
  let dz = aheadXZ[1] - pos[2];
  if (Math.hypot(dx, dz) < 0.5) {
    dx = proj.tangentXZ[0];
    dz = proj.tangentXZ[1];
  }
  const centerlineYaw = Math.atan2(dx, -dz);

  // Smoothly blend from centerline lookahead yaw to direct pin yaw across remainingArc in [32m .. 16m]
  if (proj.remainingArcMeters < 32.0) {
    const u = Math.max(0, Math.min(1, (32.0 - proj.remainingArcMeters) / 16.0));
    const alpha = u * u * (3 - 2 * u);
    let delta = directPinYaw - centerlineYaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    let blendedYaw = centerlineYaw + delta * alpha;
    while (blendedYaw > Math.PI) blendedYaw -= Math.PI * 2;
    while (blendedYaw < -Math.PI) blendedYaw += Math.PI * 2;
    return blendedYaw;
  }

  return centerlineYaw;
}
