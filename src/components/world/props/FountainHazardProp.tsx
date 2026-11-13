'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TOYBOX_MATERIALS } from '@/materials';

export interface FountainHazardPropProps {
  position?: [number, number, number];
  radius?: number;
  lastSplashAt?: number;
  showWireframe?: boolean;
}

const PLUME_COUNT = 14;
const SPLASH_DROP_COUNT = 12;

/**
 * Multi-tier Limestone Plaza Fountain Hazard seated cleanly at y = 0.
 * Features a stone basin rim, shimmering turquoise water, tiered bowl & brass spout,
 * animated cascading droplets, and splash burst trigger.
 */
export function FountainHazardProp({
  position = [0, 0, 0],
  radius = 1.52,
  lastSplashAt = -10,
  showWireframe = false,
}: FountainHazardPropProps) {
  const plumeGroupRef = useRef<THREE.Group>(null);
  const splashGroupRef = useRef<THREE.Group>(null);
  const splashRingRef = useRef<THREE.Mesh>(null);
  const waterSurfaceRef = useRef<THREE.Mesh>(null);

  const rimHeight = 0.28;
  const innerR = Math.max(0.85, radius - 0.22);

  // Watertight limestone basin wall + beveled top coping ring seated flush at y = 0
  const { rimWallGeo, copingGeo } = useMemo(() => {
    const wallShape = new THREE.Shape();
    wallShape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    const wallHole = new THREE.Path();
    wallHole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
    wallShape.holes.push(wallHole);
    const wGeo = new THREE.ExtrudeGeometry(wallShape, {
      depth: rimHeight,
      bevelEnabled: false,
      curveSegments: 24,
    });
    wGeo.rotateX(-Math.PI * 0.5);

    const copeShape = new THREE.Shape();
    copeShape.absarc(0, 0, radius + 0.04, 0, Math.PI * 2, false);
    const copeHole = new THREE.Path();
    copeHole.absarc(0, 0, innerR - 0.02, 0, Math.PI * 2, true);
    copeShape.holes.push(copeHole);
    const cGeo = new THREE.ExtrudeGeometry(copeShape, {
      depth: 0.06,
      bevelEnabled: false,
      curveSegments: 24,
    });
    cGeo.rotateX(-Math.PI * 0.5);

    return { rimWallGeo: wGeo, copingGeo: cGeo };
  }, [radius, innerR, rimHeight]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const now = performance.now() * 0.001;

    if (waterSurfaceRef.current) {
      const s = 1 + Math.sin(t * 2.4) * 0.012;
      waterSurfaceRef.current.scale.set(s, 1, s);
    }

    if (plumeGroupRef.current) {
      const children = plumeGroupRef.current.children;
      for (let i = 0; i < children.length; i++) {
        const drop = children[i];
        const u = (t * 1.25 + i / PLUME_COUNT) % 1.0;
        const ang = (i / PLUME_COUNT) * Math.PI * 2;
        const upper = i % 2 === 0;
        const startY = upper ? 0.96 : 0.6;
        const spread = upper ? u * 0.65 : 0.36 + u * 0.88;
        drop.position.set(
          Math.cos(ang) * spread,
          startY + Math.sin(u * Math.PI) * 0.56 - u * 0.45,
          Math.sin(ang) * spread
        );
        drop.scale.setScalar(0.068 + Math.sin(u * Math.PI) * 0.055);
      }
    }

    const dtSplash = now - lastSplashAt;
    const splashActive = dtSplash >= 0 && dtSplash < 0.6;
    if (splashRingRef.current) {
      splashRingRef.current.visible = splashActive;
      if (splashActive) {
        const s = 0.45 + (dtSplash / 0.6) * 1.85;
        splashRingRef.current.scale.set(s, s, 1);
      }
    }
    if (splashGroupRef.current) {
      splashGroupRef.current.visible = splashActive;
      if (splashActive) {
        const children = splashGroupRef.current.children;
        for (let i = 0; i < children.length; i++) {
          const ang = (i / SPLASH_DROP_COUNT) * Math.PI * 2;
          const d = children[i];
          d.position.set(
            Math.cos(ang) * (0.3 + dtSplash * 1.8),
            0.24 + 2.7 * dtSplash - 5.4 * dtSplash * dtSplash,
            Math.sin(ang) * (0.3 + dtSplash * 1.8)
          );
          d.scale.setScalar(0.12 * (1 - dtSplash / 0.6));
        }
      }
    }
  });

  return (
    <group name="fountain-hazard-prop" position={position}>
      {/* Deep Turquoise Basin Floor */}
      <mesh
        receiveShadow
        position={[0, 0.04, 0]}
        material={TOYBOX_MATERIALS.turquoiseWaterDeep}
      >
        <cylinderGeometry args={[innerR, innerR, 0.08, 24]} />
      </mesh>

      {/* Watertight Extruded Limestone Basin Wall (bottom flush at y = 0) */}
      <mesh
        castShadow
        receiveShadow
        geometry={rimWallGeo}
        material={TOYBOX_MATERIALS.limestoneCurb}
      />
      {/* Top Limestone Coping Ring */}
      <mesh
        castShadow
        receiveShadow
        position={[0, rimHeight, 0]}
        geometry={copingGeo}
        material={TOYBOX_MATERIALS.limestoneTrim}
      />

      {/* Shimmering Turquoise Water Pool */}
      <mesh
        ref={waterSurfaceRef}
        position={[0, 0.18, 0]}
        material={TOYBOX_MATERIALS.turquoiseWater}
      >
        <cylinderGeometry args={[innerR - 0.02, innerR - 0.02, 0.04, 24]} />
      </mesh>

      {/* Central Pedestal & Lower Bowl */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.34, 0]}
        material={TOYBOX_MATERIALS.limestoneSidewalk}
      >
        <cylinderGeometry args={[0.32, 0.44, 0.62, 12]} />
      </mesh>
      <mesh
        castShadow
        position={[0, 0.68, 0]}
        material={TOYBOX_MATERIALS.limestoneTrim}
      >
        <cylinderGeometry args={[0.92, 0.34, 0.16, 16]} />
      </mesh>
      <mesh position={[0, 0.76, 0]} material={TOYBOX_MATERIALS.turquoiseWater}>
        <cylinderGeometry args={[0.8, 0.8, 0.03, 16]} />
      </mesh>

      {/* Upper Column, Crown Bowl & Brass Spout Finial */}
      <mesh
        castShadow
        position={[0, 0.96, 0]}
        material={TOYBOX_MATERIALS.limestoneSidewalk}
      >
        <cylinderGeometry args={[0.18, 0.24, 0.42, 10]} />
      </mesh>
      <mesh
        castShadow
        position={[0, 1.18, 0]}
        material={TOYBOX_MATERIALS.limestoneTrim}
      >
        <cylinderGeometry args={[0.48, 0.2, 0.13, 12]} />
      </mesh>
      <mesh
        castShadow
        position={[0, 1.36, 0]}
        material={TOYBOX_MATERIALS.brassAccent}
      >
        <sphereGeometry args={[0.13, 12, 10]} />
      </mesh>

      {/* Cascading Water Beads */}
      <group ref={plumeGroupRef} position={[0, 0.36, 0]}>
        {Array.from({ length: PLUME_COUNT }, (_, idx) => (
          <mesh key={idx} material={TOYBOX_MATERIALS.waterBeadCyan}>
            <icosahedronGeometry args={[1, 0]} />
          </mesh>
        ))}
      </group>

      {/* Splash Ring & Droplets */}
      <mesh
        ref={splashRingRef}
        visible={false}
        position={[0, 0.21, 0]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        material={TOYBOX_MATERIALS.waterFoamWhite}
      >
        <ringGeometry args={[0.45, 0.78, 20]} />
      </mesh>
      <group ref={splashGroupRef} visible={false}>
        {Array.from({ length: SPLASH_DROP_COUNT }, (_, idx) => (
          <mesh key={idx} material={TOYBOX_MATERIALS.waterBeadCyan}>
            <icosahedronGeometry args={[1, 0]} />
          </mesh>
        ))}
      </group>

      {/* QA Collider & Water Sensor Wireframes */}
      {showWireframe && (
        <group>
          <mesh
            position={[0, 0.65, 0]}
            material={TOYBOX_MATERIALS.qaColliderWireframe}
          >
            <cylinderGeometry args={[0.44, 0.44, 1.3, 12]} />
          </mesh>
          <mesh
            position={[0, 0.22, 0]}
            material={TOYBOX_MATERIALS.qaSensorWireframe}
          >
            <cylinderGeometry args={[innerR, innerR, 0.36, 18]} />
          </mesh>
        </group>
      )}
    </group>
  );
}
