'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type RefObject,
} from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BallCollider,
  RigidBody,
  useAfterPhysicsStep,
  useBeforePhysicsStep,
  type CollisionEnterPayload,
  type RapierRigidBody,
} from '@react-three/rapier';
import {
  BALL_RADIUS,
  WORLD_GRAVITY_Y,
  type CourseMasterPlan,
  type Vec3Tuple,
} from '@/types';
import {
  getMasterPlanGroundElevationAt,
  getMasterPlanSurfaceTagAt,
  getVanRampOrRoofElevationAt,
} from '@/config/courseMasterPlan';
import { COPPER_SPIRAL_CHUTE_SPEC } from '@/config/grandEscapadeMasterPlan';
import { computeAwningBounceVelocity } from '@/lib/geometryHelpers';
import { stepBallAerodynamics } from '@/lib/aerodynamics';
import { isQaFreezeActive, resolveAnimTime } from '@/components/world/qaFreeze';
import { getClubProfile } from '@/lib/clubs';
import {
  computeDeterministicUmbrellaBounce,
  COPPER_CHUTE_RIDE_DURATION_SEC,
  createBallDimpleTexture,
  evaluateCopperChuteCapture,
  evaluateMasterPlanGutterAtPoint,
  isPointInFountainBasin,
  isPointInReactiveZone,
  isPointInSteamBay,
  isStage2OutOfBounds,
  sampleCopperChuteRideState,
  sampleFountainDropArcPoint,
} from '@/physics';
import { soundEngine } from '@/lib/sound';
import { useCurbsideStore } from '@/store';

export interface GolfBallProps {
  ballWorldPositionRef?: MutableRefObject<THREE.Vector3>;
  ballMeshRef?: RefObject<THREE.Object3D | null>;
}

const REST_SPEED_THRESHOLD_MPS = 0.035;
const REST_HYSTERESIS_SECONDS = 0.16;
const COULOMB_CREEP_STOP_SPEED_MPS = 0.32;
const COULOMB_CREEP_DECEL_MPS2 = 1.35;
const CUP_DROP_TWEEN_SECONDS = 0.15;

function getVanSupportElevationForPlan(
  wx: number,
  wz: number,
  plan: CourseMasterPlan,
): number | null {
  if (plan.courseId === 'classic') {
    return getVanRampOrRoofElevationAt(wx, wz);
  }
  const van = plan.props.find((p) => Boolean(p.vanRampMeta));
  const meta = van?.vanRampMeta;
  if (!meta) return null;
  const checkSlope = (spec: typeof meta.slopedRampSpec) => {
    if (!spec) return null;
    const b = spec.boundsXZ;
    if (wx < b.minX || wx > b.maxX || wz < b.minZ || wz > b.maxZ) return null;
    const span = Math.max(0.1, b.maxZ - b.minZ);
    const t =
      spec.climbDirection === 'north'
        ? (b.maxZ - wz) / span
        : (wz - b.minZ) / span;
    return spec.bottomY + (spec.topY - spec.bottomY) * Math.max(0, Math.min(1, t));
  };
  const rampY = checkSlope(meta.slopedRampSpec);
  if (rampY !== null) return rampY;
  const kickerY = checkSlope(meta.roofAccessKickerSpec);
  if (kickerY !== null) return kickerY;
  const deck = meta.roofLaunchDeckBoundsXZ;
  if (deck && wx >= deck.minX && wx <= deck.maxX && wz >= deck.minZ && wz <= deck.maxZ) {
    return meta.roofDeckTopY;
  }
  return null;
}

