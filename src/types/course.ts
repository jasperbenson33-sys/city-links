export type Vec2Tuple = [number, number];
export type Vec3Tuple = [number, number, number];

export interface AABB3D {
  min: Vec3Tuple;
  max: Vec3Tuple;
}

export interface OBB2D {
  centerXZ: Vec2Tuple;
  halfExtentsXZ: Vec2Tuple;
  /** Right-handed Three.js rotation around +Y in radians */
  rotationY: number;
  /** Unit local +X axis in world XZ: [cos(ry), -sin(ry)] */
  axisX: Vec2Tuple;
  /** Unit local +Z axis in world XZ: [sin(ry), cos(ry)] */
  axisZ: Vec2Tuple;
}

/**
 * Canonical Local & World Coordinate Frame ("Hole 1: 5th & Mercer"):
 * - +Y = Up ([0, 1, 0])
 * - +Z = Local Forward ([0, 0, 1]) / World South
 * - -Z = World North (Leg 1 along 5th Ave from Tee toward Mercer Corner)
 * - +X = Local Right ([1, 0, 0]) / World East (Leg 2 along Mercer St into Courtyard Green)
 * - -X = World West
 * - Every local prop/building mesh sits flush on local y = 0.00m at its resting datum.
 */
export const ELEVATIONS = {
  /** Recessed storm-drain concrete channel (-2cm below road asphalt) */
  GUTTER_CHANNEL_Y: -0.02,
  /** Main street asphalt surface datum */
  ROAD_ASPHALT_Y: 0.0,
  /** Continuous 15cm stone curb height */
  CURB_HEIGHT: 0.15,
  /** Raised limestone/brick sidewalks, corner plaza aprons, and South Subway Plaza */
  SIDEWALK_Y: 0.15,
  /** Elevated sunlit AstroTurf Pocket-Park Courtyard Green & Café Terrace */
  COURTYARD_GREEN_Y: 0.6,
  /** Courtyard stone fountain basin floor (+0.60m + 0.02m) */
  FOUNTAIN_BASIN_Y: 0.62,
  /** Courtyard stone fountain water surface (+0.60m + 0.18m) */
  FOUNTAIN_WATER_Y: 0.78,
  /** Courtyard stone fountain coping rim (+0.60m + 0.28m) */
  FOUNTAIN_RIM_Y: 0.88,

  // Compatibility aliases while downstream physics/store workers migrate
  STREET_Y: 0.0,
  GUTTER_TROUGH_Y: -0.02,
  PARKLET_GREEN_Y: 0.6,
  TERRACE_Y: 0.6,
  WATER_BASIN_Y: 0.62,
  WATER_SURFACE_Y: 0.78,
  WATER_RIM_Y: 0.88,
} as const;

/** Exact resting zone elevations allowed for grounded props & structures */
export type AllowedGroundDatum = -0.02 | 0 | 0.15 | 0.6;

export type CardinalDirection = 'north' | 'east' | 'south' | 'west';

export type FlagColor = 'red' | 'yellow' | 'blue' | 'purple' | 'green';

export const FLAG_COLORS: readonly FlagColor[] = [
  'red',
  'yellow',
  'blue',
  'purple',
  'green',
] as const;

export interface FlagColorMeta {
  color: FlagColor;
  label: string;
  hex: string;
  lightHex: string;
  emoji: string;
}

export const FLAG_COLOR_META: Record<FlagColor, FlagColorMeta> = {
  red: {
    color: 'red',
    label: 'Red',
    hex: '#EF4444',
    lightHex: '#FCA5A5',
    emoji: '🟥',
  },
  yellow: {
    color: 'yellow',
    label: 'Yellow',
    hex: '#FACC15',
    lightHex: '#FEF08A',
    emoji: '🟨',
  },
  blue: {
    color: 'blue',
    label: 'Blue',
    hex: '#3B82F6',
    lightHex: '#93C5FD',
    emoji: '🟦',
  },
  purple: {
    color: 'purple',
    label: 'Purple',
    hex: '#A855F7',
    lightHex: '#D8B4FE',
    emoji: '🟪',
  },
  green: {
    color: 'green',
    label: 'Green',
    hex: '#22C55E',
    lightHex: '#86EFAC',
    emoji: '🟩',
  },
};

