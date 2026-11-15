'use client';

import React from 'react';
import {
  COURSE_MASTER_PLAN,
  COURSE_PROPS,
  TEE_SET_LOCAL_BOUNDS,
} from '@/config/courseMasterPlan';
import {
  ESCAPADE_COURSE_PROPS,
  GRAND_ESCAPADE_QA_PROP_SPECS,
} from '@/config/grandEscapadeMasterPlan';
import { TOYBOX_MATERIALS } from '@/materials';
import type {
  CoursePropSpec,
  GrandEscapadePropType,
  PlacedProp,
  PropType,
} from '@/types/course';
import { HotdogCartProp, CoaxialWheelMeshGroup } from './HotdogCartProp';
import { FireHydrantJetProp } from './FireHydrantJetProp';
import { SubwaySteamGrateProp } from './SubwaySteamGrateProp';
import { ScaffoldingTunnelProp } from './ScaffoldingTunnelProp';
import { DeliveryBoxVanProp } from './DeliveryBoxVanProp';
import {
  BistroUmbrellaSetProp,
  type BistroUmbrellaVariant,
} from './BistroUmbrellaSetProp';
import { FountainHazardProp } from './FountainHazardProp';
import { CurvedGutterCornerProp } from './CurvedGutterCornerProp';
import { PigeonFlockProp } from './PigeonFlockProp';
import {
  StreetBollardProp,
  StreetTreeProp,
  OverhangingStreetTreeProp,
  StreetLampProp,
  CornerBuildingAccentProp,
} from './StreetAccentProps';
import { GolfBagAndTeeProp } from './GolfBagAndTeeProp';
import {
  HazardConeProp,
  MenuAFrameBoardProp,
  SubwayBenchProp,
  TrashReceptacleProp,
  PlanterHedgeProp,
  SubwayPortalProp,
} from './UrbanCornerProps';
import {
  RooftopWaterTowerProp,
  AngledSkylightBankProp,
  GreenhousePergolaProp,
  HvacUpdraftFanProp,
} from './GrandEscapadeRooftopProps';
import {
  StoneViaductArchProp,
  CurvedBalustradeBankProp,
  GlassConservatoryProp,
  RooftopBellTowerProp,
  CopperSpiralChuteProp,
} from './GrandEscapadeViaductChuteProps';
import {
  NewspaperKioskProp,
  BrassTurnstileGateProp,
  VintageSubwayCarProp,
  SubwayMosaicPillarProp,
  GrandSubwayHeadhouseProp,
} from './GrandEscapadeTransitSubwayProps';

export { HotdogCartProp, CoaxialWheelMeshGroup };
export { FireHydrantJetProp };
export { SubwaySteamGrateProp };
export { ScaffoldingTunnelProp };
export { DeliveryBoxVanProp };
export { BistroUmbrellaSetProp };
export { FountainHazardProp };
export { CurvedGutterCornerProp };
export { PigeonFlockProp };
export {
  StreetBollardProp,
  StreetTreeProp,
  OverhangingStreetTreeProp,
  StreetLampProp,
  CornerBuildingAccentProp,
};
export { GolfBagAndTeeProp };
export {
  HazardConeProp,
  MenuAFrameBoardProp,
  SubwayBenchProp,
  TrashReceptacleProp,
  PlanterHedgeProp,
  SubwayPortalProp,
};
export {
  RooftopWaterTowerProp,
  AngledSkylightBankProp,
  GreenhousePergolaProp,
  HvacUpdraftFanProp,
  StoneViaductArchProp,
  CurvedBalustradeBankProp,
  GlassConservatoryProp,
  RooftopBellTowerProp,
  CopperSpiralChuteProp,
  NewspaperKioskProp,
  BrassTurnstileGateProp,
  VintageSubwayCarProp,
  SubwayMosaicPillarProp,
  GrandSubwayHeadhouseProp,
};

export type ExtendedQaPropType =
  | PropType
  | GrandEscapadePropType
  | 'golf_bag_tee'
  | 'corner_building_accent';

export interface MinimalQaPropSpec {
  id: string;
  type: ExtendedQaPropType;
  escapadePropType?: GrandEscapadePropType;
  position: [number, number, number];
  rotationY: number;
  localSize: [number, number, number];
}

export type RenderablePropSpec =
  | PlacedProp
  | CoursePropSpec
  | MinimalQaPropSpec;

