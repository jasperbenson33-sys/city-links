'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TOYBOX_MATERIALS } from '@/materials';
import { useCurbsideStore } from '@/store/useCurbsideStore';
import { PROP_ACCENT_MATERIALS } from './propMaterials';

export interface PigeonFlockPropProps {
  /** Base center [x, y, z] where y is the host sidewalk/plaza elevation. */
  position?: [number, number, number];
  rotationY?: number;
  /** Optional explicit ball position override (QA preview); world uses store.getState().ballPosition. */
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
 * Walkabout: Venice-inspired Low-Poly Urban Pigeon Flock seated flush at y = 0.
 * - Sleek folded wings tucked along torso sides when grounded/idle (zero T-pose wings).
 * - Extends & flaps wings smoothly during scatter flight, reading live ballPosition
 *   from useCurbsideStore.getState() inside useFrame for zero React re-renders.
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
  const elapsedRef = useRef(0);

  const birdLayouts = useMemo(() => {
    const spots: Array<[number, number]> = [
      [-0.48, 0.34],
      [0.38, 0.25],
      [-0.16, -0.38],
      [0.52, -0.32],
      [-0.62, -0.14],
      [0.12, 0.56],
    ];
    return Array.from({ length: Math.min(count, spots.length) }, (_, idx) => {
      const [hx, hz] = spots[idx];
      const ang = (idx / Math.max(1, count)) * Math.PI * 2 + 0.5;
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

  if (statesRef.current.length !== birdLayouts.length) {
    statesRef.current = birdLayouts.map((layout) => ({
      phase: 'ground',
      phaseStart: 0,
      localHome: layout.localHome,
      localRoost: layout.localRoost,
      idleYaw: layout.idleYaw,
    }));
  }

  useFrame((_, delta) => {
    elapsedRef.current += Math.min(delta, 0.05);
    const t = elapsedRef.current;
    if (!birdsGroupRef.current) return;

    const liveBallPos = ballPosition ?? useCurbsideStore.getState().ballPosition;
    const cosR = Math.cos(rotationY);
    const sinR = Math.sin(rotationY);

    const children = birdsGroupRef.current.children;
    for (let i = 0; i < children.length && i < statesRef.current.length; i++) {
      const birdGroup = children[i];
      const st = statesRef.current[i];

      const worldHomeX =
        position[0] + st.localHome[0] * cosR + st.localHome[1] * sinR;
      const worldHomeZ =
        position[2] - st.localHome[0] * sinR + st.localHome[1] * cosR;
      const ballDist = liveBallPos
        ? Math.hypot(liveBallPos[0] - worldHomeX, liveBallPos[2] - worldHomeZ)
        : 999;

      const wantScatter = forceScatter || ballDist < SCATTER_TRIGGER_DIST;
      const elapsed = t - st.phaseStart;

      if (st.phase === 'ground') {
        if (wantScatter) {
          st.phase = 'taking-off';
          st.phaseStart = t - (i % 3) * 0.06;
        }
      } else if (st.phase === 'taking-off') {
        if (elapsed >= TAKEOFF_DUR) {
          st.phase = 'hovering';
          st.phaseStart = t;
        }
      } else if (st.phase === 'hovering') {
        if (!wantScatter && ballDist > RETURN_CLEAR_DIST && elapsed >= HOVER_MIN_DUR) {
          st.phase = 'returning';
          st.phaseStart = t;
        }
      } else if (st.phase === 'returning') {
        if (wantScatter) {
          st.phase = 'taking-off';
          st.phaseStart = t;
        } else if (elapsed >= RETURN_DUR) {
          st.phase = 'ground';
          st.phaseStart = t;
        }
      }

      const phaseElapsed = Math.max(0, t - st.phaseStart);
      let px = st.localHome[0];
      let py = 0;
      let pz = st.localHome[1];
      let yaw = st.idleYaw;
      let pitch = 0;
      let flapSpeed = 0;

      if (st.phase === 'ground') {
        const peckPhase = (t * 1.45 + i * 1.1) % 3.4;
        const headGroup = headsRef.current[i];
        if (headGroup) {
          headGroup.rotation.x =
            peckPhase < 0.45 ? Math.sin((peckPhase / 0.45) * Math.PI) * 0.48 : 0;
        }
        yaw = st.idleYaw + Math.sin(t * 0.7 + i) * 0.14;
      } else if (st.phase === 'taking-off') {
        const u = Math.min(1, phaseElapsed / TAKEOFF_DUR);
        const ease = 1 - Math.pow(1 - u, 3);
        px = THREE.MathUtils.lerp(st.localHome[0], st.localRoost[0], ease);
        py =
          THREE.MathUtils.lerp(0, st.localRoost[1], ease) +
          Math.sin(u * Math.PI) * 0.4;
        pz = THREE.MathUtils.lerp(st.localHome[1], st.localRoost[2], ease);
        yaw = Math.atan2(
          st.localRoost[0] - st.localHome[0],
          st.localRoost[2] - st.localHome[1]
        );
        pitch = -0.34 * (1 - u);
        flapSpeed = 28;
      } else if (st.phase === 'hovering') {
        const orbit = t * 1.45 + i * 1.3;
        px = st.localRoost[0] + Math.cos(orbit) * 0.58;
        py = st.localRoost[1] + Math.sin(t * 2.4 + i) * 0.2;
        pz = st.localRoost[2] + Math.sin(orbit) * 0.58;
        yaw = -orbit + Math.PI * 0.5;
        pitch = 0.08;
        flapSpeed = 20;
      } else if (st.phase === 'returning') {
        const u = Math.min(1, phaseElapsed / RETURN_DUR);
        const ease = u * u * (3 - 2 * u);
        px = THREE.MathUtils.lerp(st.localRoost[0], st.localHome[0], ease);
        py = THREE.MathUtils.lerp(st.localRoost[1], 0, ease);
        pz = THREE.MathUtils.lerp(st.localRoost[2], st.localHome[1], ease);
        yaw = Math.atan2(
          st.localHome[0] - st.localRoost[0],
          st.localHome[1] - st.localRoost[2]
        );
        pitch = 0.22 * (1 - u);
        flapSpeed = 16;
      }

      birdGroup.position.set(px, py, pz);
      birdGroup.rotation.set(pitch, yaw, 0);

      const lw = leftWingsRef.current[i];
      const rw = rightWingsRef.current[i];
      if (lw && rw) {
        if (flapSpeed > 0) {
          const flap = Math.sin(t * flapSpeed + i) * 0.85;
          lw.position.set(-0.072, 0.12, -0.015);
          rw.position.set(0.072, 0.12, -0.015);
          lw.rotation.set(0, 0, flap + 0.35);
          rw.rotation.set(0, 0, -flap - 0.35);
          lw.scale.set(1.6, 0.7, 1.0);
          rw.scale.set(1.6, 0.7, 1.0);
        } else {
          // Folded flush and tapered snugly along the rounded torso flanks
          lw.position.set(-0.044, 0.1, -0.022);
          rw.position.set(0.044, 0.1, -0.022);
          lw.rotation.set(-0.22, -0.14, -0.26);
          rw.rotation.set(-0.22, 0.14, 0.26);
          lw.scale.set(0.6, 0.9, 1.0);
          rw.scale.set(0.6, 0.9, 1.0);
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
            key={`pigeon-${idx}`}
            position={[layout.localHome[0], 0, layout.localHome[1]]}
            rotation={[0, layout.idleYaw, 0]}
          >
            {/* Webbed Coral Feet Planted Flush at y = 0.00m */}
            <mesh
              position={[-0.024, 0.006, 0.015]}
              material={TOYBOX_MATERIALS.pigeonBeakFeet}
            >
              <boxGeometry args={[0.02, 0.012, 0.036]} />
            </mesh>
            <mesh
              position={[0.024, 0.006, 0.015]}
              material={TOYBOX_MATERIALS.pigeonBeakFeet}
            >
              <boxGeometry args={[0.02, 0.012, 0.036]} />
            </mesh>

            {/* Twin Slender Legs */}
            <mesh
              position={[-0.024, 0.038, 0]}
              material={TOYBOX_MATERIALS.pigeonBeakFeet}
            >
              <cylinderGeometry args={[0.006, 0.006, 0.056, 5]} />
            </mesh>
            <mesh
              position={[0.024, 0.038, 0]}
              material={TOYBOX_MATERIALS.pigeonBeakFeet}
            >
              <cylinderGeometry args={[0.006, 0.006, 0.056, 5]} />
            </mesh>

            {/* Plump Faceted Grey Body */}
            <mesh
              castShadow
              position={[0, 0.095, -0.01]}
              scale={[0.82, 0.85, 1.32]}
              material={TOYBOX_MATERIALS.pigeonBody}
            >
              <dodecahedronGeometry args={[0.072, 0]} />
            </mesh>

            {/* Iridescent Teal Neck Collar & Berry Chest Highlight */}
            <mesh
              castShadow
              position={[0, 0.145, 0.048]}
              material={TOYBOX_MATERIALS.pigeonNeck}
            >
              <cylinderGeometry args={[0.036, 0.048, 0.052, 7]} />
            </mesh>
            <mesh
              position={[0, 0.105, 0.052]}
              scale={[0.8, 0.7, 0.62]}
              material={PROP_ACCENT_MATERIALS.pigeonChestBerry}
            >
              <dodecahedronGeometry args={[0.044, 0]} />
            </mesh>

            {/* Faceted Head & Coral Beak */}
            <group
              ref={(el) => {
                headsRef.current[idx] = el;
              }}
              position={[0, 0.178, 0.06]}
            >
              <mesh castShadow material={TOYBOX_MATERIALS.pigeonBody}>
                <dodecahedronGeometry args={[0.036, 0]} />
              </mesh>
              <mesh
                position={[0, -0.004, 0.042]}
                rotation={[Math.PI * 0.5, 0, 0]}
                material={TOYBOX_MATERIALS.pigeonBeakFeet}
              >
                <coneGeometry args={[0.012, 0.032, 5]} />
              </mesh>
            </group>

            {/* Sleek Folded Left & Right Wings (extending cleanly only during flight) */}
            <mesh
              ref={(el) => {
                leftWingsRef.current[idx] = el;
              }}
              castShadow
              position={[-0.044, 0.1, -0.022]}
              rotation={[-0.22, -0.14, -0.26]}
              scale={[0.6, 0.9, 1.0]}
              material={TOYBOX_MATERIALS.pigeonWing}
            >
              <boxGeometry args={[0.022, 0.052, 0.128]} />
            </mesh>
            <mesh
              ref={(el) => {
                rightWingsRef.current[idx] = el;
              }}
              castShadow
              position={[0.044, 0.1, -0.022]}
              rotation={[-0.22, 0.14, 0.26]}
              scale={[0.6, 0.9, 1.0]}
              material={TOYBOX_MATERIALS.pigeonWing}
            >
              <boxGeometry args={[0.022, 0.052, 0.128]} />
            </mesh>

            {/* Charcoal Tail Fan */}
            <mesh
              castShadow
              position={[0, 0.088, -0.118]}
              rotation={[-0.3, 0, 0]}
              material={PROP_ACCENT_MATERIALS.pigeonWingBar}
            >
              <boxGeometry args={[0.062, 0.016, 0.088]} />
            </mesh>
          </group>
        ))}
      </group>

      {showWireframe && (
        <mesh
          position={[0, 0.2, 0]}
          material={TOYBOX_MATERIALS.qaSensorWireframe}
        >
          <boxGeometry args={[1.4, 0.4, 1.4]} />
        </mesh>
      )}
    </group>
  );
}
