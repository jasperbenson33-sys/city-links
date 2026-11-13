'use client';

import './suppressThirdPartyWarnings';
import React, { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import {
  BALL_RADIUS,
  WORLD_GRAVITY_Y,
  type ClubId,
  type Vec3Tuple,
} from '@/types';
import { COURSE_MASTER_PLAN } from '@/config/courseMasterPlan';
import { soundEngine } from '@/lib/sound';
import { useCurbsideStore } from '@/store';
import { CityIslandWorld } from '@/components/world';
import { GolfBall } from '@/components/canvas/GolfBall';
import { CameraRig, type CameraRigControl } from '@/components/canvas/CameraRig';
import { AimControlsAndArc } from '@/components/canvas/AimControlsAndArc';
import { PhysicsWorld } from './PhysicsWorld';

export interface CurbsideDebugBridge {
  getState: () => ReturnType<typeof useCurbsideStore.getState>;
  teleportBall: (position: Vec3Tuple) => void;
  setAuditStation: (stationId: string | null) => void;
  setOrbitYaw: (yawRad: number) => void;
  fireShot: (opts: {
    clubId?: ClubId;
    aimYaw?: number;
    power: number;
    forceSteamActive?: boolean | null;
  }) => void;
  resetHole: () => void;
}

declare global {
  interface Window {
    __CURBSIDE_DEBUG__?: CurbsideDebugBridge;
  }
}

export interface CurbsideGameRootProps {
  children?: React.ReactNode;
}

export function CurbsideGameRoot({ children }: CurbsideGameRootProps) {
  const isHoleComplete = useCurbsideStore((s) => s.isHoleComplete);
  const selectedClub = useCurbsideStore((s) => s.selectedClub);
  const propHitTimestamps = useCurbsideStore((s) => s.propHitTimestamps);
  const forceSteamActive = useCurbsideStore((s) => s.forceSteamActive);
  const hydratePersonalBest = useCurbsideStore((s) => s.hydratePersonalBest);

  const ballWorldPositionRef = useRef(
    new THREE.Vector3(
      COURSE_MASTER_PLAN.teePosition[0],
      COURSE_MASTER_PLAN.teePosition[1] + BALL_RADIUS,
      COURSE_MASTER_PLAN.teePosition[2],
    ),
  );
  const cameraControlRef = useRef<CameraRigControl | null>(null);

  useEffect(() => {
    hydratePersonalBest();
    soundEngine.init();
  }, [hydratePersonalBest]);

  useEffect(() => {
    const bridge: CurbsideDebugBridge = {
      getState: () => useCurbsideStore.getState(),
      teleportBall: (pos) => {
        ballWorldPositionRef.current.set(pos[0], pos[1], pos[2]);
        useCurbsideStore.getState().teleportBall(pos);
      },
      setAuditStation: (stationId) => {
        useCurbsideStore.getState().setCameraAuditStation(stationId);
      },
      setOrbitYaw: (yawRad) => {
        useCurbsideStore.getState().setAimYaw(yawRad);
      },
      fireShot: (opts) => {
        useCurbsideStore.getState().launchShot({
          clubId: opts.clubId,
          aimYaw: opts.aimYaw,
          power: opts.power,
          forceSteamActive:
            opts.forceSteamActive !== undefined ? opts.forceSteamActive : null,
        });
      },
      resetHole: () => {
        ballWorldPositionRef.current.set(
          COURSE_MASTER_PLAN.teePosition[0],
          COURSE_MASTER_PLAN.teePosition[1] + BALL_RADIUS,
          COURSE_MASTER_PLAN.teePosition[2],
        );
        useCurbsideStore.getState().replayHole();
      },
    };
    window.__CURBSIDE_DEBUG__ = bridge;
    return () => {
      if (window.__CURBSIDE_DEBUG__ === bridge) {
        delete window.__CURBSIDE_DEBUG__;
      }
    };
  }, []);

  return (
    <div
      className="relative h-[100dvh] w-full overflow-hidden select-none bg-[#8AD1FC]"
      style={{ touchAction: 'none' }}
    >
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 2]}
        camera={{
          fov: 52,
          near: 0.12,
          far: 420,
          position: [
            COURSE_MASTER_PLAN.teePosition[0],
            COURSE_MASTER_PLAN.teePosition[1] + BALL_RADIUS + 2.08,
            COURSE_MASTER_PLAN.teePosition[2] + 4.7,
          ],
        }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.06,
        }}
        className="h-full w-full touch-none"
      >
        <Suspense fallback={null}>
          <CityIslandWorld
            plan={COURSE_MASTER_PLAN}
            isHoleSunk={isHoleComplete}
            selectedClub={selectedClub}
            propHitTimestamps={propHitTimestamps}
            forceAction={Boolean(forceSteamActive)}
          />

          <Physics gravity={[0, WORLD_GRAVITY_Y, 0]} timeStep={1 / 60}>
            <PhysicsWorld />
            <GolfBall ballWorldPositionRef={ballWorldPositionRef} />
          </Physics>

          <CameraRig
            ballWorldPositionRef={ballWorldPositionRef}
            controlRef={cameraControlRef}
          />
          <AimControlsAndArc
            ballWorldPositionRef={ballWorldPositionRef}
            cameraControlRef={cameraControlRef}
          />
        </Suspense>
      </Canvas>

      {children}
    </div>
  );
}

export default CurbsideGameRoot;
