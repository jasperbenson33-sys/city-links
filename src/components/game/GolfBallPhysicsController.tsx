'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  BallCollider,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier';
import {
  BALL_RADIUS,
  CLUB_SPECS,
  ELEVATIONS,
  ISLAND_HALF_SIZE,
  type ClubId,
  type GeneratedCityCourse,
  type PlacedProp,
} from '@/types';
import {
  getCourseSurfaceElevationAt,
  isWorldPointInWaterHazard,
} from '@/engine';
import {
  computeDeterministicUmbrellaBounce,
  computeSteamGustState,
  createBallDimpleTexture,
  evaluateGutterTrackAtPoint,
  getClubRestitution,
  isPointInPropLocalBox,
} from '@/physics';
import { useCurbsideStore } from '@/store';

interface GolfBallPhysicsControllerProps {
  course: GeneratedCityCourse;
  ballWorldPositionRef: MutableRefObject<THREE.Vector3>;
  registerWaterTrigger?: (fn: (sourcePropId?: string) => void) => void;
  registerDeflectorTrigger?: (fn: (prop: PlacedProp) => void) => void;
}

export function GolfBallPhysicsController({
  course,
  ballWorldPositionRef,
  registerWaterTrigger,
  registerDeflectorTrigger,
}: GolfBallPhysicsControllerProps) {
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const shadowMeshRef = useRef<THREE.Mesh | null>(null);
  const airRingMeshRef = useRef<THREE.Mesh | null>(null);
  const ballMeshRef = useRef<THREE.Mesh | null>(null);

  const selectedClub = useCurbsideStore((s) => s.selectedClub);
  const ballPhase = useCurbsideStore((s) => s.ballPhase);
  const lastShot = useCurbsideStore((s) => s.lastShot);
  const pendingBallReset = useCurbsideStore((s) => s.pendingBallReset);

  const dimpleTexture = useMemo(() => createBallDimpleTexture(), []);
  useEffect(() => {
    return () => {
      dimpleTexture?.dispose();
    };
  }, [dimpleTexture]);

  const lastProcessedShotSeqRef = useRef<number>(lastShot?.seq ?? 0);
  const lastProcessedResetSeqRef = useRef<number>(0);
  const shotClubRef = useRef<ClubId>(selectedClub);
  const shotElapsedRef = useRef<number>(0);
  const lowSpeedTimerRef = useRef<number>(0);
  const prevVyRef = useRef<number>(0);
  const hadBounceRef = useRef<boolean>(false);
  const hazardTriggeredRef = useRef<boolean>(false);
  const lastBounceSoundAtRef = useRef<number>(0);
  const lastStorePosPushRef = useRef<THREE.Vector3>(
    new THREE.Vector3(...course.startTeePosition),
  );
  const propCooldownsRef = useRef<Map<string, number>>(new Map());
  const externalVerticalImpulseUntilRef = useRef<number>(0);

  const applyBallTeleport = useCallback(
    (pos: [number, number, number]) => {
      const body = bodyRef.current;
      if (!body) return;
      body.setTranslation({ x: pos[0], y: pos[1], z: pos[2] }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.wakeUp();

      ballWorldPositionRef.current.set(pos[0], pos[1], pos[2]);
      lastStorePosPushRef.current.set(pos[0], pos[1], pos[2]);
      lowSpeedTimerRef.current = 0;
      shotElapsedRef.current = 0;
      hadBounceRef.current = false;
      hazardTriggeredRef.current = false;
      prevVyRef.current = 0;
      propCooldownsRef.current.clear();
    },
    [ballWorldPositionRef],
  );

  // Sync initial course start position whenever course seed swaps
  useEffect(() => {
    const state = useCurbsideStore.getState();
    const pos = state.pendingBallReset?.position ?? state.ballPosition;
    applyBallTeleport(pos);
    if (state.pendingBallReset) {
      lastProcessedResetSeqRef.current = state.pendingBallReset.seq;
      state.consumeBallReset(state.pendingBallReset.seq);
    }
  }, [course.seed, applyBallTeleport]);

  // Apply explicit store resets (next tee, hazard recovery, mulligan, restart)
  useEffect(() => {
    if (!pendingBallReset) return;
    if (pendingBallReset.seq === lastProcessedResetSeqRef.current) return;
    lastProcessedResetSeqRef.current = pendingBallReset.seq;
    applyBallTeleport(pendingBallReset.position);
    useCurbsideStore.getState().consumeBallReset(pendingBallReset.seq);
  }, [pendingBallReset, applyBallTeleport]);

  // Apply deterministic launch velocity on new ShotCommand
  useEffect(() => {
    if (!lastShot || lastShot.seq === lastProcessedShotSeqRef.current) return;
    const body = bodyRef.current;
    if (!body) return;

    lastProcessedShotSeqRef.current = lastShot.seq;
    shotClubRef.current = lastShot.clubId;
    shotElapsedRef.current = 0;
    lowSpeedTimerRef.current = 0;
    hadBounceRef.current = false;
    hazardTriggeredRef.current = false;
    prevVyRef.current = lastShot.launchVelocity[1];
    externalVerticalImpulseUntilRef.current = 0;
    propCooldownsRef.current.clear();

    body.setTranslation(
      {
        x: lastShot.origin[0],
        y: lastShot.origin[1],
        z: lastShot.origin[2],
      },
      true,
    );
    body.setLinvel(
      {
        x: lastShot.launchVelocity[0],
        y: lastShot.launchVelocity[1],
        z: lastShot.launchVelocity[2],
      },
      true,
    );
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.wakeUp();
  }, [lastShot]);

  const handleWaterTriggered = useCallback(
    (sourcePropId?: string) => {
      const state = useCurbsideStore.getState();
      if (hazardTriggeredRef.current || state.ballPhase !== 'inflight') {
        return;
      }
      hazardTriggeredRef.current = true;
      const body = bodyRef.current;
      if (body) {
        const lv = body.linvel();
        body.setLinvel(
          { x: lv.x * 0.15, y: -1.8, z: lv.z * 0.15 },
          true,
        );
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      if (sourcePropId) {
        state.recordPropHit(sourcePropId, 'fountain_water_hazard');
      } else {
        const pos = body?.translation();
        if (pos) {
          for (const p of course.props) {
            if (
              p.type === 'fountain_water_hazard' &&
              Math.hypot(pos.x - p.position[0], pos.z - p.position[2]) <= 2.05
            ) {
              state.recordPropHit(p.id, 'fountain_water_hazard');
              break;
            }
          }
        }
      }
      state.triggerWaterHazard('water');
    },
    [course.props],
  );

  const handleDeflectorTriggered = useCallback((prop: PlacedProp) => {
    const nowSec = performance.now() * 0.001;
    const lastHit = propCooldownsRef.current.get(prop.id) ?? -10;
    if (nowSec - lastHit < 0.35) return;
    propCooldownsRef.current.set(prop.id, nowSec);

    const state = useCurbsideStore.getState();
    if (prop.type === 'delivery_box_van') {
      state.recordPropHit(prop.id, prop.type);
      state.emitTrickToast('umbrella_bounce', 'VAN ROOF SKIP!');
      state.emitSoundEvent('curb_clack', { intensity: 0.85 });
    } else if (prop.type === 'curved_gutter_corner') {
      state.recordPropHit(prop.id, prop.type, 'gutter_bank', 'CURB BANK!');
      state.emitSoundEvent('gutter_bank', { intensity: 0.8 });
    }
  }, []);

  useEffect(() => {
    registerWaterTrigger?.(handleWaterTriggered);
  }, [registerWaterTrigger, handleWaterTriggered]);

  useEffect(() => {
    registerDeflectorTrigger?.(handleDeflectorTriggered);
  }, [registerDeflectorTrigger, handleDeflectorTriggered]);

  const handleBallCollision = useCallback(() => {
    const state = useCurbsideStore.getState();
    if (state.ballPhase !== 'inflight') {
      return;
    }
    const body = bodyRef.current;
    if (!body) return;
    const vel = body.linvel();
    const speed = Math.hypot(vel.x, vel.y, vel.z);
    const nowMs = performance.now();
    if (speed > 2.2 && nowMs - lastBounceSoundAtRef.current > 120) {
      lastBounceSoundAtRef.current = nowMs;
      const intensity = Math.min(0.75, speed / 14);
      state.emitSoundEvent('curb_clack', {
        intensity,
      });
    }
  }, []);

  useFrame((rootState, delta) => {
    const body = bodyRef.current;
    if (!body) return;

    const dt = Math.min(delta, 1 / 20);
    const state = useCurbsideStore.getState();

    // Ensure any freshly queued reset is honored inside the frame loop too
    if (
      state.pendingBallReset &&
      state.pendingBallReset.seq !== lastProcessedResetSeqRef.current
    ) {
      lastProcessedResetSeqRef.current = state.pendingBallReset.seq;
      applyBallTeleport(state.pendingBallReset.position);
      state.consumeBallReset(state.pendingBallReset.seq);
      return;
    }

    const pos = body.translation();
    const vel = body.linvel();
    const bx = pos.x;
    const by = pos.y;
    const bz = pos.z;
    let vx = vel.x;
    let vy = vel.y;
    let vz = vel.z;
    let velDirty = false;

    ballWorldPositionRef.current.set(bx, by, bz);

    if (ballMeshRef.current) {
      ballMeshRef.current.position.set(bx, by, bz);
    }

    // Update ground contact shadow & airborne height halo
    const surfaceY = getCourseSurfaceElevationAt(course, bx, bz);
    const heightAboveGround = Math.max(0, by - BALL_RADIUS - surfaceY);
    if (shadowMeshRef.current) {
      shadowMeshRef.current.position.set(
        bx,
        Math.max(ELEVATIONS.WATER_SURFACE_Y + 0.02, surfaceY + 0.016),
        bz,
      );
      const scale = Math.max(0.55, 1 - heightAboveGround * 0.12);
      shadowMeshRef.current.scale.set(scale, scale, 1);
      const mat = shadowMeshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0.08, 0.36 - heightAboveGround * 0.06);
    }
    if (airRingMeshRef.current) {
      const showAirRing =
        heightAboveGround > 0.35 && state.ballPhase === 'inflight';
      airRingMeshRef.current.visible = showAirRing;
      if (showAirRing) {
        airRingMeshRef.current.position.set(bx, surfaceY + 0.022, bz);
      }
    }

    // Push live coordinates to store sparingly when moving
    if (lastStorePosPushRef.current.distanceToSquared(ballWorldPositionRef.current) > 0.01) {
      lastStorePosPushRef.current.copy(ballWorldPositionRef.current);
      state.updateBallPosition([bx, by, bz]);
    }

    // Lock ball completely while resting / aiming / cupped / resetting
    if (
      state.ballPhase === 'resting' ||
      state.ballPhase === 'aiming' ||
      state.ballPhase === 'cupped' ||
      state.ballPhase === 'hazard_drop'
    ) {
      if (
        Math.abs(vx) > 0.001 ||
        Math.abs(vy) > 0.001 ||
        Math.abs(vz) > 0.001
      ) {
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      return;
    }

    shotElapsedRef.current += dt;
    const nowSec = rootState.clock.elapsedTime;
    const activeClub = shotClubRef.current;
    const clubSpec = CLUB_SPECS[activeClub];

    // 1. Out-of-bounds & water hazard check
    if (!hazardTriggeredRef.current) {
      const isOob =
        Math.abs(bx) > ISLAND_HALF_SIZE + 0.12 ||
        Math.abs(bz) > ISLAND_HALF_SIZE + 0.12;
      const inTileWater =
        isWorldPointInWaterHazard(course, bx, bz) &&
        by <= ELEVATIONS.WATER_SURFACE_Y + BALL_RADIUS + 0.1;
      const fellBelowIsland = by < ELEVATIONS.WATER_BASIN_Y + BALL_RADIUS - 0.06;

      if (isOob || inTileWater || fellBelowIsland) {
        hazardTriggeredRef.current = true;
        body.setLinvel({ x: vx * 0.15, y: -1.6, z: vz * 0.15 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        if (inTileWater) {
          for (const p of course.props) {
            if (
              p.type === 'fountain_water_hazard' &&
              Math.hypot(bx - p.position[0], bz - p.position[2]) <= 2.05
            ) {
              state.recordPropHit(p.id, 'fountain_water_hazard');
              break;
            }
          }
        }
        state.triggerWaterHazard(isOob ? 'oob' : 'water');
        return;
      }
    }

    // 2. Reactive props interaction (umbrellas, hydrant jet, steam grate, pigeons)
    for (const prop of course.props) {
      const lastHit = propCooldownsRef.current.get(prop.id) ?? -10;

      if (
        prop.type === 'hotdog_cart_umbrella' ||
        prop.type === 'bistro_umbrella_set'
      ) {
        if (nowSec - lastHit > 0.38 && vy < 4.0) {
          const canopyOffsetY =
            prop.type === 'hotdog_cart_umbrella' ? 2.12 : 2.02;
          const canopyRadius =
            prop.type === 'hotdog_cart_umbrella' ? 1.38 : 1.28;
          const cy = prop.position[1] + canopyOffsetY;
          const distXZ = Math.hypot(
            bx - prop.position[0],
            bz - prop.position[2],
          );
          if (distXZ <= canopyRadius && Math.abs(by - cy) <= 0.45) {
            propCooldownsRef.current.set(prop.id, nowSec);
            const [nvx, nvy, nvz] = computeDeterministicUmbrellaBounce(
              [bx, by, bz],
              [vx, vy, vz],
              [prop.position[0], cy, prop.position[2]],
              canopyRadius,
              0.55,
            );
            vx = nvx;
            vy = nvy;
            vz = nvz;
            velDirty = true;
            externalVerticalImpulseUntilRef.current = nowSec + 0.35;
            body.setTranslation({ x: bx, y: cy + 0.32, z: bz }, true);
            state.recordPropHit(
              prop.id,
              prop.type,
              'umbrella_bounce',
              'UMBRELLA BOUNCE!',
            );
            state.emitSoundEvent('umbrella_boing', { intensity: 0.9 });
          }
        }
      } else if (prop.type === 'fire_hydrant_jet') {
        if (
          nowSec - lastHit > 0.65 &&
          isPointInPropLocalBox(
            prop,
            bx,
            by,
            bz,
            [0, 0.45, 2.4],
            [1.35, 0.75, 2.2],
          )
        ) {
          propCooldownsRef.current.set(prop.id, nowSec);
          const jx = Math.sin(prop.rotationY);
          const jz = Math.cos(prop.rotationY);
          vx = jx * 12.2 + vx * 0.22;
          vy = Math.max(vy, 3.1);
          vz = jz * 12.2 + vz * 0.22;
          velDirty = true;
          externalVerticalImpulseUntilRef.current = nowSec + 0.4;
          state.recordPropHit(
            prop.id,
            prop.type,
            'hydrant_surf',
            'HYDRANT SURF!',
          );
          state.emitSoundEvent('hydrant_whoosh', { intensity: 0.9 });
        }
      } else if (prop.type === 'subway_steam_grate') {
        const gust = computeSteamGustState(nowSec, 3.2, 0.55);
        if (
          gust.active &&
          nowSec - lastHit > 0.7 &&
          isPointInPropLocalBox(
            prop,
            bx,
            by,
            bz,
            [0, 1.15, 0],
            [0.95, 1.35, 0.95],
          )
        ) {
          propCooldownsRef.current.set(prop.id, nowSec);
          vy = Math.max(vy, 9.6 * (0.76 + 0.34 * gust.strength));
          vx *= 0.86;
          vz *= 0.86;
          velDirty = true;
          externalVerticalImpulseUntilRef.current = nowSec + 0.45;
          state.recordPropHit(
            prop.id,
            prop.type,
            'steam_lift',
            'STEAM LOFT!',
          );
          state.emitSoundEvent('steam_hiss', { intensity: 0.85 });
        }
      } else if (prop.type === 'pigeon_flock') {
        if (
          nowSec - lastHit > 3.2 &&
          Math.hypot(bx - prop.position[0], bz - prop.position[2]) < 3.0 &&
          Math.abs(by - prop.position[1]) < 2.2
        ) {
          propCooldownsRef.current.set(prop.id, nowSec);
          state.recordPropHit(prop.id, prop.type);
          state.emitSoundEvent('pigeon_flutter', { intensity: 0.75 });
        }
      }
    }

    // 3. 5-Flag free-order cup capture & subtle lip gravity
    for (const flag of course.flags) {
      if (state.sunkFlags[flag.color]) continue;
      const dx = flag.position[0] - bx;
      const dz = flag.position[2] - bz;
      const distXZ = Math.hypot(dx, dz);
      const dy = by - (flag.elevationY + BALL_RADIUS);
      const horizSpeed = Math.hypot(vx, vz);

      // Gentle lip pull when grazing cup edge
      if (
        distXZ > 0.04 &&
        distXZ < flag.cupRadius * 1.48 &&
        dy > -0.18 &&
        dy < 0.24 &&
        horizSpeed < 8.4
      ) {
        const pullAccel = 14.5 * (1 - distXZ / (flag.cupRadius * 1.48));
        vx += (dx / distXZ) * pullAccel * dt;
        vz += (dz / distXZ) * pullAccel * dt;
        velDirty = true;
      }

      // Cup sink condition
      if (
        distXZ <= flag.cupRadius * 0.9 &&
        dy >= -0.26 &&
        dy <= 0.3 &&
        horizSpeed <= 9.2 &&
        Math.abs(vy) <= 6.2
      ) {
        body.setTranslation(
          {
            x: flag.position[0],
            y: flag.elevationY - 0.04,
            z: flag.position[2],
          },
          true,
        );
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        ballWorldPositionRef.current.set(
          flag.position[0],
          flag.elevationY - 0.04,
          flag.position[2],
        );
        state.sinkFlag(flag.color);
        return;
      }
    }

    // 4. Phase-aware damping, Wedge soft turf check, Putter anti-hop, & Gutter channeling
    const isGrounded = heightAboveGround <= 0.11 && Math.abs(vy) < 1.65;

    // Detect landing check for Wedge steep parachute lob
    if (
      activeClub === 'wedge' &&
      !hadBounceRef.current &&
      shotElapsedRef.current > 0.1 &&
      prevVyRef.current < -1.8 &&
      vy >= -0.8
    ) {
      hadBounceRef.current = true;
      vx *= clubSpec.turfCheckMultiplier + 0.16;
      vz *= clubSpec.turfCheckMultiplier + 0.16;
      vy = Math.min(vy, 1.4);
      velDirty = true;
    }
    prevVyRef.current = vy;

    if (!isGrounded) {
      const airDamp = Math.max(0, 1 - clubSpec.flightDamping * dt);
      vx *= airDamp;
      vy *= airDamp;
      vz *= airDamp;
      velDirty = true;
    } else {
      const rollDamp = Math.max(0, 1 - clubSpec.rollDamping * dt);
      vx *= rollDamp;
      vz *= rollDamp;

      // Smooth low-speed Coulomb braking so ball stops cleanly without crawling
      const horizSpeed = Math.hypot(vx, vz);
      if (horizSpeed > 1e-4 && horizSpeed < 2.2) {
        const decel = Math.max(0, horizSpeed - 0.65 * dt) / horizSpeed;
        vx *= decel;
        vz *= decel;
      }

      // Suppress artificial seam hop on flat Putter rolls (preserve ramp climb & external boosts)
      if (
        activeClub === 'putter' &&
        nowSec > externalVerticalImpulseUntilRef.current
      ) {
        const maxSlopeVy = Math.max(0.28, horizSpeed * 0.42);
        if (vy > maxSlopeVy) {
          vy = maxSlopeVy * 0.35;
        }
      }

      // Straight & 90-degree curved storm-drain gutter guidance
      if (horizSpeed > 0.45) {
        const gutter = evaluateGutterTrackAtPoint(course, bx, by, bz, vx, vz);
        if (gutter?.inGutter) {
          const speedAlong = vx * gutter.tangentX + vz * gutter.tangentZ;
          const steerRate = gutter.isCorner90 ? 14.0 : 8.5;
          const blend = Math.min(1, steerRate * dt);
          const targetSpeed = Math.max(horizSpeed * 0.985, Math.abs(speedAlong));
          vx = vx * (1 - blend) + gutter.tangentX * targetSpeed * blend;
          vz = vz * (1 - blend) + gutter.tangentZ * targetSpeed * blend;

          // Center ball cleanly inside the U-shaped gutter trough
          vx += gutter.pullX * 7.5 * dt;
          vz += gutter.pullZ * 7.5 * dt;

          if (gutter.isCorner90) {
            const lastCorner =
              propCooldownsRef.current.get('__gutter_corner__') ?? -10;
            if (nowSec - lastCorner > 0.9) {
              propCooldownsRef.current.set('__gutter_corner__', nowSec);
              state.recordPropHit(
                'gutter-corner',
                'curved_gutter_corner',
                'gutter_bank',
                'GUTTER BANK!',
              );
              state.emitSoundEvent('gutter_bank', { intensity: 0.7 });
            }
          }
        }
      }

      velDirty = true;
    }

    if (velDirty) {
      body.setLinvel({ x: vx, y: vy, z: vz }, true);
    }

    // 5. Ball settle detection
    const totalSpeed = Math.hypot(vx, vy, vz);
    const canSettleOnSurface = heightAboveGround <= 0.15 || Math.abs(vy) < 0.08;
    if (shotElapsedRef.current > 0.24 && canSettleOnSurface && totalSpeed < 0.16) {
      lowSpeedTimerRef.current += dt;
    } else {
      lowSpeedTimerRef.current = 0;
    }

    if (
      lowSpeedTimerRef.current >= 0.26 ||
      shotElapsedRef.current > 12.0
    ) {
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      state.markBallResting([bx, by, bz]);
    }
  });

  const isResting = ballPhase === 'resting';
  const ballRestitution =
    selectedClub === 'putter' ? 0.05 : getClubRestitution(selectedClub);

  const initialBallCenterPos: [number, number, number] = [
    course.startTeePosition[0],
    course.startTeePosition[1] + BALL_RADIUS,
    course.startTeePosition[2],
  ];

  return (
    <group name="golf-ball-system">
      <RigidBody
        ref={bodyRef}
        type="dynamic"
        colliders={false}
        ccd
        canSleep={false}
        linearDamping={0}
        angularDamping={0.42}
        position={initialBallCenterPos}
      >
        <BallCollider
          args={[BALL_RADIUS]}
          restitution={ballRestitution}
          friction={selectedClub === 'putter' ? 0.22 : 0.34}
          onCollisionEnter={handleBallCollision}
        />
      </RigidBody>

      {/* Dimpled golf ball visual synced directly to physics body */}
      <mesh
        ref={ballMeshRef}
        castShadow
        receiveShadow
        position={initialBallCenterPos}
      >
        <sphereGeometry args={[BALL_RADIUS, 28, 28]} />
        <meshStandardMaterial
          color="#FFFDF8"
          roughness={0.26}
          metalness={0.05}
          bumpMap={dimpleTexture ?? undefined}
          bumpScale={0.009}
          emissive={isResting ? '#FFFFFF' : '#000000'}
          emissiveIntensity={isResting ? 0.1 : 0}
        />
      </mesh>

      {/* Crisp soft contact shadow directly beneath the ball */}
      <mesh
        ref={shadowMeshRef}
        rotation={[-Math.PI * 0.5, 0, 0]}
        position={[
          course.startTeePosition[0],
          course.startTeePosition[1] - BALL_RADIUS + 0.015,
          course.startTeePosition[2],
        ]}
      >
        <circleGeometry args={[BALL_RADIUS * 1.38, 24]} />
        <meshBasicMaterial
          color="#162032"
          transparent
          opacity={0.34}
          depthWrite={false}
        />
      </mesh>

      {/* Airborne drop target halo for spatial depth clarity during high Driver/Wedge lobs */}
      <mesh
        ref={airRingMeshRef}
        visible={false}
        rotation={[-Math.PI * 0.5, 0, 0]}
      >
        <ringGeometry args={[BALL_RADIUS * 0.85, BALL_RADIUS * 1.45, 24]} />
        <meshBasicMaterial
          color="#FFFFFF"
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
