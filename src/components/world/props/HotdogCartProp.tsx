'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  buildCoaxialUmbrellaSpec,
  buildCoaxialWheelSpec,
  type CoaxialWheelSpec,
} from '@/engine/geometryHelpers';
import { CONFETTI_TOYBOX_MATERIALS, TOYBOX_MATERIALS } from '@/materials';

export interface HotdogCartPropProps {
  position?: [number, number, number];
  rotationY?: number;
  /** Timestamp (performance.now() * 0.001 or clock elapsed seconds) of most recent umbrella hit. */
  lastHitAt?: number;
  showWireframe?: boolean;
}

const STEAM_COUNT = 8;
const CONFETTI_COUNT = 18;

/**
 * Shared sub-component rendering a coaxial spoked wheel directly from CoaxialWheelSpec.
 * Every tire, rim, hub, spoke, and axle shares the exact same wheel rotation plane & center.
 */
export function CoaxialWheelMeshGroup({
  spec,
  position,
  tireMaterial = TOYBOX_MATERIALS.tireRubber,
  rimMaterial = TOYBOX_MATERIALS.chromeSilver,
  hubMaterial = TOYBOX_MATERIALS.brassAccent,
}: {
  spec: CoaxialWheelSpec;
  position: [number, number, number];
  tireMaterial?: THREE.Material;
  rimMaterial?: THREE.Material;
  hubMaterial?: THREE.Material;
}) {
  return (
    <group position={position}>
      {/* Torus Tire (bottom touches exact y = 0) */}
      <mesh
        castShadow
        receiveShadow
        position={spec.tire.position}
        rotation={spec.tire.rotation}
        material={tireMaterial}
      >
        <torusGeometry
          args={[
            spec.tire.majorRadius,
            spec.tire.tubeRadius,
            spec.tire.radialSegments,
            spec.tire.tubularSegments,
          ]}
        />
      </mesh>

      {/* Coaxial Inner Metal Rim Band */}
      <mesh
        castShadow
        position={spec.rim.position}
        rotation={spec.rim.rotation}
        material={rimMaterial}
      >
        <cylinderGeometry
          args={[
            spec.rim.outerRadius,
            spec.rim.outerRadius,
            spec.rim.width,
            spec.rim.radialSegments,
            1,
            true,
          ]}
        />
      </mesh>

      {/* Coaxial Hub & Axle */}
      <mesh
        castShadow
        position={spec.hub.position}
        rotation={spec.hub.rotation}
        material={hubMaterial}
      >
        <cylinderGeometry
          args={[
            spec.hub.radius,
            spec.hub.radius,
            spec.hub.width,
            spec.hub.radialSegments,
          ]}
        />
      </mesh>
      <mesh
        position={spec.axle.position}
        rotation={spec.axle.rotation}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry
          args={[
            spec.axle.radius,
            spec.axle.radius,
            spec.axle.length,
            spec.axle.radialSegments,
          ]}
        />
      </mesh>

      {/* Coaxial Radial Spokes lying strictly inside the wheel plane */}
      {spec.spokes.map((spoke) => (
        <mesh
          key={spoke.index}
          castShadow
          position={spoke.position}
          rotation={spoke.rotation}
          material={rimMaterial}
        >
          <cylinderGeometry args={[spoke.radius, spoke.radius, spoke.length, 6]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Curbside Hotdog Cart & Bouncy Striped Umbrella.
 * - Twin coaxial spoked wheels flush at y = 0 with wide underpass clearance for Skimmer shots.
 * - Coaxial striped umbrella canopy with squash-and-stretch hit spring, brass vendor bell, and steamer puffs.
 */
export function HotdogCartProp({
  position = [0, 0, 0],
  rotationY = 0,
  lastHitAt = -10,
  showWireframe = false,
}: HotdogCartPropProps) {
  const canopyBounceRef = useRef<THREE.Group>(null);
  const bellRef = useRef<THREE.Group>(null);
  const steamGroupRef = useRef<THREE.Group>(null);
  const confettiGroupRef = useRef<THREE.Group>(null);

  const wheelSpec = useMemo(
    () =>
      buildCoaxialWheelSpec({
        outerRadius: 0.34,
        tireTubeRadius: 0.068,
        axleAxis: 'x',
        spokeCount: 8,
        rimWidth: 0.085,
        hubRadius: 0.062,
        hubWidth: 0.12,
        axleRadius: 0.022,
        axleLength: 0.2,
      }),
    []
  );

  // Umbrella mounted on cart counter top (y = 1.18) -> canopy base at 2.04m, apex at 2.46m
  const cartDeckY = 1.18;
  const umbrellaSpec = useMemo(
    () =>
      buildCoaxialUmbrellaSpec({
        canopyBaseY: 0.86,
        canopyHeight: 0.42,
        canopyRadius: 1.28,
        ribCount: 8,
        poleRadius: 0.032,
        baseStandRadius: 0.14,
        baseStandHeight: 0.04,
        restitution: 0.55,
      }),
    []
  );

  const confettiSpecs = useMemo(() => {
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => {
      const ang = (i / CONFETTI_COUNT) * Math.PI * 2;
      const spd = 1.8 + (i % 4) * 0.65;
      return {
        vx: Math.cos(ang) * spd,
        vy: 2.8 + (i % 5) * 0.5,
        vz: Math.sin(ang) * spd,
        rotSpeed: 6 + (i % 4) * 2,
      };
    });
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const now = performance.now() * 0.001;
    const dtAnim = now - lastHitAt;
    const hitActive = dtAnim >= 0 && dtAnim < 0.85;

    if (canopyBounceRef.current) {
      if (hitActive) {
        const decay = Math.exp(-5.6 * dtAnim);
        const wave = Math.cos(dtAnim * 24.0);
        const sy = 1.0 - 0.34 * decay * wave;
        const sxz = 1.0 + 0.22 * decay * wave;
        canopyBounceRef.current.scale.set(sxz, sy, sxz);
      } else {
        const breathe = 1.0 + Math.sin(t * 2.1) * 0.01;
        canopyBounceRef.current.scale.set(breathe, 1.0, breathe);
      }
    }

    if (bellRef.current) {
      if (dtAnim >= 0 && dtAnim < 0.95) {
        bellRef.current.rotation.z =
          Math.sin(dtAnim * 42.0) * 0.48 * Math.exp(-3.4 * dtAnim);
      } else {
        bellRef.current.rotation.z = Math.sin(t * 1.9) * 0.04;
      }
    }

    if (steamGroupRef.current) {
      const children = steamGroupRef.current.children;
      const boost = hitActive ? 1.7 : 1.0;
      for (let i = 0; i < children.length; i++) {
        const puff = children[i];
        const phase = (t * 0.85 + i / STEAM_COUNT) % 1.0;
        const ang = i * 0.85;
        puff.position.set(
          Math.cos(ang) * 0.16 * phase * boost,
          phase * 0.72 * boost,
          Math.sin(ang) * 0.16 * phase * boost
        );
        puff.scale.setScalar(Math.max(0.01, Math.sin(phase * Math.PI) * 0.11 * boost));
      }
    }

    if (confettiGroupRef.current) {
      const burstActive = dtAnim >= 0 && dtAnim < 1.05;
      confettiGroupRef.current.visible = burstActive;
      if (burstActive) {
        const children = confettiGroupRef.current.children;
        for (let i = 0; i < children.length; i++) {
          const spec = confettiSpecs[i];
          const chip = children[i];
          chip.position.set(
            spec.vx * dtAnim,
            spec.vy * dtAnim - 4.8 * dtAnim * dtAnim,
            spec.vz * dtAnim
          );
          chip.rotation.x = dtAnim * spec.rotSpeed;
          chip.rotation.z = dtAnim * spec.rotSpeed * 0.8;
          chip.scale.setScalar(Math.max(0.01, (1 - dtAnim / 1.05) * 0.12));
        }
      }
    }
  });

  const sliceAngle = (Math.PI * 2) / umbrellaSpec.canopy.segments;
  const canopyCenterY = umbrellaSpec.canopy.position[1];

  return (
    <group
      name="hotdog-cart-umbrella-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* Twin Coaxial Spoked Wheels Flush at y = 0 (1.38m clear tunnel gap between tires!) */}
      <CoaxialWheelMeshGroup spec={wheelSpec} position={[-0.76, 0, 0]} />
      <CoaxialWheelMeshGroup spec={wheelSpec} position={[0.76, 0, 0]} />

      {/* Vertical Wheel Struts connecting Axle Hubs (y=0.34) up into Cart Underside (y=0.60) */}
      {[-0.68, 0.68].map((sx, idx) => (
        <mesh
          key={`strut-${idx}`}
          castShadow
          position={[sx, 0.48, 0]}
          material={TOYBOX_MATERIALS.darkIron}
        >
          <boxGeometry args={[0.07, 0.3, 0.09]} />
        </mesh>
      ))}

      {/* Elevated Cart Chassis (bottom at y = 0.60 > 0.56m clear underpass!) */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.86, 0]}
        material={TOYBOX_MATERIALS.awningCoral}
      >
        <boxGeometry args={[1.32, 0.52, 1.88]} />
      </mesh>
      {/* Crisp Cream Waist Stripe */}
      <mesh
        position={[0, 0.86, 0]}
        material={TOYBOX_MATERIALS.awningCream}
      >
        <boxGeometry args={[1.35, 0.16, 1.91]} />
      </mesh>
      {/* Brushed Stainless Cart Counter Top (top at y = 1.18) */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 1.15, 0]}
        material={TOYBOX_MATERIALS.chromeSilver}
      >
        <boxGeometry args={[1.42, 0.06, 1.98]} />
      </mesh>
      {/* Rear Push Handle (-Z) */}
      <mesh
        castShadow
        position={[0, 1.06, -1.06]}
        rotation={[0, 0, Math.PI * 0.5]}
        material={TOYBOX_MATERIALS.chromeSilver}
      >
        <cylinderGeometry args={[0.026, 0.026, 1.16, 8]} />
      </mesh>
      {[-0.52, 0.52].map((hx, idx) => (
        <mesh
          key={`handle-arm-${idx}`}
          position={[hx, 1.06, -1.0]}
          rotation={[Math.PI * 0.5, 0, 0]}
          material={TOYBOX_MATERIALS.chromeSilver}
        >
          <cylinderGeometry args={[0.022, 0.022, 0.18, 6]} />
        </mesh>
      ))}

      {/* 3D Hotdog-in-a-Bun Display Sign on Counter */}
      <group position={[0.26, 1.29, 0.42]} rotation={[0, -0.35, 0]}>
        <mesh
          castShadow
          rotation={[Math.PI * 0.5, 0, 0]}
          material={TOYBOX_MATERIALS.hotdogBun}
        >
          <capsuleGeometry args={[0.11, 0.34, 6, 10]} />
        </mesh>
        <mesh
          castShadow
          position={[0, 0.055, 0]}
          rotation={[Math.PI * 0.5, 0, 0]}
          material={TOYBOX_MATERIALS.hotdogSausage}
        >
          <capsuleGeometry args={[0.072, 0.42, 6, 10]} />
        </mesh>
      </group>

      {/* Steamer Lid & Rising Steam Puffs */}
      <mesh
        castShadow
        position={[-0.24, 1.23, -0.38]}
        material={TOYBOX_MATERIALS.chromeSilver}
      >
        <boxGeometry args={[0.52, 0.1, 0.62]} />
      </mesh>
      <group ref={steamGroupRef} position={[-0.24, 1.3, -0.38]}>
        {Array.from({ length: STEAM_COUNT }, (_, idx) => (
          <mesh key={idx} material={TOYBOX_MATERIALS.steamColumnWhite}>
            <icosahedronGeometry args={[1, 1]} />
          </mesh>
        ))}
      </group>

      {/* Shiny Brass Vendor Bell Hanging on Front Corner */}
      <group ref={bellRef} position={[-0.56, 1.32, 0.86]}>
        <mesh
          castShadow
          position={[0, -0.07, 0]}
          material={TOYBOX_MATERIALS.brassAccent}
        >
          <coneGeometry args={[0.13, 0.18, 12]} />
        </mesh>
        <mesh position={[0, 0.03, 0]} material={TOYBOX_MATERIALS.brassAccent}>
          <sphereGeometry args={[0.04, 8, 8]} />
        </mesh>
      </group>

      {/* Coaxial Bouncy Striped Umbrella Mounted Flush on Counter (y = 1.18) */}
      <group position={[0, cartDeckY, 0]}>
        <mesh
          castShadow
          position={umbrellaSpec.baseStand.position}
          material={TOYBOX_MATERIALS.brassAccent}
        >
          <cylinderGeometry
            args={[
              umbrellaSpec.baseStand.radius,
              umbrellaSpec.baseStand.radius * 1.08,
              umbrellaSpec.baseStand.height,
              14,
            ]}
          />
        </mesh>
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

        {/* Coaxial Stretchers & Squash-and-Stretch Canopy */}
        <group
          ref={canopyBounceRef}
          position={[0, canopyCenterY, 0]}
        >
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

            {/* 8 Alternating Coral & Cream Canopy Wedges Aligned to Ribs */}
            {Array.from({ length: umbrellaSpec.canopy.segments }, (_, idx) => {
              const thetaStart = Math.PI * 0.5 + idx * sliceAngle;
              const midAz = (idx + 0.5) * sliceAngle;
              const mat =
                idx % 2 === 0
                  ? TOYBOX_MATERIALS.awningCoral
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
                        0.05,
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
                  {/* Scalloped Valance Flap */}
                  <mesh
                    castShadow
                    position={[
                      Math.cos(midAz) * (umbrellaSpec.canopy.radius * 0.94),
                      umbrellaSpec.canopy.baseY - 0.06,
                      -Math.sin(midAz) * (umbrellaSpec.canopy.radius * 0.94),
                    ]}
                    rotation={[0, midAz + Math.PI * 0.5, 0]}
                    material={mat}
                  >
                    <boxGeometry args={[umbrellaSpec.canopy.radius * 0.72, 0.13, 0.04]} />
                  </mesh>
                </React.Fragment>
              );
            })}

            {/* Coaxial Brass Finial */}
            <mesh
              castShadow
              position={umbrellaSpec.finial.position}
              material={TOYBOX_MATERIALS.brassAccent}
            >
              <sphereGeometry args={[umbrellaSpec.finial.radius * 1.4, 10, 8]} />
            </mesh>
          </group>
        </group>

        {/* Confetti Pop on Umbrella Bounce */}
        <group
          ref={confettiGroupRef}
          position={[0, umbrellaSpec.canopy.apexY, 0]}
          visible={false}
        >
          {confettiSpecs.map((_, idx) => (
            <mesh
              key={idx}
              material={CONFETTI_TOYBOX_MATERIALS[idx % CONFETTI_TOYBOX_MATERIALS.length]}
            >
              <boxGeometry args={[1, 0.16, 0.65]} />
            </mesh>
          ))}
        </group>
      </group>

      {/* QA Collider & Underpass Wireframes */}
      {showWireframe && (
        <group>
          {/* Left & Right Wheel Colliders */}
          {[-0.76, 0.76].map((wx, idx) => (
            <mesh
              key={`wf-w-${idx}`}
              position={[wx, wheelSpec.outerRadius, 0]}
              material={TOYBOX_MATERIALS.qaColliderWireframe}
            >
              <boxGeometry
                args={[0.2, wheelSpec.outerRadius * 2, wheelSpec.outerRadius * 2]}
              />
            </mesh>
          ))}
          {/* Cart Body Collider */}
          <mesh position={[0, 0.89, 0]} material={TOYBOX_MATERIALS.qaColliderWireframe}>
            <boxGeometry args={[1.4, 0.58, 1.98]} />
          </mesh>
          {/* Clear Underpass Tunnel Indicator */}
          <mesh position={[0, 0.28, 0]} material={TOYBOX_MATERIALS.qaSensorWireframe}>
            <boxGeometry args={[1.05, 0.56, 2.0]} />
          </mesh>
          {/* Umbrella Trampoline Collider */}
          <mesh
            position={[
              umbrellaSpec.trampolineCollider.center[0],
              cartDeckY + umbrellaSpec.trampolineCollider.center[1],
              umbrellaSpec.trampolineCollider.center[2],
            ]}
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
