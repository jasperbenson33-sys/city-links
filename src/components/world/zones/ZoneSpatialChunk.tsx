'use client';

import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useCurbsideStore } from '@/store/useCurbsideStore';
import type { GrandEscapadeZoneSpec, Vec3Tuple } from '@/types/course';

export const ZONE_MICRO_PROP_CULL_DISTANCE_METERS = 110;

export interface ZoneSpatialChunkProps {
  zone: GrandEscapadeZoneSpec;
  ballPosition?: Vec3Tuple;
  ballWorldPositionRef?: React.RefObject<THREE.Vector3 | null>;
  /** Macro structural silhouettes & props that always stay mounted for horizon continuity & occlusion indexing. */
  children?: React.ReactNode;
  /** Decorative micro-props/ornaments culled via `.visible` when > 110m from active sightline. */
  microDetail?: React.ReactNode;
}

function distSqToAabb(
  p: THREE.Vector3,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
): number {
  const dx = p.x < minX ? minX - p.x : p.x > maxX ? p.x - maxX : 0;
  const dy = p.y < minY ? minY - p.y : p.y > maxY ? p.y - maxY : 0;
  const dz = p.z < minZ ? minZ - p.z : p.z > maxZ ? p.z - maxZ : 0;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Spatial `<group name="ZoneN">` chunk container for Grand Escapade.
 * Always keeps architectural silhouettes mounted while toggling dense micro-props `.visible`
 * smoothly inside `useFrame` when beyond `110m` out of sightline (zero React re-renders).
 */
export const ZoneSpatialChunk = React.memo(function ZoneSpatialChunk({
  zone,
  ballPosition,
  ballWorldPositionRef,
  children,
  microDetail,
}: ZoneSpatialChunkProps) {
  const microRef = useRef<THREE.Group>(null);
  const ballVecRef = useRef(new THREE.Vector3());
  const warmupFramesRef = useRef(0);
  const { gl, camera, scene } = useThree();

  // Pre-compile zone micro-detail materials/shaders right after mount while visible === true
  // (passing `scene` so shaders compile against real lights, fog, and shadows).
  useEffect(() => {
    const group = microRef.current;
    if (!group) return;
    group.visible = true;
    try {
      gl.compile(group, camera, scene);
    } catch {
      // Ignore in non-WebGL unit test environments
    }
  }, [gl, camera, scene]);

  useFrame(({ camera: frameCam }) => {
    const group = microRef.current;
    if (!group) return;

    // Keep micro-details mounted & visible for the first 3 rendered frames so VBOs upload cleanly,
    // and throughout the entire Course Flyover so zero mid-flight visibility pops occur.
    if (warmupFramesRef.current < 3) {
      warmupFramesRef.current += 1;
      if (!group.visible) group.visible = true;
      return;
    }

    if (useCurbsideStore.getState().isCourseFlyoverActive) {
      if (!group.visible) group.visible = true;
      return;
    }

    const { minX, maxX, minZ, maxZ } = zone.chunkBoundsXZ;
    const [minY, maxY] = zone.elevationRangeY;
    const maxDistSq =
      ZONE_MICRO_PROP_CULL_DISTANCE_METERS * ZONE_MICRO_PROP_CULL_DISTANCE_METERS;

    const camDistSq = distSqToAabb(
      frameCam.position,
      minX,
      maxX,
      minY,
      maxY,
      minZ,
      maxZ,
    );

    let activeDistSq = camDistSq;
    if (ballWorldPositionRef?.current) {
      activeDistSq = Math.min(
        activeDistSq,
        distSqToAabb(
          ballWorldPositionRef.current,
          minX,
          maxX,
          minY,
          maxY,
          minZ,
          maxZ,
        ),
      );
    } else if (ballPosition) {
      ballVecRef.current.set(ballPosition[0], ballPosition[1], ballPosition[2]);
      activeDistSq = Math.min(
        activeDistSq,
        distSqToAabb(ballVecRef.current, minX, maxX, minY, maxY, minZ, maxZ),
      );
    }

    const shouldShow = activeDistSq <= maxDistSq;
    if (group.visible !== shouldShow) {
      group.visible = shouldShow;
    }
  });

  return (
    <group name={`Zone${zone.zoneNumber}`} userData={{ zoneNumber: zone.zoneNumber }}>
      {children}
      {microDetail && (
        <group ref={microRef} name={`Zone${zone.zoneNumber}-micro-detail`}>
          {microDetail}
        </group>
      )}
    </group>
  );
});
