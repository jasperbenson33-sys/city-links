'use client';

import './suppressThirdPartyWarnings';
import React, { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Physics } from '@react-three/rapier';
import {
  BALL_RADIUS,
  WORLD_GRAVITY_Y,
  type ClubId,
  type CourseId,
  type CourseMasterPlan,
  type GrandEscapadeZoneNumber,
  type Vec3Tuple,
} from '@/types';
import {
  GRAND_ESCAPADE_MASTER_PLAN,
  QA_TELEPORT_ZONES,
  resolveCourseIdFromSearchParams,
  resolveQaTeleportZone,
} from '@/config/grandEscapadeMasterPlan';
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
  setCourse: (courseId: CourseId) => void;
  teleportBall: (
    position: Vec3Tuple,
    opts?: { keepStrokes?: boolean; seedStrokes?: number },
  ) => void;
  teleportToZone: (
    zoneNumber: GrandEscapadeZoneNumber,
    opts?: { silent?: boolean },
  ) => void;
  setAuditStation: (stationId: string | null) => void;
  setOrbitYaw: (yawRad: number) => void;
  toggleCourseFlyover: () => void;
  setFlyoverProgress: (progress: number | null) => void;
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
  plan: CourseMasterPlan,
): ScriptedShotSpec {
  const teePos: Vec3Tuple = [
    plan.teePosition[0],
    plan.teePosition[1] + BALL_RADIUS,
    plan.teePosition[2],
  ];

  if (plan.courseId === 'grand-escapade') {
    switch (shotId) {
      case 1:
        return {
          startPos: teePos,
          clubId: 'driver',
          aimYaw: -0.02,
          power: 0.78,
          forceSteamActive: null,
          resetHoleFirst: true,
        };
      case 2: {
        const z3Anchor = QA_TELEPORT_ZONES[3];
        const startPos: Vec3Tuple = [
          z3Anchor.position[0],
          z3Anchor.position[1] + BALL_RADIUS,
          z3Anchor.position[2],
        ];
        // Under WORLD_GRAVITY_Y = -18.0 & BALL_RADIUS = 0.18, Driver @ power 0.25 clears the 11.2m plinth by +0.505m
        // and strikes dead-center on the 29.8° glass sash ([25.5, 11.72, -80.0]) to bank onto East Rooftop.
        const skylightTarget: Vec3Tuple = [25.5, 11.72, -80.0];
        return {
          startPos,
          clubId: 'driver',
          aimYaw: Math.atan2(
            skylightTarget[0] - startPos[0],
            -(skylightTarget[2] - startPos[2]),
          ),
          power: 0.25,
          forceSteamActive: null,
        };
      }
      case 3: {
        const chuteFunnel = GRAND_ESCAPADE_MASTER_PLAN.copperChuteSpec.entryPosition;
        const startPos: Vec3Tuple = [51.5, 14.0 + BALL_RADIUS, 5.0];
        return {
          startPos,
          clubId: 'putter',
          aimYaw: Math.atan2(
            chuteFunnel[0] - startPos[0],
            -(chuteFunnel[2] - startPos[2]),
          ),
          power: 0.36,
          forceSteamActive: null,
        };
      }
      case 4: {
        const startPos: Vec3Tuple = [34.0, -7.5 + BALL_RADIUS, 88.5];
        const cupPos = plan.cup.position;
        return {
          startPos,
          clubId: 'putter',
          aimYaw: Math.atan2(cupPos[0] - startPos[0], -(cupPos[2] - startPos[2])),
          power: 0.82,
          forceSteamActive: null,
        };
      }
    }
  }

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
      const hotdogProp = plan.props.find(
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
      const cupPos = plan.cup.position;
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

const IsolatedCityWorld = React.memo(function IsolatedCityWorld({
  ballWorldPositionRef,
}: {
  ballWorldPositionRef: React.RefObject<THREE.Vector3 | null>;
}) {
  const activePlan = useCurbsideStore((s) => s.activePlan);
  const isHoleComplete = useCurbsideStore((s) => s.isHoleComplete);
  const selectedClub = useCurbsideStore((s) => s.selectedClub);
  const propHitTimestamps = useCurbsideStore((s) => s.propHitTimestamps);
  const forceSteamActive = useCurbsideStore((s) => s.forceSteamActive);

  return (
    <CityIslandWorld
      plan={activePlan}
      isHoleSunk={isHoleComplete}
      selectedClub={selectedClub}
      propHitTimestamps={propHitTimestamps}
      forceAction={Boolean(forceSteamActive)}
      ballWorldPositionRef={ballWorldPositionRef}
    />
  );
});

export function CurbsideGameRoot({ children }: CurbsideGameRootProps) {
  const courseId = useCurbsideStore((s) => s.courseId);
  const initialBall = useCurbsideStore.getState().ballPosition;
  const ballWorldPositionRef = useRef(
    new THREE.Vector3(initialBall[0], initialBall[1], initialBall[2]),
  );
  const ballMeshRef = useRef<THREE.Object3D | null>(null);
  const cameraControlRef = useRef<CameraRigControl | null>(null);

  useEffect(() => {
    const store = useCurbsideStore.getState();
    store.hydratePersonalBest();
    soundEngine.init();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlCourse = params.has('course')
        ? resolveCourseIdFromSearchParams(params)
        : null;
      if (urlCourse && urlCourse !== useCurbsideStore.getState().courseId) {
        useCurbsideStore.getState().setCourse(urlCourse);
      }
      const qaZone = resolveQaTeleportZone(params.get('qaTeleportZone'));
      if (qaZone && useCurbsideStore.getState().courseId === 'grand-escapade') {
        useCurbsideStore
          .getState()
          .teleportToZone(qaZone.zoneNumber, { silent: true });
      }
      const qaFlyoverProgress = params.get('qaFlyoverProgress');
      if (qaFlyoverProgress !== null) {
        const parsed = Number(qaFlyoverProgress);
        if (Number.isFinite(parsed)) {
          useCurbsideStore
            .getState()
            .setCourseFlyover(true, Math.max(0, Math.min(1, parsed)));
        }
      } else if (params.get('qaFlyover') === '1') {
        useCurbsideStore.getState().setCourseFlyover(true, null);
      }
      const syncedPos = useCurbsideStore.getState().ballPosition;
      ballWorldPositionRef.current.set(syncedPos[0], syncedPos[1], syncedPos[2]);
    }
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
      setCourse: (nextCourseId) => {
        clearScriptedLaunchTimer();
        useCurbsideStore.getState().setCourse(nextCourseId);
        const pos = useCurbsideStore.getState().ballPosition;
        ballWorldPositionRef.current.set(pos[0], pos[1], pos[2]);
      },
      teleportBall: (pos, opts) => {
        ballWorldPositionRef.current.set(pos[0], pos[1], pos[2]);
        useCurbsideStore.getState().teleportBall(pos, opts);
      },
      teleportToZone: (zoneNumber, opts) => {
        useCurbsideStore.getState().teleportToZone(zoneNumber, opts);
        const pos = useCurbsideStore.getState().ballPosition;
        ballWorldPositionRef.current.set(pos[0], pos[1], pos[2]);
      },
      setAuditStation: (stationId) => {
        useCurbsideStore.getState().setCameraAuditStation(stationId);
      },
      setOrbitYaw: (yawRad) => {
        useCurbsideStore.getState().setAimYaw(yawRad);
      },
      toggleCourseFlyover: () => {
        useCurbsideStore.getState().toggleCourseFlyover();
      },
      setFlyoverProgress: (progress) => {
        if (progress === null) {
          useCurbsideStore.getState().setCourseFlyover(false, null);
        } else {
          useCurbsideStore.getState().setCourseFlyover(true, progress);
        }
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
        const store = useCurbsideStore.getState();
        const spec = resolveScriptedShotSpec(shotId, store.activePlan);

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
          store.setCourseFlyover(false, null);
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
        const plan = useCurbsideStore.getState().activePlan;
        ballWorldPositionRef.current.set(
          plan.teePosition[0],
          plan.teePosition[1] + BALL_RADIUS,
          plan.teePosition[2],
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
          <IsolatedCityWorld ballWorldPositionRef={ballWorldPositionRef} />

          <Physics
            key={courseId}
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
