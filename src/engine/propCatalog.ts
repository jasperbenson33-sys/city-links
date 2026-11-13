import type { PropType, SurfaceMaterialKind, Vec3Tuple } from '../types/course';

export interface PropBlueprintSpec {
  type: PropType;
  label: string;
  /** Local bounding size [widthX, heightY, depthZ] with local y in [0, heightY] */
  localSize: Vec3Tuple;
  blocksGroundRoll: boolean;
  preferredSurfaces: readonly SurfaceMaterialKind[];
  underpassClearHeight?: number;
  underpassClearWidth?: number;
  umbrellaCanopyY?: number;
  umbrellaRadius?: number;
  restitution?: number;
}

export const PROP_CATALOG: Record<PropType, PropBlueprintSpec> = {
  hotdog_cart_umbrella: {
    type: 'hotdog_cart_umbrella',
    label: 'Hotdog Cart & Bouncy Umbrella',
    localSize: [1.85, 2.48, 2.25],
    blocksGroundRoll: true,
    preferredSurfaces: ['sidewalk', 'asphalt'],
    underpassClearHeight: 0.56,
    underpassClearWidth: 1.05,
    umbrellaCanopyY: 2.12,
    umbrellaRadius: 1.35,
    restitution: 0.55,
  },
  fire_hydrant_jet: {
    type: 'fire_hydrant_jet',
    label: 'Surfing Fire Hydrant Jet',
    localSize: [0.68, 0.85, 0.68],
    blocksGroundRoll: true,
    preferredSurfaces: ['sidewalk'],
  },
  curved_gutter_corner: {
    type: 'curved_gutter_corner',
    label: '90° Banked Storm-Drain Gutter Corner',
    localSize: [1.45, 0.22, 1.45],
    blocksGroundRoll: false,
    preferredSurfaces: ['asphalt'],
    restitution: 0.68,
  },
  subway_steam_grate: {
    type: 'subway_steam_grate',
    label: 'Subway Vent Steam Grate',
    localSize: [1.75, 0.08, 1.75],
    blocksGroundRoll: false,
    preferredSurfaces: ['sidewalk', 'asphalt'],
  },
  scaffolding_tunnel: {
    type: 'scaffolding_tunnel',
    label: 'Sidewalk Scaffolding Tunnel',
    localSize: [1.95, 2.35, 3.1],
    blocksGroundRoll: false,
    preferredSurfaces: ['sidewalk'],
    underpassClearHeight: 1.45,
    underpassClearWidth: 1.42,
  },
  delivery_box_van: {
    type: 'delivery_box_van',
    label: 'Delivery Box Van',
    localSize: [2.05, 2.25, 4.35],
    blocksGroundRoll: true,
    preferredSurfaces: ['asphalt'],
    restitution: 0.48,
  },
  bistro_umbrella_set: {
    type: 'bistro_umbrella_set',
    label: 'Cafe Bistro Umbrella Set',
    localSize: [2.25, 2.35, 2.25],
    blocksGroundRoll: true,
    preferredSurfaces: ['sidewalk', 'terrace_deck'],
    umbrellaCanopyY: 2.02,
    umbrellaRadius: 1.25,
    restitution: 0.55,
  },
  fountain_water_hazard: {
    type: 'fountain_water_hazard',
    label: 'Plaza Stone Fountain Hazard',
    localSize: [3.1, 1.15, 3.1],
    blocksGroundRoll: true,
    preferredSurfaces: ['sidewalk'],
  },
  pigeon_flock: {
    type: 'pigeon_flock',
    label: 'Scatterable Sidewalk Pigeons',
    localSize: [1.45, 0.34, 1.45],
    blocksGroundRoll: false,
    preferredSurfaces: ['sidewalk', 'asphalt', 'terrace_deck'],
  },
  street_tree: {
    type: 'street_tree',
    label: 'Sunlit Street Tree',
    localSize: [1.1, 2.85, 1.1],
    blocksGroundRoll: true,
    preferredSurfaces: ['sidewalk'],
  },
  brass_bollard: {
    type: 'brass_bollard',
    label: 'Brass Curbside Bollard',
    localSize: [0.36, 0.78, 0.36],
    blocksGroundRoll: true,
    preferredSurfaces: ['sidewalk', 'terrace_deck'],
  },
  street_lamp: {
    type: 'street_lamp',
    label: 'Vintage Park Street Lamp',
    localSize: [0.46, 3.05, 0.46],
    blocksGroundRoll: true,
    preferredSurfaces: ['sidewalk', 'terrace_deck'],
  },
};