export type PhysicsSurfaceTag =
  | 'road_asphalt'
  | 'storm_gutter'
  | 'stone_curb'
  | 'sidewalk_paver'
  | 'subway_brick_plaza'
  | 'crosswalk_landing'
  | 'loading_zone_asphalt'
  | 'courtyard_ramp'
  | 'courtyard_paver'
  | 'putting_green_turf'
  | 'green_fringe_collar'
  | 'patio_rough'
  | 'fountain_hazard'
  | 'awning_cushion'
  | 'umbrella_bounce'
  | 'van_ramp_metal'
  | 'van_roof_deck'
  | 'masonry_wall';

export interface CenterlineSegmentSpec {
  id: string;
  kind: 'straight' | 'arc_right_90';
  label: string;
  startXZ: Vec2Tuple;
  endXZ: Vec2Tuple;
  arcPivotXZ?: Vec2Tuple;
  arcRadius?: number;
  startAngleRad?: number;
  endAngleRad?: number;
  lengthMeters: number;
}

export interface GroundSurfaceZoneSpec {
  id: string;
  label: string;
  surfaceTag: PhysicsSurfaceTag;
  boundsXZ: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  /** Top resting surface elevation in world Y */
  topY: number;
  /** Slab visual/collider thickness extending downward from topY */
  slabThickness: number;
  friction: number;
  restitution: number;
  /** Linear roll damping applied when ball rolls on this zone */
  rollDamping: number;
  aabb: AABB3D;
}

export interface StormGutterTrackSpec {
  id: string;
  label: string;
  kind: 'straight' | 'corner_90';
  /** Channel width in meters (~0.45m) */
  width: number;
  /** Recessed channel floor elevation (-0.02m) */
  channelY: number;
  /** Depth below adjacent 0.00m road asphalt (0.02m) */
  depthBelowRoad: number;
  /** Adjacent stone curb top elevation (+0.15m) */
  adjacentCurbTopY: number;
  /** Straight segment endpoints in world [x, channelY, z] */
  start?: Vec3Tuple;
  end?: Vec3Tuple;
  /** 90-degree corner curve parameters in world XZ: x = pivotX + R*cos(a), z = pivotZ + R*sin(a) */
  arcPivot?: Vec3Tuple;
  arcRadius?: number;
  startAngleRad?: number;
  endAngleRad?: number;
  /** Optional hydrant-fed water boost velocity vector [vx, vy, vz] along this gutter */
  waterBoostVelocity?: Vec3Tuple;
  aabb: AABB3D;
}

export interface StormDrainGrateSpec {
  id: string;
  gutterId: string;
  /** World position [x, -0.02, z] flush in storm-drain gutter channel */
  position: Vec3Tuple;
  size: Vec3Tuple;
  rotationY: number;
  aabb: AABB3D;
}

export interface StoneCurbSegmentSpec {
  id: string;
  label: string;
  kind: 'straight' | 'beveled_45' | 'curved_90';
  bottomY: number;
  topY: number;
  height: number;
  /** World center [x, midY, z] for straight/beveled curbs */
  center: Vec3Tuple;
  /** Local box size [widthX, heightY, depthZ] */
  size: Vec3Tuple;
  rotationY: number;
  bevelAngleDeg?: number;
  arcPivotXZ?: Vec2Tuple;
  arcRadius?: number;
  startAngleRad?: number;
  endAngleRad?: number;
  restitution: number;
  friction: number;
  aabb: AABB3D;
}

export interface WalkableRampSpec {
  id: string;
  label: string;
  surfaceTag: PhysicsSurfaceTag;
  boundsXZ: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  bottomY: number;
  topY: number;
  climbDirection: CardinalDirection;
  slopeAngleDeg: number;
  slabThickness: number;
  friction: number;
  restitution: number;
  aabb: AABB3D;
}

export type BuildingPaletteId =
  | 'terracotta'
  | 'ochre'
  | 'cream_limestone'
  | 'warm_brick'
  | 'sage_trim';

export type BuildingRoofStyle =
  | 'hipped_terracotta_tile'
  | 'cornice_parapet'
  | 'mansard_slate'
  | 'campanile_spire';