export function GolfBall({
  ballWorldPositionRef,
  ballMeshRef,
}: GolfBallProps = {}) {
  const clock = useThree((s) => s.clock);
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const localBallMeshRef = useRef<THREE.Mesh | null>(null);
  const shadowRef = useRef<THREE.Mesh | null>(null);
  const scratchWorldVecRef = useRef(new THREE.Vector3());
  const scratchShadowNormalRef = useRef(new THREE.Vector3());
  const scratchDefaultUpRef = useRef(new THREE.Vector3(0, 0, 1));

  const lastShotSeqRef = useRef(0);
  const lastTeleportSeqRef = useRef(0);
  const lastFountainDropSeqRef = useRef(0);
  const fountainDropElapsedRef = useRef(0);
  const lastSteamPopShotSeqRef = useRef(-1);
  const steamPopCheckPendingRef = useRef(false);
  const gutterEntryShotSeqRef = useRef(-1);
  const flightElapsedRef = useRef(0);
  const lowSpeedTimeRef = useRef(0);
  const prevVelRef = useRef<Vec3Tuple>([0, 0, 0]);
  const telemetryAccumRef = useRef(0);

  // Per-shot / cooldown guards for reactive props (Stage 1 + Stage 2)
  const awningCooldownRef = useRef(0);
  const vanKickerCooldownRef = useRef(0);
  const vanLaunchCooldownRef = useRef(0);
  const gutterBoostCooldownRef = useRef(0);
  const steamCooldownRef = useRef(0);
  const umbrellaCooldownRef = useRef(0);
  const pigeonCooldownRef = useRef(0);
  const lipOutCooldownRef = useRef(0);
  const curbAudioCooldownRef = useRef(0);
  const chuteCooldownRef = useRef(0);
  const skylightCooldownRef = useRef(0);
  const bellCooldownRef = useRef(0);
  const turnstileCooldownRef = useRef(0);
  const hvacCooldownRef = useRef(0);
  const hydrantJetCooldownRef = useRef(0);
  const stairwellSlideCooldownRef = useRef(0);
  const subwayCarCooldownRef = useRef(0);
  const copperChuteRideRef = useRef<{
    active: boolean;
    elapsed: number;
    entryOrigin: Vec3Tuple | null;
  }>({
    active: false,
    elapsed: 0,
    entryOrigin: null,
  });
  const cupDropTweenRef = useRef<{
    from: Vec3Tuple;
    to: Vec3Tuple;
    elapsed: number;
    duration: number;
  } | null>(null);

  const shotPhase = useCurbsideStore((s) => s.shotPhase);
  const pendingTeleport = useCurbsideStore((s) => s.pendingTeleport);
  const selectedClub = useCurbsideStore((s) => s.selectedClub);

  const dimpleTexture = useMemo(() => createBallDimpleTexture(), []);

  useEffect(() => {
    return () => {
      dimpleTexture?.dispose();
    };
  }, [dimpleTexture]);

  const initialPos = useMemo<Vec3Tuple>(
    () => [...useCurbsideStore.getState().ballPosition] as Vec3Tuple,
    [],
  );

  const assignBallMeshRef = useCallback(
    (node: THREE.Mesh | null) => {
      localBallMeshRef.current = node;
      if (ballMeshRef) {
        (ballMeshRef as MutableRefObject<THREE.Object3D | null>).current = node;
      }
    },
    [ballMeshRef],
  );

  const syncVisualTransform = useCallback(
    (x: number, y: number, z: number) => {
      if (localBallMeshRef.current) {
        localBallMeshRef.current.position.set(0, 0, 0);
        localBallMeshRef.current.updateMatrixWorld(true);
      }
      const rbGroup = localBallMeshRef.current?.parent;
      if (rbGroup) {
        rbGroup.position.set(x, y, z);
        rbGroup.quaternion.set(0, 0, 0, 1);
        rbGroup.updateMatrixWorld(true);
      }
      if (ballWorldPositionRef) {
        ballWorldPositionRef.current.set(x, y, z);
      }
    },
    [ballWorldPositionRef],
  );

  const resetReactionGuards = useCallback((resetShotSequences: boolean) => {
    awningCooldownRef.current = 0;
    vanKickerCooldownRef.current = 0;
    vanLaunchCooldownRef.current = 0;
    gutterBoostCooldownRef.current = 0;
    steamCooldownRef.current = 0;
    umbrellaCooldownRef.current = 0;
    pigeonCooldownRef.current = 0;
    lipOutCooldownRef.current = 0;
    curbAudioCooldownRef.current = 0;
    chuteCooldownRef.current = 0;
    skylightCooldownRef.current = 0;
    bellCooldownRef.current = 0;
    turnstileCooldownRef.current = 0;
    hvacCooldownRef.current = 0;
    hydrantJetCooldownRef.current = 0;
    stairwellSlideCooldownRef.current = 0;
    subwayCarCooldownRef.current = 0;
    copperChuteRideRef.current.active = false;
    copperChuteRideRef.current.elapsed = 0;
    copperChuteRideRef.current.entryOrigin = null;
    flightElapsedRef.current = 0;
    lowSpeedTimeRef.current = 0;
    telemetryAccumRef.current = 0;
    steamPopCheckPendingRef.current = false;
    if (resetShotSequences) {
      lastSteamPopShotSeqRef.current = -1;
      gutterEntryShotSeqRef.current = -1;
      cupDropTweenRef.current = null;
      if (localBallMeshRef.current) {
        localBallMeshRef.current.position.set(0, 0, 0);
        localBallMeshRef.current.updateMatrixWorld(true);
      }
    }
  }, []);

  const lockBodyAtRest = useCallback(
    (rb: RapierRigidBody, x: number, y: number, z: number) => {
      if (!rb.isEnabled()) {
        rb.setEnabled(true);
      }
      rb.setGravityScale(1, false);
      rb.resetForces(false);
      rb.resetTorques(false);
      rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false);
      rb.setTranslation({ x, y, z }, false);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, false);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, false);
      if (!rb.isSleeping()) {
        rb.sleep();
      }
      prevVelRef.current = [0, 0, 0];
      syncVisualTransform(x, y, z);
    },
    [syncVisualTransform],
  );

  // Start cleanly asleep on tee so static frames have zero micro-buzz
  useEffect(() => {
    const rb = bodyRef.current;
    if (!rb) return;
    resetReactionGuards(true);
    lockBodyAtRest(rb, initialPos[0], initialPos[1], initialPos[2]);
  }, [initialPos, lockBodyAtRest, resetReactionGuards]);

  const applyPendingTeleport = useCallback(
    (
      rb: RapierRigidBody,
      teleport: NonNullable<
        ReturnType<typeof useCurbsideStore.getState>['pendingTeleport']
      >,
    ) => {
      if (teleport.seq === lastTeleportSeqRef.current) return;
      lastTeleportSeqRef.current = teleport.seq;
      const [x, y, z] = teleport.position;
      resetReactionGuards(true);
      lockBodyAtRest(rb, x, y, z);
      useCurbsideStore.getState().consumeBallReset();
    },
    [lockBodyAtRest, resetReactionGuards],
  );

  const applyPendingShot = useCallback(
    (
      rb: RapierRigidBody,
      shot: NonNullable<
        ReturnType<typeof useCurbsideStore.getState>['pendingShot']
      >,
    ) => {
      if (shot.seq === lastShotSeqRef.current) return;
      lastShotSeqRef.current = shot.seq;
      cupDropTweenRef.current = null;
      if (!rb.isEnabled()) {
        rb.setEnabled(true);
      }
      resetReactionGuards(false);
      const [vx, vy, vz] = shot.launchVelocity;
      const pos = rb.translation();
      const activePlan = useCurbsideStore.getState().activePlan;
      const groundY = getMasterPlanGroundElevationAt(pos.x, pos.z, activePlan);
      const startY = Math.max(pos.y, groundY + BALL_RADIUS + 0.002);
      rb.resetForces(false);
      rb.resetTorques(false);
      rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false);
      rb.wakeUp();
      rb.setTranslation({ x: pos.x, y: startY, z: pos.z }, true);
      rb.setLinvel({ x: vx, y: vy, z: vz }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      syncVisualTransform(pos.x, startY, pos.z);
      prevVelRef.current = [vx, vy, vz];
    },
    [resetReactionGuards, syncVisualTransform],
  );

  // Immediately reflect teleports visually even outside active physics stepping
  useEffect(() => {
    const rb = bodyRef.current;
    if (!rb || !pendingTeleport) return;
    applyPendingTeleport(rb, pendingTeleport);
  }, [applyPendingTeleport, pendingTeleport]);

  // Execute queued teleports and shot launches synchronously right before Rapier's 120Hz step
  // so trajectory outcomes are invariant to post-teleport settle timing (e.g. 85ms vs 600ms).
  useBeforePhysicsStep(() => {
    const rb = bodyRef.current;
    if (!rb) return;
    const state = useCurbsideStore.getState();
    if (state.pendingTeleport) {
      applyPendingTeleport(rb, state.pendingTeleport);
    }
    if (state.pendingShot) {
      applyPendingShot(rb, state.pendingShot);
    }
  });

  const handleCollisionEnter = useCallback((payload: CollisionEnterPayload) => {
    const rb = bodyRef.current;
    if (!rb) return;
    const state = useCurbsideStore.getState();
    if (state.shotPhase !== 'ball_in_flight' && state.shotPhase !== 'settling') {
      return;
    }

    const userData = payload.other.rigidBodyObject?.userData as
      | { propId?: string }
      | undefined;
    const propId = userData?.propId;
    const preV = prevVelRef.current;
    const preSpeed = Math.hypot(preV[0], preV[1], preV[2]);

    if (propId === 'hotdog-cart-awning' && awningCooldownRef.current <= 0) {
      const awningMeta = state.activePlan.props.find(
        (p) => Boolean(p.hotdogAwningMeta),
      )?.hotdogAwningMeta;
      if (awningMeta) {
        awningCooldownRef.current = 0.4;
        const bounced = computeAwningBounceVelocity(
          preV,
          awningMeta.worldNormal,
          awningMeta.restitution,
        );
        rb.setLinvel(
          { x: bounced[0], y: bounced[1], z: bounced[2] },
          true,
        );
        soundEngine.playAwningCushion({
          impactSpeed: preSpeed,
          surfaceKey: 'hotdog-cart-awning',
        });
        state.recordPropHit('hotdog-cart-corner', 'Awning Cushion!');
        return;
      }
    }

    if (propId === 'esc-z3-angled-skylight-bank' && skylightCooldownRef.current <= 0) {
      skylightCooldownRef.current = 0.35;
      const skylightProp = state.activePlan.props.find(
        (p) => p.id === 'esc-z3-angled-skylight-bank',
      );
      const pm = skylightProp?.pitchedBankMeta;
      if (pm && preSpeed > 1.2) {
        const reflected = computeAwningBounceVelocity(
          preV,
          pm.worldNormal,
          pm.restitution,
        );
        const bv = pm.boostVelocity;
        if (bv && preV[0] > 0.6) {
          const speedScale = THREE.MathUtils.clamp(preSpeed / 12.5, 0.55, 1.08);
          rb.setLinvel(
            {
              x: Math.max(reflected[0], bv[0] * speedScale),
              y: Math.max(reflected[1], bv[1] * speedScale),
              z: Math.min(reflected[2], bv[2] * speedScale),
            },
            true,
          );
        } else {
          rb.setLinvel(
            { x: reflected[0], y: reflected[1], z: reflected[2] },
            true,
          );
        }
      }
      soundEngine.play('skylight_glass_bank', {
        impactSpeed: preSpeed,
        surfaceKey: propId,
      });
      state.recordPropHit(propId, 'Skylight Glass Bank!');
      return;
    }

    if (propId === 'esc-z5-rooftop-bell-tower' && bellCooldownRef.current <= 0) {
      bellCooldownRef.current = 1.1;
      soundEngine.play('bell_tower_chime', {
        impactSpeed: preSpeed,
        surfaceKey: propId,
      });
      state.recordPropHit(propId, 'Conservatory Bell Chime!');
      return;
    }

    if (
      (propId === 'esc-z7-brass-turnstiles' ||
        propId === 'esc-z7-brass-turnstile-west' ||
        propId === 'esc-z7-brass-turnstile-east') &&
      turnstileCooldownRef.current <= 0
    ) {
      turnstileCooldownRef.current = 0.7;
      soundEngine.play('turnstile_click', {
        impactSpeed: preSpeed,
        surfaceKey: propId,
      });
      state.recordPropHit(propId, 'Turnstile Spin!');
      return;
    }

    if (propId === 'tree-overhang-east' && curbAudioCooldownRef.current <= 0) {
      curbAudioCooldownRef.current = 0.25;
      const curV = rb.linvel();
      rb.setLinvel(
        { x: curV.x * 0.55, y: Math.min(curV.y, -1.2), z: curV.z * 0.55 },
        true,
      );
      soundEngine.playCurbBank({
        impactSpeed: Math.hypot(curV.x, curV.y, curV.z),
        surfaceKey: 'tree-overhang-east',
      });
      return;
    }

    if (propId === 'cup-rim' && preSpeed > 0.45) {
      lipOutCooldownRef.current = Math.max(lipOutCooldownRef.current, 0.2);
      soundEngine.play('cup_rattle', {
        impactSpeed: preSpeed,
        surfaceKey: 'cup-rim',
      });
      return;
    }

    // Play velocity-scaled curb/wall clack when impacting hard horizontally
    if (curbAudioCooldownRef.current <= 0) {
      const postV = rb.linvel();
      const dvx = postV.x - preV[0];
      const dvz = postV.z - preV[2];
      const horizDelta = Math.hypot(dvx, dvz);
      if (horizDelta > 2.1) {
        curbAudioCooldownRef.current = 0.06;
        soundEngine.playCurbBank({
          impactSpeed: horizDelta,
          surfaceKey: propId ?? 'curb-wall',
        });
      }
    }
  }, []);

  // Deterministic fixed-timestep (1/120s) physics integration & rest-hysteresis clamp
  useAfterPhysicsStep((world) => {
    const dt = world.timestep > 0 ? world.timestep : 1 / 120;
    const rb = bodyRef.current;
    if (!rb) return;

    // Decrement reactive cooldowns
    awningCooldownRef.current = Math.max(0, awningCooldownRef.current - dt);
    vanKickerCooldownRef.current = Math.max(0, vanKickerCooldownRef.current - dt);
    vanLaunchCooldownRef.current = Math.max(0, vanLaunchCooldownRef.current - dt);
    gutterBoostCooldownRef.current = Math.max(0, gutterBoostCooldownRef.current - dt);
    steamCooldownRef.current = Math.max(0, steamCooldownRef.current - dt);
    umbrellaCooldownRef.current = Math.max(0, umbrellaCooldownRef.current - dt);
    pigeonCooldownRef.current = Math.max(0, pigeonCooldownRef.current - dt);
    lipOutCooldownRef.current = Math.max(0, lipOutCooldownRef.current - dt);
    curbAudioCooldownRef.current = Math.max(0, curbAudioCooldownRef.current - dt);
    chuteCooldownRef.current = Math.max(0, chuteCooldownRef.current - dt);
    skylightCooldownRef.current = Math.max(0, skylightCooldownRef.current - dt);
    bellCooldownRef.current = Math.max(0, bellCooldownRef.current - dt);
    turnstileCooldownRef.current = Math.max(0, turnstileCooldownRef.current - dt);
    hvacCooldownRef.current = Math.max(0, hvacCooldownRef.current - dt);
    hydrantJetCooldownRef.current = Math.max(0, hydrantJetCooldownRef.current - dt);
    stairwellSlideCooldownRef.current = Math.max(0, stairwellSlideCooldownRef.current - dt);
    subwayCarCooldownRef.current = Math.max(0, subwayCarCooldownRef.current - dt);

    const store = useCurbsideStore.getState();
    const activePlan = store.activePlan;

    // Keep resting/holed/fountain-arc rigid bodies strictly asleep so zero micro-buzz occurs
    if (
      store.shotPhase === 'aiming' ||
      store.shotPhase === 'pulling' ||
      store.shotPhase === 'holed_out' ||
      store.shotPhase === 'fountain_drop'
    ) {
      if (store.shotPhase === 'holed_out') {
        const cup = activePlan.cup.position;
        if (!cupDropTweenRef.current && rb.isEnabled()) {
          lockBodyAtRest(rb, cup[0], cup[1] - 0.08, cup[2]);
          rb.setEnabled(false);
        }
      } else if (store.shotPhase !== 'fountain_drop') {
        const p = rb.translation();
        const v = rb.linvel();
        if (
          !rb.isEnabled() ||
          !rb.isSleeping() ||
          Math.abs(v.x) > 1e-4 ||
          Math.abs(v.y) > 1e-4 ||
          Math.abs(v.z) > 1e-4
        ) {
          lockBodyAtRest(rb, p.x, p.y, p.z);
        }
      }
      return;
    }

    if (store.shotPhase !== 'ball_in_flight' && store.shotPhase !== 'settling') {
      return;
    }

    // Active Copper Spiral Chute helical spline ride (+14.0m -> +2.0m onto Grand Transit Plaza)
    if (copperChuteRideRef.current.active) {
      flightElapsedRef.current += dt;
      copperChuteRideRef.current.elapsed += dt;
      const u = Math.min(
        1,
        copperChuteRideRef.current.elapsed / COPPER_CHUTE_RIDE_DURATION_SEC,
      );
      const sample = sampleCopperChuteRideState(u);
      const entryOrig = copperChuteRideRef.current.entryOrigin;
      let ridePos: Vec3Tuple = sample.position;
      if (entryOrig && u < 0.14) {
        const blendRaw = u / 0.14;
        const blendSmooth = blendRaw * blendRaw * (3 - 2 * blendRaw);
        ridePos = [
          entryOrig[0] + (sample.position[0] - entryOrig[0]) * blendSmooth,
          entryOrig[1] + (sample.position[1] - entryOrig[1]) * blendSmooth,
          entryOrig[2] + (sample.position[2] - entryOrig[2]) * blendSmooth,
        ];
      }
      rb.setGravityScale(0, false);
      rb.setTranslation(
        { x: ridePos[0], y: ridePos[1], z: ridePos[2] },
        true,
      );
      const rideSpeed = 10.5;
      rb.setLinvel(
        {
          x: sample.tangent[0] * rideSpeed,
          y: sample.tangent[1] * rideSpeed,
          z: sample.tangent[2] * rideSpeed,
        },
        true,
      );
      prevVelRef.current = [
        sample.tangent[0] * rideSpeed,
        sample.tangent[1] * rideSpeed,
        sample.tangent[2] * rideSpeed,
      ];
      telemetryAccumRef.current += dt;
      if (telemetryAccumRef.current >= 0.08) {
        telemetryAccumRef.current = 0;
        store.updateBallTelemetry(ridePos, 'storm_gutter');
      }
      if (u >= 1) {
        copperChuteRideRef.current.active = false;
        copperChuteRideRef.current.entryOrigin = null;
        chuteCooldownRef.current = 1.6;
        rb.setGravityScale(1, true);
        const spout = COPPER_SPIRAL_CHUTE_SPEC.exitSpoutPosition;
        const launchV = COPPER_SPIRAL_CHUTE_SPEC.exitLaunchVelocity;
        rb.setTranslation(
          { x: spout[0], y: spout[1] + BALL_RADIUS + 0.04, z: spout[2] },
          true,
        );
        rb.setLinvel({ x: launchV[0], y: launchV[1], z: launchV[2] }, true);
        prevVelRef.current = [...launchV];
      }
      return;
    }

    const pos = rb.translation();
    const vel = rb.linvel();
    flightElapsedRef.current += dt;
    let vx = vel.x;
    let vy = vel.y;
    let vz = vel.z;

    // 0. Check Zone 5 Copper Spiral Chute helical funnel capture
    if (
      chuteCooldownRef.current <= 0 &&
      evaluateCopperChuteCapture([pos.x, pos.y, pos.z], activePlan)
    ) {
      copperChuteRideRef.current = {
        active: true,
        elapsed: 0,
        entryOrigin: [pos.x, pos.y, pos.z],
      };
      telemetryAccumRef.current = 0;
      store.updateBallTelemetry([pos.x, pos.y, pos.z], 'storm_gutter');
      rb.setGravityScale(0, false);
      soundEngine.play('copper_chute_whoosh', { intensity: 0.95 });
      store.recordPropHit('esc-z5-copper-spiral-chute', 'Copper Spiral Chute!');
      return;
    }

    // 1. Out-of-bounds safety recovery (< 0.6s, +1 stroke back to exact previous lie)
    if (isStage2OutOfBounds([pos.x, pos.y, pos.z], activePlan)) {
      lockBodyAtRest(rb, pos.x, pos.y, pos.z);
      fountainDropElapsedRef.current = 0;
      store.triggerOobHazard([pos.x, pos.y, pos.z]);
      return;
    }

    // 2. Fountain water basin check -> brisk < 0.6s parabolic drop arc +1 penalty
    if (isPointInFountainBasin(pos.x, pos.y, pos.z, activePlan)) {
      lockBodyAtRest(rb, pos.x, pos.y, pos.z);
      fountainDropElapsedRef.current = 0;
      store.triggerFountainHazard(undefined, [pos.x, pos.y, pos.z]);
      return;
    }

    // 3. Recessed Cup capture & realistic high-speed lip-out check
    const cupPos = activePlan.cup.position;
    const cupRadius = activePlan.cup.cupRadius;
    const cupDepth = activePlan.cup.cupDepth;
    const dxCup = pos.x - cupPos[0];
    const dzCup = pos.z - cupPos[2];
    const distToCupXZ = Math.hypot(dxCup, dzCup);
    const horizSpeed = Math.hypot(vx, vz);

    if (
      distToCupXZ <= cupRadius &&
      pos.y <= cupPos[1] + BALL_RADIUS + 0.14 &&
      pos.y >= cupPos[1] - Math.max(0.22, cupDepth)
    ) {
      const genuinelyDroppedInWell =
        pos.y <= cupPos[1] + 0.085 && horizSpeed <= 4.35 && Math.abs(vy) <= 2.4;
      const slowEdgeDrop =
        distToCupXZ <= cupRadius * 0.72 &&
        horizSpeed < 1.25 &&
        pos.y <= cupPos[1] + BALL_RADIUS + 0.03;

      if (lipOutCooldownRef.current <= 0 && (genuinelyDroppedInWell || slowEdgeDrop)) {
        const capturedPos: Vec3Tuple = [pos.x, pos.y, pos.z];
        // Seat holed ball inside the cup pocket along entry vector cleanly clear of <=0.020m center pin & liner wall
        const entryLen = Math.hypot(dxCup, dzCup);
        let radDirX = entryLen > 1e-4 ? dxCup / entryLen : -vx;
        let radDirZ = entryLen > 1e-4 ? dzCup / entryLen : -vz;
        const radDirLen = Math.hypot(radDirX, radDirZ);
        if (radDirLen > 1e-4) {
          radDirX /= radDirLen;
          radDirZ /= radDirLen;
        } else {
          radDirX = -1;
          radDirZ = 0;
        }
        const seatOffset =
          cupRadius >= 0.405
            ? 0.205
            : Math.max(0.185, cupRadius - BALL_RADIUS - 0.015);
        const seatDrop =
          cupDepth >= 0.35 ? 0.2 : Math.min(0.08, cupDepth * 0.55);
        // Rotate ~0.85 rad (~49°) off entry axis so holed ball sits clearly beside 2D pin shaft silhouette
        const pocketRot = 0.85;
        const pocketCos = Math.cos(pocketRot);
        const pocketSin = Math.sin(pocketRot);
        const pocketDirX = radDirX * pocketCos - radDirZ * pocketSin;
        const pocketDirZ = radDirX * pocketSin + radDirZ * pocketCos;
        const cuppedPos: Vec3Tuple = [
          cupPos[0] + pocketDirX * seatOffset,
          cupPos[1] - seatDrop,
          cupPos[2] + pocketDirZ * seatOffset,
        ];
        // Decouple physics so cupBottomCollider cannot fight resting well depth
        lockBodyAtRest(rb, cuppedPos[0], cuppedPos[1], cuppedPos[2]);
        rb.setEnabled(false);
        if (!isQaFreezeActive()) {
          cupDropTweenRef.current = {
            from: capturedPos,
            to: cuppedPos,
            elapsed: 0,
            duration: CUP_DROP_TWEEN_SECONDS,
          };
          syncVisualTransform(capturedPos[0], capturedPos[1], capturedPos[2]);
        } else {
          cupDropTweenRef.current = null;
          syncVisualTransform(cuppedPos[0], cuppedPos[1], cuppedPos[2]);
        }
        store.sinkHole();
        return;
      } else if (
        lipOutCooldownRef.current <= 0 &&
        horizSpeed > 4.35 &&
        pos.y > cupPos[1] + 0.06
      ) {
        lipOutCooldownRef.current = 0.35;
        // Grazing fast putt skips/deflects across cup lip instead of teleporting down
        const rimAngle = (dxCup * vz - dzCup * vx >= 0 ? 1 : -1) * 0.55;
        const ca = Math.cos(rimAngle);
        const sa = Math.sin(rimAngle);
        const rx = (vx * ca - vz * sa) * 0.72;
        const rz = (vx * sa + vz * ca) * 0.72;
        vx = rx;
        vz = rz;
        vy = Math.max(vy, 0.85);
        rb.setLinvel({ x: vx, y: vy, z: vz }, true);
        soundEngine.play('cup_rattle', {
          impactSpeed: horizSpeed,
          surfaceKey: 'cup-rim',
        });
      }
    }

    // 4. Subway Steam Grate & Stage 2 Hillside / Rooftop / Subway Reactive Zones
    const currentShotSeq = store.pendingShot?.seq ?? 0;
    const classicSteamProp =
      activePlan.courseId === 'classic'
        ? activePlan.props.find((p) => p.id === 'steam-grate-corner')
        : undefined;
    const steamMeta = classicSteamProp?.steamLiftMeta;
    if (
      steamMeta &&
      steamCooldownRef.current <= 0 &&
      lastSteamPopShotSeqRef.current !== currentShotSeq &&
      vx > 0.8 &&
      pos.x >= 12.15 &&
      isPointInSteamBay(pos.x, pos.y, pos.z, activePlan)
    ) {
      const cycle = steamMeta.cycleSeconds || 3.2;
      const activeWindow = steamMeta.activeSeconds || 1.6;
      const sharedSteamTime = resolveAnimTime(clock.elapsedTime);
      const elapsedSteamActive = sharedSteamTime % cycle < activeWindow;
      const steamActive =
        store.forceSteamActive !== null
          ? store.forceSteamActive
          : elapsedSteamActive;

      if (steamActive) {
        const entrySpeed = Math.hypot(vx, vy, vz);
        steamCooldownRef.current = 1.25;
        lastSteamPopShotSeqRef.current = currentShotSeq;
        steamPopCheckPendingRef.current = true;
        const steamClubId = store.lastShot?.clubId ?? selectedClub;
        const steamProfile = getClubProfile(steamClubId);
        // Equalize vertical loft for zero-lift putters vs low-lift skimmers while scaling forward carry cleanly with entry vx
        const liftCompVy = steamProfile.liftCoeff <= 0.005 ? 0.88 : 0.0;
        vx = THREE.MathUtils.clamp(6.32 + vx * 0.018, 6.34, 6.74);
        vy = 14.42 + liftCompVy;
        vz = vz * 0.82;
        rb.setLinvel({ x: vx, y: vy, z: vz }, true);
        rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
        soundEngine.playSteamPop({
          impactSpeed: entrySpeed,
          surfaceKey: 'steam-grate-corner',
        });
        store.recordPropHit('steam-grate-corner', 'Subway Steam Pop!');
      }
    }

    // Apply firm front-fringe landing check after a classic Steam Grate pop so the ball holds for a skill putt
    if (
      activePlan.courseId === 'classic' &&
      steamPopCheckPendingRef.current &&
      pos.x >= 21.65 &&
      pos.y <=
        getMasterPlanGroundElevationAt(pos.x, pos.z, activePlan) +
          BALL_RADIUS +
          0.16
    ) {
      steamPopCheckPendingRef.current = false;
      vx *= 0.08;
      vy = Math.min(vy, 0.2);
      vz *= 0.08;
      rb.setLinvel({ x: vx, y: vy, z: vz }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    // Stage 2 Grand Escapade multi-zone reactive triggers
    if (activePlan.courseId !== 'classic') {
      const sharedTime = resolveAnimTime(clock.elapsedTime);
      for (const prop of activePlan.props) {
        if (
          prop.escapadePropType === 'brass_turnstile_gate' &&
          turnstileCooldownRef.current <= 0 &&
          Math.abs(pos.z - prop.position[2]) <= 0.65 &&
          Math.abs(pos.x - prop.position[0]) <= 1.55 &&
          Math.abs(pos.y - (prop.groundY + BALL_RADIUS)) <= 0.65
        ) {
          turnstileCooldownRef.current = 1.1;
          soundEngine.play('turnstile_click', {
            impactSpeed: Math.hypot(vx, vy, vz),
            surfaceKey: prop.id,
          });
          store.recordPropHit(prop.id, 'Turnstile Spin!');
          continue;
        }
        const reactive = prop.reactive;
        if (!reactive) continue;

        if (
          reactive.kind === 'hydrant_water_jet' &&
          hydrantJetCooldownRef.current <= 0 &&
          isPointInReactiveZone(
            [pos.x, pos.y, pos.z],
            reactive.zoneCenter,
            reactive.zoneHalfExtents,
            reactive.zoneRadius,
            0.22,
          )
        ) {
          hydrantJetCooldownRef.current = 1.15;
          const bv = reactive.boostVelocity ?? [0, 3.2, -11.5];
          vx = bv[0] !== 0 ? bv[0] : vx * 0.65;
          vy = Math.max(vy, bv[1]);
          vz = bv[2] !== 0 ? bv[2] : vz * 0.65;
          rb.setLinvel({ x: vx, y: vy, z: vz }, true);
          soundEngine.playGutterBoost({
            impactSpeed: Math.hypot(vx, vy, vz),
            surfaceKey: prop.id,
          });
          store.recordPropHit(prop.id, 'Hydrant Jet Boost!');
        } else if (
          reactive.kind === 'steam_updraft' &&
          steamCooldownRef.current <= 0 &&
          isPointInReactiveZone(
            [pos.x, pos.y, pos.z],
            reactive.zoneCenter,
            reactive.zoneHalfExtents,
            reactive.zoneRadius,
            0.22,
          )
        ) {
          const cycle =
            reactive.cycleSeconds ?? prop.steamLiftMeta?.cycleSeconds ?? 4.0;
          const activeWin =
            reactive.dutyCycle !== undefined
              ? cycle * reactive.dutyCycle
              : (prop.steamLiftMeta?.activeSeconds ?? 2.6);
          const isSteamOn =
            store.forceSteamActive !== null
              ? store.forceSteamActive
              : sharedTime % cycle < activeWin;
          if (isSteamOn) {
            steamCooldownRef.current = 1.15;
            const bv = reactive.boostVelocity ?? [0, 8.2, -9.2];
            vx = vx * 0.45 + bv[0];
            vy = Math.max(vy, bv[1]);
            vz = vz * 0.45 + bv[2];
            rb.setLinvel({ x: vx, y: vy, z: vz }, true);
            soundEngine.playSteamPop({
              impactSpeed: Math.hypot(vx, vy, vz),
              surfaceKey: prop.id,
            });
            store.recordPropHit(prop.id, 'Terrace Steam Boost!');
          }
        } else if (
          reactive.kind === 'hvac_updraft_boost' &&
          hvacCooldownRef.current <= 0 &&
          isPointInReactiveZone(
            [pos.x, pos.y, pos.z],
            reactive.zoneCenter,
            reactive.zoneHalfExtents,
            reactive.zoneRadius,
            0.35,
          )
        ) {
          hvacCooldownRef.current = 1.05;
          const bv = reactive.boostVelocity ?? [7.8, 6.8, 0.0];
          vx = Math.max(vx, bv[0]);
          vy = Math.max(vy, bv[1]);
          vz = vz * 0.55 + bv[2];
          rb.setLinvel({ x: vx, y: vy, z: vz }, true);
          soundEngine.play('hvac_updraft_hum', {
            impactSpeed: Math.hypot(vx, vy, vz),
            surfaceKey: prop.id,
          });
          store.recordPropHit(prop.id, 'HVAC Rooftop Updraft!');
        } else if (
          reactive.kind === 'bell_tower_chime' &&
          bellCooldownRef.current <= 0 &&
          isPointInReactiveZone(
            [pos.x, pos.y, pos.z],
            reactive.zoneCenter,
            reactive.zoneHalfExtents,
            reactive.zoneRadius,
            0.45,
          )
        ) {
          bellCooldownRef.current = 1.4;
          soundEngine.play('bell_tower_chime', {
            impactSpeed: Math.hypot(vx, vy, vz),
            surfaceKey: prop.id,
          });
          store.recordPropHit(prop.id, 'Conservatory Bell Chime!');
        } else if (
          reactive.kind === 'stairwell_brass_slide' &&
          stairwellSlideCooldownRef.current <= 0 &&
          vz > 0.45 &&
          isPointInReactiveZone(
            [pos.x, pos.y, pos.z],
            reactive.zoneCenter,
            reactive.zoneHalfExtents,
            reactive.zoneRadius,
            0.25,
          )
        ) {
          stairwellSlideCooldownRef.current = 1.6;
          vz = Math.max(vz, 6.8);
          rb.setLinvel({ x: vx * 0.65, y: vy, z: vz }, true);
          soundEngine.play('subway_stair_slide', {
            impactSpeed: Math.hypot(vx, vy, vz),
            surfaceKey: prop.id,
          });
          store.recordPropHit(prop.id, 'Subway Brass Slide!');
        } else if (
          reactive.kind === 'subway_car_tunnel' &&
          subwayCarCooldownRef.current <= 0 &&
          Math.abs(pos.x - 34.0) <= 0.95 &&
          pos.z >= 88.5 &&
          pos.z <= 104.5 &&
          pos.y <= -5.8
        ) {
          subwayCarCooldownRef.current = 1.8;
          if (vz > 0.35 && vz < 5.2) {
            vz = Math.min(5.2, vz + 1.25);
            rb.setLinvel({ x: vx * 0.75, y: vy, z: vz }, true);
          }
          soundEngine.play('subway_train_chime', {
            impactSpeed: Math.hypot(vx, vy, vz),
            surfaceKey: prop.id,
          });
          store.recordPropHit(prop.id, 'Through the IRT Subway Car!');
        }
      }
    }

    // 5. Delivery Van ramp climb & roof launch
    const vanProp = activePlan.props.find((p) => Boolean(p.vanRampMeta));
    const vanMeta = vanProp?.vanRampMeta;
    const kickerBounds = vanMeta?.roofAccessKickerSpec?.boundsXZ;
    const vanReactive = vanProp?.reactive;
    if (vanMeta) {
      // Smoothly assist upward momentum along the interior roof-access kicker (1.08m -> 2.24m)
      if (
        vanKickerCooldownRef.current <= 0 &&
        kickerBounds &&
        pos.x >= kickerBounds.minX - 0.12 &&
        pos.x <= kickerBounds.maxX + 0.12 &&
        pos.z >= kickerBounds.minZ - 0.15 &&
        pos.z <= kickerBounds.maxZ + 0.15 &&
        pos.y >= 0.85 &&
        pos.y <= vanMeta.roofDeckTopY + 0.15 &&
        vz < -1.8
      ) {
        vanKickerCooldownRef.current = 0.65;
        vy = Math.max(vy, 4.9);
        vz = Math.min(vz, -7.8);
        rb.setLinvel({ x: vx, y: vy, z: vz }, true);
      }

      // Roof deck forward launch strictly within reactive launch zone
      if (vanLaunchCooldownRef.current <= 0 && vanReactive?.zoneHalfExtents) {
        const [zcx, zcy, zcz] = vanReactive.zoneCenter;
        const [hx, hy, hz] = vanReactive.zoneHalfExtents;
        if (
          Math.abs(pos.x - zcx) <= hx &&
          Math.abs(pos.y - zcy) <= hy + 0.45 &&
          Math.abs(pos.z - zcz) <= hz
        ) {
          const entrySpeed = Math.hypot(vx, vy, vz);
          vanLaunchCooldownRef.current = 0.9;
          const boost = vanReactive.boostVelocity ?? [-0.8, 5.6, -13.4];
          vx = boost[0];
          vy = boost[1];
          vz = boost[2];
          rb.setLinvel({ x: vx, y: vy, z: vz }, true);
          soundEngine.playGutterBoost({
            impactSpeed: entrySpeed,
            surfaceKey: vanProp?.id ?? 'delivery-van-east',
          });
          store.recordPropHit(
            vanProp?.id ?? 'delivery-van-east',
            'Van Roof Launch!',
          );
        }
      }
    }

    // 6. Hydrant-fed Storm Gutter stream boost & channel guide across classic & Stage 2 Belvedere Turn
    const gutterEval = evaluateMasterPlanGutterAtPoint(
      pos.x,
      pos.y,
      pos.z,
      vx,
      vz,
      activePlan,
    );
    if (gutterEval.inGutter) {
      const steerBlend = gutterEval.isCurvedCorner
        ? Math.min(0.45, dt * 18.0)
        : Math.min(0.18, dt * 4.5);
      vx += (gutterEval.pullVelocityXZ[0] - vx) * steerBlend;
      vz += (gutterEval.pullVelocityXZ[1] - vz) * steerBlend;

      if (
        gutterEval.inCornerBoostZone &&
        gutterEntryShotSeqRef.current !== currentShotSeq
      ) {
        gutterEntryShotSeqRef.current = currentShotSeq;
        gutterBoostCooldownRef.current = 1.1;
        if (
          activePlan.courseId !== 'classic' &&
          gutterEval.boostVelocity
        ) {
          const bv = gutterEval.boostVelocity;
          if (gutterEval.gutterId === 'gutter-z2-belvedere-turn-boost') {
            vx = Math.max(vx, bv[0]);
            vy = Math.max(vy, bv[1]);
            vz = vz * 0.12 + bv[2];
          } else {
            vx = bv[0] !== 0 ? bv[0] : vx * 0.72;
            vy = Math.max(vy, bv[1]);
            vz = bv[2] !== 0 ? Math.min(vz, bv[2]) : vz * 0.72;
          }
        }
        soundEngine.playGutterBoost({
          impactSpeed: Math.hypot(vx, vy, vz),
          surfaceKey: gutterEval.gutterId ?? 'hydrant-corner-se',
        });
        store.recordPropHit(
          gutterEval.gutterId ?? 'hydrant-corner-se',
          gutterEval.gutterId === 'gutter-z2-belvedere-turn-boost'
            ? 'Water-Main Turn Boost!'
            : 'Storm Gutter Boost!',
        );
      }
      rb.setLinvel({ x: vx, y: vy, z: vz }, true);
    }

    // 7. Bistro Umbrella canopy trampolines & Plaza Pigeon scatter (matched by prop.type)
    if (umbrellaCooldownRef.current <= 0 && vy < 0) {
      for (const umbrella of activePlan.props) {
        if (umbrella.type !== 'bistro_umbrella_set') continue;
        const ux = pos.x - umbrella.position[0];
        const uz = pos.z - umbrella.position[2];
        const uDistXZ = Math.hypot(ux, uz);
        const canopyY = umbrella.position[1] + 2.25;
        if (
          uDistXZ <= 1.35 &&
          pos.y >= umbrella.position[1] + 1.85 &&
          pos.y <= canopyY + 1.05
        ) {
          const entrySpeed = Math.hypot(vx, vy, vz);
          umbrellaCooldownRef.current = 0.5;
          const bounced = computeDeterministicUmbrellaBounce(
            [pos.x, pos.y, pos.z],
            [vx, vy, vz],
            [umbrella.position[0], canopyY, umbrella.position[2]],
            1.25,
            0.58,
          );
          vx = bounced[0];
          vy = bounced[1];
          vz = bounced[2];
          rb.setLinvel({ x: vx, y: vy, z: vz }, true);
          soundEngine.playAwningCushion({
            impactSpeed: entrySpeed,
            surfaceKey: umbrella.id,
          });
          store.recordPropHit(umbrella.id, 'Umbrella Bounce!');
          break;
        }
      }
    }

    if (pigeonCooldownRef.current <= 0) {
      for (const flock of activePlan.props) {
        if (flock.type !== 'pigeon_flock') continue;
        const dPigeon = Math.hypot(
          pos.x - flock.position[0],
          pos.z - flock.position[2],
        );
        if (
          dPigeon <= 2.4 &&
          Math.abs(pos.y - flock.position[1]) <= 1.5 &&
          horizSpeed > 1.0
        ) {
          pigeonCooldownRef.current = 3.5;
          soundEngine.playPigeonScatter({
            impactSpeed: horizSpeed,
            surfaceKey: flock.id,
          });
          store.recordPropHit(flock.id);
          break;
        }
      }
    }

    // 8. Shared Aerodynamics (lift + air drag + surface-aware roll damping)
    const groundY = getMasterPlanGroundElevationAt(pos.x, pos.z, activePlan);
    const vanSupportY = getVanSupportElevationForPlan(pos.x, pos.z, activePlan);
    const expectedSupportY =
      vanSupportY !== null && Math.abs(pos.y - BALL_RADIUS - vanSupportY) < 0.35
        ? Math.max(groundY, vanSupportY)
        : groundY;
    const surfaceTag = getMasterPlanSurfaceTagAt(pos.x, pos.z, activePlan);
    const airborne =
      pos.y > expectedSupportY + BALL_RADIUS + 0.05 || vy > 0.45;
    const clubId = store.lastShot?.clubId ?? selectedClub;
    const profile = getClubProfile(clubId);

    const nextV = stepBallAerodynamics({
      velocity: [vx, vy, vz],
      airborne,
      surfaceTag: gutterEval.inGutter ? 'storm_gutter' : surfaceTag,
      profile,
      dt,
      gravityY: WORLD_GRAVITY_Y,
      applyGravity: false,
    });
    vx = nextV[0];
    vy = nextV[1];
    vz = nextV[2];

    // Smooth final rolling arrest so exponential roll damping doesn't creep on flat ground or elevated props
    const isPhysicallySupported = pos.y <= expectedSupportY + BALL_RADIUS + 0.08;
    const isVerticallySettled = Math.abs(vy) < 0.08 && !airborne;
    if ((isPhysicallySupported || isVerticallySettled) && !airborne && !gutterEval.inCornerBoostZone) {
      const hSpeed = Math.hypot(vx, vz);
      if (hSpeed > 0 && hSpeed < COULOMB_CREEP_STOP_SPEED_MPS) {
        const drop = Math.min(hSpeed, COULOMB_CREEP_DECEL_MPS2 * dt);
        const factor = (hSpeed - drop) / hSpeed;
        vx *= factor;
        vz *= factor;
      }
    }

    rb.setLinvel({ x: vx, y: vy, z: vz }, true);
    prevVelRef.current = [vx, vy, vz];

    // Update live HUD distance / lie telemetry at ~9Hz while flying/rolling
    telemetryAccumRef.current += dt;
    if (telemetryAccumRef.current >= 0.11) {
      telemetryAccumRef.current = 0;
      store.updateBallTelemetry([pos.x, pos.y, pos.z], surfaceTag);
    }

    // 9. Strict grounded & obstacle-top rest-hysteresis clamp (linearSpeed < threshold for 0.16s)
    const linearSpeed = Math.hypot(vx, vy, vz);
    const hasSupportForRest = isPhysicallySupported || Math.abs(vy) < 0.08;
    if (
      flightElapsedRef.current > 0.25 &&
      hasSupportForRest &&
      linearSpeed < REST_SPEED_THRESHOLD_MPS &&
      !gutterEval.inCornerBoostZone
    ) {
      lowSpeedTimeRef.current += dt;
    } else {
      lowSpeedTimeRef.current = 0;
    }

    const canTriggerTimeoutRest =
      flightElapsedRef.current >= 12.0 &&
      (isPhysicallySupported || Math.abs(vy) < 0.25);

    if (
      (hasSupportForRest && lowSpeedTimeRef.current >= REST_HYSTERESIS_SECONDS) ||
      canTriggerTimeoutRest
    ) {
      // Preserve true elevation atop benches/planters/cab while preventing upward pop on mapped ground
      const restY = isPhysicallySupported
        ? Math.max(expectedSupportY + BALL_RADIUS - 0.002, pos.y)
        : pos.y;
      lowSpeedTimeRef.current = 0;
      lockBodyAtRest(rb, pos.x, restY, pos.z);
      store.markBallResting([pos.x, restY, pos.z]);
    }
  });

  // Visual frame loop: advance Fountain Drop parabolic arc, sync interpolated ball & contact shadow
  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const rb = bodyRef.current;
    const store = useCurbsideStore.getState();

    // Brisk < 0.6s parabolic Fountain Drop arc animation
    if (store.shotPhase === 'fountain_drop' && store.pendingFountainDrop && rb) {
      const drop = store.pendingFountainDrop;
      if (lastFountainDropSeqRef.current !== drop.seq) {
        lastFountainDropSeqRef.current = drop.seq;
        fountainDropElapsedRef.current = 0;
      }
      fountainDropElapsedRef.current += dt;
      const duration = Math.min(0.58, Math.max(0.25, drop.durationSec));
      const progress = Math.min(1, fountainDropElapsedRef.current / duration);
      const [ax, ay, az] = sampleFountainDropArcPoint(
        drop.from,
        drop.to,
        progress,
        0.92,
      );
      lockBodyAtRest(rb, ax, ay, az);
      if (progress >= 1) {
        lockBodyAtRest(rb, drop.to[0], drop.to[1], drop.to[2]);
        store.completeFountainDrop(drop.seq);
      }
    }

    // Smooth 150ms visual drop tween from cup-edge capture into cup well in world space
    const dropTween = cupDropTweenRef.current;
    if (dropTween) {
      if (isQaFreezeActive() || store.shotPhase !== 'holed_out') {
        cupDropTweenRef.current = null;
        if (store.shotPhase === 'holed_out') {
          syncVisualTransform(dropTween.to[0], dropTween.to[1], dropTween.to[2]);
        } else if (localBallMeshRef.current) {
          localBallMeshRef.current.position.set(0, 0, 0);
          localBallMeshRef.current.updateMatrixWorld(true);
        }
      } else {
        dropTween.elapsed += dt;
        const t = Math.min(1, dropTween.elapsed / dropTween.duration);
        const xzEase = 1 - Math.pow(1 - t, 2.2);
        const yEase = Math.pow(t, 1.35);
        const wx = THREE.MathUtils.lerp(dropTween.from[0], dropTween.to[0], xzEase);
        const wy = THREE.MathUtils.lerp(dropTween.from[1], dropTween.to[1], yEase);
        const wz = THREE.MathUtils.lerp(dropTween.from[2], dropTween.to[2], xzEase);
        syncVisualTransform(wx, wy, wz);
        if (t >= 1) {
          cupDropTweenRef.current = null;
          syncVisualTransform(dropTween.to[0], dropTween.to[1], dropTween.to[2]);
        }
      }
    }

    // Refresh RigidBody group matrixWorld after priority -1 Rapier interpolation before reading worldVec
    const worldVec = scratchWorldVecRef.current;
    if (localBallMeshRef.current) {
      if (localBallMeshRef.current.parent) {
        localBallMeshRef.current.parent.updateMatrixWorld(true);
      } else {
        localBallMeshRef.current.updateMatrixWorld(true);
      }
      localBallMeshRef.current.getWorldPosition(worldVec);
    } else if (rb) {
      const t = rb.translation();
      worldVec.set(t.x, t.y, t.z);
    } else {
      worldVec.set(...store.ballPosition);
    }

    if (ballWorldPositionRef) {
      ballWorldPositionRef.current.copy(worldVec);
    }

    if (shadowRef.current) {
      const activePlan = store.activePlan;
      const cupPos = activePlan.cup.position;
      const cupRadius = activePlan.cup.cupRadius;
      const distToCupXZ = Math.hypot(
        worldVec.x - cupPos[0],
        worldVec.z - cupPos[2],
      );
      const hideShadowInCup =
        store.shotPhase === 'holed_out' ||
        (distToCupXZ < cupRadius - 0.04 &&
          worldVec.y < cupPos[1] + BALL_RADIUS - 0.03);

      if (hideShadowInCup) {
        shadowRef.current.visible = false;
      } else {
        shadowRef.current.visible = true;
        const ballBottomY = worldVec.y - BALL_RADIUS;
        const sampleSurf = (sx: number, sz: number): number => {
          const sg = getMasterPlanGroundElevationAt(sx, sz, activePlan);
          const sv = getVanSupportElevationForPlan(sx, sz, activePlan);
          return sv !== null && ballBottomY >= sv - 0.12 ? Math.max(sg, sv) : sg;
        };
        const gY = sampleSurf(worldVec.x, worldVec.z);
        const eps = 0.14;
        const slopeX =
          (sampleSurf(worldVec.x + eps, worldVec.z) -
            sampleSurf(worldVec.x - eps, worldVec.z)) /
          (2 * eps);
        const slopeZ =
          (sampleSurf(worldVec.x, worldVec.z + eps) -
            sampleSurf(worldVec.x, worldVec.z - eps)) /
          (2 * eps);
        const slopeMag = Math.hypot(slopeX, slopeZ);
        const heightAbove = Math.max(0, ballBottomY - gY);
        const scale = Math.max(0.45, 1.0 - heightAbove * 0.08);
        // 0.022m clears raised green/curbs/decals; extra gradient margin avoids uphill ramp clipping
        const clearance = 0.022 + Math.min(0.018, slopeMag * 0.025);
        shadowRef.current.position.set(worldVec.x, gY + clearance, worldVec.z);
        if (slopeMag > 0.02 && slopeMag < 0.48) {
          const normal = scratchShadowNormalRef.current
            .set(-slopeX, 1, -slopeZ)
            .normalize();
          shadowRef.current.quaternion.setFromUnitVectors(
            scratchDefaultUpRef.current,
            normal,
          );
        } else {
          shadowRef.current.rotation.set(-Math.PI / 2, 0, 0);
        }
        shadowRef.current.scale.set(scale, scale, 1);
        const mat = shadowRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0.12, 0.34 - heightAbove * 0.035);
      }
    }
  });

  const isMoving =
    shotPhase === 'ball_in_flight' || shotPhase === 'settling';

  return (
    <>
      <RigidBody
        ref={bodyRef}
        type="dynamic"
        gravityScale={1}
        ccd={true}
        colliders={false}
        canSleep={true}
        position={initialPos}
        mass={1}
        linearDamping={0.01}
        angularDamping={0.45}
        friction={0.06}
        restitution={0.26}
        onCollisionEnter={handleCollisionEnter}
      >
        <BallCollider
          args={[BALL_RADIUS]}
          friction={0.06}
          restitution={0.26}
          contactSkin={0.002}
        />
        <mesh ref={assignBallMeshRef} castShadow={false} receiveShadow>
          <sphereGeometry args={[BALL_RADIUS, 32, 32]} />
          <meshStandardMaterial
            color="#FFFFFF"
            roughness={0.32}
            metalness={0.04}
            bumpMap={dimpleTexture ?? undefined}
            bumpScale={0.008}
            emissive="#FFFDF5"
            emissiveIntensity={isMoving ? 0.08 : 0.04}
          />
        </mesh>
      </RigidBody>

      {/* Soft contact ground shadow beneath ball for instant elevation readability */}
      <mesh
        ref={shadowRef}
        position={[initialPos[0], initialPos[1] - BALL_RADIUS + 0.022, initialPos[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[BALL_RADIUS * 1.15, 24]} />
        <meshBasicMaterial
          color="#1E293B"
          transparent
          opacity={0.32}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </mesh>
    </>
  );
}
