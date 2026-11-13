'use client';

import React from 'react';
import {
  ARCHITECTURAL_WALLS,
  COURTYARD_PERGOLA,
  PERIMETER_BUILDINGS,
  SKYLINE_BACKDROPS,
  STRING_LIGHT_SPANS,
} from '@/config/courseMasterPlan';
import type {
  ArchitecturalWallSpec,
  CourtyardPergolaSpec,
  PerimeterBuildingSpec,
  StringLightSpanSpec,
} from '@/types/course';
import { BuildingFacadeModule } from './BuildingFacadeModule';
import {
  ArchitecturalWallsGroup,
  CourtyardPergolaMesh,
  SkylineAndHorizonSkirt,
  StringLightSpansGroup,
} from './ArchitecturalFeatures';

export interface PerimeterEnclosureProps {
  buildings?: PerimeterBuildingSpec[];
  walls?: ArchitecturalWallSpec[];
  pergola?: CourtyardPergolaSpec;
  stringLights?: StringLightSpanSpec[];
  skylineBackdrops?: PerimeterBuildingSpec[];
  showHorizon?: boolean;
  showWireframe?: boolean;
}

/**
 * Complete 360-degree zero-gap architectural enclosure for Hole 1 (5th & Mercer):
 * 16+ perimeter storefronts & brownstones, subway & courtyard retaining/planter walls,
 * timber courtyard pergola, overhead catenary string lights, and skyline/horizon skirt.
 */
export const PerimeterEnclosure = React.memo(function PerimeterEnclosure({
  buildings = PERIMETER_BUILDINGS,
  walls = ARCHITECTURAL_WALLS,
  pergola = COURTYARD_PERGOLA,
  stringLights = STRING_LIGHT_SPANS,
  skylineBackdrops = SKYLINE_BACKDROPS,
  showHorizon = true,
  showWireframe = false,
}: PerimeterEnclosureProps) {
  return (
    <group name="venice-perimeter-enclosure">
      {/* Inner 360-degree zero-gap perimeter storefronts & brownstones */}
      <group name="perimeter-buildings-ring">
        {buildings.map((bld) => (
          <BuildingFacadeModule
            key={bld.id}
            building={bld}
            centered={false}
            showWireframe={showWireframe}
          />
        ))}
      </group>

      {/* Subway plaza retaining wall & courtyard wrought-iron planter wall */}
      <ArchitecturalWallsGroup walls={walls} showWireframe={showWireframe} />

      {/* Courtyard timber & wrought-iron pergola framing the pocket-park green */}
      <CourtyardPergolaMesh pergola={pergola} />

      {/* Catenary warm glowing cafe string lights across 5th Ave, Mercer St & Courtyard */}
      <StringLightSpansGroup spans={stringLights} />

      {/* Distant Venetian Campanile, skyline silhouettes & continuous horizon earth skirt */}
      {showHorizon && <SkylineAndHorizonSkirt backdrops={skylineBackdrops} />}
    </group>
  );
});
