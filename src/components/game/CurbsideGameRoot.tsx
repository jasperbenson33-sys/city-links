'use client';

import './suppressThirdPartyWarnings';
import React, { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
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
import { GameCanvas } from '@/components/canvas/GameCanvas';
import { GolfBall } from '@/components/canvas/GolfBall';
import { CameraRig, type CameraRigControl } from '@/components/canvas/CameraRig';
import { AimControlsAndArc } from '@/components/canvas/AimControlsAndArc';
import { PhysicsWorld } from './PhysicsWorld';

export type ScriptedShowcaseShotId = 1 | 2 | 3 | 4;

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
  runScriptedShot: (shotId: ScriptedShowcaseShotId) => void;
  resetHole: () => void;
}

declare global {
  interface Window {
    __CURBSIDE_DEBUG__?: CurbsideDebugBridge;
    __CURBSIDE_QA_FREEZE__?: boolean;
  }
}

interface ScriptedShotSpec {
  startPos: Vec3Tuple;
  clubId: ClubId;
  aimYaw: number;
  power: number;
  forceSteamActive: boolean | null;
  resetHoleFirst?: boolean;
}

const SCRIPTED_SHOT_TELEPORT_SETTLE_MS = 85;
const QA_SCRIPTED_SHOT_MOUNT_DELAY_MS = 600;

function resolveScriptedShotSpec(
  shotId: ScriptedShowcaseShotId,
): ScriptedShotSpec {
  const teePos: Vec3Tuple = [
    COURSE_MASTER_PLAN.teePosition[0],
    COURSE_MASTER_PLAN.teePosition[1] + BALL_RADIUS,
    COURSE_MASTER_PLAN.teePosition[2],
  ];

  switch (shotId) {
    case 1:
      return {
        startPos: teePos,
        clubId: 'driver',
        aimYaw: -0.03,
        power: 0.65,
        forceSteamActive: null,
        resetHoleFirst: true,
      };
    case 2: {
      const startPos: Vec3Tuple = [-1.32, 0.18, -16.57];
      const hotdogProp = COURSE_MASTER_PLAN.props.find(
        (prop) => prop.id === 'hotdog-cart-corner',
      );
      const awningCenter: Vec3Tuple = hotdogProp?.hotdogAwningMeta
        ?.awningCenter ?? [17.5, 2.3, -16.35];
      const aimYaw = Math.atan2(
        awningCenter[0] - startPos[0],
        -(awningCenter[2] - startPos[2]),
      );
      return {
        startPos,
        clubId: 'wedge',
        aimYaw,
        power: 0.8,
        forceSteamActive: null,
      };
    }
    case 3:
      return {
        startPos: [-1.2, 0.18, -16.5],
        clubId: 'skimmer',
        aimYaw: 1.58,
        power: 0.78,
        forceSteamActive: null,
      };
    case 4: {
      const startPos: Vec3Tuple = [22.8, 0.78, -21.6];
      const cupPos = COURSE_MASTER_PLAN.cup.position;
      const aimYaw = Math.atan2(
        cupPos[0] - startPos[0],
        -(cupPos[2] - startPos[2]),
      );
      return {
        startPos,
        clubId: 'putter',
        aimYaw,
        power: 0.26,
        forceSteamActive: null,
      };
    }
  }
}

export interface CurbsideGameRootProps {
  children?: React.ReactNode;
}

const IsolatedCityWorld = React.memo(function IsolatedCityWorld() {
  const isHoleComplete = useCurbsideStore((s) => s.isHoleComplete);
  const selectedClub = useCurbsideStore((s) => s.selectedClub);
  const propHitTimestamps = useCurbsideStore((s) => s.propHitTimestamps);
  const forceSteamActive = useCurbsideStore((s) => s.forceSteamActive);

  return (
    <CityIslandWorld
      plan={COURSE_MASTER_PLAN}
      isHoleSunk={isHoleComplete}
      selectedClub={selectedClub}
      propHitTimestamps={propHitTimestamps}
      forceAction={Boolean(forceSteamActive)}
    />
  );
});

