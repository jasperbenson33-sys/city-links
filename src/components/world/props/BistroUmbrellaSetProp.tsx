'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildCoaxialUmbrellaSpec } from '@/engine/geometryHelpers';
import { TOYBOX_MATERIALS } from '@/materials';

export interface BistroUmbrellaSetPropProps {
  position?: [number, number, number];
  rotationY?: number;
  lastHitAt?: number;
  showWireframe?: boolean;
}

/**
 * Sidewalk & Terrace Bistro Umbrella Set built with buildCoaxialUmbrellaSpec.
 * Features a cast-iron stand flush at y = 0, coaxial cafe table, twin bistro chairs,
 * and a striped mint/cream trampoline umbrella canopy (restitution: 0.55).
 */
export function BistroUmbrellaSetProp({
  position = [0, 0, 0],
  rotationY = 0,
  lastHitAt = -10,
  showWireframe = false,
}: BistroUmbrellaSetPropProps) {
  const canopyRef = useRef<THREE.Group>(null);

  const umbrellaSpec = useMemo(
    () =>
      buildCoaxialUmbrellaSpec({
        canopyBaseY: 1.88,
        canopyHeight: 0.38,
        canopyRadius: 1.12,
        ribCount: 8,
        poleRadius: 0.028,
        baseStandRadius: 0.24,
        baseStandHeight: 0.05,
        restitution: 0.55,
      }),
    []
  );

  useFrame(({ clock }) => {
    if (!canopyRef.current) return;
    const t = clock.getElapsedTime();
    const dt = performance.now() * 0.001 - lastHitAt;
    if (dt >= 0 && dt < 0.75) {
      const decay = Math.exp(-5.6 * dt);
      const wave = Math.cos(dt * 24.0);
      canopyRef.current.scale.set(1 + 0.2 * decay * wave, 1 - 0.3 * decay * wave, 1 + 0.2 * decay * wave);
    } else {
      const sway = 1 + Math.sin(t * 2.0 + position[0]) * 0.008;
      canopyRef.current.scale.set(sway, 1, sway);
    }
  });

  const sliceAngle = (Math.PI * 2) / umbrellaSpec.canopy.segments;
  const canopyCenterY = umbrellaSpec.canopy.position[1];

  return (
    <group
      name="bistro-umbrella-set-prop"
      position={position}
      rotation={[0, rotationY, 0]}
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
            umbrellaSpec.baseStand.radius * 0.85,
            umbrellaSpec.baseStand.radius,
            umbrellaSpec.baseStand.height,
            16,
          ]}
        />
      </mesh>

      {/* Coaxial Pole */}
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

      {/* Coaxial Runner Hub */}
      <mesh
        position={umbrellaSpec.runnerHub.position}
        material={TOYBOX_MATERIALS.chromeSilver}
      >
        <cylinderGeometry
          args={[
            umbrellaSpec.runnerHub.radius,
            umbrellaSpec.runnerHub.radius,
            umbrellaSpec.runnerHub.height,
            12,
          ]}
        />
      </mesh>

      {/* Coaxial Cafe Tabletop Around Center Pole (y = 0.76m) */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.76, 0]}
        material={TOYBOX_MATERIALS.bistroTableTop}
      >
        <cylinderGeometry args={[0.52, 0.52, 0.048, 20]} />
      </mesh>
      <mesh position={[0, 0.725, 0]} material={TOYBOX_MATERIALS.brassAccent}>
        <cylinderGeometry args={[0.53, 0.53, 0.025, 20]} />
      </mesh>
      {/* Espresso Cup on Table */}
      <mesh
        castShadow
        position={[0.24, 0.815, 0.14]}
        material={TOYBOX_MATERIALS.awningCoral}
      >
        <cylinderGeometry args={[0.048, 0.036, 0.06, 10]} />
      </mesh>

      {/* Two Bistro Chairs Seated Flush at y = 0 */}
      {[-0.78, 0.78].map((cx, idx) => {
        const dir = cx < 0 ? 1 : -1;
        return (
          <group key={`chair-${idx}`} position={[cx, 0, 0]}>
            {/* 4 Chair Legs Touching Exact y = 0 */}
            {[
              [-0.14, -0.14],
              [0.14, -0.14],
              [-0.14, 0.14],
              [0.14, 0.14],
            ].map(([lx, lz], lIdx) => (
              <mesh
                key={lIdx}
                castShadow
                position={[lx, 0.21, lz]}
                material={TOYBOX_MATERIALS.bistroCastIron}
              >
                <cylinderGeometry args={[0.018, 0.015, 0.42, 6]} />
              </mesh>
            ))}
            {/* Seat Pad */}
            <mesh
              castShadow
              receiveShadow
              position={[0, 0.43, 0]}
              material={TOYBOX_MATERIALS.cedarWood}
            >
              <cylinderGeometry args={[0.2, 0.2, 0.04, 12]} />
            </mesh>
            {/* Chair Backrest */}
            <mesh
              castShadow
              position={[-dir * 0.16, 0.64, 0]}
              material={TOYBOX_MATERIALS.bistroCastIron}
            >
              <boxGeometry args={[0.035, 0.42, 0.3]} />
            </mesh>
          </group>
        );
      })}

      {/* Coaxial Striped Mint & Cream Trampoline Canopy */}
      <group ref={canopyRef} position={[0, canopyCenterY, 0]}>
        <group position={[0, -canopyCenterY, 0]}>
          {umbrellaSpec.ribs.map((rib) => (
            <mesh
              key={`rib-${rib.index}`}
              position={rib.position}
              rotation={rib.rotation}
              material={TOYBOX_MATERIALS.darkIron}
            >
              <cylinderGeometry args={[rib.radius, rib.radius, rib.length, 6]} />
            </mesh>
          ))}
          {umbrellaSpec.stretchers.map((st) => (
            <mesh
              key={`str-${st.index}`}
              position={st.position}
              rotation={st.rotation}
              material={TOYBOX_MATERIALS.chromeSilver}
            >
              <cylinderGeometry args={[st.radius, st.radius, st.length, 6]} />
            </mesh>
          ))}
          {Array.from({ length: umbrellaSpec.canopy.segments }, (_, idx) => {
            const thetaStart = Math.PI * 0.5 + idx * sliceAngle;
            const midAz = (idx + 0.5) * sliceAngle;
            const mat =
              idx % 2 === 0
                ? TOYBOX_MATERIALS.awningMint
                : TOYBOX_MATERIALS.awningCream;
            return (
              <React.Fragment key={`wedge-${idx}`}>
                <mesh
                  castShadow
                  receiveShadow
                  position={umbrellaSpec.canopy.position}
                  material={mat}
                >
                  <cylinderGeometry
                    args={[
                      0.045,
                      umbrellaSpec.canopy.radius,
                      umbrellaSpec.canopy.height,
                      1,
                      1,
                      false,
                      thetaStart,
                      sliceAngle,
                    ]}
                  />
                </mesh>
                <mesh
                  castShadow
                  position={[
                    Math.cos(midAz) * (umbrellaSpec.canopy.radius * 0.94),
                    umbrellaSpec.canopy.baseY - 0.05,
                    -Math.sin(midAz) * (umbrellaSpec.canopy.radius * 0.94),
                  ]}
                  rotation={[0, midAz + Math.PI * 0.5, 0]}
                  material={mat}
                >
                  <boxGeometry args={[umbrellaSpec.canopy.radius * 0.7, 0.11, 0.036]} />
                </mesh>
              </React.Fragment>
            );
          })}
          <mesh
            castShadow
            position={umbrellaSpec.finial.position}
            material={TOYBOX_MATERIALS.brassAccent}
          >
            <sphereGeometry args={[umbrellaSpec.finial.radius * 1.4, 10, 8]} />
          </mesh>
        </group>
      </group>

      {showWireframe && (
        <group>
          <mesh
            position={[0, 0.45, 0]}
            material={TOYBOX_MATERIALS.qaColliderWireframe}
          >
            <cylinderGeometry args={[0.55, 0.55, 0.9, 14]} />
          </mesh>
          <mesh
            position={umbrellaSpec.trampolineCollider.center}
            material={TOYBOX_MATERIALS.qaBoundsWireframe}
          >
            <cylinderGeometry
              args={[
                umbrellaSpec.trampolineCollider.radius,
                umbrellaSpec.trampolineCollider.radius,
                umbrellaSpec.trampolineCollider.height,
                16,
              ]}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}
