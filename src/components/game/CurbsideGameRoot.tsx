'use client';

import './suppressThirdPartyWarnings';
import React, { Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { BALL_RADIUS, WORLD_GRAVITY_Y, type PlacedProp } from '@/types';
import { useCurbsideStore } from '@/store';
import { CityIslandWorld } from '@/components/world';
import { PhysicsWorld } from './PhysicsWorld';
import { GolfBallPhysicsController } from './GolfBallPhysicsController';
import { DioramaCameraRig, type CameraRigControl } from './DioramaCameraRig';
import { AimControlsAndArc } from './AimControlsAndArc';

export interface CurbsideGameRootProps {
  /** Optional HUD overlay rendered cleanly above the interactive 3D canvas */
  children?: React.ReactNode;
  className?: string;
}

export function CurbsideGameRoot({
  children,
  className = '',
}: CurbsideGameRootProps) {
  const [mounted, setMounted] = useState(false);

  const course = useCurbsideStore((s) => s.course);
  const courseVersion = useCurbsideStore((s) => s.courseVersion);
  const sunkFlags = useCurbsideStore((s) => s.sunkFlags);
  const selectedClub = useCurbsideStore((s) => s.selectedClub);
  const ballPosition = useCurbsideStore((s) => s.ballPosition);
  const propHitTimestamps = useCurbsideStore((s) => s.propHitTimestamps);

  const ballWorldPositionRef = useRef<THREE.Vector3>(
    new THREE.Vector3(
      course.startTeePosition[0],
      course.startTeePosition[1] + BALL_RADIUS,
      course.startTeePosition[2],
    ),
  );
  const cameraControlRef = useRef<CameraRigControl | null>(null);
  const waterTriggerRef = useRef<((sourcePropId?: string) => void) | null>(null);
  const deflectorTriggerRef = useRef<((prop: PlacedProp) => void) | null>(null);

  useEffect(() => {
    setMounted(true);
    useCurbsideStore.getState().hydrateDailyBest();
  }, []);

  useEffect(() => {
    ballWorldPositionRef.current.set(
      course.startTeePosition[0],
      course.startTeePosition[1] + BALL_RADIUS,
      course.startTeePosition[2],
    );
  }, [course.seed, course.startTeePosition]);

  return (
    <div
      className={`relative h-[100dvh] w-full overflow-hidden select-none bg-gradient-to-b from-[#6BBDF7] via-[#BFE8FD] to-[#FFE8CC] ${className}`}
      style={{ touchAction: 'none' }}
    >
      {mounted && (
        <Canvas
          shadows={{ type: THREE.PCFShadowMap }}
          dpr={[1, 2]}
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.04,
          }}
          camera={{
            fov: 44,
            near: 0.4,
            far: 950,
            position: [45, 110, 120],
          }}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            touchAction: 'none',
          }}
        >
          <Suspense fallback={null}>
            <CityIslandWorld
              course={course}
              sunkFlags={sunkFlags}
              selectedClub={selectedClub}
              ballPosition={ballPosition}
              propHitTimestamps={propHitTimestamps}
              includeLighting
              showHorizon
              showCornerBuildings
            />

            <Physics
              key={`rapier-${course.seed}-${courseVersion}`}
              gravity={[0, WORLD_GRAVITY_Y, 0]}
              timeStep={1 / 60}
            >
              <PhysicsWorld
                course={course}
                courseVersion={courseVersion}
                clubId={selectedClub}
                onWaterSensorHit={(sourcePropId) =>
                  waterTriggerRef.current?.(sourcePropId)
                }
                onDeflectorHit={(prop) => deflectorTriggerRef.current?.(prop)}
              />

              <GolfBallPhysicsController
                course={course}
                ballWorldPositionRef={ballWorldPositionRef}
                registerWaterTrigger={(fn) => {
                  waterTriggerRef.current = fn;
                }}
                registerDeflectorTrigger={(fn) => {
                  deflectorTriggerRef.current = fn;
                }}
              />
            </Physics>

            <DioramaCameraRig
              ballWorldPositionRef={ballWorldPositionRef}
              controlRef={cameraControlRef}
            />

            <AimControlsAndArc
              course={course}
              ballWorldPositionRef={ballWorldPositionRef}
              cameraControlRef={cameraControlRef}
            />
          </Suspense>
        </Canvas>
      )}

      {children}
    </div>
  );
}

export default CurbsideGameRoot;