export interface PerimeterBuildingSpec {
  id: string;
  name: string;
  ring: 'primary_facade' | 'skyline_backdrop';
  corridorSector:
    | 'south_subway_backstop'
    | 'west_5th_ave'
    | 'north_mercer_bend'
    | 'north_courtyard'
    | 'east_courtyard_backstop'
    | 'south_courtyard'
    | 'south_mercer_se_corner'
    | 'east_5th_ave';
  /** Base ground elevation (0.00m so buildings extend seamlessly below any sidewalk lip) */
  groundY: number;
  boundsXZ: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  /** Total facade/roof height in meters (10m-16m primary, 18m-26m backdrop skyline) */
  height: number;
  stories: 3 | 4 | 5 | 6;
  palette: BuildingPaletteId;
  trimPalette: BuildingPaletteId;
  roofStyle: BuildingRoofStyle;
  /** Primary inward-facing street orientation for shopfronts, balconies & shutters */
  frontFace: CardinalDirection;
  shopfrontBayCount: number;
  windowColumns: number;
  hasShutters: boolean;
  shutterHex: string;
  julietBalconyCount: number;
  hasFireEscape: boolean;
  shopfrontAwningHex?: string;
  /** True if the flush left-sidewalk Scaffolding Shed bolts directly onto this facade */
  isScaffoldingHost?: boolean;
  aabb: AABB3D;
}

export interface ArchitecturalWallSpec {
  id: string;
  label: string;
  kind:
    | 'stone_retaining_wall'
    | 'wrought_iron_planter_wall'
    | 'subway_stair_parapet'
    | 'courtyard_boundary_wall';
  groundY: number;
  topY: number;
  center: Vec3Tuple;
  size: Vec3Tuple;
  rotationY: number;
  surfaceTag: PhysicsSurfaceTag;
  restitution: number;
  aabb: AABB3D;
}

export interface StringLightSpanSpec {
  id: string;
  label: string;
  startAnchor: Vec3Tuple;
  endAnchor: Vec3Tuple;
  sagMeters: number;
  bulbCount: number;
}

export interface CourtyardPergolaSpec {
  id: string;
  groundY: number;
  boundsXZ: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  beamClearHeight: number;
  rafterCount: number;
  postPositions: Vec3Tuple[];
}

export interface HoleCupSpec {
  id: string;
  flagColor: FlagColor;
  /** World cup center [x, +0.60, z] flush on sunlit courtyard putting green */
  position: Vec3Tuple;
  elevationY: number;
  cupRadius: number;
  cupDepth: number;
  /** Obstacle-free AstroTurf green radius around cup (>= 1.5m) */
  apronRadius: number;
  pinHeight: number;
}

export interface CrosswalkLandingPadSpec {
  id: string;
  /** Ideal A-Position target [x, 0.00, z] for Tee shots setting up the Dogleg Right approach */
  center: Vec3Tuple;
  boundsXZ: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  stripeCount: number;
  elevationY: number;
}

export interface VanLoadingZoneSpec {
  id: string;
  boundsXZ: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  elevationY: number;
  stripeAngleDeg: number;
}

export type PropType =
  | 'scaffolding_tunnel'
  | 'delivery_box_van'
  | 'hazard_cone'
  | 'overhanging_street_tree'
  | 'hotdog_cart_umbrella'
  | 'fire_hydrant_jet'
  | 'curved_gutter_corner'
  | 'subway_steam_grate'
  | 'fountain_water_hazard'
  | 'bistro_umbrella_set'
  | 'planter_hedge_rough'
  | 'subway_entrance_portal'
  | 'brass_bollard'
  | 'subway_bench'
  | 'menu_a_frame_board'
  | 'trash_receptacle'
  | 'street_tree'
  | 'street_lamp'
  | 'pigeon_flock';

