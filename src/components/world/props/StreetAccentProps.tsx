'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TOYBOX_MATERIALS } from '@/materials';

export interface StreetBollardPropProps {
  position?: [number, number, number];
  rotationY?: number;
  showWireframe?: boolean;
}

/**
 * Cast-iron & brass NYC sidewalk bollard seated flush at y = 0.
 */
export function StreetBollardProp({
  position = [0, 0, 0],
  rotationY = 0,
  showWireframe = false,
}: StreetBollardPropProps) {
  return (
    <group
      name="street-bollard-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* Flanged Base Collar at y = 0 */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.04, 0]}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry args={[0.14, 0.17, 0.08, 12]} />
      </mesh>
      {/* Main Bollard Column */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.42, 0]}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry args={[0.095, 0.115, 0.68, 12]} />
      </mesh>
      {/* Reflective Taxi-Amber Stripe Collar */}
      <mesh
        position={[0, 0.64, 0]}
        material={TOYBOX_MATERIALS.taxiAmber}
      >
        <cylinderGeometry args={[0.102, 0.102, 0.09, 12]} />
      </mesh>
      {/* Brass Domed Finial */}
      <mesh
        castShadow
        position={[0, 0.79, 0]}
        material={TOYBOX_MATERIALS.brassAccent}
      >
        <sphereGeometry args={[0.105, 12, 10]} />
      </mesh>

      {showWireframe && (
        <mesh
          position={[0, 0.44, 0]}
          material={TOYBOX_MATERIALS.qaColliderWireframe}
        >
          <cylinderGeometry args={[0.17, 0.17, 0.88, 10]} />
        </mesh>
      )}
    </group>
  );
}

export interface StreetTreePropProps {
  position?: [number, number, number];
  scale?: number;
  variant?: 'emerald' | 'sunny' | 'peach';
  phase?: number;
  showWireframe?: boolean;
}

/**
 * Compact sunlit street tree in a cedar planter box seated flush at y = 0.
 * Kept crisp and compact (~2.7m tall) so 3/4 camera sightlines remain clear.
 */
export function StreetTreeProp({
  position = [0, 0, 0],
  scale = 1,
  variant = 'emerald',
  phase = 0,
  showWireframe = false,
}: StreetTreePropProps) {
  const canopyRef = useRef<THREE.Group>(null);

  const foliageMat =
    variant === 'emerald'
      ? TOYBOX_MATERIALS.foliageEmerald
      : variant === 'sunny'
        ? TOYBOX_MATERIALS.foliageSunny
        : TOYBOX_MATERIALS.foliagePeach;

  useFrame(({ clock }) => {
    if (!canopyRef.current) return;
    const t = clock.getElapsedTime();
    canopyRef.current.rotation.z = Math.sin(t * 1.45 + phase) * 0.036;
    canopyRef.current.rotation.x = Math.cos(t * 1.15 + phase) * 0.024;
  });

  return (
    <group name="street-tree-prop" position={position} scale={scale}>
      {/* Cedar Planter Box Base Flush at y = 0 */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.06, 0]}
        material={TOYBOX_MATERIALS.cedarDark}
      >
        <boxGeometry args={[0.96, 0.12, 0.96]} />
      </mesh>
      <mesh
        receiveShadow
        position={[0, 0.125, 0]}
        material={TOYBOX_MATERIALS.plinthEarthCutaway}
      >
        <boxGeometry args={[0.78, 0.02, 0.78]} />
      </mesh>

      {/* Tapered Trunk */}
      <mesh
        castShadow
        position={[0, 0.85, 0]}
        material={TOYBOX_MATERIALS.treeTrunk}
      >
        <cylinderGeometry args={[0.11, 0.17, 1.5, 7]} />
      </mesh>

      {/* Low-Poly Faceted Canopy Cluster */}
      <group ref={canopyRef} position={[0, 1.85, 0]}>
        <mesh castShadow material={foliageMat}>
          <icosahedronGeometry args={[0.88, 1]} />
        </mesh>
        <mesh castShadow position={[-0.48, -0.22, 0.25]} material={foliageMat}>
          <icosahedronGeometry args={[0.58, 1]} />
        </mesh>
        <mesh castShadow position={[0.5, -0.18, -0.22]} material={foliageMat}>
          <icosahedronGeometry args={[0.6, 1]} />
        </mesh>
        <mesh castShadow position={[0.06, 0.56, 0.06]} material={foliageMat}>
          <icosahedronGeometry args={[0.54, 1]} />
        </mesh>
      </group>

      {showWireframe && (
        <mesh
          position={[0, 1.25, 0]}
          material={TOYBOX_MATERIALS.qaColliderWireframe}
        >
          <cylinderGeometry args={[0.38, 0.48, 2.5, 10]} />
        </mesh>
      )}
    </group>
  );
}

export interface StreetLampPropProps {
  position?: [number, number, number];
  rotationY?: number;
  showWireframe?: boolean;
}

/**
 * Vintage NYC Streetlamp seated flush at y = 0, sized cleanly (~3.1m) so
 * it lends sunlit urban silhouette without obstructing 3/4 view corridors.
 */
