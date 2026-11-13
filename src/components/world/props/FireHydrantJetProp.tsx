'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildCoaxialHydrantSpec } from '@/lib/geometryHelpers';
import { TOYBOX_MATERIALS } from '@/materials';

export interface FireHydrantJetPropProps {
  position?: [number, number, number];
  rotationY?: number;
  /** Horizontal stream travel distance along local +Z (default 0.72m into corner storm grate). */
  jetRangeMeters?: number;
  /** Vertical drop from hydrant base datum (y = 0) to gutter/grate level (-0.17m for +0.15m curb -> -0.02m drain). */
  gutterDropY?: number;
  /** Optional offset in local X to aim stream cleanly into storm grate center. */
  streamOffsetX?: number;
  lastSurfAt?: number;
  showWireframe?: boolean;
}

const STREAM_BEAD_COUNT = 20;
const BURST_DROP_COUNT = 12;

/**
 * Coaxial Cast-Iron Fire Hydrant built directly from buildCoaxialHydrantSpec
 * with base flange seated flush at y = 0, 5-sided pentagon top nut, orthogonal side hose caps,
 * and an animated faceted water stream arcing from the pumper nozzle into the storm grate below.
 */
export function FireHydrantJetProp({
  position = [0, 0, 0],
  rotationY = 0,
  jetRangeMeters = 0.72,
  gutterDropY = -0.17,
  streamOffsetX = -0.05,
  lastSurfAt = -10,
  showWireframe = false,
}: FireHydrantJetPropProps) {
  const streamGroupRef = useRef<THREE.Group>(null);
  const puddleRef = useRef<THREE.Mesh>(null);
  const burstGroupRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);

  const spec = useMemo(
    () =>
      buildCoaxialHydrantSpec({
        jetRangeMeters,
      }),
    [jetRangeMeters]
  );

  // Compute parabolic water-jet arc from front pumper nozzle down into storm grate at y = gutterDropY
  const { arcCurve, arcTubeGeo, impactCenter } = useMemo(() => {
    const start = new THREE.Vector3(
      spec.waterJet.emitterOrigin[0],
      spec.waterJet.emitterOrigin[1],
      spec.waterJet.emitterOrigin[2]
    );
    const endX = streamOffsetX;
    const endY = gutterDropY + 0.015;
    const endZ = Math.max(0.45, jetRangeMeters);

    const pts = [
      start,
      new THREE.Vector3(
        THREE.MathUtils.lerp(start.x, endX, 0.25),
        start.y + 0.08,
        THREE.MathUtils.lerp(start.z, endZ, 0.28)
      ),
      new THREE.Vector3(
        THREE.MathUtils.lerp(start.x, endX, 0.56),
        start.y - 0.06,
        THREE.MathUtils.lerp(start.z, endZ, 0.58)
      ),
      new THREE.Vector3(
        THREE.MathUtils.lerp(start.x, endX, 0.82),
        THREE.MathUtils.lerp(start.y, endY, 0.68),
        THREE.MathUtils.lerp(start.z, endZ, 0.84)
      ),
      new THREE.Vector3(endX, endY, endZ),
    ];

    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 16, 0.032, 6, false);
    return {
      arcCurve: curve,
      arcTubeGeo: tube,
      impactCenter: [endX, gutterDropY + 0.012, endZ] as [number, number, number],
    };
  }, [spec, jetRangeMeters, gutterDropY, streamOffsetX]);

  const burstSpecs = useMemo(() => {
    return Array.from({ length: BURST_DROP_COUNT }, (_, i) => {
      const ang = (i / BURST_DROP_COUNT) * Math.PI * 2;
      const spd = 1.1 + (i % 3) * 0.5;
      return {
        vx: Math.cos(ang) * spd,
        vy: 2.1 + (i % 4) * 0.45,
        vz: Math.sin(ang) * spd,
      };
    });
  }, []);

  const scratchPos = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    elapsedRef.current += Math.min(delta, 0.05);
    const t = elapsedRef.current;
    const now =
      typeof performance !== 'undefined' ? performance.now() * 0.001 : t;

    if (streamGroupRef.current) {
      const children = streamGroupRef.current.children;
      for (let i = 0; i < children.length; i++) {
        const bead = children[i];
        const u = (t * 1.85 + i / STREAM_BEAD_COUNT) % 1.0;
        arcCurve.getPoint(u, scratchPos);
        bead.position.set(
          scratchPos.x + Math.sin(t * 11 + i) * 0.018,
          scratchPos.y + Math.cos(t * 10 + i) * 0.015,
          scratchPos.z
        );
        const s = (0.042 + Math.sin(u * Math.PI) * 0.032) * (i % 2 === 0 ? 1.0 : 0.78);
        bead.scale.setScalar(s);
        bead.rotation.set(t * 3 + i, t * 2.2, i);
      }
    }

    if (puddleRef.current) {
      const ripple = 1 + Math.sin(t * 6.0) * 0.08;
      puddleRef.current.scale.set(ripple, ripple, 1);
    }

    const dtBurst = now - lastSurfAt;
    if (burstGroupRef.current) {
      const active = dtBurst >= 0 && dtBurst < 0.85;
      burstGroupRef.current.visible = active;
      if (active) {
        const children = burstGroupRef.current.children;
        for (let i = 0; i < children.length; i++) {
          const drop = children[i];
          const b = burstSpecs[i];
          drop.position.set(
            impactCenter[0] + b.vx * dtBurst,
            impactCenter[1] + 0.08 + b.vy * dtBurst - 4.9 * dtBurst * dtBurst,
            impactCenter[2] + b.vz * dtBurst
          );
          drop.scale.setScalar(Math.max(0.015, 0.065 * (1 - dtBurst / 0.85)));
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
      {/* Coaxial Cast-Iron Base Flange Flush at y = 0 */}
      <mesh
        castShadow
        receiveShadow
        position={spec.baseFlange.position}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry
          args={[
            spec.baseFlange.radius,
            spec.baseFlange.radius * 1.08,
            spec.baseFlange.height,
            12,
          ]}
        />
      </mesh>

      {/* Coaxial Hydrant Barrel */}
      <mesh
        castShadow
        receiveShadow
        position={spec.barrel.position}
        material={TOYBOX_MATERIALS.hydrantCoral}
      >
        <cylinderGeometry
          args={[
            spec.barrel.radius,
            spec.barrel.radius * 1.05,
            spec.barrel.height,
            12,
          ]}
        />
      </mesh>

      {/* Coaxial Shoulder Collar Ring */}
      <mesh
        castShadow
        position={spec.collarRing.position}
        material={TOYBOX_MATERIALS.hydrantBonnet}
      >
        <cylinderGeometry
          args={[
            spec.collarRing.radius,
            spec.collarRing.radius,
            spec.collarRing.height,
            12,
          ]}
        />
      </mesh>

      {/* Coaxial Domed Bonnet Cap */}
      <mesh
        castShadow
        position={spec.bonnet.position}
        material={TOYBOX_MATERIALS.hydrantBonnet}
      >
        <sphereGeometry args={[spec.bonnet.radius, 12, 8]} />
      </mesh>

      {/* 5-Sided Coaxial Pentagon Top Operating Nut */}
      <mesh
        castShadow
        position={spec.pentagonNut.position}
        rotation={spec.pentagonNut.rotation}
        material={TOYBOX_MATERIALS.brassAccent}
      >
        <cylinderGeometry
          args={[
            spec.pentagonNut.radius,
            spec.pentagonNut.radius,
            spec.pentagonNut.height,
            spec.pentagonNut.sides,
          ]}
        />
      </mesh>

      {/* Front Pumper Nozzle (+Z Stream Emitter) + Orthogonal Side Hose Caps */}
      <group position={spec.waterJet.emitterOrigin}>
        <mesh
          castShadow
          rotation={[Math.PI * 0.5, 0, 0]}
          material={TOYBOX_MATERIALS.hydrantBonnet}
        >
          <cylinderGeometry args={[0.068, 0.075, 0.1, 10]} />
        </mesh>
        <mesh
          position={[0, 0, 0.045]}
          rotation={[Math.PI * 0.5, 0, 0]}
          material={TOYBOX_MATERIALS.brassAccent}
        >
          <cylinderGeometry args={[0.056, 0.056, 0.03, 10]} />
        </mesh>
      </group>

      {spec.sideHoseCaps.map((cap, idx) => (
        <group key={`hose-cap-${idx}`}>
          <mesh
            castShadow
            position={cap.position}
            rotation={cap.rotation}
            material={TOYBOX_MATERIALS.hydrantBonnet}
          >
            <cylinderGeometry args={[cap.radius, cap.radius, cap.length, 10]} />
          </mesh>
          <mesh
            castShadow
            position={cap.capPosition}
            rotation={cap.rotation}
            material={TOYBOX_MATERIALS.brassAccent}
          >
            <cylinderGeometry
              args={[cap.capRadius, cap.capRadius, cap.capThickness, 6]}
            />
          </mesh>
        </group>
      ))}

      {/* Inner Shimmering Core Arc Stream into Storm Drain */}
      <mesh geometry={arcTubeGeo} material={TOYBOX_MATERIALS.turquoiseWater} />

      {/* Animated Sparkling Faceted Water Beads Along the Arc */}
      <group ref={streamGroupRef}>
        {Array.from({ length: STREAM_BEAD_COUNT }, (_, idx) => (
          <mesh
            key={`bead-${idx}`}
            material={
              idx % 3 === 0
                ? TOYBOX_MATERIALS.waterFoamWhite
                : TOYBOX_MATERIALS.waterBeadCyan
            }
          >
            <icosahedronGeometry args={[1, 0]} />
          </mesh>
        ))}
      </group>

      {/* Animated Foam Splash Ring Over Storm Grate */}
      <group position={impactCenter}>
        <mesh
          ref={puddleRef}
          rotation={[-Math.PI * 0.5, 0, 0]}
          material={TOYBOX_MATERIALS.waterFoamWhite}
        >
          <ringGeometry args={[0.06, 0.24, 14]} />
        </mesh>
        <mesh
          position={[0, -0.004, 0]}
          rotation={[-Math.PI * 0.5, 0, 0]}
          material={TOYBOX_MATERIALS.turquoiseWater}
        >
          <circleGeometry args={[0.28, 14]} />
        </mesh>
      </group>

      {/* Hydrant-Jet Boost Burst Droplets on Ball Hit */}
      <group ref={burstGroupRef} visible={false}>
        {burstSpecs.map((_, idx) => (
          <mesh
            key={`burst-${idx}`}
            material={
              idx % 2 === 0
                ? TOYBOX_MATERIALS.waterBeadCyan
                : TOYBOX_MATERIALS.waterFoamWhite
            }
          >
            <icosahedronGeometry args={[1, 0]} />
          </mesh>
        ))}
      </group>

      {/* QA Wireframe Envelope */}
      {showWireframe && (
        <mesh
          position={[0, 0.46, 0]}
          material={TOYBOX_MATERIALS.qaBoundsWireframe}
        >
          <boxGeometry args={[0.46, 0.92, 0.46]} />
        </mesh>
      )}
    </group>
  );
}
