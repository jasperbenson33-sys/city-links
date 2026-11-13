export type Vec3Tuple = [number, number, number];

export interface AABB3D {
  min: Vec3Tuple;
  max: Vec3Tuple;
}

/**
 * Island grid constants:
 * 6 x 6 grid of 8m x 8m modular tiles = 48m x 48m island centered at (0, 0, 0).
 * Canonical Local & World Frame: +Y = Up, +Z = Forward (South), -Z = North, +X = Right (East), -X = West.
 * Ground contact datum in every local prop/tile frame is exact y = 0.
 */
export const GRID_COLS = 6;
export const GRID_ROWS = 6;
export const TILE_SIZE = 8;
export const ISLAND_SIZE = GRID_COLS * TILE_SIZE; // 48m
export const ISLAND_HALF_SIZE = ISLAND_SIZE / 2; // 24m

/**
 * Canonical elevation tiers (meters in world Y).
 */
export const ELEVATIONS = {
  WATER_BASIN_Y: -0.22,
  WATER_SURFACE_Y: -0.15,
  WATER_RIM_Y: 0.0,
  GUTTER_TROUGH_Y: -0.06,
  STREET_Y: 0.0,
  SIDEWALK_Y: 0.15,
  PARKLET_GREEN_Y: 0.15,
  CURB_HEIGHT: 0.15,
  TERRACE_Y: 1.35,
} as const;

export type ElevationTierId = 0 | 1 | 1.15 | 2;

/**
 * Typed edge sockets ordered [north (-Z), east (+X), south (+Z), west (-X)].
 */
export type EdgeSocket =
  | 'asphalt_road'
  | 'curb_gutter'
  | 'sidewalk_plaza'
  | 'parklet_green'
  | 'terrace_wall'
  | 'ramp_step'
  | 'water_hazard';

export type CardinalDirection = 'north' | 'east' | 'south' | 'west';

/** Ordered [north, east, south, west] */
export type CardinalSockets = [EdgeSocket, EdgeSocket, EdgeSocket, EdgeSocket];

/** Clockwise quarter-turns when viewed from +Y looking down: 0=0°, 1=90° CW, 2=180°, 3=270° CW */
export type TileRotationSteps = 0 | 1 | 2 | 3;

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

export type CupArchetype =
  | 'corner_parklet'
  | 'sunken_courtyard'
  | 'elevated_cafe_terrace'
  | 'transit_island_green'
  | 'pocket_garden_green';

export const CUP_ARCHETYPES: readonly CupArchetype[] = [
  'corner_parklet',
  'sunken_courtyard',
  'elevated_cafe_terrace',
  'transit_island_green',
  'pocket_garden_green',
] as const;

export type TileBlueprintId =
  | 'road_straight'
  | 'road_corner_gutter'
  | 'road_t_junction'
  | 'road_cross_intersection'
  | 'curb_gutter_boulevard'
  | 'curb_gutter_corner_90'
  | 'sidewalk_plaza_open'
  | 'parklet_green_promenade'
  | 'parklet_green_connector'
  | 'terrace_ramp_approach'
  | 'terrace_stair_chute_top'
  | 'terrace_rooftop_lounge'
  | 'fountain_plaza_hazard'
  | 'canal_water_hazard'
  | 'cup_corner_parklet'
  | 'cup_sunken_courtyard'
  | 'cup_elevated_cafe_terrace'
  | 'cup_transit_island_green'
  | 'cup_pocket_garden_green';

export type TileCategory =
  | 'road'
  | 'gutter'
  | 'plaza'
  | 'ramp'
  | 'terrace'
  | 'hazard'
  | 'cup';

export type SurfaceMaterialKind =
  | 'asphalt'
  | 'sidewalk'
  | 'turf_green'
  | 'terrace_deck'
  | 'curb_wall'
  | 'terrace_wall'
  | 'stone_rim'
  | 'gutter_trough'
  | 'water_basin';

/**
 * Local-space axis-aligned box surface inside an 8m x 8m tile (before tile.rotationY).
 * Local origin is (0, 0, 0) at tile center; local x,z in [-4, 4].
 */
export interface TileBoxSurface {
  id: string;
  kind: SurfaceMaterialKind;
  center: Vec3Tuple;
  size: Vec3Tuple;
  topY: number;
  friction: number;
  restitution: number;
  /** True if this box acts as a vertical blocking wall rather than walkable floor */
  isWall?: boolean;
}

