'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TOYBOX_MATERIALS } from '@/materials';

export interface PigeonFlockPropProps {
  /** Base center [x, y, z] where y is the host sidewalk/plaza elevation. */
  position?: [number, number, number];
  rotationY?: number;
  /** Live ball position [x, y, z] in world space for smooth scatter reaction. */
  ballPosition?: [number, number, number];
  /** Number of birds in the flock (default 5). */
  count?: number;
  /** QA inspection override to preview flight scatter animation. */
  forceScatter?: boolean;
  showWireframe?: boolean;
}

type PigeonPhase = 'ground' | 'taking-off' | 'hovering' | 'returning';

interface PigeonState {
  phase: PigeonPhase;
  phaseStart: number;
  localHome: [number, number];
  localRoost: [number, number, number];
  idleYaw: number;
}

const TAKEOFF_DUR = 0.85;
const HOVER_MIN_DUR = 2.4;
const RETURN_DUR = 1.15;
const SCATTER_TRIGGER_DIST = 3.2;
const RETURN_CLEAR_DIST = 5.2;

/**
 * Charming low-poly urban pigeon flock seated cleanly at y = 0.
 * Uses an anti-loop state machine ('ground' -> 'taking-off' -> 'hovering' -> 'returning')
 * so birds scatter cleanly when a shot approaches and return smoothly after play passes.
 */
