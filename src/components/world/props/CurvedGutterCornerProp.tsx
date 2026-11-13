'use client';

import React, { useMemo } from 'react';
import { TOYBOX_MATERIALS } from '@/materials';
import { createArcBandExtrusion } from '../tiles/tileGeometry';

export interface CurvedGutterCornerPropProps {
  position?: [number, number, number];
  rotationY?: number;
  showWireframe?: boolean;
}

/**
 * 90-Degree Banked Storm-Drain Gutter Corner Marker & Catch-Basin Grate
 * seated flush at y = 0, highlighting bankable Skimmer curb lines.
 */
export function CurvedGutterCornerProp({
  position = [0, 0, 0],
  rotationY = 0,
  showWireframe = false,
}: CurvedGutterCornerPropProps) {
  const arcCurbGeo = useMemo(
    () =>
      createArcBandExtrusion({
        pivotX: 0.65,
        pivotZ: -0.65,
        innerR: 0.95,
        outerR: 1.24,
        startTheta: Math.PI * 0.5,
        endTheta: Math.PI,
        bottomY: 0,
        topY: 0.16,
        segments: 16,
      }),
    []
  );

  const arcDrainGeo = useMemo(
    () =>
      createArcBandExtrusion({
        pivotX: 0.65,
        pivotZ: -0.65,
        innerR: 0.56,
        outerR: 0.95,
        startTheta: Math.PI * 0.5,
        endTheta: Math.PI,
        bottomY: 0,
        topY: 0.025,
        segments: 16,
      }),
    []
  );

  return (
    <group
      name="curved-gutter-corner-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* Curved Slotted Drain Grate Bed at y = 0 */}
      <mesh receiveShadow geometry={arcDrainGeo} material={TOYBOX_MATERIALS.stormDrainSteel} />

      {/* Curved Taxi-Amber Bankable Curb Reflector Wall */}
      <mesh
        castShadow
        receiveShadow
        geometry={arcCurbGeo}
        material={TOYBOX_MATERIALS.taxiAmber}
      />

      {/* Corner Catch-Basin Grate Plate Flush at y = 0 */}
      <mesh
        receiveShadow
        position={[0, 0.012, 0]}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <boxGeometry args={[0.56, 0.024, 0.56]} />
      </mesh>
      {[-0.16, 0, 0.16].map((off, idx) => (
        <mesh
          key={idx}
          position={[0, 0.026, off]}
          material={TOYBOX_MATERIALS.stormDrainSteel}
        >
          <boxGeometry args={[0.48, 0.012, 0.05]} />
        </mesh>
      ))}

      {showWireframe && (
        <mesh
          position={[0, 0.11, 0]}
          material={TOYBOX_MATERIALS.qaSensorWireframe}
        >
          <boxGeometry args={[1.45, 0.22, 1.45]} />
        </mesh>
      )}
    </group>
  );
}
