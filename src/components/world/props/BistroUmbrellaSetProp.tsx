'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildCoaxialUmbrellaSpec } from '@/lib/geometryHelpers';
import { TOYBOX_MATERIALS } from '@/materials';
import { PROP_ACCENT_MATERIALS } from './propMaterials';
import { isQaFreezeActive, resolveAnimTime } from '../qaFreeze';

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

/** Minimum rendered radius for thin rods (>= 0.035m diameter, stylized). */
const MIN_THIN_RADIUS = 0.0175;

export type BistroUmbrellaVariant = 'mint' | 'terracotta' | 'ochre';

export interface BistroUmbrellaSetPropProps {
  position?: [number, number, number];
  rotationY?: number;
  lastHitAt?: number;
  variant?: BistroUmbrellaVariant;
  showWireframe?: boolean;
}

const VARIANT_MATERIALS: Record<
  BistroUmbrellaVariant,
  { primary: THREE.Material; alternate: THREE.Material }
> = {
  mint: {
    primary: TOYBOX_MATERIALS.awningMint,
    alternate: TOYBOX_MATERIALS.awningCream,
  },
  terracotta: {
    primary: PROP_ACCENT_MATERIALS.umbrellaTerracotta,
    alternate: TOYBOX_MATERIALS.awningCream,
  },
  ochre: {
    primary: PROP_ACCENT_MATERIALS.umbrellaOchre,
    alternate: PROP_ACCENT_MATERIALS.umbrellaBurgundy,
  },
};

/**
 * Walkabout: Venice-inspired Sidewalk & Terrace Bistro Umbrella Set built with
 * buildCoaxialUmbrellaSpec.
 * - Cast-iron stand flush at exact y = 0.00m.
 * - Round café bistro table with miniature espresso cup & saucer.
 * - Twin curved café chairs with all legs planted flush at y = 0.00m.
 * - Faceted 8-panel octagonal umbrella canopy with inner rib struts & squash-and-stretch hit spring.
 */
