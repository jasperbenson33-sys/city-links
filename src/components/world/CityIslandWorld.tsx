'use client';

import React from 'react';
import type {
  ClubId,
  CourseMasterPlan,
  FlagColor,
  GeneratedCityCourse,
  Vec3Tuple,
} from '@/types';
import { COURSE_MASTER_PLAN } from '@/config/courseMasterPlan';
import { VeniceStreetWorld } from './VeniceStreetWorld';

export interface CityIslandWorldProps {
  /** Legacy generated course adapter (optional; Hole 1 renders from COURSE_MASTER_PLAN). */
  course?: GeneratedCityCourse;
  /** Authoritative street master plan override. */
  plan?: CourseMasterPlan;
  /** Explicit sunk state for Hole 1 Cup. */
  isHoleSunk?: boolean;
  /** Live sunk status keyed by flag color ('red' | 'yellow' | 'blue' | 'purple' | 'green'). */
  sunkFlags?: Partial<Record<FlagColor, boolean>>;
  /** Currently equipped club (updates tour bag club preview beside start tee). */
  selectedClub?: ClubId;
  /** Live ball world coordinates for proximity-reactive props like scattering pigeons. */
  ballPosition?: Vec3Tuple;
  /** Last hit timestamps keyed by prop ID or PropType for bounce/splash reactions. */
  propHitTimestamps?: Record<string, number>;
  /** Include golden-hour lighting, sky dome, clouds & skyline (default true). */
  includeLighting?: boolean;
  /** Toggle horizon sky dome & skyline silhouettes (default true). */
  showHorizon?: boolean;
  /** Retained legacy prop for API compatibility (perimeter ring is always sealed 360°). */
  showCornerBuildings?: boolean;
  /** QA toggle to display physics/sensor wireframes across facades, ramps, and props. */
  showWireframe?: boolean;
  /** QA toggle to force active steam gusts & bird scatter previews. */
  forceAction?: boolean;
}

/**
 * Compatible world wrapper delegating directly to `VeniceStreetWorld` ("Hole 1: 5th & Mercer")
 * so existing callers referencing `CityIslandWorld` render the upgraded Venice street world seamlessly.
 */
export const CityIslandWorld = React.memo(function CityIslandWorld({
  plan = COURSE_MASTER_PLAN,
  isHoleSunk,
  sunkFlags,
  selectedClub = 'driver',
  ballPosition,
  propHitTimestamps,
  includeLighting = true,
  showHorizon = true,
  showWireframe = false,
  forceAction = false,
}: CityIslandWorldProps) {
  return (
    <VeniceStreetWorld
      plan={plan}
      isHoleSunk={isHoleSunk}
      sunkFlags={sunkFlags}
      selectedClub={selectedClub}
      ballPosition={ballPosition}
      propHitTimestamps={propHitTimestamps}
      includeLighting={includeLighting}
      showHorizon={showHorizon}
      showWireframe={showWireframe}
      forceAction={forceAction}
    />
  );
});
