'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TOYBOX_MATERIALS } from '@/materials';
import { PROP_ACCENT_MATERIALS } from './propMaterials';

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
export function GolfBagAndTeeProp({
  position = [0, 0, 0],
  rotationY = 0,
  selectedClub = 'driver',
  showBag = true,
  showWireframe = false,
}: GolfBagAndTeePropProps) {
  const towelRef = useRef<THREE.Mesh>(null);
  const elapsedRef = useRef(0);

  useFrame((_, delta) => {
    elapsedRef.current += Math.min(delta, 0.05);
    const t = elapsedRef.current;
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
        position={[0, 0.006, 0]}
        material={TOYBOX_MATERIALS.brassAccent}
      >
        <boxGeometry args={[1.92, 0.012, 1.06]} />
      </mesh>
      <mesh
        receiveShadow
        position={[0, 0.015, 0]}
        material={TOYBOX_MATERIALS.awningMint}
      >
        <boxGeometry args={[1.74, 0.01, 0.92]} />
      </mesh>
      <mesh
        receiveShadow
        position={[0, 0.023, 0]}
        material={TOYBOX_MATERIALS.turfEmerald}
      >
        <boxGeometry args={[1.22, 0.01, 0.68]} />
      </mesh>

      {/* Twin Brass Tee Markers */}
      <mesh
        castShadow
        position={[-0.56, 0.056, 0]}
        material={TOYBOX_MATERIALS.taxiAmber}
      >
        <sphereGeometry args={[0.055, 10, 8]} />
      </mesh>
      <mesh
        castShadow
        position={[0.56, 0.056, 0]}
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
            castShadow
            position={[-0.12, 0.015, 0.26]}
            material={TOYBOX_MATERIALS.tireRubber}
          >
            <cylinderGeometry args={[0.016, 0.018, 0.03, 8]} />
          </mesh>
          <mesh
            castShadow
            position={[0.12, 0.015, 0.26]}
            material={TOYBOX_MATERIALS.tireRubber}
          >
            <cylinderGeometry args={[0.016, 0.018, 0.03, 8]} />
          </mesh>
          <mesh
            castShadow
            position={[-0.1, 0.34, 0.13]}
            rotation={[-0.36, 0, -0.06]}
            material={TOYBOX_MATERIALS.darkIron}
          >
            <cylinderGeometry args={[0.011, 0.01, 0.72, 8]} />
          </mesh>
          <mesh
            castShadow
            position={[0.1, 0.34, 0.13]}
            rotation={[-0.36, 0, 0.06]}
            material={TOYBOX_MATERIALS.darkIron}
          >
            <cylinderGeometry args={[0.011, 0.01, 0.72, 8]} />
          </mesh>

          {/* Tilted Tour Golf Bag Body Anchored Into Base Cup */}
          <group position={[0, 0.42, -0.04]} rotation={[0.18, 0, 0]}>
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

            {/* Unused Clubs Resting Inside Bag */}
            {selectedClub !== 'driver' && (
              <group position={[-0.04, 0.56, -0.03]} rotation={[-0.08, 0, 0.06]}>
                <mesh castShadow material={TOYBOX_MATERIALS.chromeSilver}>
                  <cylinderGeometry args={[0.008, 0.008, 0.42, 6]} />
                </mesh>
                <mesh
                  castShadow
                  position={[0, 0.21, 0.025]}
                  material={TOYBOX_MATERIALS.hydrantCoral}
                >
                  <sphereGeometry args={[0.048, 8, 6]} />
                </mesh>
              </group>
            )}
            {selectedClub !== 'wedge' && (
              <group position={[0.04, 0.5, -0.01]} rotation={[0.05, 0, -0.06]}>
                <mesh castShadow material={TOYBOX_MATERIALS.chromeSilver}>
                  <cylinderGeometry args={[0.008, 0.008, 0.34, 6]} />
                </mesh>
                <mesh
                  castShadow
                  position={[0.015, 0.17, 0]}
                  rotation={[0, 0, 0.4]}
                  material={TOYBOX_MATERIALS.chromeSilver}
                >
                  <boxGeometry args={[0.062, 0.042, 0.018]} />
                </mesh>
              </group>
            )}
            {selectedClub !== 'skimmer' && (
              <group position={[0, 0.52, 0.04]} rotation={[0.1, 0, 0]}>
                <mesh castShadow material={TOYBOX_MATERIALS.chromeSilver}>
                  <cylinderGeometry args={[0.008, 0.008, 0.36, 6]} />
                </mesh>
                <mesh
                  castShadow
                  position={[0, 0.18, 0.015]}
                  material={TOYBOX_MATERIALS.taxiAmber}
                >
                  <boxGeometry args={[0.056, 0.036, 0.024]} />
                </mesh>
              </group>
            )}
            {selectedClub !== 'putter' && (
              <group position={[-0.02, 0.48, 0.04]} rotation={[-0.04, 0, 0]}>
                <mesh castShadow material={TOYBOX_MATERIALS.chromeSilver}>
                  <cylinderGeometry args={[0.008, 0.008, 0.3, 6]} />
                </mesh>
                <mesh
                  castShadow
                  position={[0.012, 0.15, 0]}
                  material={TOYBOX_MATERIALS.brassAccent}
                >
                  <boxGeometry args={[0.068, 0.026, 0.026]} />
                </mesh>
              </group>
            )}
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
}
