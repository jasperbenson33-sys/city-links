'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TOYBOX_MATERIALS } from '@/materials';
import { useCurbsideStore } from '@/store/useCurbsideStore';
import { resolveAnimTime } from '../qaFreeze';
import {
  computeSteamCameraFade,
  PROP_ACCENT_MATERIALS,
  withPolygonOffset,
} from './propMaterials';

// Cached polygonOffset variants (never mutate shared materials).
const FRAME_MAT = withPolygonOffset(TOYBOX_MATERIALS.darkIron, 1);
const LOUVER_MAT = withPolygonOffset(TOYBOX_MATERIALS.stormDrainSteel, 2);
const STIFFENER_MAT = withPolygonOffset(TOYBOX_MATERIALS.darkIron, 2);
const BOLT_MAT = withPolygonOffset(TOYBOX_MATERIALS.brassAccent, 2);

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
const GLOW_MAT = withPolygonOffset(TOYBOX_MATERIALS.grateWarmUnder, 1);

/**
 * Subway Steam Vent Grate seated flush in a concrete utility collar at y = 0.
 * Features recessed warm subterranean glow, slatted steel louver bars, grounded
 * brass collar anchor bolts, and a rhythmic smooth low-poly steam column synced
 * deterministically to cycleSeconds.
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
  const puffWorldPos = useMemo(() => new THREE.Vector3(), []);

  // Clone TOYBOX_MATERIALS.steamColumnWhite per puff so Fresnel feathering + near-camera
  // shader discard stay active while each puff animates its own lifecycle opacity independently.
  const puffMaterials = useMemo(
    () =>
      Array.from({ length: STEAM_PUFF_COUNT }, () =>
        TOYBOX_MATERIALS.steamColumnWhite.clone()
      ),
    []
  );

  useEffect(() => {
    return () => {
      for (const m of puffMaterials) m.dispose();
    };
  }, [puffMaterials]);

  const barOffsets = useMemo(() => {
    const count = 9;
    const span = depth - 0.34;
    return Array.from({ length: count }, (_, i) => {
      const u = count > 1 ? i / (count - 1) - 0.5 : 0;
      return u * span;
    });
  }, [depth]);

  useFrame((state) => {
    // Stateless R3F clock (shared with GolfBall steam physics); frozen QA mode pins t = 4.0.
    // Every pose below is an absolute pure function of t (no delta accumulation).
    const t = resolveAnimTime(state.clock.elapsedTime);
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
      steamGroupRef.current.updateWorldMatrix(true, false);
      const groupWorldMatrix = steamGroupRef.current.matrixWorld;
      const children = steamGroupRef.current.children;
      for (let i = 0; i < children.length; i++) {
        const puff = children[i];
        const mat = puffMaterials[i];
        const sub = (t * 1.35 + i / STEAM_PUFF_COUNT) % 1.0;
        const colX = ((i % 3) - 1) * (width * 0.22) + Math.sin(t * 3.0 + i) * 0.09;
        const colZ =
          ((Math.floor(i / 3) % 3) - 1) * (depth * 0.22) + Math.cos(t * 2.6 + i) * 0.09;

        let s = 0;
        let baseAlpha = 0;
        if (puffActive) {
          // Keep passive cyclic column <= 2.2m high so elevated courtyard pans never clip puffs.
          const maxRise = forced ? 2.45 : 1.72;
          const height = sub * maxRise * (0.45 + 0.55 * puffEnv);
          puff.position.set(colX, 0.09 + height, colZ);
          s = Math.sin(sub * Math.PI) * (0.22 + 0.19 * puffEnv);
          baseAlpha = 0.34 * Math.sin(sub * Math.PI) * (0.55 + 0.45 * puffEnv);
          puff.rotation.set(t * 0.7 + i, t * 0.5, i * 0.4);
        } else if (i < 6) {
          puff.position.set(colX * 0.65, 0.05 + sub * 0.28, colZ * 0.65);
          s = Math.sin(sub * Math.PI) * 0.09;
          baseAlpha = 0.22 * Math.sin(sub * Math.PI);
          puff.rotation.set(t * 0.4 + i, t * 0.3, 0);
        } else {
          puff.visible = false;
          puff.scale.setScalar(0);
          if (mat) mat.opacity = 0;
          continue;
        }

        puffWorldPos.copy(puff.position).applyMatrix4(groupWorldMatrix);
        const camDist = state.camera.position.distanceTo(puffWorldPos);
        const camFade = computeSteamCameraFade(camDist, 1.65, 3.2);
        const finalOpacity = baseAlpha * camFade;

        if (camDist < 1.65 || s <= 0.008 || finalOpacity <= 0.004) {
          puff.visible = false;
          puff.scale.setScalar(0);
          if (mat) mat.opacity = 0;
        } else {
          puff.visible = true;
          puff.scale.setScalar(s);
          if (mat) mat.opacity = finalOpacity;
        }
      }
    }
  });

  const cornerBolts = useMemo<[number, number][]>(
    () => [
      [-(width * 0.5 - 0.075), -(depth * 0.5 - 0.075)],
      [width * 0.5 - 0.075, -(depth * 0.5 - 0.075)],
      [-(width * 0.5 - 0.075), depth * 0.5 - 0.075],
      [width * 0.5 - 0.075, depth * 0.5 - 0.075],
    ],
    [width, depth],
  );

  const innerW = width - 0.22;
  const innerD = depth - 0.22;
  const outerW = width - 0.08;
  const outerD = depth - 0.08;
  const ringT = (outerW - innerW) / 2;
  const ringH = 0.03;
  const ringY = 0.03;

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

      {/* Dark Cast-Iron Perimeter Frame (open ring so the glow below is visible) */}
      <mesh
        receiveShadow
        position={[0, ringY, -(outerD / 2 - ringT / 2)]}
        material={FRAME_MAT}
      >
        <boxGeometry args={[outerW, ringH, ringT]} />
      </mesh>
      <mesh
        receiveShadow
        position={[0, ringY, outerD / 2 - ringT / 2]}
        material={FRAME_MAT}
      >
        <boxGeometry args={[outerW, ringH, ringT]} />
      </mesh>
      <mesh
        receiveShadow
        position={[-(outerW / 2 - ringT / 2), ringY, 0]}
        material={FRAME_MAT}
      >
        <boxGeometry args={[ringT, ringH, outerD - 2 * ringT + 0.02]} />
      </mesh>
      <mesh
        receiveShadow
        position={[outerW / 2 - ringT / 2, ringY, 0]}
        material={FRAME_MAT}
      >
        <boxGeometry args={[ringT, ringH, outerD - 2 * ringT + 0.02]} />
      </mesh>

      {/* Recessed Warm Amber Subterranean Glow Under Grate Bars (tucks 1cm under the ring) */}
      <mesh position={[0, 0.027, 0]} material={GLOW_MAT}>
        <boxGeometry args={[innerW + 0.02, 0.018, innerD + 0.02]} />
      </mesh>

      {/* Slatted Steel Louver Bars Flush with Road Grade */}
      {barOffsets.map((bz, idx) => (
        <mesh
          key={`louver-${idx}`}
          receiveShadow
          position={[0, 0.042, bz]}
          material={LOUVER_MAT}
        >
          <boxGeometry args={[innerW + 0.02, 0.016, 0.058]} />
        </mesh>
      ))}

      {/* Twin Transverse Cross Stiffeners */}
      {[-width * 0.26, width * 0.26].map((cx, idx) => (
        <mesh
          key={`stiffener-${idx}`}
          position={[cx, 0.04, 0]}
          material={STIFFENER_MAT}
        >
          <boxGeometry args={[0.048, 0.014, innerD + 0.02]} />
        </mesh>
      ))}

      {/* Grounded Corner Brass Collar Anchor Bolts Seated Cleanly on Steel Frame */}
      {cornerBolts.map(([bx, bz], idx) => (
        <mesh
          key={`bolt-${idx}`}
          position={[bx, 0.048, bz]}
          material={BOLT_MAT}
        >
          <cylinderGeometry args={[0.024, 0.026, 0.014, 6]} />
        </mesh>
      ))}

      {/* Rhythmic Soft Fresnel-Falloff Steam Column (depthWrite: false avoids faceted z-clipping) */}
      <group ref={steamGroupRef}>
        {Array.from({ length: STEAM_PUFF_COUNT }, (_, idx) => (
          <mesh
            key={`steam-${idx}`}
            position={[0, 0.2, 0]}
            material={puffMaterials[idx]}
          >
            <icosahedronGeometry args={[1, 2]} />
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
