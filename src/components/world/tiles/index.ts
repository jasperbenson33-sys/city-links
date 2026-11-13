'use client';

import type { FlagColor, TileBlueprintId, TileCategory } from '@/types';
import { CupFlagAssembly } from './CupFlagAssembly';
import { ModularTileMesh, PlacedTileRenderer } from './ModularTileMesh';

export {
  CupFlagAssembly,
  ModularTileMesh,
  PlacedTileRenderer,
};

export * from './tileGeometry';

export interface TileQaRegistryEntry {
  id: TileBlueprintId;
  label: string;
  category: TileCategory;
  defaultFlagColor?: FlagColor;
  summary: string;
}

/**
 * Complete catalog of all 19 modular 8m x 8m Curbside Links tile blueprints for /qa-gallery.
 */
export const TILE_QA_REGISTRY: TileQaRegistryEntry[] = [
  {
    id: 'road_straight',
    label: 'Road Straight',
    category: 'road',
    summary: 'Asphalt N-S corridor with amber dashed centerlines, crosswalk, & dual -0.06m recessed gutters.',
  },
  {
    id: 'road_corner_gutter',
    label: 'Road 90° Curved Corner & Gutter',
    category: 'road',
    summary: 'Seamless 90° swept asphalt turn with curved dual -0.06m storm-drain gutters & limestone curbs.',
  },
  {
    id: 'road_t_junction',
    label: 'Road T-Junction',
    category: 'road',
    summary: '3-way crosswalk plaza junction with West continuous sidewalk and -0.06m storm-drain channel.',
  },
  {
    id: 'road_cross_intersection',
    label: 'Road 4-Way Cross Intersection',
    category: 'road',
    summary: '4-way sunlit asphalt intersection with corner limestone aprons & zebra crosswalks.',
  },
  {
    id: 'curb_gutter_boulevard',
    label: 'Curb Gutter Boulevard',
    category: 'gutter',
    summary: 'Wide pedestrian promenade splitting asphalt skirt & recessed -0.06m iron grate gutter track.',
  },
  {
    id: 'curb_gutter_corner_90',
    label: '90° Curved Gutter Turnout',
    category: 'gutter',
    summary: 'Bankable curved storm-drain pocket & exit ramp rising cleanly onto the +0.15m limestone plaza.',
  },
  {
    id: 'sidewalk_plaza_open',
    label: 'Open Limestone Sidewalk Plaza',
    category: 'plaza',
    summary: 'Continuous +0.15m warm limestone courtyard tile with architectural paver expansion joints.',
  },
  {
    id: 'parklet_green_promenade',
    label: 'Parklet Green Promenade',
    category: 'plaza',
    summary: 'Lush emerald AstroTurf promenade corridor trimmed with warm terracotta brick borders.',
  },
  {
    id: 'parklet_green_connector',
    label: 'Parklet T-Connector',
    category: 'plaza',
    summary: 'Emerald putting-corridor junction linking North/South AstroTurf strips with East streetscape.',
  },
  {
    id: 'terrace_ramp_approach',
    label: 'Terrace Ramp Approach (Lower)',
    category: 'ramp',
    summary: 'Smooth architectural ramp climbing from +0.15m sidewalk up to +0.85m terrace step transition.',
  },
  {
    id: 'terrace_stair_chute_top',
    label: 'Terrace Stair-Chute Top (Upper)',
    category: 'terrace',
    summary: 'Stepped brick-cheek chute climbing from +0.85m up to Tier-2 +1.35m sunlit brownstone terrace.',
  },
  {
    id: 'terrace_rooftop_lounge',
    label: 'Tier-2 Terrace Rooftop Lounge',
    category: 'terrace',
    summary: '+1.35m Tier-2 brick terrace lounge deck pairing with elevated bistro cafe props.',
  },
  {
    id: 'fountain_plaza_hazard',
    label: 'Fountain Plaza Water Hazard',
    category: 'hazard',
    summary: 'Square limestone plaza opening around a recessed -0.22m turquoise basin & central fountain plinth.',
  },
  {
    id: 'canal_water_hazard',
    label: 'Canal Water Hazard & Stone Bridge',
    category: 'hazard',
    summary: 'Twin recessed -0.22m turquoise canal basins bisected by a crisp curbed limestone footbridge.',
  },
  {
    id: 'cup_corner_parklet',
    label: 'Cup 1: Corner Parklet Green',
    category: 'cup',
    defaultFlagColor: 'red',
    summary: '+0.15m emerald AstroTurf pocket adjacent to roadside gutter turnout with recessed cup & Red flag.',
  },
  {
    id: 'cup_sunken_courtyard',
    label: 'Cup 2: Sunken Courtyard Green',
    category: 'cup',
    defaultFlagColor: 'yellow',
    summary: '0.00m recessed courtyard turf surrounded by +0.15m limestone steps, entry ramps & Yellow flag.',
  },
  {
    id: 'cup_elevated_cafe_terrace',
    label: 'Cup 3: Elevated Cafe Terrace Green',
    category: 'cup',
    defaultFlagColor: 'blue',
    summary: 'Tier-2 +1.35m brick brownstone rooftop turf green accessed via South ramp & Blue flag.',
  },
  {
    id: 'cup_transit_island_green',
    label: 'Cup 4: Transit Island Median Green',
    category: 'cup',
    defaultFlagColor: 'purple',
    summary: '+0.15m emerald transit median surrounded by dual asphalt bypass lanes & Purple flag.',
  },
  {
    id: 'cup_pocket_garden_green',
    label: 'Cup 5: Pocket Garden Green',
    category: 'cup',
    defaultFlagColor: 'green',
    summary: '+0.15m brick-bordered urban pocket garden green connecting N/S parklet strip & Green flag.',
  },
];