export interface PropReactiveSpec {
  kind:
    | 'awning_cushion_bank'
    | 'umbrella_trampoline'
    | 'hydrant_water_jet'
    | 'gutter_corner_bank'
    | 'steam_updraft'
    | 'scaffolding_underpass'
    | 'van_ramp_and_roof_launch'
    | 'water_hazard'
    | 'patio_rough_damping'
    | 'pigeon_scatter';
  zoneCenter: Vec3Tuple;
  zoneHalfExtents?: Vec3Tuple;
  zoneRadius?: number;
  restitution?: number;
  boostVelocity?: Vec3Tuple;
  cycleSeconds?: number;
  dutyCycle?: number;
  underpassClearHeight?: number;
  underpassClearWidth?: number;
  quickDropPosition?: Vec3Tuple;
  penaltyStrokes?: number;
}

export interface ScaffoldingShedMetadata {
  hostBuildingId: string;
  hostFacadeX: number;
  wallGapMeters: number;
  clearHeightMeters: number;
  clearWidthMeters: number;
  tunnelLengthMeters: number;
}

export interface DeliveryVanRampMetadata {
  loadingZoneId: string;
  rampBottomZ: number;
  rampTopZ: number;
  rampBottomY: number;
  rampTopY: number;
  rampWidth: number;
  rampLaunchAngleDeg: number;
  roofDeckTopY: number;
  roofRestitution: number;
}

export interface OverhangingTreeMetadata {
  pitCenter: Vec3Tuple;
  trunkAabb: AABB3D;
  canopyAabb: AABB3D;
  blocksRightAerialXRange: Vec2Tuple;
  leavesLeftCrosswalkOpenXRange: Vec2Tuple;
}

export interface HotdogAwningMetadata {
  pitchDeg: number;
  restitution: number;
  /** World-space center of the pitched striped canvas awning */
  awningCenter: Vec3Tuple;
  awningSize: Vec3Tuple;
  /** Exact unit normal of the 28-deg pitched awning in world space */
  worldNormal: Vec3Tuple;
  /** Expected A-Position wedge incoming velocity at awning impact */
  designIncomingVelocity: Vec3Tuple;
  /** Reflected outgoing velocity toward the Cup */
  designReflectedVelocity: Vec3Tuple;
  /** Landing coordinate on +0.60m green */
  predictedGreenLandingXZ: Vec2Tuple;
  /** Final cushioned rollout coordinate within <= 2.0m of Cup */
  predictedStopXZ: Vec2Tuple;
}

export interface HydrantGutterBoostMetadata {
  nearestGrateId: string;
  gratePosition: Vec3Tuple;
  distanceToGrateMeters: number;
  curvedGutterId: string;
  streamImpactPoint: Vec3Tuple;
  gutterExitBoostVector: Vec3Tuple;
}

export interface SteamGrateLiftMetadata {
  utilityBayBoundsXZ: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  cycleSeconds: number;
  activeSeconds: number;
  upwardImpulseVelocity: Vec3Tuple;
  clearsFountainId: string;
  targetFrontFringePoint: Vec3Tuple;
}

export interface PlacedProp {
  id: string;
  name: string;
  type: PropType;
  /** Zone label ('road', 'sidewalk', 'subway_plaza', 'courtyard', 'gutter') */
  zone:
    | 'road'
    | 'sidewalk'
    | 'subway_plaza'
    | 'courtyard_green'
    | 'courtyard_patio'
    | 'gutter';
  /** World position [x, groundY, z] with local y = 0 flush on groundY */
  position: Vec3Tuple;
  /** Exact resting ground elevation (-0.02, 0.00, 0.15, or 0.60) */
  groundY: AllowedGroundDatum;
  /** Right-handed Three.js Y-axis rotation in radians */
  rotationY: number;
  /** Local bounding dimensions [widthX, heightY, depthZ] with local y in [0, heightY] */
  localSize: Vec3Tuple;
  /** Overall world-space enclosing AABB */
  aabb: AABB3D;
  /** Exact solid 3D sub-volume colliders used for physics & overlap auditing (empty for flush ground grates/flocks) */
  solidColliders: AABB3D[];
  surfaceTag: PhysicsSurfaceTag;
  blocksGroundRoll: boolean;
  reactive?: PropReactiveSpec;
  scaffoldingMeta?: ScaffoldingShedMetadata;
  vanRampMeta?: DeliveryVanRampMetadata;
  treeOverhangMeta?: OverhangingTreeMetadata;
  hotdogAwningMeta?: HotdogAwningMetadata;
  hydrantBoostMeta?: HydrantGutterBoostMetadata;
  steamLiftMeta?: SteamGrateLiftMetadata;
  // Legacy optional tile indices kept optional for smooth component migration
  tileCol?: number;
  tileRow?: number;
}

