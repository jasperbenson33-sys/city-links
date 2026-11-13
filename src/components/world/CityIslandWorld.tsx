'use client';

import React from 'react';
import type {
  ClubId,
  FlagColor,
  GeneratedCityCourse,
  Vec3Tuple,
} from '@/types';
import { TOYBOX_MATERIALS } from '@/materials';
import { LightingAndSky } from './LightingAndSky';
import { BeveledCutawayPlinth } from './BeveledCutawayPlinth';
import { PlacedTileRenderer } from './tiles';
import {
  CornerBuildingAccentProp,
  GolfBagAndTeeProp,
  PlacedPropRenderer,
} from './props';

export interface CityIslandWorldProps {
  /** Procedurally generated & validated 6x6 Curbside Links island course. */
  course: GeneratedCityCourse;
  /** Live sunk status keyed by flag color ('red' | 'yellow' | 'blue' | 'purple' | 'green'). */
  sunkFlags?: Partial<Record<FlagColor, boolean>>;
  /** Currently equipped club (updates tour bag club preview beside start tee). */
  selectedClub?: ClubId;
  /** Live ball world coordinates for proximity-reactive props like scattering pigeons. */
  ballPosition?: Vec3Tuple;
  /** Last hit timestamps keyed by prop ID or PropType (ms or sec) for bounce/splash reactions. */
  propHitTimestamps?: Record<string, number>;
  /** Include sunlit tabletop lighting, sky dome, clouds & skyline (default true). */
  includeLighting?: boolean;
  /** Toggle pastel horizon sky/skyline (false for dark/neutral studio backgrounds). */
  showHorizon?: boolean;
  /** Show subtle outer north-edge low-profile brownstone architectural accents. */
  showCornerBuildings?: boolean;
  /** QA toggle to display physics/sensor wireframes across all tiles & props. */
  showWireframe?: boolean;
  /** QA toggle to force active steam gusts & bird scatter previews. */
  forceAction?: boolean;
}

/**
 * Primary Curbside Links 3D diorama world assembly.
 * Renders the 48m x 48m beveled museum plinth, all 36 modular tiles, all 5 color-coded
 * cups & flags, all coaxial reactive/hazard props, and the start tee golf stand bag.
 */
export function CityIslandWorld({
  course,
  sunkFlags,
  selectedClub = 'driver',
  ballPosition,
  propHitTimestamps,
  includeLighting = true,
  showHorizon = true,
  showCornerBuildings = true,
  showWireframe = false,
  forceAction = false,
}: CityIslandWorldProps) {
  return (
    <group name="city-island-world">
      {includeLighting && (
        <LightingAndSky showHorizon={showHorizon} shadowSpan={32} />
      )}

      {/* Museum architectural cutaway plinth framing the 48m x 48m playfield */}
      <BeveledCutawayPlinth islandSize={course.islandSize} />

      {/* Low-profile brownstone/cafe architectural wings along North exterior edge on full-depth plinth pedestals */}
      {showCornerBuildings && (
        <group name="north-perimeter-architectural-accents">
          {([-20.8, 20.8] as const).map((wx, idx) => (
            <group key={wx} position={[wx, 0, -25.55]}>
              {/* Limestone rim cap flush at y = 0 */}
              <mesh
                receiveShadow
                position={[0, -0.17, 0]}
                material={TOYBOX_MATERIALS.plinthRimLip}
              >
                <boxGeometry args={[3.2, 0.34, 2.3]} />
              </mesh>
              {/* Earth strata pedestal column */}
              <mesh
                receiveShadow
                position={[0, -0.78, 0.1]}
                material={TOYBOX_MATERIALS.plinthEarthCutaway}
              >
                <boxGeometry args={[3.3, 0.92, 2.4]} />
              </mesh>
              {/* Walnut cutaway mid tier */}
              <mesh
                receiveShadow
                position={[0, -1.52, 0.12]}
                material={TOYBOX_MATERIALS.plinthStrataMid}
              >
                <boxGeometry args={[3.6, 0.62, 2.6]} />
              </mesh>
              {/* Stepped beveled walnut base footer down to y = -2.47 */}
              <mesh
                receiveShadow
                position={[0, -2.14, 0.16]}
                material={TOYBOX_MATERIALS.plinthWalnutBase}
              >
                <boxGeometry args={[3.9, 0.66, 2.9]} />
              </mesh>
              <CornerBuildingAccentProp
                position={[0, 0, 0]}
                rotationY={0}
                variant={idx === 0 ? 'terracotta' : 'cream'}
                showWireframe={showWireframe}
              />
            </group>
          ))}
        </group>
      )}

      {/* 6x6 Modular 8m x 8m City Tiles & Color-Coded Cups */}
      <group name="modular-city-tiles">
        {course.tiles.map((tile) => (
          <PlacedTileRenderer
            key={tile.id}
            tile={tile}
            isSunk={Boolean(tile.flagColor && sunkFlags?.[tile.flagColor])}
            showWireframe={showWireframe}
          />
        ))}
      </group>

      {/* Start Tee Pad + Interactive Golf Stand Bag */}
      <GolfBagAndTeeProp
        position={course.startTeePosition}
        rotationY={course.initialAimYaw}
        selectedClub={selectedClub}
        showBag={true}
        showWireframe={showWireframe}
      />

      {/* Reactive & Accent Props */}
      <group name="course-props">
        {course.props.map((prop) => {
          const hitTs =
            propHitTimestamps?.[prop.id] ??
            propHitTimestamps?.[prop.type] ??
            -10;
          return (
            <PlacedPropRenderer
              key={prop.id}
              prop={prop}
              ballPosition={ballPosition}
              lastHitAt={hitTs}
              showWireframe={showWireframe}
              forceAction={forceAction}
            />
          );
        })}
      </group>
    </group>
  );
}