export interface PlacedPropRendererProps {
  prop: RenderablePropSpec;
  ballPosition?: [number, number, number];
  selectedClub?: 'driver' | 'wedge' | 'skimmer' | 'putter';
  lastUmbrellaHitAt?: number;
  lastHydrantSurfAt?: number;
  lastFountainSplashAt?: number;
  lastVanRoofHitAt?: number;
  showWireframe?: boolean;
  /** QA toggle to force active gusts / scatter previews. */
  forceAction?: boolean;
  /** When true (QA single-asset stage), keep hydrant puddle at y = 0 datum instead of -0.17m road grade. */
  isStandaloneQA?: boolean;
}

function getBistroVariant(propId: string): BistroUmbrellaVariant {
  if (propId.includes('north-1') || propId.includes('south-2')) {
    return 'terracotta';
  }
  if (propId.includes('north-2')) {
    return 'ochre';
  }
  return 'mint';
}

function getTreeVariant(propId: string): 'emerald' | 'sunny' | 'peach' {
  if (propId.includes('east')) return 'sunny';
  if (propId.includes('north-corner')) return 'peach';
  return 'emerald';
}

/**
 * Renders any CoursePropSpec or PlacedProp dynamically by PropType, preserving exact
 * COURSE_MASTER_PLAN coordinates, dimensions, angles, and coaxial geometry.
 */
