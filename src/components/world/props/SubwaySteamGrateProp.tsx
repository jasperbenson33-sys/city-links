'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CONFETTI_TOYBOX_MATERIALS, TOYBOX_MATERIALS } from '@/materials';

export interface SubwaySteamGratePropProps {
  position?: [number, number, number];
  rotationY?: number;
  width?: number;
  depth?: number;
  cycleSeconds?: number;
  gustActiveSeconds?: number;
  /** Optional external gust intensity override (0..1) for QA inspection. */
  forceGust?: boolean;
  showWireframe?: boolean;
}

const STEAM_PUFF_COUNT = 16;
const RIBBON_ANCHORS: Array<[number, number]> = [
  [-0.78, -0.78],
  [0.78, -0.58],
  [-0.68, 0.56],
  [0.76, 0.76],
];

/**
 * Subway Steam Vent Grate seated flush at y = 0 with subterranean amber glow,
 * slatted steel bars, fluttering ribbon indicators, and rhythmic upward steam column.
 */
export function SubwaySteamGrateProp({
  position = [0, 0, 0],
  rotationY = 0,
  width = 1.75,
  depth = 1.75,
  cycleSeconds = 3.2,
  gustActiveSeconds = 1.5,
  forceGust = false,
  showWireframe = false,
}: SubwaySteamGratePropProps) {
  const steamGroupRef = useRef<THREE.Group>(null);
  const ribbonsGroupRef = useRef<THREE.Group>(null);

  const barOffsets = useMemo(() => {
    const count = 9;
    const span = depth - 0.36;
    return Array.from({ length: count }, (_, i) => {
      const u = count > 1 ? i / (count - 1) - 0.5 : 0;
      return u * span;
    });
  }, [depth]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const phase = t % cycleSeconds;
    const puffActive = forceGust || phase < gustActiveSeconds;
    const puffEnv = forceGust
      ? 0.9
      : puffActive
        ? Math.sin((phase / gustActiveSeconds) * Math.PI)
        : 0;

    if (steamGroupRef.current) {
      const children = steamGroupRef.current.children;
      for (let i = 0; i < children.length; i++) {
        const puff = children[i];
        const sub = (t * 1.4 + i / STEAM_PUFF_COUNT) % 1.0;
        const colX = ((i % 3) - 1) * (width * 0.24) + Math.sin(t * 3.1 + i) * 0.1;
        const colZ =
          ((Math.floor(i / 3) % 3) - 1) * (depth * 0.24) + Math.cos(t * 2.7 + i) * 0.1;

        if (puffActive) {
          const height = sub * 2.9 * (0.5 + 0.5 * puffEnv);
          puff.position.set(colX, 0.1 + height, colZ);
          const s = Math.sin(sub * Math.PI) * (0.26 + 0.22 * puffEnv);
          puff.scale.setScalar(Math.max(0.015, s));
          puff.visible = true;
        } else {
          puff.position.set(colX * 0.65, 0.06 + sub * 0.32, colZ * 0.65);
          puff.scale.setScalar(Math.max(0.01, Math.sin(sub * Math.PI) * 0.08));
          puff.visible = i < 5;
        }
      }
    }

    if (ribbonsGroupRef.current) {
      const children = ribbonsGroupRef.current.children;
      for (let i = 0; i < children.length; i++) {
        const rib = children[i];
        if (puffActive) {
          rib.rotation.z = Math.sin(t * 30.0 + i * 1.6) * 0.26;
          rib.rotation.x = Math.cos(t * 25.0 + i * 2.0) * 0.22;
          rib.scale.y = 1.0 + puffEnv * 0.22;
        } else {
          rib.rotation.z = 1.22 + Math.sin(t * 3.4 + i) * 0.1;
          rib.rotation.x = Math.cos(t * 2.6 + i) * 0.07;
          rib.scale.y = 0.85;
        }
      }
    }
  });

  const frameThick = 0.14;
  const frameH = 0.032;

  return (
    <group
      name="subway-steam-grate-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* Recessed subterranean warm amber shaft glow (just beneath grate bars, y = 0.002) */}
      <mesh position={[0, 0.003, 0]} material={TOYBOX_MATERIALS.grateWarmUnder}>
        <boxGeometry args={[width - frameThick * 1.5, 0.006, depth - frameThick * 1.5]} />
      </mesh>

      {/* Flush Steel Outer Frame resting on y = 0 */}
      <mesh
        receiveShadow
        position={[0, frameH * 0.5, -depth * 0.5 + frameThick * 0.5]}
        material={TOYBOX_MATERIALS.stormDrainSteel}
      >
        <boxGeometry args={[width, frameH, frameThick]} />
      </mesh>
      <mesh
        receiveShadow
        position={[0, frameH * 0.5, depth * 0.5 - frameThick * 0.5]}
        material={TOYBOX_MATERIALS.stormDrainSteel}
      >
        <boxGeometry args={[width, frameH, frameThick]} />
      </mesh>
      <mesh
        receiveShadow
        position={[-width * 0.5 + frameThick * 0.5, frameH * 0.5, 0]}
        material={TOYBOX_MATERIALS.stormDrainSteel}
      >
        <boxGeometry args={[frameThick, frameH, depth - frameThick * 2]} />
      </mesh>
      <mesh
        receiveShadow
        position={[width * 0.5 - frameThick * 0.5, frameH * 0.5, 0]}
        material={TOYBOX_MATERIALS.stormDrainSteel}
      >
        <boxGeometry args={[frameThick, frameH, depth - frameThick * 2]} />
      </mesh>

      {/* Slatted Iron Grate Bars */}
      {barOffsets.map((zOff, idx) => (
        <mesh
          key={idx}
          receiveShadow
          position={[0, 0.015, zOff]}
          material={TOYBOX_MATERIALS.darkIron}
        >
          <boxGeometry args={[width - frameThick * 1.6, 0.024, 0.075]} />
        </mesh>
      ))}
      {/* Cross tie bars */}
      {[-width * 0.25, width * 0.25].map((xOff, idx) => (
        <mesh
          key={`tie-${idx}`}
          receiveShadow
          position={[xOff, 0.012, 0]}
          material={TOYBOX_MATERIALS.darkIron}
        >
          <boxGeometry args={[0.06, 0.018, depth - frameThick * 1.6]} />
        </mesh>
      ))}

      {/* Fluttering Indicator Ribbons */}
      <group ref={ribbonsGroupRef}>
        {RIBBON_ANCHORS.map(([rx, rz], idx) => (
          <group
            key={idx}
            position={[rx * (width / 2.2), 0.028, rz * (depth / 2.2)]}
          >
            <mesh
              position={[0, 0.2, 0]}
              material={CONFETTI_TOYBOX_MATERIALS[idx % CONFETTI_TOYBOX_MATERIALS.length]}
            >
              <boxGeometry args={[0.055, 0.4, 0.014]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Upward Steam Column */}
      <group ref={steamGroupRef}>
        {Array.from({ length: STEAM_PUFF_COUNT }, (_, idx) => (
          <mesh key={idx} material={TOYBOX_MATERIALS.steamColumnWhite}>
            <icosahedronGeometry args={[1, 1]} />
          </mesh>
        ))}
      </group>

      {/* QA Sensor Wireframe */}
      {showWireframe && (
        <mesh
          position={[0, 0.85, 0]}
          material={TOYBOX_MATERIALS.qaSensorWireframe}
        >
          <boxGeometry args={[width * 1.05, 1.7, depth * 1.05]} />
        </mesh>
      )}
    </group>
  );
}
