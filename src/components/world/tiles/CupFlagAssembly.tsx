'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CONFETTI_TOYBOX_MATERIALS,
  FLAG_COLOR_MATERIALS,
  TOYBOX_MATERIALS,
  type ToyboxFlagColor,
} from '@/materials';
import { isQaFreezeActive, resolveAnimTime } from '../qaFreeze';

export interface CupFlagAssemblyProps {
  /** World [x, y, z] position where y is the putting green surface top. */
  position?: [number, number, number];
  /** Color-coded flag identity ('red' | 'yellow' | 'blue' | 'purple' | 'green'). */
  color: ToyboxFlagColor;
  /** Whether this flag has already been sunk in the current hole. */
  isSunk?: boolean;
  /** Regulation cup visual radius (meters, 0.42m in Curbside Links). */
  cupRadius?: number;
  /** Recessed cup depth (meters, 0.42m in Curbside Links so holed ball sits cleanly below rim). */
  cupDepth?: number;
  /** Flagpole height in meters (2.35m street-level pin). */
  poleHeight?: number;
  /** Render ornate 24k golden pin, finial crown & warm gold beacon (Stage 2 Zone 7 finale). */
  isGoldenPin?: boolean;
}

const CONFETTI_COUNT = 22;

const CUP_INNER_SLEEVE_MAT = new THREE.MeshStandardMaterial({
  color: '#F8FAFC',
  roughness: 0.45,
  metalness: 0.05,
  side: THREE.DoubleSide,
});

// ---------------------------------------------------------------------------
// Anti-shimmer: local memoized decal/softened variants (shared '@/materials' never mutated).
// Layer stack above the green (y offsets in cup-local space, >= 1.6cm physical step):
//   0.016 white lip flange (tier -1/-1) -> 0.032 beacon halo / sunk ring (tier -2/-2)
// ---------------------------------------------------------------------------
const LIP_Y = 0.016;
const HALO_Y = 0.032;
const SUNK_RING_Y = 0.032;

const layerCache = new WeakMap<THREE.Material, Map<number, THREE.Material>>();
function layered<T extends THREE.Material>(base: T, tier: 1 | 2): T {
  let per = layerCache.get(base);
  if (!per) {
    per = new Map();
    layerCache.set(base, per);
  }
  let v = per.get(tier);
  if (!v) {
    v = base.clone();
    v.polygonOffset = true;
    v.polygonOffsetFactor = -tier;
    v.polygonOffsetUnits = -tier;
    per.set(tier, v);
  }
  return v as T;
}