export const PlacedPropRenderer = React.memo(function PlacedPropRenderer({
  prop,
  ballPosition,
  selectedClub = 'driver',
  lastUmbrellaHitAt = -10,
  lastHydrantSurfAt = -10,
  lastFountainSplashAt = -10,
  lastVanRoofHitAt = -10,
  showWireframe = false,
  forceAction = false,
  isStandaloneQA = false,
}: PlacedPropRendererProps) {
  const courseProp = prop as CoursePropSpec;
  const pos: [number, number, number] = [
    prop.position[0],
    prop.position[1],
    prop.position[2],
  ];
  const rotY = prop.rotationY;
  const resolvedType: ExtendedQaPropType =
    courseProp.escapadePropType ?? prop.type;

  const wrapStage2 = (node: React.ReactNode) => (
    <group
      name={`esc-prop-${prop.id}`}
      position={pos}
      rotation={[0, rotY, 0]}
    >
      {node}
      {showWireframe && (
        <mesh
          position={[0, prop.localSize[1] * 0.5, 0]}
          material={TOYBOX_MATERIALS.qaBoundsWireframe}
        >
          <boxGeometry args={prop.localSize} />
        </mesh>
      )}
    </group>
  );

  switch (resolvedType) {
    case 'hotdog_cart_umbrella':
      return (
        <HotdogCartProp
          position={pos}
          rotationY={rotY}
          lastHitAt={lastUmbrellaHitAt}
          pitchDeg={courseProp.hotdogAwningMeta?.pitchDeg ?? 28}
          restitution={courseProp.hotdogAwningMeta?.restitution ?? 0.28}
          showWireframe={showWireframe}
        />
      );
    case 'fire_hydrant_jet':
      return (
        <FireHydrantJetProp
          position={pos}
          rotationY={rotY}
          jetRangeMeters={0.71}
          gutterDropY={isStandaloneQA ? 0 : -0.17}
          streamOffsetX={-0.05}
          lastSurfAt={lastHydrantSurfAt}
          showWireframe={showWireframe}
        />
      );
    case 'subway_steam_grate':
      return (
        <SubwaySteamGrateProp
          position={pos}
          rotationY={rotY}
          width={prop.localSize[0]}
          depth={prop.localSize[2]}
          cycleSeconds={courseProp.steamLiftMeta?.cycleSeconds ?? 3.2}
          gustActiveSeconds={courseProp.steamLiftMeta?.activeSeconds ?? 1.6}
          forceGust={forceAction}
          showWireframe={showWireframe}
        />
      );
    case 'scaffolding_tunnel':
      return (
        <ScaffoldingTunnelProp
          position={pos}
          rotationY={rotY}
          width={prop.localSize[0]}
          depth={prop.localSize[2]}
          clearHeight={courseProp.scaffoldingMeta?.clearHeightMeters ?? 2.35}
          wallGapMeters={courseProp.scaffoldingMeta?.wallGapMeters ?? 0}
          showWireframe={showWireframe}
        />
      );
    case 'delivery_box_van':
      return (
        <DeliveryBoxVanProp
          position={pos}
          rotationY={rotY}
          lastRoofHitAt={lastVanRoofHitAt}
          propId={prop.id}
          showWireframe={showWireframe}
        />
      );
    case 'bistro_umbrella_set':
      return (
        <BistroUmbrellaSetProp
          position={pos}
          rotationY={rotY}
          lastHitAt={lastUmbrellaHitAt}
          variant={getBistroVariant(prop.id)}
          showWireframe={showWireframe}
        />
      );
    case 'fountain_water_hazard':
      return (
        <FountainHazardProp
          position={pos}
          radius={prop.localSize[0] * 0.5}
          lastSplashAt={lastFountainSplashAt}
          showWireframe={showWireframe}
        />
      );
    case 'curved_gutter_corner':
      return (
        <CurvedGutterCornerProp
          position={pos}
          rotationY={rotY}
          showWireframe={showWireframe}
        />
      );
    case 'pigeon_flock':
      return (
        <PigeonFlockProp
          position={pos}
          rotationY={rotY}
          ballPosition={ballPosition}
          forceScatter={forceAction}
          showWireframe={showWireframe}
        />
      );
    case 'brass_bollard':
      return (
        <StreetBollardProp
          position={pos}
          rotationY={rotY}
          showWireframe={showWireframe}
        />
      );
    case 'street_tree':
      return (
        <StreetTreeProp
          position={pos}
          variant={getTreeVariant(prop.id)}
          phase={prop.position[0] + prop.position[2]}
          showWireframe={showWireframe}
        />
      );
    case 'overhanging_street_tree':
      return (
        <OverhangingStreetTreeProp
          position={pos}
          rotationY={rotY}
          phase={prop.position[0] + prop.position[2]}
          showWireframe={showWireframe}
        />
      );
    case 'street_lamp':
      return (
        <StreetLampProp
          position={pos}
          rotationY={rotY}
          showWireframe={showWireframe}
        />
      );
    case 'hazard_cone':
      return (
        <HazardConeProp
          position={pos}
          rotationY={rotY}
          showWireframe={showWireframe}
        />
      );
    case 'menu_a_frame_board':
      return (
        <MenuAFrameBoardProp
          position={pos}
          rotationY={rotY}
          showWireframe={showWireframe}
        />
      );
    case 'subway_bench':
      return (
        <SubwayBenchProp
          position={pos}
          rotationY={rotY}
          showWireframe={showWireframe}
        />
      );
    case 'trash_receptacle':
      return (
        <TrashReceptacleProp
          position={pos}
          rotationY={rotY}
          showWireframe={showWireframe}
        />
      );
    case 'planter_hedge_rough':
      return (
        <PlanterHedgeProp
          position={pos}
          rotationY={rotY}
          width={prop.localSize[0]}
          depth={prop.localSize[2]}
          propId={prop.id}
          showWireframe={showWireframe}
        />
      );
    case 'subway_entrance_portal':
      return (
        <SubwayPortalProp
          position={pos}
          rotationY={rotY}
          propId={prop.id}
          showWireframe={showWireframe}
        />
      );
    case 'golf_bag_tee':
      return (
        <GolfBagAndTeeProp
          position={pos}
          rotationY={rotY}
          selectedClub={selectedClub}
          showWireframe={showWireframe}
        />
      );
    case 'corner_building_accent':
      return (
        <CornerBuildingAccentProp
          position={pos}
          rotationY={rotY}
          showWireframe={showWireframe}
        />
      );
    case 'rooftop_water_tower':
      return wrapStage2(<RooftopWaterTowerProp propId={prop.id} />);
    case 'angled_skylight_bank':
      return wrapStage2(<AngledSkylightBankProp propId={prop.id} />);
    case 'greenhouse_pergola':
      return wrapStage2(<GreenhousePergolaProp propId={prop.id} />);
    case 'hvac_updraft_fan':
      return wrapStage2(
        <HvacUpdraftFanProp
          propId={prop.id}
          isStandaloneQA={isStandaloneQA}
          forceAction={forceAction}
        />,
      );
    case 'stone_viaduct_arch':
      return wrapStage2(<StoneViaductArchProp propId={prop.id} />);
    case 'curved_balustrade_bank':
      return wrapStage2(<CurvedBalustradeBankProp />);
    case 'glass_conservatory':
      return wrapStage2(<GlassConservatoryProp propId={prop.id} />);
    case 'rooftop_bell_tower':
      return wrapStage2(<RooftopBellTowerProp propId={prop.id} />);
    case 'copper_spiral_chute':
      return wrapStage2(<CopperSpiralChuteProp propId={prop.id} />);
    case 'newspaper_kiosk':
      return wrapStage2(<NewspaperKioskProp propId={prop.id} />);
    case 'brass_turnstile_gate':
      return wrapStage2(<BrassTurnstileGateProp propId={prop.id} />);
    case 'vintage_subway_car':
      return wrapStage2(<VintageSubwayCarProp propId={prop.id} />);
    case 'subway_mosaic_pillar':
      return wrapStage2(<SubwayMosaicPillarProp propId={prop.id} />);
    case 'grand_subway_headhouse':
      return wrapStage2(<GrandSubwayHeadhouseProp propId={prop.id} />);
    default:
      return null;
  }
});

