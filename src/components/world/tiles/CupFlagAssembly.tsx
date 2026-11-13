'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CONFETTI_TOYBOX_MATERIALS,
  FLAG_COLOR_MATERIALS,
  TOYBOX_MATERIALS,
  type ToyboxFlagColor,
} from '@/materials';

export interface CupFlagAssemblyProps {
  /** Local [x, y, z] position where y is the green surface top. */
  position?: [number, number, number];
  /** Color-coded flag identity ('red' | 'yellow' | 'blue' | 'purple' | 'green'). */
  color: ToyboxFlagColor;
  /** Whether this flag has already been sunk in the current round. */
  isSunk?: boolean;
  /** Regulation cup visual radius (meters). */
  cupRadius?: number;
  /** Flagpole height in meters (tall enough to read cleanly from zoomed-out 3/4 view). */
  poleHeight?: number;
}

const CONFETTI_COUNT = 22;

/**
 * Recessed regulation cup + tall, sunlit color-coded flag assembly.
 * Readable at a glance across the 48m x 48m diorama in 390x844 mobile portrait view,
 * with a clear visual sunk state (lowered ghost pennant + golden check ring).
 */
export function CupFlagAssembly({
  position = [0, 0, 0],
  color,
  isSunk = false,
  cupRadius = 0.24,
  poleHeight = 5.1,
}: CupFlagAssemblyProps) {
  const pennantGroupRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const sunkStarRef = useRef<THREE.Mesh>(null);
  const confettiRef = useRef<THREE.Group>(null);
  const celebrateStartRef = useRef<number | null>(null);
  const prevSunkRef = useRef(isSunk);

  const palette = FLAG_COLOR_MATERIALS[color];

  // Crisp swallowtail pennant geometry in +X/+Y plane (scaled for instant 3/4 readability)
  const pennantGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.56);
    shape.lineTo(2.0, 0.34);
    shape.lineTo(1.64, 0.0);
    shape.lineTo(2.0, -0.34);
    shape.lineTo(0, -0.56);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: false,
    });
    geo.translate(0, 0, -0.03);
    return geo;
  }, []);

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

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Detect transition from unsunk -> sunk to trigger celebratory confetti pop
    if (isSunk && !prevSunkRef.current) {
      celebrateStartRef.current = t;
    } else if (!isSunk && prevSunkRef.current) {
      celebrateStartRef.current = null;
    }
    prevSunkRef.current = isSunk;

    if (pennantGroupRef.current) {
      const targetY = isSunk ? poleHeight * 0.44 : poleHeight - 0.62;
      pennantGroupRef.current.position.y = THREE.MathUtils.lerp(
        pennantGroupRef.current.position.y,
        targetY,
        0.16
      );
      pennantGroupRef.current.rotation.y = isSunk
        ? 0.25 + Math.sin(t * 1.6) * 0.05
        : Math.sin(t * 3.6 + position[0]) * 0.2 + 0.15;
    }

    if (haloRef.current) {
      haloRef.current.visible = !isSunk;
      if (!isSunk) {
        const pulse = 1 + Math.sin(t * 3.2) * 0.08;
        haloRef.current.scale.set(pulse, pulse, 1);
      }
    }

    if (sunkStarRef.current) {
      sunkStarRef.current.visible = isSunk;
      if (isSunk) {
        sunkStarRef.current.rotation.y = t * 1.8;
        sunkStarRef.current.position.y = poleHeight + 0.34 + Math.sin(t * 2.5) * 0.06;
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
          chip.position.set(
            spec.vx * dt,
            0.15 + spec.vy * dt - 4.4 * dt * dt,
            spec.vz * dt
          );
          chip.rotation.x = dt * spec.rotSpeed;
          chip.rotation.y = dt * (spec.rotSpeed * 0.8);
          chip.scale.setScalar(Math.max(0.01, (1 - dt / 1.35) * 0.14));
        }
      }
    }
  });

  const cupDepth = 0.14;

  return (
    <group name={`cup-flag-${color}`} position={position}>
      {/* Recessed Regulation Cup Well (cylinder wall + bottom disc + crisp white collar) */}
      <mesh
        position={[0, -cupDepth * 0.5, 0]}
        material={TOYBOX_MATERIALS.cupRimWhite}
      >
        <cylinderGeometry args={[cupRadius, cupRadius, cupDepth, 20, 1, true]} />
      </mesh>
      <mesh
        position={[0, -cupDepth + 0.005, 0]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        material={TOYBOX_MATERIALS.cupHoleDark}
      >
        <circleGeometry args={[cupRadius * 0.99, 20]} />
      </mesh>
      {/* Crisp white lip ring around cup edge */}
      <mesh
        position={[0, 0.008, 0]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        material={TOYBOX_MATERIALS.cupRimWhite}
      >
        <ringGeometry args={[cupRadius - 0.01, cupRadius + 0.06, 24]} />
      </mesh>

      {/* Color-Coded Ground Beacon Collar Ring (hidden once sunk) */}
      <mesh
        ref={haloRef}
        position={[0, 0.011, 0]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        material={palette.halo}
      >
        <ringGeometry args={[cupRadius + 0.06, cupRadius + 0.28, 28]} />
      </mesh>

      {/* Sunk Golden Completion Ring at Base */}
      {isSunk && (
        <mesh
          position={[0, 0.012, 0]}
          rotation={[-Math.PI * 0.5, 0, 0]}
          material={TOYBOX_MATERIALS.cupSunkCheck}
        >
          <ringGeometry args={[cupRadius + 0.07, cupRadius + 0.24, 24]} />
        </mesh>
      )}

      {/* Flagpole Seated Inside Recessed Cup */}
      <mesh
        castShadow
        position={[0, poleHeight * 0.5 - cupDepth * 0.5, 0]}
        material={TOYBOX_MATERIALS.flagPoleWhite}
      >
        <cylinderGeometry args={[0.052, 0.06, poleHeight + cupDepth, 10]} />
      </mesh>

      {/* Brass Finial Cap */}
      <mesh position={[0, poleHeight + 0.08, 0]} material={TOYBOX_MATERIALS.brassAccent}>
        <sphereGeometry args={[0.17, 12, 10]} />
      </mesh>

      {/* Color-Coded Swallowtail Flag Banner */}
      <group ref={pennantGroupRef} position={[0, poleHeight - 0.62, 0]}>
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
        position={[0, poleHeight + 0.34, 0]}
        material={TOYBOX_MATERIALS.cupSunkCheck}
      >
        <octahedronGeometry args={[0.24, 0]} />
      </mesh>

      {/* Cupped Confetti Burst */}
      <group ref={confettiRef} visible={false}>
        {confettiSpecs.map((_, idx) => (
          <mesh
            key={idx}
            material={CONFETTI_TOYBOX_MATERIALS[idx % CONFETTI_TOYBOX_MATERIALS.length]}
          >
            <boxGeometry args={[1, 0.16, 0.7]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
