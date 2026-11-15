'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TOYBOX_MATERIALS } from '@/materials';
import { PROP_ACCENT_MATERIALS } from './propMaterials';
import { resolveAnimTime } from '../qaFreeze';

/**
 * Local cached polygon-offset clones (shared TOYBOX materials are never mutated).
 * tier 1 => factor/units -1, tier 2 => -2, tier 3 => -3.
 */
const LAYERED_CACHE = new WeakMap<THREE.Material, Map<number, THREE.Material>>();
function layered<T extends THREE.Material>(base: T, tier: 1 | 2 | 3): T {
  let byTier = LAYERED_CACHE.get(base);
  if (!byTier) {
    byTier = new Map();
    LAYERED_CACHE.set(base, byTier);
  }
  let m = byTier.get(tier);
  if (!m) {
    m = base.clone();
    m.polygonOffset = true;
    m.polygonOffsetFactor = -tier;
    m.polygonOffsetUnits = -tier;
    byTier.set(tier, m);
  }
  return m as T;
}

export interface GolfBagAndTeePropProps {
  /** World [x, y, z] where y is exact ground surface top. */
  position?: [number, number, number];
  rotationY?: number;
  /** Currently equipped club id to remove from bag visual. */
  selectedClub?: 'driver' | 'wedge' | 'skimmer' | 'putter';
  /** Whether to render the miniature tour stand bag beside the tee pad. */
  showBag?: boolean;
  showWireframe?: boolean;
}

/**
 * Sunlit start-tee welcome mat with brass tee markers and miniature stand golf bag
 * seated flush on y = 0.00m. Compact Z footprint (1.06m deep) stays strictly clear
 * of the south tee-area backstop curb behind TEE_POSITION.
 */
