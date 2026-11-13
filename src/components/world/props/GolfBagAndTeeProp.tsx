'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TOYBOX_MATERIALS } from '@/materials';

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
 * seated flush on y = 0.
 */
export function GolfBagAndTeeProp({
  position = [0, 0, 0],
  rotationY = 0,
  selectedClub = 'driver',
  showBag = true,
  showWireframe = false,
}: GolfBagAndTeePropProps) {
  const towelRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!towelRef.current) return;
    const t = clock.getElapsedTime();
    towelRef.current.rotation.z = Math.sin(t * 2.1) * 0.055 + 0.04;
    towelRef.current.rotation.x = Math.cos(t * 1.7) * 0.035;
  });

  return (
    <group
      name="golf-bag-and-tee-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* Tiered Brass-Framed Tee Mat (flush at y = 0) */}
      <mesh
        receiveShadow
        position={[0, 0.006, 0]}
        material={TOYBOX_MATERIALS.brassAccent}
      >
        <boxGeometry args={[2.1, 0.012, 1.5]} />
      </mesh>
      <mesh
        receiveShadow
        position={[0, 0.016, 0]}
        material={TOYBOX_MATERIALS.awningMint}
      >
        <boxGeometry args={[1.88, 0.012, 1.3]} />
      </mesh>
      <mesh
        receiveShadow
        position={[0, 0.025, 0]}
        material={TOYBOX_MATERIALS.turfEmerald}
      >
        <boxGeometry args={[1.28, 0.01, 0.88]} />
      </mesh>

      {/* Twin Brass Tee Markers */}
      <mesh
        castShadow
        position={[-0.56, 0.06, 0]}
        material={TOYBOX_MATERIALS.taxiAmber}
      >
        <sphereGeometry args={[0.062, 10, 8]} />
      </mesh>
      <mesh
        castShadow
        position={[0.56, 0.06, 0]}
        material={TOYBOX_MATERIALS.taxiAmber}
      >
        <sphereGeometry args={[0.062, 10, 8]} />
      </mesh>

      {/* Miniature Tour Stand Bag (planted cleanly on y = 0 beside tee mat) */}
      {showBag && (
        <group position={[-1.22, 0, 0.45]} rotation={[0, 0.48, 0]}>
          {/* Twin Stand Legs with Rubber Feet at y = 0 */}
          <mesh
            castShadow
            position={[-0.14, 0.34, 0.18]}
            rotation={[-0.36, 0, -0.22]}
            material={TOYBOX_MATERIALS.darkIron}
          >
            <cylinderGeometry args={[0.012, 0.01, 0.72, 8]} />
          </mesh>
          <mesh position={[-0.22, 0.014, 0.3]} material={TOYBOX_MATERIALS.tireRubber}>
            <cylinderGeometry args={[0.022, 0.025, 0.028, 8]} />
          </mesh>

          <mesh
            castShadow
            position={[0.14, 0.34, 0.18]}
            rotation={[-0.36, 0, 0.22]}
            material={TOYBOX_MATERIALS.darkIron}
          >
            <cylinderGeometry args={[0.012, 0.01, 0.72, 8]} />
          </mesh>
          <mesh position={[0.22, 0.014, 0.3]} material={TOYBOX_MATERIALS.tireRubber}>
            <cylinderGeometry args={[0.022, 0.025, 0.028, 8]} />
          </mesh>

          {/* Tilted Bag Body */}
          <group position={[0, 0.06, -0.09]} rotation={[0.35, 0, 0]}>
            <mesh
              castShadow
              receiveShadow
              position={[0, 0.06, 0]}
              material={TOYBOX_MATERIALS.cedarDark}
            >
              <cylinderGeometry args={[0.14, 0.132, 0.12, 14]} />
            </mesh>
            <mesh
              castShadow
              receiveShadow
              position={[0, 0.4, 0]}
              material={TOYBOX_MATERIALS.awningCream}
            >
              <cylinderGeometry args={[0.138, 0.135, 0.62, 14]} />
            </mesh>
            <mesh
              castShadow
              position={[0, 0.4, 0]}
              material={TOYBOX_MATERIALS.subwayIronGreen}
            >
              <cylinderGeometry args={[0.142, 0.139, 0.28, 14]} />
            </mesh>
            <mesh
              castShadow
              position={[0, 0.72, 0]}
              material={TOYBOX_MATERIALS.cedarDark}
            >
              <cylinderGeometry args={[0.15, 0.142, 0.07, 14]} />
            </mesh>

            {/* Front Ball Pocket */}
            <mesh
              castShadow
              position={[0, 0.22, -0.13]}
              material={TOYBOX_MATERIALS.subwayIronGreen}
            >
              <boxGeometry args={[0.16, 0.24, 0.08]} />
            </mesh>
            <mesh position={[0, 0.32, -0.172]} material={TOYBOX_MATERIALS.brassAccent}>
              <boxGeometry args={[0.12, 0.014, 0.014]} />
            </mesh>

            {/* Swaying Caddie Towel */}
            <group position={[-0.155, 0.66, 0.02]}>
              <mesh
                ref={towelRef}
                castShadow
                position={[-0.015, -0.16, 0]}
                material={TOYBOX_MATERIALS.awningMint}
              >
                <boxGeometry args={[0.026, 0.32, 0.1]} />
              </mesh>
            </group>

            {/* Unselected Clubs Standing in Bag */}
            {selectedClub !== 'driver' && (
              <group position={[-0.05, 0.76, 0.04]} rotation={[0.08, 0.2, 0.06]}>
                <mesh castShadow position={[0, 0.15, 0]} material={TOYBOX_MATERIALS.darkIron}>
                  <cylinderGeometry args={[0.008, 0.007, 0.32, 8]} />
                </mesh>
                <mesh castShadow position={[0, 0.3, 0]} material={TOYBOX_MATERIALS.hydrantCoral}>
                  <capsuleGeometry args={[0.042, 0.08, 8, 10]} />
                </mesh>
              </group>
            )}
            {selectedClub !== 'wedge' && (
              <group position={[0.05, 0.76, -0.03]} rotation={[-0.05, -0.35, -0.08]}>
                <mesh castShadow position={[0, 0.12, 0]} material={TOYBOX_MATERIALS.chromeSilver}>
                  <cylinderGeometry args={[0.007, 0.006, 0.26, 8]} />
                </mesh>
                <mesh position={[0.03, 0.26, 0.01]} material={TOYBOX_MATERIALS.chromeSilver}>
                  <boxGeometry args={[0.085, 0.045, 0.016]} />
                </mesh>
              </group>
            )}
            {selectedClub !== 'skimmer' && (
              <group position={[-0.045, 0.76, -0.04]} rotation={[-0.06, 0.35, 0.08]}>
                <mesh castShadow position={[0, 0.11, 0]} material={TOYBOX_MATERIALS.chromeSilver}>
                  <cylinderGeometry args={[0.007, 0.006, 0.24, 8]} />
                </mesh>
                <mesh position={[-0.03, 0.24, 0.01]} material={TOYBOX_MATERIALS.taxiAmber}>
                  <boxGeometry args={[0.085, 0.042, 0.016]} />
                </mesh>
              </group>
            )}
            {selectedClub !== 'putter' && (
              <group position={[0, 0.76, -0.08]} rotation={[-0.1, 0.05, 0]}>
                <mesh castShadow position={[0, 0.1, 0]} material={TOYBOX_MATERIALS.chromeSilver}>
                  <cylinderGeometry args={[0.007, 0.006, 0.2, 8]} />
                </mesh>
                <mesh position={[0.03, 0.21, 0]} material={TOYBOX_MATERIALS.brassAccent}>
                  <boxGeometry args={[0.1, 0.025, 0.03]} />
                </mesh>
              </group>
            )}
          </group>
        </group>
      )}

      {showWireframe && showBag && (
        <mesh
          position={[-1.22, 0.45, 0.45]}
          material={TOYBOX_MATERIALS.qaColliderWireframe}
        >
          <cylinderGeometry args={[0.25, 0.25, 0.9, 10]} />
        </mesh>
      )}
    </group>
  );
}