export function CurbsideGameRoot({ children }: CurbsideGameRootProps) {
  const ballWorldPositionRef = useRef(
    new THREE.Vector3(
      COURSE_MASTER_PLAN.teePosition[0],
      COURSE_MASTER_PLAN.teePosition[1] + BALL_RADIUS,
      COURSE_MASTER_PLAN.teePosition[2],
    ),
  );
  const ballMeshRef = useRef<THREE.Object3D | null>(null);
  const cameraControlRef = useRef<CameraRigControl | null>(null);

  useEffect(() => {
    useCurbsideStore.getState().hydratePersonalBest();
    soundEngine.init();
  }, []);

  useEffect(() => {
    let scriptedLaunchTimer: number | null = null;
    let qaAutoTriggerTimer: number | null = null;

    const clearScriptedLaunchTimer = () => {
      if (scriptedLaunchTimer !== null) {
        window.clearTimeout(scriptedLaunchTimer);
        scriptedLaunchTimer = null;
      }
    };

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
      runScriptedShot: (shotId) => {
        clearScriptedLaunchTimer();
        const spec = resolveScriptedShotSpec(shotId);
        const store = useCurbsideStore.getState();

        ballWorldPositionRef.current.set(
          spec.startPos[0],
          spec.startPos[1],
          spec.startPos[2],
        );

        if (spec.resetHoleFirst) {
          store.replayHole();
        } else {
          store.teleportBall(spec.startPos);
          store.setCameraAuditStation(null);
          store.setStreetScout(false);
        }

        const readyStore = useCurbsideStore.getState();
        readyStore.selectClub(spec.clubId, false);
        readyStore.setAimYaw(spec.aimYaw);

        // Give React + GolfBall one commit/frame cycle to apply pendingTeleport
        // to the Rapier body before launchShot reads rb.translation().
        scriptedLaunchTimer = window.setTimeout(() => {
          scriptedLaunchTimer = null;
          useCurbsideStore.getState().launchShot({
            clubId: spec.clubId,
            aimYaw: spec.aimYaw,
            power: spec.power,
            forceSteamActive: spec.forceSteamActive,
          });
        }, SCRIPTED_SHOT_TELEPORT_SETTLE_MS);
      },
      resetHole: () => {
        clearScriptedLaunchTimer();
        ballWorldPositionRef.current.set(
          COURSE_MASTER_PLAN.teePosition[0],
          COURSE_MASTER_PLAN.teePosition[1] + BALL_RADIUS,
          COURSE_MASTER_PLAN.teePosition[2],
        );
        useCurbsideStore.getState().replayHole();
      },
    };
    window.__CURBSIDE_DEBUG__ = bridge;

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('qaFreezeParticles') === '1') {
        window.__CURBSIDE_QA_FREEZE__ = true;
      }
      const scriptedParam = params.get('qaScriptedShot');
      const parsedShot = scriptedParam ? Number(scriptedParam) : NaN;
      if (
        parsedShot === 1 ||
        parsedShot === 2 ||
        parsedShot === 3 ||
        parsedShot === 4
      ) {
        const shotId: ScriptedShowcaseShotId = parsedShot;
        qaAutoTriggerTimer = window.setTimeout(() => {
          qaAutoTriggerTimer = null;
          bridge.runScriptedShot(shotId);
        }, QA_SCRIPTED_SHOT_MOUNT_DELAY_MS);
      }
    }

    return () => {
      clearScriptedLaunchTimer();
      if (qaAutoTriggerTimer !== null) {
        window.clearTimeout(qaAutoTriggerTimer);
      }
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
      <GameCanvas className="h-full w-full touch-none">
        <Suspense fallback={null}>
          <IsolatedCityWorld />

          <Physics
            interpolate
            updatePriority={-1}
            gravity={[0, WORLD_GRAVITY_Y, 0]}
            timeStep={1 / 120}
          >
            <PhysicsWorld />
            <GolfBall
              ballWorldPositionRef={ballWorldPositionRef}
              ballMeshRef={ballMeshRef}
            />
          </Physics>

          <CameraRig
            ballWorldPositionRef={ballWorldPositionRef}
            ballMeshRef={ballMeshRef}
            controlRef={cameraControlRef}
          />
          <AimControlsAndArc
            ballWorldPositionRef={ballWorldPositionRef}
            ballMeshRef={ballMeshRef}
            cameraControlRef={cameraControlRef}
          />
        </Suspense>
      </GameCanvas>

      {children}
    </div>
  );
}

export default CurbsideGameRoot;
