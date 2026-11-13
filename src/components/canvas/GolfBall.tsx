'use client';

import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  BallCollider,
  RigidBody,
  type CollisionEnterPayload,
  type RapierRigidBody,
} from '@react-three/rapier';
import {
  BALL_RADIUS,
  CUP_RADIUS,
  WORLD_GRAVITY_Y,
  type Vec3Tuple,
} from '@/types';
import {
  COURSE_MASTER_PLAN,
  COURSE_PROPS,
  HOLE_1_CUP,
  getMasterPlanGroundElevationAt,
  getMasterPlanSurfaceTagAt,
  getVanRampOrRoofElevationAt,
} from '@/config/courseMasterPlan';
import { computeAwningBounceVelocity } from '@/lib/geometryHelpers';
import { stepBallAerodynamics } from '@/lib/aerodynamics';
import { getClubProfile } from '@/lib/clubs';
import {
  computeDeterministicUmbrellaBounce,
  createBallDimpleTexture,
  evaluateMasterPlanGutterAtPoint,
  isPointInFountainBasin,
  isPointInSteamBay,
} from '@/physics';
import { soundEngine } from '@/lib/sound';
import { useCurbsideStore } from '@/store';

export interface GolfBallProps {
  ballWorldPositionRef?: MutableRefObject<THREE.Vector3>;
}

