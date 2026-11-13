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

export interface CupFlagAssemblyProps {
  /** World [x, y, z] position where y is the putting green surface top. */
  position?: [number, number, number];
  /** Color-coded flag identity ('red' | 'yellow' | 'blue' | 'purple' | 'green'). */
  color: ToyboxFlagColor;
  /** Whether this flag has already been sunk in the current hole. */
  isSunk?: boolean;
  /** Regulation cup visual radius (meters, 0.38m in Curbside Links). */
  cupRadius?: number;
  /** Recessed cup depth (meters, 0.14m in Curbside Links). */
  cupDepth?: number;
  /** Flagpole height in meters (2.35m street-level pin). */
  poleHeight?: number;
}

const CONFETTI_COUNT = 22;

const CUP_INNER_SLEEVE_MAT = new THREE.MeshStandardMaterial({
  color: '#F8FAFC',
  roughness: 0.45,
  metalness: 0.05,
  side: THREE.DoubleSide,
});

/**
 * Recessed regulation cup liner + crisp white lip + sunlit flutter flag assembly.
 * Sized cleanly for street-level putting greens (Hole 1: 5th & Mercer) with
 * double-sided inner cup sleeve, halo beacon collar, and celebratory confetti burst.
 */
export function CupFlagAssembly({
  position = [0, 0, 0],
  color,
  isSunk = false,
  cupRadius = 0.38,
  cupDepth = 0.14,
  poleHeight = 2.35,
}: CupFlagAssemblyProps) {
  const pennantGroupRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Mesh>(null);
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
      depth: 0.035,
      bevelEnabled: false,
    });
    geo.translate(0, 0, -0.0175);
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
    elapsedRef.current += Math.min(delta, 0.05);
    const t = elapsedRef.current;

    if (isSunk && !prevSunkRef.current) {
      celebrateStartRef.current = t;
    } else if (!isSunk && prevSunkRef.current) {
      celebrateStartRef.current = null;
    }
    prevSunkRef.current = isSunk;

    if (pennantGroupRef.current) {
      const targetY = isSunk ? poleHeight * 0.48 : poleHeight - 0.34;
      pennantGroupRef.current.position.y = THREE.MathUtils.lerp(
        pennantGroupRef.current.position.y,
        targetY,
        0.16,
      );
      pennantGroupRef.current.rotation.y = isSunk
        ? 0.25 + Math.sin(t * 1.6) * 0.05
        : Math.sin(t * 3.6 + position[0]) * 0.22 + 0.15;
    }

    if (haloRef.current) {
      haloRef.current.visible = !isSunk;
      if (!isSunk) {
        const pulse = 1 + Math.sin(t * 3.2) * 0.06;
        haloRef.current.scale.set(pulse, pulse, 1);
      }
    }

    if (sunkStarRef.current) {
      sunkStarRef.current.visible = isSunk;
      if (isSunk) {
        sunkStarRef.current.rotation.y = t * 1.8;
        sunkStarRef.current.position.y =
          poleHeight + 0.24 + Math.sin(t * 2.5) * 0.05;
      }
    }

    if (confettiRef.current) {
      const start = celebrateStartRef.current;
      const dt = start !== null ? t - start : -1;
      const active = dt >= 0 && dt < 1.35;
      confettiRef.current.visible = active;
      if (active) {
        const children = confettiRef.current.children;
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
      }
    }
  });

  return (
    <group name={`cup-flag-${color}`} position={position}>
      {/* Recessed Regulation Cup Inner White Liner Wall */}
      <mesh
        position={[0, -cupDepth * 0.5, 0]}
        material={CUP_INNER_SLEEVE_MAT}
        receiveShadow
      >
        <cylinderGeometry args={[cupRadius, cupRadius, cupDepth, 24, 1, true]} />
      </mesh>

      {/* Dark Cup Bottom Basin */}
      <mesh
        position={[0, -cupDepth + 0.006, 0]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        material={TOYBOX_MATERIALS.cupHoleDark}
      >
        <circleGeometry args={[cupRadius * 0.99, 24]} />
      </mesh>

      {/* Interior Ferrule Base Ring around Pin */}
      <mesh
        position={[0, -cupDepth + 0.025, 0]}
        material={TOYBOX_MATERIALS.brassAccent}
      >
        <cylinderGeometry args={[0.068, 0.078, 0.04, 12]} />
      </mesh>

      {/* Flush Crisp White Lip Flange around Turf Opening */}
      <mesh
        position={[0, 0.003, 0]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        material={TOYBOX_MATERIALS.cupRimWhite}
      >
        <ringGeometry args={[cupRadius - 0.012, cupRadius + 0.045, 28]} />
      </mesh>

      {/* Gentle Pulsing Beacon Ring around Cup */}
      <mesh
        ref={haloRef}
        position={[0, 0.005, 0]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        material={palette.halo}
      >
        <ringGeometry args={[cupRadius + 0.055, cupRadius + 0.2, 28]} />
      </mesh>

      {/* Sunk Golden Completion Ring */}
      {isSunk && (
        <mesh
          position={[0, 0.006, 0]}
          rotation={[-Math.PI * 0.5, 0, 0]}
          material={TOYBOX_MATERIALS.cupSunkCheck}
        >
          <ringGeometry args={[cupRadius + 0.055, cupRadius + 0.19, 28]} />
        </mesh>
      )}

      {/* Tapered White/Fiberglass Flagpole Seated in Recessed Ferrule */}
      <mesh
        castShadow
        position={[0, (poleHeight - cupDepth) * 0.5, 0]}
        material={TOYBOX_MATERIALS.flagPoleWhite}
      >
        <cylinderGeometry args={[0.026, 0.032, poleHeight + cupDepth, 12]} />
      </mesh>

      {/* Brass Finial Orb */}
      <mesh
        position={[0, poleHeight + 0.045, 0]}
        material={TOYBOX_MATERIALS.brassAccent}
        castShadow
      >
        <sphereGeometry args={[0.085, 12, 10]} />
      </mesh>

      {/* Swallowtail Flag Banner */}
      <group ref={pennantGroupRef} position={[0, poleHeight - 0.34, 0]}>
        <mesh
          castShadow
          geometry={pennantGeo}
          material={isSunk ? TOYBOX_MATERIALS.flagSunkGhost : palette.banner}
        />
      </group>

      {/* Floating Golden Diamond Beacon on Pole Top when Sunk */}
      <mesh
        ref={sunkStarRef}
        visible={isSunk}
        position={[0, poleHeight + 0.24, 0]}
        material={TOYBOX_MATERIALS.cupSunkCheck}
      >
        <octahedronGeometry args={[0.15, 0]} />
      </mesh>

      {/* Cupped Confetti Burst */}
      <group ref={confettiRef} visible={false}>
        {confettiSpecs.map((_, idx) => (
          <mesh
            key={idx}
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
}
