'use client';

import React from 'react';
import { TOYBOX_MATERIALS } from '@/materials';

export interface BeveledCutawayPlinthProps {
  /** Island width/depth in meters (default 48m for 6x6 grid of 8m tiles). */
  islandSize?: number;
}

/**
 * Architectural cutaway diorama pedestal framing the 48m x 48m floating city island.
 * All geometry sits strictly outside the [-24, +24] playfield or below y = -0.32m
 * so recessed Tier-0 water basins (-0.22m) and storm-drain gutters (-0.06m) never clip.
 */
export function BeveledCutawayPlinth({ islandSize = 48 }: BeveledCutawayPlinthProps) {
  const half = islandSize * 0.5;
  const skirtThick = 0.48;
  const skirtCenterOffset = half + skirtThick * 0.5;
  const fullSkirtSpan = islandSize + skirtThick * 2;

  return (
    <group name="beveled-cutaway-plinth">
      {/* Recessed sub-island soil strata bed (top at y = -0.32m, well under -0.22m water basins) */}
      <mesh
        receiveShadow
        position={[0, -0.78, 0]}
        material={TOYBOX_MATERIALS.plinthEarthCutaway}
      >
        <boxGeometry args={[islandSize + 0.5, 0.92, islandSize + 0.5]} />
      </mesh>

      {/* Mid cutaway walnut tier */}
      <mesh
        receiveShadow
        position={[0, -1.52, 0]}
        material={TOYBOX_MATERIALS.plinthStrataMid}
      >
        <boxGeometry args={[islandSize + 1.8, 0.62, islandSize + 1.8]} />
      </mesh>

      {/* Stepped beveled museum pedestal base */}
      <mesh
        receiveShadow
        position={[0, -2.14, 0]}
        material={TOYBOX_MATERIALS.plinthWalnutBase}
      >
        <boxGeometry args={[islandSize + 3.4, 0.66, islandSize + 3.4]} />
      </mesh>

      {/* Chamfered outer limestone rim collar (outside [-half, +half], top flush at y = -0.01m) */}
      <mesh
        receiveShadow
        position={[0, -0.18, skirtCenterOffset]}
        material={TOYBOX_MATERIALS.plinthRimLip}
      >
        <boxGeometry args={[fullSkirtSpan, 0.34, skirtThick]} />
      </mesh>
      <mesh
        receiveShadow
        position={[0, -0.18, -skirtCenterOffset]}
        material={TOYBOX_MATERIALS.plinthRimLip}
      >
        <boxGeometry args={[fullSkirtSpan, 0.34, skirtThick]} />
      </mesh>
      <mesh
        receiveShadow
        position={[-skirtCenterOffset, -0.18, 0]}
        material={TOYBOX_MATERIALS.plinthRimLip}
      >
        <boxGeometry args={[skirtThick, 0.34, islandSize]} />
      </mesh>
      <mesh
        receiveShadow
        position={[skirtCenterOffset, -0.18, 0]}
        material={TOYBOX_MATERIALS.plinthRimLip}
      >
        <boxGeometry args={[skirtThick, 0.34, islandSize]} />
      </mesh>

      {/* Architectural timber cutaway trim band on South (+Z) and side faces */}
      <mesh
        position={[0, -0.37, half + 0.68]}
        material={TOYBOX_MATERIALS.plinthStrataMid}
      >
        <boxGeometry args={[islandSize + 1.45, 0.14, 0.24]} />
      </mesh>
      <mesh
        position={[0, -0.37, -(half + 0.68)]}
        material={TOYBOX_MATERIALS.plinthStrataMid}
      >
        <boxGeometry args={[islandSize + 1.45, 0.14, 0.24]} />
      </mesh>

      {/* Brass Diorama Nameplate Plaque on South (+Z) Front Face */}
      <mesh
        position={[0, -1.52, half + 1.02]}
        material={TOYBOX_MATERIALS.plinthBrassPlaque}
      >
        <boxGeometry args={[7.4, 0.42, 0.16]} />
      </mesh>
    </group>
  );
}