export type CoursePropSpec = PlacedProp;

export interface StrategicShotRouteSpec {
  id: string;
  name: string;
  strokeNumber: 1 | 2;
  recommendedClub: 'driver' | 'wedge' | 'skimmer' | 'putter';
  origin: Vec3Tuple;
  targetPoint: Vec3Tuple;
  summary: string;
  keyPropIds: string[];
}

export type AuditStationId =
  | 'tee_forward'
  | 'tee_backward_180'
  | 'mid_street'
  | 'corner_dogleg'
  | 'courtyard_green_out';

export interface AuditCameraStationSpec {
  id: AuditStationId;
  label: string;
  groundY: AllowedGroundDatum;
  /** Eye-level camera position [x, groundY + 1.65, z] */
  position: Vec3Tuple;
  lookAt: Vec3Tuple;
  fovDeg: number;
  expectedLandmarks: string[];
}

export interface StreetScoutCameraSpec {
  id: 'street_scout_peek';
  label: string;
  position: Vec3Tuple;
  lookAt: Vec3Tuple;
  fovDeg: number;
  maxAllowedHeightY: number;
}

export interface CourseMasterPlan {
  holeNumber: 1;
  holeId: 'hole-1-5th-and-mercer';
  holeName: 'Hole 1: 5th & Mercer';
  subtitle: string;
  par: 4;
  targetCenterlineMeters: 72;
  computedCenterlineMeters: number;
  worldBoundsXZ: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  teePosition: Vec3Tuple;
  teeElevationY: AllowedGroundDatum;
  /** Initial compass aim yaw (0 = North along -Z down 5th Ave) */
  initialAimYaw: number;
  aPositionCrosswalk: CrosswalkLandingPadSpec;
  vanLoadingZone: VanLoadingZoneSpec;
  cup: HoleCupSpec;
  fountainDropZone: Vec3Tuple;
  centerlineSegments: CenterlineSegmentSpec[];
  groundZones: GroundSurfaceZoneSpec[];
  gutters: StormGutterTrackSpec[];
  stormGrates: StormDrainGrateSpec[];
  curbs: StoneCurbSegmentSpec[];
  ramps: WalkableRampSpec[];
  perimeterBuildings: PerimeterBuildingSpec[];
  skylineBackdrops: PerimeterBuildingSpec[];
  architecturalWalls: ArchitecturalWallSpec[];
  courtyardPergola: CourtyardPergolaSpec;
  stringLightSpans: StringLightSpanSpec[];
  props: CoursePropSpec[];
  strategicRoutes: StrategicShotRouteSpec[];
  auditStations: AuditCameraStationSpec[];
  streetScoutCamera: StreetScoutCameraSpec;
}

// ============================================================================
// Legacy Compatibility Structural Types (for smooth downstream migration)
// ============================================================================
export type TileRampSpec = WalkableRampSpec & {
  localBoundsXZ: { minX: number; maxX: number; minZ: number; maxZ: number };
};

export interface GutterTrackSpec {
  id: string;
  kind: 'straight' | 'corner_90';
  width: number;
  depth: number;
  troughY: number;
  curbHeight: number;
  start?: Vec3Tuple;
  end?: Vec3Tuple;
  arcCenter?: Vec3Tuple;
  arcRadius?: number;
  startAngleRad?: number;
  endAngleRad?: number;
}

export interface PlacedTile {
  id: string;
  worldX: number;
  worldZ: number;
  rotationY: number;
  gutters: GutterTrackSpec[];
}

export interface FlagPinSpec {
  color: FlagColor;
  index: number;
  position: Vec3Tuple;
  elevationY: number;
  apronRadius: number;
  cupRadius: number;
  nextTeePosition: Vec3Tuple;
}

export interface GeneratedCityCourse {
  seed: string;
  tiles: PlacedTile[];
  props: PlacedProp[];
  startTeePosition: Vec3Tuple;
  initialAimYaw: number;
  flags: FlagPinSpec[];
}