export function BistroUmbrellaSetProp({
  position = [0, 0, 0],
  rotationY = 0,
  lastHitAt = -10,
  variant = 'mint',
  showWireframe = false,
}: BistroUmbrellaSetPropProps) {
  const canopyRef = useRef<THREE.Group>(null);

  const umbrellaSpec = useMemo(
    () =>
      buildCoaxialUmbrellaSpec({
        canopyBaseY: 1.86,
        canopyHeight: 0.4,
        canopyRadius: 1.05,
        ribCount: 8,
        poleRadius: 0.026,
        baseStandRadius: 0.22,
        baseStandHeight: 0.04,
        restitution: 0.55,
      }),
    []
  );

  useFrame((state) => {
    // Absolute clock (no frame-rate dependent accumulation); pinned when ?qaFreezeParticles=1.
    const t = resolveAnimTime(state.clock.elapsedTime);
    if (!canopyRef.current) return;
    const frozen = isQaFreezeActive();
    const dt =
      (typeof performance !== 'undefined' ? performance.now() * 0.001 : t) -
      lastHitAt;
    if (!frozen && dt >= 0 && dt < 0.75) {
      const decay = Math.exp(-5.6 * dt);
      const wave = Math.cos(dt * 24.0);
      canopyRef.current.scale.set(
        1 + 0.18 * decay * wave,
        1 - 0.26 * decay * wave,
        1 + 0.18 * decay * wave
      );
    } else {
      const sway = 1 + Math.sin(t * 2.0 + position[0]) * 0.007;
      canopyRef.current.scale.set(sway, 1, sway);
    }
  });

  const palette = VARIANT_MATERIALS[variant];
  const sliceAngle = (Math.PI * 2) / umbrellaSpec.canopy.segments;
  const canopyCenterY = umbrellaSpec.canopy.position[1];

  return (
    <group
      name="bistro-umbrella-set-prop"
      position={position}
      rotation={[0, rotationY, 0]}
      userData={{ occludableProp: true }}
    >
      {/* Coaxial Cast-Iron Umbrella Stand Flush at y = 0 */}
      <mesh
        castShadow
        receiveShadow
        position={umbrellaSpec.baseStand.position}
        material={TOYBOX_MATERIALS.bistroCastIron}
      >
        <cylinderGeometry
          args={[
            umbrellaSpec.baseStand.radius * 0.82,
            umbrellaSpec.baseStand.radius,
            umbrellaSpec.baseStand.height,
            12,
          ]}
        />
      </mesh>

      {/* Coaxial Brass Center Pole */}
      <mesh
        castShadow
        position={umbrellaSpec.pole.position}
        material={TOYBOX_MATERIALS.brassAccent}
      >
        <cylinderGeometry
          args={[
            umbrellaSpec.pole.radius,
            umbrellaSpec.pole.radius,
            umbrellaSpec.pole.length,
            10,
          ]}
        />
      </mesh>

      {/* Round Bistro Marble-Top Café Table (top at y = 0.75) */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.735, 0]}
        material={layered(TOYBOX_MATERIALS.bistroTableTop, 1)}
      >
        <cylinderGeometry args={[0.42, 0.42, 0.03, 14]} />
      </mesh>
      <mesh
        position={[0, 0.7125, 0]}
        material={TOYBOX_MATERIALS.bistroCastIron}
      >
        <cylinderGeometry args={[0.435, 0.435, 0.015, 14]} />
      </mesh>

      {/* Espresso Saucer & Cup on Table */}
      <group position={[0.16, 0.75, 0.12]}>
        <mesh material={TOYBOX_MATERIALS.awningCream}>
          <cylinderGeometry args={[0.055, 0.04, 0.014, 10]} />
        </mesh>
        <mesh
          position={[0, 0.02, 0]}
          material={TOYBOX_MATERIALS.awningCream}
        >
          <cylinderGeometry args={[0.032, 0.024, 0.038, 10]} />
        </mesh>
      </group>

      {/* Twin Slender Venice Bistro Chairs Planted Flush at y = 0 */}
      {(
        [
          { pos: [-0.62, 0, 0.12] as [number, number, number], rotY: Math.PI * 0.45 },
          { pos: [0.62, 0, -0.12] as [number, number, number], rotY: -Math.PI * 0.55 },
        ]
      ).map((chair, cIdx) => (
        <group
          key={`chair-${cIdx}`}
          position={chair.pos}
          rotation={[0, chair.rotY, 0]}
        >
          {/* 4 Slender Wrought-Iron Chair Legs Resting Flush at y = 0 */}
          {(
            [
              [-0.14, -0.14],
              [0.14, -0.14],
              [-0.14, 0.14],
              [0.14, 0.14],
            ] as Array<[number, number]>
          ).map(([lx, lz], lIdx) => (
            <mesh
              key={`leg-${lIdx}`}
              position={[lx, 0.22, lz]}
              material={TOYBOX_MATERIALS.bistroCastIron}
            >
              <cylinderGeometry args={[0.0185, 0.0175, 0.44, 6]} />
            </mesh>
          ))}
          {/* Seat Ring & Warm Cedar Cushion */}
          <mesh
            castShadow
            receiveShadow
            position={[0, 0.45, 0]}
            material={TOYBOX_MATERIALS.bistroCastIron}
          >
            <cylinderGeometry args={[0.19, 0.19, 0.025, 10]} />
          </mesh>
          <mesh
            castShadow
            receiveShadow
            position={[0, 0.4725, 0]}
            material={layered(palette.primary, 1)}
          >
            <cylinderGeometry args={[0.17, 0.175, 0.025, 10]} />
          </mesh>
          {/* Backrest Uprights & Curved Rail */}
          {[-0.13, 0.13].map((bx, bIdx) => (
            <mesh
              key={`post-${bIdx}`}
              position={[bx, 0.65, -0.15]}
              rotation={[-0.08, 0, 0]}
              material={TOYBOX_MATERIALS.bistroCastIron}
            >
              <cylinderGeometry args={[0.0175, 0.0175, 0.4, 6]} />
            </mesh>
          ))}
          <mesh
            position={[0, 0.81, -0.165]}
            material={TOYBOX_MATERIALS.bistroCastIron}
          >
            <boxGeometry args={[0.3, 0.08, 0.036]} />
          </mesh>
        </group>
      ))}

      {/* Coaxial Octagonal Umbrella Canopy & Exposed Interior Ribs */}
      <group ref={canopyRef} position={[0, canopyCenterY, 0]}>
        {/* Runner Collar Hub */}
        <mesh
          position={[
            0,
            umbrellaSpec.runnerHub.position[1] - canopyCenterY,
            0,
          ]}
          material={TOYBOX_MATERIALS.brassAccent}
        >
          <cylinderGeometry
            args={[
              umbrellaSpec.runnerHub.radius,
              umbrellaSpec.runnerHub.radius,
              umbrellaSpec.runnerHub.height,
              10,
            ]}
          />
        </mesh>

        {/* 8 Striped Faceted Octagonal Pie Panels */}
        {Array.from({ length: umbrellaSpec.canopy.segments }, (_, idx) => (
          <mesh
            key={`panel-${idx}`}
            castShadow
            receiveShadow
            material={idx % 2 === 0 ? palette.primary : palette.alternate}
          >
            <coneGeometry
              args={[
                umbrellaSpec.canopy.radius,
                umbrellaSpec.canopy.height,
                1,
                1,
                false,
                idx * sliceAngle,
                sliceAngle,
              ]}
            />
          </mesh>
        ))}

        {/* Coaxial Rib Arms & Stretcher Struts */}
        {umbrellaSpec.ribs.map((rib) => (
          <mesh
            key={`rib-${rib.index}`}
            position={[
              rib.position[0],
              rib.position[1] - canopyCenterY,
              rib.position[2],
            ]}
            rotation={rib.rotation}
            material={layered(TOYBOX_MATERIALS.cedarWood, 1)}
          >
            <cylinderGeometry args={[Math.max(rib.radius, MIN_THIN_RADIUS), Math.max(rib.radius, MIN_THIN_RADIUS), rib.length, 6]} />
          </mesh>
        ))}
        {umbrellaSpec.stretchers.map((st) => (
          <mesh
            key={`stretcher-${st.index}`}
            position={[
              st.position[0],
              st.position[1] - canopyCenterY,
              st.position[2],
            ]}
            rotation={st.rotation}
            material={layered(TOYBOX_MATERIALS.brassAccent, 2)}
          >
            <cylinderGeometry args={[Math.max(st.radius, MIN_THIN_RADIUS), Math.max(st.radius, MIN_THIN_RADIUS), st.length, 6]} />
          </mesh>
        ))}

        {/* Top Brass Finial Cap */}
        <mesh
          castShadow
          position={[0, umbrellaSpec.finial.position[1] - canopyCenterY, 0]}
          material={TOYBOX_MATERIALS.brassAccent}
        >
          <sphereGeometry args={[umbrellaSpec.finial.radius, 10, 8]} />
        </mesh>
      </group>

      {/* QA Wireframe Envelope */}
      {showWireframe && (
        <group>
          <mesh
            position={[0, 1.16, 0]}
            material={TOYBOX_MATERIALS.qaBoundsWireframe}
          >
            <boxGeometry args={[2.1, 2.32, 2.1]} />
          </mesh>
          <mesh
            position={[0, canopyCenterY, 0]}
            material={TOYBOX_MATERIALS.qaColliderWireframe}
          >
            <cylinderGeometry
              args={[
                umbrellaSpec.canopy.radius,
                umbrellaSpec.canopy.radius,
                umbrellaSpec.canopy.height,
                8,
              ]}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}
