'use client';

import React, { useMemo } from 'react';
import { COURSE_MASTER_PLAN } from '@/config/courseMasterPlan';
import type {
  ClubId,
  CourseMasterPlan,
  CoursePropSpec,
  FlagColor,
  Vec3Tuple,
} from '@/types';
import { LightingAndSky } from './LightingAndSky';
import { PerimeterEnclosure } from './architecture';
import { StreetSurfaceWorld } from './street';
import { CupFlagAssembly } from './tiles';
import { GolfBagAndTeeProp, PlacedPropRenderer } from './props';

export interface VeniceStreetWorldProps {
  /** Authoritative street-level CAD master plan (defaults to COURSE_MASTER_PLAN for Hole 1). */
  plan?: CourseMasterPlan;
  /** Live ball world coordinates for proximity-reactive props (pigeons, steam gusts). */
  ballPosition?: Vec3Tuple;
  /** Currently equipped club (updates tour bag club preview beside start tee). */
  selectedClub?: ClubId;
  /** Last hit timestamps keyed by prop ID or PropType for bounce/splash reactions. */
  propHitTimestamps?: Record<string, number>;
  /** Whether Hole 1 cup has been sunk cleanly. */
  isHoleSunk?: boolean;
  /** Legacy flag-color sunk map (fallback if isHoleSunk is omitted). */
  sunkFlags?: Partial<Record<FlagColor, boolean>>;
  /** QA toggle to display wireframe helpers & colliders across facades, ramps, and props. */
  showWireframe?: boolean;
  /** QA toggle to force active steam gusts & reactive prop states. */
  forceAction?: boolean;
  /** Include Walkabout: Venice golden-hour lighting, sky gradient dome, clouds & fog (default true). */
  includeLighting?: boolean;
  /** Toggle horizon dome & distant skyline silhouettes (default true). */
  showHorizon?: boolean;
}

const DEFAULT_SHADOW_TARGET: [number, number, number] = [9, 0, 2];

const VeniceStaticBackdrop = React.memo(function VeniceStaticBackdrop({
  plan,
  includeLighting,
  showHorizon,
  showWireframe,
}: {
  plan: CourseMasterPlan;
  includeLighting: boolean;
  showHorizon: boolean;
  showWireframe: boolean;
}) {
  return (
    <group name="venice-static-backdrop">
      {includeLighting && (
        <LightingAndSky
          showHorizon={showHorizon}
          shadowTarget={DEFAULT_SHADOW_TARGET}
        />
      )}

      {/* 360-degree zero-gap architectural enclosure, walls, pergola, café lights & skyline */}
      <PerimeterEnclosure
        buildings={plan.perimeterBuildings}
        walls={plan.architecturalWalls}
        pergola={plan.courtyardPergola}
        stringLights={plan.stringLightSpans}
        skylineBackdrops={plan.skylineBackdrops}
        showHorizon={showHorizon}
        showWireframe={showWireframe}
      />

      {/* Streets, curbs, recessed gutters, crosswalk, loading zone, ramps & courtyard turf (cup decoupled) */}
      <StreetSurfaceWorld
        zones={plan.groundZones}
        gutters={plan.gutters}
        drainGrates={plan.stormGrates}
        curbs={plan.curbs}
        ramps={plan.ramps}
        crosswalk={plan.aPositionCrosswalk}
        vanLoadingZone={plan.vanLoadingZone}
        cup={plan.cup}
        includeCupAssembly={false}
        showWireframe={showWireframe}
      />
    </group>
  );
});

const StaticCoursePropsLayer = React.memo(function StaticCoursePropsLayer({
  staticProps,
  showWireframe,
}: {
  staticProps: CoursePropSpec[];
  showWireframe: boolean;
}) {
  return (
    <group name="venice-static-props">
      {staticProps.map((prop) => (
        <PlacedPropRenderer
          key={prop.id}
          prop={prop}
          showWireframe={showWireframe}
          isStandaloneQA={false}
        />
      ))}
    </group>
  );
});

function isDynamicProp(prop: CoursePropSpec): boolean {
  return (
    prop.type === 'hotdog_cart_umbrella' ||
    prop.type === 'bistro_umbrella_set' ||
    prop.type === 'fire_hydrant_jet' ||
    prop.type === 'fountain_water_hazard' ||
    prop.type === 'delivery_box_van' ||
    prop.type === 'pigeon_flock' ||
    prop.type === 'subway_steam_grate'
  );
}

/**
 * Primary Curbside Links 3D street world assembly ("Hole 1: 5th & Mercer" — Par 4, 72m Dogleg Right).
 * Wraps the entire static architectural enclosure & street surface hierarchy in `React.memo`
 * so ball movement or UI updates never re-render the city geometry.
 */