const LIP_MAT = (() => {
  const m = layered(TOYBOX_MATERIALS.cupRimWhite, 1);
  m.color.set('#FBF3E4'); // warm cream instead of razor pure white
  return m;
})();
const SUNK_RING_MAT = layered(TOYBOX_MATERIALS.cupSunkCheck, 2);
const POLE_MAT = (() => {
  const m = TOYBOX_MATERIALS.flagPoleWhite.clone();
  m.color.set('#F7EDDA'); // warm ivory, softer contrast against sky while orbiting
  m.metalness = 0.06;
  return m;
})();
const GOLDEN_POLE_MAT = new THREE.MeshStandardMaterial({
  color: '#F6C945',
  roughness: 0.28,
  metalness: 0.62,
  emissive: '#B45309',
  emissiveIntensity: 0.22,
});
const GOLDEN_BANNER_MAT = new THREE.MeshStandardMaterial({
  color: '#FDE047',
  roughness: 0.3,
  metalness: 0.48,
  emissive: '#D97706',
  emissiveIntensity: 0.38,
  side: THREE.DoubleSide,
});
const GOLDEN_HALO_MAT = layered(
  new THREE.MeshBasicMaterial({
    color: '#FDE047',
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
  2,
);
const HALO_MATS = new Map<ToyboxFlagColor, THREE.MeshBasicMaterial>();
function haloMaterialFor(color: ToyboxFlagColor): THREE.MeshBasicMaterial {
  let m = HALO_MATS.get(color);
  if (!m) {
    m = layered(FLAG_COLOR_MATERIALS[color].halo, 2);
    HALO_MATS.set(color, m);
  }
  return m;
}

/** Frame-rate independent damping factor equivalent to the legacy 0.16/frame @ 60fps lerp. */
const FLAG_LERP_RATE = -Math.log(1 - 0.16) * 60;

/**
 * Recessed regulation cup liner + crisp white lip + sunlit flutter flag assembly.
 * Sized cleanly for street-level putting greens (Hole 1: 5th & Mercer) with
 * double-sided inner cup sleeve, halo beacon collar, and celebratory confetti burst.
 */
export const CupFlagAssembly = React.memo(function CupFlagAssembly({
  position = [0, 0, 0],
  color,
  isSunk = false,
  cupRadius = 0.42,
  cupDepth = 0.42,
  poleHeight = 2.35,
  isGoldenPin = false,
}: CupFlagAssemblyProps) {
  const pennantGroupRef = useRef<THREE.Group>(null);
  const activeBannerRef = useRef<THREE.Mesh>(null);
  const sunkBannerRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const sunkRingRef = useRef<THREE.Mesh>(null);
  const sunkStarRef = useRef<THREE.Mesh>(null);
  const confettiRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);
  const celebrateStartRef = useRef<number | null>(null);
  const prevSunkRef = useRef(isSunk);

  const palette = FLAG_COLOR_MATERIALS[color];

  // Crisp swallowtail pennant proportional to pin height (clear down 5th & Mercer yet human-scale)
  const pennantGeo = useMemo(() => {
    const scale = THREE.MathUtils.clamp(poleHeight / 2.4, 0.72, 1.45);
    const h = 0.28 * scale;
    const len = 0.92 * scale;
    const notch = 0.75 * scale;

    const shape = new THREE.Shape();
    shape.moveTo(0, h);
    shape.lineTo(len, h * 0.62);
    shape.lineTo(notch, 0.0);
    shape.lineTo(len, -h * 0.62);
    shape.lineTo(0, -h);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.04, // >= 3.5cm cloth thickness so edges don't alias
      bevelEnabled: false,
    });
    geo.translate(0, 0, -0.02);
    return geo;
  }, [poleHeight]);

  useEffect(() => {
    return () => {
      pennantGeo.dispose();
    };
  }, [pennantGeo]);

  const confettiSpecs = useMemo(() => {
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => {
      const ang = (i / CONFETTI_COUNT) * Math.PI * 2 * 1.618;
      const spd = 0.8 + (i % 4) * 0.55;
      return {
        vx: Math.cos(ang) * spd,
        vy: 3.1 + (i % 5) * 0.55,
        vz: Math.sin(ang) * spd,
        rotSpeed: 5 + (i % 5) * 2,
      };
    });
  }, []);

  useFrame((_, delta) => {
    const frozen = isQaFreezeActive();
    if (!frozen) elapsedRef.current += Math.min(delta, 0.05);
    const t = resolveAnimTime(elapsedRef.current);

    if (isSunk && !prevSunkRef.current) {
      celebrateStartRef.current = frozen ? null : t;
    } else if (!isSunk && prevSunkRef.current) {
      celebrateStartRef.current = null;
    }
    prevSunkRef.current = isSunk;

    if (pennantGroupRef.current) {
      const targetY = isSunk ? poleHeight * 0.48 : poleHeight - 0.34;
      if (frozen) {
        // Pixel-identical frames: snap to the resting height (no position delta increments).
        pennantGroupRef.current.position.y = targetY;
      } else {
        const k = 1 - Math.exp(-FLAG_LERP_RATE * Math.min(delta, 0.05));
        pennantGroupRef.current.position.y = THREE.MathUtils.lerp(
          pennantGroupRef.current.position.y,
          targetY,
          k,
        );
      }
      // Cant pennant ~33 deg off the West->East courtyard putting sightline so it reads crisply
      // instead of an edge-on sliver from both approach and courtyard_green_out angles.
      const baseFlagYaw = -0.58;
      pennantGroupRef.current.rotation.y = isSunk
        ? baseFlagYaw + 0.12 + Math.sin(t * 1.6) * 0.05
        : baseFlagYaw + Math.sin(t * 3.6 + position[0]) * 0.18;
    }

    if (activeBannerRef.current) {
      activeBannerRef.current.scale.setScalar(isSunk ? 0 : 1);
    }
    if (sunkBannerRef.current) {
      sunkBannerRef.current.scale.setScalar(isSunk ? 1 : 0);
    }

    if (haloRef.current) {
      if (isSunk) {
        haloRef.current.scale.setScalar(0);
      } else {
        const pulse = 1 + Math.sin(t * 3.2) * 0.06;
        haloRef.current.scale.set(pulse, pulse, 1);
      }
    }

    if (sunkRingRef.current) {
      sunkRingRef.current.scale.setScalar(isSunk ? 1 : 0);
    }

    if (sunkStarRef.current) {
      if (isSunk) {
        sunkStarRef.current.scale.setScalar(1);
        sunkStarRef.current.rotation.y = t * 1.8;
        sunkStarRef.current.position.y =
          poleHeight + 0.24 + Math.sin(t * 2.5) * 0.05;
      } else {
        sunkStarRef.current.scale.setScalar(0);
      }
    }

    if (confettiRef.current) {
      const start = celebrateStartRef.current;
      const dt = start !== null ? t - start : -1;
      const active = !frozen && dt >= 0 && dt < 1.35;
      const children = confettiRef.current.children;
      if (active) {
        for (let i = 0; i < children.length; i++) {
          const spec = confettiSpecs[i];
          const chip = children[i];
          if (!spec || !chip) continue;
          chip.position.set(
            spec.vx * dt,
            0.15 + spec.vy * dt - 4.4 * dt * dt,
            spec.vz * dt,
          );
          chip.rotation.x = dt * spec.rotSpeed;
          chip.rotation.y = dt * (spec.rotSpeed * 0.8);
          chip.scale.setScalar(Math.max(0.01, (1 - dt / 1.35) * 0.14));
        }
      } else {
        for (let i = 0; i < children.length; i++) {
          const chip = children[i];
          if (chip && chip.scale.x !== 0) {
            chip.scale.setScalar(0);
          }
        }
      }
    }
  });

  const sleeveHeight = cupDepth + LIP_Y;

  return (
    <group name={`cup-flag-${color}`} position={position}>
      {/* Recessed Regulation Cup Inner White Liner Wall (extends cleanly up to Lip Flange) */}
      <mesh
        position={[0, (LIP_Y - cupDepth) * 0.5, 0]}
        material={CUP_INNER_SLEEVE_MAT}
        receiveShadow
      >
        <cylinderGeometry args={[cupRadius, cupRadius, sleeveHeight, 28, 1, true]} />
      </mesh>

      {/* Dark Cup Bottom Basin */}
      <mesh
        position={[0, -cupDepth + 0.006, 0]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        material={TOYBOX_MATERIALS.cupHoleDark}
      >
        <circleGeometry args={[cupRadius * 0.99, 28]} />
      </mesh>

      {/* Recessed Interior Ferrule Base Ring around Pin (top below y = -0.38m holed-ball bottom) */}
      <mesh
        position={[0, -cupDepth + 0.022, 0]}
        material={TOYBOX_MATERIALS.brassAccent}
      >
        <cylinderGeometry args={[0.034, 0.048, 0.028, 12]} />
      </mesh>

      {/* Flush Crisp White Lip Flange around Turf Opening (covers r+0.018 cutout cleanly) */}
      <mesh
        position={[0, LIP_Y, 0]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        material={LIP_MAT}
        castShadow={false}
      >
        <ringGeometry args={[cupRadius - 0.006, cupRadius + 0.062, 32]} />
      </mesh>

      {/* Gentle Pulsing Beacon Ring around Cup (overlaps lip flange on distinct y/polygonOffset tier) */}
      <mesh
        ref={haloRef}
        visible={true}
        scale={isSunk ? 0 : 1}
        position={[0, HALO_Y, 0]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        material={isGoldenPin ? GOLDEN_HALO_MAT : haloMaterialFor(color)}
        castShadow={false}
        frustumCulled={false}
      >
        <ringGeometry args={[cupRadius + 0.032, cupRadius + 0.2, 32]} />
      </mesh>

      {/* Sunk Golden Completion Ring (always mounted visible={true} for 0ms startup shader pre-warm) */}
      <mesh
        ref={sunkRingRef}
        visible={true}
        scale={isSunk ? 1 : 0}
        position={[0, SUNK_RING_Y, 0]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        material={SUNK_RING_MAT}
        castShadow={false}
        frustumCulled={false}
      >
        <ringGeometry args={[cupRadius + 0.042, cupRadius + 0.195, 32]} />
      </mesh>

      {/* Slender Tapered Fiberglass Flagpole (r <= 0.020m so r=0.18m holed ball clears pin cleanly) */}
      <mesh
        castShadow
        position={[0, (poleHeight - cupDepth) * 0.5, 0]}
        material={isGoldenPin ? GOLDEN_POLE_MAT : POLE_MAT}
      >
        <cylinderGeometry args={[0.017, 0.02, poleHeight + cupDepth, 12]} />
      </mesh>

      {/* Brass Finial Orb (crowned w/ spire & collar when isGoldenPin) */}
      <mesh
        position={[0, poleHeight + 0.045, 0]}
        material={isGoldenPin ? GOLDEN_POLE_MAT : TOYBOX_MATERIALS.brassAccent}
        castShadow
      >
        <sphereGeometry args={[isGoldenPin ? 0.1 : 0.085, 12, 10]} />
      </mesh>
      {isGoldenPin && (
        <>
          <mesh
            position={[0, poleHeight - 0.04, 0]}
            material={GOLDEN_POLE_MAT}
            castShadow
          >
            <cylinderGeometry args={[0.055, 0.04, 0.04, 12]} />
          </mesh>
          <mesh
            position={[0, poleHeight + 0.18, 0]}
            material={GOLDEN_POLE_MAT}
            castShadow
          >
            <coneGeometry args={[0.045, 0.14, 10]} />
          </mesh>
        </>
      )}

      {/* Swallowtail Flag Banner (both active & ghost meshes mounted visible={true} from frame 0) */}
      <group ref={pennantGroupRef} position={[0, poleHeight - 0.34, 0]}>
        <mesh
          ref={activeBannerRef}
          visible={true}
          scale={isSunk ? 0 : 1}
          castShadow={false}
          frustumCulled={false}
          geometry={pennantGeo}
          material={isGoldenPin ? GOLDEN_BANNER_MAT : palette.banner}
        />
        <mesh
          ref={sunkBannerRef}
          visible={true}
          scale={isSunk ? 1 : 0}
          castShadow={false}
          frustumCulled={false}
          geometry={pennantGeo}
          material={TOYBOX_MATERIALS.flagSunkGhost}
        />
      </group>

      {/* Floating Golden Diamond Beacon on Pole Top when Sunk (mounted visible={true}, scale={0} until sunk) */}
      <mesh
        ref={sunkStarRef}
        visible={true}
        scale={isSunk ? 1 : 0}
        position={[0, poleHeight + 0.24, 0]}
        material={TOYBOX_MATERIALS.cupSunkCheck}
        castShadow={false}
        frustumCulled={false}
      >
        <octahedronGeometry args={[0.15, 0]} />
      </mesh>

      {/* Cupped Confetti Burst (all chips mounted visible={true}, scale={0} until celebration) */}
      <group ref={confettiRef} visible={true}>
        {confettiSpecs.map((_, idx) => (
          <mesh
            key={idx}
            visible={true}
            scale={0}
            castShadow={false}
            frustumCulled={false}
            material={
              CONFETTI_TOYBOX_MATERIALS[idx % CONFETTI_TOYBOX_MATERIALS.length]
            }
          >
            <boxGeometry args={[1, 0.16, 0.7]} />
          </mesh>
        ))}
      </group>
    </group>
  );
});