export function PigeonFlockProp({
  position = [0, 0, 0],
  rotationY = 0,
  ballPosition,
  count = 5,
  forceScatter = false,
  showWireframe = false,
}: PigeonFlockPropProps) {
  const birdsGroupRef = useRef<THREE.Group>(null);
  const leftWingsRef = useRef<Array<THREE.Mesh | null>>([]);
  const rightWingsRef = useRef<Array<THREE.Mesh | null>>([]);
  const headsRef = useRef<Array<THREE.Group | null>>([]);

  const birdLayouts = useMemo(() => {
    const spots: Array<[number, number]> = [
      [-0.55, 0.35],
      [0.42, 0.28],
      [-0.18, -0.42],
      [0.62, -0.35],
      [-0.78, -0.15],
      [0.12, 0.68],
    ];
    return Array.from({ length: Math.min(count, spots.length) }, (_, idx) => {
      const [hx, hz] = spots[idx];
      const ang = (idx / count) * Math.PI * 2 + 0.5;
      return {
        localHome: [hx, hz] as [number, number],
        localRoost: [
          hx + Math.cos(ang) * 1.45,
          2.65 + (idx % 3) * 0.35,
          hz + Math.sin(ang) * 1.45,
        ] as [number, number, number],
        idleYaw: idx * 1.25 + 0.4,
      };
    });
  }, [count]);

  const statesRef = useRef<PigeonState[]>(
    birdLayouts.map((layout) => ({
      phase: 'ground',
      phaseStart: 0,
      localHome: layout.localHome,
      localRoost: layout.localRoost,
      idleYaw: layout.idleYaw,
    }))
  );

  // Keep statesRef synchronized if count changes in QA
  if (statesRef.current.length !== birdLayouts.length) {
    statesRef.current = birdLayouts.map((layout) => ({
      phase: 'ground',
      phaseStart: 0,
      localHome: layout.localHome,
      localRoost: layout.localRoost,
      idleYaw: layout.idleYaw,
    }));
  }

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const group = birdsGroupRef.current;
    if (!group) return;

    const children = group.children;
    const cosR = Math.cos(rotationY);
    const sinR = Math.sin(rotationY);

    // Convert world ballPosition into local flock coordinates (inverse Y-rotation)
    let localBallX = 999;
    let localBallY = 999;
    let localBallZ = 999;
    if (ballPosition) {
      const dx = ballPosition[0] - position[0];
      const dy = ballPosition[1] - position[1];
      const dz = ballPosition[2] - position[2];
      localBallX = dx * cosR - dz * sinR;
      localBallZ = dx * sinR + dz * cosR;
      localBallY = dy;
    }

    for (let i = 0; i < statesRef.current.length; i++) {
      const st = statesRef.current[i];
      const bird = children[i];
      if (!bird) continue;

      const lWing = leftWingsRef.current[i];
      const rWing = rightWingsRef.current[i];
      const head = headsRef.current[i];

      const [hx, hz] = st.localHome;
      const [rx, ry, rz] = st.localRoost;
      const distToHome = Math.hypot(localBallX - hx, localBallY - 0.15, localBallZ - hz);
      const nearTrigger = forceScatter || distToHome < SCATTER_TRIGGER_DIST;

      if (st.phase === 'ground') {
        if (nearTrigger) {
          st.phase = 'taking-off';
          st.phaseStart = t;
        } else {
          bird.position.set(hx, 0, hz);
          bird.rotation.y = st.idleYaw + Math.sin(t * 0.8 + i * 2.1) * 0.3;
          if (lWing) lWing.rotation.z = 0.08;
          if (rWing) rWing.rotation.z = -0.08;
          if (head) {
            const peck = Math.max(0, Math.sin(t * 4.4 + i * 1.8));
            head.rotation.x = peck > 0.72 ? (peck - 0.72) * 2.2 : 0;
          }
        }
      }

      if (st.phase === 'taking-off') {
        const u = Math.min(1, (t - st.phaseStart) / TAKEOFF_DUR);
        const ease = 1 - Math.pow(1 - u, 2.2);
        const px = THREE.MathUtils.lerp(hx, rx, ease);
        const pz = THREE.MathUtils.lerp(hz, rz, ease);
        const py = THREE.MathUtils.lerp(0, ry, ease) + Math.sin(u * Math.PI) * 0.55;
        bird.position.set(px, py, pz);
        bird.rotation.y = Math.atan2(rx - hx, rz - hz);

        const flap = Math.sin(t * 40.0 + i) * 0.82;
        if (lWing) lWing.rotation.z = flap;
        if (rWing) rWing.rotation.z = -flap;
        if (head) head.rotation.x = -0.15;

        if (u >= 1) {
          st.phase = 'hovering';
          st.phaseStart = t;
        }
      } else if (st.phase === 'hovering') {
        const orbitAngle = t * 1.4 + i * 1.3;
        bird.position.set(
          rx + Math.cos(orbitAngle) * 0.45,
          ry + Math.sin(t * 2.6 + i) * 0.16,
          rz + Math.sin(orbitAngle) * 0.45
        );
        bird.rotation.y = -orbitAngle;
        const flap = Math.sin(t * 24.0 + i) * 0.52;
        if (lWing) lWing.rotation.z = flap;
        if (rWing) rWing.rotation.z = -flap;
        if (head) head.rotation.x = 0.1;

        const hoveredLongEnough = t - st.phaseStart >= HOVER_MIN_DUR;
        if (!forceScatter && hoveredLongEnough && distToHome >= RETURN_CLEAR_DIST) {
          st.phase = 'returning';
          st.phaseStart = t;
        }
      } else if (st.phase === 'returning') {
        if (nearTrigger) {
          st.phase = 'taking-off';
          st.phaseStart = t;
        } else {
          const u = Math.min(1, (t - st.phaseStart) / RETURN_DUR);
          const ease = u * u * (3 - 2 * u);
          bird.position.set(
            THREE.MathUtils.lerp(rx, hx, ease),
            THREE.MathUtils.lerp(ry, 0, ease) + Math.sin(u * Math.PI) * 0.35,
            THREE.MathUtils.lerp(rz, hz, ease)
          );
          bird.rotation.y = Math.atan2(hx - rx, hz - rz);
          const glide = Math.sin(t * 22.0 + i) * 0.42;
          if (lWing) lWing.rotation.z = glide;
          if (rWing) rWing.rotation.z = -glide;
          if (head) head.rotation.x = 0.1;

          if (u >= 1) {
            st.phase = 'ground';
            st.phaseStart = t;
          }
        }
      }
    }
  });

  return (
    <group
      name="pigeon-flock-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      <group ref={birdsGroupRef}>
        {birdLayouts.map((layout, idx) => (
          <group
            key={idx}
            position={[layout.localHome[0], 0, layout.localHome[1]]}
            rotation={[0, layout.idleYaw, 0]}
          >
            {/* Left & Right Orange Feet Flush at y = 0 */}
            <mesh
              position={[-0.042, 0.008, 0.02]}
              material={TOYBOX_MATERIALS.pigeonBeakFeet}
            >
              <boxGeometry args={[0.032, 0.016, 0.068]} />
            </mesh>
            <mesh
              position={[0.042, 0.008, 0.02]}
              material={TOYBOX_MATERIALS.pigeonBeakFeet}
            >
              <boxGeometry args={[0.032, 0.016, 0.068]} />
            </mesh>
            {/* Legs */}
            <mesh
              position={[-0.042, 0.048, 0]}
              material={TOYBOX_MATERIALS.pigeonBeakFeet}
            >
              <cylinderGeometry args={[0.009, 0.009, 0.08, 6]} />
            </mesh>
            <mesh
              position={[0.042, 0.048, 0]}
              material={TOYBOX_MATERIALS.pigeonBeakFeet}
            >
              <cylinderGeometry args={[0.009, 0.009, 0.08, 6]} />
            </mesh>

            {/* Plump Low-Poly Body */}
            <mesh
              castShadow
              position={[0, 0.145, 0]}
              scale={[0.92, 0.9, 1.15]}
              material={TOYBOX_MATERIALS.pigeonBody}
            >
              <dodecahedronGeometry args={[0.135, 0]} />
            </mesh>

            {/* Tail Fan */}
            <mesh
              position={[0, 0.125, -0.15]}
              rotation={[-0.35, 0, 0]}
              material={TOYBOX_MATERIALS.pigeonWing}
            >
              <boxGeometry args={[0.12, 0.035, 0.14]} />
            </mesh>

            {/* Articulated Left & Right Wings */}
            <mesh
              ref={(el) => {
                leftWingsRef.current[idx] = el;
              }}
              castShadow
              position={[-0.115, 0.165, -0.01]}
              material={TOYBOX_MATERIALS.pigeonWing}
            >
              <boxGeometry args={[0.15, 0.035, 0.16]} />
            </mesh>
            <mesh
              ref={(el) => {
                rightWingsRef.current[idx] = el;
              }}
              castShadow
              position={[0.115, 0.165, -0.01]}
              material={TOYBOX_MATERIALS.pigeonWing}
            >
              <boxGeometry args={[0.15, 0.035, 0.16]} />
            </mesh>

            {/* Neck Collar, Head & Beak */}
            <group
              ref={(el) => {
                headsRef.current[idx] = el;
              }}
              position={[0, 0.22, 0.085]}
            >
              <mesh material={TOYBOX_MATERIALS.pigeonNeck}>
                <cylinderGeometry args={[0.06, 0.075, 0.055, 8]} />
              </mesh>
              <mesh
                castShadow
                position={[0, 0.065, 0.02]}
                material={TOYBOX_MATERIALS.pigeonBody}
              >
                <dodecahedronGeometry args={[0.078, 0]} />
              </mesh>
              <mesh
                position={[0, 0.06, 0.11]}
                rotation={[Math.PI * 0.5, 0, 0]}
                material={TOYBOX_MATERIALS.pigeonBeakFeet}
              >
                <coneGeometry args={[0.028, 0.08, 5]} />
              </mesh>
            </group>
          </group>
        ))}
      </group>

      {showWireframe && (
        <mesh
          position={[0, 0.35, 0]}
          material={TOYBOX_MATERIALS.qaSensorWireframe}
        >
          <cylinderGeometry args={[1.35, 1.35, 0.7, 16]} />
        </mesh>
      )}
    </group>
  );
}
