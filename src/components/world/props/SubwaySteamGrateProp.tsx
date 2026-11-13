'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFETTI_TOYBOX_MATERIALS, TOYBOX_MATERIALS } from '@/materials';
import { useCurbsideStore } from '@/store/useCurbsideStore';
import { PROP_ACCENT_MATERIALS } from './propMaterials';

export interface SubwaySteamGratePropProps {
  position?: [number, number, number];
  rotationY?: number;
  width?: number;
  depth?: number;
  cycleSeconds?: number;
  gustActiveSeconds?: number;
  /** Optional external gust intensity override (true/false) for QA inspection. */
  forceGust?: boolean;
  showWireframe?: boolean;
}

const STEAM_PUFF_COUNT = 20;
const HORIZONTAL_ACCENTS: Array<{
  pos: [number, number];
  yaw: number;
  size: [number, number];
}> = [
  { pos: [-0.74, -0.74], yaw: 0.42, size: [0.09, 0.05] },
  { pos: [0.74, -0.62], yaw: -0.58, size: [0.08, 0.045] },
  { pos: [-0.66, 0.64], yaw: 0.88, size: [0.085, 0.045] },
  { pos: [0.72, 0.74], yaw: -0.35, size: [0.09, 0.05] },
];

/**
 * Subway Steam Vent Grate seated flush in a concrete utility collar at y = 0.
 * Features recessed warm subterranean glow, slatted steel louver bars, flat horizontal
 * street ticket/leaf accents resting flush on the concrete apron, and a rhythmic
 * animated low-poly steam column synced deterministically to cycleSeconds.
 */
