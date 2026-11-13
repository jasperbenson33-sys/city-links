'use client';

import React from 'react';
import type { ClubId, PlacedProp, PropType } from '@/types';
import { PROP_CATALOG } from '@/engine';
import { HotdogCartProp, CoaxialWheelMeshGroup } from './HotdogCartProp';
import { FireHydrantJetProp } from './FireHydrantJetProp';
import { SubwaySteamGrateProp } from './SubwaySteamGrateProp';
import { ScaffoldingTunnelProp } from './ScaffoldingTunnelProp';
import { DeliveryBoxVanProp } from './DeliveryBoxVanProp';
import { BistroUmbrellaSetProp } from './BistroUmbrellaSetProp';
import { FountainHazardProp } from './FountainHazardProp';
import { CurvedGutterCornerProp } from './CurvedGutterCornerProp';
import { PigeonFlockProp } from './PigeonFlockProp';
import {
  StreetBollardProp,
  StreetTreeProp,
  StreetLampProp,
  CornerBuildingAccentProp,
} from './StreetAccentProps';
import { GolfBagAndTeeProp } from './GolfBagAndTeeProp';

export {
  HotdogCartProp,
  CoaxialWheelMeshGroup,
  FireHydrantJetProp,
  SubwaySteamGrateProp,
  ScaffoldingTunnelProp,
  DeliveryBoxVanProp,
  BistroUmbrellaSetProp,
  FountainHazardProp,
  CurvedGutterCornerProp,
  PigeonFlockProp,
  StreetBollardProp,
  StreetTreeProp,
  StreetLampProp,
  CornerBuildingAccentProp,
  GolfBagAndTeeProp,
};

export interface PlacedPropRendererProps {
  prop: PlacedProp;
  ballPosition?: [number, number, number];
  lastHitAt?: number;
  showWireframe?: boolean;
  /** QA Gallery override to preview active steam gust / bird flight scatter. */
  forceAction?: boolean;
}

function normalizeTimestampToPerfSeconds(ts?: number): number {
  if (ts === undefined || !Number.isFinite(ts) || ts <= -5) return -10;
  // Detect epoch milliseconds (Date.now()) from store and map into performance.now() * 0.001 timeline.
  if (ts > 1e11) {
    const timeOrigin =
      typeof performance !== 'undefined' && typeof performance.timeOrigin === 'number'
        ? performance.timeOrigin
        : Date.now() - performance.now();
    return (ts - timeOrigin) * 0.001;
  }
  return ts;
}

/**
 * Renders any canonical PlacedProp produced by generateCityCourse at its exact
 * ground-seated [worldX, groundY, worldZ] and rotationY.
 */
export function PlacedPropRenderer({
  prop,
  ballPosition,
  lastHitAt = -10,
  showWireframe = false,
  forceAction = false,
}: PlacedPropRendererProps) {
  const perfHitSec = normalizeTimestampToPerfSeconds(lastHitAt);
  switch (prop.type) {
    case 'hotdog_cart_umbrella':
      return (
        <HotdogCartProp
          position={prop.position}
          rotationY={prop.rotationY}
          lastHitAt={perfHitSec}
          showWireframe={showWireframe}
        />
      );
    case 'fire_hydrant_jet':
      return (
        <FireHydrantJetProp
          position={prop.position}
          rotationY={prop.rotationY}
          jetRangeMeters={
            prop.reactive?.zoneHalfExtents
              ? Math.max(2.4, prop.reactive.zoneHalfExtents[2] * 2)
              : 4.6
          }
          lastSurfAt={perfHitSec}
          showWireframe={showWireframe}
        />
      );
    case 'curved_gutter_corner':
      return (
        <CurvedGutterCornerProp
          position={prop.position}
          rotationY={prop.rotationY}
          showWireframe={showWireframe}
        />
      );
    case 'subway_steam_grate': {
      const cycle = prop.reactive?.cycleSeconds ?? 3.2;
      const duty = prop.reactive?.dutyCycle ?? 0.55;
      return (
        <SubwaySteamGrateProp
          position={prop.position}
          rotationY={prop.rotationY}
          width={prop.localSize[0]}
          depth={prop.localSize[2]}
          cycleSeconds={cycle}
          gustActiveSeconds={cycle * duty}
          forceGust={forceAction}
          showWireframe={showWireframe}
        />
      );
    }
    case 'scaffolding_tunnel':
      return (
        <ScaffoldingTunnelProp
          position={prop.position}
          rotationY={prop.rotationY}
          width={prop.localSize[0]}
          depth={prop.localSize[2]}
          clearHeight={1.45}
          showWireframe={showWireframe}
        />
      );
    case 'delivery_box_van':
      return (
        <DeliveryBoxVanProp
          position={prop.position}
          rotationY={prop.rotationY}
          lastRoofHitAt={perfHitSec}
          showWireframe={showWireframe}
        />
      );
    case 'bistro_umbrella_set':
      return (
        <BistroUmbrellaSetProp
          position={prop.position}
          rotationY={prop.rotationY}
          lastHitAt={perfHitSec}
          showWireframe={showWireframe}
        />
      );
    case 'fountain_water_hazard':
      return (
        <FountainHazardProp
          position={prop.position}
          radius={1.52}
          lastSplashAt={perfHitSec}
          showWireframe={showWireframe}
        />
      );
    case 'pigeon_flock':
      return (
        <PigeonFlockProp
          position={prop.position}
          rotationY={prop.rotationY}
          ballPosition={ballPosition}
          forceScatter={forceAction}
          showWireframe={showWireframe}
        />
      );
    case 'street_tree': {
      const variants = ['emerald', 'sunny', 'peach'] as const;
      const variant = variants[(prop.tileCol + prop.tileRow) % variants.length]!;
      return (
        <StreetTreeProp
          position={prop.position}
          variant={variant}
          phase={(prop.tileCol * 1.3 + prop.tileRow * 0.7) % 6.28}
          showWireframe={showWireframe}
        />
      );
    }
    case 'brass_bollard':
      return (
        <StreetBollardProp
          position={prop.position}
          showWireframe={showWireframe}
        />
      );
    case 'street_lamp':
      return (
        <StreetLampProp
          position={prop.position}
          rotationY={prop.rotationY}
          showWireframe={showWireframe}
        />
      );
    default:
      return null;
  }
}