export const VeniceStreetWorld = React.memo(function VeniceStreetWorld({
  plan = COURSE_MASTER_PLAN,
  ballPosition,
  selectedClub = 'driver',
  propHitTimestamps,
  isHoleSunk,
  sunkFlags,
  showWireframe = false,
  forceAction = false,
  includeLighting = true,
  showHorizon = true,
}: VeniceStreetWorldProps) {
  const resolvedHoleSunk =
    isHoleSunk ?? Boolean(sunkFlags?.[plan.cup.flagColor]);

  const { staticProps, dynamicProps } = useMemo(() => {
    const s: CoursePropSpec[] = [];
    const d: CoursePropSpec[] = [];
    for (const p of plan.props) {
      if (isDynamicProp(p)) d.push(p);
      else s.push(p);
    }
    return { staticProps: s, dynamicProps: d };
  }, [plan.props]);

  const teePos = useMemo<[number, number, number]>(
    () => [plan.teePosition[0], plan.teePosition[1], plan.teePosition[2]],
    [plan.teePosition],
  );

  const cupPos = useMemo<[number, number, number]>(() => {
    const surfaceY =
      plan.groundZones.find((z) => z.surfaceTag === 'putting_green_turf')
        ?.topY ?? plan.cup.elevationY;
    return [plan.cup.position[0], surfaceY, plan.cup.position[2]];
  }, [plan.groundZones, plan.cup.position, plan.cup.elevationY]);

  const fallbackHit = (id: string, fallbackType: string) =>
    propHitTimestamps?.[id] ?? propHitTimestamps?.[fallbackType] ?? -10;

  return (
    <group name="venice-street-world">
      <VeniceStaticBackdrop
        plan={plan}
        includeLighting={includeLighting}
        showHorizon={showHorizon}
        showWireframe={showWireframe}
      />

      {/* Decoupled Cup & Flag Assembly so hole-out never re-reconciles static city geometry */}
      <CupFlagAssembly
        position={cupPos}
        color={plan.cup.flagColor}
        isSunk={resolvedHoleSunk}
        cupRadius={plan.cup.cupRadius}
        cupDepth={plan.cup.cupDepth}
        poleHeight={plan.cup.pinHeight}
      />

      {/* Start Tee Pad + Interactive Tour Stand Bag */}
      <GolfBagAndTeeProp
        position={teePos}
        rotationY={plan.initialAimYaw}
        selectedClub={selectedClub}
        showBag
        showWireframe={showWireframe}
      />

      {/* Static streetscape & courtyard props isolated from dynamic prop updates */}
      <StaticCoursePropsLayer
        staticProps={staticProps}
        showWireframe={showWireframe}
      />

      {/* Reactive & proximity props — each memoized PlacedPropRenderer receives ONLY its own hit timestamp */}
      <group name="venice-dynamic-props">
        {dynamicProps.map((prop) => {
          const hitTs =
            propHitTimestamps?.[prop.id] ??
            propHitTimestamps?.[prop.type] ??
            -10;
          const umbTs =
            prop.type === 'hotdog_cart_umbrella'
              ? hitTs !== -10
                ? hitTs
                : fallbackHit('hotdog-cart-corner', 'hotdog_cart_umbrella')
              : prop.type === 'bistro_umbrella_set'
                ? propHitTimestamps?.[prop.id] ?? -10
                : -10;
          const hydTs =
            prop.type === 'fire_hydrant_jet'
              ? hitTs !== -10
                ? hitTs
                : fallbackHit('hydrant-corner-se', 'fire_hydrant_jet')
              : -10;
          const fntTs =
            prop.type === 'fountain_water_hazard'
              ? hitTs !== -10
                ? hitTs
                : fallbackHit('fountain-courtyard-front', 'fountain_water_hazard')
              : -10;
          const vanTs =
            prop.type === 'delivery_box_van'
              ? hitTs !== -10
                ? hitTs
                : fallbackHit('delivery-van-east', 'delivery_box_van')
              : -10;

          return (
            <PlacedPropRenderer
              key={prop.id}
              prop={prop}
              ballPosition={prop.type === 'pigeon_flock' ? ballPosition : undefined}
              lastUmbrellaHitAt={umbTs}
              lastHydrantSurfAt={hydTs}
              lastFountainSplashAt={fntTs}
              lastVanRoofHitAt={vanTs}
              showWireframe={showWireframe}
              forceAction={forceAction}
              isStandaloneQA={false}
            />
          );
        })}
      </group>

      {forceAction && <group name="qa-force-action-active" />}
    </group>
  );
});