/**
 * Local-space sloped ramp / stair-chute inside a tile connecting lowerY -> upperY.
 * Ramp climbs along its local +Z or -Z axis according to yawRad and pitchRad.
 */
export interface TileRampSpec {
  id: string;
  /** Midpoint of the sloped slab in tile-local coordinates */
  center: Vec3Tuple;
  /** Width (X), thickness (Y), sloped length (Z) in ramp local frame */
  size: Vec3Tuple;
  /** Euler rotation [pitchX, yawY, 0] in tile-local frame */
  rotation: Vec3Tuple;
  bottomY: number;
  topY: number;
  /** Tile-local XZ bounds for analytical elevation queries */
  localBoundsXZ: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Direction in tile-local space along which elevation increases ('north'=-Z, 'south'=+Z, 'east'=+X, 'west'=-X) */
  climbDirection: CardinalDirection;
  friction: number;
  restitution: number;
}

/**
 * Recessed U-shaped storm-drain gutter track (straight or 90-degree curved corner).
 * Coordinates are in tile-local space (mount inside tile group).
 */
export interface GutterTrackSpec {
  id: string;
  kind: 'straight' | 'corner_90';
  /** Width of U-channel (meters, typically 0.52m) */
  width: number;
  /** Recessed depth below street 0.00m (typically 0.06m -> troughY = -0.06m) */
  depth: number;
  troughY: number;
  /** Adjacent 15cm concrete curb wall height (0.15m) */
  curbHeight: number;
  /** For straight tracks: local start & end [x, y, z] */
  start?: Vec3Tuple;
  end?: Vec3Tuple;
  /** For 90-degree curved corner tracks: arc pivot [x, 0, z], radius, startAngleRad, endAngleRad in XZ */
  arcCenter?: Vec3Tuple;
  arcRadius?: number;
  startAngleRad?: number;
  endAngleRad?: number;
}

/**
 * Water hazard sensor volume in tile-local space.
 */
export interface WaterZoneSpec {
  id: string;
  shape: 'box' | 'cylinder';
  center: Vec3Tuple;
  /** Used when shape === 'box' */
  size?: Vec3Tuple;
  /** Used when shape === 'cylinder' */
  radius?: number;
  height?: number;
  surfaceY: number;
  basinY: number;
}

export interface PlacedTile {
  id: string;
  col: number;
  row: number;
  /** World X center of this 8m x 8m tile */
  worldX: number;
  /** World Z center of this 8m x 8m tile */
  worldZ: number;
  blueprintId: TileBlueprintId;
  category: TileCategory;
  /** Clockwise quarter turns from top view (0..3) */
  rotationSteps: TileRotationSteps;
  /** Exact Three.js Y-axis rotation in radians: -rotationSteps * (Math.PI / 2) */
  rotationY: number;
  /** World-oriented edge sockets [north (-Z), east (+X), south (+Z), west (-X)] */
  sockets: CardinalSockets;
  /** Primary playable surface elevation of this tile */
  baseElevationY: number;
  tier: ElevationTierId;
  cupArchetype?: CupArchetype;
  flagColor?: FlagColor;
  /** Local-space cup offset [lx, groundY, lz] if this is a cup tile */
  localCupOffset?: Vec3Tuple;
  /** Local-space next-tee offset [lx, groundY, lz] if this is a cup tile */
  localNextTeeOffset?: Vec3Tuple;
  surfaces: TileBoxSurface[];
  ramps: TileRampSpec[];
  gutters: GutterTrackSpec[];
  waterZones: WaterZoneSpec[];
  /** World-space bounding box of this tile */
  aabb: AABB3D;
}

export type PropType =
  | 'hotdog_cart_umbrella'
  | 'fire_hydrant_jet'
  | 'curved_gutter_corner'
  | 'subway_steam_grate'
  | 'scaffolding_tunnel'
  | 'delivery_box_van'
  | 'bistro_umbrella_set'
  | 'fountain_water_hazard'
  | 'pigeon_flock'
  | 'street_tree'
  | 'brass_bollard'
  | 'street_lamp';

export const SIGNATURE_PROP_TYPES: readonly PropType[] = [
  'hotdog_cart_umbrella',
  'fire_hydrant_jet',
  'curved_gutter_corner',
  'subway_steam_grate',
  'scaffolding_tunnel',
  'delivery_box_van',
  'bistro_umbrella_set',
  'fountain_water_hazard',
  'pigeon_flock',
] as const;

