'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TOYBOX_MATERIALS } from '@/materials';
import { isQaFreezeActive, resolveAnimTime } from '../qaFreeze';
import { withPolygonOffset } from './propMaterials';

// Cached polygonOffset variants (never mutate the shared palette materials).
const WATER_MAT = withPolygonOffset(TOYBOX_MATERIALS.turquoiseWater, 1);
const WATER_DEEP_MAT = withPolygonOffset(TOYBOX_MATERIALS.turquoiseWaterDeep, 1);
const LILY_PAD_MAT = withPolygonOffset(TOYBOX_MATERIALS.lilyPadGreen, 1);
const SPLASH_RING_MAT = withPolygonOffset(TOYBOX_MATERIALS.waterFoamWhite, 2);

export interface FountainHazardPropProps {
  position?: [number, number, number];
  /** Outer coping radius in meters (default 1.25 -> 2.50m diameter matching COURSE_MASTER_PLAN). */
  radius?: number;
  lastSplashAt?: number;
  showWireframe?: boolean;
}

const UPPER_PLUME_COUNT = 8;
const LOWER_PLUME_COUNT = 16;
const SPLASH_DROP_COUNT = 12;

function createOctagonRingGeometry(
  outerR: number,
  innerR: number,
  height: number
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const hole = new THREE.Path();
  const sides = 8;
  const offset = Math.PI / 8;

  for (let i = 0; i <= sides; i++) {
    const a = offset + (i / sides) * Math.PI * 2;
    const x = Math.cos(a) * outerR;
    const y = Math.sin(a) * outerR;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }

  for (let i = 0; i <= sides; i++) {
    const a = offset - (i / sides) * Math.PI * 2;
    const x = Math.cos(a) * innerR;
    const y = Math.sin(a) * innerR;
    if (i === 0) hole.moveTo(x, y);
    else hole.lineTo(x, y);
  }
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    steps: 1,
  });
  geo.rotateX(-Math.PI * 0.5);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Walkabout: Venice-inspired Carved Limestone Octagonal Courtyard Fountain Hazard.
 * - Seated flush at local y = 0 (world +0.60m terrace), outer rim +0.28m (+0.31m coping),
 *   shimmering turquoise water pool at +0.18m.
 * - Central tiered octagonal pedestal, twin bowls, brass top spout (1.42m total height),
 *   and animated arching low-poly water plumes.
 */