export type PropQaItemId = PropType | 'golf_bag_tee' | 'corner_building_accent';

export interface PropQaRenderOptions {
  showWireframe: boolean;
  lastHitAt: number;
  forceAction: boolean;
  selectedClub?: ClubId;
}

export interface PropQaRegistryEntry {
  id: PropQaItemId;
  label: string;
  category: 'reactive' | 'hazard' | 'accent';
  localSize: [number, number, number];
  summary: string;
  render: (opts: PropQaRenderOptions) => React.ReactNode;
}

/**
 * Registry of every isolated Curbside Links prop for /qa-gallery inspection on y = 0.
 */
export const PROP_QA_REGISTRY: PropQaRegistryEntry[] = [
  {
    id: 'hotdog_cart_umbrella',
    label: PROP_CATALOG.hotdog_cart_umbrella.label,
    category: 'reactive',
    localSize: PROP_CATALOG.hotdog_cart_umbrella.localSize,
    summary:
      'Coaxial spoked wheels flush at y=0, 0.34m under-cart Skimmer clearance, bouncy striped umbrella canopy & brass bell.',
    render: (opts) => (
      <HotdogCartProp
        position={[0, 0, 0]}
        lastHitAt={opts.lastHitAt}
        showWireframe={opts.showWireframe}
      />
    ),
  },
  {
    id: 'fire_hydrant_jet',
    label: PROP_CATALOG.fire_hydrant_jet.label,
    category: 'reactive',
    localSize: PROP_CATALOG.fire_hydrant_jet.localSize,
    summary:
      'Coaxial cast-iron coral hydrant with 5-sided nut, orthogonal nozzle caps, and pulsing +Z water-jet arc.',
    render: (opts) => (
      <FireHydrantJetProp
        position={[0, 0, 0]}
        lastSurfAt={opts.lastHitAt}
        showWireframe={opts.showWireframe}
      />
    ),
  },
  {
    id: 'subway_steam_grate',
    label: PROP_CATALOG.subway_steam_grate.label,
    category: 'reactive',
    localSize: PROP_CATALOG.subway_steam_grate.localSize,
    summary:
      'Flush y=0 iron grate frame with amber under-glow, wind-gust ribbons, and rhythmic upward steam column.',
    render: (opts) => (
      <SubwaySteamGrateProp
        position={[0, 0, 0]}
        forceGust={opts.forceAction}
        showWireframe={opts.showWireframe}
      />
    ),
  },
  {
    id: 'scaffolding_tunnel',
    label: PROP_CATALOG.scaffolding_tunnel.label,
    category: 'reactive',
    localSize: PROP_CATALOG.scaffolding_tunnel.localSize,
    summary:
      'Galvanized steel scaffolding with baseplates at y=0, planked bounce deck, and 1.45m high x 1.42m wide underpass.',
    render: (opts) => (
      <ScaffoldingTunnelProp
        position={[0, 0, 0]}
        showWireframe={opts.showWireframe}
      />
    ),
  },
  {
    id: 'delivery_box_van',
    label: PROP_CATALOG.delivery_box_van.label,
    category: 'reactive',
    localSize: PROP_CATALOG.delivery_box_van.localSize,
    summary:
      '4 coaxial wheels seated at y=0, cab + cargo box facing +Z, and springy green rooftop bank deck.',
    render: (opts) => (
      <DeliveryBoxVanProp
        position={[0, 0, 0]}
        lastRoofHitAt={opts.lastHitAt}
        showWireframe={opts.showWireframe}
      />
    ),
  },
  {
    id: 'bistro_umbrella_set',
    label: PROP_CATALOG.bistro_umbrella_set.label,
    category: 'reactive',
    localSize: PROP_CATALOG.bistro_umbrella_set.localSize,
    summary:
      'Coaxial bistro umbrella canopy + cafe table + twin chairs with cast-iron bases seated at y=0.',
    render: (opts) => (
      <BistroUmbrellaSetProp
        position={[0, 0, 0]}
        lastHitAt={opts.lastHitAt}
        showWireframe={opts.showWireframe}
      />
    ),
  },
  {
    id: 'fountain_water_hazard',
    label: PROP_CATALOG.fountain_water_hazard.label,
    category: 'hazard',
    localSize: PROP_CATALOG.fountain_water_hazard.localSize,
    summary:
      'Watertight limestone basin flush at y=0, shimmering turquoise water, tiered bowl, brass finial & splash ring.',
    render: (opts) => (
      <FountainHazardProp
        position={[0, 0, 0]}
        radius={1.52}
        lastSplashAt={opts.lastHitAt}
        showWireframe={opts.showWireframe}
      />
    ),
  },
  {
    id: 'curved_gutter_corner',
    label: PROP_CATALOG.curved_gutter_corner.label,
    category: 'reactive',
    localSize: PROP_CATALOG.curved_gutter_corner.localSize,
    summary:
      '90-degree curved storm-drain catch basin & amber hazard curb banking skimmer shots around corners.',
    render: (opts) => (
      <CurvedGutterCornerProp
        position={[0, 0, 0]}
        showWireframe={opts.showWireframe}
      />
    ),
  },
  {
    id: 'pigeon_flock',
    label: PROP_CATALOG.pigeon_flock.label,
    category: 'accent',
    localSize: PROP_CATALOG.pigeon_flock.localSize,
    summary:
      'Low-poly foraging pigeon flock with feet flush at y=0 and smooth anti-loop flight scatter reaction.',
    render: (opts) => (
      <PigeonFlockProp
        position={[0, 0, 0]}
        forceScatter={opts.forceAction}
        showWireframe={opts.showWireframe}
      />
    ),
  },
  {
    id: 'street_tree',
    label: PROP_CATALOG.street_tree.label,
    category: 'accent',
    localSize: PROP_CATALOG.street_tree.localSize,
    summary:
      'Terracotta planter box flush at y=0, cast-iron tree grate, warm wooden trunk & sculpted canopy.',
    render: (opts) => (
      <StreetTreeProp
        position={[0, 0, 0]}
        showWireframe={opts.showWireframe}
      />
    ),
  },
  {
    id: 'brass_bollard',
    label: PROP_CATALOG.brass_bollard.label,
    category: 'accent',
    localSize: PROP_CATALOG.brass_bollard.localSize,
    summary:
      'Cast-iron and brushed brass corner safety bollard with reflective collar seated at y=0.',
    render: (opts) => (
      <StreetBollardProp
        position={[0, 0, 0]}
        showWireframe={opts.showWireframe}
      />
    ),
  },
  {
    id: 'street_lamp',
    label: PROP_CATALOG.street_lamp.label,
    category: 'accent',
    localSize: PROP_CATALOG.street_lamp.localSize,
    summary:
      'Slender cast-iron city street lamp with warm lantern globe seated flush at y=0.',
    render: (opts) => (
      <StreetLampProp
        position={[0, 0, 0]}
        showWireframe={opts.showWireframe}
      />
    ),
  },
  {
    id: 'golf_bag_tee',
    label: 'Start Tee Pad & Tour Bag',
    category: 'accent',
    localSize: [1.5, 0.92, 1.5],
    summary:
      'Turf tee mat with wooden markers, leather tour bag, spare clubs reacting to active club, and fluttering towel.',
    render: (opts) => (
      <GolfBagAndTeeProp
        position={[0, 0, 0]}
        selectedClub={opts.selectedClub ?? 'driver'}
        showWireframe={opts.showWireframe}
      />
    ),
  },
  {
    id: 'corner_building_accent',
    label: 'Corner Brownstone Accent (Low-Profile)',
    category: 'accent',
    localSize: [2.8, 2.55, 2.8],
    summary:
      'Perimeter corner brownstone stoop & terracotta facade accent kept under 2.55m to protect 3/4 diorama sightlines.',
    render: (opts) => (
      <CornerBuildingAccentProp
        position={[0, 0, 0]}
        showWireframe={opts.showWireframe}
      />
    ),
  },
];