export interface CoursePropsWorldProps {
  ballPosition?: [number, number, number];
  selectedClub?: 'driver' | 'wedge' | 'skimmer' | 'putter';
  lastUmbrellaHitAt?: number;
  lastHydrantSurfAt?: number;
  lastFountainSplashAt?: number;
  lastVanRoofHitAt?: number;
  showWireframe?: boolean;
  /** Render the start-tee welcome mat & miniature golf bag at COURSE_MASTER_PLAN teePosition. */
  showTeeSet?: boolean;
}

/**
 * Master-plan prop assembly mounting all 25 COURSE_PROPS from COURSE_MASTER_PLAN
 * plus the start-tee welcome mat & miniature stand bag at Hole 1 Tee.
 */
export function CoursePropsWorld({
  ballPosition,
  selectedClub = 'driver',
  lastUmbrellaHitAt = -10,
  lastHydrantSurfAt = -10,
  lastFountainSplashAt = -10,
  lastVanRoofHitAt = -10,
  showWireframe = false,
  showTeeSet = true,
}: CoursePropsWorldProps) {
  const tee = COURSE_MASTER_PLAN.teePosition;

  return (
    <group name="course-props-world">
      {COURSE_PROPS.map((prop) => (
        <PlacedPropRenderer
          key={prop.id}
          prop={prop}
          ballPosition={ballPosition}
          selectedClub={selectedClub}
          lastUmbrellaHitAt={lastUmbrellaHitAt}
          lastHydrantSurfAt={lastHydrantSurfAt}
          lastFountainSplashAt={lastFountainSplashAt}
          lastVanRoofHitAt={lastVanRoofHitAt}
          showWireframe={showWireframe}
          isStandaloneQA={false}
        />
      ))}

      {showTeeSet && (
        <GolfBagAndTeeProp
          position={[tee[0], tee[1], tee[2]]}
          rotationY={0}
          selectedClub={selectedClub}
          showWireframe={showWireframe}
        />
      )}
    </group>
  );
}

/* ============================================================================
 * QA GALLERY METADATA REGISTRY (Derived directly from COURSE_PROPS + extras)
 * ============================================================================ */

export interface CoaxialAxleIndicator {
  label: string;
  start: [number, number, number];
  end: [number, number, number];
}

export interface PropQAGalleryEntry {
  id: string;
  title: string;
  propType: ExtendedQaPropType;
  escapadePropType?: GrandEscapadePropType;
  category:
    | 'hero-obstacle'
    | 'dynamic-hazard'
    | 'courtyard-furniture'
    | 'street-architecture';
  description: string;
  localSize: [number, number, number];
  localBoundsMin: [number, number, number];
  localBoundsMax: [number, number, number];
  coaxialAxles: CoaxialAxleIndicator[];
  courseProp?: CoursePropSpec;
}

function getCategoryForProp(type: PropType): PropQAGalleryEntry['category'] {
  switch (type) {
    case 'scaffolding_tunnel':
    case 'delivery_box_van':
    case 'hotdog_cart_umbrella':
    case 'overhanging_street_tree':
      return 'hero-obstacle';
    case 'fire_hydrant_jet':
    case 'subway_steam_grate':
    case 'fountain_water_hazard':
    case 'curved_gutter_corner':
      return 'dynamic-hazard';
    case 'bistro_umbrella_set':
    case 'planter_hedge_rough':
    case 'subway_bench':
    case 'menu_a_frame_board':
    case 'trash_receptacle':
      return 'courtyard-furniture';
    default:
      return 'street-architecture';
  }
}

