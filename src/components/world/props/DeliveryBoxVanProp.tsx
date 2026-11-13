'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildCoaxialWheelSpec } from '@/engine/geometryHelpers';
import { TOYBOX_MATERIALS } from '@/materials';
import { CoaxialWheelMeshGroup } from './HotdogCartProp';

export interface DeliveryBoxVanPropProps {
  position?: [number, number, number];
  rotationY?: number;
  lastRoofHitAt?: number;
  showWireframe?: boolean;
}

/**
 * Toybox City Delivery Box Van oriented with +Z = Forward cab, +X = Right, +Y = Up.
 * - 4 coaxial wheels built with buildCoaxialWheelSpec(axleAxis: 'x') flush at y = 0.
 * - Crisp cream/mint/amber livery and an emerald rooftop bounce deck.
 */
export function DeliveryBoxVanProp({
  position = [0, 0, 0],
  rotationY = 0,
  lastRoofHitAt = -10,
  showWireframe = false,
}: DeliveryBoxVanPropProps) {
  const roofDeckRef = useRef<THREE.Mesh>(null);

  const wheelSpec = useMemo(
    () =>
      buildCoaxialWheelSpec({
        outerRadius: 0.36,
        tireTubeRadius: 0.085,
        axleAxis: 'x',
        spokeCount: 6,
        rimWidth: 0.14,
        hubRadius: 0.095,
        hubWidth: 0.17,
        axleRadius: 0.028,
        axleLength: 0.24,
      }),
    []
  );

  useFrame(() => {
    if (!roofDeckRef.current) return;
    const dt = performance.now() * 0.001 - lastRoofHitAt;
    if (dt >= 0 && dt < 0.55) {
      const pop = 1 + Math.sin(dt * 30.0) * 0.14 * Math.exp(-5.5 * dt);
      roofDeckRef.current.scale.set(1, pop, 1);
    } else {
      roofDeckRef.current.scale.set(1, 1, 1);
    }
  });

  // 4 wheel mounting positions within localSize [2.05, 2.25, 4.35]
  const wheelMounts: Array<[number, number, number]> = [
    [-0.86, 0, -1.25],
    [0.86, 0, -1.25],
    [-0.86, 0, 1.32],
    [0.86, 0, 1.32],
  ];

  return (
    <group
      name="delivery-box-van-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* 4 Coaxial Wheels Seated Flush at y = 0 */}
      {wheelMounts.map((mount, idx) => (
        <CoaxialWheelMeshGroup
          key={idx}
          spec={wheelSpec}
          position={mount}
          rimMaterial={TOYBOX_MATERIALS.hubcapCream}
          hubMaterial={TOYBOX_MATERIALS.chromeSilver}
        />
      ))}

      {/* Narrow Inner Chassis Frame (inboard of coaxial wheels for clean wheel wells) */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.44, -0.04]}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <boxGeometry args={[1.36, 0.34, 3.92]} />
      </mesh>
      {/* Center Rocker Step Skirt Between Front & Rear Axles (clear of tires) */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.48, 0.04]}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <boxGeometry args={[1.86, 0.24, 1.56]} />
      </mesh>

      {/* Main Cream Delivery Cargo Box (bottom at y = 0.75m, clear above 0.72m rear tires) */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 1.44, -0.52]}
        material={TOYBOX_MATERIALS.vanCreamBody}
      >
        <boxGeometry args={[1.94, 1.38, 2.98]} />
      </mesh>
      {/* Mint-Teal Delivery Livery Band */}
      <mesh
        position={[0, 1.18, -0.52]}
        material={TOYBOX_MATERIALS.vanMintStripe}
      >
        <boxGeometry args={[1.97, 0.32, 3.01]} />
      </mesh>
      {/* Taxi-Amber Accent Pinstripe */}
      <mesh
        position={[0, 1.38, -0.52]}
        material={TOYBOX_MATERIALS.taxiAmber}
      >
        <boxGeometry args={[1.98, 0.08, 3.02]} />
      </mesh>

      {/* Rear Cargo Roll-Up Door Accent */}
      <mesh
        position={[0, 1.4, -2.02]}
        material={TOYBOX_MATERIALS.chromeSilver}
      >
        <boxGeometry args={[1.42, 1.14, 0.04]} />
      </mesh>

      {/* Emerald Rooftop Bounce Deck atop Cargo Box (top at y = 2.24) */}
      <mesh
        ref={roofDeckRef}
        castShadow
        receiveShadow
        position={[0, 2.18, -0.52]}
        material={TOYBOX_MATERIALS.vanRoofBounceDeck}
      >
        <boxGeometry args={[1.76, 0.11, 2.74]} />
      </mesh>
      <mesh
        position={[0, 2.238, -0.52]}
        material={TOYBOX_MATERIALS.taxiAmber}
      >
        <boxGeometry args={[1.28, 0.014, 2.24]} />
      </mesh>

      {/* Forward Cab (+Z Front, bottom at y = 0.75m clear above 0.72m front tires) */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 1.04, 1.48]}
        material={TOYBOX_MATERIALS.vanCreamBody}
      >
        <boxGeometry args={[1.88, 0.58, 1.12]} />
      </mesh>
      {/* Cab Upper Greenhouse & Sloped Windshield */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 1.54, 1.34]}
        material={TOYBOX_MATERIALS.vanCreamBody}
      >
        <boxGeometry args={[1.82, 0.64, 0.88]} />
      </mesh>
      <mesh
        position={[0, 1.54, 1.79]}
        rotation={[-0.22, 0, 0]}
        material={TOYBOX_MATERIALS.windowSkyGlass}
      >
        <boxGeometry args={[1.56, 0.48, 0.06]} />
      </mesh>
      {/* Side Cab Windows */}
      <mesh
        position={[0, 1.54, 1.38]}
        material={TOYBOX_MATERIALS.windowSkyGlass}
      >
        <boxGeometry args={[1.85, 0.44, 0.62]} />
      </mesh>
      {/* Cab Mint Nose Stripe */}
      <mesh
        position={[0, 0.96, 2.05]}
        material={TOYBOX_MATERIALS.vanMintStripe}
      >
        <boxGeometry args={[1.58, 0.18, 0.04]} />
      </mesh>

      {/* Chrome Front & Rear Bumpers */}
      <mesh
        castShadow
        position={[0, 0.44, 2.08]}
        material={TOYBOX_MATERIALS.chromeSilver}
      >
        <boxGeometry args={[1.96, 0.16, 0.12]} />
      </mesh>
      <mesh
        castShadow
        position={[0, 0.44, -2.06]}
        material={TOYBOX_MATERIALS.chromeSilver}
      >
        <boxGeometry args={[1.96, 0.16, 0.12]} />
      </mesh>

      {/* Headlights (+Z) & Taillights (-Z) */}
      {[-0.66, 0.66].map((lx, idx) => (
        <React.Fragment key={`lights-${idx}`}>
          <mesh
            position={[lx, 0.76, 2.05]}
            material={TOYBOX_MATERIALS.bulbWarmGlow}
          >
            <sphereGeometry args={[0.11, 8, 8]} />
          </mesh>
          <mesh
            position={[lx, 0.74, -2.03]}
            material={TOYBOX_MATERIALS.hydrantCoral}
          >
            <boxGeometry args={[0.18, 0.14, 0.05]} />
          </mesh>
        </React.Fragment>
      ))}

      {/* QA Bounds & Rooftop Bounce Deck Wireframes */}
      {showWireframe && (
        <group>
          <mesh position={[0, 1.125, 0]} material={TOYBOX_MATERIALS.qaBoundsWireframe}>
            <boxGeometry args={[2.05, 2.25, 4.35]} />
          </mesh>
          <mesh position={[0, 2.18, -0.52]} material={TOYBOX_MATERIALS.qaSensorWireframe}>
            <boxGeometry args={[1.82, 0.18, 2.82]} />
          </mesh>
        </group>
      )}
    </group>
  );
}