export function SubwaySteamGrateProp({
  position = [0, 0, 0],
  rotationY = 0,
  width = 1.75,
  depth = 1.75,
  cycleSeconds = 3.2,
  gustActiveSeconds = 1.6,
  forceGust = false,
  showWireframe = false,
}: SubwaySteamGratePropProps) {
  const steamGroupRef = useRef<THREE.Group>(null);
  const accentsGroupRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);

  const barOffsets = useMemo(() => {
    const count = 9;
    const span = depth - 0.34;
    return Array.from({ length: count }, (_, i) => {
      const u = count > 1 ? i / (count - 1) - 0.5 : 0;
      return u * span;
    });
  }, [depth]);

  useFrame((_, delta) => {
    elapsedRef.current += Math.min(delta, 0.05);
    const t = elapsedRef.current;
    const storeForce = useCurbsideStore.getState().forceSteamActive;
    const forced = forceGust || storeForce === true;
    const disabledByStore = !forceGust && storeForce === false;

    const phase = t % cycleSeconds;
    const puffActive =
      !disabledByStore && (forced || phase < gustActiveSeconds);
    const puffEnv = forced
      ? 0.92
      : puffActive
        ? Math.sin((phase / gustActiveSeconds) * Math.PI)
        : 0;

    if (steamGroupRef.current) {
      const children = steamGroupRef.current.children;
      for (let i = 0; i < children.length; i++) {
        const puff = children[i];
        const sub = (t * 1.35 + i / STEAM_PUFF_COUNT) % 1.0;
        const colX = ((i % 3) - 1) * (width * 0.22) + Math.sin(t * 3.0 + i) * 0.09;
        const colZ =
          ((Math.floor(i / 3) % 3) - 1) * (depth * 0.22) + Math.cos(t * 2.6 + i) * 0.09;

        if (puffActive) {
          const height = sub * 3.05 * (0.45 + 0.55 * puffEnv);
          puff.position.set(colX, 0.09 + height, colZ);
          const s = Math.sin(sub * Math.PI) * (0.24 + 0.24 * puffEnv);
          puff.scale.setScalar(Math.max(0.015, s));
          puff.rotation.set(t * 0.7 + i, t * 0.5, i * 0.4);
          puff.visible = true;
        } else {
          puff.position.set(colX * 0.65, 0.05 + sub * 0.28, colZ * 0.65);
          puff.scale.setScalar(Math.max(0.01, Math.sin(sub * Math.PI) * 0.075));
          puff.rotation.set(t * 0.4 + i, t * 0.3, 0);
          puff.visible = i < 6;
        }
      }
    }

    // Keep colored ticket/leaf accents strictly flat horizontal on the apron with tiny planar flutter
    if (accentsGroupRef.current) {
      const children = accentsGroupRef.current.children;
      for (let i = 0; i < children.length; i++) {
        const item = children[i];
        const base = HORIZONTAL_ACCENTS[i];
        if (!base) continue;
        item.rotation.x = -Math.PI * 0.5;
        item.rotation.z =
          base.yaw + (puffActive ? Math.sin(t * 18.0 + i * 1.7) * 0.14 : 0);
        item.position.y =
          0.023 + (puffActive ? Math.abs(Math.sin(t * 14.0 + i)) * 0.004 : 0);
      }
    }
  });

  const innerW = width - 0.22;
  const innerD = depth - 0.22;

  return (
    <group
      name="subway-steam-grate-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* Concrete Utility Collar Slab Seated Flush at y = 0 */}
      <mesh
        receiveShadow
        position={[0, 0.01, 0]}
        material={PROP_ACCENT_MATERIALS.concreteCollar}
      >
        <boxGeometry args={[width, 0.02, depth]} />
      </mesh>

      {/* Dark Cast-Iron Perimeter Frame */}
      <mesh
        receiveShadow
        position={[0, 0.018, 0]}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <boxGeometry args={[width - 0.08, 0.022, depth - 0.08]} />
      </mesh>

      {/* Recessed Warm Amber Subterranean Glow Under Grate Bars */}
      <mesh
        position={[0, 0.015, 0]}
        material={TOYBOX_MATERIALS.grateWarmUnder}
      >
        <boxGeometry args={[innerW, 0.014, innerD]} />
      </mesh>

      {/* Slatted Steel Louver Bars Flush with Road Grade */}
      {barOffsets.map((bz, idx) => (
        <mesh
          key={`louver-${idx}`}
          castShadow
          receiveShadow
          position={[0, 0.032, bz]}
          material={TOYBOX_MATERIALS.stormDrainSteel}
        >
          <boxGeometry args={[innerW - 0.02, 0.016, 0.058]} />
        </mesh>
      ))}

      {/* Twin Transverse Cross Stiffeners */}
      {[-width * 0.26, width * 0.26].map((cx, idx) => (
        <mesh
          key={`stiffener-${idx}`}
          position={[cx, 0.03, 0]}
          material={TOYBOX_MATERIALS.darkIron}
        >
          <boxGeometry args={[0.048, 0.014, innerD]} />
        </mesh>
      ))}

      {/* Corner Utility Anchor Bolts */}
      {HORIZONTAL_ACCENTS.map(({ pos: [rx, rz] }, idx) => (
        <mesh
          key={`bolt-${idx}`}
          position={[rx * 1.08, 0.032, rz * 1.08]}
          material={TOYBOX_MATERIALS.brassAccent}
        >
          <cylinderGeometry args={[0.024, 0.024, 0.014, 6]} />
        </mesh>
      ))}

      {/* Flat Horizontal Ticket / Leaf Accents Flush on Concrete Apron */}
      <group ref={accentsGroupRef}>
        {HORIZONTAL_ACCENTS.map(({ pos: [rx, rz], yaw, size }, idx) => (
          <mesh
            key={`flat-accent-${idx}`}
            position={[rx, 0.023, rz]}
            rotation={[-Math.PI * 0.5, 0, yaw]}
            material={
              CONFETTI_TOYBOX_MATERIALS[idx % CONFETTI_TOYBOX_MATERIALS.length]
            }
          >
            <planeGeometry args={[size[0], size[1]]} />
          </mesh>
        ))}
      </group>

      {/* Rhythmic Low-Poly Billowing Steam Column */}
      <group ref={steamGroupRef}>
        {Array.from({ length: STEAM_PUFF_COUNT }, (_, idx) => (
          <mesh
            key={`steam-${idx}`}
            position={[0, 0.2, 0]}
            material={TOYBOX_MATERIALS.steamColumnWhite}
          >
            <icosahedronGeometry args={[1, 0]} />
          </mesh>
        ))}
      </group>

      {showWireframe && (
        <group>
          <mesh
            position={[0, 0.02, 0]}
            material={TOYBOX_MATERIALS.qaBoundsWireframe}
          >
            <boxGeometry args={[width, 0.04, depth]} />
          </mesh>
          <mesh
            position={[0, 1.5, 0]}
            material={TOYBOX_MATERIALS.qaSensorWireframe}
          >
            <boxGeometry args={[width * 0.88, 3.0, depth * 0.88]} />
          </mesh>
        </group>
      )}
    </group>
  );
}