function getTitleForProp(prop: CoursePropSpec): string {
  const labels: Record<PropType, string> = {
    scaffolding_tunnel: 'Sidewalk Scaffolding Shed',
    delivery_box_van: 'Bakery Delivery Box Van + Ramp',
    hotdog_cart_umbrella: 'Hotdog Cart + 28° Awning',
    fire_hydrant_jet: 'Spewing Fire Hydrant',
    subway_steam_grate: 'Subway Steam Vent Grate',
    fountain_water_hazard: 'Octagonal Stone Fountain',
    bistro_umbrella_set: 'Venice Café Bistro Set',
    curved_gutter_corner: 'Curved Storm Gutter Corner',
    pigeon_flock: 'Low-Poly Pigeon Flock',
    brass_bollard: 'Sidewalk Brass Bollard',
    street_tree: 'Street Tree in Tree-Pit Ring',
    overhanging_street_tree: 'Overhanging East Street Tree',
    street_lamp: 'Venetian Streetlamp',
    hazard_cone: 'Reflective Hazard Cone',
    menu_a_frame_board: 'Chalkboard Menu A-Frame',
    subway_bench: 'Slatted Wood Corner Bench',
    trash_receptacle: 'Hooded Urban Trash Bin',
    planter_hedge_rough: 'Limestone Boxwood Planter',
    subway_entrance_portal: '5th & Mercer Subway Portal',
  };
  const suffix = prop.id
    .replace(/^[a-z]+-/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return `${labels[prop.type]} (${suffix})`;
}

function getCoaxialAxlesForProp(prop: CoursePropSpec): CoaxialAxleIndicator[] {
  switch (prop.type) {
    case 'hotdog_cart_umbrella':
      return [
        { label: 'Wheel Axle (X)', start: [-0.95, 0.34, 0], end: [0.95, 0.34, 0] },
        {
          label: '28° Awning Ridge',
          start: [0, 2.54, -0.73],
          end: [0, 1.76, 0.73],
        },
      ];
    case 'delivery_box_van':
      return [
        {
          label: 'Rear Wheel Axle (X)',
          start: [-1.05, 0.36, -0.22],
          end: [1.05, 0.36, -0.22],
        },
        {
          label: 'Front Wheel Axle (X)',
          start: [-1.05, 0.36, 2.68],
          end: [1.05, 0.36, 2.68],
        },
      ];
    case 'fire_hydrant_jet':
      return [
        { label: 'Hydrant Body Axis (Y)', start: [0, 0, 0], end: [0, 0.92, 0] },
        {
          label: 'Side Nozzle Axis (X)',
          start: [-0.26, 0.56, 0],
          end: [0.26, 0.56, 0],
        },
      ];
    case 'bistro_umbrella_set':
      return [{ label: 'Umbrella Pole Axis (Y)', start: [0, 0, 0], end: [0, 2.34, 0] }];
    case 'street_lamp':
      return [
        { label: 'Lamp Column Axis (Y)', start: [0, 0, 0], end: [0, 3.15, 0] },
        {
          label: 'Lantern Cage Axis (Y)',
          start: [0, 2.55, 0.48],
          end: [0, 3.35, 0.48],
        },
      ];
    case 'fountain_water_hazard':
      return [{ label: 'Pedestal Symmetry (Y)', start: [0, 0, 0], end: [0, 1.44, 0] }];
    default:
      return [];
  }
}

function getBoundsForProp(prop: CoursePropSpec): {
  min: [number, number, number];
  max: [number, number, number];
} {
  if (prop.type === 'overhanging_street_tree') {
    return {
      min: [-4.4, 0, -1.45],
      max: [1.45, 5.45, 2.6],
    };
  }
  const hx = prop.localSize[0] * 0.5;
  const hz = prop.localSize[2] * 0.5;
  return {
    min: [-hx, 0, -hz],
    max: [hx, prop.localSize[1], hz],
  };
}

export const PROP_QA_REGISTRY: PropQAGalleryEntry[] = [
  ...COURSE_PROPS.map((prop): PropQAGalleryEntry => {
    const bounds = getBoundsForProp(prop);
    return {
      id: prop.id,
      title: getTitleForProp(prop),
      propType: prop.type,
      category: getCategoryForProp(prop.type),
      description: `${prop.name} · World: [${prop.position[0].toFixed(2)}, ${prop.position[1].toFixed(2)}, ${prop.position[2].toFixed(2)}]m.`,
      localSize: [prop.localSize[0], prop.localSize[1], prop.localSize[2]],
      localBoundsMin: bounds.min,
      localBoundsMax: bounds.max,
      coaxialAxles: getCoaxialAxlesForProp(prop),
      courseProp: prop,
    };
  }),
  {
    id: 'tee-mat-and-bag',
    title: 'Hole 1 Tee Mat & Stand Bag',
    propType: 'golf_bag_tee',
    category: 'street-architecture',
    description:
      'Compact brass-trimmed welcome tee pad & tour stand bag grounded flush on asphalt at TEE_POSITION [0, 0, 27.52].',
    localSize: [...TEE_SET_LOCAL_BOUNDS.size],
    localBoundsMin: [...TEE_SET_LOCAL_BOUNDS.min],
    localBoundsMax: [...TEE_SET_LOCAL_BOUNDS.max],
    coaxialAxles: [],
  },
  {
    id: 'curved-gutter-corner',
    title: 'Curved Storm-Drain Corner Grate',
    propType: 'curved_gutter_corner',
    category: 'dynamic-hazard',
    description:
      'Banked 90-degree storm gutter & steel catch-basin corner guide seated flush at y = 0.',
    localSize: [1.45, 0.22, 1.45],
    localBoundsMin: [-0.725, 0, -0.725],
    localBoundsMax: [0.725, 0.22, 0.725],
    coaxialAxles: [],
  },
  {
    id: 'corner-building-accent',
    title: 'Storefront Accent Vignette',
    propType: 'corner_building_accent',
    category: 'street-architecture',
    description:
      'Grounded terracotta brownstone storefront bay with sunlit awning, cornice & window flowerboxes.',
    localSize: [4.4, 5.6, 0.72],
    localBoundsMin: [-2.2, 0, -0.36],
    localBoundsMax: [2.2, 5.6, 0.36],
    coaxialAxles: [],
  },
  ...GRAND_ESCAPADE_QA_PROP_SPECS.map((spec): PropQAGalleryEntry => {
    const matchProp = ESCAPADE_COURSE_PROPS.find(
      (p) => p.escapadePropType === spec.escapadePropType,
    );
    const axles: CoaxialAxleIndicator[] =
      spec.escapadePropType === 'rooftop_water_tower'
        ? [{ label: 'Cedar Barrel Axis (Y)', start: [0, 0, 0], end: [0, 5.7, 0] }]
        : spec.escapadePropType === 'hvac_updraft_fan'
          ? [{ label: 'Impeller Turbine Axis (Y)', start: [0, 0, 0], end: [0, 0.34, 0] }]
          : spec.escapadePropType === 'rooftop_bell_tower'
            ? [
                { label: 'Belfry Tower Axis (Y)', start: [0, 0, 0], end: [0, 6.4, 0] },
                { label: 'Bell Yoke Axis (X)', start: [-0.7, 4.18, 0], end: [0.7, 4.18, 0] },
              ]
            : spec.escapadePropType === 'copper_spiral_chute'
              ? [{ label: 'Helical Downspout Mast (Y)', start: [0, 0, 0], end: [0, 12.8, 0] }]
              : spec.escapadePropType === 'vintage_subway_car'
                ? [
                    { label: 'Pass-Through Aisle (Z)', start: [0, 0.2, -6.8], end: [0, 0.2, 6.8] },
                    { label: 'Side Door Center Axis (X)', start: [-1.55, 1.3, 0], end: [1.55, 1.3, 0] },
                  ]
                : spec.escapadePropType === 'grand_subway_headhouse'
                  ? [{ label: 'Open Portal Throat (Z)', start: [0, 0.2, -1.2], end: [0, 0.2, 1.2] }]
                  : [];
    return {
      id: spec.id,
      title: `Z${spec.zoneNumber}: ${spec.title}`,
      propType: spec.escapadePropType,
      escapadePropType: spec.escapadePropType,
      category: spec.category,
      description: spec.description,
      localSize: [spec.localSize[0], spec.localSize[1], spec.localSize[2]],
      localBoundsMin: [
        spec.localBoundsMin[0],
        spec.localBoundsMin[1],
        spec.localBoundsMin[2],
      ],
      localBoundsMax: [
        spec.localBoundsMax[0],
        spec.localBoundsMax[1],
        spec.localBoundsMax[2],
      ],
      coaxialAxles: axles,
      courseProp: matchProp,
    };
  }),
];