export function StreetLampProp({
  position = [0, 0, 0],
  rotationY = 0,
  showWireframe = false,
}: StreetLampPropProps) {
  return (
    <group
      name="street-lamp-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* Cast-Iron Fluted Base at y = 0 */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.18, 0]}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry args={[0.12, 0.2, 0.36, 10]} />
      </mesh>
      {/* Tapered Post */}
      <mesh
        castShadow
        position={[0, 1.68, 0]}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry args={[0.055, 0.09, 2.68, 8]} />
      </mesh>
      {/* Horizontal Bracket Arm */}
      <mesh
        castShadow
        position={[0.3, 2.94, 0]}
        rotation={[0, 0, Math.PI * 0.5]}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry args={[0.036, 0.044, 0.68, 8]} />
      </mesh>
      {/* Brass Lantern Collar & Warm Glowing Globe */}
      <mesh
        position={[0.58, 2.86, 0]}
        material={TOYBOX_MATERIALS.brassAccent}
      >
        <cylinderGeometry args={[0.1, 0.06, 0.08, 8]} />
      </mesh>
      <mesh
        position={[0.58, 2.71, 0]}
        material={TOYBOX_MATERIALS.bulbWarmGlow}
      >
        <sphereGeometry args={[0.16, 12, 10]} />
      </mesh>

      {showWireframe && (
        <mesh
          position={[0, 1.5, 0]}
          material={TOYBOX_MATERIALS.qaColliderWireframe}
        >
          <cylinderGeometry args={[0.2, 0.2, 3.0, 8]} />
        </mesh>
      )}
    </group>
  );
}

export interface CornerBuildingAccentPropProps {
  position?: [number, number, number];
  rotationY?: number;
  variant?: 'terracotta' | 'cream' | 'sage' | 'peach';
  showWireframe?: boolean;
}

/**
 * Low-profile corner neighborhood architectural accent (kiosk / brownstone stoop facade)
 * capped at ~2.8m total height so it frames corner plazas warmly without ever
 * blocking the 3/4 elevated diorama camera sightlines.
 */
export function CornerBuildingAccentProp({
  position = [0, 0, 0],
  rotationY = 0,
  variant = 'terracotta',
  showWireframe = false,
}: CornerBuildingAccentPropProps) {
  const facadeMat =
    variant === 'terracotta'
      ? TOYBOX_MATERIALS.terracottaBrick
      : variant === 'cream'
        ? TOYBOX_MATERIALS.pastelCream
        : variant === 'sage'
          ? TOYBOX_MATERIALS.pastelSage
          : TOYBOX_MATERIALS.pastelPeach;

  const awningMat =
    variant === 'terracotta'
      ? TOYBOX_MATERIALS.awningMint
      : variant === 'cream'
        ? TOYBOX_MATERIALS.awningCoral
        : variant === 'sage'
          ? TOYBOX_MATERIALS.taxiAmber
          : TOYBOX_MATERIALS.awningNavy;

  const w = 2.6;
  const h = 2.45;
  const d = 2.0;

  return (
    <group
      name="corner-building-accent-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* Limestone Plinth Step Flush at y = 0 */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.15, 0]}
        material={TOYBOX_MATERIALS.limestoneCurb}
      >
        <boxGeometry args={[w + 0.16, 0.3, d + 0.16]} />
      </mesh>

      {/* Main Low-Profile Corner Kiosk / Brownstone Volume */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.3 + (h - 0.3) * 0.5, 0]}
        material={facadeMat}
      >
        <boxGeometry args={[w, h - 0.3, d]} />
      </mesh>

      {/* Sunlit Cornice Trim */}
      <mesh
        castShadow
        position={[0, h + 0.08, 0]}
        material={TOYBOX_MATERIALS.limestoneTrim}
      >
        <boxGeometry args={[w + 0.22, 0.16, d + 0.22]} />
      </mesh>

      {/* Roof Tar Cap */}
      <mesh
        receiveShadow
        position={[0, h + 0.18, 0]}
        material={TOYBOX_MATERIALS.roofTarDeck}
      >
        <boxGeometry args={[w - 0.1, 0.04, d - 0.1]} />
      </mesh>

      {/* Warm Storefront Window & Striped Sloped Awning on +Z Face */}
      <mesh
        position={[0, 1.25, d * 0.5 + 0.02]}
        material={TOYBOX_MATERIALS.windowWarmGlow}
      >
        <boxGeometry args={[1.65, 0.88, 0.04]} />
      </mesh>
      <mesh
        castShadow
        position={[0, 1.82, d * 0.5 + 0.34]}
        rotation={[0.35, 0, 0]}
        material={awningMat}
      >
        <boxGeometry args={[2.0, 0.1, 0.72]} />
      </mesh>

      {/* Cedar Window Flower Box */}
      <mesh
        castShadow
        position={[0, 0.74, d * 0.5 + 0.14]}
        material={TOYBOX_MATERIALS.cedarWood}
      >
        <boxGeometry args={[1.55, 0.16, 0.22]} />
      </mesh>
      {[-0.45, 0, 0.45].map((fx, idx) => (
        <mesh
          key={idx}
          position={[fx, 0.88, d * 0.5 + 0.14]}
          material={
            idx % 2 === 0
              ? TOYBOX_MATERIALS.foliageEmerald
              : TOYBOX_MATERIALS.flowerCoral
          }
        >
          <dodecahedronGeometry args={[0.12, 0]} />
        </mesh>
      ))}

      {showWireframe && (
        <mesh
          position={[0, (h + 0.2) * 0.5, 0]}
          material={TOYBOX_MATERIALS.qaColliderWireframe}
        >
          <boxGeometry args={[w + 0.22, h + 0.2, d + 0.22]} />
        </mesh>
      )}
    </group>
  );
}