export function GolfBall({ ballWorldPositionRef }: GolfBallProps = {}) {
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const shadowRef = useRef<THREE.Mesh | null>(null);

  const lastShotSeqRef = useRef(0);
  const lastTeleportSeqRef = useRef(0);
  const lastSteamPopShotSeqRef = useRef(-1);
  const steamPopCheckPendingRef = useRef(false);
  const gutterEntryShotSeqRef = useRef(-1);
  const flightElapsedRef = useRef(0);
  const lowSpeedTimeRef = useRef(0);
  const prevVelRef = useRef<Vec3Tuple>([0, 0, 0]);
  const telemetryAccumRef = useRef(0);

  // Per-shot / cooldown guards for reactive props
  const awningCooldownRef = useRef(0);
  const vanKickerCooldownRef = useRef(0);
  const vanLaunchCooldownRef = useRef(0);
  const gutterBoostCooldownRef = useRef(0);
  const steamCooldownRef = useRef(0);
  const umbrellaCooldownRef = useRef(0);
  const pigeonCooldownRef = useRef(0);
  const lipOutCooldownRef = useRef(0);
  const curbAudioCooldownRef = useRef(0);

  const shotPhase = useCurbsideStore((s) => s.shotPhase);
  const pendingShot = useCurbsideStore((s) => s.pendingShot);
  const pendingTeleport = useCurbsideStore((s) => s.pendingTeleport);
  const selectedClub = useCurbsideStore((s) => s.selectedClub);

  const dimpleTexture = useMemo(() => createBallDimpleTexture(), []);

  useEffect(() => {
    return () => {
      dimpleTexture?.dispose();
    };
  }, [dimpleTexture]);

  const initialPos = useMemo<Vec3Tuple>(
    () => [
      COURSE_MASTER_PLAN.teePosition[0],
      COURSE_MASTER_PLAN.teePosition[1] + BALL_RADIUS,
      COURSE_MASTER_PLAN.teePosition[2],
    ],
    [],
  );

  // Sync teleport requests (Reset Hole, Fountain Hazard Drop, QA Debug Teleport)
  useEffect(() => {
    if (!pendingTeleport || pendingTeleport.seq === lastTeleportSeqRef.current) {
      return;
    }
    lastTeleportSeqRef.current = pendingTeleport.seq;
    const rb = bodyRef.current;
    if (!rb) return;
    const [x, y, z] = pendingTeleport.position;
    rb.setTranslation({ x, y, z }, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    prevVelRef.current = [0, 0, 0];
    flightElapsedRef.current = 0;
    lowSpeedTimeRef.current = 0;
    lastSteamPopShotSeqRef.current = -1;
    steamPopCheckPendingRef.current = false;
    gutterEntryShotSeqRef.current = -1;
    useCurbsideStore.getState().consumeBallReset();
  }, [pendingTeleport]);

  // Sync shot launches (Pull-and-Flick release or window.__CURBSIDE_DEBUG__.fireShot)
  useEffect(() => {
    if (!pendingShot || pendingShot.seq === lastShotSeqRef.current) {
      return;
    }
    lastShotSeqRef.current = pendingShot.seq;
    const rb = bodyRef.current;
    if (!rb) return;
    const [vx, vy, vz] = pendingShot.launchVelocity;
    const pos = rb.translation();
    const groundY = getMasterPlanGroundElevationAt(pos.x, pos.z);
    if (pos.y < groundY + BALL_RADIUS) {
      rb.setTranslation(
        { x: pos.x, y: groundY + BALL_RADIUS + 0.004, z: pos.z },
        true,
      );
    }
    rb.setLinvel({ x: vx, y: vy, z: vz }, true);
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    prevVelRef.current = [vx, vy, vz];
    flightElapsedRef.current = 0;
    lowSpeedTimeRef.current = 0;
    steamPopCheckPendingRef.current = false;
  }, [pendingShot]);

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

    if (propId === 'hotdog-cart-awning' && awningCooldownRef.current <= 0) {
      const awningMeta = COURSE_PROPS.find(
        (p) => p.id === 'hotdog-cart-corner',
      )?.hotdogAwningMeta;
      if (awningMeta) {
        awningCooldownRef.current = 0.4;
        const preV = prevVelRef.current;
        const bounced = computeAwningBounceVelocity(
          preV,
          awningMeta.worldNormal,
          awningMeta.restitution,
        );
        rb.setLinvel(
          { x: bounced[0], y: bounced[1], z: bounced[2] },
          true,
        );
        soundEngine.playAwningCushion(0.95);
        state.recordPropHit('hotdog-cart-corner', 'Awning Cushion!');
        return;
      }
    }

    if (propId === 'tree-overhang-east' && curbAudioCooldownRef.current <= 0) {
      curbAudioCooldownRef.current = 0.25;
      const curV = rb.linvel();
      rb.setLinvel(
        { x: curV.x * 0.55, y: Math.min(curV.y, -1.2), z: curV.z * 0.55 },
        true,
      );
      soundEngine.playCurbBank(0.55);
      return;
    }

    // Play curb/wall clack when impacting hard horizontally
    if (curbAudioCooldownRef.current <= 0) {
      const preV = prevVelRef.current;
      const postV = rb.linvel();
      const dvx = postV.x - preV[0];
      const dvz = postV.z - preV[2];
      const horizDelta = Math.hypot(dvx, dvz);
      if (horizDelta > 2.1) {
        curbAudioCooldownRef.current = 0.18;
        soundEngine.playCurbBank(Math.min(1, horizDelta / 12));
      }
    }
  }, []);

  useFrame((rootState, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
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

    const store = useCurbsideStore.getState();
    const pos = rb.translation();
    const vel = rb.linvel();
    if (ballWorldPositionRef) {
      ballWorldPositionRef.current.set(pos.x, pos.y, pos.z);
    }

    // Update ground contact shadow under the golf ball
    if (shadowRef.current) {
      const gY = getMasterPlanGroundElevationAt(pos.x, pos.z);
      const heightAbove = Math.max(0, pos.y - BALL_RADIUS - gY);
      const scale = Math.max(0.45, 1.0 - heightAbove * 0.08);
      shadowRef.current.position.set(pos.x, gY + 0.012, pos.z);
      shadowRef.current.scale.set(scale, scale, 1);
      const mat = shadowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0.12, 0.34 - heightAbove * 0.035);
    }

    // Keep ball rock-steady at rest (and cleanly nestled in recessed cup well when holed out)
    if (
      store.shotPhase === 'aiming' ||
      store.shotPhase === 'pulling' ||
      store.shotPhase === 'holed_out'
    ) {
      if (store.shotPhase === 'holed_out') {
        const cup = HOLE_1_CUP.position;
        if (Math.abs(pos.y - (cup[1] - 0.08)) > 0.01) {
          rb.setTranslation(
            { x: cup[0], y: cup[1] - 0.08, z: cup[2] },
            true,
          );
        }
      }
      if (
        Math.abs(vel.x) > 0.001 ||
        Math.abs(vel.y) > 0.001 ||
        Math.abs(vel.z) > 0.001
      ) {
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
        rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      prevVelRef.current = [0, 0, 0];
      return;
    }

    if (store.shotPhase !== 'ball_in_flight' && store.shotPhase !== 'settling') {
      return;
    }

    flightElapsedRef.current += dt;
    let vx = vel.x;
    let vy = vel.y;
    let vz = vel.z;

    // 1. Out-of-bounds safety recover
    const wb = COURSE_MASTER_PLAN.worldBoundsXZ;
    if (
      pos.y < -3.5 ||
      pos.x < wb.minX - 6 ||
      pos.x > wb.maxX + 6 ||
      pos.z < wb.minZ - 6 ||
      pos.z > wb.maxZ + 6
    ) {
      rb.setTranslation(
        {
          x: store.lastSafeBallPosition[0],
          y: store.lastSafeBallPosition[1],
          z: store.lastSafeBallPosition[2],
        },
        true,
      );
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      store.markBallResting(store.lastSafeBallPosition, { autoSelectClub: false });
      return;
    }

    // 2. Fountain water basin check -> +1 penalty quick-drop
    if (isPointInFountainBasin(pos.x, pos.y, pos.z)) {
      store.triggerFountainHazard();
      return;
    }

    // 3. Hole 1 Cup capture & high-speed lip-out check
    const cupPos = HOLE_1_CUP.position;
    const dxCup = pos.x - cupPos[0];
    const dzCup = pos.z - cupPos[2];
    const distToCupXZ = Math.hypot(dxCup, dzCup);
    const horizSpeed = Math.hypot(vx, vz);

    if (
      distToCupXZ <= CUP_RADIUS &&
      pos.y <= cupPos[1] + BALL_RADIUS + 0.24 &&
      pos.y >= cupPos[1] - 0.15
    ) {
      if (horizSpeed <= 4.35 && vy <= 1.2) {
        rb.setTranslation(
          { x: cupPos[0], y: cupPos[1] - 0.08, z: cupPos[2] },
          true,
        );
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
        rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
        store.sinkHole();
        return;
      } else if (lipOutCooldownRef.current <= 0 && horizSpeed > 4.35) {
        lipOutCooldownRef.current = 0.35;
        // Realistic cup rim lip-out deflection
        const rimAngle = (dxCup * vz - dzCup * vx >= 0 ? 1 : -1) * 0.68;
        const ca = Math.cos(rimAngle);
        const sa = Math.sin(rimAngle);
        const rx = (vx * ca - vz * sa) * 0.65;
        const rz = (vx * sa + vz * ca) * 0.65;
        vx = rx;
        vz = rz;
        vy = Math.max(vy, 0.7);
        rb.setLinvel({ x: vx, y: vy, z: vz }, true);
        soundEngine.play('cup_rattle', { intensity: 0.9 });
      }
    }

    // 4. Subway Steam Grate rhythmic upward pop -> forward +X carry over Fountain onto front green fringe
    const grate = COURSE_PROPS.find((p) => p.id === 'steam-grate-corner');
    const steamMeta = grate?.steamLiftMeta;
    const currentShotSeq = store.pendingShot?.seq ?? 0;
    if (
      steamMeta &&
      steamCooldownRef.current <= 0 &&
      lastSteamPopShotSeqRef.current !== currentShotSeq &&
      vx > 0.8 &&
      pos.x >= 12.15 &&
      isPointInSteamBay(pos.x, pos.y, pos.z)
    ) {
      const cycle = steamMeta.cycleSeconds || 3.2;
      const activeWindow = steamMeta.activeSeconds || 1.6;
      const elapsedSteamActive = rootState.clock.elapsedTime % cycle < activeWindow;
      const steamActive =
        store.forceSteamActive !== null
          ? store.forceSteamActive
          : elapsedSteamActive;

      if (steamActive) {
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
        soundEngine.playSteamPop(1.0);
        store.recordPropHit('steam-grate-corner', 'Subway Steam Pop!');
      }
    }

    // Apply firm front-fringe landing check after a Steam Grate pop so the ball holds for a skill putt
    if (
      steamPopCheckPendingRef.current &&
      pos.x >= 21.65 &&
      pos.y <= getMasterPlanGroundElevationAt(pos.x, pos.z) + BALL_RADIUS + 0.16
    ) {
      steamPopCheckPendingRef.current = false;
      vx *= 0.08;
      vy = Math.min(vy, 0.2);
      vz *= 0.08;
      rb.setLinvel({ x: vx, y: vy, z: vz }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    // 5. Delivery Van ramp climb & roof launch
    const vanProp = COURSE_PROPS.find((p) => p.id === 'delivery-van-east');
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

      // Roof deck forward launch strictly within reactive launch zone (z: [-10.35, -7.35], clear of tree canopy)
      if (vanLaunchCooldownRef.current <= 0 && vanReactive?.zoneHalfExtents) {
        const [zcx, zcy, zcz] = vanReactive.zoneCenter;
        const [hx, hy, hz] = vanReactive.zoneHalfExtents;
        if (
          Math.abs(pos.x - zcx) <= hx &&
          Math.abs(pos.y - zcy) <= hy + 0.45 &&
          Math.abs(pos.z - zcz) <= hz
        ) {
          vanLaunchCooldownRef.current = 0.9;
          const boost = vanReactive.boostVelocity ?? [-0.8, 5.6, -13.4];
          vx = boost[0];
          vy = boost[1];
          vz = boost[2];
          rb.setLinvel({ x: vx, y: vy, z: vz }, true);
          soundEngine.playGutterBoost(0.88);
          store.recordPropHit('delivery-van-east', 'Van Roof Launch!');
        }
      }
    }

    // 6. SE Hydrant-fed Storm Gutter stream boost & channel guide (strictly narrow gutter band, forward-only)
    const gutterEval = evaluateMasterPlanGutterAtPoint(
      pos.x,
      pos.y,
      pos.z,
      vx,
      vz,
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
        soundEngine.playGutterBoost(1.0);
        store.recordPropHit('hydrant-corner-se', 'Storm Gutter Boost!');
      }
      rb.setLinvel({ x: vx, y: vy, z: vz }, true);
    }

    // 7. Bistro Umbrella canopy trampoline & Crosswalk Pigeon scatter
    const umbrella = COURSE_PROPS.find((p) => p.id === 'bistro-umbrella');
    if (umbrella && umbrellaCooldownRef.current <= 0) {
      const ux = pos.x - umbrella.position[0];
      const uz = pos.z - umbrella.position[2];
      const uDistXZ = Math.hypot(ux, uz);
      if (uDistXZ <= 1.25 && pos.y >= 1.9 && pos.y <= 2.9 && vy < 0) {
        umbrellaCooldownRef.current = 0.5;
        const bounced = computeDeterministicUmbrellaBounce(
          [pos.x, pos.y, pos.z],
          [vx, vy, vz],
          [umbrella.position[0], umbrella.position[1] + 2.25, umbrella.position[2]],
          1.25,
          0.58,
        );
        vx = bounced[0];
        vy = bounced[1];
        vz = bounced[2];
        rb.setLinvel({ x: vx, y: vy, z: vz }, true);
        soundEngine.playAwningCushion(0.9);
        store.recordPropHit('bistro-umbrella', 'Umbrella Bounce!');
      }
    }

    const pigeons = COURSE_PROPS.find((p) => p.id === 'pigeons-crosswalk-flock');
    if (pigeons && pigeonCooldownRef.current <= 0) {
      const dPigeon = Math.hypot(
        pos.x - pigeons.position[0],
        pos.z - pigeons.position[2],
      );
      if (dPigeon <= 2.3 && pos.y <= pigeons.position[1] + 1.4 && horizSpeed > 1.0) {
        pigeonCooldownRef.current = 3.5;
        soundEngine.playPigeonScatter(0.8);
        store.recordPropHit('pigeons-crosswalk-flock');
      }
    }

    // 8. Shared Aerodynamics (lift + air drag + surface-aware roll damping)
    const groundY = getMasterPlanGroundElevationAt(pos.x, pos.z);
    const vanSupportY = getVanRampOrRoofElevationAt(pos.x, pos.z);
    const expectedSupportY =
      vanSupportY !== null && Math.abs(pos.y - BALL_RADIUS - vanSupportY) < 0.35
        ? Math.max(groundY, vanSupportY)
        : groundY;
    const surfaceTag = getMasterPlanSurfaceTagAt(pos.x, pos.z);
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
    rb.setLinvel({ x: vx, y: vy, z: vz }, true);

    prevVelRef.current = [vx, vy, vz];

    // Update live HUD distance / lie telemetry at ~9Hz while flying/rolling (zero 60Hz world re-renders)
    telemetryAccumRef.current += dt;
    if (telemetryAccumRef.current >= 0.11) {
      telemetryAccumRef.current = 0;
      store.updateBallTelemetry([pos.x, pos.y, pos.z], surfaceTag);
    }

    // 9. Strict grounded rest detection (never settle in mid-air!)
    const nextHorizSpeed = Math.hypot(vx, vz);
    const isPhysicallySupported = pos.y <= expectedSupportY + BALL_RADIUS + 0.08;
    if (
      flightElapsedRef.current > 0.25 &&
      isPhysicallySupported &&
      nextHorizSpeed < 0.22 &&
      Math.abs(vy) < 0.3 &&
      !gutterEval.inCornerBoostZone
    ) {
      lowSpeedTimeRef.current += dt;
    } else {
      lowSpeedTimeRef.current = 0;
    }

    if (
      isPhysicallySupported &&
      (lowSpeedTimeRef.current >= 0.22 || flightElapsedRef.current >= 12.0)
    ) {
      const restY = Math.max(expectedSupportY + BALL_RADIUS, pos.y);
      rb.setTranslation({ x: pos.x, y: restY, z: pos.z }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      prevVelRef.current = [0, 0, 0];
      lowSpeedTimeRef.current = 0;
      store.markBallResting([pos.x, restY, pos.z]);
    }
  });

  const isMoving =
    shotPhase === 'ball_in_flight' || shotPhase === 'settling';
  const isHoledOut = shotPhase === 'holed_out';
  const isKinematicOrStatic =
    isHoledOut || shotPhase === 'aiming' || shotPhase === 'pulling';

  return (
    <>
      <RigidBody
        ref={bodyRef}
        type="dynamic"
        gravityScale={isKinematicOrStatic ? 0 : 1}
        ccd={true}
        colliders={false}
        canSleep={false}
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
          sensor={isHoledOut}
          friction={0.06}
          restitution={0.26}
        />
        <mesh castShadow receiveShadow>
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
        position={[initialPos[0], COURSE_MASTER_PLAN.teePosition[1] + 0.012, initialPos[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[BALL_RADIUS * 1.15, 24]} />
        <meshBasicMaterial
          color="#1E293B"
          transparent
          opacity={0.32}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}