export const ALL_PROP_TYPES: readonly PropType[] = [
  ...SIGNATURE_PROP_TYPES,
  'street_tree',
  'brass_bollard',
  'street_lamp',
] as const;

export interface PropReactiveSpec {
  kind:
    | 'umbrella_trampoline'
    | 'hydrant_water_jet'
    | 'gutter_corner_bank'
    | 'steam_updraft'
    | 'scaffolding_underpass'
    | 'van_roof_bounce'
    | 'water_hazard'
    | 'pigeon_scatter';
  /** World-space center of reactive sensor/collider */
  zoneCenter: Vec3Tuple;
  /** Half-extents or radius depending on sensor geometry */
  zoneHalfExtents?: Vec3Tuple;
  zoneRadius?: number;
  /** Restitution for trampoline/rooftop bounces (0.55 for umbrellas) */
  restitution?: number;
  /** Deterministic velocity boost or updraft impulse in world [vx, vy, vz] */
  boostVelocity?: Vec3Tuple;
  /** Periodic gust cycle in seconds (e.g. subway steam grate) */
  cycleSeconds?: number;
  /** Fraction of cycle active in (0, 1] */
  dutyCycle?: number;
  /** Clear underpass height in meters for Skimmer shots (cart wheel gap, scaffolding tunnel) */
  underpassClearHeight?: number;
  underpassClearWidth?: number;
}

export interface PlacedProp {
  id: string;
  type: PropType;
  tileCol: number;
  tileRow: number;
  /** World position [x, groundY, z]; position[1] matches host surface elevation within 1e-4 */
  position: Vec3Tuple;
  /** Exact host surface elevation in world Y */
  groundY: number;
  /** Rotation around +Y in radians */
  rotationY: number;
  /** Local-space full size [widthX, heightY, depthZ] with local y in [0, heightY] */
  localSize: Vec3Tuple;
  /** Exact world-space AABB */
  aabb: AABB3D;
  /** True if the prop has solid blocking footprint at ground level; false for pure ground grates/birds */
  blocksGroundRoll: boolean;
  reactive?: PropReactiveSpec;
}

export interface FlagPinSpec {
  color: FlagColor;
  index: number;
  archetype: CupArchetype;
  tileCol: number;
  tileRow: number;
  /** World cup center [x, elevationY, z] flush on green surface */
  position: Vec3Tuple;
  elevationY: number;
  tier: ElevationTierId;
  /** Obstacle-free green apron radius around cup (>= 1.5m) */
  apronRadius: number;
  /** Cup capture radius in meters */
  cupRadius: number;
  /** Flat next-tee position on the clear 1.5m apron beside this cup */
  nextTeePosition: Vec3Tuple;
}

export interface CourseReachabilityEdge {
  fromId: 'start' | FlagColor;
  toFlag: FlagColor;
  strokes: number;
  recommendedClubs: string[];
}

export interface GeneratedCityCourse {
  /** Requested user/daily seed string */
  seed: string;
  /** Sub-seed attempt index that passed 100% hard validation (0 when first attempt passes) */
  resolvedAttempt: number;
  /** Effective deterministic seed string (`seed` or `${seed}#${resolvedAttempt}`) */
  effectiveSeed: string;
  gridCols: number;
  gridRows: number;
  tileSize: number;
  islandSize: number;
  /** 36 placed modular tiles in row-major order (index = row * 6 + col) */
  tiles: PlacedTile[];
  /** Validated city props with exact groundY and non-overlapping AABBs */
  props: PlacedProp[];
  /** Initial starting tee position [x, groundY, z] */
  startTeePosition: Vec3Tuple;
  startTeeTile: { col: number; row: number };
  /** Suggested initial camera/aim yaw in radians from startTeePosition */
  initialAimYaw: number;
  /** All 5 color-coded flags across the 5 distinct cup archetypes */
  flags: FlagPinSpec[];
  /** Pre-verified reachability matrix (start -> all 5 flags, and all 5x4 flag pairs in <= 3 strokes) */
  reachability: CourseReachabilityEdge[];
  /** Generation time in milliseconds */
  generationMs: number;
}

export interface CourseValidationResult {
  valid: boolean;
  errors: string[];
  socketMismatches: number;
  curbChannelDiscontinuities: number;
  unreachableTier2Greens: number;
  aabbOverlaps: number;
  floatingProps: number;
  minFlagSpacingMeters: number;
  apronViolations: number;
  maxPairwiseStrokes: number;
}
