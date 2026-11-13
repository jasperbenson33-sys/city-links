import {
  ELEVATIONS,
  TILE_SIZE,
  type AABB3D,
  type CardinalSockets,
  type CupArchetype,
  type ElevationTierId,
  type FlagColor,
  type GutterTrackSpec,
  type PlacedTile,
  type SurfaceMaterialKind,
  type TileBlueprintId,
  type TileBoxSurface,
  type TileCategory,
  type TileRampSpec,
  type TileRotationSteps,
  type Vec3Tuple,
  type WaterZoneSpec,
} from '../types/course';
import {
  gridToWorld,
  rotateSocketsCW,
  tileStepsToRotationY,
} from './geometryHelpers';

export interface PropAnchorSlot {
  id: string;
  /** Tile-local coordinates [lx, groundY, lz] */
  localPosition: Vec3Tuple;
  /** Local rotation around +Y in radians */
  localRotationY: number;
  hostSurfaceKind: SurfaceMaterialKind;
  allowedProps: readonly import('../types/course').PropType[];
}

export interface TileBlueprintDefinition {
  id: TileBlueprintId;
  category: TileCategory;
  /** Unrotated sockets [north (-Z), east (+X), south (+Z), west (-X)] */
  baseSockets: CardinalSockets;
  baseElevationY: number;
  tier: ElevationTierId;
  cupArchetype?: CupArchetype;
  localCupOffset?: Vec3Tuple;
  localNextTeeOffset?: Vec3Tuple;
  surfaces: TileBoxSurface[];
  ramps: TileRampSpec[];
  gutters: GutterTrackSpec[];
  waterZones: WaterZoneSpec[];
  anchorSlots: PropAnchorSlot[];
}

const SLAB_BASE_Y = -0.4;

function makeSlab(
  id: string,
  kind: SurfaceMaterialKind,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  topY: number,
  opts: {
    friction?: number;
    restitution?: number;
    isWall?: boolean;
    bottomY?: number;
  } = {},
): TileBoxSurface {
  const bottomY = opts.bottomY ?? SLAB_BASE_Y;
  const height = Math.max(0.04, topY - bottomY);
  const defaultFriction =
    kind === 'turf_green'
      ? 0.85
      : kind === 'asphalt'
        ? 0.48
        : kind === 'gutter_trough'
          ? 0.28
          : 0.58;
  const defaultRestitution =
    kind === 'turf_green'
      ? 0.26
      : kind === 'curb_wall' || kind === 'terrace_wall'
        ? 0.64
        : kind === 'asphalt'
          ? 0.52
          : 0.42;

  return {
    id,
    kind,
    center: [(minX + maxX) * 0.5, bottomY + height * 0.5, (minZ + maxZ) * 0.5],
    size: [maxX - minX, height, maxZ - minZ],
    topY,
    friction: opts.friction ?? defaultFriction,
    restitution: opts.restitution ?? defaultRestitution,
    isWall: opts.isWall ?? false,
  };
}

/**
 * Builds a sloped box ramp climbing along Z whose TOP walkable face (`local y = +thickness/2`)
 * hits exact `(minZ, topY)` & `(maxZ, bottomY)` when `climbDirection === 'north'`, or
 * exact `(minZ, bottomY)` & `(maxZ, topY)` when `climbDirection === 'south'` — zero step lip!
 */
function makeRampZ(
  id: string,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  bottomY: number,
  topY: number,
  climbDirection: 'north' | 'south',
  opts: { thickness?: number; friction?: number; restitution?: number } = {},
): TileRampSpec {
  const thickness = opts.thickness ?? 0.16;
  const dz = maxZ - minZ;
  const dy = topY - bottomY;
  const slopedLength = Math.hypot(dz, dy);
  const pitchX =
    climbDirection === 'north' ? Math.atan2(dy, dz) : -Math.atan2(dy, dz);

  // Offset box center down along the rotated normal by thickness/2 so top face aligns flush!
  const midX = (minX + maxX) * 0.5;
  const midY = (bottomY + topY) * 0.5 - thickness * 0.5 * Math.cos(pitchX);
  const midZ = (minZ + maxZ) * 0.5 - thickness * 0.5 * Math.sin(pitchX);

  return {
    id,
    center: [midX, midY, midZ],
    size: [maxX - minX, thickness, slopedLength],
    rotation: [pitchX, 0, 0],
    bottomY,
    topY,
    localBoundsXZ: { minX, maxX, minZ, maxZ },
    climbDirection,
    friction: opts.friction ?? 0.62,
    restitution: opts.restitution ?? 0.32,
  };
}

