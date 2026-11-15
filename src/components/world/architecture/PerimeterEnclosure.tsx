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
  CourseId,
  CourtyardPergolaSpec,
  PerimeterBuildingSpec,
  StringLightSpanSpec,
  SubwayVaultEnclosureSpec,
} from '@/types/course';
import type { RectBoundsXZ } from '../street/streetGeometry';
import { BuildingFacadeModule } from './BuildingFacadeModule';
import {
  ArchitecturalWallsGroup,
  CourtyardPergolaMesh,
  SkylineAndHorizonSkirt,
  StringLightSpansGroup,
} from './ArchitecturalFeatures';

export interface PerimeterEnclosureProps {
  courseId?: CourseId;
  buildings?: PerimeterBuildingSpec[];
  walls?: ArchitecturalWallSpec[];
  pergola?: CourtyardPergolaSpec;
  stringLights?: StringLightSpanSpec[];
  skylineBackdrops?: PerimeterBuildingSpec[];
  outerGroundSkirt?: { boundsXZ: RectBoundsXZ; topY: number };
  subwayStationVault?: SubwayVaultEnclosureSpec;
  showHorizon?: boolean;
  showWireframe?: boolean;
}

/**
 * Complete 360-degree zero-gap architectural enclosure:
 * perimeter storefronts & brownstones, retaining/parapet/subway ceramic vault walls,
 * timber courtyard pergola, overhead catenary string lights, and skyline/horizon skirt.
 */
export const PerimeterEnclosure = React.memo(function PerimeterEnclosure({
  courseId = 'classic',
  buildings = PERIMETER_BUILDINGS,
  walls = ARCHITECTURAL_WALLS,
  pergola = COURTYARD_PERGOLA,
  stringLights = STRING_LIGHT_SPANS,
  skylineBackdrops = SKYLINE_BACKDROPS,
  outerGroundSkirt,
  subwayStationVault,
  showHorizon = true,
  showWireframe = false,
}: PerimeterEnclosureProps) {
  const isGrandEscapade = courseId === 'grand-escapade';
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

      {/* Courtyard, parapet, balustrade & subway station ceramic walls */}
      <ArchitecturalWallsGroup
        walls={walls}
        subwayStationVault={subwayStationVault}
        showWireframe={showWireframe}
      />

      {/* Courtyard timber & wrought-iron pergola framing the pocket-park green */}
      {!isGrandEscapade && <CourtyardPergolaMesh pergola={pergola} />}

      {/* Catenary warm glowing cafe string lights across zones */}
      <StringLightSpansGroup spans={stringLights} />

      {/* Distant skyline silhouettes & continuous horizon earth skirt */}
      {showHorizon && (
        <SkylineAndHorizonSkirt
          backdrops={skylineBackdrops}
          outerGroundSkirt={outerGroundSkirt}
          isGrandEscapade={isGrandEscapade}
        />
      )}
    </group>
  );
});