export const GolfBagAndTeeProp = React.memo(function GolfBagAndTeeProp({
  position = [0, 0, 0],
  rotationY = 0,
  selectedClub = 'driver',
  showBag = true,
  showWireframe = false,
}: GolfBagAndTeePropProps) {
  const towelRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    // Absolute clock (no frame-rate dependent accumulation); pinned when ?qaFreezeParticles=1.
    const t = resolveAnimTime(state.clock.elapsedTime);
    if (!towelRef.current) return;
    towelRef.current.rotation.z = Math.sin(t * 2.1) * 0.055 + 0.04;
    towelRef.current.rotation.x = Math.cos(t * 1.7) * 0.035;
  });

  return (
    <group
      name="golf-bag-and-tee-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* Tiered Brass-Framed Tee Mat (flush at y = 0, compact 1.06m Z depth) */}
      <mesh
        receiveShadow
        position={[0, 0.01, 0]}
        material={layered(TOYBOX_MATERIALS.brassAccent, 1)}
      >
        <boxGeometry args={[1.92, 0.02, 1.06]} />
      </mesh>
      <mesh
        receiveShadow
        position={[0, 0.0275, 0]}
        material={layered(TOYBOX_MATERIALS.awningMint, 2)}
      >
        <boxGeometry args={[1.74, 0.015, 0.92]} />
      </mesh>
      <mesh
        receiveShadow
        position={[0, 0.0425, 0]}
        material={layered(TOYBOX_MATERIALS.turfEmerald, 3)}
      >
        <boxGeometry args={[1.22, 0.015, 0.68]} />
      </mesh>

      {/* Twin Brass Tee Markers */}
      <mesh
        castShadow
        position={[-0.56, 0.078, 0]}
        material={TOYBOX_MATERIALS.taxiAmber}
      >
        <sphereGeometry args={[0.055, 10, 8]} />
      </mesh>
      <mesh
        castShadow
        position={[0.56, 0.078, 0]}
        material={TOYBOX_MATERIALS.taxiAmber}
      >
        <sphereGeometry args={[0.055, 10, 8]} />
      </mesh>

      {/* Miniature Tour Stand Bag (base & twin rubber stand feet flush on y = 0) */}
      {showBag && (
        <group position={[-1.14, 0, 0.18]} rotation={[0, 0.45, 0]}>
          {/* Solid Rubber Base Cup Seated Flush at y = 0.00m */}
          <mesh
            castShadow
            receiveShadow
            position={[0, 0.022, 0]}
            material={TOYBOX_MATERIALS.tireRubber}
          >
            <cylinderGeometry args={[0.135, 0.145, 0.044, 12]} />
          </mesh>

          {/* Twin Stand Legs Anchored Flush at y = 0.00m */}
          <mesh
            position={[-0.12, 0.015, 0.26]}
            material={TOYBOX_MATERIALS.tireRubber}
          >
            <cylinderGeometry args={[0.02, 0.022, 0.03, 8]} />
          </mesh>
          <mesh
            position={[0.12, 0.015, 0.26]}
            material={TOYBOX_MATERIALS.tireRubber}
          >
            <cylinderGeometry args={[0.02, 0.022, 0.03, 8]} />
          </mesh>
          <mesh
            position={[-0.1, 0.34, 0.13]}
            rotation={[-0.36, 0, -0.06]}
            material={TOYBOX_MATERIALS.darkIron}
          >
            <cylinderGeometry args={[0.019, 0.018, 0.72, 8]} />
          </mesh>
          <mesh
            position={[0.1, 0.34, 0.13]}
            rotation={[-0.36, 0, 0.06]}
            material={TOYBOX_MATERIALS.darkIron}
          >
            <cylinderGeometry args={[0.019, 0.018, 0.72, 8]} />
          </mesh>

          {/* Tilted Tour Golf Bag Body Anchored Into Base Cup (seated cleanly below 0.044m rim) */}
          <group position={[0, 0.4, -0.04]} rotation={[0.18, 0, 0]}>
            <mesh
              castShadow
              receiveShadow
              material={PROP_ACCENT_MATERIALS.bagNavy}
            >
              <cylinderGeometry args={[0.13, 0.122, 0.76, 12]} />
            </mesh>
            {/* Cream Padded Ball Pocket */}
            <mesh
              castShadow
              position={[0, -0.1, 0.1]}
              material={PROP_ACCENT_MATERIALS.bagCream}
            >
              <boxGeometry args={[0.16, 0.36, 0.08]} />
            </mesh>
            {/* Mint Top Collar Ring */}
            <mesh
              castShadow
              position={[0, 0.36, 0]}
              material={PROP_ACCENT_MATERIALS.bagMint}
            >
              <cylinderGeometry args={[0.145, 0.135, 0.08, 12]} />
            </mesh>
            {/* Gently Swaying Coral Golf Towel */}
            <mesh
              ref={towelRef}
              castShadow
              position={[0.135, 0.14, 0.02]}
              material={PROP_ACCENT_MATERIALS.towelCoral}
            >
              <boxGeometry args={[0.04, 0.28, 0.1]} />
            </mesh>

            {/* Unused Clubs Resting Inside Bag (always mounted visible={true} for 0ms club-switch pre-warm) */}
            <group
              visible={true}
              scale={selectedClub !== 'driver' ? 1 : 0}
              position={[-0.04, 0.56, -0.03]}
              rotation={[-0.08, 0, 0.06]}
            >
              <mesh material={TOYBOX_MATERIALS.chromeSilver} frustumCulled={false}>
                <cylinderGeometry args={[0.018, 0.018, 0.42, 6]} />
              </mesh>
              <mesh
                position={[0, 0.21, 0.025]}
                material={TOYBOX_MATERIALS.hydrantCoral}
                frustumCulled={false}
              >
                <sphereGeometry args={[0.048, 8, 6]} />
              </mesh>
            </group>
            <group
              visible={true}
              scale={selectedClub !== 'wedge' ? 1 : 0}
              position={[0.04, 0.5, -0.01]}
              rotation={[0.05, 0, -0.06]}
            >
              <mesh material={TOYBOX_MATERIALS.chromeSilver} frustumCulled={false}>
                <cylinderGeometry args={[0.018, 0.018, 0.34, 6]} />
              </mesh>
              <mesh
                position={[0.015, 0.17, 0]}
                rotation={[0, 0, 0.4]}
                material={TOYBOX_MATERIALS.chromeSilver}
                frustumCulled={false}
              >
                <boxGeometry args={[0.062, 0.042, 0.036]} />
              </mesh>
            </group>
            <group
              visible={true}
              scale={selectedClub !== 'skimmer' ? 1 : 0}
              position={[0, 0.52, 0.04]}
              rotation={[0.1, 0, 0]}
            >
              <mesh material={TOYBOX_MATERIALS.chromeSilver} frustumCulled={false}>
                <cylinderGeometry args={[0.018, 0.018, 0.36, 6]} />
              </mesh>
              <mesh
                position={[0, 0.18, 0.015]}
                material={TOYBOX_MATERIALS.taxiAmber}
                frustumCulled={false}
              >
                <boxGeometry args={[0.056, 0.036, 0.036]} />
              </mesh>
            </group>
            <group
              visible={true}
              scale={selectedClub !== 'putter' ? 1 : 0}
              position={[-0.02, 0.48, 0.04]}
              rotation={[-0.04, 0, 0]}
            >
              <mesh material={TOYBOX_MATERIALS.chromeSilver} frustumCulled={false}>
                <cylinderGeometry args={[0.018, 0.018, 0.3, 6]} />
              </mesh>
              <mesh
                position={[0.012, 0.15, 0]}
                material={TOYBOX_MATERIALS.brassAccent}
                frustumCulled={false}
              >
                <boxGeometry args={[0.068, 0.036, 0.036]} />
              </mesh>
            </group>
          </group>
        </group>
      )}

      {showWireframe && (
        <mesh
          position={[-0.32, 0.5, 0]}
          material={TOYBOX_MATERIALS.qaBoundsWireframe}
        >
          <boxGeometry args={[2.55, 1.0, 1.08]} />
        </mesh>
      )}
    </group>
  );
});