export const TILE_BLUEPRINTS: Record<TileBlueprintId, TileBlueprintDefinition> = {
  // 1. Straight N-S street with twin continuous U-shaped storm-drain gutters & 15cm curbs
  road_straight: {
    id: 'road_straight',
    category: 'road',
    baseSockets: ['asphalt_road', 'sidewalk_plaza', 'asphalt_road', 'sidewalk_plaza'],
    baseElevationY: ELEVATIONS.STREET_Y,
    tier: 1,
    surfaces: [
      makeSlab('west-sidewalk', 'sidewalk', -4, -2.4, -4, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('west-curb', 'curb_wall', -2.48, -2.36, -4, 4, ELEVATIONS.SIDEWALK_Y, {
        bottomY: ELEVATIONS.GUTTER_TROUGH_Y,
        restitution: 0.66,
      }),
      makeSlab('west-gutter', 'gutter_trough', -2.4, -1.88, -4, 4, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('road-crown', 'asphalt', -1.88, 1.88, -4, 4, ELEVATIONS.STREET_Y),
      makeSlab('east-gutter', 'gutter_trough', 1.88, 2.4, -4, 4, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('east-curb', 'curb_wall', 2.36, 2.48, -4, 4, ELEVATIONS.SIDEWALK_Y, {
        bottomY: ELEVATIONS.GUTTER_TROUGH_Y,
        restitution: 0.66,
      }),
      makeSlab('east-sidewalk', 'sidewalk', 2.4, 4, -4, 4, ELEVATIONS.SIDEWALK_Y),
    ],
    ramps: [],
    gutters: [
      {
        id: 'gutter-west',
        kind: 'straight',
        width: 0.52,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        start: [-2.14, ELEVATIONS.GUTTER_TROUGH_Y, -4],
        end: [-2.14, ELEVATIONS.GUTTER_TROUGH_Y, 4],
      },
      {
        id: 'gutter-east',
        kind: 'straight',
        width: 0.52,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        start: [2.14, ELEVATIONS.GUTTER_TROUGH_Y, -4],
        end: [2.14, ELEVATIONS.GUTTER_TROUGH_Y, 4],
      },
    ],
    waterZones: [],
    anchorSlots: [
      {
        id: 'van-lane',
        localPosition: [0.85, ELEVATIONS.STREET_Y, 0],
        localRotationY: 0,
        hostSurfaceKind: 'asphalt',
        allowedProps: ['delivery_box_van', 'pigeon_flock', 'subway_steam_grate'],
      },
      {
        id: 'west-curbside',
        localPosition: [-3.2, ELEVATIONS.SIDEWALK_Y, 0],
        localRotationY: Math.PI * 0.5,
        hostSurfaceKind: 'sidewalk',
        allowedProps: [
          'fire_hydrant_jet',
          'scaffolding_tunnel',
          'hotdog_cart_umbrella',
          'street_lamp',
          'street_tree',
          'brass_bollard',
        ],
      },
      {
        id: 'east-curbside',
        localPosition: [3.2, ELEVATIONS.SIDEWALK_Y, 1.4],
        localRotationY: -Math.PI * 0.5,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['street_tree', 'street_lamp', 'brass_bollard', 'subway_steam_grate'],
      },
    ],
  },

  // 2. 90-degree street corner (North <-> East) with 100% gap-free 64m^2 coverage & curved gutters
  road_corner_gutter: {
    id: 'road_corner_gutter',
    category: 'road',
    baseSockets: ['asphalt_road', 'asphalt_road', 'sidewalk_plaza', 'sidewalk_plaza'],
    baseElevationY: ELEVATIONS.STREET_Y,
    tier: 1,
    surfaces: [
      makeSlab('west-sidewalk-leg', 'sidewalk', -4, -2.4, -4, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('south-sidewalk-leg', 'sidewalk', -2.4, 4, 2.4, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('ne-inner-sidewalk', 'sidewalk', 2.4, 4, -4, -2.4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('outer-gutter-w', 'gutter_trough', -2.4, -1.88, -4, 2.4, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('outer-gutter-s', 'gutter_trough', -1.88, 4, 1.88, 2.4, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('inner-gutter-n', 'gutter_trough', 1.88, 2.4, -4, -1.88, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('inner-gutter-e', 'gutter_trough', 2.4, 4, -2.4, -1.88, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('corner-asphalt-north', 'asphalt', -1.88, 1.88, -4, -1.88, ELEVATIONS.STREET_Y),
      makeSlab('corner-asphalt-turn', 'asphalt', -1.88, 4, -1.88, 1.88, ELEVATIONS.STREET_Y),
    ],
    ramps: [],
    gutters: [
      {
        id: 'gutter-outer-90',
        kind: 'corner_90',
        width: 0.52,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        arcCenter: [4, ELEVATIONS.GUTTER_TROUGH_Y, -4],
        arcRadius: 6.14,
        startAngleRad: Math.PI * 0.5,
        endAngleRad: Math.PI,
      },
      {
        id: 'gutter-inner-90',
        kind: 'corner_90',
        width: 0.52,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        arcCenter: [4, ELEVATIONS.GUTTER_TROUGH_Y, -4],
        arcRadius: 1.86,
        startAngleRad: Math.PI * 0.5,
        endAngleRad: Math.PI,
      },
    ],
    waterZones: [],
    anchorSlots: [
      {
        id: 'outer-gutter-bank',
        localPosition: [-1.45, ELEVATIONS.STREET_Y, 1.45],
        localRotationY: Math.PI * 0.25,
        hostSurfaceKind: 'asphalt',
        allowedProps: ['curved_gutter_corner'],
      },
      {
        id: 'sw-corner-plaza',
        localPosition: [-3.1, ELEVATIONS.SIDEWALK_Y, 3.1],
        localRotationY: Math.PI * 0.25,
        hostSurfaceKind: 'sidewalk',
        allowedProps: [
          'hotdog_cart_umbrella',
          'fire_hydrant_jet',
          'bistro_umbrella_set',
          'street_lamp',
        ],
      },
      {
        id: 'ne-corner-curb',
        localPosition: [3.2, ELEVATIONS.SIDEWALK_Y, -3.2],
        localRotationY: -Math.PI * 0.75,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['fire_hydrant_jet', 'brass_bollard', 'street_lamp'],
      },
    ],
  },

  // 3. T-junction (North, East, South roads; West continuous sidewalk)
  road_t_junction: {
    id: 'road_t_junction',
    category: 'road',
    baseSockets: ['asphalt_road', 'asphalt_road', 'asphalt_road', 'sidewalk_plaza'],
    baseElevationY: ELEVATIONS.STREET_Y,
    tier: 1,
    surfaces: [
      makeSlab('west-sidewalk', 'sidewalk', -4, -2.4, -4, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('ne-sidewalk', 'sidewalk', 2.4, 4, -4, -2.4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('se-sidewalk', 'sidewalk', 2.4, 4, 2.4, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('west-gutter', 'gutter_trough', -2.4, -1.88, -4, 4, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('ne-gutter-n', 'gutter_trough', 1.88, 2.4, -4, -1.88, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('ne-gutter-e', 'gutter_trough', 2.4, 4, -2.4, -1.88, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('se-gutter-s', 'gutter_trough', 1.88, 2.4, 1.88, 4, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('se-gutter-e', 'gutter_trough', 2.4, 4, 1.88, 2.4, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('main-asphalt-ns', 'asphalt', -1.88, 1.88, -4, 4, ELEVATIONS.STREET_Y),
      makeSlab('branch-asphalt-e', 'asphalt', 1.88, 4, -1.88, 1.88, ELEVATIONS.STREET_Y),
    ],
    ramps: [],
    gutters: [
      {
        id: 'gutter-west',
        kind: 'straight',
        width: 0.52,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        start: [-2.14, ELEVATIONS.GUTTER_TROUGH_Y, -4],
        end: [-2.14, ELEVATIONS.GUTTER_TROUGH_Y, 4],
      },
      {
        id: 'gutter-ne-90',
        kind: 'corner_90',
        width: 0.52,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        arcCenter: [4, ELEVATIONS.GUTTER_TROUGH_Y, -4],
        arcRadius: 1.86,
        startAngleRad: Math.PI * 0.5,
        endAngleRad: Math.PI,
      },
      {
        id: 'gutter-se-90',
        kind: 'corner_90',
        width: 0.52,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        arcCenter: [4, ELEVATIONS.GUTTER_TROUGH_Y, 4],
        arcRadius: 1.86,
        startAngleRad: Math.PI,
        endAngleRad: Math.PI * 1.5,
      },
    ],
    waterZones: [],
    anchorSlots: [
      {
        id: 'west-sidewalk-mid',
        localPosition: [-3.2, ELEVATIONS.SIDEWALK_Y, 0],
        localRotationY: Math.PI * 0.5,
        hostSurfaceKind: 'sidewalk',
        allowedProps: [
          'fire_hydrant_jet',
          'hotdog_cart_umbrella',
          'scaffolding_tunnel',
          'subway_steam_grate',
        ],
      },
      {
        id: 't-center-road',
        localPosition: [-0.6, ELEVATIONS.STREET_Y, -1.6],
        localRotationY: 0,
        hostSurfaceKind: 'asphalt',
        allowedProps: ['delivery_box_van', 'pigeon_flock'],
      },
    ],
  },

  // 4. 4-Way Cross Intersection with 4 corner sidewalks & 4 curved storm-drain gutters
  road_cross_intersection: {
    id: 'road_cross_intersection',
    category: 'road',
    baseSockets: ['asphalt_road', 'asphalt_road', 'asphalt_road', 'asphalt_road'],
    baseElevationY: ELEVATIONS.STREET_Y,
    tier: 1,
    surfaces: [
      makeSlab('nw-sidewalk', 'sidewalk', -4, -2.4, -4, -2.4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('ne-sidewalk', 'sidewalk', 2.4, 4, -4, -2.4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('sw-sidewalk', 'sidewalk', -4, -2.4, 2.4, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('se-sidewalk', 'sidewalk', 2.4, 4, 2.4, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('nw-gutter-n', 'gutter_trough', -2.4, -1.88, -4, -1.88, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('nw-gutter-w', 'gutter_trough', -4, -2.4, -2.4, -1.88, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('ne-gutter-n', 'gutter_trough', 1.88, 2.4, -4, -1.88, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('ne-gutter-e', 'gutter_trough', 2.4, 4, -2.4, -1.88, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('sw-gutter-s', 'gutter_trough', -2.4, -1.88, 1.88, 4, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('sw-gutter-w', 'gutter_trough', -4, -2.4, 1.88, 2.4, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('se-gutter-s', 'gutter_trough', 1.88, 2.4, 1.88, 4, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('se-gutter-e', 'gutter_trough', 2.4, 4, 1.88, 2.4, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('asphalt-ns', 'asphalt', -1.88, 1.88, -4, 4, ELEVATIONS.STREET_Y),
      makeSlab('asphalt-w', 'asphalt', -4, -1.88, -1.88, 1.88, ELEVATIONS.STREET_Y),
      makeSlab('asphalt-e', 'asphalt', 1.88, 4, -1.88, 1.88, ELEVATIONS.STREET_Y),
    ],
    ramps: [],
    gutters: [
      {
        id: 'gutter-nw',
        kind: 'corner_90',
        width: 0.52,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        arcCenter: [-4, ELEVATIONS.GUTTER_TROUGH_Y, -4],
        arcRadius: 1.86,
        startAngleRad: 0,
        endAngleRad: Math.PI * 0.5,
      },
      {
        id: 'gutter-ne',
        kind: 'corner_90',
        width: 0.52,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        arcCenter: [4, ELEVATIONS.GUTTER_TROUGH_Y, -4],
        arcRadius: 1.86,
        startAngleRad: Math.PI * 0.5,
        endAngleRad: Math.PI,
      },
      {
        id: 'gutter-se',
        kind: 'corner_90',
        width: 0.52,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        arcCenter: [4, ELEVATIONS.GUTTER_TROUGH_Y, 4],
        arcRadius: 1.86,
        startAngleRad: Math.PI,
        endAngleRad: Math.PI * 1.5,
      },
      {
        id: 'gutter-sw',
        kind: 'corner_90',
        width: 0.52,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        arcCenter: [-4, ELEVATIONS.GUTTER_TROUGH_Y, 4],
        arcRadius: 1.86,
        startAngleRad: Math.PI * 1.5,
        endAngleRad: Math.PI * 2,
      },
    ],
    waterZones: [],
    anchorSlots: [
      {
        id: 'nw-hydrant',
        localPosition: [-3.15, ELEVATIONS.SIDEWALK_Y, -3.15],
        localRotationY: 0,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['fire_hydrant_jet', 'brass_bollard', 'street_lamp'],
      },
      {
        id: 'se-corner',
        localPosition: [3.15, ELEVATIONS.SIDEWALK_Y, 3.15],
        localRotationY: Math.PI,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['fire_hydrant_jet', 'brass_bollard', 'street_lamp'],
      },
    ],
  },

  // 5. Storm-Drain Gutter Boulevard Spur ('asphalt_road' South -> 'curb_gutter' North)
  curb_gutter_boulevard: {
    id: 'curb_gutter_boulevard',
    category: 'gutter',
    baseSockets: ['curb_gutter', 'sidewalk_plaza', 'asphalt_road', 'sidewalk_plaza'],
    baseElevationY: ELEVATIONS.STREET_Y,
    tier: 1,
    surfaces: [
      makeSlab('west-plaza', 'sidewalk', -4, -2.4, -4, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('west-curb', 'curb_wall', -2.48, -2.36, -4, 4, ELEVATIONS.SIDEWALK_Y, {
        bottomY: ELEVATIONS.GUTTER_TROUGH_Y,
        restitution: 0.66,
      }),
      makeSlab('gutter-chute-w', 'gutter_trough', -2.4, -1.88, -4, 4, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('asphalt-strip', 'asphalt', -1.88, 1.88, -4, 4, ELEVATIONS.STREET_Y),
      makeSlab('gutter-chute-e', 'gutter_trough', 1.88, 2.4, -4, 4, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('east-curb', 'curb_wall', 2.36, 2.48, -4, 4, ELEVATIONS.SIDEWALK_Y, {
        bottomY: ELEVATIONS.GUTTER_TROUGH_Y,
        restitution: 0.66,
      }),
      makeSlab('east-plaza', 'sidewalk', 2.4, 4, -4, 4, ELEVATIONS.SIDEWALK_Y),
    ],
    ramps: [],
    gutters: [
      {
        id: 'boulevard-chute-w',
        kind: 'straight',
        width: 0.52,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        start: [-2.14, ELEVATIONS.GUTTER_TROUGH_Y, -4],
        end: [-2.14, ELEVATIONS.GUTTER_TROUGH_Y, 4],
      },
      {
        id: 'boulevard-chute-e',
        kind: 'straight',
        width: 0.52,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        start: [2.14, ELEVATIONS.GUTTER_TROUGH_Y, -4],
        end: [2.14, ELEVATIONS.GUTTER_TROUGH_Y, 4],
      },
    ],
    waterZones: [],
    anchorSlots: [
      {
        id: 'east-plaza-slot',
        localPosition: [3.2, ELEVATIONS.SIDEWALK_Y, 0],
        localRotationY: -Math.PI * 0.5,
        hostSurfaceKind: 'sidewalk',
        allowedProps: [
          'hotdog_cart_umbrella',
          'scaffolding_tunnel',
          'bistro_umbrella_set',
          'subway_steam_grate',
        ],
      },
    ],
  },

  // 6. Street Cul-de-Sac & 90-Degree Banked Storm-Drain Turnaround (connects via North 'curb_gutter' or 'asphalt_road' spur)
  curb_gutter_corner_90: {
    id: 'curb_gutter_corner_90',
    category: 'gutter',
    baseSockets: ['curb_gutter', 'sidewalk_plaza', 'sidewalk_plaza', 'sidewalk_plaza'],
    baseElevationY: ELEVATIONS.SIDEWALK_Y,
    tier: 1.15,
    surfaces: [
      makeSlab('plaza-south', 'sidewalk', -4, 4, 1.2, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('plaza-west', 'sidewalk', -4, -2.4, -4, 1.2, ELEVATIONS.SIDEWALK_Y),
      makeSlab('plaza-east', 'sidewalk', 2.4, 4, -4, 1.2, ELEVATIONS.SIDEWALK_Y),
      makeSlab('plaza-shoulder-sw', 'sidewalk', -2.4, -1.4, -0.4, 1.2, ELEVATIONS.SIDEWALK_Y),
      makeSlab('plaza-shoulder-se', 'sidewalk', 1.4, 2.4, -0.4, 1.2, ELEVATIONS.SIDEWALK_Y),
      makeSlab('gutter-pocket-w', 'gutter_trough', -2.4, -1.88, -4, -0.4, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('gutter-pocket-e', 'gutter_trough', 1.88, 2.4, -4, -0.4, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('gutter-pocket-center', 'asphalt', -1.88, 1.88, -4, -0.4, ELEVATIONS.STREET_Y),
      makeSlab('gutter-ramp-subbase', 'asphalt', -1.4, 1.4, -0.4, 1.2, ELEVATIONS.STREET_Y),
    ],
    ramps: [
      makeRampZ(
        'gutter-exit-ramp',
        -1.4,
        1.4,
        -0.4,
        1.2,
        ELEVATIONS.STREET_Y,
        ELEVATIONS.SIDEWALK_Y,
        'south',
        { thickness: 0.12, friction: 0.52, restitution: 0.4 },
      ),
    ],
    gutters: [
      {
        id: 'gutter-lead-west',
        kind: 'straight',
        width: 0.52,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        start: [-2.14, ELEVATIONS.GUTTER_TROUGH_Y, -4],
        end: [-2.14, ELEVATIONS.GUTTER_TROUGH_Y, -2.2],
      },
      {
        id: 'gutter-lead-east',
        kind: 'straight',
        width: 0.52,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        start: [2.14, ELEVATIONS.GUTTER_TROUGH_Y, -4],
        end: [2.14, ELEVATIONS.GUTTER_TROUGH_Y, -2.2],
      },
      {
        id: 'gutter-turnout-90',
        kind: 'corner_90',
        width: 0.52,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        arcCenter: [-0.26, ELEVATIONS.GUTTER_TROUGH_Y, -2.2],
        arcRadius: 1.88,
        startAngleRad: Math.PI * 0.5,
        endAngleRad: Math.PI,
      },
    ],
    waterZones: [],
    anchorSlots: [
      {
        id: 'corner-rail-prop',
        localPosition: [0, ELEVATIONS.STREET_Y, -2.2],
        localRotationY: 0,
        hostSurfaceKind: 'asphalt',
        allowedProps: ['curved_gutter_corner', 'pigeon_flock'],
      },
      {
        id: 'south-plaza-prop',
        localPosition: [0, ELEVATIONS.SIDEWALK_Y, 2.55],
        localRotationY: 0,
        hostSurfaceKind: 'sidewalk',
        allowedProps: [
          'bistro_umbrella_set',
          'hotdog_cart_umbrella',
          'pigeon_flock',
          'street_tree',
        ],
      },
    ],
  },

  // 7. Open Warm Limestone Sidewalk Plaza (all 4 edges 'sidewalk_plaza')
  sidewalk_plaza_open: {
    id: 'sidewalk_plaza_open',
    category: 'plaza',
    baseSockets: ['sidewalk_plaza', 'sidewalk_plaza', 'sidewalk_plaza', 'sidewalk_plaza'],
    baseElevationY: ELEVATIONS.SIDEWALK_Y,
    tier: 1.15,
    surfaces: [
      makeSlab('full-plaza', 'sidewalk', -4, 4, -4, 4, ELEVATIONS.SIDEWALK_Y),
    ],
    ramps: [],
    gutters: [],
    waterZones: [],
    anchorSlots: [
      {
        id: 'plaza-center',
        localPosition: [0, ELEVATIONS.SIDEWALK_Y, 0],
        localRotationY: 0,
        hostSurfaceKind: 'sidewalk',
        allowedProps: [
          'bistro_umbrella_set',
          'hotdog_cart_umbrella',
          'subway_steam_grate',
          'scaffolding_tunnel',
          'pigeon_flock',
        ],
      },
      {
        id: 'plaza-nw',
        localPosition: [-2.4, ELEVATIONS.SIDEWALK_Y, -2.4],
        localRotationY: Math.PI * 0.25,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['street_tree', 'street_lamp', 'brass_bollard', 'pigeon_flock'],
      },
      {
        id: 'plaza-se',
        localPosition: [2.4, ELEVATIONS.SIDEWALK_Y, 2.4],
        localRotationY: -Math.PI * 0.75,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['street_tree', 'street_lamp', 'brass_bollard'],
      },
    ],
  },

  // 8. AstroTurf Parklet Promenade ('parklet_green' N & S)
  parklet_green_promenade: {
    id: 'parklet_green_promenade',
    category: 'plaza',
    baseSockets: ['parklet_green', 'sidewalk_plaza', 'parklet_green', 'sidewalk_plaza'],
    baseElevationY: ELEVATIONS.PARKLET_GREEN_Y,
    tier: 1.15,
    surfaces: [
      makeSlab('west-walk', 'sidewalk', -4, -2.6, -4, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('center-turf', 'turf_green', -2.6, 2.6, -4, 4, ELEVATIONS.PARKLET_GREEN_Y),
      makeSlab('east-walk', 'sidewalk', 2.6, 4, -4, 4, ELEVATIONS.SIDEWALK_Y),
    ],
    ramps: [],
    gutters: [],
    waterZones: [],
    anchorSlots: [
      {
        id: 'west-walk-slot',
        localPosition: [-3.3, ELEVATIONS.SIDEWALK_Y, 0],
        localRotationY: Math.PI * 0.5,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['street_tree', 'street_lamp', 'brass_bollard', 'pigeon_flock'],
      },
      {
        id: 'east-walk-slot',
        localPosition: [3.3, ELEVATIONS.SIDEWALK_Y, 0],
        localRotationY: -Math.PI * 0.5,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['bistro_umbrella_set', 'street_tree', 'brass_bollard'],
      },
    ],
  },

  // 9. Parklet Green Connector ('parklet_green' North -> 'sidewalk_plaza' E/S/W)
  parklet_green_connector: {
    id: 'parklet_green_connector',
    category: 'plaza',
    baseSockets: ['parklet_green', 'sidewalk_plaza', 'sidewalk_plaza', 'sidewalk_plaza'],
    baseElevationY: ELEVATIONS.PARKLET_GREEN_Y,
    tier: 1.15,
    surfaces: [
      makeSlab('south-plaza', 'sidewalk', -4, 4, 1.2, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('west-plaza', 'sidewalk', -4, -2.6, -4, 1.2, ELEVATIONS.SIDEWALK_Y),
      makeSlab('east-plaza', 'sidewalk', 2.6, 4, -4, 1.2, ELEVATIONS.SIDEWALK_Y),
      makeSlab('north-turf', 'turf_green', -2.6, 2.6, -4, 1.2, ELEVATIONS.PARKLET_GREEN_Y),
    ],
    ramps: [],
    gutters: [],
    waterZones: [],
    anchorSlots: [
      {
        id: 'connector-plaza-se',
        localPosition: [2.6, ELEVATIONS.SIDEWALK_Y, 2.6],
        localRotationY: 0,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['bistro_umbrella_set', 'pigeon_flock', 'street_tree', 'brass_bollard'],
      },
    ],
  },

  // 10. Terrace Ramp Approach (100% XZ floor coverage, flush +0.15m -> +0.85m North 'ramp_step')
  terrace_ramp_approach: {
    id: 'terrace_ramp_approach',
    category: 'ramp',
    baseSockets: ['ramp_step', 'sidewalk_plaza', 'sidewalk_plaza', 'sidewalk_plaza'],
    baseElevationY: ELEVATIONS.SIDEWALK_Y,
    tier: 1.15,
    surfaces: [
      makeSlab('south-apron', 'sidewalk', -4, 4, 2.2, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('west-apron', 'sidewalk', -4, -1.9, -4, 2.2, ELEVATIONS.SIDEWALK_Y),
      makeSlab('east-apron', 'sidewalk', 1.9, 4, -4, 2.2, ELEVATIONS.SIDEWALK_Y),
      makeSlab('ramp-subbase', 'sidewalk', -1.9, 1.9, -4, 2.2, ELEVATIONS.SIDEWALK_Y),
    ],
    ramps: [
      makeRampZ(
        'lower-terrace-ramp',
        -1.9,
        1.9,
        -4,
        2.2,
        ELEVATIONS.SIDEWALK_Y,
        0.85,
        'north',
        { thickness: 0.18, friction: 0.62, restitution: 0.32 },
      ),
    ],
    gutters: [],
    waterZones: [],
    anchorSlots: [
      {
        id: 'west-steam-assist',
        localPosition: [-2.95, ELEVATIONS.SIDEWALK_Y, 0.4],
        localRotationY: 0,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['subway_steam_grate', 'brass_bollard', 'street_lamp'],
      },
      {
        id: 'east-sidewalk-post',
        localPosition: [2.95, ELEVATIONS.SIDEWALK_Y, 1.2],
        localRotationY: 0,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['brass_bollard', 'street_lamp', 'pigeon_flock'],
      },
    ],
  },

  // 11. Terrace Stair-Chute Top (100% XZ floor coverage, flush South +0.85m 'ramp_step' -> North +1.35m 'terrace_wall')
  terrace_stair_chute_top: {
    id: 'terrace_stair_chute_top',
    category: 'terrace',
    baseSockets: ['terrace_wall', 'sidewalk_plaza', 'ramp_step', 'sidewalk_plaza'],
    baseElevationY: ELEVATIONS.TERRACE_Y,
    tier: 2,
    surfaces: [
      makeSlab('west-low-strip', 'sidewalk', -4, -3.1, -4, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('east-low-strip', 'sidewalk', 3.1, 4, -4, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('south-west-apron', 'sidewalk', -3.1, -1.9, 0.6, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('south-east-apron', 'sidewalk', 1.9, 3.1, 0.6, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('upper-ramp-subbase', 'sidewalk', -1.9, 1.9, 0.6, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('terrace-upper-deck', 'terrace_deck', -3.1, 3.1, -4, 0.6, ELEVATIONS.TERRACE_Y),
    ],
    ramps: [
      makeRampZ(
        'upper-terrace-ramp',
        -1.9,
        1.9,
        0.6,
        4,
        0.85,
        ELEVATIONS.TERRACE_Y,
        'north',
        { thickness: 0.18, friction: 0.62, restitution: 0.32 },
      ),
    ],
    gutters: [],
    waterZones: [],
    anchorSlots: [
      {
        id: 'terrace-deck-bistro',
        localPosition: [-1.5, ELEVATIONS.TERRACE_Y, -2.0],
        localRotationY: 0,
        hostSurfaceKind: 'terrace_deck',
        allowedProps: ['bistro_umbrella_set', 'pigeon_flock', 'brass_bollard'],
      },
    ],
  },

  // 12. Terrace Rooftop Lounge (caps 'terrace_wall' on South into 'sidewalk_plaza' N/E/W)
  terrace_rooftop_lounge: {
    id: 'terrace_rooftop_lounge',
    category: 'terrace',
    baseSockets: ['sidewalk_plaza', 'sidewalk_plaza', 'terrace_wall', 'sidewalk_plaza'],
    baseElevationY: ELEVATIONS.TERRACE_Y,
    tier: 2,
    surfaces: [
      makeSlab('north-low-strip', 'sidewalk', -4, 4, -4, -3.1, ELEVATIONS.SIDEWALK_Y),
      makeSlab('west-low-strip', 'sidewalk', -4, -3.1, -3.1, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('east-low-strip', 'sidewalk', 3.1, 4, -3.1, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('rooftop-deck', 'terrace_deck', -3.1, 3.1, -3.1, 4, ELEVATIONS.TERRACE_Y),
    ],
    ramps: [],
    gutters: [],
    waterZones: [],
    anchorSlots: [
      {
        id: 'lounge-umbrella',
        localPosition: [0, ELEVATIONS.TERRACE_Y, 0.4],
        localRotationY: 0,
        hostSurfaceKind: 'terrace_deck',
        allowedProps: ['bistro_umbrella_set', 'pigeon_flock'],
      },
    ],
  },

  // 13. Fountain Plaza Water Hazard (Tier 0 wide recessed -0.22m basin inside +0.15m plaza)
  fountain_plaza_hazard: {
    id: 'fountain_plaza_hazard',
    category: 'hazard',
    baseSockets: ['sidewalk_plaza', 'sidewalk_plaza', 'sidewalk_plaza', 'sidewalk_plaza'],
    baseElevationY: ELEVATIONS.SIDEWALK_Y,
    tier: 0,
    surfaces: [
      makeSlab('north-plaza', 'sidewalk', -4, 4, -4, -2.15, ELEVATIONS.SIDEWALK_Y),
      makeSlab('south-plaza', 'sidewalk', -4, 4, 2.15, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('west-plaza', 'sidewalk', -4, -2.15, -2.15, 2.15, ELEVATIONS.SIDEWALK_Y),
      makeSlab('east-plaza', 'sidewalk', 2.15, 4, -2.15, 2.15, ELEVATIONS.SIDEWALK_Y),
      makeSlab('fountain-coping-n', 'stone_rim', -2.15, 2.15, -2.15, -1.9, 0.04),
      makeSlab('fountain-coping-s', 'stone_rim', -2.15, 2.15, 1.9, 2.15, 0.04),
      makeSlab('fountain-coping-w', 'stone_rim', -2.15, -1.9, -1.9, 1.9, 0.04),
      makeSlab('fountain-coping-e', 'stone_rim', 1.9, 2.15, -1.9, 1.9, 0.04),
      makeSlab('fountain-basin-floor', 'water_basin', -1.9, 1.9, -1.9, 1.9, ELEVATIONS.WATER_BASIN_Y),
      makeSlab('fountain-center-plinth', 'stone_rim', -0.45, 0.45, -0.45, 0.45, ELEVATIONS.WATER_RIM_Y),
    ],
    ramps: [],
    gutters: [],
    waterZones: [
      {
        id: 'center-fountain-water',
        shape: 'cylinder',
        center: [0, ELEVATIONS.WATER_SURFACE_Y, 0],
        radius: 1.82,
        height: 0.25,
        surfaceY: ELEVATIONS.WATER_SURFACE_Y,
        basinY: ELEVATIONS.WATER_BASIN_Y,
      },
    ],
    anchorSlots: [
      {
        id: 'fountain-centerpiece',
        localPosition: [0, ELEVATIONS.WATER_RIM_Y, 0],
        localRotationY: 0,
        hostSurfaceKind: 'water_basin',
        allowedProps: ['fountain_water_hazard'],
      },
      {
        id: 'fountain-corner-lamp',
        localPosition: [-3.2, ELEVATIONS.SIDEWALK_Y, -3.2],
        localRotationY: 0,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['street_lamp', 'pigeon_flock', 'brass_bollard'],
      },
    ],
  },

  // 14. Park Reflection Pool / Canal Water Hazard (cohesive 5.3m-wide sunken basin pairing across 'water_hazard' North)
  canal_water_hazard: {
    id: 'canal_water_hazard',
    category: 'hazard',
    baseSockets: ['water_hazard', 'sidewalk_plaza', 'sidewalk_plaza', 'sidewalk_plaza'],
    baseElevationY: ELEVATIONS.WATER_RIM_Y,
    tier: 0,
    surfaces: [
      makeSlab('south-promenade', 'sidewalk', -4, 4, 2.15, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('west-quay', 'sidewalk', -4, -2.95, -4, 2.15, ELEVATIONS.SIDEWALK_Y),
      makeSlab('east-quay', 'sidewalk', 2.95, 4, -4, 2.15, ELEVATIONS.SIDEWALK_Y),
      makeSlab('canal-coping-south', 'stone_rim', -2.95, 2.95, 1.85, 2.15, 0.04),
      makeSlab('canal-coping-west', 'stone_rim', -2.95, -2.65, -4, 1.85, 0.04),
      makeSlab('canal-coping-east', 'stone_rim', 2.65, 2.95, -4, 1.85, 0.04),
      makeSlab('canal-basin-floor', 'water_basin', -2.65, 2.65, -4, 1.85, ELEVATIONS.WATER_BASIN_Y),
    ],
    ramps: [],
    gutters: [],
    waterZones: [
      {
        id: 'canal-reflection-pool',
        shape: 'box',
        center: [0, ELEVATIONS.WATER_SURFACE_Y, -1.075],
        size: [5.24, 0.24, 5.8],
        surfaceY: ELEVATIONS.WATER_SURFACE_Y,
        basinY: ELEVATIONS.WATER_BASIN_Y,
      },
    ],
    anchorSlots: [
      {
        id: 'quay-bollard-w',
        localPosition: [-3.45, ELEVATIONS.SIDEWALK_Y, 2.95],
        localRotationY: 0,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['brass_bollard', 'street_lamp', 'pigeon_flock'],
      },
      {
        id: 'quay-bollard-e',
        localPosition: [3.45, ELEVATIONS.SIDEWALK_Y, 2.95],
        localRotationY: 0,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['brass_bollard', 'street_lamp'],
      },
    ],
  },

  // ==========================================================================
  // 5 DISTINCT CUP TILE ARCHETYPES
  // ==========================================================================

  // 15. Cup 1: Corner Parklet Green (+0.15m AstroTurf beside canonical 'asphalt_road' North mouth)
  cup_corner_parklet: {
    id: 'cup_corner_parklet',
    category: 'cup',
    cupArchetype: 'corner_parklet',
    baseSockets: ['asphalt_road', 'sidewalk_plaza', 'sidewalk_plaza', 'sidewalk_plaza'],
    baseElevationY: ELEVATIONS.PARKLET_GREEN_Y,
    tier: 1.15,
    localCupOffset: [0, ELEVATIONS.PARKLET_GREEN_Y, 1.15],
    localNextTeeOffset: [-0.95, ELEVATIONS.PARKLET_GREEN_Y, 1.15],
    surfaces: [
      makeSlab('north-west-shoulder', 'sidewalk', -4, -2.4, -4, -2.0, ELEVATIONS.SIDEWALK_Y),
      makeSlab('north-gutter-w', 'gutter_trough', -2.4, -1.88, -4, -2.0, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('north-turnout-road', 'asphalt', -1.88, 1.88, -4, -2.0, ELEVATIONS.STREET_Y),
      makeSlab('north-gutter-e', 'gutter_trough', 1.88, 2.4, -4, -2.0, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('north-east-shoulder', 'sidewalk', 2.4, 4, -4, -2.0, ELEVATIONS.SIDEWALK_Y),
      makeSlab('parklet-border-w', 'sidewalk', -4, -3.1, -2.0, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('parklet-border-e', 'sidewalk', 3.1, 4, -2.0, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('parklet-border-s', 'sidewalk', -3.1, 3.1, 3.2, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('parklet-turf-green', 'turf_green', -3.1, 3.1, -2.0, 3.2, ELEVATIONS.PARKLET_GREEN_Y),
    ],
    ramps: [],
    gutters: [
      {
        id: 'parklet-curb-gutter-w',
        kind: 'straight',
        width: 0.52,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        start: [-2.14, ELEVATIONS.GUTTER_TROUGH_Y, -4],
        end: [-2.14, ELEVATIONS.GUTTER_TROUGH_Y, -2.05],
      },
      {
        id: 'parklet-curb-gutter-e',
        kind: 'straight',
        width: 0.52,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        start: [2.14, ELEVATIONS.GUTTER_TROUGH_Y, -4],
        end: [2.14, ELEVATIONS.GUTTER_TROUGH_Y, -2.05],
      },
    ],
    waterZones: [],
    anchorSlots: [
      {
        id: 'parklet-nw-bollard',
        localPosition: [-3.4, ELEVATIONS.SIDEWALK_Y, -3.2],
        localRotationY: 0,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['brass_bollard', 'street_lamp'],
      },
    ],
  },

  // 16. Cup 2: Sunken Courtyard Green (0.00m recessed turf with flush lip-free entry slopes)
  cup_sunken_courtyard: {
    id: 'cup_sunken_courtyard',
    category: 'cup',
    cupArchetype: 'sunken_courtyard',
    baseSockets: ['sidewalk_plaza', 'sidewalk_plaza', 'sidewalk_plaza', 'sidewalk_plaza'],
    baseElevationY: ELEVATIONS.STREET_Y,
    tier: 1,
    localCupOffset: [0, ELEVATIONS.STREET_Y, 0],
    localNextTeeOffset: [0.95, ELEVATIONS.STREET_Y, 0],
    surfaces: [
      makeSlab('rim-north', 'sidewalk', -4, 4, -4, -2.9, ELEVATIONS.SIDEWALK_Y),
      makeSlab('rim-south', 'sidewalk', -4, 4, 2.9, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('rim-west', 'sidewalk', -4, -2.9, -2.9, 2.9, ELEVATIONS.SIDEWALK_Y),
      makeSlab('rim-east', 'sidewalk', 2.9, 4, -2.9, 2.9, ELEVATIONS.SIDEWALK_Y),
      makeSlab('sunken-turf-green', 'turf_green', -2.9, 2.9, -2.9, 2.9, ELEVATIONS.STREET_Y),
    ],
    ramps: [
      makeRampZ(
        'sunken-entry-south',
        -1.2,
        1.2,
        2.0,
        2.9,
        ELEVATIONS.STREET_Y,
        ELEVATIONS.SIDEWALK_Y,
        'south',
        { thickness: 0.08, friction: 0.72, restitution: 0.28 },
      ),
      makeRampZ(
        'sunken-entry-north',
        -1.2,
        1.2,
        -2.9,
        -2.0,
        ELEVATIONS.STREET_Y,
        ELEVATIONS.SIDEWALK_Y,
        'north',
        { thickness: 0.08, friction: 0.72, restitution: 0.28 },
      ),
    ],
    gutters: [],
    waterZones: [],
    anchorSlots: [
      {
        id: 'courtyard-nw-tree',
        localPosition: [-3.4, ELEVATIONS.SIDEWALK_Y, -3.4],
        localRotationY: 0,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['street_tree', 'street_lamp', 'brass_bollard'],
      },
    ],
  },

  // 17. Cup 3: Elevated Cafe Terrace Green (+1.35m Tier 2 with flush South 'ramp_step' connector!)
  cup_elevated_cafe_terrace: {
    id: 'cup_elevated_cafe_terrace',
    category: 'cup',
    cupArchetype: 'elevated_cafe_terrace',
    baseSockets: ['sidewalk_plaza', 'sidewalk_plaza', 'ramp_step', 'sidewalk_plaza'],
    baseElevationY: ELEVATIONS.TERRACE_Y,
    tier: 2,
    localCupOffset: [0, ELEVATIONS.TERRACE_Y, -0.35],
    localNextTeeOffset: [0.95, ELEVATIONS.TERRACE_Y, -0.35],
    surfaces: [
      makeSlab('north-low-apron', 'sidewalk', -4, 4, -4, -3.15, ELEVATIONS.SIDEWALK_Y),
      makeSlab('west-low-apron', 'sidewalk', -4, -3.15, -3.15, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('east-low-apron', 'sidewalk', 3.15, 4, -3.15, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('south-west-apron', 'sidewalk', -3.15, -1.9, 2.35, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('south-east-apron', 'sidewalk', 1.9, 3.15, 2.35, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('cafe-ramp-subbase', 'sidewalk', -1.9, 1.9, 2.35, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('elevated-turf-green', 'turf_green', -3.15, 3.15, -3.15, 2.35, ELEVATIONS.TERRACE_Y),
    ],
    ramps: [
      makeRampZ(
        'cafe-terrace-top-ramp',
        -1.9,
        1.9,
        2.35,
        4,
        0.85,
        ELEVATIONS.TERRACE_Y,
        'north',
        { thickness: 0.18, friction: 0.65, restitution: 0.3 },
      ),
    ],
    gutters: [],
    waterZones: [],
    anchorSlots: [
      {
        id: 'terrace-corner-lamp',
        localPosition: [-2.65, ELEVATIONS.TERRACE_Y, -2.65],
        localRotationY: 0,
        hostSurfaceKind: 'turf_green',
        allowedProps: ['brass_bollard'],
      },
    ],
  },

  // 18. Cup 4: Transit Island Green (+0.15m median green with canonical ±2.4m 'asphalt_road' mouths!)
  cup_transit_island_green: {
    id: 'cup_transit_island_green',
    category: 'cup',
    cupArchetype: 'transit_island_green',
    baseSockets: ['asphalt_road', 'sidewalk_plaza', 'asphalt_road', 'sidewalk_plaza'],
    baseElevationY: ELEVATIONS.PARKLET_GREEN_Y,
    tier: 1.15,
    localCupOffset: [0, ELEVATIONS.PARKLET_GREEN_Y, 0],
    localNextTeeOffset: [0, ELEVATIONS.PARKLET_GREEN_Y, 0.95],
    surfaces: [
      // Canonical North mouth (z in [-4, -3.2]) matching 'asphalt_road' [±2.4] profile
      makeSlab('nw-mouth-walk', 'sidewalk', -4, -2.4, -4, -3.2, ELEVATIONS.SIDEWALK_Y),
      makeSlab('n-mouth-gutter-w', 'gutter_trough', -2.4, -1.88, -4, -3.2, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('n-mouth-road', 'asphalt', -1.88, 1.88, -4, -3.2, ELEVATIONS.STREET_Y),
      makeSlab('n-mouth-gutter-e', 'gutter_trough', 1.88, 2.4, -4, -3.2, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('ne-mouth-walk', 'sidewalk', 2.4, 4, -4, -3.2, ELEVATIONS.SIDEWALK_Y),

      // Canonical South mouth (z in [3.2, 4]) matching 'asphalt_road' [±2.4] profile
      makeSlab('sw-mouth-walk', 'sidewalk', -4, -2.4, 3.2, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('s-mouth-gutter-w', 'gutter_trough', -2.4, -1.88, 3.2, 4, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('s-mouth-road', 'asphalt', -1.88, 1.88, 3.2, 4, ELEVATIONS.STREET_Y),
      makeSlab('s-mouth-gutter-e', 'gutter_trough', 1.88, 2.4, 3.2, 4, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('se-mouth-walk', 'sidewalk', 2.4, 4, 3.2, 4, ELEVATIONS.SIDEWALK_Y),

      // Mid-block boulevard bypasses & central AstroTurf median island (z in [-3.2, 3.2])
      makeSlab('west-outer-walk', 'sidewalk', -4, -3.25, -3.2, 3.2, ELEVATIONS.SIDEWALK_Y),
      makeSlab('west-bypass-gutter', 'gutter_trough', -3.25, -2.75, -3.2, 3.2, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('west-bypass-lane', 'asphalt', -2.75, -2.05, -3.2, 3.2, ELEVATIONS.STREET_Y),

      makeSlab('east-bypass-lane', 'asphalt', 2.05, 2.75, -3.2, 3.2, ELEVATIONS.STREET_Y),
      makeSlab('east-bypass-gutter', 'gutter_trough', 2.75, 3.25, -3.2, 3.2, ELEVATIONS.GUTTER_TROUGH_Y),
      makeSlab('east-outer-walk', 'sidewalk', 3.25, 4, -3.2, 3.2, ELEVATIONS.SIDEWALK_Y),

      makeSlab('north-island-apron-road', 'asphalt', -2.05, 2.05, -3.2, -2.25, ELEVATIONS.STREET_Y),
      makeSlab('south-island-apron-road', 'asphalt', -2.05, 2.05, 2.25, 3.2, ELEVATIONS.STREET_Y),
      makeSlab('transit-island-turf', 'turf_green', -2.05, 2.05, -2.25, 2.25, ELEVATIONS.PARKLET_GREEN_Y),
    ],
    ramps: [],
    gutters: [
      {
        id: 'transit-gutter-west',
        kind: 'straight',
        width: 0.5,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        start: [-3.0, ELEVATIONS.GUTTER_TROUGH_Y, -3.2],
        end: [-3.0, ELEVATIONS.GUTTER_TROUGH_Y, 3.2],
      },
      {
        id: 'transit-gutter-east',
        kind: 'straight',
        width: 0.5,
        depth: 0.06,
        troughY: ELEVATIONS.GUTTER_TROUGH_Y,
        curbHeight: ELEVATIONS.CURB_HEIGHT,
        start: [3.0, ELEVATIONS.GUTTER_TROUGH_Y, -3.2],
        end: [3.0, ELEVATIONS.GUTTER_TROUGH_Y, 3.2],
      },
    ],
    waterZones: [],
    anchorSlots: [
      {
        id: 'transit-nw-bollard',
        localPosition: [-3.2, ELEVATIONS.SIDEWALK_Y, -3.6],
        localRotationY: 0,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['brass_bollard', 'street_lamp'],
      },
    ],
  },

  // 19. Cup 5: Pocket Garden Green (+0.15m garden green with 'parklet_green' North socket)
  cup_pocket_garden_green: {
    id: 'cup_pocket_garden_green',
    category: 'cup',
    cupArchetype: 'pocket_garden_green',
    baseSockets: ['parklet_green', 'sidewalk_plaza', 'sidewalk_plaza', 'sidewalk_plaza'],
    baseElevationY: ELEVATIONS.PARKLET_GREEN_Y,
    tier: 1.15,
    localCupOffset: [0, ELEVATIONS.PARKLET_GREEN_Y, 0.25],
    localNextTeeOffset: [-0.95, ELEVATIONS.PARKLET_GREEN_Y, 0.25],
    surfaces: [
      makeSlab('west-garden-walk', 'sidewalk', -4, -2.85, -4, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('east-garden-walk', 'sidewalk', 2.85, 4, -4, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('south-garden-walk', 'sidewalk', -2.85, 2.85, 2.95, 4, ELEVATIONS.SIDEWALK_Y),
      makeSlab('pocket-garden-turf', 'turf_green', -2.85, 2.85, -4, 2.95, ELEVATIONS.PARKLET_GREEN_Y),
    ],
    ramps: [],
    gutters: [],
    waterZones: [],
    anchorSlots: [
      {
        id: 'garden-se-tree',
        localPosition: [3.35, ELEVATIONS.SIDEWALK_Y, 3.35],
        localRotationY: 0,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['street_tree', 'street_lamp', 'brass_bollard'],
      },
      {
        id: 'garden-sw-tree',
        localPosition: [-3.35, ELEVATIONS.SIDEWALK_Y, 3.35],
        localRotationY: 0,
        hostSurfaceKind: 'sidewalk',
        allowedProps: ['street_tree', 'brass_bollard'],
      },
    ],
  },
};

export const ALL_TILE_BLUEPRINT_IDS = Object.keys(
  TILE_BLUEPRINTS,
) as TileBlueprintId[];

/**
 * Instantiates a `PlacedTile` at `(col, row)` with exact world coordinates,
 * rotated sockets, and world AABB.
 */
export function instantiatePlacedTile(
  col: number,
  row: number,
  blueprintId: TileBlueprintId,
  rotationSteps: TileRotationSteps,
  flagColor?: FlagColor,
): PlacedTile {
  const bp = TILE_BLUEPRINTS[blueprintId];
  const { x: worldX, z: worldZ } = gridToWorld(col, row);
  const rotationY = tileStepsToRotationY(rotationSteps);
  const sockets = rotateSocketsCW(bp.baseSockets, rotationSteps);
  const half = TILE_SIZE * 0.5;
  let maxTopY = bp.baseElevationY;
  for (const s of bp.surfaces) {
    if (s.topY > maxTopY) maxTopY = s.topY;
  }
  for (const r of bp.ramps) {
    if (r.topY > maxTopY) maxTopY = r.topY;
  }

  const aabb: AABB3D = {
    min: [worldX - half, SLAB_BASE_Y, worldZ - half],
    max: [worldX + half, maxTopY, worldZ + half],
  };

  return {
    id: `tile-${col}-${row}`,
    col,
    row,
    worldX,
    worldZ,
    blueprintId,
    category: bp.category,
    rotationSteps,
    rotationY,
    sockets,
    baseElevationY: bp.baseElevationY,
    tier: bp.tier,
    cupArchetype: bp.cupArchetype,
    flagColor,
    localCupOffset: bp.localCupOffset ? [...bp.localCupOffset] : undefined,
    localNextTeeOffset: bp.localNextTeeOffset
      ? [...bp.localNextTeeOffset]
      : undefined,
    surfaces: bp.surfaces,
    ramps: bp.ramps,
    gutters: bp.gutters,
    waterZones: bp.waterZones,
    aabb,
  };
}