export function FountainHazardProp({
  position = [0, 0, 0],
  radius = 1.25,
  lastSplashAt = -10,
  showWireframe = false,
}: FountainHazardPropProps) {
  const upperPlumeRef = useRef<THREE.Group>(null);
  const lowerPlumeRef = useRef<THREE.Group>(null);
  const splashGroupRef = useRef<THREE.Group>(null);
  const splashRingRef = useRef<THREE.Mesh>(null);
  const waterSurfaceRef = useRef<THREE.Mesh>(null);
  const elapsedRef = useRef(0);

  const wallOuterR = Math.max(0.95, radius - 0.06);
  const innerR = Math.max(0.68, wallOuterR - 0.22);
  const rimHeight = 0.28;
  const waterLevelY = 0.18;

  const { rimWallGeo, copingGeo, cornerPillars } = useMemo(() => {
    const wGeo = createOctagonRingGeometry(wallOuterR, innerR, rimHeight);
    const cGeo = createOctagonRingGeometry(radius, innerR - 0.03, 0.05);

    const pillarR = radius - 0.1;
    const pillars = Array.from({ length: 8 }, (_, idx) => {
      const a = Math.PI / 8 + (idx / 8) * Math.PI * 2;
      return [Math.cos(a) * pillarR, 0.16, Math.sin(a) * pillarR] as [
        number,
        number,
        number,
      ];
    });

    return { rimWallGeo: wGeo, copingGeo: cGeo, cornerPillars: pillars };
  }, [radius, wallOuterR, innerR, rimHeight]);

  useEffect(() => {
    return () => {
      rimWallGeo.dispose();
      copingGeo.dispose();
    };
  }, [rimWallGeo, copingGeo]);

  useFrame((_, delta) => {
    elapsedRef.current += Math.min(delta, 0.05);
    // Deterministic clock: frozen QA mode pins t = 4.0; every pose below is a pure function of t.
    const frozen = isQaFreezeActive();
    const t = resolveAnimTime(elapsedRef.current);
    const now =
      typeof performance !== 'undefined' ? performance.now() * 0.001 : t;

    if (waterSurfaceRef.current) {
      const s = 1 + Math.sin(t * 2.5) * 0.01;
      waterSurfaceRef.current.scale.set(s, 1, s);
    }

    if (upperPlumeRef.current) {
      const children = upperPlumeRef.current.children;
      for (let i = 0; i < children.length; i++) {
        const drop = children[i];
        const u = (t * 1.35 + i / UPPER_PLUME_COUNT) % 1.0;
        const ang = (i / UPPER_PLUME_COUNT) * Math.PI * 2;
        const r = 0.04 + u * 0.42;
        const y = 1.36 + Math.sin(u * Math.PI) * 0.26 - u * 0.5;
        drop.position.set(Math.cos(ang) * r, y, Math.sin(ang) * r);
        const s = 0.032 + Math.sin(u * Math.PI) * 0.026;
        // Align droplet elongation along radial outward + vertical arc velocity
        drop.rotation.set(0, -ang, 0);
        drop.scale.set(s * 1.25, s * 1.15, s * 0.85);
      }
    }

    if (lowerPlumeRef.current) {
      const children = lowerPlumeRef.current.children;
      for (let i = 0; i < children.length; i++) {
        const drop = children[i];
        const u = (t * 1.2 + i / LOWER_PLUME_COUNT) % 1.0;
        const ang = (i / LOWER_PLUME_COUNT) * Math.PI * 2 + 0.18;
        const r = 0.48 + u * (innerR * 0.8 - 0.48);
        const y = 0.82 + Math.sin(u * Math.PI) * 0.22 - u * 0.62;
        drop.position.set(Math.cos(ang) * r, y, Math.sin(ang) * r);
        const s = 0.038 + Math.sin(u * Math.PI) * 0.028;
        drop.rotation.set(0, -ang, 0);
        drop.scale.set(s * 1.25, s * 1.15, s * 0.85);
      }
    }

    const dtSplash = now - lastSplashAt;
    const splashActive = !frozen && dtSplash >= 0 && dtSplash < 0.65;
    if (splashRingRef.current) {
      if (splashActive) {
        const p = dtSplash / 0.65;
        splashRingRef.current.scale.setScalar(0.4 + p * 1.45);
      } else if (splashRingRef.current.scale.x !== 0) {
        splashRingRef.current.scale.setScalar(0);
      }
    }
    if (splashGroupRef.current) {
      const children = splashGroupRef.current.children;
      if (splashActive) {
        for (let i = 0; i < children.length; i++) {
          const drop = children[i];
          const a = (i / SPLASH_DROP_COUNT) * Math.PI * 2;
          const dist = dtSplash * 1.65;
          const h = dtSplash * 2.6 - 4.9 * dtSplash * dtSplash;
          drop.position.set(Math.cos(a) * dist, 0.22 + h, Math.sin(a) * dist);
          drop.scale.setScalar(Math.max(0.01, 0.07 * (1 - dtSplash / 0.65)));
        }
      } else {
        for (let i = 0; i < children.length; i++) {
          const drop = children[i];
          if (drop && drop.scale.x !== 0) {
            drop.scale.setScalar(0);
          }
        }
      }
    }
  });

  return (
    <group
      name="fountain-hazard-prop"
      position={position}
      userData={{ occludableProp: true }}
    >
      {/* Octagonal Limestone Basin Floor Slab Seated Flush at y = 0 */}
      <mesh
        receiveShadow
        position={[0, 0.025, 0]}
        rotation={[0, Math.PI / 8, 0]}
        material={TOYBOX_MATERIALS.poolWallLimestone}
      >
        <cylinderGeometry args={[wallOuterR - 0.012, wallOuterR - 0.012, 0.05, 8]} />
      </mesh>

      {/* Octagonal Carved Limestone Basin Wall (y: 0.00 -> 0.28) */}
      <mesh
        castShadow
        receiveShadow
        geometry={rimWallGeo}
        material={TOYBOX_MATERIALS.poolWallLimestone}
      />

      {/* Beveled Overhanging Coping Cap (y: 0.25 -> 0.30) */}
      <mesh
        castShadow
        receiveShadow
        position={[0, rimHeight - 0.03, 0]}
        geometry={copingGeo}
        material={TOYBOX_MATERIALS.limestoneTrim}
      />

      {/* Carved Corner Quoins on Octagon Vertices */}
      {cornerPillars.map(([px, py, pz], idx) => (
        <mesh
          key={`pillar-${idx}`}
          castShadow
          receiveShadow
          position={[px, py, pz]}
          rotation={[0, (idx * Math.PI) / 4, 0]}
          material={TOYBOX_MATERIALS.limestoneTrim}
        >
          <boxGeometry args={[0.14, 0.32, 0.14]} />
        </mesh>
      ))}

      {/* Shimmering Turquoise Water Pool (surface at exact y = +0.18m) */}
      <mesh
        ref={waterSurfaceRef}
        receiveShadow
        position={[0, waterLevelY, 0]}
        rotation={[0, Math.PI / 8, 0]}
        material={WATER_MAT}
      >
        <cylinderGeometry args={[innerR + 0.01, innerR + 0.01, 0.02, 8]} />
      </mesh>
      {/* Deeper Turquoise Inner Pool Shading Ring */}
      <mesh
        position={[0, waterLevelY - 0.015, 0]}
        rotation={[0, Math.PI / 8, 0]}
        material={WATER_DEEP_MAT}
      >
        <cylinderGeometry args={[innerR * 0.72, innerR * 0.72, 0.02, 8]} />
      </mesh>

      {/* Subtle Venice Lily Pad Accent */}
      <group position={[innerR * 0.56, waterLevelY + 0.023, innerR * 0.38]}>
        <mesh
          rotation={[0, 0.5, 0]}
          material={LILY_PAD_MAT}
        >
          <cylinderGeometry args={[0.14, 0.14, 0.014, 8]} />
        </mesh>
        <mesh
          position={[0.02, 0.025, 0]}
          material={TOYBOX_MATERIALS.lilyBlossomPink}
        >
          <dodecahedronGeometry args={[0.045, 0]} />
        </mesh>
      </group>

      {/* Central Octagonal Tiered Pedestal & Twin Bowls (total height 1.42m) */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.12, 0]}
        rotation={[0, Math.PI / 8, 0]}
        material={TOYBOX_MATERIALS.limestoneTrim}
      >
        <cylinderGeometry args={[0.3, 0.38, 0.18, 8]} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.45, 0]}
        rotation={[0, Math.PI / 8, 0]}
        material={TOYBOX_MATERIALS.poolWallLimestone}
      >
        <cylinderGeometry args={[0.16, 0.22, 0.52, 8]} />
      </mesh>
      {/* Lower Tier Octagonal Scalloped Basin Bowl */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.78, 0]}
        rotation={[0, Math.PI / 8, 0]}
        material={TOYBOX_MATERIALS.limestoneTrim}
      >
        <cylinderGeometry args={[0.56, 0.26, 0.18, 8]} />
      </mesh>
      <mesh
        position={[0, 0.885, 0]}
        rotation={[0, Math.PI / 8, 0]}
        material={WATER_MAT}
      >
        <cylinderGeometry args={[0.48, 0.48, 0.018, 8]} />
      </mesh>

      {/* Upper Tier Column & Top Finial Bowl */}
      <mesh
        castShadow
        position={[0, 0.99, 0]}
        rotation={[0, Math.PI / 8, 0]}
        material={TOYBOX_MATERIALS.poolWallLimestone}
      >
        <cylinderGeometry args={[0.1, 0.14, 0.24, 8]} />
      </mesh>
      <mesh
        castShadow
        position={[0, 1.13, 0]}
        rotation={[0, Math.PI / 8, 0]}
        material={TOYBOX_MATERIALS.limestoneTrim}
      >
        <cylinderGeometry args={[0.28, 0.13, 0.12, 8]} />
      </mesh>
      <mesh
        position={[0, 1.202, 0]}
        rotation={[0, Math.PI / 8, 0]}
        material={WATER_MAT}
      >
        <cylinderGeometry args={[0.23, 0.23, 0.016, 8]} />
      </mesh>

      {/* Brass Finial & Jet Nozzle Tip (top at exact 1.42m) */}
      <mesh
        castShadow
        position={[0, 1.29, 0]}
        material={TOYBOX_MATERIALS.brassAccent}
      >
        <cylinderGeometry args={[0.042, 0.08, 0.18, 8]} />
      </mesh>
      <mesh
        castShadow
        position={[0, 1.39, 0]}
        material={TOYBOX_MATERIALS.brassAccent}
      >
        <coneGeometry args={[0.045, 0.06, 8]} />
      </mesh>

      {/* Animated Smooth Arching Water Plumes */}
      <group ref={upperPlumeRef}>
        {Array.from({ length: UPPER_PLUME_COUNT }, (_, idx) => (
          <mesh
            key={`uplume-${idx}`}
            material={
              idx % 2 === 0
                ? TOYBOX_MATERIALS.waterBeadCyan
                : TOYBOX_MATERIALS.waterFoamWhite
            }
          >
            <icosahedronGeometry args={[1, 1]} />
          </mesh>
        ))}
      </group>
      <group ref={lowerPlumeRef}>
        {Array.from({ length: LOWER_PLUME_COUNT }, (_, idx) => (
          <mesh
            key={`lplume-${idx}`}
            material={
              idx % 3 === 0
                ? TOYBOX_MATERIALS.waterFoamWhite
                : TOYBOX_MATERIALS.waterBeadCyan
            }
          >
            <icosahedronGeometry args={[1, 1]} />
          </mesh>
        ))}
      </group>

      {/* Ball-In-Water Splash Ripple & Burst (mounted visible={true}, scale={0} until splash) */}
      <mesh
        ref={splashRingRef}
        visible={true}
        scale={0}
        castShadow={false}
        frustumCulled={false}
        position={[0, waterLevelY + 0.026, 0]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        material={SPLASH_RING_MAT}
      >
        <ringGeometry args={[0.22, 0.34, 16]} />
      </mesh>
      <group ref={splashGroupRef} visible={true}>
        {Array.from({ length: SPLASH_DROP_COUNT }, (_, idx) => (
          <mesh
            key={`splash-${idx}`}
            visible={true}
            scale={0}
            castShadow={false}
            frustumCulled={false}
            material={TOYBOX_MATERIALS.waterBeadCyan}
          >
            <icosahedronGeometry args={[1, 1]} />
          </mesh>
        ))}
      </group>

      {/* QA Outer Bounds Cylinder */}
      {showWireframe && (
        <mesh
          position={[0, 0.71, 0]}
          material={TOYBOX_MATERIALS.qaSensorWireframe}
        >
          <cylinderGeometry args={[radius, radius, 1.42, 8]} />
        </mesh>
      )}
    </group>
  );
}
