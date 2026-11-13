'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { TOYBOX_MATERIALS } from '@/materials';

export interface CurvedGutterCornerPropProps {
  position?: [number, number, number];
  rotationY?: number;
  showWireframe?: boolean;
}

/**
 * Generates an extruded circular arc band in local XZ spanning [bottomY, topY]
 * around (pivotX, pivotZ), cleanly self-contained with zero legacy tile imports.
 */
function createArcBandExtrusion({
  pivotX,
  pivotZ,
  innerR,
  outerR,
  startTheta,
  endTheta,
  bottomY,
  topY,
  segments = 16,
}: {
  pivotX: number;
  pivotZ: number;
  innerR: number;
  outerR: number;
  startTheta: number;
  endTheta: number;
  bottomY: number;
  topY: number;
  segments?: number;
}): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const th = THREE.MathUtils.lerp(startTheta, endTheta, t);
    const x = pivotX + Math.cos(th) * outerR;
    const y = -(pivotZ + Math.sin(th) * outerR);
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  for (let i = segments; i >= 0; i--) {
    const t = i / segments;
    const th = THREE.MathUtils.lerp(startTheta, endTheta, t);
    const x = pivotX + Math.cos(th) * innerR;
    const y = -(pivotZ + Math.sin(th) * innerR);
    shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, topY - bottomY),
    bevelEnabled: false,
    steps: 1,
  });
  geo.rotateX(-Math.PI * 0.5);
  geo.translate(0, bottomY, 0);
  geo.computeVertexNormals();
  return geo;
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
      <mesh
        receiveShadow
        geometry={arcDrainGeo}
        material={TOYBOX_MATERIALS.stormDrainSteel}
      />

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
          key={`slat-${idx}`}
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
