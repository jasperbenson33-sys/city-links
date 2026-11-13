'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildCoaxialHydrantSpec } from '@/engine/geometryHelpers';
import { TOYBOX_MATERIALS } from '@/materials';

export interface FireHydrantJetPropProps {
  position?: [number, number, number];
  rotationY?: number;
  jetRangeMeters?: number;
  lastSurfAt?: number;
  showWireframe?: boolean;
}

const STREAM_BEAD_COUNT = 22;
const BURST_DROP_COUNT = 12;

/**
 * Coaxial Fire Hydrant built directly from buildCoaxialHydrantSpec
 * with base flange flush at y = 0, 5-sided pentagon top nut, orthogonal side hose caps,
 * and an animated arcing turquoise water-jet stream along +Z.
 */
export function FireHydrantJetProp({
  position = [0, 0, 0],
  rotationY = 0,
  jetRangeMeters = 4.6,
  lastSurfAt = -10,
  showWireframe = false,
}: FireHydrantJetPropProps) {
  const streamGroupRef = useRef<THREE.Group>(null);
  const puddleRef = useRef<THREE.Mesh>(null);
  const burstGroupRef = useRef<THREE.Group>(null);

  const spec = useMemo(
    () =>
      buildCoaxialHydrantSpec({
        jetRangeMeters,
      }),
    [jetRangeMeters]
  );

  // Smooth Curve3 along spec.waterJet.arcPoints for shimmering droplet stream
  const arcCurve = useMemo(() => {
    const pts = spec.waterJet.arcPoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    return new THREE.CatmullRomCurve3(pts);
  }, [spec]);

  const puddleCenter = useMemo(() => {
    const end = spec.waterJet.arcPoints[spec.waterJet.arcPoints.length - 1];
    return [end[0], 0.015, end[2] * 0.78] as [number, number, number];
  }, [spec]);

  const burstSpecs = useMemo(() => {
    return Array.from({ length: BURST_DROP_COUNT }, (_, i) => {
      const ang = (i / BURST_DROP_COUNT) * Math.PI * 2;
      const spd = 1.4 + (i % 3) * 0.7;
      return {
        vx: Math.cos(ang) * spd,
        vy: 2.5 + (i % 4) * 0.55,
        vz: Math.sin(ang) * spd + 1.8,
      };
    });
  }, []);

  const scratchPos = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const now = performance.now() * 0.001;

    if (streamGroupRef.current) {
      const children = streamGroupRef.current.children;
      for (let i = 0; i < children.length; i++) {
        const bead = children[i];
        const u = (t * 1.55 + i / STREAM_BEAD_COUNT) % 1.0;
        arcCurve.getPoint(u, scratchPos);
        bead.position.set(
          scratchPos.x + Math.sin(t * 10 + i) * 0.035,
          scratchPos.y + Math.cos(t * 9 + i) * 0.025,
          scratchPos.z
        );
        const s = (0.075 + Math.sin(u * Math.PI) * 0.085) * (i % 2 === 0 ? 1.0 : 0.8);
        bead.scale.setScalar(s);
      }
    }

    if (puddleRef.current) {
      const ripple = 1 + Math.sin(t * 5.2) * 0.06;
      puddleRef.current.scale.set(ripple, ripple, 1);
    }

    const dtBurst = now - lastSurfAt;
    if (burstGroupRef.current) {
      const active = dtBurst >= 0 && dtBurst < 0.7;
      burstGroupRef.current.visible = active;
      if (active) {
        const children = burstGroupRef.current.children;
        for (let i = 0; i < children.length; i++) {
          const b = burstSpecs[i];
          const drop = children[i];
          drop.position.set(
            b.vx * dtBurst,
            b.vy * dtBurst - 6.0 * dtBurst * dtBurst,
            b.vz * dtBurst
          );
          drop.scale.setScalar(0.11 * (1 - dtBurst / 0.7));
        }
      }
    }
  });

  return (
    <group
      name="fire-hydrant-jet-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* Coaxial Base Flange Seated Exact at y = 0 */}
      <mesh
        castShadow
        receiveShadow
        position={spec.baseFlange.position}
        rotation={spec.baseFlange.rotation}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry
          args={[
            spec.baseFlange.radius * 0.92,
            spec.baseFlange.radius,
            spec.baseFlange.height,
            14,
          ]}
        />
      </mesh>

      {/* Coaxial Main Barrel */}
      <mesh
        castShadow
        receiveShadow
        position={spec.barrel.position}
        rotation={spec.barrel.rotation}
        material={TOYBOX_MATERIALS.hydrantCoral}
      >
        <cylinderGeometry
          args={[
            spec.barrel.radius * 0.96,
            spec.barrel.radius,
            spec.barrel.height,
            14,
          ]}
        />
      </mesh>

      {/* Coaxial Collar Ring */}
      <mesh
        castShadow
        position={spec.collarRing.position}
        rotation={spec.collarRing.rotation}
        material={TOYBOX_MATERIALS.hydrantBonnet}
      >
        <cylinderGeometry
          args={[
            spec.collarRing.radius,
            spec.collarRing.radius,
            spec.collarRing.height,
            14,
          ]}
        />
      </mesh>

      {/* Coaxial Domed Bonnet */}
      <mesh
        castShadow
        position={spec.bonnet.position}
        rotation={spec.bonnet.rotation}
        material={TOYBOX_MATERIALS.hydrantBonnet}
      >
        <cylinderGeometry
          args={[
            spec.bonnet.radius * 0.62,
            spec.bonnet.radius,
            spec.bonnet.height,
            14,
          ]}
        />
      </mesh>

      {/* Coaxial 5-Sided Pentagon Operating Nut */}
      <mesh
        castShadow
        position={spec.pentagonNut.position}
        rotation={spec.pentagonNut.rotation}
        material={TOYBOX_MATERIALS.brassAccent}
      >
        <cylinderGeometry
          args={[
            spec.pentagonNut.radius,
            spec.pentagonNut.radius * 1.1,
            spec.pentagonNut.height,
            spec.pentagonNut.sides,
          ]}
        />
      </mesh>

      {/* Orthogonal Side Hose Nozzles & Front (+Z) Pumper Nozzle */}
      {spec.sideHoseCaps.map((nozzle) => (
        <group key={nozzle.side}>
          <mesh
            castShadow
            position={nozzle.position}
            rotation={nozzle.rotation}
            material={TOYBOX_MATERIALS.brassAccent}
          >
            <cylinderGeometry args={[nozzle.radius, nozzle.radius, nozzle.length, 10]} />
          </mesh>
          {nozzle.side !== 'front_pumper' ? (
            <mesh
              castShadow
              position={nozzle.capPosition}
              rotation={nozzle.rotation}
              material={TOYBOX_MATERIALS.chromeSilver}
            >
              <cylinderGeometry
                args={[nozzle.capRadius, nozzle.capRadius, nozzle.capThickness, 6]}
              />
            </mesh>
          ) : (
            <mesh
              position={nozzle.capPosition}
              rotation={nozzle.rotation}
              material={TOYBOX_MATERIALS.cupHoleDark}
            >
              <cylinderGeometry
                args={[nozzle.radius * 0.8, nozzle.radius * 0.8, nozzle.capThickness, 10]}
              />
            </mesh>
          )}
        </group>
      ))}

      {/* Arcing Water-Jet Stream Along +Z */}
      <group ref={streamGroupRef}>
        {Array.from({ length: STREAM_BEAD_COUNT }, (_, idx) => (
          <mesh
            key={idx}
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

      {/* Shimmering Landing Spray Puddle */}
      <mesh
        ref={puddleRef}
        position={puddleCenter}
        rotation={[-Math.PI * 0.5, 0, 0]}
        material={TOYBOX_MATERIALS.turquoiseWater}
      >
        <circleGeometry args={[0.92, 20]} />
      </mesh>

      {/* Extra Droplet Splash on Surf */}
      <group
        ref={burstGroupRef}
        position={[0, 0.25, puddleCenter[2]]}
        visible={false}
      >
        {burstSpecs.map((_, idx) => (
          <mesh key={idx} material={TOYBOX_MATERIALS.waterBeadCyan}>
            <icosahedronGeometry args={[1, 0]} />
          </mesh>
        ))}
      </group>

      {/* QA Collider & Water-Jet Sensor Wireframe */}
      {showWireframe && (
        <group>
          <mesh
            position={[0, spec.totalHeight * 0.5, 0]}
            material={TOYBOX_MATERIALS.qaColliderWireframe}
          >
            <cylinderGeometry
              args={[spec.baseFlange.radius, spec.baseFlange.radius, spec.totalHeight, 12]}
            />
          </mesh>
          <mesh
            position={[0, 0.45, jetRangeMeters * 0.45]}
            material={TOYBOX_MATERIALS.qaSensorWireframe}
          >
            <boxGeometry args={[1.4, 0.9, jetRangeMeters * 0.85]} />
          </mesh>
        </group>
      )}
    </group>
  );
}
